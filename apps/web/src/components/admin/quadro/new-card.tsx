"use client";

import { useState } from "react";
import { BOARD_AREAS } from "@/lib/quadro/status";

interface NewCardFormProps {
  onCreated: () => void;
}

export function NewCardForm({ onCreated }: NewCardFormProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [area, setArea] = useState<string>(BOARD_AREAS[0]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /** A key é derivada do título: estável, legível e é por ela que o agente move o card. */
  const key = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!key) {
      setError("Título vazio.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/quadro", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, title, area }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(data.error ?? "Falhou");
        return;
      }
      setTitle("");
      setOpen(false);
      onCreated();
    } catch {
      setError("Rede falhou. Tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-line-200 bg-paper-0 px-3 py-1.5 text-xs font-semibold text-volt-950"
      >
        Novo card
      </button>
    );
  }

  return (
    <form onSubmit={handleCreate} className="flex flex-wrap items-center gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Título da feature"
        aria-label="Título da feature"
        className="rounded-lg border border-line-200 bg-paper-0 px-2 py-1 text-xs text-volt-950"
      />
      <select
        value={area}
        onChange={(e) => setArea(e.target.value)}
        aria-label="Área"
        className="rounded-lg border border-line-200 bg-paper-0 px-2 py-1 text-xs text-volt-950"
      >
        {BOARD_AREAS.map((a) => (
          <option key={a} value={a}>{a}</option>
        ))}
      </select>
      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-volt-950 px-3 py-1.5 text-xs font-semibold text-paper-0 disabled:opacity-50"
      >
        Criar
      </button>
      {/* Desabilitado durante o envio: sem isso o Cancelar fecha o formulário mas não
          impede o POST já em voo — o card nasce depois de você ter cancelado. */}
      <button
        type="button"
        onClick={() => setOpen(false)}
        disabled={saving}
        className="text-xs text-aco/60 disabled:opacity-50"
      >
        Cancelar
      </button>
      {key ? <span className="font-data text-[10px] text-aco/45">key: {key}</span> : null}
      {error ? <span className="text-[11px] text-danger-700">{error}</span> : null}
    </form>
  );
}
