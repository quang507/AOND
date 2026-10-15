"""Voice Note / Audio transcription support using Groq Whisper Cloud API (whisper-large-v3-turbo).
100% Free, ultra-fast (~0.3-0.5s for 30s audio), and exceptional accuracy for Vietnamese.
"""
from __future__ import annotations

import logging
import os
import re
from typing import Optional
import httpx

log = logging.getLogger("aioi.voice")

AUDIO_EXTENSIONS = (
    ".m4a", ".aac", ".mp3", ".wav", ".ogg",
    ".flac", ".opus", ".webm", ".amr", ".3gp"
)


def is_audio_file(url_or_path: str, file_name: Optional[str] = None) -> bool:
    """Check if the URL, path, or file_name represents an audio file."""
    target = (file_name or "") + " " + (url_or_path or "")
    target = target.lower().strip()
    if any(ext in target for ext in AUDIO_EXTENSIONS):
        return True
    if re.search(r"voice|audio|ghi[_\s-]?am", target):
        return True
    return False


def transcribe_audio_bytes(
    audio_bytes: bytes,
    filename: str = "voice_note.m4a",
    groq_api_key: Optional[str] = None,
    model: str = "whisper-large-v3-turbo",
) -> Optional[str]:
    """Transcribe raw audio bytes using Groq Cloud Whisper API."""
    key = groq_api_key or os.getenv("GROQ_API_KEY")
    if not key:
        log.warning("Cannot transcribe audio: GROQ_API_KEY is not configured")
        return None

    if not audio_bytes or len(audio_bytes) < 50:
        log.warning("Audio data is too small (%d bytes), skipping transcription", len(audio_bytes))
        return None

    url = "https://api.groq.com/openai/v1/audio/transcriptions"
    headers = {"Authorization": f"Bearer {key}"}

    # Infer content type based on extension
    mime_type = "audio/m4a"
    fn = filename.lower()
    if fn.endswith(".mp3"):
        mime_type = "audio/mpeg"
    elif fn.endswith(".wav"):
        mime_type = "audio/wav"
    elif fn.endswith(".ogg") or fn.endswith(".opus"):
        mime_type = "audio/ogg"
    elif fn.endswith(".aac"):
        mime_type = "audio/aac"

    files = {"file": (filename, audio_bytes, mime_type)}
    data = {
        "model": model,
        "language": "vi",
        "response_format": "json",
    }

    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(url, headers=headers, files=files, data=data)
            if resp.status_code == 200:
                result = resp.json()
                text = (result.get("text") or "").strip()
                return text if text else None
            else:
                log.error("Groq Whisper API returned %d: %s", resp.status_code, resp.text)
                return None
    except Exception as e:
        log.exception("Exception during Groq Whisper audio transcription: %s", e)
        return None


def transcribe_voice_url(
    url: str,
    groq_api_key: Optional[str] = None,
    model: str = "whisper-large-v3-turbo",
) -> Optional[str]:
    """Download audio from URL and transcribe via Groq Whisper."""
    if not url or not url.startswith("http"):
        return None

    try:
        log.info("Downloading voice note from %s...", url)
        with httpx.Client(timeout=20.0, follow_redirects=True) as client:
            resp = client.get(url)
            if resp.status_code != 200:
                log.error("Failed to download voice note [%d] from %s", resp.status_code, url)
                return None
            audio_bytes = resp.content

        # Determine filename
        filename = "voice_note.m4a"
        url_clean = url.split("?")[0].lower()
        for ext in AUDIO_EXTENSIONS:
            if url_clean.endswith(ext):
                filename = f"voice_note{ext}"
                break

        return transcribe_audio_bytes(
            audio_bytes=audio_bytes,
            filename=filename,
            groq_api_key=groq_api_key,
            model=model,
        )
    except Exception as e:
        log.exception("Failed to download and transcribe voice note: %s", e)
        return None
