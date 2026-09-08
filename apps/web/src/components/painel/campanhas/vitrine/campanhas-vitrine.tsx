"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { CopiarLinkVitrine } from "@/components/painel/copiar-link-vitrine";
import { PlanGate } from "@/components/painel/plan-gate";
import {
  caminhoPublico,
  cenaDasCampanhas,
  chipDaCampanha,
  contarPorFiltro,
  filtrarCampanhas,
  linhaDeVagas,
  linkPublico,
  ordenarPorLotacao,
  textoDeCliques,
  type CampanhaNaEtiqueta,
  type FiltroDeCampanha,
  type TomDeChip,
} from "@/lib/painel/campanhas";
import type { Carga } from "@/lib/painel/types";

type Props = {
  campanhas: readonly CampanhaNaEtiqueta[];
  /** Uma carga por rota: quem falhou não apaga o que os vizinhos trouxeram. */
  cargaDasCampanhas: Carga;
  cargaDosGrupos: Carga;
  cargaDosLinks: Carga;
  /** `window.location.origin`, resolvido na página (o servidor não o tem). */
  origin: string;
  aoTentarDeNovo: () => void;
};

// Lista literal: o `tsc` cobra que cada `valor` seja um FiltroDeCampanha, mas
// não cobra que todos estejam aqui. Estado novo em CampaignOperationalStatus
// precisa de linha nova nesta lista, senão a aba some sem erro de compilação.
const FILTROS: { valor: FiltroDeCampanha; rotulo: string }[] = [
  { valor: "all", rotulo: "Todas" },
  { valor: "ready", rotulo: "Prontas" },
  { valor: "needs_invites", rotulo: "Sem convite" },
  { valor: "full", rotulo: "Lotadas" },
  { valor: "empty", rotulo: "Sem grupos" },
  { valor: "orphan_groups", rotulo: "Grupos sumiram" },
];

function classeDoChip(tom: TomDeChip): string {
  return cn("pn-chip", tom === "acid" && "pn-chip--acid", tom === "line" && "pn-chip--line");
}

/**
 * Campanhas na Vitrine Aberta: cada campanha é uma etiqueta de peça
 * (componente 9.1), em lista vertical com a maior lotação em cima — nunca em
 * grade de três, que espalha o que a lojista lê de cima para baixo.
 */
