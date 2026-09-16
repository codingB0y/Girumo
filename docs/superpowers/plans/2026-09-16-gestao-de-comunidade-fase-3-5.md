# Gestão de Comunidade — Fases 3 a 5 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar à comunidade seu próprio link de compartilhamento (`/c/[slug]`), disparo de mensagem pela tela certa, e — a única peça com schema novo — alcance real deduplicado + sugestão de cobertura de grupos, alimentados pelo sync que já existe.

**Architecture:** Fase 5 extrai a lógica de resolução de clique de `/r/[slug]` pra um módulo compartilhado em `lib/`, e `/c/[slug]` vira um segundo wrapper fino sobre ele — mesma rotação de grupo, tracking próprio. Fase 4 acrescenta o componente `MessagesTab` (já genérico por slug) na tela de comunidade — o motor de disparo não muda. Fase 3 adiciona `group_participants` (tabela nova), populada pelo sync de grupos que já busca participantes completos no caminho feliz — zero chamada nova à Evolution — e um algoritmo guloso puro de cobertura.

**Tech Stack:** Next.js 15 (App Router) · Supabase (dois bancos) · TypeScript strict · Tailwind

**Spec:** `docs/superpowers/specs/2026-09-16-gestao-de-comunidade-fase-3-5-design.md`

## Global Constraints

- **A migração da Fase 3 vai nos DOIS bancos:** dev `wfjuwogxaupyadwhvoxy` e prod `nidoatbxaylrkcgbszns`. Aplicar só em um cria drift silencioso.
- **DDL é passo humano.** O classificador de permissão do agente bloqueia `apply_migration`/DDL direto — a task de migração termina com a SQL pronta e a instrução de rodar manualmente nos dois bancos, não com a migração aplicada.
- **Toda query em tabela com `tenant_id` leva o filtro `tenant_id` explícito.** O service-role bypassa RLS; esse filtro é a proteção real.
- **RLS ligado + policy no padrão `app.has_membership(tenant_id)`** (`for all using (...) with check (...)`) — nunca GUC.
- **`campaign_groups.group_ids` guarda `whatsapp_group_id`, não UUID.** `group_participants.whatsapp_group_id` segue o mesmo padrão — é o `g.id` que a Evolution devolve, não um UUID interno.
- **Depois de aplicar a migração da Fase 3 nos dois bancos:** regenerar `deploy/supabase/schema-baseline.json` (via `schema_signature()` — ver Task 5) e acrescentar a migração em `deploy/supabase/apply-order.txt`.
- **Antes de criar a migração da Fase 3, confirmar por SQL nos dois bancos que `group_participants` ainda não existe** e que o timestamp escolhido (`20260917000000` — ajustar se já não for o próximo disponível) não colide com uma migração já aplicada por outra branch.
- **Antes de push:** rodar `.\infra\scripts\verify-local.ps1` (gate real do CI: scan de secrets + build) e os dois `tsc` — `npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.json` e `--project tsconfig.e2e.json`. `lint`/`tsx --test` não checam tipo.
- **PowerShell 5.1:** sem `&&`/`||`. Encadear com `;`. `pwsh` não existe nesta máquina — é `powershell`.
- **Em worktree, usar caminho absoluto ou `cd` no início de cada chamada de Bash** — o cwd reseta entre chamadas.
- **Nunca `git add -A`** — conferir `git diff --cached` numa chamada separada antes de commitar.
- **Testes rodam com o shim:** `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>` para arquivos que importam algo com `"server-only"`. Arquivos puros (sem `server-only` na cadeia de import) rodam sem o shim — ver os testes existentes de cada módulo pra saber qual usar.
- **Um PR por fase** (5, depois 4, depois 3), nessa ordem — não empilhar as três em paralelo. Cada PR fecha (revisar → CI verde → mergear → deletar branch) antes de abrir o próximo.
- **Rota nova do painel não entra na allowlist `ENGINE_ONLY`** — `/painel/comunidades/[slug]` e `/c/[slug]` são rotas de usuário final/painel, não da engine.

---

## File Structure

### Fase 5 — `/c/[slug]`

| arquivo | responsabilidade |
|---|---|
| `apps/web/src/lib/links/deep-link.ts` | **modificar** — `rememberCookieHeader` recebe o path completo do cookie, não monta `/r/` sozinho |
| `apps/web/src/lib/links/deep-link.test.ts` | **modificar** — assertions com o novo parâmetro |
| `apps/web/src/lib/links/decisao.ts` | **mover** de `apps/web/src/app/r/[slug]/decisao.ts` (lógica pura, sem por que ficar sob `app/`) |
| `apps/web/src/lib/links/decisao.test.ts` | **mover** de `apps/web/src/app/r/[slug]/route.integracoes.test.ts`, renomeado |
| `apps/web/src/lib/links/short-link-click.ts` | **criar** — a lógica de `GET /r/[slug]` extraída, parametrizada só por `req` e `slug`; deriva o prefixo do cookie (`/r/` ou `/c/`) da própria URL da requisição |
| `apps/web/src/app/r/[slug]/route.ts` | **modificar** — vira wrapper fino chamando `handleShortLinkClick` |
| `apps/web/src/app/c/[slug]/route.ts` | **criar** — wrapper fino idêntico, mesma função compartilhada |

### Fase 4 — disparo pela comunidade

| arquivo | responsabilidade |
|---|---|
| `apps/web/src/app/painel/comunidades/[slug]/page.tsx` | **modificar** — acrescenta seção "Mensagens" com `MessagesTab` |

### Fase 3 — `group_participants`, alcance real, cobertura

| arquivo | responsabilidade |
|---|---|
| `apps/web/supabase/migrations/20260917000000_group_participants.sql` | tabela nova + RLS |
| `apps/web/src/lib/communities/cobertura.ts` | algoritmo guloso puro |
| `apps/web/src/lib/communities/cobertura.test.ts` | testes do algoritmo |
| `apps/web/src/lib/stores/group-participants.ts` | upsert em lote + leitura por lista de grupos, filtrado por tenant |
| `apps/web/src/lib/stores/group-participants.test.ts` | teste de tenant vazio recusado |
| `apps/web/src/app/api/groups/sync/route.ts` | **modificar** — grava `group_participants` depois de `partitionByAdmin` |
| `apps/web/src/app/api/comunidades/[slug]/cobertura/route.ts` | **criar** — `GET` devolvendo alcance real + sugestão |
| `apps/web/src/app/painel/comunidades/[slug]/page.tsx` | **modificar** — seção "Cobertura" + alcance real substituindo a soma ingênua |

---

# FASE 5 — `/c/[slug]`

### Task 1: `rememberCookieHeader` recebe o path completo do cookie

**Por quê primeiro:** hoje a função monta `Path=/r/${slug}` internamente. Se `/c/[slug]` reusar a lógica sem mudar isso, o cookie de "grupo lembrado" de quem clicar via `/c/` fica com `Path=/r/<slug>` — o navegador nunca vai reenviar esse cookie numa visita seguinte a `/c/<slug>` (paths diferentes), e a rotação "lota sozinho" perde a memória de quem já entrou. Corrigir aqui, antes de extrair a rota, evita nascer com esse bug.

