# Funil de disparos · PR 2 · Tela — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sub-aba **Funil** na aba Mensagens da campanha: o lojista escolhe um dos 4 roteiros, informa âncora + loja + nicho, revisa cada etapa com prévia de WhatsApp e confirma; cada etapa vira o par `broadcasts`+`schedules` comum, e etapa relâmpago ganha oferta em rascunho ligada.

**Architecture:** Toda a lógica mora em dois módulos puros do cliente — `funnel-plan.ts` (datas, herança de campos, gate por `missingKeys`, payloads) e `funnel-confirm.ts` (confirmação em série mensagem→oferta, retomável) — testados com `tsx --test`. Os componentes (`FunnelHero`, `FunnelStepCard`) são controlados e sem estado, testáveis com `renderToStaticMarkup`; `FunnelTab` só guarda estado e liga as peças. Loja/nicho são lidos e gravados pela rota existente `/api/settings`. Nenhuma rota nova, nenhuma migração, nenhum código de motor.

**Tech Stack:** Next.js 15 (App Router, client components), React 19, Tailwind v4 com tokens do painel (`painel-vitrine.css`), Supabase (service-role, `organizations`), `node:test` via `tsx`, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-19-funil-de-disparos-design.md` (seções 2, 3, 5, 6). Motor já em main: PR #304 (`0f1f6ee2`).

## Decisões deste plano (aprovar junto)

1. **O mockup C é traduzido para a gramática da Vitrine, não copiado.** O CI roda `npm run --workspace apps/web painel:check` (`scripts/check-painel-vitrine.ts` → `src/lib/painel/vitrine-lint.ts`) sobre `src/components/painel` e `src/app/painel`, e **reprova** exatamente o que o mockup usa: gradiente (`radial-gradient`/`linear-gradient`), `rounded-2xl`/`3xl`, `italic`, `font-editorial`, e mais de 2 fundos Acid por arquivo. O Instrument Serif também não é carregado pelo app (`--font-editorial` = Manrope). Tradução:
   - Hero Aurora VIP → peça escura **lisa** (`bg-volt-950`, sem gradiente), continua a única peça escura da tela.
   - `01/02/03` em serif itálico → `font-data` (Plex Mono), `text-slate-600`; título da seção em `font-display` bold.
   - Duplo bisel 24/18 px → `rounded-xl` externo (`bg-volt-950/[0.04] p-1.5`) + `rounded-lg` interno. Nenhum raio acima de 12 px.
   - Pílulas de roteiro, inputs e botão principal continuam `rounded-full` (o lint permite; é a assinatura da direção C).
   - Chip "Novo" da sub-aba em Cobalt, não Acid (regra 1 da Vitrine: Acid só em Postar/AO VIVO/LOTOU). O único fundo Acid da tela é o círculo do ícone no botão **Agendar N mensagens** (é o "Postar" desta tela).
   - Texto mínimo 12 px, input 16 px (`text-base`), alvo 44 px (`min-h-11`/`h-11`) — regra 4.
2. **Prévia de celular = componente `Bolha` que já existe** (`src/components/painel/bolha.tsx`, componente-assinatura 9.3 da Vitrine). Ganha duas props opcionais (`foto`, `mencaoTodos`); os 3 usos atuais não mudam. Não se cria `whatsapp-preview.tsx`.
3. **Hora não é editável por etapa na v1** (seção 5 diz "calculadas"; a mitigação da seção 10 fica para v2). Confirmado pelo Igor em 21/09.
4. **Campos da etapa herdam da etapa anterior.** Etapa com o campo vazio usa o valor da etapa anterior mais próxima que o preencheu (a Live pede peça/preço/grade/quantidade na prévia e de novo na grade; o lojista digita uma vez). O input mostra o herdado como placeholder e a dica "igual à etapa anterior"; digitar sobrescreve só aquela etapa (Dia 2 do evento troca a grade).
5. **Loja/nicho entram em `/api/settings` (GET e PATCH)**, não em rota nova. A gravação acontece ao confirmar, só se mudou; falha ao gravar vira aviso e **não** bloqueia o agendamento (a copy já foi montada no cliente com o que está na tela). PATCH desses dois campos exige a permissão `campaign:edit`.
6. **Sessão não viva "antes da 1ª chamada"** é satisfeita pela própria rota: `POST /messages` checa `isLive` **antes** de criar qualquer linha e devolve 409. A primeira etapa falha, nada é agendado, a tela mostra a mesma frase da sub-aba Agendar. Sem chamada extra de pré-checagem.
7. **Falha parcial é retomável sem duplicar.** `confirmFunnel` recebe e devolve `progress` (`scheduled: stepId→broadcastId`, `offersCreated: stepId[]`). "Tentar de novo" reenvia só o que falta — inclusive **só a oferta**, se foi ela que falhou — com o **mesmo** `funnelRunId`. Enquanto houver progresso, roteiro e âncora ficam travados (senão o chip `3/4` da Agenda mente).
8. **E2E não escreve no banco.** O Supabase de dev tem **zero** linhas em `instances` (conferido por SQL em 21/09), então todo `POST /messages` real dá 409. Além disso, um POST real enfileiraria mensagem em número de verdade — é a mesma razão pela qual `painel-vitrine-disparos.spec.ts` não posta. O E2E intercepta `POST /messages`, `POST /relampago/offers`, `PATCH /settings` e o `GET /messages` da Agenda com `page.route`, e cobra o **contrato na fronteira**: ordem mensagem→oferta, um `funnelRunId` só, `broadcastId` da oferta = id devolvido para a 3ª mensagem, e 4 linhas na Agenda com chip `Lançamento de live · n/4`. O lado banco (rascunho ligado ao broadcast e aberto pela `promote_due_schedules`) foi provado por SQL nos dois bancos no PR 1.
9. **Sub-aba só aparece na campanha.** `MessagesTab` também é usada em `/painel/comunidades/[slug]`; o Funil só aparece quando o chamador passa a prop `funil` (a página de campanha passa, a de comunidade não). Os destinos do funil são os mesmos `alvos` da aba (respeita a escolha Avisos × grupo a grupo).

## Global Constraints

- Nada de motor: não alterar `apps/web/src/lib/funnels/**`, rotas de `messages`/`relampago`, worker nem SQL. Nenhuma migração.
- Botão de confirmar gateado por `missingKeys(copy, values)` — **nunca** por `missingFields`.
- Por etapa relâmpago: `POST /api/campanhas/[slug]/messages` **primeiro**, `POST /api/relampago/offers` com `broadcastId` **depois**.
- Toda etapa vai com `scheduledAt` (ISO) e `recurrence: "none"`. Etapa relâmpago nunca é recorrente.
- `funnelTemplateId` + `funnelRunId` (uuid do `crypto.randomUUID()`) juntos em todas as mensagens da mesma confirmação.
- Fuso: hora local do navegador (`resolveStepDate`, `new Date(`${date}T${time}`)`), igual à sub-aba Agendar.
- `{quantidade}` é inteiro ≥ 1 (vira `slots` da oferta).
- Etapa no passado: desmarcada, checkbox desabilitado, aviso "Já passou", não é enviada.
- Vitrine: sem gradiente, sem `rounded-2xl/3xl`, sem `italic`/`font-editorial`, ≤2 `bg-acid` por arquivo, sem `alert()`/`confirm()` nativos, texto ≥12 px, input 16 px, alvo 44 px. Rodar `npm run --workspace apps/web painel:check` e `brand:check` (nenhuma ocorrência de "hubflow" em comentário de arquivo novo).
- Escala de texto disponível: `text-12`, `text-13`, `text-15`, `text-20`, `text-28`, `text-32` (+ `text-base` para input). Raio de chip: `rounded-chip` (token `--radius-chip`, 4 px); se o utilitário não for gerado, `rounded-sm`.
- Toda query em tabela de tenant filtra o tenant: `organizations` é chaveada por `id` = tenant, então `.eq("id", tenantId)`.
- Imutabilidade: nenhum objeto de estado é mutado; `templates.ts` é readonly — copiar antes de transformar.
- Antes do push: `npx tsc --noEmit -p apps/web` **e** `-p apps/worker`, `npm --workspace apps/web test`, `painel:check`, `brand:check`, `infra/scripts/verify-local.ps1`.

## Estrutura de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `apps/web/src/lib/settings/profile-input.ts` | criar | parse/validação de `storeName`/`niche` (puro) |
| `apps/web/src/lib/settings/profile-input.test.ts` | criar | testes do parse |
| `apps/web/src/lib/stores/organization-profile.ts` | criar | ler/gravar `organizations.name`/`niche` |
| `apps/web/src/app/api/settings/route.ts` | modificar | GET devolve e PATCH aceita `storeName`/`niche` |
| `apps/web/src/components/painel/messages/funnel/funnel-plan.ts` | criar | lógica pura da tela |
| `apps/web/src/components/painel/messages/funnel/funnel-plan.test.ts` | criar | testes |
| `apps/web/src/components/painel/messages/funnel/funnel-confirm.ts` | criar | confirmação em série, retomável |
| `apps/web/src/components/painel/messages/funnel/funnel-confirm.test.ts` | criar | testes com `post` falso |
| `apps/web/src/components/painel/bolha.tsx` | modificar | props `foto`, `mencaoTodos` |
| `apps/web/src/components/painel/bolha.test.ts` | criar | render estático |
| `apps/web/src/app/painel-vitrine.css` | modificar | `.pn-bolha__foto` |
| `apps/web/src/components/painel/messages/funnel/funnel-hero.tsx` | criar | hero escuro |
| `apps/web/src/components/painel/messages/funnel/funnel-hero.test.ts` | criar | render estático |
| `apps/web/src/components/painel/messages/funnel/funnel-step-card.tsx` | criar | card controlado de etapa |
| `apps/web/src/components/painel/messages/funnel/funnel-step-card.test.ts` | criar | render estático |
| `apps/web/src/components/painel/messages/funnel/funnel-tab.tsx` | criar | estado + seções 01/02/03 + rodapé + relatório de falha |
| `apps/web/src/components/painel/messages/messages-tab.tsx` | modificar | registra sub-aba Funil |
| `apps/web/src/app/painel/campanhas/[slug]/page.tsx` | modificar | passa a prop `funil` |
| `apps/web/e2e/painel-funil.spec.ts` | criar | E2E com rede interceptada |

## Ordem, dependências e modelos

| Task | Depends-on | Files (resumo) | Modelo |
|---|---|---|---|
| 1 store-fields | none | `lib/settings/profile-input*`, `lib/stores/organization-profile.ts`, `api/settings/route.ts` | sonnet |
| 2 funnel-plan | none | `funnel/funnel-plan*` | opus |
| 3 whatsapp-preview (Bolha) | none | `bolha.tsx`, `bolha.test.ts`, `painel-vitrine.css` | sonnet |
| 4 funnel-hero | none | `funnel/funnel-hero*` | opus |
| 5 funnel-confirm | 2 | `funnel/funnel-confirm*` | opus |
| 6 funnel-step-card | 2, 3 | `funnel/funnel-step-card*` | opus |
| 7 funnel-tab | 1, 2, 4, 5, 6 | `funnel/funnel-tab.tsx` | opus |
| 8 registro da sub-aba | 7 | `messages-tab.tsx`, `campanhas/[slug]/page.tsx` | opus |
| 9 E2E | 8 | `e2e/painel-funil.spec.ts` | opus |
| 10 verificação final | 9 | — (controller) | — |

Waves (regra de `parallel-subagent-driven-development.md`): **W1** = 1, 2, 3, 4 · **W2** = 5, 6 · **W3** = 7 · **W4** = 8 · **W5** = 9 · **W6** = 10. Implementadores não commitam; o controller commita por task, em ordem. Revisores (opus) de conformidade com o spec e de qualidade por task, **com mutantes** (ver "Mutantes obrigatórios" em cada task).

"Teste de componente" do pedido não virou task própria: cada componente leva o seu teste (Tasks 3, 4, 6), e interação real (abrir card, clicar, digitar) fica no E2E (Task 9) — o repo não tem jsdom/testing-library (`npm test` roda só `src/**/*.test.ts`, e os testes de componente existentes usam `renderToStaticMarkup`, ver `src/components/brand/logo.test.ts`).

## Preparação do worktree (controller, antes da W1)

- [ ] `EnterWorktree` com nome `funil-tela` (base `origin/main`).
- [ ] Junctions (PowerShell 5.1, sem `&&`):

```powershell
cmd /c mklink /J "<worktree>\node_modules" "C:\Users\Igor\Desktop\HubFlow-platform\node_modules"
cmd /c mklink /J "<worktree>\apps\web\node_modules" "C:\Users\Igor\Desktop\HubFlow-platform\apps\web\node_modules"
Copy-Item "C:\Users\Igor\Desktop\HubFlow-platform\.env.local" "<worktree>\.env.local"
```

- [ ] Copiar este plano para `<worktree>/docs/superpowers/plans/` e commitar: `docs(funil): plano da tela do funil de disparos`.
- [ ] Sanidade: `npm --workspace apps/web test` verde antes de qualquer mudança.

---

### Task 1: store-fields — loja e nicho por `/api/settings`

**Files:**
- Create: `apps/web/src/lib/settings/profile-input.ts`
- Create: `apps/web/src/lib/settings/profile-input.test.ts`
- Create: `apps/web/src/lib/stores/organization-profile.ts`
- Modify: `apps/web/src/app/api/settings/route.ts`

**Interfaces:**
- Produces: `GET /api/settings` → `{ ...TenantSettings, storeName: string, niche: string | null }`; `PATCH /api/settings` aceita `{ storeName?: string, niche?: string | null }` e devolve o mesmo formato. `parseProfileInput(body)` e `ProfileInput`.

- [ ] **Step 1: Teste que falha** — `apps/web/src/lib/settings/profile-input.test.ts`

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { NICHE_MAX, STORE_NAME_MAX, parseProfileInput } from "./profile-input";

test("sem os campos, não mexe em nada", () => {
  assert.deepEqual(parseProfileInput({ weeklyReportEnabled: true }), { ok: true, input: {} });
});

test("apara espaços e aceita nome e nicho", () => {
  assert.deepEqual(parseProfileInput({ storeName: "  Mega Stock ", niche: " moda infantil " }), {
    ok: true,
    input: { storeName: "Mega Stock", niche: "moda infantil" },
  });
});

test("nome vazio é recusado: a loja não pode ficar sem nome", () => {
  const r = parseProfileInput({ storeName: "   " });
  assert.equal(r.ok, false);
});

test("nicho vazio ou null vira null (apagar o nicho)", () => {
  assert.deepEqual(parseProfileInput({ niche: "  " }), { ok: true, input: { niche: null } });
  assert.deepEqual(parseProfileInput({ niche: null }), { ok: true, input: { niche: null } });
});

test("tipo errado e tamanho acima do teto são recusados", () => {
  assert.equal(parseProfileInput({ storeName: 42 }).ok, false);
  assert.equal(parseProfileInput({ niche: 7 }).ok, false);
  assert.equal(parseProfileInput({ storeName: "x".repeat(STORE_NAME_MAX + 1) }).ok, false);
  assert.equal(parseProfileInput({ niche: "x".repeat(NICHE_MAX + 1) }).ok, false);
  assert.equal(parseProfileInput({ storeName: "x".repeat(STORE_NAME_MAX) }).ok, true);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx --import ./apps/web/src/test/server-only-shim.mjs --test apps/web/src/lib/settings/profile-input.test.ts`
