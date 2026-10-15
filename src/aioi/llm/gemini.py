"""Gemini (Google) provider implementation using REST API with httpx and automatic model fallback."""
from __future__ import annotations

import base64
import json
import logging
import time
from typing import Any
import httpx

from ..config import Settings
from ..imaging import downscale_image
from .base import LLMProvider, Message, ToolCall, ToolTurn

log = logging.getLogger("aioi.llm.gemini")


class GeminiProvider(LLMProvider):
    def __init__(self, settings: Settings):
        self._settings = settings
        self._key = settings.gemini_api_key or ""
        models_str = settings.gemini_model or "gemini-flash-latest,gemini-2.5-flash-lite,gemini-3.1-flash-lite"
        self._models = [m.strip() for m in models_str.split(",") if m.strip()]
        self._client = httpx.Client(timeout=60.0)

    def _post(self, body: dict[str, Any]) -> httpx.Response | None:
        last_res = None
        for m in self._models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key={self._key}"
            try:
                res = self._client.post(url, json=body)
                if res.status_code == 200:
                    return res
                last_res = res
                if res.status_code in (429, 503, 404):
                    log.warning("Gemini model %s returned %d, trying fallback...", m, res.status_code)
                    if res.status_code == 429:
                        time.sleep(1.0)
                    continue
                return res
            except Exception as e:
                log.warning("Gemini request error on %s: %s", m, e)
        return last_res

    def chat(self, system: str, messages: list[Message], max_tokens: int = 256) -> str:
        contents = []
        for m in messages:
            role = "model" if m.role == "assistant" else "user"
            contents.append({"role": role, "parts": [{"text": m.content}]})

        body = {
            "system_instruction": {"parts": [{"text": system}]},
            "contents": contents,
            "generationConfig": {
                "maxOutputTokens": max_tokens,
                "temperature": 0.4,
            },
        }
        res = self._post(body)
        if not res or res.status_code != 200:
            return ""
        try:
            return res.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
        except (KeyError, IndexError):
            return ""

    def extract(
        self, system: str, messages: list[Message], json_schema: dict[str, Any]
    ) -> dict[str, Any]:
        contents = []
        for m in messages:
            role = "model" if m.role == "assistant" else "user"
            contents.append({"role": role, "parts": [{"text": m.content}]})

        prompt_system = f"{system}\n\nIMPORTANT: Return ONLY valid JSON matching this schema: {json.dumps(json_schema, ensure_ascii=False)}"
        body = {
            "system_instruction": {"parts": [{"text": prompt_system}]},
            "contents": contents,
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.0,
            },
        }
        res = self._post(body)
        if not res or res.status_code != 200:
            return {}
        try:
            text = res.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
            return json.loads(text)
        except Exception as e:
            log.warning("Gemini json parse error: %s", e)
            return {}

    def describe_media(self, items: list[tuple[bytes, str]], instruction: str,
                       max_tokens: int = 1024) -> str:
        parts: list[dict[str, Any]] = []
        for data, media_type in items:
            if media_type.startswith("image/"):
                small, small_type = downscale_image(data, media_type)
                b64 = base64.standard_b64encode(small).decode("ascii")
                parts.append({"inline_data": {"mime_type": small_type, "data": b64}})
            elif media_type == "application/pdf":
                b64 = base64.standard_b64encode(data).decode("ascii")
                parts.append({"inline_data": {"mime_type": media_type, "data": b64}})

        parts.append({"text": instruction})
        body = {
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": {"maxOutputTokens": max_tokens, "temperature": 0.2},
        }
        res = self._post(body)
        if not res or res.status_code != 200:
            return ""
        try:
            return res.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
        except Exception:
            return ""

    def group_media(
        self,
        items: list[tuple[bytes, str]],
        labels: list[str],
        instruction: str,
        json_schema: dict[str, Any],
    ) -> dict[str, Any]:
        parts: list[dict[str, Any]] = []
        for (data, media_type), label in zip(items, labels):
            small, small_type = downscale_image(data, media_type) if media_type.startswith("image/") else (data, media_type)
            b64 = base64.standard_b64encode(small).decode("ascii")
            parts.append({"text": f"File: {label}"})
            parts.append({"inline_data": {"mime_type": small_type, "data": b64}})
        parts.append({"text": f"{instruction}\n\nSchema: {json.dumps(json_schema, ensure_ascii=False)}"})
        body = {
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": {"responseMimeType": "application/json", "temperature": 0.0},
        }
        res = self._post(body)
        if not res or res.status_code != 200:
            return {}
        try:
            text = res.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
            return json.loads(text)
        except Exception:
            return {}

    def extract_media(
        self, items: list[tuple[bytes, str]], instruction: str, json_schema: dict[str, Any]
    ) -> dict[str, Any]:
        parts: list[dict[str, Any]] = []
        for data, media_type in items:
            small, small_type = downscale_image(data, media_type) if media_type.startswith("image/") else (data, media_type)
            b64 = base64.standard_b64encode(small).decode("ascii")
            parts.append({"inline_data": {"mime_type": small_type, "data": b64}})
        parts.append({"text": f"{instruction}\n\nSchema: {json.dumps(json_schema, ensure_ascii=False)}"})
        body = {
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": {"responseMimeType": "application/json", "temperature": 0.0},
        }
        res = self._post(body)
        if not res or res.status_code != 200:
            return {}
        try:
            text = res.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
            return json.loads(text)
        except Exception:
            return {}
