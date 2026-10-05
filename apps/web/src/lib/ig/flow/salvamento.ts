import type { Issue } from "./validate";

/** `erro` = vai tentar de novo sozinho; `falhou` = parou até a próxima edição. */
export type Salvamento = "salvo" | "pendente" | "salvando" | "erro" | "falhou";

/** O que a barra de cima mostra ao lado do nome. */
export function textoDoSalvamento(estado: Salvamento): string {
  switch (estado) {
    case "salvo":
      return "Salvo";
    case "pendente":
    case "salvando":
      return "Salvando…";
    case "erro":
      return "Não salvou. Tentando de novo…";
    case "falhou":
      return "Não deu pra salvar. Edite de novo pra tentar.";
  }
}

export const MAX_TENTATIVAS = 4;
const ATRASO_MS = 800;

/** Rede caída (status 0) e 5xx valem outra tentativa; 4xx não vai mudar sozinho. */
export function valeTentarDeNovo(status: number): boolean {
  return status === 0 || status >= 500;
}

/** Espera antes do próximo PATCH: 800 ms na edição, dobrando a cada falha. */
export function atrasoDoSalvamento(tentativas: number): number {
  return ATRASO_MS * 2 ** Math.min(tentativas, MAX_TENTATIVAS);
}

export type ResultadoPublicacao = { tipo: "ok" } | { tipo: "issues"; issues: Issue[] } | { tipo: "erro"; mensagem: string };

const MENSAGEM_PADRAO = "Não deu pra publicar. Tente de novo.";

function lerJson(texto: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(texto);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null; // 403 do assertPermission é texto puro
  }
}

/**
 * Só 409 com `issues` vira lista de pendências. Todo o resto (409 de versão,
 * 403, 404, 5xx, rede) é mensagem de erro, nunca uma pendência inventada.
 */
export function resultadoDaPublicacao(status: number, corpo: string): ResultadoPublicacao {
  if (status >= 200 && status < 300) return { tipo: "ok" };
  const json = lerJson(corpo);
  if (status === 409 && json && Array.isArray(json.issues)) return { tipo: "issues", issues: json.issues as Issue[] };
  const mensagem = json && typeof json.error === "string" && json.error.trim() ? json.error : MENSAGEM_PADRAO;
  return { tipo: "erro", mensagem };
}
