-- ============================================================
-- Webhook do Stripe: idempotencia real e guarda de ordem.
-- Auditoria 22/08/2026, achados C.1 (CRITICAL) e C.2 (HIGH).
--
-- (1) UNIQUE no marcador de idempotencia
--
-- O handler fazia `select` e depois `insert` em logs para decidir se o evento
-- ja tinha chegado. Sem constraint, duas entregas concorrentes do mesmo evento
-- veem `existing = null` e processam as DUAS. O indice deixa o banco resolver a
-- corrida: a segunda insercao levanta 23505 em vez de duplicar efeito.
--
-- Parcial de proposito: so as linhas do marcador participam, entao o indice
-- fica pequeno e nao atrapalha o resto de `logs`.
--
-- Resolve tambem C.8: o dedupe filtrava por `event` + `metadata` (jsonb) e
-- `logs` nao tinha indice em nenhum dos dois — era seq scan na tabela de log do
-- app inteiro, que cresce sem limite.
--
-- (2) Guarda de ordem de evento
--
-- O Stripe nao garante ordem de entrega, e os tres tipos de evento caiam no
-- MESMO upsert com `onConflict: tenant_id`: quem escreve por ultimo ganha, e
-- "por ultimo a escrever" nao e "por ultimo a acontecer". Um
-- `customer.subscription.updated` antigo chegando depois de um `deleted`
-- reativava assinatura cancelada.
--
-- A guarda e um trigger, nao codigo do handler, para valer para QUALQUER
-- escritor da tabela — inclusive backfill manual e futuros callers.
--
-- Idempotente nas tres partes.
-- ============================================================

create unique index if not exists logs_stripe_event_id_uniq
  on public.logs (event, (metadata->>'stripe_event_id'))
  where event = 'stripe.webhook.received';

alter table public.subscriptions
  add column if not exists stripe_event_created_at timestamptz;

create or replace function public.subscriptions_reject_stale_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Escrita mais velha que a ja aplicada: devolve OLD, entao o UPDATE vira
  -- no-op em vez de reescrever status com dado atrasado.
  if old.stripe_event_created_at is not null
     and new.stripe_event_created_at is not null
     and new.stripe_event_created_at < old.stripe_event_created_at then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists subscriptions_reject_stale_event on public.subscriptions;

create trigger subscriptions_reject_stale_event
  before update on public.subscriptions
  for each row
  execute function public.subscriptions_reject_stale_event();
