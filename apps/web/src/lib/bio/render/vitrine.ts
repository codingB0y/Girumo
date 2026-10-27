/**
 * Modelo Vitrine: foto cheia da loja no topo, com a logo e a frase em itálico;
 * a lista sobe por cima como uma folha; o botão principal é uma pílula com um
 * brilho que passa uma vez na entrada (e de novo no toque). Valores do mockup
 * (Main.dc.html, prefixo `vt-`) com as regras da revisão: topo com min-height
 * e o texto no fluxo (zoom de 200% não corta), véu fixo de .62 sob o texto da
 * foto, sem opacity em texto, alvos ≥ 44 px, h1 = nome da loja, nada de style=.
 */
import { escapeHtml } from "@/lib/campaigns/entry-page";
import type { ContextoRender, FonteDoModelo, LinkVisivel, ModeloRender } from "./modelo";
import {
  atrasos,
  blocoConfere,
  cnpjDaLoja,
  conteudoDoH1,
  dadosDoLink,
  destaqueHtml,
  detalhesDoEndereco,
  feitoComGirumo,
  hrefAttr,
  icone,
  imagem,
} from "./partes";

const FONTES_VITRINE: readonly FonteDoModelo[] = [
  { familia: "Jost", arquivo: "jost/jost-latin.woff2", peso: "100 900", estilo: "normal" },
  { familia: "Bodoni Moda", arquivo: "bodoni-moda/bodoni-moda-latin-600.woff2", peso: "600", estilo: "normal" },
  { familia: "Bodoni Moda", arquivo: "bodoni-moda/bodoni-moda-latin-500-italic.woff2", peso: "500", estilo: "italic" },
];

/** Fundo do topo (atrás da foto e no lugar dela): theme-color e fundo que escolhe a logo. */
const FUNDO_DO_TOPO = "#151412";
/** As fotos do catálogo têm ~1/3 da coluna (≤ 160 px): 384 basta até 2,4x. */
const LARGURA_DAS_FOTOS = [384] as const;
const SIZES_CAPA = "(max-width: 520px) 100vw, 520px";
const SIZES_CAMINHO = "(max-width: 520px) calc(100vw - 44px), 476px";