**Files:**
- Modify: `apps/web/src/lib/links/deep-link.ts`
- Modify: `apps/web/src/lib/links/deep-link.test.ts`
- Modify: `apps/web/src/app/r/[slug]/route.ts:95` (único call site de produção)

**Interfaces:**
- Produces: `rememberCookieHeader(name: string, whatsappGroupId: string, cookiePath: string, secure: boolean): string` (era `slug: string`, agora recebe o path pronto, ex.: `/r/saldao` ou `/c/saldao`)

- [ ] **Step 1: Atualizar o teste primeiro**

Em `apps/web/src/lib/links/deep-link.test.ts`, trocar as linhas 32-36:

```typescript
// Header de gravação: HttpOnly, Lax, 90 dias, path como veio; Secure só em https.
const h = rememberCookieHeader("gr_x", "1203@g.us", "/r/saldao", true);
assert.equal(h, `gr_x=1203%40g.us; Path=/r/saldao; Max-Age=${REMEMBER_MAX_AGE_S}; HttpOnly; SameSite=Lax; Secure`);
assert.equal(rememberCookieHeader("gr_x", "1203@g.us", "/r/saldao", false).includes("Secure"), false);
assert.equal(rememberCookieHeader("gr_x", "1203@g.us", "/c/saldao", true).includes("Path=/c/saldao"), true);
assert.equal(REMEMBER_MAX_AGE_S, 90 * 24 * 60 * 60);
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd apps/web && npx tsx --test src/lib/links/deep-link.test.ts
```

Esperado: FAIL — `Path=/r//r/saldao` ou parecido (a implementação ainda monta `/r/${slug}` por conta própria em cima do que já vem prefixado).

- [ ] **Step 3: Implementar**

Em `apps/web/src/lib/links/deep-link.ts`, trocar a assinatura e o corpo de `rememberCookieHeader`:

```typescript
export function rememberCookieHeader(name: string, whatsappGroupId: string, cookiePath: string, secure: boolean): string {
  const attrs = [
    `${name}=${encodeURIComponent(whatsappGroupId)}`,
    `Path=${cookiePath}`,
    `Max-Age=${REMEMBER_MAX_AGE_S}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}
```

- [ ] **Step 4: Atualizar o único call site de produção**

Em `apps/web/src/app/r/[slug]/route.ts:95`, trocar:

```typescript
headers.append("set-cookie", rememberCookieHeader(cookieName, target.groupId, slug, reqUrl.protocol === "https:"));
```

por:

```typescript
headers.append("set-cookie", rememberCookieHeader(cookieName, target.groupId, `/r/${slug}`, reqUrl.protocol === "https:"));
```

- [ ] **Step 5: Rodar e ver passar**

```bash
cd apps/web && npx tsx --test src/lib/links/deep-link.test.ts
```

Esperado: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/links/deep-link.ts apps/web/src/lib/links/deep-link.test.ts "apps/web/src/app/r/[slug]/route.ts"
git commit -m "fix(links): rememberCookieHeader recebe o path completo do cookie"
```

---

### Task 2: Extrair a lógica de `/r/[slug]` pra `lib/links/short-link-click.ts`

**Por quê:** `/c/[slug]` precisa da MESMA lógica de resolução de clique (rotação de grupo, cookie, CAPI, deep link) com tracking próprio — não uma cópia de 200+ linhas (isso duplicaria todo bug futuro) nem um redirect (perde tracking e confunde a URL). A extração é o meio-termo: uma função só, dois wrappers finos.

**Files:**
- Move: `apps/web/src/app/r/[slug]/decisao.ts` → `apps/web/src/lib/links/decisao.ts`
- Move: `apps/web/src/app/r/[slug]/route.integracoes.test.ts` → `apps/web/src/lib/links/decisao.test.ts`
- Create: `apps/web/src/lib/links/short-link-click.ts`
- Modify: `apps/web/src/app/r/[slug]/route.ts`

**Interfaces:**
- Consumes: `resolveClickTarget` (`@/lib/links/resolve-click-target`), `rememberCookieHeader` da Task 1
- Produces: `handleShortLinkClick(req: Request, slug: string): Promise<Response>`

- [ ] **Step 1: Mover `decisao.ts` e seu teste**

```bash
cd apps/web
git mv "src/app/r/[slug]/decisao.ts" "src/lib/links/decisao.ts"
git mv "src/app/r/[slug]/route.integracoes.test.ts" "src/lib/links/decisao.test.ts"
```

O conteúdo dos dois arquivos não muda — `decisao.ts` já não importa nada relativo a `app/`, e `decisao.test.ts` importa `./decisao`, que continua válido no novo diretório.

- [ ] **Step 2: Rodar o teste movido pra confirmar que nada quebrou só de mudar de lugar**

```bash
cd apps/web && npx tsx --test src/lib/links/decisao.test.ts
```

Esperado: PASS (mesmo conteúdo, novo caminho).

- [ ] **Step 3: Criar `short-link-click.ts` com o conteúdo de `route.ts` extraído**

Copiar o corpo inteiro do `GET` atual de `apps/web/src/app/r/[slug]/route.ts` (função `GET`, `legacyGet`, `html`, `notFoundPage`, `fullPage`, `BOT_UA`, `BLOCKED_MESSAGE`) para o arquivo novo, com três mudanças:

1. A função exportada chama-se `handleShortLinkClick(req: Request, slug: string): Promise<Response>` (em vez de `GET(req, ctx)` recebendo `ctx.params`).
2. O import de `./decisao` vira `./decisao` (mesmo caminho relativo, já que os dois arquivos estão agora no mesmo diretório `lib/links/`).
3. Onde hoje `cookieName` monta o cookie (linha ~95), o path passa a ser derivado do prefixo real da URL da requisição:

```typescript
const prefix = new URL(req.url).pathname.startsWith("/c/") ? "/c/" : "/r/";
// ...
headers.append("set-cookie", rememberCookieHeader(cookieName, target.groupId, `${prefix}${slug}`, reqUrl.protocol === "https:"));
```

Arquivo completo:

