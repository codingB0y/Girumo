-- Acesso da vendedora, PR 2 (docs/superpowers/specs/2026-10-07-acesso-vendedora-design.md §1 "RLS"
-- e §2; contrato em docs/superpowers/plans/2026-10-07-acesso-vendedora-indice.md, "PR 2 → PR 3, 4, 6").
--
-- Depende de 20261007120000_member_role_seller.sql JÁ COMMITADA: os helpers do RLS e o CHECK de
-- memberships comparam role com 'seller'.
--
-- Idempotente. Vai nos DOIS bancos (dev wfjuwogxaupyadwhvoxy, prod nidoatbxaylrkcgbszns) e muda
-- deploy/supabase/schema-baseline.json: t|memberships, t|orders, t|order_items e três f|.
-- O gate de drift não vê schema app, constraint, índice, policy, ACL nem corpo de função —
-- conferir com infra/tests/acesso-vendedora-check.sql nos dois bancos.

-- 0) RLS: a vendedora não lê nada direto do banco.
--    O access token dela fica no browser (src/lib/supabase/client.ts) e a anon key é pública;
--    authenticated mantém SELECT em public. Os helpers de LEITURA abaixo não filtravam papel, então
--    pelo PostgREST ela leria leads, orders e as outras tabelas da loja inteira, passando por cima
--    do guard da API e da decisão "só busca por número". Com o filtro, seller tem zero acesso
--    authenticated: tudo dela passa por rota service-role + guard.
--    Só estes dois mudam: user_admin_tenant_ids, user_operator_tenant_ids e has_role já listam
--    papéis e excluem seller. Nenhuma policy muda. Nenhuma vendedora existe hoje: ninguém perde
--    acesso. Corpo, linguagem, volatilidade, security definer e search_path copiados de
--    pg_get_functiondef de PROD (Task 1 do plano do PR 2); a única linha nova é a do seller.
--    Consequência conhecida: o upload direto do browser para storage.objects (policy com
--    app.has_membership) deixa de valer para seller — o módulo postar precisa de URL assinada.
create or replace function app.user_tenant_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(m.tenant_id), '{}'::uuid[])
  from public.memberships m
  where m.user_id = auth.uid()
    and m.accepted_at is not null
    and m.role <> 'seller';
$$;

create or replace function app.has_membership(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.memberships m
    where m.tenant_id = target_tenant_id
      and m.user_id = auth.uid()
      and m.accepted_at is not null
      and m.role <> 'seller'
  )
$$;

-- create or replace não preserva ACL em todo banco: devolve exatamente o EXECUTE capturado em prod
-- na Task 1 (dono + PUBLIC = ACL nulo). Sem EXECUTE para authenticated, toda policy que chama
-- estes helpers passa a negar tudo para todo mundo.
revoke all on function app.user_tenant_ids() from public, anon, authenticated, service_role;
grant execute on function app.user_tenant_ids() to public;
revoke all on function app.has_membership(uuid) from public, anon, authenticated, service_role;
grant execute on function app.has_membership(uuid) to public;

comment on function app.user_tenant_ids() is
  'Tenants where auth.uid() holds an accepted membership, except as seller (seller has no authenticated access; spec 2026-10-07 §1). Single RLS mechanism.';
comment on function app.has_membership(uuid) is
  'True when auth.uid() holds an accepted membership in the tenant, except as seller (seller has no authenticated access; spec 2026-10-07 §1).';

-- 1) Módulos extras da vendedora. 'vendas' é implícito para seller e não é gravado; outro papel
--    não tem módulo nenhum (o acesso dele não passa por aqui).
alter table public.memberships
  add column if not exists modules text[] not null default '{}';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.memberships'::regclass
      and conname = 'memberships_modules_validos'
  ) then
    alter table public.memberships
      add constraint memberships_modules_validos
      check (modules <@ array['postar']::text[] and (role = 'seller' or modules = '{}'));
  end if;
end;
$$;

