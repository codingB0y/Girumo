import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { LEGAL_EFFECTIVE_DATE, LEGAL_ENTITY_PENDING, LEGAL_VERSION } from "@/lib/legal";

/**
 * Casca dos documentos legais.
 *
 * Server component de propósito: estas páginas precisam ser lidas por quem não
 * tem conta — e por robô de verificação do Stripe — então não podem depender de
 * JavaScript nem de sessão.
 */
export function LegalPage({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-canvas-100 text-volt-950">
      <div className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
        <Link
          href="/"
          className="font-data text-xs uppercase tracking-[0.16em] text-volt-950/50 transition-colors hover:text-volt-950"
        >
          ← {BRAND.name}
        </Link>

        <h1 className="font-display mt-6 text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 text-[17px] leading-relaxed text-volt-950/70">{summary}</p>

        <p className="font-data mt-5 text-xs uppercase tracking-[0.14em] text-volt-950/45">
          Versão {LEGAL_VERSION} · Em vigor desde {LEGAL_EFFECTIVE_DATE}
        </p>

        {LEGAL_ENTITY_PENDING && (
          <p
            role="alert"
            className="mt-6 rounded-xl border border-alerta/30 bg-alerta/[0.06] px-4 py-3 text-sm text-volt-950"
          >
            <strong className="font-semibold">Documento incompleto.</strong> A razão social e o
            CNPJ do controlador ainda não foram preenchidos. Enquanto isso, este texto não
            identifica formalmente a empresa responsável.
          </p>
        )}

        <div className="legal-body mt-10 space-y-8">{children}</div>

        <div className="mt-14 border-t border-volt-950/10 pt-6">
          <p className="text-sm text-volt-950/60">
            Veja também a{" "}
            <Link href="/privacidade" className="font-medium text-cobalt-700 underline">
              Política de Privacidade
            </Link>{" "}
            e os{" "}
            <Link href="/termos" className="font-medium text-cobalt-700 underline">
              Termos de Uso
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  );
}

/** Seção numerada. O número é da estrutura do contrato, não decoração. */
export function LegalSection({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="font-display text-lg font-bold tracking-[-0.01em]">
        <span className="font-data mr-2 text-volt-950/40">{n}.</span>
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-volt-950/80">{children}</div>
    </section>
  );
}
