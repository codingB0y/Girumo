# Oferta Relâmpago — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capturar quem comentou a palavra-chave num grupo VIP durante uma promoção, ordenar por horário do WhatsApp, e deixar as vendedoras puxarem da fila sem se atropelarem.

**Architecture:** Tudo em `apps/web`. O webhook da Evolution passa a aceitar `messages.upsert` e descarta em cascata (não é grupo → é nossa → sem janela aberta → não casa a palavra → atrasado), gravando só o que sobra. A fila é uma consulta ordenada; a reserva é uma linha em `flash_offer_claims` protegida por índice único parcial; o timer é aritmética sobre `claimed_at`/`contacted_at` avaliada na leitura, não um processo. Nenhuma infraestrutura nova: sem cron, sem job, sem fila.

**Tech Stack:** Next.js 15 (App Router) · React 19 · Supabase Postgres · zod · `tsx --test` (Node test runner) · Playwright (E2E) · Tailwind

**Spec:** `docs/superpowers/specs/2026-09-01-oferta-relampago-design.md`

---

## R1 resolvido — o que mudou em relação ao spec

O spec mandava, antes de implementar, capturar um `messages.upsert` real e conferir o formato de `key.participant`. Não foi possível chamar a Evolution: as credenciais de produção não estão na máquina de desenvolvimento e o download foi bloqueado. O risco foi resolvido por outra via — **`engine_events` de produção**, que guarda o payload cru de tudo que a Evolution já entregou.

Medido em `nidoatbxaylrkcgbszns` em 01/09/2026, janela de 30 dias, sobre `group-participants.update` — a **mesma** fonte de participantes que alimentaria o `lid_map`:

| ação | participantes | com `phoneNumber` no mesmo objeto |
|---|---|---|
| `add` | 1.838 | 1.591 (**86,6%**) |
| `remove` | 2.275 | 1.791 (78,7%) |
| `promote` / `demote` | 8 | 8 (100%) |
| **total** | **4.121** | **3.390 (82,3%)** |

E em `messages.update` (3.297 eventos, 7 dias): 3.290 `remoteJid` em `@lid`, 1 em `hosted.lid`, 2 em `@g.us`.

**Zero `@s.whatsapp.net` em qualquer amostra.** Este número está inteiramente no regime LID.

Três consequências, todas incorporadas abaixo:

1. **O `lid_map` é caminho crítico, não defesa.** A hipótese otimista do spec — "se vier `@s.whatsapp.net` na prática, o `lid_map` sai do caminho crítico" — está descartada.
2. **O `lid_map` não cobre todo mundo.** ~13% de quem *entra* no grupo chega sem `phoneNumber` pela própria API que monta o mapa. O spec trata "sem telefone" como borda ("entrou no grupo depois"); é ~1 em 7. Por isso a **Task 10 dá a essa cliente um caminho de ação de primeira classe — responder no grupo — em vez de um aviso passivo.**
3. **O mapa ganha uma segunda fonte, de graça.** Os 3.390 pares `@lid → phoneNumber` dos últimos 30 dias já estão em `engine_events`. A Task 5 mescla histórico + `fetchAllGroups` na abertura. Nenhuma tabela nova, nenhuma chamada extra.

**Fica em aberto, sem bloquear:** se a Evolution entregar `participantAlt`/`participantPn`/`senderPn` (telefone ao lado do LID) no `messages.upsert`, a cobertura sobe sozinha. A Task 4 **grava esses campos quando existirem**, e a Task 12 mede quantos vieram na primeira promoção real.

## Achado que o spec não previu — sem isto, nada chega

`EVOLUTION_WEBHOOK_EVENTS` (`apps/web/src/lib/evolution/client.ts:26`) só é enviado à Evolution dentro de `setWebhook`, e `setWebhook` é chamado em **um** lugar: `apps/web/src/app/api/instances/route.ts:83`, na criação da instância. A instância de produção foi criada há 36 dias.

Acrescentar `"MESSAGES_UPSERT"` à constante **não faz a instância existente passar a receber nada**. Sem a Task 12, a captura fica muda e parece bug de código.

Por isso a Task 12 vem **depois** da Task 2: se o evento chegasse antes de o zod reconhecê-lo, o receiver responderia 400 e a Evolution reentregaria em loop.

---

## Global Constraints

Valem para toda tarefa. Copiados do spec e do `CLAUDE.md` do projeto.

- **Migração vai nos DOIS bancos** — dev `wfjuwogxaupyadwhvoxy` e prod `nidoatbxaylrkcgbszns` — e é registrada em `deploy/supabase/apply-order.txt`. Aplicar só em um cria drift silencioso: as API routes são dual-mode, então tabela ausente não dá erro, cai no fallback JSON.
- **Antes de criar migração, conferir por SQL se o objeto já existe.**
- Toda query em tabela com `tenant_id` filtra `.eq('tenant_id', ...)` explicitamente. O service-role bypassa RLS por desenho: esse filtro é a proteção real.
- Toda função nova: `security definer` **com** `set search_path = public, pg_temp`, seguida de `revoke all ... from public, anon, authenticated` e `grant execute ... to service_role`. Neste projeto `authenticated` mantém os sete privilégios por default; sem o revoke, qualquer usuário logado chamaria a RPC passando o `tenant_id` de outro.
- RLS ligado em tabela nova, com policy no padrão `app.has_membership(tenant_id)` — nunca `current_setting('app.tenant_id')`, GUC que o app não seta e que produz policy que nunca avalia verdadeiro.
- **Nunca DM pela nossa API.** O botão de chamar é link `wa.me` que abre o WhatsApp da vendedora. Decisão durável do projeto: automação só posta no grupo.
- **`phone` nunca é inventado.** Sem resolução, `null`, e a tela diz isso.
- Nenhuma mensagem de terceiro vira linha no banco a menos que case uma janela aberta. É requisito de privacidade, não otimização.
- TypeScript strict, sem `any` sem justificativa. Testes ao lado do código, `*.test.ts`.
- `kebab-case` para arquivos, `PascalCase` para componentes, `camelCase` para funções.
- Comandos no terminal do dono do projeto são PowerShell 5.1: sem `&&` e sem `||`.

---

## File Structure

**Criados**

| Arquivo | Responsabilidade |
|---|---|
| `apps/web/src/lib/relampago/keyword.ts` | Normalizar texto e decidir se um comentário casa a palavra-chave. Puro. |
| `apps/web/src/lib/relampago/keyword.test.ts` | Acento, caixa, emoji, pontuação, e o negativo "euquero". |
| `apps/web/src/lib/relampago/upsert-message.ts` | Extrair de um `messages.upsert` os campos que interessam. Puro. |
| `apps/web/src/lib/relampago/upsert-message.test.ts` | Extração, mídia sem texto, `participantAlt`. |
| `apps/web/src/lib/relampago/claim-state.ts` | `claimState()` — as quatro transições do timer. Puro. |
| `apps/web/src/lib/relampago/claim-state.test.ts` | As quatro transições + `timer_seconds` nulo. |
| `apps/web/src/lib/relampago/lid-map.ts` | Montar `@lid → telefone` de duas fontes. Puro. |
| `apps/web/src/lib/relampago/lid-map.test.ts` | Mescla e precedência entre as fontes. |
| `apps/web/src/lib/stores/flash-offers.ts` | Todo o acesso a banco das quatro tabelas. Supabase-only. |
| `apps/web/supabase/migrations/20260901180000_flash_offers.sql` | Quatro tabelas, índices, RPCs, RLS. |
| `apps/web/src/app/api/relampago/offers/route.ts` | `GET` lista · `POST` cria e abre. |
| `apps/web/src/app/api/relampago/offers/[id]/route.ts` | `GET` fila · `POST` fecha. |
| `apps/web/src/app/api/relampago/offers/[id]/claim/route.ts` | `POST` — pegar próxima. |
| `apps/web/src/app/api/relampago/claims/[id]/route.ts` | `POST` — chamei / vendeu / não respondeu. |
| `apps/web/src/app/painel/relampago/page.tsx` | Lista de ofertas + formulário de nova. |
| `apps/web/src/app/painel/relampago/[id]/page.tsx` | A tela onde a promoção acontece. |
| `apps/web/src/app/painel/relampago/fila-client.tsx` | Client component: poll, card da vendedora, fila. |
| `apps/web/src/app/api/admin/instances/rewebhook/route.ts` | Re-registrar o webhook das instâncias existentes. |

**Modificados**

| Arquivo | Mudança |
|---|---|
| `apps/web/src/lib/evolution/webhook-schema.ts` | Novo membro `messagesUpsert` na união discriminada. |
| `apps/web/src/lib/evolution/event-id.ts` | Novo `case` em `eventName()`. |
| `apps/web/src/lib/evolution/client.ts:26` | `"MESSAGES_UPSERT"` em `EVOLUTION_WEBHOOK_EVENTS`. |
| `apps/web/src/app/api/webhooks/evolution/route.ts` | Ramo que captura a entrada e **não** grava em `engine_events`. |
| `apps/web/src/lib/painel-nav.ts` | Item "Oferta Relâmpago", ícone `Flame`. |
| `deploy/supabase/apply-order.txt` | Registro da migração. |

---

## Waves de execução

Montadas pela regra de `~/.claude/rules/parallel-subagent-driven-development.md`: duas tarefas só entram na mesma wave quando **nenhuma está na cadeia de `Depends-on:` da outra, nem transitivamente**, e seus **`Files:` são totalmente disjuntos**.

| Tarefa | `Files:` (raiz do conflito) | `Depends-on:` |
|---|---|---|
| 1 Palavra-chave | `lib/relampago/keyword.*` | — |
| 2 Schema do webhook | `lib/evolution/*` | — |
| 3 Migração | `supabase/migrations/*`, `deploy/supabase/apply-order.txt` | — |
| 4 Captura | `lib/relampago/upsert-message.*`, **`lib/stores/flash-offers.ts`**, `api/webhooks/evolution/route.ts` | 1, 2, 3 |
| 5 Mapa de LID | `lib/relampago/lid-map.*`, **`lib/stores/flash-offers.ts`** | 3, 4 |
| 6 Estado da reserva | `lib/relampago/claim-state.*`, **`lib/stores/flash-offers.ts`** | 3, 4 |
| 7 Integração | `lib/stores/flash-offers.integration.test.ts` | 3, 4, 5, 6 |
| 8 Rotas | `api/relampago/**` | 4, 5, 6 |
| 9 Menu e lista | `lib/painel-nav.ts`, `painel/relampago/page.tsx` | 8 |
| 10 Tela da fila | `painel/relampago/[id]/page.tsx`, `painel/relampago/fila-client.tsx` | 6, 8 |
| 11 E2E | `e2e/relampago.spec.ts` | 9, 10 |
| 12 Ativação | `lib/evolution/client.ts`, `api/admin/instances/rewebhook/route.ts` | 2, 4 |

**As waves:**

| Wave | Tarefas | Por que juntas — ou por que sozinhas |
|---|---|---|
| 1 | **1, 2, 3** | Sem dependência nenhuma e sem um arquivo em comum. É onde está quase todo o paralelismo real deste plano. |
| 2 | **4** | Sozinha: depende das três anteriores e é ela que **cria** `flash-offers.ts`. |
| 3 | **5** | Sozinha. Não porque dependa de 6, mas porque **5 e 6 escrevem no mesmo `flash-offers.ts`** — a segunda escrita apagaria a primeira em silêncio. |
| 4 | **6** | Idem. Colisão de arquivo, não de dependência. |
| 5 | **7, 8** | Uma toca só o arquivo de teste de integração, a outra só `api/relampago/**`. Disjuntos. |
| 6 | **9, 10** | Arquivos disjuntos. A 10 não depende da 9: a rota `[id]` é alcançável direto, o menu não é pré-requisito de código. |
| 7 | **11, 12** | Disjuntos. A 12 já tocaria `client.ts` sem conflito desde a wave 3 — fica aqui por razão **operacional**, não de dependência (ver nota abaixo). |

**Nota sobre a Task 12.** Pelas edges ela poderia subir para a wave 3: só depende de 2 e 4, e seus arquivos não colidem com os da 5. Fica no fim de propósito — ela liga `messages.upsert` **em produção**, e faz sentido só depois que a captura inteira estiver de pé. Ligar antes não quebraria nada (sem janela aberta o receiver descarta tudo no quarto degrau), mas colocaria a instância recebendo toda mensagem de todos os grupos sem nenhum ganho.

**Regras de commit durante as waves** — vêm da mesma regra e não são negociáveis:

- Implementadores **não commitam**. Cada um deixa as mudanças na árvore de trabalho e relata quais arquivos tocou.
- O controlador commita **por tarefa, em ordem de wave**, lendo o HEAD na hora — nunca uma ref guardada de antes.
- Revisores entram **depois** dos commits da wave, um por tarefa, sobre o range dela. Revisão é só-leitura, então pode ser paralela.
- **Uma** escrita de log por wave, feita pelo controlador. Escritas concorrentes no mesmo arquivo se perdem.

Wave com uma tarefa só é execução serial — e é o resultado correto quando o plano não tem paralelismo ali. Waves 2, 3 e 4 são exatamente isso.

---

## Fase 1 — Captura

Ao fim da Fase 1 um comentário real vira linha na fila. Sem tela ainda.

### Task 1: Casamento da palavra-chave

**Files:**
- Create: `apps/web/src/lib/relampago/keyword.ts`
- Test: `apps/web/src/lib/relampago/keyword.test.ts`

**Interfaces:**
- Depends-on: nenhuma
- Consumes: nada.
- Produces: `normalizeKeyword(value: string): string` e `matchesKeyword(text: string | null | undefined, keyword: string): boolean`. A Task 4 usa `matchesKeyword`; a Task 8 usa `normalizeKeyword` para gravar a palavra já normalizada.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/src/lib/relampago/keyword.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { matchesKeyword, normalizeKeyword } from "./keyword";

test("normalizeKeyword tira acento, caixa e espaço sobrando", () => {
  assert.equal(normalizeKeyword("  EU QUÉRO  "), "eu quero");
  assert.equal(normalizeKeyword("Eu    Quero"), "eu quero");
});

test("matchesKeyword aceita caixa, acento, emoji e pontuação", () => {
  assert.equal(matchesKeyword("EU QUERO", "eu quero"), true);
  assert.equal(matchesKeyword("eu quero 😍", "eu quero"), true);
  assert.equal(matchesKeyword("eu quero esse!!!", "eu quero"), true);
  assert.equal(matchesKeyword("Oi, eu quéro sim", "eu quero"), true);
  assert.equal(matchesKeyword("EU,QUERO", "eu quero"), true);
});

test("matchesKeyword exige fronteira de palavra", () => {
  // Sem isto, "quero" casaria dentro de "euquero" e a fila encheria de falso positivo.
  assert.equal(matchesKeyword("euquero", "eu quero"), false);
  assert.equal(matchesKeyword("euquero", "quero"), false);
  assert.equal(matchesKeyword("requerido", "quero"), false);
});

