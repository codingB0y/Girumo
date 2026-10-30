-- Recuperar, PR 1a: o banco comum ao Recuperar e ao Rastreio (spec
-- docs/superpowers/specs/2026-10-29-recuperar-yampi-design.md §2; nomes no "Contrato comum" de
-- docs/superpowers/plans/2026-10-29-recuperar-yampi-00-indice.md; plano
-- docs/superpowers/plans/2026-10-29-recuperar-yampi-01a-banco-comum.md).
--
-- Cria a conexão da loja com a Yampi (credenciais seladas) e a caixa de avisos; a base do número do
-- atendimento (instances.purpose = 'privado', um por loja): conversas, mensagens, ritmo, sinais e a
-- lista "não falar no privado"; os campos do DM em engine_commands; as flags recuperar_enabled e
-- rastreio_enabled (só o servidor liga); os módulos recuperar e rastreio da vendedora; a limpeza.
-- Nenhum comportamento muda: seletor, claim, rota e worker ainda não leem nada disto (PRs 2, 3, 4, 6).
--
-- RLS nas sete tabelas. As cinco do número do atendimento: policy de leitura para os membros da loja
-- (app.user_tenant_ids, que exclui a vendedora) e authenticated só com SELECT — segunda linha de defesa,
-- porque o app lê pela rota (Conversas é polling; o Realtime é decorativo). As duas da Yampi: sem policy e
-- sem privilégio fora do service_role (credencial selada; payload cru do aviso com dado pessoal). Escrita
-- só do servidor (service_role, sempre com .eq('tenant_id')). Não "destravar" com using (true).
--
-- Idempotente (if not exists, or replace, drop ... if exists, constraint criada uma vez por nome): o
-- job pode morrer entre aplicar e registrar, e o próximo run reaplica o arquivo. O gate de drift não
-- vê RLS, policy, ACL, CHECK, índice, trigger nem corpo de função: conferir com
-- infra/tests/base-comum-yampi-privado-check.sql nos dois bancos.
--
-- Reversão (emergência): migração NOVA, pelo CI, com
--   drop function if exists public.limpar_dados_vencidos_comuns(), app.limpar_dados_vencidos_comuns();
--   drop trigger if exists tenant_settings_guard_recuperar_rastreio_flags on public.tenant_settings;
--   drop function if exists public.tenant_settings_guard_recuperar_rastreio_flags();
--   alter table public.engine_commands drop column if exists private_message_id,
--     drop column if exists dm_module, drop column if exists valid_until;
--   drop table if exists public.private_optouts, public.private_signals, public.private_number_state,
--     public.private_messages, public.private_conversations, public.yampi_events, public.yampi_connections;
--   alter table public.instances drop column if exists purpose;
--   alter table public.tenant_settings drop column if exists recuperar_enabled,
--     drop column if exists rastreio_enabled;
--   e memberships_modules_validos de volta a array['postar'] (só sem membership com os módulos novos).

-- Mexe em engine_commands, instances, tenant_settings e memberships, que o worker e cada request
-- leem. Sem o lock em 5 s, aborta em vez de segurar a fila: é só rodar o job de novo.
set lock_timeout = '5s';

