"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, X, CheckCircle2 } from "lucide-react";

type Props = {
  plans: { id: string; name: string; code: string }[];
};

export function CreateTenantForm({ plans }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [planId, setPlanId] = useState("");

  function handleNameChange(value: string) {
    setName(value);
    // Auto-generate slug from name
    setSlug(
      value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/admin/tenants/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          ownerEmail,
          planId: planId || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setResult({ type: "error", message: data.error ?? "Erro ao criar tenant" });
      } else {
        setResult({ type: "success", message: data.message });
        setName("");
        setSlug("");
        setOwnerEmail("");
        setPlanId("");
        setTimeout(() => {
          setOpen(false);
          setResult(null);
          router.refresh();
        }, 1500);
      }
    } catch {
      setResult({ type: "error", message: "Falha na requisição" });
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-cobalt-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-cobalt-500"
      >
        <Plus className="h-4 w-4" />
        Novo Tenant
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />

      {/* Modal */}
      <div className="fixed inset-x-4 top-[10%] z-50 mx-auto max-w-lg rounded-2xl border border-volt-950/[0.08] bg-white p-6 shadow-2xl sm:inset-x-auto">
        <div className="flex items-center justify-between pb-4">
          <h2 className="font-display text-lg font-bold">Criar Novo Tenant</h2>
          <button
            onClick={() => setOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-aco/60 transition hover:bg-canvas-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-volt-950">
              Nome da Organização *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              required
              placeholder="Ex: Loja do João"
              className="mt-1 w-full rounded-xl border border-volt-950/[0.08] px-4 py-2.5 text-sm text-volt-950 placeholder:text-aco/40 focus:border-cobalt-500/30 focus:outline-none focus:ring-2 focus:ring-cobalt-500/10"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-volt-950">Slug *</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
              placeholder="loja-do-joao"
              pattern="^[a-z0-9-]+$"
              className="mt-1 w-full rounded-xl border border-volt-950/[0.08] px-4 py-2.5 font-data text-sm text-volt-950 placeholder:text-aco/40 focus:border-cobalt-500/30 focus:outline-none focus:ring-2 focus:ring-cobalt-500/10"
            />
            <p className="mt-1 font-data text-[11px] text-aco/50">Apenas letras minúsculas, números e hifens</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-volt-950">Email do Owner *</label>
            <input
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              required
              placeholder="owner@exemplo.com"
              className="mt-1 w-full rounded-xl border border-volt-950/[0.08] px-4 py-2.5 text-sm text-volt-950 placeholder:text-aco/40 focus:border-cobalt-500/30 focus:outline-none focus:ring-2 focus:ring-cobalt-500/10"
            />
            <p className="mt-1 font-data text-[11px] text-aco/50">Se não existir, será criado com convite</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-volt-950">Plano Inicial</label>
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-volt-950/[0.08] px-4 py-2.5 text-sm text-volt-950 focus:border-cobalt-500/30 focus:outline-none focus:ring-2 focus:ring-cobalt-500/10"
            >
              <option value="">Free (padrão)</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name ?? p.code}
                </option>
              ))}
            </select>
          </div>

          {result && (
            <div
              className={`rounded-xl px-4 py-3 text-sm font-medium ${
                result.type === "success"
                  ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {result.type === "success" && <CheckCircle2 className="mr-2 inline h-4 w-4" />}
              {result.message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !name || !slug || !ownerEmail}
            className="w-full rounded-xl bg-cobalt-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-cobalt-500 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="mx-auto h-4 w-4 animate-spin" />
            ) : (
              "Criar Tenant"
            )}
          </button>
        </form>
      </div>
    </>
  );
}
