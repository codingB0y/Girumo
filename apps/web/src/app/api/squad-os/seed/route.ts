import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * POST /api/squad-os/seed
 * Popula as tabelas do Squad OS com dados iniciais.
 * Só insere se as tabelas estiverem vazias.
 */
export async function POST() {
  try {
    const supabase = getSupabaseAdmin();

    // Check if already seeded
    const { count, error: countErr } = await supabase
      .from("squads")
      .select("*", { count: "exact", head: true });

    if (countErr) {
      return NextResponse.json(
        { error: `Tabela squads não encontrada: ${countErr.message}`, detail: countErr },
        { status: 500 },
      );
    }

    if (count && count > 0) {
      return NextResponse.json({ message: "Already seeded", count }, { status: 200 });
    }

    // Seed agents first
    const agents = [
      { workspace_id: "default", name: "Luna", specialty: "Product Management", cost_per_run: 0.03, speed_rating: 8, context_window: 200000, reputation: 88, allowed_areas: ["product", "roadmap", "backlog"], limits: { max_concurrent: 3 }, history: [] },
      { workspace_id: "default", name: "Atlas", specialty: "Growth & Acquisition", cost_per_run: 0.04, speed_rating: 7, context_window: 200000, reputation: 76, allowed_areas: ["growth", "marketing", "experiments"], limits: { max_concurrent: 2 }, history: [] },
      { workspace_id: "default", name: "Pixel", specialty: "Frontend Development", cost_per_run: 0.05, speed_rating: 9, context_window: 200000, reputation: 91, allowed_areas: ["frontend", "ui", "components"], limits: { max_concurrent: 3 }, history: [] },
      { workspace_id: "default", name: "Forge", specialty: "Backend & Infrastructure", cost_per_run: 0.05, speed_rating: 8, context_window: 200000, reputation: 89, allowed_areas: ["backend", "api", "database", "infra"], limits: { max_concurrent: 2 }, history: [] },
      { workspace_id: "default", name: "Muse", specialty: "Brand & Creative", cost_per_run: 0.03, speed_rating: 7, context_window: 200000, reputation: 93, allowed_areas: ["brand", "copy", "design"], limits: { max_concurrent: 2 }, history: [] },
      { workspace_id: "default", name: "Prism", specialty: "Data & Analytics", cost_per_run: 0.04, speed_rating: 8, context_window: 200000, reputation: 60, allowed_areas: ["data", "metrics", "reports"], limits: { max_concurrent: 2 }, history: [] },
      { workspace_id: "default", name: "Shield", specialty: "QA & Testing", cost_per_run: 0.03, speed_rating: 9, context_window: 200000, reputation: 50, allowed_areas: ["qa", "testing", "security"], limits: { max_concurrent: 3 }, history: [] },
      { workspace_id: "default", name: "Ops", specialty: "DevOps & Operations", cost_per_run: 0.03, speed_rating: 9, context_window: 200000, reputation: 82, allowed_areas: ["ops", "deploy", "monitoring"], limits: { max_concurrent: 2 }, history: [] },
    ];

    const { data: insertedAgents, error: agentsErr } = await supabase
      .from("agents")
      .insert(agents)
      .select("id, name");

    if (agentsErr) {
      return NextResponse.json(
        { error: `Falha ao inserir agents: ${agentsErr.message}`, code: agentsErr.code, detail: agentsErr.details },
        { status: 500 },
      );
    }

    // Map agent names to IDs
    const agentMap = Object.fromEntries(
      (insertedAgents ?? []).map((a) => [a.name, a.id]),
    );

    // Seed squads (sem leader_agent_id inicialmente pra evitar FK issues)
    const squads = [
      { workspace_id: "default", name: "Product Squad", slug: "product", objective: "Definir escopo, priorização e roadmap do HubFlow", status: "executing", health: 92, context: {}, last_delivery: "PRD v2 — módulo automações", next_action: "Priorizar backlog Q3", reputation_score: 88 },
      { workspace_id: "default", name: "Growth Squad", slug: "growth", objective: "Aumentar aquisição e retenção de usuários", status: "researching", health: 85, context: {}, last_delivery: "Análise de funil — signup→ativação", next_action: "Testar onboarding simplificado", reputation_score: 76 },
      { workspace_id: "default", name: "Frontend Squad", slug: "frontend", objective: "Implementar interface premium e responsiva", status: "executing", health: 94, context: {}, last_delivery: "Admin panel + sidebar refactor", next_action: "Módulo automações UI", reputation_score: 91 },
      { workspace_id: "default", name: "Backend Squad", slug: "backend", objective: "API robusta, Supabase RLS, Edge Functions", status: "executing", health: 90, context: {}, last_delivery: "Rate limiting + security headers", next_action: "Webhooks Stripe multi-tenant", reputation_score: 89 },
      { workspace_id: "default", name: "Brand Squad", slug: "brand", objective: "Posicionamento premium, criativos e copy", status: "completed", health: 96, context: {}, last_delivery: "Rebranding v3 — iris/breu palette", next_action: "Social media kit Q3", reputation_score: 93 },
      { workspace_id: "default", name: "Data Squad", slug: "data", objective: "Métricas, analytics e relatórios de negócio", status: "planning", health: 78, context: {}, last_delivery: null, next_action: "Definir north star metric", reputation_score: 60 },
      { workspace_id: "default", name: "QA Squad", slug: "qa", objective: "Testes, qualidade e estabilidade", status: "planning", health: 70, context: {}, last_delivery: null, next_action: "Setup test framework", reputation_score: 50 },
      { workspace_id: "default", name: "Operations Squad", slug: "operations", objective: "Processos, deploy, monitoramento", status: "executing", health: 88, context: {}, last_delivery: "CI/CD Vercel + env vars configurados", next_action: "Alertas de health check", reputation_score: 82 },
    ];

    const { data: insertedSquads, error: squadsErr } = await supabase
      .from("squads")
      .insert(squads)
      .select("id, slug");

    if (squadsErr) {
      return NextResponse.json(
        { error: `Falha ao inserir squads: ${squadsErr.message}`, code: squadsErr.code, detail: squadsErr.details },
        { status: 500 },
      );
    }

    // Update squads with leader_agent_id
    const leaderMap: Record<string, string> = {
      product: agentMap["Luna"],
      growth: agentMap["Atlas"],
      frontend: agentMap["Pixel"],
      backend: agentMap["Forge"],
      brand: agentMap["Muse"],
      data: agentMap["Prism"],
      qa: agentMap["Shield"],
      operations: agentMap["Ops"],
    };

    const squadMap = Object.fromEntries(
      (insertedSquads ?? []).map((s) => [s.slug, s.id]),
    );

    // Set leaders (non-blocking)
    for (const [slug, agentId] of Object.entries(leaderMap)) {
      if (squadMap[slug] && agentId) {
        await supabase
          .from("squads")
          .update({ leader_agent_id: agentId })
          .eq("id", squadMap[slug]);
      }
    }

    // Seed missions
    const missions = [
      { squad_id: squadMap["product"], workspace_id: "default", title: "Definir PRD do módulo Automações", description: "Escrever PRD completo com user stories, critérios de aceite e prioridades", status: "completed", priority: 1, assigned_agent_id: agentMap["Luna"] ?? null, started_at: "2026-06-28T10:00:00Z", completed_at: "2026-06-29T14:00:00Z", result: { artifact: "prd-automacoes-v2" } },
      { squad_id: squadMap["frontend"], workspace_id: "default", title: "Implementar página de automações", description: "UI completa com lista, criação e edição de automações", status: "active", priority: 1, assigned_agent_id: agentMap["Pixel"] ?? null, started_at: "2026-07-01T08:00:00Z", result: {} },
      { squad_id: squadMap["growth"], workspace_id: "default", title: "Análise de funil signup→ativação", description: "Mapear onde usuários abandonam e propor 3 hipóteses de melhoria", status: "active", priority: 2, assigned_agent_id: agentMap["Atlas"] ?? null, started_at: "2026-07-01T09:00:00Z", result: {} },
      { squad_id: squadMap["backend"], workspace_id: "default", title: "Webhooks Stripe para multi-tenant", description: "Endpoint seguro que roteia eventos Stripe para o tenant correto", status: "pending", priority: 2, assigned_agent_id: agentMap["Forge"] ?? null, result: {} },
      { squad_id: squadMap["operations"], workspace_id: "default", title: "Configurar alertas de health check", description: "Monitorar uptime da API e notificar em caso de falha", status: "pending", priority: 3, assigned_agent_id: agentMap["Ops"] ?? null, result: {} },
    ];

    const { error: missionsErr } = await supabase.from("missions").insert(missions);
    if (missionsErr) {
      return NextResponse.json(
        { error: `Falha ao inserir missions: ${missionsErr.message}`, code: missionsErr.code, detail: missionsErr.details },
        { status: 500 },
      );
    }

    // Seed decisions
    const decisions = [
      { workspace_id: "default", title: "Supabase RLS como isolamento multi-tenant", rationale: "Mais seguro e escalável que middleware custom", category: "architecture", confidence: 95, status: "active" },
      { workspace_id: "default", title: "Next.js App Router + React 19", rationale: "Server components, streaming, melhor DX", category: "architecture", confidence: 92, status: "active" },
      { workspace_id: "default", title: "Pricing freemium com tiers por volume", rationale: "Reduz atrito de entrada, monetiza por uso", category: "product", confidence: 87, status: "active" },
    ];

    const { error: decisionsErr } = await supabase.from("decisions").insert(decisions);
    if (decisionsErr) {
      return NextResponse.json(
        { error: `Falha ao inserir decisions: ${decisionsErr.message}`, code: decisionsErr.code, detail: decisionsErr.details },
        { status: 500 },
      );
    }

    return NextResponse.json({
      message: "Seed complete",
      agents: insertedAgents?.length ?? 0,
      squads: insertedSquads?.length ?? 0,
      missions: missions.length,
      decisions: decisions.length,
    }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    console.error("[squad-os/seed] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
