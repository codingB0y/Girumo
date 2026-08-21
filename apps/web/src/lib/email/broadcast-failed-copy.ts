/**
 * Decisões de texto do aviso de envio falho, separadas do template porque
 * `templates.ts` importa `server-only` e não pode ser carregado sob `tsx --test`.
 * Aqui mora o que tem regra (plural, corte da lista, primeiro nome); lá mora só
 * o HTML.
 *
 * Vocabulário: internamente a entidade é `broadcast` e a rota é /painel/disparos,
 * mas o texto que o lojista lê fala em MENSAGEM — "disparo" é termo aposentado da
 * comunicação pública (ver o teste "removes stale public email language").
 */

/** Nomes listados por extenso antes de virar "e mais N". */
const MAX_NOMES = 3;

export type BroadcastFailedCopy = {
  subject: string;
  headline: string;
  /** Nomes já cortados e formatados, ex.: "A, B, C e mais 2". */
  lista: string;
  firstName: string;
};

export function broadcastFailedCopy(name: string, nomes: string[]): BroadcastFailedCopy {
  const total = nomes.length;
  const plural = total > 1;
  const listados = nomes.slice(0, MAX_NOMES).join(", ");
  // Sem o corte, um tenant com 40 disparos falhos geraria um parágrafo ilegível.
  const resto = total > MAX_NOMES ? ` e mais ${total - MAX_NOMES}` : "";

  return {
    subject: plural
      ? `${total} mensagens não chegaram nos seus grupos`
      : "Sua mensagem não chegou nos grupos",
    headline: plural ? `${total} mensagens não saíram` : "Uma mensagem não saiu",
    lista: `${listados}${resto}`,
    firstName: name.split(" ")[0] || "lojista",
  };
}

/** Título da notificação no feed in-app — mesma regra de plural do e-mail. */
export function broadcastFailedTitle(total: number): string {
  return total > 1 ? `${total} mensagens não saíram` : "Uma mensagem não saiu";
}
