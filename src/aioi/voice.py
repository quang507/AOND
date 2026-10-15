"""Voice Note / Audio transcription support using Groq Whisper Cloud API (whisper-large-v3-turbo).
100% Free, ultra-fast (~0.3-0.5s for 30s audio), and exceptional accuracy for Vietnamese.
Automatically converts raw audio (such as raw AAC from Zalo) to MP3 using ffmpeg if needed.
"""
from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
import tempfile
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


def convert_audio_to_mp3(audio_bytes: bytes, original_hint: str = "aac") -> Optional[bytes]:
    """Convert audio bytes to MP3 format using ffmpeg to guarantee API compatibility."""
    if not shutil.which("ffmpeg"):
        log.warning("ffmpeg is not installed, cannot convert audio")
        return None

    hint = "aac" if "aac" in original_hint.lower() else "audio"
    try:
        with tempfile.NamedTemporaryFile(suffix=f".{hint}", delete=False) as in_f:
            in_f.write(audio_bytes)
            in_path = in_f.name

        out_path = in_path + ".mp3"
        cmd = [
            "ffmpeg", "-y", "-i", in_path,
            "-acodec", "libmp3lame",
            "-b:a", "64k",
            out_path
        ]
        res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
        if res.returncode == 0 and os.path.exists(out_path):
            with open(out_path, "rb") as out_f:
                mp3_bytes = out_f.read()
            return mp3_bytes
        else:
            log.warning("ffmpeg conversion returned non-zero exit code: %d", res.returncode)
            return None
    except Exception as e:
        log.exception("ffmpeg audio conversion error: %s", e)
        return None
    finally:
        try:
            if "in_path" in locals() and os.path.exists(in_path):
                os.remove(in_path)
            if "out_path" in locals() and os.path.exists(out_path):
                os.remove(out_path)
        except OSError:
            pass


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

    # Zalo audio is typically raw ADTS AAC (voice-aac-dl.zdn.vn).
    # Groq Whisper rejects raw ADTS AAC as unsupported container.
    # If the file is .aac or conversion is needed, convert to standard MP3.
    target_filename = filename
    target_bytes = audio_bytes
    mime_type = "audio/mpeg"

    if filename.lower().endswith(".aac") or "aac" in filename.lower():
        converted = convert_audio_to_mp3(audio_bytes, original_hint="aac")
        if converted:
            target_bytes = converted
            target_filename = "voice_note.mp3"
            mime_type = "audio/mpeg"
        else:
            target_filename = "voice_note.mp3"
            mime_type = "audio/mpeg"
    elif filename.lower().endswith(".wav"):
        mime_type = "audio/wav"
    elif filename.lower().endswith(".ogg") or filename.lower().endswith(".opus"):
        mime_type = "audio/ogg"
    elif filename.lower().endswith(".m4a"):
        mime_type = "audio/m4a"

    url = "https://api.groq.com/openai/v1/audio/transcriptions"
    headers = {"Authorization": f"Bearer {key}"}
    files = {"file": (target_filename, target_bytes, mime_type)}
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

            # Fallback: If 400 unsupported format, attempt conversion to MP3 if not already tried
            if resp.status_code == 400 and not target_filename.endswith(".mp3"):
                log.info("Groq rejected format, attempting fallback ffmpeg conversion to MP3...")
                mp3_bytes = convert_audio_to_mp3(audio_bytes)
                if mp3_bytes:
                    files_fallback = {"file": ("voice_note.mp3", mp3_bytes, "audio/mpeg")}
                    resp2 = client.post(url, headers=headers, files=files_fallback, data=data)
                    if resp2.status_code == 200:
                        text = (resp2.json().get("text") or "").strip()
                        return text if text else None

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