Expected: FAIL — `Cannot find module './profile-input'`.

- [ ] **Step 3: Implementação** — `apps/web/src/lib/settings/profile-input.ts`

```ts
/**
 * Campos da loja que o funil de disparos lê: `{loja}` = organizations.name,
 * `{nicho}` = organizations.niche. Validados aqui, na fronteira, antes de
 * qualquer escrita — o cliente não é confiável.
 */
export const STORE_NAME_MAX = 80;
export const NICHE_MAX = 60;

export type ProfileInput = { storeName?: string; niche?: string | null };

export function parseProfileInput(
  body: Record<string, unknown>,
): { ok: true; input: ProfileInput } | { ok: false; error: string } {
  const input: ProfileInput = {};

  if ("storeName" in body) {
    if (typeof body.storeName !== "string") return { ok: false, error: "Nome da loja inválido." };
    const nome = body.storeName.trim();
    if (!nome) return { ok: false, error: "O nome da loja não pode ficar vazio." };
    if (nome.length > STORE_NAME_MAX) {
      return { ok: false, error: `O nome da loja passa de ${STORE_NAME_MAX} caracteres.` };
    }
    input.storeName = nome;
  }

  if ("niche" in body) {
    if (body.niche !== null && typeof body.niche !== "string") return { ok: false, error: "Nicho inválido." };
    const nicho = (body.niche ?? "").trim();
    if (nicho.length > NICHE_MAX) return { ok: false, error: `O nicho passa de ${NICHE_MAX} caracteres.` };
    input.niche = nicho || null;
  }

  return { ok: true, input };
}
```

- [ ] **Step 4: Rodar e ver passar** — mesmo comando. Expected: 5 PASS.

- [ ] **Step 5: Store** — `apps/web/src/lib/stores/organization-profile.ts`

```ts
import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { ProfileInput } from "@/lib/settings/profile-input";

export type OrganizationProfile = { storeName: string; niche: string | null };

// `organizations` é chaveada pelo próprio tenant: `.eq("id", tenantId)` é o
// filtro de isolamento (service-role bypassa RLS — ver CLAUDE.md).
export async function getOrganizationProfile(tenantId: string): Promise<OrganizationProfile> {
  const { data, error } = await getSupabaseAdmin()
    .from("organizations")
    .select("name, niche")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { storeName: data?.name ?? "", niche: data?.niche ?? null };
}

export async function updateOrganizationProfile(
  tenantId: string,
  input: ProfileInput,
): Promise<OrganizationProfile> {
  const patch = {
    ...(input.storeName !== undefined ? { name: input.storeName } : {}),
    ...(input.niche !== undefined ? { niche: input.niche } : {}),
  };
  const { data, error } = await getSupabaseAdmin()
    .from("organizations")
    .update(patch)
    .eq("id", tenantId)
    .select("name, niche")
    .single();
  if (error) throw new Error(error.message);
  return { storeName: data.name, niche: data.niche };
}
```

- [ ] **Step 6: Rota** — `apps/web/src/app/api/settings/route.ts`. Imports novos:

```ts
import { assertPermission } from "@/lib/permissions";
import { parseProfileInput } from "@/lib/settings/profile-input";
import { getOrganizationProfile, updateOrganizationProfile } from "@/lib/stores/organization-profile";
```

GET — trocar o `try` final por:

```ts
  try {
    // O perfil é do funil; se falhar, a tela de configurações (meta do mês,
    // alertas) não pode cair junto. O funil trata ausência como campo vazio,
    // e o gate de `missingKeys` impede agendar sem loja.
    const [settings, perfil] = await Promise.all([
      getTenantSettings(tenantId),
      getOrganizationProfile(tenantId).catch(() => null),
    ]);
    return Response.json({ ...settings, ...(perfil ?? {}) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
```

PATCH — no topo, capturar também o papel: `let role: TenantRole | null;` e `({ tenantId, role } = await getRouteTenantContext(...))` (importar `type TenantRole` de `@/lib/permissions`). Logo depois do `body = await req.json()`:

```ts
  const perfil = parseProfileInput(body);
  if (!perfil.ok) return Response.json({ error: perfil.error }, { status: 400 });
  const temPerfil = Object.keys(perfil.input).length > 0;
  if (temPerfil) {
    // Nome da loja aparece nas mensagens que saem para os grupos: mesma
    // permissão de disparar pela campanha.
    if (!role) return Response.json({ error: "Sem permissão para esta ação." }, { status: 403 });
    try {
      assertPermission(role, "campaign:edit");
    } catch (e) {
      if (e instanceof Response) return e;
      throw e;
    }
  }
```

E o `try` final do PATCH vira:

```ts
  try {
    // Sem campo de settings no corpo, não toca em tenant_settings — só lê.
    const settings = !temPerfil || Object.keys(input).length > 0
      ? await updateTenantSettings(tenantId, input)
      : await getTenantSettings(tenantId);
    const perfilSalvo = temPerfil ? await updateOrganizationProfile(tenantId, perfil.input) : null;
    if (input.monthlyGoalContacts != null || input.monthlyGoalRevenue != null) {
      void trackFunnelEvent({ tenantId, userId: null, event: "goal_set", onlyFirst: true });
    }
    return Response.json({ ...settings, ...(perfilSalvo ?? {}) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
```

Atualizar o comentário do PATCH para listar `storeName?: string, niche?: string | null`.

- [ ] **Step 7: Tipos** — `npx tsc --noEmit -p apps/web`. Expected: sem erro.

- [ ] **Step 8: Prova manual da rota (dev)** — com o dev server do worktree logado (ou `curl` com cookie de sessão), `GET /api/settings` devolve `storeName`. Se não houver servidor à mão, registrar no relatório que a rota é coberta no E2E (GET real) e na Task 10.

**Mutantes obrigatórios (revisor):** (a) remover `.trim()` do nome → teste "apara espaços" tem que cair; (b) trocar `nicho || null` por `nicho` → teste "nicho vazio vira null" cai; (c) `>` por `>=` no teto → o caso `STORE_NAME_MAX` exato cai.

- [ ] **Step 9: Commit (controller)**

```bash
git add apps/web/src/lib/settings/profile-input.ts apps/web/src/lib/settings/profile-input.test.ts apps/web/src/lib/stores/organization-profile.ts apps/web/src/app/api/settings/route.ts
git commit -m "feat(funil): loja e nicho lidos e gravados por /api/settings"
```

---

### Task 2: funnel-plan — a lógica pura da tela

**Files:**
- Create: `apps/web/src/components/painel/messages/funnel/funnel-plan.ts`
- Create: `apps/web/src/components/painel/messages/funnel/funnel-plan.test.ts`

**Interfaces:**
- Consumes: `resolveStepDate`, `anchorValues`, `copyKeys`, `missingKeys`, `renderCopy` de `@/lib/funnels/render`; `FunnelStep`, `FunnelTemplate`, `FunnelField`, `FunnelTemplateId` de `@/lib/funnels/templates`.
- Produces (exatos):

```ts
export type StepMedia = { id: string; name: string; previewUrl: string };
export type StepDraft = {
  fields?: Partial<Record<FunnelField, string>>;
  customText?: string;
  mentionAll?: boolean;
  excluded?: boolean;
  media?: StepMedia;
};
export type FunnelContext = { anchor: Date; now: Date; loja: string; nicho: string; link: string };
export type StepPlan = {
  step: FunnelStep;
  at: Date;
  isPast: boolean;
  included: boolean;
  mentionAll: boolean;
  edited: boolean;
  source: string;
  values: Record<string, string>;
  missing: string[];
  quantidadeInvalida: boolean;
  text: string | null;
  preview: string;
  media?: StepMedia;
};
export type FunnelRun = { templateId: FunnelTemplateId; runId: string; groupIds: readonly string[] };
export type MessagePayload = {
  body: string; mentionAll: boolean; scheduledAt: string; recurrence: "none";
  groupIds: string[]; funnelTemplateId: FunnelTemplateId; funnelRunId: string;
  mediaId?: string; mediaType?: "image"; mediaName?: string;
};
export type OfferPayload = { name: string; keyword: "eu quero"; slots: number; broadcastId: string };

export function isoLocalDate(d: Date): string;
export function defaultAnchorDate(t: FunnelTemplate, today: Date): string;
export function anchorFrom(date: string, time: string, needsTime: boolean): Date | null;
export function inheritedFields(steps: readonly FunnelStep[], drafts: Readonly<Record<string, StepDraft>>, i: number): Partial<Record<FunnelField, string>>;
export function planFunnel(t: FunnelTemplate, drafts: Readonly<Record<string, StepDraft>>, ctx: FunnelContext): StepPlan[];
export function isBlocked(p: StepPlan): boolean;
export function blockerLabels(p: StepPlan): string[];
export function keyLabel(k: string): string;
export function stepWhen(at: Date): string;   // "sex 09/10 · 19:00"
export function stepTime(at: Date): string;   // "19:00"
export function messagePayload(p: StepPlan, run: FunnelRun): MessagePayload;
export function offerPayload(p: StepPlan, broadcastId: string): OfferPayload;
```

- [ ] **Step 1: Testes que falham** — `funnel-plan.test.ts`

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { getFunnelTemplate, type FunnelTemplate } from "@/lib/funnels/templates";
import {
  anchorFrom, blockerLabels, defaultAnchorDate, isBlocked, messagePayload, offerPayload,
  planFunnel, stepWhen, type FunnelContext, type StepDraft,
} from "./funnel-plan";

const live = getFunnelTemplate("live") as FunnelTemplate;
const grade = getFunnelTemplate("grade-do-dia") as FunnelTemplate;
const bf = getFunnelTemplate("black-friday-atacado") as FunnelTemplate;

// Sábado 10/10/2026 20:00 local; "agora" bem antes.
const ctx: FunnelContext = {
  anchor: new Date(2026, 9, 10, 20, 0),
  now: new Date(2026, 9, 1, 12, 0),
  loja: "Mega Stock",
  nicho: "moda feminina",
  link: "https://app.girumo.com.br/r/saldao",
};
const cheio: Record<string, StepDraft> = {
  "previa-da-grade": { fields: { "peça": "vestido midi", "preço": "R$ 39,90", grade: "P ao GG", quantidade: "120" } },
  "entra-agora": { fields: { "link da live": "instagram.com/mega/live" } },
};

test("renderiza a prévia da Live com loja, nicho e hora da âncora", () => {
  const [previa] = planFunnel(live, cheio, ctx);
  assert.equal(
    previa.text,
    "Amanhã 20h tem live da Mega Stock! Prévia da grade de moda feminina: vestido midi a partir de R$ 39,90 no atacado, grade P ao GG, 120 peças. Quem estiver ao vivo leva condição exclusiva.",
  );
  assert.equal(previa.missing.length, 0);
});

test("a grade da live herda peça/preço/grade/quantidade da prévia", () => {
  const plans = planFunnel(live, cheio, ctx);
  const gradeDaLive = plans[2];
  assert.equal(gradeDaLive.step.id, "grade-da-live");
  assert.equal(gradeDaLive.values["peça"], "vestido midi");
  assert.equal(isBlocked(gradeDaLive), false);
});

test("valor da própria etapa vence o herdado", () => {
  const drafts = { ...cheio, "grade-da-live": { fields: { "peça": "conjunto" } } };
  const plans = planFunnel(live, drafts, ctx);
  assert.equal(plans[2].values["peça"], "conjunto");
  assert.equal(plans[0].values["peça"], "vestido midi");
});

