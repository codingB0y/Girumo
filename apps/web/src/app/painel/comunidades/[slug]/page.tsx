"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Sprout } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabase/client";
import { useConfirmacao } from "@/components/painel/confirmacao";
import { numero } from "@/lib/painel/grupos";
import type { Group } from "@/lib/mock-data";
import { MessagesTab } from "@/components/painel/messages";

type Comunidade = {
  id: string;
  nome: string;
  slug: string;
  groupIds: string[];
  autoGrow: boolean;
  whatsappCommunityJid: string | null;
  avisoGroupId: string | null;
  alcanceAvisos: number | null;
  avisoIsAdmin: boolean;
};

type Sugestao = {
  grupos: Array<{ whatsappGroupId: string; name: string; pessoasNovas: number }>;
  pessoasCobertas: number;
  pessoasTotais: number;
  cobertura: number;
};

export default function ComunidadeDetalhe() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const { pedirConfirmacao, folhaDeConfirmacao } = useConfirmacao();

  const [comunidade, setComunidade] = useState<Comunidade | null | undefined>(undefined);
  const [grupos, setGrupos] = useState<Group[]>([]);
  const [cobertura, setCobertura] = useState<Sugestao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [desvinculando, setDesvinculando] = useState<string | null>(null);
  /** Erro da última tentativa de desvincular, preso ao grupo que falhou — não
   * um banner solto, senão some de vista se a lista rolar. */
  const [erroDesvincular, setErroDesvincular] = useState<{ id: string; mensagem: string } | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const [resComunidades, resGrupos, resCobertura] = await Promise.all([
        authenticatedFetch("/api/comunidades", { cache: "no-store" }),
        authenticatedFetch("/api/groups", { cache: "no-store" }),
        authenticatedFetch(`/api/comunidades/${slug}/cobertura`, { cache: "no-store" }),
      ]);
      if (!resComunidades.ok) throw new Error("Não deu pra carregar a comunidade.");
      const data: { comunidades: Comunidade[] } = await resComunidades.json();
      const encontrada = data.comunidades.find((c) => c.slug === slug) ?? null;
      const listaGrupos: Group[] = resGrupos.ok ? await resGrupos.json() : [];

      setComunidade(encontrada);
      setGrupos(Array.isArray(listaGrupos) ? listaGrupos : []);
      if (resCobertura.ok) {
        const dataCobertura: { sugestao: Sugestao } = await resCobertura.json();
        setCobertura(dataCobertura.sugestao);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu pra carregar a comunidade.");
    }
  }, [slug]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function desvincular(whatsappGroupId: string, nomeDoGrupo: string) {
    const ok = await pedirConfirmacao({
      titulo: "Desvincular grupo",
      texto: `Tirar "${nomeDoGrupo}" desta comunidade? O grupo continua existindo, mas sai do link e dos disparos desta campanha.`,
      rotulo: "Desvincular",
      destrutivo: true,
    });
    if (!ok) return;

    setDesvinculando(whatsappGroupId);
    setErroDesvincular(null);
    try {
      const res = await authenticatedFetch(`/api/comunidades/${slug}/grupos`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsappGroupId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Não deu pra desvincular o grupo.");
      await carregar();
    } catch (e) {
      // Cobre a resposta de erro da API (404 de comunidade/grupo, 500) e falha
      // de rede (fetch rejeitando antes de qualquer resposta) no mesmo lugar.
      setErroDesvincular({
        id: whatsappGroupId,
        mensagem: e instanceof Error ? e.message : "Não deu pra desvincular o grupo.",
      });
    } finally {
      setDesvinculando(null);
    }
  }

  if (erro) {
    return (
      <div className="mx-auto max-w-[900px] space-y-4 px-4 py-8 sm:px-8">
        <VoltarLink />
        <div className="flex items-center justify-between gap-3 rounded-xl border border-alerta/20 bg-alerta/[0.06] px-4 py-3 text-sm text-alerta">
          <span>{erro}</span>
          <button type="button" onClick={carregar} className="font-medium underline underline-offset-2">
            Tentar de novo
          </button>
        </div>
      </div>
    );
  }

  if (comunidade === undefined) {
    return (
      <div className="mx-auto max-w-[900px] space-y-4 px-4 py-8 sm:px-8" role="status" aria-label="Carregando a comunidade">
        <VoltarLink />
        <div className="pn-skeleton h-24 rounded-xl" />
        <div className="pn-skeleton h-48 rounded-xl" />
      </div>
    );
  }

  if (comunidade === null) {
    return (
      <div className="mx-auto max-w-[900px] space-y-4 px-4 py-8 sm:px-8">
        <VoltarLink />
        <p className="text-[17px] text-volt-950">Essa comunidade não existe (ou você não tem acesso a ela).</p>
      </div>
    );
  }

  const membrosPorGrupo = new Map(grupos.map((g) => [g.whatsappGroupId, g] as const));
  const gruposDaComunidade = comunidade.groupIds.map((id) => ({ id, grupo: membrosPorGrupo.get(id) ?? null }));
  const totalMembrosSoma = gruposDaComunidade.reduce((total, g) => total + (g.grupo?.members ?? 0), 0);
  // `??` só cai no fallback em null/undefined, não em 0 — e `pessoasTotais: 0`
  // é exatamente o que a rota /cobertura devolve antes do primeiro sync.
  const temAlcanceReal = cobertura !== null && cobertura.pessoasTotais > 0;
  const totalMembros = temAlcanceReal ? cobertura.pessoasTotais : totalMembrosSoma;

  return (
    <div className="mx-auto max-w-[900px] space-y-6 px-4 py-8 sm:px-8">
      <VoltarLink />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-extrabold tracking-[-0.02em] text-volt-950">
            {comunidade.nome}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {comunidade.whatsappCommunityJid !== null && (
              <span className="font-data inline-flex h-6 items-center rounded-[var(--radius-chip)] bg-sucesso/10 px-2 text-12 text-sucesso">
                nativa do WhatsApp
              </span>
            )}
            {comunidade.autoGrow && (
              <span className="inline-flex items-center gap-1.5 text-12 text-aco">
                <Sprout className="h-3.5 w-3.5" aria-hidden="true" /> Auto-grow ligado
              </span>
            )}
          </div>
        </div>
      </header>

      {/*
       * Sem botão "Criar no WhatsApp": a Fase 0 terminou em 403 na Evolution
       * (ver docs/superpowers/specs/2026-09-04-gestao-de-comunidade-design.md
       * §6) — o recurso é read-only contra o WhatsApp até essa porta abrir de
       * outro jeito.
       */}
      <div className="pn-card rounded-[var(--radius-control)] p-5">
        {comunidade.whatsappCommunityJid !== null ? (
          <>
            <p className="font-data text-20 tabular-nums text-volt-950">
              {comunidade.alcanceAvisos !== null ? `${numero(comunidade.alcanceAvisos)} membros` : "Alcance não medido"}
            </p>
            <p className="mt-1 text-13 text-slate-600">
              {comunidade.alcanceAvisos !== null
                ? "Alcance desta comunidade no WhatsApp, contado pelo grupo de Avisos — pessoas únicas, já deduplicadas pelo próprio WhatsApp."
                : "A comunidade ainda não tem um grupo de Avisos sincronizado pra medir o alcance."}
            </p>
          </>
        ) : (
          <>
            <p className="font-data text-20 tabular-nums text-volt-950">{numero(totalMembros)} membros</p>
            <p className="mt-1 text-13 text-slate-600">
              {temAlcanceReal ? (
                "Alcance real desta comunidade — pessoas únicas, sem contar quem está em mais de um grupo duas vezes."
              ) : (
                <>
                  Soma de quem está nos {comunidade.groupIds.length}{" "}
                  {comunidade.groupIds.length === 1 ? "grupo" : "grupos"} desta comunidade.
                </>
              )}{" "}
              As comunidades nativas do WhatsApp têm um teto de tamanho que a Girumo ainda não mediu — não dá pra
              garantir que este total cabe numa comunidade só antes de tentar criar uma de verdade.
            </p>
          </>
        )}
      </div>

      <section>
        <h2 className="text-[15px] font-semibold text-volt-950">Grupos</h2>
        {gruposDaComunidade.length === 0 ? (
          <p className="mt-2 text-14 text-slate-600">Esta comunidade ainda não tem grupo nenhum.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line-200">
            {gruposDaComunidade.map(({ id, grupo }) => (
              <li key={id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-15 text-volt-950">{grupo?.name ?? "Grupo não encontrado"}</p>
                  {grupo && (
                    <p className="font-data text-12 tabular-nums text-slate-600">{numero(grupo.members)} membros</p>
                  )}
                  {erroDesvincular?.id === id && (
                    <p role="alert" className="mt-1 text-12 text-alerta">
                      {erroDesvincular.mensagem}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => desvincular(id, grupo?.name ?? id)}
                  disabled={desvinculando === id || comunidade.whatsappCommunityJid !== null}
                  title={
                    comunidade.whatsappCommunityJid !== null
                      ? "Gerencie os grupos desta comunidade pelo WhatsApp"
                      : undefined
                  }
                  className="h-9 rounded-[var(--radius-control)] px-3 text-13 font-semibold text-danger-700 disabled:opacity-50"
                >
                  {desvinculando === id ? "Desvinculando…" : "Desvincular"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {cobertura && cobertura.pessoasTotais > 0 && (
        <section>
          <h2 className="text-[15px] font-semibold text-volt-950">Cobertura</h2>
          <p className="mt-1 text-13 text-slate-600">
            Estes {cobertura.grupos.length} grupo{cobertura.grupos.length === 1 ? "" : "s"} cobrem{" "}
            {Math.round(cobertura.cobertura * 100)}% das {numero(cobertura.pessoasTotais)} pessoas desta
            comunidade. É sugestão de leitura — a Girumo nunca corta grupo sozinha.
          </p>
          <ul className="mt-2 divide-y divide-line-200">
            {cobertura.grupos.map((g) => (
              <li key={g.whatsappGroupId} className="flex items-center justify-between gap-3 py-2">
                <span className="truncate text-14 text-volt-950">{g.name}</span>
                <span className="font-data text-12 tabular-nums text-slate-600">+{numero(g.pessoasNovas)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-[15px] font-semibold text-volt-950">Mensagens</h2>
        <div className="mt-2">
          <MessagesTab
            campaignSlug={comunidade.slug}
            groupIds={comunidade.groupIds}
            avisoGroupId={comunidade.avisoGroupId}
            alcanceAvisos={comunidade.alcanceAvisos}
            alcanceGrupoAGrupo={totalMembrosSoma}
            avisoIsAdmin={comunidade.avisoIsAdmin}
          />
        </div>
      </section>

      {folhaDeConfirmacao}
    </div>
  );
}

function VoltarLink() {
  return (
    <Link href="/painel/comunidades" className="inline-flex items-center gap-1.5 text-14 text-slate-600 hover:text-volt-950">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Comunidades
    </Link>
  );
}
