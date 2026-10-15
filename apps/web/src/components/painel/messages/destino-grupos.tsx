"use client";

import { useId, useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { DESTINO_PADRAO, type Destino } from "@/lib/campaigns/destino";
import {
  FRASE_DA_REGRA,
  alternar,
  avisoEnchendo,
  fraseListaFixa,
  fraseResumo,
  fraseVazios,
  resumoDoDestino,
  selecionados,
} from "@/lib/campaigns/destino-ui";
import { ChipDeEstado } from "@/components/painel/grupos/estado-do-grupo";
import { REGRAS, ROTULO_REGRA, type EstadoGrupo } from "@/lib/groups/estado";
import { numero } from "@/lib/painel/grupos";
import { estadosFrescos, useEstadosDaCampanha } from "@/lib/painel/use-estados-da-campanha";
import { cn } from "@/lib/utils";

/** Três momentos da consulta, nunca dois: esperando ≠ falhou ≠ pronto. */
export type CargaDosEstados =
  | { carga: "carregando" }
  | { carga: "erro"; mensagem: string }
  | { carga: "pronto"; grupos: EstadoGrupo[] };

const CARREGANDO: CargaDosEstados = { carga: "carregando" };
const ERRO_ESTADOS = "Não deu pra carregar os grupos desta campanha agora. Recarregue a página para escolher os grupos.";

/**
 * Estados dos grupos da campanha, pela mesma leitura das abas (`useEstadosDaCampanha`). Slug vazio
 * = nada a buscar (folha fechada, sem campanha); voltar ao mesmo slug lê de novo; trocar de slug
 * nunca devolve a lista da outra campanha. Lista velha (releitura que falhou) é erro: o seletor
 * não decide com estado antigo.
 */
export function useCargaDosEstados(slug: string): CargaDosEstados {
  const { carga } = useEstadosDaCampanha(slug, null);
  return useMemo(() => {
    const estados = estadosFrescos(carga);
    if (estados === null) return CARREGANDO;
    if (estados === "erro") return { carga: "erro", mensagem: ERRO_ESTADOS };
    return { carga: "pronto", grupos: estados.grupos };
  }, [carga]);
}

type Props = {
  estados: CargaDosEstados;
  value: Destino;
  onChange: (destino: Destino) => void;
  /** Folha da barra e Disparos: sem cartão, lista mais baixa e sem rodapé (a tela já mostra o alcance). */
  compacto?: boolean;
};

/**
 * "Para quais grupos" (spec postar-por-grupo §6.5, D6–D8): três atalhos com
 * contagem, a frase da regra, a lista com caixa e estado, o aviso amarelo se o
 * grupo que está enchendo entrar, a nota dos vazios e "Lista fixa" + "Voltar
 * para a regra". Só apresenta: quem decide o que entra em cada regra é o banco.
 */
export function DestinoGrupos({ estados, value, onChange, compacto = false }: Props) {
  const tituloId = useId();
  return (
    <section
      aria-labelledby={tituloId}
      data-testid="destino-grupos"
      className={compacto ? "space-y-3" : "pn-card space-y-3 rounded-[var(--radius-control)] p-4"}
    >
      <h2 id={tituloId} className="text-16 font-semibold text-volt-950">
        Para quais grupos
      </h2>
      {estados.carga === "carregando" ? (
        <p role="status" className="text-13 text-slate-600">
          Carregando os grupos…
        </p>
      ) : estados.carga === "erro" ? (
        <p role="alert" className="text-13 text-alerta">
          {estados.mensagem}
        </p>
      ) : estados.grupos.length === 0 ? (
        <p className="text-13 text-slate-600">Esta campanha ainda não tem grupos.</p>
      ) : (
        <Escolha grupos={estados.grupos} value={value} onChange={onChange} compacto={compacto} />
      )}
    </section>
  );
}

function Escolha({
  grupos,
  value,
  onChange,
  compacto,
}: {
  grupos: EstadoGrupo[];
  value: Destino;
  onChange: (destino: Destino) => void;
  compacto: boolean;
}) {
  const marcados = new Set(selecionados(grupos, value));
  const enchendo = avisoEnchendo(grupos, value);
  const vazios = fraseVazios(grupos, value);

  return (
    <>
      <div role="group" aria-label="Atalhos de destino" className="flex flex-wrap gap-2">
        {REGRAS.map((regra) => {
          const ativo = "regra" in value && value.regra === regra;
          return (
            <button
              key={regra}
              type="button"
              aria-pressed={ativo}
              onClick={() => onChange({ regra })}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-14 font-medium",
                ativo
                  ? "bg-cobalt-500 text-white"
                  : "bg-paper-0 text-volt-950 ring-1 ring-inset ring-line-200 hover:ring-cobalt-500",
              )}
            >
              {ROTULO_REGRA[regra]}
              <span className={cn("font-data text-13 tabular-nums", ativo ? "text-white/80" : "text-slate-600")}>
                {numero(selecionados(grupos, { regra }).length)}
              </span>
            </button>
          );
        })}
        {"grupos" in value && (
          <span className="inline-flex min-h-11 items-center gap-2 rounded-full bg-volt-950 px-4 text-14 font-medium text-white">
            Lista fixa
            <span className="font-data text-13 tabular-nums text-white/80">{numero(marcados.size)}</span>
          </span>
        )}
      </div>

      {"regra" in value ? (
        <p className="text-13 text-slate-600">
          Regra: <strong className="font-semibold text-volt-950">{ROTULO_REGRA[value.regra]}</strong>.{" "}
          {FRASE_DA_REGRA[value.regra]}
        </p>
      ) : (
        <p className="flex flex-wrap items-center gap-x-3 text-13 text-slate-600">
          <span>{fraseListaFixa(marcados.size)}</span>
          <button
            type="button"
            onClick={() => onChange(DESTINO_PADRAO)}
            className="min-h-11 font-semibold text-cobalt-500"
          >
            Voltar para a regra
          </button>
        </p>
      )}

      {vazios && <p className="text-13 text-slate-600">{vazios}</p>}

      {enchendo && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-[var(--radius-control)] bg-aviso-fundo px-3 py-2.5 text-13 text-volt-950"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-atencao" aria-hidden="true" />
          <span>
            Inclui o <strong className="font-semibold">{enchendo.nome}</strong>, que está recebendo gente pelo link
            agora. Quem entrar depois chega no meio desta conversa. Dá para enviar mesmo assim.
          </span>
        </div>
      )}

      <ul className={cn("overflow-y-auto rounded-[var(--radius-control)] border", compacto ? "max-h-56" : "max-h-96")}>
        {grupos.map((g) => (
          <li key={g.groupId} className="border-b last:border-0">
            <label
              className={cn(
                "grid min-h-11 cursor-pointer grid-cols-[20px_minmax(0,1fr)_auto_auto] items-center gap-3 px-3 text-14",
                g.estado === "enchendo" && "bg-cobalt-500/5",
                g.estado === "vazio" ? "text-slate-600" : "text-volt-950",
              )}
            >
              <input
                type="checkbox"
                className="h-[18px] w-[18px] accent-cobalt-500"
                checked={marcados.has(g.whatsappGroupId)}
                onChange={() => onChange(alternar(grupos, value, g.whatsappGroupId))}
              />
              <span className="truncate font-medium">{g.nome}</span>
              <span className="font-data text-13 tabular-nums text-slate-600">{numero(g.membros)}</span>
              <ChipDeEstado estado={g.estado} />
            </label>
          </li>
        ))}
      </ul>

      {!compacto && (
        <p data-testid="destino-resumo" className="font-data text-14 tabular-nums text-volt-950">
          {fraseResumo(resumoDoDestino(grupos, value))}
        </p>
      )}
    </>
  );
}
