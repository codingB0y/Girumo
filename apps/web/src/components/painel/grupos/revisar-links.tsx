"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { formataEta } from "@/lib/groups/invite-review";

/**
 * "Revisar links" — a seção Manutenção do bloco de configurações dos grupos.
 *
 * Confere se o convite guardado de cada grupo ainda é o que o WhatsApp devolve.
 * É a única ação do lote que LÊ em vez de escrever, e corre num ritmo próprio
 * (uma leitura por minuto por tenant, travado na RPC de claim), porque um
 * convite trocado só aparece quando alguém pergunta — e perguntar 91 vezes
 * seguidas no mesmo número é exatamente o padrão que o anti-ban evita.
 *
 * O ETA é calculado com ESSE ritmo, não com o do lote de identidade: prometer
 * "6 minutos" para uma revisão que leva uma hora e meia é o tipo de número que
 * faz o lojista achar que travou e apertar de novo.
 */

type Resumo = {
  iguais: number;
  trocados: number;
  quebrados: number;
  naoRevisados: number;
  ultimaRevisao: string | null;
  revisaveis: number;
  etaMin: number;
};

function formataQuando(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function RevisarLinks({
  slug,
  ocupado,
  onEnfileirado,
}: {
  slug: string;
  /** Outro lote em andamento: revisar junto somaria cadência no mesmo número. */
  ocupado: boolean;
  onEnfileirado: () => void;
}) {
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(`/api/campanhas/${slug}/grupos/revisao`);
      if (!res.ok) return;
      setResumo((await res.json()) as Resumo);
    } catch {
      // Uma leitura perdida não é erro de tela — o bloco só não mostra números.
    }
  }, [slug]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function revisar() {
    setEnviando(true);
    setErro(null);
    setAviso(null);
    try {
      const res = await fetch(`/api/campanhas/${slug}/grupos/revisao`, { method: "POST" });
      const dado = await res.json();
      if (!res.ok) throw new Error(dado?.error ?? "Não foi possível revisar.");
      setAviso(
        `Revisão enfileirada em ${dado.total} grupo(s). ${formataEta(dado.etaMin)} — ` +
          "o ritmo é o que protege o número.",
      );
      onEnfileirado();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível revisar.");
    } finally {
      setEnviando(false);
    }
  }

  const jaRevisou = resumo !== null && resumo.ultimaRevisao !== null;

  return (
    <div className="mt-5 border-t border-aco/10 pt-4" data-testid="grupos-revisar-links">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-data text-[10px] uppercase tracking-wider text-aco/50">
          Manutenção
        </span>
        {resumo && (
          <span className="font-data text-[11px] text-aco/50" data-testid="revisao-quando">
            {jaRevisou
              ? `Última revisão: ${formataQuando(resumo.ultimaRevisao as string)}`
              : "Nunca revisado"}
          </span>
        )}
      </div>

      <p className="mt-1.5 text-sm text-aco/70">
        Confere se o link de convite de cada grupo ainda é o mesmo. Convite trocado no WhatsApp
        deixa o link da campanha apontando para lugar nenhum.
      </p>

      {resumo && jaRevisou && (
        <p className="font-data mt-2 text-[11px] tabular-nums text-aco/60" data-testid="revisao-contagens">
          <span className="text-volt-950">{resumo.iguais}</span> iguais ·{" "}
          <span className={resumo.trocados > 0 ? "text-atencao" : "text-volt-950"}>
            {resumo.trocados}
          </span>{" "}
          trocados ·{" "}
          <span className={resumo.quebrados > 0 ? "text-alerta" : "text-volt-950"}>
            {resumo.quebrados}
          </span>{" "}
          quebrados
          {resumo.naoRevisados > 0 && ` · ${resumo.naoRevisados} nunca revisados`}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={revisar}
          disabled={enviando || ocupado || resumo?.revisaveis === 0}
          className="inline-flex items-center gap-2 rounded-xl bg-poco px-3 py-2 text-sm text-volt-950 transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          Revisar agora
        </button>
        {resumo && resumo.revisaveis > 0 && (
          <span className="font-data text-[11px] text-aco/50">
            {resumo.revisaveis} grupo(s) · {formataEta(resumo.etaMin)}
          </span>
        )}
        {ocupado && (
          <span className="font-data text-[11px] text-aco/50">
            Aguarde o lote em andamento terminar.
          </span>
        )}
      </div>

      {erro && <p className="mt-2 text-sm text-alerta">{erro}</p>}
      {aviso && !erro && <p className="mt-2 text-sm text-aco/70">{aviso}</p>}
    </div>
  );
}