comment on column public.memberships.modules is
  'Módulos opcionais liberados pelo dono para a vendedora (role = seller). vendas é implícito e não é gravado.';

-- 2) Quem registrou o pedido: "Minhas vendas" da vendedora e a janela de 24h para ela corrigir.
alter table public.orders
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create index if not exists orders_tenant_created_by_idx
  on public.orders (tenant_id, created_by, created_at desc);

-- 3) Itens do pedido. orders.value continua sendo o total (Resultados, caixa do mês,
--    painel-metrics e atribuição por campanha não mudam); pedido antigo fica sem itens.
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  position smallint not null default 0,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  quantity integer not null check (quantity between 1 and 9999),
  unit_price numeric(12,2) not null check (unit_price between 0 and 999999.99),
  created_at timestamptz not null default now()
);

comment on table public.order_items is
  'Itens de um pedido (nome livre, quantidade, valor unitário). Escrita só pelas RPCs create_order_with_items e replace_order_items, sob service-role.';

create index if not exists order_items_order_idx
  on public.order_items (order_id, position);

-- RLS como segunda linha, leitura no mesmo padrão de orders (orders_select_member).
alter table public.order_items enable row level security;
drop policy if exists order_items_select_member on public.order_items;
create policy order_items_select_member on public.order_items
  for select to authenticated
  using (tenant_id = any (app.user_tenant_ids()));

-- Só o servidor escreve. O event trigger de 20261004120000 já revoga isto em tabela nova;
-- fica explícito para não depender dele estar aplicado no banco. SELECT de authenticated fica,
-- como em orders: é onde a policy acima vale (e ela já exclui seller pelo helper do bloco 0).
revoke all on public.order_items from anon;
revoke insert, update, delete, truncate on public.order_items from authenticated;
grant select on public.order_items to authenticated;
grant select, insert, update, delete on public.order_items to service_role;

-- 4) Validação e total dos itens: uma regra só para as duas RPCs.
--    p_items = [{ "name": text, "quantity": int, "unit_price": numeric }], 1..50, na ordem.
create or replace function public.order_items_total(p_items jsonb)
returns numeric
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_qtd numeric;
  v_preco numeric;
  v_total numeric := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'itens_invalidos';
  end if;
  -- Separado do if de cima: o Postgres não garante a ordem de avaliação de um "or", e
  -- jsonb_array_length estoura em valor que não é array.
  if jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'itens_invalidos';
  end if;

  for v_item in select e.elemento from jsonb_array_elements(p_items) as e(elemento) loop
    if jsonb_typeof(v_item) <> 'object'
       or jsonb_typeof(v_item -> 'name') is distinct from 'string'
       or jsonb_typeof(v_item -> 'quantity') is distinct from 'number'
       or jsonb_typeof(v_item -> 'unit_price') is distinct from 'number' then
      raise exception 'itens_invalidos';
    end if;

    v_qtd := (v_item ->> 'quantity')::numeric;
    v_preco := (v_item ->> 'unit_price')::numeric;
    if char_length(btrim(v_item ->> 'name')) not between 1 and 120
       or v_qtd <> trunc(v_qtd)
       or v_qtd not between 1 and 9999
       or v_preco not between 0 and 999999.99 then
      raise exception 'itens_invalidos';
    end if;

    -- O mesmo arredondamento que numeric(12,2) faz ao gravar o item: total = soma dos itens gravados.
    v_total := v_total + v_qtd * round(v_preco, 2);
  end loop;

  -- Teto de orders.value (numeric(12,2)): passar disso estouraria o insert com um erro sem nome.
  if v_total > 9999999999.99 then
    raise exception 'itens_invalidos';
  end if;
  if v_total <= 0 then
    raise exception 'total_zero';
  end if;

  return round(v_total, 2);
end;
$$;

comment on function public.order_items_total(jsonb) is
  'Valida p_items (1..50; name 1..120 após trim; quantity inteiro 1..9999; unit_price 0..999999.99) e devolve a soma > 0. Erros: itens_invalidos, total_zero. Uso interno das RPCs de pedido.';

