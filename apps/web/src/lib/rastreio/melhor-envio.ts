import "server-only";

import { ErroMelhorEnvio, paginaDeEtiquetas } from "@/lib/melhor-envio/api";
import { credenciaisMelhorEnvio, ErroOAuthMelhorEnvio, renovarToken, type CredenciaisMelhorEnvio } from "@/lib/melhor-envio/oauth";
import { marcoDaEtiqueta, normalizarCodigo, type MarcoDoMelhorEnvio } from "@/lib/rastreio/marcos";
import { avisarEtapaNova } from "@/lib/rastreio/registrar";
import type { OrigemDoPedido } from "@/lib/rastreio/tipos";
import { abrir, chaveDeIntegracoes, selar } from "@/lib/security/secret-box";
import {
  concluirPassada, contextoDoTokenMe, marcarReautorizar, reivindicarPassada, trocarTokens, type ConexaoMelhorEnvio,
} from "@/lib/stores/melhorenvio-conexoes";
import { gravarMarco, pedidosACaminho, type PedidoACaminho } from "@/lib/stores/rastreio-pedidos";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * A passada do Melhor Envio de uma loja: lê as etiquetas da conta, casa cada uma com o pedido a caminho pelo
 * código de rastreio e grava o marco (entregue, problema); o aviso sai pelo mesmo passo do pedido da Yampi.
 * Log e `last_error` levam só loja, id do pedido e código curto: nunca token, código de rastreio ou cliente.
 */

export const INTERVALO_DA_PASSADA_MS = 30 * 60_000;
const DIA_MS = 86_400_000;
const JANELA_DOS_PEDIDOS_MS = 30 * DIA_MS;
const RENOVAR_ANTES_MS = 7 * DIA_MS;
const TETO_DE_PAGINAS = 20;
const TENTATIVAS_DE_GRAVAR_TOKENS = 3;
const ESPERA_ENTRE_GRAVACOES_MS = 250;
/** Uma página ou uma renovação leva até 15 s (timeout do cliente), mais a gravação. */
const FOLGA_DO_PRAZO_MS = 30_000;
const ROTULO = "[rastreio/melhor-envio]";

export type ResultadoDosMarcos = { pedidos: number; casados: number; marcos: number; paginas: number };

/** Sininho de reconexão. Uma vez por queda: quem chama só chama na transição `ativa → reautorizar`. */
export async function avisarReconectarMelhorEnvio(tenantId: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from("notifications").insert({
    tenant_id: tenantId,
    type: "rastreio_melhor_envio",
    title: "Melhor Envio desconectado",
    body: "Reconecte o Melhor Envio para os avisos de entrega",
    href: "/painel/configuracoes?secao=integracoes",
  });
  if (error) throw new Error(error.message);
}

const DEPS = {
  reivindicar: reivindicarPassada, aCaminho: pedidosACaminho, listar: paginaDeEtiquetas, credenciais: credenciaisMelhorEnvio,
  chave: chaveDeIntegracoes, renovar: renovarToken, trocarTokens, reautorizar: marcarReautorizar,
  avisarReconectar: avisarReconectarMelhorEnvio, gravarMarco, avisar: avisarEtapaNova, concluir: concluirPassada,
  relogio: Date.now,
};
export type DepsMarcos = typeof DEPS;

type Contexto = { tenantId: string; agora: Date; prazo: number; chave: Buffer; cred: CredenciaisMelhorEnvio; deps: DepsMarcos };
type Acesso = { access: string; refreshEnc: string };
type PaginaDeEtiquetas = Awaited<ReturnType<typeof paginaDeEtiquetas>>;
type Concluir = (temEtiqueta: boolean | null, erro: string | null) => Promise<void>;

/**
 * `null` = loja sem conexão ativa, fora da vez (30 min), conexão que virou `reautorizar` nesta passada, ou
 * reconectada no meio dela. Erro do Melhor Envio fica em `last_error` (código) e sobe para o passo do cron.
 * `prazo` (no relógio de `deps.relogio`) é o fim do orçamento do cron: perto dele, nenhuma página nem renovação começa.
 */
