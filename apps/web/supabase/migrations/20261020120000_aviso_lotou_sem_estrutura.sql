-- Postar por grupo, PR 9: o aviso ao lotar não sai para grupo pai nem Avisos de comunidade, nem
-- para loja sem plano.
--
-- 1. Estrutura de comunidade. app.groups_marca_lotado (20261010120000) não olha community_role:
--    um Avisos que cruza 95% subindo (webhook/sync) ganha lotado_em com aviso_lotou_em nulo, e a
--    varredura seguinte mandava "Lotou!" pelo Avisos — que fala com a comunidade INTEIRA. Em
--    14/10/2026, em prod, três campanhas tinham Avisos de 440 a 1848 membros em group_ids (ver
--    20261014120000, que tirou a estrutura do pool pelo mesmo critério). Agora pai e Avisos nunca
--    são escolhidos pela varredura; ficam com aviso_lotou_em nulo e saem sozinhos pela janela de 1 h.
-- 2. Loja sem plano (C17, 20261017123000 cobriu promote_due_schedules e o auto-grow, não o aviso):
--    cancelou ou ficou inadimplente, o aviso automático não sai. Tratada como o grupo sem admin —
--    não cria nem enfileira o disparo, mas grava aviso_lotou_em. Sem a marca, as linhas dela
--    voltariam a cada ciclo de 30 s e podiam encher o lote do p_limit, deixando sem aviso as lojas
--    que têm plano.
--
-- Só o corpo de public.enviar_avisos_lotou muda. Assinatura, retorno, security definer e
-- volatilidade iguais, então a baseline (deploy/supabase/schema-baseline.json) não muda e o gate de
-- drift NÃO vê esta migração — conferir com infra/tests/aviso-lotou-sem-estrutura-check.sql nos DOIS
-- bancos (dev wfjuwogxaupyadwhvoxy, prod nidoatbxaylrkcgbszns).
--
-- Idempotente.

-- Trava: o corpo abaixo é o de 20261010120000 com DUAS trocas. Se este banco tiver outro corpo
-- (correção aplicada à mão), o create or replace a apagaria em silêncio. Só passa com um dos dois
-- corpos conhecidos, pelo md5 normalizado (prosrc sem comentário de linha e com espaço reduzido a
-- um, como em 20261014120000): o de 20261010120000 ou o desta migração (reaplicar passa).
do $$
declare
  v_src text;
begin
  select p.prosrc into v_src
  from pg_proc p
  where p.oid = to_regprocedure('public.enviar_avisos_lotou(integer)');
  if v_src is null then
    raise exception 'aviso_lotou_sem_estrutura: public.enviar_avisos_lotou não existe neste banco (falta 20261010120000)';
  end if;
  if md5(btrim(regexp_replace(regexp_replace(v_src, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
       not in ('29ef01e9ebafb16f51fc13f7cabc1b2d', 'a327f82def776a8031a6a63050f45576') then
    raise exception 'aviso_lotou_sem_estrutura: o corpo de public.enviar_avisos_lotou neste banco difere do repo. Copie o pg_get_functiondef deste banco para a migração, refaça as trocas e aplique de novo.';
  end if;
end $$;

-- Trocas: (1) o where de fora ganha o filtro de community_role; (2) o envio exige plano além de
-- admin. O resto é o corpo de 20261010120000.
create or replace function public.enviar_avisos_lotou(p_limit integer default 20)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_broadcast_id uuid;
  v_bc public.broadcasts;
  v_enviados integer := 0;
begin
  for r in
    select g.id as group_id, g.tenant_id, g.whatsapp_group_id, g.name, g.is_admin,
           c.id as campanha_id, c.aviso_ao_lotar
    from public.groups g
    cross join lateral (
      select cg.id, cg.aviso_ao_lotar
      from public.campaign_groups cg
      where cg.tenant_id = g.tenant_id
        and g.whatsapp_group_id = any(cg.group_ids)
        and nullif(btrim(cg.aviso_ao_lotar), '') is not null
        and g.lotado_em >= cg.aviso_ao_lotar_desde
      order by cg.created_at, cg.id
      limit 1
    ) as c
    where g.lotado_em is not null
      and g.lotado_em >= now() - interval '1 hour'
      and g.aviso_lotou_em is null
      -- Pai não recebe mensagem e o Avisos fala com a comunidade inteira: nunca escolhidos, nem
      -- marcados (somem pela janela de 1 h).
      and coalesce(g.community_role, '') not in ('parent', 'announce')
    order by g.lotado_em, g.id
    limit greatest(coalesce(p_limit, 20), 1)
    for update of g skip locked
  loop
    -- Sem admin (o WhatsApp recusaria) ou loja sem plano (C17): não envia, mas marca abaixo.
    if r.is_admin and app.tenant_concede_plano(r.tenant_id) then
      insert into public.broadcasts (tenant_id, campaign_group_id, name, message, group_ids, status)
      values (r.tenant_id, r.campanha_id, 'Aviso ao lotar · ' || r.name, r.aviso_ao_lotar,
              array[r.whatsapp_group_id], 'draft')
      returning id into v_broadcast_id;

      v_bc := app.enqueue_broadcast(r.tenant_id, v_broadcast_id);
      if v_bc.status = 'queued' then
        v_enviados := v_enviados + 1;
      end if;
    end if;

    update public.groups
       set aviso_lotou_em = now()
     where tenant_id = r.tenant_id
       and id = r.group_id;
  end loop;

  return v_enviados;
end;
$$;

-- create or replace não garante o ACL (finding-create-or-replace-nao-preserva-acl-em-dev).
revoke all on function public.enviar_avisos_lotou(integer) from public, anon, authenticated;
grant execute on function public.enviar_avisos_lotou(integer) to service_role;