export function CampanhasVitrine({
  campanhas,
  cargaDasCampanhas,
  cargaDosGrupos,
  cargaDosLinks,
  origin,
  aoTentarDeNovo,
}: Props) {
  const [filtro, setFiltro] = useState<FiltroDeCampanha>("all");
  const [busca, setBusca] = useState("");

  const contas = useMemo(() => contarPorFiltro(campanhas), [campanhas]);
  const visiveis = useMemo(
    () => ordenarPorLotacao(filtrarCampanhas(campanhas, filtro, busca)),
    [campanhas, filtro, busca],
  );
  const cena = cenaDasCampanhas({
    carga: cargaDasCampanhas,
    total: campanhas.length,
    visiveis: visiveis.length,
  });

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 px-4 py-6 sm:px-8 lg:py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-brand text-28 font-bold tracking-[-0.4px] text-volt-950">Campanhas</h1>
          <p className="mt-1 text-15 text-slate-600">
            Cada campanha é um link que enche seus grupos no automático.
          </p>
          <Link
            href="/painel/biblioteca"
            className="font-data mt-2 inline-flex min-h-11 items-center text-13 text-cobalt-500"
          >
            Biblioteca de copies →
          </Link>
        </div>
        <Link
          href="/painel/campanhas/nova"
          className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-volt-950 px-4 text-15 font-semibold text-paper-0 transition-colors hover:bg-volt-800"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Nova campanha
        </Link>
      </header>

      <PlanGate resource="campaigns" variant="card" />

      {/* Consulta secundária que falhou não some calada: sem este aviso, a
          etiqueta perde a linha de vagas e ninguém sabe por quê. */}
      {cena !== "erro" && (cargaDosGrupos === "erro" || cargaDosLinks === "erro") && (
        <p className="pn-aviso rounded-[var(--radius-control)] px-4 py-3" role="status">
          Alguns números não carregaram. As campanhas estão certas; as vagas e os cliques podem
          estar faltando.
        </p>
      )}

      {(cena === "lista" || cena === "sem-resultado") && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Filtrar campanhas" className="flex flex-wrap gap-1">
            {FILTROS.map((f) => (
              <button
                key={f.valor}
                type="button"
                aria-pressed={filtro === f.valor}
                onClick={() => setFiltro(f.valor)}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-chip)] px-3 text-13 transition-colors",
                  filtro === f.valor
                    ? "bg-volt-950 text-paper-0"
                    : "border border-line-200 text-volt-950 hover:bg-canvas-100",
                )}
              >
                {f.rotulo}
                <span className="font-data tabular-nums opacity-70">{contas[f.valor]}</span>
              </button>
            ))}
          </div>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600"
              aria-hidden="true"
            />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Pesquisar campanhas…"
              aria-label="Pesquisar campanhas"
              className="min-h-11 w-full rounded-[var(--radius-control)] border border-line-200 bg-paper-0 py-2 pl-9 pr-3 text-15 text-volt-950 outline-none transition-colors placeholder:text-slate-600 focus:border-cobalt-500 sm:w-64"
            />
          </div>
        </div>
      )}

      {cena === "carregando" && (
        <div className="space-y-3" role="status" aria-label="Carregando campanhas">
          {[0, 1, 2].map((i) => (
            <div key={i} className="pn-skeleton h-24 rounded-[var(--radius-control)]" data-testid="painel-skeleton" />
          ))}
        </div>
      )}

      {cena === "erro" && (
        <div className="pn-card rounded-[var(--radius-control)] p-6">
          <p className="text-15 text-volt-950">Não deu para carregar suas campanhas.</p>
          <p className="mt-1 text-13 text-slate-600">
            A conexão pode ter caído no meio do caminho. Suas campanhas continuam lá.
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
          <p className="text-15 text-volt-950">Nenhuma campanha ainda.</p>
          <p className="mt-1 text-13 text-slate-600">
            A campanha gera o link; quem clica entra direto num grupo com vaga.
          </p>
          <Link
            href="/painel/campanhas/nova"
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-volt-950 px-4 text-15 font-semibold text-paper-0 transition-colors hover:bg-volt-800"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Criar a primeira
          </Link>
        </div>
      )}

      {cena === "sem-resultado" && (
        <div className="pn-card rounded-[var(--radius-control)] p-6">
          <p className="text-15 text-volt-950">Nenhuma campanha aqui.</p>
          <p className="mt-1 text-13 text-slate-600">Ajuste o filtro ou a busca.</p>
        </div>
      )}

      {cena === "lista" && (
        <ul className="space-y-3">
          {/* Um anúncio para a lista inteira: a carga dos grupos é a mesma para
              todas as etiquetas, e um role="status" por linha faria o leitor de
              tela repetir a mesma frase uma vez por campanha. */}
          {cargaDosGrupos === "carregando" && (
            <li className="sr-only" role="status">
              Carregando as vagas das campanhas.
            </li>
          )}
          {visiveis.map((campanha) => (
            <li key={campanha.campaign.id}>
              <Etiqueta
                campanha={campanha}
                cargaDosGrupos={cargaDosGrupos}
                cargaDosLinks={cargaDosLinks}
                origin={origin}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Etiqueta({
  campanha,
  cargaDosGrupos,
  cargaDosLinks,
  origin,
}: {
  campanha: CampanhaNaEtiqueta;
  cargaDosGrupos: Carga;
  cargaDosLinks: Carga;
  origin: string;
}) {
  const { id, name, slug } = campanha.campaign;
  const destino = `/painel/campanhas/${slug ?? id}`;
  const chip = chipDaCampanha(campanha.operationalStatus);
  const vagas = linhaDeVagas(campanha, cargaDosGrupos);
  const cliques = textoDeCliques(campanha.clicks, cargaDosLinks);
  const caminho = caminhoPublico(slug);
  const url = linkPublico(origin, slug);

  return (
    <article className="pn-etiqueta-preco relative">
      {/* O link cobre a etiqueta inteira; o botão de copiar sobe com z-10.
          Assim o cartão continua clicável sem aninhar botão dentro de <a>. */}
      <Link
        href={destino}
        aria-label={`Abrir ${name}`}
        className="absolute inset-0 rounded-[var(--radius-control)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
      />
      <span className={cn(classeDoChip(chip.tom), "absolute right-4 top-4")}>{chip.texto}</span>

      <h2 className="pn-etiqueta-preco__nome pr-[124px]">{name}</h2>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        {caminho && url ? (
          <CopiarLinkVitrine rotulo={caminho} url={url} descricao={`Copiar o link de ${name}`} />
        ) : (
          <span className="font-data text-13 text-slate-600">link sendo gerado…</span>
        )}
        {cliques && <span className="font-data text-13 tabular-nums text-slate-600">{cliques}</span>}
      </div>

      {vagas.tipo === "vagas" && (
        <div className="mt-3 flex items-center gap-3">
          <span
            className={cn("pn-etiqueta-preco__barra flex-1", vagas.quase && "pn-etiqueta-preco__barra--quase")}
            style={{ ["--p" as string]: vagas.lotacao }}
            aria-hidden="true"
          />
          <span className="font-data shrink-0 text-15 tabular-nums text-volt-950">{vagas.texto}</span>
          <span
            className={cn(
              "font-data shrink-0 text-13 tabular-nums",
              vagas.quase ? "text-warning-700" : "text-slate-600",
            )}
          >
            {vagas.porcentagem}
          </span>
        </div>
      )}
      {vagas.tipo === "sem-grupos" && (
        <p className="mt-3 text-13 text-slate-600">Nenhum grupo escolhido ainda.</p>
      )}
      {vagas.tipo === "sem-contagem" && (
        <p className="mt-3 text-13 text-slate-600">
          {vagas.grupos === 1 ? "1 grupo escolhido" : `${vagas.grupos} grupos escolhidos`}, ainda sem
          contagem de membros.
        </p>
      )}
      {/* Espera é esqueleto; falha é frase. Fundir os dois põe "indisponível"
          em toda abertura normal da tela — o defeito do PR #262. */}
      {vagas.tipo === "carregando" && (
        <span
          className="pn-skeleton mt-3 block h-4 w-48 rounded-[var(--radius-chip)]"
          aria-hidden="true"
        />
      )}
      {vagas.tipo === "indisponivel" && (
        <p className="mt-3 text-13 text-slate-600">Vagas indisponíveis agora.</p>
      )}
    </article>
  );
}
