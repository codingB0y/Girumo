# Postar por grupo — PR 1: banco — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O banco ganha tudo de que os PRs 2–9 precisam: a marca de lotado gravada no grupo (colunas + trigger + backfill), o aviso ao lotar na campanha, a regra de destino no disparo, o `subject` das ações em massa, as funções que são a **única** definição de estado do grupo e de regra de destino, as quatro RPCs do contrato e o fan-out/agendamento lendo essas funções — aplicado em dev **e** prod pelo Igor, com a baseline do gate de drift regravada no mesmo PR.

**Architecture:** Uma migração (`20261010120000_postar_por_grupo.sql`). No topo, uma trava que aborta se o corpo de `app.enqueue_broadcast` ou `app.promote_due_schedules` no banco diferir do repo (o `create or replace` apagaria em silêncio uma correção feita à mão). Funções puras de regra em `app` (`limiar_lotado`, `grupo_na_regra`, ambas `immutable`), a função de estado `app.estados_da_campanha` (SQL, `stable`), `app.alvos_da_regra` e `app.alvos_do_disparo` em cima dela; um trigger `security definer` em `groups` é o único escritor automático da marca; wrappers `public.*` `security definer` com execute só para `service_role`. `enqueue_broadcast` troca o `select … into jids` por `app.alvos_do_disparo(b)`; `promote_due_schedules` troca a cópia do predicado por uma leitura dos JIDs do run em `engine_commands`. O teste é `infra/tests/postar-por-grupo-check.sql`: uma transação com `rollback` que monta duas lojas descartáveis e prova cada regra com `raise exception`. Um guarda de uma linha no claim legado (`claimPendingBroadcasts`) fecha o caminho do motor antigo.

**Tech Stack:** Postgres 15 (Supabase), plpgsql e SQL functions, Supabase CLI (`db query --linked`, Management API), `@supabase/supabase-js` (service-role) contra PostgREST falso, `node --test` via tsx.

**Spec:** `docs/superpowers/specs/2026-10-10-postar-por-grupo-design.md` (§2 decisões, §3 vocabulário, §4, §5.1–5.7, §7, §8, §9) · **contratos (vinculantes; nomes e assinaturas daqui vencem qualquer outro texto):** `docs/superpowers/plans/2026-10-10-postar-por-grupo-00-contratos.md` §1.

## Global Constraints

- Worktree: `WT` = saída de `git rev-parse --show-toplevel` no cwd da sessão do executor. O cwd do Bash reseta entre chamadas: todo bloco Bash abaixo começa com `WT="$(git rev-parse --show-toplevel)"` e usa `git -C "$WT"`/caminho absoluto.
- Branch `feat/postar-grupo-banco`, criada de `origin/main`, sem upstream até o `push -u`.
- Migração: `apps/web/supabase/migrations/20261010120000_postar_por_grupo.sql`. Teste SQL: `infra/tests/postar-por-grupo-check.sql`.
- Bancos: dev `wfjuwogxaupyadwhvoxy` · prod `nidoatbxaylrkcgbszns`. Toda DDL vai nos dois: dev primeiro, prod logo em seguida, sem pausa.
- **DDL e qualquer SQL em prod são do Igor.** O executor nunca aplica a migração nem roda o check (o check escreve, mesmo com `rollback`; o classificador nega em dev e em prod). Leitura em dev pelo `supabase db query --linked` o executor pode tentar (Task 2).
- Nomes, assinaturas, retornos e colunas: exatamente os do contrato §1 (`EstadoRow` com 17 colunas, nesta ordem).
- Função nova: `set search_path = ''` e todo nome qualificado. As duas reescritas mantêm `set search_path = public, app` e o corpo do repo, com uma troca cada.
- Privilégio, para as 12 funções que a migração cria ou reescreve: `revoke all on function … from public, anon, authenticated;` + `grant execute on function … to service_role;`.
- Migração idempotente: `add column if not exists`, `drop constraint if exists` + `add constraint`, `create index if not exists`, `drop trigger if exists` + `create trigger`, `create or replace`.
- Limiar: `(case when p_capacity > 0 then p_capacity else 1024 end) * 0.95`.
- Mensagem de destino vazio com regra: `Nenhum grupo nesta regra agora.` · sem regra (inalterada): `Nenhum grupo de destino (verifique se o número é admin dos grupos).`
- Unit (cwd `apps/web`): `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`.
- Tipos (os dois; lint e tsx não checam tipo): `npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.json` e `npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.e2e.json`.
- Lint: `npm --workspace apps/web run lint` · suíte inteira: `npm test` na raiz.
- Antes do push: `infra/scripts/verify-local.ps1` pela ferramenta PowerShell, sem `2>&1` nem `*>`.
- Commits em inglês, prefixo semântico, última linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca `git add -A`; `git diff --cached --stat` numa chamada **separada** antes de cada commit.
- Comando entregue ao Igor: PowerShell 5.1 — sem `&&`, `||`, `grep`, `head`, `sed`; encadear com `if ($LASTEXITCODE -eq 0) { … }`.
- GitHub: `--repo codingB0y/Girumo`, base `main`; corpo do PR em pt-BR terminando em `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Quadro: card `postar-por-grupo` em `public.board_features` de **prod**, área `Grupos`.
- Do DDL ao merge, sem parar: com a DDL em dev e a baseline velha na `main`, o job `drift` de **todo** PR aberto fica vermelho.

## Review Focus

Os cinco modos de falha mais prováveis que nenhum teste do spec §8 cobre — cada um ganhou um teste na task dona:

1. **Corpo de prod diferente do repo.** `app.enqueue_broadcast` (30/07) e `app.promote_due_schedules` (30/09) foram aplicados à mão; se prod tiver uma correção que o repo não tem, o `create or replace` a apaga, e o gate de drift não vê corpo de função. Teste: trava no bloco 0 da migração (Task 4, Step 1); constantes da trava recalculadas do repo e diff "uma troca só" (Task 4, Step 2); md5 em dev (Task 2); trava rodada em prod **antes** de qualquer DDL (Task 10, Step 2).
2. **Vazamento entre lojas.** O service-role ignora RLS: um `tenant_id` esquecido em `estados_da_campanha`, no `join` do aviso ou em `marcar`/`reabrir` mistura lojas — e o mesmo JID existe em lojas diferentes. Teste: bloco 6 do check (Task 3).
3. **Upsert do sync.** O PostgREST grava `insert … on conflict do update`; o `before insert` roda na linha proposta. Se a marca do insert (com `aviso_lotou_em`) vazasse para a linha existente, o grupo que cruza pelo sync nunca receberia o aviso ao lotar. Teste: bloco 4 do check (Task 3).
4. **Grupo em duas campanhas (conflito legado de D4).** O `join` ingênuo do spec §5.6 gera um aviso por campanha — dois avisos no mesmo grupo, contra D10. Teste: bloco 9 do check (Task 3).
5. **Oferta Relâmpago escutando grupo que não recebeu a mensagem.** Com regra, a cópia antiga do predicado (`group_ids` vazio = todos os admin) abriria a oferta também no grupo que está enchendo. Teste: bloco 8 do check (Task 3).

---

### Task 1: branch, defasagem e "ninguém fez isto ainda"

**Files:** nenhum arquivo do repo.

**Interfaces:**
- Consumes: nada.
- Produces: o worktree da sessão na branch `feat/postar-grupo-banco` = `origin/main`, sem upstream, com `node_modules`; o caminho `WT` impresso (vai literal nos blocos do Igor da Task 10).

- [ ] **Step 1: onde estou.**

```bash
WT="$(git rev-parse --show-toplevel)"; echo "WT=$WT"; git -C "$WT" status --short; git -C "$WT" branch --show-current
```

Anote o `WT`. O `status` só pode listar arquivos não rastreados de `docs/` (planos); qualquer `M`/`A` é trabalho de outra sessão: pare e pergunte ao Igor.

- [ ] **Step 2: branch a partir de `origin/main`.**

```bash
WT="$(git rev-parse --show-toplevel)"; git -C "$WT" fetch origin --prune
```
```bash
WT="$(git rev-parse --show-toplevel)"; git -C "$WT" switch -c feat/postar-grupo-banco origin/main
```
```bash
WT="$(git rev-parse --show-toplevel)"; git -C "$WT" branch --unset-upstream
```

O `switch -c … origin/main` liga a branch a `origin/main` como upstream; sem o `--unset-upstream`, um `git push` sem argumentos iria para a `main`.

- [ ] **Step 3: defasagem** (regra de PR do `CLAUDE.md`).

```bash
WT="$(git rev-parse --show-toplevel)"; git -C "$WT" log HEAD..origin/main --oneline | wc -l
```

Esperado: `0`.

- [ ] **Step 4: ninguém está nisto** (`CLAUDE.md`: em 30/07 uma migração foi reescrita à toa porque já existia numa branch).

```bash
WT="$(git rev-parse --show-toplevel)"; gh pr list --repo codingB0y/Girumo --state open --limit 50 --json number,title,headRefName; git -C "$WT" ls-remote --heads origin feat/postar-grupo-banco
```
```bash
WT="$(git rev-parse --show-toplevel)"; for s in lotado_em target_rule aviso_ao_lotar alvos_do_disparo campaign_group_states; do echo "== $s"; git -C "$WT" log --remotes=origin --oneline -S "$s" -- apps/web/supabase deploy/supabase infra/tests; done
```

Esperado: nenhum PR aberto com título/branch de lotado, destino, aviso ou grupos por campanha; `ls-remote` vazio; os cinco `log -S` vazios. Se aparecer algo: `git -C "$WT" diff origin/main...origin/<branch> --stat` e pare para perguntar ao Igor.

- [ ] **Step 5: dependências.** Na ferramenta PowerShell:

```powershell
$WT = (git rev-parse --show-toplevel); Test-Path "$WT/apps/web/node_modules/next"; Test-Path "$WT/node_modules/tsx"; Test-Path "$WT/apps/worker/node_modules"
```

Se algum for `False` (o `node_modules` do checkout principal vive vazio desde 05/10 — `finding-worktree-node-modules-junction`):

```powershell
$WT = (git rev-parse --show-toplevel); Set-Location $WT; npm ci --no-audit --no-fund
```

`npm ci` na raiz (e não só `apps/web`): o `verify-local.ps1` roda os testes do worker e da engine.

### Task 2: conferir o banco de dev antes (só leitura)

**Files:** nenhum arquivo do repo (cria `C:/Users/Igor/AppData/Local/Temp/postar-grupo-precheck.sql`).

**Interfaces:**
- Consumes: o branch da Task 1.
- Produces: a resposta "nenhum objeto do PR existe em dev" e o md5 normalizado dos dois corpos que a migração reescreve — pré-condição do Step 1 da Task 4 (se o md5 de dev for outro, a Task 4 usa o corpo de dev).

- [ ] **Step 1: escrever a conferência** com a ferramenta Write em `C:/Users/Igor/AppData/Local/Temp/postar-grupo-precheck.sql`:

```sql
-- Conferência ANTES da migração 20261010120000 (postar por grupo, PR 1). Só leitura.
-- Esperado em 10/10: colunas_ja_existentes e funcoes_ja_existentes = null; trigger_ja_existe =
-- false; acoes_bulk com as 6 ações de 20260917010000; md5_corpos =
--   app.enqueue_broadcast(uuid,uuid)   -> 08f4dc83041dc0a0d6f420f7cfcd194d
--   app.promote_due_schedules(integer) -> f40fce2ab7b70328e1f3bf6c701bd0bf
-- (md5 do prosrc com todo espaço em branco reduzido a um: CRLF/LF e indentação não contam).
select json_build_object(
  'colunas_ja_existentes', (
    select json_agg(c.table_name || '.' || c.column_name)
    from information_schema.columns c
    where c.table_schema = 'public'
      and (c.table_name::text, c.column_name::text) in (
        ('groups', 'lotado_em'), ('groups', 'lotado_por'), ('groups', 'reaberto_em'),
        ('groups', 'aviso_lotou_em'), ('campaign_groups', 'aviso_ao_lotar'),
        ('campaign_groups', 'aviso_ao_lotar_desde'), ('broadcasts', 'target_rule'),
        ('group_bulk_jobs', 'subject'))),
  'funcoes_ja_existentes', (
    select json_agg(p.oid::regprocedure::text)
    from pg_proc p
    where p.proname in ('limiar_lotado', 'grupo_na_regra', 'estados_da_campanha', 'alvos_da_regra',
                        'alvos_do_disparo', 'groups_marca_lotado', 'campaign_group_states',
                        'marcar_grupo_lotado', 'reabrir_grupo', 'enviar_avisos_lotou')),
  'trigger_ja_existe', exists (select 1 from pg_trigger where tgname = 'groups_marca_lotado'),
  'acoes_bulk', (
    select pg_get_constraintdef(oid) from pg_constraint
    where conrelid = 'public.group_bulk_jobs'::regclass and conname = 'group_bulk_jobs_action_check'),
  'md5_corpos', (
    select json_object_agg(f.sig, md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))))
    from (values ('app.enqueue_broadcast(uuid,uuid)'), ('app.promote_due_schedules(integer)')) as f(sig)
    left join pg_proc p on p.oid = to_regprocedure(f.sig)),
  'cheios_sem_marca', (
    select count(*) from public.groups
    where members >= (case when capacity > 0 then capacity else 1024 end) * 0.95)
) as r;
```

- [ ] **Step 2: rodar em dev** (leitura em dev passa no classificador desde 03/10):

```bash
WT="$(git rev-parse --show-toplevel)"; cd "$WT/apps/web" && supabase link --project-ref wfjuwogxaupyadwhvoxy --yes && supabase db query --linked -o json -f "C:/Users/Igor/AppData/Local/Temp/postar-grupo-precheck.sql"
```

Se o classificador negar, **não** tente por outra ferramenta: siga para a Task 3. A trava da migração (bloco 0) faz a mesma conferência em cada banco antes de mudar qualquer coisa, e o Igor a roda em prod antes de tudo (Task 10, Step 2).

- [ ] **Step 3: decidir.** Compare com o "Esperado" do cabeçalho:
  - algum objeto já existe → pare e mostre a saída ao Igor (`add column if not exists` pularia em silêncio uma coluna com outro tipo);
  - `acoes_bulk` com ação além das 6 → a CHECK da Task 4 precisa incluí-la: acrescente-a ao `array[...]` do Step 1 da Task 4 e ao bloco 2 do check (Task 3);
  - `md5_corpos` diferente → vale o Step 3 da Task 4 (corpo de dev);
  - anote `cheios_sem_marca` (quantos grupos o backfill vai marcar em dev) para o corpo do PR.

### Task 3: o SQL de conferência (RED)

**Files:**
- Create: `infra/tests/postar-por-grupo-check.sql`

**Interfaces:**
- Consumes (criados na Task 4, nomes do contrato §1):
  - colunas `groups.lotado_em timestamptz`, `groups.lotado_por text`, `groups.reaberto_em timestamptz`, `groups.aviso_lotou_em timestamptz`, `campaign_groups.aviso_ao_lotar text`, `campaign_groups.aviso_ao_lotar_desde timestamptz`, `broadcasts.target_rule text`, `group_bulk_jobs.subject text`; índice `groups_aviso_lotou_pendente_idx`; trigger `groups_marca_lotado`
  - `app.limiar_lotado(integer) returns numeric`, `app.grupo_na_regra(text, boolean, text) returns boolean`, `app.estados_da_campanha(uuid, uuid)`, `app.alvos_da_regra(uuid, uuid, text) returns text[]`, `app.alvos_do_disparo(public.broadcasts) returns text[]`, `app.groups_marca_lotado() returns trigger`
  - `public.campaign_group_states(p_tenant uuid, p_campaign uuid)` (linha `EstadoRow`), `public.marcar_grupo_lotado(p_tenant uuid, p_group uuid) returns text`, `public.reabrir_grupo(p_tenant uuid, p_group uuid) returns text`, `public.enviar_avisos_lotou(p_limit integer default 20) returns integer`
  - já existentes: `app.enqueue_broadcast(uuid, uuid) returns public.broadcasts`, `app.promote_due_schedules(integer) returns integer`
- Produces: o teste de aceitação do PR — o Igor roda nos dois bancos depois da migração (Task 10). Exit 0 = tudo passou; qualquer regra quebrada termina em erro `FALHOU <caso>: …`.

- [ ] **Step 1: escrever o arquivo** `infra/tests/postar-por-grupo-check.sql`:

```sql
-- Conferência do PR 1 do postar por grupo (migração 20261010120000_postar_por_grupo.sql), nos DOIS
-- bancos, depois de aplicar. Uma transação que termina em ROLLBACK: monta duas lojas descartáveis
-- (ids fixos c0c0c0c0-…), prova cada regra e desfaz tudo.
--   cd apps\web
--   supabase link --project-ref <ref> --yes   # dev wfjuwogxaupyadwhvoxy / prod nidoatbxaylrkcgbszns
--   supabase db query --linked -f ..\..\infra\tests\postar-por-grupo-check.sql
--
-- Esperado: termina sem erro (exit 0). Cada bloco levanta 'FALHOU <caso>: ...' quando a regra quebra.
-- "column ... does not exist" / "function ... does not exist" = a migração não foi aplicada aqui.
--
-- Spec docs/superpowers/specs/2026-10-10-postar-por-grupo-design.md §8 (lista de testes SQL) e
-- os cinco modos de falha do "Review Focus" do plano do PR 1.
--
-- Lê dado real em um ponto só (bloco 1: nenhum grupo cheio sem marca, a prova do backfill).
-- app.promote_due_schedules e public.enviar_avisos_lotou varrem TODAS as lojas: o que fizerem com
-- linhas reais também é desfeito pelo rollback, e os asserts olham só as lojas de teste.
--
-- Existe porque o gate de drift não vê schema app, CHECK, índice, trigger, ACL nem corpo de função.
-- O executor do plano não roda isto (escreve, mesmo com rollback): é do Igor.

begin;

-- Lojas de teste, recriadas no começo de cada bloco (cada bloco é independente).
create or replace function pg_temp.postar_fixture() returns void
language plpgsql as $fx$
declare
  v_a constant uuid := 'c0c0c0c0-0000-4000-8000-00000000000a';
  v_b constant uuid := 'c0c0c0c0-0000-4000-8000-00000000000b';
