/**
 * Peças comuns aos 4 modelos do link da bio: ícones, imagem, foco da foto,
 * destino de cada tipo de link, bloco "confere", endereço, rodapé e o CSS base.
 *
 * Puro (sem server-only, Supabase, React ou node:): roda na rota pública e na
 * prévia do painel. Texto do lojista só entra por `escapeHtml`, sempre entre
 * aspas duplas; URL só sai de `new URL` com protocolo da lista.
 */
import type { TokensBio } from "@/lib/bio/cores";
import type { DocumentoBio, MidiaRef } from "@/lib/bio/documento";
import { escapeHtml } from "@/lib/campaigns/entry-page";
import { parseHex, relativeLuminance } from "@/lib/pages/palette";
import type { LogoDaPagina } from "./modelo";

/** Larguras do otimizador do Next (imageSizes/deviceSizes padrão); 390 daria 400. */
const LARGURAS_FOTO = [384, 640, 828] as const;
/** Miniatura de até 48 px: uma largura só (srcset não teria o que escolher). */
export const LARGURA_MINIATURA = [128] as const;
/** Máximo de links do documento (spec §4); limita as regras de atraso. */
const MAX_LINKS = 20;

const ID_DE_MIDIA = /^[A-Za-z0-9_-]+$/;
const NOME_DE_TOKEN = /^--[a-z][a-z0-9-]*$/;
const COR = /^#[0-9A-Fa-f]{6}$/;
/** CNPJ guardado sem pontuação: 12 caracteres [0-9A-Z] + 2 dígitos (o alfanumérico da Receita vale). */
export const CNPJ = /^[0-9A-Z]{12}\d{2}$/;

// Desenhos do sprite do mockup (Main.dc.html), 24x24, traço em currentColor.
const SIMBOLOS: Record<string, string> = {
  whatsapp:
    '<path fill="currentColor" stroke="none" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-2-1.2 7.4 7.4 0 0 1-1.4-1.7c-.1-.2 0-.4.1-.5l.4-.4.2-.4v-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c.6.3 1.1.4 1.5.5a3.6 3.6 0 0 0 1.7.1 2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z"/>',
  catalogo: '<path d="M2.5 5.5C5 4.2 8 4.3 12 6.2c4-1.9 7-2 9.5-.7V19c-2.5-1.3-5.5-1.2-9.5.7-4-1.9-7-2-9.5-.7z"/><path d="M12 6.2v13.5"/>',
  coroa: '<path d="M3.5 8.5l4.2 3.6L12 5l4.3 7.1 4.2-3.6-1.8 9.5H5.3z"/><path d="M5.5 20h13"/>',
  mapa: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><path d="M9.5 9.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0"/>',
  canal: '<path d="M4 10v4h3l6 4V6L7 10z"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/>',
  instagram:
    '<path d="M7.5 3h9A4.5 4.5 0 0 1 21 7.5v9a4.5 4.5 0 0 1-4.5 4.5h-9A4.5 4.5 0 0 1 3 16.5v-9A4.5 4.5 0 0 1 7.5 3z"/><path d="M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0"/><path d="M17.3 6.7h.01"/>',
  site: '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0"/><path d="M3.5 9h17M3.5 15h17"/><path d="M12 3c2.6 2.7 3.8 5.7 3.8 9s-1.2 6.3-3.8 9c-2.6-2.7-3.8-5.7-3.8-9S9.4 5.7 12 3z"/>',
  sacola: '<path d="M5 8h14l-1.2 12.5H6.2z"/><path d="M9 10.5V7a3 3 0 0 1 6 0v3.5"/>',
  etiqueta: '<path d="M3 12.2V4h8.2l9.3 9.3-8.2 8.2z"/><path d="M7.6 7.6h.01"/>',
  caminhao:
    '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><path d="M5.2 17.5a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0"/><path d="M15.2 17.5a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0"/>',
  video: '<path d="M4.5 6.5h9a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z"/><path d="M15.5 10.5l6-3.5v10l-6-3.5"/>',
  cartao: '<path d="M5 6h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/><path d="M3 10h18M7 15h3"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  seta: '<path d="M9 6l6 6-6 6"/>',
  "mapa-dobrado": '<path d="M9 4L3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
  check: '<path d="M5 12.5l4.2 4L19 7"/>',
  girumo: '<path d="M12 3a9 9 0 1 0 9 9h-9"/>',
};

/** `<svg>` decorativo que usa um símbolo do sprite; nome fora da lista vira "link". */
export function icone(nome: string, classe = "i"): string {
  const n = Object.hasOwn(SIMBOLOS, nome) ? nome : "link";
  return `<svg class="${classe}" viewBox="0 0 24 24" aria-hidden="true"><use href="#lk-i-${n}"></use></svg>`;
}