test("loja vazia bloqueia mesmo sem campo da etapa faltando (gate por missingKeys)", () => {
  const plans = planFunnel(live, cheio, { ...ctx, loja: "  " });
  assert.ok(plans[0].missing.includes("loja"));
  assert.equal(isBlocked(plans[0]), true);
  assert.equal(plans[0].text, null);
  assert.ok(blockerLabels(plans[0]).includes("Sua loja"));
  // "Entra agora" não usa {loja}: não bloqueia.
  assert.equal(isBlocked(plans[1]), false);
});

test("link da campanha vazio bloqueia as etapas de link", () => {
  const plans = planFunnel(live, cheio, { ...ctx, link: "" });
  const sobras = plans[3];
  assert.equal(sobras.step.id, "sobras-da-live");
  assert.deepEqual(sobras.missing, ["link"]);
  assert.ok(blockerLabels(sobras).includes("link da campanha"));
});

test("quantidade precisa ser inteiro ≥ 1", () => {
  for (const q of ["0", "1,5", "12a", "-3"]) {
    const drafts = { ...cheio, "previa-da-grade": { fields: { ...cheio["previa-da-grade"].fields, quantidade: q } } };
    const [previa] = planFunnel(live, drafts, ctx);
    assert.equal(previa.quantidadeInvalida, true, q);
    assert.equal(isBlocked(previa), true, q);
  }
});

test("etapa relâmpago com texto editado sem {quantidade} ainda exige quantidade (vira slots)", () => {
  const drafts: Record<string, StepDraft> = {
    ...cheio,
    "previa-da-grade": { fields: { "peça": "x", "preço": "y", grade: "z" } },
    "grade-da-live": { customText: "Liberado! Manda EU QUERO." },
  };
  const plans = planFunnel(live, drafts, ctx);
  assert.ok(plans[2].missing.includes("quantidade"));
});

test("texto editado prevalece e não é regenerado pelos campos", () => {
  const drafts = { ...cheio, "sobras-da-live": { customText: "Sobrou pouco, corre." } };
  const plans = planFunnel(live, drafts, ctx);
  assert.equal(plans[3].edited, true);
  assert.equal(plans[3].text, "Sobrou pouco, corre.");
});

test("texto editado vazio bloqueia", () => {
  const plans = planFunnel(live, { ...cheio, "sobras-da-live": { customText: "  " } }, ctx);
  assert.deepEqual(plans[3].missing, ["texto"]);
});

test("etapa no passado fica desmarcada; as outras não", () => {
  // Agora = sábado 19:50: a prévia (sexta 19:00) e o "Entra agora" (19:45) já passaram.
  const plans = planFunnel(live, cheio, { ...ctx, now: new Date(2026, 9, 10, 19, 50) });
  assert.deepEqual(plans.map((p) => p.included), [false, false, true, true]);
  assert.deepEqual(plans.map((p) => p.isPast), [true, true, false, false]);
});

test("etapa passada não bloqueia o botão mesmo com campo vazio", () => {
  const plans = planFunnel(live, {}, { ...ctx, now: new Date(2026, 9, 12, 0, 0) });
  assert.equal(plans.some(isBlocked), false);
});

test("desmarcar à mão exclui", () => {
  const plans = planFunnel(live, { ...cheio, "entra-agora": { ...cheio["entra-agora"], excluded: true } }, ctx);
  assert.equal(plans[1].included, false);
});

test("prévia mostra [chave] no lugar do que falta", () => {
  const [previa] = planFunnel(live, {}, ctx);
  assert.match(previa.preview, /\[peça\] a partir de \[preço\]/);
});

test("mentionAll vem do roteiro e o lojista pode trocar", () => {
  assert.equal(planFunnel(live, cheio, ctx)[1].mentionAll, true);
  assert.equal(planFunnel(live, { ...cheio, "entra-agora": { ...cheio["entra-agora"], mentionAll: false } }, ctx)[1].mentionAll, false);
});

test("payload da mensagem: agendada, sem recorrência, com o par do funil", () => {
  const plans = planFunnel(live, cheio, ctx);
  const run = { templateId: "live" as const, runId: "7d6f1e1a-0000-4000-8000-000000000001", groupIds: ["g1", "g2"] };
  const p = messagePayload(plans[2], run);
  assert.equal(p.recurrence, "none");
  assert.equal(p.scheduledAt, new Date(2026, 9, 10, 21, 30).toISOString());
  assert.equal(p.funnelTemplateId, "live");
  assert.equal(p.funnelRunId, run.runId);
  assert.deepEqual(p.groupIds, ["g1", "g2"]);
  assert.equal("mediaId" in p, false);
});

test("payload leva a foto quando anexada", () => {
  const drafts = { ...cheio, "grade-da-live": { media: { id: "m1", name: "vestido.jpg", previewUrl: "blob:x" } } };
  const p = messagePayload(planFunnel(live, drafts, ctx)[2], { templateId: "live", runId: "r", groupIds: ["g"] });
  assert.equal(p.mediaId, "m1");
  assert.equal(p.mediaType, "image");
  assert.equal(p.mediaName, "vestido.jpg");
});

test("payload recusa etapa incompleta em vez de mandar chave crua", () => {
  const [previa] = planFunnel(live, {}, ctx);
  assert.throws(() => messagePayload(previa, { templateId: "live", runId: "r", groupIds: ["g"] }));
});

test("payload da oferta: nome da etapa, 'eu quero', slots inteiros", () => {
  const plans = planFunnel(live, cheio, ctx);
  assert.deepEqual(offerPayload(plans[2], "b-3"), { name: "Grade da live", keyword: "eu quero", slots: 120, broadcastId: "b-3" });
});

test("stepWhen formata dia da semana, data e hora", () => {
  assert.equal(stepWhen(new Date(2026, 9, 9, 19, 0)), "sex 09/10 · 19:00");
  assert.equal(stepWhen(new Date(2026, 9, 11, 6, 5)), "dom 11/10 · 06:05");
});

test("âncora: data inválida dá null; sem hora usa meia-noite", () => {
  assert.equal(anchorFrom("", "20:00", true), null);
  assert.equal(anchorFrom("2026-10-10", "", true), null);
  assert.equal(anchorFrom("2026-10-10", "", false)?.getHours(), 0);
  assert.equal(anchorFrom("2026-10-10", "20:30", true)?.getMinutes(), 30);
});

test("âncora padrão: amanhã; BF usa a sugestão do roteiro", () => {
  assert.equal(defaultAnchorDate(grade, new Date(2026, 9, 1, 15, 0)), "2026-10-02");
  assert.equal(defaultAnchorDate(bf, new Date(2026, 9, 1, 15, 0)), "2026-11-06");
});
```

> Conferir o valor de `blackFridayAtacado(1/10/2026)`: última sexta de novembro de 2026 é 27/11; menos 21 dias = 06/11. Se o teste acusar outra data, recalcular à mão antes de mexer — o módulo do motor não muda.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx --import ./apps/web/src/test/server-only-shim.mjs --test apps/web/src/components/painel/messages/funnel/funnel-plan.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementação** — `funnel-plan.ts`

```ts
/**
 * Lógica pura da sub-aba Funil. Sem React, sem fetch: tudo que decide o que a
 * tela mostra e o que vai para a rota passa por aqui e é testado.
 *
 * O gate do botão é `missingKeys` sobre a copy efetiva (inclui loja, nicho,
 * link, dia e hora), nunca `missingFields` — `renderCopy` lança por qualquer
 * chave vazia, e uma exceção no meio da confirmação deixaria mensagens já
 * agendadas.
 */
import { anchorValues, missingKeys, renderCopy, resolveStepDate } from "@/lib/funnels/render";
import type { FunnelField, FunnelStep, FunnelTemplate, FunnelTemplateId } from "@/lib/funnels/templates";

export type StepMedia = { id: string; name: string; previewUrl: string };

export type StepDraft = {
  /** Só o que o lojista digitou NESTA etapa; o vazio herda (ver `inheritedFields`). */
  fields?: Partial<Record<FunnelField, string>>;
  /** Texto editado à mão. `undefined` = copy do roteiro. */
  customText?: string;
  /** `undefined` = o que o roteiro manda. */
  mentionAll?: boolean;
  excluded?: boolean;
  media?: StepMedia;
};

export type FunnelContext = { anchor: Date; now: Date; loja: string; nicho: string; link: string };

export type StepPlan = {
  step: FunnelStep;
  at: Date;
  isPast: boolean;
  included: boolean;
  mentionAll: boolean;
  edited: boolean;
  /** Copy efetiva, ainda com {chaves}: a do roteiro ou a editada. */
  source: string;
  values: Record<string, string>;
  missing: string[];
  quantidadeInvalida: boolean;
  /** Mensagem final; `null` enquanto faltar chave. */
  text: string | null;
  /** O que a bolha mostra: a mensagem com `[chave]` no lugar do que falta. */
  preview: string;
  media?: StepMedia;
};

export type FunnelRun = { templateId: FunnelTemplateId; runId: string; groupIds: readonly string[] };

export type MessagePayload = {
  body: string;
  mentionAll: boolean;
  scheduledAt: string;
  recurrence: "none";
  groupIds: string[];
  funnelTemplateId: FunnelTemplateId;
  funnelRunId: string;
  mediaId?: string;
  mediaType?: "image";
  mediaName?: string;
};

export type OfferPayload = { name: string; keyword: "eu quero"; slots: number; broadcastId: string };

const QUANTIDADE = /^[1-9]\d*$/;
const CHAVE = /\{([^}]+)\}/g;
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;

const ROTULO: Readonly<Record<string, string>> = {
  loja: "Sua loja",
  nicho: "Seu nicho",
  link: "link da campanha",
  dia: "data",
  hora: "hora",
  texto: "texto da mensagem",
};

const dois = (n: number) => String(n).padStart(2, "0");

export function isoLocalDate(d: Date): string {
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

/** Amanhã (06:00 de hoje já pode ter passado); a BF usa a sugestão do roteiro. */
export function defaultAnchorDate(t: FunnelTemplate, today: Date): string {
  if (t.suggestAnchor) return isoLocalDate(t.suggestAnchor(today));
  const amanha = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  return isoLocalDate(amanha);
}

/** Mesma montagem da sub-aba Agendar: `new Date(`${date}T${time}`)`, hora local. */
export function anchorFrom(date: string, time: string, needsTime: boolean): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const hora = needsTime ? time : "00:00";
  if (!/^\d{2}:\d{2}$/.test(hora)) return null;
  const d = new Date(`${date}T${hora}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function inheritedFields(
  steps: readonly FunnelStep[],
  drafts: Readonly<Record<string, StepDraft>>,
  i: number,
): Partial<Record<FunnelField, string>> {
  const saida: Partial<Record<FunnelField, string>> = {};
  for (const step of steps.slice(0, i + 1)) {
    for (const [campo, valor] of Object.entries(drafts[step.id]?.fields ?? {})) {
      if (valor?.trim()) saida[campo as FunnelField] = valor.trim();
    }
  }
  return saida;
}

export function planFunnel(
  t: FunnelTemplate,
  drafts: Readonly<Record<string, StepDraft>>,
  ctx: FunnelContext,
): StepPlan[] {
  const ancora = anchorValues(ctx.anchor);
  return t.steps.map((step, i) => {
    const draft = drafts[step.id] ?? {};
    const at = resolveStepDate(ctx.anchor, step);
    const isPast = at.getTime() <= ctx.now.getTime();
    const values: Record<string, string> = {
      loja: ctx.loja.trim(),
      nicho: ctx.nicho.trim(),
      link: ctx.link.trim(),
      ...ancora,
      ...inheritedFields(t.steps, drafts, i),
    };
    const edited = draft.customText !== undefined;
    const source = draft.customText ?? step.copy;
    const faltando = edited && !source.trim() ? ["texto"] : missingKeys(source, values);
    const quantidade = values.quantidade ?? "";
    // Relâmpago precisa de `slots` mesmo que o texto editado não cite {quantidade}.
    const missing = step.kind === "relampago" && !quantidade && !faltando.includes("quantidade")
      ? [...faltando, "quantidade"]
      : faltando;
    const quantidadeInvalida = quantidade !== "" && step.fields.includes("quantidade") && !QUANTIDADE.test(quantidade);
    // `missingKeys` é provadamente consistente com `renderCopy`: sem chave
    // faltando, não lança.
    const text = missing.length === 0 ? renderCopy(source, values) : null;
    const preview = source.replace(CHAVE, (_, chave: string) => values[chave]?.trim() || `[${chave}]`);
    return {
      step,
      at,
      isPast,
      included: !isPast && !draft.excluded,
      mentionAll: draft.mentionAll ?? step.mentionAll,
      edited,
      source,
      values,
      missing,
      quantidadeInvalida,
      text,
      preview,
      media: draft.media,
    };
  });
}

/** Só etapa incluída bloqueia: passada ou desmarcada não segura o botão. */
export function isBlocked(p: StepPlan): boolean {
  return p.included && (p.missing.length > 0 || p.quantidadeInvalida);
}

export function keyLabel(k: string): string {
  return ROTULO[k] ?? k;
}

export function blockerLabels(p: StepPlan): string[] {
  return [...p.missing.map(keyLabel), ...(p.quantidadeInvalida ? ["quantidade (número inteiro)"] : [])];
}

export function stepTime(at: Date): string {
  return `${dois(at.getHours())}:${dois(at.getMinutes())}`;
}

export function stepWhen(at: Date): string {
  return `${DIAS[at.getDay()]} ${dois(at.getDate())}/${dois(at.getMonth() + 1)} · ${stepTime(at)}`;
}

export function messagePayload(p: StepPlan, run: FunnelRun): MessagePayload {
  if (p.text === null) throw new Error(`etapa incompleta: ${p.step.id}`);
  return {
    body: p.text,
    mentionAll: p.mentionAll,
    scheduledAt: p.at.toISOString(),
    recurrence: "none",
    groupIds: [...run.groupIds],
    funnelTemplateId: run.templateId,
    funnelRunId: run.runId,
    ...(p.media ? { mediaId: p.media.id, mediaType: "image" as const, mediaName: p.media.name } : {}),
  };
}

export function offerPayload(p: StepPlan, broadcastId: string): OfferPayload {
  return { name: p.step.label, keyword: "eu quero", slots: Number(p.values.quantidade), broadcastId };
}
```

- [ ] **Step 4: Rodar e ver passar** — mesmo comando. Expected: todos PASS.

- [ ] **Step 5: Tipos** — `npx tsc --noEmit -p apps/web`.

**Mutantes obrigatórios (revisor):** (a) gate por `missingFields` em vez de `missingKeys` → "loja vazia bloqueia" tem que cair; (b) `<=` por `<` em `isPast` e `included: !draft.excluded` (sem `!isPast`) → teste de etapa passada cai; (c) herança lendo de `steps.slice(0, i)` (sem a própria) → "valor da própria etapa vence" cai; (d) `recurrence: "daily"` → teste do payload cai; (e) regex de quantidade `/^\d+$/` → caso `"0"` cai.

- [ ] **Step 6: Commit (controller)**

```bash
git add apps/web/src/components/painel/messages/funnel/funnel-plan.ts apps/web/src/components/painel/messages/funnel/funnel-plan.test.ts
git commit -m "feat(funil): logica pura da tela (datas, heranca, gate por missingKeys, payloads)"
```

---

### Task 3: whatsapp-preview — `Bolha` com foto e @todos

**Files:**
- Modify: `apps/web/src/components/painel/bolha.tsx`
- Modify: `apps/web/src/app/painel-vitrine.css` (logo após `.pn-bolha__check`)
- Create: `apps/web/src/components/painel/bolha.test.ts`

**Interfaces:**
- Produces: `Bolha({ grupo, hora, texto, vazio?, testId?, foto?: string, mencaoTodos?: boolean })`. `foto` é URL (blob local); `mencaoTodos` prefixa `@todos`.

- [ ] **Step 1: Teste que falha** — `bolha.test.ts`

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Bolha } from "./bolha";

const base = { grupo: "Mega Stock · Revendedoras 12", hora: "19:00", texto: "Abriu!" };

test("sem as props novas, a bolha fica como era (3 usos existentes)", () => {
  const html = renderToStaticMarkup(createElement(Bolha, base));
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /@todos/);
  assert.match(html, /Abriu!/);
});

