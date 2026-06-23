import { MousePointerClick, UserPlus, TrendingUp, DollarSign, CalendarDays } from "lucide-react";
import { Topbar } from "@/components/topbar";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listLinks, clickCounts } from "@/lib/store";
import { listLeads } from "@/lib/leads-store";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const [links, counts, leads] = await Promise.all([listLinks(), clickCounts(), listLeads()]);
  const totalClicks = Object.values(counts).reduce((s, n) => s + n, 0);
  const entries = leads.length;
  const conv = totalClicks > 0 ? Math.round((entries / totalClicks) * 100) : 0;

  // Cliques por campanha (agregado dos links rastreados) — dado real.
  const byCampaign = new Map<string, number>();
  for (const l of links) {
    const name = l.campaignName || "(sem campanha)";
    byCampaign.set(name, (byCampaign.get(name) ?? 0) + (counts[l.slug] ?? 0));
  }
  const rows = [...byCampaign.entries()]
    .map(([campaign, clicks]) => ({ campaign, clicks }))
    .sort((a, b) => b.clicks - a.clicks);

  return (
    <>
      <Topbar title="Resultados" subtitle="Quanto seu negócio cresceu" />
      <main className="flex-1 space-y-6 p-6">
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
          <CalendarDays className="h-4 w-4 text-slate-400" />
          Acumulado
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Cliques" value={totalClicks.toLocaleString("pt-BR")} icon={MousePointerClick} tone="blue" />
          <StatCard label="Entradas (leads)" value={entries.toLocaleString("pt-BR")} icon={UserPlus} tone="green" />
          <StatCard
            label="Conversão clique→entrada"
            value={`${conv}%`}
            icon={TrendingUp}
            tone="amber"
            hint="estimada (Caminho A)"
          />
          <StatCard label="Investido (anúncios)" value="—" icon={DollarSign} tone="slate" hint="integração Meta pendente" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Cliques por campanha</CardTitle>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">
                Sem cliques ainda. Crie um link rastreado e use como destino do anúncio.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="py-3 pr-4 font-medium">Campanha</th>
                      <th className="py-3 pl-4 font-medium text-right">Cliques</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {rows.map((r) => (
                      <tr key={r.campaign}>
                        <td className="py-3 pr-4 font-medium text-slate-800">{r.campaign}</td>
                        <td className="py-3 pl-4 text-right text-slate-700">{r.clicks.toLocaleString("pt-BR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-slate-400">
          Cliques e entradas são <strong>números reais</strong>. A conversão clique→entrada é{" "}
          <strong>estimada</strong>: pelo Caminho A não dá para cravar que cada entrada veio de um
          clique específico. Investido / custo por lead aparecem quando a integração com o
          Gerenciador de Anúncios estiver ligada.
        </p>
      </main>
    </>
  );
}
