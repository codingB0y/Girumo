import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

type FixtureFiles = {
  "welcome.html": string;
  "trial-ending.html": string;
};

type RenderResult = {
  directory: string;
  welcomePath: string;
  trialEndingPath: string;
};

type RendererModule = {
  buildGirumoEmailFixtureFiles: () => FixtureFiles;
  renderGirumoEmailFixtures: () => RenderResult;
};

const rendererPath = path.join(process.cwd(), "scripts", "render-girumo-email-fixtures.ts");
const rendererUrl = pathToFileURL(rendererPath);

async function loadRenderer(): Promise<RendererModule> {
  try {
    return (await import(rendererUrl.href)) as unknown as RendererModule;
  } catch (error) {
    assert.fail(`O renderer de e-mails Girumo deve ser importável: ${String(error)}`);
  }
}

function assertIsDirectChildOfOsTemp(directory: string): void {
  assert.equal(path.dirname(directory), tmpdir());
  assert.match(path.basename(directory), /^girumo-email-fixtures-/);
}

test("buildGirumoEmailFixtureFiles usa os templates reais com dados fixos de QA", async () => {
  const { buildGirumoEmailFixtureFiles } = await loadRenderer();

  const first = buildGirumoEmailFixtureFiles();
  const second = buildGirumoEmailFixtureFiles();

  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first).sort(), ["trial-ending.html", "welcome.html"]);
  assert.match(first["welcome.html"], /Girumo/);
  assert.match(first["welcome.html"], /Marina/);
  assert.match(first["welcome.html"], /https:\/\/girumo-qa\.example\/painel/);
  assert.match(first["trial-ending.html"], /Girumo/);
  assert.match(first["trial-ending.html"], /2 dias/);
  assert.match(first["trial-ending.html"], /https:\/\/girumo-qa\.example\/painel\/configuracoes/);
});

test("renderGirumoEmailFixtures cria arquivos novos somente no temporário do SO", async () => {
  const { renderGirumoEmailFixtures } = await loadRenderer();
  const first = renderGirumoEmailFixtures();
  const second = renderGirumoEmailFixtures();

  try {
    assert.notEqual(first.directory, second.directory);
    assertIsDirectChildOfOsTemp(first.directory);
    assertIsDirectChildOfOsTemp(second.directory);
    assert.equal(first.welcomePath, path.join(first.directory, "welcome.html"));
    assert.equal(first.trialEndingPath, path.join(first.directory, "trial-ending.html"));
    assert.match(readFileSync(first.welcomePath, "utf8"), /Bem-vind\(a\), Marina!/);
    assert.match(readFileSync(first.trialEndingPath, "utf8"), /Seu trial está acabando/);
  } finally {
    rmSync(first.directory, { recursive: true, force: true });
    rmSync(second.directory, { recursive: true, force: true });
  }
});

test("importar é silencioso e executar a CLI termina com JSON sem segredos", () => {
  const importProbe = spawnSync(
    process.execPath,
    ["--import", "tsx", "--eval", `import(${JSON.stringify(rendererUrl.href)}).then(() => process.stdout.write("IMPORTED\\n"))`],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  assert.equal(importProbe.status, 0, importProbe.stderr);
  assert.equal(importProbe.stdout, "IMPORTED\n");

  const secret = "GIRUMO_QA_SECRET_MUST_NOT_LEAK";
  const cli = spawnSync(process.execPath, ["--import", "tsx", rendererPath], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      GIRUMO_DEPLOYMENT_URL: "https://girumo-preview.vercel.app",
      GIRUMO_QA_USER_PASSWORD: secret,
      SUPABASE_SERVICE_ROLE_KEY: secret,
    },
  });

  assert.equal(cli.status, 0, cli.stderr);
  assert.doesNotMatch(`${cli.stdout}\n${cli.stderr}`, new RegExp(secret));
  const lines = cli.stdout.trim().split(/\r?\n/);
  const result = JSON.parse(lines.at(-1) ?? "") as RenderResult;

  try {
    assertIsDirectChildOfOsTemp(result.directory);
    assert.equal(result.welcomePath, path.join(result.directory, "welcome.html"));
    assert.equal(result.trialEndingPath, path.join(result.directory, "trial-ending.html"));
    const welcomeHtml = readFileSync(result.welcomePath, "utf8");
    const trialEndingHtml = readFileSync(result.trialEndingPath, "utf8");
    assert.match(welcomeHtml, /Girumo/);
    assert.match(trialEndingHtml, /Girumo/);
    assert.match(
      welcomeHtml,
      /https:\/\/girumo-preview\.vercel\.app\/brand\/girumo\/email\/girumo-email-lockup-640x160\.png/,
    );
    assert.match(welcomeHtml, /https:\/\/girumo-preview\.vercel\.app\/painel/);
    assert.match(trialEndingHtml, /https:\/\/girumo-preview\.vercel\.app\/painel\/configuracoes/);
  } finally {
    rmSync(result.directory, { recursive: true, force: true });
  }
});
