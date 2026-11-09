import { after } from "next/server";
import { z } from "zod";

import { chaveDeIntegracoes } from "@/lib/security/secret-box";
import { atualizarConexaoYampi, lerConexaoYampiPorId } from "@/lib/stores/yampi-conexoes";
import { gravarEventoYampi } from "@/lib/stores/yampi-eventos";
import { assinaturaYampiConfere } from "@/lib/yampi/assinatura";
import { abrirSegredoDoAviso } from "@/lib/yampi/credenciais";
import { chaveDeDedupe, LIMITE_CORPO_AVISO, lerEnvelope } from "@/lib/yampi/envelope";
import { processarEventoYampi } from "@/lib/yampi/processar";
import type { ConexaoYampi } from "@/lib/yampi/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** O processamento do aviso roda no `after()` desta resposta. */
export const maxDuration = 60;

const recebido = () => Response.json({ ok: true });
const naoAutenticado = () => Response.json({ error: "assinatura" }, { status: 401 });
const grandeDemais = () => Response.json({ error: "corpo grande demais" }, { status: 413 });
const tenteDeNovo = () => Response.json({ error: "tente de novo" }, { status: 500 });

const idDaConexao = z.uuid();

/**
 * POST /api/integracoes/yampi/webhook?c=<id da conexão> — aviso da Yampi (spec, "Aviso da Yampi"). Sem sessão
 * (PROVIDER_WEBHOOKS): quem autentica é o HMAC do corpo cru com o segredo da conexão do `?c`. Nada de banco
 * antes de conferir o tamanho e o `c`; nada de JSON antes do HMAC. Qualquer falha de autenticidade é 401 sem
 * detalhe. Depois da assinatura, aviso que não dá para usar responde 200: a Yampi desliga o aviso depois de 30
 * falhas. 500 só quando vale a Yampi repetir (banco fora). Nunca vai para log o corpo, o segredo ou o telefone:
 * só o id da conexão e o evento.
 */
export async function POST(req: Request): Promise<Response> {
  if (Number(req.headers.get("content-length")) > LIMITE_CORPO_AVISO) return grandeDemais();
  const c = new URL(req.url).searchParams.get("c");
  if (!idDaConexao.safeParse(c).success || !c) return naoAutenticado();
  const chave = chaveDeIntegracoes();
  if (!chave) {
    console.error("[yampi/webhook] sem INTEGRATIONS_ENCRYPTION_KEY: aviso recusado com 503");
    return Response.json({ error: "indisponivel" }, { status: 503 });
  }
  const corpo = new Uint8Array(await req.arrayBuffer());
  if (corpo.byteLength > LIMITE_CORPO_AVISO) return grandeDemais();

  let conexao: ConexaoYampi | null;
  try {
    conexao = await lerConexaoYampiPorId(c);
  } catch (e) {
    console.error(`[yampi/webhook] conexão ${c}: leitura falhou: ${e instanceof Error ? e.message : String(e)}`);
    return tenteDeNovo();
  }
  if (!conexao || conexao.status === "desconectada" || !conexao.webhookSecretSelado) return naoAutenticado();

  let segredo: string;
  try {
    segredo = abrirSegredoDoAviso(conexao, chave);
  } catch {
    // A mensagem do secret-box é fixa, mas nem ela vai: o que importa é qual conexão.
    console.error(`[yampi/webhook] conexão ${conexao.id}: o segredo do aviso não abriu`);
    return tenteDeNovo();
  }
  if (!assinaturaYampiConfere(corpo, req.headers.get("x-yampi-hmac-sha256"), segredo)) {
    console.warn(`[yampi/webhook] assinatura não confere (conexão ${conexao.id})`);
    return naoAutenticado();
  }

  const json = lerJson(corpo);
  if (!json.ok) {
    console.error(`[yampi/webhook] aviso assinado, mas o corpo não é JSON (conexão ${conexao.id})`);
    return recebido();
  }
  const lido = lerEnvelope(json.valor);
  if (!lido.ok) {
    console.warn(`[yampi/webhook] aviso ignorado: ${lido.motivo} (conexão ${conexao.id})`);
    return recebido();
  }
  const { envelope } = lido;
  if (envelope.alias.toLowerCase() !== conexao.alias.toLowerCase()) {
    console.warn(`[yampi/webhook] alias do aviso não é o da conexão ${conexao.id}`);
    return naoAutenticado();
  }

  let gravado: { id: string } | null;
  try {
    gravado = await gravarEventoYampi({
      tenantId: conexao.tenantId,
      connectionId: conexao.id,
      event: envelope.evento,
      resourceId: envelope.recursoId,
      dedupeKey: chaveDeDedupe(conexao.id, corpo),
      payload: json.valor,
    });
  } catch {
    console.error(`[yampi/webhook] conexão ${conexao.id} ${envelope.evento}: gravar o aviso falhou`);
    return tenteDeNovo();
  }
  if (gravado) await agendar(conexao, gravado.id);
  return recebido();
}

/** Repetido não agenda: a primeira cópia já foi (ou vai pelo cron). */
async function agendar(conexao: ConexaoYampi, eventoId: string): Promise<void> {
  try {
    await atualizarConexaoYampi(conexao.tenantId, { last_event_at: new Date().toISOString() });
  } catch {
    console.warn(`[yampi/webhook] conexão ${conexao.id}: last_event_at não gravou`);
  }
  after(async () => {
    try {
      await processarEventoYampi(eventoId);
    } catch {
      console.error(`[yampi/webhook] evento ${eventoId} ficou para o cron`);
    }
  });
}

/** Só depois da assinatura: o decodificador tira o BOM, que entrou no HMAC. */
function lerJson(corpo: Uint8Array): { ok: true; valor: unknown } | { ok: false } {
  try {
    return { ok: true, valor: JSON.parse(new TextDecoder("utf-8").decode(corpo)) };
  } catch {
    return { ok: false };
  }
}
