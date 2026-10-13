# Postar por grupo — PR 9: aviso ao lotar e fechamento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O lojista liga, na aba Grupos das configurações da campanha, uma mensagem que é postada **uma vez em cada grupo** quando ele ganha a marca de lotado (D10), e vê os últimos avisos ali mesmo. O worker passa a chamar `enviar_avisos_lotou` a cada ciclo de manutenção. Depois do merge, a série inteira (PRs 1–9) é verificada em produção pelo spec §11 e o card `postar-por-grupo` vai para `no_ar_verificado`.

**Architecture:** As regras ficam numa função pura (`lib/campaigns/aviso-ao-lotar.ts`): `lerAvisoAoLotar` (validação do campo do PATCH), `proximoAviso` (transição de `aviso_ao_lotar`/`aviso_ao_lotar_desde`) e `ultimosAvisos` (lista da tela). O `PATCH /api/campanhas` lê a campanha atual e grava o que `proximoAviso` devolver; o `GET` (via `carregarCampanhas`) devolve `avisoAoLotar` e `avisoAoLotarDesde`. A tela é um componente controlado (`components/painel/campanhas/aviso-ao-lotar.tsx`) montado na aba Grupos de `campaign-config.tsx`, salvo pelo botão "Salvar alterações" que já existe; os "Últimos avisos" vêm de `GET /api/campanhas/[slug]/grupos/estados` (PR 4), sem tabela nova. Quem decide **quando** o aviso sai é o banco (`public.enviar_avisos_lotou`, PR 1); o worker só chama a RPC no `housekeeping.ts`, depois das etapas da fila. Um teste de integração contra o dev prova a costura delta → trigger → varredura; um e2e prova as transições pela tela contra a API.

**Tech Stack:** Next.js 15 (App Router, client component), React 19, Tailwind v4, `@supabase/supabase-js` 2.108, `node:test` via tsx, Playwright 1.62, worker Node 22 (`apps/worker`, deploy no Coolify).

**Spec:** `docs/superpowers/specs/2026-10-10-postar-por-grupo-design.md` (§2 D10, D11; §5.6; §5.3 e §5.7 para o que grava `aviso_lotou_em`; §6.8; §7; §8; §9; §11) · contrato vinculante: `docs/superpowers/plans/2026-10-10-postar-por-grupo-00-contratos.md` (§1 `enviar_avisos_lotou`, §3 `EstadoGrupo`, §4 `GET .../grupos/estados` e `PATCH /api/campanhas`, §5 "Worker (PR 9)") · mockup: `Automacao.dc.html` do scratchpad do desenho (cartão da esquerda "Aviso ao lotar"; o da direita, "Postar toda semana", já é o PR 5 — aqui só se verifica D11 em prod, Task 8).

## Global Constraints

Valem para a série inteira:

- Código, identificadores e commits em inglês — **exceto** o vocabulário do painel, que já é pt-BR (`proximoAviso`, `ultimosAvisos`, `avisoAoLotar` são nomes do contrato). Texto de tela e de erro em pt-BR. Commits com prefixo semântico, terminando em `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Em `apps/web`:
  - unit: `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>` (é o script `test` de `apps/web/package.json`)
  - tipos (os **dois**; lint e tsx não checam tipo): `npx tsc --noEmit -p tsconfig.json` e `npx tsc --noEmit -p tsconfig.e2e.json`
  - lint: `npm run lint` · suíte: `npm test` · lint da Vitrine: `npx tsx scripts/check-painel-vitrine.ts`
- Em `apps/worker`: unit `npx tsx --test <arquivo>` (script `test` de `apps/worker/package.json`); tipos/compilação `npm --workspace apps/worker run build` a partir da raiz. **O worker não está no CI nem no `verify-local.ps1` além dos testes** (o `npm test` da raiz roda `apps/worker test`; ninguém roda o `tsc` dele, e o `tsconfig` dele exclui `*.test.ts`) — o build é obrigação deste plano.
- Antes do push: `infra/scripts/verify-local.ps1` (secrets + testes + tsc + build) — é o gate real; o `verify` do CI é pulado na `main`.
- Nunca `git add -A`. `git -C <wt> diff --cached --stat` numa chamada **separada** antes de cada commit. Sempre `git -C <wt>` com caminho absoluto (`<wt>` = raiz do worktree da sessão, impressa na Task 0 Step 1; substituir literalmente em todo comando). Terminal é PowerShell 5.1: sem `&&`/`||`.
- `<sp>` = o scratchpad da sessão (o harness imprime o caminho). SQL avulso e corpo de PR vão para lá, nunca para o repo.
- DML/DDL em prod passa pelo Igor (o classificador barra). Leitura em dev pelo CLI do Supabase costuma passar.
- Card `postar-por-grupo` em `em_construcao` ao começar (Task 0), `no_ar_nao_verificado` no merge (Task 7), `no_ar_verificado` só com prova colhida em prod (Task 8) + `update ... set blocker = null` explícito (o `move_card` não limpa).
- Fechar o loop na mesma sessão: revisar → CI verde → mergear → apagar branch. Ao encerrar: "PRs que deixei abertos: …".

Deste PR:

- **Depende de PR 1, PR 2 e PR 4 mergeados em `main`** e da migração do PR 1 **aplicada nos dois bancos** (o teste de integração e o e2e batem no dev; o worker chama a RPC em prod). Consome, sem renomear: `public.enviar_avisos_lotou(p_limit integer default 20) returns integer`; colunas `campaign_groups.aviso_ao_lotar`, `campaign_groups.aviso_ao_lotar_desde`, `groups.aviso_lotou_em`; `EstadoGrupo` de `@/lib/groups/estado` (campos `avisoLotouEm`, `lotadoEm`, `lotadoPor`, `groupId`, `nome`); `GET /api/campanhas/[slug]/grupos/estados` → `{ grupos: EstadoGrupo[]; contagem; regras }`.
- **PR 6 pode já ter mexido** em `app/api/campanhas/route.ts` (409 de exclusividade) e em `campaign-config.tsx` (seletor de grupos). As âncoras de edição deste plano ficam fora do diff dele. Âncora que não bater exatamente → abrir o arquivo, achar o ponto equivalente e editar ali; nunca forçar o texto antigo por cima do novo.
- **Mensagem só com espaços é "desligado"**: o servidor apara e grava `null` nos dois campos (o banco também ignora com `nullif(trim(...))`, mas a aplicação não grava lixo). A tela avisa "Sem mensagem, o aviso fica desligado."
- **Copy honesta.** O aviso é postado **no grupo**, nunca em DM (`feedback-anti-ban-no-dm`), e não é boas-vindas: quem entra depois não recebe nada (`finding-girumo-nao-tem-boas-vindas`). O texto de ajuda é o do mockup + "Só sai em grupo onde o seu número é admin." (verdade do §5.6). A coluna dos "Últimos avisos" **não diz "enviado"**: `aviso_lotou_em` é gravado mesmo quando o disparo falha por falta de número (§5.6 passo 2); a tela mostra só quando, e manda para Disparos ver o resultado.
- Tela: campo de texto 16px (sem zoom no iOS), `<label>` em todo campo, alvo ≥ 44px na caixa, nenhum Acid (a regra 11 do G2 reserva Acid a Postar/AO VIVO/LOTOU), raio ≤ 12 (`painel:check`).
- Egress: +1 RPC por ciclo de 30 s = +2.880 chamadas/dia em prod (`finding-egress-supabase-e-polling-do-worker`). Sem laço de drenagem.
- **11 arquivos** (7 de código, 4 de teste). Um pouco acima da régua de ~10; os 4 de teste são o que prova o PR.

## Review Focus

Os cinco defeitos mais prováveis que nenhum teste de task cobriria sozinho — cada um ganhou um teste na task dona:

1. **Trocar o texto com grupos lotando.** Se texto→texto regravasse `desde = agora`, todo grupo que lotou entre o `desde` antigo e a edição, e ainda não foi varrido (até 30 s, ou horas com o worker parado), perderia o aviso para sempre. → Task 1 "trocar o texto … mantém o desde" e Task 4 (e2e confere o `desde` igual na API depois da edição).
2. **Desligar e religar rearmando lotados antigos.** Se desligar só apagasse o texto e mantivesse o `desde`, religar dias depois avisaria todos os grupos que lotaram com o aviso desligado. → Task 1 "desligar e religar começa do zero" e Task 6 "lotado antes de ligar … nunca recebe" (pelo banco).
3. **Worker parado horas e volta com uma rajada.** Um laço de "chamar até zerar" despejaria dezenas de disparos de uma vez na fila anti-ban e multiplicaria o egress. → Task 5 "uma chamada por ciclo com p_limit 20, mesmo quando o lote volta cheio".
4. **Grupo da campanha sem `is_admin`.** Lota (o trigger não olha admin), mas não pode receber disparo que o WhatsApp recusa e que alimenta o breaker do número. → Task 6, com pré-condição de data para o teste não passar "pela data" sem provar o admin.
5. **"Últimos avisos" mentindo.** O backfill do PR 1 (§5.7) e o grupo descoberto já cheio (§5.3) gravam `aviso_lotou_em` **sem enviar nada**. Listar `avisoLotouEm` cru mostraria os grupos do backfill como avisados — inclusive o que o Igor reabrir na verificação §11.3. → Task 1, três testes de `ultimosAvisos` (descoberto cheio, backfill reaberto/relotado, aviso real de grupo reaberto).

## File Structure

| Arquivo | Ação | Responsabilidade | Task |
|---|---|---|---|
| `apps/web/src/lib/campaigns/aviso-ao-lotar.ts` | criar | validação do campo, transição do `desde`, últimos avisos | 1 |
| `apps/web/src/lib/campaigns/aviso-ao-lotar.test.ts` | criar | testes das três regras | 1 |
| `apps/web/src/lib/stores/campaign-groups.ts` | modificar | duas colunas no tipo e no patch | 2 |
| `apps/web/src/lib/painel/inicio-carga.ts` | modificar | `GET /api/campanhas` devolve `avisoAoLotar`/`avisoAoLotarDesde` | 2 |
| `apps/web/src/app/api/campanhas/route.ts` | modificar | `PATCH` aceita `avisoAoLotar` | 2 |
| `apps/web/src/components/painel/campanhas/aviso-ao-lotar.tsx` | criar | seção "Aviso ao lotar" e "Últimos avisos" | 3 |
| `apps/web/src/components/painel/campaign-config.tsx` | modificar | estado, carga, PATCH, aba Grupos | 3 |
| `apps/web/e2e/painel-campanha-aviso.spec.ts` | criar | contraste API × tela das transições | 4 |
| `apps/worker/src/housekeeping.ts` | modificar | RPC `enviar_avisos_lotou` no ciclo | 5 |
| `apps/worker/src/housekeeping.test.ts` | modificar | testes da etapa nova | 5 |
| `apps/web/src/lib/stores/aviso-ao-lotar.integration.test.ts` | criar | costura delta → trigger → varredura no dev | 6 |

Ondas (regra de subagentes paralelos): **A** = Tasks 1, 5, 6 (arquivos disjuntos, sem dependência entre si) · **B** = Task 2 (depende de 1) · **C** = Task 3 (depende de 1 e 2) · **D** = Task 4 (depende de 3). Implementadores não commitam; o controller commita por task, em ordem.

---

### Task 0: worktree, branch, pré-requisitos, dependências e card

**Files:** nenhum.
**Depends-on:** nada.

- [ ] **Step 1:** na sessão (que já roda num worktree — não criar outro, `finding-harness-bloqueia-escrita-em-outro-worktree`):

```powershell
git rev-parse --show-toplevel
```

  Anotar a saída como `<wt>`. Daqui em diante todo `git` é `git -C <wt>`.

- [ ] **Step 2:** worktree limpo (arquivo não rastreado de plano pode ficar; nada modificado):

```powershell
git -C <wt> status --short
```

  Esperado: nenhuma linha com ` M`, `M ` ou `A `. Havendo → parar e perguntar ao Igor de quem é.

- [ ] **Step 3:** atualizar e conferir que PR 1, PR 2 e PR 4 estão em `main`:

```powershell
git -C <wt> fetch origin main
```
```powershell
git -C <wt> ls-tree --name-only origin/main apps/web/supabase/migrations/20261010120000_postar_por_grupo.sql apps/web/src/lib/groups/estado.ts "apps/web/src/app/api/campanhas/[slug]/grupos/estados/route.ts"
```

  Esperado: os três caminhos. Faltando qualquer um → **parar e perguntar ao Igor** (PR 1, 2 ou 4 não mergeou).

```powershell
git -C <wt> grep -n "enviar_avisos_lotou" origin/main -- apps/web/supabase/migrations/20261010120000_postar_por_grupo.sql
```
```powershell
git -C <wt> grep -n "avisoLotouEm" origin/main -- apps/web/src/lib/groups/estado.ts
```
```powershell
git -C <wt> grep -n "20261010120000_postar_por_grupo" origin/main -- deploy/supabase/apply-order.txt
```

  Esperado: pelo menos uma linha em cada. Vazio → parar e perguntar ao Igor.

- [ ] **Step 4:** a migração do PR 1 aplicada nos **dois** bancos. Escrever `<sp>\aviso-pre.sql`:

```sql
select p.oid::regprocedure as funcao,
       has_function_privilege('service_role', p.oid, 'execute') as service_role,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'enviar_avisos_lotou';