```typescript
// apps/web/src/lib/links/short-link-click.ts
import { USE_SUPABASE } from "@/lib/stores/use-supabase";
import * as linksStore from "@/lib/stores/tracked-links";
import * as campaignsStore from "@/lib/stores/campaign-groups";
import * as groupsStore from "@/lib/stores/groups";
import { resolveClickTarget, type BlockedReason } from "@/lib/links/resolve-click-target";
import { getLink, recordClick, clickCounts, type ClickEvent } from "@/lib/store";
import { findCampanhaBySlug } from "@/lib/campanhas-store";
import { listGroups as listLegacyGroups, nextAvailableGroup as legacyNextGroup } from "@/lib/groups-store";
import { after } from "next/server";
import {
  ENTRADA_DEFAULTS,
  INTEGRACOES_DEFAULTS,
  hasIntegracao,
  readEntrada,
  readIntegracoes,
} from "@/lib/campaigns/settings";
import { buildCapiPayload, firstForwardedIp, sendCapiEvent } from "@/lib/campaigns/meta-capi";
import { lotadoRedirect, renderBlockedPage, renderEntryPage } from "@/lib/campaigns/entry-page";
import { isMobileUa, readCookie, rememberCookieHeader, rememberCookieName, whatsappDeepLink } from "@/lib/links/deep-link";
import { capiEnvio, pixelDaTela } from "./decisao";

// Crawlers/previews que NÃO são cliques humanos (não inflam o funil/CPL).
const BOT_UA =
  /bot|crawler|spider|facebookexternalhit|facebookcatalog|whatsapp|telegram|slurp|bingpreview|preview|curl|wget|python-requests|axios|headless|monitor|pingdom|uptime/i;

// Mensagem por motivo de bloqueio. "Sem convite"/"sem grupo" NÃO podem dizer
// "cheio": o grupo pode estar vazio e só faltar configuração no painel — mentir
// pro visitante esconde justamente o que o lojista precisa arrumar.
const BLOCKED_MESSAGE: Record<BlockedReason, string> = {
  "cap-reached": "Este grupo já está cheio. Em breve abriremos um novo lote. 💛",
  "all-full": "Todos os grupos desta campanha estão cheios. Em breve abriremos um novo. 💛",
  "no-invite": "Esta campanha ainda não está aberta. Volte daqui a pouco. 💛",
  "no-admin": "Esta campanha ainda não está aberta. Volte daqui a pouco. 💛",
  "empty-pool": "Esta campanha ainda não está aberta. Volte daqui a pouco. 💛",
  closed: "Esta campanha já encerrou. Fique de olho: em breve tem novidade. 💛",
};

/**
 * Resolve um clique em `/r/:slug` ou `/c/:slug` para um redirecionamento de
 * grupo. Extraído do route handler porque `/c/[slug]` precisa da MESMA lógica
 * com tracking próprio — o prefixo da URL da requisição decide o `Path` do
 * cookie de "grupo lembrado", nada mais muda por prefixo.
 *
 * Dois tipos de link:
 *  1) link MESTRE de campanha (`campaign_group_id` preenchido) → grupo lembrado
 *     pelo cookie ou próximo grupo DISPONÍVEL do pool ("lota sozinho"), obedecendo
 *     às configurações de entrada da campanha (deep link, encerramento, lotado).
 *  2) link comum → destino fixo, respeitando clickCap ("grupo cheio").
 */
export async function handleShortLinkClick(req: Request, slug: string): Promise<Response> {
  const ua = req.headers.get("user-agent") ?? "";
  // Só conta clique de gente real — bot/preview/crawler redireciona mas não conta.
  const human = !BOT_UA.test(ua);

  if (!USE_SUPABASE) return legacyGet(req, slug, ua, human);

  const link = await linksStore.getTrackedLinkBySlug(slug);
  if (!link) return notFoundPage();

  // Daqui pra baixo o tenant sai da PRÓPRIA linha do link: toda query seguinte
  // filtra por ele (service-role bypassa RLS — o filtro é que isola o tenant).
  const [campaign, groups] = link.campaign_group_id
    ? await Promise.all([
        campaignsStore.getCampaignGroupById(link.tenant_id, link.campaign_group_id),
        groupsStore.listGroups(link.tenant_id),
      ])
    : [null, []];

  const entrada = campaign ? readEntrada(campaign.metadata) : ENTRADA_DEFAULTS;
  const integracoes = campaign ? readIntegracoes(campaign.metadata) : INTEGRACOES_DEFAULTS;
  const loja = campaign ? String(campaign.metadata?.loja ?? "") : "";
  const cookieName = campaign ? rememberCookieName(campaign.id) : null;
  const rememberedGroupId = cookieName ? readCookie(req.headers.get("cookie"), cookieName) : null;
  const reqUrl = new URL(req.url);
  // Deriva o prefixo do cookie da URL real: quem clicou em /c/ tem o cookie
  // escopado a /c/, quem clicou em /r/ tem o escopado a /r/ — sem isso o
  // "grupo lembrado" nunca volta na visita seguinte (paths diferentes).
  const prefix = reqUrl.pathname.startsWith("/c/") ? "/c/" : "/r/";

  const target = resolveClickTarget({ link, campaign, groups, entrada, rememberedGroupId });
  if (target.kind === "blocked") {
    // Lotado/encerrada pode ir para a lista de espera; campanha não configurada
    // mostra a mensagem honesta (ver lotadoRedirect).
    const destino = lotadoRedirect(target.reason, entrada.lotado, reqUrl.origin);
    if (destino) return Response.redirect(destino, 302);
    return html(renderBlockedPage({ loja, title: "Grupo cheio", message: BLOCKED_MESSAGE[target.reason] }), 200);
  }

  if (human) {
    // Duas gravações independentes: o contador (total) e o evento com data
    // (histórico). `allSettled` porque uma falhar não pode cancelar a outra —
    // e nenhuma das duas é caminho crítico: métrica nunca segura o visitante.
    await Promise.allSettled([
      linksStore.incrementTrackedLinkClicks(link.id),
      linksStore.recordTrackedLinkClick(link),
    ]);
  }

  const headers = new Headers();
  // Grupo lembrado: só gente real, só campanha, só quando a opção está ligada.
  if (human && cookieName && target.groupId && entrada.um_grupo_por_pessoa) {
    headers.append("set-cookie", rememberCookieHeader(cookieName, target.groupId, `${prefix}${slug}`, reqUrl.protocol === "https:"));
  }

  const deepLinkUrl = campaign && entrada.deep_link && isMobileUa(ua) ? whatsappDeepLink(target.url) : null;
  const pixelId = pixelDaTela(integracoes, target.pixelId);
  // UM id por clique: o mesmo vai no fbq do HTML e no CAPI. É ele que faz a
  // Meta juntar navegador e servidor num Lead só, em vez de contar dois.
  const eventId = crypto.randomUUID();

  if (capiEnvio(integracoes, human)) {
    // `after()`: roda DEPOIS da resposta sair. O visitante nunca espera a Meta.
    after(async () => {
      const r = await sendCapiEvent({
        pixelId: integracoes.meta.pixel_id,
        token: integracoes.meta.capi_token,
        payload: buildCapiPayload({
          eventName: integracoes.meta.evento,
          eventId,
          eventTimeMs: Date.now(),
          sourceUrl: reqUrl.toString(),
          clientIp: firstForwardedIp(req.headers.get("x-forwarded-for")),
          userAgent: ua,
          fbclid: reqUrl.searchParams.get("fbclid"),
          fbp: readCookie(req.headers.get("cookie"), "_fbp"),
          campaignName: campaign?.name ?? "",
          groupId: target.groupId ?? null,
          testCode: integracoes.meta.test_code || undefined,
        }),
      });
      if (!r.ok) console.warn(`[short-link/capi] ${slug}: ${r.error}`);
    });
  }

  if (pixelId || hasIntegracao(integracoes) || deepLinkUrl) {
    // Tela de entrada: dispara as tags e/ou tenta o app. Nonce da CSP desta
    // request, posto pelo middleware — sem ele os scripts inline morrem.
    headers.set("content-type", "text/html; charset=utf-8");
    return new Response(
      renderEntryPage({
        loja,
        campaignName: campaign?.name ?? "",
        groupName: target.groupName ?? null,
        httpsUrl: target.url,
        deepLinkUrl,
        nonce: req.headers.get("x-nonce"),
        pixelId,
        evento: integracoes.meta.evento,
        eventId,
        ga4Id: integracoes.ga4.id || undefined,
        googleAds: integracoes.google_ads.id ? integracoes.google_ads : undefined,
      }),
      { headers },
    );
  }
  headers.set("location", target.url);
  return new Response(null, { status: 302, headers });
}

/**
 * Caminho JSON legado (HUBFLOW_USE_SUPABASE=0, só emergência/dev local).
 * Mantido intacto de propósito — some junto com os stores de arquivo. As
 * configurações de entrada não existem aqui. Sempre serve como se fosse /r/:
 * o legado nunca teve conceito de comunidade, então não precisa do prefixo.
 */
async function legacyGet(req: Request, slug: string, ua: string, human: boolean): Promise<Response> {
  const url = new URL(req.url);
  const click = (target?: string): ClickEvent => ({
    slug,
    ts: new Date().toISOString(),
    utmSource: url.searchParams.get("utm_source") ?? undefined,
    utmCampaign: url.searchParams.get("utm_campaign") ?? undefined,
    ref: req.headers.get("referer") ?? undefined,
    ua,
    target,
  });

  const link = await getLink(slug);
  if (link) {
    if (link.clickCap) {
      const counts = await clickCounts();
      if ((counts[slug] ?? 0) >= link.clickCap) {
        return fullPage(BLOCKED_MESSAGE["cap-reached"]);
      }
    }
    if (human) await recordClick(click());
    if (link.pixelId && /^\d{5,20}$/.test(link.pixelId)) {
      return html(
        renderEntryPage({
          loja: "",
          campaignName: "",
          groupName: null,
          httpsUrl: link.destinationUrl,
          deepLinkUrl: null,
          nonce: req.headers.get("x-nonce"),
          pixelId: link.pixelId,
        }),
        200,
      );
    }
    return Response.redirect(link.destinationUrl, 302);
  }

  const campanha = await findCampanhaBySlug(slug);
  if (campanha) {
    if (!campanha.tenantId) return notFoundPage();
    const groups = await listLegacyGroups(campanha.tenantId);
    const target = legacyNextGroup(campanha.groupIds, groups);
    if (!target) return fullPage(BLOCKED_MESSAGE["all-full"]);
    if (human) await recordClick(click(target.whatsappGroupId));
    return Response.redirect(target.inviteUrl!, 302);
  }

  return notFoundPage();
}

function html(body: string, status: number): Response {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

/** 404 amigável — quem clicou é cliente da loja, não deve ver erro cru. */
function notFoundPage(): Response {
  return html(renderBlockedPage({ loja: "", title: "Link não encontrado", message: "Este link não existe ou foi desativado." }), 404);
}

/** Página amigável de "grupo cheio" (200 p/ o visitante ver a mensagem, não um erro). */
function fullPage(message: string): Response {
  return html(renderBlockedPage({ loja: "", title: "Grupo cheio", message }), 200);
}
```

