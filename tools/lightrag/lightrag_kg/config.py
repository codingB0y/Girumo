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

# Subset focado: docs + core pages + components + lib + APIs + configs
# ~130 arquivos — viavel com free tier Gemini (~4-6h)
INCLUDE_GLOBS = [
    # Docs
    "*.md",
    "docs/**/*.md",
    # App pages & layouts (depth-limited)
    "apps/web/src/app/**/page.tsx",
    "apps/web/src/app/**/layout.tsx",
    # API routes
    "apps/web/src/app/api/**/*.ts",
    # Components
    "apps/web/src/components/**/*.tsx",
    # Lib/utils
    "apps/web/src/lib/**/*.ts",
    # Key configs
    "apps/web/package.json",
    "package.json",
]

EXCLUDE_DIRS = {
    "node_modules", ".next", "dist", "build", ".git", "target",
    "__pycache__", ".venv", "tests", "__tests__", "_generated",
    "tools/lightrag", "docs/knowledge-graph", "coverage", ".turbo",
    "nextjs-claude-code-starter",
}

EXCLUDE_SUFFIXES = {".lock", ".tsbuildinfo", ".log", ".png", ".jpg", ".svg", ".ico"}
