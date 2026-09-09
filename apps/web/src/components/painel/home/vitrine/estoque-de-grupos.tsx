"use client";

import Link from "next/link";
import type { Group } from "@/lib/mock-data";
import { resumoDoEstoque } from "@/lib/painel/inicio";
import { cn } from "@/lib/utils";

const CAIXAS_NA_FAIXA = 91; // 13 x 7, como na prateleira grande

/**
 * Bloco 6 (12.3): a prateleira em miniatura, cada grupo uma caixa que enche de
 * baixo pra cima. Cheia vira Volt com filete Acid; ≥ 90% ganha o aviso.
 */
export function EstoqueDeGrupos({ grupos }: { grupos: readonly Group[] }) {
  const r = resumoDoEstoque(grupos);
  const caixas = [...grupos]
    .sort((a, b) => (b.capacity ? b.members / b.capacity : 0) - (a.capacity ? a.members / a.capacity : 0))
    .slice(0, CAIXAS_NA_FAIXA);

  if (grupos.length === 0) {
    return (
      <div className="pn-card rounded-[var(--radius-control)] p-5">
        <p className="text-15 text-volt-950">Nenhum grupo sincronizado.</p>
        <p className="mt-1 text-13 text-slate-600">A prateleira mostra cada grupo como uma caixa que enche.</p>
        <Link href="/painel/grupos" className="mt-3 inline-flex min-h-11 items-center text-15 font-semibold text-cobalt-500">
          Sincronizar grupos
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <Link
        href="/painel/grupos"
        data-testid="inicio-prateleira"
        aria-label={`${r.grupos} grupos, ${r.pessoas.toLocaleString("pt-BR")} pessoas, ${r.vagas.toLocaleString("pt-BR")} vagas. Ver grupos`}
        className="pn-prateleira pn-prateleira--mini shrink-0"
      >
        {caixas.map((g) => {
          const lotacao = g.capacity > 0 ? Math.min(1, g.members / g.capacity) : 0;
          return (
            <span
              key={g.id}
              className={cn(
                "pn-prateleira__caixa",
                lotacao >= 1 && "pn-prateleira__caixa--cheia",
                lotacao >= 0.9 && lotacao < 1 && "pn-prateleira__caixa--quase",
              )}
              title={`${g.name} · ${g.members.toLocaleString("pt-BR")} / ${g.capacity.toLocaleString("pt-BR")}`}
              style={{ ["--lotacao" as string]: lotacao }}
            />
          );
        })}
      </Link>

      {r.quaseCheio && (
        <div className="pn-aviso lg:max-w-[360px]" role="status">
          <p>
            {r.quaseCheio.name} está com {r.quaseCheio.members.toLocaleString("pt-BR")} /{" "}
            {r.quaseCheio.capacity.toLocaleString("pt-BR")}.
          </p>
          <Link href="/painel/grupos" className="mt-1 inline-flex min-h-11 items-center text-13 font-semibold text-cobalt-500 lg:min-h-8">
            Ver grupos e preparar o próximo
          </Link>
        </div>
      )}
    </div>
  );
}
