-- Postar por grupo: grupo pai e Avisos de comunidade saem do pool da campanha.
--
-- Em 14/10/2026, em prod, três campanhas tinham o Avisos de comunidades (440 a 1848 membros) em
-- group_ids. app.estados_da_campanha (20261010120000) contava esses grupos como qualquer outro:
-- entravam nas regras "Só lotados" e "Todos com gente", o Avisos podia virar o "enchendo" do link
-- /r/, e com o PR 5b (regra como padrão de todo post) o post iria para a comunidade inteira sem
-- ninguém escolher. A lista fixa (group_ids sem target_rule) não muda: quem marca o Avisos à mão
-- continua mandando para ele.
--
-- Uma troca no corpo de app.estados_da_campanha: o where em community_role. Assinatura, colunas
-- de saída e volatilidade iguais, então a baseline (deploy/supabase/schema-baseline.json) não
-- muda e o gate de drift NÃO vê esta migração — conferir com
-- infra/tests/pool-sem-estrutura-de-comunidade-check.sql nos DOIS bancos (dev
-- wfjuwogxaupyadwhvoxy, prod nidoatbxaylrkcgbszns).
--
-- Idempotente.

-- Trava: o corpo abaixo é o de 20261010120000 com UMA troca. Se este banco tiver outro corpo
-- (correção aplicada à mão), o create or replace a apagaria em silêncio. Mesmo md5 normalizado
-- de 20261010120000 (prosrc sem comentário de linha e com espaço reduzido a um). Reaplicar passa:
-- o corpo novo tem community_role.
do $$
declare
  v_src text;
begin
  select p.prosrc into v_src
  from pg_proc p
  where p.oid = to_regprocedure('app.estados_da_campanha(uuid,uuid)');
  if v_src is null then
    raise exception 'pool_sem_estrutura: app.estados_da_campanha não existe neste banco (falta 20261010120000)';
  end if;
  if md5(btrim(regexp_replace(regexp_replace(v_src, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
       <> '6d75e9275f3c58b23d1abe6edfe98109'
     and position('community_role' in v_src) = 0 then
    raise exception 'pool_sem_estrutura: o corpo de app.estados_da_campanha neste banco difere do repo. Copie o pg_get_functiondef deste banco para a migração, refaça a troca e aplique de novo.';
  end if;
end $$;

create or replace function app.estados_da_campanha(p_tenant uuid, p_campanha uuid)
returns table (
  posicao integer,
  group_id uuid,
  whatsapp_group_id text,
  name text,
  members integer,
  capacity integer,
  is_admin boolean,
  invite_url text,
  lotado_em timestamptz,
  lotado_por text,
  reaberto_em timestamptz,
  aviso_lotou_em timestamptz,
  estado text,
  pode_reabrir boolean,
  na_regra_menos_enchendo boolean,
  na_regra_lotados boolean,
  na_regra_com_gente boolean
)
language sql
stable
set search_path = ''
as $$
  with pool as (
    -- JID repetido no array vale a menor posição.
    select distinct on (p.jid) p.jid, p.posicao::integer as posicao
    from public.campaign_groups c
    cross join lateral unnest(c.group_ids) with ordinality as p(jid, posicao)
    where c.tenant_id = p_tenant
      and c.id = p_campanha
    order by p.jid, p.posicao
  ),
  grupos as (
    -- JID do pool sem linha em groups não sai (o link já o ignora; diagnosePool trata).
    select pool.posicao, g.id, g.whatsapp_group_id, g.name, g.members, g.capacity, g.is_admin,
           g.invite_url, g.lotado_em, g.lotado_por, g.reaberto_em, g.aviso_lotou_em, g.admins_ours,
           -- Disponível = isGroupAvailable (resolve-click-target.ts, convite com /i) + não lotado.
           (g.is_admin
             and coalesce(g.invite_url, '') ~* '^https?://\S+$'
             and g.lotado_em is null
             and g.members < app.limiar_lotado(g.capacity)) as disponivel
    from pool
    join public.groups g
      on g.tenant_id = p_tenant
     and g.whatsapp_group_id = pool.jid
    -- Estrutura de comunidade fica fora do pool: o pai não recebe mensagem, e o Avisos fala com a
    -- comunidade inteira, então só por escolha explícita ("Enviar pelo Avisos" ou lista marcada).
    -- Fora daqui, não vira estado, não entra em regra (alvos_da_regra lê esta função) e o link
    -- nunca manda gente para ele.
    where coalesce(g.community_role, '') not in ('parent', 'announce')
  ),
  enchendo as (
    -- O primeiro disponível: reabertos primeiro (D3), entre eles e depois deles a ordem do pool.
    select gr.id
    from grupos gr
    where gr.disponivel
    order by (gr.reaberto_em is null), gr.posicao
    limit 1
  ),
  classificados as (
    select gr.*,
           case
             when gr.lotado_em is not null then 'lotado'
             when gr.id = (select e.id from enchendo e) then 'enchendo'
             when gr.members <= greatest(gr.admins_ours, 1) then 'vazio'
             else 'fila'
           end as estado
    from grupos gr
  )
  select cl.posicao, cl.id, cl.whatsapp_group_id, cl.name, cl.members, cl.capacity, cl.is_admin,
         cl.invite_url, cl.lotado_em, cl.lotado_por, cl.reaberto_em, cl.aviso_lotou_em, cl.estado,
         (cl.lotado_em is not null and cl.members < app.limiar_lotado(cl.capacity)),
         app.grupo_na_regra(cl.estado, cl.is_admin, 'menos_enchendo'),
         app.grupo_na_regra(cl.estado, cl.is_admin, 'lotados'),
         app.grupo_na_regra(cl.estado, cl.is_admin, 'com_gente')
  from classificados cl
  order by cl.posicao;
$$;

-- create or replace não garante o ACL (finding-create-or-replace-nao-preserva-acl-em-dev).
revoke all on function app.estados_da_campanha(uuid, uuid) from public, anon, authenticated;
grant execute on function app.estados_da_campanha(uuid, uuid) to service_role;
