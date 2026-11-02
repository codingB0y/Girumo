# Rastreio do pedido — PR 8: Melhor Envio (plano de implementação)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Com a conta do Melhor Envio da loja conectada (OAuth, só leitura), o pedido a caminho vira `entregue` quando a
etiqueta chega a `delivered` e `problema` quando chega a `undelivered` ou `paused`, sem a lojista mexer na Yampi, e os
avisos dessas etapas saem como os da Yampi.

**Architecture:** A loja autoriza o app Girumo no Melhor Envio (molde do OAuth do Bling: `state` no banco com hash,
cookie, uso único). A cada 30 min, um passo novo no cron do Rastreio lê a lista paginada `/me/orders` da conta (10 por
página, da mais nova à mais antiga), casa cada etiqueta com o pedido pelo campo `tracking` = `tracking_code` gravado da
Yampi, e grava o marco por uma RPC irmã da do PR 1 (`rastreio_gravar_marco`), que usa a mesma regra "a etapa não volta"
sob trava de linha. O aviso sai pelo mesmo caminho do pedido da Yampi: o bloco de aviso de `registrar.ts` vira a função
`avisarEtapaNova`, chamada pelos dois.

**Tech Stack:** Next.js route handlers, Supabase/Postgres (migração pelo CI, RPC `security definer`), `fetch` com
`redirect: "error"` e teto de corpo (`lerTextoComTeto`), `lib/security/secret-box.ts` (AES-256-GCM), zod 4, `tsx --test`
(node:test) com dependências injetadas e PostgREST falso, `renderToStaticMarkup` no teste do cartão.

**Spec:** `docs/superpowers/specs/2026-10-29-rastreio-pedidos-design.md` (§1.1 "Marcos do Melhor Envio", §1.2, §1.5
`rastreio_melhor_envio`, §2.4, §3.6, §4, §5 "Integrações › Melhor Envio", §6, §7, §8 "Melhor Envio").
**Índice:** `docs/superpowers/plans/2026-10-29-rastreio-pedidos-00-indice.md` — Contrato, Global Constraints e "Ambiente
do worktree" valem aqui.
**Resultado da prova 5 (decide o desenho):** `docs/superpowers/plans/_rastreio-fase-0-resultado.md`.
**Chamadas reais de referência:** `infra/scripts/fase0-rastreio/melhor-envio.mjs` (lista, `/me`, 204) e
`credenciais-me.ps1` (authorize e token).

## Portão (antes da Parte 1)

O PR 8 entra logo depois do PR 4 (e-mail) **só se a Y22 do Recuperar ficar abaixo de 80%** (spec §10, prova 4). A prova 5
já passou (02/11/2026, 9 de 9 códigos achados). Em 02/11 a Y22 ainda não tinha sido medida; o indício da prova 5 é de 1
em 10 pedidos despachados marcado `delivered` na Yampi.

- [ ] Ler a linha **Y22** de `docs/superpowers/plans/_recuperar-fase-0-resultado.md`:
  - abaixo de 80% → segue;
  - 80% ou mais → para: o PR 8 fica para depois, e o Igor decide quando;
  - sem medida → não começa. A medição é o comando `entregues` da Fase 0 do Recuperar, com a janela começando depois de
    20/10 (antes disso a piloto não tinha pedido na Yampi).

## Partes e ordem

| Parte | O quê | Depende de | Branch |
|---|---|---|---|
| 1 · Banco | `melhorenvio_connections`, `melhorenvio_oauth_states`, `rastreio_gravar_marco`, conferência, baseline | portão | `feat/rastreio-pr8-banco` |
| 2 · Cliente e marcos | OAuth e API do Melhor Envio (HTTP puro), etiqueta → marco (puro) | portão | `feat/rastreio-pr8-cliente` |
| 3 · Stores | conexão, `state` do OAuth, marco e pedidos a caminho | 1 e 2 em `main` | `feat/rastreio-pr8-stores` |
| 4 · Passada no cron | `avisarEtapaNova`, passada dos marcos, passo no cron | 2, 3, **PR 2·2 e PR 4 em `main`**, PR 5 sem PR aberto | `feat/rastreio-pr8-passada` |
| 5 · Conexão | conectar, retorno, cartão (GET) e desconectar, política de acesso, contratos | 2 e 3 em `main` | `feat/rastreio-pr8-conexao` |
| 6 · Cartão | cartão em Integrações, prova em prod | 4 e 5 em `main` | `feat/rastreio-pr8-cartao` |

Ondas: **1 ‖ 2** (arquivos disjuntos, sem dependência); depois **3**; depois **4 ‖ 5** (disjuntos: 4 mexe em
`lib/rastreio/{registrar,cron,melhor-envio}.ts`, 5 em `lib/melhor-envio/{conexao,cartao}.ts`, rotas e segurança); por
fim **6**. O 4 e o PR 5 (WhatsApp) mexem em `registrar.ts` e `cron.ts`: um de cada vez. O 6 só depois do 4, para a
lojista nunca ver um cartão "conectado" que não faz nada.

## Antes de começar (cada parte)

1. Worktree a partir de `origin/main` (junctions: "Ambiente do worktree" do índice): `git fetch origin main;
   git worktree add .claude/worktrees/<branch sem feat/> -b <branch> origin/main`. Defasagem: `git log
   HEAD..origin/main --oneline | wc -l` — nada a fazer em worktree novo.
2. Parte 3: as duas tabelas e a RPC em `main` (`git grep -n "rastreio_gravar_marco" origin/main --
   apps/web/supabase/migrations`) e `lib/melhor-envio/api.ts` + `lib/rastreio/marcos.ts` em `main`.
3. Parte 4: `git grep -nE "export (async function (registrarPedidoDaYampi|rodarCronRastreio)|type Deps(Registrar|Cron))" origin/main -- apps/web/src/lib/rastreio`
   mostra os quatro, e `git grep -n "enviarEmail" origin/main -- apps/web/src/lib/rastreio/registrar.ts` mostra o
   gancho do PR 4. `gh pr list --search "rastreio pr5 in:title" --state open` vazio.
4. Parte 1, card (prod): `update public.board_features set blocker = 'PR 8 (Melhor Envio) começou: banco' where key =
   'rastreio-pedidos';` (o status segue `em_construcao`).

## Regras deste PR (além das Global Constraints do índice)

- App Girumo no Melhor Envio (o mesmo da Fase 0): `MELHORENVIO_CLIENT_ID` e
  `MELHORENVIO_CLIENT_SECRET` na Vercel, nos dois ambientes (Igor). Sem eles: `conectar` → 503 `indisponivel`, cartão
  "Integração indisponível no momento", passada lança no passo do cron (só loja já conectada chega lá).
- Callback **registrado** = `https://www.girumo.com.br/api/integracoes/melhor-envio/retorno`
  (`${getPublicSiteUrl()}/api/integracoes/melhor-envio/retorno`); é o `redirect_uri` da autorização e da troca do code.
  O painel mora em `app.` e o cookie do `state` é host-only: o retorno que chega no `www` responde 302 para o mesmo
  caminho e a mesma query no `app.` (`getAppUrl()`), e só lá valida.
- Escopos (os da prova 5): `orders-read shipping-tracking users-read` (`/me` sem `users-read` → 403).
- `User-Agent: Girumo (contato@girumo.com.br)` em toda chamada (a API exige). `Accept: application/json`.
- Acesso vale 30 dias (`expires_in`), renovação 45 dias (fixo, a resposta não traz). O cron renova quando faltam menos
  de **7 dias**. O refresh token roda a cada renovação: a gravação da chave nova é condicional ao refresh selado lido.
- Lista: `GET https://melhorenvio.com.br/api/v2/me/orders?page=<n>`; **204 sem corpo** = lista vazia (a doc diz 200).
  Casamento pelo `tracking` (não pelo `self_tracking`, não pela busca: prova 5, 9 de 9 pelo `tracking`).
- Marco (spec §1.1): `delivered` → `entregue`, data `delivered_at`; `undelivered` e `paused` → `problema`, data
  `updated_at` (a prova 5 não viu nenhum; sem motivo na tela até aparecer caso real). O resto não mexe. `status_raw` do
  pedido vira `melhorenvio:<status>` quando o marco muda a etapa (o PR 7, Step 6b, confere por ele).
- Passada por loja a cada **30 min** (`last_check_at`); pedidos `enviado` ou `problema`, com código, com `etapa_at` nos
  últimos **30 dias**; até **20 páginas** por passada. Primeira passada depois de conectar (`first_pass_at` nulo) grava
  com origem `importacao`: nenhum aviso. Depois, origem `varredura`, com a janela de 3 dias contada da data do marco.
- Renovação recusada (`concessao_invalida`) ou renovação vencida → `status = 'reautorizar'` e sininho
  `rastreio_melhor_envio` **só na transição**; a loja segue com a Yampi.
- Log sem token, code, `state`, código de rastreio, nome ou e-mail: só loja, id do pedido, status HTTP e o tipo do erro.
- Todo commit: `git commit -m "<mensagem>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`. Um teste só
  (raiz): `npm --workspace apps/web exec -- tsx --import ./src/test/server-only-shim.mjs --test <caminho em apps/web>`.

## Arquivos

