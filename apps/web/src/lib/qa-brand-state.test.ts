import assert from "node:assert/strict";
import test from "node:test";
import {
  createSupabaseQaBackend,
  executeQaCli,
  prepareGirumoQaState,
  runQaPreparation,
  type QaAuthUserInput,
  type QaLandingPageInput,
  type QaMembershipInput,
  type QaOrganizationInput,
  type QaStateBackend,
  type QaUserProfileInput,
} from "../../scripts/prepare-girumo-qa-state";

const validEnv = {
  GIRUMO_QA_ALLOW_WRITE: "CREATE_GIRUMO_QA_FIXTURES",
  GIRUMO_QA_DB_HOST_CONFIRM: "qa-project.supabase.co",
  GIRUMO_QA_USER_EMAIL: "operacao.qa@example.invalid",
  GIRUMO_QA_USER_PASSWORD: "QaUserPass123!",
  GIRUMO_QA_ADMIN_EMAIL: "admin.qa@example.invalid",
  GIRUMO_QA_ADMIN_PASSWORD: "QaAdminPass123!",
  GIRUMO_DEPLOYMENT_URL: "https://girumo-preview.vercel.app",
  PRODUCTION_SUPABASE_URL: "https://prod-project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-for-tests",
  SUPABASE_URL: "https://qa-project.supabase.co",
} satisfies Record<string, string>;

type Row<T> = T & { id: string };

class InMemoryQaBackend implements QaStateBackend {
  templateAvailable = true;
  readonly authUsers = new Map<string, Row<QaAuthUserInput>>();
  readonly organizations = new Map<string, Row<QaOrganizationInput>>();
  readonly profiles = new Map<string, Row<QaUserProfileInput>>();
  readonly memberships = new Map<string, Row<QaMembershipInput>>();
  readonly pages = new Map<string, Row<QaLandingPageInput>>();
  readonly creates = { auth: 0, organization: 0, profile: 0, membership: 0, page: 0 };
  readonly updates = { auth: 0, organization: 0, profile: 0, membership: 0, page: 0 };

  async findAuthUserByEmail(email: string) {
    return this.authUsers.get(email) ?? null;
  }

  async createAuthUser(input: QaAuthUserInput) {
    this.creates.auth += 1;
    const row = { ...input, id: `auth-${this.creates.auth}` };
    this.authUsers.set(input.email, row);
    return row;
  }

  async updateAuthUser(id: string, input: QaAuthUserInput) {
    this.updates.auth += 1;
    this.authUsers.set(input.email, { ...input, id });
  }

  async findOrganizationBySlug(slug: string) {
    return this.organizations.get(slug) ?? null;
  }

  async createOrganization(input: QaOrganizationInput) {
    this.creates.organization += 1;
    const row = { ...input };
    this.organizations.set(input.slug, row);
    return row;
  }

  async updateOrganization(id: string, input: QaOrganizationInput) {
    this.updates.organization += 1;
    this.organizations.set(input.slug, { ...input, id });
  }

  async findUserProfile(tenantId: string, authUserId: string) {
    return this.profiles.get(`${tenantId}:${authUserId}`) ?? null;
  }

  async createUserProfile(input: QaUserProfileInput) {
    this.creates.profile += 1;
    const row = { ...input, id: `profile-${this.creates.profile}` };
    this.profiles.set(`${input.tenant_id}:${input.auth_user_id}`, row);
    return row;
  }

  async updateUserProfile(id: string, input: QaUserProfileInput) {
    this.updates.profile += 1;
    this.profiles.set(`${input.tenant_id}:${input.auth_user_id}`, { ...input, id });
  }

  async findMembership(tenantId: string, userId: string) {
    return this.memberships.get(`${tenantId}:${userId}`) ?? null;
  }

  async createMembership(input: QaMembershipInput) {
    this.creates.membership += 1;
    const row = { ...input, id: `membership-${this.creates.membership}` };
    this.memberships.set(`${input.tenant_id}:${input.user_id}`, row);
    return row;
  }

  async updateMembership(id: string, input: QaMembershipInput) {
    this.updates.membership += 1;
    this.memberships.set(`${input.tenant_id}:${input.user_id}`, { ...input, id });
  }

  async findTemplateBySlug(slug: string) {
    return this.templateAvailable && slug === "catalogo-grupo"
      ? { id: "template-catalogo" }
      : null;
  }

  async findLandingPageBySlug(slug: string) {
    return this.pages.get(slug) ?? null;
  }

