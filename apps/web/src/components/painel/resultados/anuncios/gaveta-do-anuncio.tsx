"use client";

// React no escopo: o tsx do teste usa o runtime clássico de JSX (mesmo padrão de aba-plano.tsx).
import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { Folha } from "@/components/painel/folha";
import { buscar } from "@/lib/painel/carregar";
import type { Carga } from "@/lib/painel/types";
import {
  caminhoDaLinha,
  chaveDaLinha,
  fatiasDeOrigem,
  FUNIL_GAVETA,
  funilEmPe,
  linhaDoComprador,
  notaForaDeContatos,
  rotuloDaLinha,
  textoDeSemCompra,
  verEmContatos,
  type FatiaDeOrigem,
} from "@/lib/resultados/anuncios-linhas";
import { contagem, inteiro } from "@/lib/resultados/anuncios-tela";
import type { Periodo } from "@/lib/resultados/periodo-anuncios";
import {
  buscaDoAnuncio,
  ehPessoasDaGaveta,
  hrefDeContatos,
  type PessoasDaGaveta,
} from "@/lib/resultados/pessoas-do-anuncio";
import type { LinhaRelatorio } from "@/lib/resultados/relatorio-anuncios";
import { cn } from "@/lib/utils";
import { FunilEmPe } from "./mini-funil";

const TOM_DA_ORIGEM: Record<FatiaDeOrigem["nome"], string> = {
  Instagram: "bg-cobalt-500",
  Facebook: "bg-cobalt-500/50",
  Outros: "bg-slate-600/40",
};
const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";
const LINK = cn("inline-flex min-h-11 items-center text-15 font-semibold text-cobalt-500 hover:underline", FOCO);
const BOTAO = cn(
  "inline-flex min-h-11 items-center rounded-lg border border-line-200 bg-paper-0 px-3.5 text-15 font-semibold text-volt-950 hover:bg-canvas-100",
  FOCO,
);
const BOTAO_PRIMARIO = cn(
  "inline-flex min-h-11 items-center rounded-lg bg-cobalt-500 px-3.5 text-15 font-semibold text-paper-0 hover:bg-cobalt-500/90",
  FOCO,
);

export type PropsDoConteudo = {
  linha: LinhaRelatorio;
  periodo: Periodo;
  carga: Carga;
  pessoas: PessoasDaGaveta | null;
  aoTentarDeNovo: () => void;
};

/**
 * O corpo da gaveta "Ver quem" (spec 2026-10-10-funil-anuncios §4, mockup
 * Anuncio). O funil sai da linha do relatório e aparece na hora; as pessoas
 * chegam pela rota. Só desenha: quem busca é a `GavetaDoAnuncio`.
 */
export function ConteudoDaGaveta({ linha, periodo, carga, pessoas, aoTentarDeNovo }: PropsDoConteudo) {
  return (
    <div className="flex flex-col gap-5 pb-2">
      <p className="text-13 text-slate-600">{caminhoDaLinha(linha)}</p>
      <FunilEmPe modelo={funilEmPe(linha, FUNIL_GAVETA)} rotulo="Funil do anúncio" tamanho="gaveta" />
      {carga === "erro" ? (
        <div role="alert" className="rounded-lg border border-line-200 px-4 py-3.5">
          <p className="text-15 text-volt-950">Não deu para carregar quem veio por este anúncio.</p>
          <button type="button" onClick={aoTentarDeNovo} className={cn(BOTAO, "mt-3")}>
            Tentar de novo
          </button>
        </div>
      ) : carga === "carregando" || pessoas === null ? (
        <div role="status" aria-label="Carregando quem veio por este anúncio" className="space-y-2">
          <div className="pn-skeleton h-3 rounded-full" />
          <div className="pn-skeleton h-14 rounded-lg" />
          <div className="pn-skeleton h-14 rounded-lg" />
        </div>
      ) : (
        <Pessoas linha={linha} periodo={periodo} pessoas={pessoas} />
      )}
      <p className="text-13 text-slate-600">
        Origem casada pelo telefone do cadastro. O nome vem do WhatsApp de quem entrou.
      </p>
    </div>
  );
}

