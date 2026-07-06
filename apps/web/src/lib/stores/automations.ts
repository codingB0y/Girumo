import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type AutomationTrigger = "lead_entered" | "signup" | "no_connect_24h" | "trial_ending" | "group_full";
type AutomationStepType = "message" | "wait" | "condition";

export type AutomationStep = {
  id: string;
  type: AutomationStepType;
  delay_minutes: number; // 0 = imediato, 60 = 1h, 1440 = 1 dia
  message?: string;
  media_id?: string | null;
  condition?: string | null;
};

export type Automation = {
  id: string;
  tenant_id: string;
  name: string;
  trigger: AutomationTrigger;
  enabled: boolean;
  steps: AutomationStep[];
  total_runs: number;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
};

const TABLE = "automations";

export async function listAutomations(tenantId: string): Promise<Automation[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createAutomation(
  tenantId: string,
  input: {
    name: string;
    trigger: AutomationTrigger;
    steps: AutomationStep[];
  },
): Promise<Automation> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .insert({
      tenant_id: tenantId,
      name: input.name,
      trigger: input.trigger,
      enabled: true,
      steps: input.steps,
      total_runs: 0,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateAutomation(
  tenantId: string,
  id: string,
  patch: Partial<Pick<Automation, "name" | "trigger" | "enabled" | "steps">>,
): Promise<Automation | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteAutomation(tenantId: string, id: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Templates pré-configurados para o lojista começar rápido.
 */
export const AUTOMATION_TEMPLATES: { name: string; trigger: AutomationTrigger; steps: Omit<AutomationStep, "id">[] }[] = [
  {
    name: "Boas-vindas ao grupo",
    trigger: "lead_entered",
    steps: [
      { type: "wait", delay_minutes: 5, message: undefined },
      { type: "message", delay_minutes: 0, message: "👋 Oi! Bem-vind(a) ao grupo! Aqui você recebe as melhores ofertas em primeira mão. Fique à vontade!" },
    ],
  },
  {
    name: "Nurturing 3 dias",
    trigger: "lead_entered",
    steps: [
      { type: "wait", delay_minutes: 5, message: undefined },
      { type: "message", delay_minutes: 0, message: "👋 Bem-vind(a)! Preparamos ofertas exclusivas pra quem é do grupo." },
      { type: "wait", delay_minutes: 1440, message: undefined }, // 1 dia
      { type: "message", delay_minutes: 0, message: "🔥 Já viu as novidades de hoje? Chama no privado pra garantir!" },
      { type: "wait", delay_minutes: 2880, message: undefined }, // 2 dias
      { type: "message", delay_minutes: 0, message: "✨ Novos produtos chegando! Fique de olho aqui no grupo." },
    ],
  },
  {
    name: "Lembrete: conectar WhatsApp",
    trigger: "no_connect_24h",
    steps: [
      { type: "message", delay_minutes: 0, message: "Oi! Vi que você ainda não conectou seu WhatsApp no HubFlow. Leva 2 minutos — é só escanear o QR Code nas configurações." },
    ],
  },
  {
    name: "Trial acabando",
    trigger: "trial_ending",
    steps: [
      { type: "message", delay_minutes: 0, message: "⏰ Seu trial do HubFlow termina em 2 dias! Assine agora pra não perder seus grupos e campanhas." },
    ],
  },
];
