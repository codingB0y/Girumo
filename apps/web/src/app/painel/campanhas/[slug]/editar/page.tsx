"use client";

import { useParams } from "next/navigation";
import { CampaignConfig, type CampaignConfigInitial } from "@/components/painel/campaign-config";

const DATA: Record<string, CampaignConfigInitial> = {
  "manychat-captacao": { titulo: "ManyChat · Captação Grupos", code: "28966" },
  "captacao-apenas-grupos": { titulo: "Captação apenas Grupos", code: "28087" },
  "saldao-mega-stock": { titulo: "Saldão Mega Stock Atacado", code: "24227" },
  "grupos-gerais-atual": { titulo: "Grupos Gerais · Atual", code: "9059" },
};

export default function EditarCampanha() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const initial = DATA[slug] ?? { titulo: slug.replace(/-/g, " "), code: "0000" };
  return <CampaignConfig mode="edit" slug={slug} initial={initial} />;
}