-- 1) Conexão da loja com a Yampi: uma por loja, a mesma para o Recuperar e o Rastreio. O id vai na URL
--    do aviso (?c=<id>), nunca o tenant_id. Desconectar apaga as credenciais e mantém a linha: o id, e
--    a URL cadastrada na Yampi, não mudam ao reconectar.
create table if not exists public.yampi_connections (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null unique references public.organizations(id) on delete cascade,
  alias           text not null,
  user_token      text,             -- selado (lib/security/secret-box.ts)
  user_secret_key text,             -- selado
  webhook_id      text,             -- id do aviso na Yampi
  webhook_secret  text,             -- selado: secret_key do aviso, confere o X-Yampi-Hmac-SHA256
  events          text[] not null default '{}',
  status          text not null default 'ativa'
                    check (status in ('ativa', 'credencial_invalida', 'aviso_desativado', 'desconectada')),
  last_event_at   timestamptz,
  last_check_at   timestamptz,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Formato do selar(): v<n>.<iv>.<tag>.<cifra> em base64url. Token em texto aberto não grava.
  constraint yampi_connections_segredos_selados check (
        (user_token is null or user_token ~ '^v[0-9]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$')
    and (user_secret_key is null or user_secret_key ~ '^v[0-9]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$')
    and (webhook_secret is null or webhook_secret ~ '^v[0-9]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$')),
  -- Só a desconectada fica sem credencial: nada chama a Yampi com token nulo.
  constraint yampi_connections_ativa_tem_credencial check (
    status = 'desconectada' or (user_token is not null and user_secret_key is not null))
);

comment on table public.yampi_connections is
  'Conexão da loja com a Yampi (Recuperar e Rastreio). user_token, user_secret_key e webhook_secret selados (AES-256-GCM, INTEGRATIONS_ENCRYPTION_KEY). Só service_role.';

-- 2) Caixa de entrada dos avisos. payload tem dado pessoal: 30 dias (limpeza, seção 9). A dedupe_key é
--    de quem grava (PR 6: <id da conexão>:<sha256 do corpo>, já única entre lojas) e é única sozinha,
--    para o upsert do PostgREST (on_conflict=dedupe_key): o mesmo aviso duas vezes é uma linha só.
create table if not exists public.yampi_events (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null references public.yampi_connections(id) on delete cascade,
  event         text not null,
  resource_id   text,
  dedupe_key    text not null,
  payload       jsonb not null,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  error         text,
  constraint yampi_events_dedupe_unique unique (dedupe_key)
);

comment on table public.yampi_events is
  'Avisos (webhooks) da Yampi, um por dedupe_key. processed_at nulo = pendente. payload com dado pessoal: 30 dias. Só service_role.';

-- O evento parado que o cron /api/cron/yampi reprocessa (PR 6).
create index if not exists yampi_events_pendentes_idx
  on public.yampi_events (received_at) where processed_at is null;

-- 3) Conversa = (número do atendimento, telefone), comum aos dois módulos: a cliente vê uma conversa só.
--    phone_key gerada com public.phone_key (DDD + 8 últimos): com e sem o 55 e o nono dígito é a mesma
--    conversa. Sem telefone ("número não identificado") ela existe pelo lid.
create table if not exists public.private_conversations (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.organizations(id) on delete cascade,
  instance_id       uuid not null references public.instances(id) on delete cascade,
  phone             text check (phone ~ '^[1-9][0-9]{9,12}$'),
  phone_key         text generated always as (public.phone_key(phone)) stored,
  jid               text,
  lid               text,
  contact_name      text,
  status            text not null default 'aberta'
                      check (status in ('precisa_de_voce', 'aberta', 'encerrada')),
  unread            integer not null default 0 check (unread >= 0),
  last_message_at   timestamptz,
  last_preview      text check (char_length(last_preview) <= 200),
  first_outbound_at timestamptz,
  last_inbound_at   timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint private_conversations_tem_contato check (phone is not null or lid is not null),
  -- Constraint inteira, não índice parcial: o upsert do PostgREST (onConflict) só casa com ela. NULL
  -- não colide, então "única quando preenchida" sai de graça.
  constraint private_conversations_telefone_unique unique (instance_id, phone_key),
  constraint private_conversations_lid_unique unique (instance_id, lid)
);

comment on table public.private_conversations is
  'Conversa do número do atendimento com um telefone (Recuperar e Rastreio). Some 180 dias depois da última atividade, com as mensagens. Escreve só o service_role; membros leem a própria loja.';

-- Contador "precisa de você" da barra, lido a cada página (PR 7/8).
create index if not exists private_conversations_tenant_status_idx
  on public.private_conversations (tenant_id, status);

