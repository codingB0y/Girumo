-- F1/PR-2: a aba Mensagens passa a ler `broadcasts` em vez de `campaign_messages`.
--
-- `campaign_messages` guardava `media_name` (nome original do arquivo, só p/
-- exibição na agenda) e `broadcasts` não tem a coluna. Sem ela a migração da aba
-- apagaria o nome do arquivo da tela — regressão visível. Coluna opcional,
-- idempotente, sem default.
alter table if exists broadcasts
  add column if not exists media_name text;

comment on column broadcasts.media_name is
  'Nome original do arquivo enviado, apenas para exibição na agenda da campanha.';
