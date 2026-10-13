import { Suspense } from "react";
import { AssinarInstagram } from "@/components/painel/instagram/assinar";

export const metadata = { title: "Assinar o Instagram — Girumo" };

export default function AssinarInstagramPage() {
  return (
    <section className="px-5 py-6 lg:px-8">
      <h1 className="text-20 font-semibold text-volt-950">Assinar o Instagram</h1>
      <p className="mt-1 mb-4 max-w-[60ch] text-13 text-slate-600">
        Quem comenta a palavra no post, manda no direct ou responde o story recebe no direct o link do grupo de WhatsApp da campanha.
      </p>
      {/* Suspense: `useSearchParams` sem ele derruba o pré-render da página. */}
      <Suspense fallback={null}>
        <AssinarInstagram />
      </Suspense>
    </section>
  );
}