| Arquivo (em `apps/web/` salvo os dois primeiros) | Parte | Responsabilidade |
|---|---|---|
| `deploy/supabase/apply-order.txt`, `deploy/supabase/schema-baseline.json` | 1 | ordem e assinatura (+2 `t\|`, +1 `f\|`) |
| `supabase/migrations/<ts>_rastreio_melhor_envio.sql` · `../../infra/tests/rastreio-melhor-envio-check.sql` | 1 | tabelas, RPC, conferência |
| `src/lib/melhor-envio/oauth.ts` + teste | 2 | URL de autorização, troca do code, renovação, erro tipado |
| `src/lib/melhor-envio/api.ts` + teste | 2 | `/me` e uma página de `/me/orders` (204, 401, teto de corpo) |
| `src/lib/rastreio/marcos.ts` + teste | 2 | código normalizado, etiqueta → marco (puro) |
| `src/lib/stores/melhorenvio-conexoes.ts` + teste | 3 | conexão: salvar, reivindicar a passada, trocar tokens, reautorizar, concluir, apagar |
| `src/lib/stores/melhorenvio-oauth-states.ts` + teste | 3 | `state` do OAuth (hash, uso único, cookie) |
| `src/lib/stores/rastreio-pedidos.ts` + teste | 3 | `gravarMarco`, `pedidosACaminho`, `entreguesPeloMelhorEnvio` |
| `src/lib/rastreio/registrar.ts` + teste | 4 | `avisarEtapaNova` (o bloco de aviso, agora exportado) |
| `src/lib/rastreio/melhor-envio.ts` + teste | 4 | a passada de uma loja e o sininho de reconexão |
| `src/lib/rastreio/cron.ts` + teste | 4 | passo `melhor envio` |
| `src/lib/melhor-envio/conexao.ts` + teste | 5 | começar e concluir o OAuth, desvio `www` → `app.` |
| `src/lib/melhor-envio/cartao.ts` + teste | 5 | dados do cartão |
| `src/app/api/integracoes/melhor-envio/{conectar,retorno}/route.ts`, `…/melhor-envio/route.ts` | 5 | rotas finas |
| `src/lib/security/request-access-policy.ts` + teste, `src/middleware.ts`, `system/API_CONTRACTS.md` | 5 | retorno público limitado, contratos |
| `src/components/painel/configuracoes/melhor-envio{,-painel}.tsx`, `melhor-envio-painel.test.ts`, `vitrine/configuracoes-vitrine.tsx` | 6 | cartão em Configurações › Integrações |

## Review Focus

1. **Conta errada conectada** (navegador já logado em outra conta do Melhor Envio, que aprova sem perguntar — aconteceu
   duas vezes na prova 5): a tela diz qual conta entrou (nome e e-mail do `/me`) e avisa quando ela não tem etiqueta
   nenhuma. Testes: `concluirRetorno` com a primeira página 204 → `"conta_vazia"` e `temEtiqueta: false` gravado (Task 14);
   o painel com `temEtiqueta: false` mostra o e-mail da conta e o aviso (Task 17).
2. **Conectar uma conta com dezenas de etiquetas já entregues**: a primeira passada grava e não manda aviso nenhum.
   Teste: passada com `primeiraPassadaEm: null` → `avisar` chamado com origem `"importacao"` e `concluir` com
   `primeiraPassada: true` (Task 11); `avisarEtapaNova` com `"importacao"` → `[]` (Task 10).
3. **Código de rastreio digitado diferente** (minúscula, espaço) **ou parecido com o de outro pedido**: casa só o código
   igual depois de tirar espaço e subir a caixa; nunca prefixo. Testes: `normalizarCodigo(" ab 123456789 br ") ===
   "AB123456789BR"` (Task 4) e, na passada, `"AB123456789BRX"` não casa com `"AB123456789BR"` (mutante do spec §8:
   etiqueta de outro pedido mudando a etapa) (Task 11).
4. **Marco atrasado ou fora de ordem** (`paused` lido depois de `entregue`; entrega de 5 dias atrás vista agora): a etapa
   não volta, e marco velho grava sem aviso. Testes: bloco 3 da conferência SQL (`problema` sobre `entregue` →
   `mudou: false`) (Task 2) e `avisarEtapaNova` com `atualizadoEm` de 4 dias atrás → `[]` (Task 10).
5. **Chave do Melhor Envio que morre** (a loja removeu o acesso no Melhor Envio, renovação de 45 dias vencida, ou a
   lojista reconecta no meio de uma renovação): vira `reautorizar` com um sininho só, ou para quieto quando outra
   gravação ganhou; nunca derruba as outras lojas. Testes: `marcarReautorizar` só muda `ativa` (Task 7); passada com
   renovação recusada → sininho uma vez, e com `trocarTokens` → `false` → nenhum `reautorizar` (Task 11); cron com a
   passada lançando numa loja → a outra segue (Task 12).

---

## Parte 1 — banco

Molde: Parte 1 do PR 1 (`2026-10-29-rastreio-pedidos-pr1-banco.md`, Tasks 1–5): mesmo dry-run, mesma conferência nos dois
bancos, mesma baseline. **Não dar push antes do dry-run verde**: o `migrate-dev` grava o nome do arquivo em
`ops.applied_migrations` e não reaplica arquivo editado. `<ts>` = `AAAAMMDDHHMMSS` do dia, maior que o de
`20261031120000_rastreio_pedidos.sql`.

### Task 1: Tabelas da conexão e do `state`

**Files:** Create `apps/web/supabase/migrations/<ts>_rastreio_melhor_envio.sql` (seção 1),
`infra/tests/rastreio-melhor-envio-check.sql` (preâmbulo, blocos 1–2, fim) · Modify `deploy/supabase/apply-order.txt`

**Interfaces:**
- Consumes: `organizations(id)`, `auth.users(id)`.
- Produces (as stores da Parte 3 leem estes nomes):
  - `melhorenvio_connections`: `tenant_id uuid pk → organizations on delete cascade`; `status text not null default
    'ativa' check (status in ('ativa', 'reautorizar'))`; `access_token_enc`, `refresh_token_enc text not null` (selados);
    `expires_at`, `refresh_expires_at timestamptz not null`; `account_name`, `account_email text` nulos; `has_labels
    boolean` nulo (nulo = ainda não se sabe); `first_pass_at`, `last_check_at timestamptz` nulos; `last_error text` nulo;
    `connected_by uuid` nulo `→ auth.users on delete set null`; `created_at`, `updated_at timestamptz not null default now()`.
  - `melhorenvio_oauth_states`: `state_hash text pk`, `tenant_id uuid not null → organizations on delete cascade`,
    `user_id uuid not null → auth.users on delete cascade`, `expires_at timestamptz not null` (cópia de
    `bling_oauth_states`).
  - As duas: RLS ligado, nenhuma policy, `revoke all … from public, anon, authenticated`, `grant select, insert, update,
    delete … to service_role`.

- [ ] **Step 1: Preâmbulo, blocos 1–2 e fim da conferência.** Cabeçalho no molde de `infra/tests/rastreio-check.sql`
  (`begin` … `rollback`, cada bloco levanta `'FALHOU: …'`, leitura num comando separado da escrita). Lojas TA
  `7a5c0000-0000-4000-8000-00000000000a` e TB `…0b`.
  - Bloco 1 (contrato): as duas tabelas com `relrowsecurity`, zero linhas em `pg_policy`, nenhum privilégio de
    `anon`/`authenticated` (tabela e coluna, `has_table_privilege` / `has_column_privilege`), `service_role` com os quatro;
    a CHECK de `status`.
  - Bloco 2: conexão de TA com os `not null` preenchidos → `status = 'ativa'`, `has_labels is null`; segunda de TA →
    `unique_violation`; `status = 'desconectada'` → `check_violation`; `state` com `tenant_id` inexistente →
    `foreign_key_violation`.
  - Fim: `select json_object_agg(kind || '|' || nome, sig order by kind || '|' || nome collate "C") as r from
    public.schema_signature() where nome like 'melhorenvio\_%' or nome = 'rastreio_gravar_marco'; rollback;`
- [ ] **Step 2: Conferência em dev e ver falhar** (`supabase db query --linked -o json -f ..\..\infra\tests\rastreio-melhor-envio-check.sql`,
  de `apps/web`). Expected: `FALHOU: tabela public.melhorenvio_connections ausente`.
- [ ] **Step 3: Seção 1 da migração.** Cabeçalho no padrão de `20261031120000_rastreio_pedidos.sql` (por quê, só
  `service_role`, idempotente, muda a baseline, conferir com o arquivo do Step 1). `create table if not exists`. Linha
  no fim de `apply-order.txt`: `# <data>: Rastreio do pedido, PR 8 — melhorenvio_connections e melhorenvio_oauth_states
  (só service_role) e rastreio_gravar_marco. Depois do PR 1 do Rastreio. Muda a baseline; conferir com
  infra/tests/rastreio-melhor-envio-check.sql.` + o caminho do arquivo.
- [ ] **Step 4: Dry-run** (`begin;` + migração + migração de novo + conferência, no scratchpad). Expected: sem
  `FALHOU`; `r` com `t|melhorenvio_connections` e `t|melhorenvio_oauth_states`.
- [ ] **Step 5: Commit** — `feat(db): melhor envio connection and oauth state tables (rastreio PR 8)`

### Task 2: `public.rastreio_gravar_marco`

**Files:** Modify a migração (seção 2) e a conferência (blocos 3–4)

**Interfaces:**
- Consumes: `tracking_orders` e `app.rastreio_etapa_pode_mudar(text, text)` (PR 1).
- Produces: `public.rastreio_gravar_marco(p_tenant uuid, p_order uuid, p_etapa text, p_em timestamptz, p_status_raw text)
  returns jsonb` — mesmo formato de retorno de `rastreio_gravar_pedido` (`id`, `etapa`, `etapa_anterior`, `mudou`,
  `link_token`, `notices_stopped_at`, `tem_telefone`, `tem_email`); `null` quando o pedido não existe naquela loja.
  `security definer`, `set search_path to 'public', 'app'`, execute só `service_role`.

- [ ] **Step 1: Blocos 3–4 da conferência.** Pedido O1 de TA em `enviado` (insert direto, `chk-m1`), `X = now() -
  interval '2 hours'`.
  - Bloco 3 (regra): `gravar_marco(TA, O1, 'entregue', X, 'melhorenvio:delivered')` → `mudou = true`,
    `etapa_anterior = 'enviado'`; num comando separado, a linha tem `etapa = 'entregue'`, `etapa_at = X`,
    `status_raw = 'melhorenvio:delivered'`, `purge_after = X + interval '90 days'` e o último de `events` =
    `{"etapa": "entregue", "at": X}`. De novo igual → `mudou = false` e `jsonb_array_length(events)` igual. Depois
    `'problema'`/`'melhorenvio:paused'` → `mudou = false`, `etapa = 'entregue'` (mutante do spec §8). Pedido O2 em
    `enviado` → `problema` com `p_em = now() + interval '1 day'` → `etapa_at = now()` (data futura não passa de agora);
    O2 depois `entregue` → `mudou = true` (problema anda para entregue).
  - Bloco 4 (recusas e loja): `gravar_marco(TB, O1, …)` → `null` e O1 intacto; pedido inexistente → `null`; etapa
    `'enviado'`, `status_raw` `'delivered'` (sem o prefixo) e `p_order` nulo → exceção (`begin … exception when
    raise_exception then null; end`); `has_function_privilege('anon', …, 'execute')` e o mesmo para `authenticated` →
    `false`.
