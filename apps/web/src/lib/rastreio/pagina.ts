/**
 * HTML das telas públicas do Rastreio do pedido (spec rastreio-pedidos §3.5): busca, lista
 * e pedido. Puro e montado à mão, como o /r/ e o /bio: todo texto de fora passa por
 * `escapeHtml`, todo `href`/`action` nasce aqui, o CSS vai num `<style>` com nonce (nenhum
 * atributo `style=`) e o único `<script>` é o do "Copiar", também com nonce.
 */

import { garante } from "@/lib/bio/cores";
import { escapeHtml } from "@/lib/campaigns/entry-page";
import { diaMesBR } from "@/lib/date-br";
import { nonceAttribute } from "@/lib/security/csp";

import type { LojaDoRastreio } from "./loja";
import type { Etapa, PedidoPublico } from "./tipos";

export const NAO_ENCONTRADO = "Não encontramos pedido com esses dados. Confira o CPF/CNPJ e o celular.";
export const MUITAS_TENTATIVAS = "Muitas tentativas, tente daqui a pouco";
export const PEDIDO_NAO_ENCONTRADO = "Pedido não encontrado. Busque com o CPF/CNPJ e o celular da compra.";

export type ContextoDaPagina = { loja: Pick<LojaDoRastreio, "nome" | "corPrimaria" | "storeWhatsapp">; base: string; nonce: string | null };
export type Tela =
  | { tipo: "busca"; aviso: string | null }
  | { tipo: "lista"; pedidos: PedidoPublico[] }
  | { tipo: "pedido"; pedido: PedidoPublico; convite: string | null };
export type PassoDaLinha = { etapa: Etapa; estado: "feito" | "atual" | "falta"; quando: string | null };

const ROTULO: Record<Etapa, string> = {
  aguardando_pagamento: "Aguardando pagamento",
  confirmado: "Pedido confirmado",
  separando: "Em separação",
  enviado: "Enviado",
  retirada: "Pronto para retirada",
  problema: "Problema na entrega",
  entregue: "Entregue",
  cancelado: "Pedido cancelado",
};

const SELO: Record<Etapa, string> = { ...ROTULO, enviado: "A caminho" };

const FRASE: Record<Exclude<Etapa, "problema">, string> = {
  aguardando_pagamento: "A loja ainda espera a confirmação do pagamento.",
  confirmado: "Pagamento confirmado. A loja vai separar seu pedido.",
  separando: "A loja está separando seu pedido.",
  enviado: "Seu pedido está com a transportadora.",
  retirada: "Combine com a loja onde e quando retirar.",
  entregue: "Seu pedido foi entregue.",
  cancelado: "Este pedido foi cancelado. Dúvidas? Fale com a loja.",
};

const COR_PADRAO = "#14181C";

export function linhaDoTempo({ etapa, events }: Pick<PedidoPublico, "etapa" | "events">): PassoDaLinha[] {
  const quando = (e: Etapa): string | null => diaMesBR(events.find((x) => x.etapa === e)?.at) ?? null;
  if (etapa === "cancelado") {
    const antes = [...new Set(events.map((x) => x.etapa))].filter((e) => e !== "cancelado");
    return [...antes.map((e) => ({ etapa: e, estado: "feito" as const, quando: quando(e) })), { etapa, estado: "atual", quando: quando(etapa) }];
  }
  // Retirada no lugar de "enviado" quando o pedido passou por ela e não voltou a "enviado".
  const meio: Etapa = etapa === "retirada" || (etapa !== "enviado" && events.some((x) => x.etapa === "retirada")) ? "retirada" : "enviado";
  const trilho: Etapa[] = [
    ...(etapa === "aguardando_pagamento" ? ["aguardando_pagamento" as const] : []),
    "confirmado",
    "separando",
    meio,
    ...(etapa === "problema" ? ["problema" as const] : []),
    "entregue",
  ];
  const i = trilho.indexOf(etapa);
  return trilho.map((e, j) => ({ etapa: e, estado: j < i ? "feito" : j === i ? "atual" : "falta", quando: j <= i ? quando(e) : null }));
}

