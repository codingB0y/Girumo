import os
from pathlib import Path

from dotenv import load_dotenv

PACKAGE_DIR = Path(__file__).resolve().parent
LIGHTRAG_DIR = PACKAGE_DIR.parent
REPO_ROOT = LIGHTRAG_DIR.parent.parent

load_dotenv(LIGHTRAG_DIR / ".env")

GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")

# Active profile — set via LIGHTRAG_PROFILE env var (default "tech").
# Each profile has its own storage, manifest and Obsidian vault subfolder,
# so contexts (tech / business / product / customer / operations) never mix.
PROFILE = os.environ.get("LIGHTRAG_PROFILE", "tech").strip() or "tech"

STORAGE_DIR = LIGHTRAG_DIR / "rag_storage" / PROFILE
MANIFEST_PATH = LIGHTRAG_DIR / f".index_manifest-{PROFILE}.json"
OBSIDIAN_VAULT_DIR = REPO_ROOT / "docs" / "knowledge-graph" / PROFILE

LLM_MODEL_PRIMARY = "gemini-flash-lite-latest"
LLM_MODEL_FALLBACK = "gemini-flash-latest"
EMBEDDING_MODEL_PRIMARY = "gemini-embedding-001"
EMBEDDING_MODEL_FALLBACK = "text-embedding-004"
EMBEDDING_DIM = 3072

INCLUDE_GLOBS = [
    "apps/web/src/**/*.ts",
    "apps/web/src/**/*.tsx",
    "hubflow-engine/**/*.js",
    "*.md",
    "docs/**/*.md",
    "apps/web/package.json",
    "package.json",
    "hubflow-engine/package.json",
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
