-- Saídas depois de cada post (aba Análise da campanha): o lojista via no gráfico que gente saiu, mas
-- tinha que cruzar a barra com a marca do post de olho. Saída em massa depois de post é o que vem antes
-- de denúncia e de restrição do número (23/10 e 03/11).
--
-- A regra de atribuição: conta quem saiu dos grupos da campanha que receberam o post, do envio naquele
-- grupo até o menor de (envio + 3 h, próximo post no mesmo grupo). Post colado em outro não conta a
-- mesma saída duas vezes: a saída fica com o post mais recente antes dela. É correlação, não causa.
--
-- "Receberam" = o comando de envio do grupo terminou (`engine_commands.status = 'done'`). Post que
-- saiu pelo Avisos da comunidade (#610) chega aos grupos-membro dela: eles contam como recebidos, na
-- hora em que o Avisos recebeu. O "próximo post" é qualquer post da loja no grupo, de qualquer campanha.
--
-- Agrega no banco: a loja com mais movimento teve 1.902 entregas e 1.496 saídas em 31 dias, e o
-- PostgREST corta em 1000 linhas sem erro. Volta uma linha por rodada do post (o post que repete todo
-- dia tem uma rodada por dia).
--
-- Conferência: infra/tests/saidas-depois-do-post-check.sql. Idempotente; vai nos DOIS bancos pelo CI.

create or replace function public.campaign_post_leaves(
  p_tenant uuid,
  p_campaign uuid,
  p_group_ids text[],
  p_from timestamptz,
  p_to timestamptz
)
returns table (broadcast_id uuid, run_id uuid, sent_at timestamptz, grupos bigint, sairam bigint, conta_ate timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  with entrega as (
    -- Os envios terminados de qualquer post da loja. Até 3 h depois do fim da janela: o post de 23h50
    -- só tem a conta fechada se o das 0h10 do dia seguinte entrar como "próximo post".
    -- ponytail: comando criado mais de 2 dias antes de terminar fica de fora (o filtro em created_at
    -- é o que usa o índice engine_commands_posts_dia_idx); alargar se a fila passar a segurar envio por dias.
    select c.origin_id as broadcast_id, c.origin_run_id as run_id, c.payload->>'jid' as jid, c.completed_at as enviado
    from public.engine_commands c
    where c.tenant_id = p_tenant
      and c.type in ('send_message', 'send_media', 'send_poll')
      and c.origin_kind = 'broadcast'
      and c.status = 'done'
      and c.created_at >= p_from - interval '2 days'
      and c.created_at < p_to + interval '3 hours'
      and c.completed_at >= p_from
      and c.completed_at < p_to + interval '3 hours'
      and p_to > p_from
      and p_to - p_from <= interval '45 days'
  ),
  alcance as (
    -- O grupo que recebeu: o do comando ou, se ele é o Avisos de uma comunidade, cada grupo-membro dela.
    select e.broadcast_id, e.run_id, coalesce(m.whatsapp_group_id, e.jid) as grupo, e.enviado
    from entrega e
    left join public.groups av
      on av.tenant_id = p_tenant
     and av.whatsapp_group_id = e.jid
     and av.community_role = 'announce'
    left join public.groups m
      on m.tenant_id = p_tenant
     and m.community_jid = av.community_jid
     and m.community_role = 'member'
     and m.whatsapp_group_id is not null
  ),
  por_grupo as (
    select a.broadcast_id, a.run_id, a.grupo, min(a.enviado) as enviado
    from alcance a
    where a.grupo = any (p_group_ids)
    group by 1, 2, 3
  ),
  janela as (
    select g.broadcast_id, g.run_id, g.grupo, g.enviado,
           least(
             g.enviado + interval '3 hours',
             coalesce(lead(g.enviado) over (partition by g.grupo order by g.enviado, g.broadcast_id), 'infinity')
           ) as ate
    from por_grupo g
  )
  select j.broadcast_id, j.run_id, min(j.enviado), count(*), coalesce(sum(s.n), 0)::bigint, max(j.ate)
  from janela j
  -- Só os posts desta campanha; o "próximo post" acima já olhou todos os da loja.
  join public.broadcasts b on b.id = j.broadcast_id and b.tenant_id = p_tenant and b.campaign_group_id = p_campaign
  cross join lateral (
    select count(*) as n
    from public.group_member_events ev
    where ev.tenant_id = p_tenant
      and ev.whatsapp_group_id = j.grupo
      and ev.kind = 'leave'
      and ev.occurred_at >= j.enviado
      and ev.occurred_at < j.ate
  ) s
  where j.enviado >= p_from
    and j.enviado < p_to
  group by j.broadcast_id, j.run_id
  order by min(j.enviado);
$$;

comment on function public.campaign_post_leaves(uuid, uuid, text[], timestamptz, timestamptz) is
  'Saídas (group_member_events) nos grupos da campanha que receberam cada post, do envio até o menor de 3 h depois e o próximo post no grupo; uma linha por rodada de post enviada no intervalo (até 45 dias). Chamada só pelo servidor, com o tenant explícito.';

-- O default privilege do grantor postgres dá EXECUTE a authenticated em toda função nova de public
-- (privilegio-definer.test.ts): quem chama é só o servidor.
revoke all on function public.campaign_post_leaves(uuid, uuid, text[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.campaign_post_leaves(uuid, uuid, text[], timestamptz, timestamptz) to service_role;