-- 4) Mensagem do número do atendimento, comum aos dois módulos (o PR 1b acrescenta case_id, step_key,
--    script_id e variant). dedupe_key única por loja (contrato): repetir o passo esbarra nela e devolve
--    as mesmas linhas; a chave é da linha, então cada parte do passo (part_index) grava a sua.
--    module, priority, status e phone são obrigatórios no que a Girumo manda (automatico, pessoa); a
--    mensagem da cliente e a do celular do chip podem vir sem eles.
create table if not exists public.private_messages (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.organizations(id) on delete cascade,
  conversation_id     uuid not null references public.private_conversations(id) on delete cascade,
  module              text check (module in ('recuperar', 'rastreio', 'teste')),
  direction           text not null check (direction in ('saida', 'entrada')),
  author              text not null check (author in ('automatico', 'pessoa', 'cliente', 'celular')),
  author_user_id      uuid references auth.users(id) on delete set null,
  kind                text not null default 'texto' check (kind in ('texto', 'imagem', 'audio', 'outro')),
  text                text check (char_length(text) <= 4096),
  media_ref           text,           -- saída: "<bucket>/<caminho>"; entrada: id da mídia na Evolution
  command_id          uuid,           -- engine_commands.id do envio; o vínculo com FK é engine_commands.private_message_id
  provider_message_id text,           -- key.id da Evolution
  status              text check (status in ('na_fila', 'enviada', 'entregue', 'lida', 'falhou', 'cancelada')),
  error               text,
  priority            text check (priority in ('resposta', 'pix', 'pedido', 'carrinho')),
  dedupe_key          text,
  part_index          smallint not null default 0 check (part_index between 0 and 2),
  phone               text check (phone ~ '^[1-9][0-9]{9,12}$'),   -- destino, só dígitos (10 a 13, sem zero à esquerda: phone_key tiraria o zero)
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint private_messages_direcao_do_autor check ((direction = 'entrada') = (author = 'cliente')),
  constraint private_messages_envio_completo check (
    author not in ('automatico', 'pessoa')
    or (module is not null and priority is not null and status is not null and phone is not null)),
  constraint private_messages_dedupe_unique unique (tenant_id, dedupe_key),
  constraint private_messages_provider_unique unique (tenant_id, provider_message_id)
);

comment on table public.private_messages is
  'Mensagem do número do atendimento (Recuperar e Rastreio). Uma linha por dedupe_key (cada parte de passo com a sua) e por key.id da Evolution, por loja. Escreve só o service_role; membros leem a própria loja.';

-- Histórico da conversa (polling do PR 8), a limpeza e o lado filho do FK da conversa.
create index if not exists private_messages_conversation_idx
  on public.private_messages (conversation_id, created_at);

-- 5) Ritmo do número do atendimento, dividido entre os dois módulos. Horário em hora cheia de Brasília:
--    envia de horario_inicio até antes de horario_fim (9h–21h; ajustável entre 8h e 22h).
create table if not exists public.private_number_state (
  instance_id     uuid primary key references public.instances(id) on delete cascade,
  tenant_id       uuid not null references public.organizations(id) on delete cascade,
  horario_inicio  smallint not null default 9 check (horario_inicio between 8 and 22),
  horario_fim     smallint not null default 21 check (horario_fim between 8 and 22),
  ramp_started_at timestamptz,
  healthy_since   timestamptz,
  paused_until    timestamptz,
  pause_reason    text check (pause_reason in ('sinais', 'restricao', 'entrega')),
  next_send_at    timestamptz,
  updated_at      timestamptz not null default now(),
  constraint private_number_state_horario check (horario_inicio < horario_fim)
);

comment on table public.private_number_state is
  'Horário, rampa e pausa do número do atendimento (spec 1.5 e 1.6), um por instância privado. Escreve só o service_role; membros leem a própria loja.';

