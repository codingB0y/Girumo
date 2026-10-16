-- 2026-10-13 — Integração Bling (spec docs/superpowers/specs/2026-10-13-integracao-bling-design.md §2).
--
-- As vendas do Bling entram em public.orders (source = 'bling') pelo motor em apps/web/src/lib/bling/.
-- Tudo aqui é lido e escrito só pelo servidor (service_role): as quatro tabelas têm RLS ligado e
-- NENHUMA policy nem grant para authenticated. Token do ERP, fila e dado de cliente não têm por que sair
-- pelo PostgREST; o cartão lê pela rota com permissão de dono/admin. As funções são `security invoker`
-- e executam só como service_role: se um grant escapar, quem chamar esbarra no RLS sem policy.
--
-- Idempotente (if not exists / or replace). Aplicar em dev e em prod (deploy/supabase/apply-order.txt).

-- 1) Uma conexão por loja. company_id é o id da empresa no Bling (o webhook chega por ele).
create table if not exists public.bling_connections (
  tenant_id            uuid primary key references public.organizations(id) on delete cascade,
  company_id           text unique,
  company_name         text,
  status               text not null default 'ativa' check (status in ('ativa', 'reconectar', 'desconectada')),
  access_token_enc     text,
  refresh_token_enc    text,
  access_expires_at    timestamptz,
  token_version        integer not null default 0,
  key_fp               text,        -- impressão (16 hex) da chave que selou os tokens; null = desconhecida
  token_retry_at       timestamptz, -- nenhuma renovação antes disso (falha não definitiva do /oauth/token)
  situations           jsonb not null default '[]'::jsonb,
  situations_at        timestamptz,
  sale_situation_ids   bigint[] not null default '{}',
  high_value           numeric(12,2) check (high_value is null or (high_value > 0 and high_value <= 10000000)),
  meta_enabled         boolean not null default true,
  meta_campaign_id     uuid references public.campaign_groups(id) on delete set null,
  backfill_from        date,
  backfill_until       date,
  backfill_page        integer not null default 1 check (backfill_page >= 1),
  backfill_fails       integer not null default 0 check (backfill_fails >= 0), -- execuções seguidas sem a página da frente andar; a 12ª pula a página
  backfill_done_at     timestamptz,
  scan_cursor          timestamptz, -- fim da última passada completa da varredura
  scan_from            timestamptz, -- início do que falta da passada em andamento (fim da última fatia lida inteira); null = nenhuma
  scan_slice_s         integer check (scan_slice_s > 0), -- tamanho (s) da próxima fatia da varredura; null = 6 h
  lease_holder         uuid,
  lease_until          timestamptz,
  paused_until         timestamptz,
  consecutive_failures integer not null default 0,
  last_webhook_at      timestamptz,
  last_scan_at         timestamptz, -- último avanço da varredura (uma fatia lida inteira)
  last_scan_change_at  timestamptz,
  last_sale_at         timestamptz,
  last_error           text,
  last_error_at        timestamptz,
  reconnect_alerted_at timestamptz,
  connected_by         uuid references auth.users(id) on delete set null,
  connected_at         timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.bling_connections is
  'Conexão de uma loja com uma conta Bling (OAuth). Tokens cifrados no app (AES-256-GCM, INTEGRATIONS_ENCRYPTION_KEY). Só service_role.';

-- 2) state do OAuth: só o sha256 aqui (o state inteiro vive no cookie), uso único, 10 minutos.
create table if not exists public.bling_oauth_states (
  state_hash text primary key,
  tenant_id  uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null
);

comment on table public.bling_oauth_states is
  'state do OAuth do Bling (sha256). Consumido por delete ... returning: o código de autorização nunca é trocado duas vezes.';

-- 3) Clientes do Bling. Cache de 24 h do contato e a lista da pessoa (spec §1 Listas).
--    E-mail, nascimento e endereço só como hash para o Meta (meta_hashes); nunca em texto.
create table if not exists public.bling_contacts (
  tenant_id        uuid not null references public.organizations(id) on delete cascade,
  bling_contact_id bigint not null,
  name             text,
  person_type      text check (person_type in ('F', 'J', 'E')),
  phone            text,
  phone_key        text generated always as (public.phone_key(phone)) stored,
  meta_hashes      jsonb not null default '{}'::jsonb,
  lista            text check (lista in ('alto_valor', 'comprador', 'lead')),
  lista_changed_at timestamptz,
  fetched_at       timestamptz not null default now(),
  primary key (tenant_id, bling_contact_id)
);

