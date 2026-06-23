import { headers } from "next/headers";
import NextLink from "next/link";
import { Link2, MousePointerClick, UserPlus, TrendingUp } from "lucide-react";
import { Topbar } from "@/components/topbar";
import { Card } from "@/components/ui/card";
import { NewLinkButton, LinkActions } from "@/components/links-client";
import { listLinks, clickCounts } from "@/lib/store";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function LinksPage() {
  const [links, counts, h] = await Promise.all([listLinks(), clickCounts(), headers()]);

  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const base = `${proto}://${host}`;

  const rows = links
    .map((l) => ({ ...l, clicks: counts[l.slug] ?? 0 }))
    .sort((a, b) => b.clicks - a.clicks);

  const totalClicks = rows.reduce((s, l) => s + l.clicks, 0);

  return (
    <>
      <Topbar title="Origem das entradas" subtitle="De onde cada revendedora veio" />
      <main className="flex-1 space-y-5 p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Summary icon={MousePointerClick} label="Cliques totais (reais)" value={totalClicks.toLocaleString("pt-BR")} />
          <Summary icon={UserPlus} label="Entradas confirmadas" value="—" hint="depende da engine" />
          <Summary icon={TrendingUp} label="Links ativos" value={String(rows.length)} />
        </div>

        <div className="flex justify-end">
          <NewLinkButton />
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-medium">Link</th>
                  <th className="px-5 py-3 font-medium">Grupo destino</th>
                  <th className="px-5 py-3 font-medium">Campanha</th>
                  <th className="px-5 py-3 font-medium text-right">Cliques</th>
                  <th className="px-5 py-3 font-medium">Criado</th>
                  <th className="px-5 py-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Link2 className="h-3.5 w-3.5 text-slate-400" />
                        <NextLink
                          href={`/links/${l.slug}`}
                          className="font-mono text-xs text-slate-700 hover:text-brand-700 hover:underline"
                        >
                          {base}/r/{l.slug}
                        </NextLink>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{l.targetGroupName || "—"}</td>
                    <td className="px-5 py-3 text-slate-600">{l.campaignName || "—"}</td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-900">
                      {l.clicks.toLocaleString("pt-BR")}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-400">{formatDateTime(l.createdAt)}</td>
                    <td className="px-5 py-3">
                      <LinkActions url={`${base}/r/${l.slug}`} />
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-400">
                      Nenhum link ainda. Crie o primeiro em “Novo link”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <p className="text-xs text-slate-400">
          O clique é registrado e contado de verdade ao abrir o link <code>/r/slug</code>, que
          redireciona pro grupo. A coluna “Entradas” fica vazia até a engine do WhatsApp estar
          conectada para confirmar quem realmente entrou.
        </p>
      </main>
    </>
  );
}

function Summary({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Link2;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="flex items-center gap-3 p-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-sm text-slate-500">{label}</p>
        <p className="text-xl font-semibold text-slate-900">{value}</p>
        {hint && <p className="text-xs text-slate-400">{hint}</p>}
      </div>
    </Card>
  );
}
