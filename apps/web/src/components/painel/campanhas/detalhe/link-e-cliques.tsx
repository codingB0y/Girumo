"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CopyLink } from "@/components/painel/copy-link";
import { QrLink } from "@/components/painel/campanhas/qr-link";
import type { EntradaSettings } from "@/lib/campaigns/settings";
import { dayBR, horaBR } from "@/lib/date-br";
import { resolveClickTarget, type ResolvableGroup } from "@/lib/links/resolve-click-target";
import type { Group } from "@/lib/mock-data";
import { barrasDaAtividade, nomeDoMes, somaDa, type Periodo } from "@/lib/painel/atividade";
import { lotacao, numero } from "@/lib/painel/grupos";
import { paradoDoLink } from "@/lib/painel/link-parado";
import { cn } from "@/lib/utils";
import { medindoDesde, useAtividade } from "./analise";
import { GraficoDeBarras } from "./grafico-barras";

type Props = {
  slug: string;
  nome: string;
  /** `/r/<slug>` com a origem; vazio quando a campanha não tem slug. */
  linkMestre: string;
  groupIds: string[];
  grupos: Group[];
  entrada: EntradaSettings;
  /** Cliques desde que o link existe (o contador de `tracked_links`). */
  cliquesNoTotal: number;
  agora: Date;
  editarHref: string;
};

const unidadeDeCliques: [string, string] = ["clique", "cliques"];

/**
 * Aba "Link e cliques" da direção D (spec 2026-09-24): o link da campanha, para
 * que grupo ele manda agora (a mesma regra do `/r/`) e os cliques por hora, dia
 * e mês, com quantos viraram entrada.
 */
