import "server-only";

import { abrir } from "@/lib/security/secret-box";

import type { ConexaoYampi } from "./tipos";

/**
 * Formato do que o lojista cola e o cofre da conexão. O alias vai na URL da API
 * (`https://api.dooki.com.br/v2/{alias}`): nada que vire caminho, consulta ou fragmento passa.
 */
const ALIAS = /^[A-Za-z0-9][A-Za-z0-9_-]{1,62}$/;
// ASCII imprimível sem espaço (0x21–0x7E), sem "@": o autofill do navegador cola e-mail no campo da senha.
const CREDENCIAL = /^[\x21-\x3F\x41-\x7E]{16,300}$/;

export function lerAlias(entrada: unknown): string | null {
  if (typeof entrada !== "string") return null;
  const alias = entrada.trim();
  return ALIAS.test(alias) ? alias : null;
}

export function lerCredencial(entrada: unknown): string | null {
  if (typeof entrada !== "string") return null;
  const valor = entrada.trim();
  return CREDENCIAL.test(valor) ? valor : null;
}

export type CampoSelado = "user_token" | "user_secret_key" | "webhook_secret";

/** AAD do secret-box: a cifra de uma loja, ou de outro campo, não abre no lugar desta. */
export function contextoDoSegredo(tenantId: string, campo: CampoSelado): string {
  return `yampi:${tenantId}:${campo}`;
}

export function abrirCredenciais(c: ConexaoYampi, chave: Buffer): { token: string; secretKey: string } {
  if (!c.userTokenSelado || !c.userSecretKeySelado) throw new Error("Yampi: conexão sem credencial");
  return {
    token: abrir(c.userTokenSelado, contextoDoSegredo(c.tenantId, "user_token"), chave),
    secretKey: abrir(c.userSecretKeySelado, contextoDoSegredo(c.tenantId, "user_secret_key"), chave),
  };
}

export function abrirSegredoDoAviso(c: ConexaoYampi, chave: Buffer): string {
  if (!c.webhookSecretSelado) throw new Error("Yampi: conexão sem segredo do aviso");
  return abrir(c.webhookSecretSelado, contextoDoSegredo(c.tenantId, "webhook_secret"), chave);
}
