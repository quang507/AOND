"""Vector Store & Semantic Search for AOND using Google Gemini Embeddings.
Provides semantic property matching, project brochure RAG, and query embedding
with automatic key rotation across a pool of Gemini API keys.
"""
from __future__ import annotations

import json
import logging
import math
import os
import random
import urllib.request
from typing import Any

log = logging.getLogger("aioi.vector_store")

def get_gemini_key_pool() -> list[str]:
    """Retrieve Gemini API keys from environment (GEMINI_API_KEYS or GEMINI_API_KEY)."""
    raw_keys = os.environ.get("GEMINI_API_KEYS", "") or os.environ.get("GEMINI_API_KEY", "")
    if raw_keys:
        return [k.strip() for k in raw_keys.split(",") if k.strip()]
    return []


class GeminiEmbedder:
    def __init__(self, keys: list[str] | None = None, model: str = "models/gemini-embedding-001"):
        self.keys = keys if keys is not None else get_gemini_key_pool()
        self.model = model
        self._current_key_idx = 0

    def _get_key(self) -> str:
        if not self.keys:
            return ""
        key = self.keys[self._current_key_idx % len(self.keys)]
        self._current_key_idx += 1
        return key

    def embed_text(self, text: str) -> list[float]:
        """Generate a 768-dimensional embedding vector for a given text using Gemini."""
        if not text or not text.strip():
            return []

        for attempt in range(len(self.keys)):
            key = self._get_key()
            url = f"https://generativelanguage.googleapis.com/v1beta/{self.model}:embedContent?key={key}"
            payload = {
                "model": self.model,
                "content": {"parts": [{"text": text[:2048]}]},
            }
            try:
                req = urllib.request.Request(
                    url,
                    data=json.dumps(payload).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                )
                with urllib.request.urlopen(req, timeout=10) as resp:
                    res_data = json.loads(resp.read().decode("utf-8"))
                    return res_data.get("embedding", {}).get("values", [])
            except Exception as e:
                log.warning("Embedding attempt %d failed with key: %s", attempt + 1, e)
                continue

        log.error("All Gemini embedding keys exhausted or failed.")
        return []


def cosine_similarity(vec1: list[float], vec2: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    if not vec1 or not vec2 or len(vec1) != len(vec2):
        return 0.0
    dot = sum(a * b for a, b in zip(vec1, vec2))
    norm1 = math.sqrt(sum(a * a for a in vec1))
    norm2 = math.sqrt(sum(b * b for b in vec2))
    if norm1 == 0.0 or norm2 == 0.0:
        return 0.0
    return dot / (norm1 * norm2)


class InMemoryVectorIndex:
    """Fast in-memory semantic vector index for listings and project docs."""

    def __init__(self, embedder: GeminiEmbedder | None = None):
        self.embedder = embedder or GeminiEmbedder()
        self.entries: list[dict[str, Any]] = []

    def add_document(self, doc_id: str, text: str, metadata: dict[str, Any] | None = None) -> bool:
        vec = self.embedder.embed_text(text)
        if not vec:
            return False
        self.entries.append({
            "id": doc_id,
            "text": text,
            "vector": vec,
            "metadata": metadata or {},
        })
        return True

    def search(self, query: str, top_k: int = 3, threshold: float = 0.5) -> list[dict[str, Any]]:
        query_vec = self.embedder.embed_text(query)
        if not query_vec:
            return []

        scored = []
        for e in self.entries:
            sim = cosine_similarity(query_vec, e["vector"])
            if sim >= threshold:
                scored.append({
                    "id": e["id"],
                    "text": e["text"],
                    "score": round(sim, 4),
                    "metadata": e["metadata"],
                })

        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[:top_k]


vector_index = InMemoryVectorIndex()
