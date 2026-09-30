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
 * A entrega do post grupo a grupo, de `GET /api/disparos/[id]/grupos`. Lê de
 * novo quando a página atualiza (`versao`) e, sozinha, enquanto houver grupo
 * postando ou na fila.
 */
export function useEntrega(postId: string | null, versao: number) {
  const [entrega, setEntrega] = useState<EntregaDoPost | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    if (!postId) return;
    let vivo = true;
    let proxima: ReturnType<typeof setTimeout> | undefined;

    async function ler() {
      try {
        const r = await fetch(`/api/disparos/${encodeURIComponent(postId ?? "")}/grupos`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const lida = (await r.json()) as EntregaDoPost;
        if (!vivo) return;
        setEntrega(lida);
        setErro(false);
        if (aindaSaindo(resumoDaEntrega(lida.grupos))) proxima = setTimeout(ler, RELER_A_CADA_MS);
      } catch {
        if (vivo) setErro(true);
      }
    }

    void ler();
    return () => {
      vivo = false;
      if (proxima) clearTimeout(proxima);
    };
  }, [postId, versao]);

  // A entrega de outro post (a página trocou de post e a leitura nova não voltou) não vale.
  return { entrega: entrega && entrega.postId === postId ? entrega : null, erro: postId ? erro : false };
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
export function CelulaDaEntrega({ entrega, lendo }: { entrega: EntregaNoGrupo | undefined; lendo: boolean }) {
  if (!entrega) {
    return <span className="text-slate-600">{lendo ? "…" : <span title="Este grupo não recebeu este post">—</span>}</span>;
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

/** "Post das 14:08: 27 entregues · 1 postando · 12 na fila": o que falta aparece; zero não. */
export function LegendaDaEntrega({ hora, resumo }: { hora: string; resumo: ResumoDaEntrega }) {
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
    </p>
  );
}
