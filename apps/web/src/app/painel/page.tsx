"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Users,
  Clock,
  ChevronRight,
  Megaphone,
  Wifi,
  WifiOff,
  Layers,
  MousePointerClick,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getCampaignGroupStatus } from "@/lib/campaign-groups-overview";
import type { Group } from "@/lib/mock-data";

type Campanha = { id: string; name: string; groupIds: string[]; slug?: string };
type TrackedLink = { clicks: number };
type Schedule = { id: string; campaignName: string; scheduledAt: string; status: string };
type Session = {
  live?: boolean;
  phone?: string | null;
  profileName?: string | null;
  stats?: {
    queue?: { enviadasHoje?: number };
    warmup?: { day?: number; totalDays?: number; todaySent?: number; todayLimit?: number };
  };
};

export default function PainelHoje() {
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [links, setLinks] = useState<TrackedLink[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [session, setSession] = useState<Session>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [c, g, l, sc, s] = await Promise.all([
          fetch("/api/campanhas").then((r) => r.json()).catch(() => []),
          fetch("/api/groups").then((r) => r.json()).catch(() => []),
          fetch("/api/links").then((r) => r.json()).catch(() => []),
          fetch("/api/schedules").then((r) => r.json()).catch(() => []),
          fetch("/api/session").then((r) => r.json()).catch(() => ({})),
        ]);
        setCampanhas(Array.isArray(c) ? c : []);
        setGroups(Array.isArray(g) ? g : []);
        setLinks(Array.isArray(l) ? l : []);
        setSchedules(Array.isArray(sc) ? sc : []);
        setSession(s ?? {});
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalMembers = useMemo(() => groups.reduce((a, g) => a + (g.members ?? 0), 0), [groups]);
  const totalClicks = useMemo(() => links.reduce((a, l) => a + (l.clicks ?? 0), 0), [links]);
  const live = session.live === true;
  const firstName = (session.profileName ?? "").split(" ")[0] || "lojista";

  const upcoming = useMemo(
    () =>
      schedules
        .filter((s) => s.status === "pending")
        .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt))
        .slice(0, 4),
    [schedules],
  );

  // grupo mais perto de lotar (com convite, ainda com vaga)
  const closest = useMemo(() => {
    return groups
      .filter((g) => g.inviteUrl && g.capacity > 0 && g.members < g.capacity)
      .sort((a, b) => b.members / b.capacity - a.members / a.capacity)[0];
  }, [groups]);

  const topGroups = useMemo(
    () => [...groups].sort((a, b) => (b.members ?? 0) - (a.members ?? 0)).slice(0, 5),
    [groups],
  );

  const dateLabel = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  if (loading) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-5 px-4 py-6 sm:px-6">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-white" />
        <div className="h-32 animate-pulse rounded-3xl bg-breu/90" />
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="h-72 animate-pulse rounded-3xl bg-white lg:col-span-2" />
          <div className="h-72 animate-pulse rounded-3xl bg-white" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 sm:px-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold capitalize tracking-[-0.03em]">
            Olá, {firstName} <span className="align-middle">👋</span>
          </h1>
          <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/60">{dateLabel} · visão geral</p>
        </div>
        <Link
          href="/painel/campanhas/nova"
          className="group inline-flex items-center gap-2 rounded-xl bg-iris px-5 py-2.5 text-sm font-medium text-white shadow-iris transition hover:-translate-y-0.5 hover:bg-iris-claro"
        >
          <Plus className="h-4 w-4" /> Nova campanha
        </Link>
      </div>

      {/* Estado do negócio */}
      <section className="relative overflow-hidden rounded-3xl bg-breu p-6 text-white sm:p-7">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-iris/20 blur-[90px]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="shrink-0">
            {live ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-sucesso/15 px-3 py-1 text-xs font-medium text-[#5ED9A0]">
                <Wifi className="h-3.5 w-3.5" /> WhatsApp conectado
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full bg-alerta/15 px-3 py-1 text-xs font-medium text-[#F08C8C]">
                <WifiOff className="h-3.5 w-3.5" /> WhatsApp desconectado
              </span>
            )}
            <p className="mt-3 max-w-xs text-sm text-bruma/55">
              {live
                ? "Tudo rodando. Sua captação está ativa e enchendo os grupos."
                : "Reconecte o WhatsApp pra voltar a captar e disparar."}
            </p>
          </div>
          <div className="grid flex-1 grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/[0.06] sm:grid-cols-4">
            <HeroStat label="Grupos" value={groups.length.toLocaleString("pt-BR")} />
            <HeroStat label="Membros" value={totalMembers.toLocaleString("pt-BR")} />
            <HeroStat label="Campanhas" value={campanhas.length.toLocaleString("pt-BR")} />
            <HeroStat label="Cliques" value={totalClicks.toLocaleString("pt-BR")} />
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Esquerda */}
        <div className="space-y-5 lg:col-span-2">
          {/* Grupos */}
          <Card>
            <CardHead title="Grupos com mais gente" hint={`${groups.length} grupos`} href="/painel/grupos" />
            {topGroups.length === 0 ? (
              <Empty text="Nenhum grupo sincronizado ainda. Conecte o WhatsApp." />
            ) : (
              <div className="divide-y divide-breu/[0.06]">
                {topGroups.map((g) => {
                  const st = getCampaignGroupStatus(g);
                  return (
                    <div key={g.id} className="flex items-center gap-3 px-5 py-3.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-iris/10 text-iris">
                        <Users className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-breu">{g.name}</p>
                        <p className="font-data text-[11px] text-aco/55">
                          {(g.members ?? 0).toLocaleString("pt-BR")} membros
                        </p>
                      </div>
                      <GroupStatusPill status={st} />
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Agenda */}
          <Card>
            <CardHead title="Próximos disparos" hint={`${upcoming.length} agendados`} href="/painel/campanhas" />
            {upcoming.length === 0 ? (
              <Empty text="Nada agendado. Crie uma campanha e agende um disparo." />
            ) : (
              <div className="space-y-1 p-3">
                {upcoming.map((a) => (
                  <div key={a.id} className="flex items-center gap-4 rounded-xl px-2 py-2.5 transition hover:bg-bruma/50">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-breu text-iris-claro">
                      <Megaphone className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-breu">{a.campaignName}</p>
                      <p className="font-data text-[11px] text-aco/55">
                        {new Date(a.scheduledAt).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <span className="font-data rounded-full bg-iris/[0.07] px-2.5 py-1 text-[10px] uppercase tracking-wider text-iris">
                      Agendado
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Direita */}
        <div className="space-y-5">
          {/* Crescimento */}
          {closest ? (
            <section className="hf-gradient relative overflow-hidden rounded-3xl p-6 text-white">
              <div className="pointer-events-none absolute -right-10 -bottom-12 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
              <p className="font-data text-[10px] uppercase tracking-[0.2em] text-white/70">Crescimento</p>
              <p className="mt-3 text-lg font-medium leading-snug">
                Faltam <span className="font-display text-2xl font-extrabold">{Math.max(closest.capacity - closest.members, 0)}</span> pra lotar “{closest.name}”.
              </p>
              <div className="mt-4">
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/20">
                  <div className="h-full rounded-full bg-white" style={{ width: `${Math.round((closest.members / closest.capacity) * 100)}%` }} />
                </div>
                <p className="mt-2 flex justify-between font-data text-[11px] text-white/70">
                  <span>{closest.members.toLocaleString("pt-BR")} / {closest.capacity.toLocaleString("pt-BR")}</span>
                  <span>{Math.round((closest.members / closest.capacity) * 100)}%</span>
                </p>
              </div>
              <Link href="/painel/campanhas" className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white/15 py-2.5 text-sm font-medium text-white backdrop-blur transition hover:bg-white/25">
                Ver campanhas <ChevronRight className="h-4 w-4" />
              </Link>
            </section>
          ) : (
            <Card>
              <div className="p-6 text-center">
                <Layers className="mx-auto h-8 w-8 text-aco/30" />
                <p className="font-display mt-3 text-sm font-bold text-breu">Comece a captar</p>
                <p className="mt-1 text-xs text-aco/60">Crie uma campanha pra encher seus grupos.</p>
                <Link href="/painel/campanhas/nova" className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-iris px-3 py-1.5 text-xs font-medium text-white">
                  <Plus className="h-3.5 w-3.5" /> Nova campanha
                </Link>
              </div>
            </Card>
          )}

          {/* Número / disparos */}
          <Card>
            <div className="p-5">
              <p className="font-data text-[10px] uppercase tracking-wider text-aco/55">Seu número hoje</p>
              <div className="mt-3 flex items-center gap-2">
                {live ? <Wifi className="h-4 w-4 text-sucesso" /> : <WifiOff className="h-4 w-4 text-alerta" />}
                <p className="text-sm font-medium text-breu">{session.phone ?? (live ? "Conectado" : "Desconectado")}</p>
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-bruma/60 px-3 py-2.5">
                <MousePointerClick className="h-4 w-4 text-iris" />
                <p className="text-xs text-aco">
                  <strong className="text-breu">{(session.stats?.queue?.enviadasHoje ?? 0).toLocaleString("pt-BR")}</strong> disparos hoje
                </p>
              </div>
              {session.stats?.warmup?.totalDays ? (
                <div className="mt-3">
                  <p className="font-data flex justify-between text-[11px] text-aco/55">
                    <span>Aquecimento</span>
                    <span>dia {session.stats.warmup.day}/{session.stats.warmup.totalDays}</span>
                  </p>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-bruma">
                    <div className="h-full rounded-full bg-iris" style={{ width: `${Math.round(((session.stats.warmup.day ?? 0) / (session.stats.warmup.totalDays || 1)) * 100)}%` }} />
                  </div>
                </div>
              ) : !live ? (
                <Link href="/painel/conectar" className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-alerta/30 py-2 text-xs font-medium text-alerta transition hover:bg-alerta/10">
                  <WifiOff className="h-3.5 w-3.5" /> Reconectar
                </Link>
              ) : null}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ---------- partes ---------- */

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-breu px-4 py-4">
      <p className="font-data text-[10px] uppercase tracking-wider text-bruma/40">{label}</p>
      <p className="font-display mt-1.5 text-2xl font-extrabold tracking-tight">{value}</p>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-3xl border border-breu/[0.08] bg-white shadow-[0_1px_2px_rgba(11,13,26,0.04)]">{children}</div>;
}

function CardHead({ title, hint, href }: { title: string; hint?: string; href?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-breu/[0.06] px-5 py-4">
      <div className="flex items-center gap-2.5">
        <h2 className="font-display text-base font-bold text-breu">{title}</h2>
        {hint && <span className="font-data rounded-full bg-bruma px-2 py-0.5 text-[10px] uppercase tracking-wider text-aco/55">{hint}</span>}
      </div>
      {href && (
        <a href={href} className="font-data inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-iris transition hover:gap-1.5">
          Ver todos <ChevronRight className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-8 text-sm text-aco/60">
      <Clock className="h-4 w-4 shrink-0 text-aco/30" /> {text}
    </div>
  );
}

function GroupStatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    available: "bg-sucesso/10 text-sucesso",
    full: "bg-iris/10 text-iris-escuro",
    missing_invite: "bg-atencao/10 text-atencao",
    unknown: "bg-bruma text-aco/60",
  };
  const label: Record<string, string> = {
    available: "Ativo",
    full: "Cheio",
    missing_invite: "Sem convite",
    unknown: "—",
  };
  return (
    <span className={cn("font-data hidden rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wider sm:inline-block", map[status] ?? map.unknown)}>
      {label[status] ?? "—"}
    </span>
  );
}
