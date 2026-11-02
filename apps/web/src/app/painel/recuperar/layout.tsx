import { PortaDoRecuperar } from "@/components/painel/recuperar/porta-do-recuperar";

export const metadata = { title: "Recuperar — Girumo" };

export default function RecuperarLayout({ children }: { children: React.ReactNode }) {
  return <PortaDoRecuperar>{children}</PortaDoRecuperar>;
}
