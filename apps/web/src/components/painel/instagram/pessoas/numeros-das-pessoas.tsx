import { fieldLabel } from "@/lib/ig/flow/names";
import type { ContactStats } from "@/lib/stores/ig-contacts";

const nf = new Intl.NumberFormat("pt-BR");

function Numero({ rotulo, valor, nota }: { rotulo: string; valor: string; nota: string }) {
  return (
    <div className="rounded-[10px] border border-line-200 bg-paper-0 px-4 py-3">
      <dt className="text-12 text-slate-600">{rotulo}</dt>
      <dd className="mt-1 font-data text-20 font-semibold tabular-nums text-volt-950">{valor}</dd>
      <dd className="mt-0.5 text-12 text-slate-600">{nota}</dd>
    </div>
  );
}

/** Os quatro números do topo (contados no banco; o PostgREST cortaria a lista em 1000). */
export function NumerosDasPessoas({ stats }: { stats: ContactStats | null }) {
  if (!stats) return <div role="status" aria-label="Carregando números" className="pn-skeleton mt-4 h-20 rounded-[10px]" />;
  const campo = [...stats.campos].sort((a, b) => b.pessoas - a.pessoas)[0];
  const pct = stats.total > 0 ? Math.round((stats.comEtiqueta / stats.total) * 100) : 0;
  return (
    <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Numero rotulo="Pessoas" valor={nf.format(stats.total)} nota={`+${nf.format(stats.hoje)} hoje`} />
      <Numero rotulo="Conversaram nas últimas 24 h" valor={nf.format(stats.janela24h)} nota="ainda podem receber direct" />
      <Numero rotulo="Com alguma etiqueta" valor={nf.format(stats.comEtiqueta)} nota={`${pct}% do total`} />
      <Numero rotulo="Campo mais preenchido" valor={campo ? fieldLabel(campo.campo) : "—"} nota={campo ? `em ${nf.format(campo.pessoas)} pessoas` : "nenhum ainda"} />
    </dl>
  );
}
