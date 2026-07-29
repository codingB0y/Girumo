import type { Metadata } from "next";
import { DemoExperience } from "@/components/demo/demo-experience";

export const metadata: Metadata = {
  title: "Demonstração",
  description: "Conheça o painel da Girumo sem conectar seu WhatsApp.",
};

export default function DemoPage() {
  return <DemoExperience />;
}
