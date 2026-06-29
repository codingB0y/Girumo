import { Hammer, Check } from "lucide-react";

/** Placeholder on-brand das seções ainda não desenhadas — lista o que virá. */
export function SectionStub({
  title,
  subtitle,
  planned,
}: {
  title: string;
  subtitle: string;
  planned: string[];
}) {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
      <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">{title}</h1>
      <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/60">{subtitle}</p>

      <div className="mt-8 overflow-hidden rounded-3xl border border-breu/[0.08] bg-white">
        <div className="flex items-center gap-3 border-b border-breu/[0.06] bg-bruma/50 px-6 py-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-iris/10 text-iris">
            <Hammer className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display font-bold text-breu">Próxima tela do protótipo</p>
            <p className="text-sm text-aco/70">O que esta seção vai mostrar:</p>
          </div>
        </div>
        <ul className="grid gap-3 p-6 sm:grid-cols-2">
          {planned.map((p) => (
            <li key={p} className="flex items-start gap-2.5 text-sm text-aco">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-iris" />
              {p}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
