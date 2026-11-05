"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { ConversaDto } from "@/lib/ig/conversas/tipos";
import { cn } from "@/lib/utils";
import { FichaResumida } from "./ficha-resumida";
import { FioDaConversa } from "./fio-da-conversa";
import { useFicha } from "./use-ficha";
import { useFio } from "./use-fio";

type Props = {
  conversa: ConversaDto;
  /** Sobe a cada mudança que o Realtime (ou a consulta) viu nesta conversa: o fio busca as mensagens novas. */
  sinal: number;
  celular: boolean;
  aoMudarConversa: (c: ConversaDto) => void;
  aoVoltar: () => void;
};

/**
 * Fio + ficha de uma conversa. Quem usa põe `key={conversa.id}`: trocar de conversa remonta tudo, e a resposta
 * atrasada da anterior não tem para onde entrar.
 */
export function ConversaAberta({ conversa, sinal, celular, aoMudarConversa, aoVoltar }: Props) {
  const fio = useFio(conversa.id, { aoMudarConversa });
  const ficha = useFicha(conversa.username);
  const [fichaAberta, setFichaAberta] = useState(false);
  const { recarregarNovas } = fio;
  const quem = conversa.username ? `@${conversa.username}` : (conversa.nome ?? "esta pessoa");

  useEffect(() => {
    if (sinal > 0) recarregarNovas();
  }, [sinal, recarregarNovas]);

  return (
    <>
      <FioDaConversa conversa={conversa} fio={fio} aoVoltar={celular ? aoVoltar : undefined} aoAbrirFicha={celular ? () => setFichaAberta(true) : undefined} />
      <div className={cn("min-h-0 border-line-200 bg-paper-0 lg:block lg:border-l", celular && fichaAberta ? "fixed inset-0 z-30 flex flex-col" : "hidden")}>
        {celular && fichaAberta && (
          <button type="button" onClick={() => setFichaAberta(false)} aria-label="Fechar ficha" className="ml-auto mr-1 mt-1 grid h-11 w-11 place-items-center text-volt-950">
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        )}
        <FichaResumida quem={quem} carga={ficha.carga} ficha={ficha.ficha} aoEditarEtiquetas={ficha.editarEtiquetas} aoTentarDeNovo={() => void ficha.recarregar()} />
      </div>
    </>
  );
}
