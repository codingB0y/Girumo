-- Teste grátis de 7 dias com cartão (spec 2026-10-03).
--
-- As duas colunas moram em organizations pelo mesmo motivo do stripe_customer_id:
-- subscriptions tem unique(tenant_id) e é sobrescrita por todo evento do webhook,
-- então nada que precise sobreviver a uma assinatura pode morar lá.
--
--   trial_subscription_id  — a assinatura do Stripe que consumiu o teste desta conta.
--                            Nulo = nunca testou. É o id (e não um booleano) para o
--                            webhook saber qual de dois checkouts simultâneos venceu.
--   trial_card_fingerprint — o cartão do teste. O índice único é a trava
--                            "um teste por cartão" entre contas diferentes.
alter table public.organizations
  add column if not exists trial_subscription_id text,
  add column if not exists trial_card_fingerprint text;

create unique index if not exists organizations_trial_card_fingerprint_key
  on public.organizations (trial_card_fingerprint)
  where trial_card_fingerprint is not null;

-- Só o servidor escreve nas colunas do teste.
--
-- Um usuário logado pode editar organizations pelo PostgREST com o próprio JWT, se
-- alguma policy de UPDATE ou DELETE deixar. Voltando trial_subscription_id ou
-- trial_card_fingerprint para nulo ele ganharia teste infinito, furaria a trava "um
-- teste por cartão" e quebraria a defesa do webhook contra reentrega
-- (trial_duplicate), que parte do princípio de que nada limpa trial_subscription_id.
-- Apagar a linha dá no mesmo: solta a trava do cartão, e outra conta testa de novo
-- com ele. As policies de organizations em prod nunca foram conferidas para esse caso
-- (a leitura de prod ficou bloqueada em 03/10), então a guarda vale independente do
-- que elas digam. O app não perde nada com isso: toda escrita em organizations vai
-- por getSupabaseAdmin.
--
-- SECURITY INVOKER DE PROPÓSITO — não "corrigir" para definer. A guarda decide pelo
-- current_user, e numa função definer o current_user é o dono dela (postgres): a
-- checagem nunca dispararia. A regra do repo "definer sempre com set search_path"
-- é para função definer; esta é invoker, mas fixa search_path = '' e qualifica tudo
-- do mesmo jeito.
--
-- Barrados: authenticated e anon. Passam: service_role (o servidor do app, webhook
-- incluso), postgres (migração) e supabase_admin (painel).
-- Furo conhecido e aceito: uma função security definer de dono postgres que escreva
-- em organizations roda como postgres e passa pela guarda. Nenhuma conhecida hoje.
-- Sem grant/revoke: o trigger dispara sem EXECUTE de quem escreve, e o Postgres
-- recusa chamada direta a função `returns trigger`.
--
-- Cada ramo devolve a linha certa: no DELETE é OLD (NEW é nulo, e devolver nulo num
-- BEFORE trigger cancela o delete em silêncio); no INSERT e no UPDATE é NEW.
create or replace function public.guard_trial_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  is_blocked_role constant boolean := current_user in ('authenticated', 'anon');
  refusal constant text := 'trial_subscription_id e trial_card_fingerprint sao so do servidor';
begin
  if tg_op = 'DELETE' then
    if is_blocked_role
       and (old.trial_subscription_id is not null
            or old.trial_card_fingerprint is not null) then
      raise exception using errcode = '42501', message = refusal;
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if is_blocked_role
       and (new.trial_subscription_id is not null
            or new.trial_card_fingerprint is not null) then
      raise exception using errcode = '42501', message = refusal;
    end if;
    return new;
  end if;

  -- UPDATE: o trigger só é criado para insert, update e delete.
  if is_blocked_role
     and (new.trial_subscription_id is distinct from old.trial_subscription_id
          or new.trial_card_fingerprint is distinct from old.trial_card_fingerprint) then
    raise exception using errcode = '42501', message = refusal;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_trial_columns on public.organizations;

create trigger guard_trial_columns
  before insert or update or delete on public.organizations
  for each row
  execute function public.guard_trial_columns();

-- Conferência depois de aplicar (espera 1 linha em cada banco):
-- select tgname from pg_trigger
--  where tgrelid = 'public.organizations'::regclass and tgname = 'guard_trial_columns';