test("matchesKeyword sem texto é falso, nunca lança", () => {
  assert.equal(matchesKeyword(null, "eu quero"), false);
  assert.equal(matchesKeyword(undefined, "eu quero"), false);
  assert.equal(matchesKeyword("", "eu quero"), false);
  assert.equal(matchesKeyword("eu quero", ""), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
npm --workspace apps/web test -- --test-name-pattern="Keyword|keyword"
```

Esperado: FAIL — `Cannot find module './keyword'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/web/src/lib/relampago/keyword.ts

/**
 * Normaliza para comparação: minúscula, sem acento, e tudo que não é letra ou
 * dígito vira espaço.
 *
 * Pontuação e emoji viram SEPARADOR em vez de sumir. Se fossem removidos,
 * "eu,quero" viraria "euquero" e deixaria de casar — e é escrita comum no
 * grupo. Como separador, casa.
 */
export function normalizeKeyword(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * O comentário casa a palavra-chave?
 *
 * Substring COM fronteira de palavra, não igualdade: "eu quero esse!!!" conta,
 * "euquero" não. Igualdade exata deixaria de fora quase todo mundo, que escreve
 * a palavra no meio de uma frase; substring solta casaria "quero" dentro de
 * "requerido".
 */
export function matchesKeyword(text: string | null | undefined, keyword: string): boolean {
  if (!text) return false;

  const alvo = normalizeKeyword(keyword);
  if (!alvo) return false;

  return ` ${normalizeKeyword(text)} `.includes(` ${alvo} `);
}
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
npm --workspace apps/web test -- --test-name-pattern="Keyword|keyword"
```

Esperado: PASS, 4 testes.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/lib/relampago/keyword.ts apps/web/src/lib/relampago/keyword.test.ts
git commit -m "feat(relampago): casamento da palavra-chave com fronteira de palavra"
```

---

### Task 2: `messages.upsert` no schema do webhook

O receiver hoje rejeita esse evento com 400. Esta tarefa faz o zod reconhecê-lo e dá a ele um `event_id` determinístico. **Ainda não persiste nada** — a Evolution também ainda não envia o evento (Task 12).

**Files:**
- Modify: `apps/web/src/lib/evolution/webhook-schema.ts` (novo membro antes de `evolutionWebhookSchema`, linha ~110-131)
- Modify: `apps/web/src/lib/evolution/event-id.ts` (novo `case` em `eventName()`)
- Create: `apps/web/src/lib/evolution/__fixtures__/messages-upsert.group.json`
- Test: `apps/web/src/lib/evolution/webhook-schema.test.ts` (arquivo existente — acrescentar)

**Interfaces:**
- Depends-on: nenhuma
- Consumes: nada.
- Produces: o membro `"messages.upsert"` de `EvolutionWebhookEvent`, com `data` contendo `key.remoteJid`, `key.fromMe`, `key.id`, `key.participant`, `pushName`, `message`, `messageTimestamp`. A Task 3 e a Task 4 dependem desse tipo.

- [ ] **Step 1: Criar a fixture**

O envelope segue as fixtures existentes (`group-participants-update.add.json`). Os JIDs são fictícios mas no formato **real de produção**: `@lid`, conforme medido no R1.

```json
{
  "event": "messages.upsert",
  "instance": "gr_00000000-0000-4000-8000-000000000000",
  "date_time": "2026-09-01T14:03:11.000Z",
  "server_url": "https://evo.example.com",
  "apikey": "REMOVIDO",
  "data": {
    "key": {
      "remoteJid": "120363300287692953@g.us",
      "fromMe": false,
      "id": "3EB0C767D26A8A3B1F27",
      "participant": "221000000000000009@lid"
    },
    "pushName": "Ana",
    "message": { "conversation": "EU QUERO 😍" },
    "messageTimestamp": 1788267791,
    "messageType": "conversation"
  }
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// acrescentar em apps/web/src/lib/evolution/webhook-schema.test.ts
import fixtureUpsert from "./__fixtures__/messages-upsert.group.json" with { type: "json" };

test("aceita messages.upsert de grupo", () => {
  const parsed = parseEvolutionWebhook(fixtureUpsert);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.event.event, "messages.upsert");
  if (parsed.event.event !== "messages.upsert") return;
  assert.equal(parsed.event.data.key.remoteJid, "120363300287692953@g.us");
  assert.equal(parsed.event.data.key.participant, "221000000000000009@lid");
  assert.equal(parsed.event.data.messageTimestamp, 1788267791);
});

test("messages.upsert sem key.id é rejeitado", () => {
  const semId = structuredClone(fixtureUpsert) as Record<string, unknown>;
  (semId.data as { key: Record<string, unknown> }).key.id = "";
  assert.equal(parseEvolutionWebhook(semId).ok, false);
});
```

E em `apps/web/src/lib/evolution/event-id.test.ts`:

```typescript
test("event_id de messages.upsert é estável e por mensagem", () => {
  const base = {
    event: "messages.upsert" as const,
    instance: "gr_x",
    date_time: "2026-09-01T14:03:11.000Z",
    data: { key: { remoteJid: "1@g.us", fromMe: false, id: "ABC" } },
  };
  const a = evolutionEventId(base as never);
  const b = evolutionEventId({ ...base, date_time: "2026-09-01T15:00:00.000Z" } as never);
  // Mesma mensagem reentregue com outro carimbo continua sendo o mesmo evento.
  assert.equal(a, b);
});
```

- [ ] **Step 3: Run test to verify it fails**

```powershell
npm --workspace apps/web test -- --test-name-pattern="messages.upsert"
```

Esperado: FAIL — `parsed.ok` é `false` (o discriminador não conhece o evento).

- [ ] **Step 4: Implementar o schema**

Em `webhook-schema.ts`, depois de `messagesUpdate` (linha ~110) e antes de `evolutionWebhookSchema`:

```typescript
/**
 * Mensagem nova. Assinado por causa da Oferta Relâmpago: é o único evento que
 * mostra o que as clientes escrevem no grupo.
 *
 * `looseObject` em `key` e no topo: a Evolution v2.3.7 acrescenta campos entre
 * versões (`participantAlt`, `senderPn`), e descartá-los aqui apagaria
 * justamente o telefone que o `@lid` não traz.
 */
const messagesUpsert = z.object({
  ...envelopeShape,
  event: z.literal("messages.upsert"),
  data: z.looseObject({
    key: z.looseObject({
      remoteJid: z.string().min(1),
      id: z.string().min(1),
      fromMe: z.boolean().optional(),
      participant: z.string().optional(),
    }),
    pushName: z.string().nullable().optional(),
    // Ausente em revogação e em alguns tipos de mídia. Não é erro.
    message: z.looseObject({}).nullable().optional(),
    messageTimestamp: z.union([z.number(), z.string()]).optional(),
  }),
});
```

E acrescentar `messagesUpsert` ao array de `z.discriminatedUnion("event", [...])`.

Em `event-id.ts`, novo `case` em `eventName()`:

```typescript
    case "messages.upsert":
      // Sem date_time, pela mesma razão de messages.update: a mensagem é única
      // e estável. Incluir o carimbo faria a reentrega virar evento novo — e
      // aqui isso significaria a mesma cliente entrando duas vezes na fila.
      return `${event.instance}|messages.upsert|${event.data.key.id}`;
```

- [ ] **Step 5: Run test to verify it passes**

```powershell
npm --workspace apps/web test -- --test-name-pattern="messages.upsert"
```

Esperado: PASS.

- [ ] **Step 6: Verificar que nada mais quebrou**

```powershell
npm --workspace apps/web test
```

Esperado: toda a suíte passa. O `switch` de `eventName()` é exaustivo — se faltar o `case`, o TypeScript reclama.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/src/lib/evolution/
git commit -m "feat(relampago): webhook reconhece messages.upsert"
```

---

### Task 3: Migração — quatro tabelas, índices e RPCs

**Files:**
- Create: `apps/web/supabase/migrations/20260901180000_flash_offers.sql`
- Modify: `deploy/supabase/apply-order.txt`

**Interfaces:**
- Depends-on: nenhuma
- Consumes: nada.
- Produces: tabelas `flash_offers`, `flash_offer_groups`, `flash_offer_entries`, `flash_offer_claims`; RPCs `public.claim_next_flash_entry(uuid, uuid, uuid)` e `public.release_expired_flash_claims(uuid, uuid)`. A Task 6 chama as duas RPCs pela store.

- [ ] **Step 1: Conferir que nada disso já existe**

Antes de escrever a migração — regra do projeto, e já custou uma migração jogada fora em 30/07.

```sql
select table_name from information_schema.tables
 where table_schema = 'public' and table_name like 'flash_offer%';
```

Rodar nos **dois** bancos. Esperado: zero linhas. Se vier algo, parar e reconciliar antes de seguir — `create ... if not exists` não reconcilia COLUNAS.

- [ ] **Step 2: Escrever a migração**

```sql
-- Oferta Relâmpago: a lojista abre uma promoção no grupo, as clientes comentam
-- a palavra-chave, e quem comentou primeiro tem prioridade.
--
-- O que estas tabelas impedem, e a tela não conseguiria:
--  - duas ofertas abertas no mesmo grupo (a divergência que a feature existe
--    para evitar) -> flash_offer_groups_um_aberto_uidx
--  - duas vendedoras na mesma cliente -> flash_offer_claims_ativo_uidx
--  - a mesma cliente ocupando dois lugares -> flash_offer_entries_pessoa_uidx
--  - reentrega do webhook duplicando a fila -> flash_offer_entries_msg_uidx

create table if not exists public.flash_offers (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references organizations(id) on delete cascade,
  name          text not null,
  -- Já normalizada na escrita (minúscula, sem acento). Ver lib/relampago/keyword.ts.
  keyword       text not null default 'eu quero',
  slots         integer not null check (slots > 0),
  -- null = sem timer: a reserva fica com a vendedora até ela resolver.
  timer_seconds integer check (timer_seconds is null or timer_seconds > 0),
  status        text not null default 'draft'
                  check (status in ('draft','open','closed')),
  opened_at     timestamptz,
  closed_at     timestamptz,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.flash_offers is
  'Promoção relâmpago: palavra-chave no grupo, prioridade por ordem de comentário.';
comment on column public.flash_offers.timer_seconds is
  'null = sem timer. A reserva não expira sozinha.';

create index if not exists flash_offers_tenant_idx
  on public.flash_offers (tenant_id, created_at desc);

-- Os grupos-alvo. Tabela, e não `group_ids uuid[]` no estilo de broadcasts,
-- porque é ela que carrega o índice de exclusão mútua abaixo.
create table if not exists public.flash_offer_groups (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references organizations(id) on delete cascade,
  offer_id          uuid not null references public.flash_offers(id) on delete cascade,
  group_id          uuid not null references public.groups(id) on delete cascade,
  -- Desnormalizado: o receiver do webhook não faz join.
  whatsapp_group_id text not null,
  -- Corta comentário anterior à abertura da janela. A entrega da Evolution não
  -- é ordenada e este projeto já foi mordido por isso.
  opened_at         timestamptz not null default now(),
  closed_at         timestamptz,
  -- @lid -> telefone, colhido na abertura. Ver lib/relampago/lid-map.ts.
  lid_map           jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

comment on column public.flash_offer_groups.lid_map is
  'Mapa @lid -> telefone montado na abertura. 100% dos participantes chegam como @lid.';

-- Abrir uma segunda oferta num grupo que já tem uma aberta é recusado pelo
-- Postgres. Nenhuma tela pode errar isso.
create unique index if not exists flash_offer_groups_um_aberto_uidx
  on public.flash_offer_groups (tenant_id, whatsapp_group_id)
  where closed_at is null;

create index if not exists flash_offer_groups_offer_idx
  on public.flash_offer_groups (offer_id);

create table if not exists public.flash_offer_entries (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references organizations(id) on delete cascade,
  offer_id          uuid not null references public.flash_offers(id) on delete cascade,
  group_id          uuid references public.groups(id) on delete set null,
  whatsapp_group_id text not null,
  -- Como chegou: @lid ou @s.whatsapp.net. Guardado cru.
  participant_jid   text not null,
  -- null quando não resolvemos. NUNCA inventado.
  phone             text,
  push_name         text,
  -- O comentário cru. É a prova que encerra a discussão de quem veio primeiro.
  message_text      text not null,
  message_id        text not null,
  -- Timestamp do WhatsApp, não o nosso. Nunca reescrito.
  commented_at      timestamptz not null,
  -- null = na ordem original. Preenchido manda para o fim da fila sem apagar
  -- commented_at.
  deprioritized_at  timestamptz,
  outcome           text check (outcome is null or outcome in ('sold','dropped')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Reentrega do webhook vira no-op.
create unique index if not exists flash_offer_entries_msg_uidx
  on public.flash_offer_entries (tenant_id, message_id);

-- A mesma pessoa comentando 5x ocupa UM lugar, o primeiro. Casa por telefone
-- quando temos, por jid quando não: sem o coalesce, a mesma cliente vinda como
-- @lid num evento e resolvida noutro entraria duas vezes.
create unique index if not exists flash_offer_entries_pessoa_uidx
  on public.flash_offer_entries (offer_id, coalesce(phone, participant_jid));

create index if not exists flash_offer_entries_fila_idx
  on public.flash_offer_entries (offer_id, deprioritized_at, commented_at);

create table if not exists public.flash_offer_claims (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references organizations(id) on delete cascade,
  offer_id       uuid not null references public.flash_offers(id) on delete cascade,
  entry_id       uuid not null references public.flash_offer_entries(id) on delete cascade,
  seller_user_id uuid not null,
  -- O prazo para CHAMAR corre daqui.
  claimed_at     timestamptz not null default now(),
  -- Clicou "chamei": o prazo passa a correr daqui.
  contacted_at   timestamptz,
  released_at    timestamptz,
  release_reason text check (release_reason is null or release_reason in
                   ('seller_timeout','customer_timeout','sold','dropped','manual')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Duas vendedoras não pegam a mesma cliente. Garantido pelo banco, não pela UI.
create unique index if not exists flash_offer_claims_ativo_uidx
  on public.flash_offer_claims (entry_id) where released_at is null;

create index if not exists flash_offer_claims_offer_idx
  on public.flash_offer_claims (offer_id) where released_at is null;

-- Libera as reservas vencidas. O desfecho depende de QUEM falhou:
--  - venceu sem contacted_at  -> a loja não chamou. A cliente MANTÉM a posição.
--  - venceu com contacted_at  -> a cliente não respondeu. Vai para o fim.
-- É a diferença entre "a loja me ignorou" e "eu sumi", e é o que impede o
-- sistema de punir a cliente por lentidão interna.
create or replace function public.release_expired_flash_claims(p_tenant uuid, p_offer uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_timer integer;
  v_n     integer := 0;
begin
  select timer_seconds into v_timer
    from public.flash_offers
   where id = p_offer and tenant_id = p_tenant;

  -- Sem timer, nada expira.
  if v_timer is null then return 0; end if;

  with vencidos as (
    select id, entry_id, contacted_at
      from public.flash_offer_claims
     where tenant_id = p_tenant
       and offer_id = p_offer
       and released_at is null
       and coalesce(contacted_at, claimed_at) + make_interval(secs => v_timer) < now()
     for update skip locked
  ),
  liberados as (
    update public.flash_offer_claims c
       set released_at    = now(),
           release_reason = case when v.contacted_at is null
                                 then 'seller_timeout' else 'customer_timeout' end,
           updated_at     = now()
      from vencidos v
     where c.id = v.id
    returning v.entry_id, v.contacted_at
  )
  update public.flash_offer_entries e
     set deprioritized_at = now(),
         updated_at       = now()
    from liberados l
   where e.id = l.entry_id
     and l.contacted_at is not null   -- só quem já tinha sido chamada
     and e.deprioritized_at is null;

  get diagnostics v_n = row_count;

  -- row_count acima conta só os despriorizados; o total liberado é maior.
  select count(*) into v_n
    from public.flash_offer_claims
   where tenant_id = p_tenant and offer_id = p_offer
     and released_at >= now() - interval '1 second';

  return v_n;
end;
$$;

revoke all on function public.release_expired_flash_claims(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.release_expired_flash_claims(uuid, uuid) to service_role;

-- Reserva a próxima da fila. Atômica de propósito: o teto de `slots` não pode
-- ser conferido pela rota e aplicado depois, senão duas vendedoras clicando
-- juntas passam do estoque. O índice único cobre a colisão na MESMA cliente;
-- este `for update` cobre o teto.
create or replace function public.claim_next_flash_entry(
  p_tenant uuid, p_offer uuid, p_seller uuid
)
returns public.flash_offer_claims
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slots    integer;
  v_ocupadas integer;
  v_entry    uuid;
  v_claim    public.flash_offer_claims;
begin
  select slots into v_slots
    from public.flash_offers
   where id = p_offer and tenant_id = p_tenant and status = 'open'
   for update;

  if v_slots is null then
    raise exception 'oferta nao encontrada ou nao esta aberta' using errcode = 'P0002';
  end if;

  -- Vaga é slots menos o que já virou venda menos o que está reservado agora.
  select (select count(*) from public.flash_offer_entries
           where offer_id = p_offer and outcome = 'sold')
       + (select count(*) from public.flash_offer_claims
           where offer_id = p_offer and released_at is null)
    into v_ocupadas;

  if v_ocupadas >= v_slots then
    raise exception 'sem vaga livre' using errcode = 'P0001';
  end if;

  select e.id into v_entry
    from public.flash_offer_entries e
   where e.tenant_id = p_tenant
     and e.offer_id = p_offer
     and e.outcome is null
     and not exists (
       select 1 from public.flash_offer_claims c
        where c.entry_id = e.id and c.released_at is null
     )
   order by e.deprioritized_at nulls first, e.commented_at
   limit 1
   for update skip locked;

  if v_entry is null then
    raise exception 'fila vazia' using errcode = 'P0002';
  end if;

  insert into public.flash_offer_claims (tenant_id, offer_id, entry_id, seller_user_id)
  values (p_tenant, p_offer, v_entry, p_seller)
  returning * into v_claim;

  return v_claim;
end;
$$;

revoke all on function public.claim_next_flash_entry(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_next_flash_entry(uuid, uuid, uuid) to service_role;

-- RLS: defesa em profundidade. A proteção REAL é o .eq('tenant_id') na store —
-- o caminho de escrita usa service-role, que bypassa RLS por desenho.
alter table public.flash_offers        enable row level security;
alter table public.flash_offer_groups  enable row level security;
alter table public.flash_offer_entries enable row level security;
alter table public.flash_offer_claims  enable row level security;

drop policy if exists "flash_offers_tenant" on public.flash_offers;
create policy "flash_offers_tenant" on public.flash_offers
  for all using (app.has_membership(tenant_id)) with check (app.has_membership(tenant_id));

drop policy if exists "flash_offer_groups_tenant" on public.flash_offer_groups;
create policy "flash_offer_groups_tenant" on public.flash_offer_groups
  for all using (app.has_membership(tenant_id)) with check (app.has_membership(tenant_id));

drop policy if exists "flash_offer_entries_tenant" on public.flash_offer_entries;
create policy "flash_offer_entries_tenant" on public.flash_offer_entries
  for all using (app.has_membership(tenant_id)) with check (app.has_membership(tenant_id));

drop policy if exists "flash_offer_claims_tenant" on public.flash_offer_claims;
create policy "flash_offer_claims_tenant" on public.flash_offer_claims
  for all using (app.has_membership(tenant_id)) with check (app.has_membership(tenant_id));
```

- [ ] **Step 3: Aplicar nos dois bancos**

```powershell
npm run supabase:apply:ps
```

Se o script pedir alvo, aplicar em dev **e** prod. Aplicar só em um cria drift silencioso.

- [ ] **Step 4: Conferir que aplicou nos dois**

```sql
select count(*) as tabelas from information_schema.tables
 where table_schema='public' and table_name like 'flash_offer%';
select count(*) as rpcs from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public' and p.proname in ('claim_next_flash_entry','release_expired_flash_claims');
```

Esperado nos dois bancos: `tabelas = 4`, `rpcs = 2`.

- [ ] **Step 5: Rodar o advisor de segurança**

```powershell
npm run check:advisors
```

Esperado: nenhum achado novo. As duas RPCs recebem `tenant_id` como parâmetro — é exatamente o formato que o advisor reprova quando falta o `revoke`. Se aparecer achado, o `revoke` não foi aplicado.

- [ ] **Step 6: Registrar em apply-order.txt**

Acrescentar ao fim de `deploy/supabase/apply-order.txt`:

```
# 01/09/2026 - Oferta Relampago. Quatro tabelas e duas RPCs. Os indices carregam
# as regras que a tela nao consegue garantir: uma oferta aberta por grupo, uma
# vendedora por cliente, um lugar por pessoa, reentrega idempotente.
apps/web/supabase/migrations/20260901180000_flash_offers.sql
```

- [ ] **Step 7: Atualizar o baseline de drift**

```powershell
npm run schema:baseline
npm run check:drift
```

Esperado: sem drift. Sem isto, o gate do CI quebra no próximo PR.

- [ ] **Step 8: Commit**

```powershell
git add apps/web/supabase/migrations/20260901180000_flash_offers.sql deploy/supabase/apply-order.txt
git add infra/
git commit -m "feat(relampago): tabelas, indices e RPCs da oferta relampago"
```

---

### Task 4: Extração do `messages.upsert` e captura no receiver

**Files:**
- Create: `apps/web/src/lib/relampago/upsert-message.ts`
- Test: `apps/web/src/lib/relampago/upsert-message.test.ts`
- Create: `apps/web/src/lib/stores/flash-offers.ts` (parte 1 — só a captura)
- Modify: `apps/web/src/app/api/webhooks/evolution/route.ts`

**Interfaces:**
- Depends-on: Task 1, Task 2, Task 3
- Consumes: `matchesKeyword` (Task 1); o tipo `messages.upsert` de `EvolutionWebhookEvent` (Task 2); as tabelas da Task 3.
- Produces:
  - `parseUpsertMessage(data): UpsertMessage | null` com `UpsertMessage = { remoteJid, messageId, participantJid, phoneHint, pushName, text, commentedAt }` (`phoneHint: string | null`, `commentedAt: Date`).
  - `findOpenWindow(tenantId, whatsappGroupId): Promise<OpenWindow | null>` com `OpenWindow = { offerId, groupId, keyword, openedAt, lidMap }`.
  - `insertEntry(input): Promise<boolean>` — `false` quando o índice único recusou (duplicata).
  - As Tasks 6 e 8 estendem a mesma store.

- [ ] **Step 1: Write the failing test da extração**

```typescript
// apps/web/src/lib/relampago/upsert-message.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { parseUpsertMessage } from "./upsert-message";

const base = {
  key: {
    remoteJid: "120363300287692953@g.us",
    fromMe: false,
    id: "3EB0C767D26A8A3B1F27",
    participant: "221000000000000009@lid",
  },
  pushName: "Ana",
  message: { conversation: "EU QUERO" },
  messageTimestamp: 1788267791,
};

test("extrai os campos de uma mensagem simples", () => {
  const m = parseUpsertMessage(base);
  assert.ok(m);
  assert.equal(m.remoteJid, "120363300287692953@g.us");
  assert.equal(m.messageId, "3EB0C767D26A8A3B1F27");
  assert.equal(m.participantJid, "221000000000000009@lid");
  assert.equal(m.pushName, "Ana");
  assert.equal(m.text, "EU QUERO");
  assert.equal(m.commentedAt.toISOString(), "2026-09-01T14:23:11.000Z");
  // @lid não carrega telefone: sem dica, null. Nunca inventado.
  assert.equal(m.phoneHint, null);
});

test("lê texto de extendedTextMessage", () => {
  const m = parseUpsertMessage({
    ...base,
    message: { extendedTextMessage: { text: "eu quero esse" } },
  });
  assert.equal(m?.text, "eu quero esse");
});

test("mensagem sem texto (mídia, figurinha) devolve null", () => {
  assert.equal(parseUpsertMessage({ ...base, message: { imageMessage: {} } }), null);
  assert.equal(parseUpsertMessage({ ...base, message: null }), null);
});

test("aproveita o telefone quando a Evolution manda ao lado do lid", () => {
  // Se a v2.3.7 entregar participantAlt/senderPn, é telefone de graça — e a
  // cobertura do lid_map sobe sem esforço.
  const m = parseUpsertMessage({
    ...base,
    key: { ...base.key, participantAlt: "5511999998888@s.whatsapp.net" },
  });
  assert.equal(m?.phoneHint, "5511999998888");
});

test("messageTimestamp em string também vira data", () => {
  const m = parseUpsertMessage({ ...base, messageTimestamp: "1788267791" });
  assert.equal(m?.commentedAt.toISOString(), "2026-09-01T14:23:11.000Z");
});

test("sem participant devolve null — sem quem falou não há fila", () => {
  const semParticipante = { ...base, key: { ...base.key, participant: undefined } };
  assert.equal(parseUpsertMessage(semParticipante), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
npm --workspace apps/web test -- --test-name-pattern="parseUpsertMessage|extrai|mensagem sem texto"
```

Esperado: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar a extração**

```typescript
// apps/web/src/lib/relampago/upsert-message.ts

export type UpsertMessage = {
  remoteJid: string;
  messageId: string;
  /** Como chegou: @lid ou @s.whatsapp.net. Guardado cru. */
  participantJid: string;
  /** Telefone quando a Evolution mandou ao lado do lid. null nunca vira palpite. */
  phoneHint: string | null;
  pushName: string | null;
  text: string;
  /** Do WhatsApp, não do nosso relógio. É o que ordena a fila. */
  commentedAt: Date;
};

function soDigitos(jid: string | undefined): string | null {
  if (!jid) return null;
  const [user, dominio] = jid.split("@");
  if (dominio !== "s.whatsapp.net") return null;
  return /^\d{8,15}$/.test(user ?? "") ? user : null;
}

/**
 * Extrai de um `messages.upsert` o que a fila precisa. `null` quando a mensagem
 * não serve (sem texto, sem autor).
 *
 * Lê `participantAlt`/`participantPn`/`senderPn` porque em produção 100% dos
 * participantes chegam como `@lid`, e esses campos são a única chance de ter o
 * telefone sem consultar o mapa. Medido em 01/09/2026 sobre engine_events.
 */
export function parseUpsertMessage(data: unknown): UpsertMessage | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const key = d.key as Record<string, unknown> | undefined;
  if (!key) return null;

  const remoteJid = typeof key.remoteJid === "string" ? key.remoteJid : "";
  const messageId = typeof key.id === "string" ? key.id : "";
  const participantJid = typeof key.participant === "string" ? key.participant : "";
  if (!remoteJid || !messageId || !participantJid) return null;

  const message = d.message as Record<string, unknown> | null | undefined;
  const conversation = typeof message?.conversation === "string" ? message.conversation : null;
  const estendida = message?.extendedTextMessage as Record<string, unknown> | undefined;
  const texto = conversation ?? (typeof estendida?.text === "string" ? estendida.text : null);
  if (!texto || !texto.trim()) return null;

  const carimbo = d.messageTimestamp;
  const segundos = typeof carimbo === "number" ? carimbo : Number(carimbo);
  if (!Number.isFinite(segundos) || segundos <= 0) return null;

  const phoneHint =
    soDigitos(key.participantAlt as string | undefined) ??
    soDigitos(key.participantPn as string | undefined) ??
    soDigitos(key.senderPn as string | undefined) ??
    soDigitos(participantJid);

  return {
    remoteJid,
    messageId,
    participantJid,
    phoneHint,
    pushName: typeof d.pushName === "string" ? d.pushName : null,
    text: texto,
    commentedAt: new Date(segundos * 1000),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
npm --workspace apps/web test -- --test-name-pattern="parseUpsertMessage|extrai|mensagem sem texto|aproveita|messageTimestamp|sem participant"
```

Esperado: PASS, 6 testes.

- [ ] **Step 5: Escrever a parte de captura da store**

```typescript
// apps/web/src/lib/stores/flash-offers.ts
import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Oferta Relâmpago. Supabase-only, sem o fallback JSON das stores antigas: com
 * dual-mode, tabela ausente não dá erro — cai no JSON em silêncio, e você
 * validaria em dev um caminho que não é o que roda em produção.
 *
 * Todo acesso filtra `tenant_id` explicitamente. O service-role bypassa RLS por
 * desenho, então esse filtro é a proteção real.
 */

export type OpenWindow = {
  offerId: string;
  groupId: string;
  keyword: string;
  openedAt: string;
  lidMap: Record<string, string>;
};

/**
 * A janela aberta deste grupo, se houver. É o quarto degrau do descarte do
 * receiver e o mais caro — por isso vem depois dos três degraus locais.
 */
export async function findOpenWindow(
  tenantId: string,
  whatsappGroupId: string,
): Promise<OpenWindow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("flash_offer_groups")
    .select("offer_id, group_id, opened_at, lid_map, flash_offers!inner(keyword, status)")
    .eq("tenant_id", tenantId)
    .eq("whatsapp_group_id", whatsappGroupId)
    .is("closed_at", null)
    .maybeSingle();

  if (error || !data) return null;

  const offer = data.flash_offers as unknown as { keyword: string; status: string };
  if (offer.status !== "open") return null;

  return {
    offerId: data.offer_id as string,
    groupId: data.group_id as string,
    keyword: offer.keyword,
    openedAt: data.opened_at as string,
    lidMap: (data.lid_map ?? {}) as Record<string, string>,
  };
}

export type EntryInsert = {
  tenantId: string;
  offerId: string;
  groupId: string;
  whatsappGroupId: string;
  participantJid: string;
  phone: string | null;
  pushName: string | null;
  messageText: string;
  messageId: string;
  commentedAt: Date;
};

/**
 * Grava o comentário. `false` quando um dos índices únicos recusou — reentrega
 * do webhook ou a mesma cliente comentando de novo. Não é erro: é a regra
 * funcionando, e por isso não sobe exceção.
 */
export async function insertEntry(input: EntryInsert): Promise<boolean> {
  const { error } = await getSupabaseAdmin().from("flash_offer_entries").insert({
    tenant_id: input.tenantId,
    offer_id: input.offerId,
    group_id: input.groupId,
    whatsapp_group_id: input.whatsappGroupId,
    participant_jid: input.participantJid,
    phone: input.phone,
    push_name: input.pushName,
    message_text: input.messageText,
    message_id: input.messageId,
    commented_at: input.commentedAt.toISOString(),
  });

  // 23505 = unique_violation.
  if (error && error.code !== "23505") throw error;
  return !error;
}
```

- [ ] **Step 6: Ligar no receiver**

Em `apps/web/src/app/api/webhooks/evolution/route.ts`, acrescentar a função e o ramo. A função vai logo antes de `export async function POST`:

```typescript
/**
 * Oferta Relâmpago: captura o comentário que casa uma janela aberta.
 *
 * Descarte do mais barato para o mais caro. Ligar `messages.upsert` faz chegar
 * TODA mensagem de TODOS os grupos onde a instância está; nada disso pode virar
 * linha, porque é dado pessoal de gente que não é cliente de ninguém. Só o que
 * passa pelos seis degraus persiste.
 *
 * Devolve `true` quando tratou o evento — o chamador então NÃO grava em
 * engine_events, que encheria de mensagem de terceiro.
 */
async function applyFlashOfferComment(
  instance: Instance,
  event: EvolutionWebhookEvent,
): Promise<boolean> {
  if (event.event !== "messages.upsert") return false;

  // 1. conversa privada nunca é capturada
  if (!event.data.key.remoteJid.endsWith("@g.us")) return true;
  // 2. mensagem nossa
  if (event.data.key.fromMe) return true;

  // 3. sem texto (mídia, áudio, figurinha)
  const msg = parseUpsertMessage(event.data);
  if (!msg) return true;

  // 4. sem janela aberta neste grupo
  const janela = await findOpenWindow(instance.tenant_id, msg.remoteJid);
  if (!janela) return true;

  // 5. não casa a palavra-chave
  if (!matchesKeyword(msg.text, janela.keyword)) return true;

  // 6. anterior à abertura da janela. A entrega da Evolution não é ordenada:
  // sem isto, um evento atrasado da oferta ANTERIOR cairia na fila da atual —
  // literalmente a divergência que a feature existe para evitar.
  if (msg.commentedAt < new Date(janela.openedAt)) return true;

  try {
    await insertEntry({
      tenantId: instance.tenant_id,
      offerId: janela.offerId,
      groupId: janela.groupId,
      whatsappGroupId: msg.remoteJid,
      participantJid: msg.participantJid,
      phone: msg.phoneHint ?? janela.lidMap[msg.participantJid] ?? null,
      pushName: msg.pushName,
      messageText: msg.text,
      messageId: msg.messageId,
      commentedAt: msg.commentedAt,
    });
  } catch (e) {
    // Não derruba a resposta: 500 faria a Evolution reentregar, e a reentrega
    // cairia no mesmo erro. Fica o log.
    console.error(`[webhook/evolution] captura da oferta relampago falhou:`, e);
  }

  return true;
}
```

E dentro de `POST`, logo depois do bloco de `connection.update` e **antes** do `recordEngineEvent`:

```typescript
  // Mensagem de grupo não entra em engine_events: são dezenas de milhares de
  // mensagens de terceiros por semana e nenhuma delas nos pertence.
  if (await applyFlashOfferComment(instance, event)) {
    return Response.json({ received: true });
  }
```

Acrescentar aos imports do arquivo:

```typescript
import { matchesKeyword } from "@/lib/relampago/keyword";
import { parseUpsertMessage } from "@/lib/relampago/upsert-message";
import { findOpenWindow, insertEntry } from "@/lib/stores/flash-offers";
```

- [ ] **Step 7: Rodar a suíte e o typecheck**

```powershell
npm --workspace apps/web test
npm run web:lint
```

`tsx --test` e o lint **não checam tipo**. Rodar também:

```powershell
npx tsc --noEmit -p apps/web/tsconfig.json
```

Esperado: os três limpos.

- [ ] **Step 8: Commit**

```powershell
git add apps/web/src/lib/relampago/ apps/web/src/lib/stores/flash-offers.ts apps/web/src/app/api/webhooks/evolution/route.ts
git commit -m "feat(relampago): receiver captura comentario que casa janela aberta"
```

---

### Task 5: Mapa `@lid` → telefone, de duas fontes

**Files:**
- Create: `apps/web/src/lib/relampago/lid-map.ts`
- Test: `apps/web/src/lib/relampago/lid-map.test.ts`
- Modify: `apps/web/src/lib/stores/flash-offers.ts` (acrescentar `lidMapFromHistory`)

**Interfaces:**
- Depends-on: Task 3, Task 4
- Consumes: `EvolutionGroup` de `@/lib/evolution/client` (Task 0 — já existe).
- Produces:
  - `lidMapFromParticipants(group: { participants?: Array<{ id?: string | null; phoneNumber?: string | null }> }): Record<string, string>`
  - `mergeLidMaps(...mapas: Array<Record<string, string>>): Record<string, string>`
  - `lidMapFromHistory(tenantId, whatsappGroupId): Promise<Record<string, string>>` (store)
  - A Task 8 usa os três ao abrir a oferta.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/src/lib/relampago/lid-map.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { lidMapFromParticipants, mergeLidMaps } from "./lid-map";

test("mapeia lid para telefone e ignora quem não tem", () => {
  const mapa = lidMapFromParticipants({
    participants: [
      { id: "111@lid", phoneNumber: "5511999998888" },
      { id: "222@lid", phoneNumber: null },
      { id: "333@lid" },
      { id: "5511977776666@s.whatsapp.net" },
    ],
  });

  assert.equal(mapa["111@lid"], "5511999998888");
  // Sem telefone não vira entrada: null aqui viraria "telefone desconhecido"
  // indistinguível de "nunca vimos essa pessoa".
  assert.equal("222@lid" in mapa, false);
  assert.equal("333@lid" in mapa, false);
  // Quem já veio com o número não precisa de mapa, mas mapear não custa.
  assert.equal(mapa["5511977776666@s.whatsapp.net"], "5511977776666");
});

test("mapa vazio quando não há participantes", () => {
  assert.deepEqual(lidMapFromParticipants({}), {});
  assert.deepEqual(lidMapFromParticipants({ participants: [] }), {});
});

test("mergeLidMaps: o primeiro argumento ganha", () => {
  // A fonte ao vivo (fetchAllGroups) vence o histórico: quem trocou de número
  // tem o valor novo no participante atual, e o antigo no evento de meses atrás.
  const vivo = { "111@lid": "5511111111111" };
  const historico = { "111@lid": "5522222222222", "999@lid": "5533333333333" };

  assert.deepEqual(mergeLidMaps(vivo, historico), {
    "111@lid": "5511111111111",
    "999@lid": "5533333333333",
  });
});

test("mergeLidMaps ignora telefone malformado", () => {
  assert.deepEqual(mergeLidMaps({ "1@lid": "abc" }, { "2@lid": "" }), {});
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
npm --workspace apps/web test -- --test-name-pattern="lid|mapa|merge"
```

Esperado: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

```typescript
// apps/web/src/lib/relampago/lid-map.ts

/**
 * Mapa `@lid` -> telefone.
 *
 * Existe porque em produção 100% dos participantes chegam como `@lid`, sem o
 * telefone ao lado no `messages.upsert` (medido em 01/09/2026 sobre 4.121
 * participantes em engine_events). Sem o mapa, a fila mostra o comentário e não
 * há como chamar ninguém.
 *
 * O mapa não cobre todo mundo: ~13% de quem entra no grupo chega sem
 * `phoneNumber` pela mesma API que o alimenta. Quem ficar de fora fica com
 * `phone = null`, e a tela oferece responder no grupo. Nunca um número inventado.
 */

type ParticipantLike = { id?: string | null; phoneNumber?: string | null };

function telefoneValido(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const digitos = valor.replace(/\D/g, "");
  return /^\d{8,15}$/.test(digitos) ? digitos : null;
}

/** Do `fetchAllGroups(getParticipants=true)`. Entradas sem telefone são omitidas. */
export function lidMapFromParticipants(group: { participants?: ParticipantLike[] }): Record<string, string> {
  const mapa: Record<string, string> = {};

  for (const p of group.participants ?? []) {
    if (!p?.id) continue;
    const fone = telefoneValido(p.phoneNumber) ?? telefoneValido(p.id.split("@")[0]);
    if (fone) mapa[p.id] = fone;
  }

  return mapa;
}

/** Mescla vários mapas. O PRIMEIRO argumento tem precedência. */
export function mergeLidMaps(...mapas: Array<Record<string, string>>): Record<string, string> {
  const saida: Record<string, string> = {};

  for (const mapa of mapas) {
    for (const [jid, fone] of Object.entries(mapa)) {
      if (jid in saida) continue;
      const valido = telefoneValido(fone);
      if (valido) saida[jid] = valido;
    }
  }

  return saida;
}
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
npm --workspace apps/web test -- --test-name-pattern="lid|mapa|merge"
```

Esperado: PASS, 4 testes.

- [ ] **Step 5: A segunda fonte — o histórico já capturado**

Acrescentar a `apps/web/src/lib/stores/flash-offers.ts`:

```typescript
/**
 * Pares `@lid -> telefone` que já passaram pelo webhook.
 *
 * Todo `group-participants.update` guarda os participantes com `phoneNumber` ao
 * lado do `@lid`, e esses eventos estão em `engine_events` desde julho. São
 * milhares de pares de graça: em 30 dias, 3.390 dos 4.121 participantes vistos
 * traziam telefone. Não custa chamada nenhuma à Evolution.
 *
 * Só os últimos 90 dias: quem trocou de número tem o par novo no
 * `fetchAllGroups`, que vence este no merge.
 */
export async function lidMapFromHistory(
  tenantId: string,
  whatsappGroupId: string,
): Promise<Record<string, string>> {
  const { data, error } = await getSupabaseAdmin()
    .from("engine_events")
    .select("payload")
    .eq("tenant_id", tenantId)
    .eq("type", "group-participants.update")
    .gte("created_at", new Date(Date.now() - 90 * 86_400_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(500);

  if (error || !data) return {};

  const mapa: Record<string, string> = {};

  for (const linha of data) {
    const evento = (linha.payload ?? {}) as { data?: { id?: string; participants?: unknown } };
    if (evento.data?.id !== whatsappGroupId) continue;

    for (const p of (evento.data?.participants ?? []) as Array<{ id?: string; phoneNumber?: string }>) {
      if (p?.id && p.phoneNumber && !(p.id in mapa)) mapa[p.id] = p.phoneNumber;
    }
  }

  return mapa;
}
```

- [ ] **Step 6: Verificar contra dados reais**

Antes de seguir, confirmar que o histórico rende algo no grupo de produção:

```sql
with p as (
  select el
  from public.engine_events e, lateral jsonb_array_elements(e.payload->'data'->'participants') el
  where e.type = 'group-participants.update'
    and e.payload->'data'->>'id' = '120363300287692953@g.us'
    and e.created_at > now() - interval '90 days'
)
select count(distinct el->>'id') as jids,
       count(distinct el->>'id') filter (where el->>'phoneNumber' is not null) as com_telefone
from p;
```

Esperado: `com_telefone` maior que zero. Se der zero, o merge não faz mal — só não ajuda, e o `fetchAllGroups` continua sendo a fonte principal.

- [ ] **Step 7: Rodar suíte e typecheck**

```powershell
npm --workspace apps/web test
npx tsc --noEmit -p apps/web/tsconfig.json
```

- [ ] **Step 8: Commit**

```powershell
git add apps/web/src/lib/relampago/lid-map.ts apps/web/src/lib/relampago/lid-map.test.ts apps/web/src/lib/stores/flash-offers.ts
git commit -m "feat(relampago): mapa lid->telefone de duas fontes"
```

---

## Fase 2 — Motor

### Task 6: `claimState` e o resto da store

**Files:**
- Create: `apps/web/src/lib/relampago/claim-state.ts`
- Test: `apps/web/src/lib/relampago/claim-state.test.ts`
- Modify: `apps/web/src/lib/stores/flash-offers.ts`

**Interfaces:**
- Depends-on: Task 3, Task 4
- Consumes: as tabelas e RPCs da Task 3.
- Produces:
  - `claimState(claim: ClaimLike, timerSeconds: number | null, now: Date): ClaimState` onde `ClaimState = "reservada" | "em_conversa" | "expirada_vendedora" | "expirada_cliente"` e `ClaimLike = { claimedAt: Date; contactedAt: Date | null }`
  - `deadlineOf(claim: ClaimLike, timerSeconds: number | null): Date | null`
  - Store: `listOffers`, `getOffer`, `listQueue`, `releaseExpired`, `claimNext`, `markContacted`, `settleClaim`, `closeOffer`.
  - A Task 8 chama a store; a Task 10 renderiza o `ClaimState`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/src/lib/relampago/claim-state.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { claimState, deadlineOf } from "./claim-state";

const t0 = new Date("2026-09-01T14:00:00.000Z");
const emSegundos = (s: number) => new Date(t0.getTime() + s * 1000);

test("reservada enquanto o prazo de chamar não venceu", () => {
  const c = { claimedAt: t0, contactedAt: null };
  assert.equal(claimState(c, 300, emSegundos(299)), "reservada");
});

test("expirada_vendedora quando venceu sem ter chamado", () => {
  // A falha foi da loja: a cliente mantém a posição.
  const c = { claimedAt: t0, contactedAt: null };
  assert.equal(claimState(c, 300, emSegundos(301)), "expirada_vendedora");
});

test("em_conversa depois de chamar, com prazo correndo do contato", () => {
  const c = { claimedAt: t0, contactedAt: emSegundos(280) };
  // 290s do claim, mas só 10s do contato: o prazo reiniciou.
  assert.equal(claimState(c, 300, emSegundos(290)), "em_conversa");
});

test("expirada_cliente quando venceu depois de chamada", () => {
  // A cliente não respondeu: vai para o fim da fila.
  const c = { claimedAt: t0, contactedAt: emSegundos(100) };
  assert.equal(claimState(c, 300, emSegundos(401)), "expirada_cliente");
});

test("sem timer nada expira", () => {
  const semChamar = { claimedAt: t0, contactedAt: null };
  const chamada = { claimedAt: t0, contactedAt: emSegundos(10) };
  assert.equal(claimState(semChamar, null, emSegundos(999_999)), "reservada");
  assert.equal(claimState(chamada, null, emSegundos(999_999)), "em_conversa");
  assert.equal(deadlineOf(semChamar, null), null);
});

test("deadlineOf corre do contato quando existe", () => {
  assert.equal(
    deadlineOf({ claimedAt: t0, contactedAt: emSegundos(100) }, 300)?.toISOString(),
    emSegundos(400).toISOString(),
  );
  assert.equal(
    deadlineOf({ claimedAt: t0, contactedAt: null }, 300)?.toISOString(),
    emSegundos(300).toISOString(),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
npm --workspace apps/web test -- --test-name-pattern="reservada|expirada|em_conversa|sem timer|deadlineOf"
```

Esperado: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

```typescript
// apps/web/src/lib/relampago/claim-state.ts

export type ClaimLike = {
  claimedAt: Date;
  contactedAt: Date | null;
};

export type ClaimState = "reservada" | "em_conversa" | "expirada_vendedora" | "expirada_cliente";

/**
 * Quando a reserva vence. `null` = sem timer.
 *
 * O prazo corre do contato quando ele existe: antes de chamar, a vendedora tem
 * o prazo para chamar; depois, a cliente tem o mesmo prazo para responder.
 */
export function deadlineOf(claim: ClaimLike, timerSeconds: number | null): Date | null {
  if (timerSeconds == null) return null;
  const base = claim.contactedAt ?? claim.claimedAt;
  return new Date(base.getTime() + timerSeconds * 1000);
}

/**
 * Estado de uma reserva. Um único número, dois efeitos — e o desfecho depende de
 * QUEM falhou:
 *
 *  - venceu sem contato -> `expirada_vendedora`. A loja não chamou; a cliente
 *    mantém a posição na fila.
 *  - venceu com contato -> `expirada_cliente`. A cliente não respondeu; vai para
 *    o fim, sem perder o registro do horário original.
 *
 * É a diferença entre "a loja me ignorou" e "eu sumi". Sem ela, o sistema puniria
 * a cliente por lentidão interna da loja.
 */
export function claimState(claim: ClaimLike, timerSeconds: number | null, now: Date): ClaimState {
  const prazo = deadlineOf(claim, timerSeconds);
  const venceu = prazo != null && now > prazo;

  if (claim.contactedAt == null) return venceu ? "expirada_vendedora" : "reservada";
  return venceu ? "expirada_cliente" : "em_conversa";
}
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
npm --workspace apps/web test -- --test-name-pattern="reservada|expirada|em_conversa|sem timer|deadlineOf"
```

Esperado: PASS, 6 testes.

- [ ] **Step 5: Completar a store**

Acrescentar a `apps/web/src/lib/stores/flash-offers.ts`:

```typescript
export type OfferRow = {
  id: string;
  tenant_id: string;
  name: string;
  keyword: string;
  slots: number;
  timer_seconds: number | null;
  status: "draft" | "open" | "closed";
  opened_at: string | null;
  closed_at: string | null;
  created_at: string;
};

export type QueueEntry = {
  id: string;
  participant_jid: string;
  phone: string | null;
  push_name: string | null;
  message_text: string;
  commented_at: string;
  deprioritized_at: string | null;
  outcome: "sold" | "dropped" | null;
  claim: {
    id: string;
    seller_user_id: string;
    claimed_at: string;
    contacted_at: string | null;
  } | null;
};

export async function listOffers(tenantId: string): Promise<OfferRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("flash_offers")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data ?? []) as OfferRow[];
}

export async function getOffer(tenantId: string, offerId: string): Promise<OfferRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("flash_offers")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", offerId)
    .maybeSingle();

  if (error) throw error;
  return (data as OfferRow) ?? null;
}

/**
 * Recicla o que venceu ANTES de servir a fila. É o que substitui o cron: quem lê
 * é quem recicla. A tela dá poll de qualquer forma.
 */
export async function releaseExpired(tenantId: string, offerId: string): Promise<number> {
  const { data, error } = await getSupabaseAdmin().rpc("release_expired_flash_claims", {
    p_tenant: tenantId,
    p_offer: offerId,
  });

  if (error) throw error;
  return (data as number) ?? 0;
}

/** A fila na ordem. `commented_at` nunca é reescrito — é a prova. */
export async function listQueue(tenantId: string, offerId: string): Promise<QueueEntry[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("flash_offer_entries")
    .select(
      "id, participant_jid, phone, push_name, message_text, commented_at, deprioritized_at, outcome," +
        " flash_offer_claims(id, seller_user_id, claimed_at, contacted_at, released_at)",
    )
    .eq("tenant_id", tenantId)
    .eq("offer_id", offerId)
    .order("deprioritized_at", { ascending: true, nullsFirst: true })
    .order("commented_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((linha) => {
    const claims = (linha.flash_offer_claims ?? []) as Array<{
      id: string;
      seller_user_id: string;
      claimed_at: string;
      contacted_at: string | null;
      released_at: string | null;
    }>;
    const ativo = claims.find((c) => c.released_at === null) ?? null;

    return {
      id: linha.id as string,
      participant_jid: linha.participant_jid as string,
      phone: linha.phone as string | null,
      push_name: linha.push_name as string | null,
      message_text: linha.message_text as string,
      commented_at: linha.commented_at as string,
      deprioritized_at: linha.deprioritized_at as string | null,
      outcome: linha.outcome as "sold" | "dropped" | null,
      claim: ativo
        ? {
            id: ativo.id,
            seller_user_id: ativo.seller_user_id,
            claimed_at: ativo.claimed_at,
            contacted_at: ativo.contacted_at,
          }
        : null,
    };
  });
}

export type ClaimResult =
  | { ok: true; claimId: string; entryId: string }
  | { ok: false; motivo: "sem_vaga" | "fila_vazia" | "oferta_fechada" };

/**
 * Pega a próxima da fila. O teto de `slots` é conferido DENTRO da RPC: conferir
 * na rota e inserir depois deixaria duas vendedoras clicando juntas passarem do
 * estoque.
 */
export async function claimNext(
  tenantId: string,
  offerId: string,
  sellerUserId: string,
): Promise<ClaimResult> {
  const { data, error } = await getSupabaseAdmin().rpc("claim_next_flash_entry", {
    p_tenant: tenantId,
    p_offer: offerId,
    p_seller: sellerUserId,
  });

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("sem vaga")) return { ok: false, motivo: "sem_vaga" };
    if (msg.includes("fila vazia")) return { ok: false, motivo: "fila_vazia" };
    if (msg.includes("nao esta aberta")) return { ok: false, motivo: "oferta_fechada" };
    // 23505: outra vendedora ganhou a corrida na MESMA cliente. Não é erro de
    // sistema — a tela recarrega e ela clica de novo.
    if (error.code === "23505") return { ok: false, motivo: "fila_vazia" };
    throw error;
  }

  const claim = data as { id: string; entry_id: string };
  return { ok: true, claimId: claim.id, entryId: claim.entry_id };
}

/** Clicar em "Chamar no WhatsApp" larga o cronômetro. Idempotente. */
export async function markContacted(tenantId: string, claimId: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("flash_offer_claims")
    .update({ contacted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", claimId)
    .is("contacted_at", null)
    .is("released_at", null);

  if (error) throw error;
}

/**
 * Fecha a reserva com desfecho. `sold` consome uma vaga para sempre; `dropped`
 * devolve a vaga e encerra a entrada.
 */
export async function settleClaim(
  tenantId: string,
  claimId: string,
  outcome: "sold" | "dropped",
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const agora = new Date().toISOString();

  const { data: claim, error: erroClaim } = await supabase
    .from("flash_offer_claims")
    .update({ released_at: agora, release_reason: outcome, updated_at: agora })
    .eq("tenant_id", tenantId)
    .eq("id", claimId)
    .is("released_at", null)
    .select("entry_id")
    .maybeSingle();

  if (erroClaim) throw erroClaim;
  if (!claim) return; // já fechada: no-op

  const { error: erroEntry } = await supabase
    .from("flash_offer_entries")
    .update({ outcome, updated_at: agora })
    .eq("tenant_id", tenantId)
    .eq("id", claim.entry_id);

  if (erroEntry) throw erroEntry;
}

/** Fecha a oferta e libera os grupos para a próxima. */
export async function closeOffer(tenantId: string, offerId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const agora = new Date().toISOString();

  const { error: erroOferta } = await supabase
    .from("flash_offers")
    .update({ status: "closed", closed_at: agora, updated_at: agora })
    .eq("tenant_id", tenantId)
    .eq("id", offerId);

  if (erroOferta) throw erroOferta;

  // Sem isto o índice único continua bloqueando o grupo para sempre.
  const { error: erroGrupos } = await supabase
    .from("flash_offer_groups")
    .update({ closed_at: agora })
    .eq("tenant_id", tenantId)
    .eq("offer_id", offerId)
    .is("closed_at", null);

  if (erroGrupos) throw erroGrupos;
}
```

- [ ] **Step 6: Rodar suíte e typecheck**

```powershell
npm --workspace apps/web test
npx tsc --noEmit -p apps/web/tsconfig.json
```

- [ ] **Step 7: Commit**

```powershell
git add apps/web/src/lib/relampago/claim-state.ts apps/web/src/lib/relampago/claim-state.test.ts apps/web/src/lib/stores/flash-offers.ts
git commit -m "feat(relampago): estado da reserva e store da fila"
```

---

### Task 7: Teste de integração contra o Supabase de dev

O projeto exige que teste de integração **mate o mutante** — um defeito plantado entre os elos tem de reprovar. Sem isso o teste só documenta o caminho feliz.

**Files:**
- Create: `apps/web/src/lib/stores/flash-offers.integration.test.ts`

**Interfaces:**
- Depends-on: Task 3, Task 4, Task 5, Task 6
- Consumes: tudo das Tasks 3 a 6.
- Produces: nada de código novo.

- [ ] **Step 1: Escrever o teste**

```typescript
// apps/web/src/lib/stores/flash-offers.integration.test.ts
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { claimNext, closeOffer, insertEntry, listQueue, releaseExpired, settleClaim } from "./flash-offers";

/**
 * Contra o Supabase de DEV. As regras testadas aqui vivem em índices e RPCs —
 * teste unitário não as alcança, e é exatamente entre os elos que o defeito mora.
 */

const TENANT = process.env.E2E_TENANT_ID ?? "";
const GRUPO_WA = "120363999999999999@g.us";
let offerId = "";
let groupId = "";

before(async () => {
  if (!TENANT) return;
  const supabase = getSupabaseAdmin();

  const { data: grupo } = await supabase
    .from("groups").select("id").eq("tenant_id", TENANT).limit(1).maybeSingle();
  groupId = grupo?.id ?? "";

  const { data: oferta } = await supabase
    .from("flash_offers")
    .insert({ tenant_id: TENANT, name: "teste", keyword: "eu quero", slots: 2, timer_seconds: 60, status: "open", opened_at: new Date().toISOString() })
    .select("id").single();
  offerId = oferta!.id;

  await supabase.from("flash_offer_groups").insert({
    tenant_id: TENANT, offer_id: offerId, group_id: groupId,
    whatsapp_group_id: GRUPO_WA, opened_at: new Date(Date.now() - 60_000).toISOString(),
  });
});

after(async () => {
  if (!TENANT || !offerId) return;
  await getSupabaseAdmin().from("flash_offers").delete().eq("id", offerId);
});

function pular(): boolean {
  if (!TENANT) {
    console.log("E2E_TENANT_ID ausente — teste de integração pulado");
    return true;
  }
  return false;
}

const entrada = (n: number, quando: Date) => ({
  tenantId: TENANT, offerId, groupId, whatsappGroupId: GRUPO_WA,
  participantJid: `${n}@lid`, phone: null, pushName: `Cliente ${n}`,
  messageText: "eu quero", messageId: `MSG${n}`, commentedAt: quando,
});

test("mesmo message_id duas vezes vira uma entrada só", async (t) => {
  if (pular()) return t.skip();
  const agora = new Date();
  assert.equal(await insertEntry(entrada(1, agora)), true);
  assert.equal(await insertEntry(entrada(1, agora)), false);
});

test("mesma pessoa comentando de novo ocupa um lugar só", async (t) => {
  if (pular()) return t.skip();
  const outraMensagem = { ...entrada(1, new Date()), messageId: "MSG1-BIS" };
  assert.equal(await insertEntry(outraMensagem), false);
});

test("claim além de slots é recusado", async (t) => {
  if (pular()) return t.skip();
  await insertEntry(entrada(2, new Date(Date.now() + 1000)));
  await insertEntry(entrada(3, new Date(Date.now() + 2000)));

  const a = await claimNext(TENANT, offerId, crypto.randomUUID());
  const b = await claimNext(TENANT, offerId, crypto.randomUUID());
  const c = await claimNext(TENANT, offerId, crypto.randomUUID());

  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  // slots = 2. O terceiro não passa.
  assert.equal(c.ok, false);
  if (!c.ok) assert.equal(c.motivo, "sem_vaga");
});

test("segunda oferta aberta no mesmo grupo é recusada pelo banco", async (t) => {
  if (pular()) return t.skip();
  const supabase = getSupabaseAdmin();
  const { data: outra } = await supabase.from("flash_offers")
    .insert({ tenant_id: TENANT, name: "conflito", slots: 1, status: "open" })
    .select("id").single();

  const { error } = await supabase.from("flash_offer_groups").insert({
    tenant_id: TENANT, offer_id: outra!.id, group_id: groupId, whatsapp_group_id: GRUPO_WA,
  });

  assert.equal(error?.code, "23505");
  await supabase.from("flash_offers").delete().eq("id", outra!.id);
});

test("expirada sem chamar mantém a posição; depois de chamada vai para o fim", async (t) => {
  if (pular()) return t.skip();
  const supabase = getSupabaseAdmin();
  const passado = new Date(Date.now() - 3600_000).toISOString();

  const { data: claims } = await supabase.from("flash_offer_claims")
    .select("id, entry_id").eq("offer_id", offerId).is("released_at", null);

  // Uma venceu sem contato, a outra venceu depois de chamada.
  await supabase.from("flash_offer_claims")
    .update({ claimed_at: passado }).eq("id", claims![0].id);
  await supabase.from("flash_offer_claims")
    .update({ claimed_at: passado, contacted_at: passado }).eq("id", claims![1].id);

  const liberados = await releaseExpired(TENANT, offerId);
  assert.ok(liberados >= 2);

  const fila = await listQueue(TENANT, offerId);
  const semContato = fila.find((e) => e.id === claims![0].entry_id);
  const comContato = fila.find((e) => e.id === claims![1].entry_id);

  assert.equal(semContato?.deprioritized_at, null, "a loja falhou: a cliente mantém a posição");
  assert.ok(comContato?.deprioritized_at, "a cliente sumiu: vai para o fim");
});

test("venda consome vaga para sempre", async (t) => {
  if (pular()) return t.skip();
  const novo = await claimNext(TENANT, offerId, crypto.randomUUID());
  assert.equal(novo.ok, true);
  if (!novo.ok) return;

  await settleClaim(TENANT, novo.claimId, "sold");
  const fila = await listQueue(TENANT, offerId);
  assert.equal(fila.find((e) => e.id === novo.entryId)?.outcome, "sold");
});
```

- [ ] **Step 2: Rodar contra dev**

```powershell
npm --workspace apps/web test -- --test-name-pattern="message_id|mesma pessoa|slots|segunda oferta|expirada|venda"
```

Esperado: PASS. Sem `E2E_TENANT_ID`, os testes se marcam como skip em vez de falhar.

- [ ] **Step 3: Matar o mutante — obrigatório**

Um teste de integração que passa com o código quebrado não testa nada. Plantar **um** defeito por vez e confirmar que o teste reprova:

| Mutante | Onde | Teste que deve reprovar |
|---|---|---|
| Trocar `v_ocupadas >= v_slots` por `>` na RPC | migração | "claim além de slots é recusado" |
| Tirar `and l.contacted_at is not null` do update de `deprioritized_at` | migração | "expirada sem chamar mantém a posição" |
| Trocar `nullsFirst: true` por `false` em `listQueue` | store | "expirada ... vai para o fim" |
| Retornar `true` sempre em `insertEntry` | store | "mesmo message_id duas vezes" |

Rodar a suíte **depois de cada** mutante. Todo mutante tem de reprovar. Se algum passar, o teste correspondente está fraco e precisa ser reescrito antes de seguir. Desfazer o mutante ao terminar.

- [ ] **Step 4: Commit**

```powershell
git add apps/web/src/lib/stores/flash-offers.integration.test.ts
git commit -m "test(relampago): integracao contra dev, com mutantes verificados"
```

---

### Task 8: Rotas de API

**Files:**
- Create: `apps/web/src/app/api/relampago/offers/route.ts`
- Create: `apps/web/src/app/api/relampago/offers/[id]/route.ts`
- Create: `apps/web/src/app/api/relampago/offers/[id]/claim/route.ts`
- Create: `apps/web/src/app/api/relampago/claims/[id]/route.ts`

**Interfaces:**
- Depends-on: Task 4, Task 5, Task 6
- Consumes: a store (Tasks 4-6); `getTenantContext(req)` de `@/lib/supabase/tenant-context`, que devolve `{ authUserId, email, tenantId, role }` e lança `Response` 401/403; `fetchAllGroups` de `@/lib/evolution/client`; `lidMapFromParticipants`/`mergeLidMaps` (Task 5).
- Produces: os contratos HTTP que a Task 10 consome.

- [ ] **Step 1: `GET`/`POST /api/relampago/offers`**

```typescript
// apps/web/src/app/api/relampago/offers/route.ts
import { fetchAllGroups, providerInstanceId } from "@/lib/evolution/client";
import { lidMapFromParticipants, mergeLidMaps } from "@/lib/relampago/lid-map";
import { normalizeKeyword } from "@/lib/relampago/keyword";
import { lidMapFromHistory, listOffers } from "@/lib/stores/flash-offers";
import { listInstances } from "@/lib/stores/instances";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    return Response.json({ offers: await listOffers(ctx.tenantId) });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

/**
 * Cria a oferta E abre a janela nos grupos, numa coisa só. Não existe oferta
 * criada-mas-não-aberta útil: o valor inteiro está na janela estar aberta quando
 * a lojista posta a promoção.
 */
export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await getTenantContext(req);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    keyword?: string;
    slots?: number;
    timerMinutes?: number | null;
    groupIds?: string[];
  } | null;

  if (!body?.name?.trim()) return Response.json({ error: "nome obrigatorio" }, { status: 400 });
  if (!Number.isInteger(body.slots) || (body.slots ?? 0) < 1) {
    return Response.json({ error: "informe quantas pecas" }, { status: 400 });
  }
  if (!body.groupIds?.length) {
    return Response.json({ error: "escolha ao menos um grupo" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: grupos, error: erroGrupos } = await supabase
    .from("groups")
    .select("id, whatsapp_group_id")
    .eq("tenant_id", ctx.tenantId)
    .in("id", body.groupIds);

  if (erroGrupos) throw erroGrupos;
  if (!grupos?.length) return Response.json({ error: "grupo nao encontrado" }, { status: 404 });

  const agora = new Date().toISOString();

  const { data: oferta, error: erroOferta } = await supabase
    .from("flash_offers")
    .insert({
      tenant_id: ctx.tenantId,
      name: body.name.trim(),
      keyword: normalizeKeyword(body.keyword || "eu quero"),
      slots: body.slots,
      timer_seconds: body.timerMinutes ? Math.round(body.timerMinutes * 60) : null,
      status: "open",
      opened_at: agora,
      created_by: ctx.authUserId,
    })
    .select("*")
    .single();

  if (erroOferta) throw erroOferta;

  // O mapa @lid -> telefone. Uma chamada à Evolution por abertura, não por
  // comentário: 100% dos participantes chegam como @lid e sem isso a fila fica
  // bonita e inútil.
  let participantesPorGrupo: Record<string, Record<string, string>> = {};
  try {
    const instancias = await listInstances(ctx.tenantId);
    const conectada = instancias.find((i) => i.status === "connected");
    if (conectada) {
      const todos = await fetchAllGroups(providerInstanceId(conectada.id));
      participantesPorGrupo = Object.fromEntries(
        todos.map((g) => [g.id, lidMapFromParticipants(g)]),
      );
    }
  } catch (e) {
    // Falhar aqui não pode impedir a abertura: sem mapa a fila ainda registra
    // quem comentou, e a tela oferece responder no grupo.
    console.error("[relampago] lid_map ao vivo indisponivel:", e);
  }

  const linhas = await Promise.all(
    grupos.map(async (g) => ({
      tenant_id: ctx.tenantId,
      offer_id: oferta.id,
      group_id: g.id,
      whatsapp_group_id: g.whatsapp_group_id,
      opened_at: agora,
      lid_map: mergeLidMaps(
        participantesPorGrupo[g.whatsapp_group_id] ?? {},
        await lidMapFromHistory(ctx.tenantId, g.whatsapp_group_id),
      ),
    })),
  );

  const { error: erroJanela } = await supabase.from("flash_offer_groups").insert(linhas);

  if (erroJanela) {
    // 23505 = já existe oferta aberta num desses grupos. Recusado pelo Postgres,
    // não pela tela. Desfaz a oferta órfã.
    await supabase.from("flash_offers").delete().eq("id", oferta.id);
    if (erroJanela.code === "23505") {
      return Response.json(
        { error: "Um desses grupos ja tem uma oferta aberta. Feche a anterior primeiro." },
        { status: 409 },
      );
    }
    throw erroJanela;
  }

  return Response.json({ offer: oferta }, { status: 201 });
}
```

- [ ] **Step 2: `GET`/`POST /api/relampago/offers/[id]`**

```typescript
// apps/web/src/app/api/relampago/offers/[id]/route.ts
import { closeOffer, getOffer, listQueue, releaseExpired } from "@/lib/stores/flash-offers";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantContext(req);
    const { id } = await params;

    const oferta = await getOffer(ctx.tenantId, id);
    if (!oferta) return Response.json({ error: "nao encontrada" }, { status: 404 });

    // Recicla o vencido ANTES de servir. É o que substitui o cron.
    await releaseExpired(ctx.tenantId, id);

    return Response.json({
      offer: oferta,
      queue: await listQueue(ctx.tenantId, id),
      me: ctx.authUserId,
      now: new Date().toISOString(),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantContext(req);
    const { id } = await params;
    await closeOffer(ctx.tenantId, id);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
```

- [ ] **Step 3: `POST /api/relampago/offers/[id]/claim`**

```typescript
// apps/web/src/app/api/relampago/offers/[id]/claim/route.ts
import { claimNext, releaseExpired } from "@/lib/stores/flash-offers";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MOTIVOS: Record<string, { mensagem: string; status: number }> = {
  sem_vaga: { mensagem: "Nao ha vaga livre agora.", status: 409 },
  fila_vazia: { mensagem: "Ninguem na fila esperando.", status: 409 },
  oferta_fechada: { mensagem: "Esta oferta ja foi fechada.", status: 409 },
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantContext(req);
    const { id } = await params;

    // Libera o vencido primeiro: sem isto uma reserva abandonada seguraria a
    // vaga e "Pegar próxima" diria "sem vaga" com a fila cheia.
    await releaseExpired(ctx.tenantId, id);

    const resultado = await claimNext(ctx.tenantId, id, ctx.authUserId);
    if (!resultado.ok) {
      const { mensagem, status } = MOTIVOS[resultado.motivo];
      return Response.json({ error: mensagem }, { status });
    }

    return Response.json({ claimId: resultado.claimId, entryId: resultado.entryId });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
```

- [ ] **Step 4: `POST /api/relampago/claims/[id]`**

```typescript
// apps/web/src/app/api/relampago/claims/[id]/route.ts
import { markContacted, settleClaim } from "@/lib/stores/flash-offers";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getTenantContext(req);
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as { action?: string } | null;

    switch (body?.action) {
      case "contacted":
        await markContacted(ctx.tenantId, id);
        return Response.json({ ok: true });
      case "sold":
      case "dropped":
        await settleClaim(ctx.tenantId, id, body.action);
        return Response.json({ ok: true });
      default:
        return Response.json({ error: "acao invalida" }, { status: 400 });
    }
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
```

- [ ] **Step 5: Lint e typecheck**

```powershell
npm run web:lint
npx tsc --noEmit -p apps/web/tsconfig.json
```

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/app/api/relampago/
git commit -m "feat(relampago): rotas de oferta, fila, reserva e desfecho"
```

---

## Fase 3 — Telas

### Task 9: Menu e lista de ofertas

**Files:**
- Modify: `apps/web/src/lib/painel-nav.ts`
- Create: `apps/web/src/app/painel/relampago/page.tsx`

**Interfaces:**
- Depends-on: Task 8
- Consumes: `GET`/`POST /api/relampago/offers` (Task 8).
- Produces: a rota `/painel/relampago`, de onde a Task 10 é alcançada.

- [ ] **Step 1: Item de menu**

Em `apps/web/src/lib/painel-nav.ts`, acrescentar `Flame` ao import de `lucide-react` e o item logo abaixo de Disparos, no primeiro grupo:

```typescript
      { href: "/painel/relampago", label: "Oferta Relâmpago", icon: Flame },
```

`Flame` e não `Zap`: `Zap` já é Automações, e dois itens com o mesmo ícone no mesmo grupo confundem mais do que ajudam.

- [ ] **Step 2: Página de lista**

Server component que lista, com um client component para o formulário. Seguir o padrão de `/painel/grupos` para layout e classes `pn-*`.

A tela tem três partes:
1. Cabeçalho com botão "Nova oferta".
2. Se houver oferta `open`, um card destacado no topo com link para `/painel/relampago/[id]`.
3. Lista das demais, com nome, palavra-chave, vagas, e status.

O formulário coleta: nome, grupos (multi-select dos grupos com `is_admin = true`), palavra-chave com default "EU QUERO", quantas peças, e timer em minutos com uma opção "sem timer". Um botão **Abrir** que faz `POST /api/relampago/offers` e navega para a oferta criada.

Erro 409 tem tratamento próprio: "Um desses grupos já tem uma oferta aberta. Feche a anterior primeiro." — é a recusa do banco chegando na tela, e ela precisa dizer o que fazer.

- [ ] **Step 3: Verificar no navegador**

```powershell
npm run web:dev
```

Abrir `http://localhost:3000/painel/relampago`. Conferir: o item aparece no menu; a lista carrega; criar uma oferta leva para a tela dela.

- [ ] **Step 4: Commit**

```powershell
git add apps/web/src/lib/painel-nav.ts apps/web/src/app/painel/relampago/page.tsx
git commit -m "feat(relampago): menu e lista de ofertas"
```

---

### Task 10: A tela onde a promoção acontece

**Files:**
- Create: `apps/web/src/app/painel/relampago/[id]/page.tsx`
- Create: `apps/web/src/app/painel/relampago/fila-client.tsx`

**Interfaces:**
- Depends-on: Task 6, Task 8
- Consumes: `GET /api/relampago/offers/[id]`, `POST .../claim`, `POST /api/relampago/claims/[id]`; `claimState`/`deadlineOf` (Task 6).
- Produces: nada consumido por tarefas posteriores.

- [ ] **Step 1: Estrutura**

`page.tsx` é server component e só monta o shell. `fila-client.tsx` é `"use client"` e dá poll em `GET /api/relampago/offers/[id]` a cada 5 segundos — é o poll que também recicla o que venceu, porque a rota chama `releaseExpired` antes de servir.

- [ ] **Step 2: O card da vendedora, no topo**

Mostra a cliente que está na mão de quem está olhando (`claim.seller_user_id === me`):

- nome (`push_name`, com "sem nome" quando null), o comentário exato, e o horário
- o cronômetro, de `deadlineOf(claim, offer.timer_seconds)`, contando com base no `now` que veio do servidor — não no relógio do navegador, que pode estar torto
- **quando `phone` existe:** botão "Chamar no WhatsApp", link `wa.me/<phone>` com texto pré-preenchido, `target="_blank"`. Clicar dispara `POST /api/relampago/claims/[id]` com `action: "contacted"` — é isso que larga o cronômetro
- depois de chamada: dois botões, **Vendeu** e **Não respondeu**, que mandam `action: "sold"` / `"dropped"`

- [ ] **Step 3: O caminho de quem não tem telefone**

Este é o item que o R1 mudou: **~1 em 7 clientes não terá telefone**, então isto não é um aviso discreto, é uma ação de primeira classe.

Quando `phone` é `null`, o card mostra:

- o rótulo "telefone não identificado" no lugar do número — **nunca um número inventado**
- botão primário **"Responder no grupo"**, que abre o grupo no WhatsApp e copia para a área de transferência um texto pronto citando o `push_name` e o comentário. A vendedora acha a pessoa pela mensagem dela e responde ali mesmo
- o mesmo par Vendeu / Não respondeu

Abrir o grupo, e não mandar DM: a decisão durável do projeto é que automação só posta no grupo, e aqui nem automação é — é a vendedora abrindo o app dela.

- [ ] **Step 4: A fila inteira, abaixo**

Na ordem, mostrando para cada uma: posição, nome, comentário, horário, e quem está atendendo. Uma linha divisória marca onde o estoque acaba — as posições além de `slots - vendidas` aparecem visualmente separadas como "espera". Essa linha **anda** conforme as vendas fecham; não é fixa na abertura.

Todas as vendedoras veem tudo; cada uma só age no que é dela. Transparência interna é o que evita o "por que ela pegou a minha?".

Estados por entrada, derivados — nunca uma coluna `status`:

| Situação | Rótulo |
|---|---|
| `outcome` preenchido | Vendida / Não respondeu |
| sem claim ativo | Na fila |
| claim ativo, `contacted_at` nulo | Reservada por <nome> |
| claim ativo, `contacted_at` preenchido | Em conversa com <nome> |
| posição > vagas restantes | Espera |

- [ ] **Step 5: "Pegar próxima"**

Botão habilitado só quando `slots - (vendidas + claims ativos) > 0`. Em 409, mostrar a mensagem que a rota devolveu e recarregar a fila — outra vendedora ganhou a corrida, e isso é normal, não erro.

- [ ] **Step 6: Verificar no navegador**

```powershell
npm run web:dev
```

Com uma oferta aberta, inserir uma entrada à mão no Supabase de dev e conferir: ela aparece na fila; "Pegar próxima" a reserva; o cronômetro anda; "Chamar" abre o `wa.me`; "Vendeu" tira da fila e libera a vaga.

Inserir também **uma entrada com `phone = null`** e confirmar que o caminho "Responder no grupo" aparece — é o caso de ~1 em 7 e não pode ser descoberto só em produção.

- [ ] **Step 7: Lint e typecheck**

```powershell
npm run web:lint
npx tsc --noEmit -p apps/web/tsconfig.json
```

- [ ] **Step 8: Commit**

```powershell
git add apps/web/src/app/painel/relampago/
git commit -m "feat(relampago): tela da fila com reserva, timer e caminho sem telefone"
```

---

### Task 11: E2E

**Files:**
- Create: `apps/web/e2e/relampago.spec.ts`

**Interfaces:**
- Depends-on: Task 9, Task 10
- Consumes: as telas das Tasks 9-10.
- Produces: nada.

- [ ] **Step 1: Escrever a spec**

Cobrir: abrir oferta → inserir comentário pela API de teste → puxar → chamar → vender. Seguir o padrão de contraste API × tela já usado no projeto: buscar a âncora pela API e conferir que a tela mostra o mesmo, em vez de fixar texto no teste.

Restaurar o estado lendo o ambiente no fim, como as specs existentes fazem — meta suja é armadilha permanente neste projeto.

- [ ] **Step 2: Rodar**

```powershell
npm run web:e2e -- relampago
```

Se a suíte parecer passar sem exercitar nada, conferir se há servidor órfão na porta: usar `E2E_BASE_URL` e esperar ~15s pelo boot.

- [ ] **Step 3: Commit**

```powershell
git add apps/web/e2e/relampago.spec.ts
git commit -m "test(relampago): e2e do fluxo completo"
```

---

## Fase 4 — Ativação

### Task 12: Ligar `messages.upsert` na instância que já existe

**Sem esta tarefa a feature inteira fica muda.** A constante de eventos só é enviada à Evolution dentro de `setWebhook`, e `setWebhook` só roda na criação da instância — a de produção foi criada há 36 dias.

**Files:**
- Modify: `apps/web/src/lib/evolution/client.ts:26`
- Create: `apps/web/src/app/api/admin/instances/rewebhook/route.ts`

**Interfaces:**
- Depends-on: Task 2, Task 4
- Consumes: `setWebhook`, `evolutionWebhookUrl`, `providerInstanceId` de `@/lib/evolution/client`; `listInstances` de `@/lib/stores/instances`.
- Produces: nada.

- [ ] **Step 1: Acrescentar o evento à constante**

```typescript
export const EVOLUTION_WEBHOOK_EVENTS = [
  "QRCODE_UPDATED",
  "CONNECTION_UPDATE",
  "GROUP_PARTICIPANTS_UPDATE",
  "GROUPS_UPSERT",
  "MESSAGES_UPDATE",
  // Oferta Relâmpago. Faz chegar TODA mensagem de TODOS os grupos onde a
  // instância está — o receiver descarta em cascata e nada disso vira linha
  // sem casar uma janela aberta.
  "MESSAGES_UPSERT",
] as const;
```

- [ ] **Step 2: Rota de re-registro**

```typescript
// apps/web/src/app/api/admin/instances/rewebhook/route.ts
import { evolutionWebhookUrl, providerInstanceId, setWebhook } from "@/lib/evolution/client";
import { resolveSecret } from "@/lib/runtime-secrets";
import { listInstances } from "@/lib/stores/instances";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Re-registra o webhook das instâncias que já existem.
 *
 * `setWebhook` só era chamado na criação, então acrescentar um evento à
 * constante não alcançava instância antiga: ela seguia assinada na lista do dia
 * em que foi criada. Sem isto, `messages.upsert` nunca chega e a Oferta
 * Relâmpago fica muda parecendo bug de código.
 */
export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await getTenantContext(req);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return Response.json({ error: "sem permissao" }, { status: 403 });
  }

  const secret = resolveSecret(
    "EVOLUTION_WEBHOOK_SECRET",
    process.env.EVOLUTION_WEBHOOK_SECRET,
    process.env.NODE_ENV,
    "dev-evolution-webhook-secret",
  );

  const resultados: Array<{ id: string; ok: boolean; erro?: string }> = [];

  for (const instancia of await listInstances(ctx.tenantId)) {
    try {
      await setWebhook(providerInstanceId(instancia.id), evolutionWebhookUrl(), secret);
      resultados.push({ id: instancia.id, ok: true });
    } catch (e) {
      resultados.push({ id: instancia.id, ok: false, erro: e instanceof Error ? e.message : "falhou" });
    }
  }

  return Response.json({ resultados });
}
```

- [ ] **Step 3: Deploy e execução**

Depois do merge e do deploy em produção, chamar a rota autenticado como owner do tenant. Conferir a resposta: `ok: true` para a instância conectada.

- [ ] **Step 4: Provar que o evento passou a chegar**

Comentar a palavra-chave no grupo com uma oferta aberta e conferir:

```sql
select count(*) as entradas, max(commented_at) as ultimo
from public.flash_offer_entries
where offer_id = '<id-da-oferta>';
```

Esperado: pelo menos uma linha, com `commented_at` batendo com o horário real do comentário.

**Se vier zero**, a ordem de checagem é: (a) a rota de re-registro devolveu `ok`? (b) o grupo está em `flash_offer_groups` com `closed_at` nulo? (c) a oferta está `open`? (d) o texto casa a palavra-chave normalizada? Um probe HTTP não serve aqui: rota inexistente e rota sem permissão devolvem o mesmo, e é preciso o controle.

- [ ] **Step 5: Medir o que o R1 deixou em aberto**

Com dado real na mesa, medir quanto do `lid_map` funcionou:

```sql
select count(*) as total,
       count(phone) as com_telefone,
       round(100.0 * count(phone) / nullif(count(*), 0), 1) as pct
from public.flash_offer_entries
where offer_id = '<id-da-oferta>';
```

O R1 previu ~87% no melhor caso. Se vier muito abaixo, o `lid_map` não está sendo montado — conferir se `fetchAllGroups` respondeu na abertura (o `catch` da Task 8 é silencioso de propósito para não travar a abertura, então o log é a evidência).

Se vier **acima** de 90%, provavelmente a Evolution está mandando `participantAlt`/`senderPn` e a Task 4 os aproveitou. Registrar isso: significa que o `lid_map` pode sair do caminho crítico numa próxima iteração.

- [ ] **Step 6: Verificar o volume no receiver (R2 do spec)**

```sql
select count(*) from public.engine_events where created_at > now() - interval '1 hour';
```

Esperado: **sem crescimento** em relação ao normal. Mensagem de grupo não entra em `engine_events` — se estiver entrando, o `return` da Task 4 não está no lugar certo, e a tabela vai encher de mensagem de terceiro.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/src/lib/evolution/client.ts apps/web/src/app/api/admin/instances/rewebhook/route.ts
git commit -m "feat(relampago): assina messages.upsert e re-registra webhook das instancias existentes"
```

---

## Fechamento

- [ ] **Gate local antes de abrir o PR**

```powershell
npm run verify:local
```

Cobre lint, build, scan de secrets e drift. `tsx --test` e o lint não checam tipo — o build cobre.

- [ ] **Mover o card do quadro**

Em **produção** (`nidoatbxaylrkcgbszns`):

```sql
select public.move_card('oferta_relampago', 'no_ar_nao_verificado', 'PR mergeado e webhook re-registrado', 'PR #<N>');
```

Só passar para `no_ar_verificado` **depois** da Task 12 Step 4 — com a prova colhida na hora. Mergeado não é verificado; rodando em produção não é verificado. O banco recusa o movimento sem prova.

- [ ] **Registrar as decisões no grafo**

```powershell
rag insert "decisao: Oferta Relampago. R1 resolvido por engine_events em vez de captura ao vivo: 4.121 participantes em 30 dias, 100% @lid, zero @s.whatsapp.net. O lid_map e caminho critico, nao defesa. Cobre ~87% de quem entra (13% chegam sem phoneNumber pela mesma API), entao a tela trata 'sem telefone' como acao de primeira classe (responder no grupo), nao como fallback. O mapa tem duas fontes: fetchAllGroups na abertura e o historico de group-participants.update ja em engine_events." --source decisao-2026-09-01

rag insert "achado: EVOLUTION_WEBHOOK_EVENTS so chega na Evolution dentro de setWebhook, e setWebhook so roda na criacao da instancia (api/instances/route.ts). Acrescentar evento a constante NAO alcanca instancia que ja existe. Toda feature que dependa de evento novo precisa de re-registro explicito, senao fica muda parecendo bug de codigo." --source achado-2026-09-01
```

---

## Self-review

**Cobertura do spec**

| Seção do spec | Onde |
|---|---|
| D1 janela aberta por grupo | Task 3 (`flash_offer_groups_um_aberto_uidx`), Task 8 (409 na tela) |
| D2 paralelo limitado por vagas | Task 3 (`claim_next_flash_entry`), Task 7 (mutante do `>=`) |
| D3 fim do timer depende de quem falhou | Task 3 (RPC), Task 6 (`claimState`), Task 7 (mutante do `contacted_at`) |
| D4 a vendedora puxa | Task 8 (`/claim`), Task 10 (botão) |
| D5 escopo: só o motor | reação ✅, aviso de esgotado e publicação da fila ficam fora |
| Modelo de dados, 4 tabelas | Task 3 |
| Ordem `deprioritized_at nulls first, commented_at` | Task 3 (índice), Task 6 (`listQueue`) |
| Estado derivado, sem coluna `status` | Task 6 (`QueueEntry.claim`), Task 10 (tabela de estados) |
| Captura e os 6 degraus de descarte | Task 4 |
| Normalização da palavra-chave | Task 1 |
| Telas | Tasks 9-10 |
| `wa.me`, nunca DM pela API | Task 10 |
| R1 `@lid` | resolvido no topo; Tasks 4, 5, 10, 12 |
| R2 volume | Task 12 Step 6 |
| R3 fora de ordem | Task 3 (`opened_at`), Task 4 (degrau 6) |
| R4 duas vendedoras | Task 3 (índice), Task 6 (23505), Task 7 |
| Testes unitários | Tasks 1, 4, 5, 6 |
| Testes de integração | Task 7, com mutantes |
| E2E | Task 11 |
| Migração nos dois bancos + advisor | Task 3 |

**Fora do spec, acrescentado:** a Task 12 (re-registro do webhook) e a segunda fonte do `lid_map` (Task 5). As duas saíram de achados desta sessão; sem a primeira, nada da Fase 1 chega a rodar.

**Divergência consciente do spec:** o spec descreve o caso sem telefone como "a tela oferece um botão para resolver na hora". Não existe API que resolva `@lid` para telefone sob demanda — Baileys resolve o sentido inverso. A Task 10 troca isso por responder no grupo, que funciona com o que se tem.
