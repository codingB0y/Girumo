"use client";

import Link from "next/link";
import { BarChart3, CheckCircle2, ChevronRight, LayoutDashboard, Megaphone, Plus, Send, Sparkles, Users, Wifi } from "lucide-react";
import { useState } from "react";
import type { DemoScenario } from "@/lib/demo-data";

type DemoDashboardProps = {
  scenario: DemoScenario;
  notice: string | null;
  onSimulatedAction: (message: string) => void;
};

type View = "início" | "campanhas" | "grupos" | "contatos" | "resultados";

const navigation: Array<{ id: View; label: string; icon: typeof LayoutDashboard }> = [
  { id: "início", label: "Início", icon: LayoutDashboard },
  { id: "campanhas", label: "Campanhas", icon: Megaphone },
  { id: "grupos", label: "Grupos", icon: Users },
  { id: "contatos", label: "Contatos", icon: Users },
  { id: "resultados", label: "Resultados", icon: BarChart3 },
];

export function DemoDashboard({ scenario, notice, onSimulatedAction }: DemoDashboardProps) {
  const [view, setView] = useState<View>("início");

  return (
    <main className="min-h-screen bg-paper-0 text-volt-950">
      <header className="sticky top-0 z-20 border-b border-volt-950/10 bg-paper-0/95 px-4 py-3 backdrop-blur sm:px-7">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <span className="font-display text-xl font-extrabold tracking-[-0.04em]">girumo</span>
            <span className="hidden items-center gap-1.5 rounded-full bg-cobalt-500/10 px-3 py-1.5 font-data text-[10px] font-medium uppercase tracking-[0.12em] text-cobalt-700 sm:inline-flex">
              <Sparkles className="h-3.5 w-3.5" /> Modo demonstração
            </span>
          </div>
          <Link href="/signup" className="inline-flex items-center gap-2 rounded-xl bg-volt-950 px-4 py-2.5 text-sm font-semibold text-paper-0 transition hover:bg-volt-800">
            Criar minha conta <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1440px]">
        <aside className="hidden w-60 shrink-0 border-r border-volt-950/10 px-3 py-6 lg:block">
          <p className="px-3 font-data text-[10px] uppercase tracking-[0.14em] text-aco/50">Painel demo</p>
          <nav className="mt-3 space-y-1">
            {navigation.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" onClick={() => setView(id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${view === id ? "bg-volt-950 font-medium text-paper-0" : "text-aco/70 hover:bg-poco hover:text-volt-950"}`}>
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </nav>
          <div className="mt-8 rounded-2xl bg-cobalt-500/10 p-4">
            <p className="font-data text-[10px] uppercase tracking-[0.12em] text-cobalt-700">Dados fictícios</p>
            <p className="mt-2 text-xs leading-relaxed text-aco/75">Esta tela não usa a sua conta nem envia mensagens.</p>
          </div>
        </aside>

        <div className="min-w-0 flex-1 px-4 py-6 sm:px-7 sm:py-8">
          <div className="mb-5 flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {navigation.map(({ id, label }) => (
              <button key={id} type="button" onClick={() => setView(id)} className={`shrink-0 rounded-full px-3 py-2 text-xs font-medium ${view === id ? "bg-volt-950 text-paper-0" : "bg-poco text-aco"}`}>
                {label}
              </button>
            ))}
          </div>

          {notice && <div role="status" className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-sucesso/20 bg-sucesso/10 px-4 py-3 text-sm text-volt-950"><span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-sucesso" /> {notice}</span><button type="button" onClick={() => onSimulatedAction("")} className="text-xs font-medium text-aco/70">Fechar</button></div>}

          {view === "início" && <Overview scenario={scenario} onSimulatedAction={onSimulatedAction} />}
          {view === "campanhas" && <Campaigns scenario={scenario} onSimulatedAction={onSimulatedAction} />}
          {view === "grupos" && <Groups scenario={scenario} />}
          {view === "contatos" && <Contacts scenario={scenario} />}
          {view === "resultados" && <Results scenario={scenario} />}
        </div>
      </div>
    </main>
  );
}

