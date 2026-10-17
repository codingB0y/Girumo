"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { avisoDaCampanha, type ConflitoDeGrupo } from "@/lib/campaigns/conflito-grupo";
import { buscar } from "@/lib/painel/carregar";

type RespostaDeConflitos = { conflitos: ConflitoDeGrupo[] };

function ehRespostaDeConflitos(corpo: unknown): corpo is RespostaDeConflitos {
  return Array.isArray((corpo as { conflitos?: unknown } | null)?.conflitos);
}

/**
 * Faixa amarela da aba Grupos (mockup "Main", spec §6.6): grupos DESTA campanha que também estão
 * em outra. Some sem conflito — e também quando a leitura falha: é aviso, não pode derrubar a aba
 * nem mostrar erro no lugar de uma lista que o lojista nem pediu.
 */
export function AvisoConflitos({ campanhaId, slug }: { campanhaId: string; slug: string }) {
  const [conflitos, setConflitos] = useState<ConflitoDeGrupo[]>([]);

  useEffect(() => {
    let vivo = true;
    void buscar(
      "/api/campanhas/conflitos",
      ehRespostaDeConflitos,
      (resposta) => {
        if (vivo) setConflitos(resposta.conflitos);
      },
      () => undefined,
    );
    return () => {
      vivo = false;
    };
  }, []);

  const aviso = avisoDaCampanha(conflitos, campanhaId);
  if (!aviso) return null;
  return (
    <div
      role="note"
      className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-atencao/30 bg-atencao/10 px-4 py-3.5 text-sm text-atencao"
    >
      <AlertTriangle className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-[1_1_400px]">
        {aviso.inicio} <strong>{aviso.nomes}</strong>. Agora cada grupo pertence a uma campanha só.
      </span>
      <Link
        href={`/painel/campanhas/conflitos?de=${encodeURIComponent(slug)}`}
        className="font-semibold underline underline-offset-2"
      >
        Escolher onde ficam
      </Link>
    </div>
  );
}
