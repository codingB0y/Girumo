"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import type { RelampagoDaInicio } from "@/components/painel/home/types";
import { useOferta } from "@/components/painel/relampago/use-oferta";
import { NaSuaMao, Situacao, nomeDe } from "@/components/painel/relampago/vitrine/fila-vitrine";
import type { Group } from "@/lib/mock-data";
import {
  fraseDosGrupos,
  horarioComSegundos,
  motivoDoBotao,
  noArHa,
  ordinal,
  pecasRestantes,
  placarDaOferta,
  proximaDaFila,
} from "@/lib/painel/relampago";
import type { OfertaDaInicio } from "@/lib/stores/flash-offers";
import { cn } from "@/lib/utils";

const POLL_MS = 10_000;
const LINHAS_DA_FILA = 5;

type Props = {
  relampago: RelampagoDaInicio | null;
  /** Falso = a parte falhou: "Nenhuma relâmpago no ar" seria falso. */
  relampagoOk: boolean;
  grupos: Group[];
  agora: Date;
  /** Recarrega a página da Início (a oferta fechada sai das abertas). */
  onAtualizar: () => void;
  className?: string;
};

const linkDiscreto = "font-semibold text-cobalt-500 hover:underline";

/** "Relâmpago" da Início "Ao vivo" (spec 2026-10-02): a oferta no ar, a conversa na mão e a fila, sem sair da Início. */
export function RelampagoAoVivo({ relampago, relampagoOk, grupos, agora, onAtualizar, className }: Props) {
  const abertas = relampago?.abertas ?? [];
  const oferta = abertas[0] ?? null;
  const tituloId = useId();

  return (
    <section
      data-testid="inicio-relampago"
      aria-labelledby={tituloId}
      className={cn("min-w-0 rounded-[10px] border border-line-200 bg-paper-0", className)}
    >
      <div className="flex items-center gap-2 border-b border-line-200 px-5 py-3">
        <h2 id={tituloId} className="text-[16px] font-semibold text-volt-950">
          Relâmpago
        </h2>
        {oferta && <span className="pn-chip pn-chip--acid">AO VIVO</span>}
      </div>
      <div className="space-y-4 px-5 py-4">
        {!relampagoOk ? (
          <p className="text-13 text-slate-600">A relâmpago não carregou.</p>
        ) : oferta ? (
          <>
            <OfertaNoAr key={oferta.id} oferta={oferta} grupos={grupos} agoraDaPagina={agora} onAtualizar={onAtualizar} />
            {abertas.length > 1 && (
              <p className="text-13 text-slate-600">
                <Link href="/painel/relampago" className={linkDiscreto}>
                  +{abertas.length - 1} {abertas.length === 2 ? "outra" : "outras"} no ar
                </Link>
              </p>
            )}
          </>
        ) : (
          <Quieto doDia={relampago?.doDia ?? []} />
        )}
      </div>
    </section>
  );
}

function Quieto({ doDia }: { doDia: NonNullable<RelampagoDaInicio["doDia"]> }) {
  // doDia vem em ordem de abertura: a última fechada é a de baixo.
  const ultima = [...doDia].reverse().find((o) => o.status === "closed");
  return (
    <div>
      <p className="text-15 font-semibold text-volt-950">Nenhuma relâmpago no ar.</p>
      {ultima && <p className="mt-1 text-13 text-slate-600">Última hoje: {ultima.name}</p>}
      <Link href="/painel/relampago" className="mt-3 inline-flex h-10 items-center rounded-[var(--radius-control)] border border-line-200 px-4 text-[14px] font-medium text-volt-950">
        Abrir relâmpago
      </Link>
    </div>
  );
}

function Cabecalho({ oferta, grupos, noAr, placar }: { oferta: OfertaDaInicio; grupos: Group[]; noAr: string | null; placar?: { restantes: number; pecas: number } }) {
  const pecas = placar?.pecas ?? oferta.slots;
  const restantes = placar?.restantes ?? null;
  const pct = restantes != null && pecas > 0 ? Math.round((restantes / pecas) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <p className="truncate text-15 font-semibold text-volt-950">{oferta.name}</p>
      <p className="break-words text-13 text-slate-600">
        {fraseDosGrupos(oferta.groupIds, grupos)}
        {noAr && <> · no ar há <span className="font-data tabular-nums">{noAr}</span></>}
      </p>
      {restantes != null && (
        <>
          <span className="pn-lotacao block" role="progressbar" aria-label="Peças que restam" aria-valuemin={0} aria-valuemax={pecas} aria-valuenow={restantes}>
            <span className="pn-lotacao__cheio" style={{ width: `${pct}%` }} />
          </span>
          <p className="text-13 text-slate-600">
            <span className="font-semibold tabular-nums text-volt-950">{restantes} de {pecas} peças</span>
          </p>
        </>
      )}
    </div>
  );
}

