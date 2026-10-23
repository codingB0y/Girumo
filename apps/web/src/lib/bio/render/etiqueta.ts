/**
 * Modelo Etiqueta (padrão): botões = etiquetas de roupa furadas na ponta,
 * penduradas num fio; entram balançando e balançam no toque. Valores do
 * mockup (Main.dc.html, prefixo `et-`) com as regras da revisão: a máscara
 * fica no ::before (o foco do <a> não é recortado), sem opacity em texto,
 * alvos ≥ 44 px, h1 = nome da loja, nada de style=.
 */
import { escapeHtml } from "@/lib/campaigns/entry-page";
import type { ContextoRender, FonteDoModelo, LinkVisivel, ModeloRender } from "./modelo";
import {
  LARGURA_MINIATURA,
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

const FONTES_ETIQUETA: readonly FonteDoModelo[] = [
  { familia: "Lexend", arquivo: "lexend/lexend-latin.woff2", peso: "100 900", estilo: "normal" },
];

const MASCARA =
  "radial-gradient(circle 5.5px at 21px 50%,#0000 96%,#000 100%),linear-gradient(135deg,#0000 15px,#000 15.5px),linear-gradient(45deg,#0000 15px,#000 15.5px)";

export const CSS_ETIQUETA = [
  '.lk{font-family:"Lexend","Segoe UI",system-ui,sans-serif}',
  ".et{background:radial-gradient(120% 60% at 50% 0%,var(--fundo2) 55%,var(--fundo3) 130%);color:var(--on);font-size:16px;line-height:1.45;padding:18px 16px 28px}",
  ".et-col{max-width:460px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr);gap:18px}",
  ".et-vitrine{position:relative;border-radius:22px;overflow:hidden;aspect-ratio:5/4;background:var(--fundo3);box-shadow:0 22px 50px -26px rgb(10 30 55 / .7)}",
  ".et-vitrine img{width:100%;height:100%;object-fit:cover}",
  ".et-onde{position:absolute;left:12px;bottom:12px;right:12px;display:flex;align-items:center;gap:8px;background:rgb(0 0 0 / .62);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);border-radius:12px;padding:8px 12px;font-size:13px;line-height:1.3;color:#fff}",
  ".et-onde svg.i,.et-local svg.i{width:16px;height:16px;color:var(--fio)}",
  ".et-marca{display:grid;justify-items:center;gap:10px;text-align:center}",
  ".et-nome{font-size:26px;font-weight:700;letter-spacing:-.02em;line-height:1.15;max-width:22ch}",
  ".et-logo{width:190px;height:84px;object-fit:contain}",
  ".lk-placa .et-logo{width:150px;height:66px}",
  ".et-frase{font-size:17px;font-weight:500;letter-spacing:-.005em;max-width:30ch;line-height:1.35}",
  ".et-local{display:flex;align-items:center;justify-content:center;gap:6px;font-size:13.5px;line-height:1.35}",
  ".et-fatos{display:flex;flex-wrap:wrap;justify-content:center;gap:6px}",
  ".et-fatos li{font-size:12.5px;font-weight:500;padding:5px 11px;border-radius:999px;background:var(--chip);border:1px solid var(--chipbd)}",
  ".et-fatos b{font-weight:700;color:var(--acento)}",
  ".et-fio{position:relative;padding:6px 0;display:grid;gap:12px}",
  '.et-fio::before{content:"";position:absolute;left:21px;top:-10px;bottom:-10px;width:2px;margin-left:-1px;border-radius:2px;background:var(--fio);opacity:.9}',
  ".et-fio>li{filter:drop-shadow(0 10px 16px rgb(10 30 55 / .32));transform-origin:21px 50%}",
  ".et-tag{position:relative;isolation:isolate;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px;min-height:76px;padding:12px 16px 12px 40px;color:var(--tinta);text-decoration:none;border-radius:0 16px 16px 0;transform-origin:21px 50%;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}",
  `.et-tag::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit;background:var(--cartao);-webkit-mask:${MASCARA};-webkit-mask-composite:source-in,source-in;mask:${MASCARA};mask-composite:intersect}`,
  ".et-ico{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--icobg);color:var(--ico)}",
  ".et-txt{display:grid;gap:2px;min-width:0}",
  ".et-rot{font-size:17px;font-weight:700;letter-spacing:-.01em;line-height:1.2}",
  ".et-sub{font-size:13.5px;color:var(--tinta2);line-height:1.3}",
  ".lk svg.et-seta{width:20px;height:20px;color:var(--seta);stroke-width:2.4}",
  ".et-tag--prin{color:var(--printinta);min-height:88px}",
  ".et-tag--prin::before{background:var(--prin)}",
  ".et-tag--prin .et-rot{font-size:18.5px}",
  ".et-tag--prin .et-sub,.lk .et-tag--prin svg.et-seta{color:var(--printinta)}",
  ".et-tag--prin .et-ico{background:rgb(0 0 0 / .1);color:var(--printinta);border-radius:50%}",
  ".lk .et-ico--zap,.lk .et-tag--prin .et-ico--zap{background:#25D366;color:#fff;border-radius:50%}",
  ".et-capas{display:flex;flex:none}",
  ".et-capas img{width:32px;height:42px;object-fit:cover;border-radius:7px;border:2px solid #fff;margin-left:-14px;box-shadow:0 4px 10px -4px rgb(10 30 55 / .5)}",
  ".et-capas img:first-child{margin-left:0;rotate:-6deg}",
  ".et-capas img:last-child{rotate:6deg}",
  ".et-abre[open] svg.et-seta{transform:rotate(90deg)}",
  ".et-caminho{margin:10px 0 0 34px;padding:14px;border-radius:16px;background:var(--papel);color:var(--tinta);display:grid;gap:12px}",
  ".et-caminho img{width:100%;height:auto;aspect-ratio:4/3;object-fit:cover;object-position:50% 30%;border-radius:12px}",
  ".et-caminho address{font-style:normal;font-size:14px;line-height:1.45;white-space:pre-line}",
  ".et-hora{font-size:13px}",
  ".et-mapa{display:flex;align-items:center;justify-content:center;gap:8px;min-height:48px;border-radius:12px;background:var(--fundo2);color:var(--on);font-weight:600;text-decoration:none}",
  ".et-mapa svg.i{width:18px;height:18px}",
  ".et-confere{position:relative;background:var(--papel);color:var(--tinta);border-radius:16px;padding:20px 18px 18px;display:grid;gap:12px}",
  '.et-confere::before{content:"";position:absolute;left:14px;right:14px;top:9px;border-top:2px dashed var(--linha)}',
  ".et-confere h2{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--ico);font-weight:700;margin-top:4px}",
  ".et-confere ul{display:grid;gap:10px}",
  ".et-confere li{display:grid;grid-template-columns:22px minmax(0,1fr);gap:10px;font-size:14.5px;line-height:1.4}",
  ".et-confere li svg.i{width:20px;height:20px;color:var(--ico);margin-top:1px}",
  ".et-confere b{font-weight:600}",
  ".et-cnpj{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:6px}",
  ".et-cnpj>span{font-variant-numeric:tabular-nums;font-weight:600}",
  ".et-copiar{font-size:12.5px;font-weight:600;line-height:1;color:var(--ico);background:var(--icobg);border:0;border-radius:999px;min-height:44px;padding:0 14px;cursor:pointer}",
  ".et-confere :focus-visible,.et-caminho :focus-visible{outline-color:var(--tinta)}",
  ".et-rodape{display:grid;justify-items:center;gap:8px;text-align:center;font-size:13px;color:var(--on2)}",
  ".et-rodape small{font-size:11.5px}",
  "@media (prefers-reduced-motion:no-preference){",
  ".et-tag{transition:transform .45s cubic-bezier(.22,1,.36,1)}",
  ".et-tag:active{transform:rotate(-2.4deg) scale(.99);transition-duration:.12s}",
  ".lk svg.et-seta{transition:transform .3s cubic-bezier(.22,1,.36,1)}",
  ".lk-entra .et-fio>li{animation:et-assenta .9s cubic-bezier(.22,1,.36,1) both}",
  atrasos(".lk-entra .et-fio>li", 0, 70),
  ".et-tag.lk-toque{animation:et-balanca .8s cubic-bezier(.22,1,.36,1)}",
  "}",
  // hover só onde existe ponteiro: no celular o :hover gruda depois do toque
  "@media (prefers-reduced-motion:no-preference) and (hover:hover){.et-tag:hover{transform:rotate(-1.2deg)}}",
  "@keyframes et-assenta{0%{transform:rotate(7deg) translateY(10px)}55%{transform:rotate(-2deg)}100%{transform:none}}",
  "@keyframes et-balanca{0%{transform:rotate(-7deg)}28%{transform:rotate(4deg)}56%{transform:rotate(-1.8deg)}80%{transform:rotate(.6deg)}100%{transform:none}}",
].join("");

// `SIZES_*`, `MASCARA` e as classes `et-*` são constantes do modelo; texto do lojista só passa por `escapeHtml`.
const SIZES_CAPA = "(max-width: 492px) calc(100vw - 32px), 460px";
const SIZES_CAMINHO = "(max-width: 492px) calc(100vw - 94px), 398px";

function etiquetaDoLink(v: LinkVisivel, c: ContextoRender): string {
  const l = v.link;
  const sub = l.sub ? `<span class="et-sub">${escapeHtml(l.sub)}</span>` : "";
  const texto = `<span class="et-txt"><span class="et-rot">${escapeHtml(l.titulo)}</span>${sub}</span>`;
  const seta = icone("seta", "i et-seta");
  if (l.tipo === "endereco") {
    return detalhesDoEndereco(v, c, {
      prefixo: "et",
      classeDoResumo: "et-tag",
      resumo: `<span class="et-ico">${icone(l.icone)}</span>${texto}${seta}`,
      foto: { largura: 640, altura: 480, sizes: SIZES_CAMINHO },
    });
  }
  const fotos = l.tipo === "link" ? l.fotos : [];
  const miniaturas = fotos
    .map((f) => imagem(f, { largura: 32, altura: 42, sizes: "32px", alt: "", carregamento: "lazy", larguras: LARGURA_MINIATURA }))
    .join("");
  const lado = miniaturas
    ? `<span class="et-capas" aria-hidden="true">${miniaturas}</span>`
    : `<span class="et-ico${l.icone === "whatsapp" ? " et-ico--zap" : ""}">${icone(l.icone)}</span>`;
  return `<a class="et-tag${v.principal ? " et-tag--prin" : ""}"${hrefAttr(v.href, c.modo)}${dadosDoLink(v)}>${lado}${texto}${seta}</a>`;
}

function rodape(c: ContextoRender): string {
  const doc = c.d.documento;
  const insta = doc.perfil.instagram ? `<span>Instagram @${escapeHtml(doc.perfil.instagram)}</span>` : "";
  const numero = cnpjDaLoja(doc);
  const cnpj = numero ? `<small>${escapeHtml(doc.perfil.nome)} · CNPJ ${numero}</small>` : "";
  const feito = feitoComGirumo(c);
  return insta || cnpj || feito ? `<footer class="et-rodape">${insta}${cnpj}${feito}</footer>` : "";
}

function corpo(c: ContextoRender): string {
  const doc = c.d.documento;
  const p = doc.perfil;
  const local = p.local ? escapeHtml(p.local) : "";
  const capa = p.capa
    ? imagem(p.capa, { largura: 640, altura: 512, sizes: SIZES_CAPA, alt: p.capaAlt, carregamento: "prioridade" })
    : "";
  const onde = local ? `<figcaption class="et-onde">${icone("mapa")}<span>${local}</span></figcaption>` : "";
  const vitrine = capa ? `<figure class="et-vitrine">${capa}${onde}</figure>` : "";
  const localSemFoto = !capa && local ? `<p class="et-local">${icone("mapa")}<span>${local}</span></p>` : "";
  const h1 = `<h1 class="et-nome">${conteudoDoH1(c, { classe: "et-logo", largura: 190, altura: 84, sizes: "190px" })}</h1>`;
  const frase = p.frase ? `<p class="et-frase">${escapeHtml(p.frase)}</p>` : "";
  const fatos = p.destaques.length
    ? `<ul class="et-fatos">${p.destaques.map((t) => `<li>${destaqueHtml(t)}</li>`).join("")}</ul>`
    : "";
  const lista = c.links.length
    ? `<ul class="et-fio" aria-label="Links da ${escapeHtml(p.nome)}">${c.links.map((v) => `<li>${etiquetaDoLink(v, c)}</li>`).join("")}</ul>`
    : "";
  return `<main class="et"><div class="et-col">${vitrine}<header class="et-marca">${h1}${frase}${localSemFoto}${fatos}</header>${lista}${blocoConfere(doc, "et")}${rodape(c)}</div></main>`;
}

export const etiqueta: ModeloRender = {
  fontes: FONTES_ETIQUETA,
  css: CSS_ETIQUETA,
  corDoTopo: (t) => t["--fundo2"] ?? "",
  fundoDoLogo: (t) => t["--fundo2"] ?? "",
  corpo,
};
