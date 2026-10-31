-- 2026-10-30 — Recuperar (Yampi), PR 1b: banco do Recuperar (spec 2026-10-29-recuperar-yampi-design §2;
-- plano docs/superpowers/plans/2026-10-29-recuperar-yampi-01b-banco-recuperar.md).
--
-- Quatro tabelas por loja (ajustes, casos, scripts, depoimentos), as colunas do Recuperar na private_messages
-- (PR 1a), a limpeza dos casos vencidos e o bucket privado dos depoimentos. Escrita só do servidor
-- (service_role); authenticated só lê, por app.user_tenant_ids() (exclui a vendedora). Sem seeds: os scripts
-- padrão nascem na ativação (PR 7). Depende da migração do PR 1a: sem ela o arquivo para no topo.
--
-- Idempotente. Muda a baseline (4 t| novas, t|private_messages, f|limpar_dados_vencidos_recuperar()). O gate
-- de drift não vê RLS, policy, ACL, trigger, CHECK, bucket nem função de app: conferir com
-- infra/tests/recuperar-banco-check.sql nos dois bancos.
-- Reversão (PR abandonado depois do migrate-dev): drop das quatro tabelas, das quatro colunas novas da
-- private_messages e das duas funções, e delete do bucket.

set lock_timeout = '5s';

do $$
begin
  if to_regclass('public.private_conversations') is null or to_regclass('public.private_messages') is null then
    raise exception 'recuperar_banco: aplique antes a migração do PR 1a (private_conversations, private_messages)';
  end if;
end;
$$;

-- 1) Ajustes da loja: uma linha por loja, criada na ativação (PR 7). O horário não está aqui: é do
--    private_number_state, comum com o Rastreio.
create table if not exists public.recovery_settings (
  tenant_id                  uuid primary key references public.organizations(id) on delete cascade,
  automatico                 boolean not null default false,
  pix_ligado                 boolean not null default true,
  carrinho_ligado            boolean not null default false,
  pix_espera_p1_min          smallint not null default 3,
  pix_lembrete_antes_min     smallint not null default 10,        -- 0 = não lembrar
  carrinho_espera_c1         text not null default 'dia_seguinte_10h',
  carrinho_c2_dias           smallint not null default 1,         -- 0 = não mandar
  carrinho_c3_ligado         boolean not null default false,
  responder_com_link         boolean not null default true,
  cupom                      text,
  controle                   boolean not null default true,
  assinatura                 text,
  nome_loja                  text,
  pedido_minimo_cents        integer,
  prazo_troca                text,
  numeros_ignorados          text[] not null default '{}',
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint recovery_settings_pix_p1_check check (pix_espera_p1_min in (3, 5, 10)),
  constraint recovery_settings_pix_lembrete_check check (pix_lembrete_antes_min in (0, 10, 30)),
  constraint recovery_settings_carrinho_c1_check check (carrinho_espera_c1 in ('3h', 'dia_seguinte_10h', 'dois_dias_10h')),
  constraint recovery_settings_carrinho_c2_check check (carrinho_c2_dias in (0, 1, 2)),
  constraint recovery_settings_textos_check check (
        (cupom is null or char_length(btrim(cupom)) between 1 and 40)
    and (assinatura is null or char_length(btrim(assinatura)) between 1 and 40)
    and (nome_loja is null or char_length(btrim(nome_loja)) between 1 and 60)
    and (prazo_troca is null or char_length(btrim(prazo_troca)) between 1 and 60)
  ),
  constraint recovery_settings_pedido_minimo_check check (pedido_minimo_cents is null or pedido_minimo_cents > 0),
  -- Só dígitos (DDI e DDD incluídos, 10 a 13 como o telefone do 1a): formatação ("(85) 9…"), elemento vazio
  -- e elemento com vírgula são recusados (o segundo cardinality pega o que a regex sobre a lista junta não vê).
  constraint recovery_settings_numeros_check check (
        cardinality(numeros_ignorados) <= 50
    and array_position(numeros_ignorados, null) is null
    and (cardinality(numeros_ignorados) = 0
         or (array_to_string(numeros_ignorados, ',') ~ '^[1-9][0-9]{9,12}(,[1-9][0-9]{9,12})*$'
             and cardinality(string_to_array(array_to_string(numeros_ignorados, ','), ',')) = cardinality(numeros_ignorados)))
  )
);

comment on table public.recovery_settings is
  'Ajustes do Recuperar por loja (uma linha, criada na ativação). 0 em pix_lembrete_antes_min / carrinho_c2_dias = não mandar. Escrita só pelo servidor.';

