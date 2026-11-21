import "server-only";

import { sendEmail } from "@/lib/email/send";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { avisoPendente, avisosParaEnviar, marcarAviso } from "@/lib/stores/rastreio-avisos";
import { rastreioLigado } from "@/lib/stores/rastreio-config";
import { abrirEmailDoPedido, lerPedido } from "@/lib/stores/rastreio-pedidos";

import { conviteDoGrupo } from "./convite";
import { montarEmailDoAviso } from "./email";
import { lojaDoRastreio } from "./loja";
import type { AvisoParaEnviar } from "./tipos";

/**
 * E-mail do aviso à compradora: na hora (registrar) e nas retentativas (cron). O plano ativo não é
 * checado aqui: é condição de nascimento do aviso. Nunca lança para fora de `enviarAvisoPorEmail`, e o
 * log só leva o id do aviso — nada de endereço, nome ou documento.
 */

/** Teto por loja e por rodada do cron. Em série fica abaixo das ~2 req/s do Resend. */
export const LIMITE_POR_RODADA = 20;
/** Minutos de espera depois da 1ª, 2ª, 3ª e 4ª falha: 5 tentativas, a última ~8,5 h depois da primeira. */
export const ESPERA_MIN = [5, 30, 120, 360] as const;
/**
 * Aviso sem gravação há mais que isso não sai: abaixo das 24 h da chave do Resend, então o e-mail que saiu
 * e não foi marcado nunca sai de novo. No fluxo normal a maior espera entre gravações é 6 h.
 */
const IDADE_MAXIMA_MS = 20 * 60 * 60 * 1000;
/**
 * Teto global do envio na hora: a chave do Resend é uma só para todos os e-mails da Girumo (~2 req/s).
 * Uma rajada de webhooks (a loja marca 300 pedidos de uma vez) deixa o excedente `pendente` e o cron manda.
 */
const TETO_NA_HORA = { chave: "rastreio:email-na-hora", max: 1, janelaMs: 1000 } as const;

const ROTULO = "[rastreio/email]";

export type DepsDoEnvio = {
  ligado: typeof rastreioLigado;
  aviso: typeof avisoPendente;
  vencidos: (tenantId: string, limite: number, agora: Date) => Promise<AvisoParaEnviar[]>;
  pedido: typeof lerPedido;
  emailDoPedido: typeof abrirEmailDoPedido;
  loja: (tenantId: string) => ReturnType<typeof lojaDoRastreio>;
  convite: (loja: Parameters<typeof conviteDoGrupo>[0], telefone: string | null) => ReturnType<typeof conviteDoGrupo>;
  enviar: typeof sendEmail;
  marcar: typeof marcarAviso;
  agora: () => Date;
  /** true = o envio na hora passou do teto global. */
  estourou: () => Promise<boolean>;
};

function depsReais(): DepsDoEnvio {
  return {
    ligado: rastreioLigado,
    aviso: avisoPendente,
    vencidos: (tenantId, limite, agora) => avisosParaEnviar(tenantId, "email", limite, agora),
    pedido: lerPedido,
    emailDoPedido: abrirEmailDoPedido,
    loja: (tenantId) => lojaDoRastreio(tenantId),
    convite: (loja, telefone) => conviteDoGrupo(loja, telefone),
    enviar: sendEmail,
    marcar: marcarAviso,
    agora: () => new Date(),
    estourou: () => checkRateLimit(TETO_NA_HORA.chave, TETO_NA_HORA.max, TETO_NA_HORA.janelaMs),
  };
}

/** Quando tentar de novo depois de `falhas` falhas; `null` = desistir (a 5ª falha). */
export function proximaTentativa(falhas: number, agora: Date): Date | null {
  const minutos = ESPERA_MIN[falhas - 1];
  return minutos === undefined ? null : new Date(agora.getTime() + minutos * 60_000);
}

function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

type Saida = "enviado" | "pulado" | "falha";

/**
 * A etapa do aviso ainda é a do pedido. A etapa não volta; o único passo à frente sem aviso próprio é
 * `confirmado` → `separando`, então o "pagamento confirmado" ainda sai. Qualquer outro (enviado → problema,
 * cancelado) faria o e-mail chegar fora de ordem.
 */
function etapaAindaVale(aviso: AvisoParaEnviar, etapaDoPedido: string): boolean {
  return etapaDoPedido === aviso.etapa || (aviso.etapa === "confirmado" && etapaDoPedido === "separando");
}

