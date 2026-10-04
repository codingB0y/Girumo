"use client";

/**
 * "Ganhe 7 dias grátis" — a oferta ao entrar no painel sem plano (spec 2026-10-03,
 * 4.7; mockup v4, tela 1).
 *
 * Só abre quando `/api/billing/trial` diz `elegivel`, e o checkout aplica o teste
 * sozinho: este modal escolhe o plano, não decide teste. O link do boleto é o
 * único jeito de pedir "sem teste".
 */

import { useCallback, useEffect, useState } from "react";

import { abrirCheckout } from "@/lib/billing/checkout-client";
import { formatarPreco, planosParaOferecer, type PlanoCatalogo } from "@/lib/billing/plan-display";
import { datasDoTeste } from "@/lib/billing/trial-copy";

import { useFocusTrap } from "../use-focus-trap";

interface TrialOfferProps {
  onClose: () => void;
}

const FOCO =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";

export function TrialOffer({ onClose }: TrialOfferProps) {
  const [planos, setPlanos] = useState<PlanoCatalogo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // O foco entra no primeiro tabulável (o Fechar), fica preso no modal e volta a
  // quem abriu: aria-modal só promete isso, quem cumpre é a trava.
  const dialogoRef = useFocusTrap<HTMLDivElement>(true);
  const datas = datasDoTeste(new Date());

  useEffect(() => {
    fetch("/api/plans")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const lista = planosParaOferecer(Array.isArray(d) ? d : []);
        setPlanos(lista);
        // Começa no do meio, como no mockup aprovado.
        setEscolhido(lista[Math.min(1, lista.length - 1)]?.code ?? null);
      })
      .catch(() => setPlanos([]))
      .finally(() => setCarregando(false));
  }, []);

  // Só o Esc depende de `onClose`. O foco fica fora deste efeito: quem monta passa
  // uma arrow nova a cada render, e refocar aqui arrancaria o foco da escolha do
  // plano e o jogaria no Fechar.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [onClose]);

  const comecar = useCallback(
    async (semTeste: boolean) => {
      if (!escolhido) return;
      setAbrindo(true);
      setErro(null);
      try {
        await abrirCheckout(escolhido, { semTeste });
      } catch (e) {
        // A mensagem é a do servidor (inclusive o 409 de quem já está em teste):
        // engolir deixaria o botão girar, parar, e a tela igual a antes do clique.
        setErro(e instanceof Error ? e.message : "Não foi possível abrir o checkout.");
        setAbrindo(false);
      }
    },
    [escolhido],
  );

  const plano = planos.find((p) => p.code === escolhido) ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-volt-950/70 p-4 sm:py-14"
      onClick={onClose}
    >
      <div
        ref={dialogoRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="oferta-teste-titulo"
        aria-describedby="oferta-teste-resumo"
        className="w-full max-w-3xl rounded-xl bg-paper-0 p-6 shadow-xl sm:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="oferta-teste-titulo" className="text-2xl font-bold text-volt-950">
              Ganhe 7 dias grátis no Girumo
            </h2>
            <p id="oferta-teste-resumo" className="mt-1 text-sm text-volt-950/70">
              Escolha o plano, cadastre o cartão e use tudo liberado por 7 dias. Hoje você não paga nada.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className={`shrink-0 rounded-[var(--radius-control)] px-2 py-1 text-xl leading-none text-volt-950/50 transition-colors hover:text-volt-950 ${FOCO}`}
          >
            ×
          </button>
        </div>

        {erro && (
          <p role="alert" className="mt-4 rounded-xl bg-alerta/10 px-4 py-3 text-sm text-alerta">
            {erro}
          </p>
        )}

        <fieldset className="mt-5">
          <legend className="sr-only">Plano</legend>
          {carregando && <p className="text-sm text-volt-950/60">Carregando planos…</p>}

          {!carregando && planos.length === 0 && (
            // Mesmo texto do PlanPaywall, e pelo mesmo motivo: a tela não sabe se o
            // catálogo falhou ou veio sem plano vendável (o banco de dev).
            <p className="text-sm text-volt-950/70">
              Não consegui listar os planos aqui. Abra{" "}
              <a className="font-medium underline" href="/painel/configuracoes">
                Configurações
              </a>{" "}
              pra escolher.
            </p>
          )}

          {planos.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-3">
              {planos.map((p) => (
                <label
                  key={p.code}
                  className={`block cursor-pointer rounded-xl border p-4 text-volt-950 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-cobalt-500 ${
                    escolhido === p.code ? "border-cobalt-500 ring-2 ring-cobalt-500/20" : "border-volt-950/[0.12]"
                  }`}
                >
                  <input
                    type="radio"
                    name="plano-teste"
                    value={p.code}
                    checked={escolhido === p.code}
                    onChange={() => setEscolhido(p.code)}
                    className="sr-only"
                  />
                  <span className="block font-semibold">{p.name}</span>
                  <span className="font-data mt-1 block text-lg tabular-nums">
                    {formatarPreco(p.price_cents ?? 0)}
                    <span className="text-sm text-volt-950/60"> /mês</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <ol
          aria-label="Como funciona a cobrança"
          className="mt-5 grid gap-3 rounded-xl bg-volt-950/[0.04] px-4 py-3 sm:grid-cols-3"
        >
          <li>
            <span className="font-data block text-sm font-semibold">Hoje</span>
            <span className="text-sm text-volt-950/70">R$ 0 · cartão cadastrado</span>
          </li>
          <li>
            <span className="font-data block text-sm font-semibold">{datas.aviso}</span>
            <span className="text-sm text-volt-950/70">te avisamos por e-mail</span>
          </li>
          <li>
            <span className="font-data block text-sm font-semibold">{datas.cobranca}</span>
            <span className="text-sm text-volt-950/70">
              1ª cobrança{plano ? `: ${formatarPreco(plano.price_cents ?? 0)}/mês` : ""}
            </span>
          </li>
        </ol>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          {/* Boleto não renova sozinho: quem não tem cartão assina sem teste (spec 2). */}
          <button
            type="button"
            onClick={() => void comecar(true)}
            disabled={abrindo || !escolhido}
            className={`min-h-11 rounded-[var(--radius-control)] text-sm font-medium text-cobalt-700 underline disabled:opacity-50 ${FOCO}`}
          >
            Prefere boleto? Assine sem teste grátis
          </button>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`min-h-11 rounded-[var(--radius-control)] border border-volt-950/[0.12] px-4 text-sm font-semibold text-volt-950 ${FOCO}`}
            >
              Agora não
            </button>
            <button
              type="button"
              onClick={() => void comecar(false)}
              disabled={abrindo || !escolhido}
              className={`min-h-11 rounded-[var(--radius-control)] bg-cobalt-500 px-5 text-sm font-semibold text-white transition-[filter] duration-[var(--duration-micro)] hover:brightness-110 disabled:opacity-50 ${FOCO}`}
            >
              {abrindo ? "Abrindo…" : `Começar 7 dias grátis${plano ? ` no ${plano.name}` : ""}`}
            </button>
          </div>
        </div>

        <p className="mt-4 text-xs text-volt-950/60">
          Cancele antes de {datas.cobranca} em Configurações › Plano e não paga nada. Um teste por conta e por cartão.
        </p>
      </div>
    </div>
  );
}
