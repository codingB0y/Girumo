/**
 * Fatos de configuracao do Stripe que precisam ser testaveis.
 *
 * Fica fora de `stripe.ts` de proposito: aquele modulo importa `server-only`,
 * e nenhum modulo com `server-only` roda sob `tsx --test`.
 */

/**
 * Versao da API do Stripe usada em todas as chamadas.
 *
 * Sem este pin o SDK manda a versao que ele carrega no momento — e o
 * `package.json` fixa `stripe` com `^`, entao um `npm update` trocaria a versao
 * da API sem ninguem decidir. O tipo de `apiVersion` no SDK e um literal, entao
 * quando o SDK subir de versao o `tsc` quebra aqui e obriga a decisao a ser
 * tomada por alguem.
 *
 * Valor atual = o default do SDK 22.2.3, ou seja: pinar nao muda nada hoje.
 */
export const STRIPE_API_VERSION = "2026-05-27.dahlia";

export type StripeKeyMode = "test" | "live" | "unknown";

/**
 * Toda chave do Stripe segue `<prefixo>_<modo>_<aleatorio>`: `sk_live_`,
 * `rk_test_` (restricted, o formato que a propria Stripe recomenda), `pk_live_`.
 * O miolo aleatorio e base62, sem underscore, entao o modo so pode aparecer
 * neste segmento de prefixo.
 *
 * Chave sem segmento de modo (formato legado, `whsec_`, string vazia) devolve
 * `unknown` — melhor admitir que nao sabe do que chutar o ambiente errado.
 */
const KEY_MODE_PATTERN = /^[a-z]+_(test|live)_/;

export function detectStripeKeyMode(rawKey: string | null | undefined): StripeKeyMode {
  const match = KEY_MODE_PATTERN.exec((rawKey ?? "").trim());
  if (!match) return "unknown";
  return match[1] === "live" ? "live" : "test";
}
