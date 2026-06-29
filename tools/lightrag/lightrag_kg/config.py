import os
from pathlib import Path

from dotenv import load_dotenv

PACKAGE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(PACKAGE_DIR / ".env.local")

REPO_ROOT = PACKAGE_DIR.parent.parent

WORKING_DIR = PACKAGE_DIR / "rag_storage"
MANIFEST_PATH = PACKAGE_DIR / ".index_manifest.json"
OBSIDIAN_VAULT_DIR = REPO_ROOT / "docs" / "knowledge-graph"

PROVIDER = "gemini"
LLM_MODEL = "gemini-2.5-flash"
LLM_MODEL_FALLBACK = "gemini-1.5-flash"
EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_MODEL_FALLBACK = "text-embedding-004"
EMBEDDING_DIM = 3072

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

INCLUDE_GLOBS = [
    "apps/web/src/**/*.ts",
    "apps/web/src/**/*.tsx",
    "apps/web/src/**/*.js",
    "apps/web/src/**/*.jsx",
    "hubflow-groups/**/*.ts",
    "hubflow-groups/**/*.tsx",
    "hubflow-engine/**/*.ts",
    "hubflow-engine/**/*.tsx",
    "hubflow-engine/**/*.js",
    "*.md",
    "docs/**/*.md",
    "apps/**/README.md",
    "apps/**/package.json",
    "hubflow-groups/README.md",
    "hubflow-groups/package.json",
    "hubflow-engine/README.md",
    "hubflow-engine/package.json",
    "deploy/**/README.md",
    "Brand/**/README.md",
    "Brand-v2/**/README.md",
    "tools/lightrag/pyproject.toml",
]

EXCLUDE_DIRS = {
    "node_modules", ".next", "dist", "build", ".git", "target",
    "__pycache__", ".venv", "tests", "__tests__", "_generated",
    "tools/lightrag", "docs/knowledge-graph", "coverage", ".turbo",
}

EXCLUDE_SUFFIXES = {".lock", ".tsbuildinfo", ".log", ".png", ".jpg", ".svg", ".ico"}
