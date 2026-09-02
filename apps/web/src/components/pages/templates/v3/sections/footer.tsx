import { BRAND } from "@/lib/brand";
import { Wrap } from "@/components/pages/templates/v3/primitives";
import { T } from "@/components/pages/templates/v3/tokens";

/** Rodapé mínimo — não conta como seção (§8.1). Identidade da loja + assinatura. */
export function FooterV3({ storeName }: { storeName: string }) {
  return (
    <footer className="border-t border-[color:var(--lp-line)] bg-[var(--lp-bg)]">
      <Wrap className="flex flex-col items-start gap-2 py-8 lg:flex-row lg:items-center lg:justify-between">
        <span className={T.meta}>{storeName}</span>
        <span className={`${T.meta} opacity-70`}>página criada com {BRAND.name}</span>
      </Wrap>
    </footer>
  );
}
