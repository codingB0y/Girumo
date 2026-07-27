import { Key, Globe, Database, Shield } from "lucide-react";

export default function AdminConfiguracoesPage() {
  const envVars = [
    { key: "SUPABASE_URL", set: !!process.env.SUPABASE_URL, sensitive: false },
    { key: "SUPABASE_ANON_KEY", set: !!process.env.SUPABASE_ANON_KEY, sensitive: true },
    { key: "SUPABASE_SERVICE_ROLE_KEY", set: !!process.env.SUPABASE_SERVICE_ROLE_KEY, sensitive: true },
    { key: "AUTH_SECRET", set: !!process.env.AUTH_SECRET, sensitive: true },
    { key: "ENGINE_TOKEN", set: !!process.env.ENGINE_TOKEN, sensitive: true },
    { key: "NEXT_PUBLIC_SITE_URL", set: !!process.env.NEXT_PUBLIC_SITE_URL, sensitive: false },
    { key: "NEXT_PUBLIC_SALES_WHATSAPP_URL", set: !!process.env.NEXT_PUBLIC_SALES_WHATSAPP_URL, sensitive: false },
    { key: "PLATFORM_ADMIN_EMAILS", set: !!process.env.PLATFORM_ADMIN_EMAILS, sensitive: false },
    { key: "STRIPE_SECRET_KEY", set: !!process.env.STRIPE_SECRET_KEY, sensitive: true },
    { key: "STRIPE_WEBHOOK_SECRET", set: !!process.env.STRIPE_WEBHOOK_SECRET, sensitive: true },
  ];

  return (
    <div className="mx-auto max-w-[1000px] space-y-8">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Configurações</h1>
        <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/55">
          Saúde do ambiente e variáveis de configuração
        </p>
      </div>

      {/* Variáveis de ambiente */}
      <section className="rounded-2xl border border-volt-950/[0.06] bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-volt-950/[0.06] px-6 py-4">
          <Key className="h-5 w-5 text-cobalt-500" />
          <h2 className="font-display text-base font-bold">Variáveis de Ambiente</h2>
        </div>
        <div className="divide-y divide-volt-950/[0.04]">
          {envVars.map((v) => (
            <div key={v.key} className="flex items-center justify-between px-6 py-3.5">
              <div className="flex items-center gap-3">
                {v.sensitive ? (
                  <Shield className="h-4 w-4 text-amber-500" />
                ) : (
                  <Globe className="h-4 w-4 text-aco/40" />
                )}
                <span className="font-data text-sm text-volt-950">{v.key}</span>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 font-data text-[10px] uppercase tracking-wider ${
                  v.set ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                }`}
              >
                {v.set ? "Configurada" : "Ausente"}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Info do sistema */}
      <section className="rounded-2xl border border-volt-950/[0.06] bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-volt-950/[0.06] px-6 py-4">
          <Database className="h-5 w-5 text-cobalt-500" />
          <h2 className="font-display text-base font-bold">Sistema</h2>
        </div>
        <div className="grid gap-4 p-6 sm:grid-cols-2">
          <InfoItem label="Node ENV" value={process.env.NODE_ENV ?? "unknown"} />
          <InfoItem label="Região" value={process.env.VERCEL_REGION ?? process.env.AWS_REGION ?? "local"} />
          <InfoItem label="Runtime" value="Node.js (Next.js App Router)" />
          <InfoItem label="Deploy" value={process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev"} />
        </div>
      </section>

      {/* Admins */}
      <section className="rounded-2xl border border-volt-950/[0.06] bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-volt-950/[0.06] px-6 py-4">
          <Shield className="h-5 w-5 text-alerta" />
          <h2 className="font-display text-base font-bold">Admins da plataforma</h2>
        </div>
        <div className="p-6">
          <p className="text-xs text-aco/55">
            Definidos via variável <code className="rounded bg-canvas-100 px-1.5 py-0.5 font-data text-volt-950">PLATFORM_ADMIN_EMAILS</code> (separados por vírgula).
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {(process.env.PLATFORM_ADMIN_EMAILS ?? "igor@hubflow.com.br")
              .split(",")
              .map((e) => e.trim())
              .filter(Boolean)
              .map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1.5 rounded-full border border-alerta/20 bg-alerta/10 px-3 py-1.5 font-data text-xs text-alerta"
                >
                  <Shield className="h-3 w-3" /> {email}
                </span>
              ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-canvas-100/40 px-4 py-3">
      <p className="font-data text-[10px] uppercase tracking-wider text-aco/50">{label}</p>
      <p className="mt-1 text-sm font-medium text-volt-950">{value}</p>
    </div>
  );
}