begin
  -- Leva junto grupos, campanhas, disparos, comandos, agendamentos e ofertas (on delete cascade).
  delete from public.organizations where id in (v_a, v_b);

  insert into public.organizations (id, tenant_id, name, slug) values
    (v_a, v_a, 'Check postar por grupo A', 'check-postar-por-grupo-a'),
    (v_b, v_b, 'Check postar por grupo B', 'check-postar-por-grupo-b');

  insert into public.instances (id, tenant_id, name, status, provider_instance_id, connected_at)
  values ('c0c0c0c0-0000-4000-8000-0000000000a1', v_a, 'principal', 'connected',
          'check-postar-por-grupo', now());

  -- Capacidade 100 => limiar 95. Pool da Campanha A, nesta ordem:
  --   a 50, admin, convite          -> enchendo (o primeiro disponível)
  --   b 40, admin, convite          -> fila
  --   c 96, admin, convite          -> lotado (nasce cheio: marca E aviso já dado)
  --   d  1, admin, convite, 1 nosso -> vazio
  --   e 30, NÃO admin               -> fila, fora de toda regra
  --   f 20, admin, SEM convite      -> fila (não recebe gente pelo link, recebe post)
  --   x sem linha em groups         -> não aparece; c repetido no fim -> vale a posição 3
  insert into public.groups
    (id, tenant_id, whatsapp_group_id, name, members, capacity, is_admin, invite_url, admins_ours)
  values
    ('c0c0c0c0-0000-4000-8000-0000000000aa', v_a, 'pg-a@g.us', 'Grupo A', 50, 100, true,  'https://chat.whatsapp.com/PgA', 1),
    ('c0c0c0c0-0000-4000-8000-0000000000ab', v_a, 'pg-b@g.us', 'Grupo B', 40, 100, true,  'https://chat.whatsapp.com/PgB', 1),
    ('c0c0c0c0-0000-4000-8000-0000000000ac', v_a, 'pg-c@g.us', 'Grupo C', 96, 100, true,  'https://chat.whatsapp.com/PgC', 1),
    ('c0c0c0c0-0000-4000-8000-0000000000ad', v_a, 'pg-d@g.us', 'Grupo D',  1, 100, true,  'https://chat.whatsapp.com/PgD', 1),
    ('c0c0c0c0-0000-4000-8000-0000000000ae', v_a, 'pg-e@g.us', 'Grupo E', 30, 100, false, 'https://chat.whatsapp.com/PgE', 0),
    ('c0c0c0c0-0000-4000-8000-0000000000af', v_a, 'pg-f@g.us', 'Grupo F', 20, 100, true,  null, 1),
    -- O MESMO JID de a, na loja B: 99 membros, não-admin. Não pode contaminar a loja A.
    ('c0c0c0c0-0000-4000-8000-0000000000ba', v_b, 'pg-a@g.us', 'Alheio',  99, 100, false, 'https://chat.whatsapp.com/PgX', 0);

  -- A2 repete pg-a de propósito: é o conflito legado de D4 (grupo em duas campanhas da loja).
  -- Depois do PR 6, o trigger campaign_groups_grupo_exclusivo recusa este insert: quem rodar este
  -- check depois dele desliga o trigger dentro da transação antes (plano do PR 6).
  insert into public.campaign_groups (id, tenant_id, name, slug, group_ids) values
    ('c0c0c0c0-0000-4000-8000-0000000000c1', v_a, 'Campanha A', 'check-postar-a',
     array['pg-a@g.us', 'pg-b@g.us', 'pg-c@g.us', 'pg-d@g.us', 'pg-e@g.us', 'pg-f@g.us', 'pg-x@g.us', 'pg-c@g.us']),
    ('c0c0c0c0-0000-4000-8000-0000000000c2', v_a, 'Campanha A2', 'check-postar-a2', array['pg-a@g.us']),
    ('c0c0c0c0-0000-4000-8000-0000000000c3', v_b, 'Campanha B', 'check-postar-b', array['pg-a@g.us']);
end;
$fx$;

-- "pg-a=enchendo,pg-b=fila,..." na ordem do pool, lido pela RPC pública.
create or replace function pg_temp.estados(p_tenant uuid, p_campanha uuid) returns text
language sql as $fx$
  select string_agg(replace(e.whatsapp_group_id, '@g.us', '') || '=' || e.estado, ',' order by e.posicao)
  from public.campaign_group_states(p_tenant, p_campanha) as e;
$fx$;

-- JIDs que o run ATUAL de um disparo enfileirou, em ordem.
create or replace function pg_temp.jids_do_run(p_tenant uuid, p_broadcast uuid) returns text
language sql as $fx$
  select string_agg(c.payload ->> 'jid', ',' order by c.payload ->> 'jid')
  from public.engine_commands c
  join public.broadcasts b
    on b.tenant_id = c.tenant_id and b.id = c.origin_id and b.run_id = c.origin_run_id
  where c.tenant_id = p_tenant and c.origin_id = p_broadcast;
$fx$;

-- 1) Estrutura, privilégio e o backfill (só leitura).
do $$
declare
  v_c record;
  v_f record;
begin
  for v_c in
    select t.tabela, t.coluna, t.tipo
    from (values
      ('public.groups', 'lotado_em', 'timestamp with time zone'),
      ('public.groups', 'lotado_por', 'text'),
      ('public.groups', 'reaberto_em', 'timestamp with time zone'),
      ('public.groups', 'aviso_lotou_em', 'timestamp with time zone'),
      ('public.campaign_groups', 'aviso_ao_lotar', 'text'),
      ('public.campaign_groups', 'aviso_ao_lotar_desde', 'timestamp with time zone'),
      ('public.broadcasts', 'target_rule', 'text'),
      ('public.group_bulk_jobs', 'subject', 'text')
    ) as t(tabela, coluna, tipo)
  loop
    if not exists (
      select 1 from pg_attribute a
      where a.attrelid = v_c.tabela::regclass
        and a.attname = v_c.coluna
        and not a.attisdropped
        and not a.attnotnull
        and format_type(a.atttypid, a.atttypmod) = v_c.tipo
    ) then
      raise exception 'FALHOU coluna %.%: esperava % aceitando nulo', v_c.tabela, v_c.coluna, v_c.tipo;
    end if;
  end loop;

  if to_regclass('public.groups_aviso_lotou_pendente_idx') is null then
    raise exception 'FALHOU índice groups_aviso_lotou_pendente_idx ausente';
  end if;

  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.groups'::regclass
      and t.tgname = 'groups_marca_lotado'
      and t.tgfoid = to_regprocedure('app.groups_marca_lotado()')
      and t.tgenabled <> 'D'
  ) then
    raise exception 'FALHOU trigger groups_marca_lotado ausente ou desligado';
  end if;

  -- Toda função que a migração cria ou reescreve, mais os dois wrappers públicos que chamam as
  -- reescritas: search_path fixo, definer onde deve, execute só service_role.
  for v_f in
    select f.sig, f.definer, p.oid, p.prosecdef, p.proconfig
    from (values
      ('public.campaign_group_states(uuid,uuid)', true),
      ('public.marcar_grupo_lotado(uuid,uuid)', true),
      ('public.reabrir_grupo(uuid,uuid)', true),
      ('public.enviar_avisos_lotou(integer)', true),
      ('public.enqueue_broadcast(uuid,uuid)', true),
      ('public.promote_due_schedules(integer)', true),
      ('app.enqueue_broadcast(uuid,uuid)', true),
      ('app.promote_due_schedules(integer)', true),
      ('app.groups_marca_lotado()', true),
      ('app.limiar_lotado(integer)', false),
      ('app.grupo_na_regra(text,boolean,text)', false),
      ('app.estados_da_campanha(uuid,uuid)', false),
      ('app.alvos_da_regra(uuid,uuid,text)', false),
      ('app.alvos_do_disparo(public.broadcasts)', false)
    ) as f(sig, definer)
    left join pg_proc p on p.oid = to_regprocedure(f.sig)
  loop
    if v_f.oid is null then
      raise exception 'FALHOU função ausente: %', v_f.sig;
    end if;
    if v_f.prosecdef is distinct from v_f.definer then
      raise exception 'FALHOU %: security definer = %, esperava %', v_f.sig, v_f.prosecdef, v_f.definer;
    end if;
    if not exists (select 1 from unnest(v_f.proconfig) as c(cfg) where c.cfg like 'search_path=%') then
      raise exception 'FALHOU %: sem set search_path', v_f.sig;
    end if;
    if has_function_privilege('anon', v_f.oid, 'EXECUTE')
       or has_function_privilege('authenticated', v_f.oid, 'EXECUTE')
       or not has_function_privilege('service_role', v_f.oid, 'EXECUTE') then
      raise exception 'FALHOU privilégio de %: anon=% authenticated=% service_role=%', v_f.sig,
        has_function_privilege('anon', v_f.oid, 'EXECUTE'),
        has_function_privilege('authenticated', v_f.oid, 'EXECUTE'),
        has_function_privilege('service_role', v_f.oid, 'EXECUTE');
    end if;
  end loop;

  -- Backfill (dado real): nenhum grupo cheio sem marca, e marca sempre com autor.
  if exists (select 1 from public.groups g
             where g.lotado_em is null and g.members >= app.limiar_lotado(g.capacity)) then
    raise exception 'FALHOU backfill: há grupo com members >= 95%% da capacidade sem lotado_em';
  end if;
  if exists (select 1 from public.groups g where (g.lotado_em is null) <> (g.lotado_por is null)) then
    raise exception 'FALHOU marca: lotado_em e lotado_por desencontrados';
  end if;
end $$;

-- 2) Nasce cheio, estados na ordem do pool, as três regras, limiar e os CHECKs.
do $$
declare
  v_a constant uuid := 'c0c0c0c0-0000-4000-8000-00000000000a';
  v_camp constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000c1';
  v_got text;
begin
  perform pg_temp.postar_fixture();

  -- Grupo descoberto já cheio não "acabou de lotar": marca automática e aviso já dado (§5.3).
  if not exists (
    select 1 from public.groups
    where tenant_id = v_a and whatsapp_group_id = 'pg-c@g.us'
      and lotado_em is not null and lotado_por = 'auto'
      and aviso_lotou_em is not null and reaberto_em is null
  ) then
    raise exception 'FALHOU nasce cheio: pg-c deveria vir lotado (auto) com aviso_lotou_em';
  end if;

  -- Ordem do pool; JID repetido vale a menor posição; JID sem linha não aparece; um enchendo só.
  v_got := pg_temp.estados(v_a, v_camp);
  if v_got is distinct from 'pg-a=enchendo,pg-b=fila,pg-c=lotado,pg-d=vazio,pg-e=fila,pg-f=fila' then
    raise exception 'FALHOU estados: %', v_got;
  end if;
  select string_agg(e.posicao::text, ',' order by e.posicao) into v_got
  from public.campaign_group_states(v_a, v_camp) as e;
  if v_got is distinct from '1,2,3,4,5,6' then
    raise exception 'FALHOU posicao: %', v_got;
  end if;

  -- As três regras exigem admin; vazio (d) e não-admin (e) ficam fora de todas. Ordem do pool.
  if app.alvos_da_regra(v_a, v_camp, 'menos_enchendo') is distinct from array['pg-b@g.us', 'pg-c@g.us', 'pg-f@g.us'] then
    raise exception 'FALHOU menos_enchendo: %', app.alvos_da_regra(v_a, v_camp, 'menos_enchendo');
  end if;
  if app.alvos_da_regra(v_a, v_camp, 'lotados') is distinct from array['pg-c@g.us'] then
    raise exception 'FALHOU lotados: %', app.alvos_da_regra(v_a, v_camp, 'lotados');
  end if;
  if app.alvos_da_regra(v_a, v_camp, 'com_gente') is distinct from array['pg-a@g.us', 'pg-b@g.us', 'pg-c@g.us', 'pg-f@g.us'] then
    raise exception 'FALHOU com_gente: %', app.alvos_da_regra(v_a, v_camp, 'com_gente');
  end if;
  if app.alvos_da_regra(v_a, v_camp, 'todos') is distinct from '{}'::text[] then
    raise exception 'FALHOU regra desconhecida deveria dar zero grupos';
  end if;

  -- As colunas na_regra_* da RPC dizem o mesmo (as duas leem app.grupo_na_regra).
  select string_agg(replace(e.whatsapp_group_id, '@g.us', '') || ':'
           || e.na_regra_menos_enchendo::int || e.na_regra_lotados::int || e.na_regra_com_gente::int,
           ',' order by e.posicao)
    into v_got
  from public.campaign_group_states(v_a, v_camp) as e;
  if v_got is distinct from 'pg-a:001,pg-b:101,pg-c:111,pg-d:000,pg-e:000,pg-f:101' then
    raise exception 'FALHOU na_regra: %', v_got;
  end if;

  -- pode_reabrir: só lotado abaixo do limiar. c tem 96 de 100.
  if (select e.pode_reabrir from public.campaign_group_states(v_a, v_camp) as e
      where e.whatsapp_group_id = 'pg-c@g.us') then
    raise exception 'FALHOU pode_reabrir: pg-c com 96 de 100 não pode reabrir';
  end if;

  -- Limiar: 95% da capacidade; capacidade 0 ou nula vale 1024.
  if app.limiar_lotado(100) <> 95 or app.limiar_lotado(0) <> 972.8 or app.limiar_lotado(null) <> 972.8 then
    raise exception 'FALHOU limiar: % % %', app.limiar_lotado(100), app.limiar_lotado(0), app.limiar_lotado(null);
  end if;

  -- CHECKs (o gate não vê): valor fora da lista é recusado; set_subject e as seis ações antigas passam.
  begin
    update public.groups set lotado_por = 'outro' where tenant_id = v_a and whatsapp_group_id = 'pg-c@g.us';
    raise exception 'FALHOU check lotado_por: aceitou ''outro''';
  exception when check_violation then null;
  end;
  begin
    insert into public.broadcasts (tenant_id, name, target_rule) values (v_a, 'check', 'todos');
    raise exception 'FALHOU check target_rule: aceitou ''todos''';
  exception when check_violation then null;
  end;
  insert into public.group_bulk_jobs
    (tenant_id, campaign_group_id, batch_id, action, group_id, whatsapp_group_id, subject)
  select v_a, v_camp, 'c0c0c0c0-0000-4000-8000-0000000000e1', a.acao,
         'c0c0c0c0-0000-4000-8000-0000000000aa', 'pg-a@g.us',
         case when a.acao = 'set_subject' then 'Grupo 1' end
  from unnest(array['set_description', 'set_picture', 'open', 'close', 'check_invite',
                    'remove_participant', 'set_subject']) as a(acao);
  begin
    insert into public.group_bulk_jobs
      (tenant_id, campaign_group_id, batch_id, action, group_id, whatsapp_group_id)
    values (v_a, v_camp, 'c0c0c0c0-0000-4000-8000-0000000000e2', 'renomear',
            'c0c0c0c0-0000-4000-8000-0000000000aa', 'pg-a@g.us');
    raise exception 'FALHOU check action: aceitou ''renomear''';
  exception when check_violation then null;
  end;
end $$;

-- 3) Cruzar subindo e descendo (também pela capacidade), reabrir e marcar à mão.
do $$
declare
  v_a constant uuid := 'c0c0c0c0-0000-4000-8000-00000000000a';
  v_camp constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000c1';
  v_g_a constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000aa';
  v_g_b constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000ab';
  v_g_c constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000ac';
  v_g_f constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000af';
  v_g public.groups;
  v_r text;
begin
  perform pg_temp.postar_fixture();
  -- Dentro de uma transação now() não anda: c "lotou anteontem" para a data provar que não mudou.
  update public.groups set lotado_em = now() - interval '2 days' where tenant_id = v_a and id = v_g_c;

  -- Sobe: b vai de 40 a 95 (o limiar exato) -> lotado automático, aviso ainda não dado.
  update public.groups set members = 95 where tenant_id = v_a and id = v_g_b;
  select * into v_g from public.groups where tenant_id = v_a and id = v_g_b;
  if v_g.lotado_em is null or v_g.lotado_por is distinct from 'auto'
     or v_g.aviso_lotou_em is not null or v_g.reaberto_em is not null then
    raise exception 'FALHOU cruzar subindo: lotado_em=% lotado_por=% aviso_lotou_em=% reaberto_em=%',
      v_g.lotado_em, v_g.lotado_por, v_g.aviso_lotou_em, v_g.reaberto_em;
  end if;

  -- 94 de 100 não cruza.
  update public.groups set members = 94 where tenant_id = v_a and id = v_g_a;
  if (select lotado_em from public.groups where tenant_id = v_a and id = v_g_a) is not null then
    raise exception 'FALHOU limiar: 94 de 100 marcou lotado';
  end if;

  -- Desce: c (96) cai para 90 -> continua lotado, com a MESMA data (D1); agora pode reabrir.
  update public.groups set members = 90 where tenant_id = v_a and id = v_g_c;
  select * into v_g from public.groups where tenant_id = v_a and id = v_g_c;
  if v_g.lotado_em is distinct from now() - interval '2 days' or v_g.lotado_por is distinct from 'auto' then
    raise exception 'FALHOU cruzar descendo: lotado_em=% lotado_por=%', v_g.lotado_em, v_g.lotado_por;
  end if;
  if not (select e.pode_reabrir from public.campaign_group_states(v_a, v_camp) as e where e.group_id = v_g_c) then
    raise exception 'FALHOU pode_reabrir: pg-c com 90 de 100 deveria poder reabrir';
  end if;

  -- A capacidade também cruza: f (20 de 100) passa a ter capacidade 20 (limiar 19).
  update public.groups set capacity = 20 where tenant_id = v_a and id = v_g_f;
  if (select lotado_por from public.groups where tenant_id = v_a and id = v_g_f) is distinct from 'auto' then
    raise exception 'FALHOU cruzar pela capacidade';
  end if;

  -- Reabrir bloqueado: b está em 95 -> ainda_cheio, nada muda.
  v_r := public.reabrir_grupo(v_a, v_g_b);
  if v_r is distinct from 'ainda_cheio'
     or (select lotado_em from public.groups where tenant_id = v_a and id = v_g_b) is null then
    raise exception 'FALHOU reabrir cheio: %', v_r;
  end if;

  -- Reabrir liberado: c em 90 -> ok; marca limpa, reaberto_em gravado.
  v_r := public.reabrir_grupo(v_a, v_g_c);
  select * into v_g from public.groups where tenant_id = v_a and id = v_g_c;
  if v_r is distinct from 'ok' or v_g.lotado_em is not null or v_g.lotado_por is not null
     or v_g.reaberto_em is null then
    raise exception 'FALHOU reabrir: % lotado_em=% reaberto_em=%', v_r, v_g.lotado_em, v_g.reaberto_em;
  end if;
  if public.reabrir_grupo(v_a, v_g_c) is distinct from 'nao_lotado' then
    raise exception 'FALHOU reabrir de novo: esperava nao_lotado';
  end if;

  -- Marcar à mão: a -> ok (manual, sem aviso dado); de novo -> ja_lotado.
  if public.marcar_grupo_lotado(v_a, v_g_a) is distinct from 'ok' then
    raise exception 'FALHOU marcar a';
  end if;
  select * into v_g from public.groups where tenant_id = v_a and id = v_g_a;
  if v_g.lotado_em is null or v_g.lotado_por is distinct from 'manual' or v_g.aviso_lotou_em is not null then
    raise exception 'FALHOU marcar: lotado_em=% lotado_por=% aviso_lotou_em=%',
      v_g.lotado_em, v_g.lotado_por, v_g.aviso_lotou_em;
  end if;
  if public.marcar_grupo_lotado(v_a, v_g_a) is distinct from 'ja_lotado' then
    raise exception 'FALHOU marcar de novo: esperava ja_lotado';
  end if;

  -- Marcar o reaberto (c) limpa reaberto_em.
  if public.marcar_grupo_lotado(v_a, v_g_c) is distinct from 'ok'
     or (select reaberto_em from public.groups where tenant_id = v_a and id = v_g_c) is not null then
    raise exception 'FALHOU marcar o reaberto: reaberto_em deveria limpar';
  end if;