function Overview({ scenario, onSimulatedAction }: Pick<DemoDashboardProps, "scenario" | "onSimulatedAction">) {
  const totalMembers = scenario.groups.reduce((total, group) => total + group.members, 0);
  return <section><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-data text-[11px] uppercase tracking-[0.14em] text-aco/55">Visão geral</p><h1 className="font-display mt-1 text-3xl font-extrabold tracking-[-0.04em]">Bom dia, {scenario.storeName}</h1><p className="mt-2 text-sm text-aco/70">Sua operação simulada está pronta para crescer.</p></div><span className="inline-flex items-center gap-2 rounded-full bg-sucesso/10 px-3 py-2 text-xs font-medium text-sucesso"><Wifi className="h-3.5 w-3.5" /> WhatsApp conectado</span></div><div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Contatos captados" value={scenario.metrics.contacts.toString()} detail="nos últimos 7 dias" /><Metric label="Cliques no link" value={scenario.metrics.clicks.toString()} detail="na campanha ativa" /><Metric label="Conversão" value={`${scenario.metrics.conversionRate}%`} detail="de clique para entrada" /><Metric label="Membros nos grupos" value={totalMembers.toLocaleString("pt-BR")} detail="em 3 grupos ativos" /></div><div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]"><div className="rounded-2xl border border-volt-950/10 bg-white p-5 sm:p-6"><p className="font-data text-[11px] uppercase tracking-[0.14em] text-aco/55">Campanha em andamento</p><h2 className="font-display mt-2 text-2xl font-bold tracking-[-0.03em]">{scenario.campaign.name}</h2><p className="mt-3 max-w-xl text-sm leading-relaxed text-aco/75">{scenario.campaign.message}</p><div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={() => onSimulatedAction("Campanha simulada enviada para os grupos selecionados.")} className="inline-flex items-center gap-2 rounded-xl bg-cobalt-500 px-4 py-2.5 text-sm font-semibold text-white"><Send className="h-4 w-4" /> Simular envio</button><button type="button" onClick={() => onSimulatedAction("Nova campanha simulada criada como rascunho.")} className="inline-flex items-center gap-2 rounded-xl border border-volt-950/15 px-4 py-2.5 text-sm font-semibold text-volt-950"><Plus className="h-4 w-4" /> Nova campanha</button></div></div><div className="rounded-2xl bg-volt-950 p-5 text-paper-0 sm:p-6"><p className="font-data text-[11px] uppercase tracking-[0.14em] text-paper-0/45">Próximo passo</p><h2 className="font-display mt-2 text-xl font-bold">Compartilhe seu link.</h2><p className="mt-3 text-sm leading-relaxed text-paper-0/65">Na Girumo real, cada clique pode virar uma nova pessoa nos seus grupos.</p><button type="button" onClick={() => onSimulatedAction("Link da campanha copiado apenas nesta demonstração.")} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-acid-500">Simular cópia do link <ChevronRight className="h-4 w-4" /></button></div></div></section>;
}

function Campaigns({ scenario, onSimulatedAction }: Pick<DemoDashboardProps, "scenario" | "onSimulatedAction">) {
  return <section><Eyebrow title="Campanhas" description="Uma campanha fictícia mostrando como os disparos aparecem no painel." /><div className="mt-6 rounded-2xl border border-volt-950/10 bg-white p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><span className="rounded-full bg-sucesso/10 px-2.5 py-1 font-data text-[10px] font-medium uppercase tracking-[0.12em] text-sucesso">Ativa</span><h2 className="font-display mt-3 text-2xl font-bold tracking-[-0.03em]">{scenario.campaign.name}</h2><p className="mt-2 text-sm text-aco/70">Enviada às {scenario.campaign.sentAt} para {scenario.campaign.groupIds.length} grupos.</p></div><button type="button" onClick={() => onSimulatedAction("Disparo simulado concluído. Nenhuma mensagem foi enviada.")} className="inline-flex items-center gap-2 rounded-xl bg-cobalt-500 px-4 py-2.5 text-sm font-semibold text-white"><Send className="h-4 w-4" /> Simular disparo</button></div><p className="mt-6 rounded-xl bg-poco p-4 text-sm leading-relaxed text-aco/80">{scenario.campaign.message}</p><div className="mt-5 grid gap-3 sm:grid-cols-3"><Metric label="Cliques" value={scenario.campaign.clicks.toString()} detail="no link da campanha" /><Metric label="Grupos" value={scenario.campaign.groupIds.length.toString()} detail="recebendo a oferta" /><Metric label="Novos contatos" value={scenario.metrics.contacts.toString()} detail="neste cenário" /></div></div></section>;
}

