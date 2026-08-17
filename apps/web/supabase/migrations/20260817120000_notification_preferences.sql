-- Preferências de notificação por tipo de evento.
--
-- Antes desta migration só o relatório semanal tinha opt-out
-- (weekly_report_enabled). O alerta de desconexão disparava para todo tenant
-- desconectado há mais de 2h, todo dia, sem o lojista poder desligar.
--
-- Default true: quem nunca mexeu continua recebendo exatamente como antes.
-- Quem desliga é respeitado no cron com leitura fail-closed — erro ao ler a
-- preferência não envia, porque falhar aberto mandaria e-mail para quem desligou.

alter table public.tenant_settings
  add column if not exists disconnect_alert_enabled boolean not null default true;

alter table public.tenant_settings
  add column if not exists broadcast_alert_enabled boolean not null default true;

comment on column public.tenant_settings.disconnect_alert_enabled is
  'Recebe e-mail quando o WhatsApp fica desconectado por mais de 2h.';
comment on column public.tenant_settings.broadcast_alert_enabled is
  'Recebe aviso quando um disparo falha.';
