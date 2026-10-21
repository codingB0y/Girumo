// apps/web/src/components/painel/link-da-bio/erro-da-aba.tsx
"use client";

import React, { useCallback, useEffect, useState } from "react";

import { idNaTela, lugarDoErro, type ErroDeCampo } from "@/lib/bio/editor";

/** Id do aviso no topo da aba: o erro do salvar que não tem campo nela. Só uma aba fica na tela. */
export const ID_DO_AVISO_DA_ABA = "bio-aba-aviso";

export type ErroDaAba = {
  /** A frase do erro, se ele é deste lugar ("perfil.nome", "confere.cnpj", "slug"). */
  erroDe: (lugar: string) => string | undefined;
  /** O erro desta aba que não tem lugar nela: vai no aviso do topo. */
  erroSolto: string | null;
  /** A lojista mexeu no lugar: o erro dele some (§8, "erro aparece embaixo do campo e some ao corrigir"). */
  corrigiu: (lugar: string) => void;
};

type ErroGuardado = { lugar: string | null; mensagem: string };

function guardar(erro: ErroDeCampo, lugares: readonly string[]): ErroGuardado {
  return { lugar: lugarDoErro(erro.campo, lugares), mensagem: erro.mensagem };
}

/**
 * O erro do salvar que é desta aba (`PropsDaAba.erro`, contrato do 6a): a aba guarda, mostra
 * embaixo do campo (ou no topo, sem campo nela), leva o foco até ele (§8: "salvar com erro →
 * primeiro campo com erro") e devolve o erro ao editor (`limparErro`). Salvar dá certo
 * (`versao` sobe): o que estava na aba some. `lugares` tem de ser constante do módulo.
 */
export function useErroDaAba(
  erro: ErroDeCampo | null,
  limparErro: () => void,
  lugares: readonly string[],
  versao: number,
): ErroDaAba {
  // Começa já com o erro: a aba monta com ele quando o editor troca para ela.
  const [guardado, setGuardado] = useState<ErroGuardado | null>(() => (erro ? guardar(erro, lugares) : null));
  const [versaoVista, setVersaoVista] = useState(versao);
  if (versao !== versaoVista) {
    setVersaoVista(versao);
    setGuardado(null);
  }

  useEffect(() => {
    if (!erro) return;
    const novo = guardar(erro, lugares);
    setGuardado(novo);
    // O próprio campo, senão o lugar (o grupo dos destaques), senão o aviso do topo.
    const ids = novo.lugar ? [idNaTela(erro.campo), idNaTela(novo.lugar)] : [ID_DO_AVISO_DA_ABA];
    requestAnimationFrame(() => {
      for (const id of ids) {
        const alvo = document.getElementById(id);
        if (alvo) {
          alvo.focus();
          return;
        }
      }
    });
    limparErro();
  }, [erro, limparErro, lugares]);

  const corrigiu = useCallback((lugar: string) => setGuardado((g) => (g?.lugar === lugar ? null : g)), []);

  return {
    erroDe: (lugar) => (guardado && guardado.lugar === lugar ? guardado.mensagem : undefined),
    erroSolto: guardado && guardado.lugar === null ? guardado.mensagem : null,
    corrigiu,
  };
}

/** O aviso do topo da aba (erro sem campo nela); recebe o foco por programa. */
export function AvisoDaAba({ mensagem }: { mensagem: string }) {
  return (
    <p id={ID_DO_AVISO_DA_ABA} role="alert" tabIndex={-1} className="pn-aviso rounded-[var(--radius-control)]">
      {mensagem}
    </p>
  );
}
