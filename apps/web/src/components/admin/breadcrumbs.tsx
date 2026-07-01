"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";

const ROUTE_LABELS: Record<string, string> = {
  admin: "Dashboard",
  tenants: "Tenants",
  usuarios: "Usuários",
  instancias: "Instâncias",
  agentes: "Agentes IA",
  billing: "Billing",
  logs: "Logs",
  saude: "Saúde",
  funil: "Funil",
  configuracoes: "Configurações",
};

export function AdminBreadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  // Skip se estamos no dashboard raiz
  if (segments.length <= 1 || (segments.length === 1 && segments[0] === "admin")) {
    return null;
  }

  // Remove "admin" do início e constrói breadcrumbs
  const crumbs = segments.slice(1); // remove "admin"

  if (crumbs.length === 0) return null;

  return (
    <nav className="flex items-center gap-1.5 font-data text-[11px] text-aco/50" aria-label="Breadcrumb">
      <Link href="/admin" className="flex items-center gap-1 transition hover:text-iris">
        <Home className="h-3 w-3" />
        <span>Admin</span>
      </Link>
      {crumbs.map((segment, i) => {
        const href = "/admin/" + crumbs.slice(0, i + 1).join("/");
        const isLast = i === crumbs.length - 1;
        const label = ROUTE_LABELS[segment] ?? decodeURIComponent(segment);

        // Se é um UUID (tenant detail), mostra como "Detalhe"
        const isUuid = /^[0-9a-f]{8}-/.test(segment);
        const displayLabel = isUuid ? "Detalhe" : label;

        return (
          <span key={href} className="flex items-center gap-1.5">
            <ChevronRight className="h-3 w-3 text-aco/30" />
            {isLast ? (
              <span className="text-breu font-medium">{displayLabel}</span>
            ) : (
              <Link href={href} className="transition hover:text-iris">
                {displayLabel}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
