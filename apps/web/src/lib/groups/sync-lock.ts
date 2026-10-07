import { Redis } from "@upstash/redis";

/**
 * Um sync de grupos por número de cada vez.
 *
 * Cancelar o fetch do nosso lado NÃO para a Evolution: ela segue montando a
 * lista abandonada, e o próximo pedido entra na fila atrás dela. Em 06/10 o
 * auto-sync de /painel/conectar ainda rodava quando a lojista clicou em
 * "Sincronizar": o segundo pedido esperou o primeiro, estourou o tempo, e cada
 * clique a mais piorava a fila. Recusar o segundo na porta é o que quebra o
 * ciclo.
 *
 * É otimização, não segurança: sem Redis, ou com ele fora do ar, o sync segue
 * sem trava — o pior caso é o comportamento de antes.
 */

/** O mínimo do client do Upstash que a trava usa — deixa o teste rodar sem rede. */
export type LockStore = {
  set(key: string, value: string, opts: { nx: true; ex: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
};

/**
 * Maior que o `maxDuration` da rota (60s): quando a trava expira, a função que
 * a segurava já foi morta pela Vercel. Por isso basta um `del` simples na
 * liberação, sem conferir dono.
 */
const TRAVA_SEGUNDOS = 70;

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token, retry: { retries: 1 } }) : null;

const chave = (instanceId: string) => `groups-sync:${instanceId}`;

/** `true` = pode sincronizar; `false` = já há um sync deste número rodando. */
export function travarSync(instanceId: string): Promise<boolean> {
  return travarSyncWith(redis, instanceId);
}

export function liberarSync(instanceId: string): Promise<void> {
  return liberarSyncWith(redis, instanceId);
}

export async function travarSyncWith(store: LockStore | null, instanceId: string): Promise<boolean> {
  if (!store) return true;
  try {
    // `SET NX` devolve "OK" só para quem criou a chave.
    return (await store.set(chave(instanceId), "1", { nx: true, ex: TRAVA_SEGUNDOS })) === "OK";
  } catch (error) {
    console.warn("[groups/sync-lock] Redis indisponivel, seguindo sem trava:", error);
    return true;
  }
}

export async function liberarSyncWith(store: LockStore | null, instanceId: string): Promise<void> {
  if (!store) return;
  try {
    await store.del(chave(instanceId));
  } catch (error) {
    // A trava expira sozinha em TRAVA_SEGUNDOS; falhar aqui só atrasa o próximo.
    console.warn("[groups/sync-lock] nao consegui liberar a trava:", error);
  }
}
