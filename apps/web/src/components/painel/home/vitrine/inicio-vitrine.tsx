"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { RefreshCw, Send, WifiOff } from "lucide-react";
import { useCasca } from "@/components/painel/casca-context";
import { CelebrationModal } from "@/components/painel/celebration-modal";
import { ActivationChecklist } from "@/components/painel/home/activation-checklist";
import type { Automation, Campanha, Disparo, Lead, Order, TenantSettings, TrackedLink } from "@/components/painel/home/types";
import { dayBR, dayBRAgo, dayBROf, monthBR } from "@/lib/date-br";
import type { Group } from "@/lib/mock-data";
import type { Activation } from "@/lib/onboarding-steps";
import { textoDoTicker } from "@/lib/painel/casca";
import { cabecalhoDoDia, linhaDoDia } from "@/lib/painel/inicio";
import { ordersInMonth, revenueInMonth } from "@/lib/painel-metrics";
import { AutomacoesLinhas } from "./automacoes-linhas";
import { CaixaDoMes } from "./caixa-do-mes";
import { CampanhasEtiquetas } from "./campanhas-etiquetas";
import { EstoqueDeGrupos } from "./estoque-de-grupos";
import { QuemChegou } from "./quem-chegou";
import { UltimoPost } from "./ultimo-post";
import { VitrineAgora } from "./vitrine-agora";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function Secao({ numero, titulo, meta, children }: { numero: string; titulo: string; meta?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-brand flex items-baseline gap-2 text-[16px] font-bold text-volt-950">
          <span className="font-data text-12 font-normal text-slate-600">{numero}</span>
          {titulo}
        </h2>
        {meta && <span className="font-data text-13 tabular-nums text-slate-600">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

type Props = {
  groups: Group[];
  campanhas: Campanha[];
  links: TrackedLink[];
  leads: Lead[];
  orders: Order[];
  disparos: Disparo[];
  automations: Automation[];
  settings: TenantSettings;
  settingsOk: boolean;
  isConnected: boolean;
  partial: boolean;
  activation: Activation;
  onSettingsSaved: (next: TenantSettings) => void;
  onDismissOnboarding: () => void;
  onOnboardingComplete: () => void;
};

/**
 * Início na Vitrine Aberta (research/direcao-d3.md 12.3 e 12.4): a loja de
 * atacado em oito blocos, desktop em 12 colunas e mobile empilhado. Mesmos
 * dados do FullDashboard; nada de fetch novo além da oferta relâmpago.
 */
export function InicioVitrine({
  groups,
  campanhas,
  links,
  leads,
  orders,
  disparos,
  automations,
  settings,
  settingsOk,
  isConnected,
  partial,
  activation,
  onSettingsSaved,
  onDismissOnboarding,
  onOnboardingComplete,
}: Props) {
  // Sem memo de propósito: preso no mount, o cabeçalho continuava na sexta
  // depois da meia-noite e "entradas hoje" contava o dia errado.
  const agora = new Date();
  const hoje = dayBR(agora);
  const mes = monthBR(agora);
  const { definirPassos } = useCasca();

  // O corredor mostra "N de 5 passos" com o que a Início calculou.
  useEffect(() => {
    definirPassos({ feitos: activation.doneCount, total: activation.total });
  }, [activation.doneCount, activation.total, definirPassos]);

  useEffect(() => {
    if (settingsOk && activation.complete && settings.onboardingCompletedAt == null) onOnboardingComplete();
  }, [settingsOk, activation.complete, settings.onboardingCompletedAt, onOnboardingComplete]);

  const entradasHoje = useMemo(() => leads.filter((l) => dayBROf(l.enteredAt) === hoje).length, [leads, hoje]);
  const diasDaSemana = new Set(Array.from({ length: 7 }, (_, i) => dayBRAgo(i, agora)));
  const entradasSemana = leads.filter((l) => diasDaSemana.has(dayBROf(l.enteredAt) ?? "")).length;

  const ultimoPost = useMemo(
    () =>
      [...disparos]
        .filter((d) => d.dispatchedAt && (d.status === "sent" || d.status === "running"))
        .sort((a, b) => (b.dispatchedAt ?? "").localeCompare(a.dispatchedAt ?? ""))[0] ?? null,
    [disparos],
  );

  const pedidosDoMes = useMemo(() => ordersInMonth(orders, mes), [orders, mes]);
  const faturamento = useMemo(() => revenueInMonth(orders, mes), [orders, mes]);
  const quemMaisVendeu = useMemo(() => {
    const comGrupo = pedidosDoMes.filter((o) => o.group_name?.trim());
    if (comGrupo.length < 3) return null;
    const soma = new Map<string, number>();
    for (const o of comGrupo) soma.set(o.group_name!.trim(), (soma.get(o.group_name!.trim()) ?? 0) + (o.value ?? 0));
    const [nome, valor] = [...soma.entries()].sort((a, b) => b[1] - a[1])[0];
    return { nome, valor };
  }, [pedidosDoMes]);

  const ultimaEntrada = useMemo(() => {
    const l = [...leads].sort((a, b) => b.enteredAt.localeCompare(a.enteredAt))[0];
    return l ? { nome: l.name, grupo: l.sourceGroup, quando: l.enteredAt } : null;
  }, [leads]);
  const ticker = textoDoTicker(
    ultimaEntrada,
    ultimoPost ? { quando: ultimoPost.dispatchedAt!, enviados: ultimoPost.sent, total: ultimoPost.total } : null,
    agora,
  );

  const cabecalho = cabecalhoDoDia(agora);
  const linha = linhaDoDia({ hoje: entradasHoje, semana: entradasSemana, ultimoPost: ultimoPost?.dispatchedAt ?? null }, agora);
  const mostrarChecklist = settingsOk && settings.onboardingDismissedAt == null && !activation.complete;

  return (
    <div className="mx-auto max-w-[1200px] space-y-8 px-4 py-5 lg:px-8 lg:py-8">
      <CelebrationModal groups={groups} leads={leads} monthlyGoal={settings.monthlyGoalContacts} />

      {/* Mobile (12.4): o ticker do letreiro vira a primeira linha do conteúdo. */}
      <p data-testid="inicio-ticker" className="font-data -mb-4 flex min-h-8 items-center gap-2 text-12 text-slate-600 lg:hidden">
        {ticker.tipo === "entrada" && <span className="pn-ponto" aria-hidden="true" />}
        <span className="truncate">{ticker.texto}</span>
      </p>

      {/* Bloco 1: cabeçalho do dia */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-brand text-[22px] font-bold tracking-[-0.02em] text-volt-950 lg:text-28">
            <span className="lg:hidden">{cabecalho.tituloCurto}</span>
            <span className="hidden lg:inline">{cabecalho.titulo}</span>
          </h1>
          <p className="mt-1 text-13 text-slate-600 lg:text-[14px]">{linha}</p>
        </div>
        <div data-testid="inicio-acoes" className="hidden items-center gap-2 lg:flex">
          <Link
            href="/painel/disparos"
            className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-control)] bg-cobalt-500 px-4 text-15 font-semibold text-white"
          >
            <Send className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Postar novidade
          </Link>
          <Link
            href="/painel/grupos"
            className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-4 text-[14px] font-medium text-volt-950"
          >
            <RefreshCw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Sincronizar grupos
          </Link>
        </div>
      </header>

      {partial && (
        <p className="rounded-[var(--radius-control)] bg-aviso-fundo px-4 py-3 text-13 text-volt-950">
          Alguns números não carregaram e podem estar incompletos. Recarregue a página pra tentar de novo.
        </p>
      )}

      {!isConnected && (
        <Link
          href="/painel/conectar"
          className="flex items-center gap-3 rounded-[var(--radius-control)] border border-alerta/25 bg-alerta/[0.06] px-4 py-3"
        >
          <WifiOff className="h-5 w-5 shrink-0 text-alerta" strokeWidth={2} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-15 font-semibold text-volt-950">Seu WhatsApp está desconectado</span>
            <span className="block text-13 text-slate-600">Nada sai e ninguém entra até reconectar.</span>
          </span>
          <span className="shrink-0 text-13 font-semibold text-cobalt-500">Reconectar</span>
        </Link>
      )}

      {/* No desktop o roteiro vive no corredor ("N de 5 passos"); no mobile continua aqui. */}
      {mostrarChecklist && (
        <div className="lg:hidden">
          <ActivationChecklist activation={activation} onDismiss={onDismissOnboarding} />
        </div>
      )}

      {/* Blocos 2 e 3: caixa e quem chegou */}
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <CaixaDoMes
            mes={MESES[agora.getMonth()]}
            faturamento={faturamento}
            pedidos={pedidosDoMes.length}
            quemMaisVendeu={quemMaisVendeu}
            meta={settings.monthlyGoalRevenue}
            metaOk={settingsOk}
            agora={agora}
            onMetaSalva={(v) => onSettingsSaved({ ...settings, monthlyGoalRevenue: v })}
          />
        </div>
        <div className="lg:col-span-5">
          <QuemChegou leads={leads} semana={entradasSemana} total={leads.length} limite={4} agora={agora} />
        </div>
      </div>

      {/* Blocos 4 e 5 */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Secao numero="01" titulo="Na vitrine agora">
            <VitrineAgora />
          </Secao>
        </div>
        <div className="lg:col-span-5">
          <Secao numero="02" titulo="Último post">
            <UltimoPost disparos={disparos} agora={agora} />
          </Secao>
        </div>
      </div>

      {/* Bloco 6 */}
      <Secao
        numero="03"
        titulo="Estoque de grupos"
        meta={
          groups.length > 0
            ? `${groups.length} ${groups.length === 1 ? "grupo" : "grupos"} · ${groups.reduce((a, g) => a + g.members, 0).toLocaleString("pt-BR")} pessoas · ${Math.max(0, groups.reduce((a, g) => a + g.capacity - g.members, 0)).toLocaleString("pt-BR")} vagas`
            : undefined
        }
      >
        <EstoqueDeGrupos grupos={groups} />
      </Secao>

      {/* Blocos 7 e 8 */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Secao numero="04" titulo="Campanhas">
            <CampanhasEtiquetas campanhas={campanhas} grupos={groups} links={links} />
          </Secao>
        </div>
        <div className="lg:col-span-5">
          <Secao numero="05" titulo="Automações">
            <AutomacoesLinhas automacoes={automations} agora={agora} />
          </Secao>
        </div>
      </div>
    </div>
  );
}
