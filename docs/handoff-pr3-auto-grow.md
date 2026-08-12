# Handoff — PR-3: religar o auto-grow (D3-B)

> Escrito em 11/08/2026 ao fim da sessão de decisão. É pra ser colado inteiro numa
> sessão nova. O plano completo está em `plano-grupos-campanhas-2026-08-10.md`.

## Antes de qualquer coisa

O diagnóstico e as decisões JÁ ESTÃO REGISTRADOS — não re-explore o repo:

- `docs/plano-grupos-campanhas-2026-08-10.md` (§7 tem o adendo com o estado verificado)
- memória persistente: `finding-grupos-campanhas-3-buracos`
- grafo: `kg_query("decisao-2026-08-11")` se precisar de detalhe

Confira o estado dos PRs antes de começar (podem já ter sido mergeados):
**#82** (higiene), **#86** (grupos balcão), **#88** (esconder toggle auto-grow),
**#83** (docs — este arquivo veio nele).

## Decisões já tomadas — não re-litigar

- **Auto-grow via engine Baileys (D3-B)**, não via Evolution. Igor confirmou que o
  Baileys segue de pé pelos próximos 1-2 meses; o cutover NÃO é iminente.
- **A fila nasce agnóstica de executor** — nada de coluna ou nome "baileys". Quando o
  cutover acontecer, troca-se só quem consome.
- D1 (ponte `campaign_messages` → `broadcasts`), D2 (`/r/` no Supabase) e D5 (métricas
  honestas) **já foram entregues**. Não mexer.

## O que construir

1. **Migração**: tabela de fila de jobs de grow (`tenant_id`, campanha/grupo de origem,
   template, status, tentativas, timestamps). Idempotente.
2. `apps/web/src/lib/group-grow-store.ts` — hoje é JSON-only; ganhar ramo Supabase.
3. Wizard (`components/painel/campaign-config.tsx`) passa a gravar
   `growTemplate.subjectPattern` (o `{n}` da numeração; o preset de Objetivo já sugere o
   nome). **Reexibir o toggle e o `ToggleInline`** que o #88 escondeu — estão no git, é
   só recuperar do commit dele.
4. `api/groups/grow/pending` e `api/groups/grow/ack` (já existem) passam a ler/escrever
   a fila.
5. O executor Baileys (`hubflow-engine/index.js:496-557`) consome sem alteração — ele já
   cria grupo, descrição, announcement, foto e pega o `groupInviteCode`, com
   `group-guard` de 2/10min.

## Regras invioláveis

- **Anti-ban: automação de lojista só posta em grupo, NUNCA DM.** Não criar caminho novo.
- **Só grupos admin** entram em sync/disparo/captura — o filtro `is_admin` é deliberado.
- **`.eq('tenant_id')` É a proteção** (68 arquivos usam service-role, que bypassa RLS).
  Toda query em tabela com `tenant_id` leva o filtro explícito.
- **Dual-mode engana**: a rota cai em fallback JSON sem erro. Validar contra Supabase real.
- **Não remover o filtro `run_id IS NULL`** da engine legada antes de desligar o Baileys.
- **Verdade do produto**: só reexibir o toggle quando a feature funcionar de ponta a ponta.
- **PR = uma coisa, base sempre `main`**, ~10 arquivos, fechar o loop na mesma sessão.
- **SEMPRE varrer `apps/worker`** ao analisar execução — 3 reviewers já erraram por ignorá-lo.

## Protocolo de migração (não pular)

- São DOIS bancos: dev `wfjuwogxaupyadwhvoxy` e prod `nidoatbxaylrkcgbszns`. Vai nos dois.
- **Conferir por SQL se o objeto já existe** antes de escrever a migração, e conferir
  também as branches/PRs abertos — já se escreveu migração duplicada aqui.
- A ordem é `deploy/supabase/apply-order.txt`. O `apply-order.txt` da RAIZ está vazio
  (0 bytes) — ignore.
- `create ... if not exists`, `security definer` sempre com `set search_path`, RLS ligado.
  Rodar o advisor de segurança do Supabase depois.

## Armadilhas do ambiente (custaram tempo real)

- **O checkout principal é compartilhado com outras sessões vivas.** `git checkout -b` lá
  arranca a branch debaixo delas. Trabalhe num worktree: existe `.worktrees/pr0-higiene`
  com as duas junctions de `node_modules` prontas (raiz e `apps/web` — o `next` não é
  hoisted), ou crie outro do mesmo jeito, com path absoluto.
- **Nunca `git add -A`**: o hook `impeccable` suja `src/.impeccable/hook.cache.json` e
  `src/lib/.impeccable/`. Staging sempre explícito, conferindo `git diff --cached`.
- Os worktrees compartilham o `.git`, então `origin/main` pode avançar por fetch de outra
  sessão no meio do trabalho.
- Domínio de produção: `www.girumo.com.br` (`girumo.com` não existe).

## Verificação (o gate que os PRs anteriores usaram)

```bash
npm run web:lint                    # da raiz
cd apps/web && npx tsc --noEmit
npm test                            # apps/web
```

Nada de `npm run web:build` local — é pesado e o disco já encheu antes; o CI (`verify`)
cobre. Se a mudança for observável no painel, diga explicitamente se verificou ao vivo ou
não: o preview da Vercel não tem env de Supabase, então conferência autenticada só roda
local.

## Contexto de negócio

Auto-grow é o coração do método VIP da história fundadora (Mega Stock, 5k→350k/mês):
"grupo lotou → o próximo é criado sozinho". É a feature que o produto vende.

**O gargalo maior, porém, não é este PR:** são os `invite_url` vazios em 194 grupos, que
o #86 destrava. Se o #86 ainda não foi mergeado e o Igor ainda não preencheu os convites,
vale dizer isso a ele antes de investir no PR-3.