end $$;

-- 4) O sync grava por upsert do PostgREST (insert ... on conflict do update). O before insert
--    roda na linha proposta e não pode vazar para a existente; quem cruza é o before update.
do $$
declare
  v_a constant uuid := 'c0c0c0c0-0000-4000-8000-00000000000a';
  v_g_b constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000ab';
  v_g_c constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000ac';
begin
  perform pg_temp.postar_fixture();
  update public.groups set lotado_em = now() - interval '2 days' where tenant_id = v_a and id = v_g_c;

  insert into public.groups (tenant_id, whatsapp_group_id, name, members, capacity, is_admin)
  values
    (v_a, 'pg-b@g.us', 'Grupo B', 97, 100, true),
    (v_a, 'pg-c@g.us', 'Grupo C', 98, 100, true),
    (v_a, 'pg-novo@g.us', 'Grupo novo', 99, 100, true)
  on conflict (tenant_id, whatsapp_group_id)
  do update set members = excluded.members, name = excluded.name, is_admin = excluded.is_admin;

  -- b existia com 40 e cruzou: lotado automático SEM aviso dado (vai receber o aviso ao lotar).
  if not exists (
    select 1 from public.groups
    where tenant_id = v_a and id = v_g_b
      and lotado_em is not null and lotado_por = 'auto' and aviso_lotou_em is null
  ) then
    raise exception 'FALHOU upsert: pg-b deveria lotar sem aviso_lotou_em';
  end if;
  -- c já estava lotado: a marca não muda.
  if (select lotado_em from public.groups where tenant_id = v_a and id = v_g_c)
     is distinct from now() - interval '2 days' then
    raise exception 'FALHOU upsert: a marca de pg-c mudou';
  end if;
  -- O novo nasceu cheio: lotado e aviso já dado.
  if not exists (
    select 1 from public.groups
    where tenant_id = v_a and whatsapp_group_id = 'pg-novo@g.us'
      and lotado_por = 'auto' and aviso_lotou_em is not null
  ) then
    raise exception 'FALHOU upsert: pg-novo deveria nascer lotado com aviso_lotou_em';
  end if;
end $$;

-- 5) Prioridade do reaberto (D3): enche antes da sequência; dois reabertos, o de menor posição;
--    quando lota de novo, perde a prioridade e o link volta à sequência.
do $$
declare
  v_a constant uuid := 'c0c0c0c0-0000-4000-8000-00000000000a';
  v_camp constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000c1';
  v_g_b constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000ab';
  v_g_c constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000ac';
  v_got text;
begin
  perform pg_temp.postar_fixture();

  -- c (posição 3) cai para 90 e é reaberto: passa na frente de a (posição 1).
  update public.groups set members = 90 where tenant_id = v_a and id = v_g_c;
  if public.reabrir_grupo(v_a, v_g_c) is distinct from 'ok' then
    raise exception 'FALHOU prioridade: reabrir c';
  end if;
  v_got := pg_temp.estados(v_a, v_camp);
  if v_got is distinct from 'pg-a=fila,pg-b=fila,pg-c=enchendo,pg-d=vazio,pg-e=fila,pg-f=fila' then
    raise exception 'FALHOU prioridade (um reaberto): %', v_got;
  end if;

  -- b (posição 2) marcado e reaberto: dois reabertos, enche o de menor posição.
  if public.marcar_grupo_lotado(v_a, v_g_b) is distinct from 'ok'
     or public.reabrir_grupo(v_a, v_g_b) is distinct from 'ok' then
    raise exception 'FALHOU prioridade: marcar/reabrir b';
  end if;
  v_got := pg_temp.estados(v_a, v_camp);
  if v_got is distinct from 'pg-a=fila,pg-b=enchendo,pg-c=fila,pg-d=vazio,pg-e=fila,pg-f=fila' then
    raise exception 'FALHOU prioridade (dois reabertos): %', v_got;
  end if;

  -- b lota de novo: o trigger marca e limpa reaberto_em; c volta a encher.
  update public.groups set members = 96 where tenant_id = v_a and id = v_g_b;
  if (select reaberto_em from public.groups where tenant_id = v_a and id = v_g_b) is not null then
    raise exception 'FALHOU prioridade: reaberto_em de b não limpou ao lotar';
  end if;
  v_got := pg_temp.estados(v_a, v_camp);
  if v_got is distinct from 'pg-a=fila,pg-b=lotado,pg-c=enchendo,pg-d=vazio,pg-e=fila,pg-f=fila' then
    raise exception 'FALHOU prioridade (b relotou): %', v_got;
  end if;

  -- c lota: o link volta à sequência (a).
  update public.groups set members = 96 where tenant_id = v_a and id = v_g_c;
  v_got := pg_temp.estados(v_a, v_camp);
  if v_got is distinct from 'pg-a=enchendo,pg-b=lotado,pg-c=lotado,pg-d=vazio,pg-e=fila,pg-f=fila' then
    raise exception 'FALHOU prioridade (volta à sequência): %', v_got;
  end if;
end $$;

-- 6) Outra loja: campanha lida com o tenant errado, o mesmo JID em duas lojas, marcar e reabrir
--    com o tenant errado. O service-role ignora RLS: o filtro de tenant É a proteção.
do $$
declare
  v_a constant uuid := 'c0c0c0c0-0000-4000-8000-00000000000a';
  v_b constant uuid := 'c0c0c0c0-0000-4000-8000-00000000000b';
  v_camp constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000c1';
  v_camp_b constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000c3';
  v_g_a constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000aa';
  v_g_c constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000ac';
begin
  perform pg_temp.postar_fixture();

  if exists (select 1 from public.campaign_group_states(v_a, v_camp_b))
     or exists (select 1 from public.campaign_group_states(v_b, v_camp)) then
    raise exception 'FALHOU tenant: campanha lida com o tenant da outra loja';
  end if;

  -- O pg-a da loja B (99, não-admin) não contamina o da A.
  if (select e.members || ':' || e.estado from public.campaign_group_states(v_a, v_camp) as e
      where e.whatsapp_group_id = 'pg-a@g.us') is distinct from '50:enchendo' then
    raise exception 'FALHOU tenant: pg-a da loja A leu dado da loja B';
  end if;
  -- Na B, o pg-a dela: lotado (nasceu com 99) e fora das regras (não-admin).
  if pg_temp.estados(v_b, v_camp_b) is distinct from 'pg-a=lotado'
     or app.alvos_da_regra(v_b, v_camp_b, 'com_gente') is distinct from '{}'::text[] then
    raise exception 'FALHOU tenant: estados da loja B';
  end if;

  if public.marcar_grupo_lotado(v_b, v_g_a) is distinct from 'nao_encontrado'
     or public.reabrir_grupo(v_b, v_g_c) is distinct from 'nao_encontrado'
     or public.reabrir_grupo(v_a, gen_random_uuid()) is distinct from 'nao_encontrado' then
    raise exception 'FALHOU tenant: marcar/reabrir com o tenant errado';
  end if;
  if (select lotado_em from public.groups where tenant_id = v_a and id = v_g_a) is not null
     or (select lotado_em from public.groups where tenant_id = v_a and id = v_g_c) is null then
    raise exception 'FALHOU tenant: grupo da loja A mudou por chamada da loja B';
  end if;
end $$;

-- 7) Disparo: com regra (as três, e regra junto de group_ids), campanha apagada, e sem regra
--    (o predicado de antes, sem mudança).
do $$
declare
  v_a constant uuid := 'c0c0c0c0-0000-4000-8000-00000000000a';
  v_camp constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000c1';
  v_camp2 constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000c2';
  v_caso record;
  v_bc public.broadcasts;
  v_got text;
begin
  perform pg_temp.postar_fixture();

  insert into public.broadcasts (id, tenant_id, campaign_group_id, name, message, group_ids, target_rule)
  values
    ('c0c0c0c0-0000-4000-8000-0000000000d1', v_a, v_camp, 'Regra padrão', 'oi', '{}', 'menos_enchendo'),
    ('c0c0c0c0-0000-4000-8000-0000000000d2', v_a, v_camp, 'Só lotados', 'oi', '{}', 'lotados'),
    ('c0c0c0c0-0000-4000-8000-0000000000d3', v_a, v_camp, 'Todos com gente', 'oi', '{}', 'com_gente'),
    ('c0c0c0c0-0000-4000-8000-0000000000d4', v_a, v_camp, 'Regra e lista', 'oi', array['pg-a@g.us'], 'lotados'),
    ('c0c0c0c0-0000-4000-8000-0000000000d5', v_a, v_camp2, 'Campanha some', 'oi', '{}', 'com_gente'),
    ('c0c0c0c0-0000-4000-8000-0000000000d6', v_a, v_camp, 'Sem regra', 'oi', '{}', null),
    ('c0c0c0c0-0000-4000-8000-0000000000d7', v_a, v_camp, 'Lista fixa', 'oi',
     array['pg-b@g.us', 'pg-e@g.us', 'pg-zz@g.us'], null),
    ('c0c0c0c0-0000-4000-8000-0000000000d8', v_a, v_camp, 'Só não-admin', 'oi', array['pg-e@g.us'], null);

  -- Com regra: os JIDs da regra (nem o enchendo a, nem o vazio d, nem o não-admin e). Com regra,
  -- group_ids não conta.
  for v_caso in
    select * from (values
      ('c0c0c0c0-0000-4000-8000-0000000000d1'::uuid, 'pg-b@g.us,pg-c@g.us,pg-f@g.us', 3),
      ('c0c0c0c0-0000-4000-8000-0000000000d2'::uuid, 'pg-c@g.us', 1),
      ('c0c0c0c0-0000-4000-8000-0000000000d3'::uuid, 'pg-a@g.us,pg-b@g.us,pg-c@g.us,pg-f@g.us', 4),
      ('c0c0c0c0-0000-4000-8000-0000000000d4'::uuid, 'pg-c@g.us', 1)
    ) as t(id, jids, total)
  loop
    v_bc := app.enqueue_broadcast(v_a, v_caso.id);
    v_got := pg_temp.jids_do_run(v_a, v_caso.id);
    if v_bc.status is distinct from 'queued' or v_bc.total <> v_caso.total
       or v_got is distinct from v_caso.jids then
      raise exception 'FALHOU disparo "%": status=% total=% jids=%', v_bc.name, v_bc.status, v_bc.total, v_got;
    end if;
  end loop;

  -- Campanha apagada com disparo de regra: a FK zera campaign_group_id -> zero alvos -> failed com
  -- a mensagem da regra. Nunca cai em "todos" (§7).
  delete from public.campaign_groups where tenant_id = v_a and id = v_camp2;
  v_bc := app.enqueue_broadcast(v_a, 'c0c0c0c0-0000-4000-8000-0000000000d5');
  if v_bc.campaign_group_id is not null or v_bc.status is distinct from 'failed' or v_bc.total <> 0
     or v_bc.error is distinct from 'Nenhum grupo nesta regra agora.'
     or pg_temp.jids_do_run(v_a, 'c0c0c0c0-0000-4000-8000-0000000000d5') is not null then
    raise exception 'FALHOU campanha apagada: campanha=% status=% total=% erro=%',
      v_bc.campaign_group_id, v_bc.status, v_bc.total, v_bc.error;
  end if;

  -- Sem regra: group_ids vazio = todos os admin da loja (em ordem de JID).
  select * into v_bc from public.broadcasts where tenant_id = v_a and id = 'c0c0c0c0-0000-4000-8000-0000000000d6';
  if array_to_string(app.alvos_do_disparo(v_bc), ',')
     is distinct from 'pg-a@g.us,pg-b@g.us,pg-c@g.us,pg-d@g.us,pg-f@g.us' then
    raise exception 'FALHOU sem regra (todos): %', app.alvos_do_disparo(v_bc);
  end if;
  -- Lista fixa: interseção com os admin.
  select * into v_bc from public.broadcasts where tenant_id = v_a and id = 'c0c0c0c0-0000-4000-8000-0000000000d7';
  if array_to_string(app.alvos_do_disparo(v_bc), ',') is distinct from 'pg-b@g.us' then
    raise exception 'FALHOU sem regra (lista): %', app.alvos_do_disparo(v_bc);
  end if;
  -- Só não-admin: falha com a mensagem de antes.
  v_bc := app.enqueue_broadcast(v_a, 'c0c0c0c0-0000-4000-8000-0000000000d8');
  if v_bc.status is distinct from 'failed'
     or v_bc.error is distinct from 'Nenhum grupo de destino (verifique se o número é admin dos grupos).' then
    raise exception 'FALHOU sem regra (não-admin): status=% erro=%', v_bc.status, v_bc.error;
  end if;
end $$;

-- 8) Oferta Relâmpago agendada com regra: abre nos JIDs que o run enfileirou, nem um a mais.
do $$
declare
  v_a constant uuid := 'c0c0c0c0-0000-4000-8000-00000000000a';
  v_camp constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000c1';
  v_bc constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000d9';
  v_fo constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000f1';
  v_oferta text;
  v_cmds text;
begin
  perform pg_temp.postar_fixture();

  insert into public.broadcasts (id, tenant_id, campaign_group_id, name, message, target_rule)
  values (v_bc, v_a, v_camp, 'Relâmpago', 'Comente EU QUERO', 'menos_enchendo');
  insert into public.flash_offers (id, tenant_id, name, slots, broadcast_id)
  values (v_fo, v_a, 'Relâmpago', 3, v_bc);
  insert into public.schedules (tenant_id, broadcast_id, name, scheduled_at)
  values (v_a, v_bc, 'Relâmpago', now());

  perform app.promote_due_schedules(1000);

  if (select status from public.flash_offers where tenant_id = v_a and id = v_fo) is distinct from 'open' then
    raise exception 'FALHOU oferta: não abriu';
  end if;
  select string_agg(g.whatsapp_group_id, ',' order by g.whatsapp_group_id) into v_oferta
  from public.flash_offer_groups g
  where g.tenant_id = v_a and g.offer_id = v_fo;
  v_cmds := pg_temp.jids_do_run(v_a, v_bc);
  if v_oferta is distinct from v_cmds or v_oferta is distinct from 'pg-b@g.us,pg-c@g.us,pg-f@g.us' then
    raise exception 'FALHOU oferta: escuta % e a mensagem foi para %', v_oferta, v_cmds;
  end if;
end $$;

-- 9) Aviso ao lotar (D10): uma vez por grupo, só quem lotou depois de ligar, envio só para admin,
--    só da mesma loja; reabrir e lotar de novo não repete.
do $$
declare
  v_a constant uuid := 'c0c0c0c0-0000-4000-8000-00000000000a';
  v_b constant uuid := 'c0c0c0c0-0000-4000-8000-00000000000b';
  v_camp constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000c1';
  v_camp2 constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000c2';
  v_camp_b constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000c3';
  v_g_a constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000aa';
  v_g_b constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000ab';
  v_g_e constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000ae';
  v_g_f constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000af';
  v_texto constant text := 'Lotou! Entre no próximo pelo link da campanha.';
  v_n integer;
  v_got text;