export const CSS_VITRINE = [
  '.lk{font-family:"Jost","Futura",system-ui,sans-serif}',
  ".vt{background:var(--fundo2);color:var(--on);font-size:16px;line-height:1.45}",
  ".vt-capa{position:relative;isolation:isolate;display:flex;flex-direction:column;max-width:520px;margin:0 auto;padding:14px 14px 48px;overflow:hidden;background:#151412;color:#fff}",
  ".vt-capa--foto{min-height:520px}",
  ".vt-capa>img{position:absolute;inset:0;z-index:-2;width:100%;height:100%;object-fit:cover;object-position:50% 30%}",
  ".vt-onde{align-self:flex-start;display:flex;align-items:flex-start;gap:7px;padding:7px 11px;border-radius:12px;background:rgb(0 0 0 / .62);font-size:12.5px;line-height:1.3;font-weight:500}",
  ".vt-onde svg.i{width:15px;height:15px;margin-top:1px}",
  ".vt-marca{position:relative;margin-top:auto;padding:56px 6px 0;display:grid;justify-items:start;gap:12px}",
  '.vt-marca::before{content:"";position:absolute;inset:0 -14px -48px;z-index:-1;background:linear-gradient(rgb(0 0 0 / 0),rgb(0 0 0 / .62) 56px)}',
  ".vt-nome{font-size:15px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;line-height:1.3}",
  ".vt-logo{width:146px;height:65px;object-fit:contain;object-position:left center;filter:drop-shadow(0 2px 10px rgb(0 0 0 / .35))}",
  ".lk-placa .vt-logo{width:118px;height:52px;object-position:center;filter:none}",
  '.vt-frase{font-family:"Bodoni Moda",Georgia,serif;font-weight:500;font-style:italic;font-size:31px;line-height:1.08;letter-spacing:-.01em;text-wrap:balance;text-shadow:0 2px 18px rgb(0 0 0 / .35)}',
  ".vt-folha{position:relative;z-index:2;max-width:520px;margin:-26px auto 0;background:var(--fundo2);border-radius:26px 26px 0 0;padding:22px 18px 30px;display:grid;grid-template-columns:minmax(0,1fr);gap:22px}",
  ".vt-fatos{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 14px;font-size:13.5px;color:var(--on2)}",
  '.vt-fatos b{font-family:"Bodoni Moda",Georgia,serif;font-size:18px;font-weight:600;color:var(--acento)}',
  ".vt-lista{display:grid}",
  ".vt-lista>li{border-bottom:1px solid var(--linha)}",
  ".vt-lista>li.vt-li-prin{border-bottom:0;padding-bottom:12px}",
  ".vt-prin{position:relative;overflow:hidden;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px;min-height:66px;padding:10px 20px 10px 10px;border-radius:999px;background:var(--prin);color:var(--printinta);text-decoration:none;box-shadow:0 16px 30px -20px rgb(0 0 0 / .6)}",
  '.vt-prin::before,.vt-prin::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(105deg,transparent 35%,rgb(255 255 255 / .3) 50%,transparent 65%);transform:translateX(-130%)}',
  ".vt-zap{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;background:rgb(255 255 255 / .14)}",
  ".lk .vt-zap--wa{background:#25D366;color:#fff}",
  ".vt-prin .vt-rot{font-size:17px;line-height:1.2}",
  ".vt-prin .vt-sub{font-size:13px;line-height:1.3;color:var(--printinta)}",
  ".vt-linha{display:grid;grid-template-columns:56px minmax(0,1fr) auto;align-items:center;column-gap:14px;min-height:82px;padding:12px 4px;text-decoration:none;color:var(--on);border-radius:12px}",
  ".vt-prin,.vt-linha{cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}",
  ".vt-tile{width:56px;height:56px;border-radius:14px;display:grid;place-items:center;background:var(--icobg);color:var(--ico)}",
  ".vt-txt{display:grid;gap:2px;min-width:0}",
  ".vt-rot{font-size:16.5px;font-weight:600;letter-spacing:-.005em;line-height:1.25}",
  ".vt-sub{font-size:13.5px;color:var(--on2);line-height:1.35}",
  ".lk .vt-linha>svg{width:20px;height:20px;color:var(--seta)}",
  // a seta é a <svg> filha direta da linha; .lk e [open] na frente: o toque e o hover
  // também mexem nela e vêm depois, com (0,2,1)
  ".lk .vt-abre[open] .vt-linha>svg{transform:rotate(90deg)}",
  ".vt-fotos{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}",
  ".vt-fotos img{width:100%;height:auto;aspect-ratio:4/5;object-fit:cover;border-radius:12px}",
  ".vt-caminho{display:grid;gap:12px;padding:4px 4px 16px}",
  ".vt-caminho img{width:100%;height:auto;aspect-ratio:16/10;object-fit:cover;object-position:50% 30%;border-radius:16px}",
  ".vt-caminho address{font-style:normal;font-size:14.5px;line-height:1.5;white-space:pre-line}",
  ".vt-hora{font-size:13px;color:var(--on2)}",
  ".vt-mapa{display:flex;align-items:center;justify-content:center;gap:8px;min-height:50px;border-radius:999px;border:1.5px solid var(--on);color:var(--on);font-weight:600;text-decoration:none}",
  ".vt-mapa svg.i{width:18px;height:18px}",
  ".vt-confere{background:var(--papel);border:1px solid var(--linha);border-radius:18px;padding:18px;display:grid;gap:12px;color:var(--tinta)}",
  ".vt-confere h2{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--acento);font-weight:700}",
  ".vt-confere ul{display:grid;gap:10px}",
  ".vt-confere li{display:grid;grid-template-columns:22px minmax(0,1fr);gap:10px;font-size:14.5px;line-height:1.45}",
  ".vt-confere li svg.i{width:20px;height:20px;color:var(--acento);margin-top:1px}",
  ".vt-confere b{font-weight:600}",
  ".vt-cnpj{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:6px}",
  ".vt-cnpj>span{font-variant-numeric:tabular-nums;font-weight:600}",
  ".vt-copiar{font-size:12.5px;font-weight:600;color:var(--tinta);background:none;border:1.5px solid var(--linha);border-radius:999px;min-height:44px;padding:0 14px;cursor:pointer}",
  ".vt-confere :focus-visible{outline-color:var(--tinta)}",
  ".vt-rodape{display:grid;justify-items:center;gap:8px;text-align:center;font-size:13px;color:var(--on2)}",
  ".vt-rodape small{font-size:11.5px}",
  "@media (prefers-reduced-motion:no-preference){",
  ".vt-prin{transition:transform .2s cubic-bezier(.22,1,.36,1)}",
  ".vt-prin:active{transform:scale(.98)}",
  ".lk .vt-linha>svg{transition:transform .25s cubic-bezier(.22,1,.36,1)}",
  ".vt-linha:active>svg,.vt-linha.lk-toque>svg{transform:translateX(3px)}",
  ".lk-entra .vt-capa>img{animation:vt-zoom 1.8s cubic-bezier(.16,1,.3,1) both}",
  ".lk-entra .vt-marca>*{animation:vt-ergue .9s cubic-bezier(.16,1,.3,1) both}",
  ".lk-entra .vt-marca>:nth-child(2){animation-delay:120ms}",
  ".lk-entra .vt-folha{animation:vt-sobe .95s .15s cubic-bezier(.16,1,.3,1) both}",
  ".lk-entra .vt-lista>li{animation:vt-entra .7s cubic-bezier(.16,1,.3,1) both}",
  atrasos(".vt-lista>li", 350, 60),
  // brilho da entrada no ::after, o do toque no ::before: trocar de nome no mesmo
  // pseudo-elemento faria a entrada tocar de novo quando o toque acaba
  ".lk-entra .vt-prin::after{animation:vt-brilho 1.3s 1.25s cubic-bezier(.4,0,.2,1) both}",
  ".vt-prin.lk-toque::before{animation:vt-brilho .9s cubic-bezier(.4,0,.2,1)}",
  "}",
  // hover só onde existe ponteiro: no celular o :hover gruda depois do toque
  "@media (prefers-reduced-motion:no-preference) and (hover:hover){.vt-linha:hover>svg{transform:translateX(3px)}}",
  "@keyframes vt-zoom{from{transform:scale(1.14)}to{transform:none}}",
  "@keyframes vt-ergue{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}",
  "@keyframes vt-sobe{from{transform:translateY(64px)}to{transform:none}}",
  "@keyframes vt-entra{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}",
  "@keyframes vt-brilho{to{transform:translateX(130%)}}",
].join("");

