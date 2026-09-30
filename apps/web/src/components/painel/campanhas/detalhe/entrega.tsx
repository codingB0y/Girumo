"use client";

import { useEffect, useState } from "react";
import { Ban, Check, Clock, Loader2, X } from "lucide-react";
import { horaBR } from "@/lib/date-br";
import {
  aindaSaindo,
  resumoDaEntrega,
  type EntregaDoPost,
  type EntregaNoGrupo,
  type EstadoDaEntrega,
  type ResumoDaEntrega,
} from "@/lib/painel/entrega";
import { numero } from "@/lib/painel/grupos";
import { cn } from "@/lib/utils";

/** Enquanto o post sai, a tabela relê a entrega a cada 20 s; parou de sair, para de ler. */
const RELER_A_CADA_MS = 20_000;
/**
 * Teto da espera entre leituras. Grupo pode ficar horas na fila com razão
 * (teto por hora do número novo, breaker): parada, a releitura vai espaçando até
 * aqui em vez de bater no banco a cada 20 s a tarde inteira.
 */
const RELER_NO_MAXIMO_A_CADA_MS = 120_000;

export type LeituraDaEntrega = "lendo" | "pronta" | "falhou";

/**
 * A entrega do post grupo a grupo, de `GET /api/disparos/[id]/grupos`. Lê de
 * novo quando a página atualiza (`versao`) e, sozinha, enquanto houver grupo
 * postando ou na fila; com a aba escondida, espera ela voltar.
 */
export function useEntrega(postId: string | null, versao: number) {
  const [entrega, setEntrega] = useState<EntregaDoPost | null>(null);
  // De qual post é o erro: o de outro post não pode pintar "não carregou" neste.
  const [erroDe, setErroDe] = useState<string | null>(null);

  useEffect(() => {
    if (!postId) return;
    let vivo = true;
    let proxima: ReturnType<typeof setTimeout> | undefined;
    let intervalo = RELER_A_CADA_MS;
    let ultimaContagem = "";
    let esperandoAba = false;

    function agendar() {
      if (!vivo) return;
      if (document.hidden) {
        esperandoAba = true;
        return;
      }
      proxima = setTimeout(ler, intervalo);
    }

    async function ler() {
      try {
        const r = await fetch(`/api/disparos/${encodeURIComponent(postId ?? "")}/grupos`);
        // 4xx (e o 501 de quem roda sem banco) não melhora insistindo.
        if (!r.ok && (r.status < 500 || r.status === 501)) {
          if (vivo) setErroDe(postId);
          return;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const lida = (await r.json()) as EntregaDoPost;
        if (!vivo) return;
        setEntrega(lida);
        setErroDe(null);
        const resumo = resumoDaEntrega(lida.grupos);
        if (!aindaSaindo(resumo)) return;
        const contagem = `${resumo.entregues}/${resumo.postando}/${resumo.naFila}/${resumo.falharam}`;
        intervalo = contagem === ultimaContagem ? Math.min(intervalo * 2, RELER_NO_MAXIMO_A_CADA_MS) : RELER_A_CADA_MS;
        ultimaContagem = contagem;
        agendar();
      } catch {
        if (!vivo) return;
        // Rede ou 5xx no meio do envio: a linha não pode congelar em "postando".
        setErroDe(postId);
        intervalo = Math.min(intervalo * 2, RELER_NO_MAXIMO_A_CADA_MS);
        agendar();
      }
    }

    function aoMudarDeAba() {
      if (document.hidden || !esperandoAba) return;
      esperandoAba = false;
      void ler();
    }

    document.addEventListener("visibilitychange", aoMudarDeAba);
    void ler();
    return () => {
      vivo = false;
      if (proxima) clearTimeout(proxima);
      document.removeEventListener("visibilitychange", aoMudarDeAba);
    };
  }, [postId, versao]);

  // A entrega de outro post (a página trocou de post e a leitura nova não voltou) não vale.
  const daquele = entrega && entrega.postId === postId ? entrega : null;
  const falhou = postId !== null && erroDe === postId;
  const leitura: LeituraDaEntrega = daquele ? "pronta" : falhou ? "falhou" : "lendo";
  return { entrega: daquele, leitura, desatualizada: Boolean(daquele && falhou) };
}

const ESTADO: Record<EstadoDaEntrega, { texto: string; classe: string; Icone: typeof Check }> = {
  entregue: { texto: "entregue", classe: "text-success-700", Icone: Check },
  postando: { texto: "postando", classe: "text-volt-950", Icone: Loader2 },
  na_fila: { texto: "na fila", classe: "text-slate-600", Icone: Clock },
  falhou: { texto: "falhou", classe: "text-danger-700", Icone: X },
  cancelado: { texto: "cancelado", classe: "text-slate-600", Icone: Ban },
};

function IconeDoEstado({ estado }: { estado: EstadoDaEntrega }) {
  const { Icone } = ESTADO[estado];
  return <Icone className={cn("h-3.5 w-3.5 shrink-0", estado === "postando" && "motion-safe:animate-spin")} aria-hidden="true" />;
}

/** Como o post está neste grupo. Grupo que não recebeu este post (entrou depois, ou sem admin) fica "—". */
export function CelulaDaEntrega({ entrega, leitura }: { entrega: EntregaNoGrupo | undefined; leitura: LeituraDaEntrega }) {
  if (!entrega) {
    if (leitura === "lendo") {
      return (
        <span className="text-slate-600">
          <span aria-hidden="true">…</span>
          <span className="sr-only">lendo a entrega</span>
        </span>
      );
    }
    if (leitura === "falhou") return <span className="text-slate-600">não carregou</span>;
    return (
      <span className="text-slate-600">
        <span aria-hidden="true">—</span>
        <span className="sr-only">este grupo não recebeu este post</span>
      </span>
    );
  }
  const { texto, classe } = ESTADO[entrega.estado];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", classe)}>
      <IconeDoEstado estado={entrega.estado} />
      {texto}
      {entrega.estado === "entregue" && entrega.quando && <span className="tabular-nums text-slate-600">{horaBR(entrega.quando)}</span>}
    </span>
  );
}

/**
 * "Post das 14:08: 27 entregues · 1 postando · 12 na fila": o que falta aparece;
 * zero não. Sem conseguir reler, diz que o número é o da última leitura.
 */
export function LegendaDaEntrega({ hora, resumo, desatualizada = false }: { hora: string; resumo: ResumoDaEntrega; desatualizada?: boolean }) {
  const partes: [EstadoDaEntrega, number, string][] = [
    ["entregue", resumo.entregues, resumo.entregues === 1 ? "entregue" : "entregues"],
    ["postando", resumo.postando, "postando"],
    ["na_fila", resumo.naFila, "na fila"],
    ["falhou", resumo.falharam, resumo.falharam === 1 ? "falhou" : "falharam"],
    ["cancelado", resumo.cancelados, resumo.cancelados === 1 ? "cancelado" : "cancelados"],
  ];
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-13 text-slate-600">
      <span className="font-medium text-volt-950">Post das {hora}:</span>
      {partes
        .filter(([estado, n]) => n > 0 || estado === "entregue")
        .map(([estado, n, texto]) => (
          <span key={estado} className={cn("inline-flex items-center gap-1", ESTADO[estado].classe)}>
            <IconeDoEstado estado={estado} />
            <span>
              <span className="font-semibold tabular-nums">{numero(n)}</span> {texto}
            </span>
          </span>
        ))}
      {desatualizada && <span>· não deu para atualizar agora; tentando de novo</span>}
    </p>
  );
}
