import Link from "next/link";
import { Link2Off } from "lucide-react";
import { numero } from "@/lib/painel/grupos";
import { rotuloAcessivel, TEXTO_DO_ESTADO, type CelulaDoMapa } from "@/lib/painel/ao-vivo/mapa";
import { cn } from "@/lib/utils";

/**
 * A lotação enche a célula de baixo para cima. O preenchimento é um tom com a
 * cor do estado e um fio sólido no topo: com o tom fraco o número continua
 * legível em cima dele, e o fio ainda diz "lotou" de longe. O Acid fica no
 * `span` — nunca na classe do link (regra 10, e2e da casca).
 *
 * Sem convite = contorno vermelho + ícone. O vermelho é `saida`: tem tom próprio
 * no tema noite (7,2:1 na superfície; o `danger-700` dava 2,7:1 ali).
 */
const PREENCHIMENTO: Record<CelulaDoMapa["estado"], string> = {
  cheio: "bg-acid-500/25 border-t-2 border-acid-500",
  quase: "bg-quase/25 border-t-2 border-quase",
  ativo: "bg-slate-600/20 border-t border-slate-600/60",
  sem_convite: "bg-slate-600/15",
  sumiu: "",
};

export function CelulaDoGrupo({ celula: c, bloco }: { celula: CelulaDoMapa; bloco: string }) {
  return (
    <Link
      href={c.href}
      aria-label={rotuloAcessivel(bloco, c)}
      className="group/celula relative block h-14 w-14 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative flex h-full w-full flex-col justify-between overflow-hidden rounded-md border bg-paper-0 p-1 tabular-nums",
          c.estado === "sem_convite" ? "border-saida" : c.estado === "sumiu" ? "border-dashed border-slate-600" : "border-line-200",
        )}
      >
        <span className={cn("absolute inset-x-0 bottom-0", PREENCHIMENTO[c.estado])} style={{ height: `${Math.round(c.lotacao * 100)}%` }} />
        {c.estado === "sem_convite" && <Link2Off className="absolute right-1 top-1 h-3 w-3 text-saida" aria-hidden="true" />}
        <span className="relative text-12 font-semibold leading-none text-volt-950">{c.rotulo}</span>
        <span className="relative text-[11px] leading-none text-volt-950">
          {c.novoAs ? `novo ${c.novoAs}` : c.entraram > 0 ? `+${numero(c.entraram)}` : ""}
        </span>
      </span>
      {/* Dica no hover e no foco do teclado; o leitor de tela já tem tudo no aria-label. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 hidden w-max max-w-[220px] -translate-x-1/2 rounded-md bg-volt-950 px-2.5 py-1.5 text-12 leading-snug text-paper-0 shadow-lg group-hover/celula:block group-focus-visible/celula:block"
      >
        <span className="block font-semibold">{c.nome}</span>
        {c.estado === "sumiu" ? (
          <span className="block">{TEXTO_DO_ESTADO.sumiu}</span>
        ) : (
          <span className="block tabular-nums">
            {numero(c.membros)} / {numero(c.capacidade)} · {Math.round(c.lotacao * 100)}% · {TEXTO_DO_ESTADO[c.estado]}
          </span>
        )}
        {(c.entraram > 0 || c.sairam > 0) && (
          <span className="block tabular-nums">
            hoje: +{numero(c.entraram)} −{numero(c.sairam)}
          </span>
        )}
        {c.novoAs && <span className="block">aberto hoje às {c.novoAs}</span>}
      </span>
    </Link>
  );
}
