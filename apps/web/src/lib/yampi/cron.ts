import type { ResultadoDaConferencia } from "./conferir";

/** A agenda diária da mesma rota (`vercel.json`): nela, só a limpeza da base roda. */
export const AGENDA_DA_LIMPEZA = "0 6 * * *";

const PARADO_HA_MS = 3 * 60_000;
const JANELA_DO_REPROCESSO_MS = 24 * 3_600_000;
const EVENTOS_POR_EXECUCAO = 50;
const ORCAMENTO_DO_REPROCESSO_MS = 90_000;
const CONFERIR_A_CADA_MS = 3_600_000;
/**
 * Não começa outra conferência depois disto (desde o início): uma conferência lenta (recriar = 3 chamadas de até
 * 34 s cada) ainda cabe nos 300 s do `maxDuration`. A loja que ficou de fora é a primeira da próxima volta.
 */
const ORCAMENTO_DA_CONFERENCIA_MS = 180_000;
const CONEXOES_POR_EXECUCAO = 20;

export type DepsDoCron = {
  agora: () => number;
  listarParados: (p: { antesDe: Date; depoisDe: Date; limite: number }) => Promise<string[]>;
  processar: (eventoId: string) => Promise<void>;
  listarParaConferir: (antesDe: Date, limite: number) => Promise<string[]>;
  conferir: (tenantId: string) => Promise<ResultadoDaConferencia | null>;
  limpar: () => Promise<number>;
};

export type ResumoDoCronYampi = { reprocessados: number; conferidas: number; avisosRecriados: number; limpos: number | null; erros: number };

const mensagemDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * `/api/cron/yampi` a cada 5 min: reprocessa o aviso parado (o `after()` caiu ou um consumidor falhou) e confere
 * o aviso na Yampi de quem não é conferido há 1 h. Na agenda diária, só a limpeza da base (30 dias de aviso, 180 de
 * conversa). Cada passo é isolado: um que falha conta erro e não impede o outro. Log só com ids, nunca payload.
 */
export async function executarCronYampi(deps: DepsDoCron, agenda: string | null): Promise<ResumoDoCronYampi> {
  const resumo: ResumoDoCronYampi = { reprocessados: 0, conferidas: 0, avisosRecriados: 0, limpos: null, erros: 0 };
  if (agenda === AGENDA_DA_LIMPEZA) {
    try {
      resumo.limpos = await deps.limpar();
    } catch (e) {
      resumo.erros += 1;
      console.error(`[yampi/cron] limpeza: ${mensagemDe(e)}`);
    }
    return resumo;
  }

  const inicio = deps.agora();
  try {
    const parados = await deps.listarParados({
      antesDe: new Date(inicio - PARADO_HA_MS),
      depoisDe: new Date(inicio - JANELA_DO_REPROCESSO_MS),
      limite: EVENTOS_POR_EXECUCAO,
    });
    for (const id of parados) {
      if (deps.agora() - inicio > ORCAMENTO_DO_REPROCESSO_MS) break;
      try {
        await deps.processar(id);
        resumo.reprocessados += 1;
      } catch {
        // O processador já gravou o erro na coluna e logou os nomes.
        resumo.erros += 1;
        console.error(`[yampi/cron] evento ${id} segue parado`);
      }
    }
  } catch (e) {
    resumo.erros += 1;
    console.error(`[yampi/cron] eventos parados: ${mensagemDe(e)}`);
  }

  try {
    const lojas = await deps.listarParaConferir(new Date(inicio - CONFERIR_A_CADA_MS), CONEXOES_POR_EXECUCAO);
    for (const tenantId of lojas) {
      if (deps.agora() - inicio > ORCAMENTO_DA_CONFERENCIA_MS) break;
      try {
        const r = await deps.conferir(tenantId);
        if (!r) continue;
        resumo.conferidas += 1;
        if (r.aviso === "recriado") resumo.avisosRecriados += 1;
      } catch (e) {
        resumo.erros += 1;
        console.error(`[yampi/cron] conferir a loja ${tenantId}: ${mensagemDe(e)}`);
      }
    }
  } catch (e) {
    resumo.erros += 1;
    console.error(`[yampi/cron] conexões para conferir: ${mensagemDe(e)}`);
  }
  return resumo;
}
