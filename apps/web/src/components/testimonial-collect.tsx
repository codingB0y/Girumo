"use client";

import { useState } from "react";
import { Star, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Modal/card que aparece no dashboard quando o onboarding está completo.
 * Coleta depoimento real do lojista (vai pra fila de aprovação no admin).
 */
export function TestimonialCollect({ onDismiss }: { onDismiss?: () => void }) {
  const [rating, setRating] = useState(5);
  const [quote, setQuote] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!quote.trim() || quote.trim().length < 10) return;
    setSending(true);

    try {
      const res = await fetch("/api/testimonials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote: quote.trim(), rating }),
      });
      if (res.ok) setSent(true);
    } catch {
      // silent fail — não bloquear UX
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 text-center">
        <p className="text-sm font-medium text-emerald-800">Obrigado pelo depoimento! 💚</p>
        <p className="mt-1 text-xs text-emerald-600/70">Ele aparecerá no site após aprovação.</p>
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl border border-iris/20 bg-iris/5 p-5">
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="absolute right-3 top-3 rounded-lg p-1 text-aco/40 transition hover:bg-white hover:text-aco"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      <p className="text-sm font-medium text-breu">Como está sendo sua experiência com o HubFlow?</p>
      <p className="mt-0.5 text-xs text-aco/60">Seu depoimento ajuda outros lojistas a conhecerem a ferramenta.</p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        {/* Star rating */}
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              className="transition hover:scale-110"
              aria-label={`${n} estrela${n > 1 ? "s" : ""}`}
            >
              <Star
                className={cn(
                  "h-6 w-6",
                  n <= rating ? "fill-amber-400 text-amber-400" : "text-aco/20",
                )}
              />
            </button>
          ))}
        </div>

        {/* Quote input */}
        <textarea
          value={quote}
          onChange={(e) => setQuote(e.target.value)}
          placeholder="Ex: O HubFlow me economiza 2 horas por dia no disparo dos grupos..."
          rows={3}
          className="w-full rounded-xl border border-breu/10 bg-white px-3.5 py-2.5 text-sm text-breu placeholder:text-aco/40 focus:border-iris focus:outline-none focus:ring-2 focus:ring-iris/20"
        />

        <Button
          type="submit"
          disabled={sending || quote.trim().length < 10}
          className="w-full gap-2"
        >
          <Send className="h-3.5 w-3.5" />
          {sending ? "Enviando..." : "Enviar depoimento"}
        </Button>
      </form>
    </div>
  );
}
