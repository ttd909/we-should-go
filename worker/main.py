"""
We Should Go — Railway extraction worker.

Polls Supabase for pending extraction_jobs, claims them atomically,
runs yt-dlp (primary) or OG scraping (Instagram fallback), calls Claude,
resolves places with Google Places when configured,
then writes results back to reel_submissions.

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
from claude_extract import extract_place
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

        result = extract_place(extraction_input, notes, platform)

        confidence = result['confidence']

        # Fallback path gets a hard confidence cap — the data is thinner
        if extraction_input.get('is_fallback'):
            confidence = min(confidence, 0.7)

        # Low confidence → surface for manual review, don't auto-fill place name
        if confidence < 0.5:
            status = 'needs_review'
            place_name = None
        else:
            status = 'inbox'
            place_name = result.get('place_name')

        resolved = resolve_place({**result, 'place_name': place_name})

        thumbnail_url = (
            shortcut_metadata.get('thumbnail_url')
            or extraction_input.get('thumbnail_url')
        )

        update_data = {
            'caption_text': extraction_input.get('caption'),
            'place_name': place_name,
            'destination_city': result.get('city'),
            'destination_country': result.get('country'),
            'destination_region': result.get('region'),
            'place_type': result.get('place_type'),
            'tags': result.get('tags', []),
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

        sb.table('reel_submissions').update(update_data).eq('id', reel_id).execute()

        sb.table('extraction_jobs').update({
            'status': 'completed',
            'completed_at': _now(),
        }).eq('id', job_id).execute()

        log.info('job=%s done confidence=%.2f status=%s', job_id, confidence, status)

    except Exception as exc:
        log.exception('job=%s failed: %s', job_id, exc)

        sb.table('extraction_jobs').update({
            'status': 'failed',
            'error_message': str(exc)[:500],
            'completed_at': _now(),
        }).eq('id', job_id).execute()

        # confidence=0 stops the UI "Enriching…" spinner
        sb.table('reel_submissions').update({
            'confidence': 0,
            'status': 'needs_review',
        }).eq('id', reel_id).execute()


def main() -> None:
    sb = _supabase()
    log.info('Worker started — polling every %ds when idle', POLL_INTERVAL)

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