  async createLandingPage(input: QaLandingPageInput) {
    this.creates.page += 1;
    const row = { ...input, id: `page-${this.creates.page}` };
    this.pages.set(input.slug, row);
    return row;
  }

  async updateLandingPage(id: string, input: QaLandingPageInput) {
    this.updates.page += 1;
    this.pages.set(input.slug, { ...input, id });
  }
}

test("recusa escrita sem a frase de confirmação antes de criar o cliente", async () => {
  let backendCreations = 0;
  const lines: string[] = [];

  await assert.rejects(
    runQaPreparation({
      env: { ...validEnv, GIRUMO_QA_ALLOW_WRITE: "yes" },
      createBackend: () => {
        backendCreations += 1;
        return new InMemoryQaBackend();
      },
      now: () => "2026-07-16T12:00:00.000Z",
      writeLine: (line) => lines.push(line),
    }),
    /GIRUMO_QA_ALLOW_WRITE/,
  );

  assert.equal(backendCreations, 0);
  assert.deepEqual(lines, []);
});

test("recusa host não confirmado exatamente antes de qualquer acesso de rede", async () => {
  let backendCreations = 0;

  await assert.rejects(
    runQaPreparation({
      env: { ...validEnv, GIRUMO_QA_DB_HOST_CONFIRM: "QA-PROJECT.SUPABASE.CO" },
      createBackend: () => {
        backendCreations += 1;
        return new InMemoryQaBackend();
      },
      writeLine: () => undefined,
    }),
    /GIRUMO_QA_DB_HOST_CONFIRM/,
  );

  assert.equal(backendCreations, 0);
});

test("recusa o mesmo projeto da produção após canonicalizar caixa e barra final", async () => {
  let backendCreations = 0;

  await assert.rejects(
    runQaPreparation({
      env: {
        ...validEnv,
        PRODUCTION_SUPABASE_URL: "HTTPS://QA-PROJECT.SUPABASE.CO/",
        SUPABASE_URL: "https://qa-project.supabase.co",
      },
      createBackend: () => {
        backendCreations += 1;
        return new InMemoryQaBackend();
      },
      writeLine: () => undefined,
    }),
    /produção/,
  );

  assert.equal(backendCreations, 0);
});

test("valida todas as variáveis obrigatórias sem expor seus valores", async () => {
  const env = { ...validEnv, GIRUMO_QA_ADMIN_PASSWORD: "" };

  await assert.rejects(
    runQaPreparation({
      env,
      createBackend: () => new InMemoryQaBackend(),
      writeLine: () => undefined,
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /GIRUMO_QA_ADMIN_PASSWORD/);
      assert.doesNotMatch(error.message, /QaUserPass123|service-role-secret/);
      return true;
    },
  );
});

test("normaliza os e-mails de QA para minúsculas antes de persistir", async () => {
  const backend = new InMemoryQaBackend();

  await runQaPreparation({
    env: {
      ...validEnv,
      GIRUMO_QA_USER_EMAIL: "Operacao.QA@Example.Invalid",
      GIRUMO_QA_ADMIN_EMAIL: "Admin.QA@Example.Invalid",
    },
    createBackend: () => backend,
    newTenantId: () => "tenant-email-normalization",
    writeLine: () => undefined,
  });

  assert.deepEqual([...backend.authUsers.keys()].sort(), [
    "admin.qa@example.invalid",
    "operacao.qa@example.invalid",
  ]);
});

