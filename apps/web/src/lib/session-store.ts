import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { isConnectedStatus, selectSessionRow } from "@/lib/session-select";

// Status REAL da sessão do WhatsApp, reportado pela engine (heartbeat a cada 30s).

type SessionStatus = "connected" | "disconnected";

// Stats que a engine JÁ calcula no terminal e agora manda no heartbeat.
export type EngineStats = {
  queue: {
    pendentes: number;
    enviadasUltimoMinuto: number;
    enviadasUltimaHora: number;
    enviadasHoje: number;
    pausada: boolean;
  };
  delivery: { sentInWindow: number; deliveredInWindow: number; deliveryRate: number | null };
  warmup: {
    phase: "warming" | "graduated";
    day: number;
    totalDays: number;
    todayLimit: number | string;
    todaySent: number;
  };
};

export type SessionInfo = {
  status: SessionStatus;
  phone: string | null;
  profileName: string | null;
  connectedSince: string | null;
  stats: EngineStats | null;
  updatedAt: string;
};

const DEFAULT: SessionInfo = {
  status: "disconnected",
  phone: null,
  profileName: null,
  connectedSince: null,
  stats: null,
  updatedAt: new Date(0).toISOString(),
};

/**
 * Busca o status da sessão da engine.
 * Múltiplas linhas podem coexistir em `instances` pro mesmo tenant; prioriza a
 * CONECTADA mais recente (não só "a mais recente") — ver `selectSessionRow`.
 */
export async function getSession(tenantId: string): Promise<SessionInfo> {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("instances")
      .select("id, phone, status, connected_at, last_seen_at, metadata, updated_at")
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false })
      .limit(20);

    const row = selectSessionRow(data ?? []);
    if (!row) return DEFAULT;

    const meta = (row.metadata ?? {}) as Record<string, unknown>;

    return {
      status: isConnectedStatus(row.status) ? "connected" : "disconnected",
      phone: row.phone ?? null,
      profileName: (meta.profileName as string) ?? null,
      connectedSince: row.connected_at ?? null,
      stats: (meta.stats as EngineStats) ?? null,
      updatedAt: row.updated_at ?? row.last_seen_at ?? new Date(0).toISOString(),
    };
  } catch {
    return DEFAULT;
  }
}

/**
 * Atualiza o status da sessão (chamado pela engine via heartbeat POST).
 * Atualiza a instância mais recente; se nenhuma existir, retorna default.
 */
export async function setSession(tenantId: string, info: Partial<SessionInfo>): Promise<SessionInfo> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  // Buscar instância existente
  const { data: existing } = await supabase
    .from("instances")
    .select("id, tenant_id, metadata, connected_at")
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!existing) {
    // Sem instância — retorna merge local sem persistir
    return { ...DEFAULT, ...info, updatedAt: now };
  }

  const isConnected = info.status === "connected";
  const existingMeta = (existing.metadata ?? {}) as Record<string, unknown>;

  const metadata = {
    ...existingMeta,
    ...(info.profileName !== undefined ? { profileName: info.profileName } : {}),
    ...(info.stats !== undefined ? { stats: info.stats } : {}),
  };

  const updatePayload: Record<string, unknown> = {
    status: isConnected ? "connected" : "disconnected",
    last_seen_at: now,
    metadata,
    updated_at: now,
  };

  if (info.phone) updatePayload.phone = info.phone;
  if (isConnected && !existing.connected_at) {
    updatePayload.connected_at = info.connectedSince ?? now;
  }
  if (!isConnected) {
    updatePayload.disconnected_at = now;
    updatePayload.connected_at = null;
  }

  const { data: updated } = await supabase
    .from("instances")
    .update(updatePayload)
    .eq("id", existing.id)
    .eq("tenant_id", tenantId)
    .select("id, phone, status, connected_at, last_seen_at, metadata, updated_at")
    .single();

  if (updated) {
    const meta = (updated.metadata ?? {}) as Record<string, unknown>;
    return {
      status: updated.status === "connected" ? "connected" : "disconnected",
      phone: updated.phone ?? null,
      profileName: (meta.profileName as string) ?? null,
      connectedSince: updated.connected_at ?? null,
      stats: (meta.stats as EngineStats) ?? null,
      updatedAt: updated.updated_at ?? now,
    };
  }

  return { ...DEFAULT, ...info, updatedAt: now };
}

/** "Ao vivo" = conectada E com heartbeat recente (engine viva). */
export function isLive(info: SessionInfo): boolean {
  return info.status === "connected" && Date.now() - new Date(info.updatedAt).getTime() < 90_000;
}