- [ ] **Step 2: Dry-run e ver falhar.** Expected: `FALHOU` no bloco 3 (função ausente).
- [ ] **Step 3: Seção 2 da migração:**

```sql
create or replace function public.rastreio_gravar_marco(p_tenant uuid, p_order uuid, p_etapa text, p_em timestamptz, p_status_raw text)
returns jsonb language plpgsql volatile security definer set search_path to 'public', 'app'
as $$
declare
  v_linha public.tracking_orders;
  v_em    timestamptz := least(coalesce(p_em, now()), now());
  v_mudou boolean;
begin
  if p_tenant is null or p_order is null then raise exception 'rastreio_gravar_marco: loja e pedido obrigatórios'; end if;
  if p_etapa is null or p_etapa not in ('entregue', 'problema') then
    raise exception 'rastreio_gravar_marco: % não é marco do Melhor Envio', p_etapa; end if;
  if p_status_raw is null or p_status_raw !~ '^melhorenvio:[a-z_]{1,30}$' then
    raise exception 'rastreio_gravar_marco: status_raw fora do formato'; end if;
  -- A mesma trava e a mesma regra do rastreio_gravar_pedido: quem chega depois espera e lê a etapa gravada.
  select * into v_linha from public.tracking_orders t where t.tenant_id = p_tenant and t.id = p_order for update;
  if not found then return null; end if;
  v_mudou := app.rastreio_etapa_pode_mudar(v_linha.etapa, p_etapa);
  if v_mudou then
    update public.tracking_orders t set etapa = p_etapa, etapa_at = v_em, status_raw = p_status_raw, updated_at = now(),
      events = t.events || jsonb_build_array(jsonb_build_object('etapa', p_etapa, 'at', v_em)),
      purge_after = case when p_etapa = 'entregue' then v_em + interval '90 days' end
    where t.id = v_linha.id;
  end if;
  return jsonb_build_object('id', v_linha.id, 'etapa', case when v_mudou then p_etapa else v_linha.etapa end,
    'etapa_anterior', v_linha.etapa, 'mudou', v_mudou, 'link_token', v_linha.link_token,
    'notices_stopped_at', v_linha.notices_stopped_at, 'tem_telefone', v_linha.buyer_phone is not null,
    'tem_email', v_linha.buyer_email_enc is not null);
end;
$$;
```

  e `revoke all on function public.rastreio_gravar_marco(uuid, uuid, text, timestamptz, text) from public, anon,
  authenticated; grant execute … to service_role;`.
- [ ] **Step 4: Dry-run.** Expected: sem `FALHOU`; `r` também com `f|rastreio_gravar_marco`.
- [ ] **Step 5: Commit** — `feat(db): rastreio_gravar_marco keeps the stage rule for Melhor Envio milestones`

### Task 3: Fechamento da Parte 1

- [ ] **Step 1:** revisão do diff (agente Code Reviewer, com o `database-reviewer` para a RPC) e os quatro comandos do índice.
- [ ] **Step 2:** push → PR `feat(db): Melhor Envio tables and milestone RPC (rastreio PR 8, part 1)` → `migrate-dev` aplica.
- [ ] **Step 3: Conferência em dev** pelo CLI (Step 2 da Task 1). Expected: sem `FALHOU`.
- [ ] **Step 4: Baseline.** `npm run schema:baseline` com `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` de dev; sem eles,
  colar as 3 chaves de `r` em `deploy/supabase/schema-baseline.json`. Commit `chore(schema): baseline with Melhor Envio
  tables (dev = prod + this PR)`, push. Expected: `drift` verde.
- [ ] **Step 5:** CI verde → **migração: pedir o OK do Igor** (regra de merge de 31/10) → `gh pr merge <N> --squash
  --delete-branch` → `migrate-prod` aplica. A conferência em prod é do Igor (o bloco 2 escreve, dentro de `rollback`).

---

## Parte 2 — cliente do Melhor Envio e marcos

Sem banco e sem rede de verdade: tudo com `fetchImpl` falso. Pode ir a `main` junto com a Parte 1.

### Task 4: Etiqueta → marco (puro)

**Files:** Create `apps/web/src/lib/rastreio/marcos.ts`, `apps/web/src/lib/rastreio/marcos.test.ts`

**Interfaces:**
- Consumes: nada (puro). O tipo da etiqueta nasce aqui, e a Task 5 o importa.
- Produces:
  - `export type EtiquetaMelhorEnvio = { tracking: string | null; status: string; criadaEm: string | null; atualizadaEm: string | null; entregueEm: string | null }` (datas ISO);
  - `export type MarcoDoMelhorEnvio = { etapa: "entregue" | "problema"; em: string; statusRaw: string }`;
  - `normalizarCodigo(v: unknown): string | null` — tira todo espaço e sobe a caixa; vazio ou não-texto → `null`;
  - `marcoDaEtiqueta(e: EtiquetaMelhorEnvio, agora: Date): MarcoDoMelhorEnvio | null`.

- [ ] **Step 1: Teste que falha** — `AGORA = new Date("2026-11-02T15:00:00Z")`; `etiqueta(extra)` = `{ tracking: "AB123456789BR", status: "posted", criadaEm: "2026-10-28T12:00:00.000Z", atualizadaEm: "2026-11-01T18:00:00.000Z", entregueEm: null, ...extra }`.

| Teste | Entrada | Esperado |
|---|---|---|
| entregue usa `delivered_at` | `{ status: "delivered", entregueEm: "2026-11-01T17:32:00.000Z" }` | `{ etapa: "entregue", em: "2026-11-01T17:32:00.000Z", statusRaw: "melhorenvio:delivered" }` |
| entregue sem `delivered_at` usa `updated_at`; sem os dois, agora | `{ status: "delivered" }`; depois também `atualizadaEm: null` | `em` = `atualizadaEm`; depois `AGORA.toISOString()` |
| não entregue e pausado viram problema | `"undelivered"`, `"paused"` | `etapa: "problema"`, `em` = `atualizadaEm`, `statusRaw` `"melhorenvio:undelivered"` / `"melhorenvio:paused"` |
| os outros não mexem | `"pending"`, `"released"`, `"generated"`, `"posted"`, `"canceled"`, `"suspended"`, `"Delivered"`, `"delivered; drop"` | `null` em todos |
| código normalizado (Review Focus 3) | `normalizarCodigo(" ab 123456789 br ")`, `("")`, `(null)`, `(123)` | `"AB123456789BR"`, `null`, `null`, `null` |

- [ ] **Step 2: Rodar e ver falhar** — Expected: `ERR_MODULE_NOT_FOUND`.
- [ ] **Step 3: Implementar** (puro, sem `server-only`). `suspended` fica fora de propósito: o spec §1.1 só lista
  `undelivered` e `paused`, e `suspended` é da etiqueta, não da entrega. Status só com `/^[a-z_]{1,30}$/` (o
  `statusRaw` tem de passar na CHECK da RPC).
- [ ] **Step 4: Rodar e ver passar.** · **Step 5: Commit** — `feat(rastreio): Melhor Envio label status to milestone`

### Task 5: OAuth e API do Melhor Envio

**Files:** Create `apps/web/src/lib/melhor-envio/oauth.ts`, `oauth.test.ts`, `api.ts`, `api.test.ts` (em
`apps/web/src/lib/melhor-envio/`)

**Interfaces:**
- Consumes: `EtiquetaMelhorEnvio` (Task 4), `dataDaYampi` (`lib/rastreio/pedido-yampi.ts`: texto sem fuso lido como
  Brasília, o mesmo que a Yampi), `lerTextoComTeto` e `TETO_RESPOSTA_BYTES` (`lib/bling/cliente.ts`), `getPublicSiteUrl`
  (`lib/brand.ts`).
- Produces, `oauth.ts` (`import "server-only"`; molde de `lib/bling/oauth.ts`):
  - `ME_AUTHORIZE_URL = "https://melhorenvio.com.br/oauth/authorize"`, `ME_TOKEN_URL = "https://melhorenvio.com.br/oauth/token"`,
    `ESCOPOS_ME = "orders-read shipping-tracking users-read"`, `USER_AGENT_ME = "Girumo (contato@girumo.com.br)"`;
  - `type CredenciaisMelhorEnvio = { clientId: string; clientSecret: string }`; `credenciaisMelhorEnvio(env = process.env): CredenciaisMelhorEnvio | null` (com `trim`);
  - `urlDoRetorno(): string` = `${getPublicSiteUrl()}/api/integracoes/melhor-envio/retorno`;
  - `urlDeAutorizacao(clientId: string, state: string): string` (`client_id`, `redirect_uri`, `response_type=code`, `state`, `scope`);
  - `type TokensMelhorEnvio = { accessToken: string; refreshToken: string; expiraEm: Date; renovacaoExpiraEm: Date }`;
  - `type TipoErroOAuthMe = "concessao_invalida" | "cliente_invalido" | "limite" | "transitorio" | "outro"`;
    `class ErroOAuthMelhorEnvio extends Error { readonly tipo: TipoErroOAuthMe; readonly status: number | null }`;
  - `trocarCodigo(code: string, cred: CredenciaisMelhorEnvio, opcoes?: OpcoesHttp): Promise<TokensMelhorEnvio>`;
    `renovarToken(refreshToken: string, cred: CredenciaisMelhorEnvio, opcoes?: OpcoesHttp): Promise<TokensMelhorEnvio>`;
  - `type OpcoesHttp = { fetchImpl?: typeof fetch; agora?: () => number; timeoutMs?: number }` (exportado; a `api.ts` usa).
- Produces, `api.ts` (`import "server-only"`):
  - `ME_API = "https://melhorenvio.com.br/api/v2/me"`; `class ErroMelhorEnvio extends Error { readonly status: number }`
    (0 = sem resposta; mensagem `"o Melhor Envio respondeu <status>"` ou `"o Melhor Envio não respondeu"`, nunca o corpo);
  - `type ContaMelhorEnvio = { nome: string; email: string }`; `contaDoToken(token: string, opcoes?: OpcoesHttp): Promise<ContaMelhorEnvio>`;
  - `paginaDeEtiquetas(token: string, pagina: number, opcoes?: OpcoesHttp): Promise<{ etiquetas: EtiquetaMelhorEnvio[]; ultimaPagina: number }>`.

