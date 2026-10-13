import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Estrutural 1 do acesso da vendedora (spec §1): tenant de sessão só nasce nos
 * dois resolvedores guardados (`getTenantContext` e `lib/session-tenant.ts`).
 * Quem lê `memberships` por conta própria fura o guard de módulo — a vendedora
 * alcançaria a rota mesmo fora do mapa de `lib/auth/modulos.ts`.
 *
 * Entrada terminada em "/" vale para a pasta inteira. Entrada que não cobre
 * nenhuma leitura também falha: lista que só cresce vira porta aberta.
 */
const PERMITIDOS: ReadonlyArray<{ caminho: string; motivo: string }> = [
  { caminho: "lib/supabase/tenant-context.ts", motivo: "resolvedor guardado: getTenantContext" },
  { caminho: "lib/session-tenant.ts", motivo: "resolvedor guardado: findMembershipTenantId" },
  { caminho: "app/api/members/", motivo: "gestão da equipe (lista, convida, remove, aceita convite)" },
  { caminho: "lib/auth/accept-pending-invite.ts", motivo: "aceite de convite no cadastro, antes de existir tenant" },
  { caminho: "app/api/auth/login/", motivo: "login: devolve loja e papel antes de existir sessão" },
  { caminho: "app/api/auth/signup/", motivo: "cadastro: cria a membership de dono" },
  { caminho: "app/api/auth/oauth-complete/", motivo: "login Google: acha ou cria a membership" },
  { caminho: "app/api/cron/emails/", motivo: "cron (CRON_SECRET): acha o dono de cada loja, sem sessão" },
  { caminho: "app/api/notifications/alerts/", motivo: "cron (CRON_SECRET): enumera as lojas, sem sessão" },
  { caminho: "app/api/admin/", motivo: "admin da plataforma (getAdminContext)" },
  { caminho: "app/admin/", motivo: "páginas do admin da plataforma" },
];

/** apps/web/src — este arquivo mora em src/lib/auth. */
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LEITURA = /\.from\(\s*["'`]memberships["'`]\s*\)/;

function cobre(caminho: string, arquivo: string): boolean {
  return caminho.endsWith("/") ? arquivo.startsWith(caminho) : arquivo === caminho;
}

const leitores = readdirSync(SRC, { recursive: true, encoding: "utf8" })
  .map((relativo) => relativo.split(sep).join("/"))
  .filter((arquivo) => /\.tsx?$/.test(arquivo) && !/\.test\.tsx?$/.test(arquivo))
  .filter((arquivo) => LEITURA.test(readFileSync(join(SRC, arquivo), "utf8")))
  .sort();

test("memberships só é lida onde a lista diz por quê", () => {
  const fora = leitores.filter((arquivo) => !PERMITIDOS.some((p) => cobre(p.caminho, arquivo)));
  assert.deepEqual(
    fora,
    [],
    "resolva o tenant por getTenantContext/getRouteTenantContext ou lib/session-tenant.ts — leitura direta fura o guard da vendedora",
  );
});

test("toda entrada da lista ainda cobre uma leitura", () => {
  const mortas = PERMITIDOS.filter((p) => !leitores.some((arquivo) => cobre(p.caminho, arquivo))).map(
    (p) => `${p.caminho} — ${p.motivo}`,
  );
  assert.deepEqual(mortas, [], "entrada sem leitura: apague da lista");
});
