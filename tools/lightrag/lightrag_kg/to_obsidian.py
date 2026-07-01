import argparse
import asyncio
import shutil
from collections import Counter
from datetime import datetime

import networkx as nx
from rich.console import Console

from . import config
from .index import slugify
from .rag import get_rag

console = Console()


async def export(clean: bool) -> dict:
    vault = config.OBSIDIAN_VAULT_DIR
    entities_dir = vault / "entities"
    decisions_dir = vault / "decisions"

    if clean and vault.exists():
        shutil.rmtree(vault)
    entities_dir.mkdir(parents=True, exist_ok=True)
    decisions_dir.mkdir(parents=True, exist_ok=True)

    rag = await get_rag()
    graph_storage = rag.chunk_entity_relation_graph
    nx_graph = await graph_storage.get_graph() if hasattr(graph_storage, "get_graph") else nx.Graph()

    if nx_graph.number_of_nodes() == 0:
        console.print("[yellow]Grafo vazio -- rode a indexacao antes do export.[/yellow]")

    try:
        communities = list(nx.community.louvain_communities(nx_graph.to_undirected(), seed=42))
    except Exception:
        communities = []

    community_by_node: dict[str, int] = {}
    for idx, comm in enumerate(communities):
        for node in comm:
            community_by_node[node] = idx

    # Count entity types for stats
    type_counts: Counter = Counter()
    top_by_degree = sorted(nx_graph.degree, key=lambda x: x[1], reverse=True)[:20]

    # Export entity notes
    for node, data in nx_graph.nodes(data=True):
        slug = slugify(str(node))
        entity_type = data.get("entity_type", "unknown")
        type_counts[entity_type] += 1
        description = data.get("description", "")
        sources = str(data.get("source_id", "")).split("<SEP>")
        appears_in = sorted({s for s in sources if s})

        neighbors = list(nx_graph.neighbors(node))
        lines = [
            "---",
            f"entity_type: {entity_type}",
            f"community: {community_by_node.get(node, -1)}",
            f"degree: {nx_graph.degree(node)}",
            "---",
            "",
            f"# {node}",
            "",
            description,
            "",
            "## Appears in",
        ]
        lines += [f"- `{s}`" for s in appears_in] or ["- (sem referencia de arquivo)"]
        lines += ["", "## Conexoes"]
        lines += [f"- [[{slugify(str(n))}]]" for n in neighbors] or ["- (nenhuma)"]

        (entities_dir / f"{slug}.md").write_text("\n".join(lines), encoding="utf-8")

    # Generate INDEX.md with rich context
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    index_lines = [
        "# Knowledge Graph — HubFlow Platform",
        "",
        f"Gerado em: {now}",
        "",
        "## Como funciona",
        "",
        "```",
        "Claude Code  <--MCP (kg_query)--> LightRAG <--lê/escreve--> rag_storage/",
        "                                      |",
        "                               rag export --clean",
        "                                      v",
        "                              docs/knowledge-graph/  <-- voce esta aqui (Obsidian)",
        "```",
        "",
        "- **Claude Code** consulta o grafo em tempo real via MCP (`kg_query`)",
        "- **Obsidian** mostra este vault como visualizacao offline do grafo",
        "- **`rag insert`** adiciona decisoes/contexto ao grafo",
        "- **`rag export --clean`** regenera este vault",
        "",
        "## Stats",
        "",
        f"| Metrica | Valor |",
        f"|---------|-------|",
        f"| Entidades | {nx_graph.number_of_nodes()} |",
        f"| Relacoes | {nx_graph.number_of_edges()} |",
        f"| Comunidades | {len(communities)} |",
        "",
        "## Entidades por tipo",
        "",
    ]
    for etype, count in type_counts.most_common():
        index_lines.append(f"- **{etype}**: {count}")

    index_lines += [
        "",
        "## Top 20 entidades (por conexoes)",
        "",
        "| Entidade | Conexoes | Tipo |",
        "|----------|----------|------|",
    ]
    for node, degree in top_by_degree:
        etype = nx_graph.nodes[node].get("entity_type", "?")
        slug = slugify(str(node))
        index_lines.append(f"| [[entities/{slug}|{node}]] | {degree} | {etype} |")

    index_lines += [
        "",
        "## Comunidades (clusters tematicos)",
        "",
    ]
    for idx, comm in enumerate(communities):
        members = sorted(comm, key=lambda n: nx_graph.degree(n), reverse=True)[:5]
        member_links = ", ".join(f"[[entities/{slugify(str(m))}|{m}]]" for m in members)
        suffix = f" (+{len(comm)-5} mais)" if len(comm) > 5 else ""
        index_lines.append(f"- **Comunidade {idx}** ({len(comm)} membros): {member_links}{suffix}")

    index_lines += [
        "",
        "## Todas as entidades",
        "",
    ]
    for node, data in sorted(nx_graph.nodes(data=True), key=lambda x: str(x[0]).lower()):
        slug = slugify(str(node))
        entity_type = data.get("entity_type", "unknown")
        index_lines.append(f"- [[entities/{slug}|{node}]] ({entity_type})")

    index_lines += [
        "",
        "## Comandos uteis",
        "",
        "```bash",
        "# Consultar o grafo do terminal",
        'rag search "como funciona X"',
        "",
        "# Inserir decisao",
        'rag insert "decisao: usamos Y por causa de Z" --source decisao-2026-07-01',
        "",
        "# Re-exportar apos mudancas",
        "rag export --clean",
        "",
        "# Re-indexar apos mudar codigo",
        "rag index --incremental",
        "```",
        "",
        "## Dicas Obsidian",
        "",
        "1. **Graph View** (`Cmd+G` / `Ctrl+G`): filtre por `path:entities/`",
        "2. **Cores por tipo**: Settings > Graph > Groups > adicione filtros por `entity_type`",
        "3. **Busca**: use `Ctrl+O` pra encontrar entidades pelo nome",
        "4. **Dataview** (plugin): query entidades por tipo, degree, comunidade",
        "",
    ]

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
