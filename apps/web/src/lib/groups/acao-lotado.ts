import type { EstadoGrupo } from "@/lib/groups/estado";
import { isUsableInvite } from "@/lib/links/resolve-click-target";

/**
 * Marcar e reabrir à mão (`POST /api/campanhas/[slug]/grupos/lotado`, contratos §4). Sem
 * `server-only`: a tela usa as mesmas mensagens no menu ⋯ antes de qualquer clique.
 */

export type AcaoLotado = "marcar" | "reabrir";
export type ResultadoDaAcao = "ok" | "ja_lotado" | "nao_lotado" | "ainda_cheio" | "nao_encontrado";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function lerAcaoLotado(
  body: unknown,
  grupos: EstadoGrupo[],
): { ok: true; grupo: EstadoGrupo; acao: AcaoLotado } | { ok: false; status: 400 | 404; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, status: 400, error: "Corpo inválido." };
  }
  const { groupId, acao } = body as Record<string, unknown>;
  if (acao !== "marcar" && acao !== "reabrir") {
    return { ok: false, status: 400, error: 'acao deve ser "marcar" ou "reabrir".' };
  }
  if (typeof groupId !== "string" || !UUID.test(groupId)) {
    return { ok: false, status: 400, error: "groupId inválido." };
  }
  // O grupo tem de ser DESTA campanha: o RPC só filtra tenant, e sem isto a tela de uma
  // campanha mexeria no grupo de outra da mesma loja.
  const grupo = grupos.find((g) => g.groupId === groupId);
  if (!grupo) return { ok: false, status: 404, error: "Grupo não encontrado nesta campanha." };
  return { ok: true, grupo, acao };
}

/** Capacidade 0 ou ausente vale o teto do WhatsApp, como em `app.limiar_lotado`. */
function capacidadeReal(capacidade: number): number {
  return capacidade > 0 ? capacidade : 1024;
}

/** O primeiro número de membros que marca o grupo sozinho: ⌈95% da capacidade⌉ (973 em 1024). */
export function lotaDeNovoEm(capacidade: number): number {
  return Math.ceil((capacidadeReal(capacidade) * 95) / 100);
}

/** Texto do mockup para o Reabrir travado e para o 409 `ainda_cheio`. */
export function mensagemAindaCheio(membros: number, capacidade: number): string {
  const cap = capacidadeReal(capacidade);
  const pct = Math.round((membros / cap) * 100);
  return `Ainda está com ${membros.toLocaleString("pt-BR")} de ${cap.toLocaleString("pt-BR")} (${pct}%). O link só manda gente abaixo de 95%: aumente a capacidade ou espere sair gente.`;
}

/**
 * A nota do Reabrir no ⋯. Reaberto sem convite ou sem o nosso número como admin vai para a fila
 * que o link pula ("Sem convite: o link pula este grupo"): prometer prioridade aí seria mentira.
 * Mesma ordem de motivos do Detalhe (`detalheDoGrupo`).
 */
export function notaDoReabrir(
  g: Pick<EstadoGrupo, "podeReabrir" | "membros" | "capacidade" | "isAdmin" | "inviteUrl">,
): string {
  if (!g.podeReabrir) return mensagemAindaCheio(g.membros, g.capacidade);
  const lota = `Lota de novo sozinho em ${lotaDeNovoEm(g.capacidade).toLocaleString("pt-BR")}.`;
  if (!g.isAdmin) return `Reabre, mas o link pula este grupo enquanto o nosso número não for admin. ${lota}`;
  if (!isUsableInvite(g.inviteUrl)) return `Reabre, mas o link pula este grupo até ele ter convite. ${lota}`;
  return `Volta para o link com prioridade sobre o grupo que está enchendo. ${lota}`;
}

export type RespostaDaAcao =
  | { status: 200; corpo: { ok: true } }
  | { status: 404; corpo: { error: string } }
  | { status: 409; corpo: { error: string; motivo: "ainda_cheio" | "nao_lotado" | "ja_lotado" } };

/** `switch` sem `return` final: resultado novo do RPC é erro de `tsc`, não um 200 por engano. */
export function respostaDaAcao(
  resultado: ResultadoDaAcao,
  grupo: Pick<EstadoGrupo, "membros" | "capacidade">,
): RespostaDaAcao {
  switch (resultado) {
    case "ok":
      return { status: 200, corpo: { ok: true } };
    case "nao_encontrado":
      return { status: 404, corpo: { error: "Grupo não encontrado." } };
    case "ja_lotado":
      return { status: 409, corpo: { error: "Este grupo já está marcado como lotado.", motivo: "ja_lotado" } };
    case "nao_lotado":
      return { status: 409, corpo: { error: "Este grupo não está marcado como lotado.", motivo: "nao_lotado" } };
    case "ainda_cheio":
      return {
        status: 409,
        corpo: { error: mensagemAindaCheio(grupo.membros, grupo.capacidade), motivo: "ainda_cheio" },
      };
  }
}
