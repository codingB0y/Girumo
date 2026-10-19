import "server-only";

import { hashesDoCliente, type DadosDoCliente } from "@/lib/meta/dados-do-cliente";
import { chaveDoTelefone } from "@/lib/pages/phone";
import type { ConexaoBling } from "@/lib/stores/bling-conexoes";
import type { ContatoGuardado } from "@/lib/stores/bling-contatos";
import type { AgendaDoPedido, EfeitosDoPedido, LinhaPedidoBling, ResultadoProcessamento } from "@/lib/stores/bling-pedidos";
import type { CadastroDaVenda } from "@/lib/stores/site-captures";
import type { SaleLead } from "@/lib/stores/vendas";
import { telefoneCanonico, variantesDoTelefone } from "@/lib/vendas/telefone";

import { listarSituacoesDeVenda, obterContato, obterPedido } from "./api";
import { classificarPedido, horaDoPedido, idsDeVendaEfetivos, situacoesOuPadrao } from "./classificar";
import { ErroBling, type ClienteBling } from "./cliente";
import type { DepsBling } from "./deps";
import type { CampanhaComMetadata } from "./eventos-meta";
import { estadoDaLinha, eventosDoMeta, type ContextoMeta, type EstadoMeta, type ResultadoDoMeta } from "./processar-meta";
import { mensagemDe, proximaTentativa, rotulo, soNaPrimeiraVez, TAMANHO_DO_ERRO } from "./sincronizar-execucao";
import type { ContatoBling, PedidoResumo, SituacaoBling, TipoPedido } from "./tipos";

/**
 * Uma linha da fila (spec §3 "Processar um pedido"): estado → tipo → contato → `orders` → origem →
 * Meta → grava → listas. Lança o erro do Bling (quem chama reagenda); o do Meta não lança: vira
 * status e nova tentativa. O que já aconteceu fora da fila (pedido em `orders`, evento aceito pelo
 * Meta) vai para o banco na hora: uma falha depois não cria outro pedido nem reenvia evento.
 */

/**
 * `tetoDasGravacoes`: até quando (epoch ms, no relógio de `deps.agora`) as novas tentativas de gravar um
 * efeito que já aconteceu insistem — o fim da trava, e nunca a menos de 2 s da morte da função. O fim da
 * trava em si (`fimDaTrava`) vem do contexto do Meta. `podeRelerSituacoes`: true só na primeira vez da
 * execução (a situação desconhecida relê uma vez).
 */
export type ContextoLoja = ContextoMeta & { cliente: ClienteBling; tetoDasGravacoes: number; podeRelerSituacoes: () => boolean };

/** Sem a execução (chamada direta, testes): sem prazo, e uma releitura das situações por contexto. */
export type OpcoesDoContexto = Partial<Pick<ContextoLoja, "fimDaTrava" | "tetoDasGravacoes" | "podeRelerSituacoes">>;

/** O pedido processado. `adiado` = nada decidido agora: volta no recuo normal com o motivo, sem contar como falha da loja. */
export type PedidoProcessado = { conexao: ConexaoBling; adiado: string | null };

const UM_DIA_MS = 24 * 3_600_000;
/** Entre as novas tentativas de gravar um efeito que já aconteceu fora (pedido em orders, evento no Meta). */
const RECUOS_DOS_EFEITOS_MS: readonly number[] = [300, 1_000, 3_000];

export function contextoDaLoja(
  tenantId: string,
  conexao: ConexaoBling,
  cliente: ClienteBling,
  deps: DepsBling,
  opcoes: OpcoesDoContexto = {},
): ContextoLoja {
  const { fimDaTrava = Number.POSITIVE_INFINITY, tetoDasGravacoes = fimDaTrava, podeRelerSituacoes = soNaPrimeiraVez() } = opcoes;
  let campanhas: CampanhaComMetadata[] | null = null;
  let optouts: Set<string> | null = null;
  return {
    tenantId,
    conexao,
    cliente,
    deps,
    fimDaTrava,
    tetoDasGravacoes,
    podeRelerSituacoes,
    agora: deps.agora,
    // Uma leitura por execução, e só se algum pedido chegar ao pixel. Falha não fica guardada.
    campanhas: async () => (campanhas ??= await deps.campanhas.comMetadata(tenantId)),
    // Idem. Falha sobe: o pedido tenta de novo, nunca envia sem saber quem saiu.
    optouts: async () => (optouts ??= await deps.optouts.chaves(tenantId)),
  };
}