- [ ] **Step 4: Reduzir `route.ts` a um wrapper fino**

Substituir `apps/web/src/app/r/[slug]/route.ts` inteiro por:

```typescript
// apps/web/src/app/r/[slug]/route.ts
import { handleShortLinkClick } from "@/lib/links/short-link-click";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /r/:slug — ver handleShortLinkClick para a lógica de rotação de grupo.
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return handleShortLinkClick(req, slug);
}
```

- [ ] **Step 5: Checar tipos**

```bash
cd apps/web && npx tsc --noEmit --project tsconfig.json
```

Esperado: sem erro. Se `short-link-click.ts` importar algo que só existe sob `app/`, o erro aparece aqui — resolver ajustando o import antes de seguir.

- [ ] **Step 6: Verificar manualmente que `/r/` continua respondendo**

```bash
cd apps/web && npm run dev
```

Em outra aba, abrir um link `/r/<slug-de-teste-existente>` e confirmar que redireciona normalmente (mesmo comportamento de antes da extração).

- [ ] **Step 7: Commit**

```bash
cd apps/web
git add src/lib/links/short-link-click.ts src/lib/links/decisao.ts src/lib/links/decisao.test.ts "src/app/r/[slug]/route.ts"
git commit -m "refactor(links): extrai a resolucao de clique de /r/[slug] para lib/links"
```

---

### Task 3: Criar a rota `/c/[slug]`

**Files:**
- Create: `apps/web/src/app/c/[slug]/route.ts`

**Interfaces:**
- Consumes: `handleShortLinkClick` da Task 2

- [ ] **Step 1: Criar o wrapper**

```typescript
// apps/web/src/app/c/[slug]/route.ts
import { handleShortLinkClick } from "@/lib/links/short-link-click";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /c/:slug — mesma resolução de /r/[slug], prefixo próprio pra quem
// compartilha o link de uma comunidade (em vez de uma campanha).
// Ver handleShortLinkClick para a lógica de rotação de grupo.
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return handleShortLinkClick(req, slug);
}
```

- [ ] **Step 2: Checar tipos**

```bash
cd apps/web && npx tsc --noEmit --project tsconfig.json
```

- [ ] **Step 3: Verificar manualmente**

Com o dev server rodando (Task 2 Step 6), abrir `/c/<mesmo-slug-de-teste>` e confirmar que redireciona igual a `/r/<slug>`. Abrir as DevTools → Application → Cookies e confirmar que o cookie gravado tem `Path=/c/<slug>`, não `/r/<slug>`.

- [ ] **Step 4: Commit, push e abrir o PR**

```bash
cd apps/web
git add "src/app/c/[slug]/route.ts"
git commit -m "feat(comunidades): rota /c/[slug], link distribuidor da comunidade"
```

Antes do push: `git fetch origin main` e conferir a defasagem (`git log HEAD..origin/main --oneline | wc -l`). Depois `git push -u origin HEAD:<nome-da-branch>` e `gh pr create` com base `main`. Revisar diff, esperar CI verde, mergear, deletar a branch — fechar o loop desta fase antes de abrir a próxima.

---

# FASE 4 — disparo pela comunidade

> Abrir um worktree novo a partir de `origin/main` (que já inclui a Fase 5 mergeada) antes de começar esta fase.

### Task 4: `MessagesTab` na tela de detalhe da comunidade

**Files:**
- Modify: `apps/web/src/app/painel/comunidades/[slug]/page.tsx`

**Interfaces:**
- Consumes: `MessagesTab({ campaignSlug, groupIds }: { campaignSlug: string; groupIds: string[] })` de `@/components/painel/messages/messages-tab`

- [ ] **Step 1: Importar o componente**

No topo de `apps/web/src/app/painel/comunidades/[slug]/page.tsx`, acrescentar ao bloco de imports:

```typescript
import { MessagesTab } from "@/components/painel/messages";
```

- [ ] **Step 2: Acrescentar a seção "Mensagens"**

Depois da `<section>` de "Grupos" (fecha em `</section>`, antes de `{folhaDeConfirmacao}`), acrescentar:

```tsx
      <section>
        <h2 className="text-[15px] font-semibold text-volt-950">Mensagens</h2>
        <div className="mt-2">
          <MessagesTab campaignSlug={comunidade.slug} groupIds={comunidade.groupIds} />
        </div>
      </section>
```

- [ ] **Step 3: Checar tipos**

```bash
cd apps/web && npx tsc --noEmit --project tsconfig.json
```

- [ ] **Step 4: Verificar manualmente**

```bash
cd apps/web && npm run dev
```

Abrir `/painel/comunidades/<slug-de-teste>`, confirmar que a seção "Mensagens" aparece com o composer, e que "Enviar agora" numa mensagem de teste chega nos grupos certos (mesmo comportamento de `/painel/campanhas/<slug>`, já que é a mesma rota por baixo).

- [ ] **Step 5: Commit, push e abrir o PR**

```bash
cd apps/web
git add "src/app/painel/comunidades/[slug]/page.tsx"
git commit -m "feat(comunidades): dispara mensagem pela tela de comunidade"
```

Mesmo fechamento de loop da Task 3 (defasagem, push, PR, CI verde, merge, deletar branch) antes de seguir pra Fase 3.

---

# FASE 3 — `group_participants`, alcance real, cobertura

> Abrir um worktree novo a partir de `origin/main` (que já inclui Fases 5 e 4) antes de começar.

### Task 5: Migração — tabela `group_participants`

**Files:**
- Create: `apps/web/supabase/migrations/20260917000000_group_participants.sql`

**Interfaces:**
- Produces: tabela `public.group_participants(tenant_id, whatsapp_group_id, participant_lid, phone, is_admin, first_seen_at, last_seen_at)`, PK composta

- [ ] **Step 1: Confirmar por SQL nos dois bancos que a tabela ainda não existe**

Via MCP do Supabase (`execute_sql`) nos dois projetos (`wfjuwogxaupyadwhvoxy` e `nidoatbxaylrkcgbszns`):

```sql
select table_schema, table_name from information_schema.tables
where table_name = 'group_participants';
```

Esperado: vazio nos dois. Se aparecer algo, PARE e investigue antes de prosseguir (branch aberta que já criou isso, ou a Fase 3 já foi parcialmente aplicada).

- [ ] **Step 2: Escrever a migração**

```sql
-- apps/web/supabase/migrations/20260917000000_group_participants.sql
--
-- Fase 3 de Gestao de Comunidade: participantes por grupo, pra alcance real
-- (deduplicado por pessoa) e sugestao de cobertura. Alimentada pelo sync que
-- ja busca fetchAllGroups com participantes no caminho feliz -- zero chamada
-- nova a Evolution (ver apps/web/src/app/api/groups/sync/route.ts).
--
-- Chave de identidade e participant_lid: producao esta 100% em @lid, phone e
-- enriquecimento oportunista (~82%) e nullable -- nunca inventar numero.

create table if not exists public.group_participants (
  tenant_id          uuid        not null,
  whatsapp_group_id  text        not null,
  participant_lid    text        not null,
  phone              text,
  is_admin           boolean     not null default false,
  first_seen_at      timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  primary key (tenant_id, whatsapp_group_id, participant_lid)
);

comment on table public.group_participants is
  'Participantes por grupo, atualizados pelo sync de grupos. Fonte de alcance real e sugestao de cobertura das comunidades (Fase 3).';

alter table public.group_participants enable row level security;

drop policy if exists "group_participants_tenant" on public.group_participants;
create policy "group_participants_tenant" on public.group_participants
  for all using (app.has_membership(tenant_id)) with check (app.has_membership(tenant_id));
```

- [ ] **Step 3: Aplicar manualmente nos dois bancos**

DDL é passo humano — não tentar `apply_migration` direto. Rodar o SQL do Step 2 no SQL Editor de `wfjuwogxaupyadwhvoxy` e de `nidoatbxaylrkcgbszns`.

- [ ] **Step 4: Confirmar nos dois bancos**

```sql
select table_schema, table_name from information_schema.tables where table_name = 'group_participants';
select policyname, qual from pg_policy where polrelid = 'public.group_participants'::regclass;
```

Esperado: a tabela existe nos dois, a policy usa `app.has_membership(tenant_id)` no `qual`.

- [ ] **Step 5: Rodar o advisor de segurança do Supabase nos dois bancos**

Confirmar que não surgiu nenhum achado novo atribuível a esta tabela (ex.: RLS sem policy — não deve aparecer, já que a policy foi criada junto).

- [ ] **Step 6: Regenerar `schema-baseline.json` e `apply-order.txt`**

Depois de confirmado nos dois bancos: rodar `select kind, nome, sig from public.schema_signature() order by kind, nome;` em prod, reconstruir `deploy/supabase/schema-baseline.json` com o resultado (mesmo formato do arquivo atual — `gerado_em` novo, `projeto: "nidoatbxaylrkcgbszns"`, `objetos` como mapa `"kind|nome": sig`), e acrescentar em `deploy/supabase/apply-order.txt`:

```
# <data> - Gestao de Comunidade Fase 3: tabela group_participants.
# Participantes por grupo, alimentada pelo sync de grupos (fetchAllGroups com
# participantes, ja chamado hoje). RLS com app.has_membership(tenant_id).
apps/web/supabase/migrations/20260917000000_group_participants.sql
```

- [ ] **Step 7: Commit**

```bash
cd apps/web
git add supabase/migrations/20260917000000_group_participants.sql
cd ..
git add deploy/supabase/schema-baseline.json deploy/supabase/apply-order.txt
git commit -m "feat(comunidades): tabela group_participants (Fase 3)"
```

---

### Task 6: Algoritmo puro de sugestão de cobertura

**Files:**
- Create: `apps/web/src/lib/communities/cobertura.ts`
- Test: `apps/web/src/lib/communities/cobertura.test.ts`

**Interfaces:**
- Produces:

```typescript
export type GrupoParaCobertura = { whatsappGroupId: string; name: string };
export type ParticipanteRef = { whatsappGroupId: string; participantLid: string };
export type GrupoNoCorte = { whatsappGroupId: string; name: string; pessoasNovas: number };
export type SugestaoCobertura = {
  grupos: GrupoNoCorte[];
  pessoasCobertas: number;
  pessoasTotais: number;
  cobertura: number; // 0..1; 0 quando pessoasTotais === 0
};
export const ALVO_COBERTURA = 0.95;
export function sugerirCobertura(grupos: GrupoParaCobertura[], participantes: ParticipanteRef[], alvo?: number): SugestaoCobertura;
```

- [ ] **Step 1: Escrever os testes primeiro**

