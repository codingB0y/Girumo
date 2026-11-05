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

/** O domínio próprio ativo da loja, senão o do app. */
async function origemDaLoja(tenantId: string): Promise<string> {
  const dominio = await getCustomDomain(tenantId);
  return dominio?.status === "active" ? `https://${dominio.hostname}` : getAppUrl();
}

export async function linkDoConvite(tenantId: string, slug: string, ref: string): Promise<string> {
  return montarLink(await origemDaLoja(tenantId), slug, ref);
}

/** O link da campanha puro, SEM `?ig=`: o convite mandado pelo chat não conta clique atribuído (isso é da fase 3). */
export async function linkDaCampanha(tenantId: string, slug: string): Promise<string> {
  const origem = await origemDaLoja(tenantId);
  return `${origem}${campaignLinkPath(origem, slug)}`;
}
