"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { parseModulos, type Acesso, type ModuloOpcional } from "@/lib/auth/modulos";
import type { TenantRole, Action } from "@/lib/permissions";
import { hasPermission } from "@/lib/permissions";

type RoleCtx = {
  role: TenantRole | null;
  /** Tenant ativo. Usado, entre outras coisas, para filtrar canais de Realtime. */
  tenantId: string | null;
  /** Nome da loja, como aparece no letreiro. null enquanto carrega ou sem nome. */
  tenantName: string | null;
  /** false até /api/auth/me responder (com sucesso ou erro): distingue "carregando" de "sem nome". */
  carregado: boolean;
  /** Módulos opcionais que o dono liberou (só a vendedora tem). [] até carregar. */
  modules: ModuloOpcional[];
  /** Pronto para `paginaLiberada`/`podeAcessar`. null até /api/auth/me devolver o papel. */
  acesso: Acesso | null;
  can: (action: Action) => boolean;
};

const RoleContext = createContext<RoleCtx>({
  role: null,
  tenantId: null,
  tenantName: null,
  carregado: false,
  modules: [],
  acesso: null,
  can: () => true,
});

export const useRole = () => useContext(RoleContext);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<TenantRole | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [modules, setModules] = useState<ModuloOpcional[]>([]);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.role) setRole(data.role);
        if (data?.tenantId) setTenantId(String(data.tenantId));
        if (typeof data?.tenantName === "string") setTenantName(data.tenantName);
        setModules(parseModulos(data?.modules));
      })
      .catch(() => {})
      .finally(() => setCarregado(true));
  }, []);

  // Memo: um objeto novo a cada render faria efeito que depende de `acesso` rodar sem parar.
  const acesso = useMemo<Acesso | null>(() => (role ? { role, modules } : null), [role, modules]);

  const can = (action: Action): boolean => {
    if (!role) return true;
    return hasPermission(role, action);
  };

  return (
    <RoleContext.Provider value={{ role, tenantId, tenantName, carregado, modules, acesso, can }}>
      {children}
    </RoleContext.Provider>
  );
}
