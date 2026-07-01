"use client";

import { useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  ExternalLink,
  Users,
  CreditCard,
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tenant = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  members: number;
  subscriptionStatus: string;
  planName: string;
};

type Pagination = {
  page: number;
  totalPages: number;
  totalCount: number;
  perPage: number;
};

type Filters = {
  search: string;
  status: string;
};

type SortField = "name" | "members" | "createdAt" | "subscriptionStatus";
type SortDir = "asc" | "desc";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700",
  trialing: "bg-blue-50 text-blue-700",
  free: "bg-slate-100 text-slate-600",
  canceled: "bg-red-50 text-red-600",
  past_due: "bg-amber-50 text-amber-700",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Ativo",
  trialing: "Trial",
  free: "Free",
  canceled: "Cancelado",
  past_due: "Inadimplente",
};

export function AdminTenantsClient({
  tenants,
  pagination,
  filters,
}: {
  tenants: Tenant[];
  pagination: Pagination;
  filters: Filters;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(filters.search);
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function navigate(params: Record<string, string>) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(params)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    router.push(`/admin/tenants?${sp.toString()}`);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    navigate({ search, page: "1" });
  }

  function handleStatusFilter(status: string) {
    navigate({ status: status === "all" ? "" : status, page: "1" });
  }

  function handlePage(p: number) {
    navigate({ page: String(p) });
  }

  // Client-side sort (within current page)
  const sorted = useMemo(() => {
    return [...tenants].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "members":
          cmp = a.members - b.members;
          break;
        case "createdAt":
          cmp = a.createdAt.localeCompare(b.createdAt);
          break;
        case "subscriptionStatus":
          cmp = a.subscriptionStatus.localeCompare(b.subscriptionStatus);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [tenants, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  // Unique statuses para pills
  const statuses = ["active", "trialing", "free", "canceled", "past_due"];

  return (
    <div className="space-y-4">
      {/* Status pills */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => handleStatusFilter("all")}
          className={cn(
            "rounded-full px-3 py-1.5 font-data text-[11px] uppercase tracking-wider transition",
            filters.status === "all"
              ? "bg-iris/10 text-iris ring-1 ring-iris/20"
              : "bg-white border border-breu/[0.06] text-aco/60 hover:bg-bruma/40",
          )}
        >
          Todos
        </button>
        {statuses.map((status) => (
          <button
            key={status}
            onClick={() => handleStatusFilter(filters.status === status ? "all" : status)}
            className={cn(
              "rounded-full px-3 py-1.5 font-data text-[11px] uppercase tracking-wider transition",
              filters.status === status
                ? `${STATUS_STYLES[status] ?? "bg-slate-100 text-slate-600"} ring-1 ring-current/20`
                : "bg-white border border-breu/[0.06] text-aco/60 hover:bg-bruma/40",
            )}
          >
            {STATUS_LABELS[status] ?? status}
          </button>
        ))}
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="relative">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-aco/40" />
        <input
          type="text"
          placeholder="Buscar por nome ou slug... (Enter para buscar)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-breu/[0.06] bg-white py-3 pl-11 pr-4 text-sm text-breu shadow-sm placeholder:text-aco/40 focus:border-iris/30 focus:outline-none focus:ring-2 focus:ring-iris/10"
        />
      </form>

      {/* Table */}
      <div className="rounded-2xl border border-breu/[0.06] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-breu/[0.06]">
                <th className="px-5 py-3.5">
                  <button
                    onClick={() => toggleSort("name")}
                    className="inline-flex items-center gap-1 font-data text-[11px] uppercase tracking-wider text-aco/55 hover:text-breu"
                  >
                    Organização <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Slug</th>
                <th className="px-5 py-3.5">
                  <button
                    onClick={() => toggleSort("members")}
                    className="inline-flex items-center gap-1 font-data text-[11px] uppercase tracking-wider text-aco/55 hover:text-breu"
                  >
                    Membros <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-5 py-3.5">
                  <button
                    onClick={() => toggleSort("subscriptionStatus")}
                    className="inline-flex items-center gap-1 font-data text-[11px] uppercase tracking-wider text-aco/55 hover:text-breu"
                  >
                    Plano <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-5 py-3.5">
                  <button
                    onClick={() => toggleSort("createdAt")}
                    className="inline-flex items-center gap-1 font-data text-[11px] uppercase tracking-wider text-aco/55 hover:text-breu"
                  >
                    Criado em <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-breu/[0.04]">
              {sorted.map((org) => (
                <tr key={org.id} className="transition hover:bg-bruma/30">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-iris/10 font-data text-xs font-bold text-iris">
                        {(org.name ?? "T").slice(0, 2).toUpperCase()}
                      </span>
                      <span className="font-medium text-breu">{org.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 font-data text-xs text-aco/60">{org.slug}</td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      <Users className="h-3.5 w-3.5 text-aco/40" />
                      {org.members}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-col gap-0.5">
                      <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 font-data text-[10px] uppercase tracking-wider ${STATUS_STYLES[org.subscriptionStatus] ?? STATUS_STYLES.free}`}>
                        <CreditCard className="h-3 w-3" />
                        {STATUS_LABELS[org.subscriptionStatus] ?? org.subscriptionStatus}
                      </span>
                      <span className="font-data text-[10px] text-aco/40">{org.planName}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 font-data text-xs text-aco/50">
                    {new Date(org.createdAt).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/admin/tenants/${org.id}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-breu/10 bg-white px-3 py-1.5 text-xs font-medium text-iris transition hover:border-iris/30 hover:shadow-sm"
                    >
                      Detalhes <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sorted.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Building2 className="h-8 w-8 text-aco/30" />
            <p className="text-sm text-aco/50">
              {filters.search || filters.status !== "all"
                ? "Nenhum tenant corresponde aos filtros."
                : "Nenhum tenant cadastrado."}
            </p>
          </div>
        )}
      </div>

      {/* Paginação */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="font-data text-[11px] text-aco/50">
            Página {pagination.page} de {pagination.totalPages} · {pagination.totalCount} total
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePage(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-breu/[0.06] bg-white text-aco transition hover:border-iris/20 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => {
              const p = i + 1;
              return (
                <button
                  key={p}
                  onClick={() => handlePage(p)}
                  className={cn(
                    "inline-flex h-9 w-9 items-center justify-center rounded-lg font-data text-xs transition",
                    p === pagination.page
                      ? "bg-iris text-white"
                      : "border border-breu/[0.06] bg-white text-aco hover:border-iris/20",
                  )}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => handlePage(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-breu/[0.06] bg-white text-aco transition hover:border-iris/20 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
