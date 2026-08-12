"use client";

import { createClient } from "@supabase/supabase-js";

let browserClient: ReturnType<typeof createClient> | null = null;
const ACTIVE_TENANT_KEY = "hubflow_active_tenant_id";
const OAUTH_NEXT_KEY = "hubflow_oauth_next";
export const OAUTH_CALLBACK_PATH = "/auth/callback";

export function getSupabaseBrowserClient() {
  if (browserClient) return browserClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) throw new Error("Variavel publica obrigatoria ausente: NEXT_PUBLIC_SUPABASE_URL");
  if (!supabaseAnonKey) throw new Error("Variavel publica obrigatoria ausente: NEXT_PUBLIC_SUPABASE_ANON_KEY");

  browserClient = createClient(supabaseUrl, supabaseAnonKey);

  return browserClient;
}

function getActiveTenantId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_TENANT_KEY);
}

export function setActiveTenantId(tenantId: string | null | undefined) {
  if (typeof window === "undefined") return;
  if (tenantId) window.localStorage.setItem(ACTIVE_TENANT_KEY, tenantId);
  else window.localStorage.removeItem(ACTIVE_TENANT_KEY);
}

export async function persistSupabaseSession(data: {
  accessToken?: string | null;
  refreshToken?: string | null;
  tenantId?: string | null;
}) {
  setActiveTenantId(data.tenantId);

  if (!data.accessToken || !data.refreshToken) return;

  try {
    await getSupabaseBrowserClient().auth.setSession({
      access_token: data.accessToken,
      refresh_token: data.refreshToken,
    });
  } catch (error) {
    console.error("Nao foi possivel persistir sessao Supabase no navegador.", error);
  }
}

/**
 * Guarda o destino pos-login no `sessionStorage` em vez de na URL de retorno.
 *
 * O `redirectTo` precisa estar na allowlist de Redirect URLs do Supabase; manter
 * a URL constante (sem query) torna a allowlist trivial e evita depender de o
 * Supabase preservar query params na volta.
 */
export async function startGoogleOAuth(next: string): Promise<void> {
  window.sessionStorage.setItem(OAUTH_NEXT_KEY, next);

  const { error } = await getSupabaseBrowserClient().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}${OAUTH_CALLBACK_PATH}` },
  });

  if (error) {
    window.sessionStorage.removeItem(OAUTH_NEXT_KEY);
    throw error;
  }
}

/** Le e descarta o destino guardado antes do redirect para o Google. */
export function takeOAuthNext(): string | null {
  if (typeof window === "undefined") return null;
  const value = window.sessionStorage.getItem(OAUTH_NEXT_KEY);
  window.sessionStorage.removeItem(OAUTH_NEXT_KEY);
  return value;
}

export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const { data } = await getSupabaseBrowserClient().auth.getSession();
  const headers = new Headers(init.headers);
  const accessToken = data.session?.access_token;
  const tenantId = getActiveTenantId();

  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (tenantId) headers.set("x-tenant-id", tenantId);

  return fetch(input, { ...init, headers });
}
