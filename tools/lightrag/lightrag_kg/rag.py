from lightrag import LightRAG, QueryParam
from lightrag.kg.shared_storage import initialize_pipeline_status
from lightrag.utils import EmbeddingFunc

from . import config
from .llm import embedding_func, llm_model_func

_rag: LightRAG | None = None


async def get_rag() -> LightRAG:
    global _rag
    if _rag is not None:
        return _rag

    config.WORKING_DIR.mkdir(parents=True, exist_ok=True)

    instance = LightRAG(
        working_dir=str(config.WORKING_DIR),
        llm_model_func=llm_model_func,
        embedding_func=EmbeddingFunc(
            embedding_dim=config.EMBEDDING_DIM,
            func=embedding_func,
        ),
        llm_model_max_async=1,              # free tier: 1 LLM call at a time
        max_parallel_insert=1,              # free tier: sequential inserts
        embedding_batch_num=50,             # large batch = fewer API calls per flush
        embedding_func_max_async=1,         # free tier: 1 embed call at a time (sequential)
        default_embedding_timeout=900,      # 15 min timeout per embedding batch
        default_llm_timeout=300,            # 5 min timeout for LLM
        chunk_token_size=1200,
        chunk_overlap_token_size=100,
    )
    await instance.initialize_storages()
    await initialize_pipeline_status()
    _rag = instance
    return _rag


async def query(term: str, mode: str = "hybrid") -> str:
    instance = await get_rag()
    return await instance.aquery(term, param=QueryParam(mode=mode))


async def insert_text(text: str, source: str = "manual") -> None:
    instance = await get_rag()
    await instance.ainsert([text], file_paths=[source])


async def stats() -> dict:
    instance = await get_rag()
    entities = await instance.chunk_entity_relation_graph.get_all_nodes() if hasattr(
        instance.chunk_entity_relation_graph, "get_all_nodes"
    ) else []
    relations = await instance.chunk_entity_relation_graph.get_all_edges() if hasattr(
        instance.chunk_entity_relation_graph, "get_all_edges"
    ) else []
    return {
        "entities": len(entities),
        "relations": len(relations),
        "working_dir": str(config.WORKING_DIR),
    }
