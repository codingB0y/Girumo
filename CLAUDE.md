# CLAUDE.md — HubFlow Platform

Instruções persistentes para o Claude Code neste projeto.

## Stack

- **Frontend:** Next.js 15 (App Router) + React 19 + Tailwind CSS
- **Backend:** Supabase (Auth, Postgres com RLS, Edge Functions) + Express engine
- **Pagamentos:** Stripe (multi-tenant)
- **Monorepo:** npm workspaces — `apps/web`, `hubflow-engine`
- **Infra:** Deploy via Vercel/Coolify, scripts em PowerShell

## Knowledge Graph (LightRAG)

Este projeto tem um grafo de conhecimento em `tools/lightrag/`.

### Antes de propor mudanças arquiteturais:

1. Consulte `kg_query` com a pergunta relevante
2. Se o grafo tiver uma decisão registrada sobre o tema, respeite-a ou peça confirmação antes de mudar
3. Após implementar algo significativo, sugira ao usuário registrar a decisão:
   ```
   rag insert "decisão: ..." --source decisao-YYYY-MM-DD
   ```

### MCP Tools disponíveis:

- `kg_query(question, mode)` — consulta o grafo (modes: hybrid, local, global, naive)
- `kg_insert_text(text, source)` — insere decisão/contexto ad-hoc
- `kg_stats()` — contagem de entidades/relações

## Convenções de código

- TypeScript strict, imports com `@/` alias
- Componentes em `src/components/`, páginas em `src/app/`
- API routes em `src/app/api/` — dual-mode (Supabase + JSON fallback)
- Stores Supabase com RLS por tenant — nunca bypassar RLS sem motivo explícito
- Tailwind: usar classes utilitárias, evitar CSS custom
- Nomenclatura: `kebab-case` pra arquivos, `PascalCase` pra componentes, `camelCase` pra funções

## Regras de segurança

- Nunca commitar `.env.local`, secrets, ou tokens
- Supabase RLS é a camada primária de isolamento multi-tenant
- Validar inputs no server-side (API routes), não confiar apenas no client
- Usar `parameterized queries` via Supabase client (já faz por default)

## Workflow preferido

- Antes de executar tarefas grandes, apresentar checklist com etapas
- Rodar build/lint após mudanças pra validar
- Commits atômicos com mensagens descritivas (feat/fix/refactor)

## Comandos rápidos (diga isso no chat)

### /kg
Quando eu disser `/kg`:
1. Rode `kg_stats` pra ver o tamanho do grafo
2. Rode `kg_query("resumo geral do sistema e módulos principais", mode="global")`
3. Mostre top 10 entidades mais conectadas
4. Liste decisões arquiteturais registradas

### /review
Quando eu disser `/review`:
1. Rode `npm run web:lint`
2. Leia `git diff` vs main
3. Consulte `kg_query` pra verificar se alguma mudança contradiz decisões
4. Liste problemas com severidade (critical/warning/info)
5. Sugira fixes

### /decide <texto>
Quando eu disser `/decide <texto>`:
1. Insira no grafo via `kg_insert_text(texto, source="decisao-YYYY-MM-DD")`
2. Confirme o que foi inserido
3. Sugira `rag export --clean` se relevante pro Obsidian

### /map <módulo>
Quando eu disser `/map <módulo>`:
1. Rode `kg_query("como funciona <módulo>, quais componentes, fluxo de dados", mode="local")`
2. Liste arquivos envolvidos
3. Mostre diagrama simplificado do fluxo

### /status
Quando eu disser `/status`:
1. Rode `kg_stats`
2. Mostre git status resumido
3. Liste TODOs/FIXMEs no código (`grep -r`)
4. Verifique se build passa

## Comandos úteis (terminal)

```bash
npm run web:dev          # dev server
npm run web:build        # build production
npm run web:lint         # eslint

# Knowledge Graph
source tools/lightrag/.venv/bin/activate
rag search "como funciona X"    # consulta hybrid
rag stats                       # contagem do grafo
rag index --incremental         # re-indexar modificados
rag export --clean              # sync Obsidian vault
```

## Decisões registradas

Decisões arquiteturais ficam no grafo (`rag insert`). Consulte antes de contradizer.
Exemplos de temas já decididos (consulte `kg_query` pra detalhes):

- Supabase RLS como isolamento multi-tenant (não middleware custom)
- Dual-mode API routes (Supabase stores + JSON fallback pra dev local)
- Módulo mensagens com scheduling via Supabase (não Agenda.js)
- 22 agentes AI especializados em `apps/web/src/lib/agents/`
