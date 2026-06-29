import Link from "next/link";
import { ArrowLeft, MousePointerClick } from "lucide-react";
import { Topbar } from "@/components/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getClickAnalytics } from "@/lib/clicks-analytics";

export const dynamic = "force-dynamic";

export default async function LinkDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = await getClickAnalytics(slug);
  const maxDay = Math.max(1, ...a.byDay.map((d) => d.count));
  const maxSrc = Math.max(1, ...a.bySource.map((s) => s.count));

  return (
    <>
      <Topbar title={`/r/${slug}`} subtitle="Analytics do link rastreado" />
      <main className="flex-1 space-y-5 p-6">
        <Link href="/links" className="inline-flex items-center gap-1 text-sm text-aco/70 hover:text-breu">
          <ArrowLeft className="h-4 w-4" />
          Voltar para links
        </Link>

        <Card className="flex items-center gap-3 p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-iris/10 text-iris">
            <MousePointerClick className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-aco/70">Cliques totais</p>
            <p className="text-2xl font-semibold text-breu">{a.total.toLocaleString("pt-BR")}</p>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Cliques por dia</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {a.byDay.length === 0 && <p className="text-sm text-aco/50">Sem cliques ainda.</p>}
              {a.byDay.map((d) => (
                <div key={d.date} className="flex items-center gap-3 text-sm">
                  <span className="w-24 shrink-0 text-aco/70">{d.date}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-bruma">
                    <div className="h-full rounded-full bg-green-500" style={{ width: `${(d.count / maxDay) * 100}%` }} />
                  </div>
                  <span className="w-8 text-right text-aco">{d.count}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Origem (UTM source)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {a.bySource.length === 0 && <p className="text-sm text-aco/50">Sem cliques ainda.</p>}
              {a.bySource.map((s) => (
                <div key={s.source} className="flex items-center gap-3 text-sm">
                  <span className="w-24 shrink-0 truncate text-aco/70">{s.source}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-bruma">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${(s.count / maxSrc) * 100}%` }} />
                  </div>
                  <span className="w-8 text-right text-aco">{s.count}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
