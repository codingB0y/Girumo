# Rastreio do pedido — PR 1: Banco (plano de implementação)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O banco do Rastreio — três tabelas, a regra "a etapa não volta" e a gravação do pedido segura contra duas
chamadas ao mesmo tempo — com os tipos e as stores que os PRs 2 a 6 consomem.

**Architecture:** Uma migração cria `tracking_orders`, `tracking_notices` e `tracking_settings` (RLS sem policy, só
`service_role`), a ordem e a regra das etapas em `app.` (`immutable`), a RPC que grava o pedido e o purge. A RPC cria
com `insert … on conflict do nothing`; se a linha existe, trava com `select … for update` e só então aplica a regra —
quem chega depois espera e lê o que o outro gravou. As stores selam o e-mail, chamam a RPC e filtram por loja.

**Tech Stack:** Postgres/Supabase (plpgsql, migração pelo CI), `tsx --test` (node:test) com PostgREST falso,
`lib/security/secret-box.ts` (AES-256-GCM).

**Spec:** `docs/superpowers/specs/2026-10-29-rastreio-pedidos-design.md` (§1.1, §1.2, §2, §4, §6–§8).
Índice: `docs/superpowers/plans/2026-10-29-rastreio-pedidos-00-indice.md` — Contrato, Global Constraints e Review Focus
valem aqui. O item 1 do Review Focus vira os blocos 4–5 da conferência (Task 3) e o teste de `criarAvisos` (Task 9).

## Antes de começar

- [ ] Branch `feat/rastreio-pr1-banco` em worktree novo: `git fetch origin main` →
  `git worktree add .claude/worktrees/rastreio-pr1-banco -b feat/rastreio-pr1-banco origin/main` → as duas junctions
  do índice ("Ambiente do worktree").
- [ ] B·1a em `main` (a FK de `message_id` e a flag moram lá): `git grep -l "rastreio_enabled" origin/main --
  apps/web/supabase/migrations` e `git grep -l "public.private_messages" origin/main -- apps/web/supabase/migrations`.
  Expected: a migração do banco comum nos dois. Vazio → parar e avisar.
- [ ] Schema do `pgcrypto` em dev (só leitura): `select extnamespace::regnamespace from pg_extension where extname =
  'pgcrypto';` Expected: `extensions` (padrão do Supabase; nenhuma migração do repo usa `gen_random_bytes`). Outro →
  usar esse no default do `link_token`.
- [ ] Card (prod): `select public.move_card('rastreio-pedidos', 'em_construcao', 'PR 1 (banco) começou',
  'docs/superpowers/plans/2026-10-29-rastreio-pedidos-pr1-banco.md');` — se o classificador recusar, vai para a lista do
  Igor no fim.
- `<ts>` = `AAAAMMDDHHMMSS` do dia da execução, maior que o da migração do B·1a.

## Arquivos

| Arquivo | Parte | Responsabilidade |
|---|---|---|
| `apps/web/supabase/migrations/<ts>_rastreio_pedidos.sql` | 1 | tabelas, índices, RLS/ACL e as quatro funções |
| `deploy/supabase/apply-order.txt` | 1 | a migração no fim da ordem |
| `infra/tests/rastreio-check.sql` | 1 | conferência nos dois bancos; imprime a assinatura para a baseline |
| `deploy/supabase/schema-baseline.json` | 1 | +3 `t\|` e +2 `f\|` |
| `apps/web/src/lib/rastreio/tipos.ts` + `tipos.test.ts` | 2 | tipos e constantes do contrato (puro, sem `server-only`) |
| `apps/web/src/lib/stores/rastreio-config.ts` + teste | 2 | `tracking_settings` e a flag |
| `apps/web/src/lib/stores/rastreio-pedidos.ts` + teste | 2 | RPC de gravar, leituras, parar avisos, e-mail selado, purge |
| `apps/web/src/lib/stores/rastreio-avisos.ts` + teste | 2 | `tracking_notices`: criar, fila, marcar, reabrir |
| `apps/web/system/API_CONTRACTS.md` | 2 | contratos das rotas do spec §4 |

13 arquivos = dois PRs. A Parte 2 (`feat/rastreio-pr1-stores`) abre de `origin/main` depois do merge da Parte 1. **Não
dar push da Parte 1 antes das Tasks 1–4 verdes no dry-run**: o `migrate-dev` grava o nome do arquivo em
`ops.applied_migrations` e não reaplica arquivo editado.

## Parte 1 — banco

**Conferência:** de `apps/web`, com `supabase/.temp/project-ref` = `wfjuwogxaupyadwhvoxy` (senão `supabase link
--project-ref wfjuwogxaupyadwhvoxy --yes`): `supabase db query --linked -o json -f ..\..\infra\tests\rastreio-check.sql`.
**Dry-run** = `rastreio-dry-run.sql` no scratchpad: `begin;` + migração + migração (idempotência) + conferência, cujo
`rollback;` desfaz tudo. Se o classificador recusar DDL mesmo em transação desfeita, registrar e seguir: a prova passa a
ser a Task 5, Step 3.

### Task 1: Tabelas, índices e privilégios

**Files:** Create `apps/web/supabase/migrations/<ts>_rastreio_pedidos.sql` (seção 1), `infra/tests/rastreio-check.sql`
(preâmbulo, blocos 1–2, fim) · Modify `deploy/supabase/apply-order.txt`

**Interfaces:**
- Consumes: `organizations(id)`, `tracked_links(id)`, `private_messages(id)` e `tenant_settings.rastreio_enabled` com
  trigger de guarda (B·1a), `public.phone_key(text)` (`immutable`, `20261010130000`).
- Produces: as tabelas abaixo; as stores leem no 23505 `tracking_settings_pkey` e `tracking_settings_public_slug_key`.

