"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { buildDuplicatePayload } from "@/lib/pages/duplicate";
import type { LandingPage } from "@/lib/pages/schema";
import { PagesVitrine } from "@/components/painel/pages/vitrine/pages-vitrine";
import type { Carga } from "@/lib/painel/types";

export default function PagesListPage() {
  const router = useRouter();
  const [pages, setPages] = useState<LandingPage[] | null>(null);
  const [cargaDaLista, setCargaDaLista] = useState<Carga>("carregando");
  const [erroDaDuplicacao, setErroDaDuplicacao] = useState<string | null>(null);
  const [duplicando, setDuplicando] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  /**
   * Falhar ao carregar troca a cena; falhar ao duplicar é um aviso que
   * convive com a lista — sumir com as páginas por causa de um botão
   * perderia o trabalho de vista. Por isso cargaDaLista e erroDaDuplicacao
   * são sinais separados.
   */
  const carregar = useCallback(() => {
    setOrigin(window.location.origin);
    setCargaDaLista("carregando");
    fetch("/api/pages", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Falha ao carregar."))))
      .then((data: LandingPage[]) => {
        if (!Array.isArray(data)) throw new Error("Resposta fora do formato.");
        setPages(data);
        setCargaDaLista("ok");
      })
      .catch(() => setCargaDaLista("erro"));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  /**
   * Duplica a partir do GET de detalhe, não do item da lista: a lista pode vir
   * com um subconjunto de colunas, e copiar de lá perderia campo em silêncio.
   * A cópia nasce rascunho e sem campanha — ver lib/pages/duplicate.ts.
   */
  async function duplicar(id: string) {
    if (duplicando) return;
    setDuplicando(id);
    setErroDaDuplicacao(null);

    try {
      const detalhe = await fetch(`/api/pages/${id}`);
      if (!detalhe.ok) throw new Error("Não consegui ler a página original.");
      const { page } = (await detalhe.json()) as { page: LandingPage };

      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildDuplicatePayload(page)),
      });
      const nova = (await res.json()) as LandingPage & { error?: string; details?: string[] };
      if (!res.ok) {
        throw new Error(nova.details?.join(" ") ?? nova.error ?? "Não consegui duplicar.");
      }

      router.push(`/painel/pages/${nova.id}`);
    } catch (e) {
      setErroDaDuplicacao(e instanceof Error ? e.message : "Não consegui duplicar.");
      setDuplicando(null);
    }
  }

  // PR 10 da Vitrine Aberta: a página vira etiqueta de peça, com a conversão
  // no lugar das vagas. Nenhuma consulta, efeito ou storage entra ou sai por
  // causa da flag — só o desenho muda.
  return (
    <PagesVitrine
      paginas={pages ?? []}
      carga={cargaDaLista}
      origin={origin}
      avisoDeDuplicacao={erroDaDuplicacao}
      duplicando={duplicando}
      aoDuplicar={(id) => void duplicar(id)}
      aoTentarDeNovo={carregar}
    />
  );
}