export async function rodarMarcosDoMelhorEnvio(
  tenantId: string,
  agora: Date,
  prazo = Number.POSITIVE_INFINITY,
  deps: DepsMarcos = DEPS,
): Promise<ResultadoDosMarcos | null> {
  const conexao = await deps.reivindicar(tenantId, agora, INTERVALO_DA_PASSADA_MS);
  if (!conexao) return null;
  const primeiraPassada = conexao.primeiraPassadaEm === null;
  const concluir: Concluir = (temEtiqueta, erro) => deps.concluir(tenantId, { agora, primeiraPassada, temEtiqueta, erro });
  try {
    return await passada(tenantId, agora, prazo, conexao, concluir, deps);
  } catch (e) {
    await concluir(null, codigoDoErro(e)).catch((f) => console.error(`${ROTULO} ${tenantId}: a passada não fechou: ${mensagem(f)}`));
    throw e;
  }
}

async function passada(
  tenantId: string, agora: Date, prazo: number, conexao: ConexaoMelhorEnvio, concluir: Concluir, deps: DepsMarcos,
): Promise<ResultadoDosMarcos | null> {
  const chave = deps.chave();
  const cred = deps.credenciais();
  if (!chave || !cred) throw new Error(`${ROTULO} MELHORENVIO_CLIENT_ID/SECRET ou INTEGRATIONS_ENCRYPTION_KEY ausente`);
  const c: Contexto = { tenantId, agora, prazo, chave, cred, deps };

  // O token antes dos pedidos: loja sem envio por semanas ainda renova, e a renovação de 45 dias não vence parada.
  const acesso = await acessoValido(c, conexao);
  if (!acesso) return null;
  const pedidos = await deps.aCaminho(tenantId, new Date(agora.getTime() - JANELA_DOS_PEDIDOS_MS));
  if (pedidos.length === 0) {
    // Sem ler etiqueta, a primeira passada não conta: a importação da Yampi pode trazer agora pedidos já entregues.
    await deps.concluir(tenantId, { agora, primeiraPassada: false, temEtiqueta: null, erro: null });
    return { pedidos: 0, casados: 0, marcos: 0, paginas: 0 };
  }
  // A primeira passada depois de conectar só grava: a conta pode chegar com dezenas de etiquetas já entregues.
  const origem: OrigemDoPedido = conexao.primeiraPassadaEm === null ? "importacao" : "varredura";
  const r = await casarPaginas(c, acesso.access, pedidos, origem);
  if (r.recusada) {
    // A chave morreu antes do prazo (a loja trocou a senha ou tirou o app): renova já; a lista fica para a próxima passada.
    // ponytail: 401 que volta logo depois de renovar (escopo ou conta suspensa) renova a cada passada sem virar `reautorizar`; contar recusas seguidas se aparecer.
    if (!semTempo(c) && !(await renovar(c, acesso.refreshEnc))) return null;
    await concluir(r.viuEtiqueta, "chave_recusada");
  } else {
    await concluir(r.viuEtiqueta, null);
  }
  return { pedidos: pedidos.length, casados: r.casados, marcos: r.marcos, paginas: r.paginas };
}

/**
 * Morrer pelo `maxDuration` entre a resposta da renovação e a gravação perde o par novo (o Melhor Envio já
 * invalidou o antigo) e obriga a lojista a reconectar: perto do prazo, nenhuma renovação nem página começa.
 */
const semTempo = (c: Contexto): boolean => c.prazo - c.deps.relogio() < FOLGA_DO_PRAZO_MS;

