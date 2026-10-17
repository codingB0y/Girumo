"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { FaixaDoFiltro, textoDoFiltroVazio, tituloDoFiltro } from "@/components/painel/contatos/faixa-do-filtro";
import { ContatosVitrine } from "@/components/painel/contatos/vitrine/contatos-vitrine";
import { buscar, buscarLista } from "@/lib/painel/carregar";
import type { Carga, Lead } from "@/lib/painel/types";
import type { MonthlyOrder } from "@/lib/painel-metrics";
import { ehContatosDoAnuncio, filtroDaUrl, type FiltroDoAnuncio } from "@/lib/resultados/pessoas-do-anuncio";

export default function PainelContatos() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pedidos, setPedidos] = useState<MonthlyOrder[]>([]);
  const [meta, setMeta] = useState<number | null>(null);
  // Sem isto, "R$ 0,00" por falha de rede fica igual a mês sem venda nenhuma.
  const [caixaOk, setCaixaOk] = useState(true);
  const [caixaCarregando, setCaixaCarregando] = useState(true);
  // Vindo da gaveta "Ver quem" (Resultados › Anúncios): só quem veio por um anúncio.
  const [filtro, setFiltro] = useState<FiltroDoAnuncio | null>(null);
  // Da lista que está na tela: a inteira ou a do filtro. Erro nunca vira "ninguém entrou".
  const [cargaDaLista, setCargaDaLista] = useState<Carga>("carregando");
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
    // Sem limpar, a lista filtrada ficaria na tela como se fosse a loja inteira se a busca falhar.
    setLeads([]);
    void buscarLista<Lead>(
      "/api/leads",
      (l) => {
        if (esta === ultima.current) setLeads(l);
      },
      (c) => {
        if (esta === ultima.current) setCargaDaLista(c);
      },
    );
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
        if (esta === ultima.current) setCargaDaLista(c);
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

  const filtroVazio = filtro !== null && cargaDaLista === "ok" && leads.length === 0;
  // Nesses casos a Vitrine (dona do <h1>) não aparece: a página mantém o título.
  const soFaixa = filtro !== null && (cargaDaLista === "erro" || filtroVazio);

  return (
    <>
      {soFaixa && (
        <div className="px-4 pt-5 lg:px-8 lg:pt-8">
          <h1 className="font-brand text-28 font-bold tracking-[-0.4px] text-volt-950">Contatos</h1>
        </div>
      )}
      {filtro && (
        <FaixaDoFiltro
          titulo={tituloDoFiltro(filtro.chave, filtro.lista)}
          carga={cargaDaLista}
          vazio={filtroVazio ? textoDoFiltroVazio(filtro.lista) : null}
          aoTentarDeNovo={() => carregarFiltro(filtro)}
          aoVerTodos={verTodos}
        />
      )}
      {/* Com filtro, erro e vazio ficam só na faixa: o vazio da Vitrine fala da loja inteira. */}
      {soFaixa ? null : (
        <ContatosVitrine
          contatos={leads}
          pedidos={pedidos}
          meta={meta}
          carregando={cargaDaLista === "carregando" || caixaCarregando}
          caixaOk={caixaOk}
          listaOk={cargaDaLista !== "erro"}
          aoTentarDeNovo={carregarTodos}
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
