"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { casaComFiltro, mesclarConversas, queryDaLista, SEM_FILTRO, trocarPrimeiraPagina, type FiltroDaLista } from "@/lib/ig/conversas/tela";
import type { ConversaDto, ListaDeConversas } from "@/lib/ig/conversas/tipos";

export type CargaDaLista = "carregando" | "ok" | "erro" | "sem-acesso";
/** A varredura da primeira abertura e do "Atualizar" (`POST /sync`). */
export type Varredura = { estado: "parada" | "rodando" | "feita" | "cedo" | "sem-conta" | "erro"; parcial: boolean; novas: number };
const PARADA: Varredura = { estado: "parada", parcial: false, novas: 0 };

/** Junta várias mudanças seguidas numa só consulta (cada uma custa saída do Supabase). */
const ESPERA_DA_RECARGA_MS = 1500;

type Pagina = { ok: true; dados: ListaDeConversas } | { ok: false; status: number };

async function lerPagina(filtro: FiltroDaLista, cursor?: string | null): Promise<Pagina> {
  try {
    const r = await fetch(`/api/ig/conversations?${queryDaLista(filtro, cursor)}`, { cache: "no-store" });
    return r.ok ? { ok: true, dados: (await r.json()) as ListaDeConversas } : { ok: false, status: r.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** A lista de conversas: filtros, páginas, o contador "aguardando você" e a varredura da Zernio. */
export function useConversas() {
  const [filtro, setFiltro] = useState<FiltroDaLista>(SEM_FILTRO);
  const [itens, setItens] = useState<ConversaDto[]>([]);
  const [proximo, setProximo] = useState<string | null>(null);
  const [aguardando, setAguardando] = useState(0);
  const [etiquetaParcial, setEtiquetaParcial] = useState(false);
  const [carga, setCarga] = useState<CargaDaLista>("carregando");
  const [maisFalhou, setMaisFalhou] = useState(false);
  const [varredura, setVarredura] = useState<Varredura>(PARADA);
  const pedido = useRef(0);
  const filtroAtual = useRef(filtro);
  const temMais = useRef(false);
  const jaVarreu = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    filtroAtual.current = filtro;
    temMais.current = proximo !== null;
  });

  const carregar = useCallback(async (f: FiltroDaLista, silencioso = false) => {
    const eu = ++pedido.current;
    if (!silencioso) setCarga("carregando");
    const r = await lerPagina(f);
    if (eu !== pedido.current) return null;
    if (!r.ok) {
      // Recarga em silêncio que falha não derruba a lista que já está na tela.
      if (!silencioso || r.status === 403) setCarga(r.status === 403 ? "sem-acesso" : "erro");
      return null;
    }
    setItens((atuais) => (silencioso ? trocarPrimeiraPagina(atuais, r.dados.conversas, r.dados.proximo !== null) : r.dados.conversas));
    setProximo(r.dados.proximo);
    setAguardando(r.dados.aguardando);
    setEtiquetaParcial(r.dados.etiquetaParcial === true);
    setMaisFalhou(false);
    setCarga("ok");
    return r.dados;
  }, []);

  const varrer = useCallback(async () => {
    setVarredura({ ...PARADA, estado: "rodando" });
    try {
      const r = await fetch("/api/ig/conversations/sync", { method: "POST" });
      const corpo = (await r.json().catch(() => null)) as { criadas?: number; parcial?: boolean; code?: string } | null;
      if (r.status === 429) return setVarredura({ ...PARADA, estado: "cedo" });
      if (r.status === 409 && corpo?.code === "sem_conta") return setVarredura({ ...PARADA, estado: "sem-conta" });
      if (!r.ok) return setVarredura({ ...PARADA, estado: "erro" });
      setVarredura({ estado: "feita", parcial: corpo?.parcial === true, novas: corpo?.criadas ?? 0 });
      await carregar(filtroAtual.current, true);
    } catch {
      setVarredura({ ...PARADA, estado: "erro" });
    }
  }, [carregar]);

  // Primeira abertura: lista vazia sem filtro nenhum chama a varredura uma vez (spec §7.11).
  const abrir = useCallback(
    async (f: FiltroDaLista) => {
      const dados = await carregar(f);
      if (dados && dados.conversas.length === 0 && f === SEM_FILTRO && !jaVarreu.current) {
        jaVarreu.current = true;
        void varrer();
      }
    },
    [carregar, varrer],
  );

  useEffect(() => {
    void abrir(filtro);
  }, [filtro, abrir]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const recarregar = useCallback(() => void carregar(filtroAtual.current, true), [carregar]);

  const maisAntigas = useCallback(async () => {
    if (!proximo) return;
    const r = await lerPagina(filtroAtual.current, proximo);
    if (!r.ok) return setMaisFalhou(true);
    setItens((atuais) => mesclarConversas(atuais, r.dados.conversas));
    setProximo(r.dados.proximo);
    setMaisFalhou(false);
  }, [proximo]);

  /** Mudança vinda do Realtime: acerta a linha na hora e confere a lista logo depois (ordem e contador). */
  const aplicarLinha = useCallback(
    (c: ConversaDto | null) => {
      if (c) {
        const f = filtroAtual.current;
        // Quem filtra por etiqueta não sabe pela linha se ela ainda casa: só a consulta decide.
        if (!f.etiqueta) setItens((atuais) => (casaComFiltro(c, f) ? mesclarConversas(atuais, [c]) : atuais.filter((x) => x.id !== c.id)));
      }
      clearTimeout(timer.current);
      timer.current = setTimeout(recarregar, ESPERA_DA_RECARGA_MS);
    },
    [recarregar],
  );

  /** Troca a linha por uma versão que a própria tela acabou de causar (ler, resolver, pausar). */
  const atualizarLinha = useCallback((c: ConversaDto) => setItens((atuais) => atuais.map((x) => (x.id === c.id ? c : x))), []);

  return { filtro, mudarFiltro: setFiltro, itens, proximo, aguardando, etiquetaParcial, carga, maisFalhou, varredura, maisAntigas, recarregar, aplicarLinha, atualizarLinha, atualizar: varrer };
}
