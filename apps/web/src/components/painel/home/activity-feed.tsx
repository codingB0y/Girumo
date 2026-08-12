"use client";

import { useMemo } from "react";
import { ArrowRight, History, Send, ShoppingBag, UserPlus } from "lucide-react";
import { buildActivityFeed, timeAgo, type ActivityItem } from "@/lib/activity-feed";
import { EmptyState } from "@/components/painel/empty-state";
import { brl } from "./format";
import type { Lead, Order, Schedule } from "./types";

/** Quantas ocorrências cabem antes de virar histórico, que é outra tela. */
const MAX_ITEMS = 10;

const STYLE: Record<ActivityItem["kind"], { icon: typeof UserPlus; tint: string }> = {
  lead: { icon: UserPlus, tint: "bg-cobalt-500/10 text-cobalt-500" },
  order: { icon: ShoppingBag, tint: "bg-sucesso/10 text-sucesso" },
  broadcast: { icon: Send, tint: "bg-aco/10 text-aco" },
};

function describe(item: ActivityItem): { title: string; detail: string } {
  switch (item.kind) {
    case "lead":
      return {
        title: item.name,
        detail: item.group ? `entrou em ${item.group}` : "entrou num grupo",
      };
    case "order":
      return { title: brl.format(item.value), detail: "pedido registrado" };
    case "broadcast":
      return { title: item.campaignName, detail: "disparada nos grupos" };
  }
}

/**
 * As últimas ocorrências da loja, só leitura.
 *
 * Montado a partir de leads, pedidos e disparos que a Início já carregou — sem
 * tabela de eventos nova. Ver `lib/activity-feed.ts`.
 */
export function ActivityFeed({
  leads,
  orders,
  schedules,
}: {
  leads: Lead[];
  orders: Order[];
  schedules: Schedule[];
}) {
  const items = useMemo(
    () => buildActivityFeed({ leads, orders, schedules }, MAX_ITEMS),
    [leads, orders, schedules],
  );

  if (items.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="Nada aconteceu ainda"
        description="Entradas nos grupos, pedidos e disparos aparecem aqui assim que começarem a rolar."
        ctaLabel="Ver campanhas"
        ctaHref="/painel/campanhas"
        ctaIcon={ArrowRight}
      />
    );
  }

  return (
    <ol className="pn-card rounded-2xl p-2">
      {items.map((item) => {
        const { icon: Icon, tint } = STYLE[item.kind];
        const { title, detail } = describe(item);
        const when = timeAgo(item.at);

        return (
          <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <span className="flex min-w-0 items-center gap-3">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tint}`}
                aria-hidden="true"
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 text-sm">
                <span className="font-medium text-volt-950">{title}</span>{" "}
                <span className="text-aco/65">{detail}</span>
              </span>
            </span>
            <time
              dateTime={item.at}
              className="font-data shrink-0 text-[11px] tabular-nums text-aco/50"
            >
              {when}
            </time>
          </li>
        );
      })}
    </ol>
  );
}
