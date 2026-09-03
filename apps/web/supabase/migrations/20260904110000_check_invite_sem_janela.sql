-- check_invite volta ao ritmo do lote. A janela de 60 s (D7, PR #238) tratava
-- uma leitura (GET /group/inviteCode) com a cadência de uma escrita de admin:
-- 91 grupos em 1 h 31. Nenhuma fonte associa leitura de convite a ban; o 429
-- documentado (Baileys #797, Evolution #691) é rajada de metadata, e 1 op/4 s
-- está ordens de grandeza abaixo. Aplicar nos DOIS bancos.
--
-- Também libera campaign_group_id: o backfill de convite passa a entrar nesta
-- fila a partir do sync, sem campanha. A tela de progresso filtra por
-- campaign_group_id, então lotes sem campanha ficam invisíveis para ela.

begin;

alter table public.group_bulk_jobs alter column campaign_group_id drop not null;

create or replace function public.claim_bulk_jobs(p_tenant uuid, p_limit integer default 1)
 returns setof group_bulk_jobs
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  return query
  with picked as (
    select id
      from public.group_bulk_jobs
     where tenant_id = p_tenant
       and status = 'queued'
     order by created_at
     limit greatest(p_limit, 1)
     for update skip locked
  )
  update public.group_bulk_jobs j
     set status        = 'running',
         running_since = now(),
         last_ack_at   = now(),
         attempts      = j.attempts + 1,
         updated_at    = now()
    from picked
   where j.id = picked.id
  returning j.*;
end;
$function$;

revoke all on function public.claim_bulk_jobs(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_bulk_jobs(uuid, integer) to service_role;

commit;