```typescript
// apps/web/src/lib/communities/cobertura.test.ts
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { sugerirCobertura, ALVO_COBERTURA } from "./cobertura";

const grupo = (id: string, name = id): { whatsappGroupId: string; name: string } => ({ whatsappGroupId: id, name });
const pessoa = (grupoId: string, lid: string) => ({ whatsappGroupId: grupoId, participantLid: lid });

test("grupo unico com todo mundo cobre 100%", () => {
  const r = sugerirCobertura([grupo("g1")], [pessoa("g1", "a"), pessoa("g1", "b")]);
  assert.equal(r.pessoasTotais, 2);
  assert.equal(r.pessoasCobertas, 2);
  assert.equal(r.cobertura, 1);
  assert.deepEqual(r.grupos.map((g) => g.whatsappGroupId), ["g1"]);
});

test("escolhe o grupo com mais gente nova primeiro (guloso)", () => {
  // g1 tem 3 pessoas exclusivas, g2 tem 1 pessoa (que tambem esta em g1).
  const participantes = [pessoa("g1", "a"), pessoa("g1", "b"), pessoa("g1", "c"), pessoa("g2", "a")];
  const r = sugerirCobertura([grupo("g2"), grupo("g1")], participantes, 1);
  assert.equal(r.grupos[0]?.whatsappGroupId, "g1");
  assert.equal(r.grupos[0]?.pessoasNovas, 3);
});

test("para assim que bate o alvo, nao inclui todo mundo", () => {
  const participantes = [
    pessoa("g1", "a"), pessoa("g1", "b"), pessoa("g1", "c"), pessoa("g1", "d"),
    pessoa("g2", "e"),
  ];
  // g1 sozinho cobre 4 de 5 = 80%; alvo 70% deve parar em g1, sem precisar de g2.
  const r = sugerirCobertura([grupo("g1"), grupo("g2")], participantes, 0.7);
  assert.deepEqual(r.grupos.map((g) => g.whatsappGroupId), ["g1"]);
  assert.equal(r.pessoasCobertas, 4);
});

test("sem participante nenhum, cobertura e 0 e nao divide por zero", () => {
  const r = sugerirCobertura([grupo("g1")], []);
  assert.equal(r.pessoasTotais, 0);
  assert.equal(r.cobertura, 0);
  assert.deepEqual(r.grupos, []);
});

test("sem grupo nenhum, devolve vazio mesmo com participantes orfaos", () => {
  const r = sugerirCobertura([], [pessoa("g1", "a")]);
  assert.deepEqual(r.grupos, []);
  assert.equal(r.pessoasTotais, 0);
});

test("alvo default e 95%", () => {
  assert.equal(ALVO_COBERTURA, 0.95);
});

test("pessoa em dois grupos do corte so conta uma vez em pessoasCobertas", () => {
  const participantes = [pessoa("g1", "a"), pessoa("g2", "a"), pessoa("g2", "b")];
  const r = sugerirCobertura([grupo("g1"), grupo("g2")], participantes, 1);
  assert.equal(r.pessoasCobertas, 2);
  assert.equal(r.pessoasTotais, 2);
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd apps/web && npx tsx --test src/lib/communities/cobertura.test.ts
```

Esperado: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar**

```typescript
// apps/web/src/lib/communities/cobertura.ts

/**
 * Sugestão de cobertura: quais grupos de uma comunidade, no menor número
 * possível, alcançam `alvo` (default 95%) das pessoas únicas da comunidade.
 *
 * Guloso: a cada passo escolhe o grupo ainda não escolhido que adiciona mais
 * pessoas NOVAS (contribuição marginal, não tamanho bruto do grupo) — não é
 * ótimo global (set cover é NP-difícil), mas com ~91 grupos e ~10 mil pessoas
 * a aproximação guloga fica a poucos pontos percentuais do ótimo e roda
 * instantâneo em memória.
 *
 * Leitura, nunca ação: a plataforma nunca corta grupo sozinha — quem chama
 * decide o que fazer com o corte sugerido.
 */

export type GrupoParaCobertura = { whatsappGroupId: string; name: string };
export type ParticipanteRef = { whatsappGroupId: string; participantLid: string };
export type GrupoNoCorte = { whatsappGroupId: string; name: string; pessoasNovas: number };
export type SugestaoCobertura = {
  grupos: GrupoNoCorte[];
  pessoasCobertas: number;
  pessoasTotais: number;
  cobertura: number;
};

export const ALVO_COBERTURA = 0.95;

export function sugerirCobertura(
  grupos: GrupoParaCobertura[],
  participantes: ParticipanteRef[],
  alvo: number = ALVO_COBERTURA,
): SugestaoCobertura {
  const porGrupo = new Map<string, Set<string>>();
  for (const g of grupos) porGrupo.set(g.whatsappGroupId, new Set());
  for (const p of participantes) {
    const set = porGrupo.get(p.whatsappGroupId);
    if (set) set.add(p.participantLid);
  }

  const pessoasTotais = new Set(
    participantes.filter((p) => porGrupo.has(p.whatsappGroupId)).map((p) => p.participantLid),
  ).size;

  if (pessoasTotais === 0 || grupos.length === 0) {
    return { grupos: [], pessoasCobertas: 0, pessoasTotais, cobertura: 0 };
  }

  const restantes = new Map(grupos.map((g) => [g.whatsappGroupId, g] as const));
  const cobertas = new Set<string>();
  const escolhidos: GrupoNoCorte[] = [];

  while (cobertas.size / pessoasTotais < alvo && restantes.size > 0) {
    let melhorId: string | null = null;
    let melhorNovas = -1;
    for (const [id] of restantes) {
      const set = porGrupo.get(id) ?? new Set<string>();
      let novas = 0;
      for (const lid of set) if (!cobertas.has(lid)) novas++;
      if (novas > melhorNovas) {
        melhorNovas = novas;
        melhorId = id;
      }
    }
    if (melhorId === null || melhorNovas <= 0) break; // nenhum grupo restante acrescenta gente nova
    const grupo = restantes.get(melhorId)!;
    for (const lid of porGrupo.get(melhorId) ?? []) cobertas.add(lid);
    escolhidos.push({ whatsappGroupId: melhorId, name: grupo.name, pessoasNovas: melhorNovas });
    restantes.delete(melhorId);
  }

  return {
    grupos: escolhidos,
    pessoasCobertas: cobertas.size,
    pessoasTotais,
    cobertura: cobertas.size / pessoasTotais,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd apps/web && npx tsx --test src/lib/communities/cobertura.test.ts
```

Esperado: 8 testes passando.

- [ ] **Step 5: Commit**

```bash
cd apps/web
git add src/lib/communities/cobertura.ts src/lib/communities/cobertura.test.ts
git commit -m "feat(comunidades): algoritmo guloso de sugestao de cobertura"
```

---

### Task 7: Store `group-participants.ts`

**Files:**
- Create: `apps/web/src/lib/stores/group-participants.ts`
- Test: `apps/web/src/lib/stores/group-participants.test.ts`

**Interfaces:**
- Produces:

```typescript
export type ParticipanteEntrada = { participantLid: string; phone: string | null; isAdmin: boolean };
export function montarQueryParticipantes(tenantId: string): { tenantId: string };
export async function upsertParticipantesDoGrupo(tenantId: string, whatsappGroupId: string, participantes: ParticipanteEntrada[]): Promise<void>;
export async function listarParticipantesDosGrupos(tenantId: string, whatsappGroupIds: string[]): Promise<Array<{ whatsappGroupId: string; participantLid: string }>>;
```

- [ ] **Step 1: Escrever o teste de tenant primeiro**