type Projecao = { orderId: string | null; saleAt: Date | null; lead: SaleLead | null };
type Origem = { origem: "anuncio" | "grupo" | "sem_origem" | null; detalhe: string | null; cadastro: CadastroDaVenda | null };
type Decidido = { estado: PedidoResumo | null; tipo: TipoPedido; projecao: Projecao; origem: Origem; meta: ResultadoDoMeta };

/** A conexão volta com as situações recarregadas e a última venda vista (o motor grava uma vez por rodada). */
export async function processarPedido(ctx: ContextoLoja, linha: LinhaPedidoBling): Promise<PedidoProcessado> {
  // O retrato é sempre o último da lista (a varredura troca quando muda, o aviso apaga); sem ele, GET (404 = excluído).
  const estado = retratoQueServe(linha.snapshot, ctx.conexao) ?? (await obterPedido(ctx.cliente, linha.blingOrderId));
  const situacoes = await situacoesDoPedido(ctx, estado);
  if (situacoes.desconhecida !== null) {
    return { conexao: situacoes.conexao, adiado: `situação ${situacoes.desconhecida} ainda não está na lista do Bling` };
  }
  const atual: ContextoLoja = { ...ctx, conexao: situacoes.conexao };
  const tipo = tipoDoPedido(estado, atual.conexao);
  const temCliente = tipo === "venda" || tipo === "pedido";
  const contato = estado?.contatoId && temCliente ? await contatoDoPedido(atual, estado.contatoId) : null;
  const projecao = await projetar(atual, linha, estado, tipo, contato);
  const origem = await origemDaVenda(atual, tipo, contato, projecao);
  const meta = await eventosDoMeta({ ctx: atual, linha, tipo, estado, contato, saleAt: projecao.saleAt, origem: origem.origem, cadastro: origem.cadastro });
  // O Meta já respondeu: o status vai para o banco antes de qualquer outra coisa, para nunca reenviar.
  if (meta.enviou) await gravarEfeitos(ctx, linha.blingOrderId, efeitos(projecao, origem, meta));
  await gravar(atual, linha, { estado, tipo, projecao, origem, meta });
  return { conexao: comUltimaVenda(atual.conexao, tipo, projecao.saleAt), adiado: null };
}

/**
 * Retrato sem o canal (de antes dele existir) só serve na loja que não tirou canal nenhum do Meta: ali o canal não
 * muda nada. Na que tirou, o GET diz o canal; confiar no retrato mandaria ao Meta a venda de um canal tirado.
 */
function retratoQueServe(retrato: PedidoResumo | null, c: ConexaoBling): PedidoResumo | null {
  if (retrato && retrato.lojaId === undefined && c.metaSkipStoreIds.length > 0) return null;
  return retrato;
}

function tipoDoPedido(estado: PedidoResumo | null, c: ConexaoBling): TipoPedido {
  // Situações que não carregaram: as padrão; venda sem escolha da loja: o padrão calculado agora (spec §1).
  return classificarPedido(estado, situacoesOuPadrao(c.situations), idsDeVendaEfetivos(c.saleSituationIds, c.situations));
}

// --- Situações -----------------------------------------------------------------------------

type SituacoesDoPedido = { conexao: ConexaoBling; desconhecida: number | null };

const conhece = (c: ConexaoBling, situacao: number): boolean => c.situations.some((s) => s.id === situacao);

/**
 * Situação que a lista da conta não tem (criada há pouco): relê, uma vez por execução. Ainda desconhecida
 * (`desconhecida` = o id), o pedido espera: sem a base certa, uma venda numa filha nova de Atendido viraria
 * pedido para sempre. Lista vazia (módulo não reconhecido ou não carregado): o padrão decide, como sempre.
 * Erro do Bling na releitura sobe (o pedido tenta de novo, e o prazo esgotado para a rodada).
 */
