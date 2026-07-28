import {
  Activity,
  Database,
  HardDrive,
  Key,
  Server,
  Shield,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";

export const dynamic = "force-dynamic";

type HealthResponse = {
  service: string;
  status: "ok" | "degraded";
  timestamp: string;
  checks: {
    env: Record<string, boolean>;
    stripePrices: Record<string, boolean>;
    database: "ok" | "degraded";
    databaseError: string | null;
    planCount: number;
    storage: "ok" | "degraded";
    storageError: string | null;
  };
};

async function fetchHealth(): Promise<HealthResponse | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/health`, {
      cache: "no-store",
    });
    return res.json();
  } catch {
    return null;
  }
}

export default async function AdminSaudePage() {
  const health = await fetchHealth();

  if (!health) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-6">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Saúde da Plataforma</h1>
          <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/55">
            Não foi possível conectar ao endpoint de health check
          </p>
        </div>
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50 py-12">
          <XCircle className="h-10 w-10 text-red-500" />
          <p className="text-sm font-medium text-red-700">Health check indisponível</p>
          <p className="text-xs text-red-600/70">Verifique se NEXT_PUBLIC_APP_URL está configurada e se o servidor está rodando.</p>
        </div>
      </div>
    );
  }

  const { checks } = health;
  const envEntries = Object.entries(checks.env);
  const stripeEntries = Object.entries(checks.stripePrices);

  const envConfigured = envEntries.filter(([, v]) => v).length;
  const envTotal = envEntries.length;
  const stripeConfigured = stripeEntries.filter(([, v]) => v).length;
  const stripeTotal = stripeEntries.length;

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Saúde da Plataforma</h1>
          <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/55">
            Diagnóstico em tempo real — {new Date(health.timestamp).toLocaleString("pt-BR")}
          </p>
        </div>
        <OverallBadge status={health.status} />
      </div>

      {/* Status geral */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatusCard
          label="Status Geral"
          status={health.status}
          icon={Server}
          detail={health.service}
        />
        <StatusCard
          label="Database"
          status={checks.database}
          icon={Database}
          detail={checks.databaseError ?? `${checks.planCount} planos cadastrados`}
        />
        <StatusCard
          label="Storage"
          status={checks.storage}
          icon={HardDrive}
          detail={checks.storageError ?? "Bucket uploads OK"}
        />
        <StatusCard
          label="Env Vars"
          status={envConfigured === envTotal ? "ok" : "degraded"}
          icon={Key}
          detail={`${envConfigured}/${envTotal} configuradas`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Variáveis de ambiente */}
        <section className="rounded-2xl border border-volt-950/[0.06] bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-volt-950/[0.06] px-5 py-4">
            <Shield className="h-4 w-4 text-cobalt-500" />
            <h2 className="font-display text-base font-bold">Variáveis de Ambiente</h2>
            <span className="ml-auto font-data text-[11px] text-aco/50">
              {envConfigured}/{envTotal}
            </span>
          </div>
          <div className="divide-y divide-volt-950/[0.04]">
            {envEntries.map(([key, configured]) => (
              <div key={key} className="flex items-center justify-between px-5 py-3">
                <span className="font-data text-xs text-volt-950">{key}</span>
                <EnvBadge configured={configured} />
              </div>
            ))}
          </div>
        </section>

        {/* Stripe Prices */}
        <section className="rounded-2xl border border-volt-950/[0.06] bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-volt-950/[0.06] px-5 py-4">
            <Activity className="h-4 w-4 text-cobalt-500" />
            <h2 className="font-display text-base font-bold">Stripe Price IDs</h2>
            <span className="ml-auto font-data text-[11px] text-aco/50">
              {stripeConfigured}/{stripeTotal}
            </span>
          </div>
          <div className="divide-y divide-volt-950/[0.04]">
            {stripeEntries.map(([plan, configured]) => (
              <div key={plan} className="flex items-center justify-between px-5 py-3">
                <span className="font-data text-xs text-volt-950">{plan}</span>
                <EnvBadge configured={configured} />
              </div>
            ))}
          </div>
          {stripeTotal === 0 && (
            <p className="px-5 py-6 text-center text-xs text-aco/50">Nenhum price configurado.</p>
          )}
        </section>
      </div>

      {/* Erros detectados */}
      {(checks.databaseError || checks.storageError) && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-center gap-3 pb-3">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <h2 className="font-display text-base font-bold text-amber-800">Problemas Detectados</h2>
          </div>
          <div className="space-y-2">
            {checks.databaseError && (
              <div className="rounded-xl bg-white/60 px-4 py-3">
                <p className="font-data text-[11px] uppercase tracking-wider text-amber-700">Database</p>
                <p className="mt-1 font-data text-xs text-amber-900">{checks.databaseError}</p>
              </div>
            )}
            {checks.storageError && (
              <div className="rounded-xl bg-white/60 px-4 py-3">
                <p className="font-data text-[11px] uppercase tracking-wider text-amber-700">Storage</p>
                <p className="mt-1 font-data text-xs text-amber-900">{checks.storageError}</p>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function OverallBadge({ status }: { status: "ok" | "degraded" }) {
  if (status === "ok") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 font-data text-xs font-medium uppercase tracking-wider text-emerald-700">
        <CheckCircle2 className="h-4 w-4" /> Operacional
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-4 py-2 font-data text-xs font-medium uppercase tracking-wider text-amber-700">
      <AlertTriangle className="h-4 w-4" /> Degradado
    </span>
  );
}

function StatusCard({
  label,
  status,
  icon: Icon,
  detail,
}: {
  label: string;
  status: "ok" | "degraded";
  icon: typeof Server;
  detail: string;
}) {
  const isOk = status === "ok";
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${
      isOk ? "border-emerald-100 bg-white" : "border-amber-200 bg-amber-50/30"
    }`}>
      <div className="flex items-center justify-between">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${
          isOk ? "bg-emerald-50 text-emerald-600" : "bg-amber-100 text-amber-600"
        }`}>
          <Icon className="h-5 w-5" />
        </span>
        {isOk ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-amber-500" />
        )}
      </div>
      <p className="mt-3 text-sm font-semibold text-volt-950">{label}</p>
      <p className="mt-0.5 font-data text-[11px] text-aco/55 truncate" title={detail}>{detail}</p>
    </div>
  );
}

function EnvBadge({ configured }: { configured: boolean }) {
  if (configured) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-data text-[10px] uppercase tracking-wider text-emerald-700">
        <CheckCircle2 className="h-3 w-3" /> OK
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 font-data text-[10px] uppercase tracking-wider text-red-600">
      <XCircle className="h-3 w-3" /> Ausente
    </span>
  );
}
