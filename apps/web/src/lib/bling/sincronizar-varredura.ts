import "server-only";

import { diaMesBR, horaBR } from "@/lib/date-br";
import type { AtualizacaoConexao, ConexaoBling } from "@/lib/stores/bling-conexoes";

import { horaDoBling, listarPedidos, type FiltroPedidos, type PaginaDePedidos } from "./api";
import { ErroBling, type ClienteBling } from "./cliente";
import {
  agoraMs,
  iso,
  mensagemDe,
  MINIMO_PARA_UMA_LINHA_MS,
  registrarSucesso,
  resto,
  rotulo,
  TAMANHO_DO_ERRO,
  tratarErro,
  type Execucao,
  type Rodada,
} from "./sincronizar-execucao";

/**
 * Varredura e histórico (spec §3, só no cron e na conexão). A varredura garante que nada se perde
 * quando o aviso falha (Bling desligou o webhook, Vercel fora, entrega perdida); o histórico importa
 * os 90 dias da conexão aos poucos, sem encher a fila na frente das vendas novas. Os dois param antes
 * da reserva da fila, e cada página para no prazo dela: o que já está na fila drena em toda execução.
 *
 * O Bling pagina por posição: entre duas leituras, o pedido que muda de novo sai da janela e puxa a
 * lista para trás, e o primeiro da página seguinte cai numa página já lida. Por isso a varredura
 * nunca pagina entre execuções: anda em fatias de tempo, cada uma lida inteira (da página 1 até a
 * vazia) numa execução só, e o progresso guardado é sempre o fim de uma fatia lida inteira.
 */

const MINUTO_MS = 60_000;
const HORA_MS = 60 * MINUTO_MS;
/** O cron roda a cada 5 min: começar outra passada antes de 4 só gasta cota. */
const INTERVALO_DA_VARREDURA_MS = 4 * MINUTO_MS;
/** O Bling retenta o aviso por 72 h: mais para trás disso a varredura não precisa olhar. */
const TETO_DA_JANELA_MS = 72 * HORA_MS;
/** O fuso do filtro `dataAlteracao*` não é documentado: 4 h de sobra cobrem qualquer um. */
const SOBRA_DO_FUSO_MS = 4 * HORA_MS;
/**
 * O tamanho da fatia fica guardado entre as execuções (`scan_slice_s`, null = 6 h): dobra quando ela
 * cabe e cai pela metade quando não cabe nas 10 páginas, até 1 min. No piso não há teto de páginas:
 * dividir mais não adianta, e o minuto é lido até a página vazia. Interrompida (falha, orçamento), volta
 * a no máximo 6 h: acima disso o tamanho só vale depois de uma fatia inteira.
 */
const FATIA_INICIAL_S = 6 * 3600;
const FATIA_MINIMA_MS = MINUTO_MS;
const PAGINAS_DA_FATIA = 10;
const PAGINAS_DO_HISTORICO = 3;
const POR_PAGINA = 100;
/** A reserva da fila: varredura e histórico só começam página com mais que isso (ou a metade do orçamento) pela frente. */
const RESERVA_MINIMA_DA_FILA_MS = 30_000;
/**
 * O prazo da página é o fim menos uma linha da fila (20 s) e esta folga: o que vem entre a página e a fila (o
 * timer que dispara depois da hora, a nova tentativa com o timeout mínimo de 1 s do cliente, gravar o que ela
 * trouxe). Sem folga, a página abortada no prazo deixaria a fila com um tico menos que uma linha.
 */
const FOLGA_DA_PAGINA_MS = 2_000;
/** O histórico só enche a fila até aqui: o que chega pelo aviso não espera atrás de 90 dias de pedidos. */
const TETO_DA_FILA = 300;
/** ≈1 h de cron sem a página da frente do histórico andar: se a seguinte responde, a da frente é pulada. */
const FALHAS_PARA_PULAR = 12;
/** Sem avançar há mais que isso (falha ou falta de tempo): o cartão avisa. */
const PARADA_VISIVEL_MS = HORA_MS;
/** Os avisos da varredura no cartão começam assim: quando ela volta a andar, saem. */
const ERRO_DA_VARREDURA = "A varredura do Bling";
/** E os do histórico parado (a frente falhou; ela e a seguinte falharam): saem quando a página da frente anda. */
const HISTORICO_PAROU = "Importação do histórico parou";
const HISTORICO_PARADO = "Importação do histórico parada";