export function LinkECliques({ slug, nome, linkMestre, groupIds, grupos, entrada, cliquesNoTotal, agora, editarHref }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>("hoje");
  const { atividade, erro, tentarDeNovo } = useAtividade(slug, agora.getTime());

  const destino = useMemo(() => {
    const resolviveis: ResolvableGroup[] = grupos.map((g) => ({
      whatsapp_group_id: g.whatsappGroupId,
      name: g.name,
      members: g.members,
      capacity: g.capacity,
      invite_url: g.inviteUrl ?? null,
      is_admin: g.isAdmin,
    }));
    const alvo = resolveClickTarget({
      link: { campaign_group_id: "campanha", target_url: "", clicks: 0, metadata: {} },
      campaign: { group_ids: groupIds },
      groups: resolviveis,
      entrada,
      now: agora,
    });
    if (alvo.kind === "blocked") {
      return { grupo: null, parado: alvo.reason === "cap-reached" ? null : paradoDoLink(alvo.reason, groupIds, grupos.length, entrada.lotado) };
    }
    return { grupo: grupos.find((g) => g.whatsappGroupId === alvo.groupId) ?? null, parado: null };
  }, [grupos, groupIds, entrada, agora]);

  const hoje = atividade ? dayBR(new Date(atividade.geradoEm)) : dayBR(agora);
  const cliques = useMemo(() => (atividade ? barrasDaAtividade(atividade, periodo, "cliques") : null), [atividade, periodo]);
  const entradas = useMemo(() => (atividade ? barrasDaAtividade(atividade, periodo, "entraram") : null), [atividade, periodo]);
  const seteDias = atividade ? barrasDaAtividade(atividade, "7d", "cliques").reduce((s, b) => s + b.valor, 0) : null;
  const noMes = atividade ? barrasDaAtividade(atividade, "mes", "cliques").reduce((s, b) => s + b.valor, 0) : null;

  const quando = periodo === "hoje" ? "hoje" : periodo === "7d" ? "nos últimos 7 dias" : `em ${nomeDoMes(hoje).toLowerCase()}`;
  const totalCliques = cliques ? cliques.reduce((s, b) => s + b.valor, 0) : 0;
  // Entrada só conta onde era medida; clique de antes disso fica fora da conta.
  const medidos = (cliques ?? []).flatMap((b, i) => {
    const e = entradas?.[i];
    return e && !e.semMedicao && !b.futuro ? [{ cliques: b.valor, entraram: e.valor }] : [];
  });
  const cliquesMedidos = medidos.reduce((s, m) => s + m.cliques, 0);
  const entraram = medidos.reduce((s, m) => s + m.entraram, 0);
  const algoSemMedicao = entradas?.some((b) => b.semMedicao) ?? false;
  const [hh, mm] = atividade ? horaBR(atividade.geradoEm).split(":").map(Number) : [0, 0];

  return (
    <div className="space-y-6">
      <section aria-labelledby="link-titulo" className="rounded-[10px] border border-line-200 bg-paper-0 px-5 py-4">
        <h2 id="link-titulo" className="text-16 font-semibold text-volt-950">
          Link da campanha
        </h2>
        {linkMestre ? (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <CopyLink url={linkMestre} className="min-w-0 max-w-full" />
              <QrLink url={linkMestre} nome={nome} />
            </div>
            <p className="mt-4 text-13 text-slate-600">Para quem clicar pela primeira vez agora, o link manda para</p>
            {destino.grupo ? (
              <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm">
                <strong className="font-semibold text-volt-950">{destino.grupo.name}</strong>
                <span className="tabular-nums text-slate-600">
                  {numero(destino.grupo.members)} de {numero(destino.grupo.capacity)} ·{" "}
                  {Math.round(lotacao(destino.grupo.members, destino.grupo.capacity) * 100)}%
                </span>
              </p>
            ) : (
              <p className={cn("mt-1 text-sm font-medium", destino.parado?.grave === false ? "text-volt-950" : "text-danger-700")}>
                {destino.parado?.texto ?? "Nenhum grupo agora."}
              </p>
            )}
            <p className="mt-2 text-12 text-slate-600">
              O link enche um grupo até 95% e passa para o próximo da lista.{" "}
              <Link href={editarHref} className="font-medium text-cobalt-500 hover:underline">
                Mudar os grupos
              </Link>
            </p>
          </>
        ) : (
          <p className="mt-2 text-13 text-slate-600">Esta campanha ainda não tem link.</p>
        )}
      </section>

      <section aria-label="Cliques no link" className="grid gap-px overflow-hidden rounded-[10px] border border-line-200 bg-line-200 grid-cols-2 lg:grid-cols-4">
        <Numero rotulo="Cliques hoje" valor={atividade ? numero(somaDa(atividade.porHora, "cliques")) : "—"} />
        <Numero rotulo="Nos últimos 7 dias" valor={seteDias === null ? "—" : numero(seteDias)} />
        <Numero rotulo={`Em ${nomeDoMes(hoje).toLowerCase()}`} valor={noMes === null ? "—" : numero(noMes)} />
        <Numero rotulo="Desde o início" valor={numero(cliquesNoTotal)} />
      </section>

      <section aria-labelledby="cliques-titulo" className="rounded-[10px] border border-line-200 bg-paper-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line-200 px-5 py-3">
          <h2 id="cliques-titulo" className="text-16 font-semibold text-volt-950">
            Cliques {periodo === "hoje" ? "por hora" : "por dia"}
          </h2>
          <div role="group" aria-label="Período" className="flex rounded-lg bg-canvas-100 p-0.5">
            {(
              [
                ["hoje", "Hoje, por hora"],
                ["7d", "7 dias"],
                ["mes", nomeDoMes(hoje)],
              ] as const
            ).map(([p, rotulo]) => (
              <button
                key={p}
                type="button"
                aria-pressed={periodo === p}
                onClick={() => setPeriodo(p)}
                className={cn(
                  "h-8 rounded-md px-3 text-13 font-medium transition-colors",
                  periodo === p ? "bg-paper-0 text-volt-950" : "text-slate-600 hover:text-volt-950",
                )}
              >
                {rotulo}
              </button>
            ))}
          </div>
        </div>
        {erro ? (
          <p className="px-5 py-8 text-center text-13 text-slate-600">
            {erro}{" "}
            <button type="button" onClick={tentarDeNovo} className="font-medium text-cobalt-500 hover:underline">
              Tentar de novo
            </button>
          </p>
        ) : !atividade || !cliques ? (
          <div role="status" aria-label="Carregando os cliques" className="p-5">
            <div className="pn-skeleton h-48 rounded-lg" />
          </div>
        ) : (
          <div className="px-5 pb-4 pt-5">
            <GraficoDeBarras
              key={periodo}
              barras={cliques}
              resumo={`Cliques no link ${quando}: ${numero(totalCliques)}.`}
              unidade={unidadeDeCliques}
              rotuloACada={periodo === "hoje" ? 3 : 1}
              agora={periodo === "hoje" ? (hh * 60 + mm) / 1440 : undefined}
            />
            <p className="mt-3 text-13 text-slate-600">
              {numero(totalCliques)} {totalCliques === 1 ? "clique" : "cliques"} {quando}.
              {cliquesMedidos > 0 &&
                (entraram > cliquesMedidos
                  ? ` Entrou mais gente (${numero(entraram)}) do que clicou (${numero(cliquesMedidos)}): tem gente entrando sem passar pelo link.`
                  : ` ${Math.round((entraram / cliquesMedidos) * 100)}% viraram entrada: ${numero(entraram)} de ${numero(cliquesMedidos)}.`)}
              {cliquesMedidos > 0 && algoSemMedicao && atividade ? ` (${medindoDesde(atividade.entradasDesde)})` : ""}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="bg-paper-0 px-5 py-4">
      <p className="text-13 text-slate-600">{rotulo}</p>
      <p className="mt-2 text-[30px] font-semibold leading-none tabular-nums text-volt-950 [font-stretch:75%]">{valor}</p>
    </div>
  );
}
