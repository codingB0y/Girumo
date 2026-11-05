"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRole } from "@/components/painel/role-provider";
import { campanhasParaConvite, type CampanhaDoConvite } from "@/lib/ig/conversas/campo";
import { guardarNoCache, lerDoCache } from "./cache-da-loja";
import type { Resultado } from "./use-fio";

const BOTAO = "inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-13 font-medium text-volt-950 disabled:opacity-50 lg:min-h-9";
const ID_TITULO = "ig-convite-do-grupo-titulo";
const ESPACO = "campanhas-do-convite";

type Props = {
  aoConvidar: (campanhaId: string) => Promise<Resultado>;
  /** Fecha o painel; quem o abriu devolve o foco ao botão. */
  aoFechar: () => void;
};

type Carga = "carregando" | "ok" | "erro";

/** Escolhe a campanha e manda o texto com o botão "Entrar no grupo VIP" (spec §7.9). A lista vem de `/api/campanhas`, guardada por loja. */
export function ConviteDoGrupo({ aoConvidar, aoFechar }: Props) {
  const { tenantId } = useRole();
  const [campanhas, setCampanhas] = useState<CampanhaDoConvite[]>([]);
  const [carga, setCarga] = useState<Carga>("carregando");
  const [escolhida, setEscolhida] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const painel = useRef<HTMLElement>(null);
  const emVoo = useRef(false);

  useEffect(() => {
    let vivo = true;
    const aplicar = (lista: CampanhaDoConvite[]) => {
      setCampanhas(lista);
      setEscolhida(lista.length === 1 ? lista[0].id : "");
      setCarga("ok");
    };
    const guardada = lerDoCache<CampanhaDoConvite[]>(ESPACO, tenantId);
    if (guardada) {
      aplicar(guardada);
      return;
    }
    fetch("/api/campanhas", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error("falhou");
        const lista = campanhasParaConvite(await r.json());
        guardarNoCache(ESPACO, tenantId, lista);
        if (vivo) aplicar(lista);
      })
      .catch(() => vivo && setCarga("erro"));
    return () => {
      vivo = false;
    };
  }, [tenantId]);

  // O foco vai ao primeiro controle: o botão Cancelar enquanto carrega, a escolha da campanha quando chega.
  useEffect(() => {
    painel.current?.querySelector<HTMLElement>("select, button:not(:disabled)")?.focus();
  }, [carga]);

  const enviar = async () => {
    if (!escolhida || emVoo.current) return;
    emVoo.current = true;
    setEnviando(true);
    setErro(null);
    const r = await aoConvidar(escolhida);
    emVoo.current = false;
    setEnviando(false);
    if (r.ok) aoFechar();
    else setErro(r.mensagem);
  };

  return (
    <section
      ref={painel}
      aria-labelledby={ID_TITULO}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          aoFechar();
        }
      }}
      className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 p-3"
    >
      <h3 id={ID_TITULO} className="text-14 font-semibold text-volt-950">Convite do grupo</h3>
      <p className="text-13 text-slate-600">Manda o link do grupo VIP da campanha num botão &ldquo;Entrar no grupo VIP&rdquo;.</p>
      {carga === "carregando" && <p role="status" className="text-13 text-slate-600">Carregando as campanhas…</p>}
      {carga === "erro" && <p role="alert" className="text-13 text-danger-700">Não deu pra carregar as campanhas.</p>}
      {carga === "ok" && campanhas.length === 0 && <p role="status" className="text-13 text-slate-600">Você ainda não tem campanha com link. Crie uma em Campanhas.</p>}
      {carga === "ok" && campanhas.length > 0 && (
        <label className="flex flex-col gap-1 text-13 font-medium text-volt-950">
          Campanha
          <select value={escolhida} disabled={enviando} onChange={(e) => setEscolhida(e.target.value)} className="min-h-11 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-2 text-14 text-volt-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500 lg:min-h-9">
            <option value="">Escolha a campanha</option>
            {campanhas.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </label>
      )}
      {erro && <p role="alert" className="text-13 text-danger-700">{erro}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => void enviar()} disabled={!escolhida || enviando} className={`${BOTAO} border-cobalt-500 bg-cobalt-500 text-paper-0`}>{enviando ? "Enviando…" : "Enviar convite"}</button>
        <button type="button" onClick={aoFechar} className={BOTAO}>Cancelar</button>
      </div>
    </section>
  );
}
