"use client";

import Link from "next/link";

import { LEGAL_PAGES } from "@/lib/public-pages";

/**
 * Aceite dos documentos legais nas telas de entrada.
 *
 * Um componente para as duas telas porque o texto e os links precisam ser os
 * mesmos: `/signup` pede aceite explícito (checkbox), e `/login` avisa que
 * continuar com o Google implica aceitar — de lá também nasce conta, quando o
 * e-mail é novo. Se cada tela escrevesse o próprio texto, uma delas ficaria
 * para trás na primeira mudança.
 *
 * Os links abrem em nova aba de propósito: ler os Termos não pode custar o
 * formulário já preenchido.
 */

const linkClass =
  "font-medium text-acid-500 underline underline-offset-2 transition-colors hover:text-canvas-100";

function LegalLinks() {
  return (
    <>
      <Link href={LEGAL_PAGES.terms} target="_blank" rel="noreferrer" className={linkClass}>
        Termos de Uso
        <span className="sr-only"> (abre em nova aba)</span>
      </Link>
      {" e a "}
      <Link href={LEGAL_PAGES.privacy} target="_blank" rel="noreferrer" className={linkClass}>
        Política de Privacidade
        <span className="sr-only"> (abre em nova aba)</span>
      </Link>
    </>
  );
}

interface LegalConsentCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** Aceite explícito. Governa o cadastro por senha e o botão do Google. */
export function LegalConsentCheckbox({ checked, onChange }: LegalConsentCheckboxProps) {
  return (
    <div className="flex items-start gap-2.5">
      <input
        id="legal-consent"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        // O nome acessível vem daqui, não do <label>: os dois links dentro dele
        // não entram na computação do nome do controle, e um leitor de tela
        // anunciava "Li e concordo com os e a" — frase sem sentido. Os links
        // seguem navegáveis por conta própria, na ordem de tabulação.
        aria-label="Li e concordo com os Termos de Uso e a Política de Privacidade"
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded-[4px] border border-volt-800 bg-volt-950 accent-acid-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
      />
      <label htmlFor="legal-consent" className="cursor-pointer text-xs leading-5 text-canvas-100/70">
        Li e concordo com os <LegalLinks />.
      </label>
    </div>
  );
}

/**
 * Aceite por ação, para o /login.
 *
 * Ali o botão do Google também cria conta quando o e-mail é novo — sem este
 * aviso, essa conta nasceria sem consentimento nenhum. Um checkbox obrigatório
 * na tela de login poria atrito em quem só quer entrar e já aceitou há meses.
 */
export function LegalConsentNotice() {
  return (
    <p className="text-center text-xs leading-5 text-canvas-100/50">
      Ao continuar, você concorda com os <LegalLinks />.
    </p>
  );
}
