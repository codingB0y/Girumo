import argparse
import asyncio
import json as json_mod

from rich.console import Console
from rich.markdown import Markdown
from rich.table import Table

from . import config
from . import index as index_mod
from . import rag as rag_mod
from . import to_obsidian as to_obsidian_mod

console = Console()


async def cmd_search(args):
    answer = await rag_mod.query(args.term, mode=args.mode)
    if answer is None:
        answer = "[sem resposta — o embedding da query falhou (provavelmente quota diária do free tier esgotada). Tente novamente mais tarde ou ative billing.]"
    if args.json:
        print(json_mod.dumps({"mode": args.mode, "answer": answer}))
    else:
        console.print(Markdown(answer))


async def cmd_stats(args):
    info = await rag_mod.stats()
    if args.json:
        print(json_mod.dumps(info, indent=2))
    else:
        table = Table(title="LightRAG stats")
        table.add_column("Key")
        table.add_column("Value")
        for k, v in info.items():
            table.add_row(k, str(v))
        console.print(table)


async def cmd_top(args):
    await rag_mod.get_rag()
    entries = rag_mod.top_entities(args.n)
    if args.json:
        print(json_mod.dumps(entries))
    else:
        table = Table(title=f"Top {args.n} entities")
        table.add_column("Entity")
        table.add_column("Degree")
        for name, degree in entries:
            table.add_row(str(name), str(degree))
        console.print(table)


async def cmd_find(args):
    await rag_mod.get_rag()
    matches = rag_mod.find_entity(args.term)
    if args.json:
        print(json_mod.dumps(matches))
    else:
        for m in matches:
            console.print(f"- {m}")
        if not matches:
            console.print("[yellow]No matches.[/yellow]")


async def cmd_show(args):
    await rag_mod.get_rag()
    entity = rag_mod.show_entity(args.term)
    if args.json:
        print(json_mod.dumps(entity))
    else:
        if not entity:
            console.print("[yellow]Entity not found.[/yellow]")
            return
        console.print(f"[bold]{entity['name']}[/bold]")
        for k, v in entity["data"].items():
            console.print(f"  {k}: {v}")
        console.print(f"  neighbors: {', '.join(entity['neighbors'])}")


async def cmd_index(args):
    from pathlib import Path
    list_path = Path(args.list).resolve() if getattr(args, "list", None) else None
    await index_mod.run_index(full=args.full, dry_run=args.dry_run, list_path=list_path)


async def cmd_export(args):
    await to_obsidian_mod.export(clean=args.clean)


async def cmd_insert(args):
    await rag_mod.insert_text(args.term, source=args.source)
    console.print(f"[green]Inserted ({args.source})[/green]")


async def cmd_shell(args):
    console.print("[bold]rag shell[/bold] — /local /global /chunks /stats /top /find /show /exit")
    while True:
        try:
            line = input("rag> ").strip()
        except EOFError:
            break
        if not line:
            continue
        if line in ("/exit", "exit", "quit"):
            break
        if line == "/stats":
            info = await rag_mod.stats()
            console.print(info)
            continue
        for prefix, mode in (("/local ", "local"), ("/global ", "global"), ("/chunks ", "naive")):
            if line.startswith(prefix):
                answer = await rag_mod.query(line[len(prefix):], mode=mode)
                console.print(Markdown(answer))
                break
        else:
            if line.startswith("/top"):
                parts = line.split()
                n = int(parts[1]) if len(parts) > 1 else 20
                for name, degree in rag_mod.top_entities(n):
                    console.print(f"- {name} ({degree})")
            elif line.startswith("/find "):
                for m in rag_mod.find_entity(line[len("/find "):]):
                    console.print(f"- {m}")
            elif line.startswith("/show "):
                entity = rag_mod.show_entity(line[len("/show "):])
                console.print(entity or "[yellow]Not found[/yellow]")
            else:
                answer = await rag_mod.query(line, mode="hybrid")
                console.print(Markdown(answer))


def cmd_mcp_check(args):
    mcp_json_path = config.REPO_ROOT / ".mcp.json"
    ok_file = mcp_json_path.exists()
    console.print(f"[{'green' if ok_file else 'red'}]{'[OK]' if ok_file else '[FAIL]'}[/] .mcp.json exists")

    entry_ok = False
    if ok_file:
        data = json_mod.loads(mcp_json_path.read_text(encoding="utf-8"))
        entry = data.get("mcpServers", {}).get("lightrag")
        entry_ok = bool(entry and str(config.LIGHTRAG_DIR).replace("\\", "/") in " ".join(entry.get("args", [])).replace("\\", "/"))
    console.print(f"[{'green' if entry_ok else 'red'}]{'[OK]' if entry_ok else '[FAIL]'}[/] lightrag entry points to {config.LIGHTRAG_DIR}")

    import_ok = True
    try:
        import lightrag_kg.server  # noqa: F401
    except Exception as exc:
        import_ok = False
        console.print(f"[red]Import error: {exc}[/red]")
    console.print(f"[{'green' if import_ok else 'red'}]{'[OK]' if import_ok else '[FAIL]'}[/] lightrag_kg.server imports cleanly")


def main():
    parser = argparse.ArgumentParser(prog="rag")
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    sub = parser.add_subparsers(dest="cmd", required=True)

    for name, mode in (("search", "hybrid"), ("ask", "hybrid"), ("chunks", "naive"), ("local", "local"), ("global", "global")):
        sp = sub.add_parser(name)
        sp.add_argument("term", nargs="+")
        sp.set_defaults(func=cmd_search, mode=mode)

    sp = sub.add_parser("stats")
    sp.set_defaults(func=cmd_stats)

    sp = sub.add_parser("top")
    sp.add_argument("n", nargs="?", type=int, default=20)
    sp.set_defaults(func=cmd_top)

    sp = sub.add_parser("find")
    sp.add_argument("term", nargs="+")
    sp.set_defaults(func=cmd_find)

    sp = sub.add_parser("show")
    sp.add_argument("term", nargs="+")
    sp.set_defaults(func=cmd_show)

    sp = sub.add_parser("index")
    sp.add_argument("--full", action="store_true")
    sp.add_argument("--dry-run", action="store_true")
    sp.add_argument("--incremental", action="store_true")
    sp.add_argument("--list", type=str, default=None)
    sp.set_defaults(func=cmd_index)

    sp = sub.add_parser("export")
    sp.add_argument("--clean", action="store_true")
    sp.set_defaults(func=cmd_export)

    sp = sub.add_parser("insert")
    sp.add_argument("term", nargs="+")
    sp.add_argument("--source", default="manual")
    sp.set_defaults(func=cmd_insert)

    sp = sub.add_parser("shell")
    sp.set_defaults(func=cmd_shell)

    sp = sub.add_parser("mcp-check")
    sp.set_defaults(func=cmd_mcp_check, sync=True)

    args = parser.parse_args()
    if hasattr(args, "term"):
        args.term = " ".join(args.term)

    if getattr(args, "sync", False):
        args.func(args)
    else:
        asyncio.run(args.func(args))


if __name__ == "__main__":
    main()
