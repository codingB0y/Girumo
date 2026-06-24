import "server-only";
import { promises as fs } from "fs";
import path from "path";

/**
 * Escrita ATÔMICA: grava num arquivo temporário e faz rename (operação atômica
 * no SO). Evita arquivo truncado/corrompido se o processo morrer no meio da
 * escrita ou se duas escritas se cruzarem. Substitui fs.writeFile direto.
 */
export async function writeFileAtomic(filePath: string, data: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, filePath);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

// Mutex serial por chave (caminho do arquivo). Garante que um read-modify-write
// não se cruze com outro NA MESMA INSTÂNCIA do servidor Next — fonte real de
// corrupção quando engine (polling) e navegador batem juntos. Encadeia promessas.
const chains = new Map<string, Promise<unknown>>();

/**
 * Serializa operações sobre uma mesma chave (arquivo). Use para envolver todo
 * o ciclo ler→alterar→gravar de um store, garantindo atomicidade lógica.
 */
export function withFileLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(key) ?? Promise.resolve();
  // Encadeia independentemente de sucesso/erro do anterior (não trava a fila).
  const run = prev.then(fn, fn);
  // Mantém a cadeia viva mas sem vazar rejeições não tratadas.
  chains.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}