select table_name, column_name
  from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'campaign_groups' and column_name in ('aviso_ao_lotar', 'aviso_ao_lotar_desde'))
     or (table_name = 'groups' and column_name in ('lotado_em', 'lotado_por', 'aviso_lotou_em')));
```

  Dev (leitura costuma passar no classificador; `tecnica-supabase-cli-sql-nos-dois-bancos`):

```powershell
Set-Location <wt>\apps\web; supabase link --project-ref wfjuwogxaupyadwhvoxy --yes
```
```powershell
Set-Location <wt>\apps\web; supabase db query --linked -f <sp>\aviso-pre.sql
```

  Esperado: 1 linha `enviar_avisos_lotou(integer)` com `service_role = true`, `authenticated = false`; 5 linhas de coluna. Prod: os mesmos dois comandos com `--project-ref nidoatbxaylrkcgbszns` — **pedir ao Igor** se o classificador barrar. Faltando em qualquer banco → parar: o PR 1 não foi aplicado ali. Depois, conferir que o link ficou no dev (`Get-Content <wt>\apps\web\supabase\.temp\project-ref` → `wfjuwogxaupyadwhvoxy`), para nenhum comando seguinte cair em prod por engano.

- [ ] **Step 5:** branch a partir de `origin/main`, sem upstream herdado:

```powershell
git -C <wt> switch -c feat/postar-grupo-aviso origin/main
```
```powershell
git -C <wt> branch --unset-upstream
```
```powershell
git -C <wt> log HEAD..origin/main --oneline
```

  Esperado: vazio (defasagem zero). `--unset-upstream` pode responder "has no upstream information" — é o esperado quando não houve tracking.

- [ ] **Step 6:** colisão com outra sessão (`finding-sessoes-paralelas-colidem-em-pr`):

```powershell
gh pr list --repo codingB0y/Girumo --state open --json number,headRefName,title
```

  Para cada PR suspeito (os da série postar por grupo, e qualquer `feat/*campanha*`/`feat/*worker*`): `gh pr diff <N> --repo codingB0y/Girumo --name-only`. Se algum mexe em `app/api/campanhas/route.ts`, `components/painel/campaign-config.tsx`, `lib/painel/inicio-carga.ts`, `lib/stores/campaign-groups.ts` ou `apps/worker/src/housekeeping.ts`: preferir esperar ele mergear (o PR 6 é o candidato óbvio). Não dá para esperar → seguir e resolver no Step 4 da Task 7, sem sobrescrever o lado dele.

- [ ] **Step 7:** dependências do worktree:

```powershell
Test-Path "<wt>\node_modules\next"
```

  `False` → `Set-Location <wt>; npm ci --workspace apps/web --workspace apps/worker --include-workspace-root --no-audit --no-fund` (~1 min; `finding-worktree-node-modules-junction`).

- [ ] **Step 8:** `.env.local` para o e2e local (Task 4): se `Test-Path "<wt>\apps\web\.env.local"` for `False` e existir `C:\Users\Igor\Desktop\HubFlow-platform\apps\web\.env.local`:

```powershell
Copy-Item "C:\Users\Igor\Desktop\HubFlow-platform\apps\web\.env.local" "<wt>\apps\web\.env.local"
```

  Conferir só os nomes (nunca imprimir valor):

```powershell
Select-String -Path "<wt>\apps\web\.env.local" -Pattern '^(E2E_EMAIL|E2E_PASSWORD|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|HUBFLOW_USE_SUPABASE)=' | ForEach-Object { $_.Line.Split('=')[0] }
```

  Faltando `E2E_*` → o e2e local se marca skip e a prova fica no job `e2e` do CI.

- [ ] **Step 9 (Igor, prod):** o card existe?

```sql
select key, status, blocker, evidence_at from public.board_features where key = 'postar-por-grupo';
```

  Sem linha (o plano do PR 1 deveria ter criado) → criar e só então mover (o trigger do feed só registra mudança de status; `area` é obrigatória e precisa ser um bucket existente — `finding-move-card-nao-limpa-blocker`):

```sql
insert into public.board_features (key, title, area, summary, priority)
values ('postar-por-grupo', 'Postar por grupo', 'Campanhas',
        'Lotado gravado, destino por regra, um grupo uma campanha, padronizar nomes, aviso ao lotar (spec 2026-10-10).', 'alta')
on conflict (key) do nothing;
```

  Mover e dizer o que está sendo atacado agora:

```sql
select public.move_card('postar-por-grupo', 'em_construcao', 'PR 9 começou: aviso ao lotar (config da campanha, worker, últimos avisos) e fechamento da série', 'feat/postar-grupo-aviso');
update public.board_features
   set blocker = 'PR 9 em construção (aviso ao lotar). A verificação em prod do spec §11 depende dos PRs 1–9 no ar.',
       updated_at = now()
 where key = 'postar-por-grupo';
```

---

### Task 1: regras puras do aviso (TDD)

**Files:** criar `apps/web/src/lib/campaigns/aviso-ao-lotar.ts`, `apps/web/src/lib/campaigns/aviso-ao-lotar.test.ts`
**Depends-on:** Task 0
**Interfaces (produz):**
```ts
export const AVISO_AO_LOTAR_MAX = 1000;
export type AvisoGravado = { aviso_ao_lotar: string | null; aviso_ao_lotar_desde: string | null };
export function lerAvisoAoLotar(valor: unknown): { ok: true; texto: string } | { ok: false; error: string };
export function proximoAviso(atual: { texto: string | null; desde: string | null }, novoTexto: string, agora: string): AvisoGravado;
export function ultimosAvisos(grupos: readonly EstadoGrupo[], desde: string | null, limite?: number): EstadoGrupo[];
```
**Consome:** `type EstadoGrupo` de `@/lib/groups/estado` (PR 2; só tipo — o arquivo continua importável no cliente, sem `server-only`).

- [ ] **Step 1 (teste):** `apps/web/src/lib/campaigns/aviso-ao-lotar.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import type { EstadoGrupo } from "@/lib/groups/estado";

import { AVISO_AO_LOTAR_MAX, lerAvisoAoLotar, proximoAviso, ultimosAvisos } from "./aviso-ao-lotar";

const LIGOU = "2026-10-11T12:00:00.000Z";
const EDITOU = "2026-10-12T09:30:00.000Z";
const RELIGOU = "2026-10-14T18:00:00.000Z";
const DESLIGADO = { aviso_ao_lotar: null, aviso_ao_lotar_desde: null };

test("ligar: vazio → texto grava o texto aparado e desde = agora", () => {
  assert.deepEqual(proximoAviso({ texto: null, desde: null }, "  Grupo lotado!  ", LIGOU), {
    aviso_ao_lotar: "Grupo lotado!",
    aviso_ao_lotar_desde: LIGOU,
  });
});

test("desligar: texto → vazio zera o texto e o desde", () => {
  assert.deepEqual(proximoAviso({ texto: "Grupo lotado!", desde: LIGOU }, "", EDITOU), DESLIGADO);
  assert.deepEqual(proximoAviso({ texto: null, desde: null }, "", EDITOU), DESLIGADO);
});

test("mensagem só com espaços ou quebras de linha é desligar, não um aviso em branco", () => {
  assert.deepEqual(proximoAviso({ texto: "Grupo lotado!", desde: LIGOU }, "  \n\t ", EDITOU), DESLIGADO);
  assert.deepEqual(proximoAviso({ texto: null, desde: null }, "   ", EDITOU), DESLIGADO);
});

test("trocar o texto com o aviso ligado mantém o desde: quem lotou antes da edição ainda recebe", () => {
  assert.deepEqual(
    proximoAviso({ texto: "Grupo lotado!", desde: LIGOU }, "Lotou! Amanhã às 9h tem novidade.", EDITOU),
    { aviso_ao_lotar: "Lotou! Amanhã às 9h tem novidade.", aviso_ao_lotar_desde: LIGOU },
  );
  // Salvar a tela sem mexer no aviso reenvia o mesmo texto: nada muda.
  assert.deepEqual(proximoAviso({ texto: "Grupo lotado!", desde: LIGOU }, "Grupo lotado!", EDITOU), {
    aviso_ao_lotar: "Grupo lotado!",
    aviso_ao_lotar_desde: LIGOU,
  });
});

test("desligar e religar começa do zero: quem lotou com o aviso desligado não é rearmado", () => {
  const desligado = proximoAviso({ texto: "Grupo lotado!", desde: LIGOU }, "", EDITOU);
  const religado = proximoAviso(
    { texto: desligado.aviso_ao_lotar, desde: desligado.aviso_ao_lotar_desde },
    "Grupo lotado!",
    RELIGOU,
  );
  assert.equal(religado.aviso_ao_lotar_desde, RELIGOU);
});

test("texto gravado sem desde (dado torto) ganha desde = agora; senão o aviso ligado nunca sairia", () => {
  const corrigido = proximoAviso({ texto: "Grupo lotado!", desde: null }, "Grupo lotado!", EDITOU);
  assert.equal(corrigido.aviso_ao_lotar_desde, EDITOU);
});

test("lerAvisoAoLotar: texto aparado até 1000 caracteres; acima disso ou outro tipo é erro", () => {
  assert.deepEqual(lerAvisoAoLotar("  Grupo lotado!\n"), { ok: true, texto: "Grupo lotado!" });
  assert.deepEqual(lerAvisoAoLotar(""), { ok: true, texto: "" });
  const cheio = "a".repeat(AVISO_AO_LOTAR_MAX);
  assert.deepEqual(lerAvisoAoLotar(`  ${cheio}  `), { ok: true, texto: cheio });
  assert.equal(lerAvisoAoLotar(`${cheio}a`).ok, false);
  assert.equal(lerAvisoAoLotar(null).ok, false);
  assert.equal(lerAvisoAoLotar(42).ok, false);
});

const DESDE = LIGOU;
// Migração do PR 1 (§5.7): grava aviso_lotou_em = lotado_em = now() nos já cheios, sem enviar nada.
const BACKFILL = "2026-10-10T23:00:00.000Z";

function grupo(nome: string, campos: Partial<EstadoGrupo> = {}): EstadoGrupo {
  return {
    posicao: 1,
    groupId: `id-${nome}`,
    whatsappGroupId: `${nome}@g.us`,
    nome,
    membros: 1000,
    capacidade: 1024,
    isAdmin: true,
    inviteUrl: "https://chat.whatsapp.com/abc",
    lotadoEm: null,
    lotadoPor: null,
    reabertoEm: null,
    avisoLotouEm: null,
    estado: "lotado",
    podeReabrir: false,
    naRegra: { menos_enchendo: true, lotados: true, com_gente: true },
    ...campos,
  };
}

/** Lotou às 14:59:30 do dia e a varredura avisou às 15:00, noutra transação. */
function avisado(dia: number, campos: Partial<EstadoGrupo> = {}): EstadoGrupo {
  return grupo(`Moda Kids do Sul ${dia}`, {
    lotadoEm: `2026-10-${dia}T14:59:30.000Z`,
    lotadoPor: "auto",
    avisoLotouEm: `2026-10-${dia}T15:00:00.000Z`,
    ...campos,
  });
}

test("últimos avisos: os que receberam, mais recentes primeiro, no máximo 5, sem mexer na lista recebida", () => {
  const grupos = [13, 18, 15, 17, 12, 16, 14].map((dia) => avisado(dia));
  const ordemOriginal = grupos.map((g) => g.nome);
  assert.deepEqual(
    ultimosAvisos(grupos, DESDE).map((g) => g.nome),
    ["Moda Kids do Sul 18", "Moda Kids do Sul 17", "Moda Kids do Sul 16", "Moda Kids do Sul 15", "Moda Kids do Sul 14"],
  );
  assert.equal(ultimosAvisos(grupos, DESDE, 2).length, 2);
  assert.deepEqual(grupos.map((g) => g.nome), ordemOriginal);
});

test("grupo descoberto já cheio (marcado sem aviso: avisoLotouEm igual a lotadoEm) fica fora", () => {
  const descobertoCheio = grupo("Descoberto cheio", {
    lotadoEm: "2026-10-13T10:00:00.000Z",
    lotadoPor: "auto",
    avisoLotouEm: "2026-10-13T10:00:00.000Z",
  });
  assert.equal(ultimosAvisos([descobertoCheio], DESDE).length, 0);
});

