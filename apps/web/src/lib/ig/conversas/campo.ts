/** Regra pura do campo de resposta (spec §7.8): a barra `/` das respostas prontas. Sem React, sem rede. */

export type RespostaPronta = { id: string; titulo: string; texto: string };

const normalizar = (s: string): string => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** `/` no começo abre a lista e o resto filtra; `null` = fechada. Quebra de linha fecha: já é uma mensagem. */
export function consultaDaBarra(texto: string): string | null {
  if (!texto.startsWith("/") || texto.includes("\n")) return null;
  return texto.slice(1);
}

/** Filtra pelo título (sem caixa nem acento); o corpo da resposta não entra na busca. */
export function filtrarRespostas(lista: readonly RespostaPronta[], consulta: string): RespostaPronta[] {
  const q = normalizar(consulta.trim());
  return q ? lista.filter((r) => normalizar(r.titulo).includes(q)) : [...lista];
}

/** Item ativo depois de uma seta. Dão a volta; lista vazia = -1. */
export function moverAtivo(atual: number, tecla: "ArrowDown" | "ArrowUp", total: number): number {
  if (total <= 0) return -1;
  const base = atual >= 0 && atual < total ? atual : -1;
  if (tecla === "ArrowUp") return base <= 0 ? total - 1 : base - 1;
  return base + 1 >= total ? 0 : base + 1;
}

export type CampanhaDoConvite = { id: string; nome: string };

/**
 * As campanhas que o convite oferece, da resposta de `GET /api/campanhas`. O painel não tem um "ativa" para a
 * campanha: vale o que o editor de fluxos também usa, ter link (`slug`). Entrada torta é descartada.
 */
export function campanhasParaConvite(lista: unknown): CampanhaDoConvite[] {
  if (!Array.isArray(lista)) return [];
  return lista.flatMap((c: unknown) => {
    const o = (c ?? {}) as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.slug !== "string" || !o.slug) return [];
    return [{ id: o.id, nome: typeof o.name === "string" && o.name ? o.name : o.slug }];
  });
}

export type TipoDeEnvio = "texto" | "midia" | "convite";

/**
 * O conteúdo de um envio, em texto estável. Entra na `Idempotency-Key` do servidor (o mesmo UUID do navegador com outro
 * conteúdo é outra chave) e indexa as chaves guardadas na tela.
 */
export function assinaturaDeEnvio(tipo: TipoDeEnvio, c: { texto?: string; midiaId?: string; campanhaId?: string }): string {
  return JSON.stringify([tipo, c.texto ?? "", c.midiaId ?? "", c.campanhaId ?? ""]);
}

/** A chave guardada para essa assinatura, ou uma nova (`gerar`) já guardada. O mapa devolvido é novo. */
export function chaveParaAssinatura(mapa: ReadonlyMap<string, string>, assinatura: string, gerar: () => string): { chave: string; mapa: Map<string, string> } {
  const existente = mapa.get(assinatura);
  if (existente) return { chave: existente, mapa: new Map(mapa) };
  const chave = gerar();
  return { chave, mapa: new Map(mapa).set(assinatura, chave) };
}

export function semAssinatura(mapa: ReadonlyMap<string, string>, assinatura: string): Map<string, string> {
  const novo = new Map(mapa);
  novo.delete(assinatura);
  return novo;
}

/**
 * Põe a resposta pronta no campo sem perder o rascunho. Aberta pela `/`, o texto inteiro é o `/pedido` digitado e é
 * trocado. Pelo botão, entra na posição do cursor (`ini`..`fim`) com um espaço de separação quando cola em texto.
 */
export function aplicarResposta(texto: string, resposta: string, abertaPelaBarra: boolean, ini: number, fim: number, limite: number): string {
  if (abertaPelaBarra) return resposta.slice(0, limite);
  const a = Math.max(0, Math.min(ini, texto.length));
  const b = Math.max(a, Math.min(fim, texto.length));
  const antes = texto.slice(0, a);
  const depois = texto.slice(b);
  const sepAntes = antes && !/\s$/.test(antes) ? " " : "";
  const sepDepois = depois && !/^\s/.test(depois) ? " " : "";
  return `${antes}${sepAntes}${resposta}${sepDepois}${depois}`.slice(0, limite);
}
