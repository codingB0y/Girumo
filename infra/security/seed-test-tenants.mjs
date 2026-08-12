// Seed de 2 tenants de teste para o harness de security scan (staging descartável).
// Cria: 2 usuários no Supabase Auth (email+senha conhecidos) + 2 organizations +
// 2 memberships owner. Idempotente (select-then-insert; recria só o que falta).
//
// Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node infra/security/seed-test-tenants.mjs
//
// GUARD: recusa rodar se a URL parecer produção. Rode SÓ contra staging descartável.
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (/prod/i.test(url)) {
  console.error(`[GUARD] URL parece produção (${url}). Recusando. Rode só em staging descartável.`);
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const TENANTS = [
  { org: "SecTest Tenant A", email: "tenant-a@sectest.invalid", pass: "SecTest-A-8f3k2z" },
  { org: "SecTest Tenant B", email: "tenant-b@sectest.invalid", pass: "SecTest-B-7d9m1q" },
];

async function ensureAuthUser(email, password) {
  const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
  if (!error && data?.user?.id) return data.user.id;
  if (error && !/already|registered|exist/i.test(error.message)) throw error;
  // Já existe: pagina até achar.
  for (let page = 1; page <= 20; page++) {
    const { data: list } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    const hit = list?.users?.find((u) => u.email === email);
    if (hit) return hit.id;
    if (!list?.users?.length) break;
  }
  throw new Error(`Não consegui resolver o auth user de ${email}`);
}

async function ensureOrg(name) {
  const { data: found } = await sb.from("organizations").select("id").eq("name", name).limit(1).maybeSingle();
  if (found?.id) return found.id;
  const { data, error } = await sb.from("organizations").insert({ name }).select("id").single();
  if (error) throw error;
  return data.id;
}

async function ensureMembership(tenantId, userId) {
  const { data: found } = await sb
    .from("memberships")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (found?.id) return;
  const { error } = await sb.from("memberships").insert({
    tenant_id: tenantId,
    user_id: userId,
    role: "owner",
    accepted_at: new Date().toISOString(),
  });
  if (error) throw error;
}

for (const t of TENANTS) {
  const userId = await ensureAuthUser(t.email, t.pass);
  const tenantId = await ensureOrg(t.org);
  await ensureMembership(tenantId, userId);
  console.log(`ok  ${t.email}  user=${userId}  tenant=${tenantId}`);
}
console.log("\nSeed completo. Credenciais em TENANTS acima (só staging).");
