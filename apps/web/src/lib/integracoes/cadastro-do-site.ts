// apps/web/src/lib/integracoes/cadastro-do-site.ts
import { z } from "zod";

import { normalizeWhatsappBR } from "@/lib/pages/phone";

/**
 * Corpo de POST /api/integracoes/cadastro (spec 2026-10-10-funil-anuncios §3).
 *
 * `.strictObject`: campo desconhecido é erro, não ignorado — um site que manda
 * `link` acha que escolhe o destino, e quem escolhe é a integração.
 * Os UTMs vêm da page_url, lidos aqui: o site não precisa saber quais são.
 */

const MAX_PARAMETRO = 200;
const COOKIE_DO_META = /^fb\.\d\.\d+\.[A-Za-z0-9_.-]{1,200}$/;

const corpoSchema = z.strictObject({
  whatsapp: z.string().max(40),
  page_url: z.string().max(2048),
  event_id: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/),
  fbc: z.string().regex(COOKIE_DO_META).optional(),
  fbp: z.string().regex(COOKIE_DO_META).optional(),
});

export type Utms = {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
};

export type CadastroDoSite = {
  whatsapp: string;
  eventId: string;
  pageUrl: string;
  utm: Utms;
  fbclid: string | null;
  fbc: string | null;
  fbp: string | null;
};

export type LeituraDoCadastro = { ok: true; cadastro: CadastroDoSite } | { ok: false; erro: "corpo" | "numero" };

function parametro(url: URL, nome: string): string | null {
  const valor = url.searchParams.get(nome)?.trim() ?? "";
  return valor ? valor.slice(0, MAX_PARAMETRO) : null;
}

function urlDaPagina(texto: string): URL | null {
  try {
    const url = new URL(texto);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

export function lerCadastro(bruto: unknown): LeituraDoCadastro {
  const lido = corpoSchema.safeParse(bruto);
  if (!lido.success) return { ok: false, erro: "corpo" };
  const url = urlDaPagina(lido.data.page_url);
  if (!url) return { ok: false, erro: "corpo" };
  const whatsapp = normalizeWhatsappBR(lido.data.whatsapp);
  if (!whatsapp) return { ok: false, erro: "numero" };
  return {
    ok: true,
    cadastro: {
      whatsapp,
      eventId: lido.data.event_id,
      pageUrl: url.toString(),
      utm: {
        source: parametro(url, "utm_source"),
        medium: parametro(url, "utm_medium"),
        campaign: parametro(url, "utm_campaign"),
        content: parametro(url, "utm_content"),
        term: parametro(url, "utm_term"),
      },
      fbclid: parametro(url, "fbclid"),
      fbc: lido.data.fbc ?? null,
      fbp: lido.data.fbp ?? null,
    },
  };
}
