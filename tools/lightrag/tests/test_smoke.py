from lightrag_kg.index import slugify, doc_id_for


def test_slugify_basic():
    assert slugify("apps/web/src/App.tsx") == "apps-web-src-apptsx"


def test_slugify_empty():
    assert slugify("") == "unknown"


def test_doc_id_deterministic():
    assert doc_id_for("apps/web/src/App.tsx") == doc_id_for("apps/web/src/App.tsx")


def test_embedding_concurrency_cabe_no_timeout_do_lightrag():
    """A fila do throttle nao pode passar do timeout da funcao de embedding.

    `_throttle()` serializa toda chamada ao Gemini com `_MIN_CALL_INTERVAL_SECONDS`
    de intervalo — LLM e embedding na mesma fila. Com N workers de embedding, o
    ultimo espera N * intervalo antes de chamar a API; se isso passar do timeout
    que o LightRAG da para a funcao (30s), o pipeline inteiro morre em "Worker
    execution timeout", que foi o que travou a indexacao em 02/09/2026.
    """
    import inspect

    from lightrag_kg import rag
    from lightrag_kg.llm import _MIN_CALL_INTERVAL_SECONDS

    fonte = inspect.getsource(rag.get_rag)
    assert "embedding_func_max_async=2" in fonte, "a concorrencia de embedding precisa ser explicita"
    espera_maxima = 2 * _MIN_CALL_INTERVAL_SECONDS
    assert espera_maxima < 30, f"fila de {espera_maxima}s estoura o timeout de 30s do embedding"


def test_backoff_do_embedding_alcanca_o_retry_delay_do_429():
    """O 429 do free tier pede ~32s de espera; o backoff tem que alcancar isso.

    Com o `max=6` antigo as tentativas queimavam em ~7s, todas levavam 429, e o
    RetryError subia ate matar o flush do vetor (IndexFlushError).
    """
    import inspect

    from lightrag_kg import llm

    decorator = inspect.getsource(llm).split("async def _embed_content")[0].rsplit("@retry(", 1)[1]
    assert "max=60" in decorator, "o backoff do embedding precisa alcancar o retryDelay de ~32s do 429"
