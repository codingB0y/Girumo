import { loadQuadro } from "@/lib/stores/quadro";
import { QuadroBoard } from "@/components/admin/quadro/board";

export const dynamic = "force-dynamic";

export default async function AdminQuadroPage() {
  const snapshot = await loadQuadro();

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Quadro</h1>
        <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/55">
          {snapshot.features.length} features · atualiza sozinho a cada 4s
        </p>
      </div>

      <QuadroBoard initial={snapshot} />
    </div>
  );
}
