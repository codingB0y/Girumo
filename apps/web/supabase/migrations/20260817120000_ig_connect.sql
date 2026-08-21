-- ============================================================
-- IG Connect — automação nativa de Instagram (comentário→DM, DM→resposta).
--
-- Substitui o ManyChat: alguém comenta a palavra-chave num post do lojista e
-- recebe, na DM, o link rastreado do Girumo (`/r/<slug>`) que já roteia pro
-- grupo aberto do pool. O destino já existe — isto aqui é só o GATILHO.
--
-- Rota da Meta: "Instagram API with Instagram Login" (não a via Messenger
-- Platform). Escolhida porque NÃO exige Página do Facebook vinculada, o que
-- eliminaria metade do suporte de onboarding. Detalhe e trade-offs em
-- `docs/contexts/ig-connect-fase0.md`; escopo e contratos em
-- `docs/IG_CONNECT_PRD.md`.
--
-- ANTI-BAN / WhatsApp: nada aqui toca a engine. O único elo entre os dois
-- mundos é uma URL (texto) dentro de uma mensagem do Instagram. Não existe
-- coluna de telefone nem caminho de DM de WhatsApp nesta migração.
--
-- LGPD: guardamos IGSID (identificador escopado ao app, não reidentificável
-- fora dele), @username e a palavra que casou. NUNCA o texto integral do
-- comentário/DM, nunca mídia, nunca nada sobre terceiros. Retenção 90 dias.
-- ============================================================

