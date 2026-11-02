import type { Page } from "@playwright/test";

/** O que as rotas simuladas devolvem. `status: 500` derruba a leitura do status. */
export type EstadoMock = {
  status: { enabled: boolean; precisaDeVoce: number } | 500;
  oferta: { bloqueio: "sem_plano" | "ja_assinado" | null; configurado: boolean; podeCobrar: boolean };
};

export const OFERTA_NORMAL: EstadoMock["oferta"] = { bloqueio: null, configurado: true, podeCobrar: true };

/**
 * Simula o status do Recuperar e a oferta sem tocar no banco nem no Stripe. Lê `estado`
 * a cada requisição: o teste muda o objeto no meio do caminho (ex.: o webhook liberou).
 */
export async function moca(page: Page, estado: EstadoMock): Promise<void> {
  await page.route("**/api/recuperar/status", (rota) =>
    estado.status === 500 ? rota.fulfill({ status: 500, json: { error: "x" } }) : rota.fulfill({ json: estado.status }),
  );
  await page.route("**/api/billing/recuperar/oferta", (rota) => rota.fulfill({ json: estado.oferta }));
}
