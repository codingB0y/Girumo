import "server-only";
import Link from "next/link";
import { CheckCircle2, Circle, ArrowRight, Rocket, PartyPopper } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession, isLive } from "@/lib/session-store";
import { listGroups } from "@/lib/groups-store";
import { listLeads } from "@/lib/leads-store";
import { listLinks } from "@/lib/store";
import { listOrders } from "@/lib/orders-store";
import { referralsColl } from "@/lib/referrals-store";
import { collection } from "@/lib/json-collection";
import type { AdCampaign, Campaign } from "@/lib/mock-data";

type Step = { label: string; help: string; cta: string; href: string; done: boolean };

/**
 * Onboarding self-service (A2): guia o lojista do zero até a 1ª venda registrada
 * (o "aha"). NÃO inventa dado — lê os sinais reais. Mostra barra de progresso e
 * destaca a PRÓXIMA ação única com botão. Some sozinho quando tudo conclui.
 */
export async function OnboardingChecklist() {
  const [session, groups, links, leads, ads, refs, broadcasts, orders] = await Promise.all([
    getSession(),
    listGroups(),
    listLinks(),
    listLeads(),
    collection<AdCampaign>("ad-campaigns.json").list(),
    referralsColl.list(),
    collection<Campaign>("broadcasts.json").list(),
    listOrders(),
  ]);

  const steps: Step[] = [
    { label: "Conectar o WhatsApp", help: "Rode a engine e escaneie o QR Code — leva 2 minutos.", cta: "Conectar", href: "/settings", done: isLive(session) },
    { label: "Sincronizar seus grupos", help: "A engine puxa os grupos onde você é admin.", cta: "Ver grupos", href: "/groups", done: groups.length > 0 },
    { label: "Atrair revendedora nova", help: "Monte um anúncio pronto ou gere um link de indicação.", cta: "Atrair agora", href: "/acquisition", done: ads.length > 0 || refs.length > 0 || links.length > 0 },
    { label: "Captar a 1ª revendedora", help: "Quando alguém entra no grupo, aparece aqui automático.", cta: "Ver revendedoras", href: "/leads", done: leads.length > 0 },
    { label: "Enviar a 1ª oferta", help: "Escolha um modelo e dispare pros seus grupos.", cta: "Criar oferta", href: "/campaigns", done: broadcasts.length > 0 },
    { label: "Registrar o 1º pedido", help: "Marque uma venda — é assim que você mede o resultado de verdade.", cta: "Registrar pedido", href: "/leads", done: orders.length > 0 },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null; // tudo pronto → some
  const pct = Math.round((doneCount / steps.length) * 100);
  const nextIdx = steps.findIndex((s) => !s.done);

  const titulo =
    doneCount === 0
      ? "Bora começar! 3 passos e seu grupo já está vendendo"
      : doneCount >= steps.length - 1
        ? "Falta só 1 passo pra vender no automático 🚀"
        : "Você está no caminho — continue ativando";

  return (
    <Card className="border-brand-200 bg-brand-50/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Rocket className="h-4 w-4 text-brand-600" />
            {titulo}
          </CardTitle>
          <span className="text-xs font-medium text-slate-500">{doneCount}/{steps.length}</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/70">
          <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-emerald-400 transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {steps.map((s, i) => {
          const isNext = i === nextIdx;
          return (
            <Link
              key={s.label}
              href={s.href}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${
                isNext ? "bg-white shadow-card ring-1 ring-brand-200" : "hover:bg-white/70"
              }`}
            >
              {s.done ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
              ) : (
                <Circle className={`h-5 w-5 shrink-0 ${isNext ? "text-brand-500" : "text-slate-300"}`} />
              )}
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${s.done ? "text-slate-400 line-through" : isNext ? "text-slate-900" : "text-slate-500"}`}>
                  {s.label}
                </p>
                {isNext && <p className="text-xs text-slate-500">{s.help}</p>}
              </div>
              {isNext && (
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-b from-brand-500 to-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-brand">
                  {s.cta}
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              )}
            </Link>
          );
        })}
        {doneCount >= 1 && nextIdx === steps.length - 1 && (
          <p className="flex items-center justify-center gap-1.5 pt-2 text-xs text-brand-600">
            <PartyPopper className="h-3.5 w-3.5" /> Quase lá! Esse último passo destrava seu painel de resultados.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
