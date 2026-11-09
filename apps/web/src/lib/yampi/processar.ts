import "server-only";

import { lerConexaoYampiPorId } from "@/lib/stores/yampi-conexoes";
import { lerEventoYampi, marcarEventoComErro, marcarEventoProcessado } from "@/lib/stores/yampi-eventos";

import { CONSUMIDORES, type ConsumidorDeEvento } from "./consumidores";
import { lerEnvelope } from "./envelope";

export type DepsDoProcessador = {
  lerEvento: typeof lerEventoYampi;
  lerConexao: typeof lerConexaoYampiPorId;
  marcarProcessado: typeof marcarEventoProcessado;
  marcarErro: typeof marcarEventoComErro;
  consumidores: readonly ConsumidorDeEvento[];
};

function depsDeProducao(): DepsDoProcessador {
  return {
    lerEvento: lerEventoYampi,
    lerConexao: lerConexaoYampiPorId,
    marcarProcessado: marcarEventoProcessado,
    marcarErro: marcarEventoComErro,
    consumidores: CONSUMIDORES,
  };
}

const mensagemDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Entrega um aviso guardado aos módulos ligados (spec, "Aviso da Yampi"). Roda no `after()` da rota e no cron.
 * Só marca processado depois de TODOS: um consumidor que falha deixa o evento para o cron, com o erro na coluna.
 * O log leva só o id do evento e os nomes; a mensagem (que pode citar dado do pedido) fica na coluna.
 */
export async function processarEventoYampi(eventoId: string, deps: DepsDoProcessador = depsDeProducao()): Promise<void> {
  const evento = await deps.lerEvento(eventoId);
  if (!evento || evento.processedAt) return;
  const conexao = await deps.lerConexao(evento.connectionId);
  if (!conexao || conexao.status === "desconectada" || conexao.tenantId !== evento.tenantId) {
    await deps.marcarProcessado(evento.tenantId, evento.id, "conexão ausente, desconectada ou de outra loja");
    return;
  }
  const lido = lerEnvelope(evento.payload);
  // O aviso foi validado ao entrar: repetir não conserta.
  if (!lido.ok) {
    await deps.marcarProcessado(evento.tenantId, evento.id, "envelope inválido");
    return;
  }
  const { envelope } = lido;
  const interessados = deps.consumidores.filter((c) => c.eventos.includes(envelope.evento));
  const resultados = await Promise.allSettled(
    interessados.map(async (c) => {
      if (!(await c.ligado(evento.tenantId))) return;
      await c.consumir({
        eventoId: evento.id,
        tenantId: evento.tenantId,
        conexao,
        evento: envelope.evento,
        time: envelope.time,
        recurso: envelope.recurso,
        payload: evento.payload,
      });
    }),
  );
  const falhas = resultados.flatMap((r, i) => (r.status === "rejected" ? [{ nome: interessados[i].nome, erro: r.reason }] : []));
  if (falhas.length === 0) {
    await deps.marcarProcessado(evento.tenantId, evento.id);
    return;
  }
  await deps.marcarErro(evento.tenantId, evento.id, falhas.map((f) => `${f.nome}: ${mensagemDe(f.erro)}`).join("; "));
  console.error(`[yampi] evento ${evento.id}: falharam ${falhas.map((f) => f.nome).join(", ")}`);
  throw new Error(`yampi evento ${evento.id}: ${falhas.length} consumidor(es) falharam`);
}