-- 2) Casos: um por (loja, tipo, id na Yampi).
create table if not exists public.recovery_cases (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.organizations(id) on delete cascade,
  kind             text not null,
  yampi_id         text not null,
  cart_token       text,
  order_number     text,
  customer_name    text,
  phone            text not null,
  phone_key        text generated always as (public.phone_key(phone)) stored,
  jid              text,
  total_cents      integer not null,
  items            jsonb not null default '[]'::jsonb,
  link             text,
  pix_code         text,
  pix_expires_at   timestamptz,
  status           text not null default 'agendado',
  stop_reason      text,
  control          boolean not null default false,
  step             text,
  next_step_at     timestamptz,
  first_sent_at    timestamptz,
  conversation_id  uuid references public.private_conversations(id) on delete set null,
  recovered_at     timestamptz,
  recovered_cents  integer,
  recovered_manual boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint recovery_cases_tenant_kind_yampi_key unique (tenant_id, kind, yampi_id),
  constraint recovery_cases_kind_check check (kind in ('pix', 'carrinho')),
  constraint recovery_cases_status_check check (status in (
    'agendado', 'em_sequencia', 'respondeu', 'recuperado', 'virou_pedido',
    'parado', 'perdido', 'sem_whatsapp', 'nao_quer', 'controle')),
  constraint recovery_cases_tamanhos_check check (
        char_length(yampi_id) between 1 and 64
    and (cart_token is null or char_length(cart_token) between 1 and 128)
    and (order_number is null or char_length(order_number) between 1 and 40)
    and (customer_name is null or char_length(customer_name) <= 120)
    and (pix_code is null or char_length(pix_code) <= 2048)
  ),
  -- 10 a 13 dígitos, como private_conversations/private_messages do 1a (um caso mais largo não abriria
  -- conversa). Sem zero à esquerda: public.phone_key o descartaria e o caso ficaria sem chave.
  constraint recovery_cases_phone_check check (phone ~ '^[1-9][0-9]{9,12}$'),
  -- Só o JID resolvido (<dígitos>@s.whatsapp.net): nunca @lid nem @g.us.
  constraint recovery_cases_jid_check check (jid is null or jid ~ '^[1-9][0-9]{9,12}@s\.whatsapp\.net$'),
  constraint recovery_cases_total_check check (total_cents > 0),
  constraint recovery_cases_items_check check (
    case when jsonb_typeof(items) = 'array' then jsonb_array_length(items) <= 30 else false end
  ),
  -- Nunca o simulate_url (entra logado na conta da cliente, leva customerToken).
  constraint recovery_cases_link_check check (
    link is null or (char_length(link) <= 2048 and link ~ '^https://' and link !~* 'customer_?token')
  ),
  constraint recovery_cases_step_check check (step is null or step ~ '^[a-z0-9_]{1,30}$'),
  constraint recovery_cases_stop_reason_check check (stop_reason is null or stop_reason ~ '^[a-z0-9_]{1,40}$'),
  constraint recovery_cases_recovered_cents_check check (recovered_cents is null or recovered_cents > 0),
  constraint recovery_cases_recuperado_check check (status <> 'recuperado' or (recovered_at is not null and recovered_cents is not null)),
  constraint recovery_cases_agendado_check check (status <> 'agendado' or next_step_at is not null),
  constraint recovery_cases_controle_check check (status <> 'controle' or control)
);

-- agendador (todas as lojas): o que venceu e ainda espera passo.
create index if not exists recovery_cases_agendador_idx
  on public.recovery_cases (next_step_at) where status in ('agendado', 'em_sequencia');
-- "recebeu sequência nos últimos 7 dias" e carrinho novo do mesmo telefone (§1.1), pela chave tolerante.
create index if not exists recovery_cases_telefone_idx
  on public.recovery_cases (tenant_id, phone_key, created_at desc);
-- "o carrinho virou pedido?" (order.created com o cart_token).
create index if not exists recovery_cases_cart_token_idx
  on public.recovery_cases (tenant_id, cart_token) where cart_token is not null;
-- Hoje: a fila e os números do mês.
create index if not exists recovery_cases_lista_idx
  on public.recovery_cases (tenant_id, created_at desc);
-- A conversa do lado do caso, e a ação da FK quando a conversa é apagada.
create index if not exists recovery_cases_conversa_idx
  on public.recovery_cases (conversation_id) where conversation_id is not null;

comment on table public.recovery_cases is
  'Caso do Recuperar: Pix pendente ou carrinho abandonado da Yampi, um por (loja, tipo, id na Yampi). Fechado = fora de agendado/em_sequencia (retenção em app.limpar_dados_vencidos_recuperar).';
comment on column public.recovery_cases.pix_code is 'Código Pix copia-e-cola. Nunca em log.';
comment on column public.recovery_cases.phone is 'Só dígitos (55 + DDD + número). Nunca em log.';

