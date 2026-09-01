import assert from "node:assert/strict";
import test from "node:test";
import { APP_HOST, APP_ONLY_PATHS, PUBLIC_SITE_HOST, appDomainRedirects } from "./domain-redirects";

test("manda para o app só quem chega pelo host público", () => {
  const redirects = appDomainRedirects();

  assert.ok(redirects.length > 0, "sem regra nenhuma o split de domínio não existe");

  for (const rule of redirects) {
    // Sem o `has` de host a regra casaria no próprio app.girumo.com.br —
    // redirect infinito — e também nos previews *.vercel.app.
    assert.deepEqual(
      rule.has,
      [{ type: "host", value: PUBLIC_SITE_HOST }],
      `${rule.source} sem trava de host`,
    );
    assert.equal(rule.destination, `https://${APP_HOST}${rule.source}`);
    // 308 preserva método e querystring: é o que mantém vivo o `?next=` que o
    // gate de auth põe na URL.
    assert.equal(rule.permanent, true, `${rule.source} precisa ser 308, não 307`);
  }
});

test("cobre toda superfície que lê ou cria sessão", () => {
  const sources = appDomainRedirects().map((r) => r.source);

  // /painel e /admin com :path*, que casa zero segmentos e portanto cobre o
  // path puro também.
  assert.ok(sources.includes("/painel/:path*"));
  assert.ok(sources.includes("/admin/:path*"));
  assert.ok(sources.includes("/login"), "logar em www cria sessão que app não enxerga");
  assert.ok(sources.includes("/signup"), "criar conta em www nasce logado no host errado");
  assert.ok(
    sources.includes("/auth/callback"),
    "o login com Google é client-side: callback em www faz a sessão nascer em www",
  );
});

test("nunca redireciona /api — webhook não segue 308", () => {
  // A Stripe trata 3xx no endpoint de webhook como falha de entrega, e a
  // Evolution idem. Se um deles estiver apontado para www, uma regra em /api
  // pararia de entregar evento em silêncio.
  for (const source of APP_ONLY_PATHS) {
    assert.ok(!source.startsWith("/api"), `${source} quebraria entrega de webhook`);
  }
});

test("deixa o site público onde ele está", () => {
  const sources: readonly string[] = APP_ONLY_PATHS;

  // Estas são o ativo de SEO e vivem em www: a home é a canônica, /p/ e /r/ são
  // as superfícies públicas dos lojistas.
  for (const publicPath of ["/", "/p/:path*", "/r/:path*", "/termos", "/privacidade"]) {
    assert.ok(!sources.includes(publicPath), `${publicPath} não pode sair de www`);
  }
});