test("configura o cliente service-role apenas para uso server-side", () => {
  const calls: unknown[][] = [];
  const fakeClient = {};

  createSupabaseQaBackend(validEnv, (...args: unknown[]) => {
    calls.push(args);
    return fakeClient as never;
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [
    validEnv.SUPABASE_URL,
    validEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  ]);
});

test("cria e depois atualiza o mesmo estado determinístico sem duplicar registros", async () => {
  const backend = new InMemoryQaBackend();
  const fixedNow = () => "2026-07-16T12:00:00.000Z";

  const first = await runQaPreparation({
    env: validEnv,
    createBackend: () => backend,
    newTenantId: () => "tenant-1",
    now: fixedNow,
    writeLine: () => undefined,
  });
  const second = await prepareGirumoQaState(validEnv, backend, fixedNow);

  assert.deepEqual(first, {
    tenantId: "tenant-1",
    userId: "auth-1",
    adminUserId: "auth-2",
    pageSlug: "girumo-qa-wholesale",
  });
  assert.deepEqual(second, first);
  assert.deepEqual(backend.creates, {
    auth: 2,
    organization: 1,
    profile: 2,
    membership: 2,
    page: 1,
  });
  assert.deepEqual(backend.updates, {
    auth: 2,
    organization: 1,
    profile: 2,
    membership: 2,
    page: 1,
  });

  const organization = backend.organizations.get("girumo-qa");
  assert.equal(organization?.created_by, first.userId);
  assert.equal(organization?.status, "active");
  assert.equal(organization?.tenant_id, organization?.id);
  assert.deepEqual(
    [...backend.memberships.values()].map(({ role }) => role).sort(),
    ["admin", "owner"],
  );

  const page = backend.pages.get("girumo-qa-wholesale");
  assert.equal(page?.tenant_id, first.tenantId);
  assert.equal(page?.template_id, "template-catalogo");
  assert.equal(page?.status, "published");
  assert.equal(page?.target_group_url, "https://wa.me/0000000000000");
  assert.equal(page?.content.primary_color, "emerald");
  assert.equal(
    page?.content.photo_url,
    "https://girumo-preview.vercel.app/brand/girumo/social/og-default-1200x630.png",
  );
  assert.match(page?.content.headline ?? "", /atacado/i);
});

test("valida o template obrigatório antes da primeira mutação", async () => {
  const backend = new InMemoryQaBackend();
  backend.templateAvailable = false;

  await assert.rejects(
    runQaPreparation({
      env: validEnv,
      createBackend: () => backend,
      writeLine: () => undefined,
    }),
    /catalogo-grupo/,
  );

  assert.deepEqual(backend.creates, {
    auth: 0,
    organization: 0,
    profile: 0,
    membership: 0,
    page: 0,
  });
  assert.deepEqual(backend.updates, {
    auth: 0,
    organization: 0,
    profile: 0,
    membership: 0,
    page: 0,
  });
});

test("recusa o slug global quando ele pertence a outro tenant antes de mutar dados", async () => {
  const backend = new InMemoryQaBackend();
  await runQaPreparation({
    env: validEnv,
    createBackend: () => backend,
    now: () => "2026-07-16T12:00:00.000Z",
    writeLine: () => undefined,
  });

  const page = backend.pages.get("girumo-qa-wholesale");
  assert.ok(page);
  backend.pages.set(page.slug, { ...page, tenant_id: "tenant-de-outro-cliente" });
  const createsBefore = { ...backend.creates };
  const updatesBefore = { ...backend.updates };

  await assert.rejects(
    runQaPreparation({
      env: validEnv,
      createBackend: () => backend,
      now: () => "2026-07-16T13:00:00.000Z",
      writeLine: () => undefined,
    }),
    /outro tenant/,
  );

  assert.deepEqual(backend.creates, createsBefore);
  assert.deepEqual(backend.updates, updatesBefore);
});

test("emite uma única linha JSON final apenas com IDs e slug", async () => {
  const lines: string[] = [];

  await runQaPreparation({
    env: validEnv,
    createBackend: () => new InMemoryQaBackend(),
    now: () => "2026-07-16T12:00:00.000Z",
    writeLine: (line) => lines.push(line),
  });

  assert.equal(lines.length, 1);
  const result = JSON.parse(lines[0]);
  assert.deepEqual(Object.keys(result).sort(), ["adminUserId", "pageSlug", "tenantId", "userId"]);
  assert.doesNotMatch(lines[0], /password|service-role|@example\.invalid/i);
});

test("redige credenciais até quando uma dependência lança erro com segredos", async () => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const leaked = [
    validEnv.SUPABASE_SERVICE_ROLE_KEY,
    validEnv.GIRUMO_QA_USER_EMAIL,
    validEnv.GIRUMO_QA_USER_PASSWORD,
    validEnv.GIRUMO_QA_ADMIN_EMAIL,
    validEnv.GIRUMO_QA_ADMIN_PASSWORD,
  ].join(" | ");

  const exitCode = await executeQaCli({
    env: validEnv,
    createBackend: () => {
      throw new Error(leaked);
    },
    writeError: (line) => stderr.push(line),
    writeLine: (line) => stdout.push(line),
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(stdout, []);
  assert.equal(stderr.length, 1);
  for (const secret of leaked.split(" | ")) assert.doesNotMatch(stderr[0], new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(stderr[0], /\[REDACTED\]/);
});
