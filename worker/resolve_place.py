"""
Google Places resolution for extracted travel places.

Takes Claude's text fields and resolves them into address/lat/lng for maps.
If GOOGLE_PLACES_API_KEY is not set or the lookup fails, callers get None and
the worker still completes the extraction job.
"""
import logging
import os
from typing import Optional

import requests

log = logging.getLogger(__name__)

PLACES_TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText'


def resolve_place(extraction: dict) -> Optional[dict]:
    api_key = os.getenv('GOOGLE_PLACES_API_KEY')
    if not api_key:
        log.warning('GOOGLE_PLACES_API_KEY not set — skipping place resolution')
        return None

    query = _build_query(extraction)
    if not query:
        return None

    try:
        resp = requests.post(
            PLACES_TEXT_SEARCH_URL,
            headers={
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': api_key,
                'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location',
            },
            json={'textQuery': query, 'maxResultCount': 1},
            timeout=12,
        )
        resp.raise_for_status()
        places = resp.json().get('places') or []
        if not places:
            log.info('No Google Places result for query=%r', query)
            return None

        place = places[0]
        location = place.get('location') or {}
        display_name = place.get('displayName') or {}

        return {
            'place_name': display_name.get('text'),
            'address': place.get('formattedAddress'),
            'latitude': location.get('latitude'),
            'longitude': location.get('longitude'),
        }
    except Exception as exc:
        log.warning('Google Places lookup failed for query=%r: %s', query, exc)
        return None


def _build_query(extraction: dict) -> Optional[str]:
    parts = [
        extraction.get('place_name'),
        extraction.get('city'),
        extraction.get('country'),
    ]
    query = ', '.join(str(part).strip() for part in parts if part)
    return query or None
