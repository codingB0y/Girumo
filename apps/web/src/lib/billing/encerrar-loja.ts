import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

/**
 * Para de cobrar e de postar em nome de uma loja: cancela no Stripe toda
 * assinatura viva do customer dela (plano e add-on do Instagram), apaga os
 * agendamentos pendentes (inclusive os que repetem todo dia) e cancela os
 * envios ainda na fila.
 *
 * Existe porque "deletar conta" e o suspender/excluir do admin mexiam só no
 * banco: o login sumia e o cartão seguia cobrado todo mês, sem ninguém para
 * abrir o portal e cancelar.
 *
 * O Stripe vem primeiro e, se falhar, nada mais muda: quem chama desiste (não
 * apaga o login, não suspende) e a loja fica inteira, como estava. Repetir é
 * seguro — assinatura já cancelada é pulada, agendamento apagado não volta.
 *
 * Não desconecta o número na Evolution nem apaga os dados da loja.
 *
 * `stripe` é uma fábrica (`getStripe`) para a loja que nunca assinou não exigir
 * `STRIPE_SECRET_KEY` — em dev sem a chave, `getStripe()` lança.
 */

/** Status que já não cobram nem vão cobrar; todo o resto ainda pode virar fatura. */
const STATUS_FINAIS: ReadonlySet<Stripe.Subscription.Status> = new Set(["canceled", "incomplete_expired"]);

export type EncerramentoDaLoja =
  | { error: string }
  | { error: null; assinaturas: number; agendamentos: number; envios: number };

export async function encerrarLoja(i: {
  supabase: SupabaseClient;
  stripe: () => Stripe;
  tenantId: string;
}): Promise<EncerramentoDaLoja> {
  const { supabase, tenantId } = i;

  // O customer mora no tenant e é único por loja (`organizations_stripe_customer_id_key`):
  // toda assinatura dele é desta loja.
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("stripe_customer_id")
    .eq("id", tenantId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (orgError) return { error: `Falha ao ler a loja: ${orgError.message}` };

  let assinaturas = 0;
  const customerId = (org?.stripe_customer_id as string | null | undefined) ?? null;
  if (customerId) {
    try {
      const stripe = i.stripe();
      const vivas: string[] = [];
      for await (const s of stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 })) {
        if (!STATUS_FINAIS.has(s.status)) vivas.push(s.id);
      }
      // O webhook (`customer.subscription.deleted`) grava o `canceled` no espelho local.
      for (const id of vivas) await stripe.subscriptions.cancel(id);
      assinaturas = vivas.length;
    } catch (err) {
      return { error: `Falha ao cancelar a assinatura no Stripe: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  const { data: agendamentos, error: agendamentosError } = await supabase
    .from("schedules")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("status", "pending")
    .select("id");
  if (agendamentosError) return { error: `Falha ao cancelar agendamentos: ${agendamentosError.message}` };

  // Só `queued`: o que está `processing` já saiu para o WhatsApp (mesma regra de `cancelBroadcast`).
  const { data: envios, error: enviosError } = await supabase
    .from("engine_commands")
    .update({ status: "canceled" })
    .eq("tenant_id", tenantId)
    .eq("status", "queued")
    .select("id");
  if (enviosError) return { error: `Falha ao cancelar envios na fila: ${enviosError.message}` };

  return { error: null, assinaturas, agendamentos: agendamentos?.length ?? 0, envios: envios?.length ?? 0 };
}

/** O que o encerramento fez, para a resposta do admin. */
export function resumoDoEncerramento(e: { assinaturas: number; agendamentos: number; envios: number }): string {
  return `Canceladas: ${e.assinaturas} assinatura(s) no Stripe, ${e.agendamentos} agendamento(s) e ${e.envios} envio(s) na fila.`;
}