async function acessoValido(c: Contexto, conexao: ConexaoMelhorEnvio): Promise<Acesso | null> {
  if (Date.parse(conexao.renovacaoExpiraEm) <= c.agora.getTime()) {
    await reautorizar(c, conexao.refreshTokenEnc, "renovacao_vencida");
    return null;
  }
  const expira = Date.parse(conexao.expiraEm);
  const lido = (): Acesso => ({ access: abrir(conexao.accessTokenEnc, contextoDoTokenMe(c.tenantId, "access"), c.chave), refreshEnc: conexao.refreshTokenEnc });
  if (expira - c.agora.getTime() >= RENOVAR_ANTES_MS) return lido();
  if (!semTempo(c)) return renovar(c, conexao.refreshTokenEnc);
  // Sem tempo para renovar: usa o acesso que ainda vale; vencido, a passada fica para a próxima rodada.
  return expira > c.agora.getTime() ? lido() : null;
}

/**
 * Renova o acesso. `refreshEnc` é o refresh selado vigente (o lido, ou o desta passada se ela já renovou).
 * `null` = a passada para: o Melhor Envio recusou (vira `reautorizar`) ou outra gravação ganhou (reconexão).
 */
async function renovar(c: Contexto, refreshEnc: string): Promise<Acesso | null> {
  let novos;
  try {
    novos = await c.deps.renovar(abrir(refreshEnc, contextoDoTokenMe(c.tenantId, "refresh"), c.chave), c.cred);
  } catch (e) {
    if (!(e instanceof ErroOAuthMelhorEnvio && e.tipo === "concessao_invalida")) throw e;
    await reautorizar(c, refreshEnc, "renovacao_recusada");
    return null;
  }
  const selado = {
    accessTokenEnc: selar(novos.accessToken, contextoDoTokenMe(c.tenantId, "access"), c.chave),
    refreshTokenEnc: selar(novos.refreshToken, contextoDoTokenMe(c.tenantId, "refresh"), c.chave),
    expiraEm: novos.expiraEm,
    renovacaoExpiraEm: novos.renovacaoExpiraEm,
  };
  // O Melhor Envio já invalidou o refresh antigo: falha de gravação repete com o par em memória, e nunca vira `reautorizar`.
  for (let tentativa = 1; ; tentativa++) {
    try {
      const gravou = await c.deps.trocarTokens(c.tenantId, refreshEnc, selado);
      return gravou ? { access: novos.accessToken, refreshEnc: selado.refreshTokenEnc } : null;
    } catch (e) {
      if (tentativa >= TENTATIVAS_DE_GRAVAR_TOKENS) throw e;
      await new Promise((ok) => setTimeout(ok, ESPERA_ENTRE_GRAVACOES_MS * tentativa));
    }
  }
}

/**
 * A transição `ativa → reautorizar` acontece uma vez; o sininho que falha não volta a ser tentado, então a
 * falha dele só vai para o log (subir levaria o `concluir` a apagar o motivo gravado em `last_error`).
 */
async function reautorizar(c: Contexto, refreshEnc: string, motivo: string): Promise<void> {
  if (!(await c.deps.reautorizar(c.tenantId, refreshEnc, motivo))) return;
  try {
    await c.deps.avisarReconectar(c.tenantId);
  } catch (e) {
    console.error(`${ROTULO} ${c.tenantId}: o sininho de reconexão não gravou: ${mensagem(e)}`);
  }
}

type Casamento = { casados: number; marcos: number; paginas: number; viuEtiqueta: boolean | null; recusada: boolean };

