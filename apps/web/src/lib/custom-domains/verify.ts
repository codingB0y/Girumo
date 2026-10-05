import "server-only";
import { resolveTxt } from "node:dns/promises";
import { dnsRecordsFor, type DnsRecord } from "./hostname";
import {
  VercelApiError,
  addProjectDomain,
  getProjectDomain,
  isDomainMisconfigured,
  verifyProjectDomain,
} from "./vercel";

export type VerifyProblem = "txt" | "em-uso" | "vercel-verificacao" | "dns" | "vercel-erro";

export type VerifyOutcome =
  | { active: true }
  | { active: false; problem: VerifyProblem; challenges: DnsRecord[] };

export type VerifyDeps = {
  txtRecords: (name: string) => Promise<string[]>;
  getProjectDomain: typeof getProjectDomain;
  addProjectDomain: typeof addProjectDomain;
  verifyProjectDomain: typeof verifyProjectDomain;
  isDomainMisconfigured: typeof isDomainMisconfigured;
};

async function txtRecords(name: string): Promise<string[]> {
  try {
    // Um TXT longo chega em pedaços de até 255 bytes; o valor é a junção.
    return (await resolveTxt(name)).map((pedacos) => pedacos.join(""));
  } catch {
    // ENOTFOUND/ENODATA (ainda não criado) e timeout de DNS dão no mesmo para
    // o lojista: "ainda não achamos o registro".
    return [];
  }
}

const defaultDeps: VerifyDeps = {
  txtRecords,
  getProjectDomain,
  addProjectDomain,
  verifyProjectDomain,
  isDomainMisconfigured,
};

function pending(problem: VerifyProblem, challenges: DnsRecord[] = []): VerifyOutcome {
  return { active: false, problem, challenges };
}

/**
 * Leva um domínio pendente até ativo, parando no primeiro problema.
 *
 * A prova de posse vem ANTES de qualquer chamada à Vercel: sem ela, um tenant
 * que cadastrasse o subdomínio de outra loja (com o CNAME esquecido apontando
 * para a Vercel) assumiria o endereço — e o projeto viraria depósito de
 * domínio alheio.
 */
export async function verifyCustomDomain(
  hostname: string,
  token: string,
  deps: VerifyDeps = defaultDeps,
): Promise<VerifyOutcome> {
  const { txt } = dnsRecordsFor(hostname, token);
  if (!(await deps.txtRecords(txt.nome)).includes(txt.valor)) return pending("txt");

  try {
    let domain = (await deps.getProjectDomain(hostname)) ?? (await deps.addProjectDomain(hostname));
    if (!domain.verified) domain = await deps.verifyProjectDomain(hostname);
    if (!domain.verified) {
      // Raro: a raiz do domínio mora em outra conta Vercel e ela pede o desafio dela.
      return pending(
        "vercel-verificacao",
        domain.verification.map((c) => ({ tipo: "TXT" as const, nome: c.domain, valor: c.value })),
      );
    }
    if (await deps.isDomainMisconfigured(hostname)) return pending("dns");
    return { active: true };
  } catch (err) {
    // 409 = o host está preso a outro projeto Vercel (o site da loja, por exemplo).
    if (err instanceof VercelApiError && err.status === 409) return pending("em-uso");
    console.error(`[custom-domains] verificação de ${hostname}:`, err);
    return pending("vercel-erro");
  }
}
