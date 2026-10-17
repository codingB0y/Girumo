-- 2026-10-17 - Fila segurada pelo anti-ban não é mais cancelada como "servidor fora do ar".
--
-- Incidente de 09/10/2026 (prod, o lojista que mais envia): o número bateu o teto da hora
-- (per_hour 111 = 37 grupos x 3) e ficou ~30 min sem enviar, como manda o anti-ban. O bloco de
-- cancelamento de app.claim_send_commands (20260930120000) lê "número sem envio há 15 min" como
-- worker/VPS fora do ar e cancelou 93 envios de três ofertas, minutos antes de a janela reabrir.
-- A pausa de 30 min por 429 cai no mesmo buraco: o cancelamento chega sempre antes de ela acabar.
--
-- Agora o relógio da tolerância começa no FIM da retenção do anti-ban (app.send_hold_ended_at:
-- teto da hora e pausa por 429), não no horário do comando. Número livre do gate há mais que a
-- tolerância e mesmo assim sem enviar continua cancelado (servidor fora do ar, número
-- desconectado), e esse é o caso que 20260930120000 existe para cobrir.
--
-- Fora da retenção de propósito:
--   - teto do DIA: seguraria a oferta até 24 h e ela sairia no dia seguinte, na frente das
--     ofertas do dia. Continua cancelando, agora com o motivo certo no erro;
--   - breaker (60 s a partir da 5a falha seguida): é número falhando, não anti-ban.
--
-- Muda o corpo de app.claim_send_commands (assinatura igual) e cria app.send_hold_ended_at.
-- Nada disso é schema public, então a baseline (deploy/supabase/schema-baseline.json) não muda e
-- o gate de drift NÃO vê esta migração: conferir o md5 abaixo nos DOIS bancos (dev
-- wfjuwogxaupyadwhvoxy, prod nidoatbxaylrkcgbszns).
--
-- Idempotente.

-- Trava: o corpo de app.claim_send_commands abaixo é o de 20260930120000 (= pg_get_functiondef de
-- dev e prod em 17/10) com duas trocas no bloco de cancelamento. Se este banco tiver outro corpo
-- (correção aplicada à mão), o create or replace a apagaria em silêncio. Só passa com um dos dois
-- corpos conhecidos, pelo md5 normalizado (prosrc sem comentário de linha e com espaço reduzido a
-- um, como em 20261010120000): o de 20260930120000 ou o desta migração (reaplicar passa).
do $$
declare
  v_src text;
