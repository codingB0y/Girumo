"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useCasca } from "@/components/painel/casca-context";
import { useRecarga } from "@/components/painel/home/ao-vivo/use-recarga";
import { useToast } from "@/components/toast";
import { RECUPERAR_MENSAL_CENTS } from "@/lib/billing/recuperar-addon";
import { formatarReais } from "@/lib/billing/instagram-preco";
import { AVISO_DE_PRIVACIDADE } from "@/lib/recuperar/aviso";
import { BENEFICIOS, INCLUI, PERGUNTAS, RODAPE_DO_PRECO } from "./ativar-conteudo";

/** O que `GET /api/billing/recuperar/oferta` devolve. */
type Oferta = { bloqueio: "sem_plano" | "ja_assinado" | null; configurado: boolean; podeCobrar: boolean };
type Resposta = { url?: unknown; error?: unknown; code?: unknown };

const ESPERA_MS = 3_000;
/** Depois disso, a espera pelo webhook ganha o aviso de que está demorando (a busca continua). */
const ESPERA_LONGA_MS = 90_000;
const PENDENTE_PADRAO = "A assinatura do Recuperar está com pagamento em aberto. Regularize em Gerenciar cobrança.";
const BOTAO =
  "flex min-h-11 w-full items-center justify-center rounded-[var(--radius-control)] bg-cobalt-500 px-4 text-sm font-semibold text-paper-0 transition-colors hover:bg-cobalt-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";

function lerOferta(raw: unknown): Oferta | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { bloqueio, configurado, podeCobrar } = raw as Record<string, unknown>;
  if (bloqueio !== null && bloqueio !== "sem_plano" && bloqueio !== "ja_assinado") return null;
  if (typeof configurado !== "boolean" || typeof podeCobrar !== "boolean") return null;
  return { bloqueio, configurado, podeCobrar };
}

/**
 * Loja sem o Recuperar. O conteúdo é fixo e aparece já; só o bloco de ação espera a
 * oferta. Logo depois de pagar (`?assinado=1`, ou o checkout respondendo "já assinado"
 * porque outra aba pagou), o webhook do Stripe pode levar alguns segundos para liberar:
 * a tela pergunta o status de novo até ligar.
 */
