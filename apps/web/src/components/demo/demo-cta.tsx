"use client";

import { useRef, useState } from "react";
import { WhatsAppIcon } from "@/components/landing/icons";

type Status = "idle" | "sending" | "done";

type DemoRequestResponse = { ok?: boolean; error?: string; whatsappUrl?: string };

/**
 * CTA final do modo demonstração: agendar uma conversa com o time.
 *
 * `stepReached` é telemetria — o índice do passo em que o visitante chegou
 * até aqui — nunca um campo que a pessoa preenche.
 *
 * No erro 500 de `POST /api/demo/request`, o corpo da resposta traz
 * `whatsappUrl`: um link que não depende de banco nem e-mail estarem de pé.
 * É o caminho que garante que o visitante nunca fica sem saída quando o
 * nosso lado cai — por isso ele aparece junto do erro, não escondido atrás
 * de um retry.
 */
export function DemoCta({ stepReached }: { stepReached: number }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  // O estado `status` só reflete no DOM depois de um re-render — dois cliques
  // no mesmo tick (double-click rápido, Enter segurado) rodam a mesma closure
  // antes disso e passariam pelo `if (status === "sending")`. A ref muda na
  // hora, sem esperar o React: é ela que trava o segundo clique de verdade.
  const submittingRef = useRef(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;

    setError(null);
    setWhatsappUrl(null);
    setStatus("sending");

    try {
      const res = await fetch("/api/demo/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, stepReached }),
      });
      const data = (await res.json().catch(() => ({}))) as DemoRequestResponse;

      if (!res.ok) {
        setError(data.error ?? "Não deu certo. Tente de novo.");
        setWhatsappUrl(data.whatsappUrl ?? null);
        setStatus("idle");
        return;
      }

      setStatus("done");
    } catch {
      setError("Sem conexão. Tente de novo.");
      setStatus("idle");
    } finally {
      submittingRef.current = false;
    }
  }

  if (status === "done") {
    return (
      <div
        data-testid="demo-cta"
        className="mt-6 rounded-2xl border border-sucesso/30 bg-sucesso/10 p-5 text-center"
      >
        <p className="font-medium text-sucesso" data-testid="demo-cta-done">
          Pedido recebido{name.trim() ? `, ${name.trim().split(" ")[0]}` : ""}. Nosso time chama
          você no WhatsApp em instantes.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="demo-cta" className="mt-6 space-y-4 rounded-2xl border border-volt-950/10 bg-papel p-5">
      <div>
        <p className="font-display text-lg text-volt-950">Quer isso rodando no seu WhatsApp?</p>
        <p className="text-sm text-aco">
          Deixe seu nome e WhatsApp — a gente te chama pra agendar uma demonstração ao vivo.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <fieldset disabled={status === "sending"} className="space-y-3">
          <div>
            <label htmlFor="demo-cta-name" className="sr-only">
              Seu nome
            </label>
            <input
              id="demo-cta-name"
              data-testid="demo-cta-name"
              type="text"
              required
              minLength={2}
              maxLength={120}
              autoComplete="name"
              placeholder="Seu nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="min-h-12 w-full rounded-[var(--radius-control)] border border-line-200 bg-papel px-4 py-3 text-base text-volt-950 placeholder:text-aco/65 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cobalt-500"
            />
          </div>
          <div>
            <label htmlFor="demo-cta-phone" className="sr-only">
              Seu WhatsApp com DDD
            </label>
            <input
              id="demo-cta-phone"
              data-testid="demo-cta-phone"
              type="tel"
              required
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="Seu WhatsApp com DDD"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="min-h-12 w-full rounded-[var(--radius-control)] border border-line-200 bg-papel px-4 py-3 text-base text-volt-950 placeholder:text-aco/65 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cobalt-500"
            />
          </div>

          {error ? (
            <div
              role="alert"
              data-testid="demo-cta-error"
              className="space-y-2 rounded-[var(--radius-control)] border border-danger-700/30 bg-danger-700/10 px-3 py-2 text-sm text-danger-700"
            >
              <p>{error}</p>
              {whatsappUrl ? (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 font-medium text-danger-700 underline underline-offset-2"
                >
                  <WhatsAppIcon className="h-4 w-4" />
                  Falar no WhatsApp agora
                </a>
              ) : null}
            </div>
          ) : null}

          <button
            type="submit"
            data-testid="demo-cta-submit"
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-acid-500 px-6 py-3 text-base font-semibold text-volt-950 transition-[filter] hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
          >
            {status === "sending" ? "Enviando..." : "Agendar demonstração"}
          </button>
        </fieldset>
      </form>
    </div>
  );
}
