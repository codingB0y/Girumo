"use client";

import { useEffect, useState } from "react";
import { Info, X } from "lucide-react";

const CARTOES: { titulo: string; texto: string }[] = [
  {
    titulo: "Como divulgar o link",
    texto:
      "Cole o link da campanha na bio do Instagram, nos anúncios e no status. Ele leva cada pessoa para o grupo certo, na ordem: enche um até 95% e passa para o próximo.",
  },
  {
    titulo: "Como o rodízio enche os grupos",
    texto:
      "Os grupos entram na ordem em que estão na campanha. Grupo sem convite ou onde você não é admin fica de fora. Com a criação automática ligada, a Girumo abre um grupo novo quando o último passa de 90%.",
  },
  {
    titulo: "Abrir direto no aplicativo",
    texto:
      "Com o deep link ligado, quem clica no Instagram vai direto para o app do WhatsApp, sem a página \"baixe o WhatsApp\" do navegador. Em computador, o link normal continua valendo.",
  },
  {
    titulo: "Quando lotar",
    texto:
      "Escolha o que a pessoa vê quando não há vaga: um aviso, uma lista de espera numa Página da conta (com consentimento) ou outro link seu. Campanha sem grupo configurado sempre mostra o aviso — para você ver o que falta.",
  },
];

/** Painel lateral de ajuda — aberto pelo "?" em qualquer aba. Vídeos entram quando existirem. */
export function AjudaPainel() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-volt-950/10 bg-papel px-3 text-sm font-medium text-aco transition-colors duration-[160ms] hover:text-volt-950"
      >
        <Info className="h-4 w-4" /> Ajuda
      </button>
      {open && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Ajuda">
          <button type="button" className="absolute inset-0 cursor-default bg-volt-950/30" onClick={() => setOpen(false)} aria-label="Fechar ajuda" />
          <aside className="hf-enter absolute inset-y-0 right-0 w-full max-w-md overflow-y-auto bg-papel p-6 shadow-deep">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-extrabold tracking-[-0.02em] text-volt-950">Como funciona</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="text-aco/60 hover:text-volt-950">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 grid gap-3">
              {CARTOES.map((c) => (
                <section key={c.titulo} className="rounded-2xl border border-volt-950/[0.08] bg-poco p-4">
                  <h3 className="text-sm font-medium text-volt-950">{c.titulo}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-aco">{c.texto}</p>
                </section>
              ))}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