Colunas (`not null` salvo "nulo"):
- `tracking_orders`: `id uuid pk default gen_random_uuid()`, `tenant_id → organizations on delete cascade`, `source
  default 'yampi' check (= 'yampi')`, `external_id`, `numero`, `order_created_at timestamptz`, `status_raw`, `etapa check
  (in as 8 de ETAPAS)`, `etapa_at default now()`, `events jsonb default '[]' check (jsonb_typeof = 'array')`;
  `shipment_service`, `tracking_code`, `tracking_url`, `buyer_first_name` nulos; `buyer_phone` nulo `check (~
  '^55[1-9]{2}[0-9]{8,9}$')` (forma de `telefoneCanonico`); `phone_key generated always as (public.phone_key(buyer_phone))
  stored` (molde `bling_contacts`); `phone_last4 generated always as (right(buyer_phone, 4)) stored`; `buyer_email_enc`
  nulo; `doc_hmac` nulo `check (~ '^[0-9a-f]{64}$')`; `link_token unique default encode(extensions.gen_random_bytes(16),
  'hex') check (~ '^[0-9a-f]{32}$')`; `notices_stopped_at`, `purge_after` nulos; `created_at`, `updated_at default now()`;
  `unique (tenant_id, source, external_id)`; `unique (tenant_id, id)` (alvo da FK composta).
- `tracking_notices`: `id uuid pk`, `tenant_id`, `order_id`, `foreign key (tenant_id, order_id) references
  tracking_orders (tenant_id, id) on delete cascade` (aviso de uma loja nunca aponta pedido de outra), `etapa check (in
  ETAPAS_COM_AVISO)`, `channel check (in ('whatsapp','email'))`, `status default 'pendente' check (os 7 de
  AvisoStatus)`, `message_id uuid` nulo `references private_messages(id) on delete set null`, `error` nulo,
  `attempts`/`resends integer default 0 check (>= 0)`, `next_try_at`/`sent_at` nulos, `created_at`, `updated_at`;
  `unique (order_id, etapa, channel)`.
- `tracking_settings`: `tenant_id uuid pk → organizations on delete cascade`, `public_slug unique check (~
  '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length between 3 and 40)` (o de `bio_pages.slug`), `matrix jsonb default
  <MATRIZ_PADRAO> check (jsonb_typeof = 'object')`, `notify_store_on_problem default true`, `vip_link_id uuid` nulo
  `references tracked_links(id) on delete set null`, `store_whatsapp` nulo sem padrão, `imported_at`/`sweep_cursor
  timestamptz` nulos, `updated_at`.
- Índices: `tracking_orders_doc_idx (tenant_id, doc_hmac)`, `tracking_orders_etapa_idx (tenant_id, etapa, etapa_at
  desc)`, `tracking_notices_fila_idx (tenant_id, status, next_try_at) where status in ('pendente','enviando')`,
  `tracking_notices_message_idx (message_id) where message_id is not null`; o de `link_token` vem do `unique`.
- `MATRIZ_PADRAO`, mesmo literal na migração, na conferência e na Task 6: `{"confirmado": {"whatsapp": false, "email":
  false}, "enviado": {"whatsapp": true, "email": true}, "retirada": {"whatsapp": true, "email": true}, "problema":
  {"whatsapp": true, "email": true}, "entregue": {"whatsapp": true, "email": false}}`

- [ ] **Step 1: Preâmbulo, blocos 1–2 e fim da conferência.** Cabeçalho no molde de `infra/tests/bio-pages-check.sql`
  (rodar nos dois bancos; `begin` … `rollback`; cada bloco levanta `'FALHOU: …'`; leitura num comando depois da escrita;
  `now()` é um só na transação, os asserts usam igualdade; o bloco 6 varre todas as lojas e escreve — em prod é do Igor).
  Lojas TA `7a5c0000-0000-4000-8000-00000000000a` e TB `…0b` em `organizations (id, tenant_id, name, slug)`.
  - Bloco 1 (contrato, molde do bloco 1 de `bio-pages-check.sql`): três tabelas com RLS, sem policy, nada para
    `anon`/`authenticated` (tabela e coluna), `service_role` com SELECT/INSERT/UPDATE/DELETE; `rastreio_enabled` boolean
    `not null` default `false` e um trigger ligado em `tenant_settings` cuja função a cita no `prosrc` (B·1a); FKs de
    `tracking_notices` (`private_messages` com `confdeltype = 'n'`, `tracking_orders` com 2 colunas e `'c'`); as duas
    constraints de `tracking_settings`; os quatro índices; `gen_random_bytes(16)` no default do `link_token`.
  - Bloco 2 (cada recusa num `begin … exception when <erro> then null; end`): settings de TA `check-rastreio-ta` →
    `matrix = <MATRIZ_PADRAO>`, `notify_store_on_problem`, resto nulo; mesmo slug em TB → `unique_violation` com
    `tracking_settings_public_slug_key`; TA de novo → com `tracking_settings_pkey`; slugs `ab`, `Check-ta`, `check--ta`,
    `-check-ta`, 41 caracteres → `check_violation`. Pedido O1 de TA por insert direto (`chk-n1`, `2001`, `now()`,
    `on_carriage`, `enviado`, `5511987654321`) → token 32 hex, `phone_key = '1187654321'`, `phone_last4 = '4321'`;
    telefone `11987654321`, etapa `xyz`, `doc_hmac` `abc` → `check_violation`. Aviso (TA, O1, `enviado`, `whatsapp`) →
    `pendente`, `attempts`/`resends` 0; de novo com `on conflict (order_id, etapa, channel) do nothing` → `count(*) = 1`;
    sem ele → `unique_violation`; etapa `separando`, canal `sms`, status `xyz` → `check_violation`; (TB, O1, `enviado`,
    `email`) → `foreign_key_violation`.
  - Fim do arquivo (dentro da transação, para aparecer também no dry-run):
    ```sql
    select json_object_agg(kind || '|' || nome, sig order by kind || '|' || nome collate "C") as r
      from public.schema_signature() where nome like 'tracking\_%' or nome like 'rastreio\_%';
    rollback;
    ```
- [ ] **Step 2: Conferência em dev e ver falhar.** Expected: `FALHOU: tabela public.tracking_orders ausente`.
- [ ] **Step 3: Seção 1 da migração.** Cabeçalho no padrão de `20261013120000_integracao_bling.sql` (por quê, só
  `service_role`, idempotente, muda a baseline, conferir com `infra/tests/rastreio-check.sql`); `if not exists`; RLS nas
  três; `revoke all … from public, anon, authenticated`; `grant select, insert, update, delete … to service_role`. No fim
  de `apply-order.txt`: `# <data>: Rastreio do pedido, PR 1 — tabelas tracking_* (só service_role), regra da etapa,
  rastreio_gravar_pedido e rastreio_purgar. Depois do B·1a. Muda a baseline; conferir com infra/tests/rastreio-check.sql.`
  + o caminho do arquivo.
