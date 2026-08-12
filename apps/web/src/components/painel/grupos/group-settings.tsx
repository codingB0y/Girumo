"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Edição do que o painel é dono num grupo: convite e capacidade.
 *
 * O `PATCH /api/groups` existe desde sempre e nunca teve chamador — era por
 * isso que os 194 grupos em produção estavam sem `invite_url` e nenhum link
 * mestre conseguia mandar ninguém pra lugar nenhum. Este formulário é o fio
 * que faltava.
 *
 * A validação de verdade é a do servidor; aqui só repassamos a mensagem dele.
 */
export function GroupSettings({
  groupId,
  inviteUrl,
  capacity,
  onSaved,
  onClose,
}: {
  /** `whatsappGroupId` — é o que a rota espera em `id`. */
  groupId: string;
  inviteUrl?: string;
  capacity: number;
  onSaved: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [invite, setInvite] = useState(inviteUrl ?? "");
  const [cap, setCap] = useState(String(capacity || 1024));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/groups", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: groupId, inviteUrl: invite, capacity: Number(cap) }),
      });
      if (!res.ok) {
        const detail = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(detail.error ?? "Não foi possível salvar.");
      }
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="col-span-full mt-1 rounded-xl border border-volt-950/10 bg-poco p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className="font-data block text-[10px] uppercase tracking-[0.08em] text-aco/55">
            Link de convite
          </span>
          <input
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
            placeholder="https://chat.whatsapp.com/…"
            autoComplete="off"
            className="mt-1.5 w-full rounded-[10px] border border-volt-950/10 bg-papel px-3 py-2 text-sm text-volt-950 outline-none transition-[border-color,box-shadow] duration-[160ms] ease-[var(--ease-fluxo)] placeholder:text-aco/40 focus:border-cobalt-500/50 focus:shadow-[0_0_0_3px_var(--color-cobalt-soft)]"
          />
        </label>
        <label className="sm:w-32">
          <span className="font-data block text-[10px] uppercase tracking-[0.08em] text-aco/55">
            Capacidade
          </span>
          <input
            value={cap}
            onChange={(e) => setCap(e.target.value)}
            inputMode="numeric"
            className="font-data mt-1.5 w-full rounded-[10px] border border-volt-950/10 bg-papel px-3 py-2 text-sm tabular-nums text-volt-950 outline-none transition-[border-color,box-shadow] duration-[160ms] ease-[var(--ease-fluxo)] focus:border-cobalt-500/50 focus:shadow-[0_0_0_3px_var(--color-cobalt-soft)]"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className={cn(
              "rounded-xl bg-cobalt-500 px-4 py-2 text-sm font-medium text-white transition-[transform,filter] duration-[160ms] ease-[var(--ease-fluxo)]",
              "hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0",
            )}
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-2 text-sm text-aco/70 transition-colors duration-[160ms] hover:text-volt-950"
          >
            Cancelar
          </button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-alerta">
          {error}
        </p>
      ) : (
        <p className="mt-2 text-xs text-aco/55">
          O convite é o destino do link da campanha. Deixe em branco para remover.
        </p>
      )}
    </div>
  );
}
