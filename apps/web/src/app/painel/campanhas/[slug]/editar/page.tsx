"use client";

import { useParams } from "next/navigation";
import { CampaignConfig } from "@/components/painel/campaign-config";

export default function EditarCampanha() {
  const params = useParams<{ slug: string }>();
  return <CampaignConfig mode="edit" slug={params?.slug ?? ""} />;
}
