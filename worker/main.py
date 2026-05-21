"""
We Should Go - Railway extraction worker.

Polls Supabase for pending extraction_jobs, claims them atomically,
runs yt-dlp (primary) or OG scraping (Instagram fallback), calls Claude,
resolves places with Google Places when configured, then writes one Idea per
extracted place back to reel_submissions.

Env vars required:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  ANTHROPIC_API_KEY
  GOOGLE_PLACES_API_KEY
"""
import logging
import os
import time

from dotenv import load_dotenv
load_dotenv()
from datetime import datetime, timezone

from supabase import create_client, Client

from extract_reel import extract_reel
from claude_extract import extract_places
from resolve_place import resolve_place

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
)
log = logging.getLogger(__name__)

POLL_INTERVAL = 5  # seconds to sleep when queue is empty


def _supabase() -> Client:
    return create_client(
        os.environ['SUPABASE_URL'],
        os.environ['SUPABASE_SERVICE_ROLE_KEY'],
    )


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def claim_job(sb: Client) -> dict | None:
    """
    Atomically claim one pending job.
    Uses the claim_extraction_job() stored procedure which does
    FOR UPDATE SKIP LOCKED, safe for concurrent workers.
    Returns the full job + nested reel_submissions row, or None.
    """
    result = sb.rpc('claim_extraction_job').execute()
    job_id = result.data
    if not job_id:
        return None

    result = (
        sb.table('extraction_jobs')
        .select('*, reel_submissions(*)')
        .eq('id', job_id)
        .single()
        .execute()
    )
    return result.data


def _place_update_data(place: dict, extraction_input: dict, thumbnail_url: str | None) -> dict:
    confidence = float(place.get('confidence') or 0)

    # Fallback path gets a hard confidence cap - the data is thinner.
    if extraction_input.get('is_fallback'):
        confidence = min(confidence, 0.7)

    # Low confidence means surface for manual review, don't auto-fill place name.
    if confidence < 0.5:
        status = 'needs_review'
        place_name = None
    else:
        status = 'inbox'
        place_name = place.get('place_name')

    resolved = resolve_place({**place, 'place_name': place_name})

    update_data = {
        'caption_text': extraction_input.get('caption'),
        'place_name': place_name,
        'destination_city': place.get('city'),
        'destination_country': place.get('country'),
        'destination_region': place.get('region'),
        'place_type': place.get('place_type'),
        'tags': place.get('tags', []),
        'confidence': confidence,
        'status': status,
    }
    if thumbnail_url:
        update_data['thumbnail_url'] = thumbnail_url
    if resolved:
        update_data.update({
            'google_place_id': resolved.get('google_place_id'),
            'google_photo_name': resolved.get('google_photo_name'),
            'place_name': resolved.get('place_name') or place_name,
            'address': resolved.get('address'),
            'latitude': resolved.get('latitude'),
            'longitude': resolved.get('longitude'),
        })

    return update_data


def _insert_extra_ideas(
    sb: Client,
    source_reel: dict,
    source_reel_id: str,
    places: list[dict],
    extraction_input: dict,
    thumbnail_url: str | None,
) -> int:
    rows = []
    for place in places:
        row = {
            **_place_update_data(place, extraction_input, thumbnail_url),
            'dreamlist_id': source_reel.get('dreamlist_id'),
            'submitted_by_user_id': source_reel.get('submitted_by_user_id'),
            'submitted_by_label': source_reel.get('submitted_by_label'),
            'platform': source_reel.get('platform'),
            'url': source_reel.get('url'),
            'url_hash': source_reel.get('url_hash'),
            'notes': source_reel.get('notes'),
            'priority': source_reel.get('priority') or 'normal',
            'trip_id': None,
            'source_idea_id': source_reel_id,
        }
        rows.append(row)

    if rows:
        sb.table('reel_submissions') \
            .delete() \
            .eq('source_idea_id', source_reel_id) \
            .is_('copied_by_user_id', 'null') \
            .execute()
        sb.table('reel_submissions').insert(rows).execute()

    return len(rows)


def process_job(sb: Client, job: dict) -> None:
    job_id = job['id']
    reel = job['reel_submissions']
    reel_id = reel['id']
    url = reel['url']
    platform = reel['platform']
    notes = reel.get('notes')
    shortcut_metadata = job.get('shortcut_metadata') or {}

    log.info('job=%s reel=%s platform=%s', job_id, reel_id, platform)

    try:
        extraction_input = extract_reel(url, platform, shortcut_metadata)
        places = extract_places(extraction_input, notes, platform)
        if not places:
            raise RuntimeError('Claude returned no places')

        thumbnail_url = (
            shortcut_metadata.get('thumbnail_url')
            or extraction_input.get('thumbnail_url')
        )

        first_place = places[0]
        first_update = _place_update_data(first_place, extraction_input, thumbnail_url)
        sb.table('reel_submissions').update(first_update).eq('id', reel_id).execute()

        extra_count = _insert_extra_ideas(
            sb=sb,
            source_reel=reel,
            source_reel_id=reel_id,
            places=places[1:],
            extraction_input=extraction_input,
            thumbnail_url=thumbnail_url,
        )

        sb.table('extraction_jobs').update({
            'status': 'completed',
            'completed_at': _now(),
        }).eq('id', job_id).execute()

        log.info(
            'job=%s done places=%d extra_ideas=%d first_confidence=%.2f first_status=%s',
            job_id,
            len(places),
            extra_count,
            float(first_update.get('confidence') or 0),
            first_update.get('status'),
        )

    except Exception as exc:
        log.exception('job=%s failed: %s', job_id, exc)

        sb.table('extraction_jobs').update({
            'status': 'failed',
            'error_message': str(exc)[:500],
            'completed_at': _now(),
        }).eq('id', job_id).execute()

        # confidence=0 stops the UI "Enriching..." spinner
        sb.table('reel_submissions').update({
            'confidence': 0,
            'status': 'needs_review',
        }).eq('id', reel_id).execute()


def main() -> None:
    sb = _supabase()
    log.info('Worker started - polling every %ds when idle', POLL_INTERVAL)

    while True:
        try:
            job = claim_job(sb)
            if job:
                process_job(sb, job)
            else:
                time.sleep(POLL_INTERVAL)
        except Exception as exc:
            log.exception('Unhandled error in main loop: %s', exc)
            time.sleep(POLL_INTERVAL)


if __name__ == '__main__':
    main()
