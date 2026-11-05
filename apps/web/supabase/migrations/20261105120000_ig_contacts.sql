-- apps/web/supabase/migrations/20261105120000_ig_contacts.sql
-- Pessoas do Instagram, PR 1a (spec docs/superpowers/specs/2026-10-16-instagram-pessoas-blocos-conversas-design.md §5).
--
-- ig_contacts é a ficha de quem falou com a loja pelo Instagram: @, id escopado, campos e etiquetas que a
-- loja configurou, e as datas que decidem janela da Meta (last_dm_at) e prazo de 12 meses (last_seen_at).
-- Escrita só pelo servidor, por ig_contact_apply (um comando, sem perder gravação concorrente). Prazos
-- por ig_purge_contacts (rotina de hora em hora). Números da tela por funções SQL: o PostgREST corta
-- lista em 1000 sem avisar, então contagem não pode vir de select.
--
-- Também: tenant_settings.instagram_disabled_at (início dos 30 dias de exportação depois de cancelar) e
-- a receita "comment_choose_group" na CHECK de ig_flows.recipe.
--
-- O gate de drift não hasheia CHECK nem ACL: conferir com infra/tests/ig-contacts-check.sql nos dois bancos.
-- Reversão: drop da tabela, das 6 funções, da coluna e a CHECK sem 'comment_choose_group' (só sem fluxo dela).

set lock_timeout = '5s';

-- ------------------------------------------------------------
-- 1) ig_contacts
-- ------------------------------------------------------------
create table if not exists public.ig_contacts (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.organizations(id) on delete cascade,
  ig_user_id     text not null,
  username       text,
  fields         jsonb not null default '{}'::jsonb,
  tags           text[] not null default '{}',
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  last_dm_at     timestamptz,
  source_flow_id uuid references public.ig_flows(id) on delete set null,
  updated_at     timestamptz not null default now(),
  unique (tenant_id, ig_user_id)
);

comment on table public.ig_contacts is
  'Ficha da pessoa que falou com a loja pelo Instagram. Escrita só por ig_contact_apply (servidor). 12 meses sem conversa ou 30 dias após cancelar o add-on: apagada por ig_purge_contacts.';

create index if not exists ig_contacts_tags_idx on public.ig_contacts using gin (tags);
create index if not exists ig_contacts_seen_idx on public.ig_contacts (tenant_id, last_seen_at desc);
-- A rotina de prazo varre a tabela inteira por last_seen_at, sem loja.
create index if not exists ig_contacts_purge_idx on public.ig_contacts (last_seen_at);
-- Lado filho do FK: o on delete set null varre a tabela sem ele.
create index if not exists ig_contacts_flow_idx on public.ig_contacts (source_flow_id) where source_flow_id is not null;

alter table public.ig_contacts enable row level security;
drop policy if exists "ig_contacts_tenant_read" on public.ig_contacts;
create policy "ig_contacts_tenant_read" on public.ig_contacts
  for select to authenticated using (tenant_id = any (app.user_tenant_ids()));
revoke all on public.ig_contacts from authenticated;
grant select on public.ig_contacts to authenticated;

drop trigger if exists set_updated_at_ig_contacts on public.ig_contacts;
create trigger set_updated_at_ig_contacts before update on public.ig_contacts
  for each row execute function app.set_updated_at();

