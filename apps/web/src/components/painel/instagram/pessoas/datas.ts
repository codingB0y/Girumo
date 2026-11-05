const JANELA_DA_META_MS = 24 * 60 * 60 * 1000;

export function dataCurta(iso: string): string {
  const d = new Date(iso);
  const dois = (n: number) => String(n).padStart(2, "0");
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)} ${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

export function dataDoDia(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** A última mensagem dela no direct tem menos de 24 h: ainda dá para responder (janela da Meta). */
export function janelaAberta(lastDmAt: string | null, agoraMs: number): boolean {
  return lastDmAt !== null && agoraMs - Date.parse(lastDmAt) < JANELA_DA_META_MS;
}
