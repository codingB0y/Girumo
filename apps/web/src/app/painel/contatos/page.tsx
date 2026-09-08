"use client";

import { useEffect, useState } from "react";
import type { Lead } from "@/lib/painel/types";
import { ContatosVitrine } from "@/components/painel/contatos/vitrine/contatos-vitrine";
import type { MonthlyOrder } from "@/lib/painel-metrics";

export default function PainelContatos() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [pedidos, setPedidos] = useState<MonthlyOrder[]>([]);
  const [meta, setMeta] = useState<number | null>(null);
  // Sem isto, "R$ 0,00" por falha de rede fica igual a mês sem venda nenhuma.
  const [caixaOk, setCaixaOk] = useState(true);
  const [caixaCarregando, setCaixaCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    Promise.all([
      fetch("/api/orders").then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))),
      fetch("/api/settings").then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))),
    ])
      .then(([o, s]) => {
        if (!vivo) return;
        setPedidos(Array.isArray(o) ? o : []);
        setMeta(typeof s?.monthlyGoalRevenue === "number" ? s.monthlyGoalRevenue : null);
      })
      .catch(() => {
        if (vivo) setCaixaOk(false);
      })
      .finally(() => {
        if (vivo) setCaixaCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    fetch("/api/leads")
      .then((r) => r.json())
      .then((l) => setLeads(Array.isArray(l) ? l : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <ContatosVitrine
      contatos={leads}
      pedidos={pedidos}
      meta={meta}
      carregando={loading || caixaCarregando}
      caixaOk={caixaOk}
      onPedidoRegistrado={(leadId, valor) => {
        // Soma no total na hora: o caixa do rodapé sobe sem esperar o refetch.
        setPedidos((p) => [...p, { value: valor, created_at: new Date().toISOString() }]);
        // O servidor promove o lead a cliente; sem isto o chip ficava em "NOVO"
        // e os contadores de filtro não subiam até um reload.
        setLeads((l) => l.map((x) => (x.id === leadId ? { ...x, status: "comprou" } : x)));
      }}
    />
  );
}