test("backfill de antes de ligar o aviso fica fora, mesmo depois de reaberto ou lotado de novo", () => {
  const reaberto = grupo("Backfill reaberto", {
    lotadoEm: null,
    reabertoEm: "2026-10-12T09:00:00.000Z",
    avisoLotouEm: BACKFILL,
    estado: "enchendo",
  });
  const relotado = grupo("Backfill relotado", {
    lotadoEm: "2026-10-14T09:00:00.000Z",
    lotadoPor: "auto",
    avisoLotouEm: BACKFILL,
  });
  assert.equal(ultimosAvisos([reaberto, relotado], DESDE).length, 0);
});

test("aviso enviado continua na lista depois de o grupo ser reaberto", () => {
  const reaberto = avisado(13, { lotadoEm: null, lotadoPor: null, reabertoEm: "2026-10-15T09:00:00.000Z", estado: "fila" });
  assert.deepEqual(ultimosAvisos([reaberto], DESDE).map((g) => g.nome), ["Moda Kids do Sul 13"]);
});

test("aviso desligado (sem desde) ou grupo que nunca recebeu: nada", () => {
  assert.equal(ultimosAvisos([avisado(13)], null).length, 0);
  assert.equal(ultimosAvisos([grupo("Nunca lotou", { estado: "fila" })], DESDE).length, 0);
});

test("carimbo do banco (microssegundos e +00:00) é lido", () => {
  const doBanco = grupo("Do banco", {
    lotadoEm: "2026-10-13T14:59:30.123456+00:00",
    avisoLotouEm: "2026-10-13T15:00:00.654321+00:00",
  });
  assert.equal(ultimosAvisos([doBanco], DESDE).length, 1);
});
```

- [ ] **Step 2:** rodar e ver falhar:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/campaigns/aviso-ao-lotar.test.ts
```

  Esperado: **FAIL** (`Cannot find module './aviso-ao-lotar'`).

- [ ] **Step 3:** `apps/web/src/lib/campaigns/aviso-ao-lotar.ts`:

```ts
import type { EstadoGrupo } from "@/lib/groups/estado";

/**
 * Regras do "Aviso ao lotar" (spec 2026-10-10 D10, §6.8) fora da rota e da tela,
 * para teste. Sem `server-only`: a tela usa o limite e `ultimosAvisos`.
 *
 * Quem decide QUANDO o aviso sai é o banco (`public.enviar_avisos_lotou`, PR 1):
 * grupo admin lotado depois de `aviso_ao_lotar_desde`, uma vez só
 * (`groups.aviso_lotou_em`, nunca limpo). Aqui mora o que a aplicação grava e mostra.
 */

export const AVISO_AO_LOTAR_MAX = 1000;

export type AvisoGravado = { aviso_ao_lotar: string | null; aviso_ao_lotar_desde: string | null };

/** O `avisoAoLotar` do PATCH: texto aparado, até 1000 caracteres. "" desliga. */
export function lerAvisoAoLotar(valor: unknown): { ok: true; texto: string } | { ok: false; error: string } {
  if (typeof valor !== "string") return { ok: false, error: "Aviso ao lotar inválido." };
  const texto = valor.trim();
  if (texto.length > AVISO_AO_LOTAR_MAX) {
    return { ok: false, error: `O aviso ao lotar pode ter até ${AVISO_AO_LOTAR_MAX} caracteres.` };
  }
  return { ok: true, texto };
}

/**
 * O que gravar, a partir do que está gravado e do texto que chegou:
 * - vazio → texto: liga com `desde = agora` (grupo que já estava lotado não recebe);
 * - texto → vazio, ou só espaços: desliga e zera o `desde`. Religar depois começa
 *   do zero, sem rearmar quem lotou com o aviso desligado;
 * - texto → texto: mantém o `desde`. Trocar a mensagem não pode pular quem lotou
 *   entre o `desde` antigo e a edição e ainda não foi varrido.
 * Texto gravado sem `desde` (dado torto) ganha `agora`: com `desde` nulo o
 * `lotado_em >= desde` do banco nunca é verdadeiro e o aviso "ligado" nunca sairia.
 */
export function proximoAviso(
  atual: { texto: string | null; desde: string | null },
  novoTexto: string,
  agora: string,
): AvisoGravado {
  const texto = novoTexto.trim();
  if (texto === "") return { aviso_ao_lotar: null, aviso_ao_lotar_desde: null };
  const estavaLigado = (atual.texto ?? "").trim() !== "";
  return { aviso_ao_lotar: texto, aviso_ao_lotar_desde: estavaLigado && atual.desde ? atual.desde : agora };
}

/**
 * "Últimos avisos" da tela: grupos da campanha que receberam o aviso, mais
 * recentes primeiro.
 *
 * `aviso_lotou_em` não quer dizer só "avisado": o backfill do PR 1 e o grupo
 * descoberto já cheio também o preenchem, para NÃO avisar, com o mesmo valor de
 * `lotado_em`. Dois filtros separam o aviso de verdade:
 * - `avisoLotouEm >= desde`: a varredura só avisa depois de ligado (tira o
 *   backfill, mesmo de grupo reaberto, cujo `lotadoEm` muda);
 * - `avisoLotouEm !== lotadoEm`: a varredura grava noutra transação, depois da
 *   marca (tira o grupo que entrou já cheio com o aviso ligado).
 * ponytail: grupo que entrou já cheio com o aviso ligado e depois foi reaberto
 * passa pelos dois filtros; se aparecer, o banco passa a guardar o envio à parte.
 */
export function ultimosAvisos(grupos: readonly EstadoGrupo[], desde: string | null, limite = 5): EstadoGrupo[] {
  if (!desde) return [];
  const inicio = Date.parse(desde);
  return grupos
    .filter((g) => g.avisoLotouEm !== null && g.avisoLotouEm !== g.lotadoEm && Date.parse(g.avisoLotouEm) >= inicio)
    .sort((a, b) => Date.parse(b.avisoLotouEm ?? "") - Date.parse(a.avisoLotouEm ?? ""))
    .slice(0, limite);
}
```

- [ ] **Step 4:** rodar o Step 2 de novo → **PASS** (`# pass 13`, `# fail 0`).

- [ ] **Step 5:** tipos: `Set-Location <wt>\apps\web; npx tsc --noEmit -p tsconfig.json` → limpo.

- [ ] **Step 6:** commit:

```powershell
git -C <wt> add apps/web/src/lib/campaigns/aviso-ao-lotar.ts apps/web/src/lib/campaigns/aviso-ao-lotar.test.ts
```
```powershell
git -C <wt> diff --cached --stat
```
```powershell
git -C <wt> commit -m "feat(campanhas): aviso-ao-lotar transition and recent-notices rules" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: store, GET e PATCH de `/api/campanhas`

**Files:** modificar `apps/web/src/lib/stores/campaign-groups.ts`, `apps/web/src/lib/painel/inicio-carga.ts`, `apps/web/src/app/api/campanhas/route.ts`
**Depends-on:** Task 1
**Interfaces:**
```ts
// stores/campaign-groups.ts — CampaignGroup ganha:
aviso_ao_lotar: string | null;
aviso_ao_lotar_desde: string | null;
// updateCampaignGroup aceita as duas no patch.

// GET /api/campanhas (carregarCampanhas), cada item ganha:
avisoAoLotar: string | null;
avisoAoLotarDesde: string | null;

// PATCH /api/campanhas: corpo ganha `avisoAoLotar?: string`.
// 400 { error } se não for string ou passar de 1000 caracteres depois do trim.
// Resposta ganha avisoAoLotar e avisoAoLotarDesde (mesma forma do GET).
```
**Consome:** `lerAvisoAoLotar`, `proximoAviso` (Task 1).

- [ ] **Step 1:** `apps/web/src/lib/stores/campaign-groups.ts` — tipo. Antes:

```ts
  whatsapp_community_jid: string | null;
  created_at: string;
```

  Depois:

```ts
  whatsapp_community_jid: string | null;
  /** Aviso ao lotar (spec 2026-10-10 D10): postado uma vez em cada grupo que ganha a
   * marca de lotado. `null` = desligado. Escrito só por `proximoAviso`
   * (`lib/campaigns/aviso-ao-lotar.ts`), via PATCH /api/campanhas. */
  aviso_ao_lotar: string | null;
  /** Quando o aviso foi ligado: só grupo que lotar depois disso recebe. */
  aviso_ao_lotar_desde: string | null;
  created_at: string;
```

- [ ] **Step 2:** mesmo arquivo, `updateCampaignGroup`. Antes:

```ts
  patch: Partial<Pick<CampaignGroup, "name" | "slug" | "group_ids" | "auto_grow" | "grow_template" | "metadata">>,
```

  Depois:

```ts
  patch: Partial<
    Pick<
      CampaignGroup,
      "name" | "slug" | "group_ids" | "auto_grow" | "grow_template" | "metadata" | "aviso_ao_lotar" | "aviso_ao_lotar_desde"
    >
  >,
```

- [ ] **Step 3:** `apps/web/src/lib/painel/inicio-carga.ts`, em `carregarCampanhas`. Antes:

```ts
    growTemplate: c.grow_template,
    // Gaveta espelho de comunidade nativa: o painel usa isto pra desabilitar
```

  Depois:

```ts
    growTemplate: c.grow_template,
    // Aviso ao lotar (spec 2026-10-10 D10). O `desde` vai junto porque a tela
    // filtra os "Últimos avisos" por ele (lib/campaigns/aviso-ao-lotar.ts).
    avisoAoLotar: c.aviso_ao_lotar,
    avisoAoLotarDesde: c.aviso_ao_lotar_desde,
    // Gaveta espelho de comunidade nativa: o painel usa isto pra desabilitar
```

- [ ] **Step 4:** `apps/web/src/app/api/campanhas/route.ts` — import. Antes:

```ts
import { renomearSlugCampanha } from "@/lib/campaigns/rename-slug";
```

  Depois:

```ts
import { renomearSlugCampanha } from "@/lib/campaigns/rename-slug";
import { lerAvisoAoLotar, proximoAviso } from "@/lib/campaigns/aviso-ao-lotar";
```

- [ ] **Step 5:** mesmo arquivo, tipo do `patch` no PATCH. Antes:

```ts
  const patch: Partial<Pick<supaStore.CampaignGroup, "name" | "slug" | "group_ids" | "auto_grow" | "grow_template" | "metadata">> = {};
```

  Depois:

```ts
  const patch: Partial<
    Pick<
      supaStore.CampaignGroup,
      "name" | "slug" | "group_ids" | "auto_grow" | "grow_template" | "metadata" | "aviso_ao_lotar" | "aviso_ao_lotar_desde"
    >
  > = {};
