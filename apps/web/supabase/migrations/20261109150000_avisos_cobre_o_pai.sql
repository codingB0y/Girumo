-- 09/11/2026: o Avisos substitui tambem o pai da comunidade.
--
-- Complemento de 20261109140000. app.alvos_do_disparo com group_ids vazio ("todos os grupos") devolve
-- todo grupo em que somos admin, e isso inclui o grupo-pai da comunidade (quem cria a comunidade e admin
-- dele). O pai nao e um chat: postar nele nao chega a ninguem. Quando a comunidade inteira esta no alvo
-- e sai pelo Avisos, o pai sai junto: `cobertos` passa a ser tudo o que o Avisos substitui, os
-- grupos-membro e o pai. app.enqueue_broadcast nao muda (ja remove `cobertos` do alvo), entao a trava
-- de md5 de 20261109140000 segue valendo. Arquivo separado porque o CI nao reaplica arquivo ja
-- registrado em ops.applied_migrations.

create or replace function app.avisos_que_cobrem(p_tenant uuid, p_jids text[])
returns table (community_jid text, aviso_jid text, cobertos text[])
language sql
stable
security definer
set search_path = public, app
as $$
  with alvo as (
    select distinct t.jid from unnest(coalesce(p_jids, '{}'::text[])) as t(jid)
  ),
  membros as (
    select g.community_jid, g.whatsapp_group_id as jid, (a.jid is not null) as no_alvo
    from public.groups g
    left join alvo a on a.jid = g.whatsapp_group_id
    where g.tenant_id = p_tenant
      and g.community_jid is not null
      and g.community_role = 'member'
      and g.whatsapp_group_id is not null
  ),
  cobertas as (
    select m.community_jid, array_agg(m.jid) as membros
    from membros m
    group by m.community_jid
    having bool_and(m.no_alvo)
  )
  select
    c.community_jid,
    av.whatsapp_group_id,
    -- O que o Avisos substitui: os grupos-membro e o pai (quando o conhecemos). Quem chama tira
    -- isto do alvo e poe o Avisos no lugar; o que nao estava no alvo simplesmente nao e removido.
    (
      select coalesce(array_agg(x.jid order by x.jid), '{}'::text[])
      from (
        select unnest(c.membros) as jid
        union
        select p.whatsapp_group_id
        from public.groups p
        where p.tenant_id = p_tenant
          and p.community_jid = c.community_jid
          and p.community_role = 'parent'
          and p.whatsapp_group_id is not null
      ) x
    ) as cobertos
  from cobertas c
  join public.groups av
    on av.tenant_id = p_tenant
   and av.community_jid = c.community_jid
   and av.community_role = 'announce'
   and av.is_admin
   and av.whatsapp_group_id is not null;
$$;

revoke all on function app.avisos_que_cobrem(uuid, text[]) from public, anon, authenticated;
grant execute on function app.avisos_que_cobrem(uuid, text[]) to service_role;