- [ ] **Step 4: Dry-run.** Expected: sem `FALHOU`; `r` com `t|tracking_notices`, `t|tracking_orders`, `t|tracking_settings`.
- [ ] **Step 5: Commit.** `git add` dos três arquivos; `git commit -m "feat(db): rastreio tables, indexes and
  server-only grants" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"` (todo commit leva esta linha).

### Task 2: A regra da etapa

**Files:** Modify a migração (seção 2) e a conferência (bloco 3)

**Interfaces:** Produces `app.rastreio_etapa_ordem(p_etapa text) returns integer` e
`app.rastreio_etapa_pode_mudar(p_atual text, p_nova text) returns boolean`, `immutable` (índice, "Banco").

- [ ] **Step 1: Bloco 3.** Contrato: existem, `provolatile = 'i'`, `search_path` fixo, EXECUTE só do `service_role`.
  `string_agg(e || '=' || app.rastreio_etapa_ordem(e), ',' order by n)` nas 8 etapas =
  `aguardando_pagamento=1,confirmado=2,separando=3,enviado=4,retirada=5,problema=5,entregue=6,cancelado=7`;
  `app.rastreio_etapa_ordem('xyz') is null`. Regra em `values (atual, nova, esperado)`, falhando com a lista dos que
  divergem: `(null,confirmado,t)`, `(confirmado,confirmado,f)`, `(separando,enviado,t)`, `(enviado,separando,f)`,
  `(entregue,enviado,f)`, `(problema,enviado,t)`, `(retirada,enviado,t)`, `(enviado,retirada,t)`,
  `(retirada,problema,t)`, `(problema,retirada,t)`, `(problema,entregue,t)`, `(entregue,problema,f)`,
  `(entregue,cancelado,t)`, `(aguardando_pagamento,cancelado,t)`, `(cancelado,entregue,f)`,
  `(cancelado,aguardando_pagamento,f)`, `(confirmado,aguardando_pagamento,f)`, `(enviado,null,f)`.
- [ ] **Step 2: Dry-run e ver falhar.** Expected: `FALHOU` no bloco 3 (funções ausentes).
- [ ] **Step 3: Seção 2** (ACL explícito nas duas, como na seção 1):
  ```sql
  create or replace function app.rastreio_etapa_ordem(p_etapa text)
  returns integer language sql immutable set search_path to 'public', 'app'
  as $$
    select case p_etapa
      when 'aguardando_pagamento' then 1 when 'confirmado' then 2 when 'separando' then 3 when 'enviado' then 4
      when 'retirada' then 5 when 'problema' then 5 when 'entregue' then 6 when 'cancelado' then 7 end
  $$;

  -- Aviso atrasado não leva a etapa para trás; cancelado vale sempre e não sai; retirada e problema voltam a enviado.
  create or replace function app.rastreio_etapa_pode_mudar(p_atual text, p_nova text)
  returns boolean language sql immutable set search_path to 'public', 'app'
  as $$
    select coalesce(p_atual is null
      or (p_nova <> p_atual and p_atual <> 'cancelado'
          and (p_nova = 'cancelado'
               or (p_nova = 'enviado' and p_atual in ('retirada', 'problema'))
               or app.rastreio_etapa_ordem(p_nova) >= app.rastreio_etapa_ordem(p_atual))), false)
  $$;
  ```
- [ ] **Step 4: Dry-run.** Expected: sem `FALHOU`. **Step 5: Commit** — `feat(db): rastreio stage order that never goes back`.

### Task 3: `public.rastreio_gravar_pedido`

**Files:** Modify a migração (seção 3) e a conferência (blocos 4–5)

**Interfaces:** Consumes a Task 2 · Produces `public.rastreio_gravar_pedido(p_tenant uuid, p_pedido jsonb) returns
jsonb`, `security definer`, só `service_role`; chaves de `p_pedido` e retorno `{"id", "etapa", "etapa_anterior", "mudou",
"link_token", "notices_stopped_at", "tem_telefone", "tem_email"}` do índice (os três últimos lidos da linha gravada:
`notices_stopped_at`, `buyer_phone is not null`, `buyer_email_enc is not null`). Criação devolve `mudou = true`,
`etapa_anterior = null`. O bloco 5 confere os três campos novos no retorno da criação e da atualização.

- [ ] **Step 1: Blocos 4–5.** `v_base := '{"numero": "1001", "order_created_at": "2026-10-20T12:00:00Z",
  "buyer_first_name": "Ana", "buyer_phone": "5511987654321", "doc_hmac": "<64 × a>", "historico": []}'`; cada chamada é
  `public.rastreio_gravar_pedido(<loja>, v_base || jsonb_build_object('external_id', …, 'etapa', …, 'status_raw', …,
  'tracking_code', …))`.
  - Bloco 4, contrato: existe, `prosecdef`, `search_path` fixo, EXECUTE só do `service_role`. **Prova da corrida** (a
    conferência é uma sessão só; a prova é a ordem no corpo mais a semântica do Postgres: o `insert … on conflict do
    nothing` espera a transação concorrente e, em READ COMMITTED, o `for update` relê a versão que ela gravou): com
    `v_src := regexp_replace(lower(prosrc), '--[^\n]*', '', 'g')`, exigir `0 < position('do nothing') < position('for
    update') < position('rastreio_etapa_pode_mudar') < position('update public.tracking_orders')`, senão `FALHOU: a regra
    da etapa precisa vir depois do for update`.
  - Bloco 4, novo e repetido (TA salvo indicação):

    | chamada | devolve | linha depois |
    |---|---|---|
    | `chk-1` confirmado/paid | `mudou` t, `etapa_anterior` null, `link_token` 32 hex | `events = [{confirmado, now()}]`, `etapa_at = now()`, `purge_after` nulo |
    | `chk-1` igual (a varredura repetindo o aviso) | `mudou` f, anterior confirmado, mesmo `id` e token | uma linha, `events` com 1 |
    | `chk-1` na TB | `mudou` t, outro `id` | a de TA intacta |
    | `chk-4` com `etapa` nula | aguardando_pagamento, `mudou` t | `events = [{aguardando_pagamento, now()}]` |
    | `chk-5` separando, histórico `[{confirmado, 2026-10-20T13:00Z}, {separando, 2026-10-21T09:00Z}]` | `mudou` t | `events` = o histórico, `etapa_at = 2026-10-21T09:00Z` |
    | `chk-6` enviado, o mesmo histórico | `mudou` t | histórico + `{enviado, now()}`, `etapa_at = now()` |
    | `chk-7` separando, `carimbar: false`, histórico `[]` (importação) | `mudou` t | `events = []`, `etapa_at = order_created_at` (sem data inventada) |
    | `external_id` vazio · etapa `xyz` · telefone `11987654321` | exceção `%obrigatórios%` · `%etapa desconhecida%` · `check_violation` | nada gravado |

  - Bloco 5, "não volta" (`chk-1` de TA continua):

    | # | etapa / status_raw / código | fica | mudou | anterior | events | também |
    |---|---|---|---|---|---|---|
    | a | enviado / on_carriage / `AA123456789BR` | enviado | t | confirmado | 2 | código gravado |
    | b | entregue / delivered / nulo | entregue | t | enviado | 3 | `purge_after = now() + 90 days`; código continua |
    | c | enviado / on_carriage / `AA123456789BR` (atrasado) | entregue | f | entregue | 3 | `status_raw` delivered; `purge_after` igual |
    | d | nula / `alias_novo` | entregue | f | entregue | 3 | `status_raw` delivered |

    `chk-2`: separando/invoiced → separando/on_carriage sem código (f, `status_raw` on_carriage) → enviado → problema
    → enviado → retirada → problema → retirada (todas t); fica retirada, 7 eventos, `purge_after` nulo. `chk-3`:
    confirmado → cancelado (t, `purge_after = now() + 90 days`) → enviado, entregue, confirmado (f); fica cancelado, 2.
