"use client";

import { useCallback, useEffect, useState } from "react";
import { toPlanLimitError } from "@/lib/billing/plan-limit-client";
import { PlanLimitAlert } from "@/components/painel/plan-limit-alert";
import { cn } from "@/lib/utils";
import { useConfirmacao } from "@/components/painel/confirmacao";
import { useToast } from "@/components/toast";
import { numero } from "@/lib/painel/grupos";
import { acompanharEnvio } from "@/lib/painel/disparos";
import { useRecarga } from "@/components/painel/home/ao-vivo/use-recarga";
import { DESTINO_PADRAO, type Destino } from "@/lib/campaigns/destino";
import { selecionados } from "@/lib/campaigns/destino-ui";
import { ERRO_SEM_CONEXAO, MessageComposer, type ComposerPayload } from "./message-composer";
import { ScheduleComposer, type SchedulePayload } from "./schedule-composer";
import { MessagesAgenda } from "./messages-agenda";
import { FunnelTab } from "./funnel/funnel-tab";
import { DestinoGrupos, useCargaDosEstados } from "./destino-grupos";
import { LinhaPostsHoje, usePostsHoje } from "./linha-posts-hoje";
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
  /** Falso com a aba Posts escondida (a campanha mantém montado): não consulta. */
  ativo?: boolean;
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
  ativo = true,
}: Props) {
  const { pedirConfirmacao, folhaDeConfirmacao } = useConfirmacao();
  const toast = useToast();
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
  // Sem grupo filho vinculado, "grupo a grupo" manda o destino (a regra padrão)
  // e a campanha sem grupos recebe 400 ("Esta campanha ainda não tem grupos…") —
  // o Avisos é a única opção que funciona, então começa nele em vez de num radio morto.
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
  // Regra por padrão (D5); mexer na lista vira lista fixa (D8). O Avisos é
  // sempre lista fixa de um grupo só, fora do seletor.
  const [destino, setDestino] = useState<Destino>(DESTINO_PADRAO);
  const estados = useCargaDosEstados(campaignSlug);
  const destinoDoEnvio: Destino = usarAvisos && avisoGroupId ? { grupos: [avisoGroupId] } : destino;
  // Os grupos que o post de "Enviar agora" alcança: o Avisos é um só e fica fora do seletor.
  const { dados: postsHoje, reler: relerPostsHoje } = usePostsHoje();
  const gruposDoEnvio =
    usarAvisos && avisoGroupId
      ? [avisoGroupId]
      : estados.carga === "pronto"
        ? selecionados(estados.grupos, destino)
        : [];

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
    if (ativo) void fetchMessages();
  }, [fetchMessages, ativo]);

  // A rota lê o histórico inteiro de posts: consultar a cada 10 s só com post
  // saindo ou agendado chegando na hora, com a aba do navegador visível e a
  // sub-aba Posts aberta. Lista parada não muda.
  const acompanhar = useCallback(() => {
    if (acompanharEnvio(messages, new Date())) void fetchMessages();
  }, [messages, fetchMessages]);
  useRecarga(acompanhar, 10_000, ativo);

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
          destino: destinoDoEnvio,
        }),
      }).catch(() => null);
      if (!res) {
        setSendError(ERRO_SEM_CONEXAO);
        return false;
      }
      if (res.ok) {
        await fetchMessages();
        setSubTab("Agenda");
        relerPostsHoje();
        return true;
      } else {
        // `alert()` nativo nao aceita link, entao quem batia no gate de plano
        // aqui lia a mensagem e ficava sem saida — justamente no momento de
        // maior intencao de compra: a pessoa ja escreveu a mensagem e clicou
        // em enviar.
        const erro = await toPlanLimitError(res, "Erro ao enviar mensagem.");
        setSendError(erro.message);
        setSendUpgradeUrl(erro.upgradeUrl);
        return false;
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
          destino: destinoDoEnvio,
        }),
      }).catch(() => null);
      if (!res) {
        setSendError(ERRO_SEM_CONEXAO);
        return false;
      }
      if (res.ok) {
        await fetchMessages();
        setSubTab("Agenda");
        return true;
      } else {
        const erro = await toPlanLimitError(res, "Erro ao agendar mensagem.");
        setSendError(erro.message);
        setSendUpgradeUrl(erro.upgradeUrl);
        return false;
      }
    } finally {
      setSending(false);
    }
  };

  // Antes só recarregava no sucesso: falha (ou rede caída) deixava o post
  // "Agendado" sem explicação, e ele saía. A `message` da rota diz quantos
  // grupos já tinham recebido.
  const handleCancel = async (id: string) => {
    try {
      const res = await fetch(`/api/campanhas/${campaignSlug}/messages/cancel?id=${id}`, {
        method: "PATCH",
      });
      const corpo = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (res.ok) toast(corpo.message ?? "Disparo cancelado.");
      else toast(corpo.error ?? "Não deu para cancelar: o post segue agendado.", "error");
    } catch {
      toast("Sem conexão: o post não foi cancelado e segue agendado.", "error");
    }
    await fetchMessages();
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
    let cancelouTudo = true;
    for (const id of ids) {
      const res = await fetch(`/api/campanhas/${campaignSlug}/messages/cancel?id=${id}`, { method: "PATCH" }).catch(
        () => null,
      );
      if (!res?.ok) {
        cancelouTudo = false;
        break;
      }
    }
    if (cancelouTudo) toast("Funil cancelado.");
    else toast("Parte do funil não foi cancelada. Confira a Agenda e tente de novo.", "error");
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
    return <div className="h-40 animate-pulse rounded-xl bg-paper-0" />;
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
      {!usarAvisos && subTab !== "Agenda" && (
        <DestinoGrupos estados={estados} value={destino} onChange={setDestino} />
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
          <MessageComposer
            onSend={handleSend}
            sending={sending}
            aviso={<LinhaPostsHoje dados={postsHoje} grupos={gruposDoEnvio} />}
          />
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
            destino={destinoDoEnvio}
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
