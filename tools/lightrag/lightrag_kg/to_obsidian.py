import argparse
import asyncio
import shutil

from rich.console import Console

from . import config
from . import rag as rag_mod
from .index import slugify

console = Console()


def _split_refs(value: str | None) -> list[str]:
    if not value:
        return []
    return [v.strip() for v in value.split("<SEP>") if v.strip()]


def write_entity_note(vault: "object", graph, node: str):
    data = graph.nodes[node]
    slug = slugify(node)
    refs = _split_refs(data.get("file_path")) or _split_refs(data.get("source_id"))

    lines = [f"# {node}", ""]
    entity_type = data.get("entity_type")
    if entity_type:
        lines.append(f"**Type:** {entity_type}")
        lines.append("")
    description = data.get("description")
    if description:
        lines.append(description)
        lines.append("")

    neighbors = list(graph.neighbors(node))
    if neighbors:
        lines.append("## Neighbors")
        for n in neighbors:
            lines.append(f"- [[{slugify(n)}|{n}]]")
        lines.append("")

    if refs:
        lines.append("## Appears in")
        for ref in refs:
            lines.append(f"- `{ref}`")
        lines.append("")

    path = config.OBSIDIAN_VAULT_DIR / "entities" / f"{slug}.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")


def write_community_notes(graph, community_sets):
    for idx, members in enumerate(community_sets):
        lines = [f"# Community {idx}", ""]
        for member in sorted(members):
            lines.append(f"- [[{slugify(member)}|{member}]]")
        path = config.OBSIDIAN_VAULT_DIR / "communities" / f"community-{idx}.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("\n".join(lines), encoding="utf-8")


def write_index(graph, top_n: int = 30):
    degrees = sorted(graph.degree, key=lambda item: item[1], reverse=True)[:top_n]
    lines = ["# HubFlow Knowledge Graph — Index", "", "## Top entities", ""]
    for node, degree in degrees:
        lines.append(f"- [[entities/{slugify(node)}|{node}]] ({degree} connections)")
    path = config.OBSIDIAN_VAULT_DIR / "INDEX.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")


async def export(clean: bool):
    await rag_mod.get_rag()
    graph = rag_mod._load_graph()
    if graph is None:
        console.print("[yellow]No graph found yet — run kg-index first.[/yellow]")
        return

    if clean and config.OBSIDIAN_VAULT_DIR.exists():
        shutil.rmtree(config.OBSIDIAN_VAULT_DIR)

    config.OBSIDIAN_VAULT_DIR.mkdir(parents=True, exist_ok=True)

    for node in graph.nodes:
        write_entity_note(None, graph, node)

    community_sets = rag_mod.communities(seed=42)
    write_community_notes(graph, community_sets)
    write_index(graph)

    console.print(
        f"[green]Exported {graph.number_of_nodes()} entities, "
        f"{len(community_sets)} communities to {config.OBSIDIAN_VAULT_DIR}[/green]"
    )


def main():
    parser = argparse.ArgumentParser(prog="kg-to-obsidian")
    parser.add_argument("--clean", action="store_true")
    args = parser.parse_args()
    asyncio.run(export(clean=args.clean))


if __name__ == "__main__":
    main()
