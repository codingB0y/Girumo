-- Eventos de aquisicao organica (SEO): cliques de SAIDA da landing publica.
--
-- Por que nao `funnel_events`: aquela tabela e um registro de MARCOS POR TENANT
-- — `unique (tenant_id, event_name)` e FK para `organizations`. Quem clica no
-- WhatsApp da landing AINDA NAO TEM conta, entao nao ha tenant a que atribuir a
-- linha, e o unique colapsaria milhares de cliques numa linha so. O precedente
-- correto e `demo_requests` (pre-tenant, service-role only) e e o seguido aqui.
--
-- Por que a tabela existe: o clique em `wa.me` sai do nosso dominio. O servidor
-- NUNCA o ve — nao aparece em log de rota, nem em analytics de pagina. Sem este
-- beacon, o unico numero disponivel para decidir quais paginas cortar daqui a
-- 6 meses seria pageview, que e exatamente a metrica que o plano proibe.
create table if not exists public.acquisition_events (
  id           uuid primary key default gen_random_uuid(),
  -- Allowlist fechada no app (`OUTBOUND_EVENTS`). Texto livre aqui de proposito:
  -- o CHECK viveria no banco e o app ja recusa antes de inserir; duplicar a
  -- lista em dois lugares faz uma delas envelhecer calada.
  event_name   text not null,
  -- Caminho INTERNO de onde saiu o clique ("/", "/precos"). E o "slug de origem"
  -- que responde qual pagina converte — o eixo do relatorio inteiro.
  source_path  text not null,
  referrer     text,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  utm_content  text,
  utm_term     text,
  -- LGPD: nunca IP puro. Mesmo hash salgado usado nas LPs (`hashIp`).
  ip_hash      text,
  created_at   timestamptz not null default now()
);

alter table public.acquisition_events enable row level security;

-- NENHUMA policy, igual a `demo_requests`: escrita e leitura so por service-role.
-- Deny-all por DESENHO, nao por acidente — diferente das 13 policies inertes
-- descritas no CLAUDE.md, que dependem de GUC que o app nunca seta.

-- O relatorio agrupa por pagina dentro de uma janela de datas. Sem este indice
-- e seq scan desde a primeira consulta.
create index if not exists acquisition_events_event_created_idx
  on public.acquisition_events (event_name, created_at desc);

create index if not exists acquisition_events_source_path_idx
  on public.acquisition_events (source_path, created_at desc);
