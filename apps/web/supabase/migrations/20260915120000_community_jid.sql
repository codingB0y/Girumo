alter table public.campaign_groups
  add column if not exists whatsapp_community_jid text;

comment on column public.campaign_groups.whatsapp_community_jid is
  'JID da comunidade nativa do WhatsApp que esta colecao espelha. NULL = gaveta apenas da Girumo.';