/** Pula (sem retentativa) ou envia; a falha devolve o código para `tracking_notices.error`. */
async function tentar(tenantId: string, aviso: AvisoParaEnviar, deps: DepsDoEnvio, agora: Date): Promise<[Saida, string | null]> {
  if (agora.getTime() - Date.parse(aviso.updatedAt) > IDADE_MAXIMA_MS) return ["pulado", "aviso_vencido"];
  if (!(await deps.ligado(tenantId))) return ["pulado", "rastreio_desligado"];
  const pedido = await deps.pedido(tenantId, aviso.orderId);
  if (!pedido) return ["pulado", "pedido_nao_encontrado"];
  // "Parar avisos" vence a corrida: o pedido é lido agora, não quando o aviso nasceu.
  if (pedido.noticesStoppedAt) return ["pulado", "avisos_parados"];
  if (!etapaAindaVale(aviso, pedido.etapa)) return ["pulado", "etapa_superada"];
  const to = deps.emailDoPedido(pedido);
  if (!to) return ["pulado", "sem_email"];
  const loja = await deps.loja(tenantId);
  if (!loja) return ["pulado", "sem_config"];

  const convite = await deps.convite(loja, pedido.buyerPhone);
  const { subject, html, text } = montarEmailDoAviso(loja, pedido, aviso.etapa, convite);
  const saiu = await deps.enviar({
    to, subject, html, text, tenantId, kind: "rastreio", fromName: loja.nome,
    // Com `resends`, o reenvio manual é um e-mail novo; sem ele o Resend devolveria o antigo sem mandar nada.
    idempotencyKey: `rastreio:${aviso.id}:${aviso.resends}`,
  });
  if (!saiu) return ["falha", "recusado_pelo_provedor"];
  return ["enviado", null];
}

/**
 * `true` = saiu agora. Toda marca é condicional (`se`): se outro envio, o "parar avisos" ou o reenvio manual
 * mexeram no aviso no meio, ela não grava. Se a própria marca falhar, o aviso fica `pendente` e o cron o pega;
 * a chave do Resend não deixa o e-mail sair duas vezes.
 */
async function enviarUm(tenantId: string, aviso: AvisoParaEnviar, deps: DepsDoEnvio): Promise<boolean> {
  const agora = deps.agora();
  const se = { status: "pendente", resends: aviso.resends } as const;
  try {
    let saida: [Saida, string | null];
    try {
      saida = await tentar(tenantId, aviso, deps, agora);
    } catch (e) {
      console.error(`${ROTULO} aviso ${aviso.id}: ${mensagem(e)}`);
      saida = ["falha", "erro_ao_enviar"];
    }
    const [tipo, error] = saida;
    if (tipo === "enviado") {
      await deps.marcar(tenantId, aviso.id, { status: "enviado", sentAt: agora.toISOString(), error: null, se });
      return true;
    }
    if (tipo === "pulado") {
      await deps.marcar(tenantId, aviso.id, { status: "pulado", error, se });
      return false;
    }
    const nextTry = proximaTentativa(aviso.attempts + 1, agora);
    await deps.marcar(tenantId, aviso.id, {
      status: nextTry ? "pendente" : "falhou",
      somarTentativa: true,
      nextTryAt: nextTry ? nextTry.toISOString() : null,
      error,
      se,
    });
    return false;
  } catch (e) {
    console.error(`${ROTULO} aviso ${aviso.id}: a marca não gravou: ${mensagem(e)}`);
    return false;
  }
}

/**
 * O aviso de e-mail recém-criado, na hora. `true` = saiu agora; `false` com o aviso ainda `pendente` (teto,
 * falha de leitura) = o cron manda. Nunca lança.
 */
export async function enviarAvisoPorEmail(tenantId: string, avisoId: string, deps: DepsDoEnvio = depsReais()): Promise<boolean> {
  let aviso: AvisoParaEnviar | null;
  try {
    if (await deps.estourou()) return false;
    aviso = await deps.aviso(tenantId, avisoId);
  } catch (e) {
    console.error(`${ROTULO} aviso ${avisoId}: ${mensagem(e)}`);
    return false;
  }
  if (!aviso || aviso.canal !== "email") return false;
  return enviarUm(tenantId, aviso, deps);
}

/**
 * Retentativa do cron: os pendentes vencidos da loja, em série e sem o teto da hora. Devolve quantos
 * saíram; erro de leitura sobe para o passo do cron contá-lo.
 * // ponytail: relê loja e "rastreio ligado" por aviso (até 20 por rodada); guardar por rodada se pesar.
 */
export async function enviarEmailsPendentes(
  tenantId: string,
  agora: Date,
  limite: number = LIMITE_POR_RODADA,
  deps: DepsDoEnvio = depsReais(),
): Promise<number> {
  const avisos = await deps.vencidos(tenantId, limite, agora);
  let saiu = 0;
  for (const aviso of avisos) if (await enviarUm(tenantId, aviso, deps)) saiu++;
  return saiu;
}
