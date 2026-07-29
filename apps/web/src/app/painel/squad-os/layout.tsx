import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Equipe AI — Girumo",
  description: "Squad OS — Sua equipe de agentes AI operando a Girumo",
};

export default function SquadOSLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
