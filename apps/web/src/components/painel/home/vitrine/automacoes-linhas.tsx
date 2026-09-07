"use client";

import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/components/toast";
import type { Automation } from "@/components/painel/home/types";
import { diaHoraCurto } from "@/lib/painel/inicio";

/**
 * Bloco 8 (12.3): três automações como linhas com interruptor. Desligada não
 * fica apagada: texto Slate sólido. Liga e desliga pela mesma rota da tela de
 * Automações, otimista, desfazendo se a API recusar.
 */
export function AutomacoesLinhas({ automacoes, agora }: { automacoes: readonly Automation[]; agora: Date }) {
  const toast = useToast();
  const [estado, setEstado] = useState<Record<string, boolean>>({});
  const [salvando, setSalvando] = useState<string | null>(null);

  const ligada = (a: Automation) => estado[a.id] ?? a.enabled;

  async function alternar(a: Automation) {
    const proximo = !ligada(a);
    setEstado((s) => ({ ...s, [a.id]: proximo }));
    setSalvando(a.id);
    try {
      const res = await fetch("/api/automations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: a.id, enabled: proximo }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      setEstado((s) => ({ ...s, [a.id]: !proximo }));
      toast("Não foi possível mudar a automação.", "error");
    } finally {
      setSalvando(null);
    }
  }

  if (automacoes.length === 0) {
    return (
      <div className="pn-card rounded-[var(--radius-control)] p-5">
        <p className="text-15 text-volt-950">Nenhuma automação ligada.</p>
        <p className="mt-1 text-13 text-slate-600">Boas-vindas, aviso de grupo lotado e novidade da semana saem sozinhos.</p>
        <Link href="/painel/automacoes" className="mt-3 inline-flex min-h-11 items-center text-15 font-semibold text-cobalt-500">
          Ligar uma automação
        </Link>
      </div>
    );
  }

  return (
    <ul className="pn-card rounded-[var(--radius-control)] px-4">
      {automacoes.slice(0, 3).map((a) => {
        const on = ligada(a);
        return (
          <li key={a.id} className="flex min-h-14 items-center gap-3 border-b border-line-200 last:border-b-0 lg:min-h-16">
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={`${a.name}: ${on ? "ligada" : "desligada"}`}
              disabled={salvando === a.id}
              onClick={() => void alternar(a)}
              className="pn-interruptor"
            >
              <span className="pn-interruptor__bolinha" aria-hidden="true" />
            </button>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-15 font-semibold text-volt-950">{a.name}</span>
              <span className="block truncate text-13 text-slate-600">
                {a.lastRunAt ? `rodou ${diaHoraCurto(a.lastRunAt, agora)}` : on ? "ligada, ainda não rodou" : "desligada"}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