create index if not exists bling_contacts_lista_idx on public.bling_contacts (tenant_id, lista, bling_contact_id);
create index if not exists bling_contacts_key_idx on public.bling_contacts (tenant_id, phone_key);

comment on table public.bling_contacts is
  'Contatos do Bling vistos em pedidos: telefone, phone_key e hashes para o Meta. lista = alto_valor | comprador | lead, por pessoa (phone_key).';

-- 4) Pedidos do Bling: espelho e fila ao mesmo tempo. pending + next_try_at = o que falta processar.
create table if not exists public.bling_orders (
  tenant_id        uuid not null references public.organizations(id) on delete cascade,
  bling_order_id   bigint not null,
  numero           text,
  order_date       date,
  total            numeric(12,2),
  situacao_id      bigint,
  bling_contact_id bigint,
  kind             text check (kind in ('venda', 'pedido', 'ignorado', 'excluido')),
  order_id         uuid unique references public.orders(id) on delete set null,
  origin           text not null default 'aviso' check (origin in ('aviso', 'varredura', 'historico')),
  first_seen_at    timestamptz not null default now(),
  sale_at          timestamptz,
  ic_status        text check (ic_status in ('enviado', 'fora_da_janela', 'sem_pixel', 'desligado', 'sem_dados', 'erro')),
  ic_sent_at       timestamptz,
  purchase_status  text check (purchase_status in ('enviado', 'fora_da_janela', 'sem_pixel', 'desligado', 'sem_dados', 'erro')),
  purchase_sent_at timestamptz,
  meta_error       text,
  origem           text check (origem in ('anuncio', 'grupo', 'sem_origem')),
  origem_detalhe   text,
  snapshot         jsonb,
  snapshot_at      timestamptz,
  pending          boolean not null default true,
  low_priority     boolean not null default false, -- true enquanto a pendência veio só do histórico
  attempts         integer not null default 0,
  next_try_at      timestamptz not null default now(),
  last_error       text,
  updated_at       timestamptz not null default now(),
  primary key (tenant_id, bling_order_id)
);

-- A fila lista por low_priority, next_try_at: venda ao vivo não espera o histórico.
create index if not exists bling_orders_pending_idx on public.bling_orders (tenant_id, low_priority, next_try_at) where pending;
create index if not exists bling_orders_contact_idx on public.bling_orders (tenant_id, bling_contact_id);
-- "Últimas vendas" do cartão: order_date desc NULLS LAST (o default de desc é nulls first, e aí o índice
-- não serviria à consulta).
create index if not exists bling_orders_recent_idx on public.bling_orders (tenant_id, order_date desc nulls last, bling_order_id desc);

comment on table public.bling_orders is
  'Pedidos de venda do Bling por loja: fila (pending/next_try_at), estado processado, ligação com orders e status dos eventos do Meta.';

-- 5) De onde veio o pedido da Girumo. Venda do Bling não se edita nem se apaga pela Girumo.
alter table public.orders
  add column if not exists source text not null default 'manual';

-- CHECK com nome fixo e criada uma vez só: inline no `add column if not exists`, uma reexecução
-- poderia deixar uma segunda constraint com sufixo, invisível ao gate de drift.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.orders'::regclass and conname = 'orders_source_check'
  ) then
    alter table public.orders add constraint orders_source_check check (source in ('manual', 'bling'));
  end if;
end;
$$;

comment on column public.orders.source is
  'manual = registrado no painel; bling = importado do Bling (só o motor da integração cria, muda ou apaga).';

-- 6) RLS sem policy e privilégios: só service_role.
alter table public.bling_connections enable row level security;
alter table public.bling_oauth_states enable row level security;
alter table public.bling_contacts enable row level security;
alter table public.bling_orders enable row level security;

