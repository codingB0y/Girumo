"use client";

import { useState } from "react";
import { numero } from "@/lib/painel/grupos";

export type GrupoOrfao = { whatsappGroupId: string; name: string; members: number };
export type ComunidadeDestino = { slug: string; nome: string };

type Props = {
  grupos: readonly GrupoOrfao[];
  comunidades: readonly ComunidadeDestino[];
  aoVincular: (whatsappGroupId: string, slug: string) => Promise<void>;
};

/**
 * Faixa "Sem comunidade (N)" — a peça que resolve o problema real: 76 dos 91
 * grupos do tenant principal não pertencem a nenhuma coleção e são invisíveis
 * (spec 2.5, Step 3). Some da tela quando N é 0.
 */
export function OrfaosFaixa({ grupos, comunidades, aoVincular }: Props) {
  if (grupos.length === 0) return null;

  return (
    <section aria-labelledby="orfaos-titulo" className="pn-card rounded-[var(--radius-control)] p-5">
      <h2 id="orfaos-titulo" className="text-[17px] font-semibold text-volt-950">
        Sem comunidade ({grupos.length})
      </h2>

      {comunidades.length === 0 ? (
        <p className="mt-2 text-13 text-slate-600">Crie uma comunidade acima para poder vincular estes grupos.</p>
      ) : (
        <>
          <p className="mt-2 text-13 text-slate-600">
            Cada comunidade é também uma campanha: o grupo vinculado entra no link dela e recebe os disparos
            dela.
          </p>
          <ul className="mt-3 divide-y divide-line-200">
            {grupos.map((grupo) => (
              <LinhaOrfao key={grupo.whatsappGroupId} grupo={grupo} comunidades={comunidades} aoVincular={aoVincular} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function LinhaOrfao({
  grupo,
  comunidades,
  aoVincular,
}: {
  grupo: GrupoOrfao;
  comunidades: readonly ComunidadeDestino[];
  aoVincular: (whatsappGroupId: string, slug: string) => Promise<void>;
}) {
  const [destino, setDestino] = useState("");
  const [vinculando, setVinculando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function vincular() {
    if (!destino) return;
    setVinculando(true);
    setErro(null);
    try {
      await aoVincular(grupo.whatsappGroupId, destino);
    } catch (e) {
      // Cobre tanto o erro que `aoVincular` lança (404/500 da API, com a
      // mensagem dela) quanto falha de rede (fetch rejeitando antes de
      // qualquer resposta) — as duas caem no mesmo `catch`.
      setErro(e instanceof Error ? e.message : "Não deu pra vincular o grupo.");
    } finally {
      setVinculando(false);
    }
  }

  const seletorId = `orfao-destino-${grupo.whatsappGroupId}`;

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-15 text-volt-950">{grupo.name}</p>
        <p className="font-data text-12 tabular-nums text-slate-600">{numero(grupo.members)} membros</p>
        {erro && (
          <p role="alert" className="mt-1 text-12 text-alerta">
            {erro}
          </p>
        )}
      </div>

      <label className="sr-only" htmlFor={seletorId}>
        Comunidade destino para {grupo.name}
      </label>
      <select
        id={seletorId}
        value={destino}
        onChange={(e) => setDestino(e.target.value)}
        className="h-10 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-2.5 text-14 text-volt-950"
      >
        <option value="">Escolher comunidade</option>
        {comunidades.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.nome}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={vincular}
        disabled={!destino || vinculando}
        className="h-10 rounded-[var(--radius-control)] bg-cobalt-500 px-3.5 text-14 font-semibold text-paper-0 disabled:opacity-50"
      >
        {vinculando ? "Vinculando…" : "Vincular"}
      </button>
    </li>
  );
}