/** Como acabou a leitura de uma fatia: inteira (veio a página vazia), grande (10 páginas cheias) ou parada. */
type Fatia = { fim: "inteira" | "grande" | "falhou" | "sem_tempo"; mudou: number };
/** Uma página lida, o motivo da falha, ou "sem_tempo" (o prazo da página passou). */
type Leitura = PaginaDePedidos | { falha: string } | "sem_tempo";

/** A fila sempre drena: varredura e histórico só começam página com mais que a reserva dela pela frente. */
function podeComecarPagina(ex: Execucao): boolean {
  return resto(ex) > Math.max(RESERVA_MINIMA_DA_FILA_MS, ex.orcamento / 2);
}

/**
 * A página, o motivo da falha (o erro já foi contado e tratado; quem chama para de paginar) ou "sem_tempo": a
 * página lenta abortada no prazo dela é falta de tempo, não falha — nem erro nem disjuntor, e a rodada segue
 * para a fila. A que responde prova que a listagem do Bling funciona nesta execução (`listagemRespondeu`).
 */
async function lerPagina(r: Rodada, cliente: ClienteBling, filtro: FiltroPedidos): Promise<Leitura> {
  try {
    const pagina = await listarPedidos(cliente, filtro, r.ex.fim - MINIMO_PARA_UMA_LINHA_MS - FOLGA_DA_PAGINA_MS);
    r.ex.listagemRespondeu = true;
    await registrarSucesso(r);
    avisarTortos(r, filtro.pagina, pagina);
    return pagina;
  } catch (e) {
    if (e instanceof ErroBling && e.prazoEsgotado) return "sem_tempo";
    await tratarErro(r, e);
    return { falha: mensagemDe(e) };
  }
}

/** Só as contagens: o item torto pode ter nome e documento da cliente. */
function avisarTortos(r: Rodada, numero: number, p: PaginaDePedidos): void {
  const tortos = p.brutos - p.pedidos.length;
  if (tortos === 0) return;
  console.warn(
    `[bling/sincronizar] ${rotulo(r.ex.tenantId)}: ${tortos} pedido(s) da página ${numero} sem id, situação ou total válido; ${p.descartados.length} com id na fila pelo aviso`,
  );
}

/**
 * Os pedidos da página na fila. O torto com id entra como aviso: o processamento busca o pedido
 * inteiro. Devolve só o que os pedidos mudaram — o aviso marca sempre, e contá-lo faria a varredura
 * parecer achar venda nova enquanto o torto estiver na janela.
 */
async function enfileirarPagina(r: Rodada, origem: "varredura" | "historico", p: PaginaDePedidos): Promise<number> {
  const { deps, tenantId } = r.ex;
  if (p.descartados.length > 0) await deps.pedidos.enfileirarPedidos(tenantId, "aviso", p.descartados.map((id) => ({ id })));
  return p.pedidos.length > 0 ? deps.pedidos.enfileirarPedidos(tenantId, origem, p.pedidos) : 0;
}

/**
 * Pedidos alterados desde a última passada; só o que mudou vira pendente. A passada que não cabe numa
 * execução continua na próxima, do fim da última fatia lida inteira; a fatia interrompida (falha,
 * orçamento, banco) não grava progresso e é relida inteira.
 */
export async function varrer(r: Rodada, cliente: ClienteBling): Promise<void> {
  const fim = agoraMs(r.ex);
  const inicio = inicioDaPassada(r.conexao, fim);
  if (inicio === null) return;
  // Parou antes do fim, por falha ou por falta de tempo: sem avanço há mais de 1 h, o cartão avisa.
  if (await lerFatias(r, cliente, inicio, fim)) await avisarSeParada(r);
}

/**
 * De onde a varredura desta execução começa; null = cedo. A passada em andamento continua sem esperar;
 * senão, uma nova a cada 4 min, do cursor (no máximo 72 h antes) com 4 h de sobra. Nunca antes de
 * 76 h: o Bling retenta o aviso por 72 h, e um trecho que falha para sempre acaba saindo da janela.
 */
function inicioDaPassada(c: ConexaoBling, fim: number): number | null {
  const piso = fim - TETO_DA_JANELA_MS - SOBRA_DO_FUSO_MS;
  const emAndamento = c.scanFrom ? Date.parse(c.scanFrom) : Number.NaN;
  if (Number.isFinite(emAndamento)) return Math.max(emAndamento, piso);
  const varridaHa = c.lastScanAt ? fim - Date.parse(c.lastScanAt) : Number.POSITIVE_INFINITY;
  if (varridaHa < INTERVALO_DA_VARREDURA_MS) return null;
  const cursor = Date.parse(c.scanCursor ?? c.connectedAt);
  const teto = fim - TETO_DA_JANELA_MS;
  return (Number.isFinite(cursor) ? Math.max(cursor, teto) : teto) - SOBRA_DO_FUSO_MS;
}

