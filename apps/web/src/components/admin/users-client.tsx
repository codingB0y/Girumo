"use client";

import { useState, useMemo } from "react";
import {
  Users,
  Mail,
  Building2,
  Shield,
  Search,
  ArrowUpDown,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";

type User = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  tenantId: string;
  tenantName: string;
  role: string;
};

const ROLE_STYLES: Record<string, string> = {
  owner: "bg-amber-50 text-amber-700",
  admin: "bg-purple-50 text-purple-700",
  operator: "bg-slate-100 text-slate-600",
};

export function AdminUsersClient({ users }: { users: User[] }) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<"name" | "createdAt" | "role">("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const roles = [...new Set(users.map((u) => u.role).filter((r) => r !== "—"))];

  const filtered = useMemo(() => {
    let result = users;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.tenantName.toLowerCase().includes(q),
      );
    }

    if (roleFilter !== "all") {
      result = result.filter((u) => u.role === roleFilter);
    }

    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = (a.name ?? "").localeCompare(b.name ?? "");
          break;
        case "createdAt":
          cmp = a.createdAt.localeCompare(b.createdAt);
          break;
        case "role":
          cmp = a.role.localeCompare(b.role);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [users, search, roleFilter, sortField, sortDir]);

  function toggleSort(field: typeof sortField) {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  function handleExport() {
    const csv = [
      "nome,email,organização,role,criado_em",
      ...filtered.map(
        (u) => `"${u.name}","${u.email}","${u.tenantName}","${u.role}","${u.createdAt}"`,
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hubflow-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-aco/40" />
          <input
            type="text"
            placeholder="Buscar por nome, email ou organização..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-breu/[0.06] bg-white py-3 pl-11 pr-4 text-sm text-breu shadow-sm placeholder:text-aco/40 focus:border-iris/30 focus:outline-none focus:ring-2 focus:ring-iris/10"
          />
        </div>

        {/* Role filter */}
        {roles.length > 0 && (
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-xl border border-breu/[0.06] bg-white px-4 py-3 font-data text-xs text-breu shadow-sm focus:border-iris/30 focus:outline-none"
          >
            <option value="all">Todas as roles</option>
            {roles.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        )}

        {/* Export */}
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 rounded-xl border border-breu/[0.06] bg-white px-4 py-3 font-data text-xs text-aco/60 shadow-sm transition hover:border-iris/20 hover:text-iris"
        >
          <Download className="h-3.5 w-3.5" />
          CSV
        </button>

        <span className="ml-auto font-data text-[11px] text-aco/45">
          {filtered.length} de {users.length}
        </span>
      </div>

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
                    Nome <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">E-mail</th>
                <th className="px-5 py-3.5 font-data text-[11px] uppercase tracking-wider text-aco/55">Organização</th>
                <th className="px-5 py-3.5">
                  <button
                    onClick={() => toggleSort("role")}
                    className="inline-flex items-center gap-1 font-data text-[11px] uppercase tracking-wider text-aco/55 hover:text-breu"
                  >
                    Role <ArrowUpDown className="h-3 w-3" />
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
              </tr>
            </thead>
            <tbody className="divide-y divide-breu/[0.04]">
              {filtered.map((u) => (
                <tr key={u.id} className="transition hover:bg-bruma/30">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 font-data text-xs font-bold text-blue-600">
                        {(u.name ?? "U").slice(0, 2).toUpperCase()}
                      </span>
                      <span className="font-medium text-breu">{u.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-1.5 font-data text-xs text-aco/60">
                      <Mail className="h-3 w-3" /> {u.email}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-1.5 text-xs text-aco/60">
                      <Building2 className="h-3 w-3" /> {u.tenantName}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-data text-[10px] uppercase tracking-wider",
                        ROLE_STYLES[u.role] ?? "bg-slate-100 text-slate-500",
                      )}
                    >
                      <Shield className="h-3 w-3" />
                      {u.role}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 font-data text-xs text-aco/50">
                    {new Date(u.createdAt).toLocaleDateString("pt-BR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Users className="h-8 w-8 text-aco/30" />
            <p className="text-sm text-aco/50">
              {search || roleFilter !== "all"
                ? "Nenhum usuário corresponde aos filtros."
                : "Nenhum usuário encontrado."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
