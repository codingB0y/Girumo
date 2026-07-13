import asyncio

import networkx as nx

from . import config
from .llm import embedding_func, llm_model_func

_rag_instance = None
_init_lock = asyncio.Lock()


async def get_rag():
    global _rag_instance
    async with _init_lock:
        if _rag_instance is not None:
            return _rag_instance

        from lightrag import LightRAG
        from lightrag.kg.shared_storage import initialize_pipeline_status
        from lightrag.utils import EmbeddingFunc

        config.STORAGE_DIR.mkdir(parents=True, exist_ok=True)

        rag = LightRAG(
            working_dir=str(config.STORAGE_DIR),
            llm_model_func=llm_model_func,
            embedding_func=EmbeddingFunc(
                embedding_dim=config.EMBEDDING_DIM,
                max_token_size=8192,
                func=embedding_func,
            ),
            llm_model_max_async=2,
            max_parallel_insert=1,
            embedding_batch_num=32,
            chunk_token_size=1200,
            chunk_overlap_token_size=100,
        )
        await rag.initialize_storages()
        await initialize_pipeline_status()

        _rag_instance = rag
        return _rag_instance


async def insert_batch(texts: list[str], ids: list[str], file_paths: list[str]):
    rag = await get_rag()
    await rag.ainsert(texts, ids=ids, file_paths=file_paths)


async def purge_stale_records(file_paths: list[str]) -> dict[str, int]:
    """Remove every doc_status record (original + duplicate stragglers) for
    the given flattened file_paths, so a retry isn't blocked by LightRAG's
    filename-basename dedup (which matches on ANY existing record for that
    file_path regardless of status — see lightrag/pipeline.py
    get_existing_doc_by_file_basename). Hand-editing kv_store_doc_status.json
    only removes the "doc-*" original and leaves "dup-*"/"error-*" stragglers
    behind, which still trip the same dedup check on the next attempt.
    """
    from lightrag.base import DocStatus
    from lightrag.utils_pipeline import doc_status_field

    rag = await get_rag()
    target_paths = set(file_paths)

    all_docs = await rag.doc_status.get_docs_by_statuses(
        [DocStatus.FAILED, DocStatus.PENDING, DocStatus.PROCESSING, DocStatus.PROCESSED]
    )
    matching_ids = [
        doc_id
        for doc_id, doc in all_docs.items()
        if doc_status_field(doc, "file_path", "") in target_paths
    ]

    deleted = 0
    for doc_id in matching_ids:
        if doc_id.startswith("doc-"):
            result = await rag.adelete_by_doc_id(doc_id, delete_llm_cache=True)
            if getattr(result, "status", None) in ("success", "not_found"):
                deleted += 1
        else:
            # "dup-*"/"error-*" markers never had chunks/entities/vectors —
            # a plain doc_status delete is enough, no adelete_by_doc_id needed.
            await rag.doc_status.delete([doc_id])
            deleted += 1

    return {"matched": len(matching_ids), "deleted": deleted}


async def insert_text(text: str, source: str):
    rag = await get_rag()
    await rag.ainsert(text, file_paths=[source])


async def query(question: str, mode: str = "hybrid") -> str:
    rag = await get_rag()
    from lightrag import QueryParam

    return await rag.aquery(question, param=QueryParam(mode=mode))


def _graphml_path() -> "None | str":
    candidate = config.STORAGE_DIR / "graph_chunk_entity_relation.graphml"
    return str(candidate) if candidate.exists() else None


def _load_graph() -> "nx.Graph | None":
    path = _graphml_path()
    if not path:
        return None
    return nx.read_graphml(path)


async def stats() -> dict:
    await get_rag()
    graph = _load_graph()
    entities = graph.number_of_nodes() if graph else 0
    relations = graph.number_of_edges() if graph else 0

    doc_status_path = config.STORAGE_DIR / "kv_store_doc_status.json"
    documents = 0
    processed = 0
    failed = 0
    pending = 0
    if doc_status_path.exists():
        import json
        from collections import Counter

        with open(doc_status_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        documents = len(data)
        counts = Counter(v.get("status") for v in data.values())
        processed = counts.get("processed", 0)
        failed = counts.get("failed", 0)
        pending = documents - processed - failed

    return {
        "entities": entities,
        "relations": relations,
        "documents_tracked": documents,
        "documents_processed": processed,
        "documents_failed": failed,
        "documents_pending": pending,
        "storage_dir": str(config.STORAGE_DIR),
    }


def top_entities(limit: int = 20) -> list[tuple[str, int]]:
    graph = _load_graph()
    if not graph:
        return []
    degrees = sorted(graph.degree, key=lambda item: item[1], reverse=True)
    return degrees[:limit]


def find_entity(term: str) -> list[str]:
    graph = _load_graph()
    if not graph:
        return []
    term_lower = term.lower()
    return [node for node in graph.nodes if term_lower in str(node).lower()]


def show_entity(name: str) -> "dict | None":
    graph = _load_graph()
    if not graph or name not in graph:
        return None
    node_data = dict(graph.nodes[name])
    neighbors = list(graph.neighbors(name))
    return {"name": name, "data": node_data, "neighbors": neighbors}


def communities(seed: int = 42):
    graph = _load_graph()
    if not graph:
        return []
    undirected = graph.to_undirected() if graph.is_directed() else graph
    return list(nx.algorithms.community.louvain_communities(undirected, seed=seed))
