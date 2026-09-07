/**
 * "Aparelho lembrado" da porta de entrada (spec 12.1/12.2 da Vitrine Aberta).
 *
 * Quem já entrou neste navegador não devolve a promessa de vendas na cara: a
 * porta abre com o próprio e-mail e só pede a senha. Guardamos SÓ o e-mail de
 * quem digitou aqui — nada do tenant, nenhum nome de cliente. A tela de login
 * não é autenticada, então dado de terceiro nela seria vazamento.
 *
 * O que sai do localStorage é entrada de fora (o usuário edita o storage à
 * mão), por isso passa por validação antes de virar tela.
 */

const CHAVE = "girumo.aparelho";
const LIMITE_DO_EMAIL = 254; // RFC 5321: caminho de volta mais longo aceito

export type Aparelho = { email: string };

/** Visitante vê a promessa; lembrado vê o próprio e-mail e só a senha. */
export type EstadoDaPorta = { tipo: "visitante" } | { tipo: "lembrado"; email: string };

/** Frouxo de propósito: só barra o que nem parece e-mail, quem valida de verdade é o servidor. */
export function pareceEmail(valor: string): boolean {
  if (valor.length === 0 || valor.length > LIMITE_DO_EMAIL) return false;
  if (/\s/.test(valor)) return false;
  const partes = valor.split("@");
  if (partes.length !== 2) return false;
  const [usuario, dominio] = partes;
  return usuario.length > 0 && dominio.includes(".") && !dominio.startsWith(".") && !dominio.endsWith(".");
}

/** Lê o que estava guardado. Lixo, formato antigo ou e-mail inválido viram null — nunca exceção. */
export function lerAparelho(bruto: string | null): Aparelho | null {
  if (!bruto) return null;
  try {
    const dado: unknown = JSON.parse(bruto);
    if (typeof dado !== "object" || dado === null) return null;
    const email = (dado as { email?: unknown }).email;
    if (typeof email !== "string") return null;
    const limpo = email.trim().toLowerCase();
    return pareceEmail(limpo) ? { email: limpo } : null;
  } catch {
    return null;
  }
}

export function estadoDaPorta(aparelho: Aparelho | null): EstadoDaPorta {
  return aparelho ? { tipo: "lembrado", email: aparelho.email } : { tipo: "visitante" };
}

/** Só o primeiro pedaço do e-mail, pra saudar sem repetir o domínio inteiro na headline. */
export function apelidoDoEmail(email: string): string {
  const usuario = email.split("@")[0] ?? "";
  return usuario.length > 0 ? usuario : email;
}

// --- Beira do navegador: storage pode estar bloqueado (aba privada, cota, política). ---

export function aparelhoLembrado(): Aparelho | null {
  if (typeof window === "undefined") return null;
  try {
    return lerAparelho(window.localStorage.getItem(CHAVE));
  } catch {
    return null;
  }
}

export function lembrarAparelho(email: string): void {
  if (typeof window === "undefined") return;
  const limpo = email.trim().toLowerCase();
  if (!pareceEmail(limpo)) return;
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify({ email: limpo }));
  } catch {
    // Sem storage a porta só volta ao estado visitante — não é motivo pra falhar o login.
  }
}

export function esquecerAparelho(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CHAVE);
  } catch {
    // idem
  }
}
