"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabase/client";
import { Folha } from "@/components/painel/folha";
import { ComunidadeCard, type ComunidadeResumo } from "@/components/painel/comunidades/comunidade-card";
import { OrfaosFaixa, type GrupoOrfao } from "@/components/painel/comunidades/orfaos-faixa";
import type { Group } from "@/lib/mock-data";

type Comunidade = {
  id: string;
  nome: string;
  slug: string;
  groupIds: string[];
  autoGrow: boolean;
  whatsappCommunityJid: string | null;
};

type RespostaComunidades = { comunidades: Comunidade[]; orfaos: GrupoOrfao[] };

/** Soma de membros de uma comunidade a partir do mapa whatsappGroupId → membros. */
function somaMembros(groupIds: string[], membrosPorGrupo: Map<string, number>): number {
  return groupIds.reduce((total, id) => total + (membrosPorGrupo.get(id) ?? 0), 0);
}

export default function PainelComunidades() {
  const [comunidades, setComunidades] = useState<Comunidade[] | null>(null);
  const [orfaos, setOrfaos] = useState<GrupoOrfao[]>([]);
  const [membrosPorGrupo, setMembrosPorGrupo] = useState<Map<string, number>>(new Map());
  const [erro, setErro] = useState<string | null>(null);

  const [formAberto, setFormAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const [resComunidades, resGrupos] = await Promise.all([
        authenticatedFetch("/api/comunidades", { cache: "no-store" }),
        authenticatedFetch("/api/groups", { cache: "no-store" }),
      ]);
      if (!resComunidades.ok) throw new Error("Não deu pra carregar as comunidades.");
      const data: RespostaComunidades = await resComunidades.json();
      const grupos: Group[] = resGrupos.ok ? await resGrupos.json() : [];

      setComunidades(data.comunidades);
      setOrfaos(data.orfaos);
      setMembrosPorGrupo(new Map((Array.isArray(grupos) ? grupos : []).map((g) => [g.whatsappGroupId, g.members])));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu pra carregar as comunidades.");
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function vincular(whatsappGroupId: string, slug: string) {
    const res = await authenticatedFetch(`/api/comunidades/${slug}/grupos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ whatsappGroupId }),
    });
    if (res.ok) await carregar();
  }

  function abrirForm() {
    setNome("");
    setErroForm(null);
    setFormAberto(true);
  }

  async function criarComunidade() {
    const nomeAparado = nome.trim();
    if (!nomeAparado) {
      setErroForm("Dá um nome pra comunidade.");
      return;
    }
    setSalvando(true);
    setErroForm(null);
    try {
      const res = await authenticatedFetch("/api/comunidades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nomeAparado }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Não deu pra criar a comunidade.");
      setFormAberto(false);
      await carregar();
    } catch (e) {
      setErroForm((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  const resumos: ComunidadeResumo[] = (comunidades ?? []).map((c) => ({
    slug: c.slug,
    nome: c.nome,
    totalGrupos: c.groupIds.length,
    totalMembros: somaMembros(c.groupIds, membrosPorGrupo),
    autoGrow: c.autoGrow,
    whatsappCommunityJid: c.whatsappCommunityJid,
  }));

  return (
    <div className="mx-auto max-w-[1100px] space-y-8 px-4 py-8 sm:px-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-extrabold tracking-[-0.02em] text-volt-950">Comunidades</h1>
          <p className="mt-1 text-[15px] text-slate-600">
            Agrupe seus grupos de WhatsApp em coleções — hoje só uma gaveta na Girumo, sem depender do
            WhatsApp aceitar a comunidade nativa.
          </p>
        </div>
        <button
          type="button"
          onClick={abrirForm}
          className="font-data inline-flex h-11 items-center gap-1.5 rounded-[var(--radius-control)] bg-cobalt-500 px-4 text-13 font-semibold uppercase tracking-[0.04em] text-paper-0"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Nova comunidade
        </button>
      </header>

      {erro && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-alerta/20 bg-alerta/[0.06] px-4 py-3 text-sm text-alerta">
          <span>{erro}</span>
          <button type="button" onClick={carregar} className="font-medium underline underline-offset-2">
            Tentar de novo
          </button>
        </div>
      )}

      {comunidades === null && !erro ? (
        <div className="grid gap-4 sm:grid-cols-2" role="status" aria-label="Carregando as comunidades">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="pn-skeleton h-32 rounded-xl" />
          ))}
        </div>
      ) : (
        comunidades !== null && (
          <>
            {resumos.length === 0 ? (
              <div className="pn-card rounded-xl px-5 py-16 text-center">
                <p className="text-[20px] text-volt-950">Você ainda não tem nenhuma comunidade.</p>
                <p className="mt-2 text-14 text-slate-600">
                  Crie uma pra começar a organizar os grupos que hoje ficam soltos.
                </p>
                <button
                  type="button"
                  onClick={abrirForm}
                  className="font-data mt-4 inline-flex items-center gap-1.5 rounded-xl bg-cobalt-500 px-4 py-2.5 text-12 font-medium uppercase tracking-[0.08em] text-paper-0"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Nova comunidade
                </button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {resumos.map((c) => (
                  <ComunidadeCard key={c.slug} comunidade={c} />
                ))}
              </div>
            )}

            <OrfaosFaixa
              grupos={orfaos}
              comunidades={resumos.map((c) => ({ slug: c.slug, nome: c.nome }))}
              aoVincular={vincular}
            />
          </>
        )
      )}

      <Folha
        aberta={formAberto}
        aoFechar={() => setFormAberto(false)}
        titulo="Nova comunidade"
        testId="comunidades-nova-folha"
        emQualquerLargura
      >
        <label className="block text-sm font-medium text-volt-950">
          Nome da comunidade
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Clientes VIP"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && criarComunidade()}
            className="mt-1.5 w-full rounded-[10px] border border-volt-950/10 bg-poco px-3.5 py-2.5 text-sm text-volt-950 outline-none focus:border-cobalt-500/50"
          />
        </label>
        {erroForm && <p className="mt-2 text-sm text-alerta">{erroForm}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setFormAberto(false)}
            className="min-h-11 rounded-[var(--radius-control)] border border-line-200 px-4 text-[15px] font-semibold text-volt-950 hover:bg-canvas-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={criarComunidade}
            disabled={salvando}
            className="min-h-11 rounded-[var(--radius-control)] bg-cobalt-500 px-4 text-[15px] font-semibold text-paper-0 disabled:opacity-60"
          >
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </Folha>
    </div>
  );
}