begin
  perform pg_temp.postar_fixture();

  update public.campaign_groups
  set aviso_ao_lotar = v_texto, aviso_ao_lotar_desde = now()
  where tenant_id in (v_a, v_b) and id in (v_camp, v_camp2, v_camp_b);

  -- f lotou ONTEM, antes de ligar o aviso: não recebe.
  update public.groups set lotado_em = now() - interval '1 day', lotado_por = 'manual'
  where tenant_id = v_a and id = v_g_f;
  -- Cruzam agora: a (em duas campanhas da loja, A e A2), b, e e (não-admin).
  update public.groups set members = 96 where tenant_id = v_a and id in (v_g_a, v_g_b, v_g_e);

  v_n := public.enviar_avisos_lotou(500);
  if v_n < 2 then
    raise exception 'FALHOU aviso: enviou %, esperava ao menos 2', v_n;
  end if;

  -- Um aviso por grupo: a (uma vez, mesmo em duas campanhas) e b. Nada enviado para c (nasceu
  -- cheio), f (lotou antes de ligar), e (não-admin: só marcado, ver bloco 10), nem na loja B (o
  -- pg-a dela não é o da A).
  select string_agg(array_to_string(b.group_ids, ','), ',' order by array_to_string(b.group_ids, ','))
    into v_got
  from public.broadcasts b
  where b.tenant_id in (v_a, v_b) and b.name like 'Aviso ao lotar · %';
  if v_got is distinct from 'pg-a@g.us,pg-b@g.us' then
    raise exception 'FALHOU aviso: avisos para %', v_got;
  end if;

  -- O aviso de b: nome, texto e campanha certos, e foi para a fila (número conectado).
  if not exists (
    select 1 from public.broadcasts b
    where b.tenant_id = v_a and b.name = 'Aviso ao lotar · Grupo B'
      and b.message = v_texto and b.campaign_group_id = v_camp
      and b.status = 'queued' and b.total = 1
  ) then
    raise exception 'FALHOU aviso: o de pg-b não saiu como esperado';
  end if;

  select string_agg(replace(g.whatsapp_group_id, '@g.us', '') || '=' || (g.aviso_lotou_em is not null)::text,
                    ',' order by g.whatsapp_group_id)
    into v_got
  from public.groups g
  where g.tenant_id = v_a and g.whatsapp_group_id in ('pg-a@g.us', 'pg-b@g.us', 'pg-e@g.us', 'pg-f@g.us');
  -- e (não-admin) também fica marcado, sem envio; f (antes de ligar) segue pendente para sempre.
  if v_got is distinct from 'pg-a=true,pg-b=true,pg-e=true,pg-f=false' then
    raise exception 'FALHOU aviso_lotou_em: %', v_got;
  end if;

  -- Segunda varredura: nada novo. Reabrir b e lotar de novo: não repete.
  perform public.enviar_avisos_lotou(500);
  update public.groups set members = 50 where tenant_id = v_a and id = v_g_b;
  if public.reabrir_grupo(v_a, v_g_b) is distinct from 'ok' then
    raise exception 'FALHOU aviso: reabrir b';
  end if;
  update public.groups set members = 96 where tenant_id = v_a and id = v_g_b;
  perform public.enviar_avisos_lotou(500);

  if (select count(*) from public.broadcasts b
      where b.tenant_id in (v_a, v_b) and b.name like 'Aviso ao lotar · %') <> 2 then
    raise exception 'FALHOU aviso: repetiu (segunda varredura ou depois de reabrir)';
  end if;
end $$;

-- 10) Aviso ao lotar em grupo onde o número NÃO é admin: elegível (lotou depois de ligar, aviso
--     configurado, aviso_lotou_em nulo) -> não envia, não conta no retorno, mas marca
--     aviso_lotou_em. Senão ficaria pendente para sempre e sairia atrasado no dia em que o número
--     virasse admin.
do $$
declare
  v_a constant uuid := 'c0c0c0c0-0000-4000-8000-00000000000a';
  v_camp constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000c1';
  v_g_e constant uuid := 'c0c0c0c0-0000-4000-8000-0000000000ae';
  v_n integer;
begin
  perform pg_temp.postar_fixture();
  -- Drena antes o que já estiver pendente no banco (dado real; desfeito pelo rollback), para o
  -- retorno abaixo contar só o cenário deste bloco.
  perform public.enviar_avisos_lotou(100000);

  update public.campaign_groups
  set aviso_ao_lotar = 'Lotou! Entre no próximo pelo link da campanha.', aviso_ao_lotar_desde = now()
  where tenant_id = v_a and id = v_camp;
  -- Só e cruza (30 -> 96): lotado automático, elegível, não-admin.
  update public.groups set members = 96 where tenant_id = v_a and id = v_g_e;
  if not exists (
    select 1 from public.groups
    where tenant_id = v_a and id = v_g_e
      and lotado_em is not null and aviso_lotou_em is null and not is_admin
  ) then
    raise exception 'FALHOU aviso não-admin: pg-e deveria estar lotado, sem aviso, não-admin';
  end if;

  v_n := public.enviar_avisos_lotou(100000);
  if v_n <> 0 then
    raise exception 'FALHOU aviso não-admin: retorno %, esperava 0', v_n;
  end if;
  if exists (select 1 from public.broadcasts b
             where b.tenant_id = v_a and b.name like 'Aviso ao lotar · %') then
    raise exception 'FALHOU aviso não-admin: criou broadcast para grupo onde não somos admin';
  end if;
  if (select aviso_lotou_em from public.groups where tenant_id = v_a and id = v_g_e) is null then
    raise exception 'FALHOU aviso não-admin: aviso_lotou_em deveria estar preenchido';
  end if;

  -- O número vira admin depois: o aviso NÃO sai atrasado.
  update public.groups set is_admin = true where tenant_id = v_a and id = v_g_e;
  perform public.enviar_avisos_lotou(100000);
  if exists (select 1 from public.broadcasts b
             where b.tenant_id = v_a and b.name like 'Aviso ao lotar · %') then
    raise exception 'FALHOU aviso não-admin: saiu atrasado depois de virar admin';
  end if;
end $$;

-- 11) Rede de segurança: se o cliente não honrar o rollback abaixo, as lojas de teste saem aqui
--     (cascade). Com o rollback valendo, este delete também é desfeito.
delete from public.organizations
where id in ('c0c0c0c0-0000-4000-8000-00000000000a', 'c0c0c0c0-0000-4000-8000-00000000000b');