revoke all on public.bling_connections, public.bling_oauth_states, public.bling_contacts, public.bling_orders
  from anon, authenticated;
grant select, insert, update, delete
  on public.bling_connections, public.bling_oauth_states, public.bling_contacts, public.bling_orders
  to service_role;

-- 7) Trava por loja: um processador de cada vez (3 req/s do Bling por conta, token rotativo).
--    Usa o relógio do banco; quem morre no meio libera sozinho quando lease_until passa.
create or replace function public.bling_claim(p_tenant uuid, p_holder uuid, p_seconds integer)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if p_seconds is null or p_seconds < 10 or p_seconds > 600 then
    raise exception 'bling_claim: p_seconds precisa estar entre 10 e 600';
  end if;
  -- Dono nulo "pegaria" a trava sem marcá-la (lease_holder nulo = livre).
  if p_holder is null then
    raise exception 'bling_claim: p_holder obrigatório';
  end if;

  update public.bling_connections
     set lease_holder = p_holder,
         lease_until = now() + make_interval(secs => p_seconds)
   where tenant_id = p_tenant
     and status = 'ativa'
     and (paused_until is null or paused_until <= now())
     and (lease_holder is null or lease_until is null or lease_until <= now() or lease_holder = p_holder);

  return found;
end;
$$;

comment on function public.bling_claim(uuid, uuid, integer) is
  'Pega a trava da loja (ativa, fora da pausa, livre/vencida ou já do mesmo dono). true = pegou.';

create or replace function public.bling_release(p_tenant uuid, p_holder uuid)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  update public.bling_connections
     set lease_holder = null, lease_until = null
   where tenant_id = p_tenant and lease_holder = p_holder;
$$;

comment on function public.bling_release(uuid, uuid) is
  'Solta a trava da loja, só se o dono for quem pede.';

-- 8) A fila num comando só (spec §2). origin vale na criação da linha e não muda depois.
--    aviso: pendente e sem retrato (o processamento faz GET do estado atual).
--    varredura: pendente com o retrato novo só se situação/total/contato mudaram desde o último processado,
--      ou se a linha está excluída e fora da fila.
--    historico: só cria o que não existe, com low_priority. Aviso e varredura que tocam a linha tiram o
--      low_priority: a pendência deixou de ser só do histórico.
create or replace function public.bling_enqueue(p_tenant uuid, p_origin text, p_items jsonb)
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_n integer;
begin
  if p_origin is null or p_origin not in ('aviso', 'varredura', 'historico') then
    raise exception 'bling_enqueue: origem inválida';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'bling_enqueue: itens precisam ser uma lista';
  end if;

  -- Mesmo pedido duas vezes no lote (páginas que se deslocam): vale o último lido (ord desc).
  if p_origin = 'aviso' then
    insert into public.bling_orders as b (tenant_id, bling_order_id, origin, pending, low_priority, next_try_at)
    select distinct on (i.id) p_tenant, i.id, 'aviso', true, false, now()
      from (select (t.e ->> 'id')::bigint as id, t.ord
              from jsonb_array_elements(p_items) with ordinality as t(e, ord)) i
     where i.id > 0
     order by i.id, i.ord desc
    on conflict (tenant_id, bling_order_id) do update
      set pending = true, low_priority = false, attempts = 0, next_try_at = now(),
          snapshot = null, snapshot_at = null, updated_at = now();
  elsif p_origin = 'varredura' then
    insert into public.bling_orders as b
           (tenant_id, bling_order_id, origin, snapshot, snapshot_at, pending, low_priority, next_try_at)
    select distinct on (i.id) p_tenant, i.id, 'varredura', i.snap, now(), true, false, now()
      from (select (t.e ->> 'id')::bigint as id, t.e as snap, t.ord
              from jsonb_array_elements(p_items) with ordinality as t(e, ord)) i
     where i.id > 0
     order by i.id, i.ord desc
    on conflict (tenant_id, bling_order_id) do update
      set snapshot = excluded.snapshot, snapshot_at = now(), pending = true, low_priority = false,
          attempts = 0, next_try_at = now(), updated_at = now()
      -- Compara com o estado mais novo que a linha conhece: o retrato, quando há (o processamento
      -- grava o estado que usou nele); senão o último processado. Igual = nada muda, e o recuo de
      -- uma linha que está falhando continua valendo. Total sempre em 2 casas, como numeric(12,2).
      where (case when b.snapshot is null then b.situacao_id
                  else (b.snapshot ->> 'situacaoId')::bigint end)
              is distinct from (excluded.snapshot ->> 'situacaoId')::bigint
         or (case when b.snapshot is null then b.total
                  else round((b.snapshot ->> 'total')::numeric, 2) end)
              is distinct from round((excluded.snapshot ->> 'total')::numeric, 2)
         or (case when b.snapshot is null then b.bling_contact_id
                  else (b.snapshot ->> 'contatoId')::bigint end)
              is distinct from (excluded.snapshot ->> 'contatoId')::bigint
         -- Exceção ao "igual = nada muda": pedido que a lista ainda mostra não está apagado. Um 404
         -- transitório o marcou excluído; ele volta para a fila com o retrato. Já na fila, fica como
         -- está: zerar o recuo a cada varredura faria uma linha que falha tentar sem parar.
         or (b.kind = 'excluido' and not b.pending);
  else
    insert into public.bling_orders
           (tenant_id, bling_order_id, origin, snapshot, snapshot_at, pending, low_priority, next_try_at)
    select distinct on (i.id) p_tenant, i.id, 'historico', i.snap, now(), true, true, now()
      from (select (t.e ->> 'id')::bigint as id, t.e as snap, t.ord
              from jsonb_array_elements(p_items) with ordinality as t(e, ord)) i
     where i.id > 0
     order by i.id, i.ord desc
    on conflict (tenant_id, bling_order_id) do nothing;
  end if;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function public.bling_enqueue(uuid, text, jsonb) is
  'Fila dos pedidos do Bling: aviso | varredura | historico (spec §2). Itens = [{id}] no aviso; PedidoResumo nos outros. Devolve quantas linhas mudaram.';

