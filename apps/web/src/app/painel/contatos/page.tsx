"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FaixaDoFiltro, textoDoFiltroVazio, tituloDoFiltro } from "@/components/painel/contatos/faixa-do-filtro";
import { ContatosVitrine, type Contagens, type Filtro } from "@/components/painel/contatos/vitrine/contatos-vitrine";
import { casaComBusca, lerBuscaDeContato } from "@/lib/painel/busca-de-contato";
import { buscar } from "@/lib/painel/carregar";
import type { carregarContagemDeLeads } from "@/lib/painel/inicio-carga";
import type { Carga, Lead } from "@/lib/painel/types";
import type { MonthlyOrder } from "@/lib/painel-metrics";
import { ehContatosDoAnuncio, filtroDaUrl, type FiltroDoAnuncio } from "@/lib/resultados/pessoas-do-anuncio";

/** Contatos por página da loja; "Carregar mais" pede a próxima. */
const POR_PAGINA = 50;
/** A busca vai ao banco quando a lojista para de digitar, não a cada tecla. */
const ESPERA_DA_BUSCA_MS = 300;

type ContagemDeLeads = Awaited<ReturnType<typeof carregarContagemDeLeads>>;

function ehContagemDeLeads(corpo: unknown): corpo is ContagemDeLeads {
  const c = corpo as Partial<ContagemDeLeads> | null;
  return [c?.total, c?.clientes, c?.novos, c?.ativos].every((n) => typeof n === "number");
}

/** A lista do anúncio já vem inteira: a contagem dela sai da própria lista. */
function contarPorStatus(leads: readonly Lead[]): Contagens {
  const c: Contagens = { todos: leads.length, novo: 0, ativo: 0, comprou: 0 };
  for (const l of leads) c[l.status] += 1;
  return c;
}

