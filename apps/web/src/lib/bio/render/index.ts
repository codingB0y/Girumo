/**
 * HTML da página pública do link da bio, montado por concatenação (sem React):
 * abre rápido no navegador do Instagram e não leva nada da Girumo junto (layout
 * raiz, Sentry, favicon). Mesmo caminho do /r/ (`lib/campaigns/entry-page.ts`).
 *
 * Puro: roda na rota /bio (PR 4a) e no navegador, na prévia do painel (PR 6a).
 * CSP da página (spec §6): `style-src` e `script-src` só por nonce — por isso
 * nenhum atributo style=, e cor só de token revalidado (`tokensValidos`).
 */
import { coresDoModelo } from "@/lib/bio/cores";
import type { DadosRender, Modelo } from "@/lib/bio/documento";
import { escapeHtml } from "@/lib/campaigns/entry-page";
import { nonceAttribute } from "@/lib/security/csp";
import { etiqueta } from "./etiqueta";
import type { ContextoRender, FonteDoModelo, ModeloRender, ModoRender } from "./modelo";
import { CSS_BASE, linksVisiveis, logoDaPagina, regrasDoFoco, sprite, tokensValidos, urlDaImagem } from "./partes";
import { scriptDaPagina } from "./script";

/** O PR 3b troca as três últimas entradas pelos modelos próprios. */
const MODELOS_RENDER: Record<Modelo, ModeloRender> = {
  etiqueta,
  vitrine: etiqueta,
  romaneio: etiqueta,
  classico: etiqueta,
};

const COR = /^#[0-9A-F]{6}$/;

function fontes(lista: readonly FonteDoModelo[]): { css: string; preload: string } {
  const unicas = [...new Map(lista.map((f) => [`${f.familia}|${f.arquivo}`, f])).values()];
  return {
    css: unicas
      .map(
        (f) =>
          `@font-face{font-family:"${f.familia}";font-style:${f.estilo};font-weight:${f.peso};font-display:swap;src:url(/fonts/bio/${f.arquivo}) format("woff2")}`,
      )
      .join(""),
    preload: [...new Set(unicas.map((f) => f.arquivo))]
      .map((a) => `<link rel="preload" href="/fonts/bio/${a}" as="font" type="font/woff2" crossorigin>`)
      .join(""),
  };
}

function imagemAbsoluta(origem: string, id: string): string | null {
  const caminho = urlDaImagem(id, 828);
  if (!caminho) return null;
  try {
    return new URL(caminho, origem).href;
  } catch {
    return null;
  }
}

function cabeca(c: ContextoRender, m: ModeloRender, preload: string): string {
  const p = c.d.documento.perfil;
  const nome = escapeHtml(p.nome);
  const frase = escapeHtml(p.frase);
  const tema = m.corDoTopo(c.tokens);
  const icone = c.logo ? urlDaImagem(c.logo.midia.id, 384) : null;
  const og = p.capa ? imagemAbsoluta(c.d.origem, p.capa.id) : null;
  return [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${nome}</title>`,
    frase ? `<meta name="description" content="${frase}">` : "",
    '<meta name="robots" content="noindex">',
    '<meta property="og:type" content="website">',
    `<meta property="og:title" content="${nome}">`,
    frase ? `<meta property="og:description" content="${frase}">` : "",
    og ? `<meta property="og:image" content="${escapeHtml(og)}">` : "",
    COR.test(tema) ? `<meta name="theme-color" content="${tema}">` : "",
    `<link rel="icon" href="${icone ? escapeHtml(icone) : "data:,"}">`,
    preload,
  ].join("");
}

/**
 * A página inteira. "previa": nenhum <script> e nenhum href (o iframe do painel
 * não navega nem dispara nada). A entrada só toca com `animarEntrada` E
 * `documento.animar`; o balanço do toque não depende dela.
 */
export function renderPaginaBio(
  d: DadosRender,
  o: { modo: ModoRender; nonce: string | null; animarEntrada: boolean },
): string {
  const doc = d.documento;
  const modelo = MODELOS_RENDER[doc.modelo];
  const tokens = tokensValidos(coresDoModelo(doc.modelo, doc.paleta, doc.cores));
  const c: ContextoRender = {
    d,
    modo: o.modo,
    tokens,
    links: linksVisiveis(d),
    logo: logoDaPagina(doc, modelo.fundoDoLogo(tokens)),
  };
  const corpo = modelo.corpo(c);
  const nonce = nonceAttribute(o.nonce);
  const f = fontes(modelo.fontes);
  const variaveis = `.lk{${Object.entries(tokens).map(([k, v]) => `${k}:${v}`).join(";")}}`;
  // O elástico do scroll no iOS mostra o canvas do <html>: na cor do topo (a do theme-color), não em branco.
  const tema = modelo.corDoTopo(tokens);
  const fundoDoHtml = COR.test(tema) ? `html{background:${tema}}` : "";
  const css = `${f.css}${variaveis}${CSS_BASE}${modelo.css}${regrasDoFoco(doc)}${fundoDoHtml}`;
  const entra = o.animarEntrada && doc.animar ? " lk-entra" : "";
  const script = o.modo === "publica" ? `<script${nonce}>${scriptDaPagina({ rastreio: null })}</script>` : "";
  return `<!doctype html><html lang="pt-BR"><head>${cabeca(c, modelo, f.preload)}<style${nonce}>${css}</style></head><body data-pagina="${escapeHtml(d.paginaId)}"><div class="lk${entra}">${sprite(corpo)}${corpo}<p id="lk-status" class="lk-status" role="status"></p></div>${script}</body></html>`;
}

const CSS_404 =
  'body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box;background:#F4F4F2;color:#1A1A1A;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center}h1{margin:0 0 8px;font-size:22px;line-height:1.25}p{margin:0;color:#4A4A4A}';

/** 404 da rota /bio: mínima e sem marca (inexistente, fora do ar, bloqueada). */
export function renderPaginaNaoEncontrada(nonce: string | null): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Página não encontrada</title><link rel="icon" href="data:,"><style${nonceAttribute(nonce)}>${CSS_404}</style></head><body><main><h1>Página não encontrada</h1><p>Confira o endereço com a loja.</p></main></body></html>`;
}
