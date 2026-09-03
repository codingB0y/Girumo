export type NumeroPerfilDeclarado = "novo" | "antigo";

/** Declaração do lojista ao conectar. Ausente = null (instância legada / E2E). */
export function parseNumeroPerfil(
  input: unknown,
): { ok: true; value: NumeroPerfilDeclarado | null } | { ok: false; error: string } {
  if (input === undefined || input === null) return { ok: true, value: null };
  if (input === "novo" || input === "antigo") return { ok: true, value: input };
  return { ok: false, error: "numero_perfil deve ser 'novo' ou 'antigo'." };
}