-- 3) Scripts. key = '<pix|carrinho|chat>.<passo>'; variants = 1 a 3 textos (o A/B). Os contadores por versão
--    saem de private_messages.script_id + variant.
create table if not exists public.recovery_scripts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.organizations(id) on delete cascade,
  key           text not null,
  kind          text not null,
  use           text not null,
  title         text not null,
  variants      text[] not null,
  fixed_variant smallint,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint recovery_scripts_tenant_key_key unique (tenant_id, key),
  constraint recovery_scripts_key_check check (key ~ '^[a-z0-9_]+\.[a-z0-9_]+$' and char_length(key) <= 60),
  constraint recovery_scripts_kind_check check (kind in ('pix', 'carrinho', 'geral')),
  constraint recovery_scripts_use_check check (use in ('automatico', 'chat')),
  constraint recovery_scripts_title_check check (char_length(btrim(title)) between 1 and 80),
  constraint recovery_scripts_variants_check check (cardinality(variants) between 1 and 3 and array_position(variants, null) is null),
  constraint recovery_scripts_fixed_check check (fixed_variant is null or fixed_variant between 1 and cardinality(variants)),
  constraint recovery_scripts_chat_check check (use = 'automatico' or cardinality(variants) = 1),
  constraint recovery_scripts_automatico_check check (use = 'chat' or kind <> 'geral')
);

comment on table public.recovery_scripts is
  'Scripts do Recuperar (automático e chat) por loja. variants = 1 a 3 textos; chat tem 1. kind geral só em script de chat.';

-- 4) Depoimentos. A foto vive no bucket privado recuperar-depoimentos, em <tenant_id>/<arquivo>.
create table if not exists public.recovery_testimonials (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.organizations(id) on delete cascade,
  storage_path  text not null,
  caption       text not null default '',
  label         text,
  authorized_by uuid not null,                       -- sem FK: a prova de autorização sobrevive ao usuário
  authorized_at timestamptz not null default now(),
  active        boolean not null default true,
  sends         integer not null default 0,
  conversions   integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint recovery_testimonials_storage_path_key unique (storage_path),
  constraint recovery_testimonials_path_check check (
        char_length(storage_path) <= 200
    and starts_with(storage_path, tenant_id::text || '/')
    and storage_path !~ '\.\.'
    and storage_path ~* '\.(jpg|jpeg|png|webp)$'
  ),
  constraint recovery_testimonials_caption_check check (char_length(caption) <= 300),
  constraint recovery_testimonials_label_check check (label is null or char_length(btrim(label)) between 1 and 80),
  constraint recovery_testimonials_contadores_check check (sends >= 0 and conversions >= 0)
);

-- A C2 sorteia entre os ativos da loja; o índice também cobre a FK de tenant_id.
create index if not exists recovery_testimonials_ativos_idx on public.recovery_testimonials (tenant_id, active);

comment on table public.recovery_testimonials is
  'Depoimentos da C2: foto no bucket privado recuperar-depoimentos + legenda. Só existe com a autorização da cliente. O limite de 10 ativos é da rota.';

-- 5) Colunas do Recuperar na private_messages (PR 1a). FKs on delete set null: apagar caso ou script não
--    derruba o histórico; sem CHECK ligando script_id a variant (a ação da FK deixaria variant sozinho).
--    As FKs entram nomeadas e checadas por nome no bloco abaixo (idempotente mesmo se a coluna já existir).
alter table public.private_messages
  add column if not exists case_id uuid,
  add column if not exists step_key text,
  add column if not exists script_id uuid,
  add column if not exists variant smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.private_messages'::regclass and conname = 'private_messages_case_id_fkey') then
    alter table public.private_messages add constraint private_messages_case_id_fkey
      foreign key (case_id) references public.recovery_cases(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.private_messages'::regclass and conname = 'private_messages_script_id_fkey') then
    alter table public.private_messages add constraint private_messages_script_id_fkey
      foreign key (script_id) references public.recovery_scripts(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.private_messages'::regclass and conname = 'private_messages_step_key_check') then
    alter table public.private_messages
      add constraint private_messages_step_key_check check (step_key is null or step_key ~ '^[a-z0-9_]{1,30}$');
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.private_messages'::regclass and conname = 'private_messages_variant_check') then
    alter table public.private_messages
      add constraint private_messages_variant_check check (variant is null or variant between 1 and 3);
  end if;
end;
$$;

-- FK com set null precisa de índice, ou cada caso apagado varre a tabela de mensagens.
create index if not exists private_messages_case_idx on public.private_messages (case_id) where case_id is not null;
create index if not exists private_messages_script_idx on public.private_messages (script_id) where script_id is not null;

-- 6) updated_at (app.set_updated_at, o mesmo das outras tabelas): é o relógio da retenção dos casos.
drop trigger if exists set_updated_at_recovery_settings on public.recovery_settings;
create trigger set_updated_at_recovery_settings before update on public.recovery_settings
  for each row execute function app.set_updated_at();
-- O relógio da retenção não pode zerar sozinho: apagar a conversa dispara a FK conversation_id ... set null,
-- que é um update no caso; sem o WHEN, um caso fechado há 181 dias ganharia updated_at = agora e escaparia
-- da limpeza (e do limite de 180 dias da spec). O WHEN só pula o update "conversation_id some".
drop trigger if exists set_updated_at_recovery_cases on public.recovery_cases;
create trigger set_updated_at_recovery_cases before update on public.recovery_cases
  for each row
  when (old.conversation_id is null or new.conversation_id is not null)
  execute function app.set_updated_at();
drop trigger if exists set_updated_at_recovery_scripts on public.recovery_scripts;
create trigger set_updated_at_recovery_scripts before update on public.recovery_scripts
  for each row execute function app.set_updated_at();
drop trigger if exists set_updated_at_recovery_testimonials on public.recovery_testimonials;
create trigger set_updated_at_recovery_testimonials before update on public.recovery_testimonials
  for each row execute function app.set_updated_at();

-- 7) RLS e privilégios. authenticated só lê, dos tenants em que é membro aceito e não vendedora
--    (app.user_tenant_ids). Escrita só do servidor. Não "destravar" com using (true).
alter table public.recovery_settings enable row level security;
alter table public.recovery_cases enable row level security;
alter table public.recovery_scripts enable row level security;
alter table public.recovery_testimonials enable row level security;

