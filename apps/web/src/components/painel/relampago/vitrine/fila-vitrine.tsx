"use client";

import Link from "next/link";
import { ArrowLeft, Check, MessageCircle, Phone, UserX } from "lucide-react";

import { cn } from "@/lib/utils";
import { claimState, deadlineOf, type ClaimState } from "@/lib/relampago/claim-state";
import { etiquetaDaOferta, horarioComSegundos, noArHa, ordinal, relogio, resumoDaOferta } from "@/lib/painel/relampago";

export type FilaOferta = {
  id: string;
  name: string;
  keyword: string;
  slots: number;
  timer_seconds: number | null;
  status: "draft" | "open" | "closed";
  opened_at?: string | null;
};

export type FilaClaim = {
  id: string;
  seller_user_id: string;
  claimed_at: string;
  contacted_at: string | null;
};

export type FilaEntrada = {
  id: string;
  participant_jid: string;
  phone: string | null;
  push_name: string | null;
  message_text: string;
  commented_at: string;
  outcome: "sold" | "dropped" | null;
  claim: FilaClaim | null;
};

type Props = {
  oferta: FilaOferta;
  fila: readonly FilaEntrada[];
  me: string;
  /** Relógio já corrigido pela deriva do servidor, medido por quem chama. */
  agora: Date;
  ocupado: boolean;
  aviso: string | null;
  aoPegarProxima: () => void;
  aoAgir: (claimId: string, acao: "contacted" | "sold" | "dropped") => Promise<void>;
  aoFechar: () => void;
};

const RESTANTE: Record<ClaimState, string> = {
  reservada: "para chamar",
  em_conversa: "para responder",
  expirada_vendedora: "prazo de chamar vencido",
  expirada_cliente: "sem resposta",
};

function nomeDe(e: FilaEntrada): string {
  return e.push_name?.trim() || "sem nome";
}

/**
 * A oferta ao vivo (cena 5 da seção 11): etiqueta com o chip Acid AO VIVO, a
 * palavra-chave em Mono dentro de uma caixinha Canvas e a fila crescendo por
 * baixo, com a posição ordinal e o horário até o segundo — é o segundo que
 * separa a 1ª da 2ª quando duas comentam no mesmo minuto.
 */
