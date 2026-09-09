"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Copy, Loader2, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { CopiarLinkVitrine } from "@/components/painel/copiar-link-vitrine";
import { pageSummary, type LandingPage } from "@/lib/pages/schema";
import {
  caminhoDaPagina,
  cenaDasPaginas,
  chipDaPagina,
  estadoDoDuplicar,
  linhaDeConversao,
  linkDaPagina,
  ordenarPaginas,
} from "@/lib/painel/pages";
import type { TomDeChip } from "@/lib/painel/campanhas";
import type { Carga } from "@/lib/painel/types";

type Props = {
  paginas: readonly LandingPage[];
  carga: Carga;
  /** `window.location.origin`, resolvido na página (o servidor não o tem). */
  origin: string;
  /**
   * Falha ao duplicar. Convive com a lista de propósito: sumir com as páginas
   * porque uma cópia falhou seria perder o trabalho de vista por um botão.
   */
  avisoDeDuplicacao: string | null;
  duplicando: string | null;
  aoDuplicar: (id: string) => void;
  aoTentarDeNovo: () => void;
};

function classeDoChip(tom: TomDeChip): string {
  return cn("pn-chip", tom === "acid" && "pn-chip--acid", tom === "line" && "pn-chip--line");
}

/**
 * Páginas na Vitrine Aberta: cada landing page é uma etiqueta de peça
 * (componente 9.1), em lista vertical com quem mais rende em cima. A barra
 * mede conversão — é o que a lotação é para a campanha.
 */
export function PagesVitrine({
  paginas,
  carga,
  origin,
  avisoDeDuplicacao,
  duplicando,
  aoDuplicar,
  aoTentarDeNovo,
}: Props) {
  const ordenadas = useMemo(() => ordenarPaginas(paginas), [paginas]);
  const cena = cenaDasPaginas({ carga, total: paginas.length });

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 px-4 py-6 sm:px-8 lg:py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-brand text-28 font-bold tracking-[-0.4px] text-volt-950">Páginas</h1>
          <p className="mt-1 text-15 text-slate-600">
            Landing pages de captação que lotam seus grupos — com rastreio de origem.
          </p>
        </div>
        <Link
          href="/painel/pages/nova"
          className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-volt-950 px-4 text-15 font-semibold text-paper-0 transition-colors hover:bg-volt-800"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Nova página
        </Link>
      </header>

      {avisoDeDuplicacao && (
        <p className="pn-aviso rounded-[var(--radius-control)] px-4 py-3" role="alert">
          {avisoDeDuplicacao}
        </p>
      )}

      {cena === "carregando" && (
        <div className="space-y-3" role="status" aria-label="Carregando páginas">
          {[0, 1, 2].map((i) => (
            <div key={i} className="pn-skeleton h-24 rounded-[var(--radius-control)]" data-testid="painel-skeleton" />
          ))}
        </div>
      )}

      {cena === "erro" && (
        <div className="pn-card rounded-[var(--radius-control)] p-6">
          <p className="text-15 text-volt-950">Não deu para carregar suas páginas.</p>
          <p className="mt-1 text-13 text-slate-600">
            A conexão pode ter caído no meio do caminho. Suas páginas continuam no ar.
          </p>
          <button
            type="button"
            onClick={aoTentarDeNovo}
            className="mt-3 inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-line-200 px-4 text-15 font-semibold text-volt-950 transition-colors hover:bg-canvas-100"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {cena === "vazio" && (
        <div className="pn-card rounded-[var(--radius-control)] p-6">
          <p className="text-15 text-volt-950">Nenhuma página ainda.</p>
          <p className="mt-1 text-13 text-slate-600">
            Crie a primeira em 2 minutos: escolha um modelo, preencha 7 campos e publique.
          </p>
          <Link
            href="/painel/pages/nova"
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-volt-950 px-4 text-15 font-semibold text-paper-0 transition-colors hover:bg-volt-800"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Criar minha primeira página
          </Link>
        </div>
      )}

      {cena === "lista" && (
        <ul className="space-y-3">
          {ordenadas.map((pagina) => (
            <li key={pagina.id}>
              <Etiqueta
                pagina={pagina}
                origin={origin}
                duplicando={duplicando}
                aoDuplicar={aoDuplicar}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Etiqueta({
  pagina,
  origin,
  duplicando,
  aoDuplicar,
}: {
  pagina: LandingPage;
  origin: string;
  duplicando: string | null;
  aoDuplicar: (id: string) => void;
}) {
  const nome = pagina.content.store_name;
  const chip = chipDaPagina(pagina.status);
  const conversao = linhaDeConversao(pagina);
  const copia = estadoDoDuplicar(pagina.id, duplicando);
  const caminho = caminhoDaPagina(pagina.slug);
  const url = linkDaPagina(origin, pagina.slug);

  return (
    <article className="pn-etiqueta-preco relative">
      {/* O link cobre a etiqueta inteira; copiar e duplicar sobem com z-10.
          Assim o cartão continua clicável sem aninhar botão dentro de <a>. */}
      <Link
        href={`/painel/pages/${pagina.id}`}
        aria-label={`Abrir ${nome}`}
        className="absolute inset-0 rounded-[var(--radius-control)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
      />
      <span className={cn(classeDoChip(chip.tom), "absolute right-4 top-4")}>{chip.texto}</span>

      <h2 className="pn-etiqueta-preco__nome pr-[104px]">{nome}</h2>
      <p className="mt-1 line-clamp-1 text-13 text-slate-600">{pageSummary(pagina.content).headline}</p>

      <div className="mt-1.5">
        {url ? (
          <CopiarLinkVitrine rotulo={caminho} url={url} descricao={`Copiar o link de ${nome}`} />
        ) : (
          <span className="font-data text-13 text-cobalt-500">{caminho}</span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {conversao.tipo === "conversao" ? (
          <>
            <span
              className="pn-etiqueta-preco__barra min-w-16 flex-1"
              style={{ ["--p" as string]: conversao.taxa }}
              aria-hidden="true"
            />
            <span className="font-data shrink-0 text-15 tabular-nums text-volt-950">{conversao.texto}</span>
            <span className="font-data shrink-0 text-13 tabular-nums text-slate-600">
              {conversao.porcentagem}
            </span>
          </>
        ) : (
          <span className="flex-1 text-13 text-slate-600">{conversao.texto}</span>
        )}

        <button
          type="button"
          onClick={() => aoDuplicar(pagina.id)}
          disabled={copia.desabilitado}
          aria-label={`Duplicar ${nome}`}
          className="relative z-10 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] border border-line-200 px-3 text-13 font-semibold text-volt-950 transition-colors hover:bg-canvas-100 disabled:opacity-60"
        >
          {copia.ocupado ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {copia.texto}
        </button>
      </div>
    </article>
  );
}
