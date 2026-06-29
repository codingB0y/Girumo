# LightRAG knowledge graph — HubFlow-platform

Pipeline de grafo de conhecimento sobre o monorepo, integrado ao Claude Code via MCP e exportável para Obsidian.

## Uso rápido

```bash
source tools/lightrag/.venv/bin/activate   # ou .venv\Scripts\activate no Windows
rag search "como funciona X"
rag stats
rag index --incremental
rag export --clean
```

Ver `RAG_INIT.md` na raiz do repo para o setup completo.