function urlHttp(u: string | null): string | null {
  if (!u) return null;
  try {
    const { protocol } = new URL(u);
    return protocol === "https:" || protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

function iniciais(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

function botaoWhats(numero: string | null): string {
  const digitos = (numero ?? "").replace(/\D/g, "");
  if (!digitos) return "";
  return `<a class="botao-whats" href="https://wa.me/${digitos}" target="_blank" rel="noopener noreferrer">Falar com a loja no WhatsApp</a>`;
}

function telaBusca(ctx: ContextoDaPagina, aviso: string | null): string {
  return `<main class="coluna">
<h1>Acompanhe seu pedido</h1>
<p class="sub">Digite o CPF ou CNPJ e os 4 últimos números do celular que você usou na compra.</p>
${aviso ? `<p class="aviso" role="alert">${escapeHtml(aviso)}</p>` : ""}
<form method="post" action="${escapeHtml(ctx.base)}" class="cartao">
<label for="documento">CPF ou CNPJ</label>
<input id="documento" name="documento" inputmode="text" autocapitalize="characters" spellcheck="false" autocomplete="off" required maxlength="20" placeholder="000.000.000-00">
<label for="celular">Últimos 4 números do celular</label>
<input id="celular" name="celular" inputmode="numeric" autocomplete="off" required maxlength="20" placeholder="0000" aria-describedby="celular-ajuda">
<span id="celular-ajuda" class="ajuda">O mesmo celular que você informou na compra.</span>
<button class="botao" type="submit">Ver meus pedidos</button>
</form>
<p class="nota">Aqui só aparece o andamento da entrega. Endereço, peças e valores ficam com a loja.</p>
<div class="dica"><p><strong>Recebeu o aviso no WhatsApp ou no e-mail?</strong></p><p>Toque no link da mensagem: abre direto, sem digitar nada.</p></div>
${botaoWhats(ctx.loja.storeWhatsapp)}
</main>`;
}

function telaLista(ctx: ContextoDaPagina, pedidos: PedidoPublico[]): string {
  const base = escapeHtml(ctx.base);
  const itens = pedidos
    .map((p) => {
      const dia = diaMesBR(p.orderCreatedAt);
      const quando = dia ? `feito em ${dia} · ` : "";
      return `<li><a href="${base}/${escapeHtml(p.linkToken)}"><span>Pedido nº ${escapeHtml(p.numero)}</span><span>${quando}${ROTULO[p.etapa]}</span></a></li>`;
    })
    .join("\n");
  return `<main class="coluna">
<a class="voltar" href="${base}">Buscar outro pedido</a>
<h1>Seus pedidos</h1>
<ul class="lista-pedidos">
${itens}
</ul>
${botaoWhats(ctx.loja.storeWhatsapp)}
</main>`;
}

function alertaDoProblema(p: PedidoPublico): string {
  const dia = diaMesBR(p.etapaAt);
  return `<div class="alerta" role="status"><p><strong>A transportadora não conseguiu entregar</strong></p><p>A entrega falhou${dia ? ` em ${dia}` : ""}. A loja já foi avisada e vai falar com você para combinar o que fazer.</p></div>`;
}

function cartaoDoEnvio(p: PedidoPublico): string {
  const url = urlHttp(p.trackingUrl);
  if (!p.shipmentService && !p.trackingCode && !url) return "";
  const codigo = p.trackingCode
    ? `<p class="rotulo">Código de rastreio</p><p class="linha-codigo"><span class="codigo">${escapeHtml(p.trackingCode)}</span><button class="copiar" type="button" data-copiar="${escapeHtml(p.trackingCode)}" hidden>Copiar</button></p>`
    : "";
  const historico = url
    ? `<a class="externo" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${p.etapa === "problema" ? "Ver o motivo no histórico da entrega" : "Ver o histórico completo da entrega"}</a>`
    : "";
  return `<section class="cartao envio"><h2>${escapeHtml(p.shipmentService ?? "Entrega")}</h2>${codigo}${historico}</section>`;
}

function telaPedido(ctx: ContextoDaPagina, p: PedidoPublico, convite: string | null): string {
  const dia = diaMesBR(p.orderCreatedAt);
  const problema = p.etapa === "problema";
  const whats = botaoWhats(ctx.loja.storeWhatsapp);
  const passos = linhaDoTempo(p)
    .map(
      (s) =>
        `<li class="${s.estado}"${s.estado === "atual" ? ' aria-current="step"' : ""}><span class="rotulo-etapa">${ROTULO[s.etapa]}</span>${s.quando ? `<span class="dia">${s.quando}</span>` : ""}</li>`,
    )
    .join("\n");
  const linkConvite = urlHttp(convite);
  const vip =
    linkConvite && !problema && p.etapa !== "cancelado"
      ? `<section class="cartao vip"><h2>As novidades saem primeiro no grupo VIP</h2><p>Lançamentos e reposições aparecem lá antes do site.</p><a class="botao" href="${escapeHtml(linkConvite)}">Entrar no grupo VIP</a></section>`
      : "";
  return `<main class="coluna">
<a class="voltar" href="${escapeHtml(ctx.base)}">Buscar outro pedido</a>
<section class="pedido-cab">
<h1>Pedido nº ${escapeHtml(p.numero)}</h1>
${dia ? `<p class="sub">feito em ${dia}</p>` : ""}
<span class="etiqueta">${SELO[p.etapa]}</span>
${problema ? `${alertaDoProblema(p)}${whats}` : `<p class="frase">${FRASE[p.etapa as Exclude<Etapa, "problema">]}</p>`}
</section>
<section class="cartao"><h2>Andamento</h2><ol class="linha">
${passos}
</ol></section>
${cartaoDoEnvio(p)}
${problema ? "" : whats}
${vip}
</main>`;
}

const SCRIPT_COPIAR =
  'for(const b of document.querySelectorAll("[data-copiar]")){b.hidden=false;b.addEventListener("click",()=>navigator.clipboard.writeText(b.dataset.copiar).then(()=>{b.textContent="Copiado"}))}';

const CSS = `@font-face{font-family:"Manrope";src:url("/fonts/bio/manrope/manrope-latin.woff2") format("woff2");font-weight:200 800;font-display:swap}
@font-face{font-family:"IBM Plex Mono";src:url("/fonts/bio/ibm-plex-mono/ibm-plex-mono-latin-500.woff2") format("woff2");font-weight:500;font-display:swap}
*{box-sizing:border-box}
body{margin:0;background:#F4F6F8;color:#14181C;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.topo,.coluna,.rodape{max-width:480px;margin:0 auto;padding:16px}
.topo{display:flex;align-items:center;gap:10px}
.selo-loja{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;background:var(--cor);color:var(--sobre-cor);font:800 15px "Manrope",sans-serif}
.nome-loja{font:800 17px "Manrope",sans-serif}
h1,h2{font-family:"Manrope",sans-serif;font-weight:800;margin:0 0 8px}
h1{font-size:26px;line-height:1.2}
h2{font-size:18px}
.sub,.nota,.ajuda,.rotulo,.dia,.rodape{color:#4F5A64}
.cartao{background:#FFFFFF;border:1px solid #E3E7EB;border-radius:16px;padding:20px;margin:16px 0}
form.cartao{display:flex;flex-direction:column;gap:8px}
label{font-weight:600}
input{height:48px;border:1px solid #B9C2CA;border-radius:10px;padding:0 14px;font:inherit;color:inherit;background:#FFFFFF}
input:focus{outline:2px solid var(--cor);outline-offset:1px}
.ajuda,.nota,.rodape{font-size:14px}
.botao,.botao-whats{display:flex;align-items:center;justify-content:center;min-height:48px;border-radius:10px;border:0;padding:0 18px;font:700 16px system-ui,sans-serif;text-decoration:none;cursor:pointer}
.botao{background:var(--cor);color:var(--sobre-cor);margin-top:8px}
.botao-whats{background:#FFFFFF;color:#14181C;border:1px solid #B9C2CA;margin:16px 0}
.aviso{background:#FDECE3;color:#6E2706;border-radius:10px;padding:12px 14px}
.dica{border:1px dashed #B9C2CA;border-radius:16px;padding:14px 16px}
.dica p{margin:0}
.voltar{display:inline-flex;align-items:center;min-height:44px;color:#14181C}
.pedido-cab{margin:8px 0 16px}
.etiqueta{display:inline-block;background:var(--cor);color:var(--sobre-cor);border-radius:999px;padding:4px 12px;font-weight:700;font-size:14px}
.alerta{background:#FDECE3;color:#6E2706;border-radius:10px;padding:12px 14px;margin-top:12px}
.alerta p{margin:0}
.linha{list-style:none;margin:0;padding:0}
.linha li{position:relative;display:flex;justify-content:space-between;gap:12px;padding:0 0 18px 28px}
.linha li::before{content:"";position:absolute;left:0;top:4px;width:16px;height:16px;border-radius:50%;box-sizing:border-box}
.linha li.feito::before{background:var(--cor)}
.linha li.atual::before{border:6px solid var(--cor);background:#FFFFFF}
.linha li.falta::before{background:#D5DBE0}
.linha li.falta{color:#4F5A64}
.linha li.atual .rotulo-etapa{font-weight:700}
.rotulo{margin:0;font-size:14px}
.linha-codigo{display:flex;align-items:center;gap:10px;margin:4px 0 12px}
.codigo{font:500 17px "IBM Plex Mono",ui-monospace,monospace;word-break:break-all}
.copiar{min-height:44px;min-width:44px;border:1px solid #B9C2CA;border-radius:10px;background:#FFFFFF;font:600 14px system-ui,sans-serif;cursor:pointer}
.externo{display:inline-flex;align-items:center;min-height:44px;color:#14181C}
`;

// Só na tela da lista: a classe não aparece no HTML das outras.
const CSS_LISTA = `.lista-pedidos{list-style:none;margin:16px 0;padding:0;display:flex;flex-direction:column;gap:10px}
.lista-pedidos a{display:flex;flex-direction:column;min-height:44px;background:#FFFFFF;border:1px solid #E3E7EB;border-radius:16px;padding:16px;color:#14181C;text-decoration:none}
.lista-pedidos a span+span{color:#4F5A64;font-size:14px}
`;

function corDaLoja(cor: string | null): string {
  return cor && /^#[0-9a-fA-F]{6}$/.test(cor) ? cor : COR_PADRAO;
}

export function renderPagina(ctx: ContextoDaPagina, tela: Tela): string {
  const nome = escapeHtml(ctx.loja.nome);
  const cor = corDaLoja(ctx.loja.corPrimaria);
  const corpo =
    tela.tipo === "busca" ? telaBusca(ctx, tela.aviso) : tela.tipo === "lista" ? telaLista(ctx, tela.pedidos) : telaPedido(ctx, tela.pedido, tela.convite);
  const comCopiar = tela.tipo === "pedido" && tela.pedido.trackingCode;
  return `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Acompanhe seu pedido · ${nome}</title>
<link rel="icon" href="data:,">
<style${nonceAttribute(ctx.nonce)}>${CSS}${tela.tipo === "lista" ? CSS_LISTA : ""}:root{--cor:${cor};--sobre-cor:${garante("#FFFFFF", cor, 4.5)}}</style>
</head><body>
<header class="topo"><span class="selo-loja" aria-hidden="true">${escapeHtml(iniciais(ctx.loja.nome))}</span><span class="nome-loja">${nome}</span></header>
${corpo}
<footer class="rodape"><p>${nome} · rastreio feito com Girumo</p></footer>
${comCopiar ? `<script${nonceAttribute(ctx.nonce)}>${SCRIPT_COPIAR}</script>` : ""}
</body></html>`;
}
