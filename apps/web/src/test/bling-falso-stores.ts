/**
 * Stores falsas do motor do Bling (ver `bling-falso.ts`), com as regras que o banco aplica: fila
 * do `bling_enqueue`, trava do `bling_claim`, guarda do `updated_at`, listas do
 * `bling_recompute_lists`. Toda chamada entra na trilha; consulta de outra loja estoura.
 */
import type { DepsDoAviso } from "@/lib/bling/avisar-reconectar";
import type { DepsBling } from "@/lib/bling/deps";
import { idDaVendaBling, type PedidoParaProjetar } from "@/lib/bling/pedido-girumo";
import type { PedidoResumo } from "@/lib/bling/tipos";
import { chaveDoTelefone } from "@/lib/pages/phone";
import type { AtualizacaoConexao, ConexaoBling } from "@/lib/stores/bling-conexoes";
import type { ContatoGuardado } from "@/lib/stores/bling-contatos";
import type { AgendaDoPedido, EfeitosDoPedido, LinhaPedidoBling, ResultadoProcessamento } from "@/lib/stores/bling-pedidos";
import type { CadastroDaVenda } from "@/lib/stores/site-captures";

import { daLoja, DIA, iso, linhaPendente, novaVersao, registrar, type Estado, type LinhaFalsa } from "./bling-falso-base";

const CAMPOS: { [K in keyof Required<AtualizacaoConexao>]: keyof ConexaoBling } = {
  situations: "situations",
  situations_at: "situationsAt",
  sale_situation_ids: "saleSituationIds",
  high_value: "highValue",
  meta_enabled: "metaEnabled",
  meta_campaign_id: "metaCampaignId",
  backfill_page: "backfillPage",
  backfill_fails: "backfillFails",
  backfill_done_at: "backfillDoneAt",
  scan_cursor: "scanCursor",
  scan_from: "scanFrom",
  scan_slice_s: "scanSliceS",
  paused_until: "pausedUntil",
  consecutive_failures: "consecutiveFailures",
  last_webhook_at: "lastWebhookAt",
  last_scan_at: "lastScanAt",
  last_scan_change_at: "lastScanChangeAt",
  last_sale_at: "lastSaleAt",
  last_error: "lastError",
  last_error_at: "lastErrorAt",
  token_retry_at: "tokenRetryAt",
};

type Conexoes = DepsBling["conexoes"];

export function conexoesFalsas(e: Estado): Conexoes {
  return { ...dadosDaConexao(e), ...travaDaConexao(e) };
}

function dadosDaConexao(e: Estado): Omit<Conexoes, "pegarTrava" | "soltarTrava"> {
  return {
    async lerConexao(t) {
      daLoja(t);
      registrar(e, "conexoes.lerConexao");
      return e.conexao ? structuredClone(e.conexao) : null;
    },
    async salvarTokensRenovados(t, versaoLida, novos) {
      daLoja(t);
      const ok = e.conexao !== null && e.conexao.tokenVersion === versaoLida;
      if (ok && e.conexao) {
        const { accessTokenEnc, refreshTokenEnc, keyFp } = novos;
        const accessExpiresAt = novos.accessExpiresAt.toISOString();
        // Como a store: o par novo gravado encerra o recuo da renovação.
        e.conexao = { ...e.conexao, accessTokenEnc, refreshTokenEnc, accessExpiresAt, keyFp, tokenVersion: versaoLida + 1, tokenRetryAt: null };
      }
      registrar(e, `conexoes.salvarTokensRenovados ${ok}`);
      return ok;
    },
    async marcarReconectar(t, erro) {
      daLoja(t);
      registrar(e, "conexoes.marcarReconectar");
      if (!e.conexao || e.conexao.status !== "ativa") return;
      e.conexao = { ...e.conexao, status: "reconectar", lastError: erro, lastErrorAt: iso(e.agora) };
      e.trava = null;
    },
    async atualizarConexao(t, campos) {
      daLoja(t);
      e.atualizacoes.push(campos);
      const mudancas = Object.entries(campos).map(([k, v]) => [CAMPOS[k as keyof AtualizacaoConexao], v]);
      if (e.conexao) e.conexao = { ...e.conexao, ...(Object.fromEntries(mudancas) as Partial<ConexaoBling>) };
      registrar(e, `conexoes.atualizarConexao ${Object.keys(campos).join(",")}`);
    },
  };
}

