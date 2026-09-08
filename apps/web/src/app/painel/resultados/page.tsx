"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ResultadosVitrine } from "@/components/painel/resultados/vitrine/resultados-vitrine";
import { buscarLista } from "@/lib/painel/carregar";
import type { Group } from "@/lib/mock-data";
import type { Carga } from "@/lib/painel/types";

type Campanha = { id: string; name: string; groupIds: string[]; slug?: string; createdAt: string };
type TrackedLink = { campaignName?: string; clicks: number };
type Lead = { status: "novo" | "ativo" | "comprou" };
type Order = { id: string; value: number; group_name?: string | null; campaign_id?: string | null };

export default function PainelResultados() {
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [links, setLinks] = useState<TrackedLink[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cargaDasCampanhas, setCargaDasCampanhas] = useState<Carga>("carregando");
  const [cargaDosGrupos, setCargaDosGrupos] = useState<Carga>("carregando");
  const [cargaDosLinks, setCargaDosLinks] = useState<Carga>("carregando");
  const [cargaDosLeads, setCargaDosLeads] = useState<Carga>("carregando");
  const [cargaDosPedidos, setCargaDosPedidos] = useState<Carga>("carregando");

  /**
   * Uma carga por rota. Antes as cinco consultas caíam num `.catch(() => [])`
   * e o erro virava lista vazia — uma falha em /api/orders imprimia
   * "R$ 0,00" em Vendas desde o início, com cara de caixa fechado.
   */
  const carregar = useCallback(() => {
    void buscarLista<Campanha>("/api/campanhas", setCampanhas, setCargaDasCampanhas);
    void buscarLista<Group>("/api/groups", setGroups, setCargaDosGrupos);
    void buscarLista<TrackedLink>("/api/links", setLinks, setCargaDosLinks);
    void buscarLista<Lead>("/api/leads", setLeads, setCargaDosLeads);
    void buscarLista<Order>("/api/orders", setOrders, setCargaDosPedidos);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const totalClicks = useMemo(() => links.reduce((a, l) => a + (l.clicks ?? 0), 0), [links]);
  const totalEntradas = leads.length;
  const clientes = useMemo(() => leads.filter((l) => l.status === "comprou").length, [leads]);

  // PR 11 da Vitrine Aberta: o quadro de giz do balcão. Cada número sabe de
  // qual consulta veio, e quem não respondeu mostra travessão em vez de zero.
  return (
    <ResultadosVitrine
      links={{ cliques: totalClicks, carga: cargaDosLinks }}
      grupos={{ lista: groups, carga: cargaDosGrupos }}
      leads={{ entradas: totalEntradas, clientes, carga: cargaDosLeads }}
      pedidos={{ lista: orders, carga: cargaDosPedidos }}
      campanhas={{ lista: campanhas, carga: cargaDasCampanhas }}
      aoTentarDeNovo={carregar}
    />
  );
}
