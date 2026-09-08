"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, Zap } from "lucide-react";

import { cn } from "@/lib/utils";
import { Folha } from "@/components/painel/folha";
import { TRIGGER_LABELS } from "@/lib/automations/trigger-labels";
import {
  cenaDasAutomacoes,
  chipDoPasso,
  resumoDaAutomacao,
  visiveisParaOLojista,
} from "@/lib/painel/automacoes";
import type { Carga } from "@/lib/painel/types";

export type PassoNaTela = { id: string; type: string; delay_minutes: number };

export type AutomacaoNaTela = {
  id: string;
  name: string;
  trigger: string;
  enabled: boolean;
  steps: PassoNaTela[];
  total_runs: number;
};

export type TemplateNaTela = { name: string; trigger: string; steps: readonly unknown[] };

type Props = {
  automacoes: readonly AutomacaoNaTela[];
  carga: Carga;
  criando: boolean;
  erroDeAcao: string | null;
  templates: readonly TemplateNaTela[];
  aoCriar: (indice: number) => void;
  aoAlternar: (id: string, ligada: boolean) => void;
  aoExcluir: (id: string) => void;
  aoFecharAviso: () => void;
  aoTentarDeNovo: () => void;
};

/**
 * Automações na Vitrine Aberta: cada uma é uma peça com interruptor, e o
 * estado ligado/desligado é a primeira coisa que a lojista lê.
 *
 * O filtro dos gatilhos de lifecycle do SaaS mora em `visiveisParaOLojista` e
 * roda AQUI também, não só na página: a tela é a última fronteira antes de um
 * "trial_ending" aparecer para quem paga.
 */
export function AutomacoesVitrine({
  automacoes,
  carga,
  criando,
  erroDeAcao,
  templates,
  aoCriar,
  aoAlternar,
  aoExcluir,
  aoFecharAviso,
  aoTentarDeNovo,
}: Props) {
  const [folhaAberta, setFolhaAberta] = useState(false);
  const visiveis = useMemo(() => visiveisParaOLojista(automacoes), [automacoes]);
  const cena = cenaDasAutomacoes({ carga, total: visiveis.length });

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 px-4 py-6 sm:px-8 lg:py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-brand text-28 font-bold tracking-[-0.4px] text-volt-950">Automações</h1>
          <p className="mt-1 text-15 text-slate-600">
            Mensagens que saem sozinhas quando algo acontece no grupo.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFolhaAberta(true)}
          aria-controls="folha-templates"
          className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-volt-950 px-4 text-15 font-semibold text-paper-0 transition-colors hover:bg-volt-800"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Nova automação
        </button>
      </header>

      {erroDeAcao && (
        <div
          role="alert"
          className="pn-aviso flex items-center justify-between gap-3 rounded-[var(--radius-control)] px-4 py-3"
        >
          <span>{erroDeAcao}</span>
          <button
            type="button"
            onClick={aoFecharAviso}
            aria-label="Fechar aviso"
            className="rounded-[var(--radius-chip)] px-2 py-1 text-13 font-semibold transition-colors hover:bg-canvas-100"
          >
            Fechar
          </button>
        </div>
      )}

      {cena === "carregando" && (
        <div className="space-y-3" role="status" aria-label="Carregando automações">
          {[0, 1, 2].map((i) => (
            <div key={i} className="pn-skeleton h-24 rounded-[var(--radius-control)]" data-testid="painel-skeleton" />
          ))}
        </div>
      )}

      {cena === "erro" && (
        <div className="pn-card rounded-[var(--radius-control)] p-6">
          <p className="text-15 text-volt-950">Não deu para carregar as automações.</p>
          <p className="mt-1 text-13 text-slate-600">
            As que você já criou continuam rodando — só esta lista não chegou.
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
          <p className="text-15 text-volt-950">Nenhuma automação ainda.</p>
          <p className="mt-1 text-13 text-slate-600">
            Escolha um modelo pronto: a mensagem sai no grupo sozinha quando o gatilho acontece.
          </p>
          <button
            type="button"
            onClick={() => setFolhaAberta(true)}
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-volt-950 px-4 text-15 font-semibold text-paper-0 transition-colors hover:bg-volt-800"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Criar a primeira
          </button>
        </div>
      )}

      {cena === "lista" && (
        <ul className="space-y-3">
          {visiveis.map((automacao) => (
            <li key={automacao.id}>
              <Peca automacao={automacao} aoAlternar={aoAlternar} aoExcluir={aoExcluir} />
            </li>
          ))}
        </ul>
      )}

      <Folha
        aberta={folhaAberta}
        aoFechar={() => setFolhaAberta(false)}
        titulo="Escolha um modelo"
        testId="folha-templates"
        id="folha-templates"
      >
        <p className="text-13 text-slate-600">
          Comece por um modelo pronto e ajuste a mensagem depois. Nenhum deles manda mensagem no
          privado — todos postam no grupo.
        </p>
        <ul className="mt-4 space-y-2">
          {templates.map((template, indice) => {
            const gatilho = TRIGGER_LABELS[template.trigger];
            const passos = template.steps.length;
            return (
              <li key={template.name}>
                <button
                  type="button"
                  onClick={() => aoCriar(indice)}
                  disabled={criando}
                  className="flex w-full min-h-11 items-center gap-3 rounded-[var(--radius-control)] border border-line-200 p-3 text-left transition-colors hover:bg-canvas-100 disabled:opacity-60"
                >
                  <span className="grid h-9 w-9 flex-none place-items-center rounded-[var(--radius-chip)] bg-canvas-100 text-volt-950">
                    <Zap className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-15 font-semibold text-volt-950">{template.name}</span>
                    <span className="font-data block text-12 text-slate-600">
                      {gatilho?.label ?? template.trigger} · {passos}{" "}
                      {passos === 1 ? "passo" : "passos"}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Folha>
    </div>
  );
}

function Peca({
  automacao,
  aoAlternar,
  aoExcluir,
}: {
  automacao: AutomacaoNaTela;
  aoAlternar: (id: string, ligada: boolean) => void;
  aoExcluir: (id: string) => void;
}) {
  const gatilho = TRIGGER_LABELS[automacao.trigger];
  const Icone = gatilho?.icon ?? Zap;
  const resumo = resumoDaAutomacao(automacao, gatilho?.label ?? automacao.trigger);

  return (
    <article
      className={cn(
        "pn-card rounded-[var(--radius-control)] p-4 transition-opacity",
        !automacao.enabled && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-[var(--radius-chip)] bg-canvas-100 text-volt-950">
          <Icone className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-15 font-semibold text-volt-950">{automacao.name}</h2>
          <p className="font-data mt-0.5 text-12 text-slate-600">{resumo}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={automacao.enabled}
          aria-label={`${automacao.enabled ? "Desligar" : "Ligar"} ${automacao.name}`}
          onClick={() => aoAlternar(automacao.id, !automacao.enabled)}
          className="pn-interruptor mt-0.5"
        >
          <span className="pn-interruptor__bolinha" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {automacao.steps.map((passo) => {
          const chip = chipDoPasso(passo);
          return (
            <span key={passo.id} className={cn("pn-chip", !chip.mensagem && "pn-chip--line")}>
              {chip.texto}
            </span>
          );
        })}
        <button
          type="button"
          onClick={() => aoExcluir(automacao.id)}
          className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] px-2 text-13 text-slate-600 transition-colors hover:bg-canvas-100 hover:text-volt-950"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          Excluir <span className="sr-only">{automacao.name}</span>
        </button>
      </div>
    </article>
  );
}
