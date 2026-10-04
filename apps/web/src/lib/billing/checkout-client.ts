import { authenticatedFetch } from "@/lib/supabase/client";

/** Quanto o clique espera o servidor antes de largar o pedido e liberar o botão. */
const PRAZO_DO_CHECKOUT_MS = 20_000;

export const DEMOROU_DEMAIS = "Demorou demais para abrir o checkout. Tente de novo.";

/**
 * Roda `fazer` com um prazo: estourado, aborta o pedido e lança `DEMOROU_DEMAIS`.
 *
 * Sem isto um fetch pendurado deixava o diálogo em "Abrindo…" para sempre, com
 * fechar mudo (de propósito, enquanto abre) — o cliente só saía recarregando.
 * A corrida, e não só o `signal`, cobre também a espera antes do fetch (a leitura
 * da sessão), que o `AbortController` não alcança.
 */
export async function comPrazo<T>(fazer: (sinal: AbortSignal) => Promise<T>, prazoMs: number): Promise<T> {
  const controle = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const estouro = new Promise<never>((_, rejeitar) => {
    timer = setTimeout(() => {
      // Rejeita antes de abortar: o AbortError do fetch não pode ganhar a corrida.
      rejeitar(new Error(DEMOROU_DEMAIS));
      controle.abort();
    }, prazoMs);
  });
  try {
    return await Promise.race([fazer(controle.signal), estouro]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Abre o Checkout do Stripe. O servidor decide se entra o teste grátis; o único
 * pedido que a tela pode fazer é `semTeste` — o caminho do boleto.
 *
 * Lança com a mensagem do servidor: engolir aqui deixava o botão girar, parar, e
 * a tela idêntica a antes do clique (ver plan-paywall.tsx). Inclui o 409 de quem
 * já está em teste — trocar de plano no teste vai pelo portal.
 */
export async function abrirCheckout(planCode: string, opcoes: { semTeste?: boolean } = {}): Promise<void> {
  const url = await comPrazo(async (signal) => {
    const res = await authenticatedFetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planCode, semTeste: opcoes.semTeste === true }),
      signal,
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !data.url) throw new Error(data.error || "Checkout indisponível.");
    return data.url;
  }, PRAZO_DO_CHECKOUT_MS);
  window.location.href = url;
}
