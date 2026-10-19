"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  MoreHorizontal,
  Users,
  MousePointerClick,
  AlertTriangle,
  Pencil,
  RefreshCw,
  Send,
  Trash2,
  Loader2,
  ListOrdered,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyLink } from "@/components/painel/copy-link";
import { buildCampaignGroupsOverview, type CampaignGroupsOverview } from "@/lib/campaign-groups-overview";
import type { Group } from "@/lib/mock-data";
import type { DispatchView } from "@/lib/campaigns/dispatch-view";
import { MessagesTab } from "@/components/painel/messages";
import { FunnelResults } from "@/components/painel/campaigns/funnel-results";
import { useConfirmacao } from "@/components/painel/confirmacao";
import { useToast } from "@/components/toast";
import { AcoesEmMassa } from "@/components/painel/grupos/acoes-em-massa";
import { AvisoConflitos } from "@/components/painel/campanhas/aviso-conflitos";
import { GruposDaCampanha } from "@/components/painel/grupos/grupos-da-campanha";
import { ConfigChips } from "@/components/painel/campanhas/config-chips";
import { QrLink } from "@/components/painel/campanhas/qr-link";
import { AjudaPainel } from "@/components/painel/campanhas/ajuda-painel";
import { LinkECliques } from "@/components/painel/campanhas/detalhe/link-e-cliques";
import { VisaoGeralCampanha } from "@/components/painel/campanhas/detalhe/visao-geral";
import { ENTRADA_DEFAULTS, type EntradaSettings } from "@/lib/campaigns/settings";
import { clicksForCampaign } from "@/lib/links/click-attribution";
import { entriesPerClick } from "@/lib/campaigns/campaign-entries";
import { horaBR } from "@/lib/date-br";
import type { EntradasDaCampanha } from "@/lib/painel/campanha-visao";
import { useLinkOrigin } from "@/lib/painel/use-link-origin";
import { linkPublico } from "@/lib/painel/campanhas";
import { buscarLista } from "@/lib/painel/carregar";
import type { Carga } from "@/lib/painel/types";
import { ErroDeCarga } from "@/components/painel/erro-de-carga";

type Campanha = {
  id: string;
  name: string;
  loja?: string;
  groupIds: string[];
  slug?: string;
  createdAt: string;
  autoGrow?: boolean;
  whatsappCommunityJid?: string | null;
  settings?: { entrada: EntradaSettings; integracoes?: { meta: { pixel_id: string } } };
};
type TrackedLink = { campaignGroupId?: string | null; campaignName?: string; clicks: number };
type Order = { id: string; value: number; campaign_id?: string | null };

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

// Direção D (spec 2026-09-24, PR B): a campanha abre na Visão geral. "Posts"
// é a antiga "Mensagens" (Enviar agora, Agendar, Funil, Agenda).
const TABS = ["Visão geral", "Grupos", "Posts", "Resultados", "Link e cliques"] as const;
type Tab = (typeof TABS)[number];

