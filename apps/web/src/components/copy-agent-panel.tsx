"use client";

import { useState } from "react";
import { Sparkles, Copy, Check, RefreshCw, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type CopyType = "oferta" | "novidade" | "reativacao" | "lancamento" | "lembrete";
type Tone = "direto" | "divertido" | "urgente" | "premium";

type Variation = {
  id: string;
  text: string;
  label: string;
};

const TYPES: { value: CopyType; label: string; emoji: string }[] = [
  { value: "oferta", label: "Oferta", emoji: "🔥" },
  { value: "novidade", label: "Novidade", emoji: "✨" },
  { value: "reativacao", label: "Reativação", emoji: "👋" },
  { value: "lancamento", label: "Lançamento", emoji: "🚀" },
  { value: "lembrete", label: "Lembrete", emoji: "⏰" },
];

const TONES: { value: Tone; label: string }[] = [
  { value: "direto", label: "Direto" },
  { value: "divertido", label: "Divertido" },
  { value: "urgente", label: "Urgente" },
  { value: "premium", label: "Premium" },
];

export function CopyAgentPanel({ onSelect }: { onSelect?: (text: string) => void }) {
  const [type, setType] = useState<CopyType>("oferta");
  const [tone, setTone] = useState<Tone>("direto");
  const [product, setProduct] = useState("");
  const [price, setPrice] = useState("");
  const [discount, setDiscount] = useState("");
  const [loading, setLoading] = useState(false);
  const [variations, setVariations] = useState<Variation[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleGenerate() {
    if (!product.trim()) return;
    setLoading(true);
    setError("");
    setVariations([]);

    try {
      const res = await fetch("/api/agents/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          tone,
          product: product.trim(),
          price: price || undefined,
          discount: discount || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Erro ao gerar copy.");
        return;
      }

      const data = await res.json();
      setVariations(data.variations ?? []);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
    onSelect?.(text);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-iris/10">
          <Wand2 className="h-5 w-5 text-iris" />
        </div>
        <div>
          <h3 className="font-display text-base font-bold text-breu">Copy Agent</h3>
          <p className="text-xs text-aco/60">Gera textos de oferta otimizados pra WhatsApp</p>
        </div>
      </div>

      {/* Type selector */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-aco/70">Tipo de mensagem</label>
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                type === t.value
                  ? "border-iris bg-iris/5 text-iris"
                  : "border-breu/[0.08] text-aco/70 hover:border-iris/40",
              )}
            >
              {t.emoji} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tone selector */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-aco/70">Tom</label>
        <div className="flex flex-wrap gap-2">
          {TONES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTone(t.value)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                tone === t.value
                  ? "border-iris bg-iris/5 text-iris"
                  : "border-breu/[0.08] text-aco/70 hover:border-iris/40",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Product input */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-aco/70">Produto ou serviço *</label>
        <Input
          value={product}
          onChange={(e) => setProduct(e.target.value)}
          placeholder="Ex: Tênis Nike Air Max, Bolsa de couro, Consultoria..."
        />
      </div>

      {/* Price + discount (optional) */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-aco/70">Preço (opcional)</label>
          <Input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Ex: 149,90"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-aco/70">Desconto % (opcional)</label>
          <Input
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            placeholder="Ex: 30"
          />
        </div>
      </div>

      {/* Generate button */}
      <Button
        onClick={handleGenerate}
        disabled={loading || !product.trim()}
        className="w-full gap-2"
      >
        {loading ? (
          <><RefreshCw className="h-4 w-4 animate-spin" /> Gerando...</>
        ) : (
          <><Sparkles className="h-4 w-4" /> Gerar copy</>
        )}
      </Button>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {/* Results */}
      {variations.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-aco/70">3 variações geradas — clique pra copiar:</p>
          {variations.map((v) => (
            <div
              key={v.id}
              className="group relative rounded-xl border border-breu/[0.06] bg-bruma/30 p-4 transition hover:border-iris/30 hover:bg-iris/5"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="rounded-full bg-iris/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-iris">
                  {v.label}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(v.text, v.id)}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-aco/60 transition hover:bg-white hover:text-iris"
                >
                  {copied === v.id ? (
                    <><Check className="h-3.5 w-3.5 text-emerald-500" /> Copiado</>
                  ) : (
                    <><Copy className="h-3.5 w-3.5" /> Copiar</>
                  )}
                </button>
              </div>
              <pre className="whitespace-pre-wrap text-sm leading-relaxed text-breu">{v.text}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
