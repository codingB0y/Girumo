import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Lê uma variável do `.env.local` do app.
 *
 * O Playwright roda FORA do Next, então não herda o `.env.local` que o dev
 * server carrega. Sem isto, assinar um cookie no teste usaria o default de
 * desenvolvimento do `resolveSecret` — assinatura que o servidor recusaria, e o
 * teste de fail-closed passaria a medir "assinatura inválida" achando que mede
 * "admin revogado". Dois motivos diferentes para a mesma recusa é exatamente o
 * tipo de teste que engana.
 *
 * Nunca imprime o valor: só diz se achou ou não.
 */
export function segredoDoEnvLocal(nome: string): string | null {
  const doProcesso = process.env[nome]?.trim();
  if (doProcesso) return doProcesso;

  try {
    const conteudo = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    for (const linha of conteudo.split(/\r?\n/)) {
      const limpa = linha.trim();
      if (!limpa || limpa.startsWith("#")) continue;
      const igual = limpa.indexOf("=");
      if (igual < 0) continue;
      if (limpa.slice(0, igual).trim() !== nome) continue;
      // Aspas são opcionais no formato dotenv; tira só o par externo.
      const bruto = limpa.slice(igual + 1).trim();
      const valor = bruto.replace(/^(['"])(.*)\1$/, "$2").trim();
      return valor || null;
    }
  } catch {
    return null;
  }
  return null;
}
