import asyncio
import time
from collections import deque

import numpy as np
from google import genai
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_fixed

from . import config

_client = genai.Client(api_key=config.GOOGLE_API_KEY)

_RETRYABLE = (Exception,)


class _RateLimiter:
    """Leaky-bucket limiter to stay under the free-tier requests-per-minute quota.

    For Gemini free tier: 5 RPM for LLM, 5 RPM for embeddings.
    We use 2 RPM (30s between calls) to guarantee we never hit 429.
    """

    def __init__(self, interval_seconds: float):
        """interval_seconds = minimum gap between calls."""
        self._interval = interval_seconds
        self._last_call: float = 0.0
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self._last_call
            if elapsed < self._interval:
                await asyncio.sleep(self._interval - elapsed)
            self._last_call = time.monotonic()


# 30s between calls = max 2 RPM. Very conservative but guarantees no 429.
_llm_limiter = _RateLimiter(interval_seconds=30.0)
_embed_limiter = _RateLimiter(interval_seconds=30.0)


def _is_retryable(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(code in msg for code in ("429", "500", "503", "504", "unavailable", "timeout", "resource_exhausted"))


@retry(
    retry=retry_if_exception_type(_RETRYABLE),
    stop=stop_after_attempt(5),
    wait=wait_fixed(60),  # on retry, wait a full minute
)
async def _generate(model: str, prompt: str, system_prompt: str | None) -> str:
    await _llm_limiter.acquire()
    contents = prompt if not system_prompt else f"{system_prompt}\n\n{prompt}"
    response = await _client.aio.models.generate_content(model=model, contents=contents)
    return response.text or ""


async def llm_model_func(
    prompt: str,
    system_prompt: str | None = None,
    history_messages: list | None = None,
    **kwargs,
) -> str:
    try:
        return await _generate(config.LLM_MODEL, prompt, system_prompt)
    except Exception as exc:
        if not _is_retryable(exc):
            raise
        return await _generate(config.LLM_MODEL_FALLBACK, prompt, system_prompt)


@retry(stop=stop_after_attempt(5), wait=wait_fixed(60))
async def _embed(model: str, texts: list[str]) -> np.ndarray:
    await _embed_limiter.acquire()
    response = await _client.aio.models.embed_content(model=model, contents=texts)
    vectors = [e.values for e in response.embeddings]
    return np.array(vectors, dtype=np.float32)


async def embedding_func(texts: list[str]) -> np.ndarray:
    try:
        return await _embed(config.EMBEDDING_MODEL, texts)
    except Exception:
        return await _embed(config.EMBEDDING_MODEL_FALLBACK, texts)
