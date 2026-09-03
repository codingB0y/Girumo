import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { instantiateTemplate } from "../src/lib/pages/templates-v3";
import { exigeCredenciais, semErroDeRuntime } from "./sessao-helpers";

/**
 * O que o fluxo v3 (páginas com seções) FAZ, de ponta a ponta:
 *
 * 1. a API cria uma página v3 e grava as dimensões do modelo (structure =
 *    chave do template, visual_direction = impacto) — é isso que a captura
 *    depois copia pra dizer "o que a pessoa viu";
 * 2. a tela da página edita por seção: desligar uma seção salva sozinho e o
 *    servidor devolve `enabled: false` — a prova vem da API, não do DOM;
 * 3. a página pública renderiza o motor de seções com o título e o formulário;
 * 4. a galeria de modelos oferece o template (só com a flag ligada no servidor).
 *
 * A página do teste é reusada entre execuções (a API não tem DELETE) e cada
 * teste devolve o que mexeu: a seção volta a ligada, o status volta a rascunho.
 */

const NOME_DA_PAGINA = "E2E Páginas v3";
const DESTINO_DE_TESTE = "https://chat.whatsapp.com/E2E0000000000000000000";

type Secao = { type: string; enabled: boolean };
type PaginaV3 = {
  id: string;
  slug: string;
  status: "draft" | "published" | "paused";
  content_schema_version: number;
  structure: string;
  visual_direction: string;
  content: { store_name: string; sections: Secao[] };
};

async function templateId(request: APIRequestContext): Promise<string> {
  const res = await request.get("/api/pages/templates");
  expect(res.ok(), `GET /api/pages/templates respondeu ${res.status()}`).toBeTruthy();
  const rows = (await res.json()) as { id: string; slug: string }[];
  const row = rows.find((t) => t.slug === "evento-ao-vivo");
  expect(row, "template evento-ao-vivo precisa existir no banco (migração 20260902090000)").toBeTruthy();
  return row!.id;
}

/** Cria (ou reusa) a página v3 do teste. Snapshot sempre do servidor. */
async function prepararPaginaV3(request: APIRequestContext): Promise<PaginaV3> {
  const lista = await request.get("/api/pages");
  expect(lista.ok()).toBeTruthy();
  const existente = ((await lista.json()) as PaginaV3[]).find(
    (p) => p.content_schema_version === 3 && p.content?.store_name === NOME_DA_PAGINA,
  );
  if (existente) return existente;

  const content = instantiateTemplate("evento-ao-vivo");
  content.store_name = NOME_DA_PAGINA;
  const res = await request.post("/api/pages", {
    data: { template_id: await templateId(request), content },
  });
  expect(res.status(), `POST /api/pages respondeu ${res.status()}: ${await res.text()}`).toBe(201);
  return (await res.json()) as PaginaV3;
}

async function lerPagina(request: APIRequestContext, id: string): Promise<PaginaV3> {
  const res = await request.get(`/api/pages/${id}`);
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { page: PaginaV3 }).page;
}

async function patch(request: APIRequestContext, id: string, data: Record<string, unknown>) {
  const res = await request.patch(`/api/pages/${id}`, { data });
  expect(res.ok(), `PATCH /api/pages/${id} respondeu ${res.status()}: ${await res.text()}`).toBeTruthy();
}