```typescript
// apps/web/src/lib/stores/group-participants.test.ts
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { montarQueryParticipantes } from "./group-participants";

test("toda leitura filtra por tenant_id", () => {
  const q = montarQueryParticipantes("tenant-abc");
  assert.equal(q.tenantId, "tenant-abc");
});

test("tenant vazio e recusado antes de tocar o banco", () => {
  assert.throws(() => montarQueryParticipantes(""), /tenant/i);
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd apps/web && npx tsx --test src/lib/stores/group-participants.test.ts
```

- [ ] **Step 3: Implementar**

```typescript
// apps/web/src/lib/stores/group-participants.ts
import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const TABLE = "group_participants";

export type ParticipanteEntrada = {
  participantLid: string;
  phone: string | null;
  isAdmin: boolean;
};

/**
 * Valida o tenant e devolve a query base. O service-role bypassa RLS — este
 * filtro é a única proteção real contra vazamento cross-tenant.
 */
export function montarQueryParticipantes(tenantId: string): { tenantId: string } {
  if (!tenantId) throw new Error("tenantId é obrigatório para consultar participantes");
  return { tenantId };
}

/**
 * Upsert em lote dos participantes de UM grupo, na mesma leitura que o sync
 * já fez (sem chamada nova à Evolution). `last_seen_at` sempre atualiza;
 * `first_seen_at` só é gravado no insert (default da coluna).
 */
export async function upsertParticipantesDoGrupo(
  tenantId: string,
  whatsappGroupId: string,
  participantes: ParticipanteEntrada[],
): Promise<void> {
  const { tenantId: tid } = montarQueryParticipantes(tenantId);
  if (participantes.length === 0) return;

  const rows = participantes.map((p) => ({
    tenant_id: tid,
    whatsapp_group_id: whatsappGroupId,
    participant_lid: p.participantLid,
    phone: p.phone,
    is_admin: p.isAdmin,
    last_seen_at: new Date().toISOString(),
  }));

  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .upsert(rows, { onConflict: "tenant_id,whatsapp_group_id,participant_lid" });
  if (error) throw new Error(error.message);
}

/** Participantes de vários grupos de uma vez — usado pelo cálculo de cobertura. */
export async function listarParticipantesDosGrupos(
  tenantId: string,
  whatsappGroupIds: string[],
): Promise<Array<{ whatsappGroupId: string; participantLid: string }>> {
  const { tenantId: tid } = montarQueryParticipantes(tenantId);
  if (whatsappGroupIds.length === 0) return [];

  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("whatsapp_group_id, participant_lid")
    .eq("tenant_id", tid)
    .in("whatsapp_group_id", whatsappGroupIds);
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    whatsappGroupId: r.whatsapp_group_id as string,
    participantLid: r.participant_lid as string,
  }));
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd apps/web && npx tsx --test src/lib/stores/group-participants.test.ts
```

- [ ] **Step 5: Commit**

```bash
cd apps/web
git add src/lib/stores/group-participants.ts src/lib/stores/group-participants.test.ts
git commit -m "feat(comunidades): store de group_participants com filtro de tenant"
```

---

### Task 8: Sync grava participantes

**Files:**
- Modify: `apps/web/src/app/api/groups/sync/route.ts`

**Interfaces:**
- Consumes: `upsertParticipantesDoGrupo` da Task 7

- [ ] **Step 1: Ler o trecho exato a modificar**

Em `apps/web/src/app/api/groups/sync/route.ts`, localizar o bloco que constrói `rows` a partir de `gruposAdmin.map((g) => {...})` (logo depois de `partitionByAdmin`). É ali, com `gruposAdmin` já em mãos (cada item tem `.id`, `.participants`), que os participantes ficam disponíveis sem custo extra.

- [ ] **Step 2: Adicionar o import**

No topo do arquivo, junto aos demais imports de `@/lib/stores/*`:

```typescript
import { upsertParticipantesDoGrupo } from "@/lib/stores/group-participants";
```

- [ ] **Step 3: Gravar os participantes depois de `synced`**

Logo depois da linha `const synced = await syncGroupsFromProvider(ctx.tenantId, rows);`, acrescentar:

```typescript
    // Fase 3 de Comunidades: mesma leitura do sync já tem os participantes —
    // zero chamada nova à Evolution. Falha aqui não pode derrubar o sync:
    // alcance real é enriquecimento, não o que o lojista veio fazer.
    await Promise.allSettled(
      gruposAdmin.map((g) =>
        upsertParticipantesDoGrupo(
          ctx.tenantId,
          String(g.id),
          (g.participants ?? [])
            .filter((p): p is { id: string; phoneNumber?: string | null; admin?: string | null } => Boolean(p?.id))
            .map((p) => ({
              participantLid: p.id,
              phone: p.phoneNumber ?? null,
              isAdmin: p.admin === "admin" || p.admin === "superadmin",
            })),
        ),
      ),
    );
```

- [ ] **Step 4: Checar tipos**

```bash
cd apps/web && npx tsc --noEmit --project tsconfig.json
```

- [ ] **Step 5: Verificar manualmente**

Com o dev server rodando e uma instância conectada em dev, clicar "Sincronizar" em `/painel/grupos` e conferir por SQL (`select count(*) from group_participants where tenant_id = '<tenant-de-teste>'`) que linhas apareceram.

- [ ] **Step 6: Commit**

```bash
cd apps/web
git add src/app/api/groups/sync/route.ts
git commit -m "feat(comunidades): sync de grupos alimenta group_participants"
```

---

### Task 9: Rota `GET /api/comunidades/[slug]/cobertura`

**Files:**
- Create: `apps/web/src/app/api/comunidades/[slug]/cobertura/route.ts`

**Interfaces:**
- Consumes: `listarParticipantesDosGrupos` (Task 7), `sugerirCobertura` (Task 6), `listarComunidades`/busca por slug (`@/lib/stores/communities`)
- Produces: `GET /api/comunidades/[slug]/cobertura` → `{ alcanceReal: number; sugestao: SugestaoCobertura }`

- [ ] **Step 1: Ler a rota de grupos da comunidade como molde**

Ler `apps/web/src/app/api/comunidades/[slug]/grupos/route.ts` inteiro — mesmo padrão de resolver tenant (`getTenantContext`) e localizar a comunidade pelo slug.

- [ ] **Step 2: Escrever a rota**

