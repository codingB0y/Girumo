/**
 * Modelo Clássico: o formato que todo mundo conhece do link da bio — foto
 * redonda, nome, @, botões em pílula —, com um anel pulsando no principal.
 * Valores do mockup (Main.dc.html, prefixo `cl-`) com as regras da revisão: o
 * pulso anima só transform/opacity e dá no máximo 2 voltas, a foto redonda tem
 * zoom de 2,2× em volta do ponto de foco, sem opacity em texto, alvos ≥ 44 px,
 * h1 = nome da loja, nada de style=.
 */
import { escapeHtml } from "@/lib/campaigns/entry-page";
import type { ContextoRender, FonteDoModelo, LinkVisivel, ModeloRender } from "./modelo";
import {
  LARGURA_MINIATURA,
  atrasos,
  blocoConfere,
  cnpjDaLoja,
  dadosDoLink,
  destaqueHtml,
  detalhesDoEndereco,
  feitoComGirumo,
  hrefAttr,
  icone,
  imagem,
} from "./partes";

const FONTES_CLASSICO: readonly FonteDoModelo[] = [
  { familia: "Manrope", arquivo: "manrope/manrope-latin.woff2", peso: "200 800", estilo: "normal" },
];

/** 108 px de círculo com zoom de 2,2×: o que aparece pede ~238 px de imagem. */
const SIZES_AVATAR = "238px";
const SIZES_CAMINHO = "(max-width: 476px) calc(100vw - 64px), 412px";