```

- [ ] **Step 6:** mesmo arquivo, a leitura da campanha atual passa a acontecer também quando vem o aviso. Antes:

```ts
  if (querMexerEmGrupos || b.settings !== undefined) {
```

  Depois:

```ts
  if (querMexerEmGrupos || b.settings !== undefined || b.avisoAoLotar !== undefined) {
```

- [ ] **Step 7:** mesmo arquivo, o bloco do aviso **antes** da troca de slug (toda validação vem antes dela — comentário que já está lá). Antes:

```ts
  // Trocar o link (/r/:slug) mexe em duas tabelas e guarda o antigo como
```

  Depois:

```ts
  // Aviso ao lotar (spec 2026-10-10 D10): o `desde` depende do que está gravado,
  // e só a transição de `proximoAviso` decide se ele muda. `current` foi buscado
  // acima porque a condição inclui `avisoAoLotar`. Fora do JSON legado de propósito,
  // como `settings`.
  if (b.avisoAoLotar !== undefined) {
    const lido = lerAvisoAoLotar(b.avisoAoLotar);
    if (!lido.ok) return Response.json({ error: lido.error }, { status: 400 });
    if (!current) return Response.json({ error: "Campanha não encontrada." }, { status: 404 });
    const aviso = proximoAviso(
      { texto: current.aviso_ao_lotar, desde: current.aviso_ao_lotar_desde },
      lido.texto,
      new Date().toISOString(),
    );
    patch.aviso_ao_lotar = aviso.aviso_ao_lotar;
    patch.aviso_ao_lotar_desde = aviso.aviso_ao_lotar_desde;
  }

  // Trocar o link (/r/:slug) mexe em duas tabelas e guarda o antigo como
```

- [ ] **Step 8:** mesmo arquivo, resposta do PATCH na mesma forma do GET. Antes:

```ts
    growTemplate: updated.grow_template,
```

  Depois:

```ts
    growTemplate: updated.grow_template,
    avisoAoLotar: updated.aviso_ao_lotar,
    avisoAoLotarDesde: updated.aviso_ao_lotar_desde,
```

- [ ] **Step 9:** tipos e testes vizinhos:

```powershell
Set-Location <wt>\apps\web; npx tsc --noEmit -p tsconfig.json
```
```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/app/api/campanhas/campanhas.integracoes.test.ts src/lib/campaigns/aviso-ao-lotar.test.ts
```

  Esperado: `tsc` limpo; `# pass 15`, `# fail 0`. (A rota em si é provada pelo e2e da Task 4.)

- [ ] **Step 10:** commit:

```powershell
git -C <wt> add apps/web/src/lib/stores/campaign-groups.ts apps/web/src/lib/painel/inicio-carga.ts apps/web/src/app/api/campanhas/route.ts
```
```powershell
git -C <wt> diff --cached --stat
```
```powershell
git -C <wt> commit -m "feat(campanhas): PATCH accepts avisoAoLotar; GET returns it with its start date" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: seção "Aviso ao lotar" nas configurações da campanha

**Files:** criar `apps/web/src/components/painel/campanhas/aviso-ao-lotar.tsx`; modificar `apps/web/src/components/painel/campaign-config.tsx`
**Depends-on:** Tasks 1 e 2
**Interfaces (produz):**
```ts
export type AvisoAoLotarValor = { ligado: boolean; texto: string };
export function AvisoAoLotar(props: {
  value: AvisoAoLotarValor;
  onChange: (v: AvisoAoLotarValor) => void;
  slug: string | null;   // slug salvo; null = campanha ainda não carregou
  desde: string | null;  // aviso_ao_lotar_desde gravado; null = sem lista
}): JSX.Element;
```
**Consome:** `GET /api/campanhas/[slug]/grupos/estados` → `{ grupos: EstadoGrupo[] }` (PR 4); `conferidoHa` de `@/lib/painel/grupos` (já usado no cliente por `grupos-vitrine.tsx`); `AVISO_AO_LOTAR_MAX`, `ultimosAvisos` (Task 1).

Decisão de lugar: o mockup põe o cartão em "Configurar campanha › Grupos" com os "Últimos avisos" dentro dele. Fica na aba Grupos de `campaign-config.tsx` (só na edição), num cartão abaixo do seletor — e os "Últimos avisos" moram no componente, não na página da campanha. `campaign-config.tsx` já tem 674 linhas: o componente fica num arquivo próprio e a página só monta.

- [ ] **Step 1:** `apps/web/src/components/painel/campanhas/aviso-ao-lotar.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AVISO_AO_LOTAR_MAX, ultimosAvisos } from "@/lib/campaigns/aviso-ao-lotar";
import type { EstadoGrupo } from "@/lib/groups/estado";
import { conferidoHa } from "@/lib/painel/grupos";

export type AvisoAoLotarValor = { ligado: boolean; texto: string };

type Props = {
  value: AvisoAoLotarValor;
  onChange: (v: AvisoAoLotarValor) => void;
  /** Slug salvo da campanha, para ler os estados dos grupos. `null` = ainda não carregou. */
  slug: string | null;
  /** `aviso_ao_lotar_desde` gravado. `null` = aviso desligado no banco: sem lista. */
  desde: string | null;
};

/** 16px: abaixo disso o iOS dá zoom ao focar. */
const CAMPO =
  "block w-full resize-y rounded-[10px] border border-volt-950/10 bg-poco px-3.5 py-2.5 text-[16px] leading-relaxed text-volt-950 outline-none placeholder:text-aco focus:border-cobalt-500/50 focus:bg-papel";

/**
 * "Aviso ao lotar" (spec 2026-10-10 D10, mockup Automação): uma mensagem postada
 * NO GRUPO, uma vez, quando ele ganha a marca de lotado. Não é boas-vindas: quem
 * entra depois não recebe nada. Controlado de fora, como o `EntradaForm`: o
 * formulário pai salva tudo junto no "Salvar alterações".
 */
export function AvisoAoLotar({ value, onChange, slug, desde }: Props) {
  const semTexto = value.ligado && value.texto.trim() === "";

  return (
    <section aria-labelledby="aviso-ao-lotar-titulo" className="flex flex-col gap-3.5">
      <h2 id="aviso-ao-lotar-titulo" className="text-[16px] font-semibold text-volt-950">
        Aviso ao lotar
      </h2>
      <label className="flex min-h-11 items-center gap-2.5 text-sm font-medium text-volt-950">
        <input
          type="checkbox"
          checked={value.ligado}
          onChange={(e) => onChange({ ...value, ligado: e.target.checked })}
          className="h-[18px] w-[18px] shrink-0 accent-cobalt-500"
        />
        Mandar uma mensagem quando um grupo lotar
      </label>

      {value.ligado && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="aviso-ao-lotar-texto" className="text-13 text-aco">
            Mensagem
          </label>
          <textarea
            id="aviso-ao-lotar-texto"
            rows={4}
            value={value.texto}
            maxLength={AVISO_AO_LOTAR_MAX}
            onChange={(e) => onChange({ ...value, texto: e.target.value })}
            placeholder="Ex.: Grupo lotado! Amanhã às 9h começam as novidades por aqui."
            aria-describedby="aviso-ao-lotar-ajuda"
            className={CAMPO}
          />
          <p className="font-data text-right text-12 tabular-nums text-aco">
            {value.texto.length}/{AVISO_AO_LOTAR_MAX}
          </p>
          {semTexto && <p className="text-13 text-alerta">Sem mensagem, o aviso fica desligado.</p>}
        </div>
      )}

      <p id="aviso-ao-lotar-ajuda" className="text-13 leading-relaxed text-aco">
        Sai uma vez em cada grupo, na hora em que ele ganha a marca de lotado (sozinho, ao passar de 95%, ou
        pelo botão). Se você reabrir e ele lotar de novo, não repete. Grupos que já estavam lotados antes de
        ligar o aviso não recebem. Só sai em grupo onde o seu número é admin.
      </p>

      {desde && slug && <UltimosAvisos slug={slug} desde={desde} />}
    </section>
  );
}

/**
 * Os últimos cinco grupos avisados, do endpoint de estados (PR 4). Sem "enviado":
 * o carimbo é gravado mesmo quando o disparo falha por falta de número (spec §5.6),
 * então a linha diz só quando, e o resultado fica em Disparos.
 */
