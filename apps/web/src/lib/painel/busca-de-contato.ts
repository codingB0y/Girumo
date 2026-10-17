/**
 * O que a busca da tela de Contatos procura. Mesma regra no banco (loja inteira,
 * `lib/stores/leads.ts`) e no navegador (lista do anúncio, que já vem inteira).
 *
 * Com letra no meio é busca por nome: "loja 2" não pode casar todo número com 2.
 * Sem letra são os dígitos do telefone: o número aparece formatado na ficha
 * (+55 11 98765-4321), e quem copia dali tem que achar. Só pontuação vale como nome.
 */
export type BuscaDeContato = { nome: string } | { digitos: string };

/** Tamanho máximo do termo: o campo da tela corta aqui, e a rota recusa o que passar. */
export const BUSCA_MAXIMA = 100;

export function lerBuscaDeContato(q: string): BuscaDeContato | null {
  const termo = q.trim().toLowerCase();
  if (!termo) return null;
  if (/\p{L}/u.test(termo)) return { nome: termo };
  const digitos = termo.replace(/\D/g, "");
  return digitos ? { digitos } : { nome: termo };
}

/** A mesma regra sobre um contato que já está na memória (lista do anúncio, arquivo JSON). */
export function casaComBusca(
  contato: { name?: string | null; phone?: string | null },
  busca: BuscaDeContato | null,
): boolean {
  if (busca === null) return true;
  return "nome" in busca
    ? Boolean(contato.name?.toLowerCase().includes(busca.nome))
    : Boolean(contato.phone?.includes(busca.digitos));
}