- [ ] **Step 1: Testes que falham.** `fetchImpl` falso guarda `(url, init)` e responde por fila. `inicio` fixo pelo
  `agora`. Corpo de token: `{ token_type: "Bearer", expires_in: 2592000, access_token: "acc-1", refresh_token: "ref-1" }`.

| Teste (`oauth.test.ts`) | Esperado |
|---|---|
| URL de autorização | `new URL(urlDeAutorizacao("1234567", "st"))`: origem+caminho = `ME_AUTHORIZE_URL`; `redirect_uri` = `https://www.girumo.com.br/api/integracoes/melhor-envio/retorno` (sem `NEXT_PUBLIC_SITE_URL`); `scope` = `"orders-read shipping-tracking users-read"`; `response_type` `"code"`; `state` `"st"` |
| troca do code | um POST em `ME_TOKEN_URL`, `content-type` form, `user-agent` = `USER_AGENT_ME`, `redirect: "error"`; corpo `grant_type=authorization_code`, `client_id`, `client_secret`, `redirect_uri` (o do retorno) e `code`; resultado `expiraEm = inicio + 2592000 s`, `renovacaoExpiraEm = inicio + 45 dias` |
| renovação | corpo `grant_type=refresh_token`, `refresh_token=ref-0`, `client_id`, `client_secret` |
| erros por código, não por status | 400 `{error:"invalid_grant"}` e 401 `{error:"invalid_request"}` → `concessao_invalida`; 400 `{error:"invalid_request"}` → `outro`; 401 `{error:"invalid_client"}` → `cliente_invalido`; 429 → `limite`; 503 e `fetch` lançando → `transitorio`; 200 sem `refresh_token` ou `expires_in` > 60 dias → `outro` |
| segredo nunca na mensagem | em todos os erros acima, `message` não contém `client_secret`, `ref-0` nem o code |

| Teste (`api.test.ts`) | Esperado |
|---|---|
| cabeçalhos | `authorization: Bearer tok`, `user-agent` = `USER_AGENT_ME`, `accept: application/json`; URL `…/me/orders?page=3` |
| 204 sem corpo é lista vazia | `{ etiquetas: [], ultimaPagina: 0 }` |
| página com etiquetas | `{ data: [{ tracking: "AB123456789BR", status: "delivered", created_at: "2026-10-28 09:00:00", updated_at: "2026-11-01 14:32:00", delivered_at: "2026-11-01 14:32:00" }, "lixo", { tracking: null }], last_page: 5 }` → uma etiqueta, `entregueEm` `"2026-11-01T17:32:00.000Z"`, `criadaEm` `"2026-10-28T12:00:00.000Z"`; `ultimaPagina: 5`; sem `last_page` → 1 |
| erro e sem resposta | 401 → `ErroMelhorEnvio` com `status` 401; `fetch` lançando → `status` 0 |
| conta | `/me` 200 `{ firstname: "Ana", lastname: "Souza", email: "ana@exemplo.test" }` → `{ nome: "Ana Souza", email: "ana@exemplo.test" }`; 403 (sem `users-read`) → `ErroMelhorEnvio` 403 |

- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.** `oauth.ts` no molde de `lib/bling/oauth.ts` (mesmo `tokenSeguro`, `corpoDeErro`,
  `CODIGO_SEGURO`), com estas diferenças: credencial no corpo do formulário (como `credenciais-me.ps1`), não em Basic;
  `Accept: application/json` e o `User-Agent`; `concessao_invalida` = código `invalid_grant` em qualquer 4xx, ou
  `invalid_request` com status 401 (o formato do refresh token revogado nas versões antigas do servidor OAuth do Laravel,
  que também usa `invalid_request` com 400 para pedido malformado). `api.ts`: `GET` com `redirect: "error"`, timeout 15 s,
  `lerTextoComTeto`; item da lista que não é objeto ou não tem `status` texto é pulado; datas por `dataDaYampi`.
  Nenhuma pausa entre páginas: no máximo 20 por loja a cada 30 min, longe das 250/min da conta.
- [ ] **Step 4: Rodar e ver passar** + os dois `tsc`.
- [ ] **Step 5: Commit** — `feat(rastreio): Melhor Envio OAuth and labels client`

### Task 6: Fechamento da Parte 2

- [ ] Os quatro comandos do índice e o `verify-local.ps1` verdes; revisão do diff (Code Reviewer); push → PR
  `feat(rastreio): Melhor Envio client and label milestones (rastreio PR 8, part 2)` → CI verde → merge
  `--squash --delete-branch` (sem migração: revisão aprovada + CI verde bastam).

---

## Parte 3 — stores

### Task 7: Conexão e `state` do OAuth

**Files:** Create `apps/web/src/lib/stores/melhorenvio-conexoes.ts`, `melhorenvio-conexoes.test.ts`,
`melhorenvio-oauth-states.ts`, `melhorenvio-oauth-states.test.ts` (em `apps/web/src/lib/stores/`)

**Interfaces:**
- Consumes: as tabelas da Task 1; `hashDoEstado` de `lib/stores/bling-oauth-states.ts` (reuso, não cópia).
- Produces, `melhorenvio-conexoes.ts` (`import "server-only"`; toda query com `.eq("tenant_id", …)`):
  - `type ConexaoMelhorEnvio = { tenantId: string; status: "ativa" | "reautorizar"; accessTokenEnc: string; refreshTokenEnc: string; expiraEm: string; renovacaoExpiraEm: string; contaNome: string | null; contaEmail: string | null; temEtiqueta: boolean | null; primeiraPassadaEm: string | null; ultimaConsultaEm: string | null; ultimoErro: string | null }`;
  - `contextoDoTokenMe(tenantId: string, campo: "access" | "refresh"): string` = `melhorenvio:${tenantId}:${campo}` (spec §2.4);
  - `lerConexao(tenantId: string): Promise<ConexaoMelhorEnvio | null>`;
  - `salvarConexao(tenantId: string, c: { accessTokenEnc: string; refreshTokenEnc: string; expiraEm: Date; renovacaoExpiraEm: Date; contaNome: string; contaEmail: string; temEtiqueta: boolean | null; conectadaPor: string }): Promise<void>` —
    upsert `onConflict: "tenant_id"` com `status: "ativa"` e `first_pass_at`, `last_check_at`, `last_error` nulos
    (reconectar = primeira passada de novo, sem aviso);
  - `reivindicarPassada(tenantId: string, agora: Date, intervaloMs: number): Promise<ConexaoMelhorEnvio | null>` —
    `update { last_check_at: agora }` com `.eq("tenant_id").eq("status", "ativa").or("last_check_at.is.null,last_check_at.lt.<agora − intervalo, ISO>")`
    e `.select()`; a linha devolvida é a passada desta execução (duas execuções do cron ao mesmo tempo: só uma pega);
  - `trocarTokens(tenantId: string, refreshLido: string, novo: { accessTokenEnc: string; refreshTokenEnc: string; expiraEm: Date; renovacaoExpiraEm: Date }): Promise<boolean>` —
    `update` com `.eq("refresh_token_enc", refreshLido)`; `false` = outra gravação (a lojista reconectou) ganhou;
  - `marcarReautorizar(tenantId: string, erro: string): Promise<boolean>` — `update { status: "reautorizar", last_error: erro }`
    com `.eq("status", "ativa")`; `true` só na transição;
  - `concluirPassada(tenantId: string, r: { agora: Date; primeiraPassada: boolean; temEtiqueta: boolean | null; erro: string | null }): Promise<void>` —
    `last_error = erro`; `first_pass_at = agora` só com `primeiraPassada && erro === null`; `has_labels` só quando não nulo;
  - `apagarConexao(tenantId: string): Promise<void>`.
- Produces, `melhorenvio-oauth-states.ts` (cópia de `bling-oauth-states.ts` com outra tabela e outro cookie):
  `COOKIE_DO_ESTADO_ME = "melhorenvio_oauth_state"`; `cookieDoEstadoMe(valor: string, maxAgeS: number): string` com
  `Path=/api/integracoes/melhor-envio; HttpOnly; Secure; SameSite=Lax; Max-Age=<n>`;
  `criarEstadoOAuthMe(e: { stateHash: string; tenantId: string; userId: string; expiraEm: Date }): Promise<void>` (faxina
  dos vencidos da loja + insert); `consumirEstadoOAuthMe(stateHash: string, agora: Date): Promise<{ tenantId: string; userId: string } | null>`
  (`delete … returning`, sem filtro de loja: é o hash que diz a loja).

- [ ] **Step 1: Testes que falham** — PostgREST falso no molde de `lib/stores/rastreio-pedidos.test.ts`.

| Teste | Esperado |
|---|---|
| `salvarConexao` faz upsert e zera a passada | `POST /rest/v1/melhorenvio_connections?on_conflict=tenant_id`, `prefer` com `resolution=merge-duplicates`; corpo com `status: "ativa"`, `first_pass_at: null`, `last_check_at: null`, `last_error: null`, `has_labels`, `account_name`, `account_email`, `connected_by` |
| `reivindicarPassada` só pega loja ativa e fora da vez | `PATCH` com `tenant_id=eq.loja-a`, `status=eq.ativa`, `or=(last_check_at.is.null,last_check_at.lt.2026-11-02T14:30:00.000Z)` para `agora` 15:00 e 30 min; resposta `[]` → `null`; uma linha → `ConexaoMelhorEnvio` |
| `trocarTokens` é condicional ao refresh lido (Review Focus 5) | filtro `refresh_token_enc=eq.<lido>`; `[]` → `false`; uma linha → `true` |
| `marcarReautorizar` só na transição (Review Focus 5) | filtro `status=eq.ativa`; `[]` → `false`; uma linha → `true` |
| `concluirPassada` | primeira passada sem erro grava `first_pass_at`; com erro não grava e grava `last_error`; `temEtiqueta: null` não manda `has_labels` |
| `apagarConexao` filtra a loja | `DELETE` com `tenant_id=eq.loja-a` |
| `state` de uso único | `consumirEstadoOAuthMe`: `DELETE` com `state_hash=eq.<h>`, `expires_at=gt.<agora>` e `select=tenant_id,user_id`; `[]` → `null` |
| cookie do `state` | `cookieDoEstadoMe("abc", 600)` = `"melhorenvio_oauth_state=abc; Path=/api/integracoes/melhor-envio; HttpOnly; Secure; SameSite=Lax; Max-Age=600"` |

