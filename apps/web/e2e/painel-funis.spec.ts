import { expect, test } from "@playwright/test";

import { exigeCredenciais } from "./sessao-helpers";

/**
 * Tela Funis (no lugar de Automações). Não escreve no banco: a lista vem de um
 * mock de /api/funis e o cancelamento é interceptado — a mesma razão de
 * painel-funil.spec.ts (dev sem `instances`; POST real iria para grupo real).
 */

type Campanha = { id: string; slug?: string; name: string; groupIds: string[] };

exigeCredenciais();

test("lista os funis, cancela as etapas pendentes e Automações redireciona", async ({ page }) => {
  const agora = Date.now();
  const em = (h: number) => new Date(agora + h * 3_600_000).toISOString();
  const overview = {
    agendados: [{
      runId: "run-e2e", templateId: "grade-do-dia", label: "Grade do dia", startedAt: em(-1),
      steps: [
        { id: "m1", index: 1, label: "Grade de hoje", body: "", at: em(48), status: "scheduled", sent: 0, total: 1 },
        { id: "m2", index: 2, label: "Vagas de hoje", body: "", at: em(48.2), status: "scheduled", sent: 0, total: 1 },
      ],
      enviadas: 0, gruposEntregues: 0, gruposAlvo: 2,
      campaign: { slug: "campanha-e2e", name: "Campanha E2E" }, pendentes: ["m1", "m2"], quando: em(48),
    }],
    enviados: [],
  };
  let cancelados: string[] = [];
  await page.route("**/api/funis", (rota) =>
    rota.fulfill({ json: cancelados.length ? { agendados: [], enviados: [] } : overview }),
  );
  await page.route("**/api/campanhas/campanha-e2e/messages/cancel?**", (rota) => {
    cancelados = [...cancelados, new URL(rota.request().url()).searchParams.get("id") ?? ""];
    return rota.fulfill({ json: { ok: true } });
  });

  await page.goto("/painel/automacoes", { waitUntil: "load" });
  await expect(page).toHaveURL(/\/painel\/funis$/);
  await expect(page.getByRole("heading", { name: "Funis", exact: true })).toBeVisible();
  const linha = page.getByRole("listitem").filter({ hasText: "Campanha E2E" });
  await expect(linha).toContainText("Grade do dia");

  await linha.getByRole("button", { name: "Cancelar funil" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar funil" }).click();
  await expect(page.getByText("Nenhum funil ainda")).toBeVisible();
  expect(cancelados).toEqual(["m1", "m2"]);
});

test("Novo funil: escolher a campanha abre a sub-aba Funil dela", async ({ page }) => {
  const res = await page.request.get("/api/campanhas");
  expect(res.ok(), `GET /api/campanhas respondeu ${res.status()}`).toBeTruthy();
  const campanha = ((await res.json()) as Campanha[]).find((c) => c.slug && c.groupIds.length > 0);
  test.skip(!campanha, "o tenant de QA não tem campanha com slug e grupos");

  await page.goto("/painel/funis", { waitUntil: "load" });
  await page.getByRole("button", { name: /^Novo funil/ }).click();
  await page.getByRole("radio", { name: new RegExp(campanha?.name ?? "") }).first().check();
  await page.getByRole("link", { name: /Montar o funil/ }).click();

  await expect(page).toHaveURL(new RegExp(`/painel/campanhas/${campanha?.slug}\\?abrir=funil`));
  await expect(page.getByRole("button", { name: /^Funil/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("group", { name: "Roteiro" })).toBeVisible();
});
