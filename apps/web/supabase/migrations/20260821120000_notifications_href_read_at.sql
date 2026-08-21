-- ============================================================
-- notifications: repõe `href` e `read_at`.
--
-- A tabela tem DUAS migrações concorrentes, ambas com `create table
-- if not exists`, e as colunas divergem:
--   infra/migrations/202607010010_notifications.sql       -> tem href e read_at
--   apps/web/.../20260728140000_notifications.sql         -> não tem
-- Quem aplicou só a segunda ficou com a tabela curta. Em dev é o caso:
-- `select id, type, title, body, href, read_at, created_at` devolve
--   42703 column notifications.href does not exist
-- e a GET /api/notifications responde 500 em TODO carregamento do
-- /painel (o sino degrada em silêncio, por isso passou despercebido).
--
-- Também derruba, sem erro visível, os três inserts de
-- /api/notifications/alerts (grupo quase cheio, campanha parada,
-- grupo sem convite) — todos mandam `href`.
--
-- Idempotente: onde a tabela já é a completa, é no-op.
-- ============================================================

alter table notifications add column if not exists href text;
alter table notifications add column if not exists read_at timestamptz;

-- Índice parcial que serve o contador de não-lidas do sino.
create index if not exists idx_notifications_tenant_unread
  on notifications(tenant_id, created_at desc)
  where read_at is null;
