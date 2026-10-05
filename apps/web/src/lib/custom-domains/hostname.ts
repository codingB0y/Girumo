/**
 * O endereço que o lojista digita e os registros DNS que ele cria. Puro: roda
 * no servidor, no painel e no teste.
 */
import { isFirstPartyHost } from "./host";

export const CNAME_TARGET = "cname.vercel-dns.com";

export type DnsRecord = { tipo: "CNAME" | "TXT"; nome: string; valor: string };

/** Os dois registros que ativam o domínio: o apontamento e a prova de posse. */
export function dnsRecordsFor(hostname: string, token: string): { cname: DnsRecord; txt: DnsRecord } {
  return {
    cname: { tipo: "CNAME", nome: hostname, valor: CNAME_TARGET },
    txt: { tipo: "TXT", nome: `_girumo-verify.${hostname}`, valor: `girumo-verify=${token}` },
  };
}

export type HostnameCheck = { ok: true; hostname: string } | { ok: false; error: string };

// Sem lookbehind: este módulo entra no bundle do cliente (via view.ts) e o
// Safari < 16.4 não parseia `(?<!`, derrubando o chunk inteiro.
const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TLD_RE = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

/**
 * Segundo nível público de ccTLD (`com.br`, `co.uk`): `sualoja.com.br` é raiz,
 * não subdomínio. ponytail: lista curta à mão em vez da Public Suffix List —
 * raiz que escapar daqui cai no "CNAME não aponta" da Vercel, que tem o mesmo
 * conserto (usar um subdomínio).
 */
const SECOND_LEVEL = new Set(["com", "net", "org", "edu", "gov", "co"]);

const PEDE_SUBDOMINIO =
  "Use um subdomínio, como links.sualoja.com.br — o endereço principal continua com o site da loja.";

/** Aceita a URL colada da barra do navegador: tira esquema, caminho, porta e o ponto final. */
function limpar(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .split(/[/?#]/, 1)[0]
    .split(":", 1)[0]
    .replace(/\.$/, "");
}

export function normalizeHostname(input: string): HostnameCheck {
  const host = limpar(input);
  if (!host) return { ok: false, error: "Digite o endereço, por exemplo links.sualoja.com.br." };

  const labels = host.split(".");
  const tld = labels[labels.length - 1];
  if (host.length > 253 || !labels.every((l) => LABEL_RE.test(l)) || !TLD_RE.test(tld)) {
    return { ok: false, error: "Endereço inválido. Use só letras, números, hífen e ponto." };
  }
  if (isFirstPartyHost(host)) {
    return { ok: false, error: "Esse endereço é do Girumo. Use um domínio da sua loja." };
  }

  const ccSecondLevel = labels.length >= 3 && tld.length === 2 && SECOND_LEVEL.has(labels[labels.length - 2]);
  if (labels.length < (ccSecondLevel ? 4 : 3)) return { ok: false, error: PEDE_SUBDOMINIO };

  return { ok: true, hostname: host };
}
