import { authenticatedFetch } from "@/lib/supabase/client";

/**
 * Abre o Checkout do Stripe. O servidor decide se entra o teste grátis; o único
 * pedido que a tela pode fazer é `semTeste` — o caminho do boleto.
 *
 * Lança com a mensagem do servidor: engolir aqui deixava o botão girar, parar, e
 * a tela idêntica a antes do clique (ver plan-paywall.tsx). Inclui o 409 de quem
 * já está em teste — trocar de plano no teste vai pelo portal.
 */
export async function abrirCheckout(planCode: string, opcoes: { semTeste?: boolean } = {}): Promise<void> {
  const res = await authenticatedFetch("/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planCode, semTeste: opcoes.semTeste === true }),
  });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error || "Checkout indisponível.");
  window.location.href = data.url;
}
