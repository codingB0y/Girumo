"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { Campanha, TrackedLink } from "@/components/painel/home/types";
import type { Group } from "@/lib/mock-data";
import { chipDaCampanha, classeDoChip, linhaDeVagas, textoDeCliques } from "@/lib/painel/campanhas";
import { campanhasDaInicio } from "@/lib/painel/inicio";
import { cn } from "@/lib/utils";

/**
 * Bloco 7 (12.3): três campanhas como etiquetas de preço, ordenadas por
 * lotação. Chip PRONTA em Canvas: Acid é só de AO VIVO e LOTOU.
 *
 * O estado da campanha e a linha de vagas NÃO são decididos aqui: vêm de
 * `campanhasDaInicio`, que chama o mesmo `buildCampaignGroupsOverview` da tela
 * de Campanhas. Antes este widget tinha a regra própria
 * `capacidade > 0 && pessoas >= capacidade` e imprimia "pessoas / capacidade"
 * incondicionalmente — a campanha cujos grupos sumiram caía no ramo de baixo e
 * anunciava "Pronta" com "0 / 0 vagas" ao lado.
 */
export function CampanhasEtiquetas({
  campanhas,
  grupos,
  links,
}: {
  campanhas: readonly Campanha[];
  grupos: Group[];
  links: readonly TrackedLink[];
}) {
  // Antes do early return: hook não pode ficar atrás de um `if`.
  const etiquetas = useMemo(() => campanhasDaInicio(campanhas, grupos, links), [campanhas, grupos, links]);

  if (campanhas.length === 0) {
    return (
      <div className="pn-card rounded-[var(--radius-control)] p-5">
        <p className="text-15 text-volt-950">Nenhuma campanha ainda.</p>
        <p className="mt-1 text-13 text-slate-600">A campanha gera o link; quem clica entra direto no grupo com vaga.</p>
        <Link href="/painel/campanhas/nova" className="mt-3 inline-flex min-h-11 items-center text-15 font-semibold text-cobalt-500">
          Criar campanha
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {etiquetas.map((etiqueta) => {
        const chip = chipDaCampanha(etiqueta.operationalStatus);
        // "ok" fixo: na Início os grupos não são uma consulta desta linha.
        // `useDashboardData` trata `/api/groups` como bloqueante — se falhar, a
        // tela inteira vira erro e este bloco não chega a renderizar.
        const vagas = linhaDeVagas(etiqueta, "ok");
        const cliques = textoDeCliques(etiqueta.clicks, "ok");
        const { id, name, slug } = etiqueta.campaign;

        return (
          <Link
            key={id}
            href={`/painel/campanhas/${slug ?? id}`}
            className="pn-etiqueta-preco block min-h-[80px] lg:min-h-[88px]"
          >
            {/* Nome e chip dividem a linha em vez de o nome reservar espaço
                por um `pr-` fixo. O `pr-24` (96px) que estava aqui era
                calibrado para "Pronta" (64px), e o chip "Grupos sumiram"
                (127px) passava por cima do nome — 27px de sobreposição,
                medidos na tela. Trocar por um `pr-` maior consertaria a
                colisão cobrando a largura do chip mais raro de TODOS os
                cards; no flex cada chip reserva só o que ocupa. */}
            <span className="flex items-start justify-between gap-3">
              <span className="pn-etiqueta-preco__nome min-w-0 text-[16px] lg:text-20">{name}</span>
              <span className={cn(classeDoChip(chip.tom), "shrink-0")}>{chip.texto}</span>
            </span>
            <span className="font-data mt-1 flex items-center gap-3 text-13 text-slate-600">
              {slug && <span className="truncate text-cobalt-500">/r/{slug}</span>}
              {cliques && <span className="shrink-0 tabular-nums">{cliques}</span>}
            </span>

            {vagas.tipo === "vagas" && (
              <span className="mt-2 flex items-center gap-3">
                <span
                  className={cn(
                    "pn-etiqueta-preco__barra flex-1",
                    vagas.quase && "pn-etiqueta-preco__barra--quase",
                  )}
                  style={{ ["--p" as string]: vagas.lotacao }}
                  aria-hidden="true"
                />
                <span className="font-data shrink-0 text-13 tabular-nums text-volt-950">{vagas.texto}</span>
              </span>
            )}
            {/* NÃO "Nenhum grupo escolhido ainda", que é a frase da tela de
                Campanhas: aqui ela fica a um bloco de distância do "Estoque de
                grupos", e "nenhum grupo" passa a se ler como a TELA sem grupo
                nenhum. O E2E de /painel entendeu exatamente assim — a sentinela
                de estado-vazio dele é /Nenhum grupo/i, e ficou vermelho com o
                estoque cheio na tela. Se o teste se confundiu, a lojista
                também. Esta frase fala da campanha, e só dela. */}
            {vagas.tipo === "sem-grupos" && (
              <span className="mt-2 block text-13 text-slate-600">Esta campanha ainda não tem grupos.</span>
            )}
            {/* Sem barra e sem "0 / 0": a campanha aponta para grupos, mas
                nenhum deles voltou com contagem. A frase diz isso, e o chip ao
                lado ("Grupos sumiram") diz por quê. */}
            {vagas.tipo === "sem-contagem" && (
              <span className="mt-2 block text-13 text-slate-600">
                {vagas.grupos === 1 ? "1 grupo escolhido" : `${vagas.grupos} grupos escolhidos`}, ainda sem contagem de membros.
              </span>
            )}
          </Link>
        );
      })}
      <Link href="/painel/campanhas" className="inline-flex min-h-11 items-center text-13 font-semibold text-cobalt-500">
        Todas as campanhas
      </Link>
    </div>
  );
}