- [ ] **Step 2: Dry-run e ver falhar.** Expected: `FALHOU` no bloco 4 (função ausente).
- [ ] **Step 3: Seção 3** (ACL explícito depois):
  ```sql
  create or replace function public.rastreio_gravar_pedido(p_tenant uuid, p_pedido jsonb)
  returns jsonb language plpgsql volatile security definer set search_path to 'public', 'app'
  as $$
  declare
    v_ext   text  := nullif(btrim(p_pedido->>'external_id'), '');
    v_etapa text  := p_pedido->>'etapa';                         -- null = alias desconhecido
    v_hist  jsonb := coalesce(p_pedido->'historico', '[]'::jsonb);
    v_nova  text  := coalesce(v_etapa, 'aguardando_pagamento');
    v_carimbar boolean := coalesce((p_pedido->>'carimbar')::boolean, true);  -- false = importação
    v_linha public.tracking_orders;
    v_mudou boolean;
    v_em    timestamptz;
  begin
    if p_tenant is null or v_ext is null then raise exception 'rastreio_gravar_pedido: loja e external_id obrigatórios'; end if;
    if v_etapa is not null and app.rastreio_etapa_ordem(v_etapa) is null then
      raise exception 'rastreio_gravar_pedido: etapa desconhecida %', v_etapa; end if;
    if jsonb_typeof(v_hist) <> 'array' then raise exception 'rastreio_gravar_pedido: historico precisa ser uma lista'; end if;
    -- Criação: pedido ao vivo carimba a etapa com a hora em que a Girumo viu. Importado sem histórico datado da
    -- etapa atual não ganha data inventada (spec §1.1): events fica como veio e etapa_at = criação do pedido.
    if v_carimbar and (v_hist -> -1) ->> 'etapa' is distinct from v_nova then
      v_hist := v_hist || jsonb_build_array(jsonb_build_object('etapa', v_nova, 'at', now())); end if;
    v_em := case when (v_hist -> -1) ->> 'etapa' = v_nova then ((v_hist -> -1) ->> 'at')::timestamptz
                 else coalesce((p_pedido->>'order_created_at')::timestamptz, now()) end;

    loop
      insert into public.tracking_orders (tenant_id, source, external_id, numero, order_created_at, status_raw, etapa,
        etapa_at, events, shipment_service, tracking_code, tracking_url, buyer_first_name, buyer_phone, buyer_email_enc,
        doc_hmac, purge_after)
      values (p_tenant, 'yampi', v_ext, p_pedido->>'numero', (p_pedido->>'order_created_at')::timestamptz,
        p_pedido->>'status_raw', v_nova, v_em, v_hist, p_pedido->>'shipment_service', p_pedido->>'tracking_code',
        p_pedido->>'tracking_url', p_pedido->>'buyer_first_name', p_pedido->>'buyer_phone', p_pedido->>'buyer_email_enc',
        p_pedido->>'doc_hmac', case when v_nova in ('entregue', 'cancelado') then v_em + interval '90 days' end)
      on conflict (tenant_id, source, external_id) do nothing
      returning * into v_linha;
      if found then return jsonb_build_object('id', v_linha.id, 'etapa', v_linha.etapa, 'etapa_anterior', null,
                                              'mudou', true, 'link_token', v_linha.link_token,
                                              'notices_stopped_at', v_linha.notices_stopped_at,
                                              'tem_telefone', v_linha.buyer_phone is not null,
                                              'tem_email', v_linha.buyer_email_enc is not null); end if;
      -- Já existe, ou outra transação acabou de criar (o insert esperou por ela). A trava vem ANTES da regra:
      -- quem chega depois espera aqui e lê a etapa que o outro gravou.
      select * into v_linha from public.tracking_orders t
       where t.tenant_id = p_tenant and t.source = 'yampi' and t.external_id = v_ext for update;
      exit when found;  -- o purge apagou entre os dois comandos: cria de novo
    end loop;

    v_mudou := v_etapa is not null and app.rastreio_etapa_pode_mudar(v_linha.etapa, v_etapa);
    v_nova  := case when v_mudou then v_etapa else v_linha.etapa end;
    v_em    := case when v_mudou then now() else v_linha.etapa_at end;

    update public.tracking_orders t set
      etapa = v_nova, etapa_at = v_em, updated_at = now(),
      events = case when v_mudou then t.events || jsonb_build_array(jsonb_build_object('etapa', v_nova, 'at', v_em))
                    else t.events end,
      status_raw = case when v_mudou or v_etapa = v_linha.etapa then p_pedido->>'status_raw' else t.status_raw end,
      purge_after = case when v_nova in ('entregue', 'cancelado') then v_em + interval '90 days' end,
      -- Nulo não apaga: o aviso atrasado sem código não tira o código do pedido entregue.
      shipment_service = coalesce(p_pedido->>'shipment_service', t.shipment_service),
      tracking_code = coalesce(p_pedido->>'tracking_code', t.tracking_code),
      tracking_url = coalesce(p_pedido->>'tracking_url', t.tracking_url),
      buyer_first_name = coalesce(p_pedido->>'buyer_first_name', t.buyer_first_name),
      buyer_phone = coalesce(p_pedido->>'buyer_phone', t.buyer_phone),
      buyer_email_enc = coalesce(p_pedido->>'buyer_email_enc', t.buyer_email_enc),
      doc_hmac = coalesce(p_pedido->>'doc_hmac', t.doc_hmac)
    where t.id = v_linha.id;

    return jsonb_build_object('id', v_linha.id, 'etapa', v_nova, 'etapa_anterior', v_linha.etapa,
                              'mudou', v_mudou, 'link_token', v_linha.link_token,
                              'notices_stopped_at', v_linha.notices_stopped_at,
                              'tem_telefone', coalesce(p_pedido->>'buyer_phone', v_linha.buyer_phone) is not null,
                              'tem_email', coalesce(p_pedido->>'buyer_email_enc', v_linha.buyer_email_enc) is not null);
  end;
  $$;
  ```
