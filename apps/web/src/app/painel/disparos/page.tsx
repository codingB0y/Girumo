"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Send,
  CalendarClock,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  FileText,
  Layers,
  Plug,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MessageComposer, type ComposerPayload } from "@/components/painel/messages/message-composer";
import { ScheduleComposer, type SchedulePayload } from "@/components/painel/messages/schedule-composer";
import type { TenantDispatchView } from "@/lib/campaigns/dispatch-view";
import { etaDisparo } from "@/lib/campaigns/dispatch-eta";

type Campanha = { id: string; name: string; slug?: string; groupIds: string[] };

const MODES = ["Enviar agora", "Agendar"] as const;
type Mode = (typeof MODES)[number];

const STATUS: Record<string, { label: string; pill: string; icon: typeof Send }> = {
  draft: { label: "Rascunho", pill: "bg-poco text-aco/60", icon: FileText },
  scheduled: { label: "Agendado", pill: "bg-cobalt-500/10 text-cobalt-700", icon: CalendarClock },
  queued: { label: "Na fila", pill: "bg-cobalt-500/10 text-cobalt-700", icon: Loader2 },
  running: { label: "Enviando", pill: "bg-atencao/10 text-atencao", icon: Loader2 },
  sent: { label: "Enviado", pill: "bg-sucesso/10 text-sucesso", icon: CheckCircle2 },
  failed: { label: "Falhou", pill: "bg-alerta/10 text-alerta", icon: AlertTriangle },
};

