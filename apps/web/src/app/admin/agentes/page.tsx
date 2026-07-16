import {
  Bot,
  Zap,
  MessageSquare,
  TrendingUp,
  Users,
  Shield,
  BarChart3,
  Power,
  PowerOff,
} from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { AdminStatCard } from "@/components/admin/stat-card";

export const dynamic = "force-dynamic";

// Definição dos 22 agentes especializados
const AGENTS_CATALOG = [
  // Atendimento & Vendas
  { id: "sdr", name: "SDR Agent", category: "vendas", description: "Qualificação automática de leads" },
  { id: "sales", name: "Sales Agent", category: "vendas", description: "Follow-up e nutrição de oportunidades" },
  { id: "support", name: "Support Agent", category: "vendas", description: "Atendimento L1 com escalação inteligente" },
  { id: "onboarding", name: "Onboarding Agent", category: "vendas", description: "Guia novos usuários/clientes" },
  { id: "retention", name: "Retention Agent", category: "vendas", description: "Identifica churn e atua proativamente" },
  // Marketing & Comunicação
  { id: "content", name: "Content Agent", category: "marketing", description: "Gera conteúdo para campanhas" },
  { id: "seo", name: "SEO Agent", category: "marketing", description: "Otimiza textos para busca" },
  { id: "social-media", name: "Social Media Agent", category: "marketing", description: "Agenda e cria posts sociais" },
  { id: "email-marketing", name: "Email Marketing Agent", category: "marketing", description: "Cria sequências de email" },
  { id: "copy", name: "Copy Agent", category: "marketing", description: "Copywriting para ads e LPs" },
  // Operações & Dados
  { id: "data-analyst", name: "Data Analyst Agent", category: "operacoes", description: "Análise de métricas e relatórios" },
  { id: "integration", name: "Integration Agent", category: "operacoes", description: "Conecta APIs e sincroniza dados" },
  { id: "workflow", name: "Workflow Agent", category: "operacoes", description: "Cria e otimiza automações" },
  { id: "qa", name: "QA Agent", category: "operacoes", description: "Testa fluxos e reporta bugs" },
  { id: "devops", name: "DevOps Agent", category: "operacoes", description: "Monitora infra e deploys" },
  // Inteligência & Análise
  { id: "sentiment", name: "Sentiment Agent", category: "inteligencia", description: "Análise de sentimento em mensagens" },
  { id: "intent", name: "Intent Agent", category: "inteligencia", description: "Classifica intenção do usuário" },
  { id: "summary", name: "Summary Agent", category: "inteligencia", description: "Resume conversas e reuniões" },
  { id: "recommendation", name: "Recommendation Agent", category: "inteligencia", description: "Sugere ações e próximos passos" },
  { id: "forecast", name: "Forecast Agent", category: "inteligencia", description: "Previsões de vendas e métricas" },
  // Segurança & Compliance
  { id: "compliance", name: "Compliance Agent", category: "seguranca", description: "Verifica LGPD/GDPR em mensagens" },
  { id: "fraud", name: "Fraud Agent", category: "seguranca", description: "Detecta comportamentos suspeitos" },
] as const;

const CATEGORY_LABELS: Record<string, { label: string; icon: typeof Bot; color: string }> = {
  vendas: { label: "Atendimento & Vendas", icon: MessageSquare, color: "text-blue-600 bg-blue-50" },
  marketing: { label: "Marketing & Comunicação", icon: TrendingUp, color: "text-purple-600 bg-purple-50" },
  operacoes: { label: "Operações & Dados", icon: BarChart3, color: "text-amber-600 bg-amber-50" },
  inteligencia: { label: "Inteligência & Análise", icon: Zap, color: "text-emerald-600 bg-emerald-50" },
  seguranca: { label: "Segurança & Compliance", icon: Shield, color: "text-red-600 bg-red-50" },
};

