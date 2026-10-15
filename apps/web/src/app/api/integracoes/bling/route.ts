import { z } from "zod";

import { diaDoBling } from "@/lib/bling/api";
import { montarCartao, opcoesDoPixel, versaoDasSituacoes } from "@/lib/bling/cartao";
import { idsDeVendaEfetivos, idsDeVendaValidos, situacoesOuPadrao } from "@/lib/bling/classificar";
import { blingDisponivel } from "@/lib/bling/deps";
import { credenciaisBling, revogarToken } from "@/lib/bling/oauth";
import { hasPermission } from "@/lib/permissions";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { abrir, chaveDeIntegracoes } from "@/lib/security/secret-box";
import {
  atualizarConexao,
  contextoDoToken,
  desconectarConexao,
  lerConexao,
  type ConexaoBling,
} from "@/lib/stores/bling-conexoes";
import { recalcularListas } from "@/lib/stores/bling-contatos";
import { reabrirDesde } from "@/lib/stores/bling-pedidos";
import { listCampaignGroups } from "@/lib/stores/campaign-groups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UM_DIA_MS = 86_400_000;
/** Situações de venda mudaram: a janela de venda do funil inteira se reclassifica. */
const DIAS_DA_RECLASSIFICACAO = 90;
/** Meta religado ou outro pixel: só o que o Meta ainda aceita (evento de até 7 dias). */
const DIAS_DO_META = 7;

function resposta(corpo: unknown, status: number): Response {
  return Response.json(corpo, { status, headers: { "cache-control": "no-store" } });
}

/** Dono ou admin da loja do pedido; senão a resposta de recusa pronta. */
async function lojaDoDono(req: Request, rotulo: string): Promise<string | Response> {
  try {
    const ctx = await getRouteTenantContext(req, { allowEngine: false });
    if (!ctx.role || !hasPermission(ctx.role, "settings:connection")) {
      return resposta({ error: "Sem permissão para esta ação." }, 403);
    }
    return ctx.tenantId;
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(`[${rotulo}] contexto: ${(e as Error).message}`);
    return resposta({ error: "erro" }, 500);
  }
}

/** GET /api/integracoes/bling — o cartão (spec §5). Sem as variáveis do Bling, nenhuma consulta. */
export async function GET(req: Request): Promise<Response> {
  const tenantId = await lojaDoDono(req, "bling/cartao");
  if (tenantId instanceof Response) return tenantId;
  try {
    return resposta(await montarCartao(tenantId, new Date()), 200);
  } catch (e) {
    console.error(`[bling/cartao] ${tenantId}: ${(e as Error).message}`);
    return resposta({ error: "Não foi possível carregar o Bling." }, 500);
  }
}

/** Valor com até 2 casas, como o numeric(12,2) guarda: `String` dá a menor escrita exata do número. */
const duasCasas = (v: number) => /^\d+(\.\d{1,2})?$/.test(String(v));

const ajustesSchema = z
  .strictObject({
    sale_situation_ids: z.array(z.number().int().positive()).min(1).max(50),
    // A versão das situações que o formulário mostrou (`situacoes_versao` do cartão, 16 hex): vem sempre junto com elas.
    situacoes_versao: z.string().regex(/^[0-9a-f]{16}$/),
    high_value: z.number().positive().max(10_000_000).refine(duasCasas).nullable(),
    meta_enabled: z.boolean(),
    // O banco devolve uuid em minúsculas: comparar e gravar assim.
    meta_campaign_id: z.uuid().transform((id) => id.toLowerCase()).nullable(),
  })
  .partial()
  .refine((a) => (a.sale_situation_ids === undefined) === (a.situacoes_versao === undefined), { path: ["situacoes_versao"] });

type CorpoDosAjustes = z.infer<typeof ajustesSchema>;
/** O que se grava: a versão das situações só confere. */
type Ajustes = Omit<CorpoDosAjustes, "situacoes_versao">;

const MENSAGEM_DO_CAMPO: Record<string, string> = {
  sale_situation_ids: "Marque de 1 a 50 situações que contam como venda.",
  situacoes_versao: "Recarregue a página e confira quais contam como venda.",
  high_value: "Valor alto: maior que zero, até R$ 10.000.000,00 e com até 2 casas decimais.",
  meta_enabled: "Enviar ao Meta: escolha ligado ou desligado.",
  meta_campaign_id: "Campanha do pixel inválida.",
};
const SITUACOES_MUDARAM =
  "As situações do Bling mudaram desde que você abriu os ajustes. Recarregue a página e confira quais contam como venda.";