test("foto aparece acima do texto", () => {
  const html = renderToStaticMarkup(createElement(Bolha, { ...base, foto: "blob:abc" }));
  assert.match(html, /<img[^>]*src="blob:abc"[^>]*class="pn-bolha__foto"|<img[^>]*class="pn-bolha__foto"[^>]*src="blob:abc"/);
  assert.ok(html.indexOf("<img") < html.indexOf("Abriu!"));
});

test("@todos antecede a mensagem", () => {
  const html = renderToStaticMarkup(createElement(Bolha, { ...base, mencaoTodos: true }));
  assert.ok(html.indexOf("@todos") > -1 && html.indexOf("@todos") < html.indexOf("Abriu!"));
});

test("sem texto, @todos não aparece sozinho sobre o 'vazio'", () => {
  const html = renderToStaticMarkup(createElement(Bolha, { ...base, texto: "", vazio: "aparece aqui", mencaoTodos: true }));
  assert.doesNotMatch(html, /@todos/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx --import ./apps/web/src/test/server-only-shim.mjs --test apps/web/src/components/painel/bolha.test.ts`
Expected: os 2 testes de foto/@todos FAIL.

- [ ] **Step 3: Implementação** — em `bolha.tsx`, adicionar às props:

```tsx
  /** URL da foto anexada (blob: local). A bolha só mostra; não sobe nada. */
  foto?: string;
  /** Mostra "@todos" antes do texto, como o WhatsApp mostra a menção. */
  mencaoTodos?: boolean;
```

e dentro de `.pn-bolha`, antes do texto:

```tsx
      <div className="pn-bolha" data-testid={testId}>
        {/* blob: local, não passa pelo otimizador do next/image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {foto && <img src={foto} alt="" className="pn-bolha__foto" />}
        {mencaoTodos && corpo && <span className="font-semibold text-cobalt-700">@todos </span>}
        {corpo || <span className="text-slate-600">{vazio}</span>}
```

(Se o eslint não acusar `no-img-element`, remover o comentário de disable.)

Em `painel-vitrine.css`, após `.pn-bolha__check { ... }`:

```css
.pn-bolha__foto {
  display: block;
  width: 100%;
  max-height: 180px;
  margin-bottom: 6px;
  object-fit: cover;
  border-radius: var(--radius-chip);
}
```

- [ ] **Step 4: Rodar e ver passar**; depois `npm run --workspace apps/web painel:check` (Expected: `painel:check OK`).

**Mutantes obrigatórios (revisor):** (a) renderizar `@todos` sem `&& corpo` → último teste cai; (b) mover a `<img>` para depois do texto → teste de ordem cai.

- [ ] **Step 5: Commit (controller)**

```bash
git add apps/web/src/components/painel/bolha.tsx apps/web/src/components/painel/bolha.test.ts apps/web/src/app/painel-vitrine.css
git commit -m "feat(painel): Bolha aceita foto e mencao @todos para a previa do funil"
```

---

### Task 4: funnel-hero

**Files:**
- Create: `apps/web/src/components/painel/messages/funnel/funnel-hero.tsx`
- Create: `apps/web/src/components/painel/messages/funnel/funnel-hero.test.ts`

**Interfaces:**
- Consumes: `anchorValues` de `@/lib/funnels/render`, `FunnelTemplateId`.
- Produces: `FunnelHero(props: { templateId: FunnelTemplateId; templateLabel: string; anchor: Date | null; mensagens: number; grupos: number; revendedoras: number; relampagos: number })`.

- [ ] **Step 1: Teste que falha** — `funnel-hero.test.ts`

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FunnelHero } from "./funnel-hero";

const props = {
  templateId: "live" as const,
  templateLabel: "Lançamento de live",
  anchor: new Date(2026, 9, 10, 20, 0),
  mensagens: 4,
  grupos: 8,
  revendedoras: 1842,
  relampagos: 1,
};

test("frase da live cita o dia da âncora", () => {
  const html = renderToStaticMarkup(createElement(FunnelHero, props));
  assert.match(html, /Sua live de sábado, 10\/10, pronta pra vender\./);
  assert.match(html, /Funil · Lançamento de live/);
});

test("números em pt-BR e plural certo", () => {
  const html = renderToStaticMarkup(createElement(FunnelHero, props));
  assert.match(html, /1\.842/);
  assert.match(html, />mensagens</);
  assert.match(html, />oferta relâmpago</);
  const um = renderToStaticMarkup(createElement(FunnelHero, { ...props, mensagens: 1, relampagos: 2 }));
  assert.match(um, />mensagem</);
  assert.match(um, />ofertas relâmpago</);
});

test("sem âncora válida, pede a data", () => {
  const html = renderToStaticMarkup(createElement(FunnelHero, { ...props, anchor: null }));
  assert.match(html, /Escolha a data/);
});

test("nada de gradiente nem itálico (regra 9 da Vitrine)", () => {
  const html = renderToStaticMarkup(createElement(FunnelHero, props));
  assert.doesNotMatch(html, /gradient|italic/);
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx tsx --import ./apps/web/src/test/server-only-shim.mjs --test apps/web/src/components/painel/messages/funnel/funnel-hero.test.ts`.

- [ ] **Step 3: Implementação** — `funnel-hero.tsx`

```tsx
import { anchorValues } from "@/lib/funnels/render";
import type { FunnelTemplateId } from "@/lib/funnels/templates";
import { cn } from "@/lib/utils";

const FRASE: Readonly<Record<FunnelTemplateId, (dia: string) => string>> = {
  "grade-do-dia": (dia) => `A grade de ${dia}, pronta pro grupo.`,
  "evento-2-dias": (dia) => `Seu evento de 2 dias começa ${dia}.`,
  live: (dia) => `Sua live de ${dia}, pronta pra vender.`,
  "black-friday-atacado": (dia) => `Sua Black do atacado, ${dia}.`,
};

type Props = {
  templateId: FunnelTemplateId;
  templateLabel: string;
  anchor: Date | null;
  mensagens: number;
  grupos: number;
  revendedoras: number;
  relampagos: number;
};

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

/** Única peça escura da tela (letreiro Volt). Liso: a Vitrine proíbe gradiente. */
export function FunnelHero(p: Props) {
  const frase = p.anchor ? FRASE[p.templateId](anchorValues(p.anchor).dia) : "Escolha a data para montar o roteiro.";
  return (
    <section
      aria-labelledby="funil-hero-titulo"
      className="rounded-xl border border-volt-800 bg-volt-950 p-6 text-paper-0 shadow-[var(--shadow-pn-escura)] sm:p-8"
    >
      <p className="font-data text-12 uppercase tracking-[0.08em] text-paper-0/80">Funil · {p.templateLabel}</p>
      <h2 id="funil-hero-titulo" className="font-display mt-3 text-28 font-bold tracking-[-0.02em] sm:text-32">
        {frase}
      </h2>
      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Numero valor={p.mensagens} rotulo={plural(p.mensagens, "mensagem", "mensagens")} />
        <Numero valor={p.grupos} rotulo={plural(p.grupos, "grupo", "grupos")} />
        <Numero valor={p.revendedoras} rotulo={plural(p.revendedoras, "revendedora", "revendedoras")} />
        <Numero valor={p.relampagos} rotulo={plural(p.relampagos, "oferta relâmpago", "ofertas relâmpago")} destaque />
      </dl>
    </section>
  );
}

function Numero({ valor, rotulo, destaque }: { valor: number; rotulo: string; destaque?: boolean }) {
  return (
    <div className="flex flex-col-reverse gap-1">
      <dt className="font-data text-12 uppercase tracking-[0.08em] text-paper-0/80">{rotulo}</dt>
      <dd className={cn("font-data text-28 tabular-nums", destaque && "text-acid-500")}>
        {valor.toLocaleString("pt-BR")}
      </dd>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**; `npm run --workspace apps/web painel:check`.

**Mutantes obrigatórios (revisor):** (a) `plural` sempre plural → teste de plural cai; (b) `toLocaleString()` sem `"pt-BR"` rodando em locale en → `1.842` cai (rodar com `LANG=en_US`).

- [ ] **Step 5: Commit (controller)**

```bash
git add apps/web/src/components/painel/messages/funnel/funnel-hero.tsx apps/web/src/components/painel/messages/funnel/funnel-hero.test.ts
git commit -m "feat(funil): hero escuro da sub-aba Funil"
```

---

### Task 5: funnel-confirm — confirmação em série, retomável

**Files:**
- Create: `apps/web/src/components/painel/messages/funnel/funnel-confirm.ts`
- Create: `apps/web/src/components/painel/messages/funnel/funnel-confirm.test.ts`

**Interfaces:**
- Consumes: `StepPlan`, `FunnelRun`, `messagePayload`, `offerPayload`, `planFunnel` (Task 2); `toPlanLimitError` de `@/lib/billing/plan-limit-client`.
- Produces:

```ts
export type PostJson = (url: string, body: unknown) => Promise<Response>;
export type FunnelProgress = { scheduled: Readonly<Record<string, string>>; offersCreated: readonly string[] };
export type ConfirmFailure = { stepId: string; stage: "mensagem" | "oferta"; message: string; upgradeUrl: string | null };
export type ConfirmOutcome = { progress: FunnelProgress; failure: ConfirmFailure | null };
export const EMPTY_PROGRESS: FunnelProgress;
export function isStepDone(p: StepPlan, progress: FunnelProgress): boolean;
export function confirmFunnel(opts: { slug: string; plans: readonly StepPlan[]; run: FunnelRun; progress: FunnelProgress; post: PostJson }): Promise<ConfirmOutcome>;
```

- [ ] **Step 1: Teste que falha** — `funnel-confirm.test.ts`

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { getFunnelTemplate, type FunnelTemplate } from "@/lib/funnels/templates";
import { planFunnel, type FunnelContext, type StepDraft } from "./funnel-plan";
import { EMPTY_PROGRESS, confirmFunnel, isStepDone, type PostJson } from "./funnel-confirm";

const live = getFunnelTemplate("live") as FunnelTemplate;
const ctx: FunnelContext = {
  anchor: new Date(2026, 9, 10, 20, 0),
  now: new Date(2026, 9, 1, 12, 0),
  loja: "Mega Stock",
  nicho: "moda feminina",
  link: "https://app.girumo.com.br/r/saldao",
};
const drafts: Record<string, StepDraft> = {
  "previa-da-grade": { fields: { "peça": "vestido midi", "preço": "R$ 39,90", grade: "P ao GG", quantidade: "120" } },
  "entra-agora": { fields: { "link da live": "instagram.com/mega/live" } },
};
const run = { templateId: "live" as const, runId: "7d6f1e1a-0000-4000-8000-000000000001", groupIds: ["g1"] };

type Chamada = { url: string; body: Record<string, unknown> };

/** `falhas`: índice da chamada (0-based) → resposta de erro. */
function postFalso(falhas: Record<number, Response> = {}) {
  const chamadas: Chamada[] = [];
  let msg = 0;
  const post: PostJson = async (url, body) => {
    const i = chamadas.length;
    chamadas.push({ url, body: body as Record<string, unknown> });
    if (falhas[i]) return falhas[i];
    if (url.endsWith("/messages")) {
      msg += 1;
      return Response.json({ id: `b-${msg}` }, { status: 201 });
    }
    return Response.json({ offer: { id: "o-1" } }, { status: 201 });
  };
  return { post, chamadas };
}

test("em série: mensagem antes da oferta, oferta ligada ao broadcast da própria etapa", async () => {
  const { post, chamadas } = postFalso();
  const out = await confirmFunnel({ slug: "saldao", plans: planFunnel(live, drafts, ctx), run, progress: EMPTY_PROGRESS, post });
  assert.equal(out.failure, null);
  assert.deepEqual(
    chamadas.map((c) => c.url),
    [
      "/api/campanhas/saldao/messages",
      "/api/campanhas/saldao/messages",
      "/api/campanhas/saldao/messages",
      "/api/relampago/offers",
      "/api/campanhas/saldao/messages",
    ],
  );
  assert.equal(chamadas[3].body.broadcastId, "b-3");
  assert.equal(chamadas[3].body.slots, 120);
  const mensagens = chamadas.filter((c) => c.url.endsWith("/messages"));
  assert.ok(mensagens.every((c) => c.body.funnelRunId === run.runId && c.body.recurrence === "none" && typeof c.body.scheduledAt === "string"));
  assert.deepEqual(out.progress.scheduled, { "previa-da-grade": "b-1", "entra-agora": "b-2", "grade-da-live": "b-3", "sobras-da-live": "b-4" });
  assert.deepEqual(out.progress.offersCreated, ["grade-da-live"]);
});

test("para na primeira mensagem que falha e diz qual", async () => {
  const erro = Response.json({ error: "WhatsApp desconectado. Reconecte em Conexão antes de disparar." }, { status: 409 });
  const { post, chamadas } = postFalso({ 0: erro });
  const out = await confirmFunnel({ slug: "saldao", plans: planFunnel(live, drafts, ctx), run, progress: EMPTY_PROGRESS, post });
  assert.equal(chamadas.length, 1);
  assert.deepEqual(out.progress.scheduled, {});
  assert.equal(out.failure?.stepId, "previa-da-grade");
  assert.equal(out.failure?.stage, "mensagem");
  assert.match(out.failure?.message ?? "", /WhatsApp desconectado/);
});

test("oferta falhou: a mensagem fica registrada e retomar cria SÓ a oferta, sem duplicar", async () => {
  const primeira = postFalso({ 3: Response.json({ error: "grupo ocupado" }, { status: 400 }) });
  const plans = planFunnel(live, drafts, ctx);
  const out = await confirmFunnel({ slug: "saldao", plans, run, progress: EMPTY_PROGRESS, post: primeira.post });
  assert.equal(out.failure?.stage, "oferta");
  assert.equal(out.failure?.stepId, "grade-da-live");
  assert.equal(out.progress.scheduled["grade-da-live"], "b-3");
  assert.deepEqual(out.progress.offersCreated, []);

  const segunda = postFalso();
  const retomada = await confirmFunnel({ slug: "saldao", plans, run, progress: out.progress, post: segunda.post });
  assert.equal(retomada.failure, null);
  assert.deepEqual(segunda.chamadas.map((c) => c.url), ["/api/relampago/offers", "/api/campanhas/saldao/messages"]);
  assert.equal(segunda.chamadas[0].body.broadcastId, "b-3");
});

test("etapa desmarcada ou passada não é enviada", async () => {
  const { post, chamadas } = postFalso();
  const plans = planFunnel(live, { ...drafts, "entra-agora": { ...drafts["entra-agora"], excluded: true } }, ctx);
  await confirmFunnel({ slug: "saldao", plans, run, progress: EMPTY_PROGRESS, post });
  assert.equal(chamadas.filter((c) => c.url.endsWith("/messages")).length, 3);
});

test("isStepDone: relâmpago só está feito com mensagem E oferta", () => {
  const [, , grade] = planFunnel(live, drafts, ctx);
  assert.equal(isStepDone(grade, { scheduled: { "grade-da-live": "b" }, offersCreated: [] }), false);
  assert.equal(isStepDone(grade, { scheduled: { "grade-da-live": "b" }, offersCreated: ["grade-da-live"] }), true);
});

test("não muta o progress recebido", async () => {
  const progress = { scheduled: { "previa-da-grade": "b-0" }, offersCreated: [] as string[] };
  const congelado = structuredClone(progress);
  await confirmFunnel({ slug: "saldao", plans: planFunnel(live, drafts, ctx), run, progress, post: postFalso().post });
  assert.deepEqual(progress, congelado);
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx tsx --import ./apps/web/src/test/server-only-shim.mjs --test apps/web/src/components/painel/messages/funnel/funnel-confirm.test.ts`.

- [ ] **Step 3: Implementação** — `funnel-confirm.ts`

```ts
/**
 * Confirmação do funil: N chamadas, em série, sem transação (spec 4.4).
 *
 * Por etapa: mensagem PRIMEIRO; se relâmpago, oferta DEPOIS. A rota do
 * relâmpago em modo rascunho exige um `schedules` pendente e sem recorrência
 * para o broadcast — criar a oferta antes dá 400.
 *
 * Para no primeiro erro. `progress` diz o que já existe no servidor; chamar de
 * novo com ele retoma de onde parou sem duplicar mensagem (inclusive quando o
 * que falhou foi só a oferta).
 */
import { toPlanLimitError } from "@/lib/billing/plan-limit-client";
import { messagePayload, offerPayload, type FunnelRun, type StepPlan } from "./funnel-plan";

export type PostJson = (url: string, body: unknown) => Promise<Response>;

export type FunnelProgress = {
  /** stepId → id do broadcast criado. */
  scheduled: Readonly<Record<string, string>>;
  offersCreated: readonly string[];
};

export type ConfirmFailure = {
  stepId: string;
  stage: "mensagem" | "oferta";
  message: string;
  upgradeUrl: string | null;
};

export type ConfirmOutcome = { progress: FunnelProgress; failure: ConfirmFailure | null };

export const EMPTY_PROGRESS: FunnelProgress = { scheduled: {}, offersCreated: [] };

export function isStepDone(p: StepPlan, progress: FunnelProgress): boolean {
  const id = p.step.id;
  return id in progress.scheduled && (p.step.kind !== "relampago" || progress.offersCreated.includes(id));
}

async function falha(res: Response, stepId: string, stage: ConfirmFailure["stage"], fallback: string): Promise<ConfirmFailure> {
  const erro = await toPlanLimitError(res, fallback);
  return { stepId, stage, message: erro.message, upgradeUrl: erro.upgradeUrl };
}

export async function confirmFunnel(opts: {
  slug: string;
  plans: readonly StepPlan[];
  run: FunnelRun;
  progress: FunnelProgress;
  post: PostJson;
}): Promise<ConfirmOutcome> {
  let scheduled: Readonly<Record<string, string>> = { ...opts.progress.scheduled };
  let offersCreated: readonly string[] = [...opts.progress.offersCreated];
  const agora = (failure: ConfirmFailure | null): ConfirmOutcome => ({ progress: { scheduled, offersCreated }, failure });
  const urlMensagens = `/api/campanhas/${encodeURIComponent(opts.slug)}/messages`;

  for (const p of opts.plans) {
    if (!p.included) continue;
    const id = p.step.id;

    if (!(id in scheduled)) {
      const res = await opts.post(urlMensagens, messagePayload(p, opts.run));
      if (!res.ok) return agora(await falha(res, id, "mensagem", "Erro ao agendar mensagem."));
      const criada = (await res.json().catch(() => null)) as { id?: unknown } | null;
      if (typeof criada?.id !== "string") {
        return agora({ stepId: id, stage: "mensagem", message: "A mensagem pode ter sido agendada, mas a resposta veio sem id. Confira a Agenda antes de tentar de novo.", upgradeUrl: null });
      }
      scheduled = { ...scheduled, [id]: criada.id };
    }

    if (p.step.kind === "relampago" && !offersCreated.includes(id)) {
      const res = await opts.post("/api/relampago/offers", offerPayload(p, scheduled[id]));
      if (!res.ok) return agora(await falha(res, id, "oferta", "Erro ao criar a oferta relâmpago."));
      offersCreated = [...offersCreated, id];
    }
  }
  return agora(null);
}
```

> Conferir que `toPlanLimitError` não importa nada browser-only nem `server-only` (roda no `tsx --test`). Se importar, trocar por leitura direta de `{ error }` do corpo — mas não perder o `upgradeUrl`.

- [ ] **Step 4: Rodar e ver passar**; `npx tsc --noEmit -p apps/web`.

**Mutantes obrigatórios (revisor):** (a) inverter a ordem (oferta antes da mensagem) → primeiro teste cai; (b) ignorar `opts.progress` (começar de `{}`) → teste de retomada cai (duplica mensagem); (c) não parar no erro (`continue` em vez de `return`) → segundo teste cai; (d) `offerPayload(p, "b-1")` fixo → `broadcastId` cai; (e) `scheduled[id] = ...` mutando → "não muta o progress" cai.

- [ ] **Step 5: Commit (controller)**

```bash
git add apps/web/src/components/painel/messages/funnel/funnel-confirm.ts apps/web/src/components/painel/messages/funnel/funnel-confirm.test.ts
git commit -m "feat(funil): confirmacao em serie mensagem->oferta, retomavel sem duplicar"
```

---

### Task 6: funnel-step-card

**Files:**
- Create: `apps/web/src/components/painel/messages/funnel/funnel-step-card.tsx`
- Create: `apps/web/src/components/painel/messages/funnel/funnel-step-card.test.ts`

**Interfaces:**
- Consumes: `StepPlan`, `StepDraft`, `isBlocked`, `blockerLabels`, `stepWhen`, `stepTime` (Task 2); `Bolha` com `foto`/`mencaoTodos` (Task 3).
- Produces:

```ts
export type FunnelStepCardProps = {
  plan: StepPlan;
  draft: StepDraft;
  open: boolean;
  grupoNome: string;
  uploading: boolean;
  /** Já agendada nesta rodada: não dá mais para desmarcar. */
  locked: boolean;
  onToggleOpen: () => void;
  onIncludedChange: (included: boolean) => void;
  onFieldChange: (field: FunnelField, value: string) => void;
  onMentionToggle: () => void;
  onTextChange: (text: string | undefined) => void;
  onPhotoPick: (file: File) => void;
  onPhotoRemove: () => void;
};
export function FunnelStepCard(props: FunnelStepCardProps): JSX.Element;
```

- [ ] **Step 1: Teste que falha** — `funnel-step-card.test.ts`

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunnelTemplate, type FunnelTemplate } from "@/lib/funnels/templates";
import { planFunnel, type FunnelContext, type StepDraft } from "./funnel-plan";
import { FunnelStepCard, type FunnelStepCardProps } from "./funnel-step-card";

const live = getFunnelTemplate("live") as FunnelTemplate;
const ctx: FunnelContext = {
  anchor: new Date(2026, 9, 10, 20, 0),
  now: new Date(2026, 9, 1, 12, 0),
  loja: "Mega Stock",
  nicho: "moda feminina",
  link: "https://app.girumo.com.br/r/saldao",
};
const drafts: Record<string, StepDraft> = {
  "previa-da-grade": { fields: { "peça": "vestido midi", "preço": "R$ 39,90", grade: "P ao GG", quantidade: "120" } },
};
const noop = () => {};

function card(over: Partial<FunnelStepCardProps> & { index?: number; c?: FunnelContext; d?: Record<string, StepDraft> } = {}) {
  const { index = 0, c = ctx, d = drafts, ...rest } = over;
  const plan = planFunnel(live, d, c)[index];
  const props: FunnelStepCardProps = {
    plan, draft: d[plan.step.id] ?? {}, open: false, grupoNome: "Saldão", uploading: false, locked: false,
    onToggleOpen: noop, onIncludedChange: noop, onFieldChange: noop, onMentionToggle: noop,
    onTextChange: noop, onPhotoPick: noop, onPhotoRemove: noop, ...rest,
  };
  return renderToStaticMarkup(createElement(FunnelStepCard, props));
}

test("fechado: mostra data e nome, esconde os campos", () => {
  const html = card();
  assert.match(html, /sex 09\/10 · 19:00/);
  assert.match(html, /Prévia da grade/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /id="funil-etapa-previa-da-grade"/);
});

test("aberto: a prévia reflete os campos preenchidos", () => {
  const html = card({ open: true });
  assert.match(html, /id="funil-etapa-previa-da-grade"/);
  assert.match(html, /Amanhã 20h tem live da Mega Stock! Prévia da grade de moda feminina: vestido midi/);
});

test("campo herdado aparece como placeholder com a dica", () => {
  const html = card({ open: true, index: 2 });
  assert.match(html, /placeholder="vestido midi"/);
  assert.match(html, /igual à etapa anterior/);
});

test("bloqueado: diz o que falta", () => {
  const html = card({ c: { ...ctx, loja: "" } });
  assert.match(html, /Falta: Sua loja/);
});

test("passado: checkbox desabilitado e aviso", () => {
  const html = card({ c: { ...ctx, now: new Date(2026, 9, 10, 23, 0) } });
  assert.match(html, /Já passou/);
  assert.match(html, /<input[^>]*type="checkbox"[^>]*disabled=""|<input[^>]*disabled=""[^>]*type="checkbox"/);
});

test("relâmpago tem o chip EU QUERO", () => {
  assert.match(card({ index: 2 }), /relâmpago · EU QUERO/);
});

test("texto editado mostra o aviso e troca o botão", () => {
  const d = { ...drafts, "previa-da-grade": { ...drafts["previa-da-grade"], customText: "Oi" } };
  const html = card({ open: true, d });
  assert.match(html, /Texto editado à mão/);
  assert.match(html, /Voltar ao roteiro/);
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx tsx --import ./apps/web/src/test/server-only-shim.mjs --test apps/web/src/components/painel/messages/funnel/funnel-step-card.test.ts`.

- [ ] **Step 3: Implementação** — `funnel-step-card.tsx`

```tsx
"use client";

import { AtSign, ChevronDown, ImagePlus, Link2, PencilLine, X, Zap } from "lucide-react";
import { Bolha } from "@/components/painel/bolha";
import type { FunnelField } from "@/lib/funnels/templates";
import { cn } from "@/lib/utils";
import { blockerLabels, isBlocked, stepTime, stepWhen, type StepDraft, type StepPlan } from "./funnel-plan";

export type FunnelStepCardProps = {
  plan: StepPlan;
  draft: StepDraft;
  open: boolean;
  grupoNome: string;
  uploading: boolean;
  locked: boolean;
  onToggleOpen: () => void;
  onIncludedChange: (included: boolean) => void;
  onFieldChange: (field: FunnelField, value: string) => void;
  onMentionToggle: () => void;
  onTextChange: (text: string | undefined) => void;
  onPhotoPick: (file: File) => void;
  onPhotoRemove: () => void;
};

const EXEMPLO: Readonly<Record<FunnelField, string>> = {
  "peça": "vestido midi",
  "preço": "R$ 39,90",
  grade: "P ao GG",
  quantidade: "120",
  "link da live": "instagram.com/sualoja/live",
};

const CHIP = "inline-flex items-center gap-1 rounded-chip px-2 py-0.5 text-12 font-semibold";
const FERRAMENTA =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-13 font-medium transition-colors";
const INPUT =
  "h-11 w-full rounded-lg border border-line-200 bg-canvas-100/40 px-3 text-base text-volt-950 placeholder:text-slate-600 focus:border-cobalt-500 focus:outline-none";

export function FunnelStepCard(props: FunnelStepCardProps) {
  const { plan, draft, open } = props;
  const { step } = plan;
  const corpoId = `funil-etapa-${step.id}`;
  const bloqueada = isBlocked(plan);

  return (
    <article aria-label={step.label} className="rounded-xl bg-volt-950/[0.04] p-1.5">
      <div
        className={cn(
          "rounded-lg border bg-paper-0 p-4 sm:p-5",
          bloqueada ? "border-alerta" : "border-line-200",
          !plan.included && "opacity-75",
        )}
      >
        <div className="flex items-start gap-2">
          <label className="flex h-11 w-11 shrink-0 items-center justify-center">
            <input
              type="checkbox"
              className="h-5 w-5 accent-cobalt-500"
              checked={plan.included}
              disabled={plan.isPast || props.locked}
              onChange={(e) => props.onIncludedChange(e.target.checked)}
              aria-label={`Incluir ${step.label}`}
            />
          </label>
          <button
            type="button"
            onClick={props.onToggleOpen}
            aria-expanded={open}
            aria-controls={corpoId}
            className="flex min-h-11 flex-1 items-start justify-between gap-2 text-left"
          >
            <span className="flex flex-col gap-0.5">
              <span className="font-data text-12 text-slate-600">{stepWhen(plan.at)}</span>
              <span className="text-15 font-semibold text-volt-950">{step.label}</span>
            </span>
            <ChevronDown aria-hidden className={cn("mt-2 h-5 w-5 shrink-0 text-slate-600 transition-transform", open && "rotate-180")} />
          </button>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5 pl-[52px]">
          {plan.mentionAll && <span className={cn(CHIP, "bg-cobalt-500/10 text-cobalt-700")}><AtSign aria-hidden className="h-3 w-3" />todos</span>}
          {step.kind === "link" && <span className={cn(CHIP, "bg-cobalt-500/10 text-cobalt-700")}><Link2 aria-hidden className="h-3 w-3" />link</span>}
          {step.kind === "relampago" && <span className={cn(CHIP, "bg-volt-950 text-acid-500")}><Zap aria-hidden className="h-3 w-3" />relâmpago · EU QUERO</span>}
          {step.wantsMedia && <span className={cn(CHIP, "bg-volt-950/[0.06] text-volt-950")}><ImagePlus aria-hidden className="h-3 w-3" />{draft.media ? "1 foto" : "foto"}</span>}
          {plan.edited && <span className={cn(CHIP, "bg-atencao/10 text-atencao")}>editado</span>}
        </div>

        {plan.isPast && <p className="mt-2 pl-[52px] text-12 text-slate-600">Já passou: esta etapa não será enviada.</p>}
        {props.locked && <p className="mt-2 pl-[52px] text-12 text-sucesso">Agendada. Está na Agenda.</p>}
        {bloqueada && <p className="mt-2 pl-[52px] text-12 text-alerta">Falta: {blockerLabels(plan).join(", ")}</p>}

        {open && (
          <div id={corpoId} className="mt-4 space-y-4">
            {step.fields.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {step.fields.map((campo) => {
                  const proprio = draft.fields?.[campo] ?? "";
                  const herdado = !proprio.trim() && plan.values[campo] ? plan.values[campo] : "";
                  return (
                    <label key={campo} className="flex flex-col gap-1">
                      <span className="font-data text-12 uppercase tracking-[0.08em] text-slate-600">{campo}</span>
                      <input
                        aria-label={campo}
                        type={campo === "quantidade" ? "number" : campo === "link da live" ? "url" : "text"}
                        inputMode={campo === "quantidade" ? "numeric" : undefined}
                        min={campo === "quantidade" ? 1 : undefined}
                        step={campo === "quantidade" ? 1 : undefined}
                        value={proprio}
                        placeholder={herdado || EXEMPLO[campo]}
                        onChange={(e) => props.onFieldChange(campo, e.target.value)}
                        className={INPUT}
                      />
                      {herdado && <span className="text-12 text-slate-600">igual à etapa anterior</span>}
                    </label>
                  );
                })}
              </div>
            )}

            {step.wantsMedia &&
              (draft.media ? (
                <div className="flex items-center gap-2 rounded-lg bg-canvas-100 pl-3 text-13 text-volt-950">
                  <span className="truncate">{draft.media.name}</span>
                  <button type="button" onClick={props.onPhotoRemove} aria-label="Remover foto" className="ml-auto flex h-11 w-11 items-center justify-center text-slate-600 hover:text-alerta">
                    <X aria-hidden className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line-200 px-3 text-13 text-slate-600 hover:border-cobalt-500">
                  <ImagePlus aria-hidden className="h-4 w-4" />
                  {props.uploading ? "Enviando foto…" : "Anexar 1 foto (opcional)"}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    disabled={props.uploading}
                    onChange={(e) => {
                      const arquivo = e.target.files?.[0];
                      if (arquivo) props.onPhotoPick(arquivo);
                      e.target.value = "";
                    }}
                  />
                </label>
              ))}

            <Bolha
              grupo={props.grupoNome}
              hora={stepTime(plan.at)}
              texto={plan.preview}
              foto={draft.media?.previewUrl}
              mencaoTodos={plan.mentionAll}
              testId={`funil-previa-${step.id}`}
            />

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={plan.mentionAll}
                onClick={props.onMentionToggle}
                className={cn(FERRAMENTA, plan.mentionAll ? "border-cobalt-500 bg-cobalt-500/10 text-cobalt-700" : "border-line-200 bg-paper-0 text-slate-600 hover:border-cobalt-500")}
              >
                <AtSign aria-hidden className="h-4 w-4" /> @Todos
              </button>
              <button
                type="button"
                onClick={() => props.onTextChange(plan.edited ? undefined : (plan.text ?? plan.source))}
                className={cn(FERRAMENTA, "border-line-200 bg-paper-0 text-slate-600 hover:border-cobalt-500")}
              >
                <PencilLine aria-hidden className="h-4 w-4" /> {plan.edited ? "Voltar ao roteiro" : "Editar texto"}
              </button>
            </div>

            {plan.edited && (
              <label className="flex flex-col gap-1">
                <span className="text-12 text-atencao">Texto editado à mão: mudar os campos não altera esta mensagem.</span>
                <textarea
                  aria-label={`Texto de ${step.label}`}
                  value={draft.customText ?? ""}
                  onChange={(e) => props.onTextChange(e.target.value)}
                  rows={4}
                  className="w-full resize-y rounded-lg border border-line-200 bg-canvas-100/40 px-3 py-2 text-base text-volt-950 focus:border-cobalt-500 focus:outline-none"
                />
              </label>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
```

> Tokens a confirmar no build (`git grep` no CSS gerado ou num uso existente): `rounded-chip`, `text-13`, `text-15`, `text-sucesso`, `text-atencao`, `bg-atencao/10`, `border-alerta`. Se `rounded-chip` não for gerado, usar `rounded-sm` (4 px). `pl-[52px]` = alvo do checkbox (44) + gap (8) para alinhar chips ao título.

- [ ] **Step 4: Rodar e ver passar**; `npm run --workspace apps/web painel:check`; `npx tsc --noEmit -p apps/web`.

**Mutantes obrigatórios (revisor):** (a) `disabled={props.locked}` sem `plan.isPast` → teste "passado" cai; (b) `texto={plan.text ?? ""}` em vez de `plan.preview` → "aberto: a prévia reflete" continua verde, mas a prévia fica vazia com campo faltando — o revisor deve escrever o caso (prévia com `[peça]` quando vazio) se sobreviver; (c) remover o `herdado` do placeholder → teste de herança cai.

- [ ] **Step 5: Commit (controller)**

```bash
git add apps/web/src/components/painel/messages/funnel/funnel-step-card.tsx apps/web/src/components/painel/messages/funnel/funnel-step-card.test.ts
git commit -m "feat(funil): card de etapa com campos, foto e previa do WhatsApp"
```

---

### Task 7: funnel-tab — estado, seções e confirmação

**Files:**
- Create: `apps/web/src/components/painel/messages/funnel/funnel-tab.tsx`

**Interfaces:**
- Consumes: Tasks 1 (`GET/PATCH /api/settings` com `storeName`/`niche`), 2, 4, 5, 6; `uploadMediaFile` de `@/lib/media-upload-client`; `useToast` de `@/components/toast`; `PlanLimitAlert` de `@/components/painel/plan-limit-alert`.
- Produces:

```ts
export type FunnelTabProps = {
  campaignSlug: string;
  campaignName: string;
  /** Os mesmos alvos da aba (grupo a grupo ou Avisos). */
  groupIds: string[];
  /** `https://<host>/r/<slug>`; vazio bloqueia as etapas de link. */
  masterUrl: string;
  groupCount: number;
  memberCount: number;
  /** Recarrega a Agenda e troca para ela. */
  onScheduled: () => Promise<void>;
  /** "Do zero": abre a sub-aba Agendar. */
  onFromScratch: () => void;
};
export function FunnelTab(props: FunnelTabProps): JSX.Element;
```

Sem teste unitário próprio: toda a decisão está em `funnel-plan`/`funnel-confirm` (testados); a fiação é provada pelo E2E (Task 9) e pela verificação visual (Task 10).

- [ ] **Step 1: Implementação** — `funnel-tab.tsx`

```tsx
"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { PlanLimitAlert } from "@/components/painel/plan-limit-alert";
import { useToast } from "@/components/toast";
import { uploadMediaFile } from "@/lib/media-upload-client";
import { FUNNEL_TEMPLATES, type FunnelField, type FunnelTemplateId } from "@/lib/funnels/templates";
import { cn } from "@/lib/utils";
import { FunnelHero } from "./funnel-hero";
import { FunnelStepCard } from "./funnel-step-card";
import { EMPTY_PROGRESS, confirmFunnel, isStepDone, type ConfirmFailure, type FunnelProgress } from "./funnel-confirm";
import { anchorFrom, blockerLabels, defaultAnchorDate, isBlocked, planFunnel, type StepDraft } from "./funnel-plan";

export type FunnelTabProps = {
  campaignSlug: string;
  campaignName: string;
  groupIds: string[];
  masterUrl: string;
  groupCount: number;
  memberCount: number;
  onScheduled: () => Promise<void>;
  onFromScratch: () => void;
};

const JSON_HEADERS = { "Content-Type": "application/json" };
const postJson = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });

const PILULA = "inline-flex min-h-11 items-center rounded-full border px-5 text-13 font-medium transition-colors";
const INPUT_TOPO =
  "h-11 w-full rounded-full border border-line-200 bg-canvas-100/40 px-4 text-base text-volt-950 focus:border-cobalt-500 focus:outline-none disabled:opacity-60";
const MINUTO = 60_000;

type Perfil = { loja: string; nicho: string };

export function FunnelTab(props: FunnelTabProps) {
  const toast = useToast();
  const [templateId, setTemplateId] = useState<FunnelTemplateId>(FUNNEL_TEMPLATES[0].id);
  const template = FUNNEL_TEMPLATES.find((t) => t.id === templateId) ?? FUNNEL_TEMPLATES[0];
  const [anchorDate, setAnchorDate] = useState(() => defaultAnchorDate(FUNNEL_TEMPLATES[0], new Date()));
  const [anchorTime, setAnchorTime] = useState("20:00");
  const [loja, setLoja] = useState("");
  const [nicho, setNicho] = useState("");
  const [perfilSalvo, setPerfilSalvo] = useState<Perfil | null>(null);
  const [drafts, setDrafts] = useState<Record<string, StepDraft>>({});
  const [openStep, setOpenStep] = useState<string | null>(FUNNEL_TEMPLATES[0].steps[0].id);
  const [uploading, setUploading] = useState<string | null>(null);
  const [runId, setRunId] = useState(() => crypto.randomUUID());
  const [progress, setProgress] = useState<FunnelProgress>(EMPTY_PROGRESS);
  const [failure, setFailure] = useState<ConfirmFailure | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // Loja e nicho vêm da organização; a 1ª vez o lojista preenche, as próximas já vêm.
  useEffect(() => {
    let vivo = true;
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { storeName?: string; niche?: string | null } | null) => {
        if (!vivo || !s) return;
        const salvo = { loja: s.storeName ?? "", nicho: s.niche ?? "" };
        // Não atropela o que o lojista já começou a digitar.
        setLoja((atual) => atual || salvo.loja);
        setNicho((atual) => atual || salvo.nicho);
        setPerfilSalvo(salvo);
      })
      // Sem perfil os campos ficam vazios e o gate por missingKeys segura o botão.
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  // "Já passou" muda com o relógio, não só com a âncora.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), MINUTO);
    return () => clearInterval(t);
  }, []);

  const anchor = anchorFrom(anchorDate, anchorTime, template.anchorNeedsTime);
  const ctx = anchor ? { anchor, now, loja, nicho, link: props.masterUrl } : null;
  const plans = ctx ? planFunnel(template, drafts, ctx) : [];
  const started = Object.keys(progress.scheduled).length > 0;
  const pendentes = plans.filter((p) => p.included && !isStepDone(p, progress));
  const bloqueios = pendentes.filter(isBlocked);
  const semGrupos = props.groupIds.length === 0;
  const podeAgendar = anchor !== null && !semGrupos && pendentes.length > 0 && bloqueios.length === 0 && !confirming;
  const motivo = !anchor
    ? "Escolha a data."
    : semGrupos
      ? "Esta campanha ainda não tem grupos."
      : pendentes.length === 0
        ? "Marque ao menos uma mensagem."
        : bloqueios.length > 0
          ? `Preencha: ${[...new Set(bloqueios.flatMap(blockerLabels))].join(", ")}.`
          : null;
  const incluidas = plans.filter((p) => p.included);
  const rotuloDe = (stepId: string) => template.steps.find((s) => s.id === stepId)?.label ?? stepId;

  function mudarDraft(stepId: string, muda: (d: StepDraft) => StepDraft) {
    setDrafts((atual) => ({ ...atual, [stepId]: muda(atual[stepId] ?? {}) }));
  }

  function escolherRoteiro(id: FunnelTemplateId) {
    if (started || id === templateId) return;
    const t = FUNNEL_TEMPLATES.find((x) => x.id === id) ?? FUNNEL_TEMPLATES[0];
    Object.values(drafts).forEach((d) => d.media && URL.revokeObjectURL(d.media.previewUrl));
    setTemplateId(t.id);
    setDrafts({});
    setOpenStep(t.steps[0].id);
    setAnchorDate(defaultAnchorDate(t, new Date()));
    setFailure(null);
  }

  async function anexarFoto(stepId: string, arquivo: File) {
    setUploading(stepId);
    try {
      const enviado = await uploadMediaFile(arquivo);
      const anterior = drafts[stepId]?.media;
      if (anterior) URL.revokeObjectURL(anterior.previewUrl);
      const media = { id: enviado.id, name: arquivo.name, previewUrl: URL.createObjectURL(arquivo) };
      mudarDraft(stepId, (d) => ({ ...d, media }));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao enviar a foto.", "error");
    } finally {
      setUploading(null);
    }
  }

  function removerFoto(stepId: string) {
    const media = drafts[stepId]?.media;
    if (media) URL.revokeObjectURL(media.previewUrl);
    mudarDraft(stepId, ({ media: _removida, ...resto }) => resto);
  }

  async function salvarPerfilSeMudou() {
    const atual = { loja: loja.trim(), nicho: nicho.trim() };
    if (perfilSalvo && perfilSalvo.loja === atual.loja && perfilSalvo.nicho === atual.nicho) return;
    // Falhar aqui não impede agendar: a copy já foi montada com o que está na tela.
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ storeName: atual.loja, niche: atual.nicho || null }),
    }).catch(() => null);
    if (res?.ok) setPerfilSalvo(atual);
    else toast("Não deu pra salvar loja e nicho para a próxima vez. As mensagens seguem com o que está na tela.", "error");
  }

  async function agendar() {
    if (!podeAgendar || !anchor) return;
    setConfirming(true);
    setFailure(null);
    try {
      await salvarPerfilSeMudou();
      // Recalcula com o relógio de AGORA: etapa que virou passado entre a
      // renderização e o clique não sai.
      const agora = new Date();
      setNow(agora);
      const frescos = planFunnel(template, drafts, { anchor, now: agora, loja, nicho, link: props.masterUrl });
      const out = await confirmFunnel({
        slug: props.campaignSlug,
        plans: frescos,
        run: { templateId, runId, groupIds: props.groupIds },
        progress,
        post: postJson,
      });
      if (out.failure) {
        setProgress(out.progress);
        setFailure(out.failure);
        return;
      }
      Object.values(drafts).forEach((d) => d.media && URL.revokeObjectURL(d.media.previewUrl));
      setProgress(EMPTY_PROGRESS);
      setRunId(crypto.randomUUID());
      setDrafts({});
      await props.onScheduled();
    } finally {
      setConfirming(false);
    }
  }

  const agendadas = Object.keys(progress.scheduled).map(rotuloDe);
  const n = pendentes.length;

  return (
    <div className="mx-auto w-full max-w-[760px] space-y-7">
      <FunnelHero
        templateId={templateId}
        templateLabel={template.label}
        anchor={anchor}
        mensagens={incluidas.length}
        grupos={props.groupCount}
        revendedoras={props.memberCount}
        relampagos={incluidas.filter((p) => p.step.kind === "relampago").length}
      />

      <Secao numero="01" titulo="Roteiro">
        <div role="group" aria-label="Roteiro" className="flex flex-wrap gap-2">
          {FUNNEL_TEMPLATES.map((t) => {
            const ativo = t.id === templateId;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={ativo}
                disabled={started && !ativo}
                onClick={() => escolherRoteiro(t.id)}
                className={cn(
                  PILULA,
                  ativo ? "border-volt-950 bg-volt-950 font-semibold text-paper-0" : "border-line-200 bg-paper-0 text-volt-950 hover:border-cobalt-500",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                {t.label}
              </button>
            );
          })}
          <button type="button" onClick={props.onFromScratch} className={cn(PILULA, "border-dashed border-line-200 text-slate-600 hover:text-volt-950")}>
            Do zero
          </button>
        </div>
        <p className="text-13 text-slate-600">{template.description}</p>
      </Secao>

      <Secao numero="02" titulo="Quando, e de quem">
        <Bisel>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Campo rotulo={template.anchorLabel}>
              <input type="date" value={anchorDate} disabled={started} onChange={(e) => setAnchorDate(e.target.value)} className={INPUT_TOPO} />
            </Campo>
            {template.anchorNeedsTime && (
              <Campo rotulo="Hora">
                <input type="time" value={anchorTime} disabled={started} onChange={(e) => setAnchorTime(e.target.value)} className={INPUT_TOPO} />
              </Campo>
            )}
            <Campo rotulo="Sua loja">
              <input value={loja} maxLength={80} onChange={(e) => setLoja(e.target.value)} className={INPUT_TOPO} />
            </Campo>
            <Campo rotulo="Seu nicho">
              <input value={nicho} maxLength={60} placeholder="moda infantil" onChange={(e) => setNicho(e.target.value)} className={INPUT_TOPO} />
            </Campo>
          </div>
          {started && (
            <p className="mt-3 text-12 text-slate-600">
              Parte deste funil já está na Agenda: roteiro e data ficam travados até terminar.
            </p>
          )}
        </Bisel>
      </Secao>

      <Secao
        numero="03"
        titulo={`As ${template.steps.length} mensagens`}
        aside="Troque só o que quiser. O resto já está no tom certo."
      >
        <div className="space-y-3">
          {plans.map((plan) => (
            <FunnelStepCard
              key={plan.step.id}
              plan={plan}
              draft={drafts[plan.step.id] ?? {}}
              open={openStep === plan.step.id}
              grupoNome={props.campaignName}
              uploading={uploading === plan.step.id}
              locked={isStepDone(plan, progress)}
              onToggleOpen={() => setOpenStep((atual) => (atual === plan.step.id ? null : plan.step.id))}
              onIncludedChange={(incluir) => mudarDraft(plan.step.id, (d) => ({ ...d, excluded: !incluir }))}
              onFieldChange={(campo: FunnelField, valor) =>
                mudarDraft(plan.step.id, (d) => ({ ...d, fields: { ...d.fields, [campo]: valor } }))
              }
              onMentionToggle={() => mudarDraft(plan.step.id, (d) => ({ ...d, mentionAll: !plan.mentionAll }))}
              onTextChange={(texto) =>
                mudarDraft(plan.step.id, ({ customText: _antigo, ...resto }) => (texto === undefined ? resto : { ...resto, customText: texto }))
              }
              onPhotoPick={(arquivo) => void anexarFoto(plan.step.id, arquivo)}
              onPhotoRemove={() => removerFoto(plan.step.id)}
            />
          ))}
        </div>
      </Secao>

      {failure && (
        <div role="alert" className="space-y-2 rounded-xl border border-alerta bg-paper-0 p-4 text-13 text-volt-950">
          <p className="font-semibold">Parou em “{rotuloDe(failure.stepId)}”.</p>
          <PlanLimitAlert message={failure.message} upgradeUrl={failure.upgradeUrl} />
          {failure.stage === "oferta" && (
            <p className="text-slate-600">
              A mensagem desta etapa ficou agendada sem a oferta relâmpago. Tente de novo para criar a oferta, ou cancele a mensagem na Agenda.
            </p>
          )}
          {agendadas.length > 0 && (
            <p className="text-slate-600">Já agendadas (dá pra cancelar na Agenda): {agendadas.join(", ")}.</p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 pb-6 sm:flex-row sm:items-center">
        <p id="funil-motivo" className="flex-1 text-13 text-slate-600">
          {motivo ?? "Nada sai sem você confirmar. Cada mensagem pode ser cancelada depois, na Agenda."}
        </p>
        <button
          type="button"
          onClick={() => void agendar()}
          disabled={!podeAgendar}
          aria-describedby="funil-motivo"
          className={cn(
            "inline-flex min-h-11 items-center justify-center gap-3 rounded-full py-1.5 pl-6 pr-1.5 text-15 font-semibold transition-colors",
            podeAgendar ? "bg-volt-950 text-paper-0 hover:bg-volt-900" : "cursor-not-allowed bg-line-200 text-slate-600",
          )}
        >
          Agendar {n} {n === 1 ? "mensagem" : "mensagens"}
          <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", podeAgendar ? "bg-acid-500 text-volt-950" : "bg-paper-0 text-slate-600")}>
            {confirming ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <ArrowRight aria-hidden className="h-4 w-4" />}
          </span>
        </button>
      </div>
    </div>
  );
}

function Secao({ numero, titulo, aside, children }: { numero: string; titulo: string; aside?: string; children: ReactNode }) {
  const id = `funil-secao-${numero}`;
  return (
    <section aria-labelledby={id} className="space-y-3.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span aria-hidden className="font-data text-15 text-slate-600">{numero}</span>
        <h3 id={id} className="font-display text-20 font-bold text-volt-950">{titulo}</h3>
        {aside && <p className="w-full text-12 text-slate-600 sm:ml-auto sm:w-auto">{aside}</p>}
      </div>
      {children}
    </section>
  );
}

function Bisel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl bg-volt-950/[0.04] p-1.5">
      <div className="rounded-lg border border-line-200 bg-paper-0 p-4 sm:p-5">{children}</div>
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-data text-12 uppercase tracking-[0.08em] text-slate-600">{rotulo}</span>
      {children}
    </label>
  );
}
```

> Pontos que o revisor tem que conferir contra o spec: (1) o botão usa `pendentes`/`bloqueios`, que vêm de `isBlocked` → `missingKeys`; (2) `confirmFunnel` recebe `progress` e o mesmo `runId` numa retomada; (3) ao trocar de roteiro com `started`, nada acontece; (4) `useToast` — conferir a assinatura real em `@/components/toast` (o `message-composer` chama `toast(message, "error")`); (5) sem `alert`/`confirm`.

- [ ] **Step 2: Tipos e lint** — `npx tsc --noEmit -p apps/web`; `npm run --workspace apps/web lint`; `npm run --workspace apps/web painel:check` (1 `bg-acid-500` neste arquivo; o `hover:` não conta).

- [ ] **Step 3: Commit (controller)**

```bash
git add apps/web/src/components/painel/messages/funnel/funnel-tab.tsx
git commit -m "feat(funil): sub-aba Funil (roteiro, ancora, loja, etapas e confirmacao)"
```

---

### Task 8: registro da sub-aba

**Files:**
- Modify: `apps/web/src/components/painel/messages/messages-tab.tsx`
- Modify: `apps/web/src/app/painel/campanhas/[slug]/page.tsx` (linha do `<MessagesTab`, ~333)

**Interfaces:**
- Consumes: `FunnelTab`, `FunnelTabProps` (Task 7).
- Produces: `MessagesTab` ganha a prop opcional `funil?: { campaignName: string; masterUrl: string; groupCount: number; memberCount: number }`. Sem ela, a sub-aba não existe (comunidades).

- [ ] **Step 1: `messages-tab.tsx`** — import:

```ts
import { FunnelTab } from "./funnel/funnel-tab";
```

Trocar a constante de sub-abas:

```ts
const SUB_TABS = ["Enviar agora", "Agendar", "Funil", "Agenda"] as const;
```

Adicionar ao `Props` e à desestruturação:

```ts
  /** Só a página de campanha passa: comunidade não tem funil. */
  funil?: { campaignName: string; masterUrl: string; groupCount: number; memberCount: number };
```

No map das sub-abas, filtrar e marcar o "Novo" (Cobalt, não Acid — regra 1 da Vitrine):

```tsx
        {SUB_TABS.filter((t) => t !== "Funil" || funil).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setSubTab(t)}
            className={/* classe atual inalterada */}
          >
            {t}
            {t === "Funil" && (
              <span className="text-12 ml-1.5 rounded-chip bg-cobalt-500/10 px-1.5 py-0.5 font-semibold text-cobalt-700">Novo</span>
            )}
            {/* contador da Agenda inalterado */}
          </button>
        ))}
