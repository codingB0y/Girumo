/**
 * Modelo Romaneio: a nota que vai junto com o fardo do atacado. Papel com borda
 * serrilhada que "imprime" na entrada, itens numerados com pontilhado, botão
 * principal carimbado (de novo no toque), código de barras no fim; não usa a
 * foto. Valores do mockup (Main.dc.html, prefixo `rm-`) com as regras da
 * revisão: a serrilha fica no ::before do papel (nada focável é recortado), h1 =
 * nome da loja, fora do papel o anel de foco é `--foco-fora`, alvos ≥ 44 px,
 * números, rótulo e código de barras fora da árvore de acessibilidade.
 */
import type { DocumentoBio } from "@/lib/bio/documento";
import { escapeHtml } from "@/lib/campaigns/entry-page";
import type { ContextoRender, FonteDoModelo, LinkVisivel, ModeloRender } from "./modelo";
import {
  LARGURA_MINIATURA,
  atrasos,
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

const FONTES_ROMANEIO: readonly FonteDoModelo[] = ["400", "500", "600", "700"].map((peso) => ({
  familia: "IBM Plex Mono",
  arquivo: `ibm-plex-mono/ibm-plex-mono-latin-${peso}.woff2`,
  peso,
  estilo: "normal",
}));

const SERRILHA =
  "conic-gradient(from 135deg at top,#0000,#000 1deg 89deg,#0000 90deg) top/18px 51% repeat-x,conic-gradient(from -45deg at bottom,#0000,#000 1deg 89deg,#0000 90deg) bottom/18px 51% repeat-x";
const CORTE = '<hr class="rm-corte" aria-hidden="true">';
const SIZES_CAMINHO = "(max-width: 448px) calc(100vw - 98px), 350px";

export const CSS_ROMANEIO = [
  '.lk{font-family:"IBM Plex Mono",ui-monospace,monospace}',
  ".rm{background-color:var(--fundo2);background-image:radial-gradient(circle at 18% 8%,var(--fundo1) 0,transparent 46%),radial-gradient(circle at 92% 86%,var(--fundo3) 0,transparent 52%);color:var(--on);font-size:15px;line-height:1.5;padding:26px 14px 30px;overflow-x:clip}",
  ".rm-sombra{max-width:420px;margin:0 auto;filter:drop-shadow(0 18px 28px rgb(0 0 0 / .26))}",
  ".rm-papel{position:relative;isolation:isolate;color:var(--tinta);padding:34px 20px 40px}",
  `.rm-papel::before{content:"";position:absolute;inset:0;z-index:-1;background:var(--papel);-webkit-mask:${SERRILHA};mask:${SERRILHA}}`,
  ".rm-topo{display:grid;justify-items:center;gap:10px;text-align:center}",
  ".rm-nome{font-size:20px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;line-height:1.25;max-width:22ch}",
  ".rm-logo{width:150px;height:67px;object-fit:contain}",
  ".lk-placa .rm-logo{width:120px;height:53px}",
  ".rm-frase{font-size:14px;line-height:1.5;max-width:32ch}",
  ".rm-local{font-size:11.5px;line-height:1.45;color:var(--tinta2);text-transform:uppercase;letter-spacing:.06em;max-width:36ch}",
  ".rm-corte{border:0;border-top:2px dashed var(--linha);margin:18px 0}",
  ".rm-fatos{display:grid;gap:7px;font-size:13.5px;line-height:1.4}",
  ".rm-fatos li{display:grid;grid-template-columns:18px minmax(0,1fr);gap:8px;align-items:start}",
  ".rm-fatos svg.i{width:16px;height:16px;margin-top:2px;stroke-width:2.6}",
  ".rm-fatos b{font-weight:700}",
  ".rm-rotulo{display:flex;justify-content:space-between;font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--tinta2);margin:0 0 4px}",
  ".rm-itens{display:grid;gap:2px}",
  ".rm-linha{display:grid;grid-template-columns:30px minmax(0,auto) minmax(14px,1fr) auto;align-items:baseline;column-gap:6px;row-gap:2px;min-height:58px;padding:10px 8px;margin:0 -8px;border-radius:6px;color:var(--tinta);text-decoration:none;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}",
  ".rm-n{font-size:12.5px;color:var(--tinta2);font-variant-numeric:tabular-nums}",
  ".rm-t{font-size:15px;font-weight:600;line-height:1.3}",
  ".rm-pontos{align-self:end;border-bottom:2px dotted var(--linha);margin-bottom:7px;min-width:14px}",
  ".rm-seta{font-weight:700}",
  ".rm-sub{grid-column:2 / -1;font-size:12.5px;color:var(--tinta2);line-height:1.4}",
  ".rm-linha:active,.rm-linha.lk-toque,.rm-abre[open]>summary.rm-linha{background:var(--tinta);color:var(--papel)}",
  ":is(.rm-linha:active,.rm-linha.lk-toque,.rm-abre[open]>summary) :is(.rm-n,.rm-sub){color:var(--papel)}",
  ".rm-mini{grid-column:2 / -1;display:flex;gap:6px;margin-top:6px}",
  ".rm-mini img{width:38px;height:46px;object-fit:cover;border-radius:4px;filter:grayscale(.15)}",
  ".rm-carimbo{position:relative;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:12px;margin:12px 6px 16px;padding:14px 16px;border:3px solid var(--acento);border-radius:10px;color:var(--acento);background:var(--papel);text-decoration:none;transform:rotate(-2deg);cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}",
  '.rm-carimbo::before{content:"";position:absolute;inset:4px;border:1.5px solid var(--acento);border-radius:6px;opacity:.55;pointer-events:none}',
  ".rm-ctxt{display:grid;gap:4px;min-width:0}",
  ".rm-crot{font-size:17px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;line-height:1.15}",
  ".rm-csub{font-size:12.5px;font-weight:500;line-height:1.35;color:var(--tinta2)}",
  ".lk .rm-carimbo svg.i{width:30px;height:30px}",
  ".rm-abre .rm-caminho{display:grid;gap:10px;padding:12px 0 8px 30px;font-size:13.5px}",
  ".rm-caminho img{width:100%;height:auto;aspect-ratio:16/10;object-fit:cover;object-position:50% 30%;filter:grayscale(.2) contrast(1.05)}",
  ".rm-caminho address{font-style:normal;white-space:pre-line;line-height:1.5}",
  ".rm-hora{color:var(--tinta2);font-size:12.5px}",
  ".rm-mapa{display:inline-flex;align-items:center;gap:8px;min-height:44px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;font-size:13px;color:var(--tinta);text-decoration:underline;text-underline-offset:4px}",
  ".rm-confere h2{font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;margin-bottom:10px}",
  ".rm-confere ul{display:grid;gap:10px;font-size:13.5px;line-height:1.45}",
  ".rm-confere li{display:grid;grid-template-columns:16px minmax(0,1fr);gap:8px}",
  ".rm-confere b{font-weight:700}",
  ".rm-cnpj{display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;margin-top:4px}",
  ".rm-copiar{background:none;border:0;border-bottom:2px solid currentColor;color:var(--tinta);font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;min-height:44px;padding:6px 2px 2px;cursor:pointer}",
  ".rm-fim{display:grid;justify-items:center;gap:8px;text-align:center;font-size:12.5px}",
  ".rm-fim strong{font-size:13px;letter-spacing:.1em;text-transform:uppercase}",
  ".rm-barras{width:78%;height:44px;background:repeating-linear-gradient(90deg,var(--tinta) 0 2px,transparent 2px 4px,var(--tinta) 4px 5px,transparent 5px 8px,var(--tinta) 8px 11px,transparent 11px 13px,var(--tinta) 13px 14px,transparent 14px 17px)}",
  ".rm-fora{max-width:420px;margin:18px auto 0;display:grid;justify-items:center;gap:8px;text-align:center;font-size:12.5px;color:var(--on2)}",
  // o fundo da página é um degradê de fundo1–fundo3: o selo leva o fundo2 junto (on2/fundo2 é par garantido)
  ".rm-fora .lk-feito{background:var(--fundo2)}",
  ".rm-fora :focus-visible{outline-color:var(--foco-fora)}",
  // inversão no hover só onde existe ponteiro: no celular o :hover gruda depois do toque
  "@media (hover:hover){.rm-linha:hover{background:var(--tinta);color:var(--papel)}.rm-linha:hover :is(.rm-n,.rm-sub){color:var(--papel)}}",
  "@media (prefers-reduced-motion:no-preference){",
  ".rm-linha{transition:background-color .15s,color .15s}",
  ".rm-carimbo:active{transform:rotate(-2deg) scale(.98)}",
  // backwards: depois de impresso não fica clip-path nenhum no papel
  ".lk-entra .rm-papel{animation:rm-imprime 1.2s cubic-bezier(.3,.75,.25,1) backwards}",
  ".lk-entra .rm-itens>li{animation:rm-linha .45s cubic-bezier(.22,1,.36,1) both}",
  atrasos(".rm-itens>li", 550, 80),
  // o carimbo da entrada vai no <li> (0,3,1) e vence os atrasos (0,2,1) em qualquer ordem;
  // o do toque, no <a>: os dois nunca brigam pelo mesmo animation-name
  ".lk-entra .rm-itens>li.rm-li-prin{animation:rm-carimba .55s 1.15s cubic-bezier(.16,1,.3,1) both}",
  ".rm-carimbo.lk-toque{animation:rm-recarimba .5s cubic-bezier(.16,1,.3,1)}",
  "}",
  "@keyframes rm-imprime{from{clip-path:inset(0 0 100% 0);transform:translateY(-12px)}to{clip-path:inset(0);transform:none}}",
  "@keyframes rm-linha{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:none}}",
  "@keyframes rm-carimba{0%{opacity:0;transform:rotate(-12deg) scale(1.7)}72%{opacity:1;transform:scale(.96)}100%{opacity:1;transform:none}}",
  "@keyframes rm-recarimba{0%{transform:rotate(-2deg) scale(1.12)}60%{transform:rotate(-2deg) scale(.96)}100%{transform:rotate(-2deg)}}",
].join("");

function itemDaLista(v: LinkVisivel, c: ContextoRender, numero: string): string {
  const l = v.link;
  const titulo = escapeHtml(l.titulo);
  const destino = `${hrefAttr(v.href, c.modo)}${dadosDoLink(v)}`;
  if (v.principal) {
    const sub = l.sub ? `<span class="rm-csub">${escapeHtml(l.sub)}</span>` : "";
    return `<li class="rm-li-prin"><a class="rm-carimbo"${destino}>${icone(l.icone)}<span class="rm-ctxt"><span class="rm-crot">${titulo}</span>${sub}</span></a></li>`;
  }
  const sub = l.sub ? `<span class="rm-sub">${escapeHtml(l.sub)}</span>` : "";
  const linha = (seta: string) =>
    `<span class="rm-n" aria-hidden="true">${numero}</span><span class="rm-t">${titulo}</span><span class="rm-pontos" aria-hidden="true"></span><span class="rm-seta" aria-hidden="true">${seta}</span>${sub}`;
  if (l.tipo === "endereco") {
    const caminho = detalhesDoEndereco(v, c, {
      prefixo: "rm",
      classeDoResumo: "rm-linha",
      resumo: linha("↓"),
      foto: { largura: 640, altura: 400, sizes: SIZES_CAMINHO },
      mapa: 'Abrir no Google Maps <span aria-hidden="true">→</span>',
    });
    return `<li>${caminho}</li>`;
  }
  const fotos = (l.tipo === "link" ? l.fotos : [])
    .map((f) => imagem(f, { largura: 38, altura: 46, sizes: "38px", alt: "", carregamento: "lazy", larguras: LARGURA_MINIATURA }))
    .join("");
  const mini = fotos ? `<span class="rm-mini" aria-hidden="true">${fotos}</span>` : "";
  return `<li><a class="rm-linha"${destino}>${linha("→")}${mini}</a></li>`;
}

/** Itens numerados 01, 02… na ordem da página; o principal (carimbo) não leva número. */
function itens(c: ContextoRender): string {
  let n = 0;
  return c.links.map((v) => itemDaLista(v, c, v.principal ? "" : String(++n).padStart(2, "0"))).join("");
}

/** O "confere" do Romaneio: travessão no lugar do ícone, mesmas regras do `blocoConfere`. */
function confere(doc: DocumentoBio): string {
  const cf = doc.confere;
  if (!cf.ativo) return "";
  const cnpj = cnpjDaLoja(doc);
  const linhas: string[] = [];
  if (cf.razao && cnpj) {
    linhas.push(
      `<li><span aria-hidden="true">—</span><span>Pix só no nome <b>${escapeHtml(cf.razao)}</b><span class="rm-cnpj"><span>CNPJ ${cnpj}</span><button type="button" class="rm-copiar" data-copiar="${cf.cnpj}">Copiar CNPJ</button></span></span></li>`,
    );
  }
  for (const linha of cf.linhas) {
    if (linha.trim()) linhas.push(`<li><span aria-hidden="true">—</span><span>${escapeHtml(linha)}</span></li>`);
  }
  if (linhas.length === 0) return "";
  return `${CORTE}<section class="rm-confere" aria-labelledby="lk-confere"><h2 id="lk-confere">Antes de pagar, confere</h2><ul>${linhas.join("")}</ul></section>`;
}

/** Fim da nota: agradecimento, código de barras (decoração), @ e CNPJ. */
function fim(c: ContextoRender): string {
  const doc = c.d.documento;
  const insta = doc.perfil.instagram ? `<span>@${escapeHtml(doc.perfil.instagram)}</span>` : "";
  const cnpj = cnpjDaLoja(doc);
  return `${CORTE}<footer class="rm-fim"><strong>Obrigado pela preferência</strong><span class="rm-barras" aria-hidden="true"></span>${insta}${cnpj ? `<span>CNPJ ${cnpj}</span>` : ""}</footer>`;
}

function corpo(c: ContextoRender): string {
  const doc = c.d.documento;
  const p = doc.perfil;
  const h1 = `<h1 class="rm-nome">${conteudoDoH1(c, { classe: "rm-logo", largura: 150, altura: 67, sizes: "150px" })}</h1>`;
  const frase = p.frase ? `<p class="rm-frase">${escapeHtml(p.frase)}</p>` : "";
  const local = p.local ? `<p class="rm-local">${escapeHtml(p.local)}</p>` : "";
  const fatos = p.destaques.length
    ? `${CORTE}<ul class="rm-fatos">${p.destaques.map((t) => `<li>${icone("check")}<span>${destaqueHtml(t)}</span></li>`).join("")}</ul>`
    : "";
  const lista = c.links.length
    ? `${CORTE}<p class="rm-rotulo" aria-hidden="true"><span>Item</span><span>Abrir</span></p><ul class="rm-itens" aria-label="Links da ${escapeHtml(p.nome)}">${itens(c)}</ul>`
    : "";
  const papel = `<article class="rm-papel"><header class="rm-topo">${h1}${frase}${local}</header>${fatos}${lista}${confere(doc)}${fim(c)}</article>`;
  const feito = feitoComGirumo(c);
  return `<main class="rm"><div class="rm-sombra">${papel}</div>${feito ? `<footer class="rm-fora">${feito}</footer>` : ""}</main>`;
}

export const romaneio: ModeloRender = {
  fontes: FONTES_ROMANEIO,
  css: CSS_ROMANEIO,
  corDoTopo: (t) => t["--fundo2"] ?? "",
  fundoDoLogo: (t) => t["--papel"] ?? "",
  corpo,
};