- [ ] **Step 2: Rodar e ver falhar.** · **Step 3: Implementar.** Erro do Supabase → `throw new Error(error.message)`.
  `ponytail:` sem `key_fp` (o Bling grava a impressão da chave): trocar a `INTEGRATIONS_ENCRYPTION_KEY` faz a passada
  lançar em `abrir` até a loja reconectar; acrescentar quando a chave for trocada.
- [ ] **Step 4: Rodar e ver passar.** · **Step 5: Commit** — `feat(rastreio): Melhor Envio connection and OAuth state stores`

### Task 8: Marco e pedidos a caminho na store dos pedidos

**Files:** Modify `apps/web/src/lib/stores/rastreio-pedidos.ts`, `rastreio-pedidos.test.ts`

**Interfaces:**
- Consumes: `MarcoDoMelhorEnvio` (Task 4), RPC da Task 2.
- Produces:
  - `type PedidoACaminho = { id: string; numero: string; trackingCode: string; orderCreatedAt: string }`;
  - `pedidosACaminho(tenantId: string, desde: Date, limite = 500): Promise<PedidoACaminho[]>` — `etapa in (enviado,
    problema)`, `tracking_code not null`, `etapa_at >= desde`, mais novo primeiro (`order_created_at desc`), `limit`;
  - `gravarMarco(tenantId: string, orderId: string, m: MarcoDoMelhorEnvio): Promise<PedidoGravado | null>` — RPC
    `rastreio_gravar_marco` (`p_em: m.em`, `p_status_raw: m.statusRaw`); `null` = pedido sumiu (purge);
  - `entreguesPeloMelhorEnvio(tenantId: string, desde: Date): Promise<number>` — `select("id", { count: "exact", head: true })`
    com `etapa = 'entregue'`, `status_raw = 'melhorenvio:delivered'`, `etapa_at >= desde` (contagem pelo cabeçalho: o
    PostgREST corta lista em 1000 sem erro).
  - O mapeamento do retorno da RPC (`RetornoDaRpc` → `PedidoGravado`) sai de `gravarPedido` para uma função local
    `paraGravado`, usada pelas duas.

- [ ] **Step 1: Testes que falham** — no `rastreio-pedidos.test.ts`: `gravarMarco` manda `POST /rest/v1/rpc/rastreio_gravar_marco`
  com `{ p_tenant: "loja-a", p_order: "ped-1", p_etapa: "entregue", p_em: "2026-11-01T17:32:00.000Z", p_status_raw: "melhorenvio:delivered" }`
  e devolve o `PedidoGravado` (`paradoEm`, `temTelefone`, `temEmail` vindos da resposta); resposta `null` → `null`;
  `pedidosACaminho` manda `tenant_id=eq.loja-a`, `etapa=in.(enviado,problema)`, `tracking_code=not.is.null`,
  `etapa_at=gte.<desde>`, `order=order_created_at.desc`, `limit=500`; `entreguesPeloMelhorEnvio` faz `HEAD` com
  `prefer: count=exact` e devolve o total do `content-range` (`0-0/7` → 7; `*/0` → 0).
- [ ] **Step 2: Rodar e ver falhar.** · **Step 3: Implementar.** `ponytail:` limite de 500 pedidos a caminho por loja;
  subir quando uma loja passar disso em 30 dias.
- [ ] **Step 4: Rodar e ver passar** (o arquivo inteiro: os testes do PR 1 seguem verdes). · **Step 5: Commit** —
  `feat(rastreio): record Melhor Envio milestones and list orders on the way`

### Task 9: Fechamento da Parte 3

- [ ] Quatro comandos, `verify-local.ps1`, Code Reviewer; PR `feat(rastreio): Melhor Envio stores (rastreio PR 8, part 3)`
  → CI verde → merge `--squash --delete-branch`.

---

## Parte 4 — passada no cron

### Task 10: `avisarEtapaNova` no registrar

**Files:** Modify `apps/web/src/lib/rastreio/registrar.ts`, `registrar.test.ts`

**Interfaces:**
- Consumes: o `registrar.ts` de `main` (PR 2·2 + ganchos do PR 4, e do PR 5 se já tiver entrado): `DepsRegistrar`,
  `DEPS`, `mudancaParaAvisar`, `canaisDoAviso`, `ehEtapaComAviso`.
- Produces: `avisarEtapaNova(tenantId: string, gravado: PedidoGravado, e: { origem: OrigemDoPedido; atualizadoEm: string; numero: string }, deps?: DepsRegistrar): Promise<{ id: string; canal: Canal }[]>` —
  tudo o que `registrarPedidoDaYampi` faz depois do `gravarPedido` (janela, plano, config, canais, `criarAvisos`,
  sininho do problema, envio imediato do e-mail do PR 4 e, se houver, do WhatsApp do PR 5), com `atualizadoNaYampi =
  e.atualizadoEm` e `numero = e.numero`. `registrarPedidoDaYampi` passa a ser: pepper → `pedidoDaYampi` → `gravarPedido`
  → `avisarEtapaNova(tenantId, gravado, { origem, atualizadoEm: pedido.atualizadoNaYampi, numero: pedido.numero }, deps)`.
  O retorno dele não muda.

- [ ] **Step 1: Testes que falham** (reusam `montar(extra)` e `GRAVADO` do arquivo):

| Teste | Montagem | Esperado |
|---|---|---|
| marco recente vira aviso pela matriz | `avisarEtapaNova("loja-a", { ...GRAVADO, etapa: "entregue", etapaAnterior: "enviado" }, { origem: "varredura", atualizadoEm: "2026-10-29T10:00:00Z", numero: "1042" }, deps)` | `log.criar` = `[["loja-a", "ped-1", "entregue", ["whatsapp"]]]` (matriz padrão: entregue só WhatsApp) |
| primeira passada do Melhor Envio não avisa (Review Focus 2) | mesmo, com `origem: "importacao"` | `[]`, `log.config === 0` |
| marco velho não avisa (Review Focus 4) | `atualizadoEm: "2026-10-25T14:00:00Z"` (4 dias antes do `agora` do arquivo) | `[]` |
| problema do Melhor Envio avisa a loja com o número certo | `etapa: "problema"`, `numero: "2077"` | `log.loja = [["loja-a", { id: "ped-1", numero: "2077" }]]` |

- [ ] **Step 2: Rodar e ver falhar** — Expected: `avisarEtapaNova` não exportado.
- [ ] **Step 3: Implementar** — mover o bloco, sem mudar comportamento; os testes que já existiam no arquivo não mudam e
  continuam verdes (é a prova de que a extração não alterou o registro da Yampi). Se o arquivo real divergir do plano
  do PR 2, preservar o comportamento e anotar em "Divergências".
- [ ] **Step 4: Rodar e ver passar** (arquivo inteiro + `consumidores.test.ts`). · **Step 5: Commit** —
  `refactor(rastreio): share the stage-notice step with the Melhor Envio milestones`

### Task 11: A passada de uma loja

**Files:** Create `apps/web/src/lib/rastreio/melhor-envio.ts`, `apps/web/src/lib/rastreio/melhor-envio.test.ts`

**Interfaces:**
- Consumes: Tasks 4, 5, 7, 8 e 10; `abrir`, `selar`, `chaveDeIntegracoes` (`lib/security/secret-box.ts`).
- Produces:
  - `INTERVALO_DA_PASSADA_MS = 30 * 60_000`;
  - `type ResultadoDosMarcos = { pedidos: number; casados: number; marcos: number; paginas: number }`;
  - `rodarMarcosDoMelhorEnvio(tenantId: string, agora: Date, deps?: DepsMarcos): Promise<ResultadoDosMarcos | null>` —
    `null` = loja sem conexão ativa ou fora da vez;
  - `avisarReconectarMelhorEnvio(tenantId: string): Promise<void>` — insert em `notifications`
    `{ tenant_id, type: "rastreio_melhor_envio", title: "Melhor Envio desconectado", body: "Reconecte o Melhor Envio para os avisos de entrega", href: "/painel/configuracoes?secao=integracoes" }`
    (molde de `avisarRecusa` em `lib/privado/numero.ts`; a deduplicação é a transição do `marcarReautorizar`);
  - `DEPS = { reivindicar: reivindicarPassada, aCaminho: pedidosACaminho, listar: paginaDeEtiquetas, credenciais: credenciaisMelhorEnvio, chave: chaveDeIntegracoes, renovar: renovarToken, trocarTokens, reautorizar: marcarReautorizar, avisarReconectar: avisarReconectarMelhorEnvio, gravarMarco, avisar: avisarEtapaNova, concluir: concluirPassada }`;
    `type DepsMarcos = typeof DEPS`.

- [ ] **Step 1: Testes que falham.** `AGORA = new Date("2026-11-02T15:00:00Z")`; `CHAVE` de 32 bytes; `conexao(extra)`
  com tokens selados por `selar(…, contextoDoTokenMe("loja-a", campo), CHAVE)`, `expiraEm` daqui a 20 dias,
  `renovacaoExpiraEm` daqui a 40, `primeiraPassadaEm: "2026-10-01T00:00:00.000Z"`; pedidos `P1 = { id: "ped-1", numero: "1042", trackingCode: "AB123456789BR", orderCreatedAt: "2026-10-25T12:00:00.000Z" }`
  e `P2` (`"ped-2"`, `"1043"`, `"CD987654321BR"`, `"2026-10-26T12:00:00.000Z"`); `montar(extra)` guarda as chamadas em
  `log`; `listar` responde por página de uma tabela.

