"""
Reel content extraction.

Primary path (all supported platforms): yt_dlp Python API → frames + whisper transcript.
Fallback path: TikTok oEmbed or page meta scraping → thumbnail + caption.

Using the yt_dlp Python API (not subprocess) avoids PATH issues on Windows.
ffmpeg is used for frame extraction but degrades gracefully if not installed.
"""
import base64
import json
import logging
import os
import subprocess
import tempfile
from dataclasses import dataclass
from html.parser import HTMLParser
from typing import Optional

import requests

log = logging.getLogger(__name__)
MAX_EXTRACTION_FRAMES = 12

BROWSER_UA = (
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) '
    'AppleWebKit/605.1.15 (KHTML, like Gecko) '
    'Version/17.0 Mobile/15E148 Safari/604.1'
)

# yt-dlp error message substrings that mean fall back rather than hard-fail.
SOFT_YTDLP_ERRORS = (
    'login required',
    'login_required',
    'rate-limit',
    'rate limit',
    'ratelimit',
    'not available',
    'this content',
    'status code 0',
    'private',
    'forbidden',
    '403',
    '429',
    'cannot parse data',
    'no video formats found',
    'empty media response',
)

_whisper_model = None


@dataclass
class FallbackMetadata:
    caption: Optional[str]
    author: Optional[str]
    thumbnail_url: Optional[str]


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
    return _extract_with_fallback(url, shortcut_metadata, platform)


# ─── platform fallback wrapper ───────────────────────────────

def _extract_with_fallback(url: str, shortcut_metadata: dict, platform: str) -> dict:
    try:
        return _ytdlp_extract(url)
    except RuntimeError as exc:
        err = str(exc).lower()
        if any(s in err for s in SOFT_YTDLP_ERRORS) or 'timeout' in err:
            log.warning('%s yt-dlp soft failure — falling back to metadata: %s', platform, exc)
            return _metadata_fallback(url, shortcut_metadata, platform)
        raise


# ─── metadata fallback ───────────────────────────────────────

def _metadata_fallback(url: str, shortcut_metadata: dict, platform: str) -> dict:
    if platform == 'tiktok':
        metadata = _tiktok_oembed(url)
        if metadata:
            return _fallback_payload(metadata, platform)
        log.warning('TikTok oEmbed unavailable — falling back to OG scraping')

    return _og_scrape(url, shortcut_metadata, platform)


def _fallback_payload(metadata: FallbackMetadata, platform: str) -> dict:
    return {
        'frames': None,
        'transcript': None,
        'caption': metadata.caption,
        'author': metadata.author,
        'thumbnail_url': metadata.thumbnail_url,
        'source_platform': platform,
        'is_fallback': True,
    }


def _resolve_redirect(url: str) -> str:
    try:
        resp = requests.head(
            url,
            headers={'User-Agent': BROWSER_UA},
            timeout=10,
            allow_redirects=True,
        )
        return resp.url or url
    except Exception as exc:
        log.warning('Redirect resolution failed: %s', exc)
        return url


def _tiktok_oembed(url: str) -> Optional[FallbackMetadata]:
    canonical = _resolve_redirect(url)
    try:
        resp = requests.get(
            'https://www.tiktok.com/oembed',
            params={'url': canonical},
            headers={'User-Agent': BROWSER_UA},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        return FallbackMetadata(
            caption=data.get('title'),
            author=data.get('author_name'),
            thumbnail_url=data.get('thumbnail_url'),
        )
    except Exception as exc:
        log.warning('TikTok oEmbed failed: %s', exc)
        return None


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
            'thumbnail_url': _pick_thumbnail(info),
            'is_fallback': False,
        }


def _pick_thumbnail(info: dict) -> Optional[str]:
    thumbnail = info.get('thumbnail')
    if isinstance(thumbnail, str) and thumbnail.startswith('http'):
        return thumbnail

    thumbnails = info.get('thumbnails')
    if isinstance(thumbnails, list):
        candidates = [
            item.get('url')
            for item in thumbnails
            if isinstance(item, dict) and isinstance(item.get('url'), str)
        ]
        http_candidates = [url for url in candidates if url.startswith('http')]
        if http_candidates:
            return http_candidates[-1]

    return None


def _extract_initial_sequence_frames(video_path: str, tmpdir: str) -> list[str]:
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