-- ------------------------------------------------------------
-- 2) Mesclas puras (limites do spec §5.2). Só ig_contact_apply chama.
-- ------------------------------------------------------------
create or replace function app.ig_merge_fields(p_cur jsonb, p_set jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  r jsonb := coalesce(p_cur, '{}'::jsonb);
  k text;
  v jsonb;
begin
  if p_set is null or jsonb_typeof(p_set) <> 'object' then return r; end if;
  for k, v in select key, value from jsonb_each(p_set) loop
    if k !~ '^[a-z][a-z0-9_]{0,31}$' then continue; end if;
    if jsonb_typeof(v) = 'null' then r := r - k; continue; end if;
    if jsonb_typeof(v) in ('object', 'array') then continue; end if;
    -- Campo novo além do 30º é ignorado; os que já existem sempre atualizam.
    if not (r ? k) and (select count(*) from jsonb_object_keys(r)) >= 30 then continue; end if;
    if jsonb_typeof(v) = 'string' then v := to_jsonb(left(v #>> '{}', 200)); end if;
    r := jsonb_set(r, array[k], v);
  end loop;
  return r;
end;
$$;

create or replace function app.ig_merge_tags(p_cur text[], p_add text[], p_remove text[])
returns text[]
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  r text[] := coalesce(p_cur, '{}'::text[]);
  t text;
begin
  foreach t in array coalesce(p_add, '{}'::text[]) loop
    if t is null or t !~ '^[a-z0-9][a-z0-9-]{0,39}$' then continue; end if;
    if t = any (r) then continue; end if;
    if cardinality(r) >= 50 then continue; end if;
    r := r || t;
  end loop;
  foreach t in array coalesce(p_remove, '{}'::text[]) loop
    if t is not null then r := array_remove(r, t); end if;
  end loop;
  return r;
end;
$$;

-- ------------------------------------------------------------
-- 3) ig_contact_apply: gravação atômica
-- ------------------------------------------------------------
create or replace function public.ig_contact_apply(
  p_tenant uuid,
  p_ig_user_id text,
  p_username text,
  p_set jsonb,
  p_add text[],
  p_remove text[],
  p_seen_at timestamptz,
  p_dm boolean,
  p_source_flow uuid
)
returns public.ig_contacts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_seen timestamptz := coalesce(p_seen_at, now());
  v_row public.ig_contacts;
begin
  insert into public.ig_contacts as c
    (tenant_id, ig_user_id, username, fields, tags, first_seen_at, last_seen_at, last_dm_at, source_flow_id)
  values (
    p_tenant, p_ig_user_id, nullif(p_username, ''),
    app.ig_merge_fields('{}'::jsonb, p_set),
    app.ig_merge_tags('{}'::text[], p_add, p_remove),
    v_seen, v_seen,
    case when p_dm then v_seen end,
    p_source_flow
  )
  on conflict (tenant_id, ig_user_id) do update set
    username       = coalesce(nullif(p_username, ''), c.username),
    fields         = app.ig_merge_fields(c.fields, p_set),
    tags           = app.ig_merge_tags(c.tags, p_add, p_remove),
    last_seen_at   = greatest(c.last_seen_at, v_seen),
    last_dm_at     = case when p_dm then greatest(c.last_dm_at, v_seen) else c.last_dm_at end,
    source_flow_id = coalesce(c.source_flow_id, p_source_flow),
    updated_at     = now()
  returning c.* into v_row;
  return v_row;
end;
$$;

-- ------------------------------------------------------------
-- 4) Números da tela Pessoas (contados no banco)
-- ------------------------------------------------------------
create or replace function public.ig_contact_stats(p_tenant uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'total', count(*),
    'hoje', count(*) filter (
      where (first_seen_at at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date),
    'janela_24h', count(*) filter (where last_dm_at > now() - interval '24 hours'),
    'com_etiqueta', count(*) filter (where cardinality(tags) > 0),
    'campos', (
      select coalesce(jsonb_agg(jsonb_build_object('campo', x.campo, 'pessoas', x.n) order by x.n desc, x.campo), '[]'::jsonb)
      from (
        select e.key as campo, count(*) as n
        from public.ig_contacts c, jsonb_each(c.fields) e
        where c.tenant_id = p_tenant
        group by e.key order by n desc, e.key limit 10
      ) x),
    'etiquetas', (
      select coalesce(jsonb_agg(jsonb_build_object('etiqueta', x.etiqueta, 'pessoas', x.n) order by x.n desc, x.etiqueta), '[]'::jsonb)
      from (
        select t as etiqueta, count(*) as n
        from public.ig_contacts c, unnest(c.tags) t
        where c.tenant_id = p_tenant
        group by t order by n desc, t limit 50
      ) x)
  )
  from public.ig_contacts
  where tenant_id = p_tenant;
$$;

create or replace function public.ig_contact_field_values(p_tenant uuid, p_field text)
returns table (valor text, pessoas bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (e.value #>> '{}') as valor, count(*) as pessoas
  from public.ig_contacts c, jsonb_each(c.fields) e
  where c.tenant_id = p_tenant and e.key = p_field
  group by 1
  order by 2 desc, 1
  limit 50;
$$;

-- ------------------------------------------------------------
-- 5) Prazos: 12 meses sem conversa; 30 dias depois de cancelar o add-on
-- ------------------------------------------------------------
alter table public.tenant_settings
  add column if not exists instagram_disabled_at timestamptz;

comment on column public.tenant_settings.instagram_disabled_at is
  'Quando o add-on Instagram foi desligado (nulo = ligado). 30 dias depois, ig_purge_contacts apaga as pessoas da loja; até lá a tela Pessoas fica só leitura, com exportação.';

create or replace function public.ig_purge_contacts(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_idle bigint;
  v_off bigint;
begin
  delete from public.ig_contacts where last_seen_at < p_now - interval '12 months';
  get diagnostics v_idle = row_count;

  delete from public.ig_contacts c
  using public.tenant_settings s
  where s.tenant_id = c.tenant_id
    and s.instagram_enabled is not true
    and s.instagram_disabled_at < p_now - interval '30 days';
  get diagnostics v_off = row_count;

  return jsonb_build_object('inativas', v_idle, 'loja_cancelada', v_off);
end;
$$;

-- ------------------------------------------------------------
-- 6) ACL: o default privilege do banco concede EXECUTE a authenticated; só o servidor chama.
-- ------------------------------------------------------------
revoke all on function app.ig_merge_fields(jsonb, jsonb) from public, anon, authenticated;
revoke all on function app.ig_merge_tags(text[], text[], text[]) from public, anon, authenticated;

revoke all on function public.ig_contact_apply(uuid, text, text, jsonb, text[], text[], timestamptz, boolean, uuid)
  from public, anon, authenticated;
revoke all on function public.ig_contact_stats(uuid) from public, anon, authenticated;
revoke all on function public.ig_contact_field_values(uuid, text) from public, anon, authenticated;
revoke all on function public.ig_purge_contacts(timestamptz) from public, anon, authenticated;

grant execute on function public.ig_contact_apply(uuid, text, text, jsonb, text[], text[], timestamptz, boolean, uuid) to service_role;
grant execute on function public.ig_contact_stats(uuid) to service_role;
grant execute on function public.ig_contact_field_values(uuid, text) to service_role;
grant execute on function public.ig_purge_contacts(timestamptz) to service_role;

-- ------------------------------------------------------------
-- 7) Receita nova dos Fluxos: "Comentou, escolhe o grupo"
-- ------------------------------------------------------------
alter table public.ig_flows drop constraint if exists ig_flows_recipe_check;
alter table public.ig_flows add constraint ig_flows_recipe_check
  check (recipe in ('comment_invite', 'comment_confirm_invite', 'comment_follow_invite', 'comment_choose_group', 'dm_invite', 'blank'));