async function situacoesDoPedido(ctx: ContextoLoja, estado: PedidoResumo | null): Promise<SituacoesDoPedido> {
  const c = ctx.conexao;
  if (!estado || c.situations.length === 0 || conhece(c, estado.situacaoId)) return { conexao: c, desconhecida: null };
  const relida = ctx.podeRelerSituacoes() ? await recarregarSituacoes(ctx) : c;
  return { conexao: relida, desconhecida: conhece(relida, estado.situacaoId) ? null : estado.situacaoId };
}

/**
 * Relê as situações do módulo de vendas e grava. Sem módulo (ou consulta não reconhecida), fica com as
 * que tem e grava só a hora: a próxima leitura espera 24 h, em vez de repetir a cada execução. Erro de
 * Bling que não seja esse sobe (quem chama decide se conta como falha). As situações de venda ficam como
 * a loja deixou: vazio = ela nunca escolheu, e o padrão sai na hora das situações atuais.
 */
export async function recarregarSituacoes(ctx: Pick<ContextoLoja, "tenantId" | "conexao" | "cliente" | "deps">): Promise<ConexaoBling> {
  const agora = ctx.deps.agora().toISOString();
  const lidas = await situacoesDaConta(ctx.cliente);
  await ctx.deps.conexoes.atualizarConexao(ctx.tenantId, lidas ? { situations: lidas, situations_at: agora } : { situations_at: agora });
  return { ...ctx.conexao, ...(lidas ? { situations: lidas } : {}), situationsAt: agora };
}

async function situacoesDaConta(cliente: ClienteBling): Promise<SituacaoBling[] | null> {
  try {
    return await listarSituacoesDeVenda(cliente);
  } catch (e) {
    if (e instanceof ErroBling && (e.tipo === "nao_encontrado" || e.tipo === "invalido")) return null;
    throw e;
  }
}

// --- Contato, lead e origem ------------------------------------------------------------------

/** Cache de 24 h; senão GET. Contato apagado no Bling (404): segue com o que havia, talvez nada. */
async function contatoDoPedido(ctx: ContextoLoja, id: number): Promise<ContatoGuardado | null> {
  const guardado = await ctx.deps.contatos.lerContato(ctx.tenantId, id);
  if (guardado && ctx.agora().getTime() - Date.parse(guardado.fetchedAt) < UM_DIA_MS) return guardado;
  const doBling = await contatoDoBling(ctx, id, guardado);
  if (!doBling) return guardado;
  const phone = telefoneDoContato(doBling);
  return ctx.deps.contatos.salvarContato(ctx.tenantId, {
    blingContactId: id,
    name: doBling.nome,
    personType: doBling.tipo,
    phone,
    // Só o hash sai daqui: e-mail, nascimento e endereço não ficam em texto (spec §4).
    metaHashes: hashesDoCliente(dadosDoCliente(doBling), chaveDoTelefone(phone), ctx.agora()),
  });
}

/**
 * null = sem o contato do Bling agora: apagado (404), ou o Bling fora (transitório, limite) com um
 * guardado à mão, mesmo vencido — a venda não espera o cadastro. Sem guardado, o erro sobe e o pedido
 * tenta de novo; o prazo da execução também sobe (a rodada para por orçamento).
 */
async function contatoDoBling(ctx: ContextoLoja, id: number, guardado: ContatoGuardado | null): Promise<ContatoBling | null> {
  try {
    return await obterContato(ctx.cliente, id);
  } catch (e) {
    const foraDoAr = e instanceof ErroBling && !e.prazoEsgotado && (e.tipo === "transitorio" || e.tipo === "limite");
    if (!guardado || !foraDoAr) throw e;
    console.warn(`[bling/processar] ${rotulo(ctx.tenantId)} contato ${id}: o Bling não respondeu (${e.tipo}); segue com o guardado`);
    return null;
  }
}

/** O celular vence o fixo: é o WhatsApp, a chave do funil. */
function telefoneDoContato(c: ContatoBling): string | null {
  const celular = c.celular ? telefoneCanonico(c.celular) : null;
  return celular ?? (c.telefone ? telefoneCanonico(c.telefone) : null);
}

