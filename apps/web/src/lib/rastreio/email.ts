/** E-mail de aviso do Rastreio com a cara da loja. Puro (sem server-only): uma prévia pode rodar no browser. */
import { escapeHtml as esc } from "@/lib/email/invite-copy";
import { derivePalette } from "@/lib/pages/palette";

import { linkDoPedido } from "./link";
import type { LojaDoRastreio } from "./loja";
import type { EtapaComAviso, PedidoInterno } from "./tipos";

const COR_NEUTRA = "#14181c";
const FONTE = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";

/** `#rrggbb` minúsculo e legível sobre branco; ausente ou inválida cai na neutra. Só isso chega ao `style`. */
export function corDaLoja(cor: string | null): string {
  return (cor ? derivePalette(cor)?.accent : null) ?? COR_NEUTRA;
}

type Copia = { assunto: string; titulo: string; intro: string; botao: string; terceiro: string; feitos: number };

function copiaDa(etapa: EtapaComAviso, n: string, loja: string, servico: string | null): Copia {
  const sv = servico ? ` (${servico})` : "";
  switch (etapa) {
    case "confirmado":
      return { assunto: `Recebemos o pagamento do pedido nº ${n}`, titulo: "Pagamento confirmado", intro: `Recebemos o pagamento do pedido nº ${n} da ${loja}.`, botao: "Acompanhar pedido", terceiro: "Enviado", feitos: 0 };
    case "enviado":
      return { assunto: `Seu pedido nº ${n} foi enviado`, titulo: "Seu pedido está a caminho", intro: `Seu pedido nº ${n} da ${loja} foi enviado${sv}.`, botao: "Acompanhar pedido", terceiro: "Enviado", feitos: 2 };
    case "retirada":
      return { assunto: `Seu pedido nº ${n} está pronto para retirada`, titulo: "Seu pedido está pronto para retirada", intro: `Seu pedido nº ${n} da ${loja} está pronto para retirada. Combine com a loja onde e quando retirar.`, botao: "Ver o pedido", terceiro: "Retirada", feitos: 2 };
    case "problema":
      return { assunto: `Problema na entrega do pedido nº ${n}`, titulo: "A entrega não foi concluída", intro: `A transportadora não conseguiu entregar o pedido nº ${n} da ${loja}. A loja já foi avisada e vai falar com você.`, botao: "Ver detalhes", terceiro: "Problema", feitos: 2 };
    case "entregue":
      return { assunto: `Seu pedido nº ${n} foi entregue`, titulo: "Seu pedido foi entregue", intro: `Seu pedido nº ${n} da ${loja} foi entregue. Se alguma peça não estiver certa, fale com a loja.`, botao: "Ver o pedido", terceiro: "Enviado", feitos: 4 };
  }
}

function iniciais(nome: string): string {
  const letras = nome.split(/\s+/).map((p) => p.match(/\p{L}/u)?.[0]).filter((l): l is string => !!l);
  return letras.slice(0, 2).join("").toUpperCase() || "•";
}

function passo(rotulo: string, indice: number, feitos: number, cor: string): string {
  const feito = indice < feitos;
  const atual = indice === feitos;
  const estilo = feito
    ? `background:${cor};color:#ffffff;border:2px solid ${cor}`
    : atual
      ? `background:#ffffff;color:${cor};border:2px solid ${cor}`
      : "background:#ffffff;color:#9aa3ab;border:2px solid #d5dade";
  return `<td align="center" width="25%" style="padding:0 2px;font-family:${FONTE}">
<div style="width:26px;height:26px;line-height:22px;border-radius:13px;font-size:13px;font-weight:700;text-align:center;${estilo}">${feito ? "&#10003;" : "&nbsp;"}</div>
<div style="margin-top:6px;font-size:12px;color:${feito || atual ? "#14181c" : "#9aa3ab"}">${esc(rotulo)}</div></td>`;
}

