import Link from "next/link";
import type { EntradaSettings } from "@/lib/campaigns/settings";

/** Rótulos EXATOS — a E2E casa por eles. */
export function chipLabels(e: EntradaSettings): string[] {
  const lotado = e.lotado.modo === "aviso" ? "aviso" : e.lotado.modo === "pagina" ? "lista de espera" : "outro link";
  const chips = [
    `Deep link · ${e.deep_link ? "ligado" : "desligado"}`,
    `1 grupo por pessoa · ${e.um_grupo_por_pessoa ? "ligado" : "desligado"}`,
    `Lotado · ${lotado}`,
  ];
  if (e.encerra_em) {
    const [, m, d] = e.encerra_em.split("-");
    chips.splice(2, 0, `Encerra em ${d}/${m}`);
  }
  return chips;
}

/** Resumo do comportamento do link, no cabeçalho. Cada chip leva à aba Entrada. */
export function ConfigChips({ entrada, href }: { entrada: EntradaSettings; href: string }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Configurações de entrada">
      {chipLabels(entrada).map((label) => (
        <li key={label}>
          <Link href={href} className="pn-etiqueta bg-poco text-aco transition-colors duration-[160ms] hover:bg-cobalt-500/10 hover:text-cobalt-500">
            {label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
