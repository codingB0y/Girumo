-- C.5 da auditoria de 22/08/2026 — o checkout criava um Customer novo no Stripe
-- a cada tentativa abandonada.
--
-- O ponteiro para o Customer morava so em `subscriptions`, tabela que apenas o
-- webhook escreve: quem abria o checkout e desistia nao deixava rastro, e a
-- tentativa seguinte criava outro Customer com o mesmo metadata.tenant_id. O
-- portal passava a apontar para um so deles.
--
-- Por que a coluna vai em `organizations` e nao em `subscriptions`:
-- `subscriptions` tem `unique (tenant_id)` e `status not null` num enum sem
-- valor neutro (free/trialing/active/past_due/canceled/unpaid). Uma linha de
-- rascunho ali teria que nascer com um status que `getTenantLimits` aceita, o
-- que entregaria os limites do plano PAGO antes de o dinheiro entrar — e um
-- upsert por tenant_id sobrescreveria a assinatura de quem ja paga.

alter table public.organizations
  add column if not exists stripe_customer_id text;

comment on column public.organizations.stripe_customer_id is
  'Customer do Stripe do tenant. Ponteiro oficial do app: o checkout le e grava aqui, e o webhook mantem a copia em subscriptions. Preenchido na primeira ida ao checkout, antes de existir assinatura.';

-- Parcial porque a esmagadora maioria dos tenants nunca foi ao checkout: sem o
-- `where`, todos os nulos disputariam a mesma entrada do indice unico.
create unique index if not exists organizations_stripe_customer_id_key
  on public.organizations (stripe_customer_id)
  where stripe_customer_id is not null;

-- Backfill do que o webhook ja gravou, para quem ja pagou antes desta mudanca.
update public.organizations as o
set stripe_customer_id = s.stripe_customer_id
from public.subscriptions as s
where s.tenant_id = o.id
  and s.stripe_customer_id is not null
  and o.stripe_customer_id is null;