begin
  select p.prosrc into v_src
  from pg_proc p
  where p.oid = to_regprocedure('app.claim_send_commands(integer,uuid)');
  if v_src is null then
    raise exception 'antiban_nao_cancela: app.claim_send_commands não existe neste banco (falta 20260930120000)';
  end if;
  if md5(btrim(regexp_replace(regexp_replace(v_src, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
       not in ('13e1c822167c7c079bf4a070fd52470e', '531a0fd5414fe8bbec857ceb771f2505') then
    raise exception 'antiban_nao_cancela: o corpo de app.claim_send_commands neste banco difere do repo. Copie o pg_get_functiondef deste banco para a migração, refaça as trocas e aplique de novo.';
  end if;
end $$;

-- Instante em que o próprio anti-ban soltou (ou vai soltar) o número. -infinity = nada segurando.
-- Só os gates que passam da tolerância contam: o de 1 minuto e o espaçamento de 3-7 s não seguram
-- 15 min.
create or replace function app.send_hold_ended_at(target_instance_id uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_per_hour integer;
  v_teto     timestamptz;
  v_pausa    timestamptz;
begin
  select k.per_hour into v_per_hour from app.instance_caps(target_instance_id) k;

  -- Teto da hora. A janela é deslizante (o claim exige count(sent_at > now() - 1 hour) < per_hour),
  -- então ela solta uma hora depois do per_hour-ésimo envio mais recente. Sem filtro de janela de
  -- propósito: num teto que soltou há 10 min esse envio tem 70 min.
  select x.sent_at + interval '1 hour' into v_teto
    from public.instance_sends x
   where x.instance_id = target_instance_id
   order by x.sent_at desc
   limit 1
  offset greatest(coalesce(v_per_hour, 1), 1) - 1;

  -- Pausa por 429 (record_send_failure: 30 min). Só conta enquanto o breaker não disparou: ele
  -- pausa 60 s a partir da 5a falha seguida e renova a cada nova falha, e um número desconectado
  -- ficaria retido para sempre. Abaixo de 5 falhas seguidas, paused_until só pode ter vindo de um
  -- 429 (record_send zera os dois). Por isso cinco 429 seguidos (~2 h) também soltam.
  select s.paused_until into v_pausa
    from public.instance_send_state s
   where s.instance_id = target_instance_id
     and s.consecutive_failures < 5;

  return coalesce(greatest(v_teto, v_pausa), '-infinity'::timestamptz);
end;
$$;

revoke all on function app.send_hold_ended_at(uuid) from public, anon, authenticated;
grant execute on function app.send_hold_ended_at(uuid) to service_role;

-- Trocas no bloco de cancelamento: (1) número parado = sem envio na tolerância E livre do anti-ban
-- há mais que a tolerância; (2) o erro diz o motivo. O claim abaixo dele não muda.
CREATE OR REPLACE FUNCTION app.claim_send_commands(max_commands integer DEFAULT 5, p_tenant uuid DEFAULT NULL::uuid)
 RETURNS SETOF engine_commands
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
begin
  -- Envio parado na fila alem da tolerancia, num numero que nao mandou nada
  -- nesse intervalo sem o anti-ban segurando (worker/VPS fora do ar, numero
  -- desconectado), e cancelado em vez de sair atrasado. A tolerancia conta do
  -- fim da retencao (app.send_hold_ended_at): fila parada pelo teto da hora ou
  -- pela pausa de 429 espera o gate abrir e sai (incidente de 09/10/2026).
  -- reconcile_broadcast_progress fecha a oferta.
  update public.engine_commands c
  set status = 'canceled',
      error = case
        -- Teto do dia nao entra na retencao (sairia no dia seguinte): cancela, com o motivo.
        when (select count(*) from public.instance_sends x
              where x.instance_id = c.instance_id
                and x.sent_at > now() - interval '1 day')
             >= (select k.per_day from app.instance_caps(c.instance_id) k)
          then 'Não enviado: ficou parado na fila além do horário (número no teto diário do anti-ban).'
        else 'Não enviado: ficou parado na fila além do horário (servidor ou número fora do ar).'
      end,
      lease_expires_at = null,
      updated_at = now()
  where c.status = 'queued'
    and (p_tenant is null or c.tenant_id = p_tenant)
    and c.type in ('send_message', 'send_media', 'send_poll')
    and c.instance_id is not null
    and c.available_at < now() - app.missed_send_tolerance()
    -- case, e nao and: a retencao (cara) so e calculada para numero sem envio recente.
    and case
      when exists (
        select 1 from public.instance_sends x
        where x.instance_id = c.instance_id
          and x.sent_at > now() - app.missed_send_tolerance()
      ) then false
      else app.send_hold_ended_at(c.instance_id) < now() - app.missed_send_tolerance()
    end;

  return query
  update public.engine_commands c
  set
    status = 'processing',
    claimed_at = now(),
    lease_expires_at = now() + interval '2 minutes',
    updated_at = now()
  where c.id in (
    select cand.id
    from public.engine_commands cand
    cross join lateral app.instance_caps(cand.instance_id) caps
    where cand.status = 'queued'
      and (p_tenant is null or cand.tenant_id = p_tenant)
      and cand.type in ('send_message', 'send_media', 'send_poll')
      and cand.available_at <= now()
      and cand.instance_id is not null
      and not exists (
        select 1 from public.instance_send_state s
        where s.instance_id = cand.instance_id
          and s.paused_until is not null
          and s.paused_until > now()
      )
      and coalesce(
        (select s.next_send_allowed_at from public.instance_send_state s where s.instance_id = cand.instance_id),
        now()
      ) <= now()
      and (select count(*) from public.instance_sends x
           where x.instance_id = cand.instance_id and x.sent_at > now() - interval '1 minute') < caps.per_min
      and (select count(*) from public.instance_sends x
           where x.instance_id = cand.instance_id and x.sent_at > now() - interval '1 hour') < caps.per_hour
      and (select count(*) from public.instance_sends x
           where x.instance_id = cand.instance_id and x.sent_at > now() - interval '1 day') < caps.per_day
      and cand.id = (
        select best.id
        from public.engine_commands best
        where best.status = 'queued'
          and (p_tenant is null or best.tenant_id = p_tenant)
          and best.type in ('send_message', 'send_media', 'send_poll')
          and best.available_at <= now()
          and best.instance_id = cand.instance_id
        order by best.priority asc, best.created_at asc, best.id asc
        limit 1
      )
    order by cand.priority asc, cand.created_at asc, cand.id asc
    limit greatest(max_commands, 1)
    for update of cand skip locked
  )
  returning c.*;
end;
$function$;

-- create or replace não preserva o ACL em todo banco (ver 20260904100000): explícito sempre.
revoke all on function app.claim_send_commands(integer, uuid) from public, anon, authenticated;
grant execute on function app.claim_send_commands(integer, uuid) to service_role;