export function AtivarRecuperar() {
  const assinado = useSearchParams().get("assinado") === "1";
  const { recarregarRecuperar } = useCasca();
  const toast = useToast();
  const idTitulo = useId();
  const idPerguntas = useId();
  const [oferta, setOferta] = useState<Oferta | null>(null);
  const [erro, setErro] = useState(false);
  const [aceite, setAceite] = useState(false);
  const [pendente, setPendente] = useState<string | null>(null);
  const [jaAssinado, setJaAssinado] = useState(false);
  const [demorando, setDemorando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  // O bloco de ação troca de conteúdo depois do clique e o botão focado some: sem levar o
  // foco, ele cai no <body> e o leitor de tela não anuncia a troca.
  const avisoDeEspera = useRef<HTMLDivElement>(null);
  const botaoCobranca = useRef<HTMLButtonElement>(null);
  // Dois cliques chegam antes do re-render que desabilita o botão: sem a trava, duas sessões no Stripe.
  const trava = useRef(false);

  const carregar = useCallback(async () => {
    setErro(false);
    setOferta(null);
    const r = await fetch("/api/billing/recuperar/oferta", { cache: "no-store" }).catch(() => null);
    const lida = r?.ok ? lerOferta(await r.json().catch(() => null)) : null;
    if (lida) setOferta(lida);
    else setErro(true);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const esperando = assinado || jaAssinado || oferta?.bloqueio === "ja_assinado";
  useRecarga(recarregarRecuperar, ESPERA_MS, esperando);
  useEffect(() => {
    if (!esperando) return;
    const t = setTimeout(() => setDemorando(true), ESPERA_LONGA_MS);
    return () => {
      clearTimeout(t);
      setDemorando(false);
    };
  }, [esperando]);

  useEffect(() => {
    if (jaAssinado) avisoDeEspera.current?.focus();
  }, [jaAssinado]);
  useEffect(() => {
    if (pendente) botaoCobranca.current?.focus();
  }, [pendente]);

  // Voltar do Stripe pelo botão Voltar restaura a página do bfcache com o estado de
  // antes da navegação: sem isto o botão ficaria em "Abrindo…", travado, para sempre.
  useEffect(() => {
    const aoVoltar = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      trava.current = false;
      setOcupado(false);
    };
    window.addEventListener("pageshow", aoVoltar);
    return () => window.removeEventListener("pageshow", aoVoltar);
  }, []);

  /** POST que devolve `{ url }` do Stripe. Com a url, segue ocupado até a navegação; só destrava em erro. */
  async function abrir(rota: string, corpo: object | undefined, erroPadrao: string) {
    if (trava.current) return;
    trava.current = true;
    setOcupado(true);
    let saindo = false;
    try {
      const r = await fetch(rota, {
        method: "POST",
        headers: corpo ? { "Content-Type": "application/json" } : undefined,
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
      const j = (await r.json().catch(() => null)) as Resposta | null;
      if (r.ok && typeof j?.url === "string") {
        saindo = true;
        window.location.assign(j.url);
        return;
      }
      const mensagem = typeof j?.error === "string" ? j.error : null;
      // Outra aba já pagou: o webhook vai ligar. Espera como na volta do Stripe, sem toast.
      if (r.status === 409 && j?.code === "ja_assinado") {
        setJaAssinado(true);
        return;
      }
      // Assinatura em `unpaid`: "já assinado, aguarde" nunca se resolveria. Vai para a cobrança, não para o toast.
      if (r.status === 409 && j?.code === "cobranca_pendente") {
        setPendente(mensagem ?? PENDENTE_PADRAO);
        return;
      }
      toast(mensagem ?? erroPadrao, "error");
    } catch {
      toast("Sem conexão. Tente de novo.", "error");
    } finally {
      if (!saindo) {
        trava.current = false;
        setOcupado(false);
      }
    }
  }

  function blocoDeAcao() {
    if (esperando) {
      // O aviso de demora entra dentro da mesma região viva: um role="status" novo, já com
      // texto, não seria anunciado.
      return (
        <div ref={avisoDeEspera} tabIndex={-1} role="status" className="space-y-1 text-sm text-volt-950">
          <p className="font-medium">Pagamento recebido. Liberando o Recuperar da loja…</p>
          {demorando && <p>Está demorando mais que o normal. Se você pagou, fale com a Girumo.</p>}
        </div>
      );
    }
    if (erro) {
      return (
        <div role="alert" className="space-y-2">
          <p className="text-sm text-volt-950">Não deu pra carregar a oferta.</p>
          <button
            type="button"
            onClick={() => void carregar()}
            className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-line-200 px-4 text-sm font-semibold text-volt-950 transition-colors hover:bg-canvas-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
          >
            Tentar de novo
          </button>
        </div>
      );
    }
    if (!oferta) return <div role="status" aria-label="Carregando a oferta" className="pn-skeleton h-28 w-full rounded-[var(--radius-control)]" />;
    if (!oferta.configurado) return <p className="text-sm text-volt-950">Assinatura do Recuperar indisponível no momento. Fale com a Girumo.</p>;
    if (oferta.bloqueio === "sem_plano") {
      return (
        <div className="space-y-2">
          <p className="text-sm text-volt-950">Assine um plano primeiro. O Recuperar é um add-on do plano da loja.</p>
          <Link href="/painel/configuracoes" className={BOTAO}>
            Ver os planos
          </Link>
        </div>
      );
    }
    if (!oferta.podeCobrar) return <p className="text-sm text-volt-950">Só o dono ou um admin da loja pode ativar.</p>;
    if (pendente) {
      return (
        <div className="space-y-2">
          <p role="status" className="text-sm text-volt-950">{pendente}</p>
          <button
            ref={botaoCobranca}
            type="button"
            onClick={() => void abrir("/api/billing/portal", undefined, "Não deu pra abrir a cobrança. Tente de novo.")}
            disabled={ocupado}
            className={BOTAO}
          >
            {ocupado ? "Abrindo a cobrança…" : "Gerenciar cobrança"}
          </button>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <label className="flex min-h-11 cursor-pointer items-start gap-2.5 text-sm text-volt-950">
          <input
            type="checkbox"
            checked={aceite}
            onChange={(e) => setAceite(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-cobalt-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
          />
          <span>{AVISO_DE_PRIVACIDADE.texto}</span>
        </label>
        <button
          type="button"
          onClick={() => void abrir("/api/billing/recuperar/checkout", { avisoConfirmado: true }, "Não deu pra abrir o pagamento. Tente de novo.")}
          disabled={!aceite || ocupado}
          className={BOTAO}
        >
          {ocupado ? "Abrindo o pagamento…" : "Ativar Recuperar"}
        </button>
        <p className="text-13 text-slate-600">
          A cobrança só acontece quando você confirma no pagamento. Cancele quando quiser em Configurações › Plano.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-5 py-6 lg:px-8">
      <div className="flex flex-wrap items-stretch gap-6">
        <section aria-labelledby={idTitulo} className="pn-card flex min-w-0 flex-[999_1_560px] flex-col gap-4 rounded-[var(--radius-porta)] p-6 lg:p-7">
          <p className="text-13 font-semibold text-slate-600">Recuperar · add-on pra quem vende na Yampi</p>
          <h1 id={idTitulo} className="max-w-[620px] font-brand text-28 font-extrabold tracking-[-0.02em] text-volt-950 lg:text-32">
            Recupere o carrinho e o Pix que ficaram pra trás
          </h1>
          <p className="max-w-[620px] text-15 text-slate-600">
            A Yampi avisa a Girumo na hora. A mensagem sai no WhatsApp com o seu jeito de falar, e para sozinha quando a cliente responde ou paga.
          </p>
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
            {BENEFICIOS.map((b) => (
              <li key={b.titulo} className="flex flex-col gap-1 rounded-[var(--radius-control)] border border-line-200 p-3.5">
                <span className="text-15 font-semibold text-volt-950">{b.titulo}</span>
                <span className="text-sm text-slate-600">{b.texto}</span>
              </li>
            ))}
          </ul>
        </section>

        <aside aria-label="Preço" className="pn-card flex min-w-0 flex-[1_1_320px] flex-col gap-3.5 rounded-[var(--radius-porta)] p-6 lg:p-7">
          <span className="text-13 font-semibold text-slate-600">Por loja, além do seu plano</span>
          <p className="flex flex-wrap items-baseline gap-x-1 font-brand font-extrabold text-volt-950">
            <span className="text-48 tracking-[-0.02em]">{formatarReais(RECUPERAR_MENSAL_CENTS)}</span>
            <span className="text-20 font-bold text-slate-600">/mês</span>
          </p>
          <ul className="flex flex-col gap-2 text-sm text-volt-950">
            {INCLUI.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <div className="mt-1.5">{blocoDeAcao()}</div>
          <p className="text-13 text-slate-600">{RODAPE_DO_PRECO}</p>
        </aside>
      </div>

      <section aria-labelledby={idPerguntas} className="pn-card rounded-[var(--radius-porta)] px-6 py-5">
        <h2 id={idPerguntas} className="mb-2 font-brand text-20 font-bold text-volt-950">
          Perguntas de quem já vende
        </h2>
        {PERGUNTAS.map((p, i) => (
          <details key={p.pergunta} open={i === 0} className="border-t border-line-200">
            {/* Sem `flex` no summary: ele apagaria o marcador nativo de abrir/fechar. py-3 dá os 44 px. */}
            <summary className="cursor-pointer py-3 text-15 font-semibold text-volt-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500">
              {p.pergunta}
            </summary>
            <p className="pb-3 text-sm text-slate-600">{p.resposta}</p>
          </details>
        ))}
      </section>
    </div>
  );
}
