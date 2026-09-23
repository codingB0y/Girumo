import { redirect } from "next/navigation";

// Automações saiu do painel em 23/09/2026 (zero uso) e deu lugar a Funis.
// O redirect segura link salvo e o CTA do playbook; sem ele, rota sem página
// vira 307 → /login, um soft-404 que parece sessão caída.
export default function Automacoes() {
  redirect("/painel/funis");
}
