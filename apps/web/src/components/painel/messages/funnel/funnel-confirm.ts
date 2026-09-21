/**
 * Confirmação do funil: N chamadas, em série, sem transação (spec 4.4).
 *
 * Por etapa: mensagem PRIMEIRO; se relâmpago, oferta DEPOIS. A rota do
 * relâmpago em modo rascunho exige um `schedules` pendente e sem recorrência
 * para o broadcast — criar a oferta antes dá 400.
 *
 * Para no primeiro erro. `progress` diz o que já existe no servidor; chamar de
 * novo com ele retoma de onde parou sem duplicar mensagem (inclusive quando o
 * que falhou foi só a oferta).
 *
 * Nenhuma exceção escapa do laço: payload inválido ou `fetch` rejeitado viram
 * `ConfirmFailure`, senão as mensagens já agendadas ficariam sem relatório.
 */
import { toPlanLimitError } from "@/lib/billing/plan-limit-client";
import { messagePayload, offerPayload, type FunnelRun, type StepPlan } from "./funnel-plan";

export type PostJson = (url: string, body: unknown) => Promise<Response>;

export type FunnelProgress = {
  /** stepId → id do broadcast criado. */
  scheduled: Readonly<Record<string, string>>;
  offersCreated: readonly string[];
};

export type ConfirmFailure = {
  stepId: string;
  stage: "mensagem" | "oferta";
  message: string;
  upgradeUrl: string | null;
};

export type ConfirmOutcome = {
  progress: FunnelProgress;
  failure: ConfirmFailure | null;
  /** Plano de cada etapa cuja mensagem foi agendada NESTA chamada (ver `applyProgress`). */
  scheduledPlans: Readonly<Record<string, StepPlan>>;
};

export const EMPTY_PROGRESS: FunnelProgress = { scheduled: {}, offersCreated: [] };

const SEM_CONEXAO = "Sem conexão com o servidor. Confira a Agenda antes de tentar de novo.";
const ETAPA_INVALIDA = "Etapa com campo faltando ou quantidade inválida. Revise a etapa antes de tentar de novo.";

export function isStepDone(p: StepPlan, progress: FunnelProgress): boolean {
  const id = p.step.id;
  return id in progress.scheduled && (p.step.kind !== "relampago" || progress.offersCreated.includes(id));
}

/**
 * Etapa com mensagem no servidor usa o plano de quando foi agendada (`frozen`),
 * não o recalculado: etapas anteriores, loja e nicho seguem editáveis e a oferta
 * da retomada tem que sair com o que o texto no grupo anunciou. E sempre entra
 * (`included: true`): desmarcar ou virar passado não deixa a mensagem sem
 * oferta — quem decide é o servidor.
 */
export function applyProgress(
  plans: readonly StepPlan[],
  progress: FunnelProgress,
  frozen: Readonly<Record<string, StepPlan>>,
): StepPlan[] {
  return plans.map((p) => (p.step.id in progress.scheduled ? { ...(frozen[p.step.id] ?? p), included: true } : p));
}

/** Monta o corpo e posta; exceção vira texto de erro (nada escapa). */
async function enviar(post: PostJson, url: string, montar: () => unknown): Promise<Response | string> {
  let body: unknown;
  try {
    body = montar();
  } catch {
    return ETAPA_INVALIDA;
  }
  try {
    return await post(url, body);
  } catch {
    return SEM_CONEXAO;
  }
}

async function falha(res: Response | string, stepId: string, stage: ConfirmFailure["stage"], fallback: string): Promise<ConfirmFailure> {
  if (typeof res === "string") return { stepId, stage, message: res, upgradeUrl: null };
  const erro = await toPlanLimitError(res, fallback);
  return { stepId, stage, message: erro.message, upgradeUrl: erro.upgradeUrl };
}

export async function confirmFunnel(opts: {
  slug: string;
  plans: readonly StepPlan[];
  run: FunnelRun;
  progress: FunnelProgress;
  post: PostJson;
}): Promise<ConfirmOutcome> {
  let scheduled: Readonly<Record<string, string>> = { ...opts.progress.scheduled };
  let offersCreated: readonly string[] = [...opts.progress.offersCreated];
  let scheduledPlans: Readonly<Record<string, StepPlan>> = {};
  const agora = (failure: ConfirmFailure | null): ConfirmOutcome => ({ progress: { scheduled, offersCreated }, failure, scheduledPlans });
  const urlMensagens = `/api/campanhas/${encodeURIComponent(opts.slug)}/messages`;

  for (const p of opts.plans) {
    if (!p.included) continue;
    const id = p.step.id;

    if (!(id in scheduled)) {
      const res = await enviar(opts.post, urlMensagens, () => messagePayload(p, opts.run));
      if (typeof res === "string" || !res.ok) return agora(await falha(res, id, "mensagem", "Erro ao agendar mensagem."));
      const criada = (await res.json().catch(() => null)) as { id?: unknown } | null;
      if (typeof criada?.id !== "string") {
        return agora({ stepId: id, stage: "mensagem", message: "A mensagem pode ter sido agendada, mas a resposta veio sem id. Confira a Agenda antes de tentar de novo.", upgradeUrl: null });
      }
      scheduled = { ...scheduled, [id]: criada.id };
      scheduledPlans = { ...scheduledPlans, [id]: p };
    }

    if (p.step.kind === "relampago" && !offersCreated.includes(id)) {
      const broadcastId = scheduled[id];
      const res = await enviar(opts.post, "/api/relampago/offers", () => offerPayload(p, broadcastId));
      // 409 em modo rascunho só sai do unique de flash_offers.broadcast_id
      // (23505): a oferta JÁ existe — criada numa tentativa cuja resposta se
      // perdeu. Tratar como erro travaria toda retomada nesta etapa.
      const jaExiste = typeof res !== "string" && res.status === 409;
      if (!jaExiste && (typeof res === "string" || !res.ok)) return agora(await falha(res, id, "oferta", "Erro ao criar a oferta relâmpago."));
      offersCreated = [...offersCreated, id];
    }
  }
  return agora(null);
}