const NAO_REPROCESSOU = "Não deu para reprocessar os pedidos com o ajuste novo; nada foi alterado. Tente salvar de novo.";

function mensagemDoErro(erro: z.ZodError): string {
  const [problema] = erro.issues;
  if (problema?.code === "unrecognized_keys") return "Campo desconhecido nos ajustes.";
  return MENSAGEM_DO_CAMPO[String(problema?.path[0])] ?? "Ajustes inválidos.";
}

/** PATCH /api/integracoes/bling — ajustes do cartão (spec §5). Responde `{ ok: true }`. */
export async function PATCH(req: Request): Promise<Response> {
  const tenantId = await lojaDoDono(req, "bling/ajustes");
  if (tenantId instanceof Response) return tenantId;
  if (!blingDisponivel()) return resposta({ error: "indisponivel" }, 503);

  let bruto: unknown;
  try {
    bruto = await req.json();
  } catch {
    return resposta({ error: "JSON inválido." }, 400);
  }
  const lido = ajustesSchema.safeParse(bruto);
  if (!lido.success) return resposta({ error: mensagemDoErro(lido.error) }, 400);
  if (Object.keys(lido.data).length === 0) return resposta({ error: "Nada para salvar." }, 400);

  try {
    return await aplicarAjustes(tenantId, lido.data, new Date());
  } catch (e) {
    console.error(`[bling/ajustes] ${tenantId}: ${(e as Error).message}`);
    return resposta({ error: "Não foi possível salvar os ajustes." }, 500);
  }
}

/** O que o motor recusaria: situação bloqueada, desconhecida ou repetida; campanha sem pixel e token. */
async function recusaDosAjustes(tenantId: string, conexao: ConexaoBling, a: Ajustes): Promise<string | null> {
  if (a.sale_situation_ids && !idsDeVendaValidos(a.sale_situation_ids, situacoesOuPadrao(conexao.situations))) {
    return "Situação inválida: Cancelado e Em digitação nunca contam como venda.";
  }
  if (a.meta_campaign_id) {
    const opcoes = opcoesDoPixel(await listCampaignGroups(tenantId));
    if (!opcoes.some((o) => o.campaign_id === a.meta_campaign_id)) {
      return "Escolha uma campanha com o pixel e o token do Meta configurados.";
    }
  }
  return null;
}

const ordenados = (ids: readonly number[]) => [...new Set(ids)].sort((x, y) => x - y);

/** As situações de venda mudaram de verdade: comparadas com o que o motor conta hoje (a escolha, ou o padrão de agora). */
function situacoesMudaram(c: ConexaoBling, a: Ajustes): boolean {
  const contaHoje = idsDeVendaEfetivos(c.saleSituationIds, c.situations);
  return a.sale_situation_ids !== undefined && ordenados(a.sale_situation_ids).join() !== ordenados(contaHoje).join();
}

/** Quantos dias de pedidos voltam à fila; null = nenhum. A reclassificação de 90 dias já cobre a do Meta. */
function diasParaReabrir(c: ConexaoBling, a: Ajustes): number | null {
  if (situacoesMudaram(c, a)) return DIAS_DA_RECLASSIFICACAO;
  const religouMeta = a.meta_enabled === true && !c.metaEnabled;
  const trocouPixel = a.meta_campaign_id !== undefined && a.meta_campaign_id !== c.metaCampaignId;
  return religouMeta || trocouPixel ? DIAS_DO_META : null;
}

/**
 * O que vai para o banco. Situações iguais ao que o motor já conta não vão. Na loja que nunca escolheu,
 * gravar o padrão de agora o congelaria (uma filha de Atendido criada depois viraria pedido para sempre);
 * vazio continua sendo o padrão calculado na hora.
 */
function paraGravar(c: ConexaoBling, a: Ajustes): Ajustes {
  const { sale_situation_ids: ids, ...resto } = a;
  return ids && situacoesMudaram(c, a) ? { ...resto, sale_situation_ids: ordenados(ids) } : resto;
}

