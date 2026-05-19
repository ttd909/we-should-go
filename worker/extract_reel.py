"""
Reel content extraction.

Primary path (both platforms): yt_dlp Python API → frames + whisper transcript.
Fallback path (Instagram only):  OG meta scraping → thumbnail + caption.

Using the yt_dlp Python API (not subprocess) avoids PATH issues on Windows.
ffmpeg is used for frame extraction but degrades gracefully if not installed.
"""
import base64
import json
import logging
import os
import subprocess
import tempfile
from html.parser import HTMLParser
from typing import Optional

import requests

log = logging.getLogger(__name__)

BROWSER_UA = (
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) '
    'AppleWebKit/605.1.15 (KHTML, like Gecko) '
    'Version/17.0 Mobile/15E148 Safari/604.1'
)

# yt-dlp error message substrings that mean fall back rather than hard-fail
INSTAGRAM_SOFT_ERRORS = (
    'login required',
    'login_required',
    'rate-limit',
    'rate limit',
    'ratelimit',
    'not available',
    'this content',
    'private',
    'forbidden',
    '403',
    '429',
)

_whisper_model = None


def _get_whisper():
    global _whisper_model
    if _whisper_model is None:
        from faster_whisper import WhisperModel
        _whisper_model = WhisperModel('tiny', device='cpu', compute_type='int8')
    return _whisper_model


# ─── public entry point ──────────────────────────────────────

def extract_reel(url: str, platform: str, shortcut_metadata: dict) -> dict:
    """
    Returns an extraction dict:
      frames:        list[str] | None  (base64 JPEG, primary path)
      transcript:    str | None        (primary path)
      caption:       str | None        (both paths)
      author:        str | None        (both paths)
      thumbnail_url: str | None        (fallback / supplement)
      is_fallback:   bool
    """
    if platform == 'instagram':
        return _extract_instagram(url, shortcut_metadata)
    else:
        return _ytdlp_extract(url)


# ─── Instagram ───────────────────────────────────────────────

def _extract_instagram(url: str, shortcut_metadata: dict) -> dict:
    try:
        return _ytdlp_extract(url)
    except RuntimeError as exc:
        err = str(exc).lower()
        if any(s in err for s in INSTAGRAM_SOFT_ERRORS) or 'timeout' in err:
            log.warning('yt-dlp soft failure — falling back to OG scraping: %s', exc)
            return _og_scrape(url, shortcut_metadata)
        raise


# ─── yt-dlp primary path (Python API, no subprocess) ─────────

def _ytdlp_extract(url: str) -> dict:
    import yt_dlp as ytdlp

    with tempfile.TemporaryDirectory() as tmpdir:
        out_tmpl = os.path.join(tmpdir, 'reel.%(ext)s')

        ydl_opts = {
            'outtmpl': out_tmpl,
            'writeinfojson': True,
            'no_playlist': True,
            'format': 'best[height<=720]/best',
            'http_headers': {'User-Agent': BROWSER_UA},
            'socket_timeout': 30,
            'quiet': True,
            'no_warnings': True,
        }

        try:
            with ytdlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])
        except ytdlp.DownloadError as exc:
            raise RuntimeError(str(exc))

        all_files = os.listdir(tmpdir)
        info_files = [f for f in all_files if f.endswith('.info.json')]
        video_files = [
            f for f in all_files
            if not f.endswith('.json') and os.path.getsize(os.path.join(tmpdir, f)) > 0
        ]

        if not video_files:
            raise RuntimeError('yt-dlp produced no video file')

        info: dict = {}
        if info_files:
            with open(os.path.join(tmpdir, info_files[0]), encoding='utf-8') as fh:
                info = json.load(fh)

        video_path = os.path.join(tmpdir, video_files[0])
        frames = _extract_frames(video_path, tmpdir)
        transcript = _transcribe(video_path)

        return {
            'frames': frames,
            'transcript': transcript,
            'caption': info.get('description') or info.get('title'),
            'author': info.get('uploader') or info.get('channel'),
            'thumbnail_url': info.get('thumbnail'),
            'is_fallback': False,
        }


def _extract_frames(video_path: str, tmpdir: str) -> list[str]:
    """1fps, capped at 8 frames. Returns [] if ffmpeg is not installed."""
    frames_dir = os.path.join(tmpdir, 'frames')
    os.makedirs(frames_dir, exist_ok=True)

    try:
        subprocess.run(
            [
                'ffmpeg', '-i', video_path,
                '-vf', 'fps=1',
                '-q:v', '5',
                '-frames:v', '8',
                os.path.join(frames_dir, 'frame_%03d.jpg'),
            ],
            capture_output=True,
            check=True,
        )
    except FileNotFoundError:
        log.warning('ffmpeg not found — skipping frame extraction (install ffmpeg for full quality)')
        return []
    except subprocess.CalledProcessError as exc:
        log.warning('ffmpeg error: %s', exc.stderr)
        return []

    frames = []
    for fname in sorted(os.listdir(frames_dir))[:8]:
        with open(os.path.join(frames_dir, fname), 'rb') as fh:
            frames.append(base64.b64encode(fh.read()).decode())
    return frames


def _transcribe(video_path: str) -> Optional[str]:
    try:
        model = _get_whisper()
        segments, _ = model.transcribe(video_path, beam_size=1)
        text = ' '.join(seg.text for seg in segments).strip()
        return text or None
    except Exception as exc:
        log.warning('Whisper transcription failed: %s', exc)
        return None


# ─── Instagram OG scraping fallback ──────────────────────────

class _OGParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.og: dict[str, str] = {}

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag != 'meta':
            return
        d = dict(attrs)
        prop = d.get('property', '')
        if prop.startswith('og:') and 'content' in d:
            self.og[prop] = d['content']


def _og_scrape(url: str, shortcut_metadata: dict) -> dict:
    """Parse Open Graph tags from the Instagram page. Falls back to shortcut metadata."""
    og: dict[str, str] = {}
    try:
        resp = requests.get(url, headers={'User-Agent': BROWSER_UA}, timeout=15)
        resp.raise_for_status()
        parser = _OGParser()
        parser.feed(resp.text)
        og = parser.og
    except Exception as exc:
        log.warning('OG scrape failed: %s', exc)

    meta = shortcut_metadata or {}

    return {
        'frames': None,
        'transcript': None,
        'caption': og.get('og:description') or meta.get('page_description'),
        'author': og.get('og:title') or meta.get('page_title'),
        'thumbnail_url': og.get('og:image') or meta.get('thumbnail_url'),
        'is_fallback': True,
    }
