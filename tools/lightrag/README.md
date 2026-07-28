# LightRAG Knowledge Graph — HubFlow Platform

Grafo de conhecimento do monorepo, indexado com LightRAG (Gemini `gemini-2.5-flash` + `gemini-embedding-001`).

## Uso

```bash
source tools/lightrag/.venv/bin/activate

rag search "como funciona X"     # hybrid (síntese com citações)
rag ask    "explique Y"          # alias de search
rag local  "Z"                   # vizinhança de entidades
rag global "tema"                # comunidades/temas
rag chunks "termo"               # só vector search (sem síntese)

rag stats                        # contagem do grafo
rag top 20                       # top entidades conectadas
rag find   "Asaas"               # procura entidade por nome
rag show   "AsaasWebhook"        # detalhes completos + vizinhos

rag shell                        # REPL interativo

rag insert "decisão: usar Zod" --source chat-YYYY-MM-DD
rag mcp-check                    # valida .mcp.json + grafo

rag index  --incremental         # re-indexar modificados
rag index  --full                # rebuild total (usa tokens)
rag export --clean               # re-sync Obsidian (docs/knowledge-graph/)
```

Todo comando aceita `--json` pra output machine-readable.

## Manutenção

```bash
rag index                  # incremental (barato)
rag index --full           # rebuild total
rag export --clean         # re-sync Obsidian
```
