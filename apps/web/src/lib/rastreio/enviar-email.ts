import "server-only";

import { sendEmail } from "@/lib/email/send";
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

/** Pula (sem retentativa) ou envia; a falha devolve o código para `tracking_notices.error`. */
async function tentar(tenantId: string, aviso: AvisoParaEnviar, deps: DepsDoEnvio, agora: Date): Promise<[Saida, string | null]> {
  if (!(await deps.ligado(tenantId))) return ["pulado", "rastreio_desligado"];
  const pedido = await deps.pedido(tenantId, aviso.orderId);
  if (!pedido) return ["pulado", "pedido_nao_encontrado"];
  // "Parar avisos" vence a corrida: o pedido é lido agora, não quando o aviso nasceu.
  if (pedido.noticesStoppedAt) return ["pulado", "avisos_parados"];
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
  await deps.marcar(tenantId, aviso.id, { status: "enviado", sentAt: agora.toISOString(), error: null });
  return ["enviado", null];
}

/** `true` = saiu agora. Se a própria marca falhar, o aviso fica `pendente` e o cron o pega; a chave do Resend segura 24 h. */
async function enviarUm(tenantId: string, aviso: AvisoParaEnviar, deps: DepsDoEnvio, agora: Date): Promise<boolean> {
  try {
    let saida: [Saida, string | null];
    try {
      saida = await tentar(tenantId, aviso, deps, agora);
    } catch (e) {
      console.error(`${ROTULO} aviso ${aviso.id}: ${mensagem(e)}`);
      saida = ["falha", "erro_ao_enviar"];
    }
    const [tipo, error] = saida;
    if (tipo === "enviado") return true;
    if (tipo === "pulado") {
      await deps.marcar(tenantId, aviso.id, { status: "pulado", error });
      return false;
    }
    const nextTry = proximaTentativa(aviso.attempts + 1, agora);
    await deps.marcar(tenantId, aviso.id, {
      status: nextTry ? "pendente" : "falhou",
      somarTentativa: true,
      nextTryAt: nextTry ? nextTry.toISOString() : null,
      error,
    });
    return false;
  } catch (e) {
    console.error(`${ROTULO} aviso ${aviso.id}: a marca não gravou: ${mensagem(e)}`);
    return false;
  }
}

/** O aviso de e-mail recém-criado, na hora. `true` = saiu agora. Nunca lança. */
export async function enviarAvisoPorEmail(tenantId: string, avisoId: string, deps: DepsDoEnvio = depsReais()): Promise<boolean> {
  let aviso: AvisoParaEnviar | null;
  try {
    aviso = await deps.aviso(tenantId, avisoId);
  } catch (e) {
    console.error(`${ROTULO} aviso ${avisoId}: ${mensagem(e)}`);
    return false;
  }
  if (!aviso) return false;
  return enviarUm(tenantId, aviso, deps, deps.agora());
}

/**
 * Retentativa do cron: os pendentes vencidos da loja, em série. Devolve quantos saíram; erro de leitura
 * sobe para o passo do cron contá-lo.
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
  for (const aviso of avisos) if (await enviarUm(tenantId, aviso, deps, agora)) saiu++;
  return saiu;
}
