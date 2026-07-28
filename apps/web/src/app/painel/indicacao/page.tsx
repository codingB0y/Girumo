"use client";

import { useEffect, useState } from "react";
import { Gift, Copy, Check, Users, MousePointerClick, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

type Referral = {
  id: string;
  name: string;
  slug: string;
  clicks: number;
  entries: number;
};

type Config = {
  reward?: string;
  description?: string;
};

export default function PainelIndicacao() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [config, setConfig] = useState<Config>({});
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    Promise.all([
      fetch("/api/referrals").then((r) => r.json()).catch(() => []),
      fetch("/api/referrals/config").then((r) => r.json()).catch(() => ({})),
    ]).then(([refs, cfg]) => {
      setReferrals(Array.isArray(refs) ? refs : []);
      setConfig(cfg ?? {});
    }).finally(() => setLoading(false));
  }, []);

  const myLink = `${origin}/r/indicacao`;
  const totalClicks = referrals.reduce((a, r) => a + (r.clicks ?? 0), 0);
  const totalEntries = referrals.reduce((a, r) => a + (r.entries ?? 0), 0);

  function handleCopy() {
    navigator.clipboard.writeText(myLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-5 px-4 py-6 sm:px-6">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-white" />
        <div className="h-48 animate-pulse rounded-3xl bg-white" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 sm:px-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">Indicação</h1>
        <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/60">
          Indique lojistas e ganhe recompensas
        </p>
      </div>

      {/* Banner CTA */}
      <section className="relative overflow-hidden rounded-3xl bg-volt-950 p-6 text-white sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-cobalt-500/20 blur-[80px]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-md">
            <div className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-cobalt-500" />
              <span className="font-data text-[10px] uppercase tracking-[0.2em] text-canvas-100/50">
                Programa de indicação
              </span>
            </div>
            <h2 className="font-display mt-3 text-2xl font-extrabold">
              Indique e ganhe {config.reward || "1 mês grátis"}
            </h2>
            <p className="mt-2 text-sm text-canvas-100/60">
              {config.description || "Cada lojista que assinar pelo seu link te dá 1 mês grátis no seu plano. Sem limite."}
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <p className="font-data text-[10px] uppercase tracking-wider text-canvas-100/40">Seu link de indicação</p>
            <div className="flex items-center gap-2">
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.05] px-4 py-2.5 font-data text-sm text-canvas-100/80">
                {myLink}
              </div>
              <button
                onClick={handleCopy}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl transition",
                  copied ? "bg-sucesso/20 text-sucesso" : "bg-white/[0.08] text-white hover:bg-white/[0.12]",
                )}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard icon={MousePointerClick} label="Cliques" value={totalClicks} />
        <StatCard icon={Users} label="Indicados" value={totalEntries} />
        <StatCard icon={Trophy} label="Posição" value={referrals.length > 0 ? "#1" : "—"} />
      </div>

      {/* Ranking */}
      {referrals.length > 0 && (
        <section className="overflow-hidden rounded-3xl border border-volt-950/[0.08] bg-white">
          <div className="border-b border-volt-950/[0.06] px-5 py-4">
            <h2 className="font-display text-base font-bold text-volt-950">Suas indicações</h2>
          </div>
          <div className="divide-y divide-volt-950/[0.06]">
            {referrals.map((ref) => (
              <div key={ref.id} className="flex items-center justify-between px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cobalt-500/10 text-cobalt-500">
                    <Users className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-volt-950">{ref.name}</p>
                    <p className="font-data text-[11px] text-aco/55">{ref.slug}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 font-data text-xs">
                  <span className="text-aco/60">{ref.clicks} cliques</span>
                  <span className="rounded-full bg-sucesso/10 px-2.5 py-1 text-[10px] uppercase tracking-wider text-sucesso">
                    {ref.entries} entradas
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {referrals.length === 0 && (
        <section className="rounded-3xl border border-volt-950/[0.08] bg-white p-8 text-center">
          <Gift className="mx-auto h-10 w-10 text-aco/25" />
          <p className="font-display mt-3 text-sm font-bold text-volt-950">Nenhuma indicação ainda</p>
          <p className="mt-1 text-xs text-aco/60">
            Compartilhe seu link com outros lojistas e comece a ganhar meses grátis.
          </p>
        </section>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Gift; label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-volt-950/[0.08] bg-white p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-cobalt-500" />
        <span className="font-data text-[10px] uppercase tracking-wider text-aco/55">{label}</span>
      </div>
      <p className="font-display mt-2 text-2xl font-extrabold text-volt-950">{String(value)}</p>
    </div>
  );
}