function UltimosAvisos({ slug, desde }: { slug: string; desde: string }) {
  const [grupos, setGrupos] = useState<EstadoGrupo[] | "erro" | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/campanhas/${encodeURIComponent(slug)}/grupos/estados`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`estados: ${res.status}`);
        const corpo = (await res.json()) as { grupos?: unknown };
        if (vivo) setGrupos(Array.isArray(corpo.grupos) ? corpo.grupos : "erro");
      })
      .catch(() => {
        if (vivo) setGrupos("erro");
      });
    return () => {
      vivo = false;
    };
  }, [slug]);

  const agora = new Date();
  const avisos = Array.isArray(grupos) ? ultimosAvisos(grupos, desde) : [];

  return (
    <div className="flex flex-col border-t border-volt-950/[0.07] pt-3">
      <h3 className="mb-1.5 text-sm font-semibold text-volt-950">Últimos avisos</h3>
      {grupos === null ? (
        <p role="status" className="text-13 text-aco">
          Carregando…
        </p>
      ) : grupos === "erro" ? (
        <p role="alert" className="text-13 text-alerta">
          Não deu para carregar os últimos avisos.
        </p>
      ) : avisos.length === 0 ? (
        <p className="text-13 text-aco">Nenhum aviso ainda.</p>
      ) : (
        <ul>
          {avisos.map((g) => (
            <li
              key={g.groupId}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-volt-950/[0.07] py-2 last:border-b-0"
            >
              <span className="truncate text-sm text-volt-950">
                {g.nome}
                {g.lotadoPor === "manual" && <span className="text-13 text-aco"> · marcado à mão</span>}
              </span>
              <span className="text-13 text-aco">{conferidoHa(g.avisoLotouEm, agora)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-13 text-aco">
        O resultado de cada envio fica em{" "}
        <Link href="/painel/disparos" className="font-medium text-cobalt-500 underline-offset-2 hover:underline">
          Disparos
        </Link>
        .
      </p>
    </div>
  );
}
```

- [ ] **Step 2:** `apps/web/src/components/painel/campaign-config.tsx` — import. Antes:

```tsx
import { AjudaPainel } from "@/components/painel/campanhas/ajuda-painel";
```

  Depois:

```tsx
import { AjudaPainel } from "@/components/painel/campanhas/ajuda-painel";
import { AvisoAoLotar, type AvisoAoLotarValor } from "@/components/painel/campanhas/aviso-ao-lotar";
```

- [ ] **Step 3:** mesmo arquivo, tipo `Campanha`. Antes:

```tsx
  settings?: { entrada: EntradaSettings; integracoes?: IntegracoesPublicas };
```

  Depois:

```tsx
  settings?: { entrada: EntradaSettings; integracoes?: IntegracoesPublicas };
  /** Aviso ao lotar (spec 2026-10-10 D10). `null` = desligado. O `desde` filtra os "Últimos avisos". */
  avisoAoLotar?: string | null;
  avisoAoLotarDesde?: string | null;
```

- [ ] **Step 4:** mesmo arquivo, estado. Antes:

```tsx
  const [pages, setPages] = useState<{ slug: string; title: string }[]>([]);
```

  Depois:

```tsx
  const [pages, setPages] = useState<{ slug: string; title: string }[]>([]);
  // Aviso ao lotar (aba Grupos) — só existe na edição. `avisoDesde` é o gravado:
  // filtra os "Últimos avisos" e só muda depois de salvar (a tela sai daqui no save).
  const [aviso, setAviso] = useState<AvisoAoLotarValor>({ ligado: false, texto: "" });
  const [avisoDesde, setAvisoDesde] = useState<string | null>(null);
```

- [ ] **Step 5:** mesmo arquivo, carga da edição. Antes:

```tsx
            setLoja(typeof c.loja === "string" ? c.loja : "");
```

  Depois:

```tsx
            setLoja(typeof c.loja === "string" ? c.loja : "");
            setAviso({ ligado: Boolean(c.avisoAoLotar), texto: c.avisoAoLotar ?? "" });
            setAvisoDesde(c.avisoAoLotarDesde ?? null);
```

- [ ] **Step 6:** mesmo arquivo, corpo do PATCH da edição. Antes:

```tsx
            settings: { entrada, integracoes: integracoesPatch() },
```

  Depois:

```tsx
            settings: { entrada, integracoes: integracoesPatch() },
            // Desligado manda "": o servidor zera o texto e o `desde` (só espaços também desliga, lá).
            avisoAoLotar: aviso.ligado ? aviso.texto : "",
```

- [ ] **Step 7:** mesmo arquivo, aba Grupos da edição ganha o cartão. Antes:

```tsx
      : [cadastroCard, gruposCard, entradaCard, integracoesCard];
```

  Depois:

```tsx
      : [
          cadastroCard,
          <div key="grupos" className="space-y-6">
            {gruposCard}
            <Card>
              <AvisoAoLotar value={aviso} onChange={setAviso} slug={createdSlug} desde={avisoDesde} />
            </Card>
          </div>,
          entradaCard,
          integracoesCard,
        ];
```

- [ ] **Step 8:** tipos, lint e Vitrine:

```powershell
Set-Location <wt>\apps\web; npx tsc --noEmit -p tsconfig.json
```
```powershell
Set-Location <wt>\apps\web; npm run lint
```
```powershell
Set-Location <wt>\apps\web; npx tsx scripts/check-painel-vitrine.ts
```

  Esperado: limpo, limpo, `painel:check OK`.

- [ ] **Step 9:** commit:

```powershell
git -C <wt> add apps/web/src/components/painel/campanhas/aviso-ao-lotar.tsx apps/web/src/components/painel/campaign-config.tsx
```
```powershell
git -C <wt> diff --cached --stat
```
```powershell
git -C <wt> commit -m "feat(campanhas): aviso ao lotar section in campaign settings" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: e2e das transições pela tela, e a captura

**Files:** criar `apps/web/e2e/painel-campanha-aviso.spec.ts`
**Depends-on:** Task 3

Em worktree, nada de `preview_start` nem do pane do app (servem o checkout principal — `finding-preview-serve-checkout-principal`). Dev server do próprio worktree numa porta própria + Playwright apontado para ela.

- [ ] **Step 1:** `apps/web/e2e/painel-campanha-aviso.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { ESTADO_LOGADO, coletarFalhasDeApi, exigeCredenciais } from "./sessao-helpers";

/**
 * "Aviso ao lotar" nas configurações da campanha (spec 2026-10-10 D10, §6.8).
 *
 * Contraste API × tela, como o spec da aba Entrada: grava pela TELA, lê pela API e
 * cobra as transições do `desde` que a rota aplica (lib/campaigns/aviso-ao-lotar.ts):
 * ligar grava, trocar o texto mantém, desligar zera. Um `desde` que andasse na
 * edição pularia quem lotou entre o desde antigo e a edição.
 *
 * A campanha é criada e apagada pelo próprio spec, com nome único.
 */

type Campanha = { id: string; slug?: string; avisoAoLotar?: string | null; avisoAoLotarDesde?: string | null };

test.use({ storageState: ESTADO_LOGADO });

const TEXTO = "Grupo lotado! Amanhã às 9h tem novidade.";
const TEXTO_NOVO = "Lotou! Amanhã às 9h começam as novidades.";

test.describe("aviso ao lotar da campanha", () => {
  exigeCredenciais();

  test("liga, troca o texto e desliga pela tela; o servidor guarda o desde certo", async ({ page }, testInfo) => {
    const falhasDeApi = coletarFalhasDeApi(page);
    const criada = await page.request.post("/api/campanhas", {
      data: { name: `E2E aviso ${Date.now().toString(36)}` },
    });
    expect(criada.ok(), `POST /api/campanhas respondeu ${criada.status()}`).toBeTruthy();
    const campanha = (await criada.json()) as Campanha;
    const chave = campanha.slug ?? campanha.id;

    const caixa = page.getByRole("checkbox", { name: "Mandar uma mensagem quando um grupo lotar" });
    const mensagem = page.getByLabel("Mensagem", { exact: true });

    async function abrirAbaGrupos() {
      await page.goto(`/painel/campanhas/${chave}/editar`);
      await page.getByRole("button", { name: "Grupos", exact: true }).click();
    }

    async function salvar() {
      await page.getByRole("button", { name: "Salvar alterações" }).click();
      await page.waitForURL(new RegExp(`/painel/campanhas/${chave}$`));
    }

    async function noServidor(): Promise<Campanha> {
      const lista = await page.request.get("/api/campanhas");
      expect(lista.ok()).toBeTruthy();
      const achada = ((await lista.json()) as Campanha[]).find((c) => c.id === campanha.id);
      expect(achada, "a campanha do spec sumiu de GET /api/campanhas").toBeTruthy();
      return achada!;
    }

    try {
      // Ligar: o texto vai aparado e o desde nasce.
      await abrirAbaGrupos();
      await expect(caixa).not.toBeChecked();
      await caixa.check();
      await mensagem.fill(`  ${TEXTO}  `);
      await salvar();
      const ligada = await noServidor();
      expect(ligada.avisoAoLotar).toBe(TEXTO);
      expect(ligada.avisoAoLotarDesde).toBeTruthy();

      // A tela recarregada diz o mesmo que a API, e a lista de avisos aparece, vazia.
      await abrirAbaGrupos();
      await expect(caixa).toBeChecked();
      await expect(mensagem).toHaveValue(TEXTO);
      await expect(page.getByRole("heading", { name: "Últimos avisos" })).toBeVisible();
      await expect(page.getByText("Nenhum aviso ainda.")).toBeVisible();
      await testInfo.attach("aviso-1280", {
        body: await page.getByRole("region", { name: "Aviso ao lotar" }).screenshot(),
        contentType: "image/png",
      });

      // Trocar o texto: o desde fica.
      await mensagem.fill(TEXTO_NOVO);
      await salvar();
      const editada = await noServidor();
      expect(editada.avisoAoLotar).toBe(TEXTO_NOVO);
      expect(editada.avisoAoLotarDesde).toBe(ligada.avisoAoLotarDesde);

      // Desligar: os dois zeram (religar depois começa do zero).
      await abrirAbaGrupos();
      await caixa.uncheck();
      await salvar();
      const desligada = await noServidor();
      expect(desligada.avisoAoLotar).toBeNull();
      expect(desligada.avisoAoLotarDesde).toBeNull();

      expect(falhasDeApi, "nenhuma chamada de API pode ter falhado").toEqual([]);
    } finally {
      await page.request.delete(`/api/campanhas?id=${encodeURIComponent(campanha.id)}`);
    }
  });
});
```

- [ ] **Step 2:** tipos do e2e: `Set-Location <wt>\apps\web; npx tsc --noEmit -p tsconfig.e2e.json` → limpo.

- [ ] **Step 3:** nenhum e2e do CI batendo no banco de dev agora (`finding-e2e-local-e-ci-corrida-no-mesmo-banco`):

```powershell
gh run list --repo codingB0y/Girumo --workflow Verify --status in_progress --json databaseId,headBranch
```

  Lista não vazia → esperar terminar.

- [ ] **Step 4:** subir o dev server do worktree na porta 3005, em background (`run_in_background: true`; a 3000 pode ser de outra sessão):

```powershell
Set-Location <wt>\apps\web; npx next dev -p 3005
```

  Esperar responder: `Invoke-WebRequest http://localhost:3005/login -UseBasicParsing | Select-Object StatusCode` → 200.

- [ ] **Step 5:** rodar o spec novo e o da aba Entrada (o save passou a mandar `avisoAoLotar`; o fluxo dele não pode quebrar):

```powershell
Set-Location <wt>\apps\web; $env:E2E_BASE_URL = "http://localhost:3005"; npx playwright test e2e/painel-campanha-aviso.spec.ts e2e/painel-campanha-entrada.spec.ts --project=chromium
```

  Esperado: verde (o setup de login roda como dependência). Skip por falta de credencial → a prova fica no job `e2e` do CI (Task 7) e os Steps 6–7 se repetem com o artefato `e2e-report` de lá.

- [ ] **Step 6:** ler a captura `aviso-1280`: `Get-ChildItem <wt>\apps\web\e2e-report\data\*.png | Sort-Object LastWriteTime -Descending | Select-Object -First 1` e abrir com a ferramenta Read. Conferir contra o cartão da esquerda do mockup:
  - título "Aviso ao lotar"; caixa marcada com "Mandar uma mensagem quando um grupo lotar"; rótulo "Mensagem" e o texto com o contador `N/1000`;
  - o texto de ajuda do mockup + "Só sai em grupo onde o seu número é admin.";
  - "Últimos avisos" com "Nenhum aviso ainda." e o link "Disparos";
  - nenhum Acid, raio ≤ 12, texto do campo em 16px.
  Defeito visual → corrigir no componente, commitar junto com o Step 8, repetir Steps 5–6.

- [ ] **Step 7:** derrubar o dev server pelo PID (o `TaskStop` não mata o `next dev` — `finding-taskstop-nao-mata-next-dev`):

```powershell
Get-NetTCPConnection -LocalPort 3005 -State Listen | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }
```

- [ ] **Step 8:** commit:

```powershell
git -C <wt> add apps/web/e2e/painel-campanha-aviso.spec.ts
```
```powershell
git -C <wt> diff --cached --stat
```
```powershell
git -C <wt> commit -m "test(e2e): aviso ao lotar saved through the campaign settings screen" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: worker — `enviar_avisos_lotou` no housekeeping (TDD)

**Files:** modificar `apps/worker/src/housekeeping.ts`, `apps/worker/src/housekeeping.test.ts`
**Depends-on:** Task 0
**Interfaces:**
```ts
export type HousekeepingSummary = { requeued: number; reconciled: number; promoted: number; avisos: number; pruned: number };
// runHousekeeping chama rpc("enviar_avisos_lotou", { p_limit: 20 }) uma vez por ciclo, depois de promote_due_schedules.
// housekeepingDidWork(summary) também é true com avisos > 0 — o index.ts já loga "manutenção" só quando isso é true.
```

`apps/worker/src/index.ts` **não muda**: ele já roda `runHousekeeping` a cada `HOUSEKEEPING_INTERVAL_MS = 30_000` e loga o resumo só quando `housekeepingDidWork` é true — é exatamente o "loga só quando > 0" do spec.

- [ ] **Step 1 (teste):** `apps/worker/src/housekeeping.test.ts`, primeiro teste. Antes:

```ts
  assert.deepEqual(
    calls.map((c) => c.fn),
    ["requeue_expired_commands", "reconcile_broadcast_progress", "promote_due_schedules"],
  );
  assert.deepEqual(summary, { requeued: 3, reconciled: 2, promoted: 1, pruned: 0 });
```

  Depois:

```ts
  assert.deepEqual(
    calls.map((c) => c.fn),
    ["requeue_expired_commands", "reconcile_broadcast_progress", "promote_due_schedules", "enviar_avisos_lotou"],
  );
  assert.deepEqual(summary, { requeued: 3, reconciled: 2, promoted: 1, avisos: 0, pruned: 0 });
```

- [ ] **Step 2 (teste):** mesmo arquivo, teste de `housekeepingDidWork`. Antes:

```ts
  const zero: HousekeepingSummary = { requeued: 0, reconciled: 0, promoted: 0, pruned: 0 };
  assert.equal(housekeepingDidWork(zero), false);
  assert.equal(housekeepingDidWork({ ...zero, reconciled: 1 }), true);
  assert.equal(housekeepingDidWork({ ...zero, pruned: 4 }), true);
```

  Depois:

```ts
  const zero: HousekeepingSummary = { requeued: 0, reconciled: 0, promoted: 0, avisos: 0, pruned: 0 };
  assert.equal(housekeepingDidWork(zero), false);
  assert.equal(housekeepingDidWork({ ...zero, reconciled: 1 }), true);
  assert.equal(housekeepingDidWork({ ...zero, pruned: 4 }), true);
  // O index só loga o ciclo que mexeu em algo: aviso enfileirado tem que aparecer no log.
  assert.equal(housekeepingDidWork({ ...zero, avisos: 1 }), true);
```

- [ ] **Step 3 (teste):** mesmo arquivo, acrescentar no fim:

```ts
test("aviso ao lotar: uma chamada por ciclo com p_limit 20, mesmo quando o lote volta cheio", async () => {
  // Worker que volta de horas parado: a rajada sai em lotes de 20 a cada 30 s, nunca
  // num laço de "chamar até zerar" — cada aviso é um disparo na fila anti-ban do
  // número, e cada chamada a mais é egress.
  const calls: RpcCall[] = [];
  const summary = await runHousekeeping(fakeSupabase({ enviar_avisos_lotou: { data: 20 } }, calls));

  const avisos = calls.filter((c) => c.fn === "enviar_avisos_lotou");
  assert.equal(avisos.length, 1);
  assert.deepEqual(avisos[0]?.args, { p_limit: 20 });
  assert.equal(summary.avisos, 20);
  assert.equal(housekeepingDidWork(summary), true);
});

test("erro no aviso ao lotar sobe, mas só depois das etapas da fila", async () => {
  const calls: RpcCall[] = [];
  const supabase = fakeSupabase(
    { enviar_avisos_lotou: { error: { message: "deadlock detected", code: "40P01" } } },
    calls,
  );

  await assert.rejects(() => runHousekeeping(supabase), /enviar_avisos_lotou: deadlock detected/);
  assert.deepEqual(
    calls.map((c) => c.fn),
    ["requeue_expired_commands", "reconcile_broadcast_progress", "promote_due_schedules", "enviar_avisos_lotou"],
  );
});

test("worker novo contra banco sem a migração do aviso: etapa pulada, o resto segue", async () => {
  const summary = await runHousekeeping(
    fakeSupabase(
      {
        promote_due_schedules: { data: 2 },
        enviar_avisos_lotou: { error: { message: "not found", code: "PGRST202" } },
      },
      [],
    ),
  );

  assert.equal(summary.avisos, 0);
  assert.equal(summary.promoted, 2);
});
```

- [ ] **Step 4:** rodar e ver falhar:

```powershell
Set-Location <wt>\apps\worker; npx tsx --test src/housekeeping.test.ts
```

  Esperado: **FAIL** — `# pass 4`, `# fail 5` (o primeiro teste e o de `housekeepingDidWork` mudaram de expectativa; os três novos ainda não têm código).

- [ ] **Step 5:** `apps/worker/src/housekeeping.ts` — resumo. Antes:

```ts
  /** Agendamentos vencidos que viraram disparo. */
  promoted: number;
```

  Depois:

```ts
  /** Agendamentos vencidos que viraram disparo. */
  promoted: number;
  /** Avisos ao lotar enfileirados: um disparo por grupo que acabou de lotar (spec 2026-10-10 D10). */
  avisos: number;
```

- [ ] **Step 6:** mesmo arquivo, constante. Antes:

```ts
const MAX_SCHEDULES_PER_TICK = 50;
```

  Depois:

```ts
const MAX_SCHEDULES_PER_TICK = 50;
// Teto por ciclo de 30 s. Worker que volta de horas parado drena a rajada em lotes
// de 20, sem laço de "até zerar": cada aviso vira um disparo na fila anti-ban do
// número, e uma chamada a mais por ciclo é o custo de egress (+2.880/dia).
const MAX_AVISOS_PER_TICK = 20;
```

- [ ] **Step 7:** mesmo arquivo, comentário de `runHousekeeping`. Antes:

```ts
 * Um ciclo de manutenção. As quatro etapas são independentes; a ordem só reflete
 * causalidade: requeue devolve comandos à fila ANTES do reconciliador contar
 * pendentes (senão um lease vencido apareceria momentaneamente como "acabou").
```

  Depois:

```ts
 * Um ciclo de manutenção. As etapas são independentes; a ordem só reflete
 * causalidade: requeue devolve comandos à fila ANTES do reconciliador contar
 * pendentes (senão um lease vencido apareceria momentaneamente como "acabou").
 * O aviso ao lotar vem depois das etapas da fila: um erro nele não as segura.
```

- [ ] **Step 8:** mesmo arquivo, a chamada. Antes:

```ts
  const promoted = await rpcInt(supabase, "promote_due_schedules", {
    max_schedules: MAX_SCHEDULES_PER_TICK,
  });
```

  Depois:

```ts
  const promoted = await rpcInt(supabase, "promote_due_schedules", {
    max_schedules: MAX_SCHEDULES_PER_TICK,
  });
  const avisos = await rpcInt(supabase, "enviar_avisos_lotou", { p_limit: MAX_AVISOS_PER_TICK });
```

- [ ] **Step 9:** mesmo arquivo, retorno. Antes:

```ts
  return { requeued, reconciled, promoted, pruned };
```

  Depois:

```ts
  return { requeued, reconciled, promoted, avisos, pruned };
```

- [ ] **Step 10:** mesmo arquivo, `housekeepingDidWork`. Antes:

```ts
    summary.requeued > 0 || summary.reconciled > 0 || summary.promoted > 0 || summary.pruned > 0
```

  Depois:

```ts
    summary.requeued > 0 ||
    summary.reconciled > 0 ||
    summary.promoted > 0 ||
    summary.avisos > 0 ||
    summary.pruned > 0
```

- [ ] **Step 11:** rodar o Step 4 de novo → **PASS** (`# pass 9`, `# fail 0`).

- [ ] **Step 12:** compilar o worker (o único lugar onde o tipo dele é checado):

```powershell
Set-Location <wt>; npm --workspace apps/worker run build
```
```powershell
git -C <wt> status --short
```

  Esperado: build com exit 0; `apps/worker/dist` **não** aparece no status (está no `.gitignore` da raiz).

- [ ] **Step 13:** commit:

```powershell
git -C <wt> add apps/worker/src/housekeeping.ts apps/worker/src/housekeeping.test.ts
```
```powershell
git -C <wt> diff --cached --stat
```
```powershell
git -C <wt> commit -m "feat(worker): housekeeping sends aviso ao lotar once per cycle" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: integração contra o dev — delta → trigger → varredura

**Files:** criar `apps/web/src/lib/stores/aviso-ao-lotar.integration.test.ts`
**Depends-on:** Task 0 (PR 1 aplicado no dev)

Roda de verdade só no job `e2e` do CI (passo "Integracao das stores contra o banco de dev", com `E2E_TENANT_ID` derivado do login e a conferência `# skipped 0`). Local, sem `E2E_TENANT_ID`, retorna cedo e conta como pass — igual aos irmãos (`schedules.integration.test.ts`).

- [ ] **Step 1:** `apps/web/src/lib/stores/aviso-ao-lotar.integration.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Contra o Supabase de DEV. O aviso ao lotar (spec 2026-10-10 D10, §5.6) é a costura de
 * três peças do banco — `apply_group_members_delta` mexe em `members`, o trigger
 * `groups_marca_lotado` grava a marca e `enviar_avisos_lotou` (o worker chama a cada
 * 30 s) posta o aviso — e teste unitário nenhum alcança a costura.
 *
 * O tenant de QA não tem número conectado (finding-qa-tenant-sem-instancia): o disparo
 * do aviso nasce `failed` "Nenhum número conectado". O teste confere que ele EXISTE,
 * com nome, texto e destino certos, e que o grupo ficou marcado — nunca o status.
 *
 * `enviar_avisos_lotou` varre o banco inteiro, e o worker de dev (se estiver no ar)
 * chama a mesma função: o teste confere as linhas dele, nunca o número que a chamada
 * devolve.
 */

const TENANT = process.env.E2E_TENANT_ID ?? "";
// Estas linhas são do tenant de QA: apontado para produção, o teste não roda.
const EM_PRODUCAO = (process.env.SUPABASE_URL ?? "").includes("nidoatbxaylrkcgbszns");
// Chaves só deste run: o banco de dev é de todos os PRs ao mesmo tempo.
const RUN = crypto.randomUUID().slice(0, 8);
const HORA_MS = 3_600_000;
const TEXTO = `Grupo lotado! (teste ${RUN})`;
// Limiar de lotado = 95% da capacidade: com 10, é 9,5. Nove membros fica abaixo; +1 cruza.
const CAPACIDADE = 10;
// Fim da lista de campanhas do QA (ordem por created_at desc): o smoke de outro PR olha a primeira.
const CRIADA_EM = "2020-01-01T00:00:00.000Z";

type GrupoDeTeste = { jid: string; nome: string; isAdmin: boolean };
type LinhaDoGrupo = { lotado_em: string | null; lotado_por: string | null; aviso_lotou_em: string | null };
type Aviso = { name: string; message: string; group_ids: string[] };

function pular(): boolean {
  if (EM_PRODUCAO) {
    console.log("SUPABASE_URL é de produção — teste de integração pulado");
    return true;
  }
  if (!TENANT) {
    console.log("E2E_TENANT_ID ausente — teste de integração pulado");
    return true;
  }
  return false;
}

function grupoDeTeste(papel: string, isAdmin = true): GrupoDeTeste {
  return { jid: `avisotest-${RUN}-${papel}@g.us`, nome: `Aviso E2E ${RUN} ${papel}`, isAdmin };
}

/**
 * Campanha e grupos só deste teste, apagados no `finally`. Os grupos nascem com 9 de 10,
 * abaixo do limiar, e com `admins_counted_at`: sem ele `apply_group_members_delta` não
 * soma (20260901190000_apply_group_members_delta.sql).
 */
async function comCampanha(
  aviso: { texto: string | null; desde: string | null },
  grupos: GrupoDeTeste[],
  usar: (campanhaId: string) => Promise<void>,
) {
  const supabase = getSupabaseAdmin();
  const { data: campanha, error } = await supabase
    .from("campaign_groups")
    .insert({
      tenant_id: TENANT,
      name: `aviso-${RUN}`,
      slug: `aviso-${RUN}-${crypto.randomUUID().slice(0, 4)}`,
      group_ids: grupos.map((g) => g.jid),
      aviso_ao_lotar: aviso.texto,
      aviso_ao_lotar_desde: aviso.desde,
      created_at: CRIADA_EM,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const campanhaId = campanha!.id as string;

  try {
    const { error: erroGrupos } = await supabase.from("groups").insert(
      grupos.map((g) => ({
        tenant_id: TENANT,
        whatsapp_group_id: g.jid,
        name: g.nome,
        members: CAPACIDADE - 1,
        capacity: CAPACIDADE,
        is_admin: g.isAdmin,
        admins_counted_at: new Date().toISOString(),
      })),
    );
    if (erroGrupos) throw new Error(erroGrupos.message);
    await usar(campanhaId);
  } finally {
    await limpar(campanhaId, grupos);
  }
}

/** Melhor esforço: um erro aqui não pode esconder a falha do teste. */
async function limpar(campanhaId: string, grupos: GrupoDeTeste[]) {
  const supabase = getSupabaseAdmin();
  const { data: disparos } = await supabase
    .from("broadcasts")
    .select("id")
    .eq("tenant_id", TENANT)
    .eq("campaign_group_id", campanhaId);
  const ids = (disparos ?? []).map((d) => d.id as string);
  if (ids.length) {
    await supabase.from("engine_commands").delete().eq("tenant_id", TENANT).in("origin_id", ids);
    await supabase.from("broadcasts").delete().eq("tenant_id", TENANT).in("id", ids);
  }
  await supabase
    .from("groups")
    .delete()
    .eq("tenant_id", TENANT)
    .in("whatsapp_group_id", grupos.map((g) => g.jid));
  await supabase.from("campaign_groups").delete().eq("tenant_id", TENANT).eq("id", campanhaId);
}

/** Um membro entra pelo mesmo caminho do webhook: a RPC de delta, que dispara o trigger. */
async function entrarUm(jid: string) {
  const { error } = await getSupabaseAdmin().rpc("apply_group_members_delta", {
    target_tenant_id: TENANT,
    target_group_id: jid,
    delta: 1,
  });
  if (error) throw new Error(error.message);
}

/**
 * Uma varredura como a do worker. Limite alto de propósito: sobra pendente de um run
 * cancelado no dev não pode tirar a vez deste (o worker usa 20; o resto é igual).
 */
async function varrer() {
  const { data, error } = await getSupabaseAdmin().rpc("enviar_avisos_lotou", { p_limit: 1000 });
  if (error) throw new Error(error.message);
  assert.equal(typeof data, "number");
}

async function linhaDoGrupo(jid: string): Promise<LinhaDoGrupo> {
  const { data, error } = await getSupabaseAdmin()
    .from("groups")
    .select("lotado_em, lotado_por, aviso_lotou_em")
    .eq("tenant_id", TENANT)
    .eq("whatsapp_group_id", jid)
    .single();
  if (error) throw new Error(error.message);
  return data as LinhaDoGrupo;
}

async function avisosDa(campanhaId: string): Promise<Aviso[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("broadcasts")
    .select("name, message, group_ids")
    .eq("tenant_id", TENANT)
    .eq("campaign_group_id", campanhaId);
  if (error) throw new Error(error.message);
  return (data ?? []) as Aviso[];
}

test("grupo que lota com o aviso ligado recebe um aviso, uma vez só", async () => {
  if (pular()) return;
  const depois = grupoDeTeste("depois");
  // Ligado há uma hora: a ordem contra o now() do banco não depende do relógio desta máquina.
  const desde = new Date(Date.now() - HORA_MS).toISOString();

  await comCampanha({ texto: TEXTO, desde }, [depois], async (campanhaId) => {
    await entrarUm(depois.jid);
    const marcado = await linhaDoGrupo(depois.jid);
    assert.ok(marcado.lotado_em, "cruzar 95% subindo tem que gravar lotado_em (trigger do PR 1)");
    assert.equal(marcado.lotado_por, "auto");

    await varrer();
    const avisos = await avisosDa(campanhaId);
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0]!.name, `Aviso ao lotar · ${depois.nome}`);
    assert.equal(avisos[0]!.message, TEXTO);
    assert.deepEqual(avisos[0]!.group_ids, [depois.jid]);
    assert.ok((await linhaDoGrupo(depois.jid)).aviso_lotou_em, "aviso_lotou_em marca o grupo como avisado");

    await varrer();
    assert.equal((await avisosDa(campanhaId)).length, 1, "a segunda varredura não repete");
  });
});

test("grupo lotado antes de ligar o aviso e grupo sem admin nunca recebem", async () => {
  if (pular()) return;
  const antes = grupoDeTeste("antes");
  const semAdmin = grupoDeTeste("sem-admin", false);

  await comCampanha({ texto: null, desde: null }, [antes, semAdmin], async (campanhaId) => {
    await entrarUm(antes.jid);
    const lotouEm = (await linhaDoGrupo(antes.jid)).lotado_em;
    assert.ok(lotouEm, "o grupo tem que ter lotado antes de o aviso ser ligado");

    // Liga o aviso depois da marca, como a tela faz (PATCH grava desde = agora). +1 ms
    // sobre o carimbo do banco: o Date corta os microssegundos, então fica estritamente depois.
    const desde = new Date(Date.parse(lotouEm) + 1).toISOString();
    const { error } = await getSupabaseAdmin()
      .from("campaign_groups")
      .update({ aviso_ao_lotar: TEXTO, aviso_ao_lotar_desde: desde })
      .eq("tenant_id", TENANT)
      .eq("id", campanhaId);
    if (error) throw new Error(error.message);

    await entrarUm(semAdmin.jid);
    const semAdminLotouEm = (await linhaDoGrupo(semAdmin.jid)).lotado_em;
    // Pré-condição: sem isto o grupo sem admin ficaria de fora pela data, e o teste
    // passaria sem provar o filtro de is_admin.
    assert.ok(semAdminLotouEm && Date.parse(semAdminLotouEm) >= Date.parse(desde), "o sem-admin lotou depois de ligar");

    await varrer();
    assert.equal((await avisosDa(campanhaId)).length, 0);
    assert.equal((await linhaDoGrupo(antes.jid)).aviso_lotou_em, null);
    assert.equal((await linhaDoGrupo(semAdmin.jid)).aviso_lotou_em, null);
  });
});
```

- [ ] **Step 2:** rodar local:

```powershell
Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/aviso-ao-lotar.integration.test.ts
```

  Esperado sem credencial: `# pass 2` com a linha "E2E_TENANT_ID ausente — teste de integração pulado". Com `E2E_TENANT_ID` + `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` **do dev** já no ambiente: `# pass 2` sem a linha de pulado. A prova obrigatória é a do CI (Task 7 Step 9).

- [ ] **Step 3:** tipos: `Set-Location <wt>\apps\web; npx tsc --noEmit -p tsconfig.json` → limpo.

- [ ] **Step 4:** commit:

```powershell
git -C <wt> add apps/web/src/lib/stores/aviso-ao-lotar.integration.test.ts
```
```powershell
git -C <wt> diff --cached --stat
```
```powershell
git -C <wt> commit -m "test(campanhas): aviso ao lotar integration test against the dev database" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: gate final, revisão, PR, merge e deploy do worker

**Files:** nenhum novo.
**Depends-on:** Tasks 1–6

- [ ] **Step 1:** em `<wt>\apps\web`, um por vez:
  - `npx tsc --noEmit -p tsconfig.json`
  - `npx tsc --noEmit -p tsconfig.e2e.json`
  - `npm run lint`
  - `npm test`
  - `npx tsx scripts/check-painel-vitrine.ts`

  E o worker, da raiz: `Set-Location <wt>; npm --workspace apps/worker test` e `Set-Location <wt>; npm --workspace apps/worker run build`.

- [ ] **Step 2:** o gate real (sem `2>&1` nem `*>` — o PS 5.1 transforma aviso de stderr em falha; `pwsh` não existe nesta máquina):

```powershell
Set-Location <wt>; & .\infra\scripts\verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
```

  Esperado: `EXIT=0`. O script deixa um build de produção em `apps\web\.next`: antes de qualquer `next dev` depois disso, apagar a pasta.

- [ ] **Step 3:** revisão final do diff inteiro (a revisão por task não vê a costura — `pattern-revisao-final-pega-o-que-revisao-por-task-nao-ve`): superpowers:requesting-code-review sobre `git -C <wt> diff origin/main...HEAD`, pedindo atenção aos cinco itens do **Review Focus** e a: (a) `.eq('tenant_id')` presente em toda query nova (rota, teste); (b) `PATCH` com `avisoAoLotar` só depois de todas as validações e antes da troca de slug; (c) a copy não promete boas-vindas nem DM. CRITICAL/HIGH → corrigir, commitar (`fix(campanhas): …`), repetir Steps 1–2.

- [ ] **Step 4:** `git -C <wt> fetch origin main` e `git -C <wt> log HEAD..origin/main --oneline`. Commits novos → `git -C <wt> merge origin/main` (não rebase). Conflito em `route.ts`/`campaign-config.tsx` com o PR 6: manter o lado de `main` e reaplicar só os blocos deste plano por cima. Depois, Steps 1–2 de novo.

- [ ] **Step 5:** `git -C <wt> status --short` sem modificados e `git -C <wt> log origin/main..HEAD --oneline` com os 6 commits das Tasks 1–6 (mais os de correção, se houve).

- [ ] **Step 6:** push (se o classificador barrar, não insistir numa 3ª variação — entregar o comando ao Igor, `finding-classificador-bloqueia-merge-e-ddl`):

```powershell
git -C <wt> push -u origin feat/postar-grupo-aviso
```

- [ ] **Step 7:** corpo do PR em `<sp>\pr9-body.md` (arquivo, por causa do `` ` `` que o PowerShell trata como escape):