rollback;
```

- [ ] **Step 2: RED estrutural.** O executor não roda o check (Global Constraints). O RED é: nenhum objeto que o check consome existe em migração da ordem de aplicação.

```bash
WT="$(git rev-parse --show-toplevel)"; cd "$WT" && for s in campaign_group_states marcar_grupo_lotado reabrir_grupo enviar_avisos_lotou estados_da_campanha alvos_da_regra alvos_do_disparo grupo_na_regra limiar_lotado groups_marca_lotado lotado_em target_rule aviso_ao_lotar; do printf '%s ' "$s"; grep -l "$s" apps/web/supabase/migrations/*.sql infra/migrations/*.sql 2>/dev/null | wc -l; done
```

Esperado: `0` em todas as linhas — o check falharia já no bloco 1 com "column … does not exist".

- [ ] **Step 3: commit.**

```bash
WT="$(git rev-parse --show-toplevel)"; git -C "$WT" add infra/tests/postar-por-grupo-check.sql
```
```bash
WT="$(git rev-parse --show-toplevel)"; git -C "$WT" diff --cached --stat
```

Esperado: 1 arquivo, `infra/tests/postar-por-grupo-check.sql`.

```bash
WT="$(git rev-parse --show-toplevel)"; git -C "$WT" commit -F - <<'EOF'
test(db): post-apply check for postar por grupo

One transaction ending in rollback: two throwaway stores prove the lotado
mark (insert, crossing up/down, capacity, sync upsert), reopen/mark RPCs,
reopened priority, the three destination rules, tenant isolation, the
dispatch fan-out with and without a rule, the flash offer listening to the
run's JIDs, and the full-group notice (once per group, not retroactive,
non-admin groups marked as handled without sending).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 4: a migração

**Files:**
- Create: `apps/web/supabase/migrations/20261010120000_postar_por_grupo.sql`

**Interfaces:**
- Consumes: `public.groups` (`members integer not null`, `capacity integer not null`, `is_admin boolean not null`, `invite_url text`, `admins_ours integer not null`, unique `(tenant_id, whatsapp_group_id)`), `public.campaign_groups.group_ids text[]`, `public.broadcasts.campaign_group_id` (FK `on delete set null`), `public.engine_commands (tenant_id, payload, origin_kind, origin_id, origin_run_id)` + `engine_commands_origin_idx (origin_id, origin_run_id, status)`, `app.missed_send_tolerance()`, `app.lid_map_from_history(uuid, text)`; corpos de `app.enqueue_broadcast` (`20260730100000_dispatch_fanout.sql`, linhas 53–218) e `app.promote_due_schedules` (`20260930120000_agendamento_perdeu_a_hora.sql`, linhas 25–176); o md5 de dev da Task 2.
- Produces (contrato §1, sem renomear):
  - colunas `groups.lotado_em`, `groups.lotado_por` (+ `groups_lotado_por_check`), `groups.reaberto_em`, `groups.aviso_lotou_em`; `campaign_groups.aviso_ao_lotar`, `campaign_groups.aviso_ao_lotar_desde`; `broadcasts.target_rule` (+ `broadcasts_target_rule_check`); `group_bulk_jobs.subject`; `group_bulk_jobs_action_check` com `'set_subject'`; índice `groups_aviso_lotou_pendente_idx`
  - `app.limiar_lotado(p_capacity integer) returns numeric` (immutable)
  - `app.grupo_na_regra(p_estado text, p_is_admin boolean, p_regra text) returns boolean` (immutable)
  - `app.estados_da_campanha(p_tenant uuid, p_campanha uuid) returns table (EstadoRow)` (stable, ordem do pool)
  - `app.alvos_da_regra(p_tenant uuid, p_campanha uuid, p_regra text) returns text[]`
  - `app.alvos_do_disparo(b public.broadcasts) returns text[]`
  - `app.groups_marca_lotado() returns trigger` + trigger `groups_marca_lotado` `before insert or update of members, capacity on public.groups`
  - `public.campaign_group_states(p_tenant uuid, p_campaign uuid) returns table (EstadoRow)`
  - `public.marcar_grupo_lotado(p_tenant uuid, p_group uuid) returns text` → `'ok' | 'ja_lotado' | 'nao_encontrado'`
  - `public.reabrir_grupo(p_tenant uuid, p_group uuid) returns text` → `'ok' | 'nao_lotado' | 'ainda_cheio' | 'nao_encontrado'`
  - `public.enviar_avisos_lotou(p_limit integer default 20) returns integer`
  - `app.enqueue_broadcast(uuid, uuid)` e `app.promote_due_schedules(integer)` com as assinaturas de sempre

- [ ] **Step 1: escrever a migração** `apps/web/supabase/migrations/20261010120000_postar_por_grupo.sql`:

```sql
-- Postar por grupo, PR 1 (banco). Spec: docs/superpowers/specs/2026-10-10-postar-por-grupo-design.md
-- §5.1–5.7; contrato: docs/superpowers/plans/2026-10-10-postar-por-grupo-00-contratos.md §1.
--
-- 1. groups ganha a marca de lotado (lotado_em, lotado_por, reaberto_em, aviso_lotou_em), gravada
--    por um trigger quando o grupo cruza 95% subindo ou nasce cheio. A marca nunca sai sozinha (D1).
-- 2. campaign_groups ganha o aviso ao lotar; broadcasts, target_rule; group_bulk_jobs, subject e a
--    ação 'set_subject'.
-- 3. Estado do grupo e regras de destino existem num lugar só (spec §4): app.limiar_lotado,
--    app.grupo_na_regra, app.estados_da_campanha, app.alvos_da_regra, app.alvos_do_disparo.
-- 4. RPCs (execute só service_role): campaign_group_states, marcar_grupo_lotado, reabrir_grupo,
--    enviar_avisos_lotou.
-- 5. app.enqueue_broadcast monta os destinos por app.alvos_do_disparo; app.promote_due_schedules
--    abre a Oferta Relâmpago nos JIDs que o run enfileirou.
-- 6. Backfill: grupo que já está cheio ganha a marca, sem aviso.
--
-- Sozinha, não muda o que o lojista vê: o link (TS) ainda ignora lotado_em e nenhum disparo tem
-- target_rule até os PRs 2 e 5.
--
-- Idempotente. Vai nos DOIS bancos (dev wfjuwogxaupyadwhvoxy, prod nidoatbxaylrkcgbszns) e muda
-- deploy/supabase/schema-baseline.json: t|groups, t|campaign_groups, t|broadcasts,
-- t|group_bulk_jobs e quatro f|. O gate de drift não vê schema app, CHECK, índice, trigger, ACL
-- nem corpo de função — conferir com infra/tests/postar-por-grupo-check.sql nos dois bancos.

-- Se estourar o timeout (webhook segurando groups), é só rodar de novo: a migração é idempotente.
set lock_timeout = '5s';

-- 0) Trava. Os corpos de app.enqueue_broadcast e app.promote_due_schedules mais abaixo são os do
--    repo (20260730100000 e 20260930120000) com UMA troca cada. Se este banco tiver outro corpo
--    (correção aplicada à mão), o create or replace a apagaria em silêncio — e o gate de drift não
--    vê corpo de função. O md5 é do prosrc com todo espaço em branco reduzido a um (CRLF/LF e
--    indentação não contam). A marca é um trecho que só existe no corpo novo: reaplicar passa.
do $$
declare
  v_fn record;
begin
  for v_fn in
    select f.sig, f.md5_repo, f.marca_nova, p.prosrc,
           md5(btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g'))) as md5_banco
    from (values
      ('app.enqueue_broadcast(uuid,uuid)', '08f4dc83041dc0a0d6f420f7cfcd194d', 'app.alvos_do_disparo(b)'),
      ('app.promote_due_schedules(integer)', 'f40fce2ab7b70328e1f3bf6c701bd0bf', 'c.origin_run_id = v_broadcast.run_id')
    ) as f(sig, md5_repo, marca_nova)
    left join pg_proc p on p.oid = to_regprocedure(f.sig)
  loop
    if v_fn.prosrc is null then
      raise exception 'postar_por_grupo: % não existe neste banco', v_fn.sig;
    end if;
    if v_fn.md5_banco <> v_fn.md5_repo and position(v_fn.marca_nova in v_fn.prosrc) = 0 then
      raise exception 'postar_por_grupo: o corpo de % neste banco difere do repo (md5 normalizado %, esperado %). Copie o pg_get_functiondef deste banco para a migração, refaça a troca e aplique de novo.',
        v_fn.sig, v_fn.md5_banco, v_fn.md5_repo;
    end if;
  end loop;
end $$;

-- 1) Colunas, CHECKs e índice (spec §5.1).
alter table public.groups
  add column if not exists lotado_em timestamptz,
  add column if not exists lotado_por text,
  add column if not exists reaberto_em timestamptz,
  add column if not exists aviso_lotou_em timestamptz;

alter table public.groups drop constraint if exists groups_lotado_por_check;
alter table public.groups
  add constraint groups_lotado_por_check
  check (lotado_por is null or lotado_por in ('auto', 'manual'));

comment on column public.groups.lotado_em is
  'Marca de lotado (D1). Gravada pelo trigger groups_marca_lotado ao cruzar 95% subindo, ou por marcar_grupo_lotado. Nunca sai sozinha: só reabrir_grupo limpa.';
comment on column public.groups.lotado_por is
  '''auto'' (trigger ou backfill) ou ''manual'' (marcar_grupo_lotado). Nulo quando não lotado.';
comment on column public.groups.reaberto_em is
  'Reaberto à mão (reabrir_grupo): tem prioridade no link (D3). O trigger limpa quando lota de novo.';
comment on column public.groups.aviso_lotou_em is
  'Aviso ao lotar já tratado (D10): uma vez por grupo, nunca é limpa. Grupo que nasce cheio e o backfill já vêm preenchidos.';

alter table public.campaign_groups
  add column if not exists aviso_ao_lotar text,
  add column if not exists aviso_ao_lotar_desde timestamptz;

comment on column public.campaign_groups.aviso_ao_lotar is
  'Texto enviado uma vez a cada grupo da campanha que ganha a marca de lotado (D10). Nulo ou vazio = desligado.';
comment on column public.campaign_groups.aviso_ao_lotar_desde is
  'Quando o aviso foi ligado: só grupo que lotar a partir daqui recebe (não retroativo).';

alter table public.broadcasts
  add column if not exists target_rule text;

-- SEM check amarrando target_rule a campaign_group_id: a FK é on delete set null e o check faria
-- apagar campanha falhar. Campanha nula = zero alvos (app.alvos_do_disparo).
alter table public.broadcasts drop constraint if exists broadcasts_target_rule_check;
alter table public.broadcasts
  add constraint broadcasts_target_rule_check
  check (target_rule is null or target_rule in ('menos_enchendo', 'lotados', 'com_gente'));

comment on column public.broadcasts.target_rule is
  'Regra de destino refeita na hora do envio (D8): menos_enchendo | lotados | com_gente. Nula = lista fixa em group_ids.';

alter table public.group_bulk_jobs
  add column if not exists subject text;

-- CHECK de checagem não tem ALTER: recriar com as seis ações de 20260917010000 + set_subject.
alter table public.group_bulk_jobs drop constraint if exists group_bulk_jobs_action_check;
alter table public.group_bulk_jobs
  add constraint group_bulk_jobs_action_check
  check (action = any (array[
    'set_description', 'set_picture', 'open', 'close', 'check_invite', 'remove_participant',
    'set_subject'
  ]));

comment on column public.group_bulk_jobs.subject is
  'Nome novo do grupo. Só preenchido em set_subject (Padronizar, D9).';

-- Varredor do aviso (enviar_avisos_lotou): só os lotados ainda sem aviso.
create index if not exists groups_aviso_lotou_pendente_idx
  on public.groups (tenant_id)
  where lotado_em is not null and aviso_lotou_em is null;

-- 2) Estado e regras (spec §3, §5.2). Ninguém mais decide "lotado", "enchendo" ou regra.

create or replace function app.limiar_lotado(p_capacity integer)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select (case when p_capacity > 0 then p_capacity else 1024 end) * 0.95;
$$;

-- A ÚNICA definição das regras de destino. Toda regra exige admin (como o fan-out já exigia).
create or replace function app.grupo_na_regra(p_estado text, p_is_admin boolean, p_regra text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    p_is_admin and case p_regra
      when 'menos_enchendo' then p_estado in ('lotado', 'fila')
      when 'lotados' then p_estado = 'lotado'
      when 'com_gente' then p_estado in ('lotado', 'fila', 'enchendo')
      else false
    end,
    false);
$$;

create or replace function app.estados_da_campanha(p_tenant uuid, p_campanha uuid)
returns table (
  posicao integer,
  group_id uuid,
  whatsapp_group_id text,
  name text,
  members integer,
  capacity integer,
  is_admin boolean,
  invite_url text,
  lotado_em timestamptz,
  lotado_por text,
  reaberto_em timestamptz,
  aviso_lotou_em timestamptz,
  estado text,
  pode_reabrir boolean,
  na_regra_menos_enchendo boolean,
  na_regra_lotados boolean,
  na_regra_com_gente boolean
)
language sql
stable
set search_path = ''
as $$
  with pool as (
    -- JID repetido no array vale a menor posição.
    select distinct on (p.jid) p.jid, p.posicao::integer as posicao
    from public.campaign_groups c
    cross join lateral unnest(c.group_ids) with ordinality as p(jid, posicao)
    where c.tenant_id = p_tenant
      and c.id = p_campanha
    order by p.jid, p.posicao
  ),
  grupos as (
    -- JID do pool sem linha em groups não sai (o link já o ignora; diagnosePool trata).
    select pool.posicao, g.id, g.whatsapp_group_id, g.name, g.members, g.capacity, g.is_admin,
           g.invite_url, g.lotado_em, g.lotado_por, g.reaberto_em, g.aviso_lotou_em, g.admins_ours,
           -- Disponível = isGroupAvailable (resolve-click-target.ts, convite com /i) + não lotado.
           (g.is_admin
             and coalesce(g.invite_url, '') ~* '^https?://\S+$'
             and g.lotado_em is null
             and g.members < app.limiar_lotado(g.capacity)) as disponivel
    from pool
    join public.groups g
      on g.tenant_id = p_tenant
     and g.whatsapp_group_id = pool.jid
  ),
  enchendo as (
    -- O primeiro disponível: reabertos primeiro (D3), entre eles e depois deles a ordem do pool.
    select gr.id
    from grupos gr
    where gr.disponivel
    order by (gr.reaberto_em is null), gr.posicao
    limit 1
  ),
  classificados as (
    select gr.*,
           case
             when gr.lotado_em is not null then 'lotado'
             when gr.id = (select e.id from enchendo e) then 'enchendo'
             when gr.members <= greatest(gr.admins_ours, 1) then 'vazio'
             else 'fila'
           end as estado
    from grupos gr
  )
  select cl.posicao, cl.id, cl.whatsapp_group_id, cl.name, cl.members, cl.capacity, cl.is_admin,
         cl.invite_url, cl.lotado_em, cl.lotado_por, cl.reaberto_em, cl.aviso_lotou_em, cl.estado,
         (cl.lotado_em is not null and cl.members < app.limiar_lotado(cl.capacity)),
         app.grupo_na_regra(cl.estado, cl.is_admin, 'menos_enchendo'),
         app.grupo_na_regra(cl.estado, cl.is_admin, 'lotados'),
         app.grupo_na_regra(cl.estado, cl.is_admin, 'com_gente')
  from classificados cl
  order by cl.posicao;
$$;

-- JIDs da regra, na ordem do pool. Campanha nula ou de outra loja = zero JIDs.
create or replace function app.alvos_da_regra(p_tenant uuid, p_campanha uuid, p_regra text)
returns text[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(e.whatsapp_group_id order by e.posicao), '{}'::text[])
  from app.estados_da_campanha(p_tenant, p_campanha) as e
  where app.grupo_na_regra(e.estado, e.is_admin, p_regra);
$$;

-- Destinos de um disparo. Com regra: os JIDs da regra, refeitos agora (D8); campanha nula (apagada)
-- dá zero, nunca "todos". Sem regra: o predicado de 20260730100000, sem mudança — só grupo em que o
-- número é admin, e group_ids vazio = todos os admin. O is_admin vale para a lista explícita também:
-- o sync grava TODOS os grupos com a flag, e disparar onde não somos admin é envio que o WhatsApp
-- recusa, que queima cota anti-ban e cujas falhas alimentam o breaker do número.
create or replace function app.alvos_do_disparo(b public.broadcasts)
returns text[]
language sql
stable
set search_path = ''
as $$
  select case
    when b.target_rule is not null then
      app.alvos_da_regra(b.tenant_id, b.campaign_group_id, b.target_rule)
    else (
      select coalesce(array_agg(g.whatsapp_group_id order by g.whatsapp_group_id), '{}'::text[])
      from public.groups g
      where g.tenant_id = b.tenant_id
        and g.is_admin
        and (
          coalesce(array_length(b.group_ids, 1), 0) = 0
          or g.whatsapp_group_id = any(b.group_ids)
        )
    )
  end;
$$;

-- 3) A marca automática (spec §5.3): o único escritor automático de lotado_em. Todo escritor de
--    members (apply_group_members_delta, upsert do sync, insertNewGroups, registerGrownGroup) passa
--    por ele sem saber. security definer: chama app.limiar_lotado como dono, e não como o papel que
--    escreveu o grupo (service_role não tem nem precisa de EXECUTE em app).
create or replace function app.groups_marca_lotado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Já marcado: nada a fazer. Nunca limpa a marca (D1).
  if new.lotado_em is not null then
    return new;
  end if;
  if new.members < app.limiar_lotado(new.capacity) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Descoberto já cheio não "acabou de lotar": sem o aviso_lotou_em, o primeiro sync de um
    -- lojista novo dispararia o aviso em todos os grupos cheios.
    new.lotado_em := now();
    new.lotado_por := 'auto';
    new.aviso_lotou_em := now();
  elsif old.members < app.limiar_lotado(old.capacity) then
    -- Cruzou subindo. O reaberto perde a prioridade no link (D3); o aviso não é tocado (D10).
    new.lotado_em := now();
    new.lotado_por := 'auto';
    new.reaberto_em := null;
  end if;
  return new;
end;
$$;

drop trigger if exists groups_marca_lotado on public.groups;
create trigger groups_marca_lotado
  before insert or update of members, capacity on public.groups
  for each row
  execute function app.groups_marca_lotado();

-- 4) Backfill (spec §5.7). Não dispara o trigger (não toca members/capacity) e não gera aviso:
--    os grupos que já estavam cheios aparecem como "Lotou hoje".
update public.groups
   set lotado_em = now(), lotado_por = 'auto', aviso_lotou_em = now()
 where lotado_em is null
   and members >= app.limiar_lotado(capacity);

-- 5) RPCs (spec §5.2, §5.4, §5.6). PostgREST só enxerga public: estes são os wrappers.

create or replace function public.campaign_group_states(p_tenant uuid, p_campaign uuid)
returns table (
  posicao integer,
  group_id uuid,
  whatsapp_group_id text,
  name text,
  members integer,
  capacity integer,
  is_admin boolean,
  invite_url text,
  lotado_em timestamptz,
  lotado_por text,
  reaberto_em timestamptz,
  aviso_lotou_em timestamptz,
  estado text,
  pode_reabrir boolean,
  na_regra_menos_enchendo boolean,
  na_regra_lotados boolean,
  na_regra_com_gente boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from app.estados_da_campanha(p_tenant, p_campaign);
$$;

create or replace function public.marcar_grupo_lotado(p_tenant uuid, p_group uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.groups g
     set lotado_em = now(), lotado_por = 'manual', reaberto_em = null
   where g.tenant_id = p_tenant
     and g.id = p_group
     and g.lotado_em is null;
  if found then
    return 'ok';
  end if;

  perform 1 from public.groups g where g.tenant_id = p_tenant and g.id = p_group;
  if found then
    return 'ja_lotado';
  end if;
  return 'nao_encontrado';
end;
$$;

create or replace function public.reabrir_grupo(p_tenant uuid, p_group uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lotado boolean;
begin
  -- A condição de vaga vai NO where (D2): checar e gravar num passo só, sem corrida.
  update public.groups g
     set lotado_em = null, lotado_por = null, reaberto_em = now()
   where g.tenant_id = p_tenant
     and g.id = p_group
     and g.lotado_em is not null
     and g.members < app.limiar_lotado(g.capacity);
  if found then
    return 'ok';
  end if;

  select g.lotado_em is not null into v_lotado
  from public.groups g
  where g.tenant_id = p_tenant and g.id = p_group;
  if not found then
    return 'nao_encontrado';
  end if;
  if not v_lotado then
    return 'nao_lotado';
  end if;
  return 'ainda_cheio';
end;
$$;

-- Aviso ao lotar (D10). Chamado pelo worker a cada 30 s (PR 9): devolve só um inteiro (egress) —
-- quantos avisos ENVIOU. Um aviso por GRUPO: grupo em duas campanhas da loja (conflito legado de D4)
-- pega uma só, a mais antiga com aviso ligado. aviso_lotou_em é gravado qualquer que seja o
-- resultado do enfileiramento (sem número conectado vira 'failed' no histórico de Disparos, como
-- qualquer disparo; não tenta de novo a cada 30 s).
-- Grupo elegível em que o número NÃO é admin: não envia (o WhatsApp recusaria), não conta no
-- retorno, mas marca aviso_lotou_em. Sem isso ficaria pendente para sempre e, se o número virasse
-- admin dias depois, o aviso sairia atrasado.
create or replace function public.enviar_avisos_lotou(p_limit integer default 20)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_broadcast_id uuid;
  v_enviados integer := 0;
begin
  for r in
    select g.id as group_id, g.tenant_id, g.whatsapp_group_id, g.name, g.is_admin,
           c.id as campanha_id, c.aviso_ao_lotar
    from public.groups g
    cross join lateral (
      select cg.id, cg.aviso_ao_lotar
      from public.campaign_groups cg
      where cg.tenant_id = g.tenant_id
        and g.whatsapp_group_id = any(cg.group_ids)
        and nullif(btrim(cg.aviso_ao_lotar), '') is not null
        and g.lotado_em >= cg.aviso_ao_lotar_desde
      order by cg.created_at, cg.id
      limit 1
    ) as c
    where g.lotado_em is not null
      and g.aviso_lotou_em is null
    order by g.lotado_em, g.id
    limit greatest(coalesce(p_limit, 20), 1)
    for update of g skip locked
  loop
    if r.is_admin then
      insert into public.broadcasts (tenant_id, campaign_group_id, name, message, group_ids, status)
      values (r.tenant_id, r.campanha_id, 'Aviso ao lotar · ' || r.name, r.aviso_ao_lotar,
              array[r.whatsapp_group_id], 'draft')
      returning id into v_broadcast_id;

      perform app.enqueue_broadcast(r.tenant_id, v_broadcast_id);
      v_enviados := v_enviados + 1;
    end if;

    update public.groups
       set aviso_lotou_em = now()
     where tenant_id = r.tenant_id
       and id = r.group_id;
  end loop;

  return v_enviados;
end;
$$;

-- 6) Disparo (spec §5.5). Corpos do repo — a trava do bloco 0 garantiu que são os deste banco —
--    com UMA troca cada.

-- Troca: o bloco de destinos (comentário + select ... into jids) vira app.alvos_do_disparo(b), e o
-- erro de destino vazio fica específico quando há regra.
create or replace function app.enqueue_broadcast(
  target_tenant_id uuid,
  target_broadcast_id uuid
)
returns public.broadcasts
language plpgsql
security definer
set search_path = public, app
as $$
declare
  b public.broadcasts;
  target_instance uuid;
  new_run_id uuid := gen_random_uuid();
  cmd_type text;
  jids text[];
  inserted integer := 0;
  msg text;
  media text;
  media_kind text;
  mention boolean;
  poll_question text;
  poll_options text[];
begin
  -- FOR UPDATE serializa duplo-clique no botão: o segundo espera o primeiro
  -- terminar e então cai no guard de status abaixo, em vez de fazer 2 fan-outs.
  select * into b
  from public.broadcasts
  where id = target_broadcast_id and tenant_id = target_tenant_id
  for update;

  if not found then
    return null;
  end if;

  -- Idempotente: já na fila / já rodando não refaz o fan-out. Mesmos estados que
  -- o enqueueBroadcast antigo aceitava (draft/sent/failed).
  if b.status not in ('draft', 'sent', 'failed') then
    return b;
  end if;

  msg := coalesce(b.message, '');
  media := b.media_id;
  mention := coalesce(b.mention_all, false);
  media_kind := case when b.media_type in ('video', 'document') then b.media_type else 'image' end;
  poll_question := nullif(b.poll ->> 'question', '');

  select coalesce(array_agg(value), '{}'::text[])
    into poll_options
  from jsonb_array_elements_text(coalesce(b.poll -> 'options', '[]'::jsonb)) as value
  where value <> '';

  -- Tipo do comando com a MESMA precedência do engine legado
  -- (hubflow-engine/index.js: enquete > mídia > texto).
  if poll_question is not null and coalesce(array_length(poll_options, 1), 0) >= 2 then
    cmd_type := 'send_poll';
  elsif media is not null then
    cmd_type := 'send_media';
  elsif msg <> '' then
    cmd_type := 'send_message';
  else
    update public.broadcasts
    set status = 'failed', error = 'Oferta sem conteúdo (texto, mídia ou enquete).',
        sent = 0, total = 0, dispatched_at = now(), updated_at = now()
    where id = target_broadcast_id
    returning * into b;
    return b;
  end if;

  -- Número que vai disparar. Fixado agora: o comando carrega instance_id e o
  -- gate anti-ban é POR NÚMERO, então o alvo precisa ser conhecido no enfileiramento.
  select id into target_instance
  from public.instances
  where tenant_id = target_tenant_id
    and status = 'connected'
    and provider_instance_id is not null
  order by connected_at desc nulls last, created_at asc
  limit 1;

  if target_instance is null then
    update public.broadcasts
    set status = 'failed', error = 'Nenhum número conectado para disparar.',
        sent = 0, total = 0, dispatched_at = now(), updated_at = now()
    where id = target_broadcast_id
    returning * into b;
    return b;
  end if;

  -- Destinos: app.alvos_do_disparo (20261010120000) é a única definição. Sem regra
  -- (target_rule nulo) é o predicado de antes; com regra, os JIDs da regra na
  -- campanha, refeitos agora (spec D8).
  jids := app.alvos_do_disparo(b);

  if coalesce(array_length(jids, 1), 0) = 0 then
    update public.broadcasts
    set status = 'failed',
        error = case
          when b.target_rule is not null then 'Nenhum grupo nesta regra agora.'
          else 'Nenhum grupo de destino (verifique se o número é admin dos grupos).'
        end,
        sent = 0, total = 0, dispatched_at = now(), updated_at = now()
    where id = target_broadcast_id
    returning * into b;
    return b;
  end if;

  -- Um comando por grupo. priority 100 = fan-out (ver engine_queue_v2).
  -- O payload é o contrato que apps/worker/src/send-command.ts consome.
  with ins as (
    insert into public.engine_commands (
      tenant_id, instance_id, type, status, payload, priority, dedupe_key,
      origin_kind, origin_id, origin_run_id
    )
    select
      target_tenant_id,
      target_instance,
      cmd_type,
      'queued',
      case cmd_type
        when 'send_poll' then jsonb_build_object(
          'jid', t.jid, 'question', poll_question, 'options', to_jsonb(poll_options))
        when 'send_media' then jsonb_build_object(
          'jid', t.jid, 'mediaId', media, 'mediaType', media_kind,
          'caption', msg, 'mentionAll', mention)
        else jsonb_build_object(
          'jid', t.jid, 'text', msg, 'mentionAll', mention)
      end,
      100,
      -- run_id na chave: sem ele, reenviar a MESMA oferta bateria no índice
      -- único, inseriria 0 linhas e o disparo sumiria em silêncio.
      'bc:' || target_broadcast_id::text || ':' || new_run_id::text || ':' || t.jid,
      'broadcast',
      target_broadcast_id,
      new_run_id
    from unnest(jids) as t(jid)
    on conflict (tenant_id, dedupe_key) where dedupe_key is not null do nothing
    returning 1
  )
  select count(*)::integer into inserted from ins;

  update public.broadcasts
  set
    run_id = new_run_id,
    status = 'queued',
    sent = 0,
    total = inserted,
    error = null,
    dispatched_at = null,
    running_since = now(),
    last_ack_at = now(),
    updated_at = now()
  where id = target_broadcast_id
  returning * into b;

  return b;
end;
$$;

-- Troca: o bloco que COPIAVA o predicado de destino para abrir a Oferta Relâmpago passa a ler os
-- JIDs que enqueue_broadcast enfileirou neste run (a variável v_group_ids saiu junto).
create or replace function app.promote_due_schedules(max_schedules integer default 50)
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare
  promoted integer := 0;
  s record;
  step interval;
  next_at timestamptz;
  v_offer_id uuid;
  v_alvos text[];
  v_anteriores uuid[];
  v_broadcast public.broadcasts;
  v_missed boolean;
begin
  for s in
    select sc.id, sc.tenant_id, sc.broadcast_id, sc.scheduled_at, sc.recurrence
    from public.schedules sc
    where sc.status = 'pending'
      and sc.scheduled_at <= now()
    order by sc.scheduled_at asc
    limit greatest(max_schedules, 1)
    for update skip locked
  loop
    -- Perdeu a hora (worker/VPS fora do ar): nao dispara atrasado. Mensagem de
    -- oferta fora do horario e pior que mensagem nenhuma.
    v_missed := now() - s.scheduled_at > app.missed_send_tolerance();

    if v_missed and s.recurrence = 'none' and s.broadcast_id is not null then
      update public.broadcasts
      set status = 'failed',
          error = 'Não enviado: perdeu o horário agendado (servidor fora do ar).',
          updated_at = now()
      where id = s.broadcast_id
        and tenant_id = s.tenant_id
        and status in ('draft', 'sent', 'failed');
    end if;

    if not v_missed and s.broadcast_id is not null then
      v_broadcast := app.enqueue_broadcast(s.tenant_id, s.broadcast_id);
      -- Contagem inalterada de proposito: "promovido" sempre quis dizer
      -- "agendamento com broadcast que chegou na hora", nao "mensagem que saiu".
      promoted := promoted + 1;

      -- Funil: etapa relampago. A oferta ligada abre agora, junto da mensagem.
      --
      -- So abre se enqueue_broadcast realmente enfileirou. Ela devolve o
      -- broadcast e volta com status 'failed' e total 0 quando nao ha numero
      -- conectado, nao ha grupo de destino ou o conteudo esta vazio; devolve
      -- null quando o broadcast sumiu. Abrir a oferta nesses casos criaria uma
      -- oferta que ninguem foi convidado a usar, e ela seguraria o indice
      -- flash_offer_groups_um_aberto_uidx do grupo ate alguem fechar a mao.
      v_offer_id := null;
      if v_broadcast.id is not null
         and v_broadcast.status = 'queued'
         and coalesce(v_broadcast.total, 0) > 0 then
        select fo.id into v_offer_id
        from public.flash_offers fo
        where fo.broadcast_id = s.broadcast_id
          and fo.tenant_id = s.tenant_id
          and fo.status = 'draft'
        limit 1;
      end if;

      if v_offer_id is not null then
        -- Os grupos que receberam ESTA mensagem: os JIDs que enqueue_broadcast
        -- enfileirou neste run. Antes este bloco copiava o predicado de destino;
        -- com a regra de destino (broadcasts.target_rule, 20261010120000) a copia
        -- divergiria e a oferta escutaria grupo que nao recebeu a mensagem.
        -- origin_id + origin_run_id vao pelo engine_commands_origin_idx.
        select coalesce(array_agg(c.payload ->> 'jid'), '{}') into v_alvos
        from public.engine_commands c
        where c.tenant_id = s.tenant_id
          and c.origin_kind = 'broadcast'
          and c.origin_id = s.broadcast_id
          and c.origin_run_id = v_broadcast.run_id;

        -- A oferta de funil anterior nesses grupos da lugar a esta (ver topo).
        select coalesce(array_agg(distinct fo.id), '{}') into v_anteriores
        from public.flash_offer_groups fog
        join public.flash_offers fo
          on fo.id = fog.offer_id
         and fo.tenant_id = fog.tenant_id
        where fog.tenant_id = s.tenant_id
          and fog.closed_at is null
          and fog.whatsapp_group_id = any(v_alvos)
          and fo.broadcast_id is not null
          and fo.status = 'open'
          and fo.id <> v_offer_id;

        if coalesce(array_length(v_anteriores, 1), 0) > 0 then
          update public.flash_offers
          set status = 'closed', closed_at = now(), updated_at = now()
          where tenant_id = s.tenant_id
            and id = any(v_anteriores);

          update public.flash_offer_groups
          set closed_at = now()
          where tenant_id = s.tenant_id
            and offer_id = any(v_anteriores)
            and closed_at is null;
        end if;

        update public.flash_offers
        set status = 'open', opened_at = now(), updated_at = now()
        where id = v_offer_id
          and tenant_id = s.tenant_id;

        -- Grupo que ainda tem outra oferta aberta (so pode ser oferta criada a
        -- mao) e pulado pelo indice parcial. A mensagem sai mesmo assim.
        insert into public.flash_offer_groups
          (tenant_id, offer_id, group_id, whatsapp_group_id, opened_at, lid_map)
        select g.tenant_id, v_offer_id, g.id, g.whatsapp_group_id, now(),
               app.lid_map_from_history(g.tenant_id, g.whatsapp_group_id)
        from public.groups g
        where g.tenant_id = s.tenant_id
          and g.whatsapp_group_id = any(v_alvos)
        on conflict (tenant_id, whatsapp_group_id) where closed_at is null do nothing;
      end if;
    end if;

    if s.recurrence = 'none' then
      update public.schedules
      set status = case when v_missed then 'failed'::public.schedule_status else 'done'::public.schedule_status end,
          last_run_at = now(), updated_at = now()
      where id = s.id;
    else
      step := case when s.recurrence = 'daily' then interval '1 day' else interval '7 days' end;
      -- Avanca ate o futuro: um worker parado 3 dias nao pode gerar 3 disparos.
      next_at := s.scheduled_at;
      while next_at <= now() loop
        next_at := next_at + step;
      end loop;
      update public.schedules
      set scheduled_at = next_at, last_run_at = now(), updated_at = now()
      where id = s.id;
    end if;
  end loop;

  return promoted;
end;
$$;

-- 7) Privilégio. create or replace não preserva ACL de forma confiável (20260904100000); função
--    nova de public nasce executável por authenticated (default privilege do grantor postgres); e
--    função de app nasce com EXECUTE para PUBLIC. Todas ficam postgres + service_role. Quem chama as
--    de app são funções definer de dono postgres (wrappers, trigger, enqueue, promote); trigger não
--    precisa de EXECUTE para disparar.
revoke all on function app.limiar_lotado(integer) from public, anon, authenticated;
grant execute on function app.limiar_lotado(integer) to service_role;
revoke all on function app.grupo_na_regra(text, boolean, text) from public, anon, authenticated;
grant execute on function app.grupo_na_regra(text, boolean, text) to service_role;
revoke all on function app.estados_da_campanha(uuid, uuid) from public, anon, authenticated;
grant execute on function app.estados_da_campanha(uuid, uuid) to service_role;
revoke all on function app.alvos_da_regra(uuid, uuid, text) from public, anon, authenticated;
grant execute on function app.alvos_da_regra(uuid, uuid, text) to service_role;
revoke all on function app.alvos_do_disparo(public.broadcasts) from public, anon, authenticated;
grant execute on function app.alvos_do_disparo(public.broadcasts) to service_role;
revoke all on function app.groups_marca_lotado() from public, anon, authenticated;
grant execute on function app.groups_marca_lotado() to service_role;
revoke all on function app.enqueue_broadcast(uuid, uuid) from public, anon, authenticated;
grant execute on function app.enqueue_broadcast(uuid, uuid) to service_role;
revoke all on function app.promote_due_schedules(integer) from public, anon, authenticated;
grant execute on function app.promote_due_schedules(integer) to service_role;
revoke all on function public.campaign_group_states(uuid, uuid) from public, anon, authenticated;
grant execute on function public.campaign_group_states(uuid, uuid) to service_role;
revoke all on function public.marcar_grupo_lotado(uuid, uuid) from public, anon, authenticated;
grant execute on function public.marcar_grupo_lotado(uuid, uuid) to service_role;
revoke all on function public.reabrir_grupo(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reabrir_grupo(uuid, uuid) to service_role;
revoke all on function public.enviar_avisos_lotou(integer) from public, anon, authenticated;
grant execute on function public.enviar_avisos_lotou(integer) to service_role;

-- O PostgREST passa a enxergar as RPCs sem esperar o recarregamento automático.
notify pgrst, 'reload schema';
```

- [ ] **Step 2: a trava e as duas trocas, provadas contra o repo** (Review Focus 1). Recalcula do repo os md5 que a trava aceita, confirma que as marcas só existem no corpo novo e grava os corpos antes/depois (sem CR) para o diff:

```bash
WT="$(git rev-parse --show-toplevel)"; cd "$WT" && node - <<'EOF'
const fs = require("fs");
const { createHash } = require("crypto");
const T = "C:/Users/Igor/AppData/Local/Temp";
const md5n = (s) => createHash("md5").update(s.replace(/\s+/g, " ").trim(), "utf8").digest("hex");
const corpo = (arq, cabecalho, abre, fecha) => {
  const t = fs.readFileSync(arq, "utf8");
  const i = t.indexOf(cabecalho);
  if (i < 0) throw new Error(`${cabecalho} não está em ${arq}`);
  const s = t.indexOf(abre, i) + abre.length;
  return t.slice(s, t.indexOf(fecha, s));
};
const MIG = "apps/web/supabase/migrations/20261010120000_postar_por_grupo.sql";
const enqAntes = corpo("apps/web/supabase/migrations/20260730100000_dispatch_fanout.sql",
  "create or replace function app.enqueue_broadcast(", "as $$", "$$;");
const proAntes = corpo("apps/web/supabase/migrations/20260930120000_agendamento_perdeu_a_hora.sql",
  "CREATE OR REPLACE FUNCTION app.promote_due_schedules(", "AS $function$", "$function$;");
const enqDepois = corpo(MIG, "create or replace function app.enqueue_broadcast(", "as $$", "$$;");
const proDepois = corpo(MIG, "create or replace function app.promote_due_schedules(", "as $$", "$$;");
const mig = fs.readFileSync(MIG, "utf8");
console.log("md5 enqueue", md5n(enqAntes), "na trava:", mig.includes(`'${md5n(enqAntes)}'`));
console.log("md5 promote", md5n(proAntes), "na trava:", mig.includes(`'${md5n(proAntes)}'`));
console.log("marcas só no novo:",
  !enqAntes.includes("app.alvos_do_disparo(b)") && enqDepois.includes("app.alvos_do_disparo(b)"),
  !proAntes.includes("c.origin_run_id = v_broadcast.run_id") && proDepois.includes("c.origin_run_id = v_broadcast.run_id"));
const semCr = (s) => s.replace(/\r\n/g, "\n");
fs.writeFileSync(`${T}/postar-grupo-enq-antes.sql`, semCr(enqAntes));
fs.writeFileSync(`${T}/postar-grupo-enq-depois.sql`, semCr(enqDepois));
fs.writeFileSync(`${T}/postar-grupo-pro-antes.sql`, semCr(proAntes));
fs.writeFileSync(`${T}/postar-grupo-pro-depois.sql`, semCr(proDepois));
EOF
```

Esperado:

```
md5 enqueue 08f4dc83041dc0a0d6f420f7cfcd194d na trava: true
md5 promote f40fce2ab7b70328e1f3bf6c701bd0bf na trava: true
marcas só no novo: true true
```

Depois o diff (Review Focus 1, "uma troca só"):

```bash
diff -u C:/Users/Igor/AppData/Local/Temp/postar-grupo-enq-antes.sql C:/Users/Igor/AppData/Local/Temp/postar-grupo-enq-depois.sql; diff -u C:/Users/Igor/AppData/Local/Temp/postar-grupo-pro-antes.sql C:/Users/Igor/AppData/Local/Temp/postar-grupo-pro-depois.sql
```

Esperado: no `enqueue`, **um** hunk — saem o comentário "Destinos. `group_ids` vazio…" (9 linhas), o `select coalesce(array_agg(g.whatsapp_group_id …)) into jids … );` e a linha `set status = 'failed', error = 'Nenhum grupo de destino …',`; entram o comentário novo, `jids := app.alvos_do_disparo(b);` e o `set status = 'failed', error = case … end,`. No `promote`, **dois** hunks — a linha `v_group_ids text[];` sai; o `select b.group_ids into v_group_ids …` e o `select coalesce(array_agg(g.whatsapp_group_id), '{}') into v_alvos … );` (com o comentário "Mesmo predicado…") saem e entra o `select coalesce(array_agg(c.payload ->> 'jid'), '{}') into v_alvos from public.engine_commands c …` com o comentário novo. Qualquer outra linha no diff = cópia errada: corrija a migração para bater com o original.

- [ ] **Step 3 (só se a Task 2 achou outro md5 em dev): corpo de dev.** Crie com a ferramenta Write `C:/Users/Igor/AppData/Local/Temp/postar-grupo-corpos-dev.sql`:

```sql
select pg_get_functiondef('app.enqueue_broadcast(uuid,uuid)'::regprocedure) as enqueue,
       pg_get_functiondef('app.promote_due_schedules(integer)'::regprocedure) as promote;
```

```bash
WT="$(git rev-parse --show-toplevel)"; cd "$WT/apps/web" && supabase link --project-ref wfjuwogxaupyadwhvoxy --yes && supabase db query --linked -o json -f "C:/Users/Igor/AppData/Local/Temp/postar-grupo-corpos-dev.sql"
```

Para a função cujo md5 divergiu: troque, no Step 1, o corpo (entre `as $$` e `$$;`) pelo corpo de dev, refaça nele a mesma troca, e troque o `md5_repo` dela na trava pelo md5 que a Task 2 mostrou para dev. Rode o Step 2 de novo, agora contra o corpo de dev (o "antes" é o de dev). A trava em prod (Task 10, Step 2) prova que prod = dev antes de qualquer DDL.

- [ ] **Step 4: autoconferência no arquivo** (o banco só vê isto na Task 10; um erro aqui custa uma ida e volta com o Igor):

```bash
WT="$(git rev-parse --show-toplevel)"; F="$WT/apps/web/supabase/migrations/20261010120000_postar_por_grupo.sql"; for p in '^create or replace function' '^security definer$' '^set search_path' '^revoke all on function' '^grant execute on function' "'set_subject'" '^drop trigger if exists groups_marca_lotado' '^create index if not exists groups_aviso_lotou_pendente_idx'; do printf '%s => ' "$p"; grep -c "$p" "$F"; done; for n in app.limiar_lotado app.grupo_na_regra app.estados_da_campanha app.alvos_da_regra app.alvos_do_disparo app.groups_marca_lotado public.campaign_group_states public.marcar_grupo_lotado public.reabrir_grupo public.enviar_avisos_lotou app.enqueue_broadcast app.promote_due_schedules; do printf '%s => ' "$n"; grep -c "^create or replace function $n(" "$F"; done
```

Esperado: `12`, `7`, `12`, `12`, `12`, `2` (o comentário do cabeçalho e a CHECK), `1`, `1`; e `1` para cada um dos 12 nomes. Releia também os corpos das funções novas procurando nome sem schema (`set search_path = ''`: todo `groups`, `campaign_groups`, `broadcasts`, `engine_commands` e toda função do projeto começa com `public.` ou `app.`).

- [ ] **Step 5: commit.**

```bash
WT="$(git rev-parse --show-toplevel)"; git -C "$WT" add apps/web/supabase/migrations/20261010120000_postar_por_grupo.sql
```
```bash
WT="$(git rev-parse --show-toplevel)"; git -C "$WT" diff --cached --stat
```

Esperado: 1 arquivo.

```bash
WT="$(git rev-parse --show-toplevel)"; git -C "$WT" commit -F - <<'EOF'
feat(db): lotado mark, destination rules and group state RPCs

groups gets a recorded "lotado" mark written by a single trigger when a
group crosses 95% going up (or is inserted already full, with the notice
marked as done), plus a backfill. Group state and destination rules live
in one place (app.estados_da_campanha / app.grupo_na_regra), exposed by
service_role-only RPCs: campaign_group_states, marcar_grupo_lotado,
reabrir_grupo, enviar_avisos_lotou. enqueue_broadcast resolves targets
through app.alvos_do_disparo (rule re-evaluated at send time; no rule keeps
the old predicate) and promote_due_schedules opens the flash offer on the
JIDs the run actually enqueued. A guard aborts if either rewritten body in
the database differs from the repo. broadcasts.target_rule,
campaign_groups.aviso_ao_lotar(_desde), group_bulk_jobs.subject and the
set_subject action are added for the next PRs.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 5: ordem de aplicação e o teste de privilégio

**Files:**
- Modify: `deploy/supabase/apply-order.txt` (fim do arquivo)
- Test: `apps/web/src/lib/supabase/privilegio-definer.test.ts` (existente, não muda)

**Interfaces:**
- Consumes: a migração da Task 4.
- Produces: a migração na ordem de aplicação — o que `privilegio-definer.test.ts` e `capture-transaction.test.ts` varrem (exigem `revoke … from … authenticated` na **última** migração que toca cada função `security definer` de `public`).

- [ ] **Step 1: `apply-order.txt`** — acrescentar ao **fim** do arquivo, exatamente:

```txt
# 2026-10-10 - Postar por grupo, PR 1 (spec 2026-10-10-postar-por-grupo-design §5): marca de
# lotado em groups (lotado_em/lotado_por/reaberto_em/aviso_lotou_em + trigger
# groups_marca_lotado + backfill dos ja cheios, sem aviso), aviso ao lotar em campaign_groups,
# broadcasts.target_rule, group_bulk_jobs.subject (+ 'set_subject' na CHECK de action), estado
# e regras em app (limiar_lotado, grupo_na_regra, estados_da_campanha, alvos_da_regra,
# alvos_do_disparo), RPCs campaign_group_states / marcar_grupo_lotado / reabrir_grupo /
# enviar_avisos_lotou (execute so service_role) e create or replace de app.enqueue_broadcast
# e app.promote_due_schedules. Trava no topo: aborta se o corpo de uma das duas no banco
# diferir do repo. Muda a baseline (t|groups, t|campaign_groups, t|broadcasts,
# t|group_bulk_jobs e quatro f|). O gate nao ve schema app, CHECK, indice, trigger, ACL nem
# corpo — conferir com infra/tests/postar-por-grupo-check.sql nos dois bancos.
apps/web/supabase/migrations/20261010120000_postar_por_grupo.sql
```

- [ ] **Step 2: os testes que varrem a apply-order.**

```bash
WT="$(git rev-parse --show-toplevel)"; cd "$WT/apps/web" && npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/supabase/privilegio-definer.test.ts src/lib/pages/capture-transaction.test.ts
```

Esperado: PASS, `# fail 0`.

- [ ] **Step 3: o mutante** (o teste precisa enxergar as funções novas, senão o verde não prova nada). Tire o revoke de `reabrir_grupo`, rode, devolva:

```bash
WT="$(git rev-parse --show-toplevel)"; sed -i '/^revoke all on function public.reabrir_grupo(/d' "$WT/apps/web/supabase/migrations/20261010120000_postar_por_grupo.sql"; cd "$WT/apps/web" && npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/supabase/privilegio-definer.test.ts; git -C "$WT" checkout -- apps/web/supabase/migrations/20261010120000_postar_por_grupo.sql; git -C "$WT" diff --stat apps/web/supabase/migrations/20261010120000_postar_por_grupo.sql
```

Esperado: o teste **falha** com `reabrir_grupo  (última que a toca: apps/web/supabase/migrations/20261010120000_postar_por_grupo.sql)` na lista; depois do `checkout`, o `diff --stat` sai vazio.

- [ ] **Step 4: commit.**

```bash
WT="$(git rev-parse --show-toplevel)"; git -C "$WT" add deploy/supabase/apply-order.txt
```
```bash
WT="$(git rev-parse --show-toplevel)"; git -C "$WT" diff --cached --stat
```

Esperado: 1 arquivo, só linhas acrescentadas.

```bash
WT="$(git rev-parse --show-toplevel)"; git -C "$WT" commit -F - <<'EOF'
chore(db): apply order for postar por grupo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 6: o claim legado nunca pega disparo com regra (TDD)

**Files:**
- Create: `apps/web/src/lib/stores/broadcasts.test.ts`
- Modify: `apps/web/src/lib/stores/broadcasts.ts` (`claimPendingBroadcasts`, ~linhas 212–235)

**Interfaces:**
- Consumes: `claimPendingBroadcasts(tenantId: string, limit = 10): Promise<Broadcast[]>` (existente); `getSupabaseAdmin()` lê `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` na primeira chamada.
- Produces: a mesma assinatura; o `PATCH /rest/v1/broadcasts` do claim passa a levar `target_rule=is.null` (spec §5.5). Depende da coluna da Task 4 — o merge só sai depois da DDL nos dois bancos (Task 10).

- [ ] **Step 1: o teste (RED)** — `apps/web/src/lib/stores/broadcasts.test.ts`:

```ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { claimPendingBroadcasts } from "./broadcasts";

/**
 * O cliente real do Supabase contra um PostgREST de mentira (o desenho de
 * `broadcast-deliveries.test.ts`): prova, sem banco, o que o claim do motor legado
 * (`/api/dispatch/pending`) pede. Ele só pega `run_id is null`, e `enqueue_broadcast`
 * sempre grava run_id — mas um disparo com regra de destino (`target_rule`) tem
 * `group_ids` vazio, e o motor legado leria `group_ids` vazio como "todos os grupos"
 * (spec 2026-10-10-postar-por-grupo §5.5).
 */

