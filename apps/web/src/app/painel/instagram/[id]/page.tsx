import { EditorDoFluxo } from "@/components/painel/instagram/editor";

export const metadata = { title: "Fluxo do Instagram — Girumo" };

export default async function FluxoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // `key` por fluxo: o estado de salvamento em andamento nunca é dividido entre dois fluxos.
  return <EditorDoFluxo key={id} id={id} />;
}
