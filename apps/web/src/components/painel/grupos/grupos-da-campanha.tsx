"use client";

import { useCallback, useState } from "react";
import { Link2 } from "lucide-react";
import { GroupSettings } from "@/components/painel/grupos/group-settings";
import { Celula } from "@/components/painel/numeros";
import type { EntradaSettings } from "@/lib/campaigns/settings";
import type { AcaoLotado } from "@/lib/groups/acao-lotado";
import type { EstadoDoGrupo, EstadoGrupo } from "@/lib/groups/estado";
import { avisoEstruturaDeComunidade, avisoForaDaLista, detalheDoGrupo, fraseDoLink } from "@/lib/groups/resumo-estados";
import { destinoDoLink } from "@/lib/painel/destino-do-link";
import { numero } from "@/lib/painel/grupos";
import { useEstadosDaCampanha } from "@/lib/painel/use-estados-da-campanha";
import { cn } from "@/lib/utils";
import { ChipDeEstado, MenuDoGrupo, SeloEnvio } from "./estado-do-grupo";

/**
 * Aba Grupos da campanha (spec postar por grupo §6.4): faixa de estados, para onde o link
 * está mandando gente e a lista na ordem do pool, com chip, detalhe, selo de envio e o menu ⋯.
 *
 * O estado vem de `GET /api/campanhas/[slug]/grupos/estados` (`useEstadosDaCampanha`); nada aqui
 * decide estado. O selo de envio vem de `/api/groups` pela página (`envio`), como vinha no cartão
 * antigo. Relê depois de cada ação e quando a página atualiza (`atualizadoEm`).
 */

/** Ordem · Grupo · Membros · Estado · Detalhe · ⋯ (mockup). No celular a linha quebra. */
const COLUNAS = "md:grid md:grid-cols-[56px_minmax(0,1.6fr)_200px_150px_minmax(0,2fr)_48px] md:items-center md:gap-x-3";

const BARRA: Record<EstadoDoGrupo, string> = {
  lotado: "bg-volt-950",
  enchendo: "bg-cobalt-500",
  fila: "bg-slate-600/50",
  vazio: "bg-slate-600/50",
};

const FALHA_NA_ACAO = "Não deu para mudar o grupo. Tente de novo.";
const FALHA_AO_ATUALIZAR = "Não deu para atualizar o estado dos grupos.";

type Props = {
  slug: string;
  /** `useLinkOrigin()` da página, para o Copiar convite do ⋯. */
  origin: string;
  /** `sendState` por `whatsappGroupId` (de `/api/groups`). Ausente = "Envio: sem informação". */
  envio: Record<string, "open" | "closed" | null>;
  /** Muda quando a página recarrega os dados: a lista relê junto. */
  atualizadoEm: Date;
  /**
   * O mesmo que a aba Link e cliques recebe (`campanha.groupIds`, quantos grupos `/api/groups`
   * leu e a entrada da campanha): parado × mandando gente sai do mesmo `destinoDoLink`.
   */
  groupIds: string[];
  gruposNaTela: number;
  entrada: EntradaSettings;
  /** Capacidade mexe na faixa da Visão geral também: a página inteira relê. */
  aoMudarCapacidade: () => void | Promise<void>;
};

