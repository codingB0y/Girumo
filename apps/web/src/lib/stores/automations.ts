import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type AutomationTrigger =
  | "lead_entered"
  | "signup"
  | "group_full"
  | "weekly_recurring"
  | "group_stalled"
  // Retirados da tela do lojista (P0.7): lifecycle do SaaS, vive em lib/email + cron.
  | "no_connect_24h"
  | "trial_ending";

/** Triggers de lifecycle do SaaS — nunca oferecidos como template pro lojista. */
export const RETIRED_LOJISTA_TRIGGERS: AutomationTrigger[] = ["no_connect_24h", "trial_ending"];
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
 *
 * REGRA ANTI-BAN (durável, decisão Igor 2026-07-28): nenhum template envia
 * mensagem no privado (DM) — toda mensagem é postada NOS GRUPOS.
 */
export const AUTOMATION_TEMPLATES: { name: string; trigger: AutomationTrigger; steps: Omit<AutomationStep, "id">[] }[] = [
  {
    name: "Boas-vindas no grupo",
    trigger: "lead_entered",
    steps: [
      { type: "wait", delay_minutes: 5, message: undefined },
      { type: "message", delay_minutes: 0, message: "Bem-vindo(a) quem chegou agora! 👋 Aqui você vê as novidades primeiro. Pedido mínimo, catálogo e horários fixados no grupo." },
    ],
  },
  {
    name: "Novidade da semana",
    trigger: "weekly_recurring",
    steps: [
      { type: "message", delay_minutes: 0, message: "Chegou grade nova essa semana — olha as peças acima pra não perder as melhores." },
    ],
  },
  {
    name: "Grupo lotou",
    trigger: "group_full",
    steps: [
      { type: "message", delay_minutes: 0, message: "Um dos seus grupos lotou! Crie o próximo pra manter a captação rodando sem perder gente na fila." },
    ],
  },
  {
    name: "Reativação de grupo parado",
    trigger: "group_stalled",
    steps: [
      { type: "message", delay_minutes: 0, message: "Semana de reposição: o que esgotou voltou. Pedidos por ordem de chegada." },
    ],
  },
];
