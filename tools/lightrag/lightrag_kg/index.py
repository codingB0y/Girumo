import argparse
import asyncio
import hashlib
import json
import re
from pathlib import Path

from rich.console import Console
from rich.table import Table

from . import config
from . import rag as rag_mod

console = Console()

LANG_BY_SUFFIX = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".md": "markdown",
    ".json": "json",
    ".sql": "sql",
    ".yml": "yaml",
    ".yaml": "yaml",
}


def slugify(text: str) -> str:
    text = text.strip().lower()
    text = re.sub(r"[/\\]", "-", text)
    text = re.sub(r"[^a-z0-9\s_-]", "", text)
    text = re.sub(r"\s+", "-", text)
    text = re.sub(r"-+", "-", text).strip("-_")
    return text[:180] if text else "unknown"


def doc_id_for(rel_path: str) -> str:
    return f"doc-{hashlib.sha1(rel_path.encode()).hexdigest()[:12]}"


def discover_files() -> list[Path]:
    found: dict[Path, None] = {}
    for pattern in config.INCLUDE_GLOBS:
        for path in config.REPO_ROOT.glob(pattern):
            if not path.is_file():
                continue
            rel = path.relative_to(config.REPO_ROOT)
            rel_str = str(rel).replace("\\", "/")

            if any(part in config.EXCLUDE_DIR_NAMES for part in rel.parts):
                continue
            if any(rel_str.startswith(prefix) for prefix in config.EXCLUDE_PATH_PREFIXES):
                continue
            if rel_str.endswith(config.EXCLUDE_SUFFIXES):
                continue

            found[path] = None
    return sorted(found.keys())


def load_file_list(list_path: Path) -> tuple[list[Path], list[str]]:
    found: list[Path] = []
    missing: list[str] = []
    for raw_line in list_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip().replace("\\", "/")
        if not line or line.startswith("#"):
            continue
        candidate = config.REPO_ROOT / line
        if candidate.is_file():
            found.append(candidate)
        else:
            missing.append(line)
    return found, missing


def load_manifest() -> dict:
    if config.MANIFEST_PATH.exists():
        with open(config.MANIFEST_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_manifest(manifest: dict):
    with open(config.MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)


def file_hash(path: Path) -> str:
    return hashlib.sha1(path.read_bytes()).hexdigest()[:16]


def plan(full: bool, candidates: "list[Path] | None" = None) -> list[Path]:
    files = candidates if candidates is not None else discover_files()
    if full:
        return files

    manifest = load_manifest()
    changed = []
    for path in files:
        rel_str = str(path.relative_to(config.REPO_ROOT)).replace("\\", "/")
        current_hash = file_hash(path)
        if manifest.get(rel_str) != current_hash:
            changed.append(path)
    return changed


async def run_index(full: bool, dry_run: bool, list_path: "Path | None" = None):
    candidates = None
    if list_path is not None:
        candidates, missing = load_file_list(list_path)
        if missing:
            console.print(f"[yellow]{len(missing)} path(s) from list not found (skipped):[/yellow]")
            for m in missing:
                console.print(f"  - {m}")

    target_files = plan(full, candidates=candidates)

    if dry_run:
        table = Table(title=f"kg-index plan ({'full' if full else 'incremental'})")
        table.add_column("File")
        for path in target_files[:200]:
            table.add_row(str(path.relative_to(config.REPO_ROOT)))
        console.print(table)
        console.print(f"[bold]Total files to index:[/bold] {len(target_files)}")
        return

    if not target_files:
        console.print("[yellow]No files to index (up to date).[/yellow]")
        return

    manifest = load_manifest()

    texts, ids, file_paths = [], [], []
    for path in target_files:
        rel = path.relative_to(config.REPO_ROOT)
        rel_str = str(rel).replace("\\", "/")
        lang = LANG_BY_SUFFIX.get(path.suffix, "text")
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        wrapped = f"FILE: {rel_str}\nLANG: {lang}\n---\n{content}"
        texts.append(wrapped)
        ids.append(doc_id_for(rel_str))
        file_paths.append(rel_str)
        manifest[rel_str] = file_hash(path)

    console.print(f"Indexing {len(texts)} file(s)...")
    await rag_mod.insert_batch(texts, ids=ids, file_paths=file_paths)
    save_manifest(manifest)
    console.print("[green]Done.[/green]")


def main():
    parser = argparse.ArgumentParser(prog="kg-index")
    parser.add_argument("--full", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--incremental", action="store_true")
    parser.add_argument("--list", type=str, default=None, help="Path to a file with one relative repo path per line")
    args = parser.parse_args()

    list_path = Path(args.list).resolve() if args.list else None
    asyncio.run(run_index(full=args.full, dry_run=args.dry_run, list_path=list_path))


if __name__ == "__main__":
    main()
