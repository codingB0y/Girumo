"use client";

import { useState } from "react";
import { WhatsAppIcon } from "@/components/landing/icons";
import { collectAttribution, trackBeacon } from "@/components/pages/tracking-scripts";

/**
 * Form de captura da LP: nome + WhatsApp + consent LGPD (obrigatório).
 * Fluxo: submit → POST /api/p/lead → sucesso mostra o botão "Entrar no grupo"
 * (clique dispara GroupJoin + pixels e navega pro destino).
 * `preview` desabilita tudo (usado no editor do painel).
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
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot — humano nunca vê
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (preview || status === "sending") return;
    setError(null);
    setStatus("sending");

    try {
      const res = await fetch("/api/p/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, name, whatsapp, consent, website, ...collectAttribution() }),
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
    trackBeacon(slug, "GroupJoin");
    window.fbq?.("trackCustom", "GroupJoin");
    window.gtag?.("event", "group_join");
  }

  if (status === "done") {
    return (
      <div className="dz-rise mt-6 rounded-[var(--radius-card)] border border-success-700/30 bg-success-700/10 p-4 text-center">
        <p className="text-sm font-medium text-success-700">
          Tudo certo, {name.split(" ")[0]}! Seu cadastro foi concluído.
        </p>
        <a
          href={redirectUrl ?? "#"}
          onClick={handleGroupJoin}
          className={`mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] px-6 py-3 text-base font-semibold transition-[filter] hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${buttonClass}`}
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
            onChange={(e) => setName(e.target.value)}
            className="min-h-12 w-full rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-4 py-3 text-base text-volt-950 placeholder:text-slate-600/65 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cobalt-500"
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
            onChange={(e) => setWhatsapp(e.target.value)}
            className="min-h-12 w-full rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-4 py-3 text-base text-volt-950 placeholder:text-slate-600/65 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cobalt-500"
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

        <label className="flex items-start gap-2.5 text-left">
          <input
            type="checkbox"
            required
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded-[3px] border-line-200 accent-cobalt-500"
          />
          <span className="text-xs leading-relaxed text-slate-600">{consentText}</span>
        </label>

        {error ? (
          <p role="alert" className="rounded-[var(--radius-control)] border border-danger-700/30 bg-danger-700/10 px-3 py-2 text-sm text-danger-700">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] px-6 py-3 text-base font-semibold transition-[filter] hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60 ${buttonClass}`}
        >
          <WhatsAppIcon className="h-5 w-5" aria-hidden />
          {status === "sending" ? "Enviando..." : cta}
        </button>
      </fieldset>
    </form>
  );
}