| Teste | Montagem | Esperado |
|---|---|---|
| fora da vez | `reivindicar` → `null` | `null`; nenhuma outra dependência chamada |
| sem pedido a caminho, não chama a API | `aCaminho` → `[]`, `primeiraPassadaEm: null` | `{ pedidos: 0, casados: 0, marcos: 0, paginas: 0 }`; `listar` nunca; `concluir` com `{ primeiraPassada: true, temEtiqueta: null, erro: null }` |
| casa pelo código e grava (Review Focus 3) | página 1: `{ tracking: "ab 123456789 br", status: "delivered", entregueEm: "2026-11-01T17:32:00.000Z" }`, `{ tracking: "AB123456789BRX", status: "delivered" }`, `{ tracking: "CD987654321BR", status: "posted" }`; `ultimaPagina: 1` | `gravarMarco` uma vez: `("loja-a", "ped-1", { etapa: "entregue", em: "2026-11-01T17:32:00.000Z", statusRaw: "melhorenvio:delivered" })`; `avisar` com `{ origem: "varredura", atualizadoEm: "2026-11-01T17:32:00.000Z", numero: "1042" }`; resultado `{ pedidos: 2, casados: 2, marcos: 1, paginas: 1 }`; `concluir` com `temEtiqueta: true` |
| primeira passada grava sem aviso (Review Focus 2) | o mesmo com `primeiraPassadaEm: null` | `avisar` com `origem: "importacao"`; `concluir` com `primeiraPassada: true` |
| para de paginar | (a) os dois casam na página 1 de `ultimaPagina: 5`; (b) página 1 sem casar com a etiqueta mais antiga criada em `2026-10-23T00:00:00.000Z` (antes de `P1.orderCreatedAt − 1 dia`); (c) `ultimaPagina: 50`, toda página com 10 etiquetas criadas depois dos pedidos e sem casar | (a) 1 chamada; (b) 1 chamada; (c) 20 chamadas e `console.warn` `"[rastreio/melhor-envio] loja-a: parou no teto de 20 páginas"` |
| lista vazia (204) | página 1 → `{ etiquetas: [], ultimaPagina: 0 }` | 1 chamada; `concluir` com `temEtiqueta: false` |
| renova antes de vencer | `expiraEm` daqui a 3 dias | `renovar` com o refresh aberto; `trocarTokens("loja-a", <refreshTokenEnc lido>, …)` com tokens novos selados (abrem com o contexto); `listar` com o access novo |
| reconectaram no meio da renovação (Review Focus 5) | idem, `trocarTokens` → `false` | `null`; `listar`, `reautorizar` e `avisarReconectar` nunca |
| renovação recusada vira reautorizar, sininho só na transição (Review Focus 5) | `renovar` lança `ErroOAuthMelhorEnvio("concessao_invalida", 400, …)`; depois o mesmo com `reautorizar` → `false` | 1ª: `reautorizar("loja-a", "o Melhor Envio recusou a renovação do acesso")` e `avisarReconectar` uma vez; 2ª: sem sininho; `listar` nunca nas duas |
| renovação de 45 dias vencida | `renovacaoExpiraEm` ontem | `reautorizar` com `"a renovação do acesso ao Melhor Envio venceu"`, sem chamar `renovar` |
| 401 na lista força a renovação e para | `listar` lança `ErroMelhorEnvio(401)` | `renovar` chamado; nada gravado; `concluir` com `erro: "o Melhor Envio recusou a chave (401)"` |
| outro erro sobe | `listar` lança `ErroMelhorEnvio(503)` e `ErroMelhorEnvio(0)` | `concluir` com `erro` = mensagem do erro; depois `rejects` com o mesmo erro (o passo do cron conta a falha) |
| um pedido que não grava não para os outros | `gravarMarco` lança em `ped-1`; `ped-2` em `delivered` | `ped-2` gravado e avisado; `console.error` `"[rastreio/melhor-envio] loja-a: pedido ped-1 não gravou: …"` sem o código de rastreio |
| pedido purgado | `gravarMarco` → `null` | `avisar` nunca |

- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** (`import "server-only"`). Sequência: `reivindicar(tenantId, agora, INTERVALO_DA_PASSADA_MS)`
  → nulo, `null` · `aCaminho(tenantId, agora − 30 dias)` · sem pedido → `concluir` e sai · credenciais e chave (faltou →
  `throw new Error("[rastreio/melhor-envio] MELHORENVIO_CLIENT_ID/SECRET ou INTEGRATIONS_ENCRYPTION_KEY ausente")`) ·
  token (`renovacaoExpiraEm <= agora` → reautorizar; `expiraEm − agora < 7 dias` → renovar) · páginas · `concluir`.
  Renovar = `renovar(abrir(refresh))` → `concessao_invalida` → `reautorizar` (+ sininho se `true`) e sai; outro
  `ErroOAuthMelhorEnvio` sobe; sucesso → `trocarTokens` com o `refreshTokenEnc` lido → `false` sai sem nada. O laço:

```ts
const faltam = new Map(pedidos.map((p) => [normalizarCodigo(p.trackingCode), p] as const));
faltam.delete(null);
let paginas = 0, marcos = 0, viuEtiqueta: boolean | null = null;
for (let pagina = 1; pagina <= TETO_DE_PAGINAS && faltam.size > 0; pagina++) {
  const { etiquetas, ultimaPagina } = await deps.listar(access, pagina);
  paginas++;
  if (pagina === 1) viuEtiqueta = etiquetas.length > 0;
  for (const e of etiquetas) {
    const codigo = normalizarCodigo(e.tracking);
    const p = codigo === null ? undefined : faltam.get(codigo);
    if (!p) continue;
    faltam.delete(codigo);
    const marco = marcoDaEtiqueta(e, agora);
    if (marco && (await gravarEAvisar(tenantId, p, marco, origem, deps))) marcos++;
  }
  // A etiqueta nasce depois do pedido: abaixo da criação do pedido mais antigo que falta (com 1 dia de folga), não há mais nada a casar.
  const maisAntiga = etiquetas.reduce<string | null>((m, e) => (e.criadaEm && (!m || e.criadaEm < m) ? e.criadaEm : m), null);
  const limite = Math.min(...[...faltam.values()].map((p) => Date.parse(p.orderCreatedAt))) - 86_400_000;
  if (pagina >= ultimaPagina || etiquetas.length === 0 || (maisAntiga !== null && Date.parse(maisAntiga) < limite)) break;
  if (pagina === TETO_DE_PAGINAS) console.warn(`[rastreio/melhor-envio] ${tenantId}: parou no teto de ${TETO_DE_PAGINAS} páginas`);
}
```

  `gravarEAvisar` = `gravarMarco` → nulo, `false` → `avisar(tenantId, gravado, { origem, atualizadoEm: marco.em, numero: p.numero })`,
  num `try/catch` por pedido (log sem o código). `origem = conexao.primeiraPassadaEm === null ? "importacao" : "varredura"`.
  `casados` = quantos pedidos saíram de `faltam`. 401 → `renovar` (como acima) e `concluir` com a mensagem
  fixa; outro erro → `concluir({ erro: e.message })` e `throw`.
- [ ] **Step 4: Rodar e ver passar.** · **Step 5: Commit** — `feat(rastreio): read Melhor Envio milestones every 30 minutes`

### Task 12: Passo no cron

**Files:** Modify `apps/web/src/lib/rastreio/cron.ts`, `cron.test.ts`

**Interfaces:**
- Consumes: `rodarMarcosDoMelhorEnvio` (Task 11); `DepsCron`, `DEPS`, `passo(...)` e `montar(extra)` do arquivo.
- Produces: `DepsCron` ganha `marcos: (tenantId: string, agora: Date) => Promise<unknown>` (padrão
  `rodarMarcosDoMelhorEnvio`). No laço por loja, **fora** do `if (importada)` e **antes** dos passos de WhatsApp e
  e-mail: `await passo("melhor envio", tenantId, () => deps.marcos(tenantId, agora));` — o aviso que o marco cria sai na
  mesma rodada, e a passada não depende da Yampi responder.

- [ ] **Step 1: Testes que falham:** `"o passo do Melhor Envio roda em toda loja, até sem Yampi conectada"` (o caso de
  `lerConfig` e `conexao` nulos ⇒ `log.marcos` = `[["loja-a", AGORA], ["loja-b", AGORA]]`, `falhas: 0`);
  `"Melhor Envio fora numa loja não para as outras"` (Review Focus 5: `marcos` lançando `new Error("o Melhor Envio respondeu 503")`
  em `loja-a` ⇒ `{ lojas: 2, falhas: 1, … }`, as duas lojas no `log.marcos` e `console.error`
  `"[rastreio/cron] melhor envio loja-a: o Melhor Envio respondeu 503"`); a ordem dos passos de uma loja no log é
  `varrer`, `marcos`, depois os envios.
- [ ] **Step 2: Rodar e ver falhar.** · **Step 3: Implementar.** · **Step 4: Rodar e ver passar.** · **Step 5: Commit** —
  `feat(rastreio): Melhor Envio step in the tracking cron`

### Task 13: Fechamento da Parte 4

- [ ] Quatro comandos, `verify-local.ps1`, Code Reviewer. PR `feat(rastreio): Melhor Envio milestones in the tracking
  cron (rastreio PR 8, part 4)` → CI verde → merge `--squash --delete-branch`.
- [ ] Em prod, no log da Vercel, a execução seguinte de `/api/cron/rastreio` segue `200` com `falhas: 0` (nenhuma loja
  conectada ainda: a passada devolve `null` sem chamar o Melhor Envio).

---

## Parte 5 — conexão

### Task 14: Começar e concluir o OAuth

**Files:** Create `apps/web/src/lib/melhor-envio/conexao.ts`, `conexao.test.ts`,
`apps/web/src/app/api/integracoes/melhor-envio/conectar/route.ts`, `…/melhor-envio/retorno/route.ts`

**Interfaces:**
- Consumes: Tasks 5 e 7; `rastreioLigado` (`lib/stores/rastreio-config.ts`); `hasPermission`, `getRouteTenantContext`,
  `readCookie` (`lib/links/deep-link`), `selar`, `chaveDeIntegracoes`, `getAppUrl` (`lib/environment.ts`),
  `getSupabaseAdmin`.
