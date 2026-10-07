import "server-only";

import { randomBytes } from "node:crypto";
import { campaignLinkPath } from "@/lib/custom-domains/host";
import { getAppUrl } from "@/lib/environment";
import { getCustomDomain } from "@/lib/stores/custom-domains";

/** Aleatório, sem dado pessoal; casa com `^[A-Za-z0-9_-]{10,24}$` (spec §8.5). */
export function novoRef(): string {
  return randomBytes(12).toString("base64url");
}

/** `<origem>/r/<slug>?ig=<ref>`; no domínio próprio ativo, `<origem>/<slug>?ig=<ref>`. */
export function montarLink(origem: string, slug: string, ref: string): string {
  return `${origem}${campaignLinkPath(origem, slug)}?ig=${encodeURIComponent(ref)}`;
}

export async function linkDoConvite(tenantId: string, slug: string, ref: string): Promise<string> {
  const dominio = await getCustomDomain(tenantId);
  const origem = dominio?.status === "active" ? `https://${dominio.hostname}` : getAppUrl();
  return montarLink(origem, slug, ref);
}