/** O tamanho da próxima fatia (s), como está guardado: null = 6 h. */
const fatiaGuardadaS = (c: ConexaoBling): number => c.scanSliceS ?? FATIA_INICIAL_S;

/** As fatias de `comeco` até `fim`, em ordem, cada uma do tamanho guardado. true = parou antes do fim. */
async function lerFatias(r: Rodada, cliente: ClienteBling, comeco: number, fim: number): Promise<boolean> {
  let inicio = comeco;
  // O que mudou desde a última gravação: vai junto com a próxima fatia inteira.
  let mudou = 0;
  while (inicio < fim) {
    const tamanho = Math.min(fim - inicio, fatiaGuardadaS(r.conexao) * 1000);
    const fatia = await lerFatia(r, cliente, inicio, inicio + tamanho);
    mudou += fatia.mudou;
    r.ex.varredura += fatia.mudou;
    if (fatia.fim === "inteira") {
      // Coube: a próxima pode ter o dobro (a do fim da passada, cortada, não encolhe o tamanho guardado).
      await avancar(r, inicio + tamanho, fim, mudou > 0, Math.max(fatiaGuardadaS(r.conexao), Math.floor((2 * tamanho) / 1000)));
      inicio += tamanho;
      mudou = 0;
      continue;
    }
    if (fatia.fim !== "grande") return interrompida(r);
    // Não coube nas 10 páginas (só acontece acima do piso): de novo da página 1, com a metade — reler só
    // gasta requisição (a fila ignora o que não mudou).
    await guardarFatia(r, Math.max(Math.floor(tamanho / 2), FATIA_MINIMA_MS));
  }
  return false;
}

/**
 * Fatia interrompida (falha, orçamento): relida na próxima execução com no máximo 6 h. Um pedido que
 * falha sempre não prende mais que isso antes dele até o teto o liberar, e uma fatia grande demais para
 * o tempo de uma execução não volta inteira. No bloco denso o tamanho já é menor e fica.
 */
async function interrompida(r: Rodada): Promise<true> {
  if (fatiaGuardadaS(r.conexao) > FATIA_INICIAL_S) await guardarFatia(r, FATIA_INICIAL_S * 1000);
  return true;
}

/**
 * Páginas da fatia `[de, ate]` até a vazia (só ela prova que a fatia acabou: `listarPedidos` descarta
 * item torto): até 10, e sem teto no piso (1 min ou menos), limitado só pelo orçamento.
 */
async function lerFatia(r: Rodada, cliente: ClienteBling, de: number, ate: number): Promise<Fatia> {
  const filtro = { dataAlteracaoInicial: horaDoBling(new Date(de)), dataAlteracaoFinal: horaDoBling(new Date(ate)) };
  const teto = ate - de > FATIA_MINIMA_MS ? PAGINAS_DA_FATIA : Number.POSITIVE_INFINITY;
  let mudou = 0;
  for (let pagina = 1; pagina <= teto; pagina += 1) {
    if (!podeComecarPagina(r.ex)) return { fim: "sem_tempo", mudou };
    const lida = await lerPagina(r, cliente, { pagina, limite: POR_PAGINA, ...filtro });
    if (lida === "sem_tempo") return { fim: "sem_tempo", mudou };
    if ("falha" in lida) return { fim: "falhou", mudou };
    if (lida.brutos === 0) return { fim: "inteira", mudou };
    mudou += await enfileirarPagina(r, "varredura", lida);
  }
  return { fim: "grande", mudou };
}

/** O tamanho da próxima fatia, gravado já: a execução seguinte começa dele, não de 6 h no meio de um bloco denso. */
async function guardarFatia(r: Rodada, ms: number): Promise<void> {
  const scanSliceS = Math.floor(ms / 1000);
  await r.ex.deps.conexoes.atualizarConexao(r.ex.tenantId, { scan_slice_s: scanSliceS });
  r.conexao = { ...r.conexao, scanSliceS };
}

/**
 * Fatia lida inteira: o progresso anda até o fim dela, e a que chega ao fim fecha a passada. Só aqui
 * `last_scan_at` muda; o tamanho da próxima fatia vai junto, se mudou. O aviso de varredura parada sai
 * do cartão; os outros erros ficam o dia.
 */
