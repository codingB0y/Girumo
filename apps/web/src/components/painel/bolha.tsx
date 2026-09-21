import React from "react";

/**
 * Prova de conversa (componente-assinatura 9.3): a mensagem como ela chega no
 * WhatsApp — fundo de chat, bolha verde-clara, hora e duplo check.
 *
 * Aparece no compositor de Disparos (prévia ao vivo), no histórico, no Início
 * (último post) e na folha de postar. Sem emoji, sem logo do WhatsApp.
 */
export function Bolha({
  grupo,
  hora,
  texto,
  vazio,
  testId,
  foto,
  mencaoTodos,
}: {
  /** Cabeçalho de chat: nome do grupo ou da campanha. */
  grupo: string;
  /** Já formatada por quem chama — a bolha não decide fuso. */
  hora: string;
  texto: string;
  /** O que mostrar quando ainda não há texto. Sem isto a bolha fica muda. */
  vazio?: string;
  testId?: string;
  /** URL da foto anexada (blob: local). A bolha só mostra; não sobe nada. */
  foto?: string;
  /** Mostra "@todos" antes do texto, como o WhatsApp mostra a menção. */
  mencaoTodos?: boolean;
}) {
  const corpo = texto.trim();
  return (
    <div className="pn-bolha-chat">
      <p className="pn-bolha-chat__grupo">{grupo}</p>
      <div className="pn-bolha" data-testid={testId}>
        {/* blob: local, não passa pelo otimizador do next/image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {foto && <img src={foto} alt="" className="pn-bolha__foto" />}
        {mencaoTodos && corpo && <span className="font-semibold text-cobalt-700">@todos </span>}
        {corpo || <span className="text-slate-600">{vazio}</span>}
        <span className="pn-bolha__hora">
          {hora}
          <svg viewBox="0 0 16 16" className="pn-bolha__check" aria-hidden="true">
            <path
              d="M1.5 8.5l3 3 6-6M6.5 11.5l7-7"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
    </div>
  );
}
