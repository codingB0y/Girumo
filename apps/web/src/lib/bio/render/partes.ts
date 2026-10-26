/**
 * Peças comuns aos 4 modelos do link da bio: ícones, imagem, foco da foto,
 * destino de cada tipo de link, bloco "confere", endereço, rodapé e o CSS base.
 *
 * Puro (sem server-only, Supabase, React ou node:): roda na rota pública e na
 * prévia do painel. Texto do lojista só entra por `escapeHtml`, sempre entre
 * aspas duplas; URL só sai de `new URL` com protocolo da lista.
 *
 * Confiança: o que entra em HTML sem `escapeHtml` (`sizes`, `classe`, `prefixo`,
 * `classeDoResumo`, `seletor`, `resumo`, `mapa`) é constante do modelo ou HTML já
 * escapado por quem chama — nunca texto do lojista.
 */
import type { TokensBio } from "@/lib/bio/cores";
import type { DadosRender, DocumentoBio, LinkBio, MidiaRef } from "@/lib/bio/documento";
import { getPublicSiteUrl } from "@/lib/brand";
import { escapeHtml } from "@/lib/campaigns/entry-page";
import { campaignLinkPath } from "@/lib/custom-domains/host";
import { parseHex, relativeLuminance } from "@/lib/pages/palette";
import type { ContextoRender, LinkVisivel, LogoDaPagina, ModoRender } from "./modelo";

/** Larguras do otimizador do Next (imageSizes/deviceSizes padrão); 390 daria 400. */
const LARGURAS_FOTO = [384, 640, 828] as const;
/** Miniatura de até 48 px: uma largura só (srcset não teria o que escolher). */
export const LARGURA_MINIATURA = [128] as const;
/** Máximo de links do documento (spec §4); limita as regras de atraso. */
const MAX_LINKS = 20;

const ID_DE_MIDIA = /^[A-Za-z0-9_-]+$/;
const SLUG_DE_CAMPANHA = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
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

/**
 * `<svg>` decorativo que usa um símbolo do sprite; nome fora da lista vira "link".
 * Sem viewBox: o `<symbol>` já tem o seu e o `<use>` ocupa o `<svg>` inteiro (o CSS
 * dá o tamanho), então o desenho é o mesmo; `<use/>` fecha sozinho (é SVG). ~28 B a
 * menos por ícone (com o prefixo curto `i-`), ~1,2 KB por página cheia.
 */
