"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AbaAnuncios } from "@/components/painel/resultados/anuncios/aba-anuncios";
import {
  BotaoLancarGasto,
  DialogoDeGasto,
  RodapeDoGasto,
} from "@/components/painel/resultados/anuncios/dialogo-de-gasto";
import { useRole } from "@/components/painel/role-provider";
import { dayBR } from "@/lib/date-br";
import { buscar } from "@/lib/painel/carregar";
import type { Carga } from "@/lib/painel/types";
import { hasPermission } from "@/lib/permissions";
import { ehRespostaAnuncios } from "@/lib/resultados/anuncios-tela";
import { ehRespostaDoGasto, iniciosDosLancamentos, type RespostaDoGasto } from "@/lib/resultados/gasto-de-anuncio";
import { periodoDoAtalho, type AtalhoDoPeriodo } from "@/lib/resultados/periodo-anuncios";
import type { RespostaAnuncios } from "@/lib/resultados/relatorio-anuncios";

/**
 * Resultados › Anúncios (spec 2026-10-10-funil-anuncios §4). Uma consulta só,
 * `GET /api/resultados/anuncios`, refeita a cada troca de período; para quem tem
 * `ads:manage`, mais a lista de lançamentos de gasto, que liga o botão, o rodapé do
 * cartão e as marcas do gráfico.
 */
export default function PainelResultadosAnuncios() {
  const [atalho, setAtalho] = useState<AtalhoDoPeriodo>("30d");
  const [resposta, setResposta] = useState<RespostaAnuncios | null>(null);
  const [carga, setCarga] = useState<Carga>("carregando");
  // Trocar de período rápido dispara duas buscas; só a última pode escrever na tela,
  // senão a de 7 dias que chegou atrasada pinta o funil com o botão "90 dias" marcado.
  const ultima = useRef(0);

  const carregar = useCallback(() => {
    const esta = ++ultima.current;
    const { de, ate } = periodoDoAtalho(atalho, new Date());
    void buscar(
      `/api/resultados/anuncios?de=${de}&ate=${ate}`,
      ehRespostaAnuncios,
      (r) => {
        if (esta === ultima.current) setResposta(r);
      },
      (c) => {
        if (esta === ultima.current) setCarga(c);
      },
    );
  }, [atalho]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Gasto é dado de caixa (`ads:manage`: dono e administração). Papel ainda
  // carregando (`null`) também não busca: o operador receberia 403 da rota.
  const { role } = useRole();
  const lancaGasto = role !== null && hasPermission(role, "ads:manage");
  const [gasto, setGasto] = useState<RespostaDoGasto | null>(null);
  const [cargaDoGasto, setCargaDoGasto] = useState<Carga>("carregando");
  const [lancando, setLancando] = useState(false);
  // Salvar dispara um recarregamento enquanto outro ainda pode estar em voo: só o último escreve.
  const ultimaDoGasto = useRef(0);

  const carregarGasto = useCallback(() => {
    const esta = ++ultimaDoGasto.current;
    void buscar(
      "/api/anuncios/gasto",
      ehRespostaDoGasto,
      (r) => {
        if (esta === ultimaDoGasto.current) setGasto(r);
      },
      (c) => {
        if (esta === ultimaDoGasto.current) setCargaDoGasto(c);
      },
    );
  }, []);

  useEffect(() => {
    if (lancaGasto) carregarGasto();
  }, [lancaGasto, carregarGasto]);

  // Lançar, editar ou excluir muda o gasto proporcional do relatório: os dois recarregam.
  const aoMudarGasto = useCallback(() => {
    carregarGasto();
    carregar();
  }, [carregarGasto, carregar]);

  const abrir = useCallback(() => setLancando(true), []);
  const fechar = useCallback(() => setLancando(false), []);
  const inicios = useMemo(() => (gasto ? iniciosDosLancamentos(gasto.lancamentos) : undefined), [gasto]);

  return (
    <>
      <AbaAnuncios
        atalho={atalho}
        onAtalho={setAtalho}
        carga={carga}
        resposta={resposta}
        hoje={dayBR()}
        aoTentarDeNovo={carregar}
        acoesDoCabecalho={lancaGasto ? <BotaoLancarGasto onClick={abrir} /> : undefined}
        rodapeDoGasto={
          lancaGasto && gasto ? <RodapeDoGasto quantos={gasto.lancamentos.length} onLancar={abrir} /> : undefined
        }
        iniciosDeGasto={lancaGasto ? inicios : undefined}
      />
      {lancaGasto && lancando && (
        <DialogoDeGasto
          carga={cargaDoGasto}
          resposta={gasto}
          periodo={periodoDoAtalho(atalho, new Date())}
          aoFechar={fechar}
          aoTentarDeNovo={carregarGasto}
          aoMudar={aoMudarGasto}
        />
      )}
    </>
  );
}
