import { createHash } from "node:crypto";

/**
 * Decide qual Customer do Stripe o checkout deve usar.
 *
 * O bug que isto corrige: o checkout procurava o `stripe_customer_id` em
 * `subscriptions`, tabela que so o webhook escreve. Checkout abandonado nao
 * grava nada, entao a tentativa seguinte criava outro Customer — e o portal
 * passava a apontar para so um deles, deixando os outros invisiveis no app e
 * visiveis no dashboard do Stripe.
 *
 * O dado passou a morar no tenant (`organizations.stripe_customer_id`) porque
 * `subscriptions` tem `unique (tenant_id)` e `status` sem valor neutro: uma
 * linha de rascunho ali teria que nascer `free`/`trialing`/`active` e entregaria
 * os limites do plano pago antes de o dinheiro entrar.
 */
export type CheckoutCustomerDeps = {
  tenantId: string;
  email: string | null;
  /** Ponteiro oficial do app: `organizations.stripe_customer_id`. */
  readTenantCustomerId: () => Promise<string | null>;
  /** Fallback para tenant que ja pagou antes desta mudanca. */
  readSubscriptionCustomerId: () => Promise<string | null>;
  createCustomer: (input: { idempotencyKey: string }) => Promise<string>;
  /**
   * Grava o ponteiro so enquanto ele estiver vazio e devolve o id que ficou
   * gravado — que pode ser o de outra requisicao que chegou antes.
   */
  claimCustomerId: (customerId: string) => Promise<string>;
};

const KEY_PREFIX = "checkout-customer";
const NO_EMAIL = "sem-email";

/**
 * Chave de idempotencia da criacao do Customer.
 *
 * O e-mail entra na chave porque entra no corpo da chamada: mesma chave com
 * corpo diferente e erro 409 no Stripe. Vai como impressao digital para a chave
 * ficar dentro dos 255 caracteres que o Stripe aceita, com qualquer e-mail.
 */
export function stripeCustomerIdempotencyKey(tenantId: string, email: string | null): string {
  const normalized = email?.trim().toLowerCase();
  const fingerprint = normalized
    ? createHash("sha256").update(normalized).digest("hex").slice(0, 32)
    : NO_EMAIL;

  return `${KEY_PREFIX}:${tenantId}:${fingerprint}`;
}

export async function resolveCheckoutCustomerId(deps: CheckoutCustomerDeps): Promise<string> {
  const fromTenant = await deps.readTenantCustomerId();
  if (fromTenant) return fromTenant;

  const fromSubscription = await deps.readSubscriptionCustomerId();
  if (fromSubscription) return deps.claimCustomerId(fromSubscription);

  const created = await deps.createCustomer({
    idempotencyKey: stripeCustomerIdempotencyKey(deps.tenantId, deps.email),
  });

  return deps.claimCustomerId(created);
}
