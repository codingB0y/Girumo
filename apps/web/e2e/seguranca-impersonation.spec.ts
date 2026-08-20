import { createHmac } from "node:crypto";
import { expect, test, type BrowserContext } from "@playwright/test";
import { segredoDoEnvLocal } from "./segredo-local";
import { exigeCredenciais } from "./sessao-helpers";

/**
 * Prova executada do C1 do SECURITY_AUDIT (account takeover via impersonation)
 * e do fail-closed quando o admin perde o acesso no meio da sessão.
 *
 * Antes do PR #54 o cookie `dz_impersonate` não era assinado e o DELETE não
 * validava admin: QUALQUER USUÁRIO LOGADO forjava o cookie e recebia de volta a
 * sessão de outro — inclusive a do super-admin. Os testes abaixo reproduzem
 * exatamente esse ataque e cobram a recusa.
 *
 * Por que os testes usam a sessão do lojista comum: o middleware barra
 * `/api/admin/*` sem sessão com 401 ANTES do roteamento. Um teste anônimo
 * passaria verde sem nunca chegar no handler — provaria o middleware, não o
 * fix. O `qa-user` é um usuário legítimo e não está em `platform_admins`, que é
 * a posição exata do atacante descrito no C1.
 *
 * Nada aqui dispara automação, mensagem ou broadcast: são requests HTTP contra
 * /api/admin/impersonate e /api/squad-os.
 */

const COOKIE = "dz_impersonate";
const SESSAO = "dz_session";

/** Admin que não existe em `platform_admins` — o caso "acesso revogado". */
const ADMIN_INEXISTENTE = "00000000-0000-4000-8000-00000000dead";

/** Recusa do middleware (antes do roteamento) × recusa do handler. */
const ERRO_DO_MIDDLEWARE = "Nao autenticado.";

/**
 * Réplica do esquema de `lib/auth.ts`: base64url(JSON) + "." + HMAC-SHA256 hex.
 *
 * Reimplementado em vez de importado porque `lib/auth.ts` lê AUTH_SECRET no topo
 * do módulo e o import seria içado para antes de qualquer setup de env. Se o
 * esquema mudar, os testes que dependem de assinatura válida caem para 400 e
 * falham aqui — falha ruidosa, que é o que se quer.
 */
