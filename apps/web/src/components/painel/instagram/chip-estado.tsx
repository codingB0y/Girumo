import type { FlowStatus } from "@/lib/stores/ig-flows";

const ROTULO: Record<FlowStatus, string> = { draft: "Rascunho", live: "No ar", paused: "Pausado" };
const CLASSE: Record<FlowStatus, string> = { draft: "pn-chip pn-chip--line", live: "pn-chip pn-chip--acid", paused: "pn-chip pn-chip--risco" };

export function ChipEstado({ status }: { status: FlowStatus }) {
  return <span className={CLASSE[status]}>{ROTULO[status]}</span>;
}
