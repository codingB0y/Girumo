import React from "react";

import { ETAPAS_COM_AVISO, type Canal, type EtapaComAviso, type MatrizAvisos } from "@/lib/rastreio/tipos";

export const ROTULO_DA_ETAPA: Record<EtapaComAviso, string> = {
  confirmado: "Pedido confirmado",
  enviado: "Pedido enviado",
  retirada: "Pronto para retirada",
  problema: "Problema na entrega",
  entregue: "Entregue",
};

const CANAIS: { canal: Canal; rotulo: string }[] = [
  { canal: "whatsapp", rotulo: "WhatsApp" },
  { canal: "email", rotulo: "E-mail" },
];

type Props = {
  matriz: MatrizAvisos;
  desabilitado: boolean;
  aoAlternar(etapa: EtapaComAviso, canal: Canal): void;
  /** Sem prévia nenhuma a coluna "Mensagem" nem é desenhada. */
  aoVerMensagem: ((etapa: EtapaComAviso) => void) | null;
};

export function Interruptor({
  ligado,
  rotulo,
  desabilitado,
  aoAlternar,
}: {
  ligado: boolean;
  rotulo: string;
  desabilitado: boolean;
  aoAlternar(): void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      // `aria-disabled`, não `disabled`: botão desabilitado perde o foco e o teclado cai no começo da página.
      aria-disabled={desabilitado || undefined}
      onClick={() => {
        if (!desabilitado) aoAlternar();
      }}
      className="pn-interruptor shrink-0 aria-disabled:opacity-60"
    >
      <span className="pn-interruptor__bolinha" />
    </button>
  );
}

/** Etapa × canal: uma linha por etapa, um interruptor por canal. */
export function MatrizDeAvisos({ matriz, desabilitado, aoAlternar, aoVerMensagem }: Props) {
  return (
    <table className="w-full text-left text-[14px]">
      <caption className="sr-only">Avisos que a compradora recebe em cada etapa</caption>
      <thead>
        <tr className="border-b border-line-200 text-12 text-slate-600">
          <th scope="col" className="py-2 font-normal">Etapa</th>
          {CANAIS.map((c) => (
            <th key={c.canal} scope="col" className="w-24 py-2 font-normal">{c.rotulo}</th>
          ))}
          {aoVerMensagem && <th scope="col" className="w-32 py-2 font-normal">Mensagem</th>}
        </tr>
      </thead>
      <tbody>
        {ETAPAS_COM_AVISO.map((etapa) => (
          <tr key={etapa} className="border-b border-line-200 last:border-b-0">
            <th scope="row" className="py-2.5 font-normal text-volt-950">{ROTULO_DA_ETAPA[etapa]}</th>
            {CANAIS.map((c) => (
              <td key={c.canal} className="py-2.5">
                <Interruptor
                  ligado={matriz[etapa][c.canal]}
                  rotulo={`${c.rotulo} em ${ROTULO_DA_ETAPA[etapa]}`}
                  desabilitado={desabilitado}
                  aoAlternar={() => aoAlternar(etapa, c.canal)}
                />
              </td>
            ))}
            {aoVerMensagem && (
              <td className="py-2.5">
                <button
                  type="button"
                  onClick={() => aoVerMensagem(etapa)}
                  aria-label={`Ver mensagem de ${ROTULO_DA_ETAPA[etapa]}`}
                  className="text-13 text-cobalt-700 underline underline-offset-2"
                >
                  Ver mensagem
                </button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
