import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Equipe AI — HubFlow",
  description: "Squad OS — Sua equipe de agentes AI operando o HubFlow",
};

export default function SquadOSLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
