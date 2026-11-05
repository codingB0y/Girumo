import Link from "next/link";
import { cn } from "@/lib/utils";

const ABAS = [
  { id: "fluxos", href: "/painel/instagram", rotulo: "Fluxos" },
  { id: "pessoas", href: "/painel/instagram/pessoas", rotulo: "Pessoas" },
] as const;

export type AbaDoInstagram = (typeof ABAS)[number]["id"];

/** As abas do Instagram. O plano de Conversas entra como a primeira. */
export function AbasInstagram({ ativa }: { ativa: AbaDoInstagram }) {
  return (
    <nav aria-label="Seções do Instagram" className="mt-4 flex gap-1 border-b border-line-200">
      {ABAS.map((a) => (
        <Link
          key={a.id}
          href={a.href}
          aria-current={a.id === ativa ? "page" : undefined}
          className={cn(
            "-mb-px inline-flex h-10 items-center border-b-2 px-3 text-13 font-medium",
            a.id === ativa ? "border-volt-950 text-volt-950" : "border-transparent text-slate-600 hover:text-volt-950",
          )}
        >
          {a.rotulo}
        </Link>
      ))}
    </nav>
  );
}
