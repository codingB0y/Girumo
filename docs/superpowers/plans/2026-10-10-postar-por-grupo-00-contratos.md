# Postar por grupo — contratos entre os PRs

Fonte única dos **nomes, assinaturas e formatos** que os 9 PRs compartilham. Cada plano copia daqui o
que usa; se um plano e este arquivo divergirem, **este arquivo vence** e o plano está errado.

- **Spec:** `docs/superpowers/specs/2026-10-10-postar-por-grupo-design.md`
- **Planos:**
  - `2026-10-10-postar-por-grupo-pr1-banco.md`
  - `2026-10-10-postar-por-grupo-pr2-pr3-link-e-contagem.md`
  - `2026-10-10-postar-por-grupo-pr4-estados.md`
  - `2026-10-10-postar-por-grupo-pr5-postar-destino.md`
  - `2026-10-10-postar-por-grupo-pr6-exclusividade.md`
  - `2026-10-10-postar-por-grupo-pr7-pr8-padronizar.md`
  - `2026-10-10-postar-por-grupo-pr9-aviso-ao-lotar.md`

**Card do quadro (`board_features`, prod):** chave `postar-por-grupo`. O PR 1 cria o card e o move para
`em_construcao`; cada PR registra o andamento com `move_card`; o PR 9 leva a `no_ar_verificado`.

**Ordem de merge:** 1 → 2 → 4 → 5; 3 a qualquer momento; 6 depois do 1; 7 (com redeploy do worker) antes do
merge do 8; 8 depois de 4, 6 e 7; 9 depois de 1, 2 e 4. DDL do 1 e do 6 nos dois bancos **antes** do merge.

## 1. Banco — PR 1 (migração `20261010120000_postar_por_grupo.sql`)

### Colunas

```sql
alter table public.groups
  add column if not exists lotado_em timestamptz,
  add column if not exists lotado_por text,
  add column if not exists reaberto_em timestamptz,
  add column if not exists aviso_lotou_em timestamptz;
-- constraint groups_lotado_por_check: lotado_por is null or lotado_por in ('auto','manual')

alter table public.campaign_groups
  add column if not exists aviso_ao_lotar text,
  add column if not exists aviso_ao_lotar_desde timestamptz;

alter table public.broadcasts
  add column if not exists target_rule text;
-- constraint broadcasts_target_rule_check: target_rule is null or target_rule in ('menos_enchendo','lotados','com_gente')
-- NÃO criar check amarrando target_rule a campaign_group_id (FK é on delete set null).

alter table public.group_bulk_jobs
  add column if not exists subject text;
-- group_bulk_jobs_action_check passa a aceitar também 'set_subject'
```

### Funções (todas `set search_path`; as `public.*` com execute **só** `service_role`)

| Função | Retorno | Notas |
|---|---|---|
| `app.limiar_lotado(p_capacity integer)` | `numeric` | `immutable`. `(case when p_capacity > 0 then p_capacity else 1024 end) * 0.95` |
| `app.grupo_na_regra(p_estado text, p_is_admin boolean, p_regra text)` | `boolean` | `immutable`. Única definição das regras (tabela abaixo) |
| `app.estados_da_campanha(p_tenant uuid, p_campanha uuid)` | `setof` linha `EstadoRow` | `stable`, ordenado por `posicao` |
| `app.alvos_da_regra(p_tenant uuid, p_campanha uuid, p_regra text)` | `text[]` | JIDs com a regra, na ordem do pool |
| `app.alvos_do_disparo(b public.broadcasts)` | `text[]` | regra → `alvos_da_regra`; sem regra → predicado antigo |
| `app.groups_marca_lotado()` | `trigger` | trigger `groups_marca_lotado` `before insert or update of members, capacity on public.groups` |
| `public.campaign_group_states(p_tenant uuid, p_campaign uuid)` | `setof` linha `EstadoRow` | wrapper de `app.estados_da_campanha` |
| `public.marcar_grupo_lotado(p_tenant uuid, p_group uuid)` | `text` | `'ok' \| 'ja_lotado' \| 'nao_encontrado'` |
| `public.reabrir_grupo(p_tenant uuid, p_group uuid)` | `text` | `'ok' \| 'nao_lotado' \| 'ainda_cheio' \| 'nao_encontrado'` |
| `public.enviar_avisos_lotou(p_limit integer default 20)` | `integer` | quantos avisos enfileirou |

Também no PR 1: `create or replace` de `app.enqueue_broadcast` (destinos via `app.alvos_do_disparo`) e de
`app.promote_due_schedules` (JIDs da oferta lidos de `engine_commands` do run).

**Linha `EstadoRow`** (colunas, nesta ordem):

