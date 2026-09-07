"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarClock, Layers, Plug, Send } from "lucide-react";

import { cn } from "@/lib/utils";
import { Bolha } from "@/components/painel/bolha";
import { MessageComposer, type ComposerPayload } from "@/components/painel/messages/message-composer";
import { ScheduleComposer, type SchedulePayload } from "@/components/painel/messages/schedule-composer";
import { alcance, fraseAlcance, quadradinhos, rotuloPostar } from "@/lib/painel/disparos";
import { diaHoraCurto } from "@/lib/painel/inicio";
import type { Group } from "@/lib/mock-data";
import type { TenantDispatchView } from "@/lib/campaigns/dispatch-view";

type Campanha = { id: string; name: string; slug?: string; groupIds: string[] };

type Props = {
  campanhas: readonly Campanha[];
  slug: string;
  aoTrocarCampanha: (slug: string) => void;
  grupos: readonly Group[];
  /** Falso quando /api/groups não respondeu: "0 pessoas" seria mentira. */
  gruposOk: boolean;
  disparos: readonly TenantDispatchView[];
  enviando: boolean;
  erro: string | null;
  live: boolean | null;
  aoDisparar: (payload: ComposerPayload | SchedulePayload) => Promise<void>;
};

const ESTADO: Record<string, { texto: string; classe: string }> = {
  draft: { texto: "Rascunho", classe: "pn-chip" },
  scheduled: { texto: "Agendado", classe: "pn-chip" },
  queued: { texto: "Na fila", classe: "pn-chip" },
  running: { texto: "Postando", classe: "pn-chip" },
  sent: { texto: "Postado", classe: "pn-chip" },
  failed: { texto: "Falhou", classe: "pn-chip pn-chip--line" },
};

const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

/**
 * Disparos da Vitrine Aberta (cena 2 da seção 11): o lojista digita e a bolha
 * escreve junto, com a conta do alcance embaixo. O histórico é um cupom por
 * post, com um quadradinho por grupo enchendo um a um.
 */
