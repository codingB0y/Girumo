// apps/web/src/lib/bio/editor-divulgar.ts
import { SLUG_BIO, slugReservado } from "@/lib/bio/documento";
import type { LinkBio } from "@/lib/bio/documento";
import type { MotivoDoSlug, RespostaDoSlug } from "@/lib/bio/painel-api";
import type { RelatorioBio } from "@/lib/stores/bio-pages";

/** Regras puras da aba Divulgar (spec 2026-10-19 §2, §7, §8). Roda no navegador e nos testes. */

// ------------------------------------------------------------------ endereço (§2)

/** O que a lojista digita vira slug: minúsculo, sem acento, espaço e _ viram hífen, até 40. O hífen do fim fica: ainda está digitando. */
export function slugDoCampo(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "")
    .slice(0, 40);
}

/** Formato e reservado sem ir ao servidor (a regra do `motivoDoSlug` do PR 5, que é server-only). "Em uso" só a API sabe. */
export function motivoLocalDoSlug(slug: string): Exclude<MotivoDoSlug, "em-uso"> | null {
  if (!SLUG_BIO.test(slug)) return "formato";
  return slugReservado(slug) ? "reservado" : null;
}

/** A última resposta do `GET /api/link-da-bio/slug` para um endereço; `resposta: null` = não deu pra conferir. */
export type ConsultaDoSlug = { slug: string; resposta: RespostaDoSlug | null };

export type AvisoDoSlug = { texto: string; tom: "neutro" | "ok" | "erro" };

// Os mesmos textos do PATCH (PR 5): o painel avisa antes, com as palavras do salvar.
const TEXTO_DO_MOTIVO: Readonly<Record<MotivoDoSlug, string>> = {
  formato: "Use de 3 a 40 letras minúsculas, números e hífen, sem espaço nem acento.",
  reservado: "Esse endereço é reservado. Escolha outro.",
  "em-uso": "Esse endereço já está em uso. Escolha outro.",
};

/** A linha embaixo do campo do endereço. Resposta de outro slug (a digitação passou na frente) vale como "conferindo". */
export function avisoDoSlug(slug: string, salvo: string, consulta: ConsultaDoSlug | null, prefixo: string): AvisoDoSlug {
  if (slug === salvo) return { texto: "Este é o endereço atual da página.", tom: "neutro" };
  const local = motivoLocalDoSlug(slug);
  if (local) return { texto: TEXTO_DO_MOTIVO[local], tom: "erro" };
  if (!consulta || consulta.slug !== slug) return { texto: "Conferindo se está livre…", tom: "neutro" };
  if (!consulta.resposta) return { texto: "Não deu pra conferir agora. Se estiver em uso, o salvar avisa.", tom: "neutro" };
  if (consulta.resposta.disponivel) return { texto: `Livre: ${prefixo}${slug}`, tom: "ok" };
  return { texto: TEXTO_DO_MOTIVO[consulta.resposta.motivo], tom: "erro" };
}

/** "girumo.com.br/bio/": o começo fixo do endereço, sem esquema nem www. */
export function prefixoDoSlug(origemGirumo: string): string {
  try {
    return `${new URL(origemGirumo).host.replace(/^www\./, "")}/bio/`;
  } catch {
    return "girumo.com.br/bio/";
  }
}

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Guarda da resposta do `GET /api/link-da-bio/slug`: fora do contrato, "não deu pra conferir". */
export function ehRespostaDoSlug(v: unknown): v is RespostaDoSlug {
  if (!ehObjeto(v)) return false;
  return v.disponivel === true || (v.disponivel === false && (v.motivo === "formato" || v.motivo === "reservado" || v.motivo === "em-uso"));
}

// ------------------------------------------------------------------ no ar (§8)

/** O que o interruptor "Página no ar" quer dizer agora: o que está salvo e o que muda ao salvar. */
export function textoDoNoAr(publicada: boolean, salva: boolean, bloqueada: boolean): string {
  if (bloqueada) return "A Girumo tirou esta página do ar. Ela não aparece pra ninguém até ser liberada; fale com o suporte.";
  if (publicada && salva) return "No ar: quem abre o endereço vê a página.";
  if (publicada) return "Vai pro ar quando você salvar.";
  if (salva) return "Sai do ar quando você salvar.";
  return "Fora do ar: quem abre o endereço vê “Página não encontrada”.";
}

// --------------------------------------------------------------- números (§7)

const ehNumero = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** Guarda do `GET /api/link-da-bio/relatorio`: corpo fora do formato é erro de carga, nunca zero. */
export function ehRelatorioBio(v: unknown): v is RelatorioBio {
  return (
    ehObjeto(v) &&
    ehNumero(v.visitas) &&
    ehNumero(v.toques) &&
    Array.isArray(v.porLink) &&
    v.porLink.every((p: unknown) => ehObjeto(p) && typeof p.linkId === "string" && ehNumero(p.toques)) &&
    Array.isArray(v.porDia)
  );
}

export type LinhaDoRelatorio = { chave: string; titulo: string; toques: string };
export type ResumoDoRelatorio = { vazio: boolean; visitas: string; toques: string; porVisita: string; linhas: LinhaDoRelatorio[] };

const numero = (n: number) => n.toLocaleString("pt-BR");

/**
 * O cartão "Últimos N dias" (§7): visitas, toques e toques POR VISITA (passa de 1 quando a mesma
 * pessoa toca em dois botões; não é "% que tocou"). Os botões com toque, do mais tocado; os que
 * saíram da página (o relatório só guarda o id) somam numa linha só, no fim.
 */
export function resumoDoRelatorio(r: RelatorioBio, links: readonly LinkBio[]): ResumoDoRelatorio {
  const titulos = new Map(links.map((l) => [l.id, l.titulo] as const));
  const tocados = r.porLink.filter((p) => p.toques > 0);
  const linhas: LinhaDoRelatorio[] = tocados
    .filter((p) => titulos.has(p.linkId))
    .sort((a, b) => b.toques - a.toques)
    .map((p) => ({ chave: p.linkId, titulo: titulos.get(p.linkId) ?? "", toques: numero(p.toques) }));
  const saiu = tocados.filter((p) => !titulos.has(p.linkId)).reduce((soma, p) => soma + p.toques, 0);
  if (saiu > 0) linhas.push({ chave: "saiu", titulo: "Links que saíram da página", toques: numero(saiu) });
  return {
    vazio: r.visitas === 0 && r.toques === 0,
    visitas: numero(r.visitas),
    toques: numero(r.toques),
    porVisita: r.visitas > 0 ? (r.toques / r.visitas).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—",
    linhas,
  };
}