const dt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default function PainelDisparos() {
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [dispatches, setDispatches] = useState<TenantDispatchView[]>([]);
  const [campaignSlug, setCampaignSlug] = useState("");
  const [mode, setMode] = useState<Mode>("Enviar agora");
  const [live, setLive] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const loadDispatches = useCallback(async () => {
    const d = await fetch("/api/disparos").then((r) => r.json()).catch(() => []);
    setDispatches(Array.isArray(d) ? d : []);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [c, s] = await Promise.all([
          fetch("/api/campanhas").then((r) => r.json()).catch(() => []),
          fetch("/api/session").then((r) => r.json()).catch(() => ({})),
        ]);
        const list: Campanha[] = Array.isArray(c) ? c : [];
        setCampanhas(list);
        setLive(Boolean(s?.live));
        // Pré-seleciona a 1ª campanha: com uma só, disparar vira um clique.
        if (list.length > 0) setCampaignSlug(list[0].slug ?? list[0].id);
        await loadDispatches();
      } finally {
        setLoading(false);
      }
    })();
  }, [loadDispatches]);

  // Enquanto houver disparo em voo, o progresso vem do worker — só então vale
  // ficar consultando. Lista parada não gera tráfego.
  const emVoo = useMemo(
    () => dispatches.some((d) => d.status === "queued" || d.status === "running"),
    [dispatches],
  );
  useEffect(() => {
    if (!emVoo) return;
    const t = setInterval(loadDispatches, 10_000);
    return () => clearInterval(t);
  }, [emVoo, loadDispatches]);

  const campanhaAtual = useMemo(
    () => campanhas.find((c) => (c.slug ?? c.id) === campaignSlug) ?? null,
    [campanhas, campaignSlug],
  );

  async function dispatch(payload: ComposerPayload | SchedulePayload) {
    if (!campanhaAtual) return;
    setSending(true);
    setErro(null);
    try {
      const res = await fetch(`/api/campanhas/${campaignSlug}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, groupIds: campanhaAtual.groupIds }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setErro(err.error ?? "Não foi possível disparar.");
        return;
      }
      await loadDispatches();
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-[1100px] space-y-4 px-4 py-8 sm:px-8">
        <div className="pn-skeleton h-40 rounded-2xl" />
        <div className="pn-skeleton h-64 rounded-2xl" />
      </div>
    );
  }

  const semConexao = live === false;
  const semCampanha = campanhas.length === 0;

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 px-4 py-8 sm:px-8">
      <header>
        <h1 className="font-display text-[28px] font-extrabold tracking-[-0.02em] text-volt-950">Disparos</h1>
        <p className="font-editorial mt-1 text-[19px] italic text-ardosia">
          Sua oferta nos grupos, agora ou na hora marcada.
        </p>
      </header>

      {/* Sequência de ativação: só aparece o passo que falta, na ordem que resolve. */}
      {(semConexao || semCampanha) && (
        <div className="pn-card rounded-2xl p-6">
          <h2 className="font-display text-base font-bold text-volt-950">Falta um passo pra disparar</h2>
          <ol className="mt-4 space-y-3">
            <PassoAtivacao
              icon={Plug}
              done={!semConexao}
              label="Conectar o WhatsApp"
              href="/painel/conectar"
              cta="Conectar"
            />
            <PassoAtivacao
              icon={Layers}
              done={!semCampanha}
              label="Criar uma campanha com grupos"
              href="/painel/campanhas/nova"
              cta="Criar campanha"
            />
            <PassoAtivacao icon={Send} done={false} label="Disparar sua primeira oferta" />
          </ol>
        </div>
      )}

      {!semCampanha && (
        <div className="pn-card rounded-2xl p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2.5">
              <span className="font-data text-[11px] uppercase tracking-[0.08em] text-aco/55">Campanha</span>
              <select
                value={campaignSlug}
                onChange={(e) => setCampaignSlug(e.target.value)}
                aria-label="Campanha do disparo"
                className="rounded-[10px] border border-volt-950/10 bg-poco px-3 py-2 text-sm text-volt-950 outline-none transition-[border-color,box-shadow] duration-[160ms] focus:border-cobalt-500/50 focus:bg-papel focus:shadow-[0_0_0_3px_var(--color-cobalt-soft)]"
              >
                {campanhas.map((c) => (
                  <option key={c.id} value={c.slug ?? c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <div className="flex gap-1 rounded-xl border border-volt-950/10 bg-papel p-1">
              {MODES.map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "cursor-pointer rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors duration-[160ms]",
                    mode === m ? "bg-volt-950 text-white" : "text-aco/70 hover:text-volt-950",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <p className="mt-3 text-[13px] text-aco/60">
            {campanhaAtual?.groupIds.length
              ? `Vai para ${campanhaAtual.groupIds.length} grupo(s) desta campanha.`
              : "Esta campanha ainda não tem grupos — escolha os grupos antes de disparar."}
          </p>

          {erro && (
            <p className="mt-3 flex items-start gap-2 text-sm text-alerta">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {erro}
            </p>
          )}

          {mode === "Enviar agora" ? (
            <MessageComposer onSend={dispatch} sending={sending} className="mt-4" />
          ) : (
            <ScheduleComposer onSchedule={dispatch} scheduling={sending} className="mt-4" />
          )}
        </div>
      )}

      <div className="pn-card overflow-hidden rounded-2xl">
        <div className="border-b border-volt-950/[0.06] bg-poco px-5 py-3">
          <span className="font-data text-[10px] uppercase tracking-[0.08em] text-aco/50">Histórico</span>
        </div>
        {dispatches.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="font-editorial text-[22px] italic text-volt-950">Nenhum disparo ainda.</p>
            <p className="mt-1 text-sm text-aco/60">O que você enviar aparece aqui, com o progresso grupo a grupo.</p>
          </div>
        ) : (
          <div className="divide-y divide-dashed divide-volt-950/[0.09]">
            {dispatches.map((d) => {
              const badge = STATUS[d.status] ?? STATUS.draft;
              const BadgeIcon = badge.icon;
              const quando = d.scheduledAt ?? d.dispatchedAt ?? d.createdAt;
              const eta = d.status === "queued" || d.status === "running" ? etaDisparo(d) : null;
              return (
                <div key={d.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("font-data inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.06em]", badge.pill)}>
                          <BadgeIcon className={cn("h-3 w-3", (d.status === "running" || d.status === "queued") && "animate-spin")} />
                          {badge.label}
                        </span>
                        {eta && <span className="text-xs text-aco/60">{d.sent} de {d.total} · {eta}</span>}
                        {d.campaignSlug ? (
                          <Link href={`/painel/campanhas/${d.campaignSlug}`} className="text-sm font-medium text-cobalt-500 hover:underline">
                            {d.campaignName}
                          </Link>
                        ) : (
                          <span className="text-sm font-medium text-aco/60">{d.campaignName}</span>
                        )}
                      </div>
                      <p className="mt-1.5 truncate text-sm text-aco">{d.body || "(mídia sem legenda)"}</p>
                      {d.error && <p className="mt-1 text-[13px] text-alerta">{d.error}</p>}
                    </div>
                    <div className="text-right">
                      <p className="font-data text-sm tabular-nums text-volt-950">
                        {d.sent}/{d.total}<span className="text-aco/40"> grupos</span>
                      </p>
                      <p className="font-data mt-0.5 text-[11px] text-aco/50">{dt.format(new Date(quando))}</p>
                    </div>
                  </div>
                  {d.total > 0 && (
                    <div className="pn-poco mt-2.5 h-1.5 w-full overflow-hidden rounded-full">
                      <div
                        className="pn-fill h-full w-full rounded-full"
                        style={{
                          transform: `scaleX(${Math.max(d.sent / d.total, 0.02)})`,
                          background: d.status === "failed" ? "#D84040" : "var(--color-cobalt-500)",
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function PassoAtivacao({
  icon: Icon,
  done,
  label,
  href,
  cta,
}: {
  icon: typeof Send;
  done: boolean;
  label: string;
  href?: string;
  cta?: string;
}) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className={cn("flex items-center gap-2.5 text-sm", done ? "text-aco/45 line-through" : "text-volt-950")}>
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", done ? "bg-sucesso/10 text-sucesso" : "bg-cobalt-500/10 text-cobalt-500")}>
          {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" strokeWidth={1.75} />}
        </span>
        {label}
      </span>
      {!done && href && cta && (
        <Link href={href} className="font-data shrink-0 text-[11px] uppercase tracking-[0.08em] text-cobalt-500 transition-[gap] duration-[160ms] hover:underline">
          {cta} →
        </Link>
      )}
    </li>
  );
}
