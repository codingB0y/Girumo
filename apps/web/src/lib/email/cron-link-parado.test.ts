import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import type { EstadoRow } from "@/lib/groups/estado";
import { podeEnviar } from "./cron-recipients";
import type { avisarLinksParados as Job } from "./cron-link-parado";

/**
 * Job 8 do cron contra um servidor falso que faz papel do PostgREST E do Resend
 * (`RESEND_BASE_URL`): nada sai daqui, e o e-mail montado chega inteiro no corpo
 * do `POST /emails` — é a prova do que o lojista receberia.
 */

/** Corte do "1 por dia" que o job recebe. */
const HOJE = "2026-11-10T00:00:00.000Z";
/** `auth.admin.getUserById` recusa id que não seja UUID. */
const DONO = "00000000-0000-4000-8000-000000000001";

type Chamada = { metodo: string; url: URL; corpo: unknown; cabecalhos: Record<string, string | string[] | undefined> };
const chamadas: Chamada[] = [];

type Campanha = { id: string; name: string; slug: string; group_ids: string[]; metadata: Record<string, unknown> };
type Mundo = {
  lojas: string[];
  campanhas: Record<string, Campanha[]>;
  /** Campanhas com clique que passou nos últimos 3 dias. */
  comClique: string[];
  /** Estados por campanha, como a RPC devolve. */
  estados: Record<string, EstadoRow[]>;
  /** `href` que já têm aviso hoje. */
  avisados?: string[];
  erroNosCliques?: boolean;
  /** O insert do dedupe falha depois do e-mail sair. */
  insertFalha?: boolean;
  resendFora?: boolean;
};
let m: Mundo = { lojas: [], campanhas: {}, comClique: [], estados: {} };

function filtro(url: URL, coluna: string): string | null {
  return url.searchParams.get(coluna)?.replace(/^eq\./, "") ?? null;
}

function responder({ metodo, url, corpo }: Chamada): { status: number; corpo?: unknown } {
  const rota = `${metodo} ${url.pathname}`;
  if (rota === "GET /rest/v1/organizations") return { status: 200, corpo: m.lojas.map((id) => ({ id, name: id })) };
  if (rota === "GET /rest/v1/campaign_groups") return { status: 200, corpo: m.campanhas[filtro(url, "tenant_id") ?? ""] ?? [] };
  if (rota === "GET /rest/v1/link_click_events") {
    if (m.erroNosCliques) return { status: 500, corpo: { message: "timeout" } };
    return { status: 200, corpo: m.comClique.includes(filtro(url, "campaign_group_id") ?? "") ? [{ id: "c1" }] : [] };
  }
  if (rota === "POST /rest/v1/rpc/campaign_group_states") {
    return { status: 200, corpo: m.estados[(corpo as { p_campaign: string }).p_campaign] ?? [] };
  }
  if (rota === "GET /rest/v1/notifications") {
    // Só conta como avisado com o tipo E o corte do dia certos: tirar um dos dois filtros derruba o dedupe.
    const avisado =
      (m.avisados ?? []).includes(filtro(url, "href") ?? "") &&
      filtro(url, "type") === "link_parado" &&
      url.searchParams.get("created_at") === `gte.${HOJE}`;
    return { status: 200, corpo: avisado ? [{ id: "n1" }] : [] };
  }
  if (rota === "GET /rest/v1/memberships") return { status: 200, corpo: [{ user_id: DONO }] };
  if (metodo === "GET" && url.pathname.startsWith("/auth/v1/admin/users/")) {
    return { status: 200, corpo: { id: DONO, email: "dono@loja.test", user_metadata: { name: "Ana Souza" } } };
  }
  if (rota === "POST /emails") return m.resendFora ? { status: 500, corpo: { message: "fora" } } : { status: 200, corpo: { id: "e1" } };
  if (rota === "POST /rest/v1/notifications" && m.insertFalha) return { status: 500, corpo: { message: "timeout" } };
  if (rota === "POST /rest/v1/logs" || rota === "POST /rest/v1/notifications") return { status: 201 };
  return { status: 500, corpo: { message: `inesperado: ${rota}` } };
}

const servidor = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const chamada: Chamada = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://falso"),
      corpo: bruto ? JSON.parse(bruto) : undefined,
      cabecalhos: req.headers,
    };
    chamadas.push(chamada);
    const { status, corpo } = responder(chamada);
    if (corpo !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(corpo === undefined ? undefined : JSON.stringify(corpo));
  });
});

let avisarLinksParados: typeof Job;
let supabase: Parameters<typeof Job>[0]["supabase"];

