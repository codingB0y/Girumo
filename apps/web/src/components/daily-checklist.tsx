"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";

export type ChecklistItem = { id: string; label: string; hint?: string };

/**
 * Checklist diário (D4): a rotina de 30min/dia do operador. Marcações ficam no
 * localStorage por DATA — vira do zero todo dia automaticamente. Sem backend:
 * é só disciplina pessoal, não estado compartilhado.
 */
export function DailyChecklist({ items }: { items: ChecklistItem[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const key = `devzap-checklist-${today}`;
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setChecked(JSON.parse(localStorage.getItem(key) || "{}"));
    } catch {
      setChecked({});
    }
    setReady(true);
  }, [key]);

  function toggle(id: string) {
    setChecked((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  const doneCount = items.filter((i) => checked[i.id]).length;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-slate-400">
          {ready ? `${doneCount}/${items.length} feitos hoje` : "—"}
        </p>
      </div>
      <div className="space-y-1">
        {items.map((it) => {
          const on = !!checked[it.id];
          return (
            <button
              key={it.id}
              onClick={() => toggle(it.id)}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-slate-50"
            >
              {on ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
              ) : (
                <Circle className="h-5 w-5 shrink-0 text-slate-300" />
              )}
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-medium ${on ? "text-slate-400 line-through" : "text-slate-800"}`}>
                  {it.label}
                </span>
                {it.hint && !on && <span className="block text-xs text-slate-400">{it.hint}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