test.describe("páginas v3 (seções)", () => {
  test.beforeEach(() => exigeCredenciais());

  test("a API cria a página com as dimensões do modelo", async ({ page }) => {
    const pagina = await prepararPaginaV3(page.request);
    expect(pagina.content_schema_version).toBe(3);
    expect(pagina.structure).toBe("evento-ao-vivo");
    expect(pagina.visual_direction).toBe("impacto");
    expect(pagina.content.sections.map((s) => s.type)).toContain("faq");
  });

  test("desligar uma seção na tela salva sozinho e o servidor confirma", async ({ page }) => {
    const pagina = await prepararPaginaV3(page.request);
    // Precondição: a FAQ ligada (um run anterior interrompido pode tê-la deixado desligada).
    const faqAntes = (await lerPagina(page.request, pagina.id)).content.sections.find((s) => s.type === "faq");
    if (faqAntes && !faqAntes.enabled) {
      await patch(page.request, pagina.id, {
        content: { ...pagina.content, sections: pagina.content.sections.map((s) => (s.type === "faq" ? { ...s, enabled: true } : s)) },
      });
    }

    await page.goto(`/painel/pages/${pagina.id}`);
    await expect(page.getByRole("heading", { name: NOME_DA_PAGINA })).toBeVisible();

    const interruptor = page.getByRole("switch", { name: /Desligar a seção Perguntas frequentes/ });
    // O input é sr-only (o que se vê é a pista do interruptor); a pessoa clica na pista,
    // que é o <label> pai — o clique no rótulo é o que alterna o checkbox.
    await expect(interruptor).toBeAttached();
    await interruptor.locator("..").click();
    await expect(page.getByText("Rascunho salvo.")).toBeVisible({ timeout: 15_000 });

    const depois = await lerPagina(page.request, pagina.id);
    const faq = depois.content.sections.find((s) => s.type === "faq");
    expect(faq?.enabled, "o servidor precisa ter gravado enabled=false").toBe(false);
    await semErroDeRuntime(page);

    // Devolve: liga a seção de novo pela API (a tela já provou o caminho).
    await patch(page.request, pagina.id, {
      content: { ...depois.content, sections: depois.content.sections.map((s) => (s.type === "faq" ? { ...s, enabled: true } : s)) },
    });
  });

  test("a página pública renderiza o motor de seções", async ({ page }) => {
    const pagina = await prepararPaginaV3(page.request);
    await patch(page.request, pagina.id, { target_group_url: DESTINO_DE_TESTE, status: "published" });
    try {
      const res = await page.goto(`/p/${pagina.slug}`);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toContainText("lotar o grupo VIP");
      await expect(page.getByLabel("WhatsApp com DDD")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Perguntas frequentes" })).toBeVisible();
    } finally {
      await patch(page.request, pagina.id, { status: "draft" });
    }
  });

  test("a galeria oferece o modelo Evento ao vivo", async ({ page }) => {
    test.skip(process.env.NEXT_PUBLIC_LP_TEMPLATES_V3 !== "on", "NEXT_PUBLIC_LP_TEMPLATES_V3 desligada no servidor alvo");
    await page.goto("/painel/pages/nova");
    await expect(page.getByRole("heading", { name: "Nova página" })).toBeVisible();
    const card = page.getByRole("listitem").filter({ hasText: "Evento ao vivo" });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Usar este modelo" }).click();
    await expect(page.getByRole("switch", { name: /Perguntas frequentes/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Salvar rascunho/ })).toBeVisible();
    await semErroDeRuntime(page);
  });

  test("a galeria oferece o Acesso VIP como modelo v3 editorial", async ({ page }) => {
    test.skip(process.env.NEXT_PUBLIC_LP_TEMPLATES_V3 !== "on", "NEXT_PUBLIC_LP_TEMPLATES_V3 desligada no servidor alvo");
    await page.goto("/painel/pages/nova");
    const card = page.getByRole("listitem").filter({ hasText: "Acesso VIP" });
    await expect(card).toBeVisible();
    await expect(card).toContainText(/editorial/i);
    await card.getByRole("button", { name: "Usar este modelo" }).click();
    // Não é mais o fluxo v2: o editor de seções aparece, com a galeria e a prova em vídeo no catálogo.
    await expect(page.getByRole("switch", { name: /Galeria de peças/ })).toBeVisible();
    await expect(page.getByRole("switch", { name: /Prova social/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Salvar rascunho/ })).toBeVisible();
    await semErroDeRuntime(page);
  });

  test("a galeria oferece a Vitrine, com carrossel de peças na direção vitrine", async ({ page }) => {
    test.skip(process.env.NEXT_PUBLIC_LP_TEMPLATES_V3 !== "on", "NEXT_PUBLIC_LP_TEMPLATES_V3 desligada no servidor alvo");
    await page.goto("/painel/pages/nova");
    const card = page.getByRole("listitem").filter({ hasText: "Vitrine" });
    await expect(card).toBeVisible();
    await expect(card).toContainText(/vitrine/i);
    await card.getByRole("button", { name: "Usar este modelo" }).click();
    // A galeria nasce desligada (seção de mídia sem foto não valida) mas já no carrossel.
    const galeria = page.getByRole("switch", { name: /Galeria de peças/ });
    await expect(galeria).toBeVisible();
    await expect(page.getByRole("switch", { name: /Programação/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Salvar rascunho/ })).toBeVisible();
    await semErroDeRuntime(page);
  });
});

/* ------------------------- migração v2 → v3 (Fase 2) ------------------------- */

const NOME_DA_PAGINA_V2 = "E2E Migração v2";

/** Mesmo shape das páginas v2 de prod: vídeo, galeria de 3, benefícios. Mídia em data URI (sem rede). */
function svgDataUri(label: string): string {
  const body = `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='800'><rect width='100%' height='100%' fill='#ddd0be'/><text x='50%' y='50%' font-size='40' text-anchor='middle'>${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(body)}`;
}

const CONTEUDO_V2 = {
  schema_version: 2,
  store_name: NOME_DA_PAGINA_V2,
  logo: null,
  brand_color: "#6D2436",
  badge: "Atacado",
  headline: "Lançamentos e preços de atacado primeiro no grupo",
  description: "Veja novidades e condições exclusivas antes de todo mundo.",
  cta: "Quero entrar no grupo",
  hero: { url: svgDataUri("Hero"), alt: "Arara de peças" },
  benefits: [
    { title: "Preços de atacado", description: "direto do fabricante" },
    { title: "Novidades toda semana", description: "coleção sempre atualizada" },
  ],
  gallery: [
    { url: svgDataUri("Peça 1"), alt: "Vestido midi" },
    { url: svgDataUri("Peça 2"), alt: "Conjunto de linho" },
    { url: svgDataUri("Peça 3"), alt: "Vestido estampado" },
  ],
  proof: {
    kind: "video",
    video: { provider: "vimeo", id: "1207228037" },
    name: "Mariana Alves",
    store: "Boutique MA",
    city: "Goiânia",
    quote: "As peças têm ótima saída e o atendimento é sempre rápido.",
  },
};

type PaginaMigravel = {
  id: string;
  content_schema_version: number;
  structure: string;
  visual_direction: string;
  content_before_v3?: { schema_version?: number } | null;
  content: { store_name: string; schema_version?: number; sections?: Secao[] };
};

/**
 * Cria (ou devolve ao estado v2) a página de migração do teste. Uma execução
 * anterior pode tê-la deixado em v3: o PATCH com o content v2 traz o
 * `schema_version` de volta a 2, e a rota aceita migrar de novo (a cópia
 * `content_before_v3` é sempre a primeira, nunca sobrescrita).
 */
async function prepararPaginaV2(request: APIRequestContext): Promise<PaginaMigravel> {
  const lista = await request.get("/api/pages");
  expect(lista.ok()).toBeTruthy();
  const existente = ((await lista.json()) as PaginaMigravel[]).find((p) => p.content?.store_name === NOME_DA_PAGINA_V2);
  if (existente) {
    if (existente.content_schema_version !== 2) await patch(request, existente.id, { content: CONTEUDO_V2 });
    return lerPagina(request, existente.id) as unknown as Promise<PaginaMigravel>;
  }

  const templates = await request.get("/api/pages/templates");
  expect(templates.ok()).toBeTruthy();
  const row = ((await templates.json()) as { id: string; slug: string }[]).find((t) => t.slug === "oferta-impacto");
  expect(row, "template oferta-impacto (editorial v2) precisa existir no banco").toBeTruthy();
  const res = await request.post("/api/pages", { data: { template_id: row!.id, content: CONTEUDO_V2 } });
  expect(res.status(), `POST /api/pages respondeu ${res.status()}: ${await res.text()}`).toBe(201);
  return (await res.json()) as PaginaMigravel;
}

test.describe("migração v2 → v3", () => {
  test.beforeEach(() => exigeCredenciais());

  test("o botão da tela migra a página e a cópia v2 fica guardada", async ({ page }) => {
    const pagina = await prepararPaginaV2(page.request);
    expect(pagina.content_schema_version).toBe(2);

    await page.goto(`/painel/pages/${pagina.id}`);
    await expect(page.getByRole("heading", { name: NOME_DA_PAGINA_V2 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Modelo novo disponível" })).toBeVisible();
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Migrar para o modelo novo" }).click();

    // A tela recarrega no editor de seções: a galeria migrada aparece como seção ligada.
    await expect(page.getByRole("switch", { name: /Galeria de peças/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Modelo novo disponível" })).toHaveCount(0);
    await semErroDeRuntime(page);

    const depois = (await lerPagina(page.request, pagina.id)) as unknown as PaginaMigravel;
    expect(depois.content_schema_version).toBe(3);
    expect(depois.structure).toBe("acesso-vip");
    expect(depois.visual_direction).toBe("editorial");
    expect(depois.content_before_v3?.schema_version, "a cópia v2 precisa estar guardada").toBe(2);
    const tipos = (depois.content.sections ?? []).filter((s) => s.enabled).map((s) => s.type);
    expect(tipos.slice(0, 4)).toEqual(["hero", "proof", "deliverables", "gallery"]);
  });

  test("migrar uma página que não é v2 é recusado", async ({ page }) => {
    const v3 = await prepararPaginaV3(page.request);
    const res = await page.request.post(`/api/pages/${v3.id}/migrate`);
    expect(res.status()).toBe(409);
  });
});

export type { Page };
