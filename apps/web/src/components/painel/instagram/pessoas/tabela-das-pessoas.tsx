"use client";

import { fieldLabel } from "@/lib/ig/flow/names";
import type { PessoaDto } from "@/lib/ig/pessoas-tipos";
import { dataCurta, janelaAberta } from "./datas";

const COLUNAS_DE_CAMPO = 3;

type Props = {
  pessoas: PessoaDto[];
  /** Os campos mais usados da loja: viram as 3 colunas. */
  campos: string[];
  selecionadas: ReadonlySet<string>;
  /** Sem checkbox quando a tela só lê (loja que cancelou). */
  selecionavel: boolean;
  aoAlternar: (id: string) => void;
  aoAlternarTodas: () => void;
  aoAbrir: (id: string) => void;
};

/** A lista: @, etiquetas, os 3 campos mais usados, última conversa (bolinha = janela do direct aberta), "veio por". */
export function TabelaDasPessoas({ pessoas, campos, selecionadas, selecionavel, aoAlternar, aoAlternarTodas, aoAbrir }: Props) {
  const colunas = campos.slice(0, COLUNAS_DE_CAMPO);
  const todas = pessoas.length > 0 && pessoas.every((p) => selecionadas.has(p.id));
  const agoraMs = Date.now();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-13">
        <thead>
          <tr className="border-b border-line-200 text-left text-12 text-slate-600">
            {selecionavel && (
              <th scope="col" className="w-10 px-5 py-2.5">
                <input type="checkbox" aria-label="Selecionar todas desta página" checked={todas} onChange={aoAlternarTodas} />
              </th>
            )}
            <th scope="col" className="px-3 py-2.5 font-medium">Pessoa</th>
            <th scope="col" className="hidden px-3 py-2.5 font-medium md:table-cell">Etiquetas</th>
            {colunas.map((c) => (
              <th key={c} scope="col" className="hidden px-3 py-2.5 font-medium lg:table-cell">{fieldLabel(c)}</th>
            ))}
            <th scope="col" className="px-3 py-2.5 font-medium">Última conversa</th>
            <th scope="col" className="hidden px-3 py-2.5 font-medium md:table-cell">Veio por</th>
          </tr>
        </thead>
        <tbody>
          {pessoas.map((p) => {
            const rotulo = p.username ? `@${p.username}` : "Sem @";
            return (
              <tr key={p.id} className="border-b border-line-200 last:border-0 hover:bg-hover-ficha">
                {selecionavel && (
                  <td className="px-5 py-3">
                    <input type="checkbox" aria-label={`Selecionar ${rotulo}`} checked={selecionadas.has(p.id)} onChange={() => aoAlternar(p.id)} />
                  </td>
                )}
                <td className="px-3 py-3">
                  <button type="button" onClick={() => aoAbrir(p.id)} aria-label={`Abrir ficha de ${rotulo}`} className="font-medium text-volt-950 underline-offset-2 hover:underline">
                    {rotulo}
                  </button>
                </td>
                <td className="hidden px-3 py-3 md:table-cell">
                  <span className="flex flex-wrap gap-1">
                    {p.tags.slice(0, 3).map((t) => (
                      <span key={t} className="pn-chip pn-chip--line">{t}</span>
                    ))}
                    {p.tags.length > 3 && <span className="text-12 text-slate-600">+{p.tags.length - 3}</span>}
                  </span>
                </td>
                {colunas.map((c) => (
                  <td key={c} className="hidden px-3 py-3 text-slate-600 lg:table-cell">{p.fields[c] === undefined ? "—" : String(p.fields[c])}</td>
                ))}
                <td className="px-3 py-3 font-data tabular-nums text-slate-600">
                  {janelaAberta(p.lastDmAt, agoraMs) && <span className="pn-ponto mr-1.5 align-middle" role="img" aria-label="Pode receber direct agora" />}
                  {dataCurta(p.lastSeenAt)}
                </td>
                <td className="hidden px-3 py-3 text-slate-600 md:table-cell">{p.sourceFlowName ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