export function icone(nome: string, classe = "i"): string {
  const n = Object.prototype.hasOwnProperty.call(SIMBOLOS, nome) ? nome : "link";
  return `<svg class="${classe}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
}

/** Sprite só com os símbolos que o HTML usa (procura `href="#i-…`, o que `icone` escreve). */
export function sprite(html: string): string {
  const usados = [...new Set(html.match(/href="#i-[a-z-]+/g) ?? [])]
    .map((ref) => ref.slice('href="#i-'.length))
    .filter((n) => Object.prototype.hasOwnProperty.call(SIMBOLOS, n));
  if (usados.length === 0) return "";
  const simbolos = usados.map((n) => `<symbol id="i-${n}" viewBox="0 0 24 24">${SIMBOLOS[n]}</symbol>`).join("");
  return `<svg class="lk-sprite" aria-hidden="true">${simbolos}</svg>`;
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
 * Uma regra por foco distinto do documento, só de link ligado (`ativo`; os
 * escondidos por campanha só se sabem no `DadosRender`, e custam uma regra à toa). `transform-origin` junto: o zoom do
 * Clássico (PR 3b) cresce em volta do mesmo ponto sem regra própria.
 */
export function regrasDoFoco(doc: DocumentoBio): string {
  const p = doc.perfil;
  const midias: (MidiaRef | null)[] = [p.capa, p.logoClara, p.logoEscura];
  for (const l of doc.links) {
    if (!l.ativo) continue;
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
  // width/height declarados (o tamanho do espaço no CSS). Sem eles, nenhum dos dois: só
  // onde o CSS do modelo já fixa a caixa (largura e aspect-ratio), e o atributo não faz nada.
  largura?: number;
  altura?: number;
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
  const tamanho = o.largura && o.altura ? ` width="${o.largura}" height="${o.altura}"` : "";
  return `<img${classes ? ` class="${classes}"` : ""} src="${escapeHtml(src)}"${srcset}${tamanho} alt="${escapeHtml(o.alt)}"${carga} decoding="async">`;
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

/** Miolo do `<h1>`: a logo (alt = nome) ou o nome em texto. */
export function conteudoDoH1(
  c: ContextoRender,
  o: { classe: string; largura: number; altura: number; sizes: string },
): string {
  const nome = c.d.documento.perfil.nome;
  const img = c.logo ? imagem(c.logo.midia, { ...o, alt: nome, carregamento: "normal" }) : "";
  if (!img) return escapeHtml(nome);
  if (!c.logo?.placa) return img;
  return `<span class="lk-placa${c.logo.placa === "escura" ? " lk-placa--escura" : ""}">${img}</span>`;
}

function urlSegura(bruta: string): string | null {
  try {
    const u = new URL(bruta);
    const protocoloOk = u.protocol === "https:" || u.protocol === "http:";
    const semCredencial = !u.username && !u.password; // `loja.com.br@evil.com` abre evil.com
    return protocoloOk && semCredencial && u.hostname.includes(".") ? u.href : null;
  } catch {
    return null;
  }
}

/** Destino de cada tipo (spec §4); `null` = o link some da página. */
export function hrefDoLink(l: LinkBio, d: DadosRender): string | null {
  switch (l.tipo) {
    case "whatsapp": {
      if (!/^55\d{10,11}$/.test(l.numero)) return null;
      const texto = l.mensagem ? `?text=${encodeURIComponent(l.mensagem)}` : "";
      return urlSegura(`https://wa.me/${l.numero}${texto}`);
    }
    case "grupo": {
      const slug = Object.prototype.hasOwnProperty.call(d.campanhas, l.campanhaId) ? d.campanhas[l.campanhaId] : "";
      return SLUG_DE_CAMPANHA.test(slug) ? campaignLinkPath(d.origem, slug) : null;
    }
    case "link":
      return urlSegura(l.url);
    case "endereco": {
      const linha = l.endereco.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join(", ");
      return linha ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(linha)}` : null;
    }
  }
}

/** Os links que saem, na ordem do documento; o primeiro `destaque` vira o principal. */
export function linksVisiveis(d: DadosRender): LinkVisivel[] {
  const escondidos = new Set(d.linksEscondidos);
  const saida: LinkVisivel[] = [];
  for (const link of d.documento.links) {
    if (!link.ativo || escondidos.has(link.id)) continue;
    const href = hrefDoLink(link, d);
    if (!href) continue;
    const principal = link.tipo !== "endereco" && link.destaque && !saida.some((v) => v.principal);
    saida.push({ link, href, principal });
  }
  return saida;
}

/** ` href="…"` na página pública; nada na prévia (o clique não navega o iframe). */
export function hrefAttr(href: string, modo: ModoRender): string {
  return modo === "publica" ? ` href="${escapeHtml(href)}"` : "";
}

/** O que o JS da página lê: uuid do link e o tipo (lista fechada). */
export function dadosDoLink(v: LinkVisivel): string {
  return ` data-link="${escapeHtml(v.link.id)}" data-tipo="${v.link.tipo}"`;
}

/** "Como chegar": abre ali mesmo, com foto, endereço, horário e o mapa. */
export function detalhesDoEndereco(
  v: LinkVisivel,
  c: ContextoRender,
  o: {
    prefixo: string;
    classeDoResumo: string;
    resumo: string;
    foto: { largura: number; altura: number; sizes: string };
    mapa?: string;
  },
): string {
  if (v.link.tipo !== "endereco") return "";
  const l = v.link;
  const foto = l.foto ? imagem(l.foto, { ...o.foto, alt: "", carregamento: "lazy" }) : "";
  const hora = l.horario ? `<p class="${o.prefixo}-hora">${escapeHtml(l.horario)}</p>` : "";
  const mapa = o.mapa ?? `${icone("mapa-dobrado")}Abrir no Google Maps`;
  return `<details class="${o.prefixo}-abre"><summary class="${o.classeDoResumo}"${dadosDoLink(v)}>${o.resumo}</summary><div class="${o.prefixo}-caminho">${foto}<address>${escapeHtml(l.endereco)}</address>${hora}<a class="${o.prefixo}-mapa"${hrefAttr(v.href, c.modo)}>${mapa}</a></div></details>`;
}

/** "Antes de pagar, confere": Pix com CNPJ (razão + CNPJ válido) e até 2 linhas; "" sem nada a mostrar. */
export function blocoConfere(doc: DocumentoBio, prefixo: string): string {
  const cf = doc.confere;
  if (!cf.ativo) return "";
  const itens: string[] = [];
  if (cf.razao && CNPJ.test(cf.cnpj)) {
    itens.push(
      `<li>${icone("cartao")}<span>O Pix cai só no nome <b>${escapeHtml(cf.razao)}</b>.<span class="${prefixo}-cnpj"><span>CNPJ ${formatarCnpj(cf.cnpj)}</span><button type="button" class="${prefixo}-copiar" data-copiar="${cf.cnpj}">Copiar CNPJ</button></span></span></li>`,
    );
  }
  for (const linha of cf.linhas) {
    if (linha.trim()) itens.push(`<li>${icone("check")}<span>${escapeHtml(linha)}</span></li>`);
  }
  if (itens.length === 0) return "";
  return `<section class="${prefixo}-confere" aria-labelledby="lk-confere"><h2 id="lk-confere">Antes de pagar, confere</h2><ul>${itens.join("")}</ul></section>`;
}

/** Selo do rodapé; leva ao site da Girumo (nunca ao domínio da página), com a origem do clique. */
export function feitoComGirumo(c: ContextoRender): string {
  if (!c.d.documento.feitoComGirumo) return "";
  const url = `${getPublicSiteUrl()}/?utm_source=link-da-bio&utm_medium=rodape`;
  return `<a class="lk-feito"${hrefAttr(url, c.modo)}>${icone("girumo")}Feito com Girumo</a>`;
}

/** CSS comum: reset do `.lk`, foco, ícones, "Feito com Girumo", placa da logo, aviso e movimento reduzido. */
export const CSS_BASE = [
  "body{margin:0}",
  ".lk{position:relative;min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;overflow-wrap:anywhere;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;text-size-adjust:100%}",
  ".lk>main{flex:1 0 auto}",
  ":where(.lk) *,:where(.lk) *::before,:where(.lk) *::after{box-sizing:border-box}",
  ":where(.lk) img{max-width:100%;display:block}",
  ":where(.lk) :is(h1,h2,p,figure){margin:0}",
  ":where(.lk) :is(ul,ol){margin:0;padding:0;list-style:none}",
  ":where(.lk) a{color:inherit}",
  ":where(.lk) button{font:inherit}",
  ".lk :focus-visible{outline:3px solid var(--foco);outline-offset:3px}",
  ".lk-sprite{position:absolute;width:0;height:0;overflow:hidden}",
  ".lk svg.i{width:22px;height:22px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}",
  ".lk details>summary{list-style:none;cursor:pointer}",
  ".lk details>summary::-webkit-details-marker{display:none}",
  ".lk-feito{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:4px 14px;border-radius:999px;border:1px solid currentColor;font-size:12px;font-weight:600;text-decoration:none;color:inherit}",
  ".lk-feito svg.i{width:14px;height:14px}",
  ".lk-placa{display:inline-block;padding:8px 18px;border-radius:999px;background:#fff}",
  ".lk-placa--escura{background:#141414}",
  ".lk-status{position:fixed;left:50%;bottom:16px;z-index:9;max-width:calc(100% - 32px);padding:10px 16px;border-radius:999px;background:var(--tinta);color:var(--papel);font-size:14px;font-weight:600;line-height:1.3;text-align:center;transform:translateX(-50%);box-shadow:0 10px 30px -10px rgb(0 0 0 / .45)}",
  ".lk-status:empty{padding:0;box-shadow:none}",
  "@media (prefers-reduced-motion:reduce){.lk *,.lk *::before,.lk *::after{animation:none!important;transition:none!important}}",
].join("");

/** CNPJ do rodapé (e do confere do Romaneio): formatado com o "confere" ligado e o CNPJ válido pela `CNPJ`; senão "". */
export function cnpjDaLoja(doc: DocumentoBio): string {
  return doc.confere.ativo && CNPJ.test(doc.confere.cnpj) ? formatarCnpj(doc.confere.cnpj) : "";
}