- [ ] **Step 4: Dry-run.** Expected: sem `FALHOU`; `r` ganha `f|rastreio_gravar_pedido(p_tenant uuid, p_pedido jsonb)`.
- [ ] **Step 5: Commit** — `feat(db): save a tracked order under a row lock, stage never goes back`.

### Task 4: `public.rastreio_purgar`

**Files:** Modify a migração (seção 4) e a conferência (bloco 6)

**Interfaces:** Produces `public.rastreio_purgar() returns integer`, `security definer`, só `service_role`; global (a
outra exceção do índice ao filtro por loja).

- [ ] **Step 1: Bloco 6.** Contrato igual ao do bloco 4. Pedidos de TA por insert direto: P1 com `purge_after = now() -
  interval '1 minute'` e um aviso, P2 com `now() + interval '1 day'`, P3 nulo. `public.rastreio_purgar() >= 1` (conta
  lojas reais também; o rollback desfaz); P1 e o aviso dele sumiram; P2 e P3 ficaram.
- [ ] **Step 2: Dry-run e ver falhar** (bloco 6). **Step 3: Seção 4** (ACL explícito depois):
  ```sql
  create or replace function public.rastreio_purgar()
  returns integer language sql volatile security definer set search_path to 'public', 'app'
  as $$
    with apagados as (delete from public.tracking_orders t where t.purge_after < now() returning 1)
    select count(*)::integer from apagados
  $$;
  ```
- [ ] **Step 4: Dry-run.** Expected: sem `FALHOU`; `r` com as 5 chaves. **Step 5: Commit** — `feat(db): purge tracked
  orders 90 days after the last stage`.

### Task 5: Fechamento da Parte 1

- [ ] **Step 1:** `powershell -ExecutionPolicy Bypass -File infra/scripts/verify-local.ps1` verde.
- [ ] **Step 2:** `git push -u origin feat/rastreio-pr1-banco`; `gh pr create --base main --title "feat(db): rastreio
  tables, stage rule and order RPC (rastreio PR 1, part 1)"` (resumo, spec, plano de teste com a conferência em dev e em
  prod, `🤖 Generated with [Claude Code](https://claude.com/claude-code)`). O `migrate-dev` aplica.
- [ ] **Step 3:** conferência em dev com o arquivo (não o dry-run). Expected: `r` com as 5 chaves.
- [ ] **Step 4: Baseline.** Com `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` de dev: `npm run schema:baseline`; sem eles
  (índice, "Ambiente do worktree"): colar as 5 chaves de `r` em `deploy/supabase/schema-baseline.json`, como o #508.
  Commit `chore(schema): baseline with tracking tables (dev = prod + this PR)`, push. Expected: `drift` verde. Outro PR
  com migração mergeou antes: `gh pr update-branch <N>` e refazer este passo.
- [ ] **Step 5:** revisão de segurança (agente Security Engineer: ACL, `security definer` com `search_path`, RLS sem
  policy, FK composta) → CI verde (`gh pr checks <N>`) → `gh pr merge <N> --squash --delete-branch` (à mão no verde;
  `main` sem proteção, nunca auto-merge). O `migrate-prod` aplica.
- [ ] **Step 6:** conferência em prod (`nidoatbxaylrkcgbszns`; o Igor roda ou dá o ok). Card: `update
  public.board_features set blocker = 'PR 1 parte 1 no ar (banco); falta a parte 2 (tipos e stores)' where key =
  'rastreio-pedidos';`

## Parte 2 — tipos, stores e contratos

Worktree novo de `origin/main` depois do merge da Parte 1, branch `feat/rastreio-pr1-stores`. Harness: o PostgREST
falso de `apps/web/src/lib/stores/bling-pedidos.test.ts` (método, URL, `Prefer` e corpo; molde de `leads.test.ts`), com
`filtros(url)` sem o `select`. Toda leitura/escrita por filtro prova `tenant_id=eq.loja-a`; insert prova `tenant_id` em
cada linha; RPC prova `p_tenant`. Rodar `npm --workspace apps/web test` (FAIL antes, PASS depois) e os dois `tsc`.

### Task 6: Tipos

**Files:** Create `apps/web/src/lib/rastreio/tipos.ts`, `apps/web/src/lib/rastreio/tipos.test.ts`

**Interfaces:** Produces o bloco "Tipos" do índice, exatamente, com `MATRIZ_PADRAO` = o literal da Task 1.

- [ ] **Step 1: Testes que falham.**
  ```ts
  test("as 8 etapas na ordem do spec §1.1 e as 5 que têm aviso", () => {
    assert.deepEqual([...ETAPAS], ["aguardando_pagamento", "confirmado", "separando", "enviado", "retirada", "problema", "entregue", "cancelado"]);
    assert.deepEqual([...ETAPAS_COM_AVISO], ["confirmado", "enviado", "retirada", "problema", "entregue"]);
  });
  test("MATRIZ_PADRAO é a coluna do §1.1 e o default de tracking_settings.matrix", () => {
    assert.deepEqual(MATRIZ_PADRAO, { confirmado: { whatsapp: false, email: false }, enviado: { whatsapp: true, email: true },
      retirada: { whatsapp: true, email: true }, problema: { whatsapp: true, email: true }, entregue: { whatsapp: true, email: false } });
  });
  ```