-- ------------------------------------------------------------
-- 1) ig_accounts — a conta profissional do Instagram conectada
-- ------------------------------------------------------------
create table if not exists public.ig_accounts (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references organizations(id) on delete cascade,

  -- IG User ID da conta. O webhook da Meta NÃO manda tenant: ele manda
  -- `entry[].id`, que é este valor. É por aqui que o evento descobre de quem é.
  ig_user_id         text not null,
  username           text not null default '',

  -- Token cifrado em repouso (AES-256-GCM, chave em IG_TOKEN_ENC_KEY). Nunca em
  -- claro, nunca serializado pro cliente, nunca em log.
  access_token_enc   text not null,

  -- Token do Instagram Login vale 60 dias. Sem refresh a automação do lojista
  -- para em silêncio — mesma classe de falha do heartbeat da engine, que já
  -- aconteceu aqui. Por isso `status` é explícito e o painel mostra.
  token_expires_at   timestamptz not null,
  last_refresh_at    timestamptz,

  -- Espelho de GET /me/subscribed_apps. "Conectado" NÃO é "escutando": sem o
  -- POST /me/subscribed_apps por conta, a autorização conclui e nenhum webhook
  -- chega. É o bug nº1 de quem integra esta API, então virou coluna — o painel
  -- mostra os dois estados separados em vez de mentir "conectado".
  webhook_subscribed boolean not null default false,

  --   active       = funcionando
  --   expired      = token venceu ou refresh falhou (lojista precisa reconectar)
  --   revoked      = lojista removeu o app do lado do Instagram
  --   disconnected = lojista desconectou aqui, no painel
  status             text not null default 'active'
                       check (status in ('active', 'expired', 'revoked', 'disconnected')),
  last_error         text,

  connected_at       timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.ig_accounts is
  'Conta profissional do Instagram conectada por um tenant (rota Instagram Login).';
comment on column public.ig_accounts.ig_user_id is
  'IG User ID. Único GLOBALMENTE: é a chave de resolução de tenant no webhook.';
comment on column public.ig_accounts.webhook_subscribed is
  'Espelho de /me/subscribed_apps. Conectado != escutando.';
comment on column public.ig_accounts.access_token_enc is
  'Token long-lived cifrado (AES-256-GCM). Nunca em claro.';

-- Único GLOBALMENTE (sem tenant_id no índice) de propósito: se duas
-- organizações reivindicassem a mesma conta do Instagram, o webhook não teria
-- como decidir de quem é o evento. Colisão precisa falhar no INSERT, não virar
-- roteamento ambíguo em runtime.
create unique index if not exists ig_accounts_ig_user_uidx
  on public.ig_accounts (ig_user_id);

-- 1 conta por tenant no MVP. Quando abrirmos multi-conta, este índice cai.
create unique index if not exists ig_accounts_tenant_uidx
  on public.ig_accounts (tenant_id);

-- Alvo do cron de refresh: só o que está vivo e perto de vencer.
create index if not exists ig_accounts_refresh_idx
  on public.ig_accounts (token_expires_at)
  where status = 'active';

-- ------------------------------------------------------------
-- 2) ig_triggers — o gatilho (palavras + mensagem + link)
-- ------------------------------------------------------------
create table if not exists public.ig_triggers (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references organizations(id) on delete cascade,
  ig_account_id   uuid not null references ig_accounts(id) on delete cascade,

  name            text not null,

  -- Palavras que disparam. O casamento é normalizado (minúsculas, sem acento) e
  -- por palavra inteira — quem comenta escreve "eu quero!!! 😍", não "EU QUERO".
  -- A normalização vive no código (`lib/ig/match-keyword.ts`), não aqui: é
  -- função pura e testável, e o banco não deve saber de linguística.
  keywords        text[] not null default '{}',

  --   comment = só comentário em post/reel · dm = só DM · both = os dois
  source          text not null default 'both'
                    check (source in ('comment', 'dm', 'both')),

  -- Texto da DM. A Meta limita a 1000 BYTES em UTF-8, não 1000 caracteres —
  -- emoji custa 4. A validação em bytes é do código/painel; aqui fica o teto
  -- generoso em caracteres só pra barrar absurdo.
  message         text not null check (char_length(message) between 1 and 1000),

  -- Link rastreado que vai na mensagem. `set null` e não `cascade`: apagar um
  -- link não deve apagar o histórico de configuração do gatilho — o lojista
  -- precisa ver que o gatilho ficou sem destino, não que ele sumiu.
  tracked_link_id uuid references tracked_links(id) on delete set null,

  enabled         boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.ig_triggers is
  'Gatilho do IG Connect: palavras-chave -> mensagem + link rastreado.';
comment on column public.ig_triggers.keywords is
  'Palavras que disparam. Casamento normalizado no código, não no banco.';
comment on column public.ig_triggers.message is
  'Texto da DM. Limite real da Meta e 1000 BYTES UTF-8 — validar em bytes no app.';

-- Caminho quente: o webhook busca os gatilhos ativos daquela conta.
create index if not exists ig_triggers_account_idx
  on public.ig_triggers (tenant_id, ig_account_id)
  where enabled;

-- ------------------------------------------------------------
-- 3) ig_events — atendimentos (log + IDEMPOTÊNCIA)
-- ------------------------------------------------------------
create table if not exists public.ig_events (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references organizations(id) on delete cascade,
  ig_account_id   uuid not null references ig_accounts(id) on delete cascade,

  -- `set null`: apagar um gatilho não pode apagar o histórico de atendimento.
  trigger_id      uuid references ig_triggers(id) on delete set null,

  kind            text not null check (kind in ('comment', 'dm')),

  -- comment_id (Fluxo A) ou message mid (Fluxo B).
  --
  -- Esta coluna É o mecanismo de idempotência, e ela não é opcional: a Meta
  -- reenvia notificação com backoff quando acha que falhamos, e uma private
  -- reply só pode ser enviada UMA VEZ por comentário, pra sempre (a segunda
  -- devolve erro subcode 2534014). Sem o unique abaixo, um reenvio viraria DM
  -- duplicada ou erro repetido. "Tentar e ver o que a Meta responde" não
  -- resolve — o estado tem que ser nosso.
  source_id       text not null,

  -- IGSID: identificador escopado ao app. Não é o @ público e não reidentifica
  -- a pessoa fora do nosso app.
  ig_user_id      text not null,
  username        text,

  -- Só a palavra que casou. NUNCA a frase inteira do comentário/DM — o texto
  -- integral é necessário apenas no instante do match, em memória.
  matched_keyword text,

  --   queued  = evento gravado, resposta ainda não enviada
  --   sent    = DM entregue
  --   skipped = deliberadamente não respondido (ver skip_reason)
  --   failed  = a Meta recusou (ver error_code)
  status          text not null default 'queued'
                    check (status in ('queued', 'sent', 'skipped', 'failed')),

  --   no-match         = nenhuma palavra-chave casou
  --   self             = comentário/DM da própria conta conectada (senão o bot
  --                      responde a si mesmo em loop)
  --   reply-to-comment = resposta a outro comentário (parent_id presente); no
  --                      MVP só respondemos comentário de primeiro nível
  --   duplicate        = reenvio da Meta, já tratado
  --   disabled         = feature flag do tenant desligada
  skip_reason     text check (skip_reason in
                    ('no-match', 'self', 'reply-to-comment', 'duplicate', 'disabled')),

  -- Código da Meta, cru. O painel traduz pro lojista; aqui guardamos o original
  -- porque é o que dá pra procurar na doc quando a plataforma mudar.
  error_code      text,
  error_message   text,

  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);