-- 6) Sinal de proteção (spec 1.6): SAIR ou recusa; 3 em 24 h pausam o número (PR 4). message_ref aponta a
--    mensagem que gerou o sinal (texto, sem FK: a loja só com o Rastreio não guarda a mensagem da
--    cliente, e o sinal pode viver mais que ela).
create table if not exists public.private_signals (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.organizations(id) on delete cascade,
  instance_id uuid not null references public.instances(id) on delete cascade,
  kind        text not null check (kind in ('sair', 'recusa')),
  at          timestamptz not null default now(),
  message_ref text
);

comment on table public.private_signals is
  'Sinais de proteção do número do atendimento (SAIR, recusa). Escreve só o service_role; membros leem a própria loja.';

create index if not exists private_signals_instance_at_idx on public.private_signals (instance_id, at);

-- 7) "Não falar no privado": quem respondeu SAIR, de qualquer módulo. Sem prazo. A optouts geral continua
--    bloqueando o DM (PR 3), mas não ganha linha do SAIR. message_ref como em private_signals.
create table if not exists public.private_optouts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.organizations(id) on delete cascade,
  phone       text not null check (phone ~ '^[1-9][0-9]{9,12}$'),
  phone_key   text generated always as (public.phone_key(phone)) stored,
  module      text check (module in ('recuperar', 'rastreio', 'teste')),
  at          timestamptz not null default now(),
  message_ref text,
  constraint private_optouts_telefone_unique unique (tenant_id, phone_key)
);

comment on table public.private_optouts is
  'Telefones que pediram SAIR no número do atendimento (Recuperar e Rastreio), por phone_key. Não vence. Escreve só o service_role; membros leem a própria loja.';

-- 8) RLS, policies, privilégios e updated_at (ver o topo). authenticated só lê as cinco do número do
--    atendimento, da loja em que é membro aceito e não vendedora (a forma do PR 1b); as duas da Yampi são
--    só do service_role.
alter table public.yampi_connections enable row level security;
alter table public.yampi_events enable row level security;
alter table public.private_conversations enable row level security;
alter table public.private_messages enable row level security;
alter table public.private_number_state enable row level security;
alter table public.private_signals enable row level security;
alter table public.private_optouts enable row level security;

drop policy if exists private_conversations_select_member on public.private_conversations;
create policy private_conversations_select_member on public.private_conversations
  for select to authenticated using (tenant_id = any (app.user_tenant_ids()));
drop policy if exists private_messages_select_member on public.private_messages;
create policy private_messages_select_member on public.private_messages
  for select to authenticated using (tenant_id = any (app.user_tenant_ids()));
drop policy if exists private_number_state_select_member on public.private_number_state;
create policy private_number_state_select_member on public.private_number_state
  for select to authenticated using (tenant_id = any (app.user_tenant_ids()));
drop policy if exists private_signals_select_member on public.private_signals;
create policy private_signals_select_member on public.private_signals
  for select to authenticated using (tenant_id = any (app.user_tenant_ids()));
drop policy if exists private_optouts_select_member on public.private_optouts;
create policy private_optouts_select_member on public.private_optouts
  for select to authenticated using (tenant_id = any (app.user_tenant_ids()));

revoke all on public.yampi_connections, public.yampi_events, public.private_conversations,
  public.private_messages, public.private_number_state, public.private_signals, public.private_optouts
  from anon, authenticated;
grant select on public.private_conversations, public.private_messages, public.private_number_state,
  public.private_signals, public.private_optouts
  to authenticated;
grant select, insert, update, delete on public.yampi_connections, public.yampi_events,
  public.private_conversations, public.private_messages, public.private_number_state,
  public.private_signals, public.private_optouts
  to service_role;

drop trigger if exists set_updated_at_yampi_connections on public.yampi_connections;
create trigger set_updated_at_yampi_connections before update on public.yampi_connections
  for each row execute function app.set_updated_at();
drop trigger if exists set_updated_at_private_conversations on public.private_conversations;
create trigger set_updated_at_private_conversations before update on public.private_conversations
  for each row execute function app.set_updated_at();
