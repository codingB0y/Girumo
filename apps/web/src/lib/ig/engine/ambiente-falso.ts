import { RECIPES } from "@/lib/ig/flow/recipes";
import { createFakeTransport } from "@/lib/ig/transport/fake";
import type { EventoZernio } from "@/lib/ig/webhook/events";
import type { RunRow } from "@/lib/stores/ig-runs";
import { criarConversasFalsas } from "./conversas-falsas";
import { criarContatosFalsos } from "./ficha-falsa";
import type { Ambiente } from "./handle-event";

/** Ambiente em memória dos testes do tratamento de eventos (compartilhado entre os arquivos de teste). */
export const T0 = new Date("2026-10-06T12:00:00Z");
export const comentario: Extract<EventoZernio, { event: "comment.received" }> = { id: "e1", event: "comment.received", comment: { id: "c-1", platformPostId: "post-1", platform: "instagram", text: "quero", author: { id: "u1", username: "igortoled0", isOwnAccount: false }, createdAt: "2026-10-06T11:59:58Z", isReply: false }, account: { accountId: "z1" }, timestamp: "2026-10-06T11:59:59Z" };
export const direct: Extract<EventoZernio, { event: "message.received" }> = { id: "e2", event: "message.received", message: { platformMessageId: "m-1", platform: "instagram", direction: "incoming", text: "quero", sender: { id: "u1", username: "igortoled0" }, sentAt: "2026-10-06T11:59:58Z" }, conversation: { id: "conv-1", participantId: "u1" }, account: { accountId: "z1" }, timestamp: "2026-10-06T11:59:59Z" };

export function ambiente(opts: { falhar?: NonNullable<Parameters<typeof createFakeTransport>[0]>["falhar"]; conta?: Partial<{ status: string; tenant_id: string }> | null; liberada?: boolean; fluxos?: Ambiente["fluxosNoAr"]; recente?: boolean; iniciados?: number; existente?: RunRow | null; esperando?: RunRow | null; reivindicado?: boolean; retomado?: RunRow | null; parado?: boolean; passos?: Array<{ node_id: string; out: string }>; contatos?: Parameters<typeof criarContatosFalsos>[0]; conversas?: Parameters<typeof criarConversasFalsas>[0] } = {}) {
  const { transport, chamadas } = createFakeTransport({ falhar: opts.falhar });
  const criados: unknown[] = [];
  const patches: Array<[string, unknown]> = [];
  const buscas: Array<[string, string | null, string]> = [];
  const reivindicacoes: string[] = [];
  const estados: Array<[string, string, string | null]> = [];
  let proximoId = 1;
  const def = { ...RECIPES.comment_invite.build() };
  const live = { ...def, nodes: def.nodes.map((n) => (n.type === "invite" ? { ...n, campaignSlug: "vip" } : n)) };
  const dmDef = RECIPES.dm_invite.build();
  const dmLive = { ...dmDef, nodes: dmDef.nodes.map((n) => (n.type === "invite" ? { ...n, campaignSlug: "vip" } : n)) };
  const fichas = criarContatosFalsos(opts.contatos);
  const indice = criarConversasFalsas(opts.conversas);
  const seguras: Promise<unknown>[] = [];
  const amb: Ambiente = {
    transport,
    contatos: fichas.contatos,
    conversas: indice.conversas,
    atualizarConversa: indice.atualizar,
    segurarAteTerminar: (tarefa) => { seguras.push(tarefa); },
    now: () => T0,
    novoRef: () => "ref-fixo-12345",
    contaPorIdDaZernio: async (id) => (opts.conta === null || id !== "z1" ? null : { id: "a1", tenant_id: "loja-a", username: "vireimoda", status: "active", provider: "zernio", provider_account_id: "z1", provider_profile_id: "p1", connected_at: "t", ...opts.conta } as never),
    mudarEstadoDaConta: async (t, s, e) => { estados.push([t, s, e]); },
    lojaLiberada: async () => opts.liberada ?? true,
    fluxosNoAr: opts.fluxos ?? (async () => [{ id: "f-c", version: 3, published: live }, { id: "f-d", version: 1, published: dmLive }]),
    runs: {
      criar: async (tenantId, novo) => {
        criados.push({ tenantId, ...novo });
        if (opts.existente !== undefined) return null;
        return { id: `run-${proximoId++}`, tenant_id: tenantId, ig_account_id: novo.igAccountId, flow_id: novo.flowId, flow_version: novo.flowVersion, source_kind: novo.sourceKind, source_id: novo.sourceId, ig_user_id: novo.igUserId, username: novo.username, matched_keyword: novo.matchedKeyword, ref: novo.ref, status: "queued", node_id: null, waiting: null, wake_at: null, window_expires_at: novo.windowExpiresAt, clicked_at: null, error_code: null, error_message: null, started_at: T0.toISOString(), updated_at: T0.toISOString(), finished_at: null };
      },
      porOrigem: async () => opts.existente ?? null,
      atualizar: async (_t, id, patch) => { patches.push([id, patch]); },
      passo: async () => {},
      iniciadosDesde: async () => opts.iniciados ?? 0,
      entradaRecente: async () => opts.recente ?? false,
      esperando: async (_t, _conta, igUserId, username, agoraIso) => { buscas.push([igUserId, username, agoraIso]); return opts.esperando ?? null; },
      reivindicar: async (_t, _id, _no, messageId) => { reivindicacoes.push(messageId); return opts.reivindicado ?? true; },
      retomadoPor: async () => opts.retomado ?? null,
      passos: async () => opts.passos ?? [],
      retomarParado: async () => opts.parado ?? true,
    },
    link: async (_t, slug, ref) => `https://app/r/${slug}?ig=${ref}`,
  };
  return { amb, chamadas, criados, patches, estados, buscas, reivindicacoes, fichas, indice, seguras };
}
