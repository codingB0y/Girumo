import argparse
import asyncio
import shutil

import networkx as nx
from rich.console import Console

from . import config
from .index import slugify
from .rag import get_rag

console = Console()


async def export(clean: bool) -> dict:
    vault = config.OBSIDIAN_VAULT_DIR
    entities_dir = vault / "entities"

    if clean and vault.exists():
        shutil.rmtree(vault)
    entities_dir.mkdir(parents=True, exist_ok=True)

    rag = await get_rag()
    graph_storage = rag.chunk_entity_relation_graph
    nx_graph = await graph_storage.get_graph() if hasattr(graph_storage, "get_graph") else nx.Graph()

    if nx_graph.number_of_nodes() == 0:
        console.print("[yellow]Grafo vazio — rode a indexação antes do export.[/yellow]")

    try:
        communities = list(nx.community.louvain_communities(nx_graph.to_undirected(), seed=42))
    except Exception:
        communities = []

    community_by_node: dict[str, int] = {}
    for idx, comm in enumerate(communities):
        for node in comm:
            community_by_node[node] = idx

    index_lines = ["# Knowledge Graph Index", ""]
    for node, data in nx_graph.nodes(data=True):
        slug = slugify(str(node))
        entity_type = data.get("entity_type", "unknown")
        description = data.get("description", "")
        sources = str(data.get("source_id", "")).split("<SEP>")
        appears_in = sorted({s for s in sources if s})

        neighbors = list(nx_graph.neighbors(node))
        lines = [
            "---",
            f"entity_type: {entity_type}",
            f"community: {community_by_node.get(node, -1)}",
            "---",
            "",
            f"# {node}",
            "",
            description,
            "",
            "## Appears in",
        ]
        lines += [f"- `{s}`" for s in appears_in] or ["- (sem referência de arquivo)"]
        lines += ["", "## Conexões"]
        lines += [f"- [[{slugify(str(n))}]]" for n in neighbors] or ["- (nenhuma)"]

        (entities_dir / f"{slug}.md").write_text("\n".join(lines), encoding="utf-8")
        index_lines.append(f"- [[entities/{slug}|{node}]] ({entity_type})")

    (vault / "INDEX.md").write_text("\n".join(index_lines), encoding="utf-8")

    return {
        "entities": nx_graph.number_of_nodes(),
        "relations": nx_graph.number_of_edges(),
        "communities": len(communities),
        "vault": str(vault),
    }


def main() -> None:
    parser = argparse.ArgumentParser(prog="kg-to-obsidian")
    parser.add_argument("--clean", action="store_true")
    args = parser.parse_args()
    result = asyncio.run(export(clean=args.clean))
    console.print(result)


if __name__ == "__main__":
    main()
