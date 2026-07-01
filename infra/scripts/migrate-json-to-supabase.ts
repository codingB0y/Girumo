/**
 * Data migration script: JSON stores → Supabase
 *
 * Usage:
 *   npx tsx infra/scripts/migrate-json-to-supabase.ts
 *
 * Requires:
 *   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 *   - JSON data files in hubflow-groups/data/ or apps/web/data/
 *   - The SQL migration 202607010001 already applied to Supabase
 *
 * This script is idempotent: uses upsert with conflict handling.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { config } from "dotenv";

// Load env
config({ path: resolve(__dirname, "../../apps/web/.env.local") });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// --- Helpers ---

function readJson<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  try {
    const content = readFileSync(path, "utf8");
    const data = JSON.parse(content);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function findDataFile(name: string): string {
  const paths = [
    resolve(__dirname, `../../hubflow-groups/data/${name}`),
    resolve(__dirname, `../../apps/web/data/${name}`),
  ];
  return paths.find(existsSync) ?? paths[0];
}

async function main() {
  // Get the tenant ID — for single-tenant migration, get the first org
  const { data: orgs } = await supabase.from("organizations").select("id").limit(1);
  if (!orgs || orgs.length === 0) {
    console.error("❌ Nenhuma organização encontrada. Crie uma primeiro.");
    process.exit(1);
  }
  const tenantId = orgs[0].id;
  console.log(`\n📦 Migrando dados para tenant: ${tenantId}\n`);

  // 1. Groups
  console.log("1️⃣  Migrando groups...");
  const groups = readJson<Record<string, unknown>>(findDataFile("groups.json"));
  if (groups.length > 0) {
    const rows = groups.map((g) => ({
      tenant_id: tenantId,
      whatsapp_group_id: String(g.whatsappGroupId ?? g.id),
      name: String(g.name ?? "Grupo"),
      display_name_base: g.displayNameBase ?? null,
      display_number: g.displayNumber ?? null,
      members: Number(g.members ?? 0),
      capacity: Number(g.capacity ?? 1024),
      selected: Boolean(g.selected),
      engagement: String(g.engagement ?? "medio"),
      invite_url: g.inviteUrl ?? null,
    }));
    const { error } = await supabase.from("groups").upsert(rows, { onConflict: "tenant_id,whatsapp_group_id" });
    if (error) console.error("   ❌", error.message);
    else console.log(`   ✅ ${rows.length} grupos migrados`);
  } else {
    console.log("   ⏭️  Nenhum grupo encontrado");
  }

  // 2. Campaign groups (campanhas)
  console.log("2️⃣  Migrando campanhas → campaign_groups...");
  const campanhas = readJson<Record<string, unknown>>(findDataFile("campanhas.json"));
  if (campanhas.length > 0) {
    const rows = campanhas.map((c) => ({
      tenant_id: tenantId,
      name: String(c.name ?? ""),
      slug: String(c.slug ?? c.id ?? crypto.randomUUID()),
      group_ids: Array.isArray(c.groupIds) ? c.groupIds.map(String) : [],
      auto_grow: Boolean(c.autoGrow),
      grow_template: c.growTemplate ?? null,
    }));
    const { error } = await supabase.from("campaign_groups").upsert(rows, { onConflict: "tenant_id,slug" });
    if (error) console.error("   ❌", error.message);
    else console.log(`   ✅ ${rows.length} campanhas migradas`);
  } else {
    console.log("   ⏭️  Nenhuma campanha encontrada");
  }

  // 3. Broadcasts
  console.log("3️⃣  Migrando broadcasts...");
  const broadcasts = readJson<Record<string, unknown>>(findDataFile("broadcasts.json"));
  if (broadcasts.length > 0) {
    const rows = broadcasts.map((b) => ({
      tenant_id: tenantId,
      name: String(b.name ?? ""),
      message: String(b.message ?? ""),
      group_ids: Array.isArray(b.groupIds) ? b.groupIds.map(String) : [],
      media_id: b.mediaId ?? null,
      media_type: b.mediaType ?? null,
      mention_all: Boolean(b.mentionAll),
      poll: b.poll ?? null,
      status: String(b.status ?? "draft"),
      sent: Number(b.sent ?? 0),
      total: Number(b.total ?? 0),
      error: b.error ?? null,
      dispatched_at: b.dispatchedAt ?? null,
      running_since: b.runningSince ?? null,
      last_ack_at: b.lastAckAt ?? null,
      created_at: b.createdAt ?? new Date().toISOString(),
    }));
    const { error } = await supabase.from("broadcasts").insert(rows);
    if (error) console.error("   ❌", error.message);
    else console.log(`   ✅ ${rows.length} broadcasts migrados`);
  } else {
    console.log("   ⏭️  Nenhum broadcast encontrado");
  }

  // 4. Schedules
  console.log("4️⃣  Migrando schedules...");
  const schedules = readJson<Record<string, unknown>>(findDataFile("schedules.json"));
  if (schedules.length > 0) {
    const rows = schedules.map((s) => ({
      tenant_id: tenantId,
      name: String(s.campaignName ?? s.name ?? ""),
      scheduled_at: String(s.scheduledAt ?? new Date().toISOString()),
      recurrence: String(s.recurrence ?? "none"),
      status: String(s.status ?? "pending"),
      last_run_at: s.lastRunAt ?? null,
    }));
    const { error } = await supabase.from("schedules").insert(rows);
    if (error) console.error("   ❌", error.message);
    else console.log(`   ✅ ${rows.length} schedules migrados`);
  } else {
    console.log("   ⏭️  Nenhum schedule encontrado");
  }

  // 5. Tracked links
  console.log("5️⃣  Migrando tracked links...");
  const links = readJson<Record<string, unknown>>(findDataFile("links.json"));
  if (links.length > 0) {
    const rows = links.map((l) => ({
      tenant_id: tenantId,
      slug: String(l.slug ?? l.id ?? crypto.randomUUID()),
      target_url: String(l.targetUrl ?? l.url ?? ""),
      clicks: Number(l.clicks ?? 0),
    }));
    const { error } = await supabase.from("tracked_links").upsert(rows, { onConflict: "slug" });
    if (error) console.error("   ❌", error.message);
    else console.log(`   ✅ ${rows.length} links migrados`);
  } else {
    console.log("   ⏭️  Nenhum link encontrado");
  }

  console.log("\n✅ Migração concluída!\n");
  console.log("Próximos passos:");
  console.log("  1. Verifique os dados no Supabase Dashboard");
  console.log("  2. Defina HUBFLOW_USE_SUPABASE=1 no .env.local");
  console.log("  3. Reinicie o dev server");
}

main().catch((err) => {
  console.error("❌ Erro fatal:", err);
  process.exit(1);
});