-- 9) Listas por pessoa (phone_key; contato sem telefone é uma pessoa sozinho). Cada pessoa em uma só.
create or replace function public.bling_recompute_lists(p_tenant uuid, p_contact bigint default null)
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_alto numeric(12,2);
  v_n integer;
begin
  -- Um recálculo por loja de cada vez: o da loja toda (ajuste de valor alto) e o de uma pessoa
  -- (pedido processado) atualizam as mesmas linhas em ordens diferentes e se travariam.
  perform pg_advisory_xact_lock(hashtextextended('bling_recompute_lists:' || p_tenant::text, 0));

  select c.high_value into v_alto from public.bling_connections c where c.tenant_id = p_tenant;

  -- Três braços em vez de um OR: cada um usa índice (loja; PK; tenant + phone_key). Com OR o
  -- planejador lia todos os contatos da loja a cada pedido processado.
  with membros as (
    select c.bling_contact_id, c.phone_key
      from public.bling_contacts c
     where p_contact is null and c.tenant_id = p_tenant
    union
    select c.bling_contact_id, c.phone_key
      from public.bling_contacts c
     where p_contact is not null and c.tenant_id = p_tenant and c.bling_contact_id = p_contact
    union
    select o.bling_contact_id, o.phone_key
      from public.bling_contacts c
      join public.bling_contacts o on o.tenant_id = c.tenant_id and o.phone_key = c.phone_key
     where p_contact is not null and c.tenant_id = p_tenant and c.bling_contact_id = p_contact
       and c.phone_key is not null
  ), escopo as (
    select m.bling_contact_id, coalesce(m.phone_key, 'c:' || m.bling_contact_id::text) as pessoa
      from membros m
  ), agg as (
    select e.pessoa,
           coalesce(bool_or(o.kind = 'venda'), false) as tem_venda,
           max(o.total) filter (where o.kind = 'venda') as maior,
           coalesce(bool_or(o.kind = 'pedido'), false) as tem_pedido
      from escopo e
      left join public.bling_orders o
        on o.tenant_id = p_tenant and o.bling_contact_id = e.bling_contact_id
     group by e.pessoa
  ), nova as (
    select e.bling_contact_id,
           case
             when a.tem_venda and v_alto is not null and a.maior >= v_alto then 'alto_valor'
             when a.tem_venda then 'comprador'
             when a.tem_pedido then 'lead'
           end as lista
      from escopo e
      join agg a on a.pessoa = e.pessoa
  )
  update public.bling_contacts c
     set lista = n.lista, lista_changed_at = now()
    from nova n
   where c.tenant_id = p_tenant
     and c.bling_contact_id = n.bling_contact_id
     and c.lista is distinct from n.lista;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function public.bling_recompute_lists(uuid, bigint) is
  'Recalcula a lista (alto_valor | comprador | lead | null) da pessoa do contato, ou da loja toda com p_contact nulo. Devolve quantos contatos mudaram.';