drop trigger if exists set_updated_at_private_messages on public.private_messages;
create trigger set_updated_at_private_messages before update on public.private_messages
  for each row execute function app.set_updated_at();
drop trigger if exists set_updated_at_private_number_state on public.private_number_state;
create trigger set_updated_at_private_number_state before update on public.private_number_state
  for each row execute function app.set_updated_at();

-- 9) Retenção da spec §2 (a dos casos é do PR 1b). O cron /api/cron/yampi (PR 6) chama
--    public.limpar_dados_vencidos_comuns() uma vez por dia. Devolve avisos + conversas apagados; as
--    mensagens vão em cascata e o comando fica com private_message_id nulo. A conversa some quando a
--    última atividade passou de 180 dias E não há mensagem dos últimos 180 dias: o segundo teste
--    segura a conversa se last_message_at ficou para trás.
create or replace function app.limpar_dados_vencidos_comuns()
returns integer
language plpgsql
volatile
security definer
set search_path = public, app
as $$
declare
  v_avisos integer;
  v_conversas integer;
begin
  delete from public.yampi_events e
   where e.received_at < now() - interval '30 days';
  get diagnostics v_avisos = row_count;

  delete from public.private_conversations c
   where greatest(c.created_at, c.last_message_at, c.last_inbound_at) < now() - interval '180 days'
     and not exists (
       select 1 from public.private_messages m
        where m.conversation_id = c.id
          and m.created_at >= now() - interval '180 days');
  get diagnostics v_conversas = row_count;

  return v_avisos + v_conversas;
end;
$$;

-- O PostgREST só expõe public: o cron chama rpc('limpar_dados_vencidos_comuns'). Molde de
-- public.prune_instance_sends (20260729120000).
create or replace function public.limpar_dados_vencidos_comuns()
returns integer
language sql
volatile
security definer
set search_path = public, app
as $$ select app.limpar_dados_vencidos_comuns() $$;

comment on function public.limpar_dados_vencidos_comuns() is
  'Retenção da base comum: yampi_events com mais de 30 dias; conversa do número do atendimento parada há 180 dias (mensagens em cascata). Devolve avisos + conversas apagados.';

-- create or replace não preserva o ACL em todo banco (ver 20260904100000): explícito sempre.
revoke all on function app.limpar_dados_vencidos_comuns() from public, anon, authenticated;
grant execute on function app.limpar_dados_vencidos_comuns() to service_role;
revoke all on function public.limpar_dados_vencidos_comuns() from public, anon, authenticated;
grant execute on function public.limpar_dados_vencidos_comuns() to service_role;

-- Daqui para baixo: tabelas que o worker e cada request leem. No fim do arquivo para o lock durar o
-- mínimo até o commit.

-- 10) Comando de DM (tipos dm_text e dm_image). Não há CHECK em engine_commands.type nem no destino
--     (conferido em 29/10): nada a afrouxar. O worker de hoje só pega send_*; quem cria e consome DM é o
--     PR 3. Sem CHECK em dm_module: o valor é cópia de private_messages.module, que tem.
alter table public.engine_commands
  add column if not exists private_message_id uuid,
  add column if not exists dm_module text,
  add column if not exists valid_until timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.engine_commands'::regclass
                    and conname = 'engine_commands_private_message_id_fkey') then
    alter table public.engine_commands
      add constraint engine_commands_private_message_id_fkey
      foreign key (private_message_id) references public.private_messages(id) on delete set null;
  end if;
end;
$$;

comment on column public.engine_commands.private_message_id is
  'Comando de DM: a linha de private_messages que ele envia (o status volta para ela). Nulo depois que a limpeza apaga a mensagem.';
comment on column public.engine_commands.dm_module is
  'Comando de DM: recuperar, rastreio ou teste. O claim (PR 3) só libera com a flag do módulo ligada.';
