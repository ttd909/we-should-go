"""
Place extraction via Claude.

Accepts both input shapes:
  Primary path:  frames (list of base64 JPEGs) + transcript + caption
  Fallback path: thumbnail_url + caption only (is_fallback=True)

Confidence is capped at 0.7 for the fallback path by the caller (main.py).
"""
import json
import logging
import time
from typing import Optional

import anthropic
import requests

log = logging.getLogger(__name__)

BROWSER_UA = (
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) '
    'AppleWebKit/605.1.15 (KHTML, like Gecko) '
    'Version/17.0 Mobile/15E148 Safari/604.1'
)

ALLOWED_MEDIA_TYPES = {'image/jpeg', 'image/png', 'image/gif', 'image/webp'}

EXTRACTION_PROMPT = """\
You are extracting travel destination information from a social media reel.

{context}

Return a JSON object with exactly these fields:
{{
  "place_name": string | null,
  "city": string | null,
  "country": string | null,
  "region": string | null,
  "place_type": "cafe" | "hotel" | "restaurant" | "viewpoint" | "experience" | "other" | null,
  "tags": string[],
  "confidence": number,
  "why_recommended": string | null
}}

Rules:
- country is the most important field — extract it even if place_name is unknown
- Only set place_name if confidence > 0.7 — never hallucinate a venue name
- region should be a broad area e.g. "Southeast Asia", "Western Europe", "East Africa"
- tags: 2–5 short descriptive tags e.g. "hidden gem", "rooftop bar", "traditional", "beach"
- confidence: 0.0–1.0 reflecting certainty of the extraction overall
- why_recommended: one sentence on why this looks worth visiting, from the reel's perspective
- Respond with ONLY valid JSON, no markdown fences\
"""


def _fetch_image(url: str) -> Optional[tuple[str, str]]:
    """Return (base64_data, media_type) or None."""
    try:
        resp = requests.get(url, headers={'User-Agent': BROWSER_UA}, timeout=10)
        if not resp.ok:
            return None
        ct = resp.headers.get('content-type', 'image/jpeg').split(';')[0].strip()
        if ct not in ALLOWED_MEDIA_TYPES:
            return None
        import base64
        return base64.b64encode(resp.content).decode(), ct
    except Exception as exc:
        log.warning('Image fetch failed for %s: %s', url, exc)
        return None


def extract_place(
    extraction_input: dict,
    user_notes: Optional[str],
    platform: str,
) -> dict:
    """
    Call Claude to identify the place in the reel.

    Returns:
      place_name, city, country, region, place_type, tags, confidence, why_recommended
    """
    client = anthropic.Anthropic()

    lines = []
    if extraction_input.get('caption'):
        lines.append(f"Caption: {extraction_input['caption']}")
    if extraction_input.get('author'):
        lines.append(f"Creator: @{extraction_input['author']}")
    if extraction_input.get('transcript'):
        lines.append(f"Transcript: {extraction_input['transcript']}")
    if user_notes:
        lines.append(f"User note: {user_notes}")
    lines.append(f"Platform: {platform}")
    if extraction_input.get('is_fallback'):
        lines.append('Note: Only thumbnail and caption are available — no video frames or audio.')

    context = '\n'.join(lines)
    prompt = EXTRACTION_PROMPT.format(context=context)

    content: list = []

    frames = extraction_input.get('frames') or []
    for frame_b64 in frames[:5]:
        content.append({
            'type': 'image',
            'source': {'type': 'base64', 'media_type': 'image/jpeg', 'data': frame_b64},
        })

    if not frames and extraction_input.get('thumbnail_url'):
        img = _fetch_image(extraction_input['thumbnail_url'])
        if img:
            data, media_type = img
            content.append({
                'type': 'image',
                'source': {'type': 'base64', 'media_type': media_type, 'data': data},
            })

    content.append({'type': 'text', 'text': prompt})

    last_exc: Exception | None = None
    for attempt in range(3):
        try:
            message = client.messages.create(
                model='claude-sonnet-4-6',
                max_tokens=512,
                messages=[{'role': 'user', 'content': content}],
            )
            break
        except anthropic.APIConnectionError as exc:
            last_exc = exc
            if attempt == 2:
                raise
            delay = 2 * (attempt + 1)
            log.warning('Claude connection failed; retrying in %ss: %s', delay, exc)
            time.sleep(delay)
    else:
        raise RuntimeError('Claude request failed') from last_exc

    raw = next((b.text for b in message.content if b.type == 'text'), '')
    parsed: dict = json.loads(raw)

    return {
        'place_name': parsed.get('place_name'),
        'city': parsed.get('city'),
        'country': parsed.get('country'),
        'region': parsed.get('region'),
        'place_type': parsed.get('place_type'),
        'tags': parsed.get('tags') if isinstance(parsed.get('tags'), list) else [],
        'confidence': float(parsed.get('confidence', 0)),
        'why_recommended': parsed.get('why_recommended'),
    }
