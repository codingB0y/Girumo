"use client";

import { useRef, useState } from "react";
import { WhatsAppIcon } from "@/components/landing/icons";
import { noticeTextV2 } from "@/lib/pages/schema";
import { collectAttribution, trackBeacon } from "@/components/pages/tracking-scripts";

const FIELD =
  "mt-1.5 w-full rounded-lg border border-[#ddd2c2] bg-white px-4 py-3 text-base text-[#221a13] placeholder:text-[#a89e8f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--lp-brand)]";
const LABEL = "block text-sm font-semibold text-[#221a13]";

/**
 * Formulário de captura da estrutura editorial (modelo LUME).
 *
 * Diferenças de propósito frente ao form legado (`components/pages/lead-form.tsx`,
 * que segue servindo o BasicTemplate): rótulos VISÍVEIS (§8.2), SEM checkbox — o
 * clique no CTA é a ação afirmativa — e o aviso de privacidade logo abaixo do
 * botão. O destino do grupo nunca está na página: só chega no `redirect_url` da
 * resposta do POST /api/p/lead, depois da captura bem-sucedida.
 *
 * A redação final do aviso e a base legal dependem do gate jurídico (§8/§13), e a
 * gravação do snapshot de consent (notice_version etc.) é da Fase 4.
 */
export function LeadFormFields({
  slug,
  cta,
  storeName,
  noticeText,
  renderContext,
  preview = false,
}: {
  slug: string;
  cta: string;
  storeName: string;
  noticeText?: string;
  renderContext?: string;
  preview?: boolean;
}) {
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — humano nunca vê
  const started = useRef(false);
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** 1º toque em qualquer campo = intenção. Só uma vez por visita (o servidor dedupa). */
  function handleFormStart() {
    if (preview || started.current) return;
    started.current = true;
    trackBeacon(slug, renderContext, "form_start");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (preview || status === "sending") return;
    setError(null);
    setStatus("sending");
    // Tentativa: emitida ANTES do POST, então erro de rede aparece no funil como
    // tentativa sem lead — é isso que revela form quebrado em vez de escondê-lo.
    trackBeacon(slug, renderContext, "lead_submit_attempt");

    try {
      const res = await fetch("/api/p/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Sem campo de consent: enviar o form É a ação afirmativa (§8.2). A prova
        // é o snapshot do aviso que o servidor grava, não um booleano do client.
        body: JSON.stringify({
          slug,
          name,
          whatsapp,
          website,
          render_context: renderContext,
          ...collectAttribution(),
        }),
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
    trackBeacon(slug, renderContext, "group_click");
    window.fbq?.("trackCustom", "GroupJoin");
    window.gtag?.("event", "group_join");
  }

  if (status === "done") {
    return (
      <div className="rounded-xl border border-[#ddd2c2] bg-white p-5 text-center">
        <p className="font-serif text-lg text-[#221a13]">
          Cadastro concluído{name ? `, ${name.split(" ")[0]}` : ""}.
        </p>
        <p className="mt-1 text-sm text-[#6f6558]">Agora toque para entrar no grupo.</p>
        <a
          href={redirectUrl ?? "#"}
          onClick={handleGroupJoin}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--lp-brand)] px-6 py-4 text-base font-semibold text-[color:var(--lp-on-brand)] transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--lp-brand)]"
        >
          <WhatsAppIcon className="h-5 w-5" aria-hidden />
          Entrar no grupo agora
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <fieldset disabled={preview || status === "sending"} className="space-y-4">
        <div>
          <label htmlFor="lp-name" className={LABEL}>
            Nome
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
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="lp-whatsapp" className={LABEL}>
            WhatsApp com DDD
          </label>
          <input
            id="lp-whatsapp"
            type="tel"
            required
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="(11) 99999-9999"
            value={whatsapp}
            onFocus={handleFormStart}
            onChange={(e) => setWhatsapp(e.target.value)}
            className={FIELD}
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
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2.5 rounded-lg bg-[var(--lp-brand)] px-6 py-4 text-base font-semibold text-[color:var(--lp-on-brand)] transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--lp-brand)] disabled:opacity-60"
        >
          <WhatsAppIcon className="h-5 w-5" aria-hidden />
          {status === "sending" ? "Garantindo sua vaga..." : cta}
        </button>
      </fieldset>

      <p className="mt-3 text-xs font-semibold text-[#6f6558]">
        Grupo gratuito • novidades e condições de atacado • saia quando quiser
      </p>
      <p className="mt-2 text-xs leading-relaxed text-[#6f6558]">
        {noticeText ?? noticeTextV2(storeName)}
      </p>
    </form>
  );
}