async function aplicarAjustes(tenantId: string, corpo: CorpoDosAjustes, agora: Date): Promise<Response> {
  const { situacoes_versao: versao, ...a } = corpo;
  const conexao = await lerConexao(tenantId);
  if (!conexao || conexao.status === "desconectada") return resposta({ error: "Sem conexão com o Bling." }, 404);
  // A lista de situações mudou com o formulário aberto (o motor releu): o que a dona marcou foi sobre outra lista, e
  // uma situação nova (uma filha de Atendido) viraria pedido sem ela ver. A releitura que acha a mesma lista passa.
  if (versao !== undefined && versao !== versaoDasSituacoes(conexao.situations)) return resposta({ error: SITUACOES_MUDARAM }, 409);
  const recusa = await recusaDosAjustes(tenantId, conexao, a);
  if (recusa) return resposta({ error: recusa }, 400);

  // Grava ANTES de reabrir: o motor lista a fila antes de reler a conexão, então a linha reaberta é sempre
  // processada com o ajuste novo (reabrir antes deixava o lote que relera a conexão processar com o velho).
  const gravado = paraGravar(conexao, a);
  await atualizarConexao(tenantId, gravado);
  const dias = diasParaReabrir(conexao, a);
  if (dias !== null) {
    const dia = diaDoBling(new Date(agora.getTime() - dias * UM_DIA_MS));
    if (!(await reabrirOuDesfazer(tenantId, conexao, gravado, dia))) return resposta({ error: NAO_REPROCESSOU }, 500);
  }
  // Depois de gravar: o recálculo lê o valor alto da conexão.
  if (a.high_value !== undefined && a.high_value !== conexao.highValue) await recalcularListas(tenantId);
  return resposta({ ok: true }, 200);
}

/**
 * Reabre os pedidos desde `dia`. Falhou: grava de volta, nos mesmos campos, o que a conexão tinha antes — senão a
 * nova tentativa acharia tudo igual e nunca reclassificaria. false = não reabriu.
 */
async function reabrirOuDesfazer(tenantId: string, antes: ConexaoBling, gravado: Ajustes, dia: string): Promise<boolean> {
  try {
    await reabrirDesde(tenantId, dia);
    return true;
  } catch (e) {
    console.error(`[bling/ajustes] ${tenantId}: reabrir os pedidos falhou: ${(e as Error).message}`);
  }
  try {
    await atualizarConexao(tenantId, comoEstava(antes, gravado));
  } catch (e) {
    console.error(`[bling/ajustes] ${tenantId}: desfazer os ajustes falhou; o ajuste novo ficou sem reprocessar os pedidos: ${(e as Error).message}`);
  }
  return false;
}

/** Os campos gravados, com o valor que a conexão tinha antes. */
function comoEstava(c: ConexaoBling, gravado: Ajustes): Ajustes {
  const antes: Required<Ajustes> = {
    sale_situation_ids: c.saleSituationIds,
    high_value: c.highValue,
    meta_enabled: c.metaEnabled,
    meta_campaign_id: c.metaCampaignId,
  };
  return Object.fromEntries(Object.keys(gravado).map((campo) => [campo, antes[campo as keyof Ajustes]]));
}

/**
 * DELETE /api/integracoes/bling — desconecta a loja (spec §3 "Desconectar"). Primeiro o banco
 * (tokens apagados, `desconectada`, trava solta), depois a revogação no Bling, que é melhor
 * esforço: sem ela a desconexão já vale aqui. Pedidos, contatos e vendas importadas ficam.
 */
export async function DELETE(req: Request): Promise<Response> {
  const tenantId = await lojaDoDono(req, "bling/desconectar");
  if (tenantId instanceof Response) return tenantId;

  let anterior: ConexaoBling | null;
  try {
    anterior = await desconectarConexao(tenantId);
  } catch (e) {
    console.error(`[bling/desconectar] ${tenantId}: ${(e as Error).message}`);
    return resposta({ error: "Não foi possível desconectar o Bling." }, 500);
  }
  if (!anterior) return resposta({ error: "Sem conexão com o Bling." }, 404);

  await revogarAnterior(tenantId, anterior);
  return resposta({ ok: true }, 200);
}

/** Sem variáveis, sem token ou cifra que não abre: só pula a revogação (a mensagem do secret-box é fixa). */
async function revogarAnterior(tenantId: string, anterior: ConexaoBling): Promise<void> {
  const credenciais = credenciaisBling();
  const chave = chaveDeIntegracoes();
  if (!credenciais || !chave || !anterior.refreshTokenEnc) return;
  try {
    const refresh = abrir(anterior.refreshTokenEnc, contextoDoToken(tenantId, "refresh"), chave);
    await revogarToken(refresh, credenciais);
  } catch (e) {
    console.warn(`[bling/desconectar] ${tenantId}: revogação pulada (${(e as Error).message})`);
  }
}