before(async () => {
  await new Promise<void>((pronto) => servidor.listen(0, "127.0.0.1", pronto));
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  process.env.SUPABASE_URL = base;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  // O Resend lê a base ao carregar o módulo: env antes do import.
  process.env.RESEND_BASE_URL = base;
  process.env.RESEND_API_KEY = "re_falso";
  ({ avisarLinksParados } = await import("./cron-link-parado"));
  supabase = (await import("@/lib/supabase/server")).getSupabaseAdmin();
});

after(() => servidor.close());
beforeEach(() => {
  chamadas.length = 0;
});

function rodar(mundo: Mundo) {
  m = mundo;
  return avisarLinksParados({
    supabase,
    appUrl: "https://app.girumo.test",
    now: new Date(),
    todayStartISO: HOJE,
    temPlanoValendo: async (t) => t !== "ex-cliente",
    liberado: (_job, _t, leitura) => podeEnviar(leitura),
  });
}

function estado(posicao: number, e: Partial<EstadoRow> = {}): EstadoRow {
  return {
    posicao,
    group_id: `00000000-0000-4000-8000-${String(posicao).padStart(12, "0")}`,
    whatsapp_group_id: `g${posicao}@g.us`,
    name: `Moda Kids ${posicao}`,
    members: 100,
    capacity: 1024,
    is_admin: true,
    invite_url: `https://chat.whatsapp.com/C${posicao}`,
    lotado_em: null,
    lotado_por: null,
    reaberto_em: null,
    aviso_lotou_em: null,
    estado: "enchendo",
    pode_reabrir: false,
    na_regra_menos_enchendo: false,
    na_regra_lotados: false,
    na_regra_com_gente: false,
    ...e,
  };
}
const semAdmin = [estado(1, { is_admin: false, estado: "lotado" })];
function campanha(slug: string, metadata: Record<string, unknown> = {}): Campanha {
  return { id: `id-${slug}`, name: `Campanha ${slug}`, slug, group_ids: ["g1@g.us"], metadata };
}

const envios = () => chamadas.filter((c) => c.metodo === "POST" && c.url.pathname === "/emails");
const emails = () => envios().map((c) => c.corpo as { to: string; subject: string; html: string });
const avisosGravados = () =>
  chamadas
    .filter((c) => c.metodo === "POST" && c.url.pathname === "/rest/v1/notifications")
    .flatMap((c) => c.corpo as Array<{ tenant_id: string; type: string; href: string; body: string }>);

test("avisa só a campanha com clique recente e link parado; encerrada e funcionando ficam de fora", async () => {
  const r = await rodar({
    lojas: ["pagante"],
    campanhas: {
      pagante: [campanha("parada"), campanha("sem-clique"), campanha("funciona"), campanha("encerrada", { settings: { entrada: { encerra_em: "2020-01-01" } } })],
    },
    comClique: ["id-parada", "id-funciona", "id-encerrada"],
    estados: { "id-parada": semAdmin, "id-sem-clique": semAdmin, "id-funciona": [estado(1)], "id-encerrada": semAdmin },
  });

  assert.deepEqual(r, { enviados: 1, erros: 0 });
  const [email, ...resto] = emails();
  assert.equal(resto.length, 0);
  assert.equal(email.to, "dono@loja.test");
  assert.equal(email.subject, "O link da campanha Campanha parada parou de mandar gente para o grupo");
  assert.match(email.html, /Seu número não é admin de nenhum grupo da campanha: quem clicar agora não entra em grupo nenhum\./);
  assert.match(email.html, /href="https:\/\/app\.girumo\.test\/painel\/campanhas\/parada"[^>]*>Abrir a campanha/);
  assert.deepEqual(
    avisosGravados().map((a) => [a.tenant_id, a.type, a.href]),
    [["pagante", "link_parado", "/painel/campanhas/parada"]],
  );
  // Sem clique recente nem chega a ler o estado dos grupos.
  const estadosLidos = chamadas.filter((c) => c.url.pathname === "/rest/v1/rpc/campaign_group_states").map((c) => (c.corpo as { p_campaign: string }).p_campaign);
  assert.ok(!estadosLidos.includes("id-sem-clique"));
});

