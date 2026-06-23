// Campanha ATIVA: guardada num cookie (lida no cliente e no servidor). Define o
// escopo de grupos que o app opera. Sem campanha ativa = mostra todos os grupos.
export const CAMPANHA_COOKIE = "dz_campanha";

export function getActiveCampanhaId(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|; )dz_campanha=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function setActiveCampanhaId(id: string | null) {
  if (typeof document === "undefined") return;
  if (id) document.cookie = `${CAMPANHA_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=${60 * 60 * 24 * 365}`;
  else document.cookie = `${CAMPANHA_COOKIE}=; path=/; max-age=0`;
}
