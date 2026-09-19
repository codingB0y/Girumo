-- Vinculo do grupo com a comunidade nativa do WhatsApp.
-- A Evolution ja devolve esses dados no fetchAllGroups; ate agora eram
-- descartados. Ver docs/superpowers/specs/2026-09-17-comunidade-nativa-leitura-design.md
alter table public.groups
  add column if not exists community_jid  text,
  add column if not exists community_role text;

comment on column public.groups.community_jid is
  'JID da comunidade nativa a que este grupo pertence. Para o proprio grupo-pai, o seu id. NULL = fora de comunidade.';

comment on column public.groups.community_role is
  'parent | announce | member | NULL. Papel do grupo dentro da comunidade nativa.';

-- A consulta quente e "grupos desta comunidade" e "qual o Avisos dela".
create index if not exists groups_community_jid_idx
  on public.groups (tenant_id, community_jid)
  where community_jid is not null;
