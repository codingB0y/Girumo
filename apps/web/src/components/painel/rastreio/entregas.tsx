"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

import { useConfirmacao } from "@/components/painel/confirmacao";
import { ErroDeCarga } from "@/components/painel/erro-de-carga";
import { useRole } from "@/components/painel/role-provider";
import { useToast } from "@/components/toast";
import {
  parseFiltroDeEntregas,
  rotuloDaSituacao,
  type FiltroDeEntregas,
  type LinhaDeEntrega,
  type RespostaDeEntregas,
} from "@/lib/rastreio/entregas";
import { authenticatedFetch } from "@/lib/supabase/client";

import { AbasDeVendas } from "./abas-de-vendas";
import { TabelaDeEntregas } from "./entregas-tabela";
import { useRastreioLiberado } from "./use-rastreio-liberado";

type Carga = "carregando" | "ok" | "erro" | "desligado";
type Consulta = { filtro: FiltroDeEntregas; busca: string; pagina: number; pedido: string | null };

const ATRASO_DA_BUSCA_MS = 350;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FALHA_DO_REENVIO = "Não deu para reenviar o aviso.";
const COLUNA = "mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-5 lg:py-8";

/** Vendas › Entregas (Rastreio, PR 6): estado e chamadas; o desenho é `TabelaDeEntregas`. */
export default function Entregas() {
  const { can, carregado } = useRole();
  const toast = useToast();
  const { pedirConfirmacao, folhaDeConfirmacao } = useConfirmacao();
  const pode = carregado && can("settings:connection");
  const rastreioLiberado = useRastreioLiberado();

  const [carga, setCarga] = useState<Carga>("carregando");
  const [resposta, setResposta] = useState<RespostaDeEntregas | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [reenviando, setReenviando] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroDeEntregas>("todos");
  const [busca, setBusca] = useState("");
  const [pedido, setPedido] = useState<string | null>(null);

  // Só a última consulta escreve estado; o desmonte também invalida.
  const ultima = useRef(0);
  const atraso = useRef<ReturnType<typeof setTimeout> | null>(null);
  const atual = useRef<Consulta>({ filtro: "todos", busca: "", pagina: 1, pedido: null });

  const consultar = useCallback(async (c: Consulta) => {
    atual.current = c;
    const minha = ++ultima.current;
    setCarregando(true);
    try {
      // Sempre POST: a busca leva CPF/CNPJ e documento não vai na URL.
      const res = await authenticatedFetch("/api/rastreio/entregas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filtro: c.filtro,
          ...(c.busca.trim() ? { busca: c.busca.trim() } : {}),
          pagina: c.pagina,
          ...(c.pedido ? { pedido: c.pedido } : {}),
        }),
      });
      if (minha !== ultima.current) return;
      if (res.status === 403) {
        const corpo = (await res.json().catch(() => ({}))) as { code?: string };
        if (minha !== ultima.current) return;
        if (corpo.code !== "rastreio_disabled") throw new Error("403");
        setCarga("desligado");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const dados = (await res.json()) as RespostaDeEntregas;
      if (minha !== ultima.current) return;
      setResposta(dados);
      setErro(null);
      setCarga("ok");
    } catch {
      if (minha !== ultima.current) return;
      // Com a tela já montada o erro vira aviso na tabela; sem ela, vira a tela de erro.
      setCarga((anterior) => (anterior === "ok" ? anterior : "erro"));
      setErro("Não deu para atualizar a lista.");
    } finally {
      if (minha === ultima.current) setCarregando(false);
    }
  }, []);

  // Filtro e pedido vêm da URL (sininho do PR 2, link da Yampi) antes da primeira consulta.
  useEffect(() => {
    if (!pode) return;
    const q = new URLSearchParams(window.location.search);
    const f = parseFiltroDeEntregas(q.get("filtro"));
    const p = q.get("pedido");
    const ped = p && UUID.test(p) ? p : null;
    setFiltro(f);
    setPedido(ped);
    void consultar({ filtro: f, busca: "", pagina: 1, pedido: ped });
  }, [pode, consultar]);

  useEffect(
    () => () => {
      ultima.current++;
      if (atraso.current) clearTimeout(atraso.current);
    },
    [],
  );

  /**
   * Consulta já, levando a busca digitada: cancela o atraso pendente, senão ele dispara depois e
   * sobrescreve a página/filtro novos com a consulta velha. Busca mudada volta pra página 1.
   */
  function consultarJa(parcial: Partial<Consulta>) {
    if (atraso.current) clearTimeout(atraso.current);
    atraso.current = null;
    const novaBusca = busca !== atual.current.busca;
    void consultar({ ...atual.current, busca, ...parcial, ...(novaBusca ? { pagina: 1 } : {}) });
  }

  function filtrar(f: FiltroDeEntregas) {
    setFiltro(f);
    consultarJa({ filtro: f, pagina: 1 });
  }

  function buscar(b: string) {
    setBusca(b);
    if (atraso.current) clearTimeout(atraso.current);
    atraso.current = setTimeout(() => void consultar({ ...atual.current, busca: b, pagina: 1 }), ATRASO_DA_BUSCA_MS);
  }

  function verTodos() {
    setPedido(null);
    consultarJa({ pedido: null, pagina: 1 });
  }

  async function reenviar(l: LinhaDeEntrega) {
    const ok = await pedirConfirmacao({
      titulo: "Reenviar o aviso?",
      texto: `A compradora recebe “${rotuloDaSituacao(l).texto}” de novo, pelos canais ligados. O envio sai em até 5 minutos.`,
      rotulo: "Reenviar",
    });
    if (!ok) return;
    setReenviando(l.id);
    try {
      const res = await authenticatedFetch(`/api/rastreio/entregas/${l.id}/reenviar`, { method: "POST" });
      const corpo = (await res.json().catch(() => ({}))) as { error?: unknown; reabertos?: unknown };
      if (!res.ok) {
        toast(typeof corpo.error === "string" && corpo.error ? corpo.error : FALHA_DO_REENVIO, "error");
        return;
      }
      toast(corpo.reabertos === 0 ? "O aviso já está saindo." : "Aviso reenviado. Sai em até 5 minutos.");
      await consultar(atual.current);
    } catch {
      toast(FALHA_DO_REENVIO, "error");
    } finally {
      setReenviando(null);
    }
  }

  if (carregado && !can("settings:connection")) {
    return (
      <div className={COLUNA}>
        <p className="text-sm text-neutral-700">Entregas é só do dono e da administração da loja.</p>
      </div>
    );
  }

  return (
    <div className={COLUNA}>
      <AbasDeVendas ativa="entregas" visivel={rastreioLiberado && carga !== "desligado"} />
      <header>
        <h1 className="font-brand text-28 font-bold tracking-[-0.4px] text-volt-950">Entregas</h1>
      </header>

      {carga === "desligado" ? (
        <p className="text-sm text-neutral-700">O Rastreio de pedidos ainda não foi liberado para a sua loja.</p>
      ) : carga === "erro" ? (
        <ErroDeCarga
          titulo="Não deu para carregar as entregas."
          aoTentarDeNovo={() => {
            setCarga("carregando");
            void consultar(atual.current);
          }}
        />
      ) : !resposta ? (
        <div className="pn-skeleton h-64 w-full" aria-busy="true" />
      ) : (
        <>
          {pedido && (
            <p className="flex items-center gap-2 text-sm">
              Mostrando o pedido nº {resposta.linhas[0]?.numero ?? "—"}.
              <button type="button" className="underline" onClick={verTodos}>
                Ver todos
              </button>
            </p>
          )}
          <TabelaDeEntregas
            resposta={resposta}
            filtro={filtro}
            busca={busca}
            carregando={carregando}
            erro={erro}
            aoFiltrar={filtrar}
            aoBuscar={buscar}
            aoPaginar={(p) => consultarJa({ pagina: p })}
            aoReenviar={(l) => void reenviar(l)}
            reenviando={reenviando}
          />
        </>
      )}
      {folhaDeConfirmacao}
    </div>
  );
}
