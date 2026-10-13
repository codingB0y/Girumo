"use client";

import { AtSign, Copy, Loader2, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { formatarReais, IMPLANTACAO_CENTS, implantacaoComDesconto, MENSAL_CENTS, parseDesconto } from "@/lib/billing/instagram-preco";
import type { InstagramInvite } from "@/lib/stores/instagram-invites";

function data(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

function situacao(c: InstagramInvite): string {
  if (c.used_at) return `Usado em ${data(c.used_at)}`;
  if (c.revoked_at) return `Revogado em ${data(c.revoked_at)}`;
  if (new Date(c.expires_at).getTime() < Date.now()) return `Venceu em ${data(c.expires_at)}`;
  return `Aberto até ${data(c.expires_at)}`;
}

/**
 * Convite nominal do add-on Instagram: desconto de 0 a 100% só na implementação,
 * uso único, 7 dias. O link aparece UMA vez (o banco guarda só o hash do token).
 */
export function TenantInstagramInvite({ tenantId }: { tenantId: string }) {
  const [desconto, setDesconto] = useState("100");
  const [convites, setConvites] = useState<InstagramInvite[] | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [loading, setLoading] = useState<"gerar" | "revogar" | null>(null);
  const [result, setResult] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const pct = parseDesconto(desconto);
  const aberto = convites?.find((c) => !c.used_at && !c.revoked_at && new Date(c.expires_at).getTime() > Date.now()) ?? null;

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/admin/tenants/${tenantId}/instagram-invite`).catch(() => null);
    const corpo = r?.ok ? ((await r.json()) as { invites?: InstagramInvite[] }) : null;
    setConvites(corpo?.invites ?? []);
  }, [tenantId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function chamar(acao: "gerar" | "revogar") {
    setLoading(acao);
    setResult(null);
    try {
      const r = await fetch(`/api/admin/tenants/${tenantId}/instagram-invite`, {
        method: acao === "gerar" ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: acao === "gerar" ? JSON.stringify({ discountPercent: pct }) : undefined,
      });
      const corpo = (await r.json().catch(() => null)) as { link?: string; error?: string } | null;
      if (!r.ok) {
        setResult({ type: "error", message: corpo?.error ?? "Não deu certo. Tente de novo." });
        return;
      }
      if (acao === "gerar" && corpo?.link) {
        setLink(corpo.link);
        setResult({ type: "success", message: "Convite gerado. Copie o link agora: ele não aparece de novo." });
      } else {
        setLink(null);
        setResult({ type: "success", message: "Convite revogado." });
      }
      await carregar();
    } catch {
      setResult({ type: "error", message: "Sem conexão. Tente de novo." });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-3 border-t border-volt-950/[0.06] px-5 py-4">
      <div>
        <p className="flex items-center gap-1.5 text-sm font-semibold text-volt-950">
          <AtSign className="h-4 w-4 text-cobalt-500" aria-hidden="true" />
          Convite do Instagram
        </p>
        <p className="mt-0.5 text-xs text-aco/60" aria-live="polite">
          Link só desta loja, uso único, vale 7 dias. Implementação {formatarReais(IMPLANTACAO_CENTS)}
          {pct !== null && pct > 0 ? ` → ${formatarReais(implantacaoComDesconto(pct))}` : ""} + {formatarReais(MENSAL_CENTS)}/mês.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-aco/70" htmlFor="desconto-instagram">
          Desconto na implementação (%)
        </label>
        <input
          id="desconto-instagram"
          type="number"
          min={0}
          max={100}
          step={1}
          value={desconto}
          onChange={(e) => setDesconto(e.target.value)}
          disabled={loading !== null}
          className="w-[90px] rounded-xl border border-volt-950/10 bg-white px-3 py-2 text-sm text-volt-950 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void chamar("gerar")}
          disabled={loading !== null || pct === null}
          className="inline-flex items-center gap-2 rounded-xl border border-cobalt-500/30 bg-cobalt-500/[0.06] px-4 py-2 text-sm font-medium text-cobalt-500 transition hover:bg-cobalt-500/[0.1] disabled:opacity-50"
        >
          {loading === "gerar" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <AtSign className="h-4 w-4" aria-hidden="true" />}
          {aberto ? "Gerar outro (revoga o atual)" : "Gerar link"}
        </button>
        {aberto && (
          <button
            type="button"
            onClick={() => void chamar("revogar")}
            disabled={loading !== null}
            className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
          >
            {loading === "revogar" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <XCircle className="h-4 w-4" aria-hidden="true" />}
            Revogar
          </button>
        )}
      </div>
      {pct === null && <p className="text-xs text-red-600">Desconto: número inteiro de 0 a 100.</p>}

      {link && (
        <div className="flex items-center gap-2 rounded-xl border border-volt-950/10 bg-white px-3 py-2">
          <code className="min-w-0 flex-1 truncate text-xs text-volt-950">{link}</code>
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(link).then(() => setResult({ type: "success", message: "Link copiado." }))}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-cobalt-500"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            Copiar
          </button>
        </div>
      )}

      {result && (
        <p role="status" className={`text-xs ${result.type === "success" ? "text-emerald-700" : "text-red-600"}`}>
          {result.message}
        </p>
      )}

      {convites && convites.length > 0 && (
        <ul className="space-y-1 text-xs text-aco/70" aria-label="Convites do Instagram">
          {convites.map((c) => (
            <li key={c.id}>
              {c.discount_percent}% · gerado em {data(c.created_at)} · {situacao(c)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
