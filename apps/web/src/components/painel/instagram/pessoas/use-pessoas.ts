"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ListaDePessoas } from "@/lib/ig/pessoas-tipos";
import type { ContactStats } from "@/lib/stores/ig-contacts";

export type Recencia = "24h" | "7d" | "30d" | "tudo";
export type Filtros = { q: string; tags: string[]; campo: string; valor: string; recencia: Recencia };
export const SEM_FILTRO: Filtros = { q: "", tags: [], campo: "", valor: "", recencia: "tudo" };

/** Os filtros na URL das rotas (`?q=&tags=a,b&campo=&valor=&recencia=&pagina=`). */
export function queryDosFiltros(f: Filtros, pagina = 1): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.tags.length) p.set("tags", f.tags.join(","));
  if (f.campo && f.valor) {
    p.set("campo", f.campo);
    p.set("valor", f.valor);
  }
  if (f.recencia !== "tudo") p.set("recencia", f.recencia);
  if (pagina > 1) p.set("pagina", String(pagina));
  return p.toString();
}

export type Leitura<T> = { ok: true; dados: T } | { ok: false; status: number; code: string | null };

/** GET que separa "não deu pra ler" (rede, 5xx) de "sem acesso" (403 com `code`). */
export async function lerJson<T>(url: string): Promise<Leitura<T>> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (r.ok) return { ok: true, dados: (await r.json()) as T };
    const corpo = (await r.json().catch(() => null)) as { code?: string } | null;
    return { ok: false, status: r.status, code: corpo?.code ?? null };
  } catch {
    return { ok: false, status: 0, code: null };
  }
}

export type CargaPessoas = "carregando" | "ok" | "erro" | "sem-acesso";

/** Lista (com filtros e página) + números. Resposta atrasada de um filtro antigo nunca sobrepõe a do atual. */
export function usePessoas() {
  const [filtros, setFiltros] = useState<Filtros>(SEM_FILTRO);
  const [pagina, setPagina] = useState(1);
  const [lista, setLista] = useState<ListaDePessoas | null>(null);
  const [stats, setStats] = useState<ContactStats | null>(null);
  const [carga, setCarga] = useState<CargaPessoas>("carregando");
  const [codigo, setCodigo] = useState<string | null>(null);
  const pedido = useRef(0);

  const carregar = useCallback(async () => {
    const eu = ++pedido.current;
    setCarga("carregando");
    const [l, s] = await Promise.all([lerJson<ListaDePessoas>(`/api/ig/contacts?${queryDosFiltros(filtros, pagina)}`), lerJson<{ stats: ContactStats }>("/api/ig/contacts/stats")]);
    if (eu !== pedido.current) return;
    if (!l.ok) {
      setCodigo(l.code);
      setCarga(l.status === 403 ? "sem-acesso" : "erro");
      return;
    }
    setLista(l.dados);
    if (s.ok) setStats(s.dados.stats);
    setCarga("ok");
  }, [filtros, pagina]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const mudarFiltros = useCallback((f: Filtros) => {
    setFiltros(f);
    setPagina(1);
  }, []);

  return { filtros, mudarFiltros, pagina, setPagina, lista, stats, carga, codigo, recarregar: carregar };
}
