# LightRAG — Status & Runbook

> Última atualização: 2026-07-10. Documento de retomada — leia antes de rodar qualquer indexação.

## Estado atual

- **Perfil:** nenhum (grafo **único**, será o futuro perfil `tech`).
- **Pacote/CLI:** `tools/lightrag/` (venv isolado, comando `rag`). **Não** é `.lightrag/`.
- **Storage:** `tools/lightrag/rag_storage/` (gitignored).
- **Manifest:** `tools/lightrag/.index_manifest.json` (gitignored).
- **Vault Obsidian:** `docs/knowledge-graph/` — estrutura nativa `entities/`, `communities/`, `INDEX.md` (versionado).
- **Modelos:** `gemini-flash-lite-latest` (LLM) + `gemini-embedding-001` (embedding, dim 3072).
- **Grafo:** ~28-29 docs · **289 entidades · 382 relações · 28 comunidades**.

## Restrições aprendidas (IMPORTANTE — não repetir os erros)

1. **Free tier tem teto diário (provável RPD).** Após várias rodadas hoje, embedding/LLM passaram a devolver `429 RESOURCE_EXHAUSTED`. Confirmar limites reais no dashboard do Google AI Studio antes de assumir que "resetou".
2. **Timeout rígido de 60s no embedding worker do LightRAG.** Arquivos grandes (ex: `infra/dev-setup/03_rls_policies.sql`, `infra/migrations/202607010001_groups_broadcasts_schedules.sql`) estouram esse limite no free tier e **cancelam o lote inteiro** junto. Isolar arquivos grandes em listas próprias.
3. **Concorrência = 1.** `rag.py` está com `max_parallel_insert=1` / `llm_model_max_async=2` + throttle de ~4.5s/chamada em `llm.py`. Não aumentar no free tier — foi o que estabilizou a indexação.
4. **Nunca rodar 2 indexações em paralelo** no mesmo storage → `PermissionError` no `kv_store_doc_status.json`. Sempre sequencial.
5. **Não rodar `rag search` enquanto uma indexação roda** — competem pela mesma quota e a busca falha.
6. **Solução definitiva:** ativar billing (Cloud Billing / Tier 1) libera os modelos padrão e concorrência alta; custo real de indexar o projeto todo é <US$ 1.

## Pendente

- **`auth-sessao.txt`** (9 arquivos) — **0 indexados** hoje (bloqueado por quota). Lista pronta em `tools/lightrag/index-lists/auth-sessao.txt`.
- 7 arquivos da TECH Lite que faltaram (READMEs de subpasta + 2 SQLs grandes) — listas em `index-lists/tech-lite-retry*.txt`.

## Próximo comando (amanhã, após reset da quota)

```bash
cd tools/lightrag
uv run rag stats                                              # confirmar quota OK (não deve dar 429)
uv run rag index --list index-lists/auth-sessao.txt --full   # indexar auth (9 arquivos)
uv run rag export --clean                                     # atualizar Obsidian
```

Se der `429` já no `rag stats`, a quota ainda não resetou — esperar ou ativar billing.

## Estrutura futura por perfis (DESENHO — não implementado)

Ideia: separar em grafos independentes por contexto, para não poluir o retrieval.

| Perfil | Escopo |
|---|---|
| `tech` | código, banco, APIs, Supabase, RLS, deploy, auth, billing, engine |
| `product` | visão de produto, regras de negócio, jornadas, UX, roadmap |
| `business` | oferta, concorrentes, público, posicionamento, marketing, pricing, funil |
| `customer` | onboarding, suporte, sucesso do cliente, objeções, playbooks |
| `operations` | runbooks, checklists, go/no-go, incidentes, decisões |

Cada perfil teria: `rag_storage/<perfil>/`, `.index_manifest-<perfil>.json`, `docs/knowledge-graph/<perfil>/`, lista `index-lists/<perfil>-files.txt`, e o CLI/MCP ganhariam `--profile`.

**Decisão registrada:** NÃO scaffoldar os 5 agora. Motivos: (a) 5 grafos = 5× a dor de quota do free tier; (b) a maioria dos docs de business/customer/product **ainda não existe**. Criar cada perfil só quando houver conteúdo real. Antes de migrar `rag_storage/` para `rag_storage/tech/`, **fazer backup** da pasta.

**Ajuste de gitignore ao criar perfis:** trocar `.index_manifest.json` por `.index_manifest*.json` em `tools/lightrag/.gitignore`.
