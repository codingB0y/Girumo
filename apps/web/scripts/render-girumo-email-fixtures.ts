import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

type EmailResult = { subject: string; html: string };
type EmailTemplates = {
  welcomeEmail: (name: string, appUrl: string) => EmailResult;
  trialEndingEmail: (name: string, appUrl: string, daysLeft: number) => EmailResult;
};
type ResolveFilename = (
  request: string,
  parent: unknown,
  isMain?: boolean,
  options?: unknown,
) => string;

export type GirumoEmailFixtureFiles = {
  "welcome.html": string;
  "trial-ending.html": string;
};

export type GirumoEmailFixtureResult = {
  directory: string;
  welcomePath: string;
  trialEndingPath: string;
};

function resolveQaAppUrl(env: NodeJS.ProcessEnv = process.env): string {
  const rawValue = env.GIRUMO_DEPLOYMENT_URL?.trim();
  if (!rawValue) return "https://girumo-qa.example";

  let parsed: URL;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw new Error("GIRUMO_DEPLOYMENT_URL precisa ser uma URL HTTPS válida.");
  }

  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("GIRUMO_DEPLOYMENT_URL precisa ser uma URL HTTPS válida.");
  }
  return parsed.origin;
}

export const GIRUMO_EMAIL_QA_DATA = Object.freeze({
  name: "Marina Girumo QA",
  appUrl: resolveQaAppUrl(),
  trialDaysLeft: 2,
});

const require = createRequire(import.meta.url);

function loadRealEmailTemplates(): EmailTemplates {
  const nodeModule = require("node:module") as typeof import("node:module") & {
    _resolveFilename: ResolveFilename;
  };
  const originalResolveFilename = nodeModule._resolveFilename;
  const serverOnlyMarker = path.join(
    path.dirname(require.resolve("next/package.json")),
    "dist",
    "compiled",
    "server-only",
    "empty.js",
  );
  const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  // O Next troca `server-only` pela variante vazia em código de servidor. O
  // runner standalone precisa da mesma resolução somente durante este import.
  nodeModule._resolveFilename = (request, parent, isMain, options) =>
    request === "server-only"
      ? serverOnlyMarker
      : Reflect.apply(originalResolveFilename, nodeModule, [request, parent, isMain, options]);
  process.env.NEXT_PUBLIC_SITE_URL = GIRUMO_EMAIL_QA_DATA.appUrl;

  try {
    const templates = require("../src/lib/email/templates.ts") as Partial<EmailTemplates>;
    if (typeof templates.welcomeEmail !== "function" || typeof templates.trialEndingEmail !== "function") {
      throw new TypeError("Os templates reais de welcome e trial-ending não foram exportados.");
    }
    return templates as EmailTemplates;
  } finally {
    nodeModule._resolveFilename = originalResolveFilename;
    if (previousSiteUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl;
    }
  }
}

const { welcomeEmail, trialEndingEmail } = loadRealEmailTemplates();

export function buildGirumoEmailFixtureFiles(): GirumoEmailFixtureFiles {
  return {
    "welcome.html": welcomeEmail(GIRUMO_EMAIL_QA_DATA.name, GIRUMO_EMAIL_QA_DATA.appUrl).html,
    "trial-ending.html": trialEndingEmail(
      GIRUMO_EMAIL_QA_DATA.name,
      GIRUMO_EMAIL_QA_DATA.appUrl,
      GIRUMO_EMAIL_QA_DATA.trialDaysLeft,
    ).html,
  };
}

export function renderGirumoEmailFixtures(): GirumoEmailFixtureResult {
  const directory = mkdtempSync(path.join(tmpdir(), "girumo-email-fixtures-"));
  const files = buildGirumoEmailFixtureFiles();
  const welcomePath = path.join(directory, "welcome.html");
  const trialEndingPath = path.join(directory, "trial-ending.html");

  writeFileSync(welcomePath, files["welcome.html"], { encoding: "utf8", flag: "wx" });
  writeFileSync(trialEndingPath, files["trial-ending.html"], { encoding: "utf8", flag: "wx" });

  return { directory, welcomePath, trialEndingPath };
}

export function isDirectExecution(moduleUrl: string, argvEntry = process.argv[1]): boolean {
  return typeof argvEntry === "string" && pathToFileURL(path.resolve(argvEntry)).href === moduleUrl;
}

if (isDirectExecution(import.meta.url)) {
  console.log(JSON.stringify(renderGirumoEmailFixtures()));
}