function assinar(dados: Record<string, unknown>, segredo: string): string {
  const payload = Buffer.from(JSON.stringify(dados), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const sig = createHmac("sha256", segredo).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

/** Payload legítimo na forma, assinatura de outro segredo: o cookie forjado. */
const COOKIE_FORJADO = assinar(
  { adminAuthUserId: ADMIN_INEXISTENTE, adminEmail: "invasor@exemplo.test", startedAt: new Date().toISOString() },
  "segredo-que-o-servidor-nao-conhece",
);

const SEGREDO = segredoDoEnvLocal("AUTH_SECRET");

async function comCookieDeImpersonation(context: BrowserContext, valor: string, baseURL?: string) {
  await context.addCookies([{ name: COOKIE, value: valor, url: baseURL ?? "http://localhost:3000" }]);
}

function setCookiesDe(headers: { name: string; value: string }[]) {
  return headers.filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value);
}

/** Cookie sendo apagado: o servidor reemite vazio e com prazo no passado. */
function pareceApagado(setCookie: string | undefined): boolean {
  if (!setCookie) return false;
  return /Max-Age=0/i.test(setCookie) || /Expires=Thu, 01 Jan 1970/i.test(setCookie);
}

test.describe("Impersonation recusa cookie que não pode provar quem é (C1)", () => {
  exigeCredenciais();

  test("status não confia em cookie com assinatura de outro segredo", async ({ context, baseURL }) => {
    await comCookieDeImpersonation(context, COOKIE_FORJADO, baseURL);

    const res = await context.request.get("/api/admin/impersonate/status");
    expect(res.status()).toBe(200);
    // O vazamento seria devolver adminEmail/tenantId do payload sem conferir a assinatura.
    expect(await res.json()).toEqual({ impersonating: false });
  });

  test("DELETE recusa cookie forjado em vez de devolver a sessão do admin", async ({ context, baseURL }) => {
    await comCookieDeImpersonation(context, COOKIE_FORJADO, baseURL);

    const res = await context.request.delete("/api/admin/impersonate");
    const corpo = await res.json();

    expect(res.status()).toBe(400);
    // Prova que a recusa veio do handler, não do gate de auth do middleware.
    expect(corpo.error).toBe("Invalid impersonate cookie");
    expect(corpo.error).not.toBe(ERRO_DO_MIDDLEWARE);

    // O takeover era exatamente isto: sair da rota com um dz_session novo.
    const emitidos = setCookiesDe(res.headersArray());
    expect(emitidos.filter((c) => c.startsWith(`${SESSAO}=`) && !pareceApagado(c))).toHaveLength(0);
  });

  test("DELETE recusa cookie bem assinado porém velho (validade de 2h)", async ({ context, baseURL }) => {
    test.skip(!SEGREDO, "AUTH_SECRET ausente: sem ele não dá para assinar um cookie que o servidor aceite.");

    const tresHorasAtras = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    await comCookieDeImpersonation(
      context,
      assinar(
        { adminAuthUserId: ADMIN_INEXISTENTE, adminEmail: "antigo@exemplo.test", startedAt: tresHorasAtras },
        SEGREDO as string,
      ),
      baseURL,
    );

    // A assinatura é válida — quem barra aqui é só a idade (isImpersonateFresh).
    // Sem esta checagem, um cookie copiado viraria sessão de super-admin meses depois.
    const res = await context.request.delete("/api/admin/impersonate");
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe("Invalid impersonate cookie");
  });

  test("DELETE falha fechado quando quem assinou não é mais admin", async ({ context, baseURL }) => {
    test.skip(!SEGREDO, "AUTH_SECRET ausente: sem ele não dá para assinar um cookie que o servidor aceite.");

    await comCookieDeImpersonation(
      context,
      assinar(
        {
          adminAuthUserId: ADMIN_INEXISTENTE,
          adminEmail: "ex-admin@exemplo.test",
          tenantId: "00000000-0000-0000-0000-000000000001",
          startedAt: new Date().toISOString(),
        },
        SEGREDO as string,
      ),
      baseURL,
    );

    const res = await context.request.delete("/api/admin/impersonate");

    // 403, e não 400: a assinatura BATE. O que falha é a checagem em
    // platform_admins — o cookie prova quem iniciou, não que ainda é admin.
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toBe("Admin access revoked");

    // As duas pontas caem: sem isto o acesso revogado seguiria como o lojista.
    const emitidos = setCookiesDe(res.headersArray());
    expect(pareceApagado(emitidos.find((c) => c.startsWith(`${COOKIE}=`)))).toBe(true);
    expect(pareceApagado(emitidos.find((c) => c.startsWith(`${SESSAO}=`)))).toBe(true);
  });
});

test.describe("Rotas de service-role exigem admin (H1)", () => {
  exigeCredenciais();

  // Antes do #54 estas rotas usavam service-role sem gate nenhum: usuário
  // logado comum lia e escrevia dado de squad de qualquer tenant.
  for (const rota of ["missions", "squads", "agents", "memories", "decisions", "handoffs"]) {
    test(`/api/squad-os/${rota} recusa lojista logado que não é admin`, async ({ context }) => {
      const res = await context.request.get(`/api/squad-os/${rota}`);

      expect(res.status()).toBe(401);
      // "Unauthorized" é do handler; "Nao autenticado." seria o middleware — e aí
      // o teste estaria verde sem nunca exercitar o gate que o #54 adicionou.
      expect((await res.json()).error).toBe("Unauthorized");
    });
  }
});