export const CSS_CLASSICO = [
  '.lk{font-family:"Manrope",system-ui,sans-serif}',
  ".cl{background:var(--fundo2);color:var(--on);font-size:16px;line-height:1.45;padding:36px 18px 32px}",
  ".cl-col{max-width:440px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr);justify-items:center;text-align:center;gap:10px}",
  // --anel é decorativo (o contorno da foto, sem texto nem ícone): fica fora dos pares de contraste
  ".cl-avatar{width:108px;height:108px;border-radius:50%;overflow:hidden;box-shadow:0 0 0 3px var(--fundo2),0 0 0 6px var(--anel);margin-bottom:8px;background:var(--fundo3)}",
  // o zoom cresce em volta do foco: a classe lk-f-X-Y dá object-position e transform-origin
  ".cl-avatar img{width:100%;height:100%;object-fit:cover;transform:scale(2.2)}",
  ".cl-nome{font-size:21px;font-weight:800;letter-spacing:-.015em;line-height:1.2}",
  ".cl-arroba{font-size:14px;font-weight:600;color:var(--on2)}",
  ".cl-frase{font-size:15px;line-height:1.5;max-width:32ch}",
  ".cl-fatos{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin-top:4px}",
  ".cl-fatos li{font-size:12.5px;font-weight:600;padding:6px 11px;border-radius:999px;background:var(--chip);border:1px solid var(--chipbd)}",
  ".cl-fatos b{color:var(--acento);font-weight:800}",
  ".cl-lista{width:100%;display:grid;gap:12px;margin-top:14px}",
  ".cl-btn{position:relative;display:grid;grid-template-columns:48px minmax(0,1fr) 48px;align-items:center;gap:6px;min-height:64px;padding:8px;border-radius:999px;background:var(--cartao);color:var(--tinta);text-decoration:none;box-shadow:0 1px 2px rgb(0 0 0 / .06),0 10px 24px -18px rgb(0 0 0 / .5);cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}",
  ".cl-ico{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;background:var(--icobg);color:var(--ico)}",
  ".lk .cl-ico--zap,.lk .cl-btn--prin .cl-ico--zap{background:#25D366;color:#fff}",
  ".cl-txt{display:grid;gap:1px;justify-items:center;min-width:0}",
  ".cl-rot{font-size:16px;font-weight:700;line-height:1.25}",
  ".cl-sub{font-size:12.5px;font-weight:500;color:var(--tinta2);line-height:1.3}",
  ".cl-btn--prin{isolation:isolate;background:var(--prin);color:var(--printinta)}",
  ".cl-btn--prin .cl-sub,.cl-btn--prin .cl-dir{color:var(--printinta)}",
  ".cl-btn--prin .cl-ico{background:rgb(0 0 0 / .12);color:var(--printinta)}",
  // o anel do pulso: uma cópia da pílula atrás dela, que cresce e some (só transform/opacity)
  '.cl-btn--prin::after{content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit;background:var(--prin);opacity:0;pointer-events:none}',
  ".cl-capas{display:flex;justify-self:center}",
  // 3 × 28 px com 18 px de recuo = 48 px: cabem na coluna do ícone
  ".cl-capas img{width:28px;height:28px;border-radius:50%;object-fit:cover;border:2px solid var(--cartao);margin-left:-18px}",
  ".cl-capas img:first-child{margin-left:0}",
  ".cl-dir{display:grid;place-items:center;color:var(--seta)}",
  ".cl-abre[open] .cl-dir svg{transform:rotate(90deg)}",
  ".cl-caminho{margin-top:10px;background:var(--papel);color:var(--tinta);border-radius:22px;padding:14px;display:grid;gap:12px;text-align:left}",
  ".cl-caminho img{width:100%;height:auto;aspect-ratio:16/10;object-fit:cover;object-position:50% 30%;border-radius:14px}",
  ".cl-caminho address{font-style:normal;font-size:14px;line-height:1.5;white-space:pre-line}",
  ".cl-hora{font-size:13px;color:var(--tinta2)}",
  ".cl-mapa{display:flex;align-items:center;justify-content:center;gap:8px;min-height:48px;border-radius:999px;background:var(--prin);color:var(--printinta);font-weight:700;text-decoration:none}",
  ".cl-mapa svg.i{width:18px;height:18px}",
  ".cl-confere{width:100%;margin-top:6px;text-align:left;background:var(--papel);color:var(--tinta);border-radius:22px;padding:18px;display:grid;gap:12px;box-shadow:0 10px 24px -20px rgb(0 0 0 / .5)}",
  ".cl-confere h2{font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:800;color:var(--ico)}",
  ".cl-confere ul{display:grid;gap:10px}",
  ".cl-confere li{display:grid;grid-template-columns:22px minmax(0,1fr);gap:10px;font-size:14.5px;line-height:1.45}",
  ".cl-confere li svg.i{width:20px;height:20px;color:var(--ico);margin-top:1px}",
  ".cl-confere b{font-weight:700}",
  ".cl-cnpj{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:6px}",
  ".cl-cnpj>span{font-variant-numeric:tabular-nums;font-weight:700}",
  ".cl-copiar{font-size:12.5px;font-weight:700;color:var(--tinta);background:var(--icobg);border:0;border-radius:999px;min-height:44px;padding:0 14px;cursor:pointer}",
  ".cl-confere :focus-visible,.cl-caminho :focus-visible{outline-color:var(--tinta)}",
  ".cl-rodape{display:grid;justify-items:center;gap:8px;margin-top:10px;font-size:13px;color:var(--on2)}",
  ".cl-rodape small{font-size:11.5px}",
  "@media (prefers-reduced-motion:no-preference){",
  ".cl-btn{transition:transform .18s cubic-bezier(.22,1,.36,1)}",
  ".cl-btn:active,.cl-btn.lk-toque{transform:scale(.97)}",
  ".cl-dir svg{transition:transform .3s cubic-bezier(.22,1,.36,1)}",
  ".lk-entra .cl-avatar{animation:cl-pop .8s cubic-bezier(.16,1,.3,1) both}",
  ".lk-entra .cl-sobe{animation:cl-sobe .6s cubic-bezier(.16,1,.3,1) both}",
  // conta os .cl-sobe irmãos (não a posição na coluna): sem foto ou sem @ o escalonamento não escorrega
  ".lk-entra .cl-sobe+.cl-sobe{animation-delay:60ms}",
  ".lk-entra .cl-sobe+.cl-sobe+.cl-sobe{animation-delay:120ms}",
  ".lk-entra .cl-sobe+.cl-sobe+.cl-sobe+.cl-sobe{animation-delay:180ms}",
  ".lk-entra .cl-lista>li{animation:cl-sobe .55s cubic-bezier(.16,1,.3,1) both}",
  atrasos(".cl-lista>li", 250, 55),
  ".lk-entra .cl-btn--prin::after{animation:cl-pulso 2.2s 1.1s ease-out 2}",
  "}",
  "@keyframes cl-pop{from{opacity:0;transform:scale(.82)}to{opacity:1;transform:none}}",
  "@keyframes cl-sobe{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}",
  "@keyframes cl-pulso{from{opacity:.55;transform:none}to{opacity:0;transform:scale(1.09,1.5)}}",
].join("");

