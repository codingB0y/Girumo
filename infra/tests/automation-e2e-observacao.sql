-- Observação do teste ponta a ponta do executor de automações.
--
-- Não muda nada: são só SELECTs para acompanhar um teste manual em produção.
-- O roteiro que dispara o teste está em docs/runbooks/2026-07-29-teste-e2e-automacoes.md.
--
-- Rode os blocos na ordem, na janela do teste. Cada um responde a UMA pergunta
-- da cadeia: webhook chegou? virou lead? virou run? o run enfileirou comando?
-- alguém consumiu o comando?
--
-- Substitua :tenant pelo tenant sob teste e :grupo pelo JID do grupo de teste.

\set tenant '9888373f-e57b-44cb-9cf6-2d8944783150'
\set grupo  'COLE_AQUI@g.us'

-- ---------------------------------------------------------------------------
-- 0. Pré-voo: o worker está vivo? (sem isso, nada abaixo acontece)
-- ---------------------------------------------------------------------------
select
  max(processed_at)                        as ultimo_evento_processado,
  now() - max(processed_at)                as ha_quanto_tempo,
  count(*) filter (where status = 'pending') as pendentes
from engine_events;
-- Esperado: ha_quanto_tempo abaixo de ~1 min. Se passar de alguns minutos com
-- pendentes acumulando, o worker caiu — pare o teste e suba ele antes.

-- ---------------------------------------------------------------------------
-- 0b. O grupo de teste está sincronizado E somos admin?
--     lead-capture ignora grupo não-admin de propósito; sem isso o teste
--     "falha" por um motivo que não é o executor.
-- ---------------------------------------------------------------------------
select id, name, whatsapp_group_id, is_admin, members, updated_at as ultimo_sync
from groups
where tenant_id = :'tenant' and whatsapp_group_id = :'grupo';
-- Esperado: uma linha, is_admin = true. Se não vier nada, rode o sync de grupos
-- no painel antes de continuar.

-- ---------------------------------------------------------------------------
-- 0c. Quais automações estão ligadas neste tenant?
--     Confira ANTES de começar: uma automação weekly_recurring ligada faz
--     fan-out pra TODOS os grupos sincronizados na próxima varredura.
-- ---------------------------------------------------------------------------
select id, name, trigger, enabled, total_runs, last_run_at
from automations
where tenant_id = :'tenant'
order by enabled desc, trigger;
-- Esperado durante o teste: só a automação lead_entered do teste com enabled = true.

-- ---------------------------------------------------------------------------
-- 1. O webhook da entrada chegou e foi processado?
-- ---------------------------------------------------------------------------
select event_id, type, status::text, payload->'data'->>'action' as acao,
       created_at, processed_at, error
from engine_events
where tenant_id = :'tenant'
  and type = 'group-participants.update'
  and payload->'data'->>'id' = :'grupo'
  and created_at > now() - interval '30 minutes'
order by created_at desc;
-- Esperado: uma linha com acao = 'add' e status = 'processed'.

-- ---------------------------------------------------------------------------
-- 2. Virou lead?
-- ---------------------------------------------------------------------------
select id, phone, name, source_group_name, status, entered_at, created_at
from leads
where tenant_id = :'tenant'
  and created_at > now() - interval '30 minutes'
order by created_at desc;
-- Esperado: uma linha, do número que entrou. `phone` nulo é aceitável se o
-- participante veio como @lid — o run é criado do mesmo jeito.

-- ---------------------------------------------------------------------------
-- 3. Virou run? (gatilho lead_entered da camada 2)
-- ---------------------------------------------------------------------------
select r.id, a.name as automacao, r.status::text, r.current_step,
       r.target_group_jid, r.next_step_at, r.claimed_at, r.lease_expires_at,
       r.attempts, r.dedupe_key, r.error, r.created_at, r.updated_at
from automation_runs r
join automations a on a.id = r.automation_id
where r.tenant_id = :'tenant'
  and r.created_at > now() - interval '30 minutes'
order by r.created_at desc;
-- Esperado logo após a entrada: status 'pending', current_step 0.
-- Depois do 1º tick:  current_step 1 e next_step_at ~5 min à frente (passo `wait`).
-- Depois do 2º tick:  current_step 2 (o passo `message` enfileirou) e, no tick
--                     seguinte, status 'done'.

-- ---------------------------------------------------------------------------
-- 4. O run enfileirou o comando de envio? (fim do contrato do executor)
-- ---------------------------------------------------------------------------
select id, tenant_id, instance_id, type, status::text, priority, dedupe_key,
       payload->>'jid'  as destino,
       payload->>'text' as texto,
       attempts, claimed_at, completed_at, error, created_at
from engine_commands
where tenant_id = :'tenant'
  and created_at > now() - interval '30 minutes'
order by created_at desc;
-- Esperado: uma linha, type 'send_message', dedupe_key 'auto:<run_id>:1',
-- destino = o grupo de teste (SEMPRE terminando em @g.us — nunca @s.whatsapp.net),
-- texto = a mensagem do template.
--
-- ATENÇÃO: status fica 'queued' e attempts = 0 indefinidamente enquanto não
-- existir consumidor de engine_commands em produção. Isso é o esperado hoje e
-- NÃO é falha do executor — ver a etapa 2 do runbook.

-- ---------------------------------------------------------------------------
-- 5. Alguém consumiu o comando? (etapa hoje bloqueada)
-- ---------------------------------------------------------------------------
select status::text, count(*), min(created_at) as mais_antigo,
       max(completed_at) as ultimo_completo, max(attempts) as max_tentativas
from engine_commands
group by 1 order by 1;
-- Hoje: só 'queued', ultimo_completo nulo, max_tentativas 0 — ninguém claima.
-- Quando o consumidor existir: aparecem 'done' e ultimo_completo preenchido.

-- ---------------------------------------------------------------------------
-- 6. Limpeza — rode ao fim do teste.
--    Só apaga o que o teste criou, pelo dedupe_key do run.
-- ---------------------------------------------------------------------------
-- delete from engine_commands
--  where tenant_id = :'tenant' and dedupe_key like 'auto:%'
--    and created_at > now() - interval '2 hours';
-- delete from automation_runs
--  where tenant_id = :'tenant' and created_at > now() - interval '2 hours';
-- delete from leads
--  where tenant_id = :'tenant' and created_at > now() - interval '2 hours';
-- update automations set enabled = false
--  where tenant_id = :'tenant' and trigger = 'lead_entered';
