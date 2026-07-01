import argparse
import asyncio
import hashlib
import json
import re
from pathlib import Path

from rich.console import Console

from . import config
from .rag import get_rag

console = Console()

LANG_BY_SUFFIX = {
    ".ts": "typescript", ".tsx": "typescript", ".js": "javascript", ".jsx": "javascript",
    ".py": "python", ".md": "markdown", ".json": "json", ".toml": "toml",
}


def slugify(text: str) -> str:
    text = text.strip().lower()
    text = re.sub(r"[/\\]", "-", text)
    text = re.sub(r"[^a-z0-9\s_-]", "", text)
    text = re.sub(r"\s+", "-", text)
    text = re.sub(r"-+", "-", text).strip("-_")
    return text[:180] if text else "unknown"


def _excluded(path: Path) -> bool:
    parts = set(path.parts)
    if parts & config.EXCLUDE_DIRS:
        return True
    if path.suffix in config.EXCLUDE_SUFFIXES:
        return True
    return False


def discover_files() -> list[Path]:
    seen: set[Path] = set()
    for pattern in config.INCLUDE_GLOBS:
        for path in config.REPO_ROOT.glob(pattern):
            if path.is_file() and not _excluded(path.relative_to(config.REPO_ROOT)):
                seen.add(path)
    return sorted(seen)


def load_manifest() -> dict:
    if config.MANIFEST_PATH.exists():
        return json.loads(config.MANIFEST_PATH.read_text(encoding="utf-8"))
    return {}


def save_manifest(manifest: dict) -> None:
    config.MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def file_hash(data: bytes) -> str:
    return hashlib.sha1(data).hexdigest()[:16]


def doc_id(rel_path: str) -> str:
    return f"doc-{hashlib.sha1(rel_path.encode()).hexdigest()[:12]}"


def path_as_filename(rel_path: str) -> str:
    """Convert a relative path to a flat filename that LightRAG won't deduplicate.

    LightRAG's normalize_document_file_path extracts the basename (after last /),
    so 'apps/web/src/page.tsx' and 'apps/web/admin/page.tsx' both become 'page.tsx'
    and get deduplicated. By replacing / with -- we keep them unique.
    Example: 'apps/web/src/app/leads/page.tsx' -> 'apps--web--src--app--leads--page.tsx'
    """
    return rel_path.replace("/", "--")


async def run_index(full: bool, dry_run: bool) -> None:
    files = discover_files()
    manifest = {} if full else load_manifest()
    new_manifest = {} if full else dict(manifest)

    to_index: list[tuple[Path, str, bytes]] = []
    for path in files:
        rel = str(path.relative_to(config.REPO_ROOT)).replace("\\", "/")
        data = path.read_bytes()
        h = file_hash(data)
        if not full and manifest.get(rel) == h:
            continue
        to_index.append((path, rel, data))
        new_manifest[rel] = h

    console.print(f"[bold]Plano:[/bold] {len(files)} arquivos encontrados, {len(to_index)} a indexar.")
    if dry_run:
        for _, rel, _ in to_index[:30]:
            console.print(f"  + {rel}")
        if len(to_index) > 30:
            console.print(f"  ... e mais {len(to_index) - 30}")
        return

    if not to_index:
        console.print("[green]Nada a indexar (tudo atualizado).[/green]")
        return

    texts, ids, file_paths = [], [], []
    for path, rel, data in to_index:
        lang = LANG_BY_SUFFIX.get(path.suffix, "text")
        try:
            content = data.decode("utf-8")
        except UnicodeDecodeError:
            continue
        wrapped = f"FILE: {rel}\nLANG: {lang}\n---\n{content}"
        texts.append(wrapped)
        ids.append(doc_id(rel))
        # Use flat filename so LightRAG doesn't deduplicate by basename
        file_paths.append(path_as_filename(rel))

    rag = await get_rag()
    batch_size = 5  # small batches for free tier rate limits
    total = len(texts)
    for i in range(0, total, batch_size):
        batch_texts = texts[i : i + batch_size]
        batch_ids = ids[i : i + batch_size]
        batch_paths = file_paths[i : i + batch_size]
        try:
            await rag.ainsert(batch_texts, ids=batch_ids, file_paths=batch_paths)
        except Exception as exc:
            if "already exists" not in str(exc).lower():
                console.print(f"[red]Falha no batch {i}: {exc}[/red]")
        console.print(f"  processed={min(i + batch_size, total)}/{total}")

    save_manifest(new_manifest)
    console.print(f"[green]Indexacao concluida: {len(texts)} documentos.[/green]")


def main() -> None:
    parser = argparse.ArgumentParser(prog="kg-index")
    parser.add_argument("--full", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--incremental", action="store_true")
    args = parser.parse_args()
    asyncio.run(run_index(full=args.full, dry_run=args.dry_run))


if __name__ == "__main__":
    main()