- [ ] **Step 2–4:** FAIL (módulo ausente) → implementar → PASS. **Step 5: Commit** — `feat(rastreio): shared types and
  the default notice matrix`.

### Task 7: Store da config

**Files:** Create `apps/web/src/lib/stores/rastreio-config.ts`, `apps/web/src/lib/stores/rastreio-config.test.ts`

**Interfaces:**
- Consumes: Task 6; `getOrganizationProfile` (`lib/stores/organization-profile.ts`), `slugify` (`lib/pages/slug.ts`) e
  `slugReservado` (`lib/bio/documento.ts`) — o que a bio já usa no `sugerirSlug`.
- Produces: as funções de `rastreio-config.ts` do índice + `export class SlugEmUso extends Error {}`, lançada por
  `salvarConfig` quando o 23505 cita `tracking_settings_public_slug_key` (o PR 6 responde 409).

- [ ] **Step 1: Testes que falham.**
  - `"rastreioLigado lê a flag da própria loja; sem linha é desligado"`: GET `tenant_settings`, `select=rastreio_enabled`,
    filtros `{ tenant_id: "eq.loja-a" }`; `[{ rastreio_enabled: true }]` → `true`; `[]` → `false`.
  - `"lojasComRastreio é a única leitura sem loja"`: filtros `{ rastreio_enabled: "eq.true" }` → `["loja-a", "loja-b"]`.
  - `"lerConfig traduz a linha da loja"`: filtro de loja → `RastreioConfig`; `[]` → `null`.
  - `"garantirConfig cria com o slug do nome e deixa o resto para o default do banco"`: sem config, `organizations`
    (`id=eq.loja-a`) → `{ name: "Moda da Ana" }` → POST com corpo exatamente `{ tenant_id: "loja-a", public_slug:
    "moda-da-ana" }`; config existente → nenhum POST. Dois 409 `{ code: "23505", message: 'duplicate key value violates
    unique constraint "tracking_settings_public_slug_key"' }` → terceiro corpo `moda-da-ana-3`; 409 citando
    `tracking_settings_pkey` (corrida) → relê e devolve a linha; `"Girumo Oficial"` → `public_slug: "loja"`.
  - `"salvarConfig grava só o que veio, na própria loja; slug de outra loja é SlugEmUso"`: PATCH com filtro de loja e
    corpo `{ public_slug: "nova", updated_at: <ISO> }` para `{ publicSlug: "nova" }`; 409 do slug → `rejects(…, SlugEmUso)`.
  - `"lojaPorSlug só devolve loja com o Rastreio ligado"`: `public_slug=eq.moda-da-ana` → linha de `loja-a` → flag com
    `tenant_id=eq.loja-a`; ligado → config, desligado → `null`; slug sem linha → `null` numa requisição só.
  - `"marcarImportado e avancarCursor gravam na própria loja e falham sem linha"`: PATCH com filtro de loja e corpo
    `{ imported_at: "2026-10-29T15:00:00.000Z" }` / `{ sweep_cursor: … }`; `[]` → rejeita.
- [ ] **Step 2: FAIL. Step 3: Implementar** (`import "server-only"`; qual unique o 23505 bateu pelo nome em
  `message`/`details`, molde `conflito` de `bio-pages.ts`; escritas com `.select()`, vazio = erro). Slug: `base =
  slugify(storeName)`, `raiz = slugReservado(base) ? "loja" : base.slice(0, 37).replace(/-+$/, "")`, candidatos `raiz`,
  `raiz-2` … `raiz-10`; esgotou → `Error("rastreio: sem endereço livre para a loja")`. **Step 4: PASS.**
- [ ] **Step 5: Commit** — `feat(rastreio): settings store with a slug from the store name`.

### Task 8: Store dos pedidos

**Files:** Create `apps/web/src/lib/stores/rastreio-pedidos.ts`, `apps/web/src/lib/stores/rastreio-pedidos.test.ts`

**Interfaces:**
- Consumes: Task 6; `selar`, `abrir`, `chaveDeIntegracoes` (`lib/security/secret-box.ts`; `Buffer | null`, como em
  `lib/bling/deps.ts`); as RPCs das Tasks 3 e 4.
- Produces: as funções de `rastreio-pedidos.ts` do índice + `purgarVencidos(): Promise<number>`. Colunas públicas, as
  únicas de `buscarPedidos` e `pedidoPorToken`: `id, numero, order_created_at, etapa, etapa_at, events,
  shipment_service, tracking_code, tracking_url, link_token, notices_stopped_at`; `lerPedido` soma `tenant_id,
  external_id, status_raw, buyer_first_name, buyer_phone, buyer_email_enc`. AAD: `` `rastreio:${tenantId}:yampi:${externalId}:email` ``.