/** A regra do `bling_claim`: só loja ativa e fora da pausa; trava livre, vencida ou já do mesmo dono. */
function travaDaConexao(e: Estado): Pick<Conexoes, "pegarTrava" | "soltarTrava"> {
  return {
    async pegarTrava(t, dono, segundos) {
      daLoja(t);
      registrar(e, `conexoes.pegarTrava ${segundos}`);
      const c = e.conexao;
      if (!c || c.status !== "ativa") return false;
      if (c.pausedUntil && Date.parse(c.pausedUntil) > e.agora) return false;
      if (e.trava && e.trava.ate > e.agora && e.trava.dono !== dono) return false;
      e.trava = { dono, ate: e.agora + segundos * 1000 };
      return true;
    },
    async soltarTrava(t, dono) {
      daLoja(t);
      registrar(e, "conexoes.soltarTrava");
      if (e.trava?.dono === dono) e.trava = null;
    },
  };
}

type Origem = LinhaPedidoBling["origin"];

/**
 * A regra do `bling_enqueue`: aviso reabre sem retrato; varredura só o que mudou — ou o excluído fora
 * da fila que a lista ainda mostra (um 404 de passagem o marcou; já na fila, mantém o recuo);
 * histórico só o novo, em baixa prioridade. Aviso e varredura tiram a baixa prioridade.
 */
export function enfileirarUm(e: Estado, origem: Origem, item: { id: number }): boolean {
  const atual = e.pedidos.get(item.id);
  const retrato = origem === "aviso" ? null : (item as PedidoResumo);
  const igual = atual && retrato && !mudouDesde(atual, retrato) && !(atual.kind === "excluido" && !atual.pending);
  if (atual && retrato && (origem === "historico" || igual)) return false;
  const base = atual ?? linhaPendente(item.id, { origin: origem });
  const reaberta = { pending: true, attempts: 0, nextTryAt: iso(e.agora), updatedAt: novaVersao(e), lowPriority: origem === "historico" };
  e.pedidos.set(item.id, { ...base, ...reaberta, snapshot: retrato });
  return true;
}

/**
 * A regra do `reabrirDesde` (o Salvar do cartão): na fila, a linha do período e a sem dia (nunca processada) ganham
 * versão nova — o processamento em andamento não grava por cima; fora da fila, a do período volta atrás da venda ao vivo.
 */
export function reabrirDesde(e: Estado, dia: string): void {
  for (const [id, l] of e.pedidos) {
    const doPeriodo = l.orderDate !== null && l.orderDate >= dia;
    if (!doPeriodo && !(l.pending && l.orderDate === null)) continue;
    const volta = l.pending ? {} : { pending: true, lowPriority: true };
    e.pedidos.set(id, { ...l, ...volta, attempts: 0, nextTryAt: iso(e.agora), updatedAt: novaVersao(e) });
  }
}

/** Compara com o retrato; sem retrato, com o último processado (como o SQL). */
function mudouDesde(l: LinhaPedidoBling, p: PedidoResumo): boolean {
  const base = l.snapshot ?? { situacaoId: l.situacaoId, total: l.total, contatoId: l.blingContactId };
  return base.situacaoId !== p.situacaoId || base.total !== p.total || base.contatoId !== p.contatoId;
}

/** A ordem do `listarPendentes`: o que só o histórico marcou vai depois; dentro, os mais antigos primeiro. */
function vencidos(e: Estado, agora: number): LinhaFalsa[] {
  return [...e.pedidos.values()]
    .filter((l) => l.pending && Date.parse(l.nextTryAt) <= agora)
    .sort((a, b) => Number(a.lowPriority) - Number(b.lowPriority) || Date.parse(a.nextTryAt) - Date.parse(b.nextTryAt));
}

