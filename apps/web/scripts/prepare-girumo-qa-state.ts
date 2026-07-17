import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

const WRITE_CONFIRMATION = "CREATE_GIRUMO_QA_FIXTURES";
const ORGANIZATION_SLUG = "girumo-qa";
const PAGE_SLUG = "girumo-qa-wholesale";
const TEMPLATE_SLUG = "catalogo-grupo";
const SAFE_TARGET_URL = "https://wa.me/0000000000000";

const REQUIRED_ENV_NAMES = [
  "GIRUMO_QA_ALLOW_WRITE",
  "GIRUMO_QA_DB_HOST_CONFIRM",
  "GIRUMO_QA_USER_EMAIL",
  "GIRUMO_QA_USER_PASSWORD",
  "GIRUMO_QA_ADMIN_EMAIL",
  "GIRUMO_QA_ADMIN_PASSWORD",
  "GIRUMO_DEPLOYMENT_URL",
  "PRODUCTION_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_URL",
] as const;

type RequiredEnvName = (typeof REQUIRED_ENV_NAMES)[number];
export type QaEnvironment = Record<string, string | undefined>;

export type QaConfig = {
  adminEmail: string;
  adminPassword: string;
  deploymentOrigin: string;
  serviceRoleKey: string;
  supabaseUrl: string;
  userEmail: string;
  userPassword: string;
};

export type QaAuthUserInput = {
  email: string;
  password: string;
  email_confirm: true;
  user_metadata: {
    fixture: "girumo-qa";
    name: string;
    persona: "ordinary" | "admin";
  };
};

export type QaOrganizationInput = {
  created_by: string;
  id: string;
  metadata: { fixture: true; purpose: "girumo-brand-qa" };
  name: "Girumo QA";
  slug: "girumo-qa";
  status: "active";
  tenant_id: string;
};

export type QaUserProfileInput = {
  auth_user_id: string;
  email: string;
  metadata: { fixture: true; persona: "ordinary" | "admin" };
  name: string;
  tenant_id: string;
};

export type QaMembershipInput = {
  accepted_at: string;
  role: "owner" | "admin";
  tenant_id: string;
  user_id: string;
};

export type QaLandingPageInput = {
  campaign_slug: null;
  content: {
    description: string;
    group_topic: string;
    headline: string;
    photo_url: string;
    primary_color: "emerald";
    store_name: string;
  };
  ga4_id: null;
  meta_pixel_id: null;
  published_at: string;
  slug: "girumo-qa-wholesale";
  status: "published";
  target_group_url: "https://wa.me/0000000000000";
  template_id: string;
  tenant_id: string;
  tiktok_pixel_id: null;
  updated_at: string;
};

type Identified = { id: string };
type TenantIdentified = Identified & { tenant_id: string };

export interface QaStateBackend {
  findAuthUserByEmail(email: string): Promise<Identified | null>;
  createAuthUser(input: QaAuthUserInput): Promise<Identified>;
  updateAuthUser(id: string, input: QaAuthUserInput): Promise<void>;
  findOrganizationBySlug(slug: string): Promise<TenantIdentified | null>;
  createOrganization(input: QaOrganizationInput): Promise<Identified>;
  updateOrganization(id: string, input: QaOrganizationInput): Promise<void>;
  findUserProfile(tenantId: string, authUserId: string): Promise<Identified | null>;
  createUserProfile(input: QaUserProfileInput): Promise<Identified>;
  updateUserProfile(id: string, input: QaUserProfileInput): Promise<void>;
  findMembership(tenantId: string, userId: string): Promise<Identified | null>;
  createMembership(input: QaMembershipInput): Promise<Identified>;
  updateMembership(id: string, input: QaMembershipInput): Promise<void>;
  findTemplateBySlug(slug: string): Promise<Identified | null>;
  findLandingPageBySlug(slug: string): Promise<TenantIdentified | null>;
  createLandingPage(input: QaLandingPageInput): Promise<Identified>;
  updateLandingPage(id: string, input: QaLandingPageInput): Promise<void>;
}

export type QaPreparationResult = {
  tenantId: string;
  userId: string;
  adminUserId: string;
  pageSlug: "girumo-qa-wholesale";
};

type ClientFactory = (
  url: string,
  key: string,
  options: {
    auth: {
      autoRefreshToken: false;
      detectSessionInUrl: false;
      persistSession: false;
    };
  },
) => SupabaseClient;

function parseHttpsUrl(name: string, rawValue: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw new Error(`Variável de QA inválida: ${name}.`);
  }

  if (parsed.protocol !== "https:" || parsed.username || parsed.password || !parsed.hostname) {
    throw new Error(`Variável de QA inválida: ${name}.`);
  }
  return parsed;
}

function validateEmail(name: string, value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
    throw new Error(`Variável de QA inválida: ${name}.`);
  }
  return normalized;
}