function itemDaLista(v: LinkVisivel, c: ContextoRender): string {
  const l = v.link;
  const sub = l.sub ? `<span class="vt-sub">${escapeHtml(l.sub)}</span>` : "";
  const texto = `<span class="vt-txt"><span class="vt-rot">${escapeHtml(l.titulo)}</span>${sub}</span>`;
  const seta = icone("seta");
  if (l.tipo === "endereco") {
    const caminho = detalhesDoEndereco(v, c, {
      prefixo: "vt",
      classeDoResumo: "vt-linha",
      resumo: `<span class="vt-tile">${icone(l.icone)}</span>${texto}${seta}`,
      foto: { largura: 640, altura: 400, sizes: SIZES_CAMINHO },
    });
    return `<li>${caminho}</li>`;
  }
  const destino = `${hrefAttr(v.href, c.modo)}${dadosDoLink(v)}`;
  if (v.principal) {
    const zap = l.icone === "whatsapp" ? " vt-zap--wa" : "";
    return `<li class="vt-li-prin"><a class="vt-prin"${destino}><span class="vt-zap${zap}">${icone(l.icone)}</span>${texto}${icone("seta")}</a></li>`;
  }
  const fotos = (l.tipo === "link" ? l.fotos : [])
    // sem width/height: o CSS já dá largura e aspect-ratio 4/5 (3 fotos por link)
    .map((f) => imagem(f, { sizes: "120px", alt: "", carregamento: "lazy", larguras: LARGURA_DAS_FOTOS }))
    .join("");
  const vitrine = fotos ? `<span class="vt-fotos" aria-hidden="true">${fotos}</span>` : "";
  return `<li><a class="vt-linha"${destino}><span class="vt-tile">${icone(l.icone)}</span>${texto}${seta}${vitrine}</a></li>`;
}

function rodape(c: ContextoRender): string {
  const p = c.d.documento.perfil;
  const insta = p.instagram ? `<span>Instagram @${escapeHtml(p.instagram)}</span>` : "";
  const cnpj = cnpjDaLoja(c.d.documento);
  const linhaDoCnpj = cnpj ? `<small>${escapeHtml(p.nome)} · CNPJ ${cnpj}</small>` : "";
  const feito = feitoComGirumo(c);
  return insta || linhaDoCnpj || feito ? `<footer class="vt-rodape">${insta}${linhaDoCnpj}${feito}</footer>` : "";
}

function corpo(c: ContextoRender): string {
  const doc = c.d.documento;
  const p = doc.perfil;
  const capa = p.capa
    ? imagem(p.capa, { largura: 640, altura: 800, sizes: SIZES_CAPA, alt: p.capaAlt, carregamento: "prioridade" })
    : "";
  const onde = p.local ? `<p class="vt-onde">${icone("mapa")}<span>${escapeHtml(p.local)}</span></p>` : "";
  const h1 = `<h1 class="vt-nome">${conteudoDoH1(c, { classe: "vt-logo", largura: 146, altura: 65, sizes: "146px" })}</h1>`;
  const frase = p.frase ? `<p class="vt-frase">${escapeHtml(p.frase)}</p>` : "";
  const topo = `<header class="vt-capa${capa ? " vt-capa--foto" : ""}">${capa}${onde}<div class="vt-marca">${h1}${frase}</div></header>`;
  const fatos = p.destaques.length
    ? `<ul class="vt-fatos">${p.destaques.map((t) => `<li>${destaqueHtml(t)}</li>`).join("")}</ul>`
    : "";
  const lista = c.links.length
    ? `<ul class="vt-lista" aria-label="Links da ${escapeHtml(p.nome)}">${c.links.map((v) => itemDaLista(v, c)).join("")}</ul>`
    : "";
  const folha = `${fatos}${lista}${blocoConfere(doc, "vt")}${rodape(c)}`;
  return `<main class="vt">${topo}${folha ? `<div class="vt-folha">${folha}</div>` : ""}</main>`;
}

export const vitrine: ModeloRender = {
  fontes: FONTES_VITRINE,
  css: CSS_VITRINE,
  corDoTopo: () => FUNDO_DO_TOPO,
  fundoDoLogo: () => FUNDO_DO_TOPO,
  corpo,
};
