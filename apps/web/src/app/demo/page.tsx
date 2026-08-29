import type { Metadata } from "next";
import { DemoFlow } from "@/components/demo/demo-flow";

export const metadata: Metadata = {
  title: "Demonstração — Girumo",
  description: "Veja como uma campanha vira grupo cheio e pedido, sem conectar nada.",
};

export default function DemoPage() {
  return <DemoFlow />;
}
