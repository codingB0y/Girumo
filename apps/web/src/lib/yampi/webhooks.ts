import "server-only";

import { z } from "zod";

import { getAppUrl } from "@/lib/environment";
import { chaveDeIntegracoes, selar } from "@/lib/security/secret-box";
import { salvarAvisoYampi } from "@/lib/stores/yampi-conexoes";

import { yampiApagar, yampiGet, yampiPost, YampiErro } from "./api";
import { contextoDoSegredo } from "./credenciais";
import { EVENTOS_YAMPI, type ConexaoYampi } from "./tipos";

/**
 * O aviso (webhook) da loja na Yampi. Religar é apagar e criar: o `secret_key` só vem na criação, e a Yampi não
 * desativa por API (Fase 0, Y20). O `active` da resposta do POST não vale, só o da listagem (Y8).
 */

export const NOME_DO_AVISO = "Girumo";
const ROTA_DO_AVISO = "/api/integracoes/yampi/webhook";

export function urlDoAviso(conexaoId: string): string {
  return `${getAppUrl()}${ROTA_DO_AVISO}?c=${conexaoId}`;
}

export type AvisoNaYampi = { id: string; url: string; ativo: boolean };

const avisoDaLista = z.object({
  id: z.union([z.string(), z.number()]),
  url: z.string(),
  active: z.boolean().nullish(),
  disabled_at: z.unknown().optional(),
});

export async function listarAvisosDaYampi(c: ConexaoYampi): Promise<AvisoNaYampi[]> {
  const resposta = await yampiGet<{ data?: unknown }>(c, "/webhooks", { limit: 100 });
  const lista = Array.isArray(resposta?.data) ? resposta.data : [];
  return lista.flatMap((item) => {
    const lido = avisoDaLista.safeParse(item);
    if (!lido.success) return [];
    const { id, url, active, disabled_at } = lido.data;
    return [{ id: String(id), url, ativo: active !== false && !disabled_at }];
  });
}

export type EstadoDoAviso = "ativo" | "desativado" | "ausente";

/** Pelo id guardado: só conta o aviso cujo segredo temos. */
export function estadoDoAviso(lista: readonly AvisoNaYampi[], c: Pick<ConexaoYampi, "webhookId">): EstadoDoAviso {
  if (!c.webhookId) return "ausente";
  const aviso = lista.find((a) => a.id === c.webhookId);
  if (!aviso) return "ausente";
  return aviso.ativo ? "ativo" : "desativado";
}

/** Nosso = a rota do aviso com o `c` desta conexão; o host não conta (sobrevive à troca de domínio). */
function ehNosso(url: string, conexaoId: string): boolean {
  try {
    const lida = new URL(url);
    return lida.pathname === ROTA_DO_AVISO && lida.searchParams.get("c") === conexaoId;
  } catch {
    return false;
  }
}

async function apagarSeExistir(c: ConexaoYampi, id: string): Promise<void> {
  try {
    await yampiApagar(c, `/webhooks/${encodeURIComponent(id)}`);
  } catch (e) {
    if (!(e instanceof YampiErro && e.status === 404)) throw e;
  }
}

export async function apagarAvisosDaNossaUrl(c: ConexaoYampi): Promise<void> {
  for (const aviso of await listarAvisosDaYampi(c)) {
    if (ehNosso(aviso.url, c.id)) await apagarSeExistir(c, aviso.id);
  }
}

const avisoCriado = z.object({
  data: z.object({ id: z.union([z.string(), z.number()]).optional(), secret_key: z.string().min(16).optional() }),
});

/** Apaga os nossos, cria um com os cinco eventos e grava id + segredo selado (status `ativa`). Lança se falhar. */
export async function recriarAviso(c: ConexaoYampi): Promise<void> {
  const chave = chaveDeIntegracoes();
  if (!chave) throw new Error("Yampi indisponível: INTEGRATIONS_ENCRYPTION_KEY ausente");
  await apagarAvisosDaNossaUrl(c);
  const resposta = await yampiPost<unknown>(c, "/webhooks", { name: NOME_DO_AVISO, url: urlDoAviso(c.id), events: [...EVENTOS_YAMPI] });
  const lido = avisoCriado.safeParse(resposta);
  const id = lido.success && lido.data.data.id !== undefined ? String(lido.data.data.id) : null;
  const segredo = lido.success ? lido.data.data.secret_key : undefined;
  if (!id || !segredo) {
    if (id) await apagarSeExistir(c, id).catch(() => undefined);
    throw new Error("Yampi: o aviso criado não trouxe segredo");
  }
  try {
    await salvarAvisoYampi(c.tenantId, { webhookId: id, webhookSecretSelado: selar(segredo, contextoDoSegredo(c.tenantId, "webhook_secret"), chave) });
  } catch (e) {
    // Sem o segredo gravado o aviso só daria 401: melhor não deixar nenhum.
    await apagarSeExistir(c, id).catch(() => undefined);
    throw e;
  }
}
