"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Gift,
  Link2,
  MousePointerClick,
  Plus,
  Target,
  Trash2,
  Trophy,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { authenticatedFetch } from "@/lib/supabase/client";

/** Espelha o `ranking` de `GET /api/referrals`. */
type Ranked = {
  id: string;
  referrerName: string;
  group: string;
  slug: string;
  /** Caminho do link pessoal já pronto (`/r/<slug>`) — não montar isso na tela. */
  path: string;
  inviteUrl: string;
  cliques: number;
  atingiu: boolean;
};

type Config = {
  reward: string;
  goal: number;
  updated_at?: string;
};

const CONFIG_FALLBACK: Config = { reward: "Frete grátis no próximo pedido", goal: 3 };

async function readError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  const message = body && typeof body.error === "string" ? body.error : "";
  return message || fallback;
}

export default function PainelIndicacao() {
  const [ranking, setRanking] = useState<Ranked[]>([]);
  const [config, setConfig] = useState<Config>(CONFIG_FALLBACK);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [reward, setReward] = useState(CONFIG_FALLBACK.reward);
  const [goal, setGoal] = useState(String(CONFIG_FALLBACK.goal));
  const [savingConfig, setSavingConfig] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configSaved, setConfigSaved] = useState(false);

  const [copied, setCopied] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await authenticatedFetch("/api/referrals");
      if (!res.ok) throw new Error(await readError(res, "Não foi possível carregar as indicações."));
      // A rota devolve `{ config, ranking }`. A tela antiga testava
      // `Array.isArray()` nessa resposta — que é objeto — então a lista ficava
      // vazia mesmo com indicações cadastradas.
      const data = (await res.json()) as { config?: Config; ranking?: Ranked[] };
      const cfg = data.config ?? CONFIG_FALLBACK;
      setConfig(cfg);
      setReward(cfg.reward);
      setGoal(String(cfg.goal));
      setRanking(Array.isArray(data.ranking) ? data.ranking : []);
    } catch (e) {
      // Sem isto a falha vira "nenhuma indicadora ainda": tela idêntica à de quem
      // realmente não tem nenhuma, e ninguém descobre que a chamada quebrou.
      setLoadError(e instanceof Error ? e.message : "Não foi possível carregar as indicações.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    void load();
  }, [load]);

  const totals = useMemo(
    () => ({
      pessoas: ranking.length,
      cliques: ranking.reduce((acc, r) => acc + r.cliques, 0),
      bateram: ranking.filter((r) => r.atingiu).length,
    }),
    [ranking],
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    setFormError(null);
    try {
      const res = await authenticatedFetch("/api/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referrerName: name.trim(),
          group: group.trim(),
          inviteUrl: inviteUrl.trim(),
        }),
      });
      if (!res.ok) throw new Error(await readError(res, "Não foi possível criar o link."));
      setName("");
      setGroup("");
      setInviteUrl("");
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Não foi possível criar o link.");
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (savingConfig) return;
    setSavingConfig(true);
    setConfigError(null);
    setConfigSaved(false);
    try {
      const res = await authenticatedFetch("/api/referrals/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reward: reward.trim(), goal: Number(goal) }),
      });
      if (!res.ok) throw new Error(await readError(res, "Não foi possível salvar."));
      const saved = (await res.json()) as Config;
      setConfig(saved);
      setReward(saved.reward);
      setGoal(String(saved.goal));
      // A meta mudou: quem bateu e quem não bateu muda junto.
      setRanking((prev) => prev.map((r) => ({ ...r, atingiu: r.cliques >= saved.goal })));
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 2500);
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleRemove(item: Ranked) {
    if (removing) return;
    if (!window.confirm(`Apagar o link de ${item.referrerName}? Ele para de funcionar na hora.`)) return;
    setRemoving(item.id);
    try {
      const res = await authenticatedFetch(`/api/referrals?id=${encodeURIComponent(item.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await readError(res, "Não foi possível apagar."));
      setRanking((prev) => prev.filter((r) => r.id !== item.id));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Não foi possível apagar.");
    } finally {
      setRemoving(null);
    }
  }

  async function handleCopy(item: Ranked) {
    const url = `${origin}${item.path}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(item.id);
      setTimeout(() => setCopied((cur) => (cur === item.id ? null : cur)), 2000);
    } catch {
      // Clipboard bloqueado (http, permissão negada): mostrar o link cru é
      // melhor do que um botão que pisca e não copia nada.
      window.prompt("Copie o link:", url);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-5 px-4 py-6 sm:px-6">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-white" />
        <div className="h-48 animate-pulse rounded-3xl bg-white" />
        <div className="h-32 animate-pulse rounded-3xl bg-white" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">Indicação</h1>
        <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/60">
          Suas clientes trazem gente pro grupo e ganham recompensa
        </p>
      </div>

      {loadError && (
        <p className="rounded-2xl border border-alerta/25 bg-alerta/[0.06] px-4 py-3 text-sm text-alerta">
          {loadError}
        </p>
      )}

      {/* Regra do programa — recompensa e meta, editáveis */}
      <section className="relative overflow-hidden rounded-3xl bg-volt-950 p-6 text-white sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-cobalt-500/20 blur-[80px]" />
        <div className="relative">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-cobalt-500" />
            <span className="font-data text-[10px] uppercase tracking-[0.2em] text-canvas-100/50">
              Programa de indicação
            </span>
          </div>
          <h2 className="font-display mt-3 text-2xl font-extrabold">
            Quem trouxer {config.goal} {config.goal === 1 ? "clique" : "cliques"} ganha {config.reward}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-canvas-100/60">
            Cadastre uma cliente e ela recebe um link só dela. Quem clicar cai direto no seu grupo, e o
            clique fica no nome de quem indicou.
          </p>

          <form onSubmit={handleSaveConfig} className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1">
              <span className="font-data block text-[10px] uppercase tracking-wider text-canvas-100/40">
                Recompensa
              </span>
              <input
                value={reward}
                onChange={(e) => setReward(e.target.value)}
                maxLength={120}
                placeholder="Frete grátis no próximo pedido"
                className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-4 py-2.5 text-sm text-white placeholder:text-canvas-100/30 focus:border-cobalt-500/60 focus:outline-none"
              />
            </label>
            <label className="sm:w-32">
              <span className="font-data block text-[10px] uppercase tracking-wider text-canvas-100/40">
                Meta (cliques)
              </span>
              <input
                type="number"
                min={1}
                max={1000}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-4 py-2.5 text-sm text-white focus:border-cobalt-500/60 focus:outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={savingConfig}
              className="h-[42px] rounded-xl bg-cobalt-500 px-5 text-sm font-semibold text-white transition hover:bg-cobalt-700 disabled:opacity-50"
            >
              {savingConfig ? "Salvando…" : configSaved ? "Salvo" : "Salvar"}
            </button>
          </form>
          {configError && <p className="mt-2 text-xs text-alerta">{configError}</p>}
        </div>
      </section>

      {/* Cadastro de indicadora */}
      <section className="rounded-3xl border border-volt-950/[0.08] bg-white p-5 sm:p-6">
        <h2 className="font-display text-base font-bold text-volt-950">Nova indicadora</h2>
        <p className="mt-1 text-xs text-aco/60">
          O link de convite é o do seu grupo no WhatsApp — é pra lá que o clique vai.
        </p>
        <form onSubmit={handleCreate} className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_1.4fr_auto]">
          <label>
            <span className="font-data block text-[10px] uppercase tracking-wider text-aco/55">Nome</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={80}
              placeholder="Ana"
              className="mt-1.5 w-full rounded-xl border border-volt-950/[0.12] px-4 py-2.5 text-sm focus:border-cobalt-500 focus:outline-none"
            />
          </label>
          <label>
            <span className="font-data block text-[10px] uppercase tracking-wider text-aco/55">Grupo</span>
            <input
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              required
              maxLength={120}
              placeholder="Ofertas 01"
              className="mt-1.5 w-full rounded-xl border border-volt-950/[0.12] px-4 py-2.5 text-sm focus:border-cobalt-500 focus:outline-none"
            />
          </label>
          <label>
            <span className="font-data block text-[10px] uppercase tracking-wider text-aco/55">
              Link de convite
            </span>
            <input
              value={inviteUrl}
              onChange={(e) => setInviteUrl(e.target.value)}
              required
              type="url"
              maxLength={500}
              placeholder="https://chat.whatsapp.com/..."
              className="mt-1.5 w-full rounded-xl border border-volt-950/[0.12] px-4 py-2.5 text-sm focus:border-cobalt-500 focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={creating}
            className="mt-auto flex h-[42px] items-center justify-center gap-1.5 rounded-xl bg-volt-950 px-5 text-sm font-semibold text-white transition hover:bg-volt-900 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {creating ? "Criando…" : "Criar link"}
          </button>
        </form>
        {formError && <p className="mt-3 text-xs text-alerta">{formError}</p>}
      </section>

      <div className="grid grid-cols-3 gap-4">
        <StatCard icon={Users} label="Indicadoras" value={totals.pessoas} />
        <StatCard icon={MousePointerClick} label="Cliques" value={totals.cliques} />
        <StatCard icon={Trophy} label="Bateram a meta" value={totals.bateram} />
      </div>

      {ranking.length > 0 ? (
        <section className="overflow-hidden rounded-3xl border border-volt-950/[0.08] bg-white">
          <div className="flex items-center justify-between border-b border-volt-950/[0.06] px-5 py-4">
            <h2 className="font-display text-base font-bold text-volt-950">Ranking</h2>
            <span className="font-data text-[10px] uppercase tracking-wider text-aco/50">
              Por cliques no link
            </span>
          </div>
          <div className="divide-y divide-volt-950/[0.06]">
            {ranking.map((item, i) => (
              <div
                key={item.id}
                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={cn(
                      "font-data flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold",
                      item.atingiu ? "bg-sucesso/10 text-sucesso" : "bg-cobalt-500/10 text-cobalt-500",
                    )}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-volt-950">{item.referrerName}</p>
                    <p className="truncate font-data text-[11px] text-aco/55">{item.group}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => handleCopy(item)}
                    title={`${origin}${item.path}`}
                    className="flex items-center gap-1.5 rounded-xl border border-volt-950/[0.12] px-3 py-2 font-data text-[11px] text-aco/70 transition hover:border-cobalt-500/50 hover:text-cobalt-500"
                  >
                    {copied === item.id ? (
                      <Check className="h-3.5 w-3.5 text-sucesso" />
                    ) : (
                      <Link2 className="h-3.5 w-3.5" />
                    )}
                    <span className="max-w-[220px] truncate">{item.path}</span>
                    {copied !== item.id && <Copy className="h-3 w-3 opacity-60" />}
                  </button>

                  <span className="font-data text-xs text-aco/60">
                    {item.cliques} {item.cliques === 1 ? "clique" : "cliques"}
                  </span>

                  {item.atingiu ? (
                    <span className="rounded-full bg-sucesso/10 px-2.5 py-1 font-data text-[10px] uppercase tracking-wider text-sucesso">
                      Bateu a meta
                    </span>
                  ) : (
                    <span className="font-data text-[10px] uppercase tracking-wider text-aco/45">
                      faltam {config.goal - item.cliques}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => handleRemove(item)}
                    disabled={removing === item.id}
                    aria-label={`Apagar indicação de ${item.referrerName}`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-aco/40 transition hover:bg-alerta/10 hover:text-alerta disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="border-t border-volt-950/[0.06] bg-canvas-100/40 px-5 py-3 text-[11px] text-aco/55">
            <Target className="mr-1 inline h-3 w-3" />
            Contamos os cliques no link, que é o que dá pra medir com certeza. A entrada no grupo acontece
            dentro do WhatsApp e não volta identificada pra cá.
          </p>
        </section>
      ) : (
        <section className="rounded-3xl border border-volt-950/[0.08] bg-white p-8 text-center">
          <Gift className="mx-auto h-10 w-10 text-aco/25" />
          <p className="font-display mt-3 text-sm font-bold text-volt-950">Nenhuma indicadora ainda</p>
          <p className="mt-1 text-xs text-aco/60">
            Cadastre a primeira acima. Ela recebe um link só dela e você vê quantas pessoas trouxe.
          </p>
        </section>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Gift; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-volt-950/[0.08] bg-white p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-cobalt-500" />
        <span className="font-data text-[10px] uppercase tracking-wider text-aco/55">{label}</span>
      </div>
      <p className="font-display mt-2 text-2xl font-extrabold text-volt-950">{value}</p>
    </div>
  );
}
