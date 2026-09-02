/**
 * As duas decisões do /r/ que valem um teste próprio. Ficam fora do `route.ts`
 * porque o route handler importa store, Supabase e `next/server` — testá-las lá
 * exigiria subir meio app para conferir dois `if`.
 */
import type { Integracoes } from "@/lib/campaigns/settings";

/**
 * O pixel da CAMPANHA ganha do pixel do link: quem configurou a campanha
 * escolheu depois, e um link antigo com pixel velho não pode sequestrar a
 * medição da campanha nova.
 */
export function pixelDaTela(integracoes: Integracoes, pixelDoLink: string | undefined): string | undefined {
  return integracoes.meta.pixel_id || pixelDoLink;
}

/** CAPI exige pixel + token, e só para gente de verdade (bot não vira Lead). */
export function capiEnvio(integracoes: Integracoes, human: boolean): boolean {
  return Boolean(human && integracoes.meta.pixel_id && integracoes.meta.capi_token);
}