```

No conteúdo, entre "Agendar" e "Agenda":

```tsx
        {subTab === "Funil" && funil && (
          <FunnelTab
            campaignSlug={campaignSlug}
            campaignName={funil.campaignName}
            groupIds={alvos}
            masterUrl={funil.masterUrl}
            groupCount={usarAvisos ? 1 : funil.groupCount}
            memberCount={funil.memberCount}
            onScheduled={async () => {
              await fetchMessages();
              setSubTab("Agenda");
            }}
            onFromScratch={() => setSubTab("Agendar")}
          />
        )}
```

A linha de sub-abas precisa rolar no celular com 4 itens: trocar `className="flex gap-1"` do container por `className="flex gap-1 overflow-x-auto"` e acrescentar `shrink-0` nos botões.

- [ ] **Step 2: `page.tsx`** — trocar a linha do `<MessagesTab`:

```tsx
          <MessagesTab
            campaignSlug={campanha.slug ?? campanha.id}
            groupIds={campanha.groupIds}
            funil={{ campaignName: campanha.name, masterUrl, groupCount: o.groupCount, memberCount: o.totalMembers }}
          />
```

(`masterUrl` já existe na página, linha ~173; `o` é o resumo já usado no cabeçalho.)

- [ ] **Step 3: Tipos, testes e gates** — `npx tsc --noEmit -p apps/web`; `npm --workspace apps/web test`; `painel:check`; `brand:check`.

- [ ] **Step 4: Commit (controller)**

```bash
git add apps/web/src/components/painel/messages/messages-tab.tsx "apps/web/src/app/painel/campanhas/[slug]/page.tsx"
git commit -m "feat(funil): registra a sub-aba Funil na aba Mensagens da campanha"
```

---

### Task 9: E2E — Live de ponta a ponta na fronteira de rede

**Files:**
- Create: `apps/web/e2e/painel-funil.spec.ts`

**Interfaces:**
- Consumes: a tela (Tasks 7–8), `exigeCredenciais` de `./sessao-helpers`.

- [ ] **Step 1: Spec** — `apps/web/e2e/painel-funil.spec.ts`

```ts
import { expect, test, type Page } from "@playwright/test";

