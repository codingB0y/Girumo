"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import type { Cotacao } from "@/lib/billing/instagram-oferta";
import { formatarReais } from "@/lib/billing/instagram-preco";

type Oferta = {
  bloqueio: "sem_plano" | "ja_assinado" | null;
  conviteInvalido: boolean;
  cotacao: Cotacao;
  cartao: { brand: string; last4: string } | null;
  configurado: boolean;
  podeCobrar: boolean;
};

const BANDEIRA: Record<string, string> = { visa: "Visa", mastercard: "Mastercard", amex: "Amex", elo: "Elo", hipercard: "Hipercard" };

/** Assinar o add-on Instagram: valores do servidor, cartão salvo com "Autorizar cobrança", ou Checkout do Stripe. */
export function AssinarInstagram() {
  const convite = useSearchParams().get("convite");
  const toast = useToast();
  const [oferta, setOferta] = useState<Oferta | null>(null);
  const [erro, setErro] = useState(false);
  const [ocupado, setOcupado] = useState<"cartao" | "checkout" | null>(null);

  const carregar = useCallback(async () => {
    setErro(false);
    const q = convite ? `?convite=${encodeURIComponent(convite)}` : "";
    const r = await fetch(`/api/billing/instagram/oferta${q}`, { cache: "no-store" }).catch(() => null);
    if (!r?.ok) {
      setErro(true);
      return;
    }
    setOferta((await r.json()) as Oferta);
  }, [convite]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const corpo = JSON.stringify(convite ? { convite } : {});

  async function autorizar() {
    setOcupado("cartao");
    try {
      const r = await fetch("/api/billing/instagram/assinar", { method: "POST", headers: { "Content-Type": "application/json" }, body: corpo });
      const j = (await r.json().catch(() => null)) as { status?: string; redirect?: string; error?: string } | null;
      if (j?.status === "paid") {
        window.location.assign("/painel/instagram?assinado=1");
        return;
      }
      if (j?.redirect) {
        window.location.assign(j.redirect);
        return;
      }
      toast(j?.error ?? "Não deu pra cobrar agora. Tente de novo.", "error");
    } catch {
      toast("Sem conexão. Tente de novo.", "error");
    } finally {
      setOcupado(null);
    }
  }

  async function outroCartao() {
    setOcupado("checkout");
    try {
      const r = await fetch("/api/billing/instagram/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: corpo });
      const j = (await r.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (r.ok && j?.url) {
        window.location.assign(j.url);
        return;
      }
      toast(j?.error ?? "Não deu pra abrir o pagamento. Tente de novo.", "error");
    } catch {
      toast("Sem conexão. Tente de novo.", "error");
    } finally {
      setOcupado(null);
    }
  }

  if (erro) {
    return (
      <p className="text-13 text-slate-600">
        Não deu pra carregar a oferta.{" "}
        <button type="button" onClick={() => void carregar()} className="text-cobalt-500">Tentar de novo</button>
      </p>
    );
  }
  if (!oferta) return <span role="status" aria-label="Carregando a oferta" className="pn-skeleton block h-40 w-full max-w-[460px] rounded-[10px]" />;

  if (oferta.bloqueio === "ja_assinado") {
    return (
      <p className="text-13 text-slate-600">
        O Instagram já está assinado nesta loja. <Link href="/painel/instagram" className="text-cobalt-500">Ir para os fluxos</Link>
      </p>
    );
  }
  if (oferta.bloqueio === "sem_plano") {
    return (
      <div className="max-w-[460px] space-y-2">
        <p className="text-13 text-volt-950">Assine um plano primeiro. O Instagram leva as pessoas para os grupos de WhatsApp da loja, que dependem do plano.</p>
        <Link href="/painel/configuracoes" className="inline-flex h-9 items-center rounded-[var(--radius-control)] bg-volt-950 px-3 text-13 font-medium text-canvas-100">Ver os planos</Link>
      </div>
    );
  }
  if (oferta.conviteInvalido) {
    return (
      <div className="max-w-[460px] space-y-2">
        <p className="text-13 text-volt-950">Este convite não vale mais nesta loja: venceu, já foi usado ou é de outra loja. Fale com a Girumo.</p>
        <Link href="/painel/instagram/assinar" className="text-13 text-cobalt-500">Ver o preço sem convite</Link>
      </div>
    );
  }

  const c = oferta.cotacao;
  const comDesconto = c.implantacaoCents < c.implantacaoCheiaCents;
  const dia = new Date().getDate();

  return (
    <section aria-label="Assinar o Instagram" className="max-w-[460px] rounded-[10px] border border-line-200 bg-paper-0">
      <dl className="divide-y divide-line-200 text-13">
        <div className="flex items-baseline justify-between px-5 py-3">
          <dt className="text-slate-600">Implementação (única)</dt>
          <dd className="text-volt-950">
            {comDesconto && <s className="mr-2 text-slate-600">{formatarReais(c.implantacaoCheiaCents)}</s>}
            <span className="font-medium">{formatarReais(c.implantacaoCents)}</span>
          </dd>
        </div>
        <div className="flex items-baseline justify-between px-5 py-3">
          <dt className="text-slate-600">Mensalidade</dt>
          <dd className="text-volt-950">
            <span className="font-medium">{formatarReais(c.mensalCents)}/mês</span>
            <span className="block text-right text-12 text-slate-600">renova todo dia {dia}</span>
          </dd>
        </div>
        <div className="flex items-baseline justify-between px-5 py-3">
          <dt className="font-medium text-volt-950">Total hoje</dt>
          <dd className="text-15 font-semibold text-volt-950">{formatarReais(c.totalHojeCents)}</dd>
        </div>
      </dl>

      <div className="space-y-2 border-t border-line-200 px-5 py-4">
        {!oferta.configurado && <p className="text-13 text-volt-950">A assinatura do Instagram está indisponível no momento. Fale com a Girumo.</p>}
        {oferta.configurado && !oferta.podeCobrar && <p className="text-13 text-volt-950">Só o dono ou um admin da loja pode assinar.</p>}
        {oferta.configurado && oferta.podeCobrar && (
          <>
            {oferta.cartao && (
              <button
                type="button"
                onClick={() => void autorizar()}
                disabled={ocupado !== null}
                className="flex h-10 w-full items-center justify-center rounded-[var(--radius-control)] bg-volt-950 px-3 text-13 font-medium text-canvas-100 disabled:opacity-50"
              >
                {ocupado === "cartao" ? "Cobrando…" : `Autorizar cobrança de ${formatarReais(c.totalHojeCents)} no ${BANDEIRA[oferta.cartao.brand] ?? "cartão"} final ${oferta.cartao.last4}`}
              </button>
            )}
            <button
              type="button"
              onClick={() => void outroCartao()}
              disabled={ocupado !== null}
              className={
                oferta.cartao
                  ? "w-full text-13 text-cobalt-500 disabled:opacity-50"
                  : "flex h-10 w-full items-center justify-center rounded-[var(--radius-control)] bg-volt-950 px-3 text-13 font-medium text-canvas-100 disabled:opacity-50"
              }
            >
              {ocupado === "checkout" ? "Abrindo o pagamento…" : oferta.cartao ? "Usar outro cartão" : `Pagar ${formatarReais(c.totalHojeCents)} com cartão`}
            </button>
            <p className="text-12 text-slate-600">A cobrança só acontece quando você confirma. Cancele quando quiser em Configurações › Plano.</p>
          </>
        )}
      </div>
    </section>
  );
}
