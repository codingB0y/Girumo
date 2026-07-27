"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AccountSection } from "@/components/painel/account-section";
import { Smartphone, Users, CreditCard, User, ShieldCheck, RefreshCw, Wifi, WifiOff, Check, Loader2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { authenticatedFetch } from "@/lib/supabase/client";

type Section = "Conexão" | "Equipe" | "Plano" | "Conta";
const NAV: { key: Section; icon: typeof Smartphone }[] = [
  { key: "Conexão", icon: Smartphone },
  { key: "Equipe", icon: Users },
  { key: "Plano", icon: CreditCard },
  { key: "Conta", icon: User },
];

type Session = { live?: boolean; phone?: string | null; profileName?: string | null; stats?: { warmup?: { day?: number; totalDays?: number } } };
type Membership = { id: string; role: string; invited_email?: string | null; accepted_at?: string | null };
type Plan = { id: string; code: string; name: string; limits?: Record<string, number | boolean | null>; stripe_price_id?: string | null };
type Subscription = { status?: string; plans?: { name?: string; code?: string } | null; plan?: { name?: string; code?: string } } | null;

export default function PainelConfiguracoes() {
  const [section, setSection] = useState<Section>("Conexão");
  const [session, setSession] = useState<Session>({});
  const [members, setMembers] = useState<Membership[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<Subscription>(null);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/session").then((r) => r.json()).then(setSession).catch(() => {});
    fetch("/api/members").then((r) => r.json()).then((d) => setMembers(Array.isArray(d) ? d : d?.members ?? [])).catch(() => {});
    fetch("/api/plans").then((r) => r.json()).then((d) => setPlans(Array.isArray(d) ? d : [])).catch(() => {});
    authenticatedFetch("/api/subscription").then((r) => (r.ok ? r.json() : null)).then(setSub).catch(() => {});
  }, []);

  const live = session.live === true;
  const currentPlanCode = sub?.plans?.code ?? sub?.plan?.code ?? null;
  const currentPlanName = sub?.plans?.name ?? sub?.plan?.name ?? null;

  async function openCheckout(planCode: string) {
    setBusyPlan(planCode);
    try {
      const res = await authenticatedFetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || "Checkout indisponível.");
      window.location.href = data.url;
    } catch {
      // silently fail
    } finally {
      setBusyPlan(null);
    }
  }

  async function openPortal() {
    setPortalBusy(true);
    try {
      const res = await authenticatedFetch("/api/billing/portal", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) return;
      window.location.href = data.url;
    } catch {
      // silently fail
    } finally {
      setPortalBusy(false);
    }
  }

  async function inviteMember() {
    if (!inviteEmail.trim()) return;
    setInviteBusy(true);
    setInviteError(null);
    try {
      const res = await authenticatedFetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: "operator" }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Erro ao convidar.");
      }
      const newMember = await res.json();
      setMembers((prev) => [...prev, newMember]);
      setInviteEmail("");
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : "Erro ao convidar.");
    } finally {
      setInviteBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-8 px-4 py-8 sm:px-8">
      <header>
        <h1 className="font-display text-[28px] font-extrabold tracking-[-0.02em] text-volt-950">Configurações</h1>
        <p className="font-editorial mt-1 text-[19px] italic text-ardosia">
          Conexão, equipe, plano e conta — tudo num balcão só.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {NAV.map(({ key, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setSection(key)}
              className={cn(
                "inline-flex shrink-0 cursor-pointer items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors duration-[160ms] ease-[var(--ease-fluxo)]",
                section === key ? "bg-volt-950 text-white" : "text-aco/70 hover:bg-poco hover:text-volt-950",
              )}
            >
              <Icon className={cn("h-[18px] w-[18px]", section === key ? "text-white" : "text-aco/50")} strokeWidth={1.75} />
              {key}
            </button>
          ))}
        </nav>

        <div className="min-w-0">
          {section === "Conexão" && (
            <Panel title="Conexão do WhatsApp" desc="O número que capta e dispara nos seus grupos.">
              <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <span className={cn("flex h-12 w-12 items-center justify-center rounded-2xl", live ? "bg-sucesso/10 text-sucesso" : "bg-alerta/10 text-alerta")}>
                    {live ? <Wifi className="h-6 w-6" strokeWidth={1.75} /> : <WifiOff className="h-6 w-6" strokeWidth={1.75} />}
                  </span>
                  <div>
                    <p className="font-display text-base font-bold text-volt-950">{session.phone ?? (live ? "Conectado" : "Sem número")}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-sm text-aco/70">
                      <span className={cn("h-1.5 w-1.5 rounded-full", live ? "bg-sucesso" : "bg-alerta")} />
                      {live ? "Conectado" : "Desconectado"}
                    </p>
                  </div>
                </div>
                <Link
                  href="/painel/conectar"
                  className="inline-flex items-center gap-2 rounded-xl border border-volt-950/15 bg-poco px-4 py-2.5 text-sm font-medium text-volt-950 transition-colors duration-[160ms] ease-[var(--ease-fluxo)] hover:border-cobalt-500 hover:text-cobalt-500"
                >
                  <RefreshCw className="h-4 w-4" strokeWidth={1.75} /> {live ? "Gerenciar" : "Conectar"}
                </Link>
              </div>
              <div className="mt-6 flex items-center gap-3 rounded-2xl bg-poco px-4 py-3.5">
                <ShieldCheck className="h-5 w-5 shrink-0 text-cobalt-500" strokeWidth={1.75} />
                <p className="text-sm text-aco">Número mascarado e dentro da LGPD. Seus contatos são seus.</p>
              </div>
            </Panel>
          )}

          {section === "Equipe" && (
            <Panel title="Equipe" desc="Quem pode operar o balcão com você.">
              {/* Invite form */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="email@exemplo.com"
                  aria-label="Email do convidado"
                  className="w-full rounded-[10px] border border-volt-950/10 bg-poco px-3.5 py-2.5 text-sm text-volt-950 outline-none transition-[border-color,box-shadow] duration-[160ms] ease-[var(--ease-fluxo)] placeholder:text-aco/40 focus:border-cobalt-500/50 focus:bg-papel focus:shadow-[0_0_0_3px_var(--color-cobalt-soft)] sm:w-64"
                  onKeyDown={(e) => e.key === "Enter" && inviteMember()}
                />
                <button
                  onClick={inviteMember}
                  disabled={inviteBusy || !inviteEmail.trim()}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition ease-[var(--ease-fluxo)]",
                    inviteBusy || !inviteEmail.trim() ? "cursor-not-allowed bg-cobalt-500/40" : "bg-cobalt-500 hover:brightness-110",
                  )}
                >
                  {inviteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Convidar
                </button>
              </div>
              {inviteError && <p className="mt-2 text-sm text-alerta">{inviteError}</p>}

              {members.length === 0 ? (
                <p className="font-editorial mt-4 text-[17px] italic text-ardosia">Só você por enquanto. Convide alguém acima.</p>
              ) : (
                <div className="mt-4 divide-y divide-dashed divide-volt-950/[0.09]">
                  {members.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 py-3.5 first:pt-0 last:pb-0">
                      <span className="font-data flex h-9 w-9 items-center justify-center rounded-full bg-cobalt-500/10 text-xs font-medium text-cobalt-500">
                        {(m.invited_email ?? "?").slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-volt-950">{m.invited_email ?? "Membro"}</p>
                        <p className="font-data text-[11px] text-aco/55">{m.accepted_at ? "Ativo" : "Convite pendente"}</p>
                      </div>
                      <span className={cn("font-data rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.06em]", m.role === "owner" ? "bg-cobalt-500/10 text-cobalt-700" : "bg-poco text-aco/60")}>
                        {m.role}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          )}

          {section === "Plano" && (
            <Panel title="Plano e cobrança" desc={currentPlanName ? `Você está no plano ${currentPlanName}.` : "Escolha um plano pra liberar tudo."}>
              {/* Portal button */}
              {currentPlanCode && currentPlanCode !== "FREE" && (
                <div className="mb-4 flex items-center justify-between rounded-2xl bg-poco px-4 py-3">
                  <p className="text-sm text-aco">Gerenciar faturas, método de pagamento ou cancelar:</p>
                  <button
                    onClick={openPortal}
                    disabled={portalBusy}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-volt-950/15 bg-papel px-3 py-2 text-xs font-medium text-volt-950 transition-colors duration-[160ms] ease-[var(--ease-fluxo)] hover:border-cobalt-500 hover:text-cobalt-500"
                  >
                    {portalBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                    Portal Stripe
                  </button>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                {plans.filter((p) => p.code !== "FREE").map((p) => {
                  const atual = p.code === currentPlanCode;
                  return (
                    <div key={p.id} className={cn("rounded-2xl border p-4 text-center", atual ? "border-cobalt-500/40 bg-cobalt-500/[0.05]" : "border-volt-950/[0.08] bg-poco")}>
                      <p className="font-display text-sm font-bold text-volt-950">{p.name}</p>
                      {p.limits && (
                        <p className="font-data mt-1 text-[11px] text-aco/55">
                          {typeof p.limits.campaigns === "number" && p.limits.campaigns > 0
                            ? `${p.limits.campaigns} campanhas`
                            : p.limits.campaigns === -1
                              ? "Campanhas ilimitadas"
                              : ""}
                        </p>
                      )}
                      <button
                        onClick={() => !atual && openCheckout(p.code)}
                        disabled={atual || busyPlan === p.code}
                        className={cn(
                          "mt-3 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-medium transition ease-[var(--ease-fluxo)]",
                          atual
                            ? "cursor-default bg-cobalt-500/10 text-cobalt-500"
                            : busyPlan === p.code
                              ? "cursor-wait bg-cobalt-500/30 text-white"
                              : "border border-volt-950/15 text-volt-950 hover:border-cobalt-500 hover:bg-cobalt-500 hover:text-white",
                        )}
                      >
                        {atual ? (
                          <><Check className="h-3.5 w-3.5" /> Plano atual</>
                        ) : busyPlan === p.code ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          "Assinar"
                        )}
                      </button>
                    </div>
                  );
                })}
                {plans.length === 0 && <p className="font-editorial text-[17px] italic text-ardosia">Carregando planos…</p>}
              </div>
            </Panel>
          )}
          {section === "Conta" && (
            <Panel title="Conta" desc="Seus dados de acesso.">
              <AccountSection />
            </Panel>
          )}
        </div>

      </div>
    </div>
  );
}

function Panel({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="pn-card overflow-hidden rounded-2xl">
      <div className="border-b border-volt-950/[0.06] px-6 py-5">
        <h2 className="font-display text-lg font-bold text-volt-950">{title}</h2>
        {desc && <p className="mt-0.5 text-sm text-aco/65">{desc}</p>}
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}
