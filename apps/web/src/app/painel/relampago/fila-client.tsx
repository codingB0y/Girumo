"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, MessageCircle, Phone, UserX } from "lucide-react";

import { claimState, deadlineOf, type ClaimState } from "@/lib/relampago/claim-state";
import { cn } from "@/lib/utils";

type Offer = {
  id: string;
  name: string;
  keyword: string;
  slots: number;
  timer_seconds: number | null;
  status: "draft" | "open" | "closed";
};

type Claim = {
  id: string;
  seller_user_id: string;
  claimed_at: string;
  contacted_at: string | null;
};

type Entry = {
  id: string;
  participant_jid: string;
  phone: string | null;
  push_name: string | null;
  message_text: string;
  commented_at: string;
  deprioritized_at: string | null;
  outcome: "sold" | "dropped" | null;
  claim: Claim | null;
};

type Payload = { offer: Offer; queue: Entry[]; me: string; now: string };

const POLL_MS = 5000;

function horario(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function nomeDe(e: Entry): string {
  return e.push_name?.trim() || "sem nome";
}

function mmss(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

const RESTANTE: Record<ClaimState, string> = {
  reservada: "para chamar",
  em_conversa: "para responder",
  expirada_vendedora: "prazo de chamar vencido",
  expirada_cliente: "sem resposta",
};

export function FilaClient({ offerId }: { offerId: string }) {
  const [dados, setDados] = useState<Payload | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // Só força o re-render do cronômetro; o valor não é lido.
  const [, setTick] = useState(0);

  /**
   * Diferença entre o relógio do servidor e o do navegador, medida na resposta.
   * O cronômetro conta a partir daqui e não de `Date.now()` cru: máquina de loja
   * com hora torta mostraria a reserva vencida (ou eterna) sem nada estar errado.
   */
  const deriva = useRef(0);

  const carregar = useCallback(async () => {
    const res = await fetch(`/api/relampago/offers/${offerId}`, { cache: "no-store" });
    if (!res.ok) {
      setErro("Nao foi possivel carregar a fila.");
      return;
    }
    const payload = (await res.json()) as Payload;
    deriva.current = new Date(payload.now).getTime() - Date.now();
    setDados(payload);
    setErro(null);
  }, [offerId]);

  useEffect(() => {
    carregar().catch(() => setErro("Nao foi possivel carregar a fila."));
    const id = setInterval(() => {
      carregar().catch(() => {});
    }, POLL_MS);
    return () => clearInterval(id);
  }, [carregar]);

  // Segundo a segundo só para o cronômetro. O dado vem do poll.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const agora = new Date(Date.now() + deriva.current);

  const vendidas = dados?.queue.filter((e) => e.outcome === "sold").length ?? 0;
  const reservadas = dados?.queue.filter((e) => e.claim && !e.outcome).length ?? 0;
  const vagasLivres = dados ? dados.offer.slots - (vendidas + reservadas) : 0;

  const minha = dados?.queue.find((e) => e.claim?.seller_user_id === dados.me && !e.outcome) ?? null;

  async function acao(claimId: string, action: "contacted" | "sold" | "dropped") {
    setOcupado(true);
    try {
      await fetch(`/api/relampago/claims/${claimId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  async function pegarProxima() {
    setOcupado(true);
    setAviso(null);
    try {
      const res = await fetch(`/api/relampago/offers/${offerId}/claim`, { method: "POST" });
      if (!res.ok) {
        const corpo = await res.json().catch(() => null);
        // 409 não é erro: outra vendedora ganhou a corrida. Recarrega e segue.
        setAviso(corpo?.error ?? "Nao foi possivel pegar a proxima.");
      }
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  async function fechar() {
    setOcupado(true);
    try {
      await fetch(`/api/relampago/offers/${offerId}`, { method: "POST" });
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  if (erro) {
    return <p className="mx-auto max-w-[1200px] px-4 py-8 text-sm text-alerta sm:px-8">{erro}</p>;
  }

  if (!dados) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-8">
        <div className="pn-skeleton h-64 rounded-2xl" />
      </div>
    );
  }

  const { offer, queue, me } = dados;

  return (
    <div className="mx-auto max-w-[1200px] space-y-8 px-4 py-8 sm:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/painel/relampago"
            className="inline-flex items-center gap-1.5 text-sm text-aco/60 transition-colors hover:text-volt-950"
          >
            <ArrowLeft className="h-4 w-4" />
            Ofertas
          </Link>
          <h1 className="font-display mt-1 text-[28px] font-extrabold tracking-[-0.02em] text-volt-950">
            {offer.name}
          </h1>
          <p className="font-editorial mt-1 text-[19px] italic text-ardosia">
            Palavra-chave <strong className="not-italic">{offer.keyword}</strong> · {offer.slots}{" "}
            peças · {vendidas} vendida{vendidas === 1 ? "" : "s"}
          </p>
          {aviso && <p className="mt-2 text-sm text-atencao">{aviso}</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={pegarProxima}
            disabled={ocupado || vagasLivres <= 0 || offer.status !== "open" || !!minha}
            className="inline-flex items-center gap-2 rounded-xl bg-cobalt-500 px-4 py-2.5 text-sm font-medium text-white transition-[transform,filter] duration-[160ms] ease-[var(--ease-fluxo)] hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          >
            Pegar próxima
            <span className="font-data text-[11px] tabular-nums opacity-70">
              {vagasLivres} livre{vagasLivres === 1 ? "" : "s"}
            </span>
          </button>
          {offer.status === "open" && (
            <button
              type="button"
              onClick={fechar}
              disabled={ocupado}
              className="rounded-xl border border-volt-950/10 px-4 py-2.5 text-sm font-medium text-aco/70 transition-colors hover:text-volt-950 disabled:opacity-60"
            >
              Fechar oferta
            </button>
          )}
        </div>
      </header>

      {minha?.claim && (
        <CardDaVendedora
          entry={minha}
          claim={minha.claim}
          timerSeconds={offer.timer_seconds}
          agora={agora}
          ocupado={ocupado}
          onAcao={acao}
        />
      )}

      <section className="pn-card overflow-hidden rounded-2xl">
        <div className="hidden border-b border-volt-950/[0.06] bg-poco px-5 py-3 md:grid md:grid-cols-[auto_1.6fr_1fr_auto] md:gap-4">
          {["#", "Cliente", "Comentário", "Situação"].map((h) => (
            <span key={h} className="font-data text-[10px] uppercase tracking-[0.08em] text-aco/50">
              {h}
            </span>
          ))}
        </div>

        {queue.length === 0 ? (
          <p className="px-5 py-8 text-sm text-aco/60">
            Ninguém comentou ainda. Poste a promoção no grupo pedindo{" "}
            <strong className="text-volt-950">{offer.keyword}</strong>.
          </p>
        ) : (
          <div className="divide-y divide-dashed divide-volt-950/[0.09]">
            {queue.map((e, i) => {
              // A linha do estoque ANDA: cada venda fechada puxa uma da espera
              // para a fila de verdade.
              const naEspera = i >= offer.slots - vendidas;
              const primeiraDaEspera = naEspera && i === offer.slots - vendidas;

              return (
                <div key={e.id}>
                  {primeiraDaEspera && (
                    <p className="font-data bg-poco px-5 py-1.5 text-[10px] uppercase tracking-[0.08em] text-aco/50">
                      Daqui para baixo é espera — entra quando uma venda fechar
                    </p>
                  )}
                  <div
                    className={cn(
                      "grid gap-1 px-5 py-4 md:grid-cols-[auto_1.6fr_1fr_auto] md:items-center md:gap-4",
                      naEspera && "opacity-55",
                    )}
                  >
                    <span className="font-data text-sm tabular-nums text-aco/50">{i + 1}</span>
                    <div>
                      <span className="text-sm font-medium text-volt-950">{nomeDe(e)}</span>
                      <span className="font-data ml-2 text-[11px] tabular-nums text-aco/50">
                        {horario(e.commented_at)}
                      </span>
                      {!e.phone && (
                        <span className="ml-2 text-xs text-atencao">telefone não identificado</span>
                      )}
                    </div>
                    <span className="truncate text-sm text-aco/70">{e.message_text}</span>
                    <Situacao entry={e} me={me} timerSeconds={offer.timer_seconds} agora={agora} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Situacao({
  entry,
  me,
  timerSeconds,
  agora,
}: {
  entry: Entry;
  me: string;
  timerSeconds: number | null;
  agora: Date;
}) {
  if (entry.outcome === "sold") {
    return <Pill tone="sucesso">Vendida</Pill>;
  }
  if (entry.outcome === "dropped") {
    return <Pill tone="mudo">Não respondeu</Pill>;
  }
  if (!entry.claim) {
    return <Pill tone="mudo">Na fila</Pill>;
  }

  const estado = claimState(
    {
      claimedAt: new Date(entry.claim.claimed_at),
      contactedAt: entry.claim.contacted_at ? new Date(entry.claim.contacted_at) : null,
    },
    timerSeconds,
    agora,
  );

  const quem = entry.claim.seller_user_id === me ? "você" : "outra vendedora";

  if (estado === "em_conversa") return <Pill tone="cobalt">Em conversa · {quem}</Pill>;
  if (estado === "reservada") return <Pill tone="cobalt">Reservada · {quem}</Pill>;
  return <Pill tone="atencao">{RESTANTE[estado]}</Pill>;
}

function Pill({
  tone,
  children,
}: {
  tone: "sucesso" | "cobalt" | "atencao" | "mudo";
  children: React.ReactNode;
}) {
  const cores = {
    sucesso: "bg-sucesso/10 text-sucesso",
    cobalt: "bg-cobalt-500/10 text-cobalt-700",
    atencao: "bg-atencao/10 text-atencao",
    mudo: "bg-poco text-aco/60",
  } as const;

  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", cores[tone])}>
      {children}
    </span>
  );
}

function CardDaVendedora({
  entry,
  claim,
  timerSeconds,
  agora,
  ocupado,
  onAcao,
}: {
  entry: Entry;
  claim: Claim;
  timerSeconds: number | null;
  agora: Date;
  ocupado: boolean;
  onAcao: (claimId: string, action: "contacted" | "sold" | "dropped") => Promise<void>;
}) {
  const like = {
    claimedAt: new Date(claim.claimed_at),
    contactedAt: claim.contacted_at ? new Date(claim.contacted_at) : null,
  };
  const estado = claimState(like, timerSeconds, agora);
  const prazo = deadlineOf(like, timerSeconds);
  const restam = prazo ? (prazo.getTime() - agora.getTime()) / 1000 : null;

  const texto = encodeURIComponent(
    `Oi ${nomeDe(entry)}! Vi seu "${entry.message_text}" no grupo — separei pra você.`,
  );

  return (
    <section className="pn-card space-y-4 rounded-2xl bg-cobalt-500/[0.04] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-data text-[10px] uppercase tracking-[0.08em] text-aco/50">
            Na sua mão agora
          </p>
          <p className="font-display mt-1 text-[22px] font-bold text-volt-950">{nomeDe(entry)}</p>
          <p className="mt-1 text-sm text-aco/70">
            “{entry.message_text}” · {horario(entry.commented_at)}
          </p>
          <p className="mt-1 text-sm">
            {entry.phone ? (
              <span className="font-data tabular-nums text-aco/70">{entry.phone}</span>
            ) : (
              // Nunca um número inventado. ~1 em 7 cai aqui.
              <span className="text-atencao">telefone não identificado</span>
            )}
          </p>
        </div>

        {restam != null && (
          <div className="text-right">
            <p
              className={cn(
                "font-data text-[28px] font-bold tabular-nums",
                restam <= 0 ? "text-alerta" : "text-volt-950",
              )}
            >
              {mmss(restam)}
            </p>
            <p className="text-xs text-aco/60">{RESTANTE[estado]}</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {claim.contacted_at == null &&
          (entry.phone ? (
            <a
              href={`https://wa.me/${entry.phone}?text=${texto}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => void onAcao(claim.id, "contacted")}
              className="inline-flex items-center gap-2 rounded-xl bg-cobalt-500 px-4 py-2.5 text-sm font-medium text-white transition-[transform,filter] duration-[160ms] ease-[var(--ease-fluxo)] hover:-translate-y-0.5 hover:brightness-110"
            >
              <Phone className="h-4 w-4" />
              Chamar no WhatsApp
            </a>
          ) : (
            <button
              type="button"
              onClick={async () => {
                // Sem telefone, a vendedora responde no grupo — achando a pessoa
                // pela mensagem dela. Abrir o grupo, nunca mandar DM: automação
                // só posta no grupo, e aqui nem automação é.
                try {
                  await navigator.clipboard.writeText(decodeURIComponent(texto));
                } catch {
                  // Área de transferência bloqueada não pode travar a ação.
                }
                window.open(`https://wa.me/${entry.participant_jid.split("@")[0]}`, "_blank");
                void onAcao(claim.id, "contacted");
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-cobalt-500 px-4 py-2.5 text-sm font-medium text-white transition-[transform,filter] duration-[160ms] ease-[var(--ease-fluxo)] hover:-translate-y-0.5 hover:brightness-110"
            >
              <MessageCircle className="h-4 w-4" />
              Responder no grupo
            </button>
          ))}

        <button
          type="button"
          disabled={ocupado}
          onClick={() => void onAcao(claim.id, "sold")}
          className="inline-flex items-center gap-2 rounded-xl border border-sucesso/30 px-4 py-2.5 text-sm font-medium text-sucesso transition-colors hover:bg-sucesso/10 disabled:opacity-60"
        >
          <Check className="h-4 w-4" />
          Vendeu
        </button>

        <button
          type="button"
          disabled={ocupado}
          onClick={() => void onAcao(claim.id, "dropped")}
          className="inline-flex items-center gap-2 rounded-xl border border-volt-950/10 px-4 py-2.5 text-sm font-medium text-aco/70 transition-colors hover:text-volt-950 disabled:opacity-60"
        >
          <UserX className="h-4 w-4" />
          Não respondeu
        </button>
      </div>
    </section>
  );
}