```markdown
## O que entra

- **Aviso ao lotar por campanha** (spec 2026-10-10 D10, §6.8): cartão na aba Grupos das configurações — caixa "Mandar uma mensagem quando um grupo lotar", mensagem até 1000 caracteres, texto de ajuda do mockup e "Últimos avisos".
- `PATCH /api/campanhas` aceita `avisoAoLotar`: vazio→texto grava `aviso_ao_lotar_desde = agora`; texto→vazio (ou só espaços) zera os dois; texto→texto mantém o `desde`. `GET` devolve `avisoAoLotar` e `avisoAoLotarDesde`. Regras em `lib/campaigns/aviso-ao-lotar.ts`.
- Worker: o housekeeping chama `enviar_avisos_lotou({ p_limit: 20 })` a cada ciclo de 30 s, depois das etapas da fila, sem laço de drenagem (+2.880 chamadas/dia). Loga só quando enfileirou algum.
- "Últimos avisos" filtra `avisoLotouEm >= desde` e `!= lotadoEm`: o backfill do PR 1 e o grupo descoberto já cheio gravam `aviso_lotou_em` sem enviar nada. A linha não diz "enviado" (o carimbo também é gravado quando o disparo falha sem número); o resultado fica em Disparos.

## Depois do merge

- **Redeploy manual do worker no Coolify** (PR de código não muda a stack). Sem variável nova.
- Fecha a série postar por grupo: verificação em produção do spec §11.

## Teste

- [x] npm test (web e worker), tsc x2, lint, painel:check, build do worker, verify-local.ps1
- [x] e2e/painel-campanha-aviso.spec.ts e painel-campanha-entrada.spec.ts (local ou CI)
- [ ] job e2e: aviso-ao-lotar.integration.test.ts com 2 testes rodando de verdade (não pulados)
- [ ] CI verde

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

```powershell
gh pr create --repo codingB0y/Girumo --base main --head feat/postar-grupo-aviso --title "feat(campanhas): aviso ao lotar (postar por grupo, PR 9/9)" --body-file <sp>\pr9-body.md
```

- [ ] **Step 8:** CI (trocar `<N>`):

```powershell
gh pr checks <N> --repo codingB0y/Girumo --watch
```

  E2E vermelho com 401/500 em spec que não é deste PR = corrida no banco de dev (`finding-ci-corrida-banco-dev`): `gh run rerun <run-id> --failed --repo codingB0y/Girumo` depois que o outro terminar.

- [ ] **Step 9:** a integração rodou de verdade (o passo só fica verde com `# skipped 0`, mas confirmar que os dois testes deste PR estão lá):

