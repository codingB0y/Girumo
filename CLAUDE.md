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

### 🔴 RAG-FIRST (regra padrão — economiza contexto)

**Antes de abrir vários arquivos do projeto pra entender arquitetura, contexto,
decisões, ou "como funciona X" — SEMPRE consulte `kg_query` PRIMEIRO.**

Fluxo obrigatório:

1. Pergunta sobre o projeto (arquitetura, decisão, fluxo, "onde fica", "por que
   foi feito assim") → chame `kg_query(pergunta, mode)` antes de ler arquivos.
2. Se o grafo respondeu suficientemente → responda com base nisso. **Não abra
   arquivos-fonte só pra confirmar** o que o grafo já disse.
3. **Só gaste contexto lendo arquivos se:** (a) o grafo não tem a resposta / está
   incompleto, ou (b) você vai EDITAR o código (aí precisa do texto exato).
4. Escolha do `mode`: `global` pra visão geral/resumo, `local` pra um módulo
   específico, `hybrid` (default) pro resto.
5. Perfis do grafo (via `LIGHTRAG_PROFILE`): `tech` (código/infra/deploy),
   `product` (features/UX/roadmap), `business` (marca/marketing/concorrentes),
   `customer` (voz do cliente), `operations` (runbooks). A MCP tool `kg_query`
   consulta o perfil ativo — escolha o perfil pela natureza da pergunta.

Não rode `kg_query` "no automático" em toda abertura de sessão — cada consulta
gasta cota de embedding do Gemini (limite diário). Consulte sob demanda, quando
a pergunta realmente pedir contexto do projeto.

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
- Stores Supabase: **sempre** filtrar `.eq('tenant_id', ...)` — o service-role bypassa RLS,
  então esse filtro é a proteção real (ver "Isolamento multi-tenant" em Regras de segurança)
- Tailwind: usar classes utilitárias, evitar CSS custom
- Nomenclatura: `kebab-case` pra arquivos, `PascalCase` pra componentes, `camelCase` pra funções

## Regras de segurança

- Nunca commitar `.env.local`, secrets, ou tokens
- Validar inputs no server-side (API routes), não confiar apenas no client
- Usar `parameterized queries` via Supabase client (já faz por default)

### Isolamento multi-tenant: o filtro `.eq('tenant_id')` É a proteção — não o RLS

Verificado em prod em **06/08/2026** (contagem no código + `pg_policy`):

- **68 arquivos** usam `getSupabaseAdmin()` (service-role) contra **4** que usam
  `getSupabaseServerAnon()`. Service-role **bypassa RLS por design** — ou seja, na
  esmagadora maioria dos caminhos o banco **não** está te protegendo.
- O RLS existe e está ligado em **todas** as tabelas de `public` (zero com RLS desligado,
  nos dois bancos), mas funciona como **segunda linha de defesa**, exercida só nos poucos
  caminhos anon/authenticated.

**Consequência prática:** remover ou esquecer um `.eq('tenant_id')` numa store é vazamento
cross-tenant imediato — o RLS **não** vai te salvar. Toda query numa tabela com `tenant_id`
precisa do filtro explícito, mesmo parecendo redundante.

Ao criar tabela nova com `tenant_id`: ligar RLS + policy assim mesmo (defesa em
profundidade), mas nunca tratar isso como suficiente.

#### O RLS não é uniforme: 34 tabelas protegidas, 13 com policy que nunca avalia

Medido em prod em **22/08/2026** (`pg_policy` + definição dos helpers). A auditoria do
mesmo dia afirmou que "o RLS é inerte" — **isso está errado**, ela amostrou só as tabelas
com policy em GUC e generalizou. O quadro real das ~123 policies:

- **99 policies em 34 tabelas FUNCIONAM.** Usam `auth.uid()` + `memberships` via
  `app.has_membership()`, `app.user_tenant_ids()`, `app.has_role()` — todas
  `SECURITY DEFINER` com `search_path`, filtrando por `accepted_at is not null`.
  Esse é o padrão a copiar em policy nova.
- **13 policies NUNCA avaliam verdadeiro.** Dependem de coisa que o app não seta —
  `grep set_config` no repo volta vazio:
  - `current_setting('app.tenant_id')` → `automation_runs`, `group_grow_jobs`,
    `ig_accounts`, `ig_events`, `ig_triggers`, `lp_captures`, `lp_contacts`
  - `current_setting('app.workspace_id')` → `agents`, `decisions`, `knowledge`,
    `memories`, `missions`, `squads`
  - `current_setting('role') = 'service_role'` e claim `tenant_id` no JWT →
    `funnel_events`, `link_click_events`, `testimonials`

  **Não confie nelas.** Essas 13 tabelas são deny-all por acidente, não por desenho: se
  algum dia um caminho `authenticated` precisar delas, a policy vai negar tudo e a
  tentação vai ser "destravar" com `using (true)`. Reescreva no padrão `auth.uid()` +
  `memberships` em vez disso.

#### `anon` não tem privilégio nenhum em `public` — mantenha assim

Desde **22/08/2026** (PR do A.2). Antes disso `anon` e `authenticated` tinham os **sete**
privilégios em todas as tabelas — o default do Supabase. `anon` foi zerado: 0 tabelas,
0 funções, 0 sequências. `authenticated` foi **mantido de propósito**, porque é onde as
99 policies acima funcionam.

Duas coisas a saber antes de mexer:

- **Revogar de `anon` não basta para função.** O ACL delas começa com `=X/postgres`, que é
  EXECUTE para **PUBLIC** — `anon` executa herdando. Tem que revogar de `public` também.
- **Os default privileges do grantor `supabase_admin` são inalcançáveis** pela conexão que
  aplica migração (`current_user` = `postgres`, que não é membro dele). Quem segura tabela
  nova é o event trigger **`ensure_anon_revoked`** → `public.anon_revoke_on_new_object()`,
  irmão do `ensure_rls`. Ele revoga `anon` em tabela/sequência nova e revoga
  `anon, public` + concede `service_role` em função nova.

O app nunca leu dado por `anon`: os usos de `getSupabaseServerAnon`,
`getSupabaseAnonForToken`, do cliente de browser e do `middleware.ts` chamam só `.auth.*`
(schema `auth`, que a revogação não toca), e as rotas públicas `/p/[slug]` e `/r/[slug]`
leem via `getSupabaseAdmin` no servidor.

## Banco: são DOIS, e o diretório de migrações não é o schema

- **dev** `wfjuwogxaupyadwhvoxy` · **prod** `nidoatbxaylrkcgbszns`. Toda migração vai nos
  **dois**. Aplicar só em um cria drift silencioso — as API routes são dual-mode, então a
  ausência de tabela **não dá erro**: cai no fallback JSON e você valida em dev um caminho
  de código que **não é** o que roda em produção.
- **`apps/web/supabase/migrations/` NÃO é retrato do schema.** A maior parte foi aplicada
  à mão. A fonte de verdade da ordem é **`deploy/supabase/apply-order.txt`**.
- **Antes de criar migração, conferir por SQL se o objeto já existe** — e conferir também
  as **branches abertas**. Em 30/07 foi escrita uma migração de `leads`/`optouts` que já
  existia pronta e mais completa num PR da fila; foi descartada.
- Migração nova: `create ... if not exists`, `security definer` **sempre** com
  `set search_path`, e RLS ligado. Depois rodar o advisor de segurança do Supabase.

## Workflow preferido

- Antes de executar tarefas grandes, apresentar checklist com etapas
- Rodar build/lint após mudanças pra validar
- Commits atômicos com mensagens descritivas (feat/fix/refactor)

## Regra de PR (não-negociável)

> Escrita depois da drenagem de 30/07/2026, que fechou 13 PRs abertos. **5 dos 13 não
> tinham nada a entregar** — o trabalho já estava em `main` por outro caminho. Um fix de
> incidente real (varredura disparando para grupo de terceiro, ~31 mil pessoas fora da
> base) estava parado como *draft*. E um PR ficou tão atrás que virou 1798 arquivos de
> diff, impossível de recuperar — o código único dele foi perdido.

### Antes de começar

1. Checar a defasagem: `git fetch origin main && git log HEAD..origin/main --oneline | wc -l`.
   Mais de ~20 commits atrás → atualizar a branch **antes** de escrever código.
2. Base é sempre `main`. **Nunca** abrir branch em cima de outra branch de feature —
   mergear uma branch cuja base é outra feature não leva nada para `main`.

### Antes de resolver conflito ou "recuperar" PR antigo

```bash
git diff origin/main...origin/<branch> --stat
```

Vazio ou quase vazio = **o trabalho já está em `main`**. Fechar o PR com a evidência no
comentário ("já-entregue", não "descartado"). **Não resolver conflito de PR morto**: o
conflito costuma ser o PR tentando *criar* arquivos que já existem, e forçar o encaixe
sobrescreve a versão boa de `main` com uma antiga. Isso é regressão, não merge.

### Ao terminar

- Fechar o loop na **mesma sessão**: revisar → CI verde → mergear → deletar branch.
- Não deixar PR aberto "pra depois". Depois vira 187 commits atrás.
- **Draft não é estacionamento.** Pronto → tirar do draft e mergear. Não vai terminar
  hoje → dizer isso explicitamente ao encerrar, com o motivo.

### Escopo

Um PR = uma coisa. Passou de ~10 arquivos, provavelmente são dois PRs.

### Ao encerrar qualquer sessão

Reportar sempre: **"PRs que deixei abertos: #N (motivo)"** — ou "nenhum".

## Quadro de features (`/admin/quadro`)

O estado das features vive em `board_features` no Supabase de **produção**
(`nidoatbxaylrkcgbszns`) — o de dev é rascunho. Spec:
`docs/superpowers/specs/2026-08-12-quadro-scrumban-design.md`.

**Ao terminar qualquer feature ou PR, mova o card no mesmo passo** — em prod:

```sql
select public.move_card('<key>', '<status>', '<motivo>', '<PR #N ou arquivo>');
```

Status: `nao_existe` · `em_construcao` · `no_ar_nao_verificado` · `no_ar_verificado` · `quebrado`.
Não existe coluna "Feito" de propósito — era exatamente ela que deixava passar feature
mergeada que nunca funcionou.

**`no_ar_verificado` só com prova colhida na hora.** Mergeado não é verificado; rodando em
produção não é verificado. Verificado é ter olhado e visto funcionar. O banco recusa o
movimento sem prova (CHECK constraint), e a prova vence em 30 dias — depois disso o card
ganha selo de "verificação vencida" na tela.

O motivo é obrigatório: um trigger no banco escreve o feed de eventos sozinho, então não dá
pra mover um card e esquecer de registrar por quê.

Quando a feature estiver parada, escreva o motivo em `blocker` — é o campo que teria
mostrado "`invite_url` não tem UI" antes de virar incidente.

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

## Agent skills

### Issue tracker

Issues vivem no GitHub Issues (`codingB0y/Girumo`), operadas via CLI `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

Vocabulário padrão de cinco labels canônicas, sem renomeação. See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context — dois contextos (`apps/web`, `hubflow-engine`) com linguagens separadas; `packages/shared` é shared kernel. `hubflow-engine/DECISIONS.md` é vinculante. See `docs/agents/domain.md`.