- Produces:
  - `type MotivoDoRetorno = "conectado" | "conta_vazia" | "recusado" | "sessao" | "erro" | "indisponivel"`;
  - `iniciarConexao(ctx: { tenantId: string; userId: string }, deps?: DepsConexao): Promise<{ status: number; corpo: unknown; cookie?: string }>` —
    validade do `state` 600 s; `rastreioLigado` falso → `403 { error: "O Rastreio de pedidos não está liberado para esta loja.", code: "rastreio_disabled" }`
    (a mensagem do mapa em `API_CONTRACTS.md`); sem credencial ou chave → `503 { error: "indisponivel" }`; senão
    `200 { url }` + `cookieDoEstadoMe(state, 600)`;
  - `concluirRetorno(url: URL, cookie: string | null, deps?: DepsConexao): Promise<MotivoDoRetorno>`;
  - `destinoNoApp(url: URL, appUrl: string): string | null` — host diferente do de `appUrl` → `appUrl` + caminho + query;
    mesmo host → `null`;
  - `DEPS = { credenciais: credenciaisMelhorEnvio, chave: chaveDeIntegracoes, ligado: rastreioLigado, criarEstado: criarEstadoOAuthMe, consumirEstado: consumirEstadoOAuthMe, papel: papelNaLoja, trocar: trocarCodigo, conta: contaDoToken, primeiraPagina: (t: string) => paginaDeEtiquetas(t, 1), salvar: salvarConexao, agora: () => new Date() }`
    (`papelNaLoja(tenantId, userId): Promise<TenantRole | null>`, local, a mesma consulta de `aindaPodeConectar` do
    retorno do Bling: `memberships` com `accepted_at` não nulo).

- [ ] **Step 1: Testes que falham** (fakes de todas as `deps`; `state` e cookie gerados por `iniciarConexao` no próprio
  teste):

| Teste | Esperado |
|---|---|
| começar: `state` só em hash no banco, inteiro no cookie e na URL | `criarEstado` com `stateHash = hashDoEstado(state)`, `tenantId`, `userId`, `expiraEm = agora + 600 s`; `url` com o mesmo `state`; cookie `melhorenvio_oauth_state=<state>; Path=/api/integracoes/melhor-envio; …; Max-Age=600` |
| começar sem Rastreio / sem env | `403` com `code: "rastreio_disabled"` / `503 { error: "indisponivel" }`, e `criarEstado` nunca |
| retorno recusado na tela do Melhor Envio | `?error=access_denied&state=…` → `"recusado"`, `consumirEstado` nunca |
| sessão | sem `state`, sem cookie, cookie de outro `state` (comparação em tempo constante dos hashes), `consumirEstado` → `null`, papel `"operator"` ou `null` → `"sessao"`; com cookie diferente, `consumirEstado` nunca é chamado |
| troca recusada / conta sem `users-read` | `trocar` lança `ErroOAuthMelhorEnvio("outro", 400, …)` → `"erro"`; `conta` lança `ErroMelhorEnvio(403)` → `"erro"` e `console.error` `"[melhor-envio/retorno] /me recusado (403): falta o escopo users-read?"`; `salvar` nunca |
| conta sem etiqueta (Review Focus 1) | `primeiraPagina` → `{ etiquetas: [], ultimaPagina: 0 }` ⇒ `"conta_vazia"`; `salvar` com `temEtiqueta: false` |
| conectado | `primeiraPagina` com uma etiqueta ⇒ `"conectado"`; `salvar("loja-a", …)` com `contaNome`/`contaEmail` do `/me`, `temEtiqueta: true`, `conectadaPor: "usuario-1"`, `expiraEm`/`renovacaoExpiraEm` da troca; os tokens abrem com `contextoDoTokenMe("loja-a", "access" / "refresh")`; `JSON.stringify` do que foi salvo não contém os tokens abertos |
| primeira página falhando não impede conectar | `primeiraPagina` lança `ErroMelhorEnvio(0)` ⇒ `"conectado"`, `temEtiqueta: null` |
| `www` → `app.` | `destinoNoApp(new URL("https://www.girumo.com.br/api/integracoes/melhor-envio/retorno?code=c&state=s"), "https://app.girumo.com.br")` → `"https://app.girumo.com.br/api/integracoes/melhor-envio/retorno?code=c&state=s"`; com o host do `app.` → `null` |

- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.** `conexao.ts` (`import "server-only"`): `state = randomBytes(32).toString("base64url")`;
  `concluirRetorno` na ordem do retorno do Bling (env → `error` → `state`+cookie → papel → `code` → troca → `/me` →
  primeira página → salvar). Token que não chegou a ser gravado é só descartado. Rotas finas:
  - `conectar/route.ts`: `POST`; `runtime = "nodejs"`, `dynamic = "force-dynamic"`; `getRouteTenantContext(req,
    { allowEngine: false })`; sem `role`, sem `authUserId` ou sem `settings:connection` → `403 { error: "Sem permissão para esta ação." }`;
    resposta `Response.json(corpo, { status, headers: { "cache-control": "no-store", "set-cookie"? } })`.
  - `retorno/route.ts`: `GET`; `destinoNoApp(url, getAppUrl())` → `302` para ele (sem mexer no cookie); senão
    `concluirRetorno` (exceção → `console.error` sem token e `"erro"`) → `302` para
    `/painel/configuracoes?secao=integracoes&melhorenvio=<motivo>` (relativo ao `req.url`), com
    `set-cookie: cookieDoEstadoMe("", 0)` e `cache-control: no-store`.
- [ ] **Step 4: Rodar e ver passar** + os dois `tsc`. · **Step 5: Commit** — `feat(rastreio): connect a store's Melhor Envio account (OAuth)`

### Task 15: Cartão (dados), desconectar, acesso e contratos

**Files:** Create `apps/web/src/lib/melhor-envio/cartao.ts`, `cartao.test.ts`, `apps/web/src/app/api/integracoes/melhor-envio/route.ts`
· Modify `apps/web/src/lib/security/request-access-policy.ts`, `request-access-policy.test.ts`, `apps/web/src/middleware.ts`,
`apps/web/system/API_CONTRACTS.md`

**Interfaces:**
- Consumes: Tasks 5, 7 e 8; `rastreioLigado`.
- Produces:
  - `type CartaoMelhorEnvio = { liberado: boolean; disponivel: boolean; conexao: null | { status: "ativa" | "reautorizar"; contaNome: string | null; contaEmail: string | null; temEtiqueta: boolean | null; primeiraPassadaFeita: boolean; ultimaConsultaEm: string | null; ultimoErro: string | null }; entreguesEm7Dias: number }`;
  - `montarCartao(tenantId: string, agora: Date, deps?: DepsCartao): Promise<CartaoMelhorEnvio>` — `DEPS = { ligado: rastreioLigado, credenciais: credenciaisMelhorEnvio, conexao: lerConexao, entregues: entreguesPeloMelhorEnvio }`;
  - `GET /api/integracoes/melhor-envio` → `200 CartaoMelhorEnvio`; `DELETE /api/integracoes/melhor-envio` →
    `apagarConexao` → `200 { ok: true }`. As duas com `settings:connection` (`403 { error: "Sem permissão para esta ação." }`),
    `cache-control: no-store`, erro → `500` com mensagem fixa e `console.error` só com a loja.
  - `classifyRequest("/api/integracoes/melhor-envio/retorno", "GET") === "public-rate-limited"`; `RATE_LIMITS` ganha
    `"/api/integracoes/melhor-envio/retorno": 20` (a entrada é obrigatória: sem ela o limite é fail-open).

- [ ] **Step 1: Testes que falham.** `cartao.test.ts`: Rastreio desligado → `{ liberado: false, disponivel: …, conexao: null, entreguesEm7Dias: 0 }`
  e `conexao`/`entregues` nunca chamados; sem conexão → `conexao: null` e `entregues` nunca chamado; conectada →
  campos mapeados, `primeiraPassadaFeita` pelo `primeiraPassadaEm`, `entregues(tenantId, agora − 7 dias)`; sem env →
  `disponivel: false`. `request-access-policy.test.ts`: `GET …/melhor-envio/retorno` → `"public-rate-limited"`;
  `POST …/retorno` → `"user"`; `GET …/retorno/outra` → `"user"`; `POST …/melhor-envio/conectar` e
  `GET`/`DELETE /api/integracoes/melhor-envio` → `"user"`.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.** `request-access-policy.ts`: linha de path exato logo abaixo da do Bling, com o comentário
  "Retorno do OAuth do Melhor Envio: navegação vinda de melhorenvio.com.br, sem Bearer; o handler autentica pelo par
  state + cookie e confere a membership de novo." `middleware.ts`: a entrada de 20, com o comentário do Bling adaptado.
  `API_CONTRACTS.md`, na seção do Rastreio: as quatro rotas (conectar `POST` → `{ url }` + cookie · 403 · 503; retorno
  `GET` → 302 para `?secao=integracoes&melhorenvio=<motivo>` com os seis motivos; `GET` do cartão →
  `CartaoMelhorEnvio`; `DELETE` → `{ ok: true }`).
- [ ] **Step 4: Rodar e ver passar** + os dois `tsc`. · **Step 5: Commit** — `feat(rastreio): Melhor Envio card data, disconnect and access policy`

### Task 16: Fechamento da Parte 5

- [ ] Quatro comandos, `verify-local.ps1`, Code Reviewer **e Security Engineer** (OAuth: `state`, cookie, desvio
  `www` → `app.`, tokens selados, rota pública). PR `feat(rastreio): connect Melhor Envio (rastreio PR 8, part 5)` →
  CI verde → merge `--squash --delete-branch`.

---

## Parte 6 — cartão em Integrações e prova

### Task 17: Cartão do Melhor Envio

**Files:** Create `apps/web/src/components/painel/configuracoes/melhor-envio.tsx`, `melhor-envio-painel.tsx`,
`melhor-envio-painel.test.ts` · Modify `apps/web/src/components/painel/configuracoes/vitrine/configuracoes-vitrine.tsx`

**Interfaces:**
- Consumes: `CartaoMelhorEnvio` e `MotivoDoRetorno` (Parte 5), `authenticatedFetch`, `useRole`, `useToast`,
  `useConfirmacao` (molde de `bling.tsx`).
- Produces: `MelhorEnvio()` (sem props; só com `settings:connection`, como o `Bling`) e o desenho puro
  `PainelDoMelhorEnvio(props: { cartao: CartaoMelhorEnvio; agora: Date; ocupado: boolean; retorno: MotivoDoRetorno | null; onConectar: () => void; onDesconectar: () => void })`.
  No `configuracoes-vitrine.tsx`, `<MelhorEnvio />` logo depois de `<Bling />` na porta "Integrações".

