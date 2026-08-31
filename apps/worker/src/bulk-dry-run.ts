/**
 * Modo DRY-RUN das ações em massa.
 *
 * Exercita o caminho inteiro — descobre tenants, claima de verdade (o job SAI da
 * fila e fica `running`), resolve a instância, assina a mídia — e para na porta
 * da Evolution.
 *
 * A parada vira `failed` com motivo explícito, e não silêncio: sem isso o job
 * ficaria pendurado em `running` até o `failStaleRunning` cinco minutos depois, e
 * quem estivesse olhando o progresso veria um lote travado sem explicação.
 *
 * Repare que aqui o dry-run é MAIS agressivo que o do envio, que deixa o comando
 * concluir. É a mesma escolha do auto-grow: sem operação real não há resultado
 * real, e marcar `done` gravaria em `groups.send_state` um estado que não
 * corresponde ao que o WhatsApp mostra — dado falso no painel é pior que job
 * falhado com motivo.
 */

import type { BulkDeps } from "./bulk-loop.js";
import { log } from "./log.js";

export const BULK_DRY_RUN_REASON =
  "DRY-RUN: ações em massa desligadas (WORKER_BULK_ENABLED != true)";

function recusar(acao: string, instanceName: string, groupJid: string): never {
  log.info(`DRY-RUN: ${acao}`, { instance_name: instanceName, group_jid: groupJid });
  throw new Error(BULK_DRY_RUN_REASON);
}

export function withBulkDryRun(deps: BulkDeps): BulkDeps {
  return {
    ...deps,
    setOpenToAll: async (instanceName, jid) => recusar("abriria o grupo", instanceName, jid),
    setAnnounceOnly: async (instanceName, jid) => recusar("fecharia o grupo", instanceName, jid),
    // O texto da descrição não vai para o log: é conteúdo do lojista, e o log do
    // worker não é lugar de conteúdo (mesma regra do dry-run de envio).
    setDescription: async (instanceName, jid) =>
      recusar("trocaria a descrição", instanceName, jid),
    setPicture: async (instanceName, jid) => recusar("trocaria a foto", instanceName, jid),
  };
}