drop policy if exists recovery_settings_select_member on public.recovery_settings;
create policy recovery_settings_select_member on public.recovery_settings
  for select to authenticated using (tenant_id = any (app.user_tenant_ids()));
drop policy if exists recovery_cases_select_member on public.recovery_cases;
create policy recovery_cases_select_member on public.recovery_cases
  for select to authenticated using (tenant_id = any (app.user_tenant_ids()));
drop policy if exists recovery_scripts_select_member on public.recovery_scripts;
create policy recovery_scripts_select_member on public.recovery_scripts
  for select to authenticated using (tenant_id = any (app.user_tenant_ids()));
drop policy if exists recovery_testimonials_select_member on public.recovery_testimonials;
create policy recovery_testimonials_select_member on public.recovery_testimonials
  for select to authenticated using (tenant_id = any (app.user_tenant_ids()));

revoke all on public.recovery_settings, public.recovery_cases, public.recovery_scripts, public.recovery_testimonials
  from anon, authenticated;
grant select on public.recovery_settings, public.recovery_cases, public.recovery_scripts, public.recovery_testimonials
  to authenticated;
grant select, insert, update, delete
  on public.recovery_settings, public.recovery_cases, public.recovery_scripts, public.recovery_testimonials
  to service_role;

-- 8) Limpeza dos casos vencidos (spec §2, "casos 180 dias depois de fechados"). Fechado = tudo fora de
--    agendado/em_sequencia (esperam o próximo passo automático); inclui `respondeu`, que não tem saída
--    própria. O relógio é updated_at: caso fechado não muda mais. As mensagens ficam (case_id vira null) e
--    saem pela retenção da conversa (PR 1a). Chamada diária pelo /api/cron/recuperar (PR 7).
create or replace function app.limpar_dados_vencidos_recuperar()
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_n integer;
begin
  delete from public.recovery_cases c
   where c.status not in ('agendado', 'em_sequencia')
     and c.updated_at < now() - interval '180 days';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- O PostgREST só enxerga public: o cron chama este wrapper (mesmo desenho de prune_instance_sends).
create or replace function public.limpar_dados_vencidos_recuperar()
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  select app.limpar_dados_vencidos_recuperar();
$$;

comment on function app.limpar_dados_vencidos_recuperar() is
  'Apaga casos do Recuperar fora de agendado/em_sequencia sem mudar há 180 dias. Devolve quantos.';
comment on function public.limpar_dados_vencidos_recuperar() is
  'Wrapper para o PostgREST de app.limpar_dados_vencidos_recuperar(). Só service_role.';

-- Função nova nasce executável por PUBLIC e (em public) por authenticated: revogar depois do último
-- create or replace e conceder só ao service_role.
revoke all on function app.limpar_dados_vencidos_recuperar() from public, anon, authenticated;
grant execute on function app.limpar_dados_vencidos_recuperar() to service_role;
revoke all on function public.limpar_dados_vencidos_recuperar() from public, anon, authenticated;
grant execute on function public.limpar_dados_vencidos_recuperar() to service_role;

-- 9) Bucket privado dos depoimentos. SEM policy em storage.objects: só o service-role (URL assinada) alcança.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recuperar-depoimentos', 'recuperar-depoimentos', false, 524288, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- O PostgREST passa a enxergar as tabelas e o wrapper sem esperar o recarregamento automático.
notify pgrst, 'reload schema';