export function DisparosVitrine({
  campanhas,
  slug,
  aoTrocarCampanha,
  grupos,
  gruposOk,
  disparos,
  enviando,
  erro,
  live,
  aoDisparar,
}: Props) {
  const [agendando, setAgendando] = useState(false);
  const [texto, setTexto] = useState("");

  // Sem memo: `agora` muda a cada render e congelaria o "há 2 dias" do histórico.
  const agora = new Date();
  const campanha = campanhas.find((c) => (c.slug ?? c.id) === slug) ?? null;
  const alvo = alcance(grupos, campanha?.groupIds);
  const semCampanha = campanhas.length === 0;

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 px-4 py-6 sm:px-8 lg:py-8">
      <header>
        <h1 className="font-brand text-28 font-bold tracking-[-0.4px] text-volt-950">Disparos</h1>
        <p className="mt-1 text-15 text-slate-600">Sua oferta nos grupos, agora ou na hora marcada.</p>
      </header>

      {(live === false || semCampanha) && (
        <div className="pn-card rounded-[var(--radius-control)] p-5">
          <h2 className="font-brand text-[17px] font-bold text-volt-950">Falta um passo pra postar</h2>
          <ol className="mt-3 space-y-2">
            <Passo icone={Plug} feito={live !== false} texto="Conectar o WhatsApp" href="/painel/conectar" cta="Conectar" />
            <Passo icone={Layers} feito={!semCampanha} texto="Criar uma campanha com grupos" href="/painel/campanhas/nova" cta="Criar campanha" />
            <Passo icone={Send} feito={false} texto="Postar sua primeira oferta" />
          </ol>
        </div>
      )}

      {!semCampanha && (
        <section className="pn-card rounded-[var(--radius-control)] p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2">
              <span className="text-13 font-semibold text-slate-600">Campanha</span>
              <select
                value={slug}
                onChange={(e) => aoTrocarCampanha(e.target.value)}
                aria-label="Campanha do disparo"
                data-testid="disparos-campanha"
                className="h-11 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-[16px] text-volt-950"
              >
                {campanhas.map((c) => (
                  <option key={c.id} value={c.slug ?? c.id}>{c.name}</option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => setAgendando((v) => !v)}
              aria-pressed={agendando}
              className={cn(
                "ml-auto inline-flex h-11 items-center gap-2 rounded-[var(--radius-control)] border px-4 text-[14px]",
                agendando ? "border-volt-950 bg-volt-950 text-paper-0" : "border-line-200 bg-paper-0 text-volt-950",
              )}
            >
              <CalendarClock className="h-4 w-4" strokeWidth={1.75} />
              Agendar
            </button>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
            <div className="order-2 lg:order-1">
              {agendando ? (
                <ScheduleComposer onSchedule={aoDisparar} scheduling={enviando} />
              ) : (
                <MessageComposer
                  className="border-0 bg-transparent p-0"
                  onSend={aoDisparar}
                  sending={enviando}
                  onBodyChange={setTexto}
                  rotuloEnviar={rotuloPostar(alvo)}
                  acid={alvo.grupos > 0}
                />
              )}
            </div>

            {/* A prévia vem antes no mobile: é ela que mostra o que está sendo escrito. */}
            <aside className="order-1 lg:order-2">
              <Bolha
                grupo={campanha?.name ?? "Seus grupos"}
                hora={hora.format(agora)}
                texto={texto}
                vazio="Sua oferta aparece aqui como chega no celular da cliente."
                testId="disparos-bolha-previa"
              />
              <p
                data-testid="disparos-alcance"
                className={cn(
                  "mt-2 text-13",
                  alvo.grupos > 0 ? "font-data tabular-nums text-volt-950" : "text-slate-600",
                )}
              >
                {gruposOk
                  ? fraseAlcance(alvo)
                  : `Vai pra ${campanha?.groupIds.length ?? 0} grupos · não deu pra contar as pessoas agora.`}
              </p>
            </aside>
          </div>

          {erro && (
            <p className="mt-3 flex items-start gap-2 text-13 text-alerta">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {erro}
            </p>
          )}
        </section>
      )}

      <section className="pn-card rounded-[var(--radius-control)] p-4 sm:p-5">
        <h2 className="font-data text-12 uppercase tracking-[0.06em] text-slate-600">Histórico</h2>
        {disparos.length === 0 ? (
          <p className="mt-3 text-15 text-volt-950">
            Nenhum post ainda.{" "}
            <span className="text-slate-600">O que você postar aparece aqui, grupo a grupo.</span>
          </p>
        ) : (
          <ul className="mt-2">
            {disparos.map((d) => {
              const estado = ESTADO[d.status] ?? ESTADO.draft;
              const q = quadradinhos(d);
              const quando = d.scheduledAt ?? d.dispatchedAt ?? d.createdAt;
              return (
                <li key={d.id} className="border-b border-dashed border-line-200 py-3 last:border-0" data-testid="disparos-linha">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={estado.classe}>{estado.texto}</span>
                    {d.campaignSlug ? (
                      <Link href={`/painel/campanhas/${d.campaignSlug}`} className="text-15 font-semibold text-cobalt-500">
                        {d.campaignName}
                      </Link>
                    ) : (
                      <span className="text-15 font-semibold text-volt-950">{d.campaignName}</span>
                    )}
                    <span className="font-data ml-auto text-13 tabular-nums text-volt-950">
                      {d.sent} / {d.total} <span className="text-slate-600">grupos</span>
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-13 text-slate-600">{d.body || "Post com mídia, sem texto."}</p>
                  {d.error && <p className="mt-1 text-13 text-alerta">{d.error}</p>}
                  <div className="pn-cupom mt-2 flex flex-wrap items-center justify-between gap-2">
                    <span>{diaHoraCurto(quando, agora)}</span>
                    {q.total > 0 && (
                      <span className="pn-cupom__quadrados" aria-hidden="true">
                        {Array.from({ length: q.total }, (_, i) => (
                          <i key={i} className={i < q.entregues ? "is-entregue" : undefined} />
                        ))}
                      </span>
                    )}
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

function Passo({
  icone: Icone,
  feito,
  texto,
  href,
  cta,
}: {
  icone: typeof Send;
  feito: boolean;
  texto: string;
  href?: string;
  cta?: string;
}) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className={cn("flex items-center gap-2 text-15", feito ? "text-slate-600 line-through" : "text-volt-950")}>
        <Icone className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        {texto}
      </span>
      {!feito && href && cta && (
        <Link href={href} className="shrink-0 text-13 font-semibold text-cobalt-500">
          {cta}
        </Link>
      )}
    </li>
  );
}
