"use client";

import { createClient } from "@supabase/supabase-js";

let browserClient: ReturnType<typeof createClient> | null = null;
const ACTIVE_TENANT_KEY = "hubflow_active_tenant_id";

function requirePublicEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variavel publica obrigatoria ausente: ${name}`);
  return value;
}

export function getSupabaseBrowserClient() {
  if (browserClient) return browserClient;

  browserClient = createClient(
    requirePublicEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requirePublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );

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
  if (!data.accessToken || !data.refreshToken) return;

  await getSupabaseBrowserClient().auth.setSession({
    access_token: data.accessToken,
    refresh_token: data.refreshToken,
  });

  setActiveTenantId(data.tenantId);
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
