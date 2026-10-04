import { Check, CircleAlert } from "lucide-react";
import { checklist, grupoDaIssue, type Issue } from "@/lib/ig/flow/validate";

export function PraPublicar({ issues }: { issues: Issue[] }) {
  const itens = checklist(issues);
  const feitos = itens.filter((i) => i.ok).length;
  return (
    <section aria-labelledby="pra-publicar" className="rounded-[10px] border border-line-200 bg-paper-0 px-5 pb-3">
      <header className="flex h-12 items-center justify-between">
        <h2 id="pra-publicar" className="text-15 font-semibold text-volt-950">Pra publicar</h2>
        <span className="font-data text-13 tabular-nums text-slate-600">{feitos} de {itens.length}</span>
      </header>
      <ul>
        {itens.map((i) => (
          <li key={i.chave} className="flex items-start gap-2 border-t border-line-200 py-2.5 text-13">
            {i.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-success-700" aria-hidden="true" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-700" aria-hidden="true" />}
            <span className={i.ok ? "text-slate-600" : "font-medium text-volt-950"}>
              {i.rotulo}
              {!i.ok && <span className="block font-normal text-slate-600">{issues.find((x) => grupoDaIssue(x.code) === i.chave)?.text}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