- [ ] **Step 1: Testes que falham** (chave `Buffer.alloc(32, 7).toString("base64")`, molde `src/test/bling-cartao-falso.ts`;
  pedido `Y-1001`, `ana@exemplo.com`):
  - `"gravarPedido sela o e-mail com o contexto do pedido e manda o resto em snake_case"`: chamada
    `gravarPedido("loja-a", pedido, "aviso")`; POST `/rest/v1/rpc/rastreio_gravar_pedido`; `p_tenant === "loja-a"`;
    `Object.keys(p_pedido).sort()` = as 13 chaves do índice + `carimbar`, com `p_pedido.carimbar === true`;
    `abrir(p_pedido.buyer_email_enc, "rastreio:loja-a:yampi:Y-1001:email", chave) === "ana@exemplo.com"`; o corpo
    serializado sem o e-mail em texto e sem `atualizadoNaYampi` (só o TS usa); o retorno da RPC vira `PedidoGravado`
    (com `paradoEm`, `temTelefone`, `temEmail`).
  - `"importação não carimba data"`: `gravarPedido("loja-a", pedido, "importacao")` → `p_pedido.carimbar === false`.
  - `"sem chave de cifra, pedido com e-mail não vai ao banco"`: sem a env → `rejects(/INTEGRATIONS_ENCRYPTION_KEY/)` e
    nenhuma chamada; `buyerEmail: null` vai com `buyer_email_enc: null`; RPC 500 → rejeita.
  - `"lerPedido lê o pedido da própria loja"`: filtros `{ tenant_id: "eq.loja-a", id: "eq.o-1" }` → `PedidoInterno`;
    `[]` → `null`.
  - `"abrirEmailDoPedido abre só com o contexto certo e não loga o e-mail"`: selado para `Y-1001` → e-mail; para
    `Y-2002` → `null` e um `console.error` (`t.mock.method`) sem o e-mail; `buyerEmailEnc: null` → `null`, sem log.
  - `"buscarPedidos: colunas públicas, documento + celular + desde, da loja, mais novo primeiro, no máximo 20"`: `select`
    = colunas públicas sem espaço; filtros `{ tenant_id: "eq.loja-a", doc_hmac: "eq.<64 × a>", phone_last4: "eq.4321",
    order_created_at: "gte.2026-07-31T15:00:00.000Z", order: "order_created_at.desc", limit: "20" }`.
  - `"pedidoPorToken: um pedido da loja, só colunas públicas"`: filtros `{ tenant_id, link_token }`.
  - `"pararAvisos grava a data uma vez, pula os pendentes e nunca toca em optouts"`: PATCH `tracking_orders` com
    `{ tenant_id, link_token, notices_stopped_at: "is.null" }` → `[{ id: "o-1" }]`; PATCH `tracking_notices` com
    `{ tenant_id, order_id: "eq.o-1", status: "eq.pendente" }` e corpo `{ status: "pulado", updated_at }` →
    `{ orderId: "o-1" }`. Já parado: o 1º PATCH volta `[]`, GET `id` por loja + token acha, avisos pulados, mesmo
    retorno. Token desconhecido → `null`, sem PATCH de avisos. Nenhum `pathname` com `optouts` (mutante do spec §8).
  - `"purgarVencidos chama o purge e devolve quantos saíram"`: POST `/rest/v1/rpc/rastreio_purgar` → `3`.
- [ ] **Step 2: FAIL. Step 3: Implementar** (`import "server-only"`; com e-mail e sem chave, lança antes do banco;
  o log de `abrirEmailDoPedido` é só `[rastreio] e-mail do pedido <id> não abriu`). **Step 4: PASS.**
- [ ] **Step 5: Commit** — `feat(rastreio): orders store with the sealed buyer e-mail`.

### Task 9: Store dos avisos

**Files:** Create `apps/web/src/lib/stores/rastreio-avisos.ts`, `apps/web/src/lib/stores/rastreio-avisos.test.ts`

**Interfaces:** Consumes a Task 6 · Produces as funções de `rastreio-avisos.ts` do índice.

- [ ] **Step 1: Testes que falham.**
  - `"criarAvisos pede ignore-duplicates e devolve só os criados agora"` (Review Focus 1): o PostgREST falso guarda as
    chaves `order_id|etapa|channel` e, com `resolution=ignore-duplicates`, devolve só as novas. POST
    `/rest/v1/tracking_notices`, `on_conflict=order_id,etapa,channel`, `Prefer` com `resolution=ignore-duplicates` e
    `return=representation`, corpo `[{ tenant_id: "loja-a", order_id: "o-1", etapa: "enviado", channel }, …]`.
    `["whatsapp", "email"]` → dois `{ id, canal }`; a mesma chamada de novo → `[]`; canais vazios → `[]` sem requisição.
  - `"avisosParaEnviar: pendentes da loja e do canal, sem espera ou vencidos, os mais velhos primeiro"`: filtros
    `{ tenant_id, channel: "eq.email", status: "eq.pendente", or: "(next_try_at.is.null,next_try_at.lte.2026-10-29T15:00:00.000Z)",
    order: "created_at.asc", limit: "10" }` → `AvisoParaEnviar[]`.
  - `"avisosEnviando: os enviando da loja e do canal"`: `{ tenant_id, channel: "eq.whatsapp", status: "eq.enviando",
    order: "updated_at.asc", limit: "50" }`.
  - `"marcarAviso grava só o que veio e soma a tentativa lida"`: com `somarTentativa`, GET `attempts` por
    `{ tenant_id, id: "eq.n-1" }` → `2`; PATCH com os mesmos filtros e corpo `{ status: "falhou", error: "x", next_try_at:
    <ISO>, attempts: 3, updated_at }` (sem `message_id` nem `sent_at`); sem `somarTentativa`, nenhum GET; PATCH que
    volta `[]` → `rejects(/aviso não encontrado/)`.
  - `"reabrirAvisos reabre uma vez o que existe e cria o que falta"`: GET `{ tenant_id, order_id: "eq.o-1", etapa:
    "eq.enviado", channel: "in.(whatsapp,email)" }` → `[{ id: "n-1", channel: "whatsapp", resends: 0 }]`; PATCH com
    `{ tenant_id, id: "eq.n-1", resends: "eq.0" }` e corpo `{ status: "pendente", resends: 1, attempts: 0, message_id:
    null, error: null, next_try_at: null, sent_at: null, updated_at }`; POST só com `email` → `2`. O segundo clique (o
    PATCH volta `[]`: `resends` já mudou) não conta a linha — mutante "aviso duplicado no reenvio" (spec §8).
- [ ] **Step 2: FAIL. Step 3: Implementar** (`import "server-only"`; `reabrirAvisos` cria pelo `criarAvisos`; o
  `attempts` é lido-e-gravado: duas gravações simultâneas do mesmo aviso somam uma, ao custo de uma retentativa a mais).
  **Step 4: PASS. Step 5: Commit** — `feat(rastreio): notices store, one per order, stage and channel`.

### Task 10: Contratos da API

**Files:** Modify `apps/web/system/API_CONTRACTS.md` (seção nova no fim, no formato de "Posts de hoje por grupo")