revoke execute on function public.order_items_total(jsonb) from public, anon, authenticated;
grant execute on function public.order_items_total(jsonb) to service_role;

-- 5) Registrar pedido com itens, numa transação só (a da chamada RPC).
create or replace function public.create_order_with_items(
  p_tenant_id uuid,
  p_created_by uuid,
  p_lead_id uuid,
  p_phone text,
  p_group_name text,
  p_campaign_id uuid,
  p_items jsonb
)
returns public.orders
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_pedido public.orders;
begin
  insert into public.orders (tenant_id, created_by, lead_id, phone, group_name, campaign_id, value)
  values (
    p_tenant_id,
    p_created_by,
    p_lead_id,
    -- Só dígitos, como o addOrder grava hoje.
    regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'),
    nullif(btrim(p_group_name), ''),
    p_campaign_id,
    public.order_items_total(p_items)
  )
  returning * into v_pedido;

  insert into public.order_items (tenant_id, order_id, position, name, quantity, unit_price)
  select p_tenant_id,
         v_pedido.id,
         (e.ord - 1)::smallint,
         btrim(e.item ->> 'name'),
         (e.item ->> 'quantity')::numeric::integer,
         round((e.item ->> 'unit_price')::numeric, 2)
  from jsonb_array_elements(p_items) with ordinality as e(item, ord);

  return v_pedido;
end;
$$;

comment on function public.create_order_with_items(uuid, uuid, uuid, text, text, uuid, jsonb) is
  'Grava o pedido (value = soma dos itens) e os itens na ordem de p_items. Erros: itens_invalidos, total_zero. Chamada só pelo servidor, com o tenant explícito.';

revoke execute on function public.create_order_with_items(uuid, uuid, uuid, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_order_with_items(uuid, uuid, uuid, text, text, uuid, jsonb) to service_role;

-- 6) Corrigir os itens de um pedido. p_only_author não nulo = regra da vendedora: só o pedido
--    dela, criado há menos de 24h. Dono/admin/operador passam null.
create or replace function public.replace_order_items(
  p_tenant_id uuid,
  p_order_id uuid,
  p_items jsonb,
  p_only_author uuid
)
returns public.orders
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_pedido public.orders;
  v_total numeric;
begin
  select * into v_pedido
  from public.orders o
  where o.id = p_order_id
    and o.tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'pedido_nao_encontrado';
  end if;

  if p_only_author is not null
     and (v_pedido.created_by is distinct from p_only_author
          or v_pedido.created_at <= now() - interval '24 hours') then
    raise exception 'fora_da_janela';
  end if;

  v_total := public.order_items_total(p_items);

  delete from public.order_items i
  where i.tenant_id = p_tenant_id
    and i.order_id = p_order_id;

  insert into public.order_items (tenant_id, order_id, position, name, quantity, unit_price)
  select p_tenant_id,
         p_order_id,
         (e.ord - 1)::smallint,
         btrim(e.item ->> 'name'),
         (e.item ->> 'quantity')::numeric::integer,
         round((e.item ->> 'unit_price')::numeric, 2)
  from jsonb_array_elements(p_items) with ordinality as e(item, ord);

  update public.orders o
  set value = v_total
  where o.id = p_order_id
    and o.tenant_id = p_tenant_id
  returning * into v_pedido;

  return v_pedido;
end;
$$;

comment on function public.replace_order_items(uuid, uuid, jsonb, uuid) is
  'Troca os itens do pedido e recalcula value. Com p_only_author: só se created_by = p_only_author e created_at > now() - 24h. Erros: pedido_nao_encontrado, fora_da_janela, itens_invalidos, total_zero.';

revoke execute on function public.replace_order_items(uuid, uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.replace_order_items(uuid, uuid, jsonb, uuid) to service_role;

-- O PostgREST passa a enxergar as RPCs sem esperar o recarregamento automático.
notify pgrst, 'reload schema';
