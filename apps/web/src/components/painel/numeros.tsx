"use client";

/** Células da faixa de números: a da campanha (direção D) e a da Início "Ao vivo". */

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { variacao, type Barra } from "@/lib/painel/atividade";
import { numero } from "@/lib/painel/grupos";
import { cn } from "@/lib/utils";

export function Celula({ rotulo, valor, className, children }: { rotulo: string; valor: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("bg-paper-0 px-5 py-4", className)}>
      <p className="text-13 text-slate-600">{rotulo}</p>
      <p className="mt-2 font-display text-32 font-bold leading-none tracking-[-0.015em] tabular-nums text-volt-950">{valor}</p>
      <div className="mt-2.5 text-13 text-slate-600">{children}</div>
    </div>
  );
}

/** Hoje contra o mesmo dia da semana passada, até a mesma hora: dia parcial contra dia parcial. */
export function ContraSemanaPassada({ hoje, antes, diaPassado, curto = false }: { hoje: number; antes: number; diaPassado: string; curto?: boolean }) {
  const delta = variacao(hoje, antes);
  // Curto (celular): "↗ +18% · 181 na terça passada", sem o "vs" nem o "mesma hora".
  if (delta === null) return curto ? <>{numero(antes)} {diaPassado}</> : <>{numero(antes)} {diaPassado}, mesma hora</>;
  return (
    <>
      <span className={cn("inline-flex items-center font-semibold", delta >= 0 ? "text-success-700" : "text-danger-700")}>
        {delta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />}
        {delta > 0 ? "+" : ""}
        {delta}%
      </span>{" "}
      {curto ? `· ${numero(antes)} ${diaPassado}` : `vs ${numero(antes)} ${diaPassado}, mesma hora`}
    </>
  );
}

/** Entraram contra saíram hoje, numa barra só. */
export function EntrouSaiu({ entraram, sairam }: { entraram: number; sairam: number }) {
  const total = entraram + sairam;
  return (
    <span className="mb-1.5 flex h-1.5 gap-px overflow-hidden rounded-full bg-line-200" aria-hidden="true">
      {total > 0 && <span className="bg-serie" style={{ width: `${(entraram / total) * 100}%` }} />}
      {total > 0 && <span className="bg-saida" style={{ width: `${(sairam / total) * 100}%` }} />}
    </span>
  );
}

/** Os últimos 7 dias em miniatura; o de hoje aceso, e dia sem medição só com o traço. */
export function Faisca({ barras }: { barras: Barra[] }) {
  const max = Math.max(1, ...barras.map((b) => (b.semMedicao ? 0 : b.valor)));
  return (
    <span className="flex shrink-0 flex-col items-end gap-1" aria-hidden="true">
      <span className="flex h-8 items-end gap-[3px]">
        {barras.map((b) => (
          <span
            key={b.chave}
            className={cn("block w-[5px] rounded-t-[1px]", b.semMedicao ? "bg-line-200" : b.atual ? "bg-serie" : "bg-slate-600/50")}
            style={{ height: b.semMedicao ? 2 : `${Math.max(8, (b.valor / max) * 100)}%` }}
          />
        ))}
      </span>
      <span className="text-12 text-slate-600">7 dias</span>
    </span>
  );
}
