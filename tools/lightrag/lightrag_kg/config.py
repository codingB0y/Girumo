import os
from pathlib import Path

from dotenv import load_dotenv

PACKAGE_DIR = Path(__file__).resolve().parent
LIGHTRAG_DIR = PACKAGE_DIR.parent
REPO_ROOT = LIGHTRAG_DIR.parent.parent

# Onde vivem os dados (rag_storage, manifests, .env). Por padrao, ao lado do codigo.
# O indice noturno roda o codigo de um worktree sempre em origin/main
# (scripts/nightly-index.ps1) mas grava no storage do checkout principal, que e
# onde o grafo ja existe — sem isto cada checkout teria um grafo proprio.
DATA_DIR = Path(os.environ.get("LIGHTRAG_DATA_DIR") or LIGHTRAG_DIR)

load_dotenv(DATA_DIR / ".env")

GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")

# Active profile — set via LIGHTRAG_PROFILE env var (default "tech").
# Each profile has its own storage, manifest and Obsidian vault subfolder,
# so contexts (tech / code / business / product / customer / operations) never mix.
# NOTE: `tech` = docs de infra/deploy/arquitetura (curados); `code` = código-fonte
# da aplicação (apps/web/src + hubflow-engine), lista em index-lists/code-files.txt.
PROFILE = os.environ.get("LIGHTRAG_PROFILE", "tech").strip() or "tech"

STORAGE_DIR = DATA_DIR / "rag_storage" / PROFILE
MANIFEST_PATH = DATA_DIR / f".index_manifest-{PROFILE}.json"
OBSIDIAN_VAULT_DIR = REPO_ROOT / "docs" / "knowledge-graph" / PROFILE

LLM_MODEL_PRIMARY = "gemini-flash-lite-latest"
LLM_MODEL_FALLBACK = "gemini-flash-latest"
EMBEDDING_MODEL_PRIMARY = "gemini-embedding-001"
EMBEDDING_MODEL_FALLBACK = "text-embedding-004"
EMBEDDING_DIM = 3072

# Descoberta sem `--list` (o `rag index` incremental) — só docs e infra.
# Código-fonte fica no perfil `code`, por lista explícita: em 02/10/2026 o `tech`
# tinha 591 arquivos de apps/web/src indexados de novo, pagando duas vezes pelo
# mesmo código.
INCLUDE_GLOBS = [
    "*.md",
    "docs/**/*.md",
    "deploy/**/*.md",
    "deploy/**/*.yml",
    "infra/**/*.md",
    "infra/**/*.sql",
    "hubflow-engine/**/*.md",
]

EXCLUDE_DIR_NAMES = {
    "node_modules",
    ".next",
    "dist",
    "build",
    ".git",
    "__tests__",
    "tests",
    ".venv",
    ".worktrees",
    "knowledge-graph",
}

EXCLUDE_PATH_PREFIXES = [
    "tools/lightrag",
    "docs/knowledge-graph",
]

EXCLUDE_SUFFIXES = (".lock", ".tsbuildinfo")
