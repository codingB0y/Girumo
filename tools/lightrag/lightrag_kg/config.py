import os
from pathlib import Path

from dotenv import load_dotenv

PACKAGE_DIR = Path(__file__).resolve().parent
LIGHTRAG_DIR = PACKAGE_DIR.parent
REPO_ROOT = LIGHTRAG_DIR.parent.parent

load_dotenv(LIGHTRAG_DIR / ".env")

GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")

STORAGE_DIR = LIGHTRAG_DIR / "rag_storage"
MANIFEST_PATH = LIGHTRAG_DIR / ".index_manifest.json"
OBSIDIAN_VAULT_DIR = REPO_ROOT / "docs" / "knowledge-graph"

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