export function montarEmailDoAviso(
  loja: LojaDoRastreio,
  pedido: PedidoInterno,
  etapa: EtapaComAviso,
  convite: { url: string } | null,
): { subject: string; html: string; text: string } {
  const cor = corDaLoja(loja.corPrimaria);
  const n = pedido.numero.replace(/\s+/g, " ").trim();
  const nomeLoja = loja.nome;
  const c = copiaDa(etapa, n, nomeLoja, pedido.shipmentService);
  const saudacao = pedido.buyerFirstName ? `Oi, ${pedido.buyerFirstName}!` : "Olá!";
  const link = linkDoPedido(loja, pedido.linkToken);
  const digitos = (loja.storeWhatsapp ?? "").replace(/\D/g, "");
  const wa = digitos.length >= 10 ? `https://wa.me/${digitos}` : null;
  const codigoRotulo = pedido.shipmentService ? `Código de rastreio · ${pedido.shipmentService}` : "Código de rastreio";

  const rotulos = ["Confirmado", "Separado", c.terceiro, "Entregue"];
  const andamento = rotulos.map((r, i) => passo(r, i, c.feitos, cor)).join("");

  const caixaCodigo = pedido.trackingCode
    ? `<tr><td style="padding:0 32px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f7;border-radius:8px"><tr><td style="padding:14px 16px;font-family:${FONTE}"><div style="font-size:12px;color:#5b656e">${esc(codigoRotulo)}</div><div style="margin-top:4px;font-family:Consolas,Menlo,monospace;font-size:16px;font-weight:700;color:#14181c">${esc(pedido.trackingCode)}</div></td></tr></table></td></tr>`
    : "";
  const blocoWa = wa
    ? `<tr><td align="center" style="padding:0 32px 24px;font-family:${FONTE};font-size:14px"><a href="${esc(wa)}" style="color:${cor};text-decoration:underline">Falar com a loja no WhatsApp</a></td></tr>`
    : "";
  const blocoVip = convite
    ? `<tr><td style="padding:0 32px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e3e7ea;border-radius:8px"><tr><td style="padding:14px 16px;font-family:${FONTE}"><div style="font-size:14px;font-weight:700;color:#14181c">As novidades saem primeiro no grupo VIP</div><div style="margin-top:2px;font-size:13px;color:#5b656e">Lançamentos e reposições aparecem lá antes do site.</div><div style="margin-top:8px;font-size:14px"><a href="${esc(convite.url)}" style="color:${cor};font-weight:700;text-decoration:underline">Entrar no grupo</a></div></td></tr></table></td></tr>`
    : "";

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.assunto)}</title></head>
<body style="margin:0;padding:0;background:#eef1f3">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f3"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border-radius:12px">
<tr><td style="padding:28px 32px 8px;font-family:${FONTE}"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td width="40" height="40" align="center" style="width:40px;height:40px;border-radius:20px;background:${cor};color:#ffffff;font-size:15px;font-weight:700">${esc(iniciais(nomeLoja))}</td>
<td style="padding-left:12px;font-size:16px;font-weight:700;color:#14181c">${esc(nomeLoja)}</td></tr></table></td></tr>
<tr><td style="padding:16px 32px 8px;font-family:${FONTE}"><h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#14181c">${esc(c.titulo)}</h1>
<p style="margin:0;font-size:15px;line-height:1.5;color:#2b333a">${esc(saudacao)} ${esc(c.intro)}</p></td></tr>
<tr><td style="padding:16px 32px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${andamento}</tr></table></td></tr>
${caixaCodigo}
<tr><td align="center" style="padding:0 32px 24px"><a href="${esc(link)}" style="display:inline-block;background:${cor};color:#ffffff;font-family:${FONTE};font-size:15px;font-weight:700;text-decoration:none;padding:13px 28px;border-radius:8px">${esc(c.botao)}</a></td></tr>
${blocoWa}
${blocoVip}
<tr><td style="padding:20px 32px 28px;border-top:1px solid #e3e7ea;font-family:${FONTE};font-size:12px;line-height:1.6;color:#6b757e">
<div>Você recebeu este e-mail porque comprou na ${esc(nomeLoja)}.</div>
<div>Não quer mais avisos deste pedido? <a href="${esc(link)}" style="color:#6b757e;text-decoration:underline">Parar avisos</a></div>
<div>Enviado pela Girumo em nome da ${esc(nomeLoja)}.</div></td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    c.titulo,
    `${saudacao} ${c.intro}`,
    pedido.trackingCode ? `${codigoRotulo}: ${pedido.trackingCode}` : null,
    `${c.botao}: ${link}`,
    wa ? `Falar com a loja no WhatsApp: ${wa}` : null,
    convite ? `As novidades saem primeiro no grupo VIP. Entrar no grupo: ${convite.url}` : null,
    `Você recebeu este e-mail porque comprou na ${nomeLoja}.`,
    `Não quer mais avisos deste pedido? Parar avisos: ${link}`,
    `Enviado pela Girumo em nome da ${nomeLoja}.`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");

  return { subject: c.assunto, html, text };
}