```powershell
gh run view <run-id> --repo codingB0y/Girumo --log | Select-String "aviso ligado|antes de ligar o aviso"
```

  Esperado: duas linhas com `✔`. Ausentes → o arquivo não casou o glob ou pulou; investigar antes de mergear.

- [ ] **Step 10 (Igor):** merge à mão no verde (`main` sem proteção: nunca auto-merge — `finding-main-sem-protecao-auto-merge-imediato`):

```powershell
gh pr merge <N> --squash --delete-branch --repo codingB0y/Girumo
```

- [ ] **Step 11 (Igor, Coolify):** só depois do merge **e** com a migração do PR 1 em prod (Task 0 Step 4): app do worker → **Redeploy**. Conferir:
  - log de boot `worker iniciado` sem erro;
  - **nenhum** `housekeeping: função ausente no banco, etapa pulada { fn: 'enviar_avisos_lotou' }` nos primeiros 30 s (se aparecer, o PR 1 não está aplicado em prod);
  - no painel do Supabase de prod, logs da API filtrando por `enviar_avisos_lotou`: uma chamada a cada ~30 s.

- [ ] **Step 12 (Igor, prod):** card. Se os PRs 1–8 já estão todos em `main` (conferir na Task 8 Step 1), a série está no ar e falta verificar:

```sql
select public.move_card('postar-por-grupo', 'no_ar_nao_verificado', 'PRs 1–9 mergeados; worker com o aviso ao lotar redeployado. Falta a verificação do spec §11 em prod.', 'PR #<N>');
update public.board_features
   set blocker = 'Falta verificar em prod: spec §11 itens 1–5 e D11 (Task 8 do plano do PR 9).',
       updated_at = now()
 where key = 'postar-por-grupo';
```

  Se algum dos PRs 1–8 ainda não mergeou: manter `em_construcao` e escrever no `blocker` quais faltam (ex.: "Falta o PR 8 (Padronizar) em main; PR 9 mergeado em #<N>").

---

### Task 8: fechamento da série em produção

**Files:** nenhum.
**Depends-on:** Task 7 mergeada e worker redeployado.

Quem verifica é o Igor, logado no painel de prod; o agente prepara as queries e lê o resultado. Tudo na campanha real **Moda Kids do Sul**. Prova é contraste colhido na hora (`verificar-commit-em-producao`), não caso feliz.

- [ ] **Step 1:** a série inteira está em `main`:

```powershell
git -C <wt> fetch origin main
```
```powershell
git -C <wt> ls-tree --name-only origin/main apps/web/supabase/migrations/20261010120000_postar_por_grupo.sql apps/web/supabase/migrations/20261010130000_grupo_uma_campanha.sql apps/web/src/lib/groups/estado.ts apps/web/src/app/api/groups/recount/route.ts "apps/web/src/app/api/campanhas/[slug]/grupos/estados/route.ts" apps/web/src/lib/campaigns/destino.ts apps/web/src/lib/groups/padronizar.ts apps/web/src/lib/campaigns/aviso-ao-lotar.ts
```
```powershell
git -C <wt> grep -n "set_subject" origin/main -- apps/worker/src/bulk-loop.ts
```

  Esperado: os oito caminhos e pelo menos uma linha do grep. Faltando → a série não fechou; parar aqui com o card em `em_construcao` e o `blocker` dizendo o que falta.

- [ ] **Step 2:** o commit em produção contém o merge deste PR. O Igor abre `/admin/configuracoes` e lê o campo **Deploy** (7 caracteres). Com `<deploy>` = esse valor e `<merge>` = o sha do squash do PR 9 em `main`:

```powershell
git -C <wt> merge-base --is-ancestor <merge> <deploy>; "ANCESTOR=$LASTEXITCODE"
```
```powershell
git -C <wt> show <deploy>:apps/web/src/lib/campaigns/aviso-ao-lotar.ts | Select-String "export function proximoAviso"
```

  Esperado: `ANCESTOR=0` e uma linha. `ANCESTOR=1` → o build da Vercel ainda não subiu; esperar e repetir (verificar antes mede o binário antigo). O worker: o Coolify mostra o commit do último deploy; tem que conter `<merge>` pelo mesmo `merge-base`.

- [ ] **Step 3:** achar a campanha. `<sp>\prod-campanha.sql`:

```sql
select c.id as campanha, c.tenant_id, c.slug, c.name,
       c.aviso_ao_lotar, c.aviso_ao_lotar_desde,
       c.grow_template ->> 'subjectPattern' as subject_pattern,
       c.grow_template ->> 'padronizadoEm' as padronizado_em
  from public.campaign_groups c
 where c.name ilike 'Moda Kids do Sul%';
```

  Igor roda em prod (`Set-Location <wt>\apps\web; supabase link --project-ref nidoatbxaylrkcgbszns --yes` e `supabase db query --linked -f <sp>\prod-campanha.sql`; depois relinkar o dev). Anotar `<campanha>` e `<slug>`. Nas queries abaixo, trocar os dois literalmente.

- [ ] **Step 4 (§11.1 — aba Grupos = destino real do link):** o Igor abre a aba Grupos da campanha (lotados do backfill aparecem com "automático"; um "Enchendo agora"). `<sp>\prod-11-1.sql`:

```sql
select s.posicao, s.name, s.members, s.capacity, s.estado, s.lotado_por, s.reaberto_em, s.invite_url
  from public.campaign_groups c,
       public.campaign_group_states(c.tenant_id, c.id) s
 where c.id = '<campanha>'
 order by s.posicao;
```

  Esperado: exatamente uma linha `enchendo`. Contraste: o Igor abre o link da campanha (`/r/<slug>`) numa **janela anônima** (sem o grupo "lembrado" do cookie) e o convite de destino é o `invite_url` da linha `enchendo`, e é o mesmo nome que a tela mostra.

- [ ] **Step 5 (§11.2 — post padrão pula quem está enchendo):** o Igor posta pela barra (Postar) com o atalho padrão "Todos menos o que está enchendo" e, **logo em seguida** (o "enchendo" pode mudar se o grupo lotar), roda `<sp>\prod-11-2.sql`:

```sql
with b as (
  select id, run_id, status, total
    from public.broadcasts
   where campaign_group_id = '<campanha>' and target_rule = 'menos_enchendo'
   order by created_at desc
   limit 1
), enchendo as (
  select s.whatsapp_group_id
    from public.campaign_groups c,
         public.campaign_group_states(c.tenant_id, c.id) s
   where c.id = '<campanha>' and s.estado = 'enchendo'
)
select b.id, b.status, b.total,
       count(e.id) as comandos,
       count(e.id) filter (where e.payload ->> 'jid' in (select whatsapp_group_id from enchendo)) as comandos_no_enchendo
  from b
  left join public.engine_commands e on e.origin_run_id = b.run_id
 group by b.id, b.status, b.total;
```

  Esperado: `comandos_no_enchendo = 0` e `comandos` = número de grupos `lotado` + `fila` admin da Step 4.

- [ ] **Step 6 (§11.3 — reaberto tem prioridade):** o Igor reabre, pela aba Grupos, um lotado que tenha vaga (o botão só libera abaixo de 95%). `<sp>\prod-11-3.sql`:

```sql
select s.name, s.estado, s.reaberto_em, s.members, s.capacity, s.invite_url
  from public.campaign_groups c,
       public.campaign_group_states(c.tenant_id, c.id) s
 where c.id = '<campanha>' and s.reaberto_em is not null;
```

  Esperado: a linha do reaberto com `estado = 'enchendo'`. Contraste: nova janela anônima em `/r/<slug>` → o convite é o `invite_url` dele (e não mais o da Step 4). E a tela "Últimos avisos" **não** mostra esse grupo se ele veio do backfill (Review Focus 5).

