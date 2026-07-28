-- F3b: 'processing' faltava no enum engine_event_status.
--
-- A F3a criou app.claim_engine_events e app.requeue_stale_engine_events usando
-- status = 'processing' (espelhando engine_command_status, que tem esse valor),
-- mas o enum base engine_event_status só tinha ('received','processed','failed').
-- Nada chamou essas funções ainda — o worker (F3b) é o primeiro consumidor —,
-- então o bug estava dormente. No primeiro claim o Postgres lançaria
-- "invalid input value for enum engine_event_status: 'processing'".
--
-- Só o valor precisa ser adicionado: as funções da F3a já referenciam
-- 'processing' como literal e passam a funcionar assim que ele existe.
-- IF NOT EXISTS torna a migração idempotente (re-rodar é no-op).

alter type public.engine_event_status add value if not exists 'processing';
