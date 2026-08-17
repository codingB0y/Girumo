"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Users, Layers, MousePointerClick, ArrowLeft, Loader2 } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabase/client";

type Stats = {
  groups: number;
  members: number;
  campaigns: number;
  clicks: number;
  contacts: number;
};

export default function CancelarPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState("");
  const [step, setStep] = useState<"show" | "confirm">("show");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [groups, campanhas, links, leads] = await Promise.all([
          fetch("/api/groups").then((r) => r.json()).catch(() => []),
          fetch("/api/campanhas").then((r) => r.json()).catch(() => []),
          fetch("/api/links").then((r) => r.json()).catch(() => []),
          fetch("/api/leads").then((r) => r.json()).catch(() => []),
        ]);
        const g = Array.isArray(groups) ? groups : [];
        const c = Array.isArray(campanhas) ? campanhas : [];
        const l = Array.isArray(links) ? links : [];
        const le = Array.isArray(leads) ? leads : [];
        setStats({
          groups: g.length,
          members: g.reduce((a: number, gr: { members?: number }) => a + (gr.members ?? 0), 0),
          campaigns: c.length,
          clicks: l.reduce((a: number, lk: { clicks?: number }) => a + (lk.clicks ?? 0), 0),
          contacts: le.length,
        });
      } catch {
        setStats({ groups: 0, members: 0, campaigns: 0, clicks: 0, contacts: 0 });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleCancel() {
    setErro(null);
    setEnviando(true);

    // Best-effort: o motivo é valioso, mas não pode impedir o cancelamento.
    // Se falhar, seguimos para o portal do mesmo jeito.
    if (reason.trim()) {
      await authenticatedFetch("/api/billing/churn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      }).catch(() => {});
    }

    try {
      const res = await authenticatedFetch("/api/billing/portal", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      // Sem URL não há cancelamento possível aqui. Mandar de volta ao painel
      // em silêncio faria parecer que cancelou — que era o problema desta tela.
      setErro(
        typeof data.error === "string"
          ? data.error
          : "Não conseguimos abrir o portal de pagamentos. Tente de novo em instantes.",
      );
    } catch {
      setErro("Não conseguimos falar com o servidor. Verifique sua conexão e tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  if (loading || !stats) {
    return (
      <div className="mx-auto max-w-[600px] px-4 py-10 sm:px-6">
        <div className="pn-skeleton h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[600px] px-4 py-10 sm:px-6">
      <Link
        href="/painel/configuracoes"
        className="inline-flex items-center gap-1.5 text-sm text-aco/60 transition-colors duration-[160ms] ease-[var(--ease-fluxo)] hover:text-volt-950"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} /> Voltar
      </Link>

      <div className="mt-6 rounded-2xl border border-alerta/20 bg-papel p-8 shadow-[var(--shadow-pn)]">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-alerta/10">
            <AlertTriangle className="h-8 w-8 text-alerta" strokeWidth={1.75} />
          </div>
          <h1 className="font-display mt-4 text-2xl font-extrabold text-volt-950">
            Tem certeza que quer cancelar?
          </h1>
          <p className="font-editorial mt-2 text-[17px] italic text-ardosia">
            Se cancelar, você perde acesso a tudo que construiu:
          </p>
        </div>

        {/* What you lose */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <LossCard icon={Users} label="Membros nos grupos" value={stats.members.toLocaleString("pt-BR")} />
          <LossCard icon={Layers} label="Campanhas criadas" value={String(stats.campaigns)} />
          <LossCard icon={MousePointerClick} label="Cliques acumulados" value={stats.clicks.toLocaleString("pt-BR")} />
          <LossCard icon={Users} label="Contatos captados" value={stats.contacts.toLocaleString("pt-BR")} />
        </div>

        {step === "show" && (
          <>
            {/* Reason */}
            <div className="mt-6">
              <label htmlFor="cancel-reason" className="font-data text-[10px] uppercase tracking-[0.08em] text-aco/50">
                O que podemos melhorar?
              </label>
              <textarea
                id="cancel-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Conta pra gente o motivo..."
                className="mt-2 w-full rounded-xl border border-volt-950/10 bg-poco px-4 py-3 text-sm text-volt-950 outline-none transition-[border-color,box-shadow] duration-[160ms] ease-[var(--ease-fluxo)] placeholder:text-aco/40 focus:border-cobalt-500/50 focus:bg-papel focus:shadow-[0_0_0_3px_var(--color-cobalt-soft)]"
                rows={3}
              />
            </div>

            {/* Actions */}
            <div className="mt-6 space-y-3">
              {/* Cancel */}
              <button
                onClick={() => setStep("confirm")}
                className="flex w-full cursor-pointer items-center justify-center rounded-xl px-5 py-3 text-sm text-aco/60 transition-colors duration-[160ms] ease-[var(--ease-fluxo)] hover:text-alerta"
              >
                Quero cancelar mesmo assim
              </button>
            </div>
          </>
        )}

        {step === "confirm" && (
          <div className="mt-6 rounded-2xl border border-alerta/20 bg-alerta/[0.05] p-5">
            <p className="text-sm font-medium text-volt-950">
              Último passo: confirme o cancelamento
            </p>
            <p className="mt-1 text-xs text-aco/60">
              Você será redirecionado ao portal de pagamentos. Seus dados ficam disponíveis por 30
              dias após o cancelamento.
            </p>
            {erro && (
              <p role="alert" className="mt-3 text-sm text-alerta">
                {erro}
              </p>
            )}
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setStep("show")}
                disabled={enviando}
                className="flex-1 cursor-pointer rounded-xl border border-volt-950/15 px-4 py-2.5 text-sm font-medium text-volt-950 transition-colors duration-[160ms] ease-[var(--ease-fluxo)] hover:border-cobalt-500 hover:text-cobalt-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Voltar
              </button>
              <button
                onClick={handleCancel}
                disabled={enviando}
                className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-alerta px-4 py-2.5 text-sm font-medium text-white transition ease-[var(--ease-fluxo)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {enviando && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />}
                {enviando ? "Abrindo portal…" : "Confirmar cancelamento"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LossCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-alerta/10 bg-alerta/[0.03] p-4 text-center">
      <Icon className="mx-auto h-5 w-5 text-alerta/60" strokeWidth={1.75} />
      <p className="font-data mt-2 text-xl font-medium tabular-nums text-volt-950">{value}</p>
      <p className="mt-0.5 text-[11px] text-aco/55">{label}</p>
    </div>
  );
}
