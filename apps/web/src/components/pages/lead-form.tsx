"use client";

import { useRef, useState } from "react";
import { WhatsAppIcon } from "@/components/landing/icons";
import { collectAttribution, trackBeacon } from "@/components/pages/tracking-scripts";

/**
 * Form de captura do BasicTemplate (páginas legadas, até a migração da Fase 5).
 *
 * Sem checkbox (§8.2): enviar o formulário é a ação afirmativa, e o aviso fica
 * visível junto do botão — quem lê antes de agir é quem decide, e um checkbox a
 * mais só treinava a pessoa a marcar sem ler. A prova continua sendo o snapshot
 * do texto, gravado pelo servidor.
 *
 * Sucesso em 2 etapas: confirma o cadastro e SÓ então mostra o botão do grupo —
 * o destino não existe na página antes da captura dar certo.
 */
export function LeadForm({
  slug,
  cta,
  consentText,
  buttonClass,
  preview = false,
}: {
  slug: string;
  cta: string;
  consentText: string;
  buttonClass: string;
  preview?: boolean;
}) {
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — humano nunca vê
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  /** 1º toque num campo = intenção. Uma vez por visita (o servidor dedupa). */
  function handleFormStart() {
    if (preview || started.current) return;
    started.current = true;
    trackBeacon(slug, "form_start");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (preview || status === "sending") return;
    setError(null);
    setStatus("sending");
    trackBeacon(slug, "lead_submit_attempt");

    try {
      const res = await fetch("/api/p/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, name, whatsapp, website, ...collectAttribution() }),
      });
      const data = (await res.json()) as { redirect_url?: string | null; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Não deu certo. Tente de novo.");
        setStatus("idle");
        return;
      }
      setRedirectUrl(data.redirect_url ?? null);
      setStatus("done");
      window.fbq?.("track", "Lead");
      window.gtag?.("event", "generate_lead", { method: "landing_page" });
    } catch {
      setError("Sem conexão. Tente de novo.");
      setStatus("idle");
    }
  }

  function handleGroupJoin() {
    trackBeacon(slug, "group_click");
    window.fbq?.("trackCustom", "GroupJoin");
    window.gtag?.("event", "group_join");
  }

  if (status === "done") {
    return (
      <div className="dz-rise mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
        <p className="text-sm font-medium text-emerald-800">
          Cadastro concluído{name.trim() ? `, ${name.trim().split(" ")[0]}` : ""}.
        </p>
        <p className="mt-1 text-xs text-emerald-700">Agora toque para entrar no grupo.</p>
        <a
          href={redirectUrl ?? "#"}
          onClick={handleGroupJoin}
          className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 text-base font-semibold text-white transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${buttonClass}`}
        >
          <WhatsAppIcon className="h-5 w-5" aria-hidden />
          Entrar no grupo agora
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-3">
      <fieldset disabled={preview || status === "sending"} className="space-y-3">
        <div>
          <label htmlFor="lp-name" className="sr-only">
            Seu nome
          </label>
          <input
            id="lp-name"
            type="text"
            required
            minLength={2}
            maxLength={80}
            autoComplete="name"
            placeholder="Seu nome"
            value={name}
            onFocus={handleFormStart}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-slate-500"
          />
        </div>
        <div>
          <label htmlFor="lp-whatsapp" className="sr-only">
            Seu WhatsApp com DDD
          </label>
          <input
            id="lp-whatsapp"
            type="tel"
            required
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="Seu WhatsApp com DDD"
            value={whatsapp}
            onFocus={handleFormStart}
            onChange={(e) => setWhatsapp(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-slate-500"
          />
        </div>

        {/* honeypot anti-bot — fora do fluxo visual e do leitor de tela */}
        <input
          type="text"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute -left-[9999px] h-0 w-0 opacity-0"
        />

        {error ? (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          className={`flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 text-base font-semibold text-white transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60 ${buttonClass}`}
        >
          <WhatsAppIcon className="h-5 w-5" aria-hidden />
          {status === "sending" ? "Garantindo sua vaga..." : cta}
        </button>
      </fieldset>

      {/* Aviso ABAIXO do botão: é o que a pessoa lê antes de agir, e é o texto
          exato que o servidor grava como prova (mesma fonte, sem divergir). */}
      <p className="text-xs leading-relaxed text-slate-500">{consentText}</p>
    </form>
  );
}
