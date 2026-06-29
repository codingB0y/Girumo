import asyncio
import time
from collections import deque

import numpy as np
from google import genai
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from . import config

_client = genai.Client(api_key=config.GOOGLE_API_KEY)

_RETRYABLE = (Exception,)


class _RateLimiter:
    """Leaky-bucket limiter to stay under the free-tier requests-per-minute quota."""

    def __init__(self, max_per_minute: int):
        self._max = max_per_minute
        self._calls: deque[float] = deque()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            while True:
                now = time.monotonic()
                while self._calls and now - self._calls[0] > 60:
                    self._calls.popleft()
                if len(self._calls) < self._max:
                    self._calls.append(now)
                    return
                wait_for = 60 - (now - self._calls[0]) + 0.5
                await asyncio.sleep(wait_for)


# Free tier: gemini-2.5-flash = 5 RPM, embedding-001 = 5 RPM. Stay below to avoid 429s.
_llm_limiter = _RateLimiter(max_per_minute=4)
_embed_limiter = _RateLimiter(max_per_minute=4)


def _is_retryable(exc: Exception) -> bool:
    msg = str(exc)
    return any(code in msg for code in ("429", "500", "503", "504", "UNAVAILABLE"))


@retry(
    retry=retry_if_exception_type(_RETRYABLE),
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=2, min=5, max=60),
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


@retry(stop=stop_after_attempt(5), wait=wait_exponential(multiplier=2, min=5, max=60))
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