def _video_duration(video_path: str) -> Optional[float]:
    try:
        result = subprocess.run(
            [
                'ffprobe',
                '-v', 'error',
                '-show_entries', 'format=duration',
                '-of', 'default=noprint_wrappers=1:nokey=1',
                video_path,
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        duration = float(result.stdout.strip())
        return duration if duration > 0 else None
    except (FileNotFoundError, subprocess.CalledProcessError, ValueError) as exc:
        log.warning('ffprobe duration check failed: %s', exc)
        return None


def _even_timestamps(duration: float, count: int) -> list[float]:
    return [
        min(duration - 0.1, max(0.1, ((idx + 0.5) * duration) / count))
        for idx in range(count)
    ]


def _read_frame_files(frames_dir: str) -> list[str]:
    frames = []
    for fname in sorted(os.listdir(frames_dir))[:MAX_EXTRACTION_FRAMES]:
        with open(os.path.join(frames_dir, fname), 'rb') as fh:
            frames.append(base64.b64encode(fh.read()).decode())
    return frames


def _extract_evenly_sampled_frames(video_path: str, frames_dir: str, duration: float) -> list[str]:
    frame_count = min(MAX_EXTRACTION_FRAMES, max(1, round(duration / 2)))
    for idx, timestamp in enumerate(_even_timestamps(duration, frame_count), start=1):
        out_path = os.path.join(frames_dir, f'frame_{idx:03d}.jpg')
        try:
            subprocess.run(
                [
                    'ffmpeg',
                    '-ss', f'{timestamp:.2f}',
                    '-i', video_path,
                    '-frames:v', '1',
                    '-q:v', '5',
                    out_path,
                ],
                capture_output=True,
                check=True,
            )
        except subprocess.CalledProcessError as exc:
            log.warning('ffmpeg frame sample failed at %.2fs: %s', timestamp, exc.stderr)

    return _read_frame_files(frames_dir)


def _extract_initial_frames(video_path: str, frames_dir: str) -> list[str]:
    subprocess.run(
        [
            'ffmpeg', '-i', video_path,
            '-vf', 'fps=1',
            '-q:v', '5',
            '-frames:v', str(MAX_EXTRACTION_FRAMES),
            os.path.join(frames_dir, 'frame_%03d.jpg'),
        ],
        capture_output=True,
        check=True,
    )
    return _read_frame_files(frames_dir)


def _extract_frames(video_path: str, tmpdir: str) -> list[str]:
    """Sample frames across the full video. Returns [] if ffmpeg is unavailable."""
    frames_dir = os.path.join(tmpdir, 'frames')
    os.makedirs(frames_dir, exist_ok=True)

    try:
        duration = _video_duration(video_path)
        if duration:
            return _extract_evenly_sampled_frames(video_path, frames_dir, duration)
        return _extract_initial_frames(video_path, frames_dir)
    except FileNotFoundError:
        log.warning('ffmpeg not found - skipping frame extraction (install ffmpeg for full quality)')
        return []
    except subprocess.CalledProcessError as exc:
        log.warning('ffmpeg error: %s', exc.stderr)
        return []


def _transcribe(video_path: str) -> Optional[str]:
    try:
        model = _get_whisper()
        segments, _ = model.transcribe(video_path, beam_size=1)
        text = ' '.join(seg.text for seg in segments).strip()
        return text or None
    except Exception as exc:
        log.warning('Whisper transcription failed: %s', exc)
        return None


# ─── OG scraping fallback ────────────────────────────────────

class _OGParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.og: dict[str, str] = {}

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag != 'meta':
            return
        d = dict(attrs)
        key = d.get('property') or d.get('name') or d.get('itemprop') or ''
        if key and 'content' in d:
            self.og[key] = d['content']


def _og_scrape(url: str, shortcut_metadata: dict, platform: str) -> dict:
    """Parse Open Graph tags from the page. Falls back to shortcut metadata."""
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
        'caption': (
            og.get('og:description')
            or og.get('twitter:description')
            or meta.get('page_description')
        ),
        'author': (
            og.get('og:title')
            or og.get('twitter:title')
            or meta.get('page_title')
        ),
        'thumbnail_url': (
            og.get('og:image')
            or og.get('og:image:secure_url')
            or og.get('twitter:image')
            or og.get('twitter:image:src')
            or og.get('image')
            or meta.get('thumbnail_url')
        ),
        'source_platform': platform,
        'is_fallback': True,
    }