test("toda leitura da loja filtra por tenant_id (o service-role ignora o RLS)", async () => {
  await rodar({ lojas: ["pagante"], campanhas: { pagante: [campanha("parada")] }, comClique: ["id-parada"], estados: { "id-parada": semAdmin } });
  const daLoja = chamadas.filter((c) => /^\/rest\/v1\/(campaign_groups|link_click_events|notifications|memberships)$/.test(c.url.pathname) && c.metodo === "GET");
  assert.ok(daLoja.length >= 4);
  for (const c of daLoja) assert.equal(filtro(c.url, "tenant_id"), "pagante", c.url.pathname);
  for (const c of chamadas.filter((x) => x.url.pathname === "/rest/v1/rpc/campaign_group_states")) {
    assert.equal((c.corpo as { p_tenant: string }).p_tenant, "pagante");
  }
  // A janela de clique é de 3 dias, e o e-mail vai para o dono.
  const cliques = chamadas.find((c) => c.url.pathname === "/rest/v1/link_click_events");
  const desde = Date.parse(cliques?.url.searchParams.get("occurred_at")?.replace(/^gte\./, "") ?? "");
  assert.ok(Math.abs(Date.now() - 3 * 24 * 60 * 60 * 1000 - desde) < 60_000);
  assert.equal(filtro(chamadas.find((c) => c.url.pathname === "/rest/v1/memberships")!.url, "role"), "owner");
});

test("insert do dedupe falhando: o reenvio da rodada seguinte leva a mesma idempotencyKey", async () => {
  // Sem a notificação gravada, a próxima hora acha a campanha de novo; quem segura o
  // segundo e-mail é o Resend, pela chave.
  const mundo: Mundo = { lojas: ["pagante"], campanhas: { pagante: [campanha("a")] }, comClique: ["id-a"], estados: { "id-a": semAdmin }, insertFalha: true };
  assert.deepEqual(await rodar(mundo), { enviados: 1, erros: 1 });
  const primeira = envios()[0].cabecalhos["idempotency-key"];
  chamadas.length = 0;
  await rodar(mundo);
  const segunda = envios()[0].cabecalhos["idempotency-key"];
  assert.ok(typeof primeira === "string" && primeira.startsWith("link-parado/pagante/2026-11-10/"));
  assert.equal(segunda, primeira);
});

test("dedupe por campanha: a já avisada hoje sai do e-mail, a outra ainda vai", async () => {
  await rodar({
    lojas: ["pagante"],
    campanhas: { pagante: [campanha("a"), campanha("b")] },
    comClique: ["id-a", "id-b"],
    estados: { "id-a": semAdmin, "id-b": semAdmin },
    avisados: ["/painel/campanhas/a"],
  });
  assert.deepEqual(emails().map((e) => e.subject), ["O link da campanha Campanha b parou de mandar gente para o grupo"]);
  assert.deepEqual(avisosGravados().map((a) => a.href), ["/painel/campanhas/b"]);
});

test("duas campanhas paradas viram um e-mail só e um aviso para cada", async () => {
  await rodar({ lojas: ["pagante"], campanhas: { pagante: [campanha("a"), campanha("b")] }, comClique: ["id-a", "id-b"], estados: { "id-a": semAdmin, "id-b": semAdmin } });
  assert.deepEqual(emails().map((e) => e.subject), ["Os links de 2 campanhas pararam de mandar gente para o grupo"]);
  assert.deepEqual(avisosGravados().map((a) => a.href), ["/painel/campanhas/a", "/painel/campanhas/b"]);
});

test("tudo já avisado hoje não manda nada", async () => {
  const r = await rodar({ lojas: ["pagante"], campanhas: { pagante: [campanha("a")] }, comClique: ["id-a"], estados: { "id-a": semAdmin }, avisados: ["/painel/campanhas/a"] });
  assert.deepEqual(r, { enviados: 0, erros: 0 });
  assert.equal(emails().length, 0);
});

test("erro lendo os cliques não manda e conta erro", async () => {
  const r = await rodar({ lojas: ["pagante"], campanhas: { pagante: [campanha("a")] }, comClique: ["id-a"], estados: { "id-a": semAdmin }, erroNosCliques: true });
  assert.deepEqual(r, { enviados: 0, erros: 1 });
  assert.equal(emails().length, 0);
});

test("e-mail que não saiu não grava o aviso (a próxima rodada tenta de novo)", async () => {
  const r = await rodar({ lojas: ["pagante"], campanhas: { pagante: [campanha("a")] }, comClique: ["id-a"], estados: { "id-a": semAdmin }, resendFora: true });
  assert.deepEqual(r, { enviados: 0, erros: 1 });
  assert.deepEqual(avisosGravados(), []);
});

test("loja sem plano valendo nem tem as campanhas lidas", async () => {
  await rodar({ lojas: ["ex-cliente"], campanhas: { "ex-cliente": [campanha("a")] }, comClique: ["id-a"], estados: { "id-a": semAdmin } });
  assert.equal(chamadas.filter((c) => c.url.pathname === "/rest/v1/campaign_groups").length, 0);
  assert.equal(emails().length, 0);
});
