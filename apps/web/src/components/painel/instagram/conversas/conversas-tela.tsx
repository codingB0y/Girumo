"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useCasca, useFoco, type StatusInstagram } from "@/components/painel/casca-context";
import { useRole } from "@/components/painel/role-provider";
import { conversaDoRealtime, linhaEhDaLoja, type LinhaDoRealtime } from "@/lib/ig/conversas/tela";
import type { ConversaDto } from "@/lib/ig/conversas/tipos";
import { AbasInstagram } from "../abas";
import { OfertaInstagram } from "../oferta";
import { ConversaAberta } from "./conversa-aberta";
import { ListaDeConversas } from "./lista-de-conversas";
import { useAoVivoConversas } from "./use-ao-vivo";
import { useCelular } from "./use-celular";
import { useConversas } from "./use-conversas";

/** Sem o Realtime, a lista confere o índice a cada 30 s (só com a aba visível). */
const CONSULTA_MS = 30_000;

const marcarComoLida = (id: string) => fetch(`/api/ig/conversations/${id}/read`, { method: "POST" }).then((r) => r.ok).catch(() => false);

/** O modo foco da casca (some a barra de cima) enquanto a conversa ocupa a tela do celular. */
function ModoFoco() {
  useFoco();
  return null;
}

function Caixa({ tenantId, conta }: { tenantId: string | null; conta: StatusInstagram["account"] }) {
  const lista = useConversas(tenantId);
  const celular = useCelular();
  const [aberta, setAberta] = useState<ConversaDto | null>(null);
  const [sinal, setSinal] = useState(0);
  const { itens, marcarLida, atualizarLinha, aplicarLinha, recarregar } = lista;
  const abertaId = useRef<string | null>(null);
  const voltarPara = useRef<string | null>(null);
  const velha = useRef(false);
  useEffect(() => {
    abertaId.current = aberta?.id ?? null;
  });

  // Nunca chama o "lida" com a aba escondida: ninguém está lendo.
  const lerAgora = useCallback(
    async (c: ConversaDto) => {
      if (c.naoLidas > 0 && document.visibilityState === "visible" && (await marcarComoLida(c.id))) marcarLida(c.id);
    },
    [marcarLida],
  );

  const abrir = (id: string) => {
    const c = itens.find((x) => x.id === id);
    if (!c) return;
    voltarPara.current = id;
    setAberta(c);
    setSinal(0);
    void lerAgora(c);
  };

  const voltar = () => setAberta(null);

  // Volta do fio no celular: o foco vai para a linha que estava aberta.
  useEffect(() => {
    if (aberta !== null || !voltarPara.current) return;
    const id = voltarPara.current;
    voltarPara.current = null;
    document.querySelector<HTMLElement>(`[data-conversa-id="${id}"]`)?.focus();
  }, [aberta]);

  const aoMudar = useCallback(
    (linha: LinhaDoRealtime | null) => {
      if (linha && !linhaEhDaLoja(linha, tenantId)) return;
      const c = conversaDoRealtime(linha, new Date());
      aplicarLinha(c);
      if (c && abertaId.current === c.id) {
        setAberta(c);
        // Aba escondida: não busca mensagens nem marca como lida; faz as duas coisas ao voltar.
        if (document.visibilityState === "hidden") velha.current = true;
        else {
          setSinal((s) => s + 1);
          void lerAgora(c);
        }
      }
    },
    [aplicarLinha, lerAgora, tenantId],
  );

  const atualAoVoltar = useRef<ConversaDto | null>(null);
  useEffect(() => {
    const aoMudarAba = () => {
      if (document.visibilityState !== "visible" || !velha.current) return;
      velha.current = false;
      setSinal((s) => s + 1);
      if (atualAoVoltar.current) void lerAgora(atualAoVoltar.current);
    };
    document.addEventListener("visibilitychange", aoMudarAba);
    return () => document.removeEventListener("visibilitychange", aoMudarAba);
  }, [lerAgora]);

  const aoConsultar = useCallback(() => {
    recarregar();
    setSinal((s) => s + 1);
  }, [recarregar]);

  const aoVivo = useAoVivoConversas({ tenantId, ativo: true, aoMudar, aoConsultar, consultaMs: CONSULTA_MS });

  const mudouPelaTela = useCallback(
    (c: ConversaDto) => {
      // A ação voltou depois de a pessoa trocar de conversa: não reabre a antiga.
      if (c.id !== abertaId.current) {
        atualizarLinha(c);
        return;
      }
      setAberta(c);
      atualizarLinha(c);
      recarregar();
    },
    [atualizarLinha, recarregar],
  );

  // A conversa aberta pode sair da página/filtro da lista: a cópia da tela segue valendo.
  const atual = aberta ? (itens.find((c) => c.id === aberta.id) ?? aberta) : null;
  useEffect(() => {
    atualAoVoltar.current = atual;
  });
  const conversaAberta = atual && <ConversaAberta key={atual.id} conversa={atual} sinal={sinal} celular={celular} aoMudarConversa={mudouPelaTela} aoVoltar={voltar} />;

  if (celular && conversaAberta) {
    return (
      <div data-ao-vivo={aoVivo} className="grid h-[100dvh] grid-cols-1 grid-rows-[minmax(0,1fr)]">
        <ModoFoco />
        {conversaAberta}
      </div>
    );
  }

  return (
    <section className="px-5 py-6 lg:px-8">
      <header>
        <h1 className="text-20 font-semibold text-volt-950">Instagram</h1>
        <p className="mt-1 text-13 text-slate-600">Quem fala com a loja no direct: o robô cuida do que dá e o que sobra espera por você aqui.</p>
      </header>
      <AbasInstagram ativa="conversas" aguardando={lista.aguardando} />
      {conta?.status !== "active" && (
        <p role="status" className="pn-aviso mt-4">
          {conta ? `A conexão com @${conta.username} não está ativa.` : "Nenhuma conta do Instagram conectada."}{" "}
          <Link href="/painel/instagram/fluxos" className="text-cobalt-500">Conectar em Fluxos</Link>
        </p>
      )}
      <div data-ao-vivo={aoVivo} className="mt-4 grid overflow-hidden rounded-[10px] border border-line-200 bg-paper-0 lg:h-[calc(100dvh-14rem)] lg:min-h-[32rem] lg:grid-cols-[20rem_minmax(0,1fr)_18.75rem]">
        <ListaDeConversas
          itens={lista.itens}
          abertaId={atual?.id ?? null}
          filtro={lista.filtro}
          aguardando={lista.aguardando}
          etiquetaParcial={lista.etiquetaParcial}
          carga={lista.carga}
          maisFalhou={lista.maisFalhou}
          temMais={lista.proximo !== null}
          varredura={lista.varredura}
          aoMudarFiltro={lista.mudarFiltro}
          aoAbrir={abrir}
          aoVerMais={() => void lista.maisAntigas()}
          aoAtualizar={() => void lista.atualizar()}
          aoTentarDeNovo={recarregar}
        />
        {conversaAberta ?? (
          <p className="hidden items-center justify-center bg-canvas-100 p-6 text-13 text-slate-600 lg:col-span-2 lg:flex">Escolha uma conversa na lista para ler e responder.</p>
        )}
      </div>
    </section>
  );
}

/** `/painel/instagram`: a aba Conversas. Loja sem o add-on vê a oferta; sem conta conectada, o caminho para conectar. */
export function ConversasTela() {
  const { instagram } = useCasca();
  const { tenantId } = useRole();

  if (instagram === null) {
    return (
      <section className="px-5 py-6 lg:px-8">
        <span role="status" aria-label="Carregando Instagram" className="pn-skeleton block h-7 w-40 rounded-[var(--radius-chip)]" />
      </section>
    );
  }
  if (!instagram.enabled) {
    return (
      <Suspense fallback={null}>
        <OfertaInstagram />
      </Suspense>
    );
  }
  return <Caixa tenantId={tenantId} conta={instagram.account} />;
}
