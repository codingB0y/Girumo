-- Ramo (segmento) do tenant — produto horizontal, marketing vertical (30/08/2026).
-- Texto livre validado na fronteira da API (apps/web/src/lib/segments.ts):
-- nicho novo entra sem migração. Sem default: null = pack de conteúdo neutro.
alter table public.tenant_settings
  add column if not exists segment text;

-- Backfill: todo tenant existente veio do funil de atacado de moda — sem isto,
-- a base atual perderia as copies de moda da biblioteca (regressão). Conta nova
-- nasce sem segmento (neutro) e escolhe no cadastro ou em Configurações.
-- `coalesce` preserva escolha já feita se a migração rodar duas vezes.
insert into public.tenant_settings (tenant_id, segment, created_at, updated_at)
select o.id, 'moda_atacado', now(), now()
from public.organizations o
on conflict (tenant_id) do update
  set segment = coalesce(public.tenant_settings.segment, excluded.segment),
      updated_at = now();