comment on table public.ig_events is
  'Atendimentos do IG Connect. source_id unique = idempotência de private reply.';
comment on column public.ig_events.source_id is
  'comment_id ou message mid. UNIQUE: private reply é 1x por comentário, pra sempre.';
comment on column public.ig_events.matched_keyword is
  'Só a palavra que casou. O texto integral do comentário/DM não é persistido (LGPD).';

-- A trava de idempotência. Global e não por tenant: um comment_id/mid é único
-- no Instagram, e o INSERT precisa falhar ANTES de sabermos de qual tenant é.
create unique index if not exists ig_events_source_uidx
  on public.ig_events (source_id);

-- Tela "últimos atendimentos" do painel.
create index if not exists ig_events_tenant_idx
  on public.ig_events (tenant_id, created_at desc);

-- Varredura de evento preso: o envio roda em `after()` (depois do 200), então
-- se a invocação morrer no meio o evento fica 'queued' pra sempre. O cron
-- diário varre por aqui. Perda rara e VISÍVEL, não silenciosa.
create index if not exists ig_events_stuck_idx
  on public.ig_events (created_at)
  where status = 'queued';

-- ------------------------------------------------------------
-- 4) RLS — segunda linha de defesa
-- ------------------------------------------------------------
-- A proteção REAL é o `.eq('tenant_id')` nas stores: 68 dos ~72 caminhos usam
-- service-role, que bypassa RLS por design. Ligamos RLS assim mesmo (defesa em
-- profundidade, e pelos poucos caminhos anon/authenticated), no mesmo padrão de
-- `group_grow_jobs`. Isto NÃO substitui o filtro no código.
alter table public.ig_accounts enable row level security;
alter table public.ig_triggers enable row level security;
alter table public.ig_events   enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policy p
    join pg_class c on c.oid = p.polrelid
    where c.relname = 'ig_accounts' and p.polname = 'ig_accounts_tenant_isolation'
  ) then
    create policy "ig_accounts_tenant_isolation" on public.ig_accounts
      for all using (tenant_id = current_setting('app.tenant_id', true)::uuid);
  end if;

  if not exists (
    select 1 from pg_policy p
    join pg_class c on c.oid = p.polrelid
    where c.relname = 'ig_triggers' and p.polname = 'ig_triggers_tenant_isolation'
  ) then
    create policy "ig_triggers_tenant_isolation" on public.ig_triggers
      for all using (tenant_id = current_setting('app.tenant_id', true)::uuid);
  end if;

  if not exists (
    select 1 from pg_policy p
    join pg_class c on c.oid = p.polrelid
    where c.relname = 'ig_events' and p.polname = 'ig_events_tenant_isolation'
  ) then
    create policy "ig_events_tenant_isolation" on public.ig_events
      for all using (tenant_id = current_setting('app.tenant_id', true)::uuid);
  end if;
end $$;
