import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Supabase e Zernio de mentira para as rotas das Conversas (molde: api/ig/contacts/route.test.ts). O Supabase é
 * um servidor HTTP local com fixtures mutáveis; a Zernio entra por um `fetch` global que desvia só `zernio.com`.
 */

export const CONV_ID = "11111111-1111-4111-8111-111111111111";
export const LOJA = "loja-b";
export const AGORA_MS = Date.now();
export const horasAtras = (n: number) => new Date(AGORA_MS - n * 3600_000).toISOString();

export type Chamada = { metodo: string; url: URL; corpo: unknown };
export type PedidoZernio = { metodo: string; url: URL; headers: Record<string, string>; corpo: unknown };
export type RespostaZernio = { status: number; body: unknown; headers?: Record<string, string> };

type Linha = Record<string, unknown>;

export function criarAmbiente() {
  const chamadas: Chamada[] = [];
  const pedidosZernio: PedidoZernio[] = [];
  const e = {
    papel: "owner",
    ligado: true,
    donoDaConversa: LOJA,
    conversa: {} as Linha,
    conta: null as Linha | null,
    ficha: null as Linha | null,
    eventos: [] as Linha[],
    existentesNoIndice: new Set<string>(),
    tombstones: new Set<string>(),
    aguardando: 3,
    tagIds: [] as string[],
    canned: [] as Linha[],
    cannedCheio: false,
    cannedExiste: true,
    eventoFalha: false,
    runsFalha: false,
    indiceApagado: [{ zernio_conversation_id: "z-1", ig_account_id: "conta-1" }] as Linha[],
    zernio: ((): RespostaZernio => ({ status: 200, body: {} })) as (p: PedidoZernio) => RespostaZernio,
  };

  function zerar() {
    chamadas.length = 0;
    pedidosZernio.length = 0;
    e.papel = "owner";
    e.ligado = true;
    e.donoDaConversa = LOJA;
    e.conversa = { id: CONV_ID, tenant_id: LOJA, ig_account_id: "conta-1", zernio_conversation_id: "z-1", ig_user_id: "u1", username: "ana", display_name: "Ana", status: "waiting", folder: "inbox", unread_count: 2, last_message_at: horasAtras(1), last_direction: "in", last_preview: "oi", bot_paused_until: null, updated_at: horasAtras(1) };
    e.conta = { id: "conta-1", username: "loja", status: "active", provider: "zernio", provider_account_id: "acc-z", provider_profile_id: "perfil", connected_at: horasAtras(100) };
    e.ficha = { id: "ficha-1", tenant_id: LOJA, ig_user_id: "u1", username: "ana", fields: {}, tags: [], first_seen_at: horasAtras(50), last_seen_at: horasAtras(1), last_dm_at: horasAtras(2), source_flow_id: null, updated_at: horasAtras(1) };
    e.eventos = [];
    e.existentesNoIndice = new Set();
    e.tombstones = new Set();
    e.aguardando = 3;
    e.tagIds = [];
    e.canned = [{ id: "p1", tenant_id: LOJA, title: "Prazo", text: "Enviamos em 2 dias.", created_at: horasAtras(5) }];
    e.cannedCheio = false;
    e.cannedExiste = true;
    e.eventoFalha = false;
    e.runsFalha = false;
    e.indiceApagado = [{ zernio_conversation_id: "z-1", ig_account_id: "conta-1" }];
    e.zernio = () => ({ status: 200, body: {} });
  }
  zerar();

  const supabase = createServer((req, res) => {
    let bruto = "";
    req.on("data", (parte: Buffer) => (bruto += parte));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://supabase.falso");
      const corpo: unknown = bruto ? JSON.parse(bruto) : undefined;
      chamadas.push({ metodo: req.method ?? "", url, corpo });
      const objeto = String(req.headers.accept ?? "").includes("pgrst.object");
      const dela = url.searchParams.get("tenant_id") === `eq.${e.donoDaConversa}`;
      const valor = (k: string) => url.searchParams.get(k)?.replace(/^eq\./, "");
      let status = 200;
      let saida: unknown = [];
      const lista = (l: unknown[]) => (saida = objeto ? (l[0] ?? null) : l);
      const p = url.pathname;
      const m = req.method;
      if (p === "/auth/v1/user") saida = { id: "usuario-1", email: "dono@loja.test" };
      else if (p === "/rest/v1/memberships") saida = [{ tenant_id: valor("tenant_id") ?? LOJA, role: e.papel, modules: [] }];
      else if (p === "/rest/v1/tenant_settings") saida = url.searchParams.get("select") === "instagram_disabled_at" ? { instagram_disabled_at: null } : { tenant_id: LOJA, instagram_enabled: e.ligado };
      else if (p === "/rest/v1/ig_accounts") lista(e.conta && dela ? [e.conta] : []);
      else if (p === "/rest/v1/ig_conversations" && m === "HEAD") saida = undefined;
      else if (p === "/rest/v1/ig_conversations" && m === "GET") {
        if (url.searchParams.get("ig_user_id")?.startsWith("eq.")) saida = dela ? e.indiceApagado : [];
        else if (url.searchParams.has("id")) lista(dela && valor("id") === CONV_ID ? [e.conversa] : []);
        else if (url.searchParams.has("zernio_conversation_id")) lista(dela && e.existentesNoIndice.has(valor("zernio_conversation_id") ?? "") ? [e.conversa] : []);
        else lista(dela ? [e.conversa] : []);
      } else if (p === "/rest/v1/ig_conversations" && m === "PATCH") {
        const ok = dela && valor("id") === CONV_ID;
        if (ok) Object.assign(e.conversa, corpo);
        saida = ok ? [e.conversa] : [];
      } else if (p === "/rest/v1/ig_conversations" && m === "DELETE") saida = dela ? e.indiceApagado : [];
      else if (p === "/rest/v1/rpc/ig_conversation_touch") {
        const b = corpo as Linha;
        saida = { ...e.conversa, status: b.p_status ?? e.conversa.status, unread_count: b.p_direction === "in" ? 1 : 0 };
      } else if (p === "/rest/v1/ig_conversation_events") {
        saida = m === "GET" ? e.eventos : [];
        if (m === "POST" && e.eventoFalha) status = 500;
      } else if (p === "/rest/v1/ig_runs" && m === "PATCH" && e.runsFalha) {
        status = 500;
        saida = { code: "XX000", message: "falhou", details: null, hint: null };
      }
      else if (p === "/rest/v1/ig_contacts" && m === "GET") {
        if (url.searchParams.has("tags")) saida = e.tagIds.map((id) => ({ ig_user_id: id }));
        else lista(dela && e.ficha ? [e.ficha] : []);
      } else if (p === "/rest/v1/rpc/ig_contact_apply") {
        const b = corpo as Linha;
        saida = { ...e.ficha, last_dm_at: b.p_dm ? b.p_seen_at : (e.ficha?.last_dm_at ?? null) };
      } else if (p === "/rest/v1/ig_contact_tombstones" && m === "GET") lista(e.tombstones.has((valor("ig_user_hash") ?? "")) ? [{ ig_user_hash: valor("ig_user_hash") }] : []);
      else if (p === "/rest/v1/ig_canned_replies") {
        if (m === "GET") saida = dela ? e.canned : [];
        else if (m === "POST") {
          if (e.cannedCheio) {
            status = 400;
            saida = { code: "P0001", message: "ig_canned_replies_limit", details: null, hint: null };
          } else saida = objeto ? { ...(corpo as Linha), id: "novo", created_at: horasAtras(0) } : [{ ...(corpo as Linha), id: "novo", created_at: horasAtras(0) }];
        } else if (m === "DELETE") saida = dela && e.cannedExiste ? [{ id: valor("id") }] : [];
      }
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      if (m === "HEAD") res.setHeader("Content-Range", `*/${e.aguardando}`);
      res.end(m === "HEAD" ? undefined : JSON.stringify(saida));
    });
  });

  const fetchOriginal = globalThis.fetch;
  const fetchDesviado = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = new URL(entrada instanceof Request ? entrada.url : String(entrada));
    if (url.hostname !== "zernio.com") return fetchOriginal(entrada, init);
    const pedido: PedidoZernio = { metodo: init?.method ?? "GET", url, headers: Object.fromEntries(new Headers(init?.headers).entries()), corpo: init?.body ? JSON.parse(String(init.body)) : null };
    pedidosZernio.push(pedido);
    const r = e.zernio(pedido);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json", ...r.headers } });
  }) as typeof fetch;

  return {
    e,
    chamadas,
    pedidosZernio,
    zerar,
    async iniciar() {
      await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
      const { port } = supabase.address() as AddressInfo;
      process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
      process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
      process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";
      process.env.HUBFLOW_USE_SUPABASE = "1";
      process.env.ZERNIO_API_KEY = "chave-zernio-falsa";
      globalThis.fetch = fetchDesviado;
    },
    parar() {
      globalThis.fetch = fetchOriginal;
      supabase.close();
    },
    /** Escritas nas tabelas do Instagram (não conta leitura nem HEAD). */
    escritas: () => chamadas.filter((c) => c.metodo !== "GET" && c.metodo !== "HEAD" && (c.url.pathname.startsWith("/rest/v1/ig_") || c.url.pathname.startsWith("/rest/v1/rpc/ig_"))),
    pedir(metodo: string, caminho: string, corpo?: unknown, loja: string = LOJA): Request {
      return new Request(`http://girumo.test${caminho}`, {
        method: metodo,
        headers: { authorization: "Bearer token-falso", "x-tenant-id": loja, "content-type": "application/json" },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      });
    },
  };
}

export const comId = (id: string) => ({ params: Promise.resolve({ id }) });