function texto(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

/** Como a store: data de envio nula fica de fora (não apaga a de um envio anterior). */
function colunasDosEfeitos(ef: EfeitosDoPedido): Partial<LinhaFalsa> {
  return {
    orderId: ef.orderId,
    saleAt: texto(ef.saleAt),
    icStatus: ef.icStatus,
    ...(ef.icSentAt ? { icSentAt: texto(ef.icSentAt) } : {}),
    purchaseStatus: ef.purchaseStatus,
    ...(ef.purchaseSentAt ? { purchaseSentAt: texto(ef.purchaseSentAt) } : {}),
    metaError: ef.metaError,
    origem: ef.origem,
    origemDetalhe: ef.origemDetalhe,
  };
}

function colunasDoResultado(r: ResultadoProcessamento, agenda: AgendaDoPedido): Partial<LinhaFalsa> {
  const fila = agenda.pendente
    ? { pending: true, attempts: agenda.tentativas, nextTryAt: agenda.proxima.toISOString(), lastError: agenda.erro }
    : { pending: false, attempts: 0, lastError: null };
  const { numero, orderDate, total, situacaoId, blingContactId, kind, snapshot } = r;
  return { numero, orderDate, total, situacaoId, blingContactId, kind, ...colunasDosEfeitos(r), snapshot, ...fila };
}

type Pedidos = DepsBling["pedidos"];

export function pedidosFalsos(e: Estado): Pedidos {
  return { ...filaFalsa(e), ...gravacoesFalsas(e) };
}

function filaFalsa(e: Estado): Pick<Pedidos, "enfileirarPedidos" | "listarPendentes" | "existePendenteVencido" | "contarPendentes"> {
  return {
    async enfileirarPedidos(t: string, origem: Origem, itens: readonly { id: number }[]) {
      daLoja(t);
      let mudou = 0;
      for (const item of itens) if (enfileirarUm(e, origem, item)) mudou += 1;
      registrar(e, `pedidos.enfileirarPedidos ${origem} ${itens.length}`);
      return mudou;
    },
    async listarPendentes(t, agora, limite) {
      daLoja(t);
      registrar(e, `pedidos.listarPendentes ${limite}`);
      return vencidos(e, agora.getTime()).slice(0, limite).map((l) => structuredClone(l));
    },
    async existePendenteVencido(t, agora) {
      daLoja(t);
      registrar(e, "pedidos.existePendenteVencido");
      return vencidos(e, agora.getTime()).length > 0;
    },
    async contarPendentes(t) {
      daLoja(t);
      registrar(e, "pedidos.contarPendentes");
      return [...e.pedidos.values()].filter((l) => l.pending).length;
    },
  };
}

/** As gravações que conferem o `updated_at` lido (e a de efeitos, que de propósito não confere). */
function gravacoesFalsas(e: Estado): Pick<Pedidos, "salvarProcessado" | "salvarEfeitos" | "agendarNovaTentativa"> {
  return {
    async salvarProcessado(t, id, r, agenda, lido) {
      daLoja(t);
      const l = e.pedidos.get(id);
      const ok = l !== undefined && l.updatedAt === lido;
      if (l && ok) e.pedidos.set(id, { ...l, ...colunasDoResultado(r, agenda), updatedAt: novaVersao(e) });
      registrar(e, `pedidos.salvarProcessado ${id} ${ok}`);
      return ok;
    },
    async salvarEfeitos(t, id, ef) {
      daLoja(t);
      const l = e.pedidos.get(id);
      if (!l) throw new Error(`bling-falso: pedido ${id} não está na fila`);
      e.pedidos.set(id, { ...l, ...colunasDosEfeitos(ef) });
      registrar(e, `pedidos.salvarEfeitos ${id}`);
    },
    async agendarNovaTentativa(t, id, tentativas, proxima, erro, lido) {
      daLoja(t);
      const l = e.pedidos.get(id);
      const ok = l !== undefined && l.updatedAt === lido;
      if (l && ok) {
        const nextTryAt = proxima ? proxima.toISOString() : l.nextTryAt;
        e.pedidos.set(id, { ...l, pending: proxima !== null, attempts: tentativas, nextTryAt, lastError: erro, updatedAt: novaVersao(e) });
      }
      registrar(e, `pedidos.agendarNovaTentativa ${id} ${ok}`);
      return ok;
    },
  };
}

export function contatosFalsos(e: Estado): DepsBling["contatos"] {
  return {
    async lerContato(t, id) {
      daLoja(t);
      registrar(e, `contatos.lerContato ${id}`);
      const c = e.contatos.get(id);
      return c ? structuredClone(c) : null;
    },
    async salvarContato(t, novo) {
      daLoja(t);
      const lista = e.contatos.get(novo.blingContactId)?.lista ?? null;
      const salvo: ContatoGuardado = { ...novo, phoneKey: chaveDoTelefone(novo.phone), lista, fetchedAt: iso(e.agora) };
      e.contatos.set(novo.blingContactId, salvo);
      registrar(e, `contatos.salvarContato ${novo.blingContactId}`);
      return structuredClone(salvo);
    },
    async recalcularListas(t, contato) {
      daLoja(t);
      const mudou = recalcular(e, contato);
      registrar(e, `contatos.recalcularListas ${contato ?? "loja"}`);
      return mudou;
    },
  };
}

const pessoa = (c: ContatoGuardado): string => c.phoneKey ?? `c:${c.blingContactId}`;

/** `bling_recompute_lists`: a pessoa do contato (todos os contatos com a mesma chave), ou a loja toda. */
function recalcular(e: Estado, contato?: number): number {
  const alvo = contato === undefined ? undefined : e.contatos.get(contato);
  if (contato !== undefined && !alvo) return 0;
  let mudou = 0;
  for (const c of [...e.contatos.values()]) {
    if (alvo && pessoa(c) !== pessoa(alvo)) continue;
    const lista = listaDaPessoa(e, pessoa(c));
    if (c.lista === lista) continue;
    e.contatos.set(c.blingContactId, { ...c, lista });
    mudou += 1;
  }
  return mudou;
}

function listaDaPessoa(e: Estado, quem: string): ContatoGuardado["lista"] {
  const ids = new Set([...e.contatos.values()].filter((c) => pessoa(c) === quem).map((c) => c.blingContactId));
  const pedidos = [...e.pedidos.values()].filter((l) => l.blingContactId !== null && ids.has(l.blingContactId));
  const vendas = pedidos.filter((l) => l.kind === "venda").map((l) => l.total ?? 0);
  const alto = e.conexao?.highValue ?? null;
  if (vendas.length > 0) return alto !== null && Math.max(...vendas) >= alto ? "alto_valor" : "comprador";
  return pedidos.some((l) => l.kind === "pedido") ? "lead" : null;
}

/** O cadastro do site mais recente da chave até `ate`, nos 90 dias antes. */
export function ultimoCadastro(e: Estado, chave: string, ate: number): CadastroDaVenda | null {
  const achados = e.cadastros
    .filter((c) => c.phoneKey === chave && c.criadoEm <= ate && c.criadoEm >= ate - 90 * DIA)
    .sort((a, b) => b.criadoEm - a.criadoEm);
  const achado = achados.at(0);
  return achado ? { utmCampaign: achado.utmCampaign, utmContent: achado.utmContent, fbc: achado.fbc, fbp: achado.fbp } : null;
}

/**
 * A projeção em `orders` com as regras da de verdade (que tem teste próprio, contra o PostgREST
 * falso): id determinístico, o insert que acha a venda já criada vira update, e a não-venda apaga
 * pelo id da linha e pelo determinístico. `pedidosGirumo` conta as criações.
 */
export function projetarFalso(e: Estado, tenantId: string, p: PedidoParaProjetar): string | null {
  const id = idDaVendaBling(tenantId, p.blingOrderId);
  if (p.tipo !== "venda") {
    for (const apagado of [p.orderId, id]) if (apagado) e.girumo.delete(apagado);
    return null;
  }
  const existente = (p.orderId ? e.girumo.get(p.orderId) : undefined) ?? e.girumo.get(id);
  if (existente) {
    e.girumo.set(existente.id, { ...existente, total: p.total, telefone: p.telefone });
    return existente.id;
  }
  e.contadores.pedidosGirumo += 1;
  e.girumo.set(id, { id, total: p.total, telefone: p.telefone, saleAt: p.saleAt.getTime(), lead: p.lead });
  return id;
}

/** O aviso de reconectar de verdade roda com estas: alerta uma vez por queda, e-mail só registrado. */
export function avisoFalso(e: Estado): DepsDoAviso {
  return {
    marcarAlerta: async () => {
      if (!e.conexao || e.conexao.reconnectAlertedAt) return false;
      e.conexao = { ...e.conexao, reconnectAlertedAt: iso(e.agora) };
      return true;
    },
    desmarcarAlerta: async (t) => {
      daLoja(t);
      registrar(e, "conexoes.desmarcarAlerta");
      if (e.conexao) e.conexao = { ...e.conexao, reconnectAlertedAt: null };
    },
    donos: async () => [{ email: "dono@loja.test", nome: "Ana Paula" }],
    enviar: async (o) => {
      e.emails.push({ to: o.to, subject: o.subject, html: o.html, kind: o.kind });
      return true;
    },
    appUrl: () => "https://app.girumo.test",
  };
}