async function casarPaginas(c: Contexto, access: string, pedidos: PedidoACaminho[], origem: OrigemDoPedido): Promise<Casamento> {
  const faltam = new Map<string, PedidoACaminho>();
  for (const p of pedidos) {
    const codigo = normalizarCodigo(p.trackingCode);
    if (codigo !== null && !faltam.has(codigo)) faltam.set(codigo, p); // código repetido: fica o pedido mais novo
  }
  const r: Casamento = { casados: 0, marcos: 0, paginas: 0, viuEtiqueta: null, recusada: false };
  for (let pagina = 1; pagina <= TETO_DE_PAGINAS && faltam.size > 0; pagina++) {
    if (pagina > 1 && semTempo(c)) {
      console.warn(`${ROTULO} ${c.tenantId}: parou na página ${pagina - 1} pelo prazo do cron`);
      break;
    }
    let lida: PaginaDeEtiquetas;
    try {
      lida = await c.deps.listar(access, pagina);
    } catch (e) {
      if (!(e instanceof ErroMelhorEnvio && e.status === 401)) throw e;
      r.recusada = true;
      break;
    }
    r.paginas++;
    if (pagina === 1) r.viuEtiqueta = lida.ultimaPagina > 0; // só o 204 diz "conta sem etiqueta"
    for (const etiqueta of lida.etiquetas) {
      const codigo = normalizarCodigo(etiqueta.tracking);
      const pedido = codigo === null ? undefined : faltam.get(codigo);
      if (codigo === null || !pedido) continue;
      faltam.delete(codigo);
      r.casados++;
      const marco = marcoDaEtiqueta(etiqueta, c.agora);
      if (marco && (await gravarEAvisar(c, pedido, marco, origem))) r.marcos++;
    }
    if (acabou(lida, pagina, faltam)) break;
    if (pagina === TETO_DE_PAGINAS) console.warn(`${ROTULO} ${c.tenantId}: parou no teto de ${TETO_DE_PAGINAS} páginas`);
  }
  return r;
}

/** A lista vem da etiqueta mais nova à mais antiga, e a etiqueta nasce depois do pedido. */
function acabou(lida: PaginaDeEtiquetas, pagina: number, faltam: Map<string, PedidoACaminho>): boolean {
  if (faltam.size === 0 || pagina >= lida.ultimaPagina) return true;
  // A página INTEIRA abaixo da criação do pedido mais antigo que falta (com 1 dia de folga para o fuso): não há
  // mais nada a casar. Pela mais nova da página, não pela mais velha: uma etiqueta antiga fora de ordem não corta.
  // Laço e não `Math.max(...lista)`: página fora do padrão com dezenas de milhares de itens estoura o spread.
  let maisNova = Number.NEGATIVE_INFINITY;
  for (const e of lida.etiquetas) {
    const t = e.criadaEm ? Date.parse(e.criadaEm) : NaN;
    if (t > maisNova) maisNova = t;
  }
  let pedidoMaisAntigo = Number.POSITIVE_INFINITY;
  for (const p of faltam.values()) pedidoMaisAntigo = Math.min(pedidoMaisAntigo, Date.parse(p.orderCreatedAt));
  return maisNova > Number.NEGATIVE_INFINITY && maisNova < pedidoMaisAntigo - DIA_MS;
}

/** `true` = o marco mudou a etapa. Um pedido que falha não para os outros. */
async function gravarEAvisar(c: Contexto, pedido: PedidoACaminho, marco: MarcoDoMelhorEnvio, origem: OrigemDoPedido): Promise<boolean> {
  let gravado;
  try {
    gravado = await c.deps.gravarMarco(c.tenantId, pedido.id, marco);
  } catch (e) {
    console.error(`${ROTULO} ${c.tenantId}: pedido ${pedido.id} não gravou: ${mensagem(e)}`);
    return false;
  }
  if (!gravado) return false; // purgado
  try {
    await c.deps.avisar(c.tenantId, gravado, { origem, atualizadoEm: marco.em, numero: pedido.numero });
  } catch (e) {
    console.error(`${ROTULO} ${c.tenantId}: pedido ${pedido.id} gravou, mas o aviso falhou: ${mensagem(e)}`);
  }
  return gravado.mudou;
}

/** `last_error` só aceita código curto (`^[a-z0-9_]{1,40}$`); a tela do cartão traduz. */
function codigoDoErro(e: unknown): string {
  if (e instanceof ErroMelhorEnvio) return e.status === 0 ? "sem_resposta" : `http_${e.status}`;
  if (e instanceof ErroOAuthMelhorEnvio) return `renovacao_${e.tipo}`;
  return "erro";
}

const mensagem = (e: unknown): string => (e instanceof Error ? e.message : String(e));