- [ ] **Step 7 (§11.4 — Padronizar):** depois de um Padronizar aplicado pela tela, rodar `<sp>\prod-11-4.sql`:

```sql
select status, count(*)
  from public.group_bulk_jobs
 where campaign_group_id = '<campanha>' and action = 'set_subject'
 group by status;
```

  e a query da Step 3 de novo. Esperado: jobs `done` (falhas isoladas são aceitas pelo §7, com o motivo), `subject_pattern = '<base> {n}'` e `padronizado_em` preenchido. Contraste: os nomes no WhatsApp do celular e na aba Grupos são os novos.

- [ ] **Step 8 (§11.5 — aviso ao lotar, uma vez):** o Igor liga o aviso nas configurações (aba Grupos), salva, e espera um grupo lotar. Se a campanha não lotar nenhum em prazo razoável, a alternativa é marcar à mão, pelo botão "Marcar como lotado", o grupo que está enchendo **quando ele já estiver perto do limite** (D10 vale para a marca manual também) — decisão do Igor, porque muda o destino do link. Depois de ≥ 30 s, `<sp>\prod-11-5.sql`:

```sql
select g.name, g.lotado_em, g.lotado_por, g.aviso_lotou_em,
       count(b.id) as avisos,
       string_agg(b.status::text, ',') as status
  from public.campaign_groups c
  join public.groups g
    on g.tenant_id = c.tenant_id and g.whatsapp_group_id = any(c.group_ids)
  left join public.broadcasts b
    on b.tenant_id = c.tenant_id
   and b.campaign_group_id = c.id
   and b.group_ids = array[g.whatsapp_group_id]
   and b.name like 'Aviso ao lotar · %'
 where c.id = '<campanha>'
   and g.lotado_em >= c.aviso_ao_lotar_desde
 group by g.name, g.lotado_em, g.lotado_por, g.aviso_lotou_em;
```

  Esperado: cada grupo listado com `avisos = 1`, `status` `sent` (ou `queued`/`running` nos primeiros minutos) e `aviso_lotou_em` preenchido. Contraste: na mesma campanha, nenhum aviso para quem lotou antes de ligar:

```sql
select count(*) as avisos_indevidos
  from public.campaign_groups c
  join public.broadcasts b on b.tenant_id = c.tenant_id and b.campaign_group_id = c.id and b.name like 'Aviso ao lotar · %'
  join public.groups g on g.tenant_id = c.tenant_id and b.group_ids = array[g.whatsapp_group_id]
 where c.id = '<campanha>' and g.lotado_em < c.aviso_ao_lotar_desde;
```

  Esperado: `0`. E no WhatsApp do celular a mensagem aparece **uma vez** no grupo que lotou; a tela mostra o grupo em "Últimos avisos". Repetir a primeira query 1 min depois: `avisos` continua `1`.

- [ ] **Step 9 (D11 — "toda semana" refaz a regra):** o Igor agenda um post com "Repetir: Toda semana" e o atalho padrão, para daqui a ~5 min. `<sp>\prod-d11.sql`:

```sql
select s.id as agendamento, s.recurrence, s.status, s.scheduled_at, s.last_run_at,
       b.id as disparo, b.target_rule, b.group_ids, b.run_id
  from public.schedules s
  join public.broadcasts b on b.id = s.broadcast_id
 where b.campaign_group_id = '<campanha>' and s.recurrence = 'weekly'
 order by s.created_at desc
 limit 1;
```

  Esperado antes de sair: `target_rule = 'menos_enchendo'`, `group_ids = {}`. Depois do horário: `last_run_at` preenchido, `scheduled_at` uma semana à frente, e a query da Step 5 (com o `disparo` daqui no lugar do filtro por `target_rule`) dá `comandos_no_enchendo = 0`. Apagar o agendamento de teste pela tela se o Igor não quiser mantê-lo.

- [ ] **Step 10 (Igor, prod) — card verificado.** Só com as Steps 4–9 conferidas. Evidência curta e datada (o banco recusa `no_ar_verificado` sem ela):

```sql
select public.move_card('postar-por-grupo', 'no_ar_verificado',
  'Prod <dd/mm>: aba Grupos = destino do /r/; post padrão sem o JID enchendo (run <run_id>); reaberto recebeu o clique; padronizar renomeou <n> grupos; aviso saiu 1x no grupo <nome> (broadcast <id>); semanal refez a regra.',
  'Spec §11 1–5 + D11 conferidos pelo Igor em <dd/mm/aaaa>; PRs #<1>…#<N>');
update public.board_features
   set blocker = null,
       updated_at = now()
 where key = 'postar-por-grupo';
```

  Varrer cards afetados de lado (o `move_card` não limpa blocker de quem citava esta feature):

```sql
select key, status, blocker
  from public.board_features
 where blocker ilike '%postar-por-grupo%'
    or blocker ilike '%lotad%'
    or blocker ilike '%group_full%'
    or blocker ilike '%aviso ao lotar%';
```

  Para cada linha que esta série resolveu: `update public.board_features set blocker = null, updated_at = now() where key = '<key>';` (uma por key, o Igor decide). Linha que continua bloqueada por outro motivo: reescrever o blocker com o motivo atual.

  Se algum item falhou: `move_card('postar-por-grupo', 'quebrado', '<o que falhou, com a query>', '<evidência>')` e `blocker` com o defeito; abrir o fix como PR novo a partir de `main`.

- [ ] **Step 11 — grafo.** Na sessão, `kg_insert_text` com `source` `decisao-2026-10-10-aviso-ao-lotar`:

  > decisão: aviso ao lotar (postar por grupo, PR 9) — texto por campanha em campaign_groups.aviso_ao_lotar + aviso_ao_lotar_desde. PATCH /api/campanhas aceita avisoAoLotar (trim, até 1000): vazio→texto grava desde = agora; texto→vazio ou só espaços zera os dois; texto→texto mantém o desde; texto sem desde ganha agora (lib/campaigns/aviso-ao-lotar.ts). O worker chama enviar_avisos_lotou({p_limit: 20}) no housekeeping a cada 30 s, depois das etapas da fila, sem laço de drenagem. "Últimos avisos" na config filtra avisoLotouEm >= desde e != lotadoEm, porque o backfill e o insert já cheio gravam aviso_lotou_em sem enviar; a linha não diz "enviado" (o carimbo também cai quando o disparo falha).

  E, com a verificação feita, um segundo com `source` `decisao-<aaaa-mm-dd>-postar-por-grupo-no-ar` resumindo o que a Step 10 provou. Os comandos para o Igor (PowerShell, na raiz do **checkout principal**, onde o LightRAG roda — `finding-lightrag-roda-do-checkout-principal`):

```powershell
Set-Location C:\Users\Igor\Desktop\HubFlow-platform
.\tools\lightrag\.venv\Scripts\rag.exe insert "decisão: aviso ao lotar por campanha (campaign_groups.aviso_ao_lotar + aviso_ao_lotar_desde); PATCH /api/campanhas: vazio→texto grava desde=agora, texto→vazio/só espaços zera, texto→texto mantém; worker chama enviar_avisos_lotou(p_limit 20) no housekeeping a cada 30 s sem drenar; Últimos avisos filtra avisoLotouEm >= desde e != lotadoEm (backfill e insert já cheio gravam aviso_lotou_em sem enviar)" --source decisao-2026-10-10-aviso-ao-lotar
.\tools\lightrag\.venv\Scripts\rag.exe stats
```

  (`kg_query`/`kg_insert_text` travando ou devolvendo `None` → usar só o `rag.exe` acima — `finding-kg-query-retorna-none`.)

- [ ] **Step 12 — memória.** Lembrete para a sessão: criar a nota de projeto `postar-por-grupo.md` (estado da série, card, links do spec/contratos/planos, o que ficou de fora — §10 — e a pendência de aviso atrasado para grupo que vira admin depois, ver "Divergências" abaixo) com uma linha no `MEMORY.md`; e acrescentar em `finding-girumo-nao-tem-boas-vindas.md` que o "aviso ao lotar" existe, mas é uma mensagem única quando o grupo lota — **não** é boas-vindas e não pode ser vendido como tal.

- [ ] **Step 13:** ao encerrar a sessão, reportar: "PRs que deixei abertos: …" (ou "nenhum"), e o estado do card.

---

## Divergências com o spec, os contratos e o código (não renomeadas em silêncio)

1. **"Últimos avisos" pelo `avisoLotouEm` cru mentiria.** O §6.8 manda listar "grupos com `avisoLotouEm`", mas o §5.3 (insert já cheio) e o §5.7 (backfill) gravam `aviso_lotou_em = now()` **sem enviar**. O plano filtra `avisoLotouEm >= desde` e `!= lotadoEm` — e por isso `ultimosAvisos` recebe `desde` (`ultimosAvisos(grupos, desde, limite = 5)`, não `(grupos, limite)`), e o `GET /api/campanhas` passa a devolver também `avisoAoLotarDesde`, que o contrato §4 não lista (acréscimo, não troca). O `PATCH` devolve os dois campos também.
2. **Mockup diz "enviado há 2 dias".** O §5.6 passo 2 grava `aviso_lotou_em` "qualquer que seja o resultado" (inclusive sem número conectado). A linha mostra só o tempo ("há 2 dias") e aponta para Disparos.
3. **Grupo lotado sem admin pode receber o aviso tarde.** O §5.6 exige `g.is_admin` mas deixa `aviso_lotou_em` nulo para quem não é admin; se o número virar admin dias depois, a próxima varredura posta "Grupo lotado!" atrasado. É código do PR 1, fora deste PR — registrado na memória (Task 8 Step 12) para decidir depois.
4. **`desde` vem do relógio do app**, não do `now()` do banco (o §6.8 diz "`= now()`"): a rota grava `new Date().toISOString()`. Diferença de relógio Vercel × Supabase é de milissegundos; aceito.
5. **Nome perto de colisão:** já existe `POST /api/campanhas/[slug]/grupos/estado` (singular, abrir/fechar grupo); o PR 4 cria `GET .../grupos/estados` (plural). O componente usa o plural.
6. **O worker não é compilado em lugar nenhum do CI.** O `verify-local.ps1` só roda os testes dele (via `npm test` da raiz) e o `tsconfig` do worker exclui `*.test.ts`. O plano roda o build à mão (Tasks 5 e 7).
7. **Card `postar-por-grupo`:** nenhum lugar do repo confirma que ele existe. A Task 0 confere e cria (área `Campanhas`) se faltar.
8. **11 arquivos**, um acima da régua de ~10 do CLAUDE.md: o e2e (Task 4) entrou porque a rota do `PATCH` não tem teste unitário e é ela que aplica as transições do Review Focus 1 e 2.

## Self-review contra spec e contratos

| Item | Onde |
|---|---|
| D10 — texto opcional por campanha, uma vez por grupo, não repete ao reabrir, não retroativo | banco do PR 1; app: Task 1 (`proximoAviso`), Task 2 (rota), Task 6 (prova no banco) |
| D10 — "sozinho ou à mão" | banco do PR 1 (a varredura só olha `lotado_em`, venha do trigger ou de `marcar_grupo_lotado`); verificação Task 8 Step 8 |
| D11 — semanal refaz a regra | nada a construir; Task 8 Step 9 |
| §5.6 — `enviar_avisos_lotou(p_limit)` só `service_role`; worker a cada 30 s; loga > 0 | Task 0 Step 4 (ACL), Task 5 (chamada, `p_limit: 20`, log via `housekeepingDidWork`) |
| §6.8 — caixa + texto até 1000; transições do `desde` | Tasks 1, 2, 3; e2e Task 4 |
| §6.8 — "Últimos avisos" do endpoint de estados, sem tabela nova | Task 3 (`/grupos/estados`), Task 1 (`ultimosAvisos`) — ver Divergência 1 |
| §7 — "Ligar o aviso com 11 grupos já lotados → nenhum recebe" | Task 6, teste 2 |
| §8 — integração no job e2e | Task 6 + Task 7 Step 9 |
| §9 — PR 9 depende de 1 e 4 (e do `estado.ts` do PR 2) | Task 0 Step 3 |
| §9 — worker com deploy separado | Task 7 Step 11 |
| §11 — itens 1–5 em prod | Task 8 Steps 4–8 |
| Contratos §5 "Worker (PR 9)" — RPC com `{ p_limit: 20 }` | Task 5 Step 8 |
| Contratos §4 — `PATCH /api/campanhas` ganha `avisoAoLotar?: string` | Task 2 Steps 6–8 |
| CLAUDE.md — card ao começar/terminar, blocker limpo, PR fechado na sessão | Task 0 Step 9, Task 7 Step 12, Task 8 Steps 10 e 13 |
