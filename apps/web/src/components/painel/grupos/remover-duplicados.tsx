"use client";

import { useState } from "react";
import { Loader2, UserMinus, UserX } from "lucide-react";
import { useConfirmacao } from "@/components/painel/confirmacao";

/**
 * "Duplicados" — a seção Manutenção do bloco de configurações dos grupos que
 * mexe em QUEM está nos grupos, não no grupo em si.
 *
 * Duplicado é detectado por `participant_lid` (a chave real de
 * `group_participants` — produção é ~100% em `@lid`), lido do último sync,
 * nunca ao vivo: sem chamada nova à Evolution, e sem risco de travar o clique
 * esperando ela responder. Telefone é enriquecimento (~82% de cobertura);
 * quem não tem é mostrado mas fica de fora da remoção — nunca inventamos
 * número pra fechar a conta.
 *
 * As duas ações removem de verdade no WhatsApp — por isso passam pela mesma
 * confirmação (`useConfirmacao`) do resto da tela, nunca um clique direto.
 */

type Preview = {
  duplicates: Array<{ phone: string; groupCount: number }>;
  semTelefone: number;
  total: number;
};

type Resultado = {
  batchId: string;
  total: number;
  skipped: { semAdmin: number; semId: number };
};

export function RemoverDuplicados({
  slug,
  ocupado,
  onEnfileirado,
}: {
  slug: string;
  /** Outro lote em andamento: remover junto somaria cadência no mesmo número. */
  ocupado: boolean;
  onEnfileirado: () => void;
}) {
  const { pedirConfirmacao, folhaDeConfirmacao } = useConfirmacao();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const [telefone, setTelefone] = useState("");
  const [removendoTelefone, setRemovendoTelefone] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  function relatar(resultado: Resultado) {
    const partes = [`Enfileirado em ${resultado.total} grupo(s).`];
    if (resultado.skipped.semAdmin > 0) {
      partes.push(`${resultado.skipped.semAdmin} grupo(s) ficaram de fora: não somos admin neles.`);
    }
    setAviso(partes.join(" "));
  }

  async function buscarDuplicados() {
    setBuscando(true);
    setErro(null);
    setAviso(null);
    try {
      const res = await fetch(`/api/campanhas/${slug}/grupos/duplicados`);
      const dado = await res.json();
      if (!res.ok) throw new Error(dado?.error ?? "Não foi possível buscar duplicados.");
      setPreview(dado as Preview);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível buscar duplicados.");
    } finally {
      setBuscando(false);
    }
  }

  async function removerDuplicados() {
    if (!preview || preview.duplicates.length === 0) return;
    const ok = await pedirConfirmacao({
      titulo: "Remover duplicados",
      texto: `Isso vai remover ${preview.duplicates.length} pessoa(s) dos grupos extras onde elas já estão — cada uma fica só no primeiro grupo. Ação real no WhatsApp, sem desfazer.`,
      rotulo: "Remover duplicados",
      destrutivo: true,
    });
    if (!ok) return;

    setRemovendo(true);
    setErro(null);
    setAviso(null);
    try {
      const res = await fetch(`/api/campanhas/${slug}/grupos/duplicados`, { method: "POST" });
      const dado = await res.json();
      if (!res.ok) throw new Error(dado?.error ?? "Não foi possível remover.");
      relatar(dado as Resultado);
      setPreview(null);
      onEnfileirado();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível remover.");
    } finally {
      setRemovendo(false);
    }
  }

  async function removerTelefone() {
    const alvo = telefone.trim();
    if (!alvo) return;
    const ok = await pedirConfirmacao({
      titulo: "Remover de todos os grupos",
      texto: `Isso vai remover ${alvo} de todos os grupos desta campanha onde a Evolution o encontrar. Ação real no WhatsApp, sem desfazer.`,
      rotulo: "Remover",
      destrutivo: true,
    });
    if (!ok) return;

    setRemovendoTelefone(true);
    setErro(null);
    setAviso(null);
    try {
      const res = await fetch(`/api/campanhas/${slug}/grupos/remover-numero`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: alvo }),
      });
      const dado = await res.json();
      if (!res.ok) throw new Error(dado?.error ?? "Não foi possível remover.");
      relatar(dado as Resultado);
      setTelefone("");
      onEnfileirado();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível remover.");
    } finally {
      setRemovendoTelefone(false);
    }
  }

  const trava = ocupado || buscando || removendo || removendoTelefone;

  return (
    <div className="mt-5 border-t border-aco/10 pt-4" data-testid="grupos-remover-duplicados">
      <span className="font-data text-[10px] uppercase tracking-wider text-aco/50">Duplicados</span>
      <p className="mt-1.5 text-sm text-aco/70">
        Mesmo número em mais de um grupo desta campanha, ou uma pessoa específica que precisa sair
        de todos.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={buscarDuplicados}
          disabled={trava}
          className="inline-flex items-center gap-2 rounded-xl bg-poco px-3 py-2 text-sm text-volt-950 transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
          Buscar duplicados
        </button>

        {preview && preview.duplicates.length > 0 && (
          <button
            type="button"
            onClick={removerDuplicados}
            disabled={trava}
            className="inline-flex items-center gap-2 rounded-xl bg-danger-700 px-3 py-2 text-sm font-medium text-white transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {removendo && <Loader2 className="h-4 w-4 animate-spin" />}
            Remover {preview.duplicates.length} duplicado(s)
          </button>
        )}
      </div>

      {preview && (
        <p className="font-data mt-2 text-[11px] tabular-nums text-aco/60" data-testid="duplicados-resumo">
          {preview.total === 0
            ? "Nenhum duplicado encontrado."
            : `${preview.duplicates.length} com telefone conhecido, prontos pra remover`}
          {preview.semTelefone > 0 &&
            ` · ${preview.semTelefone} sem telefone conhecido — não dá pra remover automaticamente`}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          type="text"
          inputMode="tel"
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          placeholder="Telefone com DDI"
          aria-label="Telefone a remover de todos os grupos"
          className="w-48 rounded-xl bg-poco px-3 py-2 text-sm text-volt-950 outline-none placeholder:text-aco/40"
        />
        <button
          type="button"
          onClick={removerTelefone}
          disabled={trava || telefone.trim() === ""}
          className="inline-flex items-center gap-2 rounded-xl bg-poco px-3 py-2 text-sm text-volt-950 transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {removendoTelefone ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UserX className="h-4 w-4" />
          )}
          Remover de todos os grupos
        </button>
      </div>

      {erro && <p className="mt-2 text-sm text-alerta">{erro}</p>}
      {aviso && !erro && <p className="mt-2 text-sm text-aco/70">{aviso}</p>}
      {folhaDeConfirmacao}
    </div>
  );
}
