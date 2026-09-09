"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CampanhasVitrine } from "@/components/painel/campanhas/vitrine/campanhas-vitrine";
import type { Carga } from "@/lib/painel/types";
import { buscarLista } from "@/lib/painel/carregar";
import { buildCampaignGroupsOverview } from "@/lib/campaign-groups-overview";
import type { Group } from "@/lib/mock-data";
import { clicksByCampaign } from "@/lib/links/click-attribution";

type Campanha = {
  id: string;
  name: string;
  loja?: string;
  groupIds: string[];
  slug?: string;
  createdAt: string;
};
type TrackedLink = { slug: string; campaignGroupId?: string | null; campaignName?: string; clicks: number };

export default function PainelCampanhas() {
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [links, setLinks] = useState<TrackedLink[]>([]);
  const [cargaDasCampanhas, setCargaDasCampanhas] = useState<Carga>("carregando");
  const [cargaDosGrupos, setCargaDosGrupos] = useState<Carga>("carregando");
  const [cargaDosLinks, setCargaDosLinks] = useState<Carga>("carregando");
  const [origin, setOrigin] = useState("");

  const carregar = useCallback(() => {
    setOrigin(window.location.origin);
    void buscarLista<Campanha>("/api/campanhas", setCampanhas, setCargaDasCampanhas);
    void buscarLista<Group>("/api/groups", setGroups, setCargaDosGrupos);
    void buscarLista<TrackedLink>("/api/links", setLinks, setCargaDosLinks);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Atribuição por ID da campanha (nome só cobre link legado) — renomear
  // campanha não pode zerar o histórico de cliques.
  const clicksById = useMemo(() => clicksByCampaign(links, campanhas), [links, campanhas]);

  const overviews = useMemo(
    () =>
      campanhas.map((c) =>
        buildCampaignGroupsOverview({
          campaign: c,
          groups,
          clicks: clicksById.get(c.id) ?? 0,
        }),
      ),
    [campanhas, groups, clicksById],
  );

  // PR 10 da Vitrine Aberta: campanha vira etiqueta de peça. O filtro e a
  // busca vivem dentro da tela nova, que tem os seus.
  return (
    <CampanhasVitrine
      campanhas={overviews}
      cargaDasCampanhas={cargaDasCampanhas}
      cargaDosGrupos={cargaDosGrupos}
      cargaDosLinks={cargaDosLinks}
      origin={origin}
      aoTentarDeNovo={carregar}
    />
  );
}