import { exigeCredenciais } from "./sessao-helpers";

/**
 * Sub-aba Funil. NÃO escreve no banco, de propósito:
 * - o Supabase de dev não tem `instances` (21/09/2026), então todo POST real
 *   de mensagem devolve 409 "WhatsApp desconectado";
 * - e onde houver sessão viva, um POST real poria mensagem na fila de um
 *   número de verdade (mesma razão de painel-vitrine-disparos.spec.ts).
 *
 * O que se cobra é o CONTRATO na fronteira de rede: ordem mensagem→oferta, um
 * funnelRunId só, a oferta ligada ao broadcast da 3ª mensagem, e a Agenda
 * mostrando o chip do funil. O lado banco (rascunho aberto pela
 * promote_due_schedules) foi provado por SQL nos dois bancos no PR #304.
 */

type Campanha = { id: string; slug?: string; groupIds: string[] };
type Chamada = { alvo: "mensagem" | "oferta"; body: Record<string, unknown> };

exigeCredenciais();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function daquiA(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function campanhaComGrupos(page: Page): Promise<Campanha> {
  const res = await page.request.get("/api/campanhas");
  expect(res.ok(), `GET /api/campanhas respondeu ${res.status()}`).toBeTruthy();
  const campanha = ((await res.json()) as Campanha[]).find((c) => c.slug && c.groupIds.length > 0);
  test.skip(!campanha, "o tenant de QA não tem campanha com slug e grupos");
  return campanha as Campanha;
}

/** Intercepta toda escrita; o GET da Agenda devolve o que "foi criado". */
async function simularServidor(page: Page, campanha: Campanha) {
  const chamadas: Chamada[] = [];
  const agenda: Record<string, unknown>[] = [];
  let n = 0;

  await page.route(`**/api/campanhas/${campanha.slug}/messages`, async (rota) => {
    const req = rota.request();
    if (req.method() === "GET") return rota.fulfill({ json: agenda });
    if (req.method() !== "POST") return rota.continue();
    const body = req.postDataJSON() as Record<string, unknown>;
    chamadas.push({ alvo: "mensagem", body });
    n += 1;
    const view = {
      id: `00000000-0000-4000-8000-0000000f00${String(n).padStart(2, "0")}`,
      campaignId: campanha.id,
      campaignSlug: campanha.slug,
      type: "text",
      body: body.body,
      groupIds: body.groupIds,
      mentionAll: body.mentionAll,
      scheduledAt: body.scheduledAt,
      recurrence: "none",
      status: "scheduled",
      sent: 0,
      total: 0,
      createdAt: new Date().toISOString(),
      funnelTemplateId: body.funnelTemplateId,
      funnelRunId: body.funnelRunId,
    };
    agenda.push(view);
    return rota.fulfill({ status: 201, json: view });
  });

  await page.route("**/api/relampago/offers", async (rota) => {
    if (rota.request().method() !== "POST") return rota.continue();
    chamadas.push({ alvo: "oferta", body: rota.request().postDataJSON() as Record<string, unknown> });
    return rota.fulfill({ status: 201, json: { offer: { id: "oferta-e2e", status: "draft" } } });
  });

  await page.route("**/api/settings", async (rota) => {
    if (rota.request().method() !== "PATCH") return rota.continue();
    return rota.fulfill({ json: { storeName: "Loja E2E", niche: "moda infantil" } });
  });

  return { chamadas, agenda };
}

async function abrirFunilDaLive(page: Page, slug: string) {
  await page.goto(`/painel/campanhas/${slug}`, { waitUntil: "load" });
  await page.getByRole("button", { name: "Mensagens", exact: true }).click();
  await page.getByRole("button", { name: /^Funil/ }).click();
  await page.getByRole("button", { name: "Lançamento de live" }).click();
  await page.getByLabel("Dia e hora da live", { exact: true }).fill(daquiA(10));
  await page.getByLabel("Hora", { exact: true }).fill("20:00");
  await page.getByLabel("Sua loja", { exact: true }).fill("Loja E2E");
  await page.getByLabel("Seu nicho", { exact: true }).fill("moda infantil");
}

test("Live: 4 mensagens em série, oferta ligada à 3ª, chip na Agenda", async ({ page }) => {
  const campanha = await campanhaComGrupos(page);
  const { chamadas } = await simularServidor(page, campanha);
  await abrirFunilDaLive(page, campanha.slug as string);

  const previa = page.getByRole("article", { name: "Prévia da grade" });
  await previa.getByLabel("peça", { exact: true }).fill("vestido midi");
  await previa.getByLabel("preço", { exact: true }).fill("R$ 39,90");
  await previa.getByLabel("grade", { exact: true }).fill("P ao GG");
  await previa.getByLabel("quantidade", { exact: true }).fill("120");
  await expect(page.getByTestId("funil-previa-previa-da-grade")).toContainText("Amanhã 20h tem live da Loja E2E!");

  const entra = page.getByRole("article", { name: "Entra agora" });
  await entra.getByRole("button", { name: /Entra agora/ }).click();
  await entra.getByLabel("link da live", { exact: true }).fill("https://instagram.com/lojae2e/live");

  const agendar = page.getByRole("button", { name: /^Agendar 4 mensagens/ });
  await expect(agendar).toBeEnabled();
  await agendar.click();

  // A Agenda é a prova de que a confirmação terminou.
  await expect(page.getByText("Lançamento de live · 4/4")).toBeVisible();
  for (const i of [1, 2, 3]) await expect(page.getByText(`Lançamento de live · ${i}/4`)).toBeVisible();

  expect(chamadas.map((c) => c.alvo)).toEqual(["mensagem", "mensagem", "mensagem", "oferta", "mensagem"]);
  const mensagens = chamadas.filter((c) => c.alvo === "mensagem").map((c) => c.body);
  const runIds = new Set(mensagens.map((m) => m.funnelRunId));
  expect(runIds.size).toBe(1);
  expect(String([...runIds][0])).toMatch(UUID);
  for (const m of mensagens) {
    expect(m.funnelTemplateId).toBe("live");
    expect(m.recurrence).toBe("none");
    expect(typeof m.scheduledAt).toBe("string");
    expect(String(m.body)).not.toMatch(/\{[^}]+\}/);
  }
  const oferta = chamadas[3].body;
  expect(oferta.broadcastId).toBe("00000000-0000-4000-8000-0000000f0003");
  expect(oferta.slots).toBe(120);
  expect(oferta.keyword).toBe("eu quero");
});

