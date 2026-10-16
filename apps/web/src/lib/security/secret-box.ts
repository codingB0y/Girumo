import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Cofre dos segredos de integração (tokens do Bling no banco): AES-256-GCM.
 *
 * GCM cifra E autentica: cifra adulterada, chave errada ou contexto trocado dão erro,
 * nunca um token de lixo que só ia falhar lá no Bling. O `contexto` entra como AAD
 * (autenticado, não cifrado): o refresh da loja A, selado com `bling:A:refresh`, não abre
 * como token da loja B nem como access token — copiar a cifra de uma linha para outra no
 * banco vira erro, não troca de identidade.
 *
 * Mensagem de erro é sempre uma frase fixa: nunca leva texto aberto nem pedaço de chave.
 */

const VERSAO = "v1";
const BYTES_CHAVE = 32;
/** 12 bytes é o IV que o GCM usa direto; outro tamanho passa por GHASH e o Node aceita calado. */
const BYTES_IV = 12;
/** Tag inteira: o Node aceita tag de até 4 bytes se ninguém conferir o tamanho. */
const BYTES_TAG = 16;

/** INTEGRATIONS_ENCRYPTION_KEY = base64 de exatamente 32 bytes. null = ausente ou inválida. */
export function chaveDeIntegracoes(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const texto = env.INTEGRATIONS_ENCRYPTION_KEY?.trim() ?? "";
  const chave = Buffer.from(texto, "base64");
  // O decodificador do Node pula caractere inválido em silêncio: só a volta prova que era base64.
  const canonica = chave.toString("base64").replace(/=+$/, "") === texto.replace(/=+$/, "");
  return chave.length === BYTES_CHAVE && canonica ? chave : null;
}

/**
 * Impressão da chave: os 16 primeiros caracteres do sha256 dela, em hex. Gravada junto dos segredos,
 * diz se a chave que os selou é a de agora (chave trocada ≠ segredo estragado) sem revelar a chave.
 */
export function impressaoDaChave(chave: Buffer): string {
  return createHash("sha256").update(chave).digest("hex").slice(0, 16);
}

/** AES-256-GCM, IV aleatório de 12 bytes; `contexto` vira AAD (ex.: `bling:<tenant>:refresh`). */
export function selar(texto: string, contexto: string, chave: Buffer): string {
  exigirChave(chave);
  const iv = randomBytes(BYTES_IV);
  const cifrador = createCipheriv("aes-256-gcm", chave, iv, { authTagLength: BYTES_TAG });
  cifrador.setAAD(Buffer.from(contexto, "utf8"));
  const cifra = Buffer.concat([cifrador.update(texto, "utf8"), cifrador.final()]);
  return [VERSAO, iv.toString("base64url"), cifrador.getAuthTag().toString("base64url"), cifra.toString("base64url")].join(".");
}

/** Lança Error("secret-box: …") para formato inválido, versão desconhecida, adulteração, chave ou contexto errados. */
export function abrir(selado: string, contexto: string, chave: Buffer): string {
  exigirChave(chave);
  const partes = selado.split(".");
  if (partes.length !== 4) throw new Error("secret-box: formato inválido");
  const [versao, ivTexto, tagTexto, cifraTexto] = partes;
  if (versao !== VERSAO) throw new Error("secret-box: versão desconhecida");
  const iv = decodificar(ivTexto);
  const tag = decodificar(tagTexto);
  const cifra = decodificar(cifraTexto);
  if (iv.length !== BYTES_IV || tag.length !== BYTES_TAG) throw new Error("secret-box: formato inválido");
  try {
    const decifrador = createDecipheriv("aes-256-gcm", chave, iv, { authTagLength: BYTES_TAG });
    decifrador.setAAD(Buffer.from(contexto, "utf8"));
    decifrador.setAuthTag(tag);
    return Buffer.concat([decifrador.update(cifra), decifrador.final()]).toString("utf8");
  } catch {
    // O erro do Node ("unable to authenticate data") não ajuda e não deve ir para log.
    throw new Error("secret-box: não abriu (cifra adulterada, chave ou contexto errados)");
  }
}

function exigirChave(chave: Buffer): void {
  if (chave.length !== BYTES_CHAVE) throw new Error("secret-box: chave inválida");
}

/**
 * base64url canônico ou nada. Sem a volta, um caractere trocado nos bits de sobra do fim
 * (ou um "=" a mais) decodificaria para os mesmos bytes e a adulteração passaria.
 */
function decodificar(parte: string): Buffer {
  const bytes = Buffer.from(parte, "base64url");
  if (bytes.toString("base64url") !== parte) throw new Error("secret-box: formato inválido");
  return bytes;
}
