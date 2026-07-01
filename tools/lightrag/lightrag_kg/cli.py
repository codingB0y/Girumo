import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

# Force UTF-8 output on Windows to avoid cp1252 encoding errors with rich
if sys.platform == "win32":
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")

from rich.console import Console
from rich.markdown import Markdown
from rich.table import Table

from . import config
from . import rag as rag_mod

console = Console(force_terminal=True)


async def cmd_search(args) -> None:
    answer = await rag_mod.query(args.term, mode=args.mode)
    if args.json:
        print(json.dumps({"mode": args.mode, "answer": answer}))
    else:
        console.print(Markdown(answer))


async def cmd_stats(args) -> None:
    info = await rag_mod.stats()
    if args.json:
        print(json.dumps(info, indent=2))
    else:
        table = Table(title="LightRAG stats")
        table.add_column("campo")
        table.add_column("valor")
        for k, v in info.items():
            table.add_row(k, str(v))
        console.print(table)


async def cmd_top(args) -> None:
    rag = await rag_mod.get_rag()
    graph = rag.chunk_entity_relation_graph
    nx_graph = await graph.get_graph() if hasattr(graph, "get_graph") else None
    if nx_graph is None:
        console.print("[red]Nao foi possivel ler o grafo.[/red]")
        return
    degrees = sorted(nx_graph.degree, key=lambda x: x[1], reverse=True)[: args.n]
    if args.json:
        print(json.dumps([{"entity": n, "degree": d} for n, d in degrees]))
        return
    table = Table(title=f"Top {args.n} entidades")
    table.add_column("Entidade")
    table.add_column("Conexoes")
    for n, d in degrees:
        table.add_row(str(n), str(d))
    console.print(table)


async def cmd_find(args) -> None:
    rag = await rag_mod.get_rag()
    graph = rag.chunk_entity_relation_graph
    nx_graph = await graph.get_graph() if hasattr(graph, "get_graph") else None
    matches = [n for n in nx_graph.nodes if args.entity.lower() in str(n).lower()] if nx_graph else []
    if args.json:
        print(json.dumps(matches))
    else:
        for m in matches:
            console.print(f"- {m}")


async def cmd_show(args) -> None:
    rag = await rag_mod.get_rag()
    graph = rag.chunk_entity_relation_graph
    nx_graph = await graph.get_graph() if hasattr(graph, "get_graph") else None
    if nx_graph is None or args.entity not in nx_graph.nodes:
        console.print(f"[red]Entidade '{args.entity}' nao encontrada.[/red]")
        return
    data = nx_graph.nodes[args.entity]
    neighbors = list(nx_graph.neighbors(args.entity))
    if args.json:
        print(json.dumps({"entity": args.entity, "data": dict(data), "neighbors": neighbors}))
        return
    console.print(f"[bold]{args.entity}[/bold]")
    console.print(data.get("description", ""))
    console.print("[bold]Vizinhos:[/bold]", ", ".join(neighbors) or "(nenhum)")


async def cmd_insert(args) -> None:
    await rag_mod.insert_text(args.text, source=args.source)
    console.print("[green]Inserido.[/green]")


async def cmd_shell(args) -> None:
    console.print("RAG shell -- /local /global /chunks /stats /top /find /show /exit")
    while True:
        try:
            line = input("rag> ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if not line or line == "/exit":
            break
        if line == "/stats":
            await cmd_stats(argparse.Namespace(json=False))
            continue
        if line.startswith("/local "):
            console.print(Markdown(await rag_mod.query(line[7:], mode="local")))
            continue
        if line.startswith("/global "):
            console.print(Markdown(await rag_mod.query(line[8:], mode="global")))
            continue
        console.print(Markdown(await rag_mod.query(line, mode="hybrid")))


def cmd_index(args) -> None:
    from . import index as index_mod

    sys.argv = ["kg-index"] + (["--full"] if args.full else []) + (
        ["--dry-run"] if args.dry_run else []
    ) + (["--incremental"] if args.incremental else [])
    index_mod.main()


def cmd_export(args) -> None:
    from . import to_obsidian

    sys.argv = ["kg-to-obsidian"] + (["--clean"] if args.clean else [])
    to_obsidian.main()


def cmd_mcp_check(args) -> None:
    mcp_path = config.REPO_ROOT / ".mcp.json"
    ok = True
    if not mcp_path.exists():
        console.print("[red][X] .mcp.json nao encontrado[/red]")
        ok = False
    else:
        data = json.loads(mcp_path.read_text(encoding="utf-8"))
        entry = data.get("mcpServers", {}).get("lightrag")
        if not entry:
            console.print("[red][X] entry 'lightrag' nao encontrada em .mcp.json[/red]")
            ok = False
        else:
            console.print("[green][OK] .mcp.json tem entry 'lightrag'[/green]")
            project_arg = entry.get("args", [])
            pkg_dir_str = str(config.PACKAGE_DIR).replace("\\", "/")
            if any(pkg_dir_str in a.replace("\\", "/") for a in project_arg):
                console.print("[green][OK] caminho absoluto correto[/green]")
            else:
                console.print("[red][X] caminho do --project nao aponta para tools/lightrag[/red]")
                ok = False
    try:
        from . import server  # noqa: F401

        console.print("[green][OK] lightrag_kg.server importa sem erro[/green]")
    except Exception as exc:
        console.print(f"[red][X] falha ao importar server: {exc}[/red]")
        ok = False
    if not ok:
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(prog="rag")
    parser.add_argument("--json", action="store_true")
    sub = parser.add_subparsers(dest="cmd", required=True)

    for name, mode in [("search", "hybrid"), ("ask", "hybrid"), ("chunks", "naive"),
                        ("local", "local"), ("global", "global")]:
        sp = sub.add_parser(name)
        sp.add_argument("term", nargs="+")
        sp.set_defaults(func=cmd_search, mode=mode)

    sp = sub.add_parser("stats")
    sp.set_defaults(func=cmd_stats)

    sp = sub.add_parser("top")
    sp.add_argument("n", nargs="?", type=int, default=20)
    sp.set_defaults(func=cmd_top)

    sp = sub.add_parser("find")
    sp.add_argument("entity")
    sp.set_defaults(func=cmd_find)

    sp = sub.add_parser("show")
    sp.add_argument("entity")
    sp.set_defaults(func=cmd_show)

    sp = sub.add_parser("insert")
    sp.add_argument("text")
    sp.add_argument("--source", default="manual")
    sp.set_defaults(func=cmd_insert)

    sp = sub.add_parser("shell")
    sp.set_defaults(func=cmd_shell)

    sp = sub.add_parser("index")
    sp.add_argument("--full", action="store_true")
    sp.add_argument("--dry-run", action="store_true")
    sp.add_argument("--incremental", action="store_true")
    sp.set_defaults(func=None, sync_func=cmd_index)

    sp = sub.add_parser("export")
    sp.add_argument("--clean", action="store_true")
    sp.set_defaults(func=None, sync_func=cmd_export)

    sp = sub.add_parser("mcp-check")
    sp.set_defaults(func=None, sync_func=cmd_mcp_check)

    args = parser.parse_args()
    if hasattr(args, "term"):
        args.term = " ".join(args.term)

    if getattr(args, "func", None) is not None:
        asyncio.run(args.func(args))
    else:
        args.sync_func(args)


if __name__ == "__main__":
    main()
