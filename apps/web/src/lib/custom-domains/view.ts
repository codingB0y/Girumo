/**
 * O que o painel recebe e mostra sobre o domínio próprio. Sem `server-only`:
 * o cartão de Configurações e o hook dos links importam daqui — por isso os
 * imports do store e da verificação são SÓ de tipo.
 */
import type { CustomDomain } from "@/lib/stores/custom-domains";
import { dnsRecordsFor, type DnsRecord } from "./hostname";
import type { VerifyProblem } from "./verify";

export type DominioView = {
  hostname: string;
  status: "pending" | "active";
  problema: string | null;
  verificadoEm: string | null;
  registros: DnsRecord[];
};

export function toDominioView(domain: CustomDomain): DominioView {
  const { cname, txt } = dnsRecordsFor(domain.hostname, domain.verificationToken);
  return {
    hostname: domain.hostname,
    status: domain.status,
    problema: domain.lastError,
    verificadoEm: domain.verifiedAt,
    registros: [cname, txt],
  };
}

const PROBLEMAS: Record<VerifyProblem, string> = {
  txt: "Ainda não encontramos o registro TXT. Depois de criar, ele pode levar até 1 hora para aparecer.",
  dns: "O registro CNAME ainda não aponta para o Girumo. Confira o valor e, se usa Cloudflare, deixe a nuvem cinza (somente DNS).",
  "em-uso": "Este endereço está ligado a outro site ou conta. Use outro subdomínio ou fale com o suporte.",
  "vercel-verificacao": "O provedor pediu uma confirmação extra. Clique em Verificar agora para ver o registro que falta.",
  "vercel-erro": "Não conseguimos verificar agora. Tente de novo em alguns minutos.",
};

/** Frase para o lojista; `null` sem problema ou com código que não conhecemos. */
export function textoDoProblema(problema: string | null): string | null {
  // hasOwnProperty, não `in`: "toString" está em todo objeto.
  if (!problema || !Object.prototype.hasOwnProperty.call(PROBLEMAS, problema)) return null;
  return PROBLEMAS[problema as VerifyProblem];
}

/** `https://<host>` quando a resposta de `/api/dominio` traz domínio ATIVO; senão `null`. */
export function customLinkOrigin(body: unknown): string | null {
  const dominio = (body as { dominio?: Partial<DominioView> | null } | null)?.dominio;
  return dominio?.status === "active" && typeof dominio.hostname === "string" ? `https://${dominio.hostname}` : null;
}
