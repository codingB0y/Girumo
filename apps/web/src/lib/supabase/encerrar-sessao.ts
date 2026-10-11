"use client";

import { getSupabaseBrowserClient, setActiveTenantId, tirarSessaoSupabase } from "./client";

/** O que a saída toca no navegador; injetável para o teste. */
export type Aparelho = {
  esquecerLoja: () => void;
  auth: () => {
    stopAutoRefresh: () => Promise<void> | void;
    admin: { signOut: (jwt: string, escopo: "global") => Promise<unknown> };
  };
  armazenamento: () => Parameters<typeof tirarSessaoSupabase>[0];
  logout: () => Promise<{ ok: boolean }>;
  limiteMs: number;
};

const LIMITE_DA_SAIDA_MS = 10_000;

function aparelhoDoNavegador(): Aparelho {
  return {
    esquecerLoja: () => setActiveTenantId(null),
    auth: () => getSupabaseBrowserClient().auth,
    armazenamento: () => window.localStorage,
    logout: () => fetch("/api/auth/logout", { method: "POST" }),
    limiteMs: LIMITE_DA_SAIDA_MS,
  };
}

/**
 * Encerra a sessão deste aparelho (pode ser compartilhado na loja) e diz se o servidor confirmou.
 *
 * 1. Sem rede, na hora: a loja ativa, o refresh automático e a sessão do supabase-js no
 *    localStorage (`sb-*`, vale como Bearer e o middleware não consulta `session_revocations`
 *    nesse caminho). Não dá pra delegar a `auth.signOut()`: ele faz `POST /logout` antes de
 *    apagar e, com a rede fora, devolve `{ error }` e deixa tudo lá — o `scope: "local"`
 *    também chama o servidor nesta versão.
 * 2. Depois, com teto: `POST /api/auth/logout`, o único que apaga o cookie HttpOnly, e a
 *    revogação do token no Supabase (melhor-esforço, resultado ignorado).
 *
 * `true` só se o logout do cookie respondeu ok. Com `false` não mande para o /login: o cookie
 * segue vivo e o /painel abriria na mesma sessão para a próxima pessoa.
 */
export async function encerrarSessaoDoAparelho(aparelho: Aparelho = aparelhoDoNavegador()): Promise<boolean> {
  let token: string | null = null;
  let auth: ReturnType<Aparelho["auth"]> | null = null;
  try {
    aparelho.esquecerLoja();
  } catch {
    // localStorage bloqueado
  }
  try {
    auth = aparelho.auth();
    await auth.stopAutoRefresh();
  } catch {
    // variável pública ausente ou cliente sem o método: a limpeza local segue
  }
  try {
    token = tirarSessaoSupabase(aparelho.armazenamento());
  } catch {
    // localStorage bloqueado
  }
  // Aguardada (dentro do teto): quem chama navega em seguida, e a navegação abortaria o fetch.
  const [cliente, jwt] = [auth, token];
  const revogacao =
    cliente && jwt
      ? Promise.resolve()
          .then(() => cliente.admin.signOut(jwt, "global"))
          .then(
            () => undefined,
            () => undefined,
          )
      : Promise.resolve();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const teto = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), aparelho.limiteMs);
  });
  const logout = Promise.resolve()
    .then(aparelho.logout)
    .then(
      (r) => r.ok,
      () => false,
    );
  const ok = await Promise.race([Promise.all([logout, revogacao]).then(([r]) => r), teto]);
  clearTimeout(timer);
  // Segunda passada: um refresh que já estava em voo no stopAutoRefresh regrava a sessão durante a rede.
  try {
    tirarSessaoSupabase(aparelho.armazenamento());
  } catch {
    // localStorage bloqueado
  }
  return ok;
}
