import { Users, UserPlus, ShoppingBag, CalendarDays, Megaphone, Snowflake, Trophy } from "lucide-react";
import { Topbar } from "@/components/topbar";
import { StatCard } from "@/components/stat-card";
import { HealthCard } from "@/components/health-card";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listGroups } from "@/lib/groups-store";
import { listLeads } from "@/lib/leads-store";
import { formatDateTime, cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Meta semanal de entradas (B3). Fixa por ora — vira config no backend depois.
const WEEKLY_GOAL = 50;
// Dias sem entrada para considerar um grupo "parado" (B5).
const COLD_DAYS = 3;

const DAY_MS = 86_400_000;

export default async function DashboardPage() {
  const [groups, leads] = await Promise.all([listGroups(), listLeads()]);

  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();
  const weekMs = now - 7 * DAY_MS;

  const entradasHoje = leads.filter((l) => new Date(l.enteredAt).getTime() >= todayMs).length;
  const entradasSemana = leads.filter((l) => new Date(l.enteredAt).getTime() >= weekMs).length;
  const compraram = leads.filter((l) => l.status === "comprou").length;
  const goalPct = Math.min(100, Math.round((entradasSemana / WEEKLY_GOAL) * 100));

  // B5 — última entrada por grupo (casando pelo nome que a engine envia).
  // B1 — total de entradas por grupo (ranking).
  const lastEntryByGroup = new Map<string, number>();
  const countByGroup = new Map<string, number>();
  for (const l of leads) {
    const t = new Date(l.enteredAt).getTime();
    if (!lastEntryByGroup.has(l.sourceGroup) || t > lastEntryByGroup.get(l.sourceGroup)!) {
      lastEntryByGroup.set(l.sourceGroup, t);
    }
    countByGroup.set(l.sourceGroup, (countByGroup.get(l.sourceGroup) ?? 0) + 1);
  }
  const ranking = groups
    .map((g) => ({ ...g, entries: countByGroup.get(g.name) ?? 0 }))
    .sort((a, b) => b.entries - a.entries)
    .slice(0, 5);
  const maxEntries = Math.max(1, ...ranking.map((r) => r.entries));
  const coldGroups = groups
    .map((g) => {
      const last = lastEntryByGroup.get(g.name);
      const days = last ? Math.floor((now - last) / DAY_MS) : null;
      return { ...g, coldDays: days };
    })
    .filter((g) => g.coldDays === null || g.coldDays >= COLD_DAYS);

  return (
    <>
      <Topbar title="Visão geral" subtitle="Como anda o seu negócio" />
      <main className="flex-1 space-y-6 p-6">
        <OnboardingChecklist />

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Entraram hoje" value={entradasHoje} icon={UserPlus} tone="green" />
          <StatCard
            label="Entradas na semana"
            value={`${entradasSemana} / ${WEEKLY_GOAL}`}
            icon={CalendarDays}
            tone="blue"
            hint={`Meta semanal · ${goalPct}%`}
          />
          <StatCard
            label="Compraram"
            value={compraram}
            icon={ShoppingBag}
            tone="amber"
            hint="Entrada ≠ venda — marque no painel de leads"
          />
          <StatCard label="Grupos conectados" value={groups.length} icon={Users} tone="slate" />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Entradas recentes (leads reais) */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Entradas recentes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {leads.length === 0 && (
                <EmptyState icon={UserPlus} text="Nenhuma entrada ainda. Conecte a engine e lote um grupo." />
              )}
              {leads.slice(0, 8).map((l) => (
                <div key={l.id} className="flex items-center justify-between rounded-lg border border-bruma p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-iris/10 text-iris">
                      <UserPlus className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-breu">{l.name}</p>
                      <p className="text-xs text-aco/50">{l.sourceGroup}</p>
                    </div>
                  </div>
                  <span className="text-xs text-aco/50">{formatDateTime(l.enteredAt)}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Saúde do número (stats reais da engine) */}
          <HealthCard />
        </div>

        {groups.length > 0 && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Ranking de grupos por entradas (B1) */}
            <Card>
              <CardHeader className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-400" />
                  Top grupos por entradas
                </CardTitle>
                <span className="text-xs text-aco/50">Acumulado</span>
              </CardHeader>
              <CardContent className="space-y-3">
                {ranking.every((r) => r.entries === 0) ? (
                  <p className="py-4 text-center text-sm text-aco/50">
                    Nenhuma entrada registrada ainda.
                  </p>
                ) : (
                  ranking.map((g, i) => (
                    <div key={g.id}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 font-medium text-aco">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-bruma text-xs text-aco/70">
                            {i + 1}
                          </span>
                          {g.name}
                        </span>
                        <span className="text-aco/50">{g.entries} entradas</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-bruma">
                        <div
                          className="h-full rounded-full bg-amber-400"
                          style={{ width: `${Math.round((g.entries / maxEntries) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Grupos parados (B5) */}
            <Card>
              <CardHeader className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Snowflake className="h-4 w-4 text-blue-400" />
                  Grupos parados
                </CardTitle>
                <span className="text-xs text-aco/50">Sem entradas há {COLD_DAYS}+ dias</span>
              </CardHeader>
              <CardContent className="space-y-2">
              {coldGroups.length === 0 ? (
                <p className="py-4 text-center text-sm text-aco/50">
                  Nenhum grupo parado — todos receberam entradas nos últimos {COLD_DAYS} dias. 👏
                </p>
              ) : (
                coldGroups.map((g) => (
                  <div key={g.id} className="flex items-center justify-between rounded-lg border border-bruma p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-500">
                        <Megaphone className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-breu">{g.name}</p>
                        <p className="text-xs text-aco/50">{g.members} membros</p>
                      </div>
                    </div>
                    <Badge tone="blue">
                      {g.coldDays === null ? "sem entradas ainda" : `frio há ${g.coldDays} dia${g.coldDays > 1 ? "s" : ""}`}
                    </Badge>
                  </div>
                ))
              )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Lotação dos grupos reais */}
        <Card>
          <CardHeader>
            <CardTitle>Lotação dos grupos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {groups.length === 0 && (
              <EmptyState icon={Megaphone} text="Nenhum grupo sincronizado. Rode a engine para sincronizar." />
            )}
            {groups.map((g) => {
              const pct = Math.round((g.members / g.capacity) * 100);
              const full = pct >= 100;
              return (
                <div key={g.id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-aco">{g.name}</span>
                    <span className={full ? "text-red-500" : "text-aco/50"}>
                      {g.members}/{g.capacity} {full && "• cheio"}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-bruma">
                    <div
                      className={cn("h-full rounded-full", full ? "bg-red-500" : "bg-green-500")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </main>
    </>
  );
}

function EmptyState({ icon: Icon, text }: { icon: typeof UserPlus; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <Icon className="h-8 w-8 text-aco/30" />
      <p className="max-w-xs text-sm text-aco/50">{text}</p>
    </div>
  );
}