```
posicao integer, group_id uuid, whatsapp_group_id text, name text, members integer,
capacity integer, is_admin boolean, invite_url text, lotado_em timestamptz, lotado_por text,
reaberto_em timestamptz, aviso_lotou_em timestamptz, estado text, pode_reabrir boolean,
na_regra_menos_enchendo boolean, na_regra_lotados boolean, na_regra_com_gente boolean
```

**Estados:** `'lotado' | 'enchendo' | 'fila' | 'vazio'`.

| Regra | `grupo_na_regra` = true quando |
|---|---|
| `menos_enchendo` | `p_is_admin and p_estado in ('lotado','fila')` |
| `lotados` | `p_is_admin and p_estado = 'lotado'` |
| `com_gente` | `p_is_admin and p_estado in ('lotado','fila','enchendo')` |
| qualquer outra | `false` |

## 2. Banco — PR 6 (migração `20261010130000_grupo_uma_campanha.sql`)

| Objeto | Assinatura |
|---|---|
| trigger `campaign_groups_grupo_exclusivo` | `before insert or update of group_ids on public.campaign_groups` → `app.campaign_groups_grupo_exclusivo()`; erro `errcode = 'unique_violation'`, `message = 'grupo_em_outra_campanha:' \|\| jid \|\| ':' \|\| outra_campanha_id` |
| `public.grupos_em_mais_de_uma_campanha(p_tenant uuid)` | `table(whatsapp_group_id text, name text, campanhas jsonb)`; `campanhas` = `[{"id","name","slug","posicao"}]` |
| `public.reordenar_campanha(p_tenant uuid, p_campanha uuid, p_esperado text[], p_nova text[])` | `boolean` |

## 3. TypeScript compartilhado

### `apps/web/src/lib/groups/estado.ts` (PR 2 cria; sem `server-only`, importável no cliente)

```ts
export type EstadoDoGrupo = "lotado" | "enchendo" | "fila" | "vazio";
export type RegraDestino = "menos_enchendo" | "lotados" | "com_gente";
export const REGRAS: readonly RegraDestino[] = ["menos_enchendo", "lotados", "com_gente"];

export type EstadoGrupo = {
  posicao: number;
  groupId: string;
  whatsappGroupId: string;
  nome: string;
  membros: number;
  capacidade: number;
  isAdmin: boolean;
  inviteUrl: string | null;
  lotadoEm: string | null;
  lotadoPor: "auto" | "manual" | null;
  reabertoEm: string | null;
  avisoLotouEm: string | null;
  estado: EstadoDoGrupo;
  podeReabrir: boolean;
  naRegra: Record<RegraDestino, boolean>;
};

export type EstadoRow = { /* as 17 colunas snake_case da linha EstadoRow */ };
export function estadoFromRow(row: EstadoRow): EstadoGrupo;
export const ROTULO_ESTADO: Record<EstadoDoGrupo, string>; // "Lotado" | "Enchendo agora" | "Na fila" | "Vazio"
export const ROTULO_REGRA: Record<RegraDestino, string>;   // "Todos menos o que está enchendo" | "Só lotados" | "Todos com gente"
export function isRegraDestino(v: unknown): v is RegraDestino;
```

> O PR 2 é o primeiro a ler estados (no link), então `estado.ts` e o store abaixo nascem nele; o PR 4
> e os seguintes só consomem.
>
> Homônimo: `@/lib/painel/grupos` já exporta outro `EstadoDoGrupo` (`"cheio" | "quase" | "ativo" | "sem_convite"`,
> da tela global). Arquivo que precisar dos dois importa um deles com alias
> (`import type { EstadoDoGrupo as EstadoNaCampanha } from "@/lib/groups/estado"`).

### `apps/web/src/lib/stores/campaign-group-states.ts` (PR 2 cria; `server-only`)

```ts
export async function listCampaignGroupStates(tenantId: string, campaignId: string): Promise<EstadoGrupo[]>;
export async function marcarGrupoLotado(tenantId: string, groupId: string): Promise<"ok" | "ja_lotado" | "nao_encontrado">;
export async function reabrirGrupo(tenantId: string, groupId: string): Promise<"ok" | "nao_lotado" | "ainda_cheio" | "nao_encontrado">;
```

`marcarGrupoLotado` e `reabrirGrupo` são criados no PR 4 (no mesmo arquivo).

### `apps/web/src/lib/links/resolve-click-target.ts` (PR 2)

`ResolvableGroup` ganha `estado?: EstadoDoGrupo`. O alvo do link mestre passa a ser
`remembered ?? groups.find((g) => g.estado === "enchendo") ?? null`.

## 4. Rotas HTTP