- [ ] **Step 1:** `## Rastreio do pedido — <data>`, cada rota com o PR que a cria. Painel: `allowEngine: false`, tenant
  da sessão, `settings:connection` (vendedora 403); loja sem `rastreio_enabled` → `403 { error: "O Rastreio de pedidos não
  está liberado para esta loja.", code: "rastreio_disabled" }` (molde `lib/ig/access.ts`). Nada da compradora além do
  primeiro nome.
  - `GET /api/cron/rastreio` (PR 2, a cada 5 min, `isCronAuthorized`) → `200 { ok: true, lojas, falhas, purgados: number
    | null }` (`purgarVencidos()` só na execução das 06:00 UTC).
  - `GET/PATCH /api/rastreio/config` (PR 6): GET → `{ config: Omit<RastreioConfig, "tenantId" | "sweepCursor">,
    linkDaBusca }` (cria com `garantirConfig`); PATCH com parte de `{ publicSlug, matrix, notifyStoreOnProblem, vipLinkId,
    storeWhatsapp }` → como o GET · `400 { error, campo }` (slug fora do formato ou reservado, matriz incompleta, número
    inválido ou o dos grupos por `lib/bio/conferir.ts`, link de outra loja) · `409 { error, campo: "publicSlug" }` (`SlugEmUso`).
  - `GET /api/rastreio/entregas` (PR 6; `filtro` `todos`·`a_caminho`·`sem_codigo`·`problema`·`entregues`, `q` = nº, nome
    ou CPF/CNPJ via `doc_hmac`, `pagina`; pedidos de 30 dias) → `{ numeros: { aCaminho, semCodigo, problema, entregues7d,
    mediaDiasAteEntregar, avisosHoje: { whatsapp, email } }, pedidos: { id, numero, compradora, etapa, etapaAt,
    trackingCode, avisos: { etapa, canal, status }[] }[], proximaPagina }`.
  - `POST /api/rastreio/entregas/[id]/reenviar` (PR 6, `reabrirAvisos` da etapa atual) → `{ reabertos }` · `404` ·
    `409 { error: "etapa_sem_aviso" | "avisos_parados" }`. `GET /api/rastreio/saude` (PR 6) → `{ enviados, comCodigo,
    maisAntigoSemCodigo: { id, numero, desde } | null }` sobre os postados em 7 dias.
  - Página (PR 3): `GET/POST /rastreio/[slug]`, `GET /rastreio/[slug]/[token]`, `POST /rastreio/[slug]/[token]/parar`
    (no domínio do lojista sem o slug); HTML com `noindex`, `private, no-store`, CSP com nonce; loja desligada → 404;
    textos fixos do índice, `429` acima de 5/min ou 20/h; token → um pedido só ou `404` com a busca; parar só por `POST`
    (`303`; `GET` → `405` sem gravar; nunca em `optouts`).
- [ ] **Step 2: Commit** — `docs(api): rastreio routes contract`.

### Task 11: Fechamento da Parte 2

- [ ] **Step 1:** os quatro comandos de verificação do índice e `verify-local.ps1` verdes.
- [ ] **Step 2:** push → `gh pr create --base main --title "feat(rastreio): types and stores (rastreio PR 1, part 2)"` →
  revisão de segurança (filtro de loja em toda query, e-mail selado, nada da compradora fora das colunas públicas) → CI
  verde → `gh pr merge <N> --squash --delete-branch`.
- [ ] **Step 3:** card: `update public.board_features set blocker = 'PR 1 no ar (banco, tipos e stores); o PR 2 espera o
  B·6 e a Fase 0' where key = 'rastreio-pedidos';`; `kg_insert_text` com a decisão (etapa decidida na RPC sob trava de
  linha; aviso único por `unique`; FK composta de loja nos avisos). Ao encerrar: "PRs que deixei abertos: …".

## Interface com os outros PRs

- **B·1a:** `private_messages(id)` e `tenant_settings.rastreio_enabled` + trigger — conferidos no bloco 1, não criados.
- **PR 2:** `gravarPedido` só depois de `rastreioLigado` (a RPC não lê a flag). `PedidoGravado` já traz `paradoEm`,
  `temTelefone` e `temEmail` do que ficou gravado (nulo não apaga, então o contato pode vir de aviso anterior): o
  PR 2 decide o aviso sem `lerPedido`. Criação devolve `mudou = true`; a importação não avisa pela `origem`. Usa também `garantirConfig`,
  `marcarImportado`, `avancarCursor`, `lojasComRastreio`, `purgarVencidos`.
- **PR 3:** `lojaPorSlug`, `lerConfig`, `buscarPedidos` (`desde` = agora − 90 dias), `pedidoPorToken`, `pararAvisos`.
  **PR 4:** `avisosParaEnviar(…, "email", …)`, `marcarAviso`, `lerPedido`, `abrirEmailDoPedido`. **PR 5:**
  `avisosEnviando(…, "whatsapp", …)`, `marcarAviso({ messageId })`. **PR 6:** `salvarConfig` (`SlugEmUso` → 409),
  `garantirConfig`, `reabrirAvisos`, os índices `tracking_orders_etapa_idx`/`_doc_idx` e os contratos da Task 10.

## Divergências com o código

- **"Upsert numa instrução só" (índice):** a RPC faz `insert … on conflict do nothing` e, se a linha existe, `select …
  for update` + `update`. O `on conflict do update` não devolve a etapa anterior (o `returning` só vê a linha nova antes
  do PG 18), e uma CTE que leia a linha antiga lê um retrato que a corrida já mudou; `etapa_anterior` é contrato.
- **"Atualiza sempre código/URL/serviço/contato" (índice):** nulo não apaga (o aviso atrasado sem código apagaria o
  código do pedido entregue); `status_raw` só acompanha quando a etapa é aceita ou igual.
- **Criação com histórico:** `etapa_at` = `at` do último evento, e a RPC acrescenta `{etapa, now()}` se o histórico não
  termina na etapa; `purge_after = etapa_at + 90 days` (o índice diz `now()`: igual quando a etapa muda agora, diferente
  no pedido importado e no aviso repetido) — spec §7, "90 dias depois da última etapa".
- **Acréscimos ao spec §2:** fila com `tenant_id` na frente; FK composta `(tenant_id, order_id)` + `unique (tenant_id,
  id)`; `tracking_notices_message_idx`; `phone_last4` gerada; CHECKs de formato; nome com trecho de `slugReservado` vira
  `loja` (página que pede CPF não fica em `/rastreio/whatsapp-oficial`). Nomes novos: `SlugEmUso`, `purgarVencidos`.
- **Caminhos:** o contrato mora em `apps/web/system/API_CONTRACTS.md` (o spec diz `system/`); nenhuma migração usa
  `pgcrypto` ainda — o schema sai da consulta do "Antes de começar".
