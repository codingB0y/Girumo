"use client";

import { createClient } from "@supabase/supabase-js";

let browserClient: ReturnType<typeof createClient> | null = null;
const ACTIVE_TENANT_KEY = "hubflow_active_tenant_id";

export function getSupabaseBrowserClient() {
  if (browserClient) return browserClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) throw new Error("Variavel publica obrigatoria ausente: NEXT_PUBLIC_SUPABASE_URL");
  if (!supabaseAnonKey) throw new Error("Variavel publica obrigatoria ausente: NEXT_PUBLIC_SUPABASE_ANON_KEY");

  browserClient = createClient(supabaseUrl, supabaseAnonKey);

  return browserClient;
}

export function getActiveTenantId(): string | null {
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

export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const { data } = await getSupabaseBrowserClient().auth.getSession();
  const headers = new Headers(init.headers);
  const accessToken = data.session?.access_token;
  const tenantId = getActiveTenantId();

  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (tenantId) headers.set("x-tenant-id", tenantId);

  return fetch(input, { ...init, headers });
}
