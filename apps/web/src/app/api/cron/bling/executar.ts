import type { Parada, Resultado } from "@/lib/bling/sincronizar";

/**
 * As lojas de uma execução do cron do Bling (spec §3 "Varredura, histórico e drenagem"): em
 * sequência, na ordem da lista (quem varreu há mais tempo primeiro), cada uma com uma fatia do
 * orçamento; depois, se sobrar tempo, o e-mail de reconectar que não saiu. Fora do `route.ts`
 * porque rota do Next só exporta handler e config: aqui o teste troca o motor e o relógio.
 */

/** O `maxDuration` da rota: cada loja recebe a vida que resta à função (o motor não começa chamada com efeito que não cabe nela). */
const VIDA_DA_FUNCAO_MS = 300_000;
/** 30 s abaixo da vida da função: a última loja termina e a rota ainda responde. */
const ORCAMENTO_DA_EXECUCAO_MS = VIDA_DA_FUNCAO_MS - 30_000;
const FATIA_DA_LOJA_MS = 60_000;
/** O histórico de 90 dias anda 3 páginas por execução: pede mais tempo que a varredura. */
const FATIA_COM_HISTORICO_MS = 150_000;
/** A loja para 5 s antes do fim do orçamento: dá para soltar a trava e a rota responder. */
const FOLGA_DA_LOJA_MS = 5_000;
/** Menos que isso não vale abrir outra loja (trava, token, situações), nem reenviar e-mail: fica para daqui a 5 min. */
const MINIMO_PARA_COMECAR_MS = 10_000;

export type LojaParaSincronizar = { tenantId: string; historicoPendente: boolean };

export type MotorDoCron = {
  agora: () => number;
  listar: (agora: Date) => Promise<LojaParaSincronizar[]>;
  /** Nunca lança (contrato de `sincronizarLoja`): a falha de uma loja não para as outras. */
  sincronizar: (tenantId: string, gatilho: "cron", orcamentoMs: number, vidaMs: number) => Promise<Resultado>;
  /** Lojas em "reconectar" cujo e-mail não saiu (o alerta voltou para nulo). */
  listarSemAlerta: () => Promise<string[]>;
  /** Nunca lança (contrato de `avisarReconectar`). */
  avisarReconectar: (tenantId: string) => Promise<void>;
};

/** Só contagens: a resposta do cron não leva id de loja (o id vai para o log). */
export type ResumoDoCron = {
  lojas: number;
  adiadas: number;
  processados: number;
  falhas: number;
  paradas: Partial<Record<Parada, number>>;
};

export async function executarCron(motor: MotorDoCron): Promise<ResumoDoCron> {
  const inicio = motor.agora();
  const fim = inicio + ORCAMENTO_DA_EXECUCAO_MS;
  const lojas = await motor.listar(new Date(inicio));
  let resumo: ResumoDoCron = { lojas: 0, adiadas: 0, processados: 0, falhas: 0, paradas: {} };
  for (const loja of lojas) {
    const agora = motor.agora();
    const restante = fim - agora;
    if (restante < MINIMO_PARA_COMECAR_MS) break;
    const fatia = loja.historicoPendente ? FATIA_COM_HISTORICO_MS : FATIA_DA_LOJA_MS;
    const vida = inicio + VIDA_DA_FUNCAO_MS - agora;
    // A loja que falhou já escreveu a linha dela (`sincronizarLoja`), com o id: aqui só soma.
    const resultado = await motor.sincronizar(loja.tenantId, "cron", Math.min(restante - FOLGA_DA_LOJA_MS, fatia), vida);
    resumo = somar(resumo, resultado);
  }
  const adiadas = lojas.length - resumo.lojas;
  // Toda execução adiando loja = o cron não dá mais conta das lojas conectadas.
  if (adiadas > 0) console.warn(`[bling/cron] ${adiadas} loja(s) ficaram para a próxima execução`);
  await reenviarAlertas(motor, fim);
  return { ...resumo, adiadas };
}

/** O e-mail de reconectar que não saiu volta aqui, se sobrar tempo: a dona precisa saber que as vendas pararam. */
async function reenviarAlertas(motor: MotorDoCron, fim: number): Promise<void> {
  if (fim - motor.agora() < MINIMO_PARA_COMECAR_MS) return;
  try {
    for (const tenantId of await motor.listarSemAlerta()) {
      if (fim - motor.agora() < MINIMO_PARA_COMECAR_MS) return;
      await motor.avisarReconectar(tenantId);
    }
  } catch (e) {
    // Só a lista lança: as lojas já rodaram, e o resumo delas ainda sai.
    console.error(`[bling/cron] e-mails de reconectar: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function somar(resumo: ResumoDoCron, r: Resultado): ResumoDoCron {
  return {
    ...resumo,
    lojas: resumo.lojas + 1,
    processados: resumo.processados + r.processados,
    falhas: resumo.falhas + r.falhas,
    paradas: r.parou ? { ...resumo.paradas, [r.parou]: (resumo.paradas[r.parou] ?? 0) + 1 } : resumo.paradas,
  };
}
