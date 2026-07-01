-- ============================================================
-- SQUAD OS — Database Schema (Supabase Migration)
-- Run this in Supabase SQL Editor when ready to go live
-- ============================================================

-- SQUAD
CREATE TABLE IF NOT EXISTS squads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  product_id UUID,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  leader_agent_id UUID,
  objective TEXT,
  status TEXT DEFAULT 'planning'
    CHECK (status IN ('planning', 'researching', 'executing', 'validating', 'blocked', 'completed')),
  health INTEGER DEFAULT 100 CHECK (health >= 0 AND health <= 100),
  context JSONB DEFAULT '{}',
  last_delivery TEXT,
  next_action TEXT,
  reputation_score INTEGER DEFAULT 50,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- AGENT
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  name TEXT NOT NULL,
  specialty TEXT NOT NULL,
  avatar_url TEXT,
  cost_per_run NUMERIC DEFAULT 0,
  speed_rating INTEGER DEFAULT 5 CHECK (speed_rating >= 1 AND speed_rating <= 10),
  context_window INTEGER DEFAULT 128000,
  reputation INTEGER DEFAULT 50 CHECK (reputation >= 0 AND reputation <= 100),
  allowed_areas TEXT[] DEFAULT '{}',
  limits JSONB DEFAULT '{}',
  history JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- SQUAD <-> AGENT (many-to-many)
CREATE TABLE IF NOT EXISTS squad_agents (
  squad_id UUID REFERENCES squads(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('leader', 'member', 'advisor')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (squad_id, agent_id)
);

-- FK for squad leader
ALTER TABLE squads ADD CONSTRAINT fk_squad_leader
  FOREIGN KEY (leader_agent_id) REFERENCES agents(id);

-- SKILL
CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL
    CHECK (category IN ('research', 'product', 'design', 'code', 'growth', 'ops', 'data')),
  description TEXT,
  roi_score INTEGER DEFAULT 50,
  token_cost INTEGER DEFAULT 0,
  when_to_use TEXT,
  when_to_avoid TEXT,
  compatibility TEXT[] DEFAULT '{}',
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- AGENT <-> SKILL (many-to-many)
CREATE TABLE IF NOT EXISTS agent_skills (
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  skill_id UUID REFERENCES skills(id) ON DELETE CASCADE,
  proficiency INTEGER DEFAULT 50 CHECK (proficiency >= 0 AND proficiency <= 100),
  PRIMARY KEY (agent_id, skill_id)
);

-- MISSION
CREATE TABLE IF NOT EXISTS missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id UUID REFERENCES squads(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'validating', 'completed', 'failed')),
  priority INTEGER DEFAULT 3 CHECK (priority >= 1 AND priority <= 5),
  assigned_agent_id UUID REFERENCES agents(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ARTIFACT
CREATE TABLE IF NOT EXISTS artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID REFERENCES missions(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  type TEXT NOT NULL
    CHECK (type IN ('prd', 'ux_flow', 'wireframe', 'code', 'report', 'brand', 'roadmap', 'backlog')),
  title TEXT NOT NULL,
  content JSONB NOT NULL,
  version INTEGER DEFAULT 1,
  score INTEGER CHECK (score >= 0 AND score <= 100),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- DECISION
CREATE TABLE IF NOT EXISTS decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  product_id UUID,
  squad_id UUID REFERENCES squads(id),
  title TEXT NOT NULL,
  rationale TEXT,
  category TEXT,
  confidence INTEGER DEFAULT 70 CHECK (confidence >= 0 AND confidence <= 100),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'revoked')),
  superseded_by UUID REFERENCES decisions(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- MEMORY (4 layers)
CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  layer TEXT NOT NULL
    CHECK (layer IN ('L1_operational', 'L2_project', 'L3_reusable', 'L4_strategic')),
  category TEXT,
  content TEXT NOT NULL,
  source TEXT,
  confidence INTEGER DEFAULT 50,
  usage_count INTEGER DEFAULT 0,
  impact_score INTEGER DEFAULT 0,
  score INTEGER GENERATED ALWAYS AS (
    LEAST(100, (confidence + LEAST(usage_count * 2, 50) + impact_score) / 3)
  ) STORED,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- HANDOFF
CREATE TABLE IF NOT EXISTS handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  from_squad_id UUID REFERENCES squads(id),
  to_squad_id UUID REFERENCES squads(id),
  mission_id UUID REFERENCES missions(id),
  context JSONB NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- KNOWLEDGE
CREATE TABLE IF NOT EXISTS knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  category TEXT NOT NULL
    CHECK (category IN ('pattern', 'anti_pattern', 'framework', 'lesson', 'decision')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  score INTEGER DEFAULT 50,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE squads ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE squad_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge ENABLE ROW LEVEL SECURITY;

-- Policy template (owner-based via workspace)
-- Replace 'your_workspace_table' with actual workspace lookup
CREATE POLICY "squads_workspace" ON squads
  FOR ALL USING (workspace_id::text = current_setting('app.workspace_id', true));

CREATE POLICY "agents_workspace" ON agents
  FOR ALL USING (workspace_id::text = current_setting('app.workspace_id', true));

CREATE POLICY "missions_workspace" ON missions
  FOR ALL USING (workspace_id::text = current_setting('app.workspace_id', true));

CREATE POLICY "decisions_workspace" ON decisions
  FOR ALL USING (workspace_id::text = current_setting('app.workspace_id', true));

CREATE POLICY "memories_workspace" ON memories
  FOR ALL USING (workspace_id::text = current_setting('app.workspace_id', true));

CREATE POLICY "knowledge_workspace" ON knowledge
  FOR ALL USING (workspace_id::text = current_setting('app.workspace_id', true));

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_squads_workspace ON squads(workspace_id);
CREATE INDEX IF NOT EXISTS idx_squads_status ON squads(status);
CREATE INDEX IF NOT EXISTS idx_agents_workspace ON agents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_missions_squad ON missions(squad_id);
CREATE INDEX IF NOT EXISTS idx_missions_status ON missions(status);
CREATE INDEX IF NOT EXISTS idx_artifacts_mission ON artifacts(mission_id);
CREATE INDEX IF NOT EXISTS idx_decisions_workspace ON decisions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_memories_layer ON memories(layer);
CREATE INDEX IF NOT EXISTS idx_memories_score ON memories(score);
CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge(category);