export default function CampanhaDetalhe() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const { pedirConfirmacao, folhaDeConfirmacao } = useConfirmacao();
  const toast = useToast();
  const key = params?.slug ?? "";

  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  // Erro aqui não é "Campanha não encontrada": a lista é que não veio.
  const [cargaDasCampanhas, setCargaDasCampanhas] = useState<Carga>("carregando");
  const [groups, setGroups] = useState<Group[]>([]);
  const [clicks, setClicks] = useState(0);
  // null quando a leitura não veio: "—" na tela, nunca um 0 ou um "ninguém
  // entrou" que ninguém mediu.
  const [entradas, setEntradas] = useState<EntradasDaCampanha | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  // null enquanto os posts carregam: "Hoje na campanha" mostra o esqueleto.
  const [posts, setPosts] = useState<DispatchView[] | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState(() => new Date());
  const [live, setLive] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const origin = useLinkOrigin();
  const [tab, setTab] = useState<Tab>("Visão geral");
  // Posts fica montada depois da 1ª visita: o funil em preenchimento
  // (e a foto já enviada) sobrevive à troca de aba.
  const [mensagensVista, setMensagensVista] = useState(false);
  // `?abrir=funil` vem do "Novo funil" da tela Funis. Lido depois de montar
  // (sem localização no servidor); a aba Posts só monta depois disso, então
  // o MessagesTab já nasce na sub-aba Funil.
  const [abrirNoFunil, setAbrirNoFunil] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("abrir") !== "funil") return;
    setAbrirNoFunil(true);
    setTab("Posts");
    setMensagensVista(true);
  }, []);

  function abrirAba(t: Tab) {
    setTab(t);
    if (t === "Posts") setMensagensVista(true);
    // Quem acabou de postar em Posts volta e quer ver ESTE post saindo, não o da manhã.
    if (t === "Visão geral" && campanha) lerPosts(campanha.slug ?? campanha.id);
  }

  /** Posts do dia para "Hoje na campanha" e a coluna da entrega. Falha vira lista vazia, nunca esqueleto eterno. */
  function lerPosts(slugOuId: string) {
    void fetch(`/api/campanhas/${slugOuId}/messages`)
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
      .then((p: unknown) => setPosts(Array.isArray(p) ? (p as DispatchView[]) : []));
  }
  const [menu, setMenu] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function loadData() {
    try {
      // Falha não apaga a campanha que já está na tela (o Atualizar no meio de um soluço da rede).
      const [list, g, l, s, o, ent] = await Promise.all([
        buscarLista<Campanha>("/api/campanhas", setCampanhas, setCargaDasCampanhas),
        fetch("/api/groups").then((r) => r.json()).catch(() => []),
        fetch("/api/links").then((r) => r.json()).catch(() => []),
        fetch("/api/session").then((r) => r.json()).catch(() => ({})),
        fetch("/api/orders").then((r) => r.json()).catch(() => []),
        fetch(`/api/campanhas/${encodeURIComponent(key)}/entradas`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);
      setGroups(Array.isArray(g) ? g : []);
      setLive(Boolean(s?.live));
      setOrders(Array.isArray(o) ? o : []);
      const camp = list?.find((x) => x.slug === key || x.id === key);
      if (camp) {
        const ls: TrackedLink[] = Array.isArray(l) ? l : [];
        // Por ID: comparar o nome fazia o histórico sumir quando a campanha era renomeada.
        setClicks(clicksForCampaign(ls, camp));
        // Entradas contam quem ENTROU nos grupos da campanha desde que ela foi
        // criada, não o total de membros. Elas, as últimas e as de hoje por
        // grupo vêm do servidor: a lista de /api/leads para em 1000 linhas, e
        // loja grande passa disso.
        setEntradas(typeof ent?.entradas === "number" ? ent : null);
        // Sem await: a tela não espera pelos posts.
        lerPosts(camp.slug ?? camp.id);
      }
    } finally {
      setAtualizadoEm(new Date());
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const campanha = useMemo(() => campanhas.find((c) => c.slug === key || c.id === key) ?? null, [campanhas, key]);
  const o: CampaignGroupsOverview | null = useMemo(
    () => (campanha ? buildCampaignGroupsOverview({ campaign: campanha, groups, clicks }) : null),
    [campanha, groups, clicks],
  );
  const campaignOrders = useMemo(
    () => (campanha ? orders.filter((ord) => ord.campaign_id === campanha.id) : []),
    [orders, campanha],
  );
  const campaignRevenue = useMemo(() => campaignOrders.reduce((a, ord) => a + (ord.value ?? 0), 0), [campaignOrders]);
  const entries = entradas?.entradas ?? null;
  // null = ainda não houve clique (ou a contagem falhou). Mostrar 0% aí leria "ninguém converteu".
  const taxaEntrada = useMemo(() => (entries === null ? null : entriesPerClick(entries, clicks)), [entries, clicks]);

  async function handleRefresh() {
    setRefreshing(true);
    setMenu(false);
    await loadData();
    setRefreshing(false);
  }

  async function handleDelete() {
    if (!campanha) return;
    const ok = await pedirConfirmacao({
      titulo: "Excluir a campanha",
      texto: `Excluir a campanha "${campanha.name}"? Essa ação não pode ser desfeita.`,
      rotulo: "Excluir",
      destrutivo: true,
    });
    if (!ok) return;
    setDeleting(true);
    setMenu(false);
    // Antes ia para a lista sem olhar a resposta: 403 (operador não exclui) ou
    // 500 pareciam exclusão feita, com a campanha e os posts dela ainda no ar.
    try {
      const res = await fetch(`/api/campanhas?id=${campanha.id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/painel/campanhas");
        return;
      }
      // O 403 de `assertPermission` vem em texto puro: sem JSON, cai no padrão.
      const corpo = (await res.json().catch(() => ({}))) as { error?: string };
      const padrao = res.status === 403 ? "Sem permissão para excluir campanhas." : "Não deu para excluir a campanha. Tente de novo.";
      toast(corpo.error ?? padrao, "error");
    } catch {
      toast("Sem conexão: a campanha não foi excluída.", "error");
    }
    setDeleting(false);
  }

  // O "Tentar de novo" volta por aqui: esqueleto, e não "não encontrada", enquanto busca.
  if (loading || (!campanha && cargaDasCampanhas === "carregando")) {
    return (
      <div className="mx-auto max-w-[1100px] space-y-4 px-4 py-8 sm:px-8" role="status" aria-label="Carregando a campanha">
        <div className="pn-skeleton h-40 rounded-xl" data-testid="painel-skeleton" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="pn-skeleton h-56 rounded-xl" data-testid="painel-skeleton" />)}
        </div>
      </div>
    );
  }

  if (!campanha && cargaDasCampanhas === "erro") {
    return (
      <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-8">
        <ErroDeCarga titulo="Não deu para carregar esta campanha." aoTentarDeNovo={() => void loadData()} />
      </div>
    );
  }

  if (!campanha || !o) {
    return (
      <div className="mx-auto max-w-[1100px] px-4 py-24 text-center sm:px-8">
        <p className="text-[22px] text-volt-950">Campanha não encontrada.</p>
        <Link href="/painel/campanhas" className="mt-4 inline-block text-sm text-cobalt-500 hover:underline">
          ← Voltar pra campanhas
        </Link>
      </div>
    );
  }

  // Sem origem ainda (consulta do domínio próprio voltando), sem link: um
  // "/r/slug" relativo copiado ou embutido no funil seria link quebrado.
  const masterUrl = linkPublico(origin, campanha.slug) ?? "";
  const offline = live === false;
  const semConvite = o.missingInviteCount;

  const editar = `/painel/campanhas/${campanha.slug ?? campanha.id}/editar`;

  return (
    <div className="mx-auto max-w-[1180px] space-y-6 px-4 py-6 sm:px-8">
      {/* Cabeçalho da campanha (direção D): nome, ações, e numa linha só o link,
          o tamanho, o "abre outro sozinho" e o número. Sem cartão em volta. */}
      <header className="space-y-3">
        <Link href="/painel/campanhas" className="inline-flex items-center gap-1.5 text-13 text-slate-600 transition-colors hover:text-volt-950">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Campanhas
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="min-w-0 break-words text-28 font-semibold tracking-[-0.01em] text-volt-950">{campanha.name}</h1>
          <div className="relative flex flex-wrap items-center gap-2">
            <AjudaPainel />
            {/* Comunidade nativa fica fora: o sync regrava `group_ids` e a rota responde 409. */}
            {o.groupCount > 0 && !campanha.whatsappCommunityJid && (
              <Link
                href={`/painel/campanhas/${encodeURIComponent(campanha.slug ?? campanha.id)}/padronizar`}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-200 bg-paper-0 px-3.5 text-sm font-medium text-volt-950 transition-colors hover:border-slate-600"
              >
                <ListOrdered className="h-4 w-4" aria-hidden="true" /> Padronizar nomes e sequência
              </Link>
            )}
            {o.groupCount > 0 && (
              <button
                type="button"
                onClick={() => abrirAba("Posts")}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-acid-500 px-4 text-sm font-semibold text-volt-950 transition hover:brightness-95"
              >
                <Send className="h-4 w-4" aria-hidden="true" /> Postar em {o.groupCount} {o.groupCount === 1 ? "grupo" : "grupos"}
              </button>
            )}
            <Link href={editar} className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-200 bg-paper-0 px-3.5 text-sm font-medium text-volt-950 transition-colors hover:border-slate-600">
              <Pencil className="h-4 w-4" aria-hidden="true" /> Editar campanha
            </Link>
            <button
              type="button"
              onClick={() => setMenu((v) => !v)}
              aria-label="Mais ações"
              aria-expanded={menu}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-line-200 bg-paper-0 text-slate-600 transition-colors hover:text-volt-950"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
            {menu && (
              <>
                <button className="fixed inset-0 z-10 cursor-default" onClick={() => setMenu(false)} aria-label="Fechar" />
                <div className="hf-enter absolute right-0 top-12 z-20 w-52 overflow-hidden rounded-lg border border-line-200 bg-paper-0 py-1.5 shadow-deep">
                  <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-slate-600 transition-colors hover:bg-hover-ficha hover:text-volt-950"
                  >
                    {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Atualizar dados
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-danger-700 transition-colors hover:bg-hover-ficha"
                  >
                    {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Excluir campanha
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        {/* min-w-0 + max-w-full: sem eles a URL mestra não encolhe e a página
            rolava de lado em 390 px. */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 text-13 text-slate-600">
          {masterUrl && <CopyLink url={masterUrl} className="min-w-0 max-w-full" />}
          {masterUrl && <QrLink url={masterUrl} nome={campanha.name} />}
          <span>
            <strong className="font-semibold tabular-nums text-volt-950">{o.groupCount.toLocaleString("pt-BR")}</strong> grupos ·{" "}
            <strong className="font-semibold tabular-nums text-volt-950">{o.totalMembers.toLocaleString("pt-BR")}</strong> pessoas
          </span>
          {typeof campanha.autoGrow === "boolean" && (
            <Link href={editar} className="transition-colors hover:text-volt-950">
              Grupo lotou → abre outro: <strong className="font-semibold text-volt-950">{campanha.autoGrow ? "ligado" : "desligado"}</strong>
            </Link>
          )}
          {live !== null && (
            <span className="inline-flex items-center gap-1.5">
              <span className={cn("pn-ponto", live ? "pn-ponto--conectado" : "pn-ponto--desconectado")} aria-hidden="true" />
              número {live ? "conectado" : "desconectado"}
            </span>
          )}
          <button type="button" onClick={handleRefresh} disabled={refreshing} className="inline-flex items-center gap-1.5 transition-colors hover:text-volt-950">
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
            atualizado {horaBR(atualizadoEm.toISOString())}
          </button>
        </div>
        <ConfigChips
          entrada={campanha.settings?.entrada ?? ENTRADA_DEFAULTS}
          integracoes={campanha.settings?.integracoes}
          href={`${editar}?aba=entrada`}
        />
        {(offline || semConvite > 0) && (
          <div className="flex items-center gap-3 rounded-lg border border-danger-700/40 bg-aviso-fundo px-4 py-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-danger-700" aria-hidden="true" />
            <p className="flex-1 text-sm text-slate-600">
              {offline ? (
                <><strong className="text-volt-950">WhatsApp desconectado</strong> — ninguém entra nem recebe post até reconectar.</>
              ) : (
                <><strong className="text-volt-950">{semConvite} {semConvite === 1 ? "grupo sem convite" : "grupos sem convite"}</strong> — não recebem gente nova até configurar o link.</>
              )}
            </p>
            <Link href={offline ? "/painel/conectar" : editar} className="rounded-lg bg-danger-700 px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90">
              {offline ? "Reconectar" : "Configurar"}
            </Link>
          </div>
        )}
      </header>

      {/* Abas: Configurar é a tela de edição, por isso é link e não aba. A contagem
          fica fora do nome acessível ("Grupos"), que é contrato dos testes. */}
      <nav aria-label="Seções da campanha" className="-mx-4 flex gap-1 overflow-x-auto border-b border-line-200 px-4 sm:mx-0 sm:px-0">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => abrirAba(t)}
            className={cn("relative shrink-0 px-3 py-2.5 text-sm font-medium transition-colors", tab === t ? "text-volt-950" : "text-slate-600 hover:text-volt-950")}
          >
            {t}
            {t === "Grupos" && (
              <span aria-hidden="true" className="ml-1.5 rounded bg-hover-ficha px-1.5 py-0.5 text-12 tabular-nums text-slate-600">
                {o.groupCount}
              </span>
            )}
            {tab === t && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-volt-950" />}
          </button>
        ))}
        <Link href={editar} className="shrink-0 px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:text-volt-950">
          Configurar
        </Link>
      </nav>

      <div className="hf-enter" key={tab}>
        {tab === "Grupos" && <AvisoConflitos campanhaId={campanha.id} slug={campanha.slug ?? campanha.id} />}
        {tab === "Grupos" && (
          o.groups.length === 0 ? (
            <div className="pn-card rounded-xl px-5 py-16 text-center">
              <p className="text-[22px] text-volt-950">Sem grupos ainda.</p>
              <p className="mt-1 text-sm text-aco">Adicione grupos pra essa campanha começar a captar.</p>
              <Link
                href={`/painel/campanhas/${campanha.slug ?? campanha.id}/editar`}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-cobalt-500 px-4 py-2.5 text-sm font-medium text-white transition-[transform,filter] duration-[160ms] ease-[var(--ease-fluxo)] hover:-translate-y-0.5 hover:brightness-110"
              >
                <Users className="h-4 w-4" /> Adicionar grupos
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              <GruposDaCampanha
                slug={campanha.slug ?? campanha.id}
                origin={origin}
                envio={Object.fromEntries(groups.map((g) => [g.whatsappGroupId, g.sendState ?? null]))}
                atualizadoEm={atualizadoEm}
                groupIds={campanha.groupIds}
                gruposNaTela={groups.length}
                entrada={campanha.settings?.entrada ?? ENTRADA_DEFAULTS}
                aoMudarCapacidade={loadData}
              />
              <AcoesEmMassa
                slug={campanha.slug ?? campanha.id}
                administrados={o.groups.filter((g) => g.group?.isAdmin).length}
                totais={o.groups.length}
                estado={{
                  abertos: o.groups.filter((g) => g.group?.sendState === "open").length,
                  fechados: o.groups.filter((g) => g.group?.sendState === "closed").length,
                  // Tudo que não é open nem closed cai aqui — inclusive o grupo
                  // sem `group` resolvido. `send_state` nulo é "nunca aplicamos",
                  // e somá-lo aos abertos diria ao lojista que o grupo está
                  // aberto sem nunca termos tocado nele.
                  semInfo: o.groups.filter(
                    (g) => g.group?.sendState !== "open" && g.group?.sendState !== "closed",
                  ).length,
                }}
                onLoteConcluido={loadData}
              />
            </div>
          )
        )}

        {tab === "Link e cliques" && (
          <LinkECliques
            slug={campanha.slug ?? campanha.id}
            nome={campanha.name}
            linkMestre={masterUrl}
            groupIds={campanha.groupIds}
            grupos={groups}
            entrada={campanha.settings?.entrada ?? ENTRADA_DEFAULTS}
            cliquesNoTotal={o.clicks}
            agora={atualizadoEm}
            editarHref={editar}
          />
        )}

        {tab === "Visão geral" && (
          <VisaoGeralCampanha
            slug={campanha.slug ?? campanha.id}
            overview={o}
            taxaEntrada={taxaEntrada}
            receita={campaignRevenue}
            pedidos={campaignOrders.length}
            ultimas={entradas?.ultimas ?? null}
            posts={posts}
            agora={atualizadoEm}
            aoVerGrupos={() => abrirAba("Grupos")}
            aoVerPosts={() => abrirAba("Posts")}
          />
        )}

        {tab === "Resultados" && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile label="Cliques" value={o.clicks.toLocaleString("pt-BR")} />
              <Tile label="Membros" value={o.totalMembers.toLocaleString("pt-BR")} />
              <Tile label="Entradas" value={entries === null ? "—" : entries.toLocaleString("pt-BR")} tone="cobalt" />
              <Tile label="Grupos cheios" value={String(o.fullCount)} tone="atencao" />
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile label="Vendas" value={brl.format(campaignRevenue)} tone="cobalt" />
              <Tile label="Pedidos" value={campaignOrders.length.toLocaleString("pt-BR")} />
            </div>
            <div className="pn-card rounded-xl p-6">
              {/* O funil antigo comparava clicks com `totalMembers`, que inclui quem já
                  estava no grupo antes do link existir — por isso passava de 100%. Agora
                  a 2ª etapa é ENTRADA (leads têm `entered_at`), que é o que de fato
                  aconteceu depois do clique. Continua sem barra proporcional: entrada não
                  prova origem no link (ver campaign-entries.ts). */}
              <h2 className="font-display text-base font-bold text-volt-950">Do clique à entrada</h2>
              <div className="mt-5 space-y-3">
                {[
                  { icon: MousePointerClick, label: "Clicaram no link", value: o.clicks },
                  { icon: Users, label: "Entraram nos grupos", value: entries },
                ].map((s) => {
                  const Icon = s.icon;
                  return (
                    <div key={s.label} className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm text-aco"><Icon className="h-4 w-4 text-cobalt-500" strokeWidth={1.75} />{s.label}</span>
                      <span className="font-data text-base font-medium tabular-nums text-volt-950">{s.value === null ? "—" : s.value.toLocaleString("pt-BR")}</span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-13 leading-relaxed text-aco">
                Entradas são quem entrou nos grupos desta campanha depois que ela foi criada.
                O convite do WhatsApp é o mesmo pra todo mundo, então quem foi adicionado à
                mão entra nessa conta igual — não é prova de que veio do link.
              </p>
              <Link href="/painel/resultados" className="font-data mt-5 inline-flex items-center gap-1 text-12 uppercase tracking-[0.08em] text-cobalt-500 transition-[gap] duration-[160ms] hover:gap-1.5">
                Ver resultados completos →
              </Link>
            </div>
            <FunnelResults campaignSlug={campanha.slug ?? campanha.id} />
          </div>
        )}
      </div>
      {/* Fora do `key={tab}` acima, que remontaria tudo a cada troca. */}
      {mensagensVista && (
        <div hidden={tab !== "Posts"}>
          <MessagesTab
            campaignSlug={campanha.slug ?? campanha.id}
            groupIds={campanha.groupIds}
            funil={{ campaignName: campanha.name, masterUrl, groupCount: o.groupCount, memberCount: o.totalMembers }}
            abrirNoFunil={abrirNoFunil}
            ativo={tab === "Posts"}
          />
        </div>
      )}
      {folhaDeConfirmacao}
    </div>
  );
}

/* ---------- helpers ---------- */

function Tile({ label, value, tone }: { label: string; value: string; tone?: "cobalt" | "atencao" }) {
  return (
    <div className="pn-card rounded-xl p-4">
      <p className="font-data text-12 uppercase tracking-[0.08em] text-aco">{label}</p>
      <p className={cn("font-data mt-2 text-[26px] font-medium tabular-nums tracking-[-0.02em]", tone === "cobalt" ? "text-cobalt-500" : tone === "atencao" ? "text-atencao" : "text-volt-950")}>{value}</p>
    </div>
  );
}
