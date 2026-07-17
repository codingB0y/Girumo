"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { MessageComposer, type ComposerPayload } from "./message-composer";
import { ScheduleComposer, type SchedulePayload } from "./schedule-composer";
import { MessagesAgenda } from "./messages-agenda";
import type { CampaignMessage } from "@/lib/messages-store";

const SUB_TABS = ["Enviar agora", "Agendar", "Agenda"] as const;
type SubTab = (typeof SUB_TABS)[number];

type Props = {
  campaignSlug: string;
  groupIds: string[];
};

export function MessagesTab({ campaignSlug, groupIds }: Props) {
  const [subTab, setSubTab] = useState<SubTab>("Enviar agora");
  const [messages, setMessages] = useState<CampaignMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

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
    try {
      const res = await fetch(`/api/campanhas/${campaignSlug}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          groupIds,
        }),
      });
      if (res.ok) {
        await fetchMessages();
        setSubTab("Agenda");
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "Erro ao enviar mensagem.");
      }
    } finally {
      setSending(false);
    }
  };

  const handleSchedule = async (payload: SchedulePayload) => {
    setSending(true);
    try {
      const res = await fetch(`/api/campanhas/${campaignSlug}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          groupIds,
        }),
      });
      if (res.ok) {
        await fetchMessages();
        setSubTab("Agenda");
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "Erro ao agendar mensagem.");
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

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir essa mensagem?")) return;
    const res = await fetch(`/api/campanhas/${campaignSlug}/messages?id=${id}`, {
      method: "DELETE",
    });
    if (res.ok) await fetchMessages();
  };

  if (loading) {
    return <div className="h-40 animate-pulse rounded-2xl bg-white" />;
  }

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1">
        {SUB_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-medium transition",
              subTab === t
                ? "bg-cobalt-500/10 text-cobalt-500"
                : "text-aco/55 hover:bg-canvas-100 hover:text-volt-950",
            )}
          >
            {t}
            {t === "Agenda" && messages.length > 0 && (
              <span className="ml-1.5 rounded-full bg-cobalt-500/20 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-cobalt-500">
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
            onDelete={handleDelete}
          />
        )}
      </div>
    </div>
  );
}
