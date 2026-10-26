// apps/web/src/components/painel/link-da-bio/bloco-avancado.tsx
"use client";

import React, { useEffect, useState, type InputHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";

import type { DocumentoBio } from "@/lib/bio/documento";
import { idNaTela } from "@/lib/bio/editor";
import { cn } from "@/lib/utils";

import type { PropsDaAba } from "./abas";
import { focarDepois } from "./use-editor-bio";

/**
 * O "Avançado" da aba Perfil (spec 2026-10-19-link-da-bio §8; PR 7): fechado, com o id do Pixel
 * da Meta e o do GA4. Muda o documento só por `mudarDocumento`. O erro do salvar chega pelo
 * `useErroDaAba` da aba Perfil (6b), que precisa destes lugares na lista dela. Quem valida e
 * limpa é o `documentoBio` (PR 2: trim e GA4 em maiúsculas) e, de novo, o `scriptDaPagina`
 * (PR 7) antes de pôr o id no JS da página.
 */

export type CampoDoRastreio = keyof DocumentoBio["rastreio"];
export type ErrosDoRastreio = Partial<Record<CampoDoRastreio, string>>;

/** Os lugares do Avançado: entram na lista do `useErroDaAba` da aba Perfil (constante de módulo). */
export const LUGARES_DO_AVANCADO = ["rastreio.metaPixelId", "rastreio.ga4Id"] as const;

const ID_DO_BOTAO = "bio-avancado";
const ID_DOS_CAMPOS = "bio-avancado-campos";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";
const CAMPO =
  "min-h-11 w-full rounded-lg border border-line-200 bg-paper-0 px-3 py-2.5 text-[16px] leading-snug text-volt-950 aria-invalid:border-danger-700 focus-visible:outline-2 focus-visible:outline-cobalt-500";
const ROTULO = "text-15 font-semibold text-volt-950";
const AJUDA = "text-13 text-slate-600";
const ERRO = "text-13 font-medium text-danger-700";

type DefinicaoDoCampo = {
  campo: CampoDoRastreio;
  rotulo: string;
  ajuda: string;
  extra: Pick<InputHTMLAttributes<HTMLInputElement>, "inputMode" | "autoCapitalize" | "placeholder">;
};

const CAMPOS: readonly DefinicaoDoCampo[] = [
  {
    campo: "metaPixelId",
    rotulo: "ID do pixel da Meta",
    ajuda:
      "Só números. Está no Gerenciador de Eventos, ao lado do nome do pixel. A página manda PageView ao abrir, Contact no botão do WhatsApp e BioToque nos outros.",
    extra: { inputMode: "numeric", placeholder: "1234567890" },
  },
  {
    campo: "ga4Id",
    rotulo: "ID de medição do Google Analytics 4",
    ajuda: "Começa com G-. A página manda page_view ao abrir e bio_toque em cada botão tocado.",
    extra: { autoCapitalize: "characters", placeholder: "G-XXXXXXXXXX" },
  },
];

export type PropsDoConteudo = {
  rastreio: DocumentoBio["rastreio"];
  aberto: boolean;
  erros: ErrosDoRastreio;
  aoAlternar: () => void;
  aoMudar: (campo: CampoDoRastreio, valor: string) => void;
};

/** O bloco sem estado: o teste o desenha fechado, aberto e com erro. */
export function ConteudoDoAvancado({ rastreio, aberto, erros, aoAlternar, aoMudar }: PropsDoConteudo) {
  const configurado = rastreio.metaPixelId.trim() !== "" || rastreio.ga4Id.trim() !== "";
  return (
    <section aria-labelledby={ID_DO_BOTAO} className="pn-card rounded-xl">
      <h2 className="font-brand text-15 font-bold text-volt-950">
        <button
          type="button"
          id={ID_DO_BOTAO}
          aria-expanded={aberto}
          aria-controls={aberto ? ID_DOS_CAMPOS : undefined}
          onClick={aoAlternar}
          className={cn("flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-4 text-left lg:px-5", FOCO)}
        >
          <span className="flex flex-wrap items-center gap-2">
            Avançado
            {configurado && <span className="pn-chip">Configurado</span>}
          </span>
          <ChevronDown
            className={cn("h-5 w-5 flex-none text-slate-600 transition-transform", aberto && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      </h2>
      <p className="px-4 pb-4 text-13 text-slate-600 lg:px-5">Pixel da Meta e Google Analytics, se a loja já usa.</p>
      {aberto && (
        <div id={ID_DOS_CAMPOS} className="grid gap-4 border-t border-line-200 p-4 lg:p-5">
          {CAMPOS.map(({ campo, rotulo, ajuda, extra }) => {
            const id = idNaTela(`rastreio.${campo}`);
            const erro = erros[campo];
            return (
              <div key={campo} className="grid gap-1.5">
                <label htmlFor={id} className={ROTULO}>
                  {rotulo}
                </label>
                <input
                  type="text"
                  {...extra}
                  id={id}
                  value={rastreio[campo]}
                  maxLength={30}
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={erro ? true : undefined}
                  aria-describedby={erro ? `${id}-erro ${id}-ajuda` : `${id}-ajuda`}
                  onChange={(e) => aoMudar(campo, e.target.value)}
                  className={CAMPO}
                />
                {erro && (
                  <p id={`${id}-erro`} className={ERRO}>
                    {erro}
                  </p>
                )}
                <p id={`${id}-ajuda`} className={AJUDA}>
                  {ajuda}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export type PropsDoAvancado = {
  rastreio: DocumentoBio["rastreio"];
  mudarDocumento: PropsDaAba["mudarDocumento"];
  /** Do `useErroDaAba` da aba Perfil (6b): a frase guardada para o lugar e o "a lojista corrigiu". */
  erroDe: (lugar: string) => string | undefined;
  corrigiu: (lugar: string) => void;
};

/** O "Avançado" no fim da aba Perfil (o 6b cria a aba; o PR 7 encaixa este bloco nela). */
export function BlocoAvancado({ rastreio, mudarDocumento, erroDe, corrigiu }: PropsDoAvancado) {
  const [aberto, setAberto] = useState(false);
  const erros: ErrosDoRastreio = { metaPixelId: erroDe(LUGARES_DO_AVANCADO[0]), ga4Id: erroDe(LUGARES_DO_AVANCADO[1]) };
  const comErro = CAMPOS.find(({ campo }) => erros[campo])?.campo;

  // Erro do salvar num campo daqui: o bloco já sai aberto neste desenho (fechado, o campo nem existe).
  // O efeito o deixa aberto quando o erro sumir (a lojista está digitando nele) e leva o foco ao campo
  // depois deste commit — o foco do useErroDaAba pode ter chegado antes de o campo existir.
  useEffect(() => {
    if (!comErro) return;
    setAberto(true);
    focarDepois(idNaTela(`rastreio.${comErro}`));
  }, [comErro]);

  function mudar(campo: CampoDoRastreio, valor: string) {
    mudarDocumento((d) => ({ ...d, rastreio: { ...d.rastreio, [campo]: valor } }));
    corrigiu(`rastreio.${campo}`); // "o erro some ao corrigir" (§8)
  }

  return (
    <ConteudoDoAvancado
      rastreio={rastreio}
      aberto={aberto || comErro !== undefined}
      erros={erros}
      aoAlternar={() => {
        if (!comErro) setAberto((a) => !a); // com erro, o bloco fica aberto até corrigir
      }}
      aoMudar={mudar}
    />
  );
}
