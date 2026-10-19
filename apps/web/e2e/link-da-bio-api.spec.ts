import { expect, request as novoRequest, test } from "@playwright/test";

import { BASE_URL, ESTADO_LOGADO } from "./caminhos";
import { TEM_CREDENCIAIS } from "./sessao-helpers";

/**
 * A API do painel do link da bio contra o banco de dev de verdade (spec 2026-10-19-link-da-bio §9).
 * O teste de rota roda contra um PostgREST de mentira; aqui as consultas do PR 2, os grants do
 * PR 1 e o `bio_relatorio` respondem pelo Supabase real. Só leitura: criar e salvar ficam com o
 * e2e do painel (PR 6a), que limpa o que cria.
 */

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

type Painel = {
  pagina: { tenantId: string } | null;
  campanhas: unknown[];
  dominio: string | null;
  origemGirumo: string;
  sugestaoSlug: string;
  linksEscondidos: unknown[];
};

test.describe("API do link da bio: o dono lê pelo banco de verdade", () => {
  test.skip(!TEM_CREDENCIAIS, "Precisa do usuário de QA (E2E_EMAIL/E2E_PASSWORD).");

  test("GET, slug e relatório respondem com o contrato do §9", async () => {
    const api = await novoRequest.newContext({ baseURL: BASE_URL, storageState: ESTADO_LOGADO });
    try {
      const me = (await (await api.get("/api/auth/me")).json()) as { tenantId?: string | null };

      const painel = await api.get("/api/link-da-bio");
      expect(painel.status()).toBe(200);
      const corpo = (await painel.json()) as Painel;
      if (corpo.pagina) expect(corpo.pagina.tenantId).toBe(me.tenantId);
      expect(Array.isArray(corpo.campanhas)).toBe(true);
      expect(Array.isArray(corpo.linksEscondidos)).toBe(true);
      expect(corpo.origemGirumo).toMatch(/^https?:\/\/[^/]+$/);
      expect(corpo.sugestaoSlug).toMatch(SLUG);
      expect(corpo.sugestaoSlug.length).toBeGreaterThanOrEqual(3);
      expect(corpo.sugestaoSlug.length).toBeLessThanOrEqual(40);

      const reservado = await api.get("/api/link-da-bio/slug?valor=girumo");
      expect(await reservado.json()).toEqual({ disponivel: false, motivo: "reservado" });
      // Endereço que ninguém usou: o `slugDisponivel` consulta `bio_slugs` de verdade.
      const livre = await api.get(`/api/link-da-bio/slug?valor=e2e-livre-${Date.now()}`);
      expect(await livre.json()).toEqual({ disponivel: true });

      const relatorio = await api.get("/api/link-da-bio/relatorio?dias=7");
      expect(relatorio.status()).toBe(200);
      const numeros = (await relatorio.json()) as { visitas: unknown; toques: unknown; porLink: unknown; porDia: unknown };
      expect(typeof numeros.visitas).toBe("number");
      expect(typeof numeros.toques).toBe("number");
      expect(Array.isArray(numeros.porLink)).toBe(true);
      expect(Array.isArray(numeros.porDia)).toBe(true);
    } finally {
      await api.dispose();
    }
  });
});