export default function PainelContatos() {
  // Loja: as páginas já carregadas, filtradas no banco. Anúncio: a lista inteira.
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
  // Contada no banco: a lista para em 1000 linhas e loja grande passa disso.
  const [contagemDaLoja, setContagemDaLoja] = useState<Contagens | null>(null);
  const [cargaDaContagem, setCargaDaContagem] = useState<Carga>("carregando");
  const [status, setStatus] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [temMais, setTemMais] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);
  // "Ver todos" com o filtro ainda carregando dispara duas buscas: só a última escreve.
  const ultima = useRef(0);
  const esperaDaBusca = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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

  /**
   * Uma página da loja, com filtro e busca aplicados no banco: filtrar no
   * navegador a lista que para em 1000 deixava o cliente antigo fora de toda
   * busca. `offset` 0 troca a lista; maior, emenda tirando o repetido pelo id.
   */
  const carregarPagina = useCallback((recorte: Filtro, termo: string, offset: number) => {
    const esta = ++ultima.current;
    const params = new URLSearchParams({ offset: String(offset), limit: String(POR_PAGINA) });
    if (recorte !== "todos") params.set("status", recorte);
    if (termo.trim()) params.set("q", termo.trim());
    if (offset > 0) setCarregandoMais(true);
    fetch(`/api/leads?${params}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((corpo: unknown) => {
        if (esta !== ultima.current) return;
        const pagina = Array.isArray(corpo) ? (corpo as Lead[]) : [];
        setTemMais(pagina.length === POR_PAGINA);
        setLeads((atuais) => {
          if (offset === 0) return pagina;
          const vistos = new Set(atuais.map((l) => l.id));
          return [...atuais, ...pagina.filter((l) => !vistos.has(l.id))];
        });
      })
      .catch(() => {
        // Sem limpar, a lista de outro filtro ficaria na tela como se fosse a resposta.
        if (esta === ultima.current && offset === 0) setLeads([]);
      })
      .finally(() => {
        if (esta !== ultima.current) return;
        setLoading(false);
        setCarregandoMais(false);
      });
  }, []);

  const carregarTodos = useCallback(
    (recorte: Filtro, termo: string) => {
      setLoading(true);
      // Sem limpar, a lista filtrada ficaria na tela como se fosse a loja inteira se a busca falhar.
      setLeads([]);
      void buscar(
        "/api/leads/contagem",
        ehContagemDeLeads,
        (c) => setContagemDaLoja({ todos: c.total, novo: c.novos, ativo: c.ativos, comprou: c.clientes }),
        (carga) => {
          setCargaDaContagem(carga);
          if (carga === "erro") setContagemDaLoja(null);
        },
      );
      carregarPagina(recorte, termo, 0);
    },
    [carregarPagina],
  );

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
    else carregarTodos("todos", "");
  }, [carregarFiltro, carregarTodos]);

  const verTodos = () => {
    window.history.replaceState(null, "", "/painel/contatos");
    setFiltro(null);
    carregarTodos(status, busca);
  };

  // Na loja, filtro e busca vão ao banco; na lista do anúncio, recortam o que já está aqui.
  const mudarStatus = (s: Filtro) => {
    setStatus(s);
    if (filtro) return;
    clearTimeout(esperaDaBusca.current);
    carregarPagina(s, busca, 0);
  };
  const mudarBusca = (b: string) => {
    setBusca(b);
    if (filtro) return;
    clearTimeout(esperaDaBusca.current);
    esperaDaBusca.current = setTimeout(() => carregarPagina(status, b, 0), ESPERA_DA_BUSCA_MS);
  };

  const doAnuncio = useMemo(() => (filtro ? contarPorStatus(leads) : null), [filtro, leads]);
  const visiveis = useMemo(() => {
    if (!filtro) return leads;
    const termo = lerBuscaDeContato(busca);
    return leads.filter((l) => (status === "todos" || l.status === status) && casaComBusca(l, termo));
  }, [filtro, leads, status, busca]);

  const filtroVazio = filtro !== null && cargaDoFiltro === "ok" && leads.length === 0;
  // Nesses casos a Vitrine (dona do <h1>) não aparece: a página mantém o título.
  const soFaixa = filtro !== null && (cargaDoFiltro === "erro" || filtroVazio);

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
          carga={cargaDoFiltro}
          vazio={filtroVazio ? textoDoFiltroVazio(filtro.lista) : null}
          aoTentarDeNovo={() => carregarFiltro(filtro)}
          aoVerTodos={verTodos}
        />
      )}
      {/* Com filtro, erro e vazio ficam só na faixa: o vazio da Vitrine fala da loja inteira. */}
      {soFaixa ? null : (
        <ContatosVitrine
          contatos={visiveis}
          contagens={doAnuncio ?? contagemDaLoja}
          filtro={status}
          onFiltro={mudarStatus}
          busca={busca}
          onBusca={mudarBusca}
          temMais={!filtro && temMais}
          carregandoMais={carregandoMais}
          onCarregarMais={() => carregarPagina(status, busca, leads.length)}
          pedidos={pedidos}
          meta={meta}
          carregando={loading || caixaCarregando || (!filtro && cargaDaContagem === "carregando")}
          caixaOk={caixaOk}
          onPedidoRegistrado={(leadId, valor) => {
            // Soma no total na hora: o caixa do rodapé sobe sem esperar o refetch.
            setPedidos((p) => [...p, { value: valor, created_at: new Date().toISOString() }]);
            // O servidor promove o lead a cliente; sem isto o chip ficava em "NOVO"
            // e os contadores de filtro não subiam até um reload.
            const antes = leads.find((x) => x.id === leadId)?.status;
            setLeads((l) => l.map((x) => (x.id === leadId ? { ...x, status: "comprou" } : x)));
            if (antes && antes !== "comprou") {
              setContagemDaLoja((c) => c && { ...c, [antes]: c[antes] - 1, comprou: c.comprou + 1 });
            }
          }}
        />
      )}
    </>
  );
}
