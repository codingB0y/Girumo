import asyncio
import time

import numpy as np
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from . import config

_client = None
_resolved_llm_model = None
_resolved_embedding_model = None

_MIN_CALL_INTERVAL_SECONDS = 4.5
_throttle_lock = asyncio.Lock()
_last_call_ts = 0.0


async def _throttle():
    global _last_call_ts
    async with _throttle_lock:
        now = time.monotonic()
        wait_needed = _last_call_ts + _MIN_CALL_INTERVAL_SECONDS - now
        if wait_needed > 0:
            await asyncio.sleep(wait_needed)
        _last_call_ts = time.monotonic()


def get_client():
    global _client
    if _client is None:
        from google import genai

        _client = genai.Client(api_key=config.GOOGLE_API_KEY)
    return _client


def _is_retryable(exc: BaseException) -> bool:
    message = str(exc).upper()
    return any(
        code in message
        for code in ("429", "500", "503", "504", "UNAVAILABLE", "RESOURCE_EXHAUSTED")
    )


def _is_not_found(exc: BaseException) -> bool:
    message = str(exc).upper()
    return "404" in message or "NOT_FOUND" in message


@retry(
    retry=retry_if_exception(_is_retryable),
    stop=stop_after_attempt(8),
    wait=wait_exponential(multiplier=2, min=4, max=60),
)
async def _generate_content(model: str, contents: str):
    await _throttle()
    client = get_client()
    return await client.aio.models.generate_content(model=model, contents=contents)


async def llm_model_func(
    prompt: str,
    system_prompt: str | None = None,
    history_messages: list | None = None,
    **kwargs,
) -> str:
    global _resolved_llm_model

    parts = []
    if system_prompt:
        parts.append(system_prompt)
    for msg in history_messages or []:
        role = msg.get("role", "user")
        parts.append(f"{role}: {msg.get('content', '')}")
    parts.append(prompt)
    contents = "\n\n".join(parts)

    model = _resolved_llm_model or config.LLM_MODEL_PRIMARY
    try:
        response = await _generate_content(model, contents)
        _resolved_llm_model = model
        return response.text or ""
    except Exception as exc:
        if _is_not_found(exc) and model != config.LLM_MODEL_FALLBACK:
            response = await _generate_content(config.LLM_MODEL_FALLBACK, contents)
            _resolved_llm_model = config.LLM_MODEL_FALLBACK
            return response.text or ""
        raise


@retry(
    retry=retry_if_exception(_is_retryable),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=6),
)
async def _embed_content(model: str, texts: list[str]):
    await _throttle()
    client = get_client()
    return await client.aio.models.embed_content(model=model, contents=texts)


async def embedding_func(texts: list[str]) -> np.ndarray:
    global _resolved_embedding_model

    model = _resolved_embedding_model or config.EMBEDDING_MODEL_PRIMARY
    try:
        response = await _embed_content(model, texts)
        _resolved_embedding_model = model
    except Exception as exc:
        if _is_not_found(exc) and model != config.EMBEDDING_MODEL_FALLBACK:
            response = await _embed_content(config.EMBEDDING_MODEL_FALLBACK, texts)
            _resolved_embedding_model = config.EMBEDDING_MODEL_FALLBACK
        else:
            raise

    embeddings = [e.values for e in response.embeddings]
    return np.array(embeddings, dtype=np.float32)


async def probe() -> dict:
    reply = await llm_model_func("Reply with exactly: OK")
    vectors = await embedding_func(["probe"])
    return {
        "llm_model": _resolved_llm_model,
        "llm_reply": reply.strip()[:50],
        "embedding_model": _resolved_embedding_model,
        "embedding_dim": vectors.shape[1] if vectors.ndim == 2 else len(vectors[0]),
    }