Textos (exatos):
- `liberado: false` → nada (o componente devolve `null`). `disponivel: false` → "Integração indisponível no momento",
  sem botão.
- Sem conexão: título "Melhor Envio"; "Avise “entregue” e “não entregue” sozinho: a Girumo lê o andamento das etiquetas
  da sua conta do Melhor Envio. Só leitura: não compra nem altera etiqueta."; botão "Conectar Melhor Envio"; dica "Entre
  com a conta do Melhor Envio que compra as etiquetas da loja. Se o navegador já estiver nela com outra conta, use uma
  janela anônima."
- Conectada: "Conectado à conta {contaNome} · {contaEmail}"; "{n} entregas confirmadas pelo Melhor Envio em 7 dias"
  (`n === 1` → "1 entrega confirmada…"); sem primeira passada: "Primeira consulta em até 30 min. Ela só grava: entrega
  antiga não vira aviso."; com `ultimaConsultaEm`: "Última consulta às {HH:mm}"; com `ultimoErro`: "A última consulta
  falhou: {ultimoErro}"; `temEtiqueta === false`: "Esta conta não tem nenhuma etiqueta. Se as etiquetas da loja saem por
  outra conta do Melhor Envio, desconecte e conecte com ela."; botão "Desconectar" com a confirmação "Desconectar o
  Melhor Envio? Os avisos de “entregue” e “não entregue” voltam a depender da Yampi."
- `reautorizar`: "O Melhor Envio recusou a renovação do acesso. Os avisos de entrega voltaram a depender da Yampi." +
  botão "Reconectar" (o mesmo `onConectar`).
- Retorno (`?melhorenvio=`): `conectado` "Melhor Envio conectado."; `conta_vazia` "Conectado, mas esta conta não tem
  nenhuma etiqueta."; `recusado` "A autorização foi recusada no Melhor Envio."; `sessao` "A conexão expirou ou começou em
  outra sessão. Tente de novo."; `erro` "Não foi possível conectar o Melhor Envio. Tente de novo."; `indisponivel`
  "Integração indisponível no momento".

- [ ] **Step 1: Testes que falham** (`renderToStaticMarkup`, molde de `bling-painel.test.ts`): não liberado → `""`;
  indisponível → o recado e nenhum `<button`; sem conexão → a promessa e "Conectar Melhor Envio"; conectada com
  `temEtiqueta: false` → "Conectado à conta Ana Souza · ana@exemplo.test" e o aviso de conta sem etiqueta (Review
  Focus 1); `reautorizar` → o recado e "Reconectar"; cada `retorno` → o texto da lista.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.** `melhor-envio.tsx` no molde de `bling.tsx`: lê `GET /api/integracoes/melhor-envio`;
  "Conectar" faz `POST …/conectar` e `window.location.assign(url)`; "Desconectar" pede confirmação, `DELETE` e recarrega;
  lê `melhorenvio` da query uma vez e tira da URL (`history.replaceState`). Classes do design system do painel
  (`pn-card`, as do cartão do Bling); nada de `style=`.
- [ ] **Step 4: Rodar e ver passar** + os dois `tsc` + lint. · **Step 5: Commit** — `feat(rastreio): Melhor Envio card in Settings › Integrations`
- [ ] **Step 6 (só se o PR 6·4 já estiver em `main`):** em Configurações › Rastreio de pedidos, junto da matriz, a linha
  do spec §5 "Para avisar “entregue” e “não entregue” sozinho, conecte o Melhor Envio" com link para
  `/painel/configuracoes?secao=integracoes`, só com o cartão `conexao === null` e `disponivel`. Se o PR 6·4 ainda não
  entrou, anotar no plano do PR 6 que ele traz a linha.

### Task 18: Fechamento da Parte 6 e prova em prod

- [ ] **Step 1:** quatro comandos, `verify-local.ps1`, Code Reviewer; PR `feat(rastreio): Melhor Envio card (rastreio PR 8,
  part 6)` → CI verde → merge `--squash --delete-branch`.
- [ ] **Step 2 (Igor, antes):** `MELHORENVIO_CLIENT_ID` e `MELHORENVIO_CLIENT_SECRET` na Vercel (os dois ambientes) e
  redeploy; a limpeza da prova 5 (`_rastreio-fase-0-resultado.md`, "Limpeza") feita: acesso do app removido nas três
  contas autorizadas na prova.
- [ ] **Step 3: Conectar a piloto pelo fluxo de produção** — o Igor, numa janela InPrivate, entra no painel da piloto,
  Configurações › Integrações › "Conectar Melhor Envio", entra com a conta que compra as etiquetas. Expected: volta com
  "Melhor Envio conectado." e "Conectado à conta {nome da conta da loja} · {e-mail}" (não a conta pessoal nem a de
  desenvolvedor).
- [ ] **Step 4: Primeira passada (até 30 min)** — leitura em prod (só leitura, pelo Igor ou pelo MCP do Supabase):
  `select status, has_labels, first_pass_at is not null as passou, last_error from public.melhorenvio_connections where tenant_id = '<piloto>';`
  → `ativa`, `true`, `true`, nulo; `select count(*) from public.tracking_notices n join public.tracking_orders o on o.id = n.order_id where o.tenant_id = '<piloto>' and o.status_raw like 'melhorenvio:%' and n.created_at > <hora da conexão>;`
  → 0 (a primeira passada não avisa).
- [ ] **Step 5:** a prova de ponta a ponta é o Step 6b do PR 7 (entregue automático com aviso). Card (prod):
  `update public.board_features set blocker = 'PR 8 no ar: Melhor Envio conectado na piloto e primeira passada sem aviso; falta a prova do entregue automático (PR 7, Step 6b)' where key = 'rastreio-pedidos';`
- [ ] **Step 6:** sugerir `rag insert "decisão: Rastreio lê os marcos do Melhor Envio pela lista paginada /me/orders a cada 30 min, casa pelo tracking, grava por rastreio_gravar_marco (mesma regra da etapa) e não avisa na primeira passada" --source decisao-2026-11-02`;
  ao encerrar, "PRs que deixei abertos: …".

---

## Interface com os outros PRs

- **PR 1:** a RPC nova usa `app.rastreio_etapa_pode_mudar` e devolve o formato da `rastreio_gravar_pedido`; o
  `PedidoGravado` é o mesmo. `rastreio_purgar` apaga o pedido entregue pelo marco no `purge_after`.
- **PR 2 e PR 4 (e PR 5):** `avisarEtapaNova` leva tudo que fica depois do `gravarPedido`, inclusive os ganchos de envio
  imediato; o PR 5, se vier depois, pendura o WhatsApp dentro dela, não em `registrarPedidoDaYampi`. No cron, o passo
  `melhor envio` fica antes de WhatsApp e e-mail.
- **PR 6:** a linha "conecte o Melhor Envio" na tela do Rastreio (Task 17, Step 6). O sininho `rastreio_melhor_envio`
  aponta para `/painel/configuracoes?secao=integracoes`.
- **PR 7:** o Step 6b confere `status_raw = 'melhorenvio:delivered'` no pedido de teste. A `/privacidade` já cita o
  Melhor Envio ("só o andamento da entrega").

## Divergências com o spec e decisões deste plano (o spec foi ajustado no mesmo PR de docs)

1. **Marco por RPC irmã, não pela do PR 1.** A `rastreio_gravar_pedido` exige `numero`, `order_created_at` e
   `status_raw` (`not null`) e carimba `now()`; o marco só muda a etapa e tem data própria (`delivered_at`). A
   `rastreio_gravar_marco` usa a mesma regra e a mesma trava de linha.
2. **Sem `carrier_checked_at`.** Com a lista paginada (prova 5), a consulta é por loja, não por pedido: o controle de 30
   min é `last_check_at` na conexão, reivindicado por `update` condicional.
3. **Sem status `desconectada`.** Desconectar apaga a linha; reconectar recomeça com a primeira passada sem aviso.
4. **Desconectar é `DELETE /api/integracoes/melhor-envio`** (molde do Bling), não `POST …/desconectar`.
5. **Callback no `www`, sessão no `app.`.** O callback registrado na Fase 0 é o do `www`; o cookie do `state` nasce no
   `app.` (host-only). O retorno no `www` só desvia para o `app.`; o `redirect_uri` da troca é sempre o do `www`. Se o Igor
   trocar o callback do app no Melhor Envio para o `app.`, o desvio vira código morto — e o `urlDoRetorno` passa a usar
   `getAppUrl()`.
6. **`status_raw = melhorenvio:<status>`** quando o marco muda a etapa (o PR 7 lê). A contagem "entregas confirmadas
   pelo Melhor Envio" conta esse `status_raw`; se a Yampi marcar `delivered` depois, o `status_raw` volta a `delivered` e
   a entrega sai da conta (subconta, nunca soma demais).
7. **Datas do Melhor Envio sem fuso lidas como Brasília** (`dataDaYampi`). Conferir na primeira passada real; errar o
   fuso desloca 3 h, dentro da folga de 1 dia da paginação e da janela de 3 dias.
8. **Sininho só na transição** para `reautorizar` (`update … where status = 'ativa'`), sem coluna de "já avisei".
9. **`suspended` não vira `problema`** (spec §1.1 só lista `undelivered` e `paused`; `suspended` é da etiqueta).
10. **Sem revogação no Melhor Envio ao desconectar.** A prova 5 não provou endpoint de revogação; o acesso some no
    Melhor Envio quando a lojista remove o app lá (e na reconexão o par antigo deixa de ser usado).
11. **Conta e etiqueta guardadas na conexão** (`account_name`, `account_email`, `has_labels`): pedido da prova 5, contra
    a conta errada autorizada sem perguntar.
12. **`problema` do Melhor Envio pode piscar para `enviado`** quando a Yampi mexe no pedido (`problema → enviado` é
    permitido pela regra do PR 1) e volta na passada seguinte. Aviso não repete (`unique (order_id, etapa, channel)`).
    `ponytail:` aceitar até aparecer na prova; o conserto é a `rastreio_gravar_pedido` não aceitar `enviado` da Yampi
    sobre `status_raw like 'melhorenvio:%'`.