function botao(v: LinkVisivel, c: ContextoRender): string {
  const l = v.link;
  const sub = l.sub ? `<span class="cl-sub">${escapeHtml(l.sub)}</span>` : "";
  const texto = `<span class="cl-txt"><span class="cl-rot">${escapeHtml(l.titulo)}</span>${sub}</span>`;
  const dir = `<span class="cl-dir">${icone("seta")}</span>`;
  const ico = `<span class="cl-ico${l.icone === "whatsapp" ? " cl-ico--zap" : ""}">${icone(l.icone)}</span>`;
  if (l.tipo === "endereco") {
    return detalhesDoEndereco(v, c, {
      prefixo: "cl",
      classeDoResumo: "cl-btn",
      resumo: `${ico}${texto}${dir}`,
      foto: { largura: 640, altura: 400, sizes: SIZES_CAMINHO },
    });
  }
  const fotos = (l.tipo === "link" ? l.fotos : [])
    .map((f) => imagem(f, { largura: 30, altura: 30, sizes: "30px", alt: "", carregamento: "lazy", larguras: LARGURA_MINIATURA }))
    .join("");
  const lado = fotos ? `<span class="cl-capas" aria-hidden="true">${fotos}</span>` : ico;
  return `<a class="cl-btn${v.principal ? " cl-btn--prin" : ""}"${hrefAttr(v.href, c.modo)}${dadosDoLink(v)}>${lado}${texto}${dir}</a>`;
}

function rodape(c: ContextoRender): string {
  const cnpj = cnpjDaLoja(c.d.documento);
  const linhaDoCnpj = cnpj ? `<small>${escapeHtml(c.d.documento.perfil.nome)} · CNPJ ${cnpj}</small>` : "";
  const feito = feitoComGirumo(c);
  return linhaDoCnpj || feito ? `<footer class="cl-rodape">${linhaDoCnpj}${feito}</footer>` : "";
}

function corpo(c: ContextoRender): string {
  const doc = c.d.documento;
  const p = doc.perfil;
  const foto = p.capa
    ? imagem(p.capa, { largura: 108, altura: 108, sizes: SIZES_AVATAR, alt: p.capaAlt, carregamento: "prioridade" })
    : "";
  const avatar = foto ? `<div class="cl-avatar">${foto}</div>` : "";
  const arroba = p.instagram ? `<p class="cl-arroba cl-sobe">@${escapeHtml(p.instagram)}</p>` : "";
  const frase = p.frase ? `<p class="cl-frase cl-sobe">${escapeHtml(p.frase)}</p>` : "";
  const fatos = p.destaques.length
    ? `<ul class="cl-fatos cl-sobe">${p.destaques.map((t) => `<li>${destaqueHtml(t)}</li>`).join("")}</ul>`
    : "";
  const lista = c.links.length
    ? `<ul class="cl-lista" aria-label="Links da ${escapeHtml(p.nome)}">${c.links.map((v) => `<li>${botao(v, c)}</li>`).join("")}</ul>`
    : "";
  return `<main class="cl"><div class="cl-col">${avatar}<h1 class="cl-nome cl-sobe">${escapeHtml(p.nome)}</h1>${arroba}${frase}${fatos}${lista}${blocoConfere(doc, "cl")}${rodape(c)}</div></main>`;
}

export const classico: ModeloRender = {
  fontes: FONTES_CLASSICO,
  css: CSS_CLASSICO,
  corDoTopo: (t) => t["--fundo2"] ?? "",
  fundoDoLogo: (t) => t["--fundo2"] ?? "",
  corpo,
};
