import { redirect } from "next/navigation";

// Disparos agora vivem dentro de Campanhas.
// Redirect permanente para não quebrar bookmarks.
export default function PainelDisparos() {
  redirect("/painel/campanhas");
}
