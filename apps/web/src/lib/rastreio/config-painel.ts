/** Regras do `PATCH /api/rastreio/config` e o formato da resposta. Puro: o painel valida no navegador com o mesmo schema. */
import { z } from "zod";

import { SLUG_BIO, slugReservado } from "@/lib/bio/documento";
import { normalizeWhatsappBR } from "@/lib/pages/phone";
import { ETAPAS_COM_AVISO, type Canal, type EtapaComAviso, type MatrizAvisos, type RastreioConfig } from "@/lib/rastreio/tipos";
import type { ConexaoYampi } from "@/lib/yampi/tipos";

const MSG_SLUG_FORMATO = "Use de 3 a 40 letras minúsculas, números e hífen, sem espaço nem acento.";
const MSG_SLUG_RESERVADO = "Esse endereço é reservado. Escolha outro.";
const MSG_MATRIZ = "Escolha os avisos de todas as etapas.";
export const MSG_LINK_VIP = "Esse link não é da sua loja.";
const MSG_NUMERO = "Informe um WhatsApp com DDD, ex.: (11) 91234-5678.";
const MSG_CORPO = "Corpo inválido.";

/** Texto próprio do Rastreio: o `NUMERO_CONECTADO` do bio fala em "número de atendimento", que aqui seria o chip. */
export const NUMERO_DA_LOJA_CONECTADO =
  "Esse número está conectado na Girumo (grupos ou avisos). Informe o WhatsApp onde você atende as clientes.";

const UUID_MINUSCULO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** As 5 etapas, cada uma com os dois canais booleanos, e nada mais. */
function ehMatriz(v: unknown): v is MatrizAvisos {
  if (!ehObjeto(v)) return false;
  const chaves = Object.keys(v);
  if (chaves.length !== ETAPAS_COM_AVISO.length) return false;
  return ETAPAS_COM_AVISO.every((etapa) => {
    const canais = v[etapa];
    return (
      ehObjeto(canais) &&
      Object.keys(canais).length === 2 &&
      typeof canais.whatsapp === "boolean" &&
      typeof canais.email === "boolean"
    );
  });
}

export const corpoDoPatchDaConfig = z
  .strictObject({
    publicSlug: z.string().superRefine((s, ctx) => {
      if (!SLUG_BIO.test(s)) ctx.addIssue({ code: "custom", message: MSG_SLUG_FORMATO });
      else if (slugReservado(s)) ctx.addIssue({ code: "custom", message: MSG_SLUG_RESERVADO });
    }),
    matrix: z.custom<MatrizAvisos>(ehMatriz, { message: MSG_MATRIZ }),
    notifyStoreOnProblem: z.boolean(),
    vipLinkId: z.string().regex(UUID_MINUSCULO, MSG_LINK_VIP).nullable(),
    storeWhatsapp: z
      .string()
      .max(40, MSG_NUMERO)
      .nullable()
      .transform((bruto, ctx) => {
        if (bruto === null || bruto.trim() === "") return null;
        const e164 = normalizeWhatsappBR(bruto);
        if (!e164) {
          ctx.addIssue({ code: "custom", message: MSG_NUMERO });
          return z.NEVER;
        }
        return e164.slice(1); // 55 + DDD + número, o formato dos avisos
      }),
  })
  .partial()
  .refine((c) => Object.keys(c).length > 0, { message: MSG_CORPO });

export type CorpoDoPatchDaConfig = z.infer<typeof corpoDoPatchDaConfig>;

/** O primeiro problema, com o campo (primeira chave do caminho); chave desconhecida ou corpo inteiro → `corpo`. */
export function erroDoPatchDaConfig(e: z.ZodError): { error: string; campo: string } {
  const issue = e.issues[0];
  const campo = typeof issue?.path[0] === "string" ? issue.path[0] : "corpo";
  return { error: campo === "corpo" ? MSG_CORPO : (issue?.message ?? MSG_CORPO), campo };
}

export function alternarCanal(m: MatrizAvisos, etapa: EtapaComAviso, canal: Canal): MatrizAvisos {
  return { ...m, [etapa]: { ...m[etapa], [canal]: !m[etapa][canal] } };
}

/** `GET` e `PATCH` respondem o mesmo. O contrato do PR 1 traz `{ config, linkDaBusca }`; o resto é acréscimo. */
export type RespostaDaConfig = {
  config: Omit<RastreioConfig, "tenantId" | "sweepCursor">;
  linkDaBusca: string | null;
  loja: string | null;
  yampi: ConexaoYampi["status"] | null;
  linksDeConvite: { id: string; slug: string }[];
};
