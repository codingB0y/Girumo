import "server-only";

/**
 * API de Domínios da Vercel, só o que o domínio próprio usa.
 * Docs: vercel.com/docs/rest-api — projects/add-a-domain-to-a-project,
 * projects/verify-project-domain, domains/get-a-domain-s-configuration.
 */

const API = "https://api.vercel.com";
// Projeto `girumo` e o time dono dele (`.vercel/project.json`). Não são segredo e não mudam.
const PROJECT_ID = "prj_OqpJ680p1Q5LWE2cGjiOg1cnuJPq";
const TEAM_ID = "team_2H4HYmKVySM4jMf2MCOAdm3E";
const TIMEOUT_MS = 10_000;

export type VercelChallenge = { type: string; domain: string; value: string; reason: string };
export type ProjectDomain = { name: string; verified: boolean; verification: VercelChallenge[] };

export class VercelApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "VercelApiError";
  }
}

function token(): string | null {
  return process.env.VERCEL_API_TOKEN?.trim() || null;
}

/** Sem token o domínio próprio fica desligado — o painel nem mostra o cartão. */
export function vercelConfigured(): boolean {
  return token() !== null;
}

async function call(method: string, path: string, body?: unknown): Promise<Response> {
  const bearer = token();
  if (!bearer) throw new VercelApiError(0, "not_configured", "VERCEL_API_TOKEN ausente.");
  const url = `${API}${path}${path.includes("?") ? "&" : "?"}teamId=${TEAM_ID}`;
  return fetch(url, {
    method,
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
}

async function fail(res: Response): Promise<never> {
  const data = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  throw new VercelApiError(res.status, data?.error?.code ?? "unknown", data?.error?.message ?? `HTTP ${res.status}`);
}

function toProjectDomain(data: { name: string; verified?: boolean; verification?: VercelChallenge[] }): ProjectDomain {
  return { name: data.name, verified: data.verified === true, verification: data.verification ?? [] };
}

function domainPath(name: string): string {
  return `/v9/projects/${PROJECT_ID}/domains/${encodeURIComponent(name)}`;
}

export async function getProjectDomain(name: string): Promise<ProjectDomain | null> {
  const res = await call("GET", domainPath(name));
  if (res.status === 404) return null;
  if (!res.ok) return fail(res);
  return toProjectDomain(await res.json());
}

export async function addProjectDomain(name: string): Promise<ProjectDomain> {
  const res = await call("POST", `/v10/projects/${PROJECT_ID}/domains`, { name });
  if (!res.ok) return fail(res);
  return toProjectDomain(await res.json());
}

export async function verifyProjectDomain(name: string): Promise<ProjectDomain> {
  const res = await call("POST", `${domainPath(name)}/verify`);
  if (res.ok) return toProjectDomain(await res.json());
  // 400 = desafio ainda não cumprido. Os desafios só vêm no GET do domínio.
  if (res.status === 400) {
    const atual = await getProjectDomain(name);
    if (atual) return atual;
  }
  return fail(res);
}

/** `true` enquanto o DNS não aponta para a Vercel (ou ela ainda não consegue emitir o certificado). */
export async function isDomainMisconfigured(name: string): Promise<boolean> {
  const res = await call("GET", `/v6/domains/${encodeURIComponent(name)}/config?projectIdOrName=${PROJECT_ID}`);
  if (!res.ok) return fail(res);
  const data = (await res.json()) as { misconfigured?: boolean };
  return data.misconfigured !== false;
}

export async function removeProjectDomain(name: string): Promise<void> {
  const res = await call("DELETE", domainPath(name));
  if (res.ok || res.status === 404) return;
  return fail(res);
}
