import { after } from "next/server";

import { assinaturaBlingConfere, lerAviso, LIMITE_CORPO_AVISO, type AvisoBling } from "@/lib/bling/aviso";
import { credenciaisBling } from "@/lib/bling/oauth";
import { sincronizarLoja } from "@/lib/bling/sincronizar";
import { atualizarConexao, lerConexaoPorEmpresa } from "@/lib/stores/bling-conexoes";
import { enfileirarPedidos } from "@/lib/stores/bling-pedidos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** A drenagem do pedido avisado roda no `after()` desta resposta. */
export const maxDuration = 60;

/**
 * A drenagem leva até 45 s, e nunca além do que sobra dos 60 s da função menos 10 s (soltar a trava,
 * gravar o que chegou): o que a resposta já gastou conta. O que não couber, o cron pega.
 */
const ORCAMENTO_DO_AVISO_MS = 45_000;
const FOLGA_DA_FUNCAO_MS = 10_000;

const recebido = () => Response.json({ ok: true });
const grandeDemais = () => Response.json({ error: "corpo grande demais" }, { status: 413 });

/**
 * POST /api/integracoes/bling/webhook — aviso de pedido do Bling (spec §3 "Aviso"). Sem sessão
 * (PROVIDER_WEBHOOKS): quem autentica é o HMAC do corpo cru, conferido antes de qualquer banco.
 * Depois da assinatura, aviso que não dá para usar responde 200: 4xx repetido faz o Bling
 * desligar o webhook de TODAS as lojas. 500 só quando vale o Bling repetir (banco fora).
 * Nunca vai para log o corpo: só evento, empresa e pedido.
 */
export async function POST(req: Request): Promise<Response> {
  const inicio = Date.now();
  if (Number(req.headers.get("content-length")) > LIMITE_CORPO_AVISO) return grandeDemais();
  const segredo = credenciaisBling()?.clientSecret;
  if (!segredo) {
    console.error("[bling/webhook] sem BLING_CLIENT_ID/BLING_CLIENT_SECRET: aviso recusado com 503");
    return Response.json({ error: "indisponivel" }, { status: 503 });
  }
  const corpo = new Uint8Array(await req.arrayBuffer());
  if (corpo.byteLength > LIMITE_CORPO_AVISO) return grandeDemais();
  if (!assinaturaBlingConfere(corpo, req.headers.get("x-bling-signature-256"), segredo)) {
    // Se TODO aviso cair aqui, o secret da Vercel não é o do app no Bling.
    console.warn("[bling/webhook] assinatura não confere");
    return Response.json({ error: "assinatura" }, { status: 401 });
  }
  const json = lerJson(corpo);
  if (!json.ok) {
    console.error("[bling/webhook] aviso assinado, mas o corpo não é JSON");
    return recebido();
  }
  const lido = lerAviso(json.valor);
  if (!lido.ok) {
    console.warn(`[bling/webhook] aviso ignorado: ${lido.motivo}`);
    return recebido();
  }
  return registrar(lido.aviso, inicio);
}

/**
 * Medido quando o `after()` começa, não quando o aviso chegou: a vida que resta à função (o motor não
 * começa chamada com efeito que não cabe nela) e o orçamento da drenagem dentro dela.
 */
function prazosDoAviso(inicio: number): { orcamento: number; vida: number } {
  const vida = maxDuration * 1000 - (Date.now() - inicio);
  return { orcamento: Math.min(ORCAMENTO_DO_AVISO_MS, vida - FOLGA_DA_FUNCAO_MS), vida };
}

/** Só depois da assinatura: o decodificador tira o BOM, que entrou no HMAC. */
function lerJson(corpo: Uint8Array): { ok: true; valor: unknown } | { ok: false } {
  try {
    return { ok: true, valor: JSON.parse(new TextDecoder("utf-8").decode(corpo)) };
  } catch {
    return { ok: false };
  }
}

async function registrar(aviso: AvisoBling, inicio: number): Promise<Response> {
  try {
    const conexao = await lerConexaoPorEmpresa(aviso.empresaId);
    if (!conexao || conexao.status === "desconectada") {
      console.warn(`[bling/webhook] empresa ${aviso.empresaId} sem loja conectada`);
      return recebido();
    }
    // A fila guarda o pedido antes do 200: daqui em diante, perder o processo só atrasa.
    await enfileirarPedidos(conexao.tenantId, "aviso", [{ id: aviso.pedidoId }]);
    await atualizarConexao(conexao.tenantId, { last_webhook_at: new Date().toISOString() });
    after(() => {
      const { orcamento, vida } = prazosDoAviso(inicio);
      return sincronizarLoja(conexao.tenantId, "aviso", orcamento, vida);
    });
    return recebido();
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : String(e);
    console.error(`[bling/webhook] ${aviso.evento} empresa ${aviso.empresaId} pedido ${aviso.pedidoId}: ${mensagem}`);
    return Response.json({ error: "tente de novo" }, { status: 500 });
  }
}
