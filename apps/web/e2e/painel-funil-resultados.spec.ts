import { expect, test, type Page } from "@playwright/test";

import { exigeCredenciais } from "./sessao-helpers";

/**
 * Aba Resultados → "Resultados por funil". A rota `/funis` é interceptada: o
 * tenant de QA não tem funil enviado nem oferta atendida, e o que se cobra aqui
 * é a TELA (quem recebe traço, quem recebe número, quem aparece primeiro).
 * A montagem dos funis a partir das mensagens é coberta por `results.test.ts`.
 */

type Campanha = { id: string; slug?: string; groupIds: string[] };

exigeCredenciais();

const FUNIS = [
  {
    runId: "run-live",
    templateId: "live",
    label: "Lançamento de live",
    startedAt: "2026-09-21T17:12:17Z",
    enviadas: 2,
    gruposEntregues: 24,
    gruposAlvo: 26,
    offer: { broadcastId: "b2", slots: 12, pediram: 38, atendidas: 12, vendeu: 9, desistiram: 3 },
    steps: [
      {
        id: "b1", index: 1, label: "Prévia da grade", body: "Amanhã 20h tem live!",
        at: "2026-09-21T22:00:00Z", status: "sent", sent: 13, total: 13,
      },
      {
        id: "b2", index: 2, label: "Grade da live", body: "Manda EU QUERO",
        at: "2026-09-22T00:30:00Z", status: "sent", sent: 11, total: 13,
        offer: { broadcastId: "b2", slots: 12, pediram: 38, atendidas: 12, vendeu: 9, desistiram: 3 },
      },
    ],
  },
  {
    runId: "run-grade",
    templateId: "grade-do-dia",
    label: "Grade do dia",
    startedAt: "2026-09-19T09:00:00Z",
    enviadas: 1,
    gruposEntregues: 13,
    gruposAlvo: 26,
    steps: [
      { id: "g1", index: 1, label: "Grade de hoje", body: "Grade de hoje", at: "2026-09-19T11:00:00Z", status: "sent", sent: 13, total: 13 },
      { id: "g2", index: 2, label: "Vagas de hoje", body: "Últimas vagas", at: "2026-09-19T11:12:00Z", status: "scheduled", sent: 0, total: 13 },
    ],
  },
];

async function campanhaComGrupos(page: Page): Promise<Campanha> {
  const res = await page.request.get("/api/campanhas");
  expect(res.ok(), `GET /api/campanhas respondeu ${res.status()}`).toBeTruthy();
  const campanha = ((await res.json()) as Campanha[]).find((c) => c.slug && c.groupIds.length > 0);
  test.skip(!campanha, "o tenant de QA não tem campanha com slug e grupos");
  return campanha as Campanha;
}

async function abrirResultados(page: Page, slug: string, funis: unknown) {
  await page.route(`**/api/campanhas/${encodeURIComponent(slug)}/funis`, (rota) =>
    rota.fulfill({ json: funis }),
  );
  await page.goto(`/painel/campanhas/${slug}`, { waitUntil: "load" });
  await page.getByRole("button", { name: "Resultados", exact: true }).click();
}

test("mostra cada funil com etapas, entrega e os números da oferta", async ({ page }) => {
  const campanha = await campanhaComGrupos(page);
  await abrirResultados(page, campanha.slug as string, FUNIS);

  const live = page.getByRole("heading", { name: "Lançamento de live" });
  await expect(live).toBeVisible();
  await expect(page.getByText("2 de 2 saíram")).toBeVisible();
  await expect(page.getByText("24/26 grupos")).toBeVisible();

  // A etapa que entregou a todos e a que falhou em 2 grupos aparecem diferentes.
  // "13/13 grupos" sai nos dois funis do fixture, daí o `first`.
  await expect(page.getByText("13/13 grupos").first()).toBeVisible();
  await expect(page.getByText("11/13 grupos")).toBeVisible();

  // Oferta relâmpago: números na etapa dela.
  await expect(page.getByText("Pediram", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Venderam", { exact: false })).toBeVisible();

  // Roteiro sem oferta mostra traço, não zero — zero pareceria fracasso.
  const grade = page.getByRole("heading", { name: "Grade do dia" });
  await expect(grade).toBeVisible();
  await expect(page.getByText("1 de 2 saíram")).toBeVisible();
});

test("sem funil confirmado, explica o que é um funil em vez de mostrar zero", async ({ page }) => {
  const campanha = await campanhaComGrupos(page);
  await abrirResultados(page, campanha.slug as string, []);

  await expect(page.getByText("Nenhum funil confirmado ainda")).toBeVisible();
});

test("rota fora do ar vira aviso de erro, nunca 'nenhum funil'", async ({ page }) => {
  const campanha = await campanhaComGrupos(page);
  await page.route(`**/api/campanhas/${encodeURIComponent(campanha.slug as string)}/funis`, (rota) =>
    rota.fulfill({ status: 500, json: { error: "boom" } }),
  );
  await page.goto(`/painel/campanhas/${campanha.slug}`, { waitUntil: "load" });
  await page.getByRole("button", { name: "Resultados", exact: true }).click();

  await expect(page.getByText("Não deu pra carregar os funis agora.")).toBeVisible();
  await expect(page.getByText("Nenhum funil confirmado ainda")).toBeHidden();
});
