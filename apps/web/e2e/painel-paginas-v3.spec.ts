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
});

export type { Page };