```typescript
// apps/web/src/app/api/comunidades/[slug]/cobertura/route.ts
import { getTenantContext } from "@/lib/supabase/tenant-context";
import { listarComunidades } from "@/lib/stores/communities";
import { listarParticipantesDosGrupos } from "@/lib/stores/group-participants";
import { sugerirCobertura } from "@/lib/communities/cobertura";
import * as groupsStore from "@/lib/stores/groups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/comunidades/[slug]/cobertura
 *
 * Alcance real (pessoas únicas, deduplicadas por participant_lid) e a
 * sugestão de quais grupos cobrem 95% dessas pessoas. Nunca envia LID de
 * participante pro cliente — só nomes de grupo e contagens agregadas.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const ctx = await getTenantContext(req);

    const comunidades = await listarComunidades(ctx.tenantId);
    const comunidade = comunidades.find((c) => c.slug === slug);
    if (!comunidade) return Response.json({ error: "Comunidade não encontrada." }, { status: 404 });

    if (comunidade.groupIds.length === 0) {
      return Response.json({
        alcanceReal: 0,
        sugestao: { grupos: [], pessoasCobertas: 0, pessoasTotais: 0, cobertura: 0 },
      });
    }

    const [grupos, participantes] = await Promise.all([
      groupsStore.listGroups(ctx.tenantId),
      listarParticipantesDosGrupos(ctx.tenantId, comunidade.groupIds),
    ]);

    const gruposDaComunidade = grupos
      .filter((g) => comunidade.groupIds.includes(g.whatsapp_group_id))
      .map((g) => ({ whatsappGroupId: g.whatsapp_group_id, name: g.name }));

    const sugestao = sugerirCobertura(gruposDaComunidade, participantes);

    return Response.json({ alcanceReal: sugestao.pessoasTotais, sugestao });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/comunidades/cobertura] falha:", error);
    return Response.json({ error: "Erro ao calcular cobertura." }, { status: 500 });
  }
}
```

- [ ] **Step 3: Checar tipos**

```bash
cd apps/web && npx tsc --noEmit --project tsconfig.json
```

- [ ] **Step 4: Testar a rota com o servidor local**

```bash
cd apps/web && npm run dev
```

Em outro terminal, exercitar: sem sessão → 401; comunidade de outro tenant/slug inexistente → 404; comunidade sem grupo → `alcanceReal: 0`.

- [ ] **Step 5: Commit**

```bash
cd apps/web
git add "src/app/api/comunidades/[slug]/cobertura/route.ts"
git commit -m "feat(comunidades): rota de alcance real e sugestao de cobertura"
```

---

### Task 10: UI — seção "Cobertura" e alcance real na tela de detalhe

**Files:**
- Modify: `apps/web/src/app/painel/comunidades/[slug]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/comunidades/[slug]/cobertura` da Task 9

- [ ] **Step 1: Buscar a cobertura junto com a comunidade**

Em `apps/web/src/app/painel/comunidades/[slug]/page.tsx`, no `useState`, acrescentar:

```typescript
type Sugestao = {
  grupos: Array<{ whatsappGroupId: string; name: string; pessoasNovas: number }>;
  pessoasCobertas: number;
  pessoasTotais: number;
  cobertura: number;
};
const [cobertura, setCobertura] = useState<Sugestao | null>(null);
```

Em `carregar`, acrescentar a chamada nova ao `Promise.all` existente (junto com `/api/comunidades` e `/api/groups`):

```typescript
const [resComunidades, resGrupos, resCobertura] = await Promise.all([
  authenticatedFetch("/api/comunidades", { cache: "no-store" }),
  authenticatedFetch("/api/groups", { cache: "no-store" }),
  authenticatedFetch(`/api/comunidades/${slug}/cobertura`, { cache: "no-store" }),
]);
// ... (mantém o tratamento de resComunidades/resGrupos como está)
if (resCobertura.ok) {
  const dataCobertura: { sugestao: Sugestao } = await resCobertura.json();
  setCobertura(dataCobertura.sugestao);
}
```

- [ ] **Step 2: Substituir o alcance ingênuo pelo real**

Trocar a linha que hoje calcula `totalMembros` somando `members` de cada grupo (soma bruta, que superconta gente em mais de um grupo) por: usar `cobertura?.pessoasTotais` quando disponível, caindo pra soma antiga só enquanto a chamada de cobertura ainda não voltou (evita a tela "piscar 0"):

```typescript
const totalMembrosSoma = gruposDaComunidade.reduce((total, g) => total + (g.grupo?.members ?? 0), 0);
const totalMembros = cobertura?.pessoasTotais ?? totalMembrosSoma;
```

E ajustar o texto explicativo da seção (linha `"Soma de quem está nos {N} grupos..."`) pra não afirmar "soma" quando o número já é o real deduplicado — trocar por algo como `"Alcance real desta comunidade — pessoas únicas, sem contar quem está em mais de um grupo duas vezes."` quando `cobertura` não é `null`.

- [ ] **Step 3: Seção "Cobertura", abaixo de "Grupos"**

Entre a seção de "Grupos" e `{folhaDeConfirmacao}` (e antes ou depois da seção "Mensagens" da Task 4 — ordem visual, sem dependência de código):

```tsx
{cobertura && cobertura.pessoasTotais > 0 && (
  <section>
    <h2 className="text-[15px] font-semibold text-volt-950">Cobertura</h2>
    <p className="mt-1 text-13 text-slate-600">
      Estes {cobertura.grupos.length} grupo{cobertura.grupos.length === 1 ? "" : "s"} cobrem{" "}
      {Math.round(cobertura.cobertura * 100)}% das {numero(cobertura.pessoasTotais)} pessoas desta
      comunidade. É sugestão de leitura — a Girumo nunca corta grupo sozinha.
    </p>
    <ul className="mt-2 divide-y divide-line-200">
      {cobertura.grupos.map((g) => (
        <li key={g.whatsappGroupId} className="flex items-center justify-between gap-3 py-2">
          <span className="truncate text-14 text-volt-950">{g.name}</span>
          <span className="font-data text-12 tabular-nums text-slate-600">+{numero(g.pessoasNovas)}</span>
        </li>
      ))}
    </ul>
  </section>
)}
```

`numero` já está importado na tela (usado para `totalMembros`); reusar sem import novo.

- [ ] **Step 4: Checar tipos**

```bash
cd apps/web && npx tsc --noEmit --project tsconfig.json
```

- [ ] **Step 5: Verificar manualmente**

```bash
cd apps/web && npm run dev
```

Abrir uma comunidade com grupos que já têm `group_participants` (populados pela Task 8 num sync anterior) e conferir: o alcance no topo bate com o real (não superconta), a seção "Cobertura" lista o corte esperado, e uma comunidade recém-criada sem sync ainda não quebra (seção "Cobertura" simplesmente não aparece, `alcanceReal: 0`).

- [ ] **Step 6: Rodar o gate completo antes do push**

```powershell
.\infra\scripts\verify-local.ps1
```

E os dois `tsc`.

- [ ] **Step 7: Commit, push e abrir o PR**

```bash
cd apps/web
git add "src/app/painel/comunidades/[slug]/page.tsx"
git commit -m "feat(comunidades): secao de cobertura e alcance real na tela de comunidade"
```

Fechar o loop (defasagem, push, PR, CI verde, merge, deletar branch) — última fase desta leva.

---

## Verificação final (as três fases, depois de mergeadas)

Nenhuma fase fecha sem prova colhida na hora — mergeado não é verificado. Depois das três em produção, abrir `/painel/comunidades/<slug-real>` e conferir visualmente: link `/c/<slug>` redireciona e grava cookie com o path certo; "Mensagens" dispara; "Cobertura" mostra um corte plausível. Só então mover o card correspondente do quadro (se houver um específico para esta leva, ou atualizar o `comunidades-gaveta` existente) para `no_ar_verificado`, com a evidência real — nunca um texto de exemplo.
