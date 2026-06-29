import { CampaignConfig } from "@/components/painel/campaign-config";

export const metadata = { title: "Nova campanha — HubFlow" };

export default function NovaCampanha() {
  return <CampaignConfig mode="create" />;
}
