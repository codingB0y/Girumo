"use client";

import { useCallback, useEffect, useState } from "react";
import { toPlanLimitError } from "@/lib/billing/plan-limit-client";
import { PlanLimitAlert } from "@/components/painel/plan-limit-alert";
import { cn } from "@/lib/utils";
import { useConfirmacao } from "@/components/painel/confirmacao";
import { numero } from "@/lib/painel/grupos";
import { MessageComposer, type ComposerPayload } from "./message-composer";
import { ScheduleComposer, type SchedulePayload } from "./schedule-composer";
import { MessagesAgenda } from "./messages-agenda";
import { FunnelTab } from "./funnel/funnel-tab";
import type { CampaignMessage } from "@/lib/messages-store";

const SUB_TABS = ["Enviar agora", "Agendar", "Funil", "Agenda"] as const;
type SubTab = (typeof SUB_TABS)[number];

type Props = {
  campaignSlug: string;
  groupIds: string[];
  /** Grupo de Avisos da comunidade nativa. NULL quando a comunidade não é
   * nativa — a escolha de modo de envio nem aparece. */
  avisoGroupId?: string | null;
  /** `members` do Avisos: a comunidade inteira, já deduplicada pelo WhatsApp. */
  alcanceAvisos?: number | null;
  /** Soma de `members` dos grupos filhos — pode contar a mesma pessoa mais de uma vez. */
  alcanceGrupoAGrupo?: number;
  /** Só admin escreve em grupo `announce`. Sem isso a opção do Avisos some do clique. */
  avisoIsAdmin?: boolean;
  /** Só a página de campanha passa: comunidade não tem funil. */
  funil?: { campaignName: string; masterUrl: string; groupCount: number; memberCount: number };
  /** Abre direto na sub-aba Funil (vindo de "Novo funil" na tela Funis). */
  abrirNoFunil?: boolean;
};