test("sem 'Sua loja' o botão não agenda e diz o que falta", async ({ page }) => {
  const campanha = await campanhaComGrupos(page);
  const { chamadas } = await simularServidor(page, campanha);
  await abrirFunilDaLive(page, campanha.slug as string);
  await page.getByLabel("Sua loja", { exact: true }).fill("");

  await expect(page.getByRole("button", { name: /^Agendar/ })).toBeDisabled();
  await expect(page.locator("#funil-motivo")).toContainText("Sua loja");
  expect(chamadas).toHaveLength(0);
});
```

- [ ] **Step 2: Rodar contra o servidor do WORKTREE** (não usar `preview_start`: ele serve o checkout principal). Subir o dev do worktree numa porta livre e apontar o Playwright:

```powershell
$env:E2E_BASE_URL = "http://localhost:3100"
npx --workspace apps/web playwright test e2e/painel-funil.spec.ts --reporter=list
```

(Se a config do Playwright subir o servidor sozinha com `reuseExistingServer`, conferir que não há órfão na porta — memória `finding-e2e-mutacao-servidor-errado`.) Expected: 2 passed.

**Mutantes obrigatórios (revisor):** rodar o spec com cada mutante e ver vermelho: (a) em `funnel-confirm.ts`, oferta antes da mensagem → ordem cai; (b) em `funnel-tab.tsx`, gerar `crypto.randomUUID()` por mensagem → `runIds.size` cai; (c) em `funnel-plan.ts`, gate por `missingFields` → 2º teste cai (botão habilita sem loja). Reverter cada mutante depois.

- [ ] **Step 3: Commit (controller)**

```bash
git add apps/web/e2e/painel-funil.spec.ts
git commit -m "test(funil): E2E da Live na fronteira de rede, sem escrever no banco"
```

---

### Task 10: verificação final (controller)

- [ ] Revisão final do conjunto (opus), olhando o diff inteiro contra o spec — memória `pattern-revisao-final-pega-o-que-revisao-por-task-nao-ve`.
- [ ] `npx tsc --noEmit -p apps/web` e `npx tsc --noEmit -p apps/worker` (separados).
- [ ] `npm --workspace apps/web test`, `npm run --workspace apps/web lint`, `painel:check`, `brand:check`.
- [ ] `infra/scripts/verify-local.ps1`.
- [ ] **Verificação visual obrigatória**, servidor do worktree (Playwright, viewport real — pane oculto dá 0x0): screenshot da sub-aba Funil em 1280 px e em 390 px, com a Live escolhida e a 1ª etapa aberta; console sem erro. Gravar fora do repo (memória `finding-e2e-results-e-limpo-a-cada-run`) e enviar ao Igor.
- [ ] Conferir em 390 px: coluna ocupa a tela, sub-abas rolam, botão principal não estoura, alvos ≥ 44 px.
- [ ] `git diff --cached` em chamada separada antes de cada commit; nunca `git add -A`.
- [ ] Push, PR (corpo com decisões 1–9 deste plano, prova visual e resultado dos mutantes), CI verde, merge, apagar branch — nesta sessão.
- [ ] Entregar ao Igor o SQL do quadro (prod), sem executar:

```sql
select public.move_card('funil-de-disparos', 'no_ar_nao_verificado', 'Tela do funil mergeada; falta prova em producao', 'PR #<N>');
```

## Fora de escopo (v2, sessão nova)

Resultados por funil; cancelar o funil inteiro; recorrência da Grade do dia; hora editável por etapa / hora por praça; copy por nicho; roteiros salvos pelo lojista.