function dadosDoCliente(c: ContatoBling): DadosDoCliente {
  const preenchidos = (valores: Array<string | null>): string[] => valores.flatMap((v) => (v ? [v] : []));
  return {
    nome: c.nome,
    pessoaFisica: c.tipo === "F",
    emails: preenchidos([c.email, c.emailNotaFiscal]),
    telefones: preenchidos([c.celular, c.telefone]),
    nascimento: c.dataNascimento,
    sexo: c.sexo,
    cidade: c.municipio,
    uf: c.uf,
    cep: c.cep,
    pais: c.pais,
  };
}

async function leadDaVenda(ctx: ContextoLoja, tipo: TipoPedido, contato: ContatoGuardado | null): Promise<SaleLead | null> {
  if (tipo !== "venda" || !contato?.phone) return null;
  const variantes = variantesDoTelefone(contato.phone);
  return variantes && variantes.length > 0 ? ctx.deps.leads.porTelefones(ctx.tenantId, variantes) : null;
}

/** Spec §4: anúncio (cadastro com utm_campaign nos 90 dias), grupo (lead com a chave), ou sem origem. Só venda. */
async function origemDaVenda(ctx: ContextoLoja, tipo: TipoPedido, contato: ContatoGuardado | null, p: Projecao): Promise<Origem> {
  if (tipo !== "venda" || !p.saleAt) return { origem: null, detalhe: null, cadastro: null };
  const cadastro = contato?.phoneKey ? await ctx.deps.cadastros.ultimoDaChave(ctx.tenantId, contato.phoneKey, p.saleAt) : null;
  if (cadastro?.utmCampaign) {
    return { origem: "anuncio", detalhe: [cadastro.utmCampaign, cadastro.utmContent].filter(Boolean).join(" · "), cadastro };
  }
  if (p.lead) return { origem: "grupo", detalhe: p.lead.source_group_name, cadastro };
  return { origem: "sem_origem", detalhe: null, cadastro };
}

// --- orders e gravação -----------------------------------------------------------------------

async function projetar(
  ctx: ContextoLoja,
  linha: LinhaPedidoBling,
  estado: PedidoResumo | null,
  tipo: TipoPedido,
  contato: ContatoGuardado | null,
): Promise<Projecao> {
  const agora = ctx.agora();
  const lead = await leadDaVenda(ctx, tipo, contato);
  const vistoEm = new Date(linha.firstSeenAt);
  // Gravada na primeira vez que é venda e nunca muda: a venda fica datada pelo dia do pedido.
  const saleAt = linha.saleAt ? new Date(linha.saleAt) : tipo === "venda" && estado ? horaDoPedido(estado.data, vistoEm, agora) : null;
  const orderId = await ctx.deps.projetar(ctx.tenantId, {
    tipo,
    blingOrderId: linha.blingOrderId,
    orderId: linha.orderId,
    total: estado?.total ?? 0,
    telefone: contato?.phone ?? null,
    saleAt: saleAt ?? agora,
    lead,
  });
  if (orderId !== linha.orderId || (saleAt !== null && linha.saleAt === null)) {
    // O pedido em `orders` já existe (ou já sumiu): a ligação vai para o banco agora. Se não for, o id
    // determinístico da venda impede a próxima volta de criar outra.
    await gravarEfeitos(ctx, linha.blingOrderId, { ...efeitosDaLinha(linha), orderId, saleAt });
  }
  return { orderId, saleAt, lead };
}

/**
 * O efeito já aconteceu fora (pedido em orders, evento aceito pelo Meta): perder a gravação o
 * repetiria. Até 3 novas tentativas (0,3 s, 1 s, 3 s) até o teto das gravações (o fim da trava, não o do
 * orçamento; nunca a menos de 2 s da morte da função): o Meta que responde tarde, seguido de um blip do
 * banco, reenviaria os eventos. Depois, o erro sobe.
 */
async function gravarEfeitos(ctx: ContextoLoja, id: number, ef: EfeitosDoPedido): Promise<void> {
  for (let tentativa = 0; ; tentativa += 1) {
    try {
      return await ctx.deps.pedidos.salvarEfeitos(ctx.tenantId, id, ef);
    } catch (e) {
      const espera = RECUOS_DOS_EFEITOS_MS.at(tentativa);
      if (espera === undefined || ctx.agora().getTime() + espera >= ctx.tetoDasGravacoes) throw e;
      console.warn(`[bling/processar] loja ${ctx.tenantId} pedido ${id}: gravar os efeitos falhou, tentando de novo: ${mensagemDe(e)}`);
      await ctx.deps.esperar(espera);
    }
  }
}

