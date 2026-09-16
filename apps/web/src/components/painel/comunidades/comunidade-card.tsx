import Link from "next/link";
import { Sprout } from "lucide-react";
import { numero } from "@/lib/painel/grupos";

export type ComunidadeResumo = {
  slug: string;
  nome: string;
  totalGrupos: number;
  totalMembros: number;
  autoGrow: boolean;
  whatsappCommunityJid: string | null;
};

/**
 * Cartão de uma comunidade na tela de listagem: nome, quantos grupos e a soma
 * de membros — o número que hoje não existe em lugar nenhum do painel para
 * uma coleção de grupos (spec 2.5, Step 2).
 */
export function ComunidadeCard({ comunidade }: { comunidade: ComunidadeResumo }) {
  const { nome, slug, totalGrupos, totalMembros, autoGrow, whatsappCommunityJid } = comunidade;

  return (
    <Link
      href={`/painel/comunidades/${slug}`}
      className="pn-card block rounded-[var(--radius-control)] p-5 transition-colors duration-[160ms] ease-[var(--ease-fluxo)] hover:border-cobalt-500/30"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-[17px] font-semibold text-volt-950">{nome}</p>
        {whatsappCommunityJid !== null && (
          <span className="font-data inline-flex h-6 shrink-0 items-center rounded-[var(--radius-chip)] bg-sucesso/10 px-2 text-12 text-sucesso">
            No WhatsApp
          </span>
        )}
      </div>

      <p className="font-data mt-3 text-13 text-slate-600">
        {totalGrupos} {totalGrupos === 1 ? "grupo" : "grupos"} ·{" "}
        <span className="tabular-nums">{numero(totalMembros)}</span> membros
      </p>

      {autoGrow && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-12 text-aco">
          <Sprout className="h-3.5 w-3.5" aria-hidden="true" />
          Auto-grow ligado
        </p>
      )}
    </Link>
  );
}