/** Sprite só com os símbolos que o HTML usa (procura `#lk-i-…`). */
export function sprite(html: string): string {
  const usados = [...new Set(html.match(/#lk-i-[a-z-]+/g) ?? [])]
    .map((ref) => ref.slice("#lk-i-".length))
    .filter((n) => Object.hasOwn(SIMBOLOS, n));
  if (usados.length === 0) return "";
  const simbolos = usados.map((n) => `<symbol id="lk-i-${n}" viewBox="0 0 24 24">${SIMBOLOS[n]}</symbol>`).join("");
  return `<svg class="lk-sprite" aria-hidden="true" focusable="false">${simbolos}</svg>`;
}

/** URL do otimizador do Next para a mídia pública; `null` se o id não tem o formato. */
export function urlDaImagem(id: string, largura: number): string | null {
  if (!ID_DE_MIDIA.test(id)) return null;
  return `/_next/image?url=${encodeURIComponent(`/api/p/media/${id}`)}&w=${largura}&q=75`;
}

/** Ponto de foco em porcentagem inteira (0..100); `null` sem foco ou com número inválido. */
export function pontoDoFoco(foco: MidiaRef["foco"]): { x: number; y: number } | null {
  if (!foco || !Number.isFinite(foco.x) || !Number.isFinite(foco.y)) return null;
  const pct = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 100);
  return { x: pct(foco.x), y: pct(foco.y) };
}

/** Classe que posiciona a foto no foco (a regra sai de `regrasDoFoco`); "" sem foco. */
export function classeDoFoco(foco: MidiaRef["foco"]): string {
  const p = pontoDoFoco(foco);
  return p ? `lk-f-${p.x}-${p.y}` : "";
}

/**
 * Uma regra por foco distinto do documento. `transform-origin` junto: o zoom do
 * Clássico (PR 3b) cresce em volta do mesmo ponto sem regra própria.
 */
export function regrasDoFoco(doc: DocumentoBio): string {
  const p = doc.perfil;
  const midias: (MidiaRef | null)[] = [p.capa, p.logoClara, p.logoEscura];
  for (const l of doc.links) {
    if (l.tipo === "link") midias.push(...l.fotos);
    if (l.tipo === "endereco") midias.push(l.foto);
  }
  const regras = new Set<string>();
  for (const m of midias) {
    const f = m ? pontoDoFoco(m.foco) : null;
    if (f) regras.add(`.lk .lk-f-${f.x}-${f.y}{object-position:${f.x}% ${f.y}%;transform-origin:${f.x}% ${f.y}%}`);
  }
  return [...regras].join("");
}

export type OpcoesDaImagem = {
  classe?: string;
  largura: number; // width declarado (o tamanho do espaço no CSS)
  altura: number; // height declarado
  sizes: string; // constante do modelo
  alt: string; // texto do lojista ou ""
  carregamento: "prioridade" | "normal" | "lazy"; // prioridade = foto do topo
  larguras?: readonly number[]; // padrão LARGURAS_FOTO
};

/** `<img>` pelo otimizador, com srcset, width/height e foco; "" se o id é inválido. */
export function imagem(m: MidiaRef, o: OpcoesDaImagem): string {
  const larguras = o.larguras ?? LARGURAS_FOTO;
  const src = urlDaImagem(m.id, larguras[Math.min(1, larguras.length - 1)]);
  if (!src) return "";
  const candidatos = larguras.map((w) => `${escapeHtml(urlDaImagem(m.id, w) ?? "")} ${w}w`).join(", ");
  const srcset = larguras.length > 1 ? ` srcset="${candidatos}" sizes="${o.sizes}"` : "";
  const classes = [o.classe, classeDoFoco(m.foco)].filter(Boolean).join(" ");
  const carga =
    o.carregamento === "prioridade" ? ' fetchpriority="high"' : o.carregamento === "lazy" ? ' loading="lazy"' : "";
  return `<img${classes ? ` class="${classes}"` : ""} src="${escapeHtml(src)}"${srcset} width="${o.largura}" height="${o.altura}" alt="${escapeHtml(o.alt)}"${carga} decoding="async">`;
}

/** Destaque do perfil: o primeiro número (ou valor em R$) sai sozinho. */
export function destaqueEmPartes(texto: string): { antes: string; num: string; depois: string } {
  const m = /(?:R\$\s?)?\d+(?:[.,]\d+)*/.exec(texto);
  if (!m) return { antes: texto, num: "", depois: "" };
  return { antes: texto.slice(0, m.index), num: m[0], depois: texto.slice(m.index + m[0].length) };
}

export function destaqueHtml(texto: string): string {
  const { antes, num, depois } = destaqueEmPartes(texto);
  return `${escapeHtml(antes)}${num ? `<b>${escapeHtml(num)}</b>` : ""}${escapeHtml(depois)}`;
}

/** CNPJ sem pontuação → 00.000.000/0000-00 (ou 12.ABC.345/01DE-35); qualquer outra coisa volta como veio. */
export function formatarCnpj(digitos: string): string {
  if (!CNPJ.test(digitos)) return digitos;
  return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12)}`;
}

/** Fundo escuro pede a logoClara; sem ela, a escura vai numa placa clara (e o espelho no fundo claro). */
export function logoDaPagina(doc: DocumentoBio, fundo: string): LogoDaPagina | null {
  const rgb = parseHex(fundo);
  const escuro = rgb ? relativeLuminance(rgb) < 0.4 : false;
  const { logoClara, logoEscura } = doc.perfil;
  const certa = escuro ? logoClara : logoEscura;
  if (certa) return { midia: certa, placa: null };
  const errada = escuro ? logoEscura : logoClara;
  return errada ? { midia: errada, placa: escuro ? "clara" : "escura" } : null;
}

/** Tokens que podem ir para o `<style>`: chave `--nome`, valor `#RRGGBB` (aceita a chave sem `--`). */
export function tokensValidos(t: TokensBio): TokensBio {
  return Object.fromEntries(
    Object.entries(t).flatMap(([chave, valor]) => {
      const nome = chave.startsWith("--") ? chave : `--${chave}`;
      return NOME_DE_TOKEN.test(nome) && COR.test(valor) ? [[nome, valor.toUpperCase()]] : [];
    }),
  );
}

/** Atraso de entrada por posição (no lugar do `style="--i:n"` do mockup). */
export function atrasos(seletor: string, inicioMs: number, passoMs: number): string {
  let css = "";
  for (let n = 1; n <= MAX_LINKS; n++) {
    const ms = inicioMs + (n - 1) * passoMs;
    if (ms > 0) css += `${seletor}:nth-child(${n}){animation-delay:${ms}ms}`;
  }
  return css;
}