function efeitosDaLinha(l: LinhaPedidoBling): EfeitosDoPedido {
  return { orderId: l.orderId, saleAt: l.saleAt ? new Date(l.saleAt) : null, ...estadoDaLinha(l), origem: l.origem, origemDetalhe: l.origemDetalhe };
}

function efeitos(p: Projecao, o: Origem, m: EstadoMeta): EfeitosDoPedido {
  const { icStatus, icSentAt, purchaseStatus, purchaseSentAt, metaError } = m;
  return { orderId: p.orderId, saleAt: p.saleAt, icStatus, icSentAt, purchaseStatus, purchaseSentAt, metaError, origem: o.origem, origemDetalhe: o.detalhe };
}

async function gravar(ctx: ContextoLoja, linha: LinhaPedidoBling, d: Decidido): Promise<void> {
  const r = resultadoDoPedido(linha, d);
  const agenda = agendaDoMeta(linha, d.meta, ctx.agora());
  // false = um aviso reabriu o pedido no meio: fica pendente com o estado novo (os efeitos já estão gravados).
  if (!(await ctx.deps.pedidos.salvarProcessado(ctx.tenantId, linha.blingOrderId, r, agenda, linha.updatedAt))) return;
  // Só depois de gravar: a lista lê o `kind` gravado, e antes deixaria a pessoa um pedido atrasada.
  await recalcularContato(ctx, linha.blingOrderId, r.blingContactId);
  if (linha.blingContactId !== null && linha.blingContactId !== r.blingContactId) {
    await recalcularContato(ctx, linha.blingOrderId, linha.blingContactId);
  }
}

function resultadoDoPedido(linha: LinhaPedidoBling, d: Decidido): ResultadoProcessamento {
  const { estado } = d;
  return {
    numero: estado ? estado.numero : linha.numero,
    orderDate: estado ? estado.data : linha.orderDate,
    total: estado ? estado.total : linha.total,
    situacaoId: estado ? estado.situacaoId : linha.situacaoId,
    // Excluído não diz de quem era: fica o contato que a linha já tinha (a lista dele recalcula).
    blingContactId: estado ? estado.contatoId : linha.blingContactId,
    kind: d.tipo,
    ...efeitos(d.projecao, d.origem, d.meta),
    snapshot: estado,
  };
}

function agendaDoMeta(linha: LinhaPedidoBling, meta: ResultadoDoMeta, agora: Date): AgendaDoPedido {
  if (!meta.falhou) return { pendente: false };
  const tentativas = linha.attempts + 1;
  const proxima = proximaTentativa(tentativas, agora.getTime());
  // Na 6ª o pedido sai da fila; o status `erro` fica à vista no cartão.
  if (!proxima) return { pendente: false };
  return { pendente: true, tentativas, proxima, erro: `meta: ${meta.metaError ?? ""}`.slice(0, TAMANHO_DO_ERRO) };
}

async function recalcularContato(ctx: ContextoLoja, pedido: number, contato: number | null): Promise<void> {
  // Sem contato não há pessoa: recalcular sem id seria a loja inteira.
  if (contato === null) return;
  try {
    await ctx.deps.contatos.recalcularListas(ctx.tenantId, contato);
  } catch (e) {
    // Não reagenda o pedido: a rede de segurança do cron recalcula a loja toda.
    console.error(`[bling/processar] ${rotulo(ctx.tenantId, pedido)} contato ${contato}: listas: ${mensagemDe(e)}`);
  }
}

function comUltimaVenda(c: ConexaoBling, tipo: TipoPedido, saleAt: Date | null): ConexaoBling {
  if (tipo !== "venda" || !saleAt) return c;
  if (c.lastSaleAt && Date.parse(c.lastSaleAt) >= saleAt.getTime()) return c;
  return { ...c, lastSaleAt: saleAt.toISOString() };
}
