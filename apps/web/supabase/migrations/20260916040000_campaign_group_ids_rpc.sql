-- RPC atomica para append/remove em campaign_groups.group_ids.
--
-- Tres escritores fazem ler-array -> alterar em JS -> regravar array inteiro
-- (tela de comunidades, auto-grow do worker): dois em voo podem perder a
-- escrita um do outro (classico lost update). As duas funcoes abaixo movem o
-- append/remove pra dentro de um unico UPDATE, atomico por linha no Postgres
-- -- sem round-trip de leitura no meio.
--
-- PATCH /api/campanhas fica FORA desta migracao: aquela rota recebe o array
-- inteiro do cliente (substituicao completa, nao append/remove de 1 id) e
-- precisaria de um mecanismo diferente (versao/optimistic lock) para ficar
-- atomica -- fora de escopo aqui.
--
-- security definer + revoke de public/anon/authenticated: toda funcao nova
-- de public nasce executavel por authenticated (default privilege do
-- grantor) -- so o service-role deve poder chamar.

create or replace function public.campaign_group_append_group_id(
  p_tenant_id uuid,
  p_id uuid,
  p_whatsapp_group_id text
)
returns public.campaign_groups
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.campaign_groups;
begin
  update public.campaign_groups
     set group_ids = array_append(coalesce(group_ids, '{}'), p_whatsapp_group_id)
   where id = p_id
     and tenant_id = p_tenant_id
     and not (coalesce(group_ids, '{}') @> array[p_whatsapp_group_id])
  returning * into v_row;

  if v_row.id is null then
    -- idempotente: ja continha o grupo, ou a linha nao existe/nao e do tenant.
    select * into v_row from public.campaign_groups where id = p_id and tenant_id = p_tenant_id;
  end if;

  return v_row;
end;
$$;

create or replace function public.campaign_group_remove_group_id(
  p_tenant_id uuid,
  p_id uuid,
  p_whatsapp_group_id text
)
returns public.campaign_groups
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.campaign_groups;
begin
  update public.campaign_groups
     set group_ids = array_remove(coalesce(group_ids, '{}'), p_whatsapp_group_id)
   where id = p_id
     and tenant_id = p_tenant_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.campaign_group_append_group_id(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.campaign_group_remove_group_id(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.campaign_group_append_group_id(uuid, uuid, text) to service_role;
grant execute on function public.campaign_group_remove_group_id(uuid, uuid, text) to service_role;
