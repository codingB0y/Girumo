-- Postar por grupo, PR 6: um grupo, uma campanha (spec 2026-10-10-postar-por-grupo-design §5.8, D4).
--
-- campaign_groups.group_ids guarda whatsapp_group_id. Grupo em duas campanhas tem dois links mandando
-- gente para ele (enche fora de ordem) e ganharia dois nomes no Padronizar (PR 8). Daqui pra frente
-- o banco recusa JID NOVO que já esteja em outra campanha da MESMA loja. O que já está em duas
-- campanhas não trava nada (só o JID que entra agora é conferido) e aparece em
-- grupos_em_mais_de_uma_campanha() para o lojista escolher. Nada sai sozinho.
--
-- Escritores cobertos sem saber do trigger: POST/PATCH /api/campanhas, campaign_group_append_group_id
-- (auto-grow e tela de comunidades) e o espelho de comunidade nativa (insert/update do sync, que
-- filtra antes — lib/campaigns/conflito-grupo.ts#gruposDoEspelho). Remover
-- (campaign_group_remove_group_id) nunca é recusado: não há JID novo. O app transforma a recusa em
-- 409 (lib/campaigns/conflito-grupo-409.ts): aplicar junto do merge do PR 6.
--
-- reordenar_campanha() mora aqui porque o Padronizar (PR 8) depende dela e do trigger juntos.
--
-- Aplicada pelo CI (migrate-dev no push do PR, migrate-prod no merge), depois de
-- 20261010120000_postar_por_grupo.sql. Conferir nos dois bancos com
-- infra/tests/grupo-uma-campanha-check.sql.

-- create trigger toma lock em campaign_groups (escrita do app no meio). Se não conseguir em 5 s,
-- aborta em vez de segurar a fila: é só rodar de novo, a migração é idempotente.
set lock_timeout = '5s';

-- 1) Trigger. security invoker: quem escreve em campaign_groups é service_role (bypassa RLS) ou uma
--    RPC security definer; authenticated não tem escrita em public (20261004120000).
create or replace function app.campaign_groups_grupo_exclusivo()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_antigos text[] := '{}';
  v_jid text;
  v_outra uuid;
begin
  if tg_op = 'UPDATE' then
    v_antigos := coalesce(old.group_ids, '{}');
  end if;

  -- ponytail: sem trava entre transações — duas escritas simultâneas ainda podem criar um conflito,
  -- que então aparece em grupos_em_mais_de_uma_campanha() como os antigos. Se acontecer,
  -- pg_advisory_xact_lock(hashtextextended(new.tenant_id::text, 0)) aqui.
  select n.jid, c.id
    into v_jid, v_outra
    from unnest(coalesce(new.group_ids, '{}')) as n(jid)
    join public.campaign_groups c
      on c.tenant_id = new.tenant_id
     and c.id <> new.id
     and c.group_ids @> array[n.jid]
   where not (v_antigos @> array[n.jid])
   order by c.created_at, c.id
   limit 1;

  if v_jid is not null then
    raise exception using
      errcode = 'unique_violation',
      message = 'grupo_em_outra_campanha:' || v_jid || ':' || v_outra::text;
  end if;

  return new;
end;
$$;

-- Disparar trigger não checa EXECUTE; o revoke é só para ninguém chamá-la por fora.
revoke all on function app.campaign_groups_grupo_exclusivo() from public, anon, authenticated;

drop trigger if exists campaign_groups_grupo_exclusivo on public.campaign_groups;
create trigger campaign_groups_grupo_exclusivo
  before insert or update of group_ids on public.campaign_groups
  for each row
  execute function app.campaign_groups_grupo_exclusivo();

-- 2) Os conflitos que já existem: um JID por linha, cada campanha uma vez (o mesmo JID repetido no
--    array vale a menor posição, como no pool do PR 1), campanhas em ordem de criação.
create or replace function public.grupos_em_mais_de_uma_campanha(p_tenant uuid)
returns table (whatsapp_group_id text, name text, campanhas jsonb)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with posicoes as (
    select j.jid, c.id, c.name, c.slug, c.created_at, min(j.posicao)::integer as posicao
      from public.campaign_groups c
     cross join lateral unnest(c.group_ids) with ordinality as j(jid, posicao)
     where c.tenant_id = p_tenant
     group by j.jid, c.id, c.name, c.slug, c.created_at
  )
  select p.jid,
         coalesce(nullif(g.name, ''), p.jid),
         jsonb_agg(
           jsonb_build_object('id', p.id, 'name', p.name, 'slug', p.slug, 'posicao', p.posicao)
           order by p.created_at, p.id)
    from posicoes p
    left join public.groups g
      on g.tenant_id = p_tenant
     and g.whatsapp_group_id = p.jid
   group by p.jid, g.name
  having count(*) > 1
   order by coalesce(nullif(g.name, ''), p.jid), p.jid;
$$;

-- 3) Ordem nova só se a lista é a que a tela viu (o auto-grow pode ter anexado um grupo no meio) e
--    se a nova é permutação dela, sem repetido. `for update` segura o append concorrente. O update
--    passa pelo trigger sem JID novo, então conflito antigo não trava.
create or replace function public.reordenar_campanha(
  p_tenant uuid,
  p_campanha uuid,
  p_esperado text[],
  p_nova text[]
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_atual text[];
begin
  select group_ids
    into v_atual
    from public.campaign_groups
   where id = p_campanha
     and tenant_id = p_tenant
     for update;

  if not found
     or p_esperado is null
     or p_nova is null
     or cardinality(p_nova) <> (select count(distinct x) from unnest(p_nova) as x)
     or array(select distinct x from unnest(coalesce(v_atual, '{}')) as x order by 1)
        is distinct from array(select distinct x from unnest(p_esperado) as x order by 1)
     or array(select x from unnest(p_nova) as x order by 1)
        is distinct from array(select distinct x from unnest(p_esperado) as x order by 1)
  then
    return false;
  end if;

  update public.campaign_groups
     set group_ids = p_nova
   where id = p_campanha
     and tenant_id = p_tenant;

  return true;
end;
$$;

-- 4) Só o service-role chama (o default privilege do grantor postgres dá EXECUTE a authenticated em
--    toda função nova de public).
revoke all on function public.grupos_em_mais_de_uma_campanha(uuid) from public, anon, authenticated;
grant execute on function public.grupos_em_mais_de_uma_campanha(uuid) to service_role;
revoke all on function public.reordenar_campanha(uuid, uuid, text[], text[]) from public, anon, authenticated;
grant execute on function public.reordenar_campanha(uuid, uuid, text[], text[]) to service_role;