function Pessoas({ linha, periodo, pessoas }: { linha: LinhaRelatorio; periodo: Periodo; pessoas: PessoasDaGaveta }) {
  const chave = chaveDaLinha(linha);
  const fatias = fatiasDeOrigem(pessoas.por_origem);
  // N de "Ver os N em Contatos" = contatos distintos (`paraAGaveta` deduplica): bate com a lista do Contatos.
  const emContatos = pessoas.contatos_dos_compradores;
  const nota = notaForaDeContatos(pessoas.compradores.filter((c) => !c.em_contatos).length);

  return (
    <>
      {fatias.length > 0 && (
        <div>
          <p className="mb-2 text-13 text-slate-600">Por onde a pessoa viu</p>
          <div aria-hidden="true" className="flex h-2.5 overflow-hidden rounded-full bg-canvas-100">
            {fatias.map((f) => (
              <span key={f.nome} className={cn("block", TOM_DA_ORIGEM[f.nome])} style={{ width: `${f.largura}%` }} />
            ))}
          </div>
          <ul className="mt-1.5 flex flex-wrap gap-x-4 text-13 text-slate-600">
            {fatias.map((f) => (
              <li key={f.nome}>{f.texto}</li>
            ))}
          </ul>
        </div>
      )}

      <section aria-labelledby="quem-comprou-titulo">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="quem-comprou-titulo" className="font-brand text-15 font-semibold text-volt-950">
            Quem comprou
          </h3>
          <span className="text-13 text-slate-600">{contagem(pessoas.compradores.length, "pessoa", "pessoas")}</span>
        </div>
        {pessoas.compradores.length === 0 ? (
          <p className="mt-2 text-15 text-slate-600">Ninguém comprou por este anúncio ainda.</p>
        ) : (
          <ul className="mt-2.5 border-t border-line-200">
            {pessoas.compradores.map((c, i) => {
              const l = linhaDoComprador(c);
              return (
                <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b border-line-200 py-3">
                  <span className="text-15 font-semibold text-volt-950">{l.titulo}</span>
                  <span className="font-data text-right text-15 font-medium text-success-700">{l.total}</span>
                  {l.detalhe && <span className="text-13 text-slate-600">{l.detalhe}</span>}
                  <span className="col-start-2 text-right text-13 text-slate-600">{l.quando}</span>
                </li>
              );
            })}
          </ul>
        )}
        {emContatos > 0 && (
          <Link href={hrefDeContatos(periodo, chave, "compraram")} className={cn(LINK, "mt-1")}>
            {verEmContatos(emContatos)}
          </Link>
        )}
        {nota && <p className="mt-1 text-13 text-slate-600">{nota}</p>}
      </section>

      <section aria-labelledby="sem-compra-titulo" className="rounded-lg bg-canvas-100 px-4 py-3.5">
        <h3 id="sem-compra-titulo" className="font-brand text-15 font-semibold text-volt-950">
          Entraram e ainda não compraram
        </h3>
        <p className="font-brand my-1 text-28 font-bold tabular-nums text-volt-950">{inteiro(pessoas.sem_compra)}</p>
        <p className="text-13 text-slate-600">{textoDeSemCompra(pessoas.sem_compra, linha.entraram)}</p>
        {pessoas.sem_compra > 0 && (
          <Link href={hrefDeContatos(periodo, chave, "sem-compra")} className={cn(BOTAO_PRIMARIO, "mt-2.5")}>
            Ver em Contatos
          </Link>
        )}
      </section>
    </>
  );
}

type Props = { linha: LinhaRelatorio | null; periodo: Periodo; aoFechar: () => void };

/**
 * A gaveta "Ver quem": busca `GET /api/resultados/anuncios/pessoas` (telefone já
 * mascarado pelo servidor) e mostra na `Folha` do painel — diálogo central no
 * computador, folha de baixo no celular. Quem abre dá `key` por anúncio: trocar
 * de anúncio remonta a gaveta, e nada da busca anterior aparece nem escreve.
 */
export function GavetaDoAnuncio({ linha, periodo, aoFechar }: Props) {
  const [pessoas, setPessoas] = useState<PessoasDaGaveta | null>(null);
  const [carga, setCarga] = useState<Carga>("carregando");
  // Última busca vence: resposta de uma busca anterior (retry em cima de busca lenta) não escreve.
  const ultima = useRef(0);

  // Depende das datas, não da identidade do objeto `periodo`: o mesmo período num
  // objeto novo não dispara outra busca.
  const { de, ate } = periodo;
  const carregar = useCallback(() => {
    if (!linha) return;
    const n = ++ultima.current;
    const vale =
      <T,>(f: (v: T) => void) =>
      (v: T) => {
        if (n === ultima.current) f(v);
      };
    void buscar(
      `/api/resultados/anuncios/pessoas?${buscaDoAnuncio({ de, ate }, chaveDaLinha(linha))}`,
      ehPessoasDaGaveta,
      vale(setPessoas),
      vale(setCarga),
    );
  }, [linha, de, ate]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!linha) return null;
  return (
    <Folha aberta aoFechar={aoFechar} titulo={rotuloDaLinha(linha)} testId="gaveta-do-anuncio" emQualquerLargura>
      <ConteudoDaGaveta linha={linha} periodo={periodo} carga={carga} pessoas={pessoas} aoTentarDeNovo={carregar} />
    </Folha>
  );
}
