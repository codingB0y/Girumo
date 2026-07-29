-- ============================================================
-- Sprint 5 / F5 — Aposenta o tipo de comando `refresh_status`
--
-- `POST /api/engine/commands` aceitava `send_message` e `refresh_status`, mas só
-- o engine legado drenava o segundo (via `claim_engine_commands`). O worker novo
-- claima por `claim_send_commands`, que filtra tipos de envio — então, depois do
-- cutover, comando `refresh_status` ficaria `queued` para sempre.
--
-- E não dá para o worker chamar `claim_engine_commands` no lugar: ela NÃO filtra
-- por tipo, logo claimaria `send_message` sem o gate anti-ban.
--
-- O tipo saiu do `ALLOWED_TYPES` da rota (impede linhas novas). Esta migration
-- fecha o outro lado: as linhas que já existem. O lifecycle de instância não
-- passa por fila desde a F2 — o painel fala com a Evolution direto em
-- `/api/instances/[id]/actions` — então nenhum fluxo vivo depende destas linhas.
-- ============================================================

update public.engine_commands
set
  status = 'canceled',
  error = 'refresh_status aposentado (F5): tipo sem consumidor',
  updated_at = now()
where type = 'refresh_status'
  and status in ('queued', 'processing');

-- Idempotente por construção: depois de rodar, o `where` não recasa (as linhas
-- viraram 'canceled'). Reaplicar é no-op, não duplica nem reverte nada.
