import { randomBytes, randomInt } from "node:crypto";

import { expect, request as novoRequest, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { isClosedAt, readEntrada } from "../src/lib/campaigns/settings";
import { BASE_URL, ESTADO_LOGADO } from "./caminhos";
import { TEM_CREDENCIAIS } from "./sessao-helpers";

/**
 * A cadeia inteira da spec 2026-10-10-funil-anuncios §8, parte pública incluída:
 * chave → cadastro do site (Bearer) → clique no redirect → "foram" no funil.
 * `painel-anuncios.spec.ts` prova só o último elo, plantando o cadastro direto.
 *
 * Mexe em três coisas da loja de QA, e devolve as três no afterAll:
 *  - `site_integrations` (PK `tenant_id`): gerar chave sobrescreve a linha, então o
 *    beforeAll guarda a linha inteira e o afterAll a restaura (ou apaga a criada);
 *  - o cadastro e o clique do teste (o clique primeiro: `capture_id` é `on delete set null`);
 *  - `tracked_links.clicks` do link usado, que o /r/ incrementa.
 * `playwright.config.ts` roda com workers 1, então nenhum outro spec enxerga o estado
 * intermediário (o da tela, `painel-integracao-site.spec.ts`, aceita qualquer estado
 * e nem depende disto). Se o processo morrer antes do afterAll, a loja de QA fica com a
 * chave deste teste: gerar outra pela tela resolve.
 */

const URL_SUPABASE = process.env.E2E_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const CHAVE_SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const TEM_BANCO = Boolean(URL_SUPABASE && CHAVE_SERVICE_ROLE);
/** Só o que este spec cria começa assim: a limpeza não toca em mais nada. */
const PREFIXO = "e2e-cadeia-";
const UMA_HORA_MS = 3_600_000;
const NAVEGADOR =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

type Funil = { relatorio: { total: { cadastros: number; foram: number } } };
type Linha = Record<string, unknown>;
type LinkRastreado = {
  id: string;
  slug: string;
  campaign_group_id: string | null;
  clicks: number;
  metadata: Record<string, unknown> | null;
};

function bancoDeDev(): SupabaseClient {
  return createClient(URL_SUPABASE, CHAVE_SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** A loja em que o usuário de QA cai ao logar: é o tenant que as rotas vão ler. */
async function lojaDeQa(): Promise<string> {
  const api = await novoRequest.newContext({ baseURL: BASE_URL, storageState: ESTADO_LOGADO });
  try {
    const res = await api.get("/api/auth/me");
    if (!res.ok()) throw new Error(`GET /api/auth/me do usuário de QA respondeu ${res.status()}`);
    const me = (await res.json()) as { tenantId?: string | null };
    if (!me.tenantId) throw new Error("o usuário de QA não tem loja");
    return me.tenantId;
  } finally {
    await api.dispose();
  }
}

/** Mesma regra do `/r/`: link mestre só resolve com campanha aberta e um grupo `enchendo`; o comum, abaixo do teto. */
async function resolveClique(banco: SupabaseClient, loja: string, link: LinkRastreado): Promise<boolean> {
  if (!link.campaign_group_id) {
    const teto = Math.floor(Number(link.metadata?.clickCap));
    return !(Number.isFinite(teto) && teto > 0 && link.clicks >= teto);
  }
  const { data: campanha, error: erroCampanha } = await banco
    .from("campaign_groups")
    .select("metadata")
    .eq("tenant_id", loja)
    .eq("id", link.campaign_group_id)
    .maybeSingle();
  if (erroCampanha) throw new Error(`campaign_groups de ${link.slug}: ${erroCampanha.message}`);
  if (!campanha) return false;
  if (isClosedAt(readEntrada(campanha.metadata as Record<string, unknown> | null).encerra_em, new Date())) return false;
  const { data: estados, error } = await banco.rpc("campaign_group_states", {
    p_tenant: loja,
    p_campaign: link.campaign_group_id,
  });
  if (error) throw new Error(`campaign_group_states de ${link.slug}: ${error.message}`);
  return ((estados ?? []) as Array<{ estado: string }>).some((g) => g.estado === "enchendo");
}

/** O primeiro link da loja de QA que leva a um grupo aberto: sem ele o /r/ responde a página de "cheio" e não grava clique. */
async function linkComGrupoAberto(banco: SupabaseClient, loja: string): Promise<LinkRastreado> {
  const { data, error } = await banco
    .from("tracked_links")
    .select("id, slug, campaign_group_id, clicks, metadata")
    .eq("tenant_id", loja)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`tracked_links da loja de QA: ${error.message}`);
  const links = (data ?? []) as LinkRastreado[];
  for (const link of links) {
    if (await resolveClique(banco, loja, link)) return link;
  }
  throw new Error(
    `Pré-condição: a loja de QA (${loja}) precisa de um link rastreado que leve a um grupo aberto ` +
      `(campanha não encerrada com grupo "enchendo", ou link comum abaixo do teto). Achou ${links.length} link(s), nenhum serve.`,
  );
}

test.describe("cadeia da spec §8: chave → cadastro → redirect → clique → funil", () => {
  test.skip(
    !TEM_CREDENCIAIS || !TEM_BANCO,
    "Precisa do usuário de QA (E2E_EMAIL/E2E_PASSWORD) e da service role de dev (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY).",
  );

  const eventId = `${PREFIXO}${randomBytes(6).toString("hex")}`;
  let banco: SupabaseClient | undefined;
  let loja = "";
  let link: LinkRastreado | undefined;
  /** A linha de `site_integrations` como a loja de QA a tinha (`null` = não tinha). `undefined` = ainda não lida. */
  let integracaoAntes: Linha | null | undefined;
  /** Vira true antes de gerar a chave: se o POST falhar no meio, o afterAll ainda restaura. */
  let integracaoMexida = false;
  let cliqueEnviado = false;

  test.beforeAll(async () => {
    banco = bancoDeDev();
    loja = await lojaDeQa();

    // Resto de execução que morreu antes do afterAll. Mais de uma hora: não pega um run vivo em paralelo.
    const { data: velhos, error: erroVelhos } = await banco
      .from("site_captures")
      .select("id")
      .eq("tenant_id", loja)
      .like("event_id", `${PREFIXO}%`)
      .lt("created_at", new Date(Date.now() - UMA_HORA_MS).toISOString());
    if (erroVelhos) throw new Error(`leitura de cadastros velhos: ${erroVelhos.message}`);
    const idsVelhos = (velhos ?? []).map((v) => String(v.id));
    if (idsVelhos.length > 0) {
      const { error: erroCliques } = await banco
        .from("link_click_events")
        .delete()
        .eq("tenant_id", loja)
        .in("capture_id", idsVelhos);
      if (erroCliques) throw new Error(`limpeza de cliques velhos: ${erroCliques.message}`);
      const { error } = await banco.from("site_captures").delete().eq("tenant_id", loja).in("id", idsVelhos);
      if (error) throw new Error(`limpeza de cadastros velhos: ${error.message}`);
    }

    const { data: integracao, error: erroIntegracao } = await banco
      .from("site_integrations")
      .select("*")
      .eq("tenant_id", loja)
      .maybeSingle();
    if (erroIntegracao) throw new Error(`leitura de site_integrations: ${erroIntegracao.message}`);
    integracaoAntes = (integracao as Linha | null) ?? null;

    link = await linkComGrupoAberto(banco, loja);
  });

  test.afterAll(async () => {
    if (!banco || !loja) return;
    const falhas: string[] = [];
    const tentar = async (passo: string, fn: () => Promise<{ error: { message: string } | null }>) => {
      const { error } = await fn();
      if (error) falhas.push(`${passo}: ${error.message}`);
    };

    // Pelo event_id, não pelo capture_id guardado: cobre o teste que caiu depois do POST e antes de ler a resposta.
    const { data: cadastros, error: erroLeitura } = await banco
      .from("site_captures")
      .select("id")
      .eq("tenant_id", loja)
      .eq("event_id", eventId);
    if (erroLeitura) falhas.push(`leitura do cadastro ${eventId}: ${erroLeitura.message}`);
    const ids = (cadastros ?? []).map((c) => String(c.id));
    if (ids.length > 0) {
      await tentar("limpeza do clique", async () =>
        banco!.from("link_click_events").delete().eq("tenant_id", loja).in("capture_id", ids),
      );
      await tentar(`limpeza do cadastro ${eventId}`, async () =>
        banco!.from("site_captures").delete().eq("tenant_id", loja).in("id", ids),
      );
    }

    const antes = integracaoAntes;
    if (integracaoMexida && antes !== undefined) {
      await tentar("restauração de site_integrations", async () =>
        antes === null
          ? banco!.from("site_integrations").delete().eq("tenant_id", loja)
          : banco!.from("site_integrations").upsert(antes, { onConflict: "tenant_id" }),
      );
    }

    // Compare-and-swap: só desfaz o +1 do /r/ se o contador está exatamente onde o clique do teste o deixou.
    // Se outro clique entrou no meio, o número não é mais nosso para mexer.
    if (cliqueEnviado && link) {
      await tentar("restauração de tracked_links.clicks", async () =>
        banco!
          .from("tracked_links")
          .update({ clicks: link!.clicks })
          .eq("tenant_id", loja)
          .eq("id", link!.id)
          .eq("clicks", link!.clicks + 1),
      );
    }

    if (falhas.length > 0) throw new Error(`limpeza da loja de QA incompleta:\n${falhas.join("\n")}`);
  });

  test("o clique no redirect do cadastro vira 'foram' no funil", async () => {
    if (!banco || !link) throw new Error("o beforeAll não preparou o banco e o link");
    const dono = await novoRequest.newContext({ baseURL: BASE_URL, storageState: ESTADO_LOGADO });
    const publico = await novoRequest.newContext({ baseURL: BASE_URL, userAgent: NAVEGADOR });
    try {
      const antes = (await (await dono.get("/api/resultados/anuncios")).json()) as Funil;

      integracaoMexida = true;
      const geracao = await dono.post("/api/integracoes/site/chave", { data: { tracked_link_id: link.id } });
      expect(geracao.status(), "POST /api/integracoes/site/chave").toBe(201);
      const { chave } = (await geracao.json()) as { chave: string };

      const cadastro = await publico.post("/api/integracoes/cadastro", {
        headers: { authorization: `Bearer ${chave}` },
        data: {
          whatsapp: `+55629${String(randomInt(10_000_000, 100_000_000))}`,
          event_id: eventId,
          page_url: "https://e2e.example/vip?utm_source=ig&utm_campaign=e2e-cadeia",
        },
      });
      expect(cadastro.status(), "POST /api/integracoes/cadastro").toBe(201);
      const { redirect, capture_id: captureId } = (await cadastro.json()) as { redirect: string; capture_id: string };

      // O `redirect` vem com o host de um domínio próprio ativo da loja de QA, se houver: o que vale
      // para o teste é o `cid` e o slug que ele carrega, requisitados contra o BASE_URL.
      const destino = new URL(redirect);
      expect(destino.searchParams.get("cid"), "cid do redirect").toBe(captureId);
      expect(destino.pathname.endsWith(`/${link.slug}`), `redirect ${destino.pathname} deve terminar no slug`).toBe(true);

      // Sem seguir o 302: o destino (convite do WhatsApp) não é da conta do teste. O caminho é sempre o
      // do host do Girumo (`/r/`), não o `/<slug>` do domínio próprio, que este host não serve.
      cliqueEnviado = true;
      const clique = await publico.get(`/r/${link.slug}?cid=${captureId}`, { maxRedirects: 0 });
      expect(clique.status(), `GET /r/${link.slug}: o link precisa resolver (3xx ou a tela de entrada), não 404`).toBeLessThan(400);

      // O clique de gente real é gravado na própria resposta do /r/, com o cid conferido.
      await expect
        .poll(
          async () => {
            const { count, error } = await banco!
              .from("link_click_events")
              .select("id", { count: "exact", head: true })
              .eq("tenant_id", loja)
              .eq("capture_id", captureId)
              .eq("tracked_link_id", link!.id);
            if (error) throw new Error(error.message);
            return count ?? 0;
          },
          {
            timeout: 15_000,
            message: `o /r/${link.slug} não gravou o clique com capture_id ${captureId}: o link caiu na página de bloqueio?`,
          },
        )
        .toBe(1);

      await expect
        .poll(
          async () => {
            const depois = (await (await dono.get("/api/resultados/anuncios")).json()) as Funil;
            return depois.relatorio.total.foram - antes.relatorio.total.foram;
          },
          { timeout: 15_000, message: "o clique gravado não apareceu em 'foram' do funil" },
        )
        .toBeGreaterThanOrEqual(1);
    } finally {
      await dono.dispose();
      await publico.dispose();
    }
  });
});