const pedidos: Array<{ metodo: string; url: URL }> = [];

const postgrest = createServer((req, res) => {
  pedidos.push({ metodo: req.method ?? "", url: new URL(req.url ?? "/", "http://postgrest.falso") });
  res.setHeader("Content-Type", "application/json");
  res.end("[]");
});

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
});

after(() => {
  postgrest.close();
});

test("o claim legado só pega disparo da loja, na fila, sem run_id e sem regra de destino", async () => {
  pedidos.length = 0;

  assert.deepEqual(await claimPendingBroadcasts("loja-a"), []);

  assert.equal(pedidos.length, 1);
  const pedido = pedidos[0];
  assert.ok(pedido, "nenhum pedido chegou ao PostgREST");
  assert.equal(pedido.metodo, "PATCH");
  assert.equal(pedido.url.pathname, "/rest/v1/broadcasts");
  // Mutante: sem este filtro, disparo com regra e group_ids vazio iria para TODOS os grupos.
  assert.equal(pedido.url.searchParams.get("target_rule"), "is.null");
  // Mutantes antigos: sem run_id o legado reenviaria o que o worker novo enfileirou;
  // sem tenant, claimaria disparo de outra loja.
  assert.equal(pedido.url.searchParams.get("run_id"), "is.null");
  assert.equal(pedido.url.searchParams.get("tenant_id"), "eq.loja-a");
  assert.equal(pedido.url.searchParams.get("status"), "eq.queued");
});
```

```bash
WT="$(git rev-parse --show-toplevel)"; cd "$WT/apps/web" && npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/broadcasts.test.ts
```

Esperado: FAIL em `target_rule` — `actual: null`, `expected: 'is.null'`.

- [ ] **Step 2: o guarda (GREEN)** — em `apps/web/src/lib/stores/broadcasts.ts`, troque

```ts
 * claimaria a mesma linha e enviaria tudo de novo. Oferta com `run_id` é do motor
 * novo e o legado ignora — por isso os dois podem ficar vivos ao mesmo tempo.
 */
