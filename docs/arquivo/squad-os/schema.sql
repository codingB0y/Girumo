-- Squad OS — DDL das tabelas como estavam em producao, capturado em 25/08/2026
-- antes da remocao. Gerado de pg_attribute/pg_constraint do banco de prod
-- (nidoatbxaylrkcgbszns). Ver README.md para o contexto.
--
-- `tenant_webhooks` entra aqui por conveniencia: nao e do Squad OS, mas foi
-- removida no mesmo passo por estar igualmente orfa (0 linhas, nenhum leitor).

create table if not exists public.agent_skills (
  agent_id uuid not null,
  skill_id uuid not null,
  proficiency integer default 50,
  constraint agent_skills_pkey PRIMARY KEY (agent_id, skill_id)
);

create table if not exists public.agents (
  id uuid default gen_random_uuid() not null,
  workspace_id uuid not null,
  name text not null,
  specialty text not null,
  avatar_url text,
  cost_per_run numeric default 0,
  speed_rating integer default 5,
  context_window integer default 128000,
  reputation integer default 50,
  allowed_areas text[] default '{}'::text[],
  limits jsonb default '{}'::jsonb,
  history jsonb default '[]'::jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint agents_pkey PRIMARY KEY (id)
);

create table if not exists public.artifacts (
  id uuid default gen_random_uuid() not null,
  mission_id uuid,
  workspace_id uuid not null,
  type text not null,
  title text not null,
  content jsonb not null,
  version integer default 1,
  score integer,
  created_at timestamp with time zone default now(),
  constraint artifacts_pkey PRIMARY KEY (id)
);

create table if not exists public.decisions (
  id uuid default gen_random_uuid() not null,
  workspace_id uuid not null,
  product_id uuid,
  squad_id uuid,
  title text not null,
  rationale text,
  category text,
  confidence integer default 70,
  status text default 'active'::text,
  superseded_by uuid,
  created_at timestamp with time zone default now(),
  constraint decisions_pkey PRIMARY KEY (id)
);

create table if not exists public.handoffs (
  id uuid default gen_random_uuid() not null,
  workspace_id uuid not null,
  from_squad_id uuid,
  to_squad_id uuid,
  mission_id uuid,
  context jsonb not null,
  status text default 'pending'::text,
  created_at timestamp with time zone default now(),
  constraint handoffs_pkey PRIMARY KEY (id)
);

create table if not exists public.knowledge (
  id uuid default gen_random_uuid() not null,
  workspace_id uuid not null,
  category text not null,
  title text not null,
  content text not null,
  tags text[] default '{}'::text[],
  score integer default 50,
  version integer default 1,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint knowledge_pkey PRIMARY KEY (id)
);

create table if not exists public.memories (
  id uuid default gen_random_uuid() not null,
  workspace_id uuid not null,
  layer text not null,
  category text,
  content text not null,
  source text,
  confidence integer default 50,
  usage_count integer default 0,
  impact_score integer default 0,
  score integer default LEAST(100, (((confidence + LEAST((usage_count * 2), 50)) + impact_score) / 3)),
  expires_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint memories_pkey PRIMARY KEY (id)
);

create table if not exists public.missions (
  id uuid default gen_random_uuid() not null,
  squad_id uuid,
  workspace_id uuid not null,
  title text not null,
  description text,
  status text default 'pending'::text,
  priority integer default 3,
  assigned_agent_id uuid,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  result jsonb default '{}'::jsonb,
  created_at timestamp with time zone default now(),
  constraint missions_pkey PRIMARY KEY (id)
);

create table if not exists public.skills (
  id uuid default gen_random_uuid() not null,
  workspace_id uuid not null,
  name text not null,
  category text not null,
  description text,
  roi_score integer default 50,
  token_cost integer default 0,
  when_to_use text,
  when_to_avoid text,
  compatibility text[] default '{}'::text[],
  config jsonb default '{}'::jsonb,
  created_at timestamp with time zone default now(),
  constraint skills_pkey PRIMARY KEY (id)
);

create table if not exists public.squad_agents (
  squad_id uuid not null,
  agent_id uuid not null,
  role text default 'member'::text,
  joined_at timestamp with time zone default now(),
  constraint squad_agents_pkey PRIMARY KEY (squad_id, agent_id)
);

create table if not exists public.squads (
  id uuid default gen_random_uuid() not null,
  workspace_id uuid not null,
  product_id uuid,
  name text not null,
  slug text not null,
  leader_agent_id uuid,
  objective text,
  status text default 'planning'::text,
  health integer default 100,
  context jsonb default '{}'::jsonb,
  last_delivery text,
  next_action text,
  reputation_score integer default 50,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint squads_pkey PRIMARY KEY (id)
);

create table if not exists public.tenant_webhooks (
  id uuid default gen_random_uuid() not null,
  tenant_id uuid not null,
  type text default 'whatsapp'::text not null,
  phone text,
  enabled boolean default true,
  events text[] default ARRAY['group_full'::text, 'lead_hot'::text, 'broadcast_failed'::text],
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint tenant_webhooks_pkey PRIMARY KEY (id)
);
