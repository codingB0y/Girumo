// ============================================================
// SQUAD OS — Type Definitions
// ============================================================

export type SquadStatus =
  | "planning"
  | "researching"
  | "executing"
  | "validating"
  | "blocked"
  | "completed";

export type MissionStatus =
  | "pending"
  | "active"
  | "validating"
  | "completed"
  | "failed";

export type MemoryLayer =
  | "L1_operational"
  | "L2_project"
  | "L3_reusable"
  | "L4_strategic";

export type ArtifactType =
  | "prd"
  | "ux_flow"
  | "wireframe"
  | "code"
  | "report"
  | "brand"
  | "roadmap"
  | "backlog";

export type SkillCategory =
  | "research"
  | "product"
  | "design"
  | "code"
  | "growth"
  | "ops"
  | "data";

// ---------- Entities ----------

export interface Squad {
  id: string;
  product_id: string;
  workspace_id: string;
  name: string;
  slug: string;
  leader_agent_id: string | null;
  objective: string;
  status: SquadStatus;
  health: number; // 0-100
  context: Record<string, unknown>;
  last_delivery: string | null;
  next_action: string | null;
  reputation_score: number;
  created_at: string;
  updated_at: string;
  // Joined
  agents?: Agent[];
  missions?: Mission[];
  leader?: Agent;
}

export interface Agent {
  id: string;
  workspace_id: string;
  name: string;
  specialty: string;
  avatar_url: string | null;
  cost_per_run: number;
  speed_rating: number; // 1-10
  context_window: number;
  reputation: number; // 0-100
  allowed_areas: string[];
  limits: Record<string, unknown>;
  history: Record<string, unknown>[];
  created_at: string;
  updated_at: string;
  // Joined
  skills?: Skill[];
}

export interface Skill {
  id: string;
  workspace_id: string;
  name: string;
  category: SkillCategory;
  description: string;
  roi_score: number;
  token_cost: number;
  when_to_use: string;
  when_to_avoid: string;
  compatibility: string[];
  config: Record<string, unknown>;
  created_at: string;
}

export interface Mission {
  id: string;
  squad_id: string;
  workspace_id: string;
  title: string;
  description: string;
  status: MissionStatus;
  priority: number; // 1=critical, 5=low
  assigned_agent_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  result: Record<string, unknown>;
  created_at: string;
  // Joined
  assigned_agent?: Agent;
  artifacts?: Artifact[];
}

export interface Artifact {
  id: string;
  mission_id: string;
  workspace_id: string;
  type: ArtifactType;
  title: string;
  content: Record<string, unknown>;
  version: number;
  score: number | null;
  created_at: string;
}

export interface Decision {
  id: string;
  workspace_id: string;
  product_id: string | null;
  squad_id: string | null;
  title: string;
  rationale: string;
  category: string;
  confidence: number; // 0-100
  status: "active" | "superseded" | "revoked";
  superseded_by: string | null;
  created_at: string;
}

export interface Memory {
  id: string;
  workspace_id: string;
  layer: MemoryLayer;
  category: string;
  content: string;
  source: string | null;
  confidence: number;
  usage_count: number;
  impact_score: number;
  score: number;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Handoff {
  id: string;
  workspace_id: string;
  from_squad_id: string;
  to_squad_id: string;
  mission_id: string;
  context: Record<string, unknown>;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
}

// ---------- UI helpers ----------

export const SQUAD_STATUS_CONFIG: Record<
  SquadStatus,
  { label: string; color: string; bg: string }
> = {
  planning: { label: "Planejando", color: "text-iris", bg: "bg-iris/10" },
  researching: { label: "Pesquisando", color: "text-blue-600", bg: "bg-blue-50" },
  executing: { label: "Executando", color: "text-amber-600", bg: "bg-amber-50" },
  validating: { label: "Validando", color: "text-purple-600", bg: "bg-purple-50" },
  blocked: { label: "Bloqueado", color: "text-alerta", bg: "bg-alerta/10" },
  completed: { label: "Concluído", color: "text-sucesso", bg: "bg-sucesso/10" },
};

export const MISSION_STATUS_CONFIG: Record<
  MissionStatus,
  { label: string; color: string; bg: string }
> = {
  pending: { label: "Pendente", color: "text-aco", bg: "bg-bruma" },
  active: { label: "Ativa", color: "text-amber-600", bg: "bg-amber-50" },
  validating: { label: "Validando", color: "text-purple-600", bg: "bg-purple-50" },
  completed: { label: "Concluída", color: "text-sucesso", bg: "bg-sucesso/10" },
  failed: { label: "Falhou", color: "text-alerta", bg: "bg-alerta/10" },
};

export const MEMORY_LAYER_CONFIG: Record<
  MemoryLayer,
  { label: string; description: string; ttl: string }
> = {
  L1_operational: {
    label: "Operacional",
    description: "Tasks e status — vida curta",
    ttl: "7 dias",
  },
  L2_project: {
    label: "Projeto",
    description: "Arquitetura e decisões — vida média",
    ttl: "90 dias",
  },
  L3_reusable: {
    label: "Reutilizável",
    description: "Playbooks e padrões — vida longa",
    ttl: "1 ano",
  },
  L4_strategic: {
    label: "Estratégico",
    description: "Benchmark e vantagens — permanente",
    ttl: "Permanente",
  },
};
