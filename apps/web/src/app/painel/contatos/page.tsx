"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { FaixaDoFiltro, textoDoFiltroVazio, tituloDoFiltro } from "@/components/painel/contatos/faixa-do-filtro";
import { ContatosVitrine } from "@/components/painel/contatos/vitrine/contatos-vitrine";
import { buscar } from "@/lib/painel/carregar";
import type { Carga, Lead } from "@/lib/painel/types";
import type { MonthlyOrder } from "@/lib/painel-metrics";
import { ehContatosDoAnuncio, filtroDaUrl, type FiltroDoAnuncio } from "@/lib/resultados/pessoas-do-anuncio";

export default function PainelContatos() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [pedidos, setPedidos] = useState<MonthlyOrder[]>([]);
  const [meta, setMeta] = useState<number | null>(null);
  // Sem isto, "R$ 0,00" por falha de rede fica igual a mês sem venda nenhuma.
  const [caixaOk, setCaixaOk] = useState(true);
  const [caixaCarregando, setCaixaCarregando] = useState(true);
  // Vindo da gaveta "Ver quem" (Resultados › Anúncios): só quem veio por um anúncio.
  const [filtro, setFiltro] = useState<FiltroDoAnuncio | null>(null);
  const [cargaDoFiltro, setCargaDoFiltro] = useState<Carga>("carregando");
  // "Ver todos" com o filtro ainda carregando dispara duas buscas: só a última escreve.
  const ultima = useRef(0);

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

  const carregarTodos = useCallback(() => {
    const esta = ++ultima.current;
    setLoading(true);
    fetch("/api/leads")
      .then((r) => r.json())
      .then((l) => {
        if (esta === ultima.current) setLeads(Array.isArray(l) ? l : []);
      })
      .catch(() => {})
      .finally(() => {
        if (esta === ultima.current) setLoading(false);
      });
  }, []);

  // Contatos do anúncio vêm da rota da gaveta (por id, em lotes): o `/api/leads`
  // para nas 1000 entradas mais recentes e quem já era do grupo ficaria de fora.
  const carregarFiltro = useCallback((f: FiltroDoAnuncio) => {
    const esta = ++ultima.current;
    void buscar(
      `/api/resultados/anuncios/pessoas?${f.busca}`,
      ehContatosDoAnuncio,
      (r) => {
        if (esta === ultima.current) setLeads(r.contatos);
      },
      (c) => {
        if (esta !== ultima.current) return;
        setCargaDoFiltro(c);
        setLoading(c === "carregando");
      },
    );
  }, []);

  // Lê a URL aqui e não com `useSearchParams`: sem fronteira de Suspense ele derruba o pré-render.
  useEffect(() => {
    const f = filtroDaUrl(window.location.search);
    setFiltro(f);
    if (f) carregarFiltro(f);
    else carregarTodos();
  }, [carregarFiltro, carregarTodos]);

  const verTodos = () => {
    window.history.replaceState(null, "", "/painel/contatos");
    setFiltro(null);
    carregarTodos();
  };

  const filtroVazio = filtro !== null && cargaDoFiltro === "ok" && leads.length === 0;

  return (
    <>
      {filtro && (
        <FaixaDoFiltro
          titulo={tituloDoFiltro(filtro.chave, filtro.lista)}
          carga={cargaDoFiltro}
          vazio={filtroVazio ? textoDoFiltroVazio(filtro.lista) : null}
          aoTentarDeNovo={() => carregarFiltro(filtro)}
          aoVerTodos={verTodos}
        />
      )}
      {/* Com filtro, erro e vazio ficam só na faixa: o vazio da Vitrine fala da loja inteira. */}
      {filtro && (cargaDoFiltro === "erro" || filtroVazio) ? null : (
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
      )}
    </>
  );
}