async function avancar(r: Rodada, ate: number, fimDaPassada: number, mudou: boolean, proximaS: number): Promise<void> {
  const agora = iso(agoraMs(r.ex));
  const fechou = ate >= fimDaPassada;
  const scanCursor = fechou ? iso(fimDaPassada) : r.conexao.scanCursor;
  const scanFrom = fechou ? null : iso(ate);
  const outraFatia = proximaS !== fatiaGuardadaS(r.conexao);
  const estavaParada = r.conexao.lastError?.startsWith(ERRO_DA_VARREDURA) === true;
  await r.ex.deps.conexoes.atualizarConexao(r.ex.tenantId, {
    ...(fechou ? { scan_cursor: scanCursor } : {}),
    scan_from: scanFrom,
    last_scan_at: agora,
    ...(mudou ? { last_scan_change_at: agora } : {}),
    ...(outraFatia ? { scan_slice_s: proximaS } : {}),
    ...(estavaParada ? { last_error: null, last_error_at: null } : {}),
  });
  const semErro = estavaParada ? { lastError: null, lastErrorAt: null } : {};
  const fatia = outraFatia ? { scanSliceS: proximaS } : {};
  r.conexao = { ...r.conexao, scanCursor, scanFrom, lastScanAt: agora, ...fatia, ...semErro };
}

/** Nenhum avanço há mais de 1 h, por falha ou falta de tempo: o cartão e o log mostram (o erro em si já foi contado). */
async function avisarSeParada(r: Rodada): Promise<void> {
  const desde = r.conexao.lastScanAt ?? r.conexao.connectedAt;
  if (!(agoraMs(r.ex) - Date.parse(desde) > PARADA_VISIVEL_MS)) return;
  const quando = horaDeBrasilia(desde);
  console.error(`[bling/sincronizar] ${rotulo(r.ex.tenantId)}: a varredura não avança desde ${quando}`);
  await anotarNoCartao(
    r,
    `${ERRO_DA_VARREDURA} não avança desde ${quando} (o Bling está lento ou devolvendo erro). As vendas novas continuam chegando pelo aviso.`,
  );
}

/** "13/10 às 12:05", no fuso de Brasília. */
function horaDeBrasilia(instante: string): string {
  return `${diaMesBR(instante) ?? ""} às ${horaBR(instante)}`;
}

/** O texto no cartão, e o que mais tiver de ir na mesma gravação. */
async function anotarNoCartao(r: Rodada, texto: string, junto: AtualizacaoConexao = {}): Promise<void> {
  const erro = { last_error: texto.slice(0, TAMANHO_DO_ERRO), last_error_at: iso(agoraMs(r.ex)) };
  await r.ex.deps.conexoes.atualizarConexao(r.ex.tenantId, { ...junto, ...erro });
  r.conexao = { ...r.conexao, lastError: erro.last_error, lastErrorAt: erro.last_error_at };
}

/**
 * Até 3 páginas por execução, com a fila abaixo de 300; a página vazia encerra o histórico. Cada
 * execução começa uma página antes da página da frente (`backfill_page`, a primeira não lida): pedido
 * apagado no Bling entre as duas puxa a lista para trás, e o primeiro da página seguinte cairia numa
 * já lida. Reler não duplica nada (o histórico só cria o que não existe).
 */
export async function importarHistorico(r: Rodada, cliente: ClienteBling): Promise<void> {
  const { backfillDoneAt, backfillFrom, backfillUntil } = r.conexao;
  if (backfillDoneAt || !backfillFrom || !backfillUntil) return;
  const filtro = { limite: POR_PAGINA, dataInicial: backfillFrom, dataFinal: backfillUntil };
  let pagina: number | null = Math.max(1, r.conexao.backfillPage - 1);
  for (let lidas = 0; pagina !== null && lidas < PAGINAS_DO_HISTORICO; lidas += 1) {
    if (!(await cabePaginaDoHistorico(r.ex))) return;
    pagina = await seguirDoHistorico(r, pagina, await lerPagina(r, cliente, { pagina, ...filtro }));
  }
}

/** A reserva da fila, e a fila abaixo de 300: o que chega pelo aviso não espera atrás de 90 dias de pedidos. */
async function cabePaginaDoHistorico(ex: Execucao): Promise<boolean> {
  return podeComecarPagina(ex) && (await ex.deps.pedidos.contarPendentes(ex.tenantId)) < TETO_DA_FILA;
}

/**
 * O que a página lida decide: a próxima a ler, ou null para parar nesta execução. A relida (antes da frente)
 * que falha não conta nem impede: ela já foi lida quando era a frente. Depois da frente só se lê a seguinte
 * que decide a válvula (`falhouAFrente`).
 */