function OfertaNoAr({ oferta, grupos, agoraDaPagina, onAtualizar }: { oferta: OfertaDaInicio; grupos: Group[]; agoraDaPagina: Date; onAtualizar: () => void }) {
  const { dados, erro, aviso, ocupado, agora, agir, pegarProxima, fechar } = useOferta(oferta.id, { pollMs: POLL_MS });
  const [confirmando, setConfirmando] = useState(false);
  const botaoFechar = useRef<HTMLButtonElement>(null);
  const motivoId = useId();

  // Sem leitura da fila ainda, o relógio da página basta para o "no ar há".
  const relogio = dados ? agora : agoraDaPagina;
  const noAr = noArHa(oferta.opened_at, relogio);

  if (!dados) {
    return (
      <>
        <Cabecalho oferta={oferta} grupos={grupos} noAr={noAr} />
        <p className="text-13 text-slate-600">{erro ? "A oferta não carregou." : "lendo a fila…"}</p>
      </>
    );
  }

  const { offer, queue, me } = dados;
  // Fechada aqui (ou por outra pessoa) entre duas recargas da página: sem botão que não faz mais nada.
  if (offer.status !== "open") {
    return (
      <>
        <Cabecalho oferta={oferta} grupos={grupos} noAr={null} />
        <p className="text-13 text-slate-600">
          Esta oferta foi fechada.{" "}
          <Link href={`/painel/relampago/${oferta.id}`} className={linkDiscreto}>
            Ver a fila
          </Link>
        </p>
      </>
    );
  }
  const pecas = pecasRestantes(offer, queue);
  const placar = placarDaOferta(queue);
  const proxima = proximaDaFila(queue);
  const minha = queue.find((e) => e.claim?.seller_user_id === me && !e.outcome) ?? null;
  const motivo = motivoDoBotao(offer, queue, !!minha);
  const proximas = queue
    .map((entrada, posicao) => ({ entrada, posicao }))
    .filter(({ entrada }) => !entrada.outcome)
    .slice(0, LINHAS_DA_FILA);

  return (
    <>
      <Cabecalho oferta={oferta} grupos={grupos} noAr={noAr} placar={pecas} />
      {erro && <p className="text-13 text-atencao">Não consegui atualizar agora.</p>}

      <dl className="grid grid-cols-4 gap-2">
        {(
          [
            ["Pediram", placar.pediram],
            ["Atendidas", placar.atendidas],
            ["Vendeu", placar.vendeu],
            ["Esperando", placar.esperando],
          ] as const
        ).map(([rotulo, valor]) => (
          // dt antes de dd (ordem do leitor de tela); o número aparece em cima.
          <div key={rotulo} className="flex min-w-0 flex-col-reverse">
            <dt className="text-12 text-slate-600">{rotulo}</dt>
            <dd className="text-[20px] font-semibold tabular-nums text-volt-950">{valor}</dd>
          </div>
        ))}
      </dl>

      {minha?.claim && (
        <NaSuaMao entrada={minha} claim={minha.claim} timerSeconds={offer.timer_seconds} agora={agora} ocupado={ocupado} aoAgir={agir} />
      )}

      <div className="space-y-1.5">
        <button
          type="button"
          onClick={() => void pegarProxima()}
          disabled={ocupado || motivo != null}
          aria-describedby={motivo ? motivoId : undefined}
          className="inline-flex min-h-11 w-full min-w-0 items-center justify-center rounded-[var(--radius-control)] bg-cobalt-500 px-4 text-[14px] font-semibold text-white disabled:opacity-50"
        >
          <span className="min-w-0 truncate">Pegar a próxima{proxima ? `: ${nomeDe(proxima)}` : ""}</span>
        </button>
        {motivo && <p id={motivoId} className="text-13 text-slate-600">{motivo}</p>}
        {aviso && <p role="status" className="text-13 text-atencao">{aviso}</p>}
      </div>

      <div className="space-y-2">
        <h3 className="text-13 font-semibold text-volt-950">Fila</h3>
        {proximas.length === 0 ? (
          <p className="text-13 text-slate-600">{queue.length === 0 ? "Ninguém comentou ainda." : "Todo mundo já foi atendido."}</p>
        ) : (
          <ol className="space-y-1.5">
            {proximas.map(({ entrada, posicao }) => (
              <li key={entrada.id} className="flex min-w-0 items-center gap-2 text-13 text-volt-950">
                <span className="font-data w-8 shrink-0 tabular-nums">{ordinal(posicao)}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{nomeDe(entrada)}</span>
                <span className="font-data shrink-0 tabular-nums text-slate-600">{horarioComSegundos(entrada.commented_at)}</span>
                <Situacao entrada={entrada} me={me} timerSeconds={offer.timer_seconds} agora={agora} />
              </li>
            ))}
          </ol>
        )}
        <Link href={`/painel/relampago/${oferta.id}`} className={cn("inline-block text-13", linkDiscreto)}>
          ver fila inteira
        </Link>
      </div>

      <div className="border-t border-line-200 pt-3">
        {confirmando ? (
          <div role="group" aria-label="Fechar a oferta" className="flex flex-wrap items-center gap-2">
            <span className="text-13 text-volt-950">Fechar a oferta agora?</span>
            <button
              type="button"
              disabled={ocupado}
              onClick={() =>
                void fechar().then((ok) => {
                  setConfirmando(false);
                  if (ok) onAtualizar();
                })
              }
              className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-saida px-4 text-[14px] font-semibold text-alerta disabled:opacity-50"
            >
              Fechar
            </button>
            <button
              type="button"
              autoFocus
              onClick={() => {
                setConfirmando(false);
                // O botão de fechar só volta ao DOM depois deste render.
                requestAnimationFrame(() => botaoFechar.current?.focus());
              }}
              className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-line-200 px-4 text-[14px] text-volt-950"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button ref={botaoFechar} type="button" onClick={() => setConfirmando(true)} className="inline-flex min-h-11 items-center text-13 text-slate-600 hover:underline">
            Fechar oferta
          </button>
        )}
      </div>
    </>
  );
}