| Rota | PR | Corpo / resposta |
|---|---|---|
| `POST /api/groups/recount` (engine-only, header `x-tenant-id`) | 3 | resposta `{ ok: true, atualizados: number }` |
| `GET /api/campanhas/[slug]/grupos/estados` | 4 | `{ grupos: EstadoGrupo[]; contagem: { lotado: number; enchendo: number; fila: number; vazio: number; membros: number }; regras: Record<RegraDestino, number> }` |
| `POST /api/campanhas/[slug]/grupos/lotado` | 4 | corpo `{ groupId: string; acao: "marcar" \| "reabrir" }` → 200 `{ ok: true }`, 404 `{ error }`, 409 `{ error, motivo: "ainda_cheio" \| "nao_lotado" \| "ja_lotado" }` |
| `POST /api/campanhas/[slug]/messages` | 5 | corpo ganha `destino?: { regra: RegraDestino } \| { grupos: string[] }`; `groupIds` continua aceito como lista fixa |
| `GET /api/campanhas/conflitos` | 6 | `{ conflitos: Array<{ whatsappGroupId: string; nome: string; campanhas: Array<{ id: string; name: string; slug: string; posicao: number }> }> }` |
| `POST /api/campanhas/conflitos` | 6 | corpo `{ jid: string; ficaEm: string /* campaign id */ }` → 200 `{ ok: true }` |
| `POST /api/campanhas/[slug]/grupos/padronizar` | 8 | corpo `{ base: string; ordem: string[]; esperado: string[] }` → 201 `{ batchId: string; renomes: number }`, 409 `{ error }` |
| `PATCH /api/campanhas` | 9 | corpo ganha `avisoAoLotar?: string` |
| `GET /api/campanhas` | 9 | cada campanha ganha `avisoAoLotar: string \| null` e `avisoAoLotarDesde: string \| null` |

409 de exclusividade (PR 6) em `POST/PATCH /api/campanhas`: `{ error: string; grupo: string; campanha: { id: string; name: string } }`.

## 5. Outros contratos

- `lib/campaigns/destino.ts` (PR 5): `type Destino = { regra: RegraDestino } | { grupos: string[] }`;
  `lerDestino(body: Record<string, unknown>, campanha: { group_ids: string[] }, permitidosExtras?: readonly string[]): { ok: true; destino: Destino } | { ok: false; error: string }`.
- `broadcasts.createBroadcast` (PR 5) aceita `target_rule?: RegraDestino | null`.
- Ações em massa (PR 7): `BulkAction` ganha `"set_subject"`; job ganha `subject: string | null`;
  worker `EvolutionGroups.setSubject(instanceName: string, groupJid: string, subject: string): Promise<void>`.
- `lib/groups/padronizar.ts` (PR 8): `ordemPadrao(estados: EstadoGrupo[]): string[]` (JIDs);
  `validarBase(base: unknown): { ok: true; base: string } | { ok: false; error: string }`;
  `planejarRenomes(input: { ordem: string[]; base: string; estados: EstadoGrupo[]; conflitos: ReadonlySet<string> }): Array<{ groupId: string; whatsappGroupId: string; subject: string }>`.
- `grow_template` (jsonb) ganha `padronizadoEm: string` (ISO) no PR 8; `subjectPattern` já existe.
- `nextSeq(tenantId, campaignGroupId, poolSize, desde?: string | null)` (PR 8).
- Worker (PR 3): env `WORKER_RECOUNT_INTERVAL_MS` (padrão `86_400_000`, mínimo `3_600_000`) e
  `WORKER_RECOUNT_ENABLED` (desligado por padrão = dry-run, como os loops de envio, grow e lote).
- `resolve-click-target.ts` (PR 2): `withSequentialEstado` e `toResolvableGroup` são temporários, só para a aba
  "Link e cliques" que roda `resolveClickTarget` no navegador; o PR 4 troca essa aba pelo endpoint de estados
  e remove `withSequentialEstado`.
- Worker (PR 9): `housekeeping.ts` chama a RPC `enviar_avisos_lotou` com `{ p_limit: 20 }`.
- `lib/campaigns/aviso-ao-lotar.ts` (PR 9): `ultimosAvisos(grupos: EstadoGrupo[], desde: string | null, limite = 5)` —
  filtra `avisoLotouEm >= desde` e `avisoLotouEm !== lotadoEm`, porque o insert já cheio (§5.3) e o
  backfill (§5.7) gravam `aviso_lotou_em` sem enviar nada.
- `enviar_avisos_lotou` (PR 1): grupo elegível com `is_admin = false` só ganha `aviso_lotou_em = now()`,
  sem envio e sem contar no retorno (não fica pendente para sair atrasado se o número virar admin).
