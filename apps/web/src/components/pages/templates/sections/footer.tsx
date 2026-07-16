import { TYPE } from "@/components/pages/templates/tokens";

/**
 * Rodapé mínimo — NÃO conta como seção (§8.1). Identidade da loja + assinatura
 * HubFlow. O link jurídico definitivo (política de privacidade) entra com o gate
 * jurídico da Fase 4/8; por ora fica só a identificação.
 */
export function FooterSection({ storeName }: { storeName: string }) {
  return (
    <footer className="bg-[#221a13]">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-2 px-5 py-8 lg:flex-row lg:items-center lg:justify-between lg:px-10">
        <span className={`${TYPE.meta} text-white/60`}>{storeName}</span>
        <span className={`${TYPE.meta} text-white/40`}>página criada com HubFlow</span>
      </div>
    </footer>
  );
}