```

por

```ts
 * claimaria a mesma linha e enviaria tudo de novo. Oferta com `run_id` é do motor
 * novo e o legado ignora — por isso os dois podem ficar vivos ao mesmo tempo.
 *
 * `target_rule is null` pelo mesmo motivo: disparo com regra de destino tem
 * `group_ids` vazio, que o motor legado lê como "todos os grupos".
 */
```

e, no corpo, troque

```ts
    .is("run_id", null)
    .order("created_at", { ascending: true })
```

por

```ts
    .is("run_id", null)
    .is("target_rule", null)
    .order("created_at", { ascending: true })
```

```bash
WT="$(git rev-parse --show-toplevel)"; cd "$WT/apps/web" && npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/broadcasts.test.ts
```

Esperado: PASS, `# pass 1`, `# fail 0`.

- [ ] **Step 3: commit.**

```bash
WT="$(git rev-parse --show-toplevel)"; git -C "$WT" add apps/web/src/lib/stores/broadcasts.ts apps/web/src/lib/stores/broadcasts.test.ts
```
```bash
WT="$(git rev-parse --show-toplevel)"; git -C "$WT" diff --cached --stat
```

Esperado: 2 arquivos.

```bash
WT="$(git rev-parse --show-toplevel)"; git -C "$WT" commit -F - <<'EOF'
fix(dispatch): legacy claim never takes rule-targeted broadcasts

A broadcast with target_rule has empty group_ids, which the legacy engine
reads as "every group". enqueue_broadcast always sets run_id so it never
reaches this claim today; the filter makes that structural.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 7: o que a aplicação precisa (arquivos temporários, fora do repo)

**Files:** nenhum arquivo do repo. Cria em `C:/Users/Igor/AppData/Local/Temp/`: `postar-grupo-assinatura.sql`, `postar-grupo-baseline.mjs`, `postar-grupo-trava.sql`, `postar-grupo-rollback-dev.sql`.

**Interfaces:**
- Consumes: a migração (Task 4), `deploy/supabase/schema-baseline.json`, `public.schema_signature()`.
- Produces, para a Task 10:
  - `postar-grupo-assinatura.sql` → objeto `r` com `assinatura` (as 8 chaves que mudam) e `assinatura_total` (`{objetos, md5}` do schema inteiro, ordem `collate "C"`);
  - `postar-grupo-baseline.mjs <assinatura-prod.json> <assinatura-dev.json>` → regrava a baseline só se o md5 do schema inteiro bater com prod;
  - `postar-grupo-trava.sql` → o bloco 0 da migração, sozinho (só lê);
  - `postar-grupo-rollback-dev.sql` → desfaz a migração num banco (para o dev, se o prod falhar).

- [ ] **Step 1: a assinatura** — ferramenta Write em `C:/Users/Igor/AppData/Local/Temp/postar-grupo-assinatura.sql`:

```sql
-- Assinatura do gate de drift (schema_signature) depois do PR 1 do postar por grupo. Só leitura.
-- "assinatura": as 8 chaves que a migração 20261010120000 muda. "assinatura_total": o schema
-- inteiro; o de prod é a prova da baseline (deploy/supabase/schema-baseline.json).
select json_build_object(
  'assinatura', (
    select json_object_agg(s.kind || '|' || s.nome, s.sig)
    from public.schema_signature() as s
    where (s.kind = 't' and s.nome in ('groups', 'campaign_groups', 'broadcasts', 'group_bulk_jobs'))
       or (s.kind = 'f' and (s.nome like 'campaign_group_states(%' or s.nome like 'marcar_grupo_lotado(%'
                             or s.nome like 'reabrir_grupo(%' or s.nome like 'enviar_avisos_lotou(%'))),
  'assinatura_total', (
    select json_build_object(
      'objetos', count(*),
      'md5', md5(string_agg(x.chave || '=' || x.sig, ',' order by x.chave collate "C")))
    from (select s.kind || '|' || s.nome as chave, s.sig from public.schema_signature() as s) as x)
) as r;
```

- [ ] **Step 2: o script da baseline** — ferramenta Write em `C:/Users/Igor/AppData/Local/Temp/postar-grupo-baseline.mjs`:

```js
// node postar-grupo-baseline.mjs <assinatura-prod.json> <assinatura-dev.json>   (cwd = raiz do worktree)
// Sem chave de prod no shell: as 8 chaves que mudaram vêm da assinatura de prod, e o arquivo só é
// gravado se o md5 do schema INTEIRO bater com o de prod (prova que as outras chaves continuam iguais).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

const BASELINE = "deploy/supabase/schema-baseline.json";
const CHAVES = [
  "f|campaign_group_states(p_tenant uuid, p_campaign uuid)",
  "f|enviar_avisos_lotou(p_limit integer)",
  "f|marcar_grupo_lotado(p_tenant uuid, p_group uuid)",
  "f|reabrir_grupo(p_tenant uuid, p_group uuid)",
  "t|broadcasts",
  "t|campaign_groups",
  "t|group_bulk_jobs",
  "t|groups",
];

/** Saída de `supabase db query -o json` via Out-File: BOM, e às vezes linha estranha antes ou depois. */
function lerR(caminho) {
  const linhas = readFileSync(caminho, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/);
  for (let ini = 0; ini < linhas.length; ini++) {
    for (let fim = linhas.length; fim > ini; fim--) {
      let bruto;
      try {
        bruto = JSON.parse(linhas.slice(ini, fim).join("\n"));
      } catch {
        continue;
      }
      const linha = Array.isArray(bruto) ? bruto[0] : Array.isArray(bruto?.rows) ? bruto.rows[0] : bruto;
      const r = linha?.r ?? linha;
      return typeof r === "string" ? JSON.parse(r) : r;
    }
  }
  throw new Error(`sem JSON legível em ${caminho}`);
}

const prod = lerR(process.argv[2]);
const dev = lerR(process.argv[3]);
const novas = prod?.assinatura ?? {};
if (!isDeepStrictEqual(Object.keys(novas).sort(), [...CHAVES].sort())) {
  throw new Error(`chaves inesperadas em assinatura de prod: ${Object.keys(novas).join(" | ")}`);
}
if (!isDeepStrictEqual(novas, dev?.assinatura)) {
  throw new Error("assinatura de dev != prod nos objetos deste PR: os bancos divergem");
}

const base = JSON.parse(readFileSync(BASELINE, "utf8"));
const objetos = { ...base.objetos, ...novas };
// Ordem de code point = collate "C" do Postgres (as chaves são ASCII).
const chaves = Object.keys(objetos).sort();
const md5 = createHash("md5").update(chaves.map((k) => `${k}=${objetos[k]}`).join(",")).digest("hex");
const totalProd = Number(prod.assinatura_total?.objetos);
const md5Prod = prod.assinatura_total?.md5;
if (md5 !== md5Prod || chaves.length !== totalProd) {
  console.error(`NAO bate com prod: aqui ${chaves.length} objetos/${md5}, prod ${totalProd}/${md5Prod}.`);
  console.error("Outra coisa mudou em prod desde a baseline do checkout - investigar, nao forcar.");
  process.exit(1);
}

// Mesma disposição do arquivo gerado por `npm run schema:baseline` (ordem linguística).
const ordenado = Object.fromEntries(
  Object.keys(objetos).sort((a, b) => a.localeCompare(b)).map((k) => [k, objetos[k]]),
);
// gerado_em de agora: o md5 prova o snapshot INTEIRO de prod, não só as 8 chaves.
const nova = { gerado_em: new Date().toISOString(), projeto: base.projeto, objetos: ordenado };
writeFileSync(BASELINE, `${JSON.stringify(nova, null, 2)}\n`, "utf8");
console.log(`baseline gravada: ${chaves.length} objetos, md5 ${md5} = prod`);
```

```bash
node --check C:/Users/Igor/AppData/Local/Temp/postar-grupo-baseline.mjs && echo sintaxe-ok
```

Esperado: `sintaxe-ok`.

- [ ] **Step 3: trava e rollback, gerados da migração e do repo** (nada copiado à mão):

```bash
WT="$(git rev-parse --show-toplevel)"; cd "$WT" && node - <<'EOF'
const fs = require("fs");
const T = "C:/Users/Igor/AppData/Local/Temp";
const semCr = (s) => s.replace(/\r\n/g, "\n");

// Trava: o bloco 0 da migração, igual (o primeiro do $$ ... end $$;).
const mig = semCr(fs.readFileSync("apps/web/supabase/migrations/20261010120000_postar_por_grupo.sql", "utf8"));
const ini = mig.indexOf("do $$");
const fim = mig.indexOf("end $$;", ini) + "end $$;".length;
if (ini < 0 || fim <= ini) throw new Error("trava não encontrada na migração");
fs.writeFileSync(`${T}/postar-grupo-trava.sql`,
  "-- Trava do PR 1 do postar por grupo, copiada da migração 20261010120000. Só lê: erro = parar.\n"
  + mig.slice(ini, fim) + "\n");