export default async function AdminAgentesPage() {
  const supabase = getSupabaseAdmin();

  // Tentar buscar configurações de agentes por tenant
  const { data: agentConfigs } = await supabase
    .from("agent_configs")
    .select("agent_id, tenant_id, enabled, total_executions, last_execution_at")
    .limit(500);

  const hasConfigs = (agentConfigs ?? []).length > 0;

  // Métricas agregadas
  const totalExecutions = (agentConfigs ?? []).reduce((acc, c) => acc + (c.total_executions ?? 0), 0);
  const activeConfigs = (agentConfigs ?? []).filter((c) => c.enabled).length;
  const uniqueTenants = new Set((agentConfigs ?? []).map((c) => c.tenant_id)).size;

  // Agrupar por categoria
  const categories = Object.entries(CATEGORY_LABELS).map(([key, meta]) => ({
    key,
    ...meta,
    agents: AGENTS_CATALOG.filter((a) => a.category === key),
  }));

  // Map de usage por agente
  const usageByAgent = new Map<string, { tenants: number; executions: number; enabled: number }>();
  for (const config of agentConfigs ?? []) {
    const existing = usageByAgent.get(config.agent_id) ?? { tenants: 0, executions: 0, enabled: 0 };
    existing.tenants++;
    existing.executions += config.total_executions ?? 0;
    if (config.enabled) existing.enabled++;
    usageByAgent.set(config.agent_id, existing);
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Agentes de IA</h1>
        <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/55">
          Monitoramento dos 22 agentes especializados da plataforma
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <AdminStatCard label="Total de Agentes" value={AGENTS_CATALOG.length} icon={Bot} tone="purple" />
        <AdminStatCard label="Ativações" value={activeConfigs} icon={Power} tone="green" />
        <AdminStatCard label="Tenants usando IA" value={uniqueTenants} icon={Users} tone="blue" />
        <AdminStatCard label="Execuções totais" value={totalExecutions} icon={Zap} tone="amber" />
      </div>

      {!hasConfigs && (
        <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-6">
          <div className="flex items-center gap-3">
            <Bot className="h-6 w-6 text-blue-500" />
            <div>
              <p className="text-sm font-medium text-blue-800">Tabela agent_configs ainda não existe</p>
              <p className="mt-0.5 text-xs text-blue-600/70">
                Crie a tabela no Supabase para registrar ativações e métricas de agentes por tenant.
              </p>
            </div>
          </div>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-white/60 p-4 font-data text-xs text-blue-900">
{`create table agent_configs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organizations(id),
  agent_id text not null,
  enabled boolean default true,
  config jsonb default '{}',
  total_executions int default 0,
  last_execution_at timestamptz,
  created_at timestamptz default now(),
  unique(tenant_id, agent_id)
);

create index idx_agent_configs_tenant on agent_configs(tenant_id);
create index idx_agent_configs_agent on agent_configs(agent_id);`}
          </pre>
        </div>
      )}

      {/* Agentes por categoria */}
      <div className="space-y-6">
        {categories.map(({ key, label, icon: Icon, color, agents }) => (
          <section key={key} className="rounded-2xl border border-volt-950/[0.06] bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-volt-950/[0.06] px-5 py-4">
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
                <Icon className="h-4 w-4" />
              </span>
              <h2 className="font-display text-base font-bold">{label}</h2>
              <span className="ml-auto font-data text-[11px] text-aco/50">
                {agents.length} agentes
              </span>
            </div>
            <div className="divide-y divide-volt-950/[0.04]">
              {agents.map((agent) => {
                const usage = usageByAgent.get(agent.id);
                return (
                  <div key={agent.id} className="flex items-center justify-between px-5 py-3.5 transition hover:bg-canvas-100/30">
                    <div className="flex items-center gap-3">
                      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${color}`}>
                        <Bot className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-medium text-volt-950">{agent.name}</p>
                        <p className="font-data text-[11px] text-aco/50">{agent.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {usage ? (
                        <>
                          <div className="text-right">
                            <p className="font-data text-xs text-volt-950">{usage.executions} exec</p>
                            <p className="font-data text-[10px] text-aco/45">{usage.tenants} tenants</p>
                          </div>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-data text-[10px] uppercase tracking-wider ${
                            usage.enabled > 0
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-500"
                          }`}>
                            {usage.enabled > 0 ? (
                              <><Power className="h-3 w-3" /> Ativo</>
                            ) : (
                              <><PowerOff className="h-3 w-3" /> Inativo</>
                            )}
                          </span>
                        </>
                      ) : (
                        <span className="font-data text-[10px] text-aco/40">Sem uso</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