function Groups({ scenario }: Pick<DemoDashboardProps, "scenario">) {
  return <section><Eyebrow title="Grupos" description="Acompanhe a ocupação e o ritmo de cada comunidade." /><div className="mt-6 grid gap-4 lg:grid-cols-3">{scenario.groups.map((group) => { const fill = Math.round((group.members / group.capacity) * 100); return <article key={group.id} className="rounded-2xl border border-volt-950/10 bg-white p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-display text-lg font-bold tracking-[-0.025em]">{group.name}</h2><p className="mt-1 text-xs text-aco/65">{group.engagement}</p></div><Users className="h-5 w-5 text-cobalt-500" /></div><p className="mt-7 font-data text-2xl font-semibold tabular-nums">{group.members.toLocaleString("pt-BR")}<span className="text-sm text-aco/55">/{group.capacity.toLocaleString("pt-BR")}</span></p><div className="mt-3 h-2 overflow-hidden rounded-full bg-poco"><div className="h-full rounded-full bg-cobalt-500" style={{ width: `${fill}%` }} /></div><p className="mt-2 text-xs text-aco/65">{fill}% da capacidade</p></article>; })}</div></section>;
}

function Contacts({ scenario }: Pick<DemoDashboardProps, "scenario">) {
  return <section><Eyebrow title="Contatos" description="Pessoas fictícias que entraram pelos seus links de campanha." /><div className="mt-6 overflow-hidden rounded-2xl border border-volt-950/10 bg-white"><div className="grid grid-cols-[1.3fr_1fr_0.8fr] gap-3 border-b border-volt-950/10 px-5 py-3 font-data text-[10px] uppercase tracking-[0.12em] text-aco/50 sm:grid-cols-[1.2fr_1fr_1fr_0.8fr]"><span>Contato</span><span>Origem</span><span className="hidden sm:block">Entrada</span><span>Status</span></div>{scenario.contacts.map((contact) => <div key={contact.id} className="grid grid-cols-[1.3fr_1fr_0.8fr] items-center gap-3 border-b border-volt-950/5 px-5 py-4 text-sm last:border-0 sm:grid-cols-[1.2fr_1fr_1fr_0.8fr]"><span className="font-medium text-volt-950">{contact.name}</span><span className="truncate text-aco/70">{contact.source}</span><span className="hidden text-aco/65 sm:block">{contact.joinedAt}</span><span className="justify-self-start rounded-full bg-cobalt-500/10 px-2.5 py-1 text-xs font-medium text-cobalt-700">{contact.status}</span></div>)}</div></section>;
}

function Results({ scenario }: Pick<DemoDashboardProps, "scenario">) {
  const chart = [36, 48, 42, 64, 58, 78, 92];
  return <section><Eyebrow title="Resultados" description="Resultados ilustrativos para mostrar como você acompanha o crescimento." /><div className="mt-6 grid gap-4 sm:grid-cols-3"><Metric label="Contatos no período" value={scenario.metrics.contacts.toString()} detail="crescimento de 28%" /><Metric label="Taxa de conversão" value={`${scenario.metrics.conversionRate}%`} detail="acima da média" /><Metric label="Grupos preenchidos" value={`${scenario.metrics.groupsFilled}/3`} detail="com capacidade ativa" /></div><div className="mt-6 rounded-2xl border border-volt-950/10 bg-white p-5 sm:p-7"><div className="flex items-center justify-between"><div><p className="font-data text-[11px] uppercase tracking-[0.14em] text-aco/55">Entradas nos grupos</p><h2 className="font-display mt-2 text-2xl font-bold tracking-[-0.03em]">A semana ganhou ritmo</h2></div><BarChart3 className="h-6 w-6 text-cobalt-500" /></div><div className="mt-10 flex h-40 items-end gap-3 sm:gap-5">{chart.map((height, index) => <div key={index} className="flex flex-1 flex-col items-center gap-2"><div className="w-full rounded-t-lg bg-cobalt-500/85" style={{ height: `${height}%` }} /><span className="font-data text-[10px] text-aco/50">{["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Hoje"][index]}</span></div>)}</div></div></section>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-2xl border border-volt-950/10 bg-white p-4 sm:p-5"><p className="font-data text-[10px] uppercase tracking-[0.12em] text-aco/55">{label}</p><p className="font-display mt-3 text-2xl font-bold tracking-[-0.035em] text-volt-950">{value}</p><p className="mt-1 text-xs text-aco/65">{detail}</p></div>;
}

function Eyebrow({ title, description }: { title: string; description: string }) {
  return <div><p className="font-data text-[11px] uppercase tracking-[0.14em] text-aco/55">Modo demonstração</p><h1 className="font-display mt-1 text-3xl font-extrabold tracking-[-0.04em]">{title}</h1><p className="mt-2 text-sm text-aco/70">{description}</p></div>;
}
