import { PostGallery } from "@/components/posts/post-gallery";

export const metadata = {
  title: "HubFlow — Gerador de Posts",
};

const TEMPLATES = [
  { id: "1.1-capa", label: "1.1 Capa — Dor", category: "Dor / Problema" },
  { id: "1.1-problema", label: "1.1 Slide Problema", category: "Dor / Problema" },
  { id: "1.1-solucao", label: "1.1 Slide Solução", category: "Dor / Problema" },
  { id: "1.1-cta", label: "1.1 Slide CTA", category: "Dor / Problema" },
  { id: "1.2-confessa", label: "1.2 Confessa", category: "Dor / Problema" },
  { id: "2.2-sabia", label: "2.2 Sabia que...", category: "Solução / Recurso" },
  { id: "2.3-capa", label: "2.3 Capa — 5 coisas", category: "Solução / Recurso" },
  { id: "2.3-01", label: "2.3 Slide 01", category: "Solução / Recurso" },
  { id: "2.3-02", label: "2.3 Slide 02", category: "Solução / Recurso" },
  { id: "2.3-03", label: "2.3 Slide 03", category: "Solução / Recurso" },
  { id: "2.3-04", label: "2.3 Slide 04", category: "Solução / Recurso" },
  { id: "2.3-05", label: "2.3 Slide 05", category: "Solução / Recurso" },
  { id: "2.3-cta", label: "2.3 Slide CTA", category: "Solução / Recurso" },
  { id: "3.1-numero", label: "3.1 Número destaque", category: "Prova Social" },
  { id: "4.1-semdesculpa", label: "4.1 Sem desculpa", category: "Urgência / CTA" },
  { id: "4.2-quanto", label: "4.2 Quanto você perde", category: "Urgência / CTA" },
  { id: "5.2-dado", label: "5.2 Dado do dia", category: "Educativo" },
];

export default function PostsPage() {
  return <PostGallery templates={TEMPLATES} />;
}
