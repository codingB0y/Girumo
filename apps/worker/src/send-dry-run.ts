/**
 * Modo DRY-RUN do loop de envio (F4).
 *
 * Envolve as `SendDeps` reais e troca SÓ as três chamadas HTTP à Evolution por um
 * log. Todo o resto do caminho continua real: o claim já passou pelo gate anti-ban
 * (`claim_send_commands`), a instância é resolvida, a mídia é assinada, o payload é
 * montado, `record_send` conta a janela e `complete_engine_command` fecha o comando.
 *
 * Duas decisões que parecem detalhe e não são:
 *
 * 1. `record_send` CONTINUA sendo chamado. O ritmo observado no dry-run é o ritmo
 *    real, e o dia em que o envio for ligado não encontra a cota inteira intacta —
 *    que é justamente como um fan-out vira rajada. O custo é histórico de anti-ban
 *    contando envios que não saíram: erra para o lado conservador, nunca para o de
 *    enviar demais.
 *
 * 2. O comando é CONCLUÍDO, não devolvido à fila. Devolver faria a fila só crescer
 *    enquanto o dry-run roda, guardando exatamente a rajada que se quer evitar.
 *
 * Sobre o que entra no log: `log.ts` proíbe PII. JID de grupo é id e pode ir; um
 * destino que não termine em `@g.us` é pessoa e vai mascarado. Isso também serve de
 * alarme — o executor promete só grupo, então `<nao-grupo>` no dry-run é violação
 * anti-DM aparecendo antes de virar mensagem. Texto nunca é logado, só o tamanho.
 */

import { log } from "./log.js";
import type { SendDeps } from "./send-command.js";

const GROUP_SUFFIX = "@g.us";

function safeDestination(number: string): string {
  return number.endsWith(GROUP_SUFFIX) ? number : "<nao-grupo>";
}

/** Deps que fazem tudo menos falar com a Evolution. */
export function withDryRun(deps: SendDeps): SendDeps {
  return {
    ...deps,

    async sendText(instanceName, number, text, opts) {
      log.info("DRY-RUN: enviaria texto", {
        instance_name: instanceName,
        destino: safeDestination(number),
        chars: text.length,
        mention_all: opts?.mentionAll === true,
      });
    },

    async sendMedia(instanceName, number, input) {
      log.info("DRY-RUN: enviaria midia", {
        instance_name: instanceName,
        destino: safeDestination(number),
        mediatype: input.mediatype,
        tem_caption: typeof input.caption === "string" && input.caption.length > 0,
        mention_all: input.mentionAll === true,
      });
    },

    async sendPoll(instanceName, number, input) {
      log.info("DRY-RUN: enviaria enquete", {
        instance_name: instanceName,
        destino: safeDestination(number),
        opcoes: input.options.length,
      });
    },
  };
}