function validatePassword(name: string, value: string): string {
  if (value.length < 6) throw new Error(`Variável de QA inválida: ${name}.`);
  return value;
}

export function readQaConfig(env: QaEnvironment): QaConfig {
  const missing = REQUIRED_ENV_NAMES.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Variáveis de QA ausentes: ${missing.join(", ")}.`);
  }

  const values = Object.fromEntries(
    REQUIRED_ENV_NAMES.map((name) => [name, env[name] as string]),
  ) as Record<RequiredEnvName, string>;

  if (values.GIRUMO_QA_ALLOW_WRITE !== WRITE_CONFIRMATION) {
    throw new Error(`GIRUMO_QA_ALLOW_WRITE deve ser exatamente ${WRITE_CONFIRMATION}.`);
  }

  const supabaseUrl = parseHttpsUrl("SUPABASE_URL", values.SUPABASE_URL);
  const productionUrl = parseHttpsUrl(
    "PRODUCTION_SUPABASE_URL",
    values.PRODUCTION_SUPABASE_URL,
  );
  const deploymentUrl = parseHttpsUrl(
    "GIRUMO_DEPLOYMENT_URL",
    values.GIRUMO_DEPLOYMENT_URL,
  );

  if (values.GIRUMO_QA_DB_HOST_CONFIRM !== supabaseUrl.hostname) {
    throw new Error(
      "GIRUMO_QA_DB_HOST_CONFIRM não corresponde exatamente ao hostname de SUPABASE_URL.",
    );
  }

  if (supabaseUrl.origin === productionUrl.origin) {
    throw new Error("O harness de QA recusa o projeto Supabase de produção.");
  }

  const userEmail = validateEmail("GIRUMO_QA_USER_EMAIL", values.GIRUMO_QA_USER_EMAIL);
  const adminEmail = validateEmail("GIRUMO_QA_ADMIN_EMAIL", values.GIRUMO_QA_ADMIN_EMAIL);
  if (userEmail === adminEmail) {
    throw new Error("Os usuários comum e admin de QA precisam ter e-mails distintos.");
  }

  return {
    adminEmail,
    adminPassword: validatePassword(
      "GIRUMO_QA_ADMIN_PASSWORD",
      values.GIRUMO_QA_ADMIN_PASSWORD,
    ),
    deploymentOrigin: deploymentUrl.origin,
    serviceRoleKey: values.SUPABASE_SERVICE_ROLE_KEY,
    supabaseUrl: supabaseUrl.origin,
    userEmail,
    userPassword: validatePassword(
      "GIRUMO_QA_USER_PASSWORD",
      values.GIRUMO_QA_USER_PASSWORD,
    ),
  };
}

function supabaseFailure(operation: string): Error {
  return new Error(`Falha no Supabase durante ${operation}.`);
}

function assertNoSupabaseError(error: unknown, operation: string): void {
  if (error) throw supabaseFailure(operation);
}

export function createSupabaseQaBackend(
  env: QaEnvironment,
  clientFactory: ClientFactory = createClient,
): QaStateBackend {
  if (typeof window !== "undefined") {
    throw new Error("O harness Supabase de QA só pode ser executado no servidor.");
  }

  const config = readQaConfig(env);
  const client = clientFactory(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  return {
    async findAuthUserByEmail(email) {
      let page = 1;
      while (true) {
        const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
        assertNoSupabaseError(error, "listar usuários Auth");
        const found = data.users.find((user) => user.email?.toLowerCase() === email);
        if (found) return { id: found.id };
        if (!("nextPage" in data) || data.nextPage === null) return null;
        page = data.nextPage;
      }
    },

    async createAuthUser(input) {
      const { data, error } = await client.auth.admin.createUser(input);
      assertNoSupabaseError(error, "criar usuário Auth");
      if (!data.user) throw supabaseFailure("criar usuário Auth");
      return { id: data.user.id };
    },

    async updateAuthUser(id, input) {
      const { error } = await client.auth.admin.updateUserById(id, input);
      assertNoSupabaseError(error, "atualizar usuário Auth");
    },

    async findOrganizationBySlug(slug) {
      const { data, error } = await client
        .from("organizations")
        .select("id, tenant_id")
        .eq("slug", slug)
        .maybeSingle();
      assertNoSupabaseError(error, "buscar organização");
      return data ? { id: String(data.id), tenant_id: String(data.tenant_id) } : null;
    },

    async createOrganization(input) {
      const { data, error } = await client
        .from("organizations")
        .insert(input)
        .select("id")
        .single();
      assertNoSupabaseError(error, "criar organização");
      if (!data) throw supabaseFailure("criar organização");
      return { id: String(data.id) };
    },

    async updateOrganization(id, input) {
      const { error } = await client.from("organizations").update(input).eq("id", id);
      assertNoSupabaseError(error, "atualizar organização");
    },

    async findUserProfile(tenantId, authUserId) {
      const { data, error } = await client
        .from("users")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("auth_user_id", authUserId)
        .maybeSingle();
      assertNoSupabaseError(error, "buscar perfil de usuário");
      return data ? { id: String(data.id) } : null;
    },

    async createUserProfile(input) {
      const { data, error } = await client.from("users").insert(input).select("id").single();
      assertNoSupabaseError(error, "criar perfil de usuário");
      if (!data) throw supabaseFailure("criar perfil de usuário");
      return { id: String(data.id) };
    },

    async updateUserProfile(id, input) {
      const { error } = await client.from("users").update(input).eq("id", id);
      assertNoSupabaseError(error, "atualizar perfil de usuário");
    },

    async findMembership(tenantId, userId) {
      const { data, error } = await client
        .from("memberships")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .maybeSingle();
      assertNoSupabaseError(error, "buscar membership");
      return data ? { id: String(data.id) } : null;
    },

    async createMembership(input) {
      const { data, error } = await client
        .from("memberships")
        .insert(input)
        .select("id")
        .single();
      assertNoSupabaseError(error, "criar membership");
      if (!data) throw supabaseFailure("criar membership");
      return { id: String(data.id) };
    },

    async updateMembership(id, input) {
      const { error } = await client.from("memberships").update(input).eq("id", id);
      assertNoSupabaseError(error, "atualizar membership");
    },

    async findTemplateBySlug(slug) {
      const { data, error } = await client
        .from("landing_page_templates")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      assertNoSupabaseError(error, "buscar template de landing page");
      return data ? { id: String(data.id) } : null;
    },

    async findLandingPageBySlug(slug) {
      const { data, error } = await client
        .from("landing_pages")
        .select("id, tenant_id")
        .eq("slug", slug)
        .maybeSingle();
      assertNoSupabaseError(error, "buscar landing page");
      return data ? { id: String(data.id), tenant_id: String(data.tenant_id) } : null;
    },

    async createLandingPage(input) {
      const { data, error } = await client
        .from("landing_pages")
        .insert(input)
        .select("id")
        .single();
      assertNoSupabaseError(error, "criar landing page");
      if (!data) throw supabaseFailure("criar landing page");
      return { id: String(data.id) };
    },

    async updateLandingPage(id, input) {
      const { error } = await client.from("landing_pages").update(input).eq("id", id);
      assertNoSupabaseError(error, "atualizar landing page");
    },
  };
}

async function ensureAuthUser(
  backend: QaStateBackend,
  input: QaAuthUserInput,
): Promise<string> {
  const existing = await backend.findAuthUserByEmail(input.email);
  if (existing) {
    await backend.updateAuthUser(existing.id, input);
    return existing.id;
  }
  return (await backend.createAuthUser(input)).id;
}

async function ensureOrganization(
  backend: QaStateBackend,
  existing: TenantIdentified | null,
  input: QaOrganizationInput,
): Promise<string> {
  if (existing) {
    await backend.updateOrganization(existing.id, input);
    return existing.id;
  }
  return (await backend.createOrganization(input)).id;
}

async function ensureUserProfile(
  backend: QaStateBackend,
  input: QaUserProfileInput,
): Promise<void> {
  const existing = await backend.findUserProfile(input.tenant_id, input.auth_user_id);
  if (existing) await backend.updateUserProfile(existing.id, input);
  else await backend.createUserProfile(input);
}

async function ensureMembership(
  backend: QaStateBackend,
  input: QaMembershipInput,
): Promise<void> {
  const existing = await backend.findMembership(input.tenant_id, input.user_id);
  if (existing) await backend.updateMembership(existing.id, input);
  else await backend.createMembership(input);
}

async function prepareWithConfig(
  config: QaConfig,
  backend: QaStateBackend,
  now: () => string,
  newTenantId: () => string,
): Promise<QaPreparationResult> {
  const timestamp = now();
  const template = await backend.findTemplateBySlug(TEMPLATE_SLUG);
  if (!template) throw new Error(`Template obrigatório ausente: ${TEMPLATE_SLUG}.`);

  const existingOrganization = await backend.findOrganizationBySlug(ORGANIZATION_SLUG);
  if (
    existingOrganization &&
    existingOrganization.tenant_id !== existingOrganization.id
  ) {
    throw new Error("A organização girumo-qa possui tenant_id inconsistente.");
  }

  const existingPage = await backend.findLandingPageBySlug(PAGE_SLUG);
  if (
    existingPage &&
    (!existingOrganization || existingPage.tenant_id !== existingOrganization.id)
  ) {
    throw new Error("O slug girumo-qa-wholesale já pertence a outro tenant.");
  }

  const userId = await ensureAuthUser(backend, {
    email: config.userEmail,
    password: config.userPassword,
    email_confirm: true,
    user_metadata: {
      fixture: "girumo-qa",
      name: "Operação Girumo QA",
      persona: "ordinary",
    },
  });
  const adminUserId = await ensureAuthUser(backend, {
    email: config.adminEmail,
    password: config.adminPassword,
    email_confirm: true,
    user_metadata: {
      fixture: "girumo-qa",
      name: "Admin Girumo QA",
      persona: "admin",
    },
  });

  const tenantId = existingOrganization?.id ?? newTenantId();
  await ensureOrganization(backend, existingOrganization, {
    created_by: userId,
    id: tenantId,
    metadata: { fixture: true, purpose: "girumo-brand-qa" },
    name: "Girumo QA",
    slug: ORGANIZATION_SLUG,
    status: "active",
    tenant_id: tenantId,
  });

  await ensureUserProfile(backend, {
    auth_user_id: userId,
    email: config.userEmail,
    metadata: { fixture: true, persona: "ordinary" },
    name: "Operação Girumo QA",
    tenant_id: tenantId,
  });
  await ensureUserProfile(backend, {
    auth_user_id: adminUserId,
    email: config.adminEmail,
    metadata: { fixture: true, persona: "admin" },
    name: "Admin Girumo QA",
    tenant_id: tenantId,
  });
  await ensureMembership(backend, {
    accepted_at: timestamp,
    role: "owner",
    tenant_id: tenantId,
    user_id: userId,
  });
  await ensureMembership(backend, {
    accepted_at: timestamp,
    role: "admin",
    tenant_id: tenantId,
    user_id: adminUserId,
  });

  const landingPage: QaLandingPageInput = {
    campaign_slug: null,
    content: {
      description:
        "Entre no grupo de demonstração para acompanhar lançamentos, reposições e condições para lojistas.",
      group_topic: "lançamentos, reposições e ofertas de atacado",
      headline: "Novidades do atacado direto no seu grupo",
      photo_url: `${config.deploymentOrigin}/brand/girumo/social/og-default-1200x630.png`,
      primary_color: "emerald",
      store_name: "Girumo Atacado QA",
    },
    ga4_id: null,
    meta_pixel_id: null,
    published_at: timestamp,
    slug: PAGE_SLUG,
    status: "published",
    target_group_url: SAFE_TARGET_URL,
    template_id: template.id,
    tenant_id: tenantId,
    tiktok_pixel_id: null,
    updated_at: timestamp,
  };
  if (existingPage) await backend.updateLandingPage(existingPage.id, landingPage);
  else await backend.createLandingPage(landingPage);

  return { tenantId, userId, adminUserId, pageSlug: PAGE_SLUG };
}

export async function prepareGirumoQaState(
  env: QaEnvironment,
  backend: QaStateBackend,
  now: () => string = () => new Date().toISOString(),
  newTenantId: () => string = randomUUID,
): Promise<QaPreparationResult> {
  return prepareWithConfig(readQaConfig(env), backend, now, newTenantId);
}

type RunQaPreparationOptions = {
  env: QaEnvironment;
  createBackend?: (config: QaConfig) => QaStateBackend;
  newTenantId?: () => string;
  now?: () => string;
  writeLine?: (line: string) => void;
};

export async function runQaPreparation({
  env,
  createBackend = () => createSupabaseQaBackend(env),
  newTenantId = randomUUID,
  now = () => new Date().toISOString(),
  writeLine = console.log,
}: RunQaPreparationOptions): Promise<QaPreparationResult> {
  const config = readQaConfig(env);
  const backend = createBackend(config);
  const result = await prepareWithConfig(config, backend, now, newTenantId);
  writeLine(JSON.stringify(result));
  return result;
}

function redactCredentials(message: string, env: QaEnvironment): string {
  const sensitiveNames = [
    "SUPABASE_SERVICE_ROLE_KEY",
    "GIRUMO_QA_USER_EMAIL",
    "GIRUMO_QA_USER_PASSWORD",
    "GIRUMO_QA_ADMIN_EMAIL",
    "GIRUMO_QA_ADMIN_PASSWORD",
  ] as const;

  return sensitiveNames
    .map((name) => env[name])
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => b.length - a.length)
    .reduce((redacted, value) => redacted.split(value).join("[REDACTED]"), message);
}

type ExecuteQaCliOptions = RunQaPreparationOptions & {
  writeError?: (line: string) => void;
};

export async function executeQaCli({
  writeError = console.error,
  ...options
}: ExecuteQaCliOptions): Promise<number> {
  try {
    await runQaPreparation(options);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado no harness de QA.";
    writeError(`Girumo QA: ${redactCredentials(message, options.env)}`);
    return 1;
  }
}

const entryPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (entryPath === import.meta.url) {
  void executeQaCli({ env: process.env }).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