comment on column public.engine_commands.valid_until is
  'Comando de DM: passou disto, é cancelado (PR 3). No DM substitui a tolerância de 15 min (app.missed_send_tolerance).';

-- Lado filho do FK: sem ele, cada mensagem apagada pela limpeza varreria a fila inteira.
create index if not exists engine_commands_private_message_idx
  on public.engine_commands (private_message_id) where private_message_id is not null;
-- Fila de DM por número (claim do PR 3): número, prioridade, horário disponível.
create index if not exists engine_commands_dm_fila_idx
  on public.engine_commands (instance_id, priority, available_at)
  where status = 'queued' and type in ('dm_text', 'dm_image');

-- 11) Liberação por loja, como instagram_enabled. Nascem aqui porque conectar o número do atendimento
--     (PR 2b) lê as duas; quem liga recuperar_enabled é o Stripe (PR 5a), rastreio_enabled é o admin.
alter table public.tenant_settings
  add column if not exists recuperar_enabled boolean not null default false,
  add column if not exists rastreio_enabled boolean not null default false;

comment on column public.tenant_settings.recuperar_enabled is
  'Add-on Recuperar liberado (webhook do Stripe ou admin). Só o servidor muda (tenant_settings_guard_recuperar_rastreio_flags).';
comment on column public.tenant_settings.rastreio_enabled is
  'Rastreio do pedido liberado (admin na v1). Só o servidor muda (tenant_settings_guard_recuperar_rastreio_flags).';

-- Trava com a forma da de instagram_enabled (20261003120000), que já roda em prod. authenticated já não
-- escreve em tenant_settings (20261004120000), mas um grant por coluna no futuro destravaria um add-on
-- pago pelo PATCH do PostgREST.
create or replace function public.tenant_settings_guard_recuperar_rastreio_flags()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.recuperar_enabled is true or new.rastreio_enabled is true then
        raise exception 'recuperar_enabled e rastreio_enabled so podem ser alterados pelo servidor'
          using errcode = '42501';
      end if;
    elsif new.recuperar_enabled is distinct from old.recuperar_enabled
       or new.rastreio_enabled is distinct from old.rastreio_enabled then
      raise exception 'recuperar_enabled e rastreio_enabled so podem ser alterados pelo servidor'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.tenant_settings_guard_recuperar_rastreio_flags() from public, anon, authenticated;

drop trigger if exists tenant_settings_guard_recuperar_rastreio_flags on public.tenant_settings;
create trigger tenant_settings_guard_recuperar_rastreio_flags
  before insert or update on public.tenant_settings
  for each row execute function public.tenant_settings_guard_recuperar_rastreio_flags();

-- 12) O número do atendimento é uma instância com purpose = 'privado', no máximo uma por loja. Nenhum
--     seletor filtra por isto ainda: o PR 2a faz enqueue_broadcast e companhia escolherem só 'grupos'
--     ANTES de qualquer número privado poder ser conectado.
alter table public.instances
  add column if not exists purpose text not null default 'grupos';

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.instances'::regclass
                    and conname = 'instances_purpose_check') then
    alter table public.instances
      add constraint instances_purpose_check check (purpose in ('grupos', 'privado'));
  end if;
end;
$$;

create unique index if not exists instances_one_privado_per_tenant
  on public.instances (tenant_id) where purpose = 'privado';

comment on column public.instances.purpose is
  'grupos (padrão): posta nos grupos. privado: número do atendimento do Recuperar e do Rastreio, no máximo um por loja.';

-- 13) Módulos da vendedora: recuperar e rastreio além de postar (spec §5). Por último: memberships é lida
--     em todo request.
alter table public.memberships drop constraint if exists memberships_modules_validos;
alter table public.memberships add constraint memberships_modules_validos
  check (modules <@ array['postar', 'recuperar', 'rastreio']::text[] and (role = 'seller' or modules = '{}'));

-- O PostgREST passa a enxergar as tabelas e a RPC sem esperar o recarregamento automático.
notify pgrst, 'reload schema';