export function FilaVitrine({
  oferta,
  fila,
  me,
  agora,
  ocupado,
  aviso,
  aoPegarProxima,
  aoAgir,
  aoFechar,
}: Props) {
  const noAr = oferta.status === "open";
  const tempo = noAr ? noArHa(oferta.opened_at, agora) : null;
  const resumo = resumoDaOferta(oferta, fila);
  const minha = fila.find((e) => e.claim?.seller_user_id === me && !e.outcome) ?? null;

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 px-4 py-6 sm:px-8 lg:py-8">
      <Link href="/painel/relampago" className="inline-flex min-h-11 items-center gap-1.5 text-13 text-slate-600">
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        Ofertas
      </Link>

      <section className={cn("pn-etiqueta-preco", !noAr && "pn-etiqueta-preco--fechada")}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={noAr ? "pn-chip pn-chip--acid" : "pn-chip pn-chip--line"} data-testid="relampago-estado">
            {noAr ? "AO VIVO" : oferta.status === "closed" ? "FECHADA" : "RASCUNHO"}
          </span>
          {tempo && (
            <span className="font-data text-12 tabular-nums text-slate-600" data-testid="relampago-no-ar">
              no ar há {tempo}
            </span>
          )}
        </div>

        <h1 className="pn-etiqueta-preco__nome mt-2">{etiquetaDaOferta(oferta.name, oferta.slots)}</h1>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-13 text-slate-600">Quem comentar</span>
          <code className="font-data rounded-[var(--radius-control)] border border-line-200 bg-canvas-100 px-3 py-1.5 text-15 text-volt-950">
            {oferta.keyword}
          </code>
          <span className="font-data text-13 tabular-nums text-slate-600">
            {resumo.vendidas} vendida{resumo.vendidas === 1 ? "" : "s"} · {resumo.livres} livre
            {resumo.livres === 1 ? "" : "s"}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={aoPegarProxima}
            disabled={ocupado || resumo.livres <= 0 || !noAr || !!minha}
            className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-control)] bg-cobalt-500 px-4 text-[14px] font-semibold text-white disabled:opacity-50"
          >
            Pegar próxima
          </button>
          {noAr && (
            <button
              type="button"
              onClick={aoFechar}
              disabled={ocupado}
              className="inline-flex h-11 items-center rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-4 text-[14px] text-volt-950 disabled:opacity-50"
            >
              Fechar oferta
            </button>
          )}
        </div>
        {aviso && <p className="mt-2 text-13 text-atencao">{aviso}</p>}
      </section>

      {minha?.claim && (
        <NaSuaMao
          entrada={minha}
          claim={minha.claim}
          timerSeconds={oferta.timer_seconds}
          agora={agora}
          ocupado={ocupado}
          aoAgir={aoAgir}
        />
      )}

      <section className="pn-card rounded-[var(--radius-control)] p-4 sm:p-5">
        <h2 className="font-data text-12 uppercase tracking-[0.06em] text-slate-600">
          Fila · {resumo.naFila} {resumo.naFila === 1 ? "pessoa" : "pessoas"}
        </h2>
        {fila.length === 0 ? (
          <p className="mt-3 text-15 text-volt-950">
            Ninguém comentou ainda.{" "}
            <span className="text-slate-600">
              Poste a promoção no grupo pedindo <span className="font-data text-volt-950">{oferta.keyword}</span>.
            </span>
          </p>
        ) : (
          <ul className="mt-1">
            {fila.map((e, i) => {
              // A linha do estoque ANDA: cada venda fechada puxa uma da espera.
              const naEspera = i >= oferta.slots - resumo.vendidas;
              const primeiraDaEspera = naEspera && i === oferta.slots - resumo.vendidas;
              return (
                <li key={e.id}>
                  {primeiraDaEspera && (
                    <p className="font-data mt-2 border-t border-dashed border-line-200 pt-2 text-12 uppercase tracking-[0.06em] text-slate-600">
                      Daqui para baixo é espera — entra quando uma venda fechar
                    </p>
                  )}
                  <div className={cn("pn-ficha", naEspera && "opacity-60")} data-testid="relampago-linha-fila">
                    <span className="font-data w-9 shrink-0 text-15 tabular-nums text-volt-950">{ordinal(i)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-15 font-semibold text-volt-950">{nomeDe(e)}</span>
                      <span className="font-data block text-12 tabular-nums text-slate-600">
                        {horarioComSegundos(e.commented_at)}
                        {!e.phone && <span className="ml-2 text-atencao">telefone não identificado</span>}
                      </span>
                    </span>
                    <Situacao entrada={e} me={me} timerSeconds={oferta.timer_seconds} agora={agora} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Situacao({
  entrada,
  me,
  timerSeconds,
  agora,
}: {
  entrada: FilaEntrada;
  me: string;
  timerSeconds: number | null;
  agora: Date;
}) {
  if (entrada.outcome === "sold") return <span className="pn-chip">Vendida</span>;
  if (entrada.outcome === "dropped") return <span className="pn-chip pn-chip--line">Não respondeu</span>;
  // Sem reserva e sem desfecho, a posicao ordinal ja diz tudo: um "Na fila"
  // repetido em toda linha vira ruido e some com o que importa.
  if (!entrada.claim) return null;

  const estado = claimState(
    {
      claimedAt: new Date(entrada.claim.claimed_at),
      contactedAt: entrada.claim.contacted_at ? new Date(entrada.claim.contacted_at) : null,
    },
    timerSeconds,
    agora,
  );
  const quem = entrada.claim.seller_user_id === me ? "você" : "outra vendedora";

  if (estado === "em_conversa") return <span className="pn-chip">Em conversa · {quem}</span>;
  if (estado === "reservada") return <span className="pn-chip">Reservada · {quem}</span>;
  return <span className="pn-chip pn-chip--line">{RESTANTE[estado]}</span>;
}

function NaSuaMao({
  entrada,
  claim,
  timerSeconds,
  agora,
  ocupado,
  aoAgir,
}: {
  entrada: FilaEntrada;
  claim: FilaClaim;
  timerSeconds: number | null;
  agora: Date;
  ocupado: boolean;
  aoAgir: (claimId: string, acao: "contacted" | "sold" | "dropped") => Promise<void>;
}) {
  const like = {
    claimedAt: new Date(claim.claimed_at),
    contactedAt: claim.contacted_at ? new Date(claim.contacted_at) : null,
  };
  const estado = claimState(like, timerSeconds, agora);
  const prazo = deadlineOf(like, timerSeconds);
  const restam = prazo ? (prazo.getTime() - agora.getTime()) / 1000 : null;
  const texto = encodeURIComponent(
    `Oi ${nomeDe(entrada)}! Vi seu "${entrada.message_text}" no grupo — separei pra você.`,
  );

  return (
    <section className="pn-card rounded-[var(--radius-control)] p-4 sm:p-5" data-testid="relampago-na-sua-mao">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-data text-12 uppercase tracking-[0.06em] text-slate-600">Na sua mão agora</p>
          <p className="font-brand mt-1 text-[22px] font-bold text-volt-950">{nomeDe(entrada)}</p>
          <p className="mt-1 text-13 text-slate-600">
            &ldquo;{entrada.message_text}&rdquo; · {horarioComSegundos(entrada.commented_at)}
          </p>
          <p className="font-data mt-1 text-13 tabular-nums">
            {entrada.phone ? (
              <span className="text-volt-950">{entrada.phone}</span>
            ) : (
              // Nunca um número inventado. ~1 em 7 cai aqui.
              <span className="text-atencao">telefone não identificado</span>
            )}
          </p>
        </div>
        {restam != null && (
          <p className="text-right">
            <span
              className={cn(
                "font-data block text-[28px] font-bold tabular-nums",
                restam <= 0 ? "text-alerta" : "text-volt-950",
              )}
            >
              {relogio(restam)}
            </span>
            <span className="text-12 text-slate-600">{RESTANTE[estado]}</span>
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {claim.contacted_at == null &&
          (entrada.phone ? (
            <a
              href={`https://wa.me/${entrada.phone}?text=${texto}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => void aoAgir(claim.id, "contacted")}
              className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-control)] bg-cobalt-500 px-4 text-[14px] font-semibold text-white"
            >
              <Phone className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Chamar no WhatsApp
            </a>
          ) : (
            <button
              type="button"
              onClick={async () => {
                // Sem telefone, a vendedora responde no grupo. Abrir o grupo,
                // nunca mandar DM.
                try {
                  await navigator.clipboard.writeText(decodeURIComponent(texto));
                } catch {
                  // Área de transferência bloqueada não pode travar a ação.
                }
                window.open(`https://wa.me/${entrada.participant_jid.split("@")[0]}`, "_blank");
                void aoAgir(claim.id, "contacted");
              }}
              className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-control)] bg-cobalt-500 px-4 text-[14px] font-semibold text-white"
            >
              <MessageCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Responder no grupo
            </button>
          ))}

        <button
          type="button"
          disabled={ocupado}
          onClick={() => void aoAgir(claim.id, "sold")}
          className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-4 text-[14px] font-semibold text-volt-950 disabled:opacity-50"
        >
          <Check className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Vendeu
        </button>

        <button
          type="button"
          disabled={ocupado}
          onClick={() => void aoAgir(claim.id, "dropped")}
          className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-4 text-[14px] text-slate-600 disabled:opacity-50"
        >
          <UserX className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Não respondeu
        </button>
      </div>
    </section>
  );
}