// Rollback: corpos antigos das duas funções, recortados do repo.
const linhas = (f) => semCr(fs.readFileSync(f, "utf8")).split("\n");
const enq = linhas("apps/web/supabase/migrations/20260730100000_dispatch_fanout.sql").slice(52, 218);
const pro = linhas("apps/web/supabase/migrations/20260930120000_agendamento_perdeu_a_hora.sql").slice(24, 176);
if (!enq[0].startsWith("create or replace function app.enqueue_broadcast(") || enq[enq.length - 1] !== "$$;") {
  throw new Error("recorte de enqueue_broadcast errado");
}
if (!pro[0].startsWith("CREATE OR REPLACE FUNCTION app.promote_due_schedules(") || pro[pro.length - 1] !== "$function$;") {
  throw new Error("recorte de promote_due_schedules errado");
}
const rollback = `-- Desfaz 20261010120000_postar_por_grupo num banco. Usar no DEV só se o PROD falhar depois de o dev
-- ter sido aplicado (dev à frente da baseline deixa o drift vermelho para todo PR). Perde só as marcas
-- de lotado e colunas vazias deste PR; nenhum dado de cliente.
set lock_timeout = '5s';

${enq.join("\n")}

${pro.join("\n")}

revoke all on function app.enqueue_broadcast(uuid, uuid) from public, anon, authenticated;
grant execute on function app.enqueue_broadcast(uuid, uuid) to service_role;
revoke all on function app.promote_due_schedules(integer) from public, anon, authenticated;
grant execute on function app.promote_due_schedules(integer) to service_role;

drop trigger if exists groups_marca_lotado on public.groups;
drop function if exists public.enviar_avisos_lotou(integer);
drop function if exists public.reabrir_grupo(uuid, uuid);
drop function if exists public.marcar_grupo_lotado(uuid, uuid);
drop function if exists public.campaign_group_states(uuid, uuid);
drop function if exists app.alvos_do_disparo(public.broadcasts);
drop function if exists app.alvos_da_regra(uuid, uuid, text);
drop function if exists app.estados_da_campanha(uuid, uuid);
drop function if exists app.grupo_na_regra(text, boolean, text);
drop function if exists app.groups_marca_lotado();
drop function if exists app.limiar_lotado(integer);
drop index if exists public.groups_aviso_lotou_pendente_idx;
alter table public.group_bulk_jobs drop constraint if exists group_bulk_jobs_action_check;
alter table public.group_bulk_jobs
  add constraint group_bulk_jobs_action_check
  check (action = any (array['set_description', 'set_picture', 'open', 'close', 'check_invite', 'remove_participant']));
alter table public.group_bulk_jobs drop column if exists subject;
alter table public.broadcasts drop constraint if exists broadcasts_target_rule_check;
alter table public.broadcasts drop column if exists target_rule;
alter table public.campaign_groups drop column if exists aviso_ao_lotar_desde, drop column if exists aviso_ao_lotar;
alter table public.groups drop constraint if exists groups_lotado_por_check;
alter table public.groups
  drop column if exists aviso_lotou_em, drop column if exists reaberto_em,
  drop column if exists lotado_por, drop column if exists lotado_em;

notify pgrst, 'reload schema';
`;
fs.writeFileSync(`${T}/postar-grupo-rollback-dev.sql`, rollback);
console.log("trava e rollback gravados");
EOF
```

Esperado: `trava e rollback gravados`. Se a Task 4, Step 3 trocou um corpo pelo de dev, troque no rollback o recorte daquela função pelo corpo de dev (o que estava no banco antes).

```bash
head -c 400 C:/Users/Igor/AppData/Local/Temp/postar-grupo-trava.sql; echo; grep -c "^drop function if exists" C:/Users/Igor/AppData/Local/Temp/postar-grupo-rollback-dev.sql
```

Esperado: a trava começa pelo comentário e `do $$`; `10` drops de função.

### Task 8: verificação local e revisão

**Files:** nenhum novo.

**Interfaces:**
- Consumes: os commits das Tasks 3–6.
- Produces: a branch pronta para o push, alcançada com a `main`, com o gate local verde e revisão sem CRITICAL/HIGH.

- [ ] **Step 1: tipos, lint e suíte.**

```bash
WT="$(git rev-parse --show-toplevel)"; cd "$WT" && npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.json && npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.e2e.json && npm --workspace apps/web run lint && npm test
```

Esperado: tudo verde; os `*.integration.test.ts` passam por `pular()` (sem `E2E_TENANT_ID`).

- [ ] **Step 2: alcançar a `main`** (`finding-baseline-drift-entre-prs-paralelos`: o `drift` compara o dev vivo com a baseline **do checkout do PR**).

```bash
WT="$(git rev-parse --show-toplevel)"; git -C "$WT" fetch origin main; git -C "$WT" log HEAD..origin/main --oneline
```

Se vier commit: `git -C "$WT" merge origin/main`. Conflito em `apply-order.txt` → manter as entradas dos dois lados, na ordem cronológica dos nomes de arquivo (a deste PR fica onde a data dela manda). Se a `main` trouxe migração nova que reescreve `app.enqueue_broadcast` ou `app.promote_due_schedules`: pare — a Task 4 tem de partir do corpo novo (e das constantes da trava). Depois do merge, rode o Step 1 de novo.

- [ ] **Step 3: o gate real** (ferramenta PowerShell; sem `2>&1`):

```powershell
$WT = (git rev-parse --show-toplevel); & "$WT/infra/scripts/verify-local.ps1" | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
```

Esperado: `Verificacao local concluida com sucesso.` e `EXIT=0`.

- [ ] **Step 4: revisão.** Despache o agente `ecc:database-reviewer` com o diff `git -C "$WT" diff origin/main...HEAD` (worktree e branch no prompt), pedindo atenção a: filtro de `tenant_id` em toda leitura/escrita das funções novas (o service-role ignora RLS); a trava (md5/marca) e as duas trocas (diff da Task 4, Step 2); trigger no caminho do upsert (`before insert` na linha proposta); `for update of g skip locked` com o `lateral` em `enviar_avisos_lotou`; `set search_path = ''` com nomes qualificados; ACL das 12 funções; idempotência. Corrija CRITICAL/HIGH (commit novo, Steps 1–3 de novo) antes da Task 9.

### Task 9: push e PR

**Files:** nenhum no repo (cria `C:/Users/Igor/AppData/Local/Temp/pr-postar-grupo-banco.md`).

**Interfaces:**
- Consumes: a branch verificada da Task 8.
- Produces: o PR aberto (número `<N>`), consumido pela Task 10.

- [ ] **Step 1: corpo do PR** — ferramenta Write em `C:/Users/Igor/AppData/Local/Temp/pr-postar-grupo-banco.md` (troque `<cheios_dev>` pelo valor da Task 2, ou apague a frase se a Task 2 não rodou):

````markdown
PR 1 de 9 do **postar por grupo** (spec `docs/superpowers/specs/2026-10-10-postar-por-grupo-design.md` §5.1–5.7; contratos em `docs/superpowers/plans/2026-10-10-postar-por-grupo-00-contratos.md` §1; plano `docs/superpowers/plans/2026-10-10-postar-por-grupo-pr1-banco.md`).

## O que muda no banco (`20261010120000_postar_por_grupo.sql`)

- `groups`: `lotado_em`, `lotado_por` (`auto`/`manual`), `reaberto_em`, `aviso_lotou_em` + índice parcial do varredor do aviso.
- Trigger `groups_marca_lotado` (`before insert or update of members, capacity`): marca o grupo que cruza 95% subindo (e limpa `reaberto_em`) e o que nasce cheio (já com `aviso_lotou_em`). Nunca limpa a marca.
- Backfill: grupo já cheio ganha a marca **sem aviso** (aparece como "Lotou hoje"). Em dev eram <cheios_dev>.
- `campaign_groups.aviso_ao_lotar` / `aviso_ao_lotar_desde`; `broadcasts.target_rule` (`menos_enchendo` | `lotados` | `com_gente`; sem CHECK amarrando à campanha, a FK é `on delete set null`); `group_bulk_jobs.subject` + `'set_subject'` na CHECK de `action`.
- Estado e regras num lugar só: `app.limiar_lotado`, `app.grupo_na_regra`, `app.estados_da_campanha`, `app.alvos_da_regra`, `app.alvos_do_disparo`.
- RPCs (execute só `service_role`): `campaign_group_states`, `marcar_grupo_lotado`, `reabrir_grupo`, `enviar_avisos_lotou`.
- `app.enqueue_broadcast`: destinos por `app.alvos_do_disparo` (sem regra = predicado de antes; com regra e zero grupos = `failed` "Nenhum grupo nesta regra agora.").
- `app.promote_due_schedules`: a Oferta Relâmpago escuta os JIDs que o run enfileirou (antes copiava o predicado).
- Trava no topo: a migração aborta se o corpo de uma das duas funções no banco diferir do repo.
- Claim legado (`claimPendingBroadcasts`): `.is("target_rule", null)`.

## O que o lojista vê

Nada ainda: o link (TS) ignora `lotado_em` até o PR 2 e nenhum disparo tem `target_rule` até o PR 5.

## Aplicação (Igor) — Task 10 do plano

Trava + card em prod → DDL + check em dev → DDL + check em prod → baseline (commit neste PR) → `npm run check:drift` → CI verde → merge. Da DDL em dev até o merge, sem parar: nesse intervalo o job `drift` de todo PR aberto fica vermelho.

## Testes

- `infra/tests/postar-por-grupo-check.sql` (transação + rollback, nos dois bancos): estrutura, ACL das 14 funções, backfill; nasce cheio; estados na ordem do pool (repetido, ausente, vazio, não-admin); as três regras; cruzar subindo/descendo/pela capacidade; reabrir bloqueado/liberado; marcar; upsert do sync; prioridade do reaberto; outra loja; disparo com e sem regra; campanha apagada → `failed`; Oferta Relâmpago nos JIDs do run; aviso uma vez por grupo (inclusive em duas campanhas), não retroativo, não repete ao reabrir; grupo elegível onde não somos admin é marcado sem envio (retorno 0) e não recebe atrasado se o número virar admin.
- `apps/web/src/lib/stores/broadcasts.test.ts` (PostgREST falso): claim legado com `target_rule=is.null`.
- `privilegio-definer.test.ts` (com mutante), tsc ×2, lint, `npm test`, `infra/scripts/verify-local.ps1`.

## Plano de teste

- [ ] Trava em prod sem erro
- [ ] Migração + check em dev (exit 0)
- [ ] Migração + check em prod (exit 0)
- [ ] Advisor de segurança sem lint novo das funções deste PR
- [ ] Baseline regravada (md5 = prod) e `npm run check:drift` → "Sem drift fora da allowlist."
- [ ] CI verde (`verify`, `drift`, `advisors`, `e2e`)

## Para os próximos PRs

- PR 6: o fixture do check repete `pg-a@g.us` em duas campanhas da mesma loja (o conflito legado de D4). Com o trigger de exclusividade, quem rodar este check depois do PR 6 desliga o trigger dentro da transação.
- O teste de integração `campaign-group-states.integration.test.ts` (spec §8) fica com o PR que cria o store (PR 2).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
````

- [ ] **Step 2: push.**

```bash
WT="$(git rev-parse --show-toplevel)"; git -C "$WT" push -u origin feat/postar-grupo-banco
```

Se o classificador negar: não tente outra variação; o push vai para o topo das pendências (Task 10, Step 1).

- [ ] **Step 3: PR.**

```bash
gh pr create --repo codingB0y/Girumo --base main --head feat/postar-grupo-banco --title "feat(db): lotado mark, destination rules and group state RPCs (postar por grupo PR 1)" --body-file "C:/Users/Igor/AppData/Local/Temp/pr-postar-grupo-banco.md"
```

Anote o número `<N>`. Se o classificador negar (aconteceu em 07–08/10): o comando vai para as pendências (Task 10, Step 1).

### Task 10: Pendências para o Igor

**Files:**
- Modify (no Step 5, pelo script): `deploy/supabase/schema-baseline.json`

**Interfaces:**
- Consumes: a migração, o check e a apply-order no PR `<N>`; os quatro arquivos temporários da Task 7; o `WT` da Task 1.
- Produces: o schema novo em dev e prod, a baseline nova commitada no PR, o PR mergeado e o card `postar-por-grupo` em `em_construcao`.

O executor entrega os blocos abaixo **com `<WT>` e `<N>` já trocados pelos valores reais** e para aqui. Os blocos rodam no PowerShell do Igor, em ordem. Se a sessão do executor continuar viva, o Igor cola a saída de cada bloco e o executor confere (e roda ele mesmo os Steps 5 e 6, que não tocam banco).

- [ ] **Step 1: o card (e push/PR, se a Task 9 foi barrada).** O executor cria com a ferramenta Write `C:/Users/Igor/AppData/Local/Temp/postar-grupo-card.sql`, com o número do PR:

```sql
-- Card do quadro (PROD). Cria se ainda não existe e move. Motivo obrigatório (trigger do feed).
insert into public.board_features (key, title, area, summary)
values ('postar-por-grupo',
        'Postar por grupo (lotado, destino por regra, padronizar, aviso ao lotar)',
        'Grupos',
        'Marca de lotado no grupo, post para todos menos o que está enchendo (regra refeita no envio), padronizar nomes e sequência, aviso ao lotar. Spec docs/superpowers/specs/2026-10-10-postar-por-grupo-design.md; 9 PRs.')
on conflict (key) do nothing;

select public.move_card('postar-por-grupo', 'em_construcao',
  'PR 1 (banco) começou: aplicando 20261010120000_postar_por_grupo nos dois bancos (marca de lotado, regras de destino, RPCs, aviso ao lotar)',
  'PR #<N>');
```

Se a Task 9 foi barrada, o primeiro bloco do Igor é:

```powershell
git -C "<WT>" push -u origin feat/postar-grupo-banco
gh pr create --repo codingB0y/Girumo --base main --head feat/postar-grupo-banco --title "feat(db): lotado mark, destination rules and group state RPCs (postar por grupo PR 1)" --body-file "C:\Users\Igor\AppData\Local\Temp\pr-postar-grupo-banco.md"
```

- [ ] **Step 2: PROD — trava e card, antes de qualquer DDL** (só leitura + o card). Se a trava falhar, **pare tudo** e devolva a mensagem ao executor (Task 4, Step 3 com o corpo do banco que falhou):

```powershell
Set-Location "<WT>\apps\web"
supabase link --project-ref nidoatbxaylrkcgbszns --yes
if ($LASTEXITCODE -eq 0) { supabase db query --linked -f "C:\Users\Igor\AppData\Local\Temp\postar-grupo-trava.sql" }
if ($LASTEXITCODE -eq 0) { supabase db query --linked -f "C:\Users\Igor\AppData\Local\Temp\postar-grupo-card.sql" }
"EXIT=$LASTEXITCODE"
supabase link --project-ref wfjuwogxaupyadwhvoxy --yes
```

Esperado: `EXIT=0`.

- [ ] **Step 3: DEV — migração, check, assinatura, advisor.** O `if` impede seguir quando um passo falha (e impede aplicar no banco que estava ligado antes):

```powershell
Set-Location "<WT>\apps\web"
supabase link --project-ref wfjuwogxaupyadwhvoxy --yes
if ($LASTEXITCODE -eq 0) { supabase db query --linked -f supabase\migrations\20261010120000_postar_por_grupo.sql }
if ($LASTEXITCODE -eq 0) { supabase db query --linked -f ..\..\infra\tests\postar-por-grupo-check.sql }
if ($LASTEXITCODE -eq 0) { supabase db query --linked -o json -f "C:\Users\Igor\AppData\Local\Temp\postar-grupo-assinatura.sql" | Out-File -Encoding utf8 "C:\Users\Igor\AppData\Local\Temp\postar-grupo-assinatura-dev.json" }
if ($LASTEXITCODE -eq 0) { supabase db advisors --linked --type security --output-format json }
"EXIT=$LASTEXITCODE"
```

Esperado: `EXIT=0`; no advisor (só a primeira linha é JSON), nenhum lint novo citando `campaign_group_states`, `marcar_grupo_lotado`, `reabrir_grupo`, `enviar_avisos_lotou`, `groups`, `campaign_groups`, `broadcasts` ou `group_bulk_jobs` além do que já está em `deploy/supabase/advisors-allowlist.json`. Erro na migração: nada foi gravado (a migração roda numa transação); o executor corrige, faz commit novo e o Igor roda o mesmo bloco de novo (é idempotente). Erro `FALHOU …` no check: **não siga para prod**; o executor corrige a migração (commit novo) e o Igor roda este bloco de novo.

- [ ] **Step 4: PROD — o mesmo, logo em seguida** (sem pausa: a partir do Step 3 o `drift` de todo PR aberto está vermelho). Ao final o link volta para dev:

```powershell
Set-Location "<WT>\apps\web"
supabase link --project-ref nidoatbxaylrkcgbszns --yes
if ($LASTEXITCODE -eq 0) { supabase db query --linked -f supabase\migrations\20261010120000_postar_por_grupo.sql }
if ($LASTEXITCODE -eq 0) { supabase db query --linked -f ..\..\infra\tests\postar-por-grupo-check.sql }
if ($LASTEXITCODE -eq 0) { supabase db query --linked -o json -f "C:\Users\Igor\AppData\Local\Temp\postar-grupo-assinatura.sql" | Out-File -Encoding utf8 "C:\Users\Igor\AppData\Local\Temp\postar-grupo-assinatura-prod.json" }
if ($LASTEXITCODE -eq 0) { supabase db advisors --linked --type security --output-format json }
"EXIT=$LASTEXITCODE"
supabase link --project-ref wfjuwogxaupyadwhvoxy --yes
```

Mesma conferência do Step 3. Se o prod falhar e não der para corrigir na hora, desfaça o dev:

```powershell
Set-Location "<WT>\apps\web"
supabase link --project-ref wfjuwogxaupyadwhvoxy --yes
if ($LASTEXITCODE -eq 0) { supabase db query --linked -f "C:\Users\Igor\AppData\Local\Temp\postar-grupo-rollback-dev.sql" }
"EXIT=$LASTEXITCODE"
```

- [ ] **Step 5: baseline** (não toca banco: o executor roda, se estiver vivo; senão, o Igor):

```powershell
Set-Location "<WT>"
node "C:\Users\Igor\AppData\Local\Temp\postar-grupo-baseline.mjs" "C:\Users\Igor\AppData\Local\Temp\postar-grupo-assinatura-prod.json" "C:\Users\Igor\AppData\Local\Temp\postar-grupo-assinatura-dev.json"
if ($LASTEXITCODE -eq 0) { git diff --stat deploy/supabase/schema-baseline.json }
```

Esperado: `baseline gravada: 118 objetos, md5 … = prod` (114 em 09/10 + 4 funções; se a `main` trouxe outra baseline, o número muda — vale o que o md5 provar) e `1 file changed`: `gerado_em`, as 4 chaves `t|` trocadas e as 4 `f|` novas. Se o script recusar, **não** edite o arquivo à mão; alternativa com a chave de prod no ambiente: `Set-Location "<WT>"; $env:SUPABASE_URL = "https://nidoatbxaylrkcgbszns.supabase.co"; $env:SUPABASE_SERVICE_ROLE_KEY = "<service-role de PROD>"; npm run schema:baseline; Remove-Item env:SUPABASE_SERVICE_ROLE_KEY, env:SUPABASE_URL`.

Antes do commit, alcançar a `main` de novo:

```powershell
Set-Location "<WT>"
git fetch origin main
git log HEAD..origin/main --oneline
```

Se vier commit: `git merge origin/main`. Conflito em `schema-baseline.json` → `git checkout --theirs deploy/supabase/schema-baseline.json` (a da `main`), rodar o Step 4 de novo só com a linha da assinatura (link ida e volta) e repetir o `node` acima.

```powershell
Set-Location "<WT>"
git add deploy/supabase/schema-baseline.json
git diff --cached --stat
```
```powershell
Set-Location "<WT>"
git commit -m "chore(db): schema baseline with postar por grupo" -m "groups, campaign_groups, broadcasts and group_bulk_jobs change shape; four public functions are new. Whole-schema md5 matches production." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
if ($LASTEXITCODE -eq 0) { git push }
```

- [ ] **Step 6: o gate de drift local** (credencial de **dev** do `.env.local` do checkout principal; se o arquivo não existir, o job `drift` do CI faz a mesma prova):

```powershell
Get-Content "C:\Users\Igor\Desktop\HubFlow-platform\apps\web\.env.local" | Where-Object { $_ -match '^(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=' } | ForEach-Object { $k, $v = $_ -split '=', 2; Set-Item -Path "env:$k" -Value $v.Trim().Trim('"') }
if ($env:SUPABASE_URL -notmatch 'wfjuwogxaupyadwhvoxy') { "SUPABASE_URL nao e o dev: pare" } else { Set-Location "<WT>"; npm run check:drift }
Remove-Item env:SUPABASE_SERVICE_ROLE_KEY, env:SUPABASE_URL
```

Esperado: `Sem drift fora da allowlist.` — prova de uma vez que a baseline está certa e que dev = prod.

- [ ] **Step 7: CI e merge** (a `main` não tem proteção: merge só à mão, no verde, e só com a DDL nos dois bancos e a baseline commitada):

```powershell
gh pr checks <N> --repo codingB0y/Girumo --watch
```

Conferir `verify`, `drift`, `advisors` e `e2e` verdes.

```powershell
gh pr merge <N> --repo codingB0y/Girumo --squash --delete-branch
```

- [ ] **Step 8: registrar a decisão no grafo.** O executor chama `kg_insert_text` (source `decisao-2026-10-10-postar-por-grupo-banco`) com o texto abaixo; se o MCP travar, entrega ao Igor:

```powershell
Set-Location "C:\Users\Igor\Desktop\HubFlow-platform"; .\tools\lightrag\.venv\Scripts\rag.exe insert "decisão: postar por grupo (PR 1, banco). Estado do grupo na campanha (lotado/enchendo/fila/vazio) e regras de destino (menos_enchendo/lotados/com_gente) existem só em SQL: app.estados_da_campanha + app.grupo_na_regra, lidos por public.campaign_group_states e por app.alvos_do_disparo (enqueue_broadcast). Lotado é marca gravada (groups.lotado_em) pelo trigger groups_marca_lotado ao cruzar 95% subindo ou ao nascer cheio (com aviso_lotou_em); só reabrir_grupo limpa. A Oferta Relâmpago agendada escuta os JIDs que o run enfileirou (engine_commands.origin_run_id), não uma cópia do predicado. enviar_avisos_lotou envia uma vez por grupo; grupo elegível onde o número não é admin é marcado (aviso_lotou_em) sem envio, para não sair atrasado se virar admin. Migração que reescreve função aplicada à mão leva trava de md5 normalizado do prosrc." --source decisao-2026-10-10-postar-por-grupo-banco
```

- [ ] **Step 9: encerrar** com "PRs que deixei abertos: #<N> (esperando a DDL do Igor nos dois bancos e o merge)" — ou "nenhum", se o merge já saiu. O card fica em `em_construcao` (PR 1 de 9); os PRs 2, 4, 6, 7 e 9 dependem deste mergeado e aplicado.

---

## Cobertura do spec

| Spec | Onde |
|---|---|
| §5.1 colunas, CHECKs (sem CHECK regra×campanha), índice parcial | Task 4 bloco 1 · check blocos 1, 2 |
| §5.2 `limiar_lotado`, `grupo_na_regra`, `estados_da_campanha`, `alvos_da_regra`, `campaign_group_states` | Task 4 blocos 2, 5 · check blocos 2, 5, 6 |
| §5.3 trigger (insert cheio, cruzar subindo, nunca limpa) | Task 4 bloco 3 · check blocos 2, 3, 4 |
| §5.4 `marcar_grupo_lotado`, `reabrir_grupo` (condição no `where`) | Task 4 bloco 5 · check blocos 3, 5, 6 |
| §5.5 `alvos_do_disparo`, `enqueue_broadcast`, `promote_due_schedules`, ACL reaplicado, claim legado | Task 4 blocos 2, 6, 7 · Task 6 · check blocos 1, 7, 8 |
| §5.6 `enviar_avisos_lotou` (+ ajuste do coordenador: não-admin elegível é marcado sem envio e sem contar) | Task 4 bloco 5 · check blocos 9, 10 |
| §5.7 backfill | Task 4 bloco 4 · check bloco 1 |
| §8 lista SQL (cruzamento, insert cheio, reabrir, prioridade, três regras, vazio, campanha nula, aviso uma vez, não retroativo, `has_function_privilege`) | check blocos 1–10 |
| §9 PR 1: apply-order, baseline, check, guarda no claim legado | Tasks 3, 5, 6, 10 |
