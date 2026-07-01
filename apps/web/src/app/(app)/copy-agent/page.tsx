import { Topbar } from "@/components/topbar";
import { CopyAgentPanel } from "@/components/copy-agent-panel";

export const metadata = {
  title: "Copy Agent — HubFlow",
  description: "Gere textos de oferta otimizados pra WhatsApp com IA.",
};

export default function CopyAgentPage() {
  return (
    <>
      <Topbar title="Copy Agent" subtitle="Gere textos com IA pra seus disparos" />
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-xl rounded-2xl border border-breu/[0.06] bg-white p-6 shadow-sm">
          <CopyAgentPanel />
        </div>
      </main>
    </>
  );
}
