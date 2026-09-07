"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { TenantRole, Action } from "@/lib/permissions";
import { hasPermission } from "@/lib/permissions";

type RoleCtx = {
  role: TenantRole | null;
  /** Tenant ativo. Usado, entre outras coisas, para filtrar canais de Realtime. */
  tenantId: string | null;
  /** Nome da loja, como aparece no letreiro. null enquanto carrega ou sem nome. */
  tenantName: string | null;
  can: (action: Action) => boolean;
};

const RoleContext = createContext<RoleCtx>({ role: null, tenantId: null, tenantName: null, can: () => true });

export const useRole = () => useContext(RoleContext);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<TenantRole | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.role) setRole(data.role);
        if (data?.tenantId) setTenantId(String(data.tenantId));
        if (typeof data?.tenantName === "string") setTenantName(data.tenantName);
      })
      .catch(() => {});
  }, []);

  const can = (action: Action): boolean => {
    if (!role) return true;
    return hasPermission(role, action);
  };

  return (
    <RoleContext.Provider value={{ role, tenantId, tenantName, can }}>
      {children}
    </RoleContext.Provider>
  );
}
