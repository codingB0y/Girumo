import { redirect } from "next/navigation";

/* A landing premium virou a home (/). Mantemos /lp3 como redirect
   permanente pra não quebrar links antigos e evitar conteúdo duplicado. */
export default function Lp3Redirect() {
  redirect("/");
}