-- 10) Números do cartão, agregados no banco (o PostgREST corta em 1000 linhas sem avisar).
create or replace function public.bling_resumo(p_tenant uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with o as (
    select b.kind, b.total, b.sale_at, b.origem, b.purchase_status, b.pending, b.last_error, b.origin
      from public.bling_orders b
     where b.tenant_id = p_tenant
  ), v as (
    select * from o where o.kind = 'venda' and o.sale_at >= now() - interval '30 days'
  ), p as (
    select distinct coalesce(c.phone_key, 'c:' || c.bling_contact_id::text) as pessoa, c.lista
      from public.bling_contacts c
     where c.tenant_id = p_tenant and c.lista is not null
  )
  select jsonb_build_object(
    'vendas_30d', (select count(*) from v),
    'vendido_30d', (select coalesce(sum(v.total), 0) from v),
    'origem_30d', jsonb_build_object(
      'anuncio', (select count(*) from v where v.origem = 'anuncio'),
      'grupo', (select count(*) from v where v.origem = 'grupo'),
      'sem_origem', (select count(*) from v where v.origem = 'sem_origem')),
    'meta_30d', jsonb_build_object(
      'enviado', (select count(*) from v where v.purchase_status = 'enviado'),
      'fora_da_janela', (select count(*) from v where v.purchase_status = 'fora_da_janela'),
      'sem_pixel', (select count(*) from v where v.purchase_status = 'sem_pixel'),
      'sem_dados', (select count(*) from v where v.purchase_status = 'sem_dados'),
      'desligado', (select count(*) from v where v.purchase_status = 'desligado'),
      'erro', (select count(*) from v where v.purchase_status = 'erro')),
    'pendentes', (select count(*) from o where o.pending),
    -- Falhou no último processamento, pendente ou não: o processamento que dá certo zera last_error.
    'falhas', (select count(*) from o where o.last_error is not null),
    'historico_lidos', (select count(*) from o where o.origin = 'historico'),
    'listas', jsonb_build_object(
      'alto_valor', (select count(*) from p where p.lista = 'alto_valor'),
      'comprador', (select count(*) from p where p.lista = 'comprador'),
      'lead', (select count(*) from p where p.lista = 'lead'))
  );
$$;

comment on function public.bling_resumo(uuid) is
  'Números do cartão do Bling: vendas e vendido em 30 dias, origem, status do Purchase, pendentes, falhas (último processamento com erro, pendente ou não), pedidos lidos do histórico e pessoas por lista.';

-- Função nova nasce executável por authenticated (default privilege do grantor postgres) e por
-- public; anon herda de public. Revogar dos três e conceder só ao service_role.
revoke execute on function public.bling_claim(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.bling_release(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.bling_enqueue(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.bling_recompute_lists(uuid, bigint) from public, anon, authenticated;
revoke execute on function public.bling_resumo(uuid) from public, anon, authenticated;

grant execute on function public.bling_claim(uuid, uuid, integer) to service_role;
grant execute on function public.bling_release(uuid, uuid) to service_role;
grant execute on function public.bling_enqueue(uuid, text, jsonb) to service_role;
grant execute on function public.bling_recompute_lists(uuid, bigint) to service_role;
grant execute on function public.bling_resumo(uuid) to service_role;
