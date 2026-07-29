"use client";

import { useEffect, useMemo, useState } from "react";
import { X, PartyPopper, Download, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Group } from "@/lib/mock-data";
import { computeCelebrations, pendingCelebrations, type Celebration } from "@/lib/celebrations";

// Peças de confete: posição/cor/atraso fixos por índice (decorativo, sem estado).
const CONFETTI_PIECES = [
  { left: "8%", bg: "bg-cobalt-500", delay: "0s" },
  { left: "20%", bg: "bg-sucesso", delay: "0.15s" },
  { left: "34%", bg: "bg-atencao", delay: "0.05s" },
  { left: "48%", bg: "bg-cobalt-500", delay: "0.25s" },
  { left: "62%", bg: "bg-sucesso", delay: "0.1s" },
  { left: "76%", bg: "bg-atencao", delay: "0.3s" },
  { left: "90%", bg: "bg-cobalt-500", delay: "0.2s" },
];

export function CelebrationModal({
  groups,
  leads,
  monthlyGoal,
}: {
  groups: Group[];
  leads: unknown[];
  monthlyGoal: number | null;
}) {
  const [pending, setPending] = useState<Celebration[] | null>(null);
  const [active, setActive] = useState<Celebration | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [celebrationsRes, ordersRes] = await Promise.all([
          fetch("/api/celebrations").then((r) => r.json()).catch(() => ({ celebrated: [] })),
          fetch("/api/orders").then((r) => r.json()).catch(() => []),
        ]);
        if (cancelled) return;

        const celebratedKeys = new Set<string>(
          Array.isArray(celebrationsRes?.celebrated) ? celebrationsRes.celebrated : [],
        );
        const ordersCount = Array.isArray(ordersRes) ? ordersRes.length : 0;

        const fullGroups = groups
          .filter((g) => g.capacity > 0 && g.members >= g.capacity)
          .map((g) => ({ id: g.id, name: g.name, members: g.members }));

        const signals = {
          fullGroups,
          monthlyGoal,
          contacts: leads.length,
          ordersCount,
        };

        const all = computeCelebrations(signals);
        const next = pendingCelebrations(all, celebratedKeys);
        if (!cancelled) {
          setPending(next);
          setActive(next[0] ?? null);
        }
      } catch {
        if (!cancelled) {
          setPending([]);
          setActive(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!pending || !active) return null;

  return <CelebrationCard marco={active} onDismiss={() => setActive(null)} />;
}

function CelebrationCard({ marco, onDismiss }: { marco: Celebration; onDismiss: () => void }) {
  const [quote, setQuote] = useState("");
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const ogUrl = useMemo(() => {
    const params = new URLSearchParams({
      stat: String(marco.stat),
      label: marco.label,
      title: marco.title,
    });
    return `/api/og?${params.toString()}`;
  }, [marco]);

  function markCelebrated() {
    fetch("/api/celebrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markerKey: marco.key }),
    }).catch(() => {});
  }

  function handleClose() {
    markCelebrated();
    onDismiss();
  }

  function handleDownload() {
    window.open(ogUrl, "_blank", "noopener,noreferrer");
    markCelebrated();
  }

  function handleWhatsApp() {
    const text = `${marco.title} — ${marco.stat} ${marco.label} 🎉`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    markCelebrated();
  }

  async function handleSubmitTestimonial() {
    if (sending || quote.trim().length < 10) return;
    setError("");
    setSending(true);
    try {
      const res = await fetch("/api/testimonials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote: quote.trim(), consentPublic: consent }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error || "Não foi possível enviar seu depoimento.");
        return;
      }
      setSent(true);
      markCelebrated();
    } catch {
      setError("Não foi possível enviar seu depoimento.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-volt-950/60 backdrop-blur-sm px-4">
      <div className="pn-palette-in relative w-full max-w-md overflow-hidden rounded-2xl border border-volt-950/10 bg-white p-6 shadow-xl">
        {/* Confete decorativo */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 overflow-hidden">
          {CONFETTI_PIECES.map((p, i) => (
            <span
              key={i}
              className={cn("animate-confetti-fall absolute top-0 h-2.5 w-2.5 rounded-sm", p.bg)}
              style={{ left: p.left, animationDelay: p.delay }}
            />
          ))}
        </div>

        <button
          onClick={handleClose}
          aria-label="Fechar"
          className="absolute right-4 top-4 rounded-lg p-1 text-aco/50 transition-colors hover:bg-poco hover:text-volt-950"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative flex flex-col items-center pt-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sucesso/10 text-sucesso">
            <PartyPopper className="h-6 w-6" strokeWidth={1.75} />
          </span>
          <h2 className="font-display mt-4 text-xl font-bold text-volt-950">{marco.title}</h2>
          <p className="font-data mt-3 text-[44px] font-medium leading-none tracking-[-0.03em] tabular-nums text-cobalt-500">
            {marco.stat.toLocaleString("pt-BR")}
          </p>
          <p className="mt-1 text-sm text-aco/70">{marco.label}</p>
        </div>

        {/* Compartilhar */}
        <div className="mt-6">
          <p className="font-data text-[10px] uppercase tracking-[0.08em] text-aco/55">Compartilhar</p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={handleDownload}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-volt-950/10 py-2.5 text-sm font-medium text-volt-950 transition hover:bg-poco"
            >
              <Download className="h-4 w-4" /> Baixar imagem
            </button>
            <button
              onClick={handleWhatsApp}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-sucesso py-2.5 text-sm font-medium text-white transition hover:brightness-110"
            >
              <MessageCircle className="h-4 w-4" /> Enviar no WhatsApp
            </button>
          </div>
        </div>

        {/* Depoimento */}
        <div className="mt-6 border-t border-volt-950/[0.06] pt-5">
          {sent ? (
            <p className="pn-pop text-center text-sm font-medium text-sucesso">
              Obrigado pelo depoimento! 🎉
            </p>
          ) : (
            <>
              <label className="block">
                <span className="font-data text-[10px] uppercase tracking-[0.08em] text-aco/55">
                  Conta em uma frase o que mudou?
                </span>
                <textarea
                  value={quote}
                  onChange={(e) => setQuote(e.target.value)}
                  rows={3}
                  placeholder="Ex.: Consegui encher meus grupos em uma semana…"
                  className="mt-1.5 w-full resize-none rounded-[10px] border border-volt-950/10 bg-poco px-3 py-2.5 text-sm text-volt-950 outline-none transition-[border-color,box-shadow] duration-[160ms] ease-[var(--ease-fluxo)] placeholder:text-aco/40 focus:border-cobalt-500/50 focus:bg-papel focus:shadow-[0_0_0_3px_var(--color-cobalt-soft)]"
                />
              </label>

              <label className="mt-3 flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-volt-950/20 accent-cobalt-500"
                />
                <span className="text-xs text-aco/70">Autorizo o uso público do meu depoimento</span>
              </label>

              {error && <p className="mt-2 text-xs text-alerta">{error}</p>}

              <button
                onClick={handleSubmitTestimonial}
                disabled={sending || quote.trim().length < 10}
                className="mt-4 w-full rounded-xl bg-cobalt-500 py-2.5 text-sm font-medium text-white shadow-brand transition hover:brightness-110 disabled:opacity-50"
              >
                {sending ? "Enviando…" : "Enviar"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
