/**
 * Modo DRY-RUN do loop de auto-grow.
 *
 * Exercita o caminho inteiro até a porta da Evolution — descobre os tenants,
 * chama `/api/groups/grow/pending` (que roda o gate `evaluateAutoGrow` de
 * verdade), resolve a instância — e para exatamente antes de criar o grupo.
 *
 * ── Por que este dry-run PARA, e o do envio CONTINUA ──────────────────────
 * `send-dry-run.ts` deixa o comando ser concluído de propósito: devolvê-lo à
 * fila faria a fila crescer e guardar a rajada que se quer evitar. Aqui o
 * raciocínio se inverte, por duas razões:
 *
 * 1. Não há rajada a acumular. O gate do app só mantém UM job em voo por
 *    campanha, então a fila não incha enquanto o dry-run roda.
 * 2. Seguir adiante seria pior que inútil: sem grupo real não há JID nem
 *    convite, e um ack `created` gravaria no pool uma linha com `invite_url`
 *    inventada. O /r/<campanha> passaria a rotear cliente para um link que não
 *    existe — dado falso no painel, que este projeto já teve uma vez e não
 *    quer de volta.
 *
 * A parada vira um `failed` com motivo explícito, então o job volta à fila e o
 * lojista (ou você, no painel) vê por que ele não andou em vez de vê-lo sumir.
 */

import { EvolutionGroupError } from "./evolution-groups.js";
import type { GrowDeps } from "./grow-loop.js";
import { log } from "./log.js";

export const DRY_RUN_REASON = "DRY-RUN: criação de grupo desligada (WORKER_GROW_ENABLED != true)";

/** Deps que fazem tudo menos criar o grupo de verdade. */
export function withGrowDryRun(deps: GrowDeps): GrowDeps {
  return {
    ...deps,

    async createGroup(instanceName, subject) {
      log.info("DRY-RUN: criaria grupo", { instance_name: instanceName, subject });
      // Status 0 = "não chegou na Evolution", que é literalmente o caso.
      throw new EvolutionGroupError(0, "group/create", DRY_RUN_REASON);
    },
  };
}