export function MessagesTab({
  campaignSlug,
  groupIds,
  avisoGroupId = null,
  alcanceAvisos = null,
  alcanceGrupoAGrupo = 0,
  avisoIsAdmin = false,
  funil,
  abrirNoFunil = false,
}: Props) {
  const { pedirConfirmacao, folhaDeConfirmacao } = useConfirmacao();
  const comecaNoFunil = abrirNoFunil && Boolean(funil);
  const [subTab, setSubTab] = useState<SubTab>(comecaNoFunil ? "Funil" : "Enviar agora");
  // O Funil monta na 1ª visita e não desmonta mais: progresso, runId e o
  // relatório de falha sobrevivem à ida até a Agenda (senão a volta recomeça o
  // funil e reagendar duplica mensagens nos grupos).
  const [funilAberto, setFunilAberto] = useState(comecaNoFunil);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendUpgradeUrl, setSendUpgradeUrl] = useState<string | null>(null);
  const [messages, setMessages] = useState<CampaignMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  // Sem grupo filho vinculado, "grupo a grupo" manda groupIds: [] e o
  // servidor devolve 400 — o Avisos é a única opção que funciona, então
  // começa nele em vez de num radio morto.
  const semGruposVinculados = groupIds.length === 0 && Boolean(avisoGroupId);
  // Nenhum padrão silencioso no caso normal: o lojista escolhe o Avisos de
  // propósito — o ponto de partida é grupo a grupo, o que já acontecia antes
  // desta opção existir. Sem grupo vinculado essa regra não se aplica.
  const [usarAvisos, setUsarAvisos] = useState(semGruposVinculados);
  // Reage a props que mudam sem remontar o componente (ex.: desvincular o
  // último grupo e continuar na mesma tela).
  useEffect(() => {
    if (semGruposVinculados) setUsarAvisos(true);
  }, [semGruposVinculados]);
  const alvos = usarAvisos && avisoGroupId ? [avisoGroupId] : groupIds;

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/campanhas/${campaignSlug}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(Array.isArray(data) ? data : []);
      }
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, [campaignSlug]);

  useEffect(() => {
    fetchMessages();
    // Poll a cada 10s pra atualizar status de envio
    const interval = setInterval(fetchMessages, 10_000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  const handleSend = async (payload: ComposerPayload) => {
    setSending(true);
    // Limpa o aviso anterior: erro preso na tela depois de uma tentativa
    // bem-sucedida faz o cliente achar que falhou de novo.
    setSendError(null);
    setSendUpgradeUrl(null);
    try {
      const res = await fetch(`/api/campanhas/${campaignSlug}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          groupIds: alvos,
        }),
      });
      if (res.ok) {
        await fetchMessages();
        setSubTab("Agenda");
      } else {
        // `alert()` nativo nao aceita link, entao quem batia no gate de plano
        // aqui lia a mensagem e ficava sem saida — justamente no momento de
        // maior intencao de compra: a pessoa ja escreveu a mensagem e clicou
        // em enviar.
        const erro = await toPlanLimitError(res, "Erro ao enviar mensagem.");
        setSendError(erro.message);
        setSendUpgradeUrl(erro.upgradeUrl);
      }
    } finally {
      setSending(false);
    }
  };

  const handleSchedule = async (payload: SchedulePayload) => {
    setSending(true);
    // Limpa o aviso anterior: erro preso na tela depois de uma tentativa
    // bem-sucedida faz o cliente achar que falhou de novo.
    setSendError(null);
    setSendUpgradeUrl(null);
    try {
      const res = await fetch(`/api/campanhas/${campaignSlug}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          groupIds: alvos,
        }),
      });
      if (res.ok) {
        await fetchMessages();
        setSubTab("Agenda");
      } else {
        const erro = await toPlanLimitError(res, "Erro ao agendar mensagem.");
        setSendError(erro.message);
        setSendUpgradeUrl(erro.upgradeUrl);
      }
    } finally {
      setSending(false);
    }
  };

  const handleCancel = async (id: string) => {
    const res = await fetch(`/api/campanhas/${campaignSlug}/messages/cancel?id=${id}`, {
      method: "PATCH",
    });
    if (res.ok) await fetchMessages();
  };

  // Reusa a rota de uma mensagem (escopo por tenant + permissão já estão lá).
  // Em série: se uma falhar, as seguintes seguem agendadas e a Agenda mostra.
  const handleCancelFunnel = async (ids: readonly string[], label: string) => {
    const ok = await pedirConfirmacao({
      titulo: "Cancelar o funil",
      texto: `Cancelar as ${ids.length} mensagens ainda agendadas de "${label}"? O que já saiu não volta.`,
      rotulo: "Cancelar funil",
      destrutivo: true,
    });
    if (!ok) return;
    for (const id of ids) {
      const res = await fetch(`/api/campanhas/${campaignSlug}/messages/cancel?id=${id}`, { method: "PATCH" });
      if (!res.ok) break;
    }
    await fetchMessages();
  };

  const handleDelete = async (id: string) => {
    const ok = await pedirConfirmacao({
      titulo: "Excluir a mensagem",
      texto: "Excluir essa mensagem? Ela sai da agenda e não será enviada.",
      rotulo: "Excluir",
      destrutivo: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/campanhas/${campaignSlug}/messages?id=${id}`, {
      method: "DELETE",
    });
    if (res.ok) await fetchMessages();
  };

  if (loading) {
    return <div className="h-40 animate-pulse rounded-xl bg-white" />;
  }

  return (
    <div className="space-y-4">
      <PlanLimitAlert message={sendError} upgradeUrl={sendUpgradeUrl} />
      {avisoGroupId && (
        <fieldset className="pn-card rounded-[var(--radius-control)] p-4">
          <legend className="px-1 text-13 font-semibold text-volt-950">Como enviar</legend>
          <label className="mt-2 flex items-start gap-2 text-14 text-volt-950">
            <input
              type="radio"
              name="modo-envio"
              className="mt-1"
              checked={!usarAvisos}
              onChange={() => setUsarAvisos(false)}
              disabled={semGruposVinculados}
            />
            <span>
              Enviar grupo a grupo ({groupIds.length} {groupIds.length === 1 ? "envio" : "envios"})
              <span className="font-data block text-12 text-slate-600">
                alcance <span className="tabular-nums">{numero(alcanceGrupoAGrupo)}</span> — soma dos
                grupos, pode contar a mesma pessoa mais de uma vez
              </span>
            </span>
          </label>
          {semGruposVinculados && (
            <p className="mt-1 text-12 text-aco">
              Não há grupo vinculado a esta comunidade — envie pelo Avisos.
            </p>
          )}
          <label className="mt-3 flex items-start gap-2 text-14 text-volt-950">
            <input
              type="radio"
              name="modo-envio"
              className="mt-1"
              checked={usarAvisos}
              onChange={() => setUsarAvisos(true)}
              disabled={!avisoIsAdmin}
            />
            <span>
              Enviar pelo Avisos (1 envio)
              <span className="font-data block text-12 text-slate-600">
                alcance <span className="tabular-nums">{numero(alcanceAvisos)}</span>
              </span>
            </span>
          </label>
          {!avisoIsAdmin && (
            <p className="mt-2 text-12 text-alerta">
              Sua conta não é admin do grupo de Avisos — não dá pra enviar por ele.
            </p>
          )}
        </fieldset>
      )}
      {/* Sub-tabs */}
      <div className="flex gap-1 overflow-x-auto">
        {SUB_TABS.filter((t) => t !== "Funil" || funil).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={subTab === t}
            onClick={() => {
              setSubTab(t);
              if (t === "Funil") setFunilAberto(true);
            }}
            className={cn(
              "shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition",
              subTab === t
                ? "bg-canvas-100 text-cobalt-500"
                : "text-slate-600 hover:bg-canvas-100 hover:text-volt-950",
            )}
          >
            {t}
            {t === "Funil" && (
              <span className="text-12 ml-1.5 rounded-sm bg-cobalt-500/10 px-1.5 py-0.5 font-semibold text-cobalt-700">
                Novo
              </span>
            )}
            {t === "Agenda" && messages.length > 0 && (
              <span className="text-12 ml-1.5 rounded-full bg-cobalt-500 px-1.5 py-0.5 font-bold tabular-nums text-white">
                {messages.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="hf-enter" key={subTab}>
        {subTab === "Enviar agora" && (
          <MessageComposer onSend={handleSend} sending={sending} />
        )}
        {subTab === "Agendar" && (
          <ScheduleComposer onSchedule={handleSchedule} scheduling={sending} />
        )}
        {subTab === "Agenda" && (
          <MessagesAgenda
            messages={messages}
            onCancel={handleCancel}
            onCancelFunnel={handleCancelFunnel}
            onDelete={handleDelete}
          />
        )}
      </div>
      {funil && funilAberto && (
        <div hidden={subTab !== "Funil"}>
          <FunnelTab
            campaignSlug={campaignSlug}
            campaignName={funil.campaignName}
            groupIds={alvos}
            masterUrl={funil.masterUrl}
            groupCount={usarAvisos ? 1 : funil.groupCount}
            memberCount={funil.memberCount}
            onScheduled={async () => {
              await fetchMessages();
              setSubTab("Agenda");
            }}
            onFromScratch={() => setSubTab("Agendar")}
          />
        </div>
      )}
      {folhaDeConfirmacao}
    </div>
  );
}
