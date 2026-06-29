import Link from "next/link";
import {
  ArrowUpRight,
  Plus,
  Send,
  MoreHorizontal,
  Clock,
  Users,
  Megaphone,
  RotateCcw,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* Protótipo — dados de exemplo (prototype data). */
const STATS = [
  { label: "Grupos ativos", value: "24", delta: "+3", up: true, spark: [8, 10, 9, 12, 14, 13, 16] },
  { label: "Membros novos · hoje", value: "38", delta: "+12%", up: true, spark: [4, 6, 5, 9, 8, 12, 15] },
  { label: "Campanhas · hoje", value: "3", delta: "2 ativas", up: true, spark: null },
  { label: "Receita · semana", value: "R$ 84k", delta: "+31%", up: true, spark: [20, 24, 22, 30, 28, 36, 42] },
];

const GROUPS = [
  { name: "Atacado Premium SP", members: 312, status: "Ativo" as const },
  { name: "Loja Distribuidora Norte", members: 198, status: "Lotado" as const },
  { name: "Clientes VIP Sul", members: 87, status: "Campanha" as const },
  { name: "Revenda Moda Brás", members: 243, status: "Ativo" as const },
  { name: "Madrugadão Outlet", members: 156, status: "Atenção" as const },
];

const AGENDA = [
  { time: "09:00", title: "Oferta da Semana", groups: 8, status: "Ativa" as const, icon: Megaphone },
  { time: "14:00", title: "Reposição · Lote 09", groups: 5, status: "Agendada" as const, icon: Send },
  { time: "19:00", title: "Recompra VIP", groups: 3, status: "Agendada" as const, icon: RotateCcw },
];

export default function PainelHoje() {
  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 sm:px-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">
            Bom dia, Igor <span className="align-middle">👋</span>
          </h1>
          <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/60">
            Segunda, 29 de junho · visão geral
          </p>
        </div>
        <Link
          href="/painel/campanhas/nova"
          className="group inline-flex items-center gap-2 rounded-xl bg-iris px-5 py-2.5 text-sm font-medium text-white shadow-iris transition hover:-translate-y-0.5 hover:bg-iris-claro"
        >
          <Plus className="h-4 w-4" /> Nova campanha
        </Link>
      </div>

      {/* Estado do negócio — painel Breu */}
      <section className="relative overflow-hidden rounded-3xl bg-breu p-6 text-white sm:p-7">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-iris/20 blur-[90px]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="shrink-0">
            <span className="inline-flex items-center gap-2 rounded-full bg-sucesso/15 px-3 py-1 text-xs font-medium text-[#5ED9A0]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#5ED9A0]" /> Seu negócio está crescendo
            </span>
            <p className="mt-3 max-w-xs text-sm text-bruma/55">
              Mais membros e mais receita que a semana passada. Sua próxima ação está logo abaixo.
            </p>
          </div>
          <div className="grid flex-1 grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/[0.06] sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="bg-breu px-4 py-4">
                <p className="font-data text-[10px] uppercase tracking-wider text-bruma/40">
                  {s.label}
                </p>
                <p className="font-display mt-1.5 text-2xl font-extrabold tracking-tight">
                  {s.value}
                </p>
                <div className="mt-1 flex items-center gap-1.5">
                  <span
                    className={cn(
                      "font-data inline-flex items-center gap-0.5 text-[11px]",
                      s.up ? "text-[#5ED9A0]" : "text-bruma/50",
                    )}
                  >
                    {s.up && <ArrowUpRight className="h-3 w-3" />}
                    {s.delta}
                  </span>
                  {s.spark && <Sparkline points={s.spark} />}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Conteúdo principal */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Coluna esquerda (2/3) */}
        <div className="space-y-5 lg:col-span-2">
          {/* Grupos ativos */}
          <Card>
            <CardHead title="Grupos ativos" hint="24 grupos" href="/painel/grupos" />
            <div className="divide-y divide-breu/[0.06]">
              {GROUPS.map((g) => (
                <div
                  key={g.name}
                  className="group flex items-center gap-3 px-5 py-3.5 transition hover:bg-bruma/40"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-iris/10 text-iris">
                    <Users className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-breu">{g.name}</p>
                    <p className="font-data text-[11px] text-aco/55">{g.members} membros</p>
                  </div>
                  <StatusPill status={g.status} />
                  <button className="flex h-8 w-8 items-center justify-center rounded-lg text-aco/40 opacity-0 transition hover:bg-white hover:text-iris group-hover:opacity-100">
                    <Send className="h-4 w-4" />
                  </button>
                  <button className="flex h-8 w-8 items-center justify-center rounded-lg text-aco/40 transition hover:bg-white hover:text-breu">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </Card>

          {/* Agenda de hoje */}
          <Card>
            <CardHead title="Agenda de hoje" hint="3 disparos" href="/painel/campanhas" />
            <div className="space-y-1 p-3">
              {AGENDA.map((a) => {
                const Icon = a.icon;
                return (
                  <div
                    key={a.title}
                    className="flex items-center gap-4 rounded-xl px-2 py-2.5 transition hover:bg-bruma/50"
                  >
                    <span className="font-data w-12 shrink-0 text-sm tabular-nums text-aco/60">
                      {a.time}
                    </span>
                    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-breu text-iris-claro">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-breu">{a.title}</p>
                      <p className="font-data text-[11px] text-aco/55">{a.groups} grupos</p>
                    </div>
                    <span
                      className={cn(
                        "font-data rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wider",
                        a.status === "Ativa"
                          ? "bg-sucesso/10 text-sucesso"
                          : "bg-iris/10 text-iris-escuro",
                      )}
                    >
                      {a.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Coluna direita (1/3) */}
        <div className="space-y-5">
          {/* Crescimento — energia da Rota C */}
          <section className="hf-gradient relative overflow-hidden rounded-3xl p-6 text-white">
            <div className="pointer-events-none absolute -right-10 -bottom-12 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
            <p className="font-data text-[10px] uppercase tracking-[0.2em] text-white/70">
              Crescimento
            </p>
            <p className="mt-3 text-lg font-medium leading-snug">
              Faltam <span className="font-display text-2xl font-extrabold">12</span> pra lotar o
              Atacado Premium SP.
            </p>
            <div className="mt-4">
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/20">
                <div className="h-full w-[96%] rounded-full bg-white" />
              </div>
              <p className="mt-2 flex justify-between font-data text-[11px] text-white/70">
                <span>300 / 312</span>
                <span>96%</span>
              </p>
            </div>
            <button className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white/15 py-2.5 text-sm font-medium text-white backdrop-blur transition hover:bg-white/25">
              Lotar com indicação <ChevronRight className="h-4 w-4" />
            </button>
          </section>

          {/* Meta do mês */}
          <Card>
            <div className="p-5">
              <p className="font-data text-[10px] uppercase tracking-wider text-aco/55">
                Meta do mês · revendedoras novas
              </p>
              <div className="mt-3 flex items-end justify-between">
                <p className="font-display text-3xl font-extrabold tracking-tight text-breu">78</p>
                <p className="font-data pb-1 text-sm text-aco/55">de 120</p>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-bruma">
                <div className="h-full w-[65%] rounded-full bg-iris" />
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-bruma/60 px-3 py-2.5">
                <Clock className="h-4 w-4 text-aco/50" />
                <p className="text-xs text-aco">No ritmo certo pra bater até dia 30.</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ---------- partes ---------- */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-breu/[0.08] bg-white shadow-[0_1px_2px_rgba(11,13,26,0.04)]">
      {children}
    </div>
  );
}

function CardHead({ title, hint, href }: { title: string; hint?: string; href?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-breu/[0.06] px-5 py-4">
      <div className="flex items-center gap-2.5">
        <h2 className="font-display text-base font-bold text-breu">{title}</h2>
        {hint && (
          <span className="font-data rounded-full bg-bruma px-2 py-0.5 text-[10px] uppercase tracking-wider text-aco/55">
            {hint}
          </span>
        )}
      </div>
      {href && (
        <a
          href={href}
          className="font-data inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-iris transition hover:gap-1.5"
        >
          Ver todos <ChevronRight className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: "Ativo" | "Lotado" | "Campanha" | "Atenção" }) {
  const map = {
    Ativo: "bg-sucesso/10 text-sucesso",
    Lotado: "bg-iris/10 text-iris-escuro",
    Campanha: "bg-iris/[0.07] text-iris",
    Atenção: "bg-atencao/10 text-atencao",
  } as const;
  return (
    <span
      className={cn(
        "font-data hidden rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wider sm:inline-block",
        map[status],
      )}
    >
      {status}
    </span>
  );
}

function Sparkline({ points }: { points: number[] }) {
  const w = 48;
  const h = 16;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const step = w / (points.length - 1);
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)} ${(h - ((p - min) / span) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" className="ml-auto">
      <path d={d} stroke="#5ED9A0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