export function GruposDaCampanha({
  slug,
  origin,
  envio,
  atualizadoEm,
  groupIds,
  gruposNaTela,
  entrada,
  aoMudarCapacidade,
}: Props) {
  const { carga, recarregar, tentarDeNovo } = useEstadosDaCampanha(slug, atualizadoEm);
  const [menu, setMenu] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [avisoDaAcao, setAvisoDaAcao] = useState<string | null>(null);

  const fecharMenu = useCallback(() => setMenu(null), []);

  async function agir(grupo: EstadoGrupo, acao: AcaoLotado) {
    setOcupado(grupo.groupId);
    setAvisoDaAcao(null);
    try {
      const res = await fetch(`/api/campanhas/${encodeURIComponent(slug)}/grupos/lotado`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groupId: grupo.groupId, acao }),
      });
      if (!res.ok) {
        const corpo = (await res.json().catch(() => ({}))) as { error?: string };
        setAvisoDaAcao(corpo.error ?? FALHA_NA_ACAO);
      }
    } catch {
      setAvisoDaAcao(FALHA_NA_ACAO);
    }
    // 409 também relê: outro clique, ou o webhook, pode ter mudado o grupo. O botão só solta
    // com a linha nova na tela: solto antes, um segundo clique na linha velha voltava 409 depois
    // de um sucesso. `recarregar` não lança (falha vira lista velha com aviso).
    await recarregar();
    setOcupado(null);
  }

  if (carga.fase === "carregando") {
    return (
      <div role="status" aria-label="Carregando o estado dos grupos" className="space-y-4">
        <div className="pn-skeleton h-28 rounded-xl" aria-hidden="true" />
        <div className="pn-skeleton h-64 rounded-xl" aria-hidden="true" />
      </div>
    );
  }

  if (carga.fase === "erro") {
    return (
      <div role="alert" className="pn-card rounded-xl px-5 py-8 text-center">
        <p className="text-sm text-volt-950">Não deu para ler o estado dos grupos.</p>
        <button
          type="button"
          onClick={tentarDeNovo}
          className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-line-200 bg-paper-0 px-4 text-sm font-medium text-volt-950 transition-colors hover:border-slate-600"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  const { grupos, contagem, estruturaDeComunidade } = carga.dados;
  // O aviso de uma ação (409, falha) vence o de "lista velha"; a lista velha fica na tela.
  const aviso = avisoDaAcao ?? (carga.desatualizada ? FALHA_AO_ATUALIZAR : null);
  const agora = new Date();
  const enchendo = grupos.find((g) => g.estado === "enchendo") ?? null;
  // Mesmas entradas da aba Link e cliques, `agora` incluído: as duas abas nunca discordam.
  const destino = destinoDoLink({ estados: grupos, groupIds, gruposNaTela, entrada, agora: atualizadoEm });
  const frase = fraseDoLink(destino, grupos, agora);
  // Pai e Avisos de comunidade faltam de propósito: não são "grupo que saiu da conta".
  const foraDaLista = avisoForaDaLista(new Set(groupIds).size - estruturaDeComunidade, grupos.length);
  const estrutura = avisoEstruturaDeComunidade(estruturaDeComunidade);

  if (grupos.length === 0 && (foraDaLista || estrutura)) {
    return (
      <div className="pn-card space-y-2 rounded-xl px-5 py-8 text-center text-sm text-volt-950">
        {foraDaLista && <p data-testid="fora-da-lista">{foraDaLista}</p>}
        {estrutura && <p data-testid="estrutura-de-comunidade">{estrutura}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Faixa: um painel só, fio entre as células (gap-px sobre o fundo do fio), como a Visão geral. */}
      <section
        aria-label="Resumo dos grupos"
        className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line-200 bg-line-200 sm:grid-cols-3 lg:grid-cols-5"
      >
        <Celula rotulo="Lotados" valor={numero(contagem.lotado)} valorTestId="resumo-lotados">
          recebem postagem
        </Celula>
        <Celula rotulo="Enchendo agora" valor={numero(contagem.enchendo)} valorTestId="resumo-enchendo">
          {enchendo?.nome ?? "nenhum agora"}
        </Celula>
        <Celula rotulo="Na fila" valor={numero(contagem.fila)} valorTestId="resumo-fila">
          recebem postagem
        </Celula>
        <Celula rotulo="Vazios" valor={numero(contagem.vazio)} valorTestId="resumo-vazios">
          só o nosso número
        </Celula>
        <Celula
          rotulo="Membros"
          valor={numero(contagem.membros)}
          valorTestId="resumo-membros"
          className="col-span-2 lg:col-span-1"
        >
          em {numero(grupos.length)} {grupos.length === 1 ? "grupo" : "grupos"}
        </Celula>
      </section>

      <p
        data-testid="frase-do-link"
        className="flex items-start gap-3 rounded-xl border border-line-200 bg-paper-0 px-4 py-3.5 text-sm text-volt-950"
      >
        <Link2 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-cobalt-500" aria-hidden="true" />
        {frase.tipo === "parado" ? (
          <span>{frase.texto}</span>
        ) : (
          <span>
            O link está mandando gente para <strong className="font-semibold">{frase.nome}</strong>
            {frase.reaberto ? ` — reaberto ${frase.reaberto}, tem prioridade.` : "."}
            {frase.voltaPara !== null && (
              <>
                {" Quando ele lotar, volta para o "}
                <strong className="font-semibold">{frase.voltaPara}</strong>.
              </>
            )}
          </span>
        )}
      </p>

      {foraDaLista && (
        <p
          data-testid="fora-da-lista"
          className="rounded-xl border border-line-200 bg-aviso-fundo px-4 py-3 text-sm text-volt-950"
        >
          {foraDaLista}
        </p>
      )}

      {estrutura && (
        <p data-testid="estrutura-de-comunidade" className="rounded-xl border border-line-200 px-4 py-3 text-sm text-volt-950">
          {estrutura}
        </p>
      )}

      {aviso && (
        <p role="alert" className="rounded-xl border border-line-200 bg-aviso-fundo px-4 py-3 text-sm text-volt-950">
          {aviso}
        </p>
      )}

      {/* Sem overflow-hidden: o painel do ⋯ abre por cima da borda da lista. */}
      <section aria-label="Grupos da campanha" className="rounded-xl border border-line-200 bg-paper-0">
        <div
          aria-hidden="true"
          className={cn("hidden border-b border-line-200 px-4 py-2.5 text-13 font-medium text-slate-600", COLUNAS)}
        >
          <span>Ordem</span>
          <span>Grupo</span>
          <span>Membros</span>
          <span>Estado</span>
          <span>Detalhe</span>
          <span />
        </div>
        <ul>
          {grupos.map((g) => (
            <LinhaDoGrupo
              key={g.groupId}
              grupo={g}
              origin={origin}
              envio={envio[g.whatsappGroupId] ?? null}
              detalhe={detalheDoGrupo(g, grupos, agora)}
              menuAberto={menu === g.groupId}
              ocupado={ocupado === g.groupId}
              editando={editando === g.groupId}
              aoAlternarMenu={() => setMenu((atual) => (atual === g.groupId ? null : g.groupId))}
              aoFecharMenu={fecharMenu}
              aoAgir={(acao) => void agir(g, acao)}
              aoEditar={() => setEditando(g.groupId)}
              aoFecharEdicao={() => setEditando(null)}
              aoSalvarCapacidade={aoMudarCapacidade}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

type LinhaProps = {
  grupo: EstadoGrupo;
  origin: string;
  envio: "open" | "closed" | null;
  detalhe: string;
  menuAberto: boolean;
  ocupado: boolean;
  editando: boolean;
  aoAlternarMenu: () => void;
  aoFecharMenu: () => void;
  aoAgir: (acao: AcaoLotado) => void;
  aoEditar: () => void;
  aoFecharEdicao: () => void;
  aoSalvarCapacidade: () => void | Promise<void>;
};

function LinhaDoGrupo({
  grupo: g,
  origin,
  envio,
  detalhe,
  menuAberto,
  ocupado,
  editando,
  aoAlternarMenu,
  aoFecharMenu,
  aoAgir,
  aoEditar,
  aoFecharEdicao,
  aoSalvarCapacidade,
}: LinhaProps) {
  const capacidade = g.capacidade > 0 ? g.capacidade : 1024;
  const pct = Math.min(100, Math.round((g.membros / capacidade) * 100));

  return (
    <li
      data-group-id={g.groupId}
      className={cn("border-b border-line-200 px-4 py-2 last:border-b-0", g.estado === "enchendo" && "bg-cobalt-500/5")}
    >
      <div className={cn("flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-2", COLUNAS)}>
        <span className="font-data text-13 tabular-nums text-slate-600">{g.posicao}</span>
        <span className="min-w-0 flex-1 truncate font-medium text-volt-950">{g.nome}</span>
        <span className="flex items-center gap-2.5">
          <span className="font-data min-w-[92px] text-13 tabular-nums text-volt-950">
            {numero(g.membros)}
            <span className="text-slate-600">/{numero(capacidade)}</span>
          </span>
          <span className="block h-1.5 w-[90px] overflow-hidden rounded-sm bg-line-200" aria-hidden="true">
            <span className={cn("block h-full", BARRA[g.estado])} style={{ width: `${pct}%` }} />
          </span>
        </span>
        <span>
          <ChipDeEstado estado={g.estado} />
        </span>
        <span className="flex flex-wrap items-center gap-2.5 text-13 text-slate-600">
          <span>{detalhe}</span>
          {/* O selo do cartão antigo, igual: nulo continua dito "sem informação", nunca "aberto". */}
          <span data-testid="selo-envio">
            <SeloEnvio estado={envio} />
          </span>
          {g.estado === "enchendo" && (
            <button
              type="button"
              disabled={ocupado}
              onClick={() => aoAgir("marcar")}
              className="inline-flex min-h-11 items-center rounded-lg border border-line-200 bg-paper-0 px-2.5 text-13 font-medium text-volt-950 transition-colors hover:border-slate-600 disabled:cursor-not-allowed disabled:opacity-60 md:min-h-9"
            >
              Marcar como lotado
            </button>
          )}
        </span>
        <div className="ml-auto md:ml-0 md:justify-self-end">
          <MenuDoGrupo
            grupo={g}
            origin={origin}
            aberto={menuAberto}
            ocupado={ocupado}
            aoAlternar={aoAlternarMenu}
            aoFechar={aoFecharMenu}
            aoMarcar={() => aoAgir("marcar")}
            aoReabrir={() => aoAgir("reabrir")}
            aoEditarCapacidade={aoEditar}
          />
        </div>
      </div>
      {editando && (
        <div className="pb-2 pt-1">
          {/* O PATCH quer o JID em `id` e o convite atual: convite vazio é "remover convite". */}
          <GroupSettings
            groupId={g.whatsappGroupId}
            inviteUrl={g.inviteUrl ?? undefined}
            capacity={g.capacidade}
            onSaved={aoSalvarCapacidade}
            onClose={aoFecharEdicao}
          />
        </div>
      )}
    </li>
  );
}
