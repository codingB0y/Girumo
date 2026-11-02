// Quais números da loja estão fora do ar há tempo suficiente para o alerta do Job 3.
//
// A loja tem até dois números: o dos grupos (`purpose = 'grupos'`, onde a
// sessão e o painel olham) e o do atendimento (`'privado'`, add-on). Cada um
// cai por conta própria — o atendimento conectado NÃO pode esconder a queda dos
// grupos, nem o contrário —, por isso `selectSessionRow` roda por finalidade.
//
// Sem `server-only`/Supabase de propósito — lógica pura, testável isolada.

import { isConnectedStatus, selectSessionRow } from "@/lib/session-select";
import type { EmailKind } from "./delivery-log";

/** Fora do ar há mais que isto = vale o e-mail. */
export const QUEDA_MS = 2 * 60 * 60 * 1000;

export type LinhaDoNumero = {
  status: string | null;
  updated_at: string | null;
  disconnected_at: string | null;
  purpose: string | null;
};

export type NumeroDaLoja = "grupos" | "privado";

/** O que cada número grava: dedupe do dia por `type`, e-mail por `kind`, aviso no sino. */
export const ALERTA_DO_NUMERO: Record<
  NumeroDaLoja,
  { type: string; kind: Extract<EmailKind, "disconnect" | "disconnect_privado">; title: string; body: string; href: string | null }
> = {
  grupos: {
    type: "disconnect_alert",
    kind: "disconnect",
    title: "WhatsApp desconectado",
    body: "Enviamos um e-mail avisando que o WhatsApp está desconectado há mais de 2h.",
    href: null,
  },
  privado: {
    type: "disconnect_alert_privado",
    kind: "disconnect_privado",
    title: "Número do atendimento desconectado",
    body: "Enviamos um e-mail avisando que o número do atendimento está desconectado há mais de 2h.",
    href: "/painel/conectar",
  },
};

/** Ordem fixa: o e-mail dos grupos sai antes do do atendimento. */
const NUMEROS: readonly NumeroDaLoja[] = ["grupos", "privado"];

/**
 * Números fora do ar há mais de 2 h, grupos antes. Caído = a linha que
 * representa o número não está conectada e tem `disconnected_at` válido e
 * <= agora − 2 h. Sem linha ou sem `disconnected_at` (nunca conectou: é
 * onboarding, não queda) = não avisa.
 */
export function numerosCaidos(linhas: readonly LinhaDoNumero[], agoraMs: number): NumeroDaLoja[] {
  return NUMEROS.filter((numero) => {
    const linha = selectSessionRow(linhas.filter((l) => l.purpose === numero));
    if (!linha || isConnectedStatus(linha.status)) return false;
    const caiuEmMs = linha.disconnected_at ? new Date(linha.disconnected_at).getTime() : NaN;
    return Number.isFinite(caiuEmMs) && caiuEmMs <= agoraMs - QUEDA_MS;
  });
}
