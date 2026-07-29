"use client";

import { useEffect, useState } from "react";
import { Bell, Check, Loader2, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";

const AVAILABLE_EVENTS = [
  { id: "group_full", label: "Grupo lotou", desc: "Quando um grupo atinge a capacidade máxima" },
  { id: "lead_new", label: "Novo lead", desc: "Quando alguém entra num grupo pela primeira vez" },
  { id: "lead_hot", label: "Lead quente", desc: "Lead com alta interação (3+ interações em 7 dias)" },
  { id: "broadcast_failed", label: "Disparo falhou", desc: "Quando um broadcast não é entregue" },
  { id: "warmup_complete", label: "Aquecimento completo", desc: "Número completou o período de warmup" },
];

export default function WebhookConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [phone, setPhone] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [events, setEvents] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/webhooks/config")
      .then((r) => r.json())
      .then((data) => {
        if (data) {
          setPhone(data.phone ?? "");
          setEnabled(data.enabled ?? false);
          setEvents(data.events ?? []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function toggleEvent(id: string) {
    setEvents((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]));
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/webhooks/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, enabled, events }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-[800px] space-y-5 px-4 py-8 sm:px-8">
        <div className="pn-skeleton h-10 w-64 rounded-lg" />
        <div className="pn-skeleton h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[800px] space-y-8 px-4 py-8 sm:px-8">
      <header>
        <h1 className="font-display text-[28px] font-extrabold tracking-[-0.02em] text-volt-950">Notificações WhatsApp</h1>
        <p className="font-editorial mt-1 text-[19px] italic text-ardosia">
          Alertas importantes chegam direto no seu WhatsApp.
        </p>
      </header>

      <section className="pn-card overflow-hidden rounded-2xl">
        <div className="border-b border-volt-950/[0.06] px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cobalt-500/10 text-cobalt-500">
                <Bell className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <div>
                <h2 className="font-display text-base font-bold text-volt-950">Alertas via WhatsApp</h2>
                <p className="mt-0.5 text-xs text-aco/60">Receba no seu número quando algo importante acontecer</p>
              </div>
            </div>
            <button
              onClick={() => setEnabled(!enabled)}
              aria-label={enabled ? "Desativar alertas" : "Ativar alertas"}
              aria-pressed={enabled}
              className={cn(
                "relative h-7 w-12 cursor-pointer rounded-full transition-colors duration-[160ms] ease-[var(--ease-fluxo)]",
                enabled ? "bg-cobalt-500" : "bg-volt-950/10",
              )}
            >
              <span
                className={cn(
                  "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform duration-[160ms] ease-[var(--ease-fluxo)]",
                  enabled ? "translate-x-6" : "translate-x-1",
                )}
              />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Número */}
          <div>
            <label htmlFor="wh-phone" className="mb-1.5 flex items-center gap-2 text-sm font-medium text-aco">
              <Smartphone className="h-4 w-4" strokeWidth={1.75} /> Número para receber alertas
            </label>
            <input
              id="wh-phone"
              type="tel"
              placeholder="5511999999999"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
              className="font-data h-11 w-full rounded-[10px] border border-volt-950/10 bg-poco px-4 text-sm tabular-nums text-volt-950 placeholder:text-aco/40 outline-none transition-[border-color,box-shadow] duration-[160ms] ease-[var(--ease-fluxo)] focus:border-cobalt-500/50 focus:bg-papel focus:shadow-[0_0_0_3px_var(--color-cobalt-soft)] sm:w-72"
            />
            <p className="mt-1 text-xs text-aco/50">Somente números, com DDD. Ex: 5511999999999</p>
          </div>

          {/* Eventos */}
          <div>
            <p className="mb-3 text-sm font-medium text-aco">Quais eventos notificar?</p>
            <div className="space-y-2">
              {AVAILABLE_EVENTS.map((evt) => {
                const active = events.includes(evt.id);
                return (
                  <button
                    key={evt.id}
                    type="button"
                    onClick={() => toggleEvent(evt.id)}
                    aria-pressed={active}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3.5 text-left transition-colors duration-[160ms] ease-[var(--ease-fluxo)]",
                      active
                        ? "border-cobalt-500/30 bg-cobalt-500/[0.05]"
                        : "border-volt-950/[0.06] bg-poco hover:border-cobalt-500/20",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition",
                        active ? "border-cobalt-500 bg-cobalt-500 text-white" : "border-volt-950/20",
                      )}
                    >
                      {active && <Check className="h-3 w-3" />}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-volt-950">{evt.label}</p>
                      <p className="mt-0.5 text-xs text-aco/55">{evt.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Save button */}
          <button
            onClick={save}
            disabled={saving || !phone}
            className={cn(
              "flex h-11 cursor-pointer items-center gap-2 rounded-xl px-6 text-sm font-medium text-white transition ease-[var(--ease-fluxo)]",
              saving || !phone
                ? "cursor-not-allowed bg-cobalt-500/40"
                : saved
                  ? "bg-sucesso"
                  : "bg-cobalt-500 hover:brightness-110",
            )}
          >
            {saving ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
            ) : saved ? (
              <><Check className="h-4 w-4" /> Salvo!</>
            ) : (
              "Salvar configuração"
            )}
          </button>
        </div>
      </section>
    </div>
  );
}
