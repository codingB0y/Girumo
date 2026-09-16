-- apps/web/supabase/migrations/20260917000000_group_participants.sql
--
-- Fase 3 de Gestao de Comunidade: participantes por grupo, pra alcance real
-- (deduplicado por pessoa) e sugestao de cobertura. Alimentada pelo sync que
-- ja busca fetchAllGroups com participantes no caminho feliz -- zero chamada
-- nova a Evolution (ver apps/web/src/app/api/groups/sync/route.ts).
--
-- Chave de identidade e participant_lid: producao esta 100% em @lid, phone e
-- enriquecimento oportunista (~82%) e nullable -- nunca inventar numero.

create table if not exists public.group_participants (
  tenant_id          uuid        not null,
  whatsapp_group_id  text        not null,
  participant_lid    text        not null,
  phone              text,
  is_admin           boolean     not null default false,
  first_seen_at      timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  primary key (tenant_id, whatsapp_group_id, participant_lid)
);

comment on table public.group_participants is
  'Participantes por grupo, atualizados pelo sync de grupos. Fonte de alcance real e sugestao de cobertura das comunidades (Fase 3).';

alter table public.group_participants enable row level security;

drop policy if exists "group_participants_tenant" on public.group_participants;
create policy "group_participants_tenant" on public.group_participants
  for all using (app.has_membership(tenant_id)) with check (app.has_membership(tenant_id));
