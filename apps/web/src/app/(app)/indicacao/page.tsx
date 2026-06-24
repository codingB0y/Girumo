"use client";

import { useEffect, useState } from "react";
import { Gift, Trophy, Link2, Copy, Check, Trash2, MessageCircle, Users2, Save } from "lucide-react";
import { Topbar } from "@/components/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Group } from "@/lib/mock-data";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/toast";

type Referral = {
  id: string;
  referrerName: string;
  group: string;
  slug: string;
  inviteUrl: string;
  cliques: number;
  entradas: number;
  atingiu: boolean;
};
type Config = { reward: string; goal: number };

export default function IndicacaoPage() {
  const toast = useToast();
  const [origin, setOrigin] = useState("");
  const [ranking, setRanking] = useState<Referral[]>([]);
  const [config, setConfig] = useState<Config>({ reward: "", goal: 3 });
  const [groups, setGroups] = useState<Group[]>([]);
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false); // 1º fetch do ranking (skeleton até lá)

  useEffect(() => {
    setOrigin(window.location.origin);
    load();
    fetch("/api/groups").then((r) => r.json()).then((g: Group[]) => {
      setGroups(g);
      if (g.length) setGroupId(g[0].id);
    }).catch(() => {});
  }, []);

  async function load() {
    try {
      const d = await fetch("/api/referrals").then((r) => r.json());
      setRanking(d.ranking ?? []);
      setConfig(d.config ?? { reward: "", goal: 3 });
    } catch {
    } finally {
      setLoaded(true);
    }
  }

  async function saveConfig() {
    await fetch("/api/referrals/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    toast("Recompensa salva");
    load();
  }

  async function gerar() {
    const group = groups.find((g) => g.id === groupId);
    if (!name.trim() || !group) {
      toast("Informe o nome e o grupo", "error");
      return;
    }
    if (!/^https?:\/\//i.test(inviteUrl.trim())) {
      toast("Cole o link de convite do grupo", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referrerName: name.trim(), group: group.name, inviteUrl: inviteUrl.trim() }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Erro");
      }
      setName("");
      setInviteUrl("");
      await load();
      toast("Link pessoal gerado 🎁");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remover esta indicação?")) return;
    await fetch(`/api/referrals?id=${id}`, { method: "DELETE" });
    load();
  }

  function shareMessage(r: Referral) {
    const link = `${origin}/r/${r.slug}`;
    return (
      `Oi ${r.referrerName}! 💜 Tô com uma campanha de indicação:\n` +
      `Indique amigas revendedoras pro nosso grupo VIP e ganhe *${config.reward}*.\n` +
      `É só compartilhar o SEU link com elas:\n${link}\n` +
      `Quando ${config.goal} entrarem pelo seu link, o prêmio é seu! 🎁`
    );
  }

  return (
    <>
      <Topbar title="Indicação premiada" subtitle="Revendedora traz revendedora — gente nova sem anúncio" />
      <main className="grid flex-1 grid-cols-1 gap-6 p-6 xl:grid-cols-5">
        {/* Ranking */}
        <div className="space-y-3 xl:col-span-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            <h2 className="font-semibold text-slate-900">Ranking de quem mais traz</h2>
          </div>

          {!loaded &&
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={`sk-${i}`} className="p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-9 w-9 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              </Card>
            ))}
          {loaded && ranking.length === 0 && (
            <Card className="p-8 text-center text-sm text-slate-400">
              Nenhuma indicação ainda. Gere o link pessoal de uma revendedora ao lado e mande pra ela.
            </Card>
          )}

          {ranking.map((r, i) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold ${i === 0 && r.entradas > 0 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                    {i === 0 && r.entradas > 0 ? "🏆" : i + 1}
                  </div>
                  <div>
                    <p className="flex items-center gap-1.5 font-medium text-slate-900">
                      {r.referrerName}
                      {r.atingiu && (
                        <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700 ring-1 ring-inset ring-green-600/15">
                          ganhou o prêmio 🎁
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400">{r.group}</p>
                  </div>
                </div>
                <button onClick={() => remove(r.id)} className="text-slate-300 hover:text-red-500" title="Remover">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-center">
                <div>
                  <p className="text-lg font-bold text-slate-900">{r.entradas}</p>
                  <p className="text-[11px] text-slate-400">entradas (prováveis)</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-brand-600">{r.cliques}</p>
                  <p className="text-[11px] text-slate-400">cliques no link</p>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <div className="flex flex-1 items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                  <Link2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="flex-1 truncate font-mono text-xs text-slate-500">{origin}/r/{r.slug}</span>
                </div>
                <CopyBtn label="Link" text={`${origin}/r/${r.slug}`} onCopy={() => toast("Link copiado")} />
                <CopyBtn
                  label="Mensagem"
                  icon={<MessageCircle className="h-3.5 w-3.5" />}
                  text={shareMessage(r)}
                  onCopy={() => toast("Mensagem copiada — mande pra ela")}
                />
              </div>
            </Card>
          ))}
        </div>

        {/* Config + gerar */}
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gift className="h-4 w-4 text-brand-500" />
                A recompensa
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Prêmio para quem indicar</label>
                <Input value={config.reward} onChange={(e) => setConfig({ ...config, reward: e.target.value })} placeholder="Ex: Frete grátis no próximo pedido" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Quantas indicações para ganhar</label>
                <Input type="number" min={1} value={config.goal} onChange={(e) => setConfig({ ...config, goal: Number(e.target.value) })} />
              </div>
              <Button variant="outline" className="w-full" onClick={saveConfig}>
                <Save className="h-4 w-4" />
                Salvar recompensa
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users2 className="h-4 w-4 text-brand-500" />
                Gerar link de uma revendedora
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Nome da revendedora</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Maria" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Grupo de destino</label>
                <select
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/15"
                >
                  {groups.length === 0 && <option>Conecte a engine</option>}
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Link de convite do grupo</label>
                <Input value={inviteUrl} onChange={(e) => setInviteUrl(e.target.value)} placeholder="https://chat.whatsapp.com/..." />
              </div>
              <Button className="w-full" onClick={gerar} disabled={saving}>
                {saving ? "Gerando..." : "Gerar link pessoal"}
              </Button>
              <p className="text-center text-xs text-slate-400">
                Depois é só copiar a <strong>mensagem</strong> no ranking e mandar pra ela compartilhar.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}

function CopyBtn({ text, onCopy, label, icon }: { text: string; onCopy: () => void; label: string; icon?: React.ReactNode }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setDone(true);
        onCopy();
        setTimeout(() => setDone(false), 1500);
      }}
      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-medium text-slate-600 transition hover:border-brand-300 hover:text-brand-700"
    >
      {done ? <Check className="h-3.5 w-3.5" /> : (icon ?? <Copy className="h-3.5 w-3.5" />)}
      {label}
    </button>
  );
}
