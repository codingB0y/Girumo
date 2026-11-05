"use client";

import React, { useEffect, useState } from "react";
import { campanhasParaConvite, type CampanhaDoConvite } from "@/lib/ig/conversas/campo";
import type { Resultado } from "./use-fio";

const BOTAO = "inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-13 font-medium text-volt-950 disabled:opacity-50 lg:min-h-9";

type Props = {
  aoConvidar: (campanhaId: string) => Promise<Resultado>;
  aoFechar: () => void;
};

type Carga = "carregando" | "ok" | "erro";

/** Escolhe a campanha e manda o texto com o botão "Entrar no grupo VIP" (spec §7.9). A lista vem de `/api/campanhas`. */
export function ConviteDoGrupo({ aoConvidar, aoFechar }: Props) {
  const [campanhas, setCampanhas] = useState<CampanhaDoConvite[]>([]);
  const [carga, setCarga] = useState<Carga>("carregando");
  const [escolhida, setEscolhida] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/campanhas", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error("falhou");
        const lista = campanhasParaConvite(await r.json());
        if (!vivo) return;
        setCampanhas(lista);
        setEscolhida(lista.length === 1 ? lista[0].id : "");
        setCarga("ok");
      })
      .catch(() => vivo && setCarga("erro"));
    return () => {
      vivo = false;
    };
  }, []);

  const enviar = async () => {
    if (!escolhida || enviando) return;
    setEnviando(true);
    setErro(null);
    const r = await aoConvidar(escolhida);
    setEnviando(false);
    if (r.ok) aoFechar();
    else setErro(r.mensagem);
  };

  return (
    <section aria-label="Convite do grupo" className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 p-3">
      <p className="text-13 text-slate-600">Manda o link do grupo VIP da campanha num botão &ldquo;Entrar no grupo VIP&rdquo;.</p>
      {carga === "carregando" && <p role="status" className="text-13 text-slate-600">Carregando as campanhas…</p>}
      {carga === "erro" && <p role="alert" className="text-13 text-danger-700">Não deu pra carregar as campanhas.</p>}
      {carga === "ok" && campanhas.length === 0 && <p role="status" className="text-13 text-slate-600">Você ainda não tem campanha com link. Crie uma em Campanhas.</p>}
      {carga === "ok" && campanhas.length > 0 && (
        <label className="flex flex-col gap-1 text-13 font-medium text-volt-950">
          Campanha
          <select value={escolhida} onChange={(e) => setEscolhida(e.target.value)} className="min-h-11 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-2 text-14 text-volt-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500 lg:min-h-9">
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
