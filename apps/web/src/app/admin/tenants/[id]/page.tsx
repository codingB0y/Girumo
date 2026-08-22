import { Users, CreditCard, Mail, Shield, ArrowLeft, Smartphone, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { TenantActions } from "@/components/admin/tenant-actions";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function AdminTenantDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  // Buscar organização
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id, name, slug, created_at, created_by, status")
    .eq("id", id)
    .single();

  // PGRST116 = "0 linhas" no `.single()`, ou seja, tenant realmente não existe.
  // Qualquer outro erro é falha de consulta: devolver 404 nesse caso afirmaria
  // que o tenant não existe sem ter conseguido olhar (auditoria 22/08, B.1).
  if (orgError && orgError.code !== "PGRST116") {
    console.error(`[admin/tenants/${id}] falha ao carregar organization:`, orgError.message);
    throw new Error(`Falha ao carregar o tenant: ${orgError.message}`);
  }

  if (!org) notFound();

  // Membros
  const { data: memberships, error: membershipsError } = await supabase
    .from("memberships")
    .select("user_id, role, accepted_at, created_at")
    .eq("tenant_id", id)
    .not("accepted_at", "is", null);

  if (membershipsError) {
    console.error(`[admin/tenants/${id}] falha ao carregar memberships:`, membershipsError.message);
  }

  // Buscar info dos users
  const userIds = (memberships ?? []).map((m) => m.user_id);
  const { data: usersData, error: usersError } = userIds.length > 0
    ? await supabase.from("users").select("auth_user_id, name, email").in("auth_user_id", userIds)
    : { data: [], error: null };

  if (usersError) {
    console.error(`[admin/tenants/${id}] falha ao carregar users:`, usersError.message);
  }

  const userMap = new Map<string, { name: string; email: string }>();
  for (const u of usersData ?? []) {
    userMap.set(u.auth_user_id, { name: u.name, email: u.email });
  }

  // Subscription
  const { data: subs, error: subsError } = await supabase
    .from("subscriptions")
    .select("id, status, plan_id, created_at")
    .eq("tenant_id", id)
    .order("created_at", { ascending: false })
    .limit(5);

  if (subsError) {
    console.error(`[admin/tenants/${id}] falha ao carregar subscriptions:`, subsError.message);
  }

  const { data: plans, error: plansError } = await supabase
    .from("plans")
    .select("id, code, name, price_cents");

  if (plansError) {
    console.error(`[admin/tenants/${id}] falha ao carregar plans:`, plansError.message);
  }

  const planMap = new Map<string, { code: string; name: string; price_cents: number }>();
  for (const p of plans ?? []) {
    planMap.set(p.id, { code: p.code, name: p.name, price_cents: p.price_cents });
  }

  // Instâncias
  const { data: instances, error: instancesError } = await supabase
    .from("instances")
    .select("id, phone, status, profile_name, last_seen_at")
    .eq("tenant_id", id)
    .limit(10);

  if (instancesError) {
    console.error(`[admin/tenants/${id}] falha ao carregar instances:`, instancesError.message);
  }

  // Cada seção sinaliza a própria falha em vez de renderizar como se estivesse
  // vazia: "sem membros" e "não consegui ler os membros" são coisas diferentes.
  const falhas = [
    membershipsError || usersError ? "membros" : null,
    subsError || plansError ? "assinatura" : null,
    instancesError ? "instâncias" : null,
  ].filter((v): v is string => v !== null);

  const isSuspended = org.status === "suspended";

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      {falhas.length > 0 && (
        <div
          role="alert"
          data-estado="erro"
          className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
          <div>
            <p className="text-sm font-semibold text-red-700">
              Esta página está incompleta.
            </p>
            <p className="mt-0.5 text-xs text-red-700/80">
              Falha ao carregar: {falhas.join(", ")}. As seções afetadas aparecem vazias, mas o
              conteúdo real é desconhecido — não trate como ausência de dado.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-4">
        <Link
          href="/admin/tenants"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-volt-950/10 bg-white text-aco transition hover:border-cobalt-500/30"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-extrabold tracking-tight">{org.name}</h1>
            {isSuspended && (
              <span className="rounded-full bg-red-50 px-2.5 py-1 font-data text-[10px] uppercase tracking-wider text-red-600">
                Suspenso
              </span>
            )}
          </div>
          <p className="font-data mt-0.5 text-xs uppercase tracking-wider text-aco/55">
            {org.slug} · Criado em {new Date(org.created_at).toLocaleDateString("pt-BR")}
          </p>
        </div>
      </div>

      {/* Ações administrativas */}
      <section className="rounded-2xl border border-volt-950/[0.06] bg-white p-5 shadow-sm">
        <h2 className="font-display mb-4 text-base font-bold">Ações</h2>
        <TenantActions
          tenantId={org.id}
          tenantName={org.name}
          currentStatus={org.status ?? "active"}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Membros */}
        <section className="rounded-2xl border border-volt-950/[0.06] bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-volt-950/[0.06] px-5 py-4">
            <Users className="h-4 w-4 text-cobalt-500" />
            <h2 className="font-display text-base font-bold">Membros ({(memberships ?? []).length})</h2>
          </div>
          <div className="divide-y divide-volt-950/[0.04]">
            {(memberships ?? []).map((m) => {
              const user = userMap.get(m.user_id);
              return (
                <div key={m.user_id} className="flex items-center justify-between px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 font-data text-xs font-bold text-blue-600">
                      {(user?.name ?? "U").slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-volt-950">{user?.name ?? m.user_id}</p>
                      <p className="flex items-center gap-1 font-data text-[11px] text-aco/50">
                        <Mail className="h-3 w-3" /> {user?.email ?? "—"}
                      </p>
                    </div>
                  </div>
                  <RoleBadge role={m.role} />
                </div>
              );
            })}
            {(memberships ?? []).length === 0 && (
              <p className="px-5 py-6 text-center text-sm text-aco/50">Nenhum membro.</p>
            )}
          </div>
        </section>

        {/* Subscription */}
        <section className="rounded-2xl border border-volt-950/[0.06] bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-volt-950/[0.06] px-5 py-4">
            <CreditCard className="h-4 w-4 text-cobalt-500" />
            <h2 className="font-display text-base font-bold">Assinaturas</h2>
          </div>
          <div className="divide-y divide-volt-950/[0.04]">
            {(subs ?? []).map((s) => {
              const plan = planMap.get(s.plan_id);
              return (
                <div key={s.id} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <p className="text-sm font-medium text-volt-950">{plan?.name ?? plan?.code ?? "—"}</p>
                    <p className="font-data text-[11px] text-aco/50">
                      {plan?.price_cents
                        ? `R$ ${(plan.price_cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/mês`
                        : "Grátis"}
                    </p>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
              );
            })}
            {(subs ?? []).length === 0 && (
              <p className="px-5 py-6 text-center text-sm text-aco/50">Nenhuma assinatura.</p>
            )}
          </div>
        </section>

        {/* Instâncias WhatsApp */}
        <section className="rounded-2xl border border-volt-950/[0.06] bg-white shadow-sm lg:col-span-2">
          <div className="flex items-center gap-2 border-b border-volt-950/[0.06] px-5 py-4">
            <Smartphone className="h-4 w-4 text-cobalt-500" />
            <h2 className="font-display text-base font-bold">Instâncias WhatsApp</h2>
          </div>
          <div className="divide-y divide-volt-950/[0.04]">
            {(instances ?? []).map((inst) => (
              <div key={inst.id} className="flex items-center justify-between px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <Smartphone className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-volt-950">{inst.phone ?? "—"}</p>
                    <p className="font-data text-[11px] text-aco/50">{inst.profile_name ?? "sem nome"}</p>
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-1 font-data text-[10px] uppercase tracking-wider ${
                  inst.status === "connected" || inst.status === "online"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-red-50 text-red-600"
                }`}>
                  {inst.status}
                </span>
              </div>
            ))}
            {(instances ?? []).length === 0 && (
              <p className="px-5 py-6 text-center text-sm text-aco/50">Nenhuma instância conectada.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    owner: "bg-amber-50 text-amber-700",
    admin: "bg-purple-50 text-purple-700",
    operator: "bg-slate-100 text-slate-600",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-data text-[10px] uppercase tracking-wider ${styles[role] ?? "bg-slate-100 text-slate-500"}`}>
      <Shield className="h-3 w-3" /> {role}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700",
    trialing: "bg-blue-50 text-blue-700",
    free: "bg-slate-100 text-slate-600",
    canceled: "bg-red-50 text-red-600",
    past_due: "bg-amber-50 text-amber-700",
  };
  const labels: Record<string, string> = {
    active: "Ativo",
    trialing: "Trial",
    free: "Free",
    canceled: "Cancelado",
    past_due: "Inadimplente",
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 font-data text-[10px] uppercase tracking-wider ${styles[status] ?? "bg-slate-100 text-slate-500"}`}>
      {labels[status] ?? status}
    </span>
  );
}
