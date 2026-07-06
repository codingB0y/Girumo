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
      <div className="mx-auto max-w-[800px] space-y-5 px-4 py-6 sm:px-6">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-white" />
        <div className="h-64 animate-pulse rounded-3xl bg-white" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[800px] space-y-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">Notificações WhatsApp</h1>
        <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/60">
          Receba alertas importantes direto no seu WhatsApp
        </p>
      </div>

      <section className="overflow-hidden rounded-3xl border border-breu/[0.08] bg-white">
        <div className="border-b border-breu/[0.06] px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-iris/10 text-iris">
                <Bell className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-display text-base font-bold text-breu">Alertas via WhatsApp</h2>
                <p className="mt-0.5 text-xs text-aco/60">Receba no seu número quando algo importante acontecer</p>
              </div>
            </div>
            <button
              onClick={() => setEnabled(!enabled)}
              className={cn(
                "relative h-7 w-12 rounded-full transition-colors",
                enabled ? "bg-iris" : "bg-breu/10",
              )}
            >
              <span
                className={cn(
                  "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform",
                  enabled ? "translate-x-6" : "translate-x-1",
                )}
              />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Número */}
          <div>
            <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-aco">
              <Smartphone className="h-4 w-4" /> Número para receber alertas
            </label>
            <input
              type="tel"
              placeholder="5511999999999"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
              className="h-11 w-full rounded-xl border border-breu/10 bg-bruma/30 px-4 text-sm text-breu placeholder:text-aco/40 outline-none transition focus:border-iris/40 focus:ring-2 focus:ring-iris/10 sm:w-72"
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
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition",
                      active
                        ? "border-iris/30 bg-iris/[0.04]"
                        : "border-breu/[0.06] hover:border-iris/20",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition",
                        active ? "border-iris bg-iris text-white" : "border-breu/20",
                      )}
                    >
                      {active && <Check className="h-3 w-3" />}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-breu">{evt.label}</p>
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
              "flex h-11 items-center gap-2 rounded-xl px-6 text-sm font-medium text-white transition",
              saving || !phone
                ? "cursor-not-allowed bg-iris/40"
                : saved
                  ? "bg-sucesso shadow-none"
                  : "bg-iris shadow-iris hover:-translate-y-0.5 hover:bg-iris-claro",
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