async function seguirDoHistorico(r: Rodada, pagina: number, lida: Leitura): Promise<number | null> {
  const frente = r.conexao.backfillPage;
  if (lida === "sem_tempo") return null;
  if ("falha" in lida) {
    if (pagina < frente) return frente;
    return pagina === frente ? falhouAFrente(r, lida.falha) : consultaParada(r);
  }
  if (pagina > frente) await pularAFrente(r);
  if (lida.brutos === 0) return terminarHistorico(r);
  r.ex.historico += await enfileirarPagina(r, "historico", lida);
  // A página da frente andou (a relida não conta): quem morre no meio retoma daqui, e as falhas zeram.
  if (pagina >= r.conexao.backfillPage) await andarHistorico(r, pagina + 1);
  return pagina + 1;
}

/** A página da frente andou: as falhas zeram e o aviso de histórico parado sai do cartão (o de página pulada e os outros ficam). */
async function andarHistorico(r: Rodada, pagina: number): Promise<void> {
  const parado = [HISTORICO_PAROU, HISTORICO_PARADO].some((aviso) => r.conexao.lastError?.startsWith(aviso));
  await r.ex.deps.conexoes.atualizarConexao(r.ex.tenantId, {
    backfill_page: pagina,
    backfill_fails: 0,
    ...(parado ? { last_error: null, last_error_at: null } : {}),
  });
  const semAviso = parado ? { lastError: null, lastErrorAt: null } : {};
  r.conexao = { ...r.conexao, backfillPage: pagina, backfillFails: 0, ...semAviso };
}

/**
 * A página da frente falhou: o cartão diz onde parou, e conta mais uma (`backfill_fails`) só se outra listagem
 * respondeu nesta execução (a varredura ou a relida) — numa queda total do Bling a página não tem culpa, e a conta
 * da queda pularia uma página boa na primeira falha depois da volta. Da 12ª em diante (≈1 h de cron), antes de
 * pular, a seguinte é lida: só ela distingue a página quebrada do Bling fora.
 */
async function falhouAFrente(r: Rodada, falha: string): Promise<number | null> {
  const pagina = r.conexao.backfillPage;
  const falhas = r.conexao.backfillFails + (r.ex.listagemRespondeu ? 1 : 0);
  await anotarNoCartao(r, `${HISTORICO_PAROU} na página ${pagina}: ${falha}`, { backfill_fails: falhas });
  r.conexao = { ...r.conexao, backfillFails: falhas };
  return falhas >= FALHAS_PARA_PULAR ? pagina + 1 : null;
}

/**
 * A seguinte respondeu: a da frente está quebrada mesmo e é pulada — só o histórico de 90 dias a perde; a venda
 * ao vivo não passa por aqui. A seguinte vira a frente e segue como qualquer página (o que ela trouxe vai à fila).
 */
async function pularAFrente(r: Rodada): Promise<void> {
  const { backfillPage: pagina, backfillFails: falhas } = r.conexao;
  const pulou = `pulou a página ${pagina} depois de ${falhas} tentativas`;
  console.error(`[bling/sincronizar] ${rotulo(r.ex.tenantId)}: importação do histórico ${pulou}`);
  await anotarNoCartao(r, `Importação do histórico ${pulou}`, { backfill_page: pagina + 1, backfill_fails: 0 });
  r.conexao = { ...r.conexao, backfillPage: pagina + 1, backfillFails: 0 };
}

/**
 * A seguinte também falhou: é o Bling ou a consulta, não a página. Nada é pulado (uma queda do Bling não apaga
 * histórico) e a conta zera: as falhas eram do Bling, e contá-las contra a página a pularia na primeira falha depois
 * da volta. A próxima execução tenta de novo, e a página anda quando o Bling voltar.
 */
async function consultaParada(r: Rodada): Promise<null> {
  const pagina = r.conexao.backfillPage;
  console.error(`[bling/sincronizar] ${rotulo(r.ex.tenantId)}: importação do histórico parada na página ${pagina}: a seguinte também falhou`);
  await anotarNoCartao(
    r,
    `${HISTORICO_PARADO} na página ${pagina} (o Bling devolve erro para ela e para a seguinte). As vendas novas continuam chegando. A Girumo tenta de novo sozinha.`,
    { backfill_fails: 0 },
  );
  r.conexao = { ...r.conexao, backfillFails: 0 };
  return null;
}

async function terminarHistorico(r: Rodada): Promise<null> {
  const agora = iso(agoraMs(r.ex));
  await r.ex.deps.conexoes.atualizarConexao(r.ex.tenantId, { backfill_done_at: agora });
  r.conexao = { ...r.conexao, backfillDoneAt: agora };
  r.ex.historicoTerminou = true;
  return null;
}
