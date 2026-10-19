# Link da bio — PR 1: banco Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar no banco as três tabelas do Link da bio (`bio_pages`, `bio_slugs`, `bio_contagens`), o trigger que impede um slug de voltar para outra loja e as RPCs `bio_contar` e `bio_relatorio`, com a conferência SQL que prova RLS, privilégios e regras nos dois bancos.

**Architecture:** Uma migração idempotente, aplicada pelo CI (`migrate-dev` no PR, `migrate-prod` no merge). Só o servidor (service_role) toca as tabelas: RLS ligado sem policy e nada para anon/authenticated. O trigger `bio_pages_registra_slug` mantém `bio_slugs`; `bio_contar` soma por dia de `America/Sao_Paulo`; `bio_relatorio` devolve o agregado já no formato `RelatorioBio`. Quem prova é `infra/tests/bio-pages-check.sql` (`begin`…`rollback`), porque o gate de drift não vê RLS, policy, ACL, trigger, CHECK nem corpo de função.

**Tech Stack:** Postgres 17 (Supabase), SQL/plpgsql, Supabase CLI 2.109 (`db query --linked`, Management API), GitHub Actions (`.github/workflows/verify.yml`), `gh`.

**Spec:** `docs/superpowers/specs/2026-10-19-link-da-bio-design.md` (§5 inteiro, `RelatorioBio` do §9, linha 1 do §12)

**Índice da série:** `docs/superpowers/plans/2026-10-19-link-da-bio-00-indice.md` · **Card:** `link-da-bio` (prod, já `em_construcao`)

## Decisões deste plano (onde a spec não dizia)

1. **Trigger** `bio_pages_registra_slug` (`after insert or update of slug … for each row`) → `public.bio_registra_slug()`. Recusa com `errcode 23505` e mensagem `bio_slugs: o slug "<slug>" já foi de outra página` — cita `bio_slugs` e nunca `bio_pages_tenant_id_key`, que é o nome que o PR 2 procura para devolver a página existente.
2. **`bio_relatorio` é `stable`.** `porLink` vai por `toques` desc e, no empate, por `linkId` (`collate "C"`); `porDia` em ordem crescente, um item por dia do intervalo.
3. **`bio_slugs` é só SELECT/INSERT para service_role** (sem UPDATE/DELETE/TRUNCATE): "slug nunca volta para outra loja" (§10) vale no banco, não só no código. O `on delete set null` roda como dono da tabela e não precisa desse privilégio.
4. **Nenhum índice novo.** O relatório acha a página pela unique de `bio_pages.tenant_id` e os contadores pela PK `(pagina_id, dia, alvo)`.
5. **Baseline no mesmo commit da migração.** As seis assinaturas saem da fórmula de `public.schema_signature()` (conferida em 19/10 contra `bling_release`, `bling_resumo`, `bling_oauth_states`, `ad_spend` e `guard_trial_columns` da baseline atual: todas batem). Não existe `SUPABASE_*` em nenhum `.env.local` desta máquina para o `npm run schema:baseline`; a prova é o check em dev, o job `drift` e o `migrate-prod --conferir-baseline`.
6. **Card.** O PR 1 não muda a coluna (`em_construcao`). `move_card` para o mesmo status não grava evento — o trigger `board_features_log_move` só registra troca de status (memória `finding-move-card-nao-limpa-blocker`) —, então o avanço vai só no `blocker`.
7. **`set lock_timeout = '5s'`** no topo da migração: as FKs pegam lock em `organizations`; melhor abortar e rodar o job de novo do que segurar o cadastro de loja.

## Global Constraints

- Tabelas exatamente como no §5: `bio_pages(id, tenant_id unique, slug unique + regex/3–40, publicada, bloqueada_em, documento jsonb not null, versao > 0, created_at, updated_at)`, `bio_slugs(slug pk, pagina_id on delete set null, criado_em)`, `bio_contagens(tenant_id, pagina_id, dia, alvo check, total; pk (pagina_id, dia, alvo))`. Sem trigger de `updated_at`.
- `public.bio_contar(p_pagina uuid, p_alvo text) returns void` e `public.bio_relatorio(p_tenant uuid, p_desde date, p_ate date) returns jsonb`: os nomes dos parâmetros são contrato (o PR 2 chama `.rpc` com eles).
- Funções `security invoker`, `set search_path = public`, nomes qualificados com `public.`; `revoke all … from public, anon, authenticated` **depois** de todo `create or replace`; `grant execute … to service_role` em `bio_contar` e `bio_relatorio`.
- RLS ligado nas três tabelas, **zero** policy, `revoke all … from anon, authenticated`.
- `dia` = hoje em `America/Sao_Paulo`. Relatório agregado no SQL (o PostgREST corta em 1000 linhas sem avisar).
- Migração: arquivo novo + linha no **fim** de `deploy/supabase/apply-order.txt`; idempotente (`if not exists`, `or replace`, `drop trigger if exists`); quem aplica é o CI — nunca DDL à mão (CLAUDE.md, "Migração é aplicada pelo CI"); **prod muda no merge**.
- Repo público: nada de dado de cliente. O check usa lojas falsas (ids `b10b0000-…`, slug de loja `check-bio-b10b-*`) e slugs de página `girumo-check-bio-*` — o app recusa slug com "girumo" (`slugReservado`, PR 2), então nenhuma página real terá esses.
- Bash do executor: o cwd reseta entre chamadas, todo comando começa com `WT=$(git rev-parse --show-toplevel)`. Blocos para o Igor: PowerShell 5.1 (sem `&&`), com o caminho Windows `<WT>` impresso na Task 0.
- Commits em inglês, prefixo semântico. ≤ 10 arquivos (são 4).

## Review Focus

1. **Slug que já foi de outra loja, inclusive de página apagada** — o QR impresso da loja A não pode abrir a loja B; a loja voltando ao próprio slug antigo tem de passar. → Task 1, check blocos 3 (volta ao próprio), 4 (update e insert com o slug antigo de outra página: 23505 citando `bio_slugs`, nada gravado) e 5 (página apagada prende o slug, até para a própria loja).
2. **Visita perto da meia-noite / sessão em outro fuso** — contar no dia UTC ou no fuso da sessão joga a visita das 21h às 24h para o dia seguinte. → bloco 6 (com a sessão em UTC+14 e depois em UTC−11, as duas visitas caem no mesmo dia de São Paulo).
3. **Dias sem movimento e intervalo invertido** — gráfico com buraco ou erro no painel. → bloco 7 (zeros nos dias vazios, um dia só, invertido = zeros e listas vazias, 30 dias = 30 itens).
4. **Outra loja com o mesmo id de link no mesmo dia** — vazamento no relatório. → bloco 7 (a loja C tem toques no mesmo link no dia 02 e não aparece no relatório da A; a C vê só os dela).
5. **Arquivo reaplicado ou corrigido depois do `migrate-dev`** — o job pode morrer entre aplicar e registrar; DDL não idempotente quebra a reaplicação, e o ACL tem de valer depois de um `create or replace` reexecutado. → Task 1, Step 6 (grep de idempotência e ordem revoke/grant) + bloco 1 do check nos dois bancos; Task 2, Step 4 (correção depois de aplicado vira migração nova).

---

## Arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `apps/web/supabase/migrations/20261019120000_link_da_bio.sql` | criar | tabelas, trigger, `bio_contar`, `bio_relatorio`, RLS e privilégios |
| `infra/tests/bio-pages-check.sql` | criar | conferência nos dois bancos (`begin`…`rollback`, blocos que falham alto) + assinatura dos seis objetos |
| `deploy/supabase/apply-order.txt` | modificar | entrada da migração no fim |
| `deploy/supabase/schema-baseline.json` | modificar | seis chaves novas (3 `t|`, 3 `f|`) |

---

### Task 0: worktree, branch e conferências antes de escrever

**Files:** nenhum arquivo do repositório.

**Interfaces:**
- Consumes: nada (o PR 1 não depende de outro PR).
- Produces: worktree na branch `feat/link-da-bio-banco`, criada de `origin/main` em dia; `<WT>` (caminho Windows do worktree) para os blocos do Igor; o prefixo da migração livre.

- [ ] **Step 1: worktree novo a partir de `origin/main`** (regra do CLAUDE.md global; nunca `checkout -b` no checkout principal). Se a sessão já está num worktree novo (EnterWorktree), só crie a branch nele: `git switch -c feat/link-da-bio-banco origin/main`. Senão:

```bash
git -C /c/Users/Igor/Desktop/HubFlow-platform fetch origin main && git -C /c/Users/Igor/Desktop/HubFlow-platform worktree add .claude/worktrees/link-da-bio-pr1 -b feat/link-da-bio-banco origin/main
```

Daqui em diante, trabalhe dentro desse worktree.

- [ ] **Step 2: conferir posição e que nada disto existe**

```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" fetch origin main; git -C "$WT" status -sb | head -1; git -C "$WT" rev-list --count HEAD..origin/main; git -C "$WT" ls-tree --name-only origin/main apps/web/supabase/migrations/ | grep -E "link_da_bio|$(date +%Y%m%d)1200"; gh pr list --repo codingB0y/Girumo --state open --json number,title,headRefName | grep -i "bio"
```

Esperado: `## feat/link-da-bio-banco`, `0`, nenhuma linha do `ls-tree` e nenhum PR aberto fazendo este banco (PR só de docs da série pode aparecer). Migração `link_da_bio` já em `main` ou PR aberto com ela = outra sessão fez isto: **pare** e avise o Igor.

- [ ] **Step 3: anotar `<WT>`** (caminho Windows, usado em todos os blocos do Igor):

```bash
cygpath -w "$(git rev-parse --show-toplevel)"
```

- [ ] **Step 4: nome da migração.** Este plano usa `20261019120000_link_da_bio.sql`. Se hoje não é 19/10/2026, troque `20261019120000` por `<AAAAMMDD de hoje>120000` (ou `121000`, `122000`… se o Step 2 achou o prefixo ocupado) em **três** lugares: nome do arquivo, linha da `apply-order` (Task 1, Step 4) e cabeçalho do check (Task 1, Step 1). Prefixo duplicado quebra o Supabase CLI; a ordem de aplicação é a da `apply-order`, não a do prefixo (memória `migracao-automatica-ci`).

---

### Task 1: banco — conferência primeiro (RED), migração, apply-order e baseline

**Files:**
- Create: `infra/tests/bio-pages-check.sql`
- Create: `apps/web/supabase/migrations/20261019120000_link_da_bio.sql`
- Modify: `deploy/supabase/apply-order.txt` (fim do arquivo)
- Modify: `deploy/supabase/schema-baseline.json` (`objetos`, seis chaves no fim)

**Interfaces:**
- Consumes: `public.organizations(id)` (já existe), `public.schema_signature()` (gate de drift, já existe).
- Produces (o PR 2 e os seguintes dependem disto — ver "Interface com os outros PRs" no fim):
  - tabelas `public.bio_pages`, `public.bio_slugs`, `public.bio_contagens` (§5);
  - constraints com nome fixo `bio_pages_tenant_id_key`, `bio_pages_slug_key`, `bio_pages_slug_check`, `bio_pages_versao_check`, `bio_contagens_alvo_check`;
  - trigger `bio_pages_registra_slug` → 23505 `bio_slugs: o slug "<slug>" já foi de outra página`;
  - `public.bio_contar(p_pagina uuid, p_alvo text) returns void`;
  - `public.bio_relatorio(p_tenant uuid, p_desde date, p_ate date) returns jsonb` = `RelatorioBio`.

- [ ] **Step 1: escrever a conferência (o teste do banco)** — `infra/tests/bio-pages-check.sql`:

```sql
-- Conferência do PR 1 do Link da bio (migração 20261019120000_link_da_bio.sql), nos DOIS bancos.
-- Rodar de apps\web (dev pode ser pelo executor; prod é do Igor, depois do migrate-prod):
--   supabase link --project-ref <ref> --yes      # dev wfjuwogxaupyadwhvoxy / prod nidoatbxaylrkcgbszns
--   supabase db query --linked -o json -f ..\..\infra\tests\bio-pages-check.sql
--
-- Tudo o que escreve fica entre begin e rollback: três lojas falsas (TA, TB, TC, ids b10b0000-…),
-- páginas com slugs girumo-check-bio-* (o app recusa slug com "girumo", então nenhuma página real tem
-- esses) e contadores. Cada bloco levanta 'FALHOU: …' e o script para ali. Leitura de conferência
-- sempre num comando separado da escrita (memória finding-select-na-mesma-expressao-ve-snapshot-antigo).
-- Sem erro, a última linha traz `r` com a assinatura dos seis objetos para a baseline.
--
-- Existe porque o gate de drift não vê RLS, policy, ACL, trigger, CHECK nem corpo de função.
-- Antes da migração o bloco 1 falha com 'FALHOU: tabela public.bio_pages ausente' — é o RED.
--
-- Lojas: TA = b10b0000-0000-4000-8000-00000000000a, TB = …0b, TC = …0c.
-- Páginas: PA = …0000000000a1 (TA), PB = …b1 (TB, apagada no bloco 5), PC = …c1 (TC, bloco 7).
-- Links: L1 = b10b0000-0000-4000-8000-0000000001a1, L2 = …1a2, L3 = …1a3. Página inexistente = …ff.

begin;

insert into public.organizations (id, tenant_id, name, slug) values
  ('b10b0000-0000-4000-8000-00000000000a', 'b10b0000-0000-4000-8000-00000000000a',
   'Check bio TA', 'check-bio-b10b-ta'),
  ('b10b0000-0000-4000-8000-00000000000b', 'b10b0000-0000-4000-8000-00000000000b',
   'Check bio TB', 'check-bio-b10b-tb'),
  ('b10b0000-0000-4000-8000-00000000000c', 'b10b0000-0000-4000-8000-00000000000c',
   'Check bio TC', 'check-bio-b10b-tc');

-- 1) Estrutura e privilégios: RLS sem policy; nada para anon/authenticated (tabela, coluna e função);
--    service_role com o que o app usa (e sem UPDATE/DELETE/TRUNCATE em bio_slugs); funções security
--    invoker com search_path fixo; trigger ligado; nomes de constraint que o store do PR 2 lê no 23505.
do $$
declare
  v_tabela text;
  v_ruins text;
begin
  foreach v_tabela in array array['public.bio_pages', 'public.bio_slugs', 'public.bio_contagens'] loop
    if to_regclass(v_tabela) is null then
      raise exception 'FALHOU: tabela % ausente', v_tabela;
    end if;
    if not (select c.relrowsecurity from pg_class c where c.oid = to_regclass(v_tabela)) then
      raise exception 'FALHOU: RLS desligado em %', v_tabela;
    end if;
    if exists (select 1 from pg_policy p where p.polrelid = to_regclass(v_tabela)) then
      raise exception 'FALHOU: % tem policy (contrato: RLS ligado e nenhuma policy)', v_tabela;
    end if;
    if has_table_privilege('anon', v_tabela, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       or has_table_privilege('authenticated', v_tabela, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       or has_any_column_privilege('anon', v_tabela, 'SELECT,INSERT,UPDATE,REFERENCES')
       or has_any_column_privilege('authenticated', v_tabela, 'SELECT,INSERT,UPDATE,REFERENCES') then
      raise exception 'FALHOU: anon/authenticated com privilégio em %', v_tabela;
    end if;
  end loop;

  select string_agg(x.tabela || ':' || x.priv, ' ') into v_ruins
    from (values ('public.bio_pages', 'SELECT', true), ('public.bio_pages', 'INSERT', true),
                 ('public.bio_pages', 'UPDATE', true), ('public.bio_pages', 'DELETE', true),
                 ('public.bio_contagens', 'SELECT', true), ('public.bio_contagens', 'INSERT', true),
                 ('public.bio_contagens', 'UPDATE', true), ('public.bio_contagens', 'DELETE', true),
                 ('public.bio_slugs', 'SELECT', true), ('public.bio_slugs', 'INSERT', true),
                 ('public.bio_slugs', 'UPDATE', false), ('public.bio_slugs', 'DELETE', false),
                 ('public.bio_slugs', 'TRUNCATE', false)) as x(tabela, priv, deve)
   where has_table_privilege('service_role', x.tabela, x.priv) is distinct from x.deve;
  if v_ruins is not null then
    raise exception 'FALHOU: privilégio de service_role fora do contrato: %', v_ruins;
  end if;

  select string_agg(f.sig, ', ') into v_ruins
    from (values ('public.bio_contar(uuid,text)', true),
                 ('public.bio_relatorio(uuid,date,date)', true),
                 ('public.bio_registra_slug()', false)) as f(sig, rpc)
    left join pg_proc p on p.oid = to_regprocedure(f.sig)
   where p.oid is null
      or p.prosecdef
      or not exists (select 1 from unnest(p.proconfig) as c(cfg) where c.cfg like 'search_path=%')
      or has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE')
      or (f.rpc and not has_function_privilege('service_role', p.oid, 'EXECUTE'));
  if v_ruins is not null then
    raise exception 'FALHOU: fora do contrato (existe, security invoker, search_path fixo, nada para anon/authenticated, RPC executável por service_role): %', v_ruins;
  end if;

  if not exists (
    select 1 from pg_trigger t
     where t.tgrelid = 'public.bio_pages'::regclass
       and t.tgname = 'bio_pages_registra_slug'
       and t.tgenabled = 'O'
       and t.tgfoid = 'public.bio_registra_slug()'::regprocedure
  ) then
    raise exception 'FALHOU: trigger bio_pages_registra_slug ausente, desligado ou com outra função';
  end if;

  if (select count(*) from pg_constraint
       where conrelid = 'public.bio_pages'::regclass
         and conname in ('bio_pages_tenant_id_key', 'bio_pages_slug_key')) <> 2 then
    raise exception 'FALHOU: bio_pages sem bio_pages_tenant_id_key e bio_pages_slug_key (o store do PR 2 lê esses nomes)';
  end if;
end $$;

-- 2) Formato do slug: a CHECK recusa antes do trigger (23514). '_dominio' nunca é slug: a raiz do
--    domínio próprio (PR 4a) usa esse valor na rota.
do $$
declare
  v_slug text;
begin
  foreach v_slug in array array['ab', '_dominio', 'Girumo-check', 'girumo--check', 'girumo-check-',
                                '-girumo-check', 'girumo-check-bio-' || repeat('x', 24)] loop
    begin
      insert into public.bio_pages (tenant_id, slug, documento)
      values ('b10b0000-0000-4000-8000-00000000000c', v_slug, '{}');
      raise exception 'FALHOU: slug "%" aceito', v_slug;
    exception when check_violation then
      null;
    end;
  end loop;
end $$;

-- 3) Slug novo entra em bio_slugs; a loja troca e VOLTA a um slug que já foi dela; repetir o mesmo slug
--    no SET (o store manda o slug em todo salvar) passa; 40 caracteres passam; versao 0 não.
do $$
declare
  pa constant uuid := 'b10b0000-0000-4000-8000-0000000000a1';
  v_longo constant text := 'girumo-check-bio-' || repeat('x', 23);
  v_slugs text;
  v_atual text;
begin
  insert into public.bio_pages (id, tenant_id, slug, documento)
  values (pa, 'b10b0000-0000-4000-8000-00000000000a', 'girumo-check-bio-a', '{}');
  update public.bio_pages set slug = 'girumo-check-bio-a2' where id = pa;
  update public.bio_pages set slug = v_longo where id = pa;
  update public.bio_pages set slug = 'girumo-check-bio-a' where id = pa;
  update public.bio_pages set slug = 'girumo-check-bio-a', publicada = true, versao = versao + 1 where id = pa;

  select string_agg(s.slug, ',' order by s.slug collate "C") into v_slugs
    from public.bio_slugs s where s.pagina_id = pa;
  if v_slugs is distinct from 'girumo-check-bio-a,girumo-check-bio-a2,' || v_longo then
    raise exception 'FALHOU: bio_slugs de PA = %', v_slugs;
  end if;
  select slug into v_atual from public.bio_pages where id = pa;
  if v_atual is distinct from 'girumo-check-bio-a' then
    raise exception 'FALHOU: slug atual de PA = %', v_atual;
  end if;

  begin
    update public.bio_pages set versao = 0 where id = pa;
    raise exception 'FALHOU: versao 0 aceita';
  exception when check_violation then
    null;
  end;
exception when unique_violation then
  raise exception 'FALHOU: slug da própria página recusado: %', sqlerrm;
end $$;

-- 4) Slug que já foi de OUTRA página: 23505 citando bio_slugs, e a gravação inteira desfaz (update e
--    insert). Slug ATUAL de outra página e segunda página da mesma loja também são 23505, pela unique de
--    bio_pages — o PR 2 lê bio_pages_tenant_id_key para devolver a página que já existe.
do $$
declare
  pb constant uuid := 'b10b0000-0000-4000-8000-0000000000b1';
  v_msg text;
  v_slug text;
  v_dono uuid;
begin
  insert into public.bio_pages (id, tenant_id, slug, documento)
  values (pb, 'b10b0000-0000-4000-8000-00000000000b', 'girumo-check-bio-b', '{}');

  -- girumo-check-bio-a2 não é slug atual de ninguém: só bio_slugs barra.
  begin
    update public.bio_pages set slug = 'girumo-check-bio-a2' where id = pb;
    raise exception 'FALHOU: PB pegou girumo-check-bio-a2, que já foi de PA';
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%bio_slugs%' then
      raise exception 'FALHOU: 23505 do update sem citar bio_slugs: %', v_msg;
    end if;
  end;

  begin
    insert into public.bio_pages (id, tenant_id, slug, documento)
    values ('b10b0000-0000-4000-8000-0000000000c1', 'b10b0000-0000-4000-8000-00000000000c',
            'girumo-check-bio-a2', '{}');
    raise exception 'FALHOU: TC criou página com girumo-check-bio-a2, que já foi de PA';
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%bio_slugs%' then
      raise exception 'FALHOU: 23505 do insert sem citar bio_slugs: %', v_msg;
    end if;
  end;

  begin
    update public.bio_pages set slug = 'girumo-check-bio-a' where id = pb;
    raise exception 'FALHOU: PB pegou o slug atual de PA';
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%bio_pages_slug_key%' then
      raise exception 'FALHOU: 23505 do slug atual de outra página: %', v_msg;
    end if;
  end;

  begin
    insert into public.bio_pages (tenant_id, slug, documento)
    values ('b10b0000-0000-4000-8000-00000000000a', 'girumo-check-bio-a3', '{}');
    raise exception 'FALHOU: TA ganhou uma segunda página';
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%bio_pages_tenant_id_key%' then
      raise exception 'FALHOU: 23505 da segunda página da loja: %', v_msg;
    end if;
  end;

  select slug into v_slug from public.bio_pages where id = pb;
  if v_slug is distinct from 'girumo-check-bio-b' then
    raise exception 'FALHOU: PB ficou com o slug % depois das recusas', v_slug;
  end if;
  select pagina_id into v_dono from public.bio_slugs where slug = 'girumo-check-bio-a2';
  if v_dono is distinct from 'b10b0000-0000-4000-8000-0000000000a1'::uuid then
    raise exception 'FALHOU: girumo-check-bio-a2 em bio_slugs aponta para % (devia continuar de PA)', v_dono;
  end if;
  if exists (select 1 from public.bio_pages where tenant_id = 'b10b0000-0000-4000-8000-00000000000c')
     or exists (select 1 from public.bio_slugs where slug = 'girumo-check-bio-a3') then
    raise exception 'FALHOU: gravação recusada deixou rastro (página de TC ou slug a3)';
  end if;
end $$;

-- 5) Página apagada: o slug fica em bio_slugs com pagina_id null e não volta para ninguém — nem para a
--    própria loja numa página nova (o id mudou).
do $$
declare
  v_msg text;
  v_dono uuid;
begin
  delete from public.bio_pages where id = 'b10b0000-0000-4000-8000-0000000000b1';

  select pagina_id into v_dono from public.bio_slugs where slug = 'girumo-check-bio-b';
  if not found then
    raise exception 'FALHOU: girumo-check-bio-b sumiu de bio_slugs ao apagar a página';
  end if;
  if v_dono is not null then
    raise exception 'FALHOU: slug de página apagada ainda aponta para %', v_dono;
  end if;

  begin
    insert into public.bio_pages (id, tenant_id, slug, documento)
    values ('b10b0000-0000-4000-8000-0000000000b2', 'b10b0000-0000-4000-8000-00000000000b',
            'girumo-check-bio-b', '{}');
    raise exception 'FALHOU: slug de página apagada voltou a ser usado';
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%bio_slugs%' then
      raise exception 'FALHOU: 23505 do slug de página apagada sem citar bio_slugs: %', v_msg;
    end if;
  end;

  if exists (select 1 from public.bio_pages where tenant_id = 'b10b0000-0000-4000-8000-00000000000b') then
    raise exception 'FALHOU: a página recusada de TB ficou gravada';
  end if;
end $$;

-- 6) bio_contar: dia de America/Sao_Paulo, não o da sessão. Com a sessão em UTC+14 e depois em UTC-11,
--    a qualquer hora um dos dois fusos cai noutra data que a de São Paulo: current_date ou now()::date
--    no lugar do fuso fixo separaria as duas visitas em dias diferentes. Página inexistente: sem efeito e
--    sem erro. alvo fora do formato (lixo ou uuid em maiúsculas): 23514.
do $$
declare
  ta constant uuid := 'b10b0000-0000-4000-8000-00000000000a';
  pa constant uuid := 'b10b0000-0000-4000-8000-0000000000a1';
  l1 constant text := 'b10b0000-0000-4000-8000-0000000001a1';
  v_hoje constant date := (now() at time zone 'America/Sao_Paulo')::date;
  v_linhas text;
begin
  perform set_config('TimeZone', 'Pacific/Kiritimati', true);
  perform public.bio_contar(pa, 'visita');
  perform set_config('TimeZone', 'Pacific/Pago_Pago', true);
  perform public.bio_contar(pa, 'visita');
  perform set_config('TimeZone', 'UTC', true);
  perform public.bio_contar(pa, l1);
  perform public.bio_contar('b10b0000-0000-4000-8000-0000000000ff', 'visita');

  select string_agg(c.tenant_id::text || ' ' || c.dia::text || ' ' || c.alvo || ' ' || c.total::text, '; '
                    order by c.alvo collate "C" desc)
    into v_linhas
    from public.bio_contagens c
   where c.pagina_id in (pa, 'b10b0000-0000-4000-8000-0000000000ff');
  if v_linhas is distinct from format('%s %s visita 2; %s %s %s 1', ta, v_hoje, ta, v_hoje, l1) then
    raise exception 'FALHOU: bio_contagens depois das chamadas = % (hoje em SP = %)', v_linhas, v_hoje;
  end if;

  begin
    perform public.bio_contar(pa, 'abc');
    raise exception 'FALHOU: bio_contar aceitou o alvo "abc"';
  exception when check_violation then
    null;
  end;
  begin
    perform public.bio_contar(pa, upper(l1));
    raise exception 'FALHOU: bio_contar aceitou uuid em maiúsculas';
  exception when check_violation then
    null;
  end;
end $$;

-- 7) bio_relatorio: soma da loja no intervalo (inclusivo); porDia com TODOS os dias, zeros incluídos, em
--    ordem; porLink só com ids de link (toques desc, empate por linkId); nada de outra loja, mesmo com o
--    mesmo id de link no mesmo dia. Dias de janeiro de 2026: as visitas de hoje (bloco 6) ficam fora.
insert into public.bio_pages (id, tenant_id, slug, documento)
values ('b10b0000-0000-4000-8000-0000000000c1', 'b10b0000-0000-4000-8000-00000000000c',
        'girumo-check-bio-c', '{}');

insert into public.bio_contagens (tenant_id, pagina_id, dia, alvo, total) values
  ('b10b0000-0000-4000-8000-00000000000a', 'b10b0000-0000-4000-8000-0000000000a1', '2025-12-31', 'visita', 100),
  ('b10b0000-0000-4000-8000-00000000000a', 'b10b0000-0000-4000-8000-0000000000a1', '2026-01-01', 'visita', 3),
  ('b10b0000-0000-4000-8000-00000000000a', 'b10b0000-0000-4000-8000-0000000000a1', '2026-01-01', 'b10b0000-0000-4000-8000-0000000001a1', 2),
  ('b10b0000-0000-4000-8000-00000000000a', 'b10b0000-0000-4000-8000-0000000000a1', '2026-01-03', 'visita', 5),
  ('b10b0000-0000-4000-8000-00000000000a', 'b10b0000-0000-4000-8000-0000000000a1', '2026-01-03', 'b10b0000-0000-4000-8000-0000000001a1', 1),
  ('b10b0000-0000-4000-8000-00000000000a', 'b10b0000-0000-4000-8000-0000000000a1', '2026-01-03', 'b10b0000-0000-4000-8000-0000000001a2', 4),
  ('b10b0000-0000-4000-8000-00000000000a', 'b10b0000-0000-4000-8000-0000000000a1', '2026-01-04', 'b10b0000-0000-4000-8000-0000000001a3', 3),
  ('b10b0000-0000-4000-8000-00000000000a', 'b10b0000-0000-4000-8000-0000000000a1', '2026-01-06', 'b10b0000-0000-4000-8000-0000000001a1', 100),
  ('b10b0000-0000-4000-8000-00000000000c', 'b10b0000-0000-4000-8000-0000000000c1', '2026-01-02', 'visita', 50),
  ('b10b0000-0000-4000-8000-00000000000c', 'b10b0000-0000-4000-8000-0000000000c1', '2026-01-02', 'b10b0000-0000-4000-8000-0000000001a1', 7);

do $$
declare
  ta constant uuid := 'b10b0000-0000-4000-8000-00000000000a';
  l1 constant text := 'b10b0000-0000-4000-8000-0000000001a1';
  l2 constant text := 'b10b0000-0000-4000-8000-0000000001a2';
  l3 constant text := 'b10b0000-0000-4000-8000-0000000001a3';
  v jsonb;
begin
  v := public.bio_relatorio(ta, '2026-01-01', '2026-01-05');
  if v is distinct from jsonb_build_object(
       'visitas', 8, 'toques', 10,
       'porLink', jsonb_build_array(
         jsonb_build_object('linkId', l2, 'toques', 4),
         jsonb_build_object('linkId', l1, 'toques', 3),
         jsonb_build_object('linkId', l3, 'toques', 3)),
       'porDia', jsonb_build_array(
         jsonb_build_object('dia', '2026-01-01', 'visitas', 3, 'toques', 2),
         jsonb_build_object('dia', '2026-01-02', 'visitas', 0, 'toques', 0),
         jsonb_build_object('dia', '2026-01-03', 'visitas', 5, 'toques', 5),
         jsonb_build_object('dia', '2026-01-04', 'visitas', 0, 'toques', 3),
         jsonb_build_object('dia', '2026-01-05', 'visitas', 0, 'toques', 0))) then
    raise exception 'FALHOU: relatório de TA de 01 a 05/01 = %', v;
  end if;

  v := public.bio_relatorio(ta, '2026-01-03', '2026-01-03');
  if v is distinct from jsonb_build_object(
       'visitas', 5, 'toques', 5,
       'porLink', jsonb_build_array(
         jsonb_build_object('linkId', l2, 'toques', 4),
         jsonb_build_object('linkId', l1, 'toques', 1)),
       'porDia', jsonb_build_array(jsonb_build_object('dia', '2026-01-03', 'visitas', 5, 'toques', 5))) then
    raise exception 'FALHOU: relatório de um dia só = %', v;
  end if;

  v := public.bio_relatorio(ta, '2026-01-05', '2026-01-01');
  if v is distinct from jsonb_build_object('visitas', 0, 'toques', 0, 'porLink', '[]'::jsonb, 'porDia', '[]'::jsonb) then
    raise exception 'FALHOU: intervalo invertido = %', v;
  end if;

  -- TB: página apagada no bloco 5 (os contadores foram junto, on delete cascade).
  v := public.bio_relatorio('b10b0000-0000-4000-8000-00000000000b', '2026-01-01', '2026-01-02');
  if v is distinct from jsonb_build_object(
       'visitas', 0, 'toques', 0, 'porLink', '[]'::jsonb,
       'porDia', jsonb_build_array(
         jsonb_build_object('dia', '2026-01-01', 'visitas', 0, 'toques', 0),
         jsonb_build_object('dia', '2026-01-02', 'visitas', 0, 'toques', 0))) then
    raise exception 'FALHOU: loja sem página = %', v;
  end if;

  v := public.bio_relatorio('b10b0000-0000-4000-8000-00000000000c', '2026-01-01', '2026-01-05');
  if (v ->> 'visitas')::int <> 50 or (v ->> 'toques')::int <> 7
     or v -> 'porLink' is distinct from jsonb_build_array(jsonb_build_object('linkId', l1, 'toques', 7)) then
    raise exception 'FALHOU: relatório de TC = %', v;
  end if;

  v := public.bio_relatorio(ta, '2026-01-01', '2026-01-30');
  if jsonb_array_length(v -> 'porDia') <> 30
     or (v -> 'porDia' -> 0 ->> 'dia') <> '2026-01-01'
     or (v -> 'porDia' -> 29 ->> 'dia') <> '2026-01-30'
     or (v ->> 'visitas')::int <> 8
     or (v ->> 'toques')::int <> 110 then
    raise exception 'FALHOU: relatório de 30 dias = %', v;
  end if;
end $$;

rollback;

-- Assinatura dos seis objetos para a baseline (fora da transação; só leitura). Esperado nos DOIS bancos
-- (as mesmas chaves de deploy/supabase/schema-baseline.json):
--   f|bio_contar(p_pagina uuid, p_alvo text)                    f2c82bbfe5a21c72a45959602a2e2c79
--   f|bio_registra_slug()                                       e8c9208442517f72c1f64ecc6b5cfb2d
--   f|bio_relatorio(p_tenant uuid, p_desde date, p_ate date)    a91b06bba633257f616b13e6aabcb670
--   t|bio_contagens                                             c39da7f1605b7f185db441b3a69035b8
--   t|bio_pages                                                 bd259afbabda80540720fe5e78281ed7
--   t|bio_slugs                                                 c75871f8691ac0e2371ba87d9c46b5ec
select json_object_agg(kind || '|' || nome, sig order by kind || '|' || nome collate "C") as r
  from public.schema_signature()
 where nome like 'bio\_%';
```

- [ ] **Step 2: RED em dev** (DML dentro de `begin`…`rollback`, só leitura no fim; liberado ao executor em 10/10 — se o classificador negar, pule: o `migrate-dev` e o GREEN da Task 2 cobrem):

```bash
WT=$(git rev-parse --show-toplevel); cd "$WT/apps/web" && supabase link --project-ref wfjuwogxaupyadwhvoxy --yes && supabase db query --linked -o json -f ../../infra/tests/bio-pages-check.sql
```

Esperado: sai com erro `… P0001: FALHOU: tabela public.bio_pages ausente`. Qualquer outro `FALHOU` = alguém já criou objetos `bio_` em dev: pare e investigue antes de seguir. (`apps/web/supabase/.temp/` está no `.gitignore`: o `link` não suja o git.)

- [ ] **Step 3: escrever a migração** — `apps/web/supabase/migrations/20261019120000_link_da_bio.sql`:

```sql
-- 2026-10-19 — Link da bio, PR 1: banco (spec docs/superpowers/specs/2026-10-19-link-da-bio-design.md §5).
--
-- Uma página de links por loja (bio_pages; o documento é validado no app por documentoBio, PR 2), todo
-- slug já usado (bio_slugs: um slug nunca vai para outra loja, e o antigo responde 301 para o atual) e os
-- contadores por dia (bio_contagens, só via bio_contar), somados no banco por bio_relatorio (o PostgREST
-- corta em 1000 linhas sem avisar). Nada de IP, user agent ou referer.
--
-- Só o servidor (service_role) lê e grava: as três tabelas têm RLS ligado e NENHUMA policy nem privilégio
-- para anon/authenticated; bio_pages e bio_contagens sempre com .eq('tenant_id'), bio_slugs (sem
-- tenant_id) só por slug. As funções são security invoker e executam só como service_role: se um grant
-- escapar, quem chamar esbarra no RLS sem policy.
--
-- Aplicada pelo CI (migrate-dev no PR, migrate-prod no merge). Idempotente (if not exists / or replace /
-- drop trigger if exists): o job pode morrer entre aplicar e registrar, e o próximo run reaplica o
-- arquivo. O gate de drift não vê RLS, policy, ACL, trigger, CHECK nem corpo de função: conferir com
-- infra/tests/bio-pages-check.sql nos dois bancos.
--
-- Reversão (emergência): migração NOVA, pelo CI, com
--   drop table if exists public.bio_contagens, public.bio_slugs, public.bio_pages;
--   drop function if exists public.bio_contar(uuid, text), public.bio_relatorio(uuid, date, date),
--     public.bio_registra_slug();
-- (apaga páginas e contadores; a baseline volta a não ter os seis objetos).

-- As FKs pegam lock em organizations. Sem o lock em 5 s, aborta em vez de segurar o cadastro de loja: é
-- só rodar o job de novo, a migração é idempotente.
set lock_timeout = '5s';

-- 1) Tabelas (§5 da spec, sem mudar nome nem coluna: o store do PR 2 depende deles).
create table if not exists public.bio_pages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.organizations(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 40),
  publicada boolean not null default false,
  bloqueada_em timestamptz,                        -- só admin, por SQL: some do público
  documento jsonb not null,
  versao integer not null default 1 check (versao > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.bio_pages is
  'Link da bio: uma página por loja. documento validado no app (documentoBio); versao = trava otimista; updated_at gravado pelo store (sem trigger); bloqueada_em só por SQL (admin). Só service_role.';

create table if not exists public.bio_slugs (       -- todo slug já usado; nunca volta para outra loja
  slug text primary key,
  pagina_id uuid references public.bio_pages(id) on delete set null,
  criado_em timestamptz not null default now()
);

comment on table public.bio_slugs is
  'Todo slug que uma página já usou, mantido pelo trigger bio_pages_registra_slug. pagina_id null = página apagada: o slug fica preso. Só service_role, lido por slug.';

create table if not exists public.bio_contagens (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  pagina_id uuid not null references public.bio_pages(id) on delete cascade,
  dia date not null,                               -- America/Sao_Paulo
  alvo text not null                               -- 'visita' ou o uuid do link
    check (alvo = 'visita' or alvo ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'),
  total integer not null default 0,
  primary key (pagina_id, dia, alvo)
);

comment on table public.bio_contagens is
  'Contadores por dia (America/Sao_Paulo) da página: alvo = visita ou id do link (uuid minúsculo). Escrita só por bio_contar; leitura por bio_relatorio.';

-- 2) Slug nunca volta para outra loja. Depois do insert/update de bio_pages (a linha já existe, então a FK
--    de bio_slugs passa): grava (slug, página). Se o slug já estava lá, só segue se é desta página (a loja
--    voltando a um slug que já foi dela); de outra página ou de página apagada (pagina_id null) é
--    unique_violation citando bio_slugs, e a gravação inteira desfaz. Slug ATUAL de outra página nem chega
--    aqui: a unique de bio_pages.slug recusa antes (23505 bio_pages_slug_key).
create or replace function public.bio_registra_slug()
returns trigger
language plpgsql
volatile
security invoker
set search_path = public
as $$
begin
  insert into public.bio_slugs (slug, pagina_id)
  values (new.slug, new.id)
  on conflict (slug) do nothing;

  if not exists (
    select 1 from public.bio_slugs s where s.slug = new.slug and s.pagina_id = new.id
  ) then
    raise exception using
      errcode = 'unique_violation',
      message = format('bio_slugs: o slug "%s" já foi de outra página', new.slug);
  end if;

  return null;
end;
$$;

comment on function public.bio_registra_slug() is
  'Trigger de bio_pages: registra o slug em bio_slugs e recusa (23505 citando bio_slugs) slug que já foi de outra página ou de página apagada.';

drop trigger if exists bio_pages_registra_slug on public.bio_pages;
create trigger bio_pages_registra_slug
  after insert or update of slug on public.bio_pages
  for each row
  execute function public.bio_registra_slug();

-- 3) Contador: +1 no dia de hoje em America/Sao_Paulo (nunca no fuso da sessão). tenant_id sai da página;
--    página inexistente não conta nem dá erro (insert … select de zero linhas). alvo fora do formato é
--    23514 (CHECK de bio_contagens): a rota só manda 'visita' ou uuid minúsculo.
create or replace function public.bio_contar(p_pagina uuid, p_alvo text)
returns void
language sql
volatile
security invoker
set search_path = public
as $$
  insert into public.bio_contagens as c (tenant_id, pagina_id, dia, alvo, total)
  select p.tenant_id, p.id, (now() at time zone 'America/Sao_Paulo')::date, p_alvo, 1
    from public.bio_pages p
   where p.id = p_pagina
  on conflict (pagina_id, dia, alvo) do update set total = c.total + 1;
$$;

comment on function public.bio_contar(uuid, text) is
  'Link da bio: soma 1 à visita (alvo = visita) ou ao toque (alvo = id do link) de hoje em America/Sao_Paulo. Só service_role.';

-- 4) Relatório do painel (RelatorioBio, spec §9), somado no banco e já em camelCase. porDia traz TODOS os
--    dias do intervalo (inclusivo), zeros incluídos, em ordem; porLink só ids de link, por toques (desc) e
--    linkId. Intervalo invertido = zeros e listas vazias. A página da loja vem da unique de tenant_id e os
--    contadores da PK (pagina_id, dia, alvo): nenhum índice novo.
create or replace function public.bio_relatorio(p_tenant uuid, p_desde date, p_ate date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with contagens as (
    select c.dia, c.alvo, c.total
      from public.bio_pages p
      join public.bio_contagens c
        on c.pagina_id = p.id
       and c.tenant_id = p_tenant
     where p.tenant_id = p_tenant
       and c.dia between p_desde and p_ate
  ),
  por_dia as (
    select g.d::date as dia,
           coalesce(sum(c.total) filter (where c.alvo = 'visita'), 0) as visitas,
           coalesce(sum(c.total) filter (where c.alvo <> 'visita'), 0) as toques
      from generate_series(p_desde::timestamp, p_ate::timestamp, interval '1 day') as g(d)
      left join contagens c on c.dia = g.d::date
     group by g.d
  ),
  por_link as (
    select c.alvo as link_id, sum(c.total) as toques
      from contagens c
     where c.alvo <> 'visita'
     group by c.alvo
  )
  select jsonb_build_object(
    'visitas', coalesce((select sum(d.visitas) from por_dia d), 0),
    'toques', coalesce((select sum(d.toques) from por_dia d), 0),
    'porLink', coalesce((
      select jsonb_agg(jsonb_build_object('linkId', l.link_id, 'toques', l.toques)
                       order by l.toques desc, l.link_id collate "C")
        from por_link l), '[]'::jsonb),
    'porDia', coalesce((
      select jsonb_agg(jsonb_build_object('dia', d.dia, 'visitas', d.visitas, 'toques', d.toques)
                       order by d.dia)
        from por_dia d), '[]'::jsonb)
  );
$$;

comment on function public.bio_relatorio(uuid, date, date) is
  'Link da bio: {visitas, toques, porLink:[{linkId,toques}], porDia:[{dia,visitas,toques}]} da loja entre p_desde e p_ate (inclusivo). Só service_role.';

-- 5) RLS sem policy e privilégios: só service_role.
alter table public.bio_pages enable row level security;
alter table public.bio_slugs enable row level security;
alter table public.bio_contagens enable row level security;

-- Tabela nova nasce com SELECT/REFERENCES/TRIGGER para authenticated (default privilege do grantor
-- postgres; o event trigger ensure_anon_revoked só tira anon e a escrita de authenticated).
revoke all on public.bio_pages, public.bio_slugs, public.bio_contagens from anon, authenticated;
grant select, insert, update, delete on public.bio_pages, public.bio_contagens to service_role;
-- bio_slugs: o trigger (security invoker, roda como service_role) só insere e lê; ninguém do app apaga
-- nem reescreve o histórico. O "on delete set null" roda como dono da tabela.
grant select, insert on public.bio_slugs to service_role;
revoke update, delete, truncate on public.bio_slugs from service_role;

-- Função nova nasce executável por authenticated (default privilege) e por public (anon herda): revogar
-- depois do create or replace, sempre — não confiar que ele preserva o ACL. Disparar trigger não checa
-- EXECUTE: o revoke da função do trigger é só para ninguém chamá-la por fora.
revoke all on function public.bio_registra_slug() from public, anon, authenticated;
revoke all on function public.bio_contar(uuid, text) from public, anon, authenticated;
revoke all on function public.bio_relatorio(uuid, date, date) from public, anon, authenticated;
grant execute on function public.bio_contar(uuid, text) to service_role;
grant execute on function public.bio_relatorio(uuid, date, date) to service_role;
```

- [ ] **Step 4: `apply-order.txt`** — acrescentar ao **fim** de `deploy/supabase/apply-order.txt`, exatamente:

```
# 2026-10-19 - Link da bio, PR 1 (spec 2026-10-19-link-da-bio-design §5): bio_pages (uma por loja,
# documento jsonb, versao), bio_slugs (todo slug ja usado; o trigger bio_pages_registra_slug recusa slug
# que ja foi de outra pagina com unique_violation citando bio_slugs), bio_contagens (contador por dia de
# America/Sao_Paulo) e as RPCs bio_contar / bio_relatorio (security invoker, execute so service_role).
# RLS ligado, sem policy, nada para anon/authenticated. Muda a baseline (3 t| e 3 f|). O gate nao ve
# RLS, policy, ACL, trigger, CHECK nem corpo: conferir com infra/tests/bio-pages-check.sql nos dois bancos.
apps/web/supabase/migrations/20261019120000_link_da_bio.sql
```

- [ ] **Step 5: baseline** — as seis chaves no fim de `objetos`, sem mexer em `gerado_em` nem `projeto` (atualização parcial, como a do Bling e a do PR 6 do postar por grupo). O script reescreve no formato do `gerarBaseline` (`JSON.stringify(…, null, 2)`), preservando o fim de linha do arquivo:

```bash
WT=$(git rev-parse --show-toplevel); cd "$WT" && node -e '
const fs = require("fs");
const f = "deploy/supabase/schema-baseline.json";
const bruto = fs.readFileSync(f, "utf8");
const eol = bruto.includes("\r\n") ? "\r\n" : "\n";
const b = JSON.parse(bruto);
Object.assign(b.objetos, {
  "t|bio_pages": "bd259afbabda80540720fe5e78281ed7",
  "t|bio_slugs": "c75871f8691ac0e2371ba87d9c46b5ec",
  "t|bio_contagens": "c39da7f1605b7f185db441b3a69035b8",
  "f|bio_registra_slug()": "e8c9208442517f72c1f64ecc6b5cfb2d",
  "f|bio_contar(p_pagina uuid, p_alvo text)": "f2c82bbfe5a21c72a45959602a2e2c79",
  "f|bio_relatorio(p_tenant uuid, p_desde date, p_ate date)": "a91b06bba633257f616b13e6aabcb670",
});
fs.writeFileSync(f, JSON.stringify(b, null, 2).replace(/\n/g, eol) + eol);' && git -C "$WT" diff --stat deploy/supabase/schema-baseline.json
```

Esperado: `1 file changed, 7 insertions(+), 1 deletion(-)` (seis linhas novas + a vírgula na que era a última). De onde vêm os valores: `t|` = `md5` de `coluna:tipo` em ordem de nome, separados por vírgula; `f|` = `md5(pg_get_function_result || '|secdef=false|vol=' || provolatile)` — `void|…|vol=v`, `jsonb|…|vol=s` e `trigger|…|vol=v`. Se a migração mudar coluna, tipo ou volatilidade, a chave muda: recalcule pelo `r` do check em dev (Task 2).

- [ ] **Step 6: conferências locais, sem banco**

Idempotência (todo `create` com `if not exists`/`or replace`, exceto o `create trigger`, que vem logo depois do `drop trigger if exists`) e ordem do ACL (todos os `revoke`/`grant` de função depois do último `create or replace`):

```bash
WT=$(git rev-parse --show-toplevel); M="$WT/apps/web/supabase/migrations/20261019120000_link_da_bio.sql"; grep -nE "^\s*(create|drop)\s" "$M" | grep -vE "if not exists|or replace"; echo "---"; grep -nE "^(create or replace function|revoke all on function|grant execute)" "$M"
```

Esperado: antes do `---`, exatamente duas linhas, consecutivas no arquivo — `drop trigger if exists bio_pages_registra_slug …` e `create trigger bio_pages_registra_slug`; depois do `---`, os três `create or replace function` com número de linha **menor** que todos os `revoke all on function`/`grant execute`.

A ordem real aponta para arquivos que existem, e nenhuma função `security definer` ficou sem revoke (os dois testes rodam sem `node_modules`, no Node 24):

```bash
WT=$(git rev-parse --show-toplevel); cd "$WT" && node --test infra/scripts/apply-migrations.test.ts 2>&1 | tail -8; cd "$WT/apps/web" && node --test src/lib/supabase/privilegio-definer.test.ts 2>&1 | tail -8
```

Esperado: `fail 0` nos dois (em 19/10 eram 14 e 2 testes).

Gate local (pede `npm ci` no worktree; se o disco não deixar — memória `finding-disco-cheio-c` —, o job `verify` do CI roda o mesmo script):

```powershell
Set-Location "<WT>"; & .\infra\scripts\verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
```

Esperado: `EXIT=0`.

- [ ] **Step 7: commit**

```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" add infra/tests/bio-pages-check.sql apps/web/supabase/migrations/20261019120000_link_da_bio.sql deploy/supabase/apply-order.txt deploy/supabase/schema-baseline.json && git -C "$WT" diff --cached --stat && git -C "$WT" commit -m "feat(db): link da bio tables, slug history trigger and counter RPCs (link da bio PR 1)"
```

Esperado no `--stat`: só esses quatro arquivos (memória `finding-external-agent-stages-index`: índice sujo de outra sessão aparece aqui).

---

### Task 2: PR, `migrate-dev` e a conferência em dev (GREEN)

**Files:** nenhum arquivo novo do repositório (cria `C:\Users\Igor\AppData\Local\Temp\link-da-bio-pr1-corpo.md`).

**Interfaces:**
- Consumes: o commit da Task 1.
- Produces: PR `<N>` aberto, migração aplicada e registrada em dev (`ops.applied_migrations`), check verde em dev, `drift` verde.

- [ ] **Step 1: corpo do PR** — ferramenta Write em `C:\Users\Igor\AppData\Local\Temp\link-da-bio-pr1-corpo.md`:

```markdown
## O que muda
- Migração `20261019120000_link_da_bio.sql` (o CI aplica: dev neste PR, **prod no merge**): `bio_pages`, `bio_slugs` + trigger `bio_pages_registra_slug` (slug nunca volta para outra loja), `bio_contagens`, RPCs `bio_contar` e `bio_relatorio` (security invoker, execute só `service_role`). RLS ligado sem policy, nada para anon/authenticated.
- `infra/tests/bio-pages-check.sql`: RLS, ACL, trigger, CHECKs e as regras (slug antigo de outra página e de página apagada recusados, dia de São Paulo, relatório com todos os dias e sem outra loja). O gate de drift não vê nada disso.
- Baseline: seis objetos novos (3 `t|`, 3 `f|`).

## Como foi verificado
- `migrate-dev` aplicou; `supabase db query --linked -o json -f ../../infra/tests/bio-pages-check.sql` em dev sem erro, assinatura igual à baseline.
- `drift` verde.

## Depois do merge
- `migrate-prod` aplica e confere a baseline; o check roda em prod (Igor).

Spec: `docs/superpowers/specs/2026-10-19-link-da-bio-design.md` §5 · Plano: `docs/superpowers/plans/2026-10-19-link-da-bio-pr1-banco.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] **Step 2: push e PR** (o `migrate-dev` só roda em `pull_request` ou em push na `main`; se o classificador negar o push ou o `gh pr create`, entregue os dois comandos ao Igor e siga quando o PR existir):

```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" push -u origin feat/link-da-bio-banco && gh pr create --repo codingB0y/Girumo --base main --head feat/link-da-bio-banco --title "feat(db): link da bio tables, slug history and counters (link da bio PR 1)" --body-file "C:/Users/Igor/AppData/Local/Temp/link-da-bio-pr1-corpo.md"
```

Anote o número `<N>`. A partir daqui o `drift` de **todo outro PR aberto** fica vermelho com os seis objetos (dev já os tem, a baseline deles não) até este PR entrar na `main` — não é defeito deles; feche este PR sem pausa (memória `migracao-automatica-ci`).

- [ ] **Step 3: esperar o CI e ler o `migrate-dev`**

```bash
gh pr checks <N> --repo codingB0y/Girumo --watch; RUN=$(gh run list --repo codingB0y/Girumo --branch feat/link-da-bio-banco --workflow verify.yml --limit 1 --json databaseId -q '.[0].databaseId'); gh run view "$RUN" --repo codingB0y/Girumo --log | grep -E "Aplicando|Falhou em|Nenhuma migracao|Sem drift|DRIFT|  x "
```

Esperado: `Aplicando apps/web/supabase/migrations/20261019120000_link_da_bio.sql` e `Sem drift fora da allowlist.`
- `Falhou em …link_da_bio.sql: <mensagem>` = erro de SQL. O arquivo roda numa transação só: **nada** ficou aplicado nem registrado. Corrija o próprio arquivo (Task 1, Step 3), refaça o Step 6 da Task 1, commit, push — o `migrate-dev` tenta de novo.
- `drift` vermelho com objeto `bio_…` = chave da baseline errada: compare com o `r` do Step 4 e corrija o Step 5 da Task 1. Sem o `r`: rode a mesma consulta de assinatura no banco de **dev** pelo MCP do Supabase (`execute_sql`, projeto `wfjuwogxaupyadwhvoxy`; leitura passa no classificador) ou `npm run schema:baseline` com `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` de dev, e commite só as seis chaves `bio_…`. Vermelho só com objetos que **não** são `bio_…` = migração de outro PR aberto em dev: espere aquele PR mergear e `git merge origin/main` aqui; não use `drift-allowlist.json`.
- `e2e` vermelho sem relação (banco de dev compartilhado; o `e2e` não espera o `migrate-dev`): `gh run rerun "$RUN" --repo codingB0y/Girumo --failed`.

- [ ] **Step 4: GREEN em dev** (mesmo comando do RED):

```bash
WT=$(git rev-parse --show-toplevel); cd "$WT/apps/web" && supabase link --project-ref wfjuwogxaupyadwhvoxy --yes && supabase db query --linked -o json -f ../../infra/tests/bio-pages-check.sql
```

Esperado: exit 0 e `rows[0].r` igual a:

```json
{"f|bio_contar(p_pagina uuid, p_alvo text)": "f2c82bbfe5a21c72a45959602a2e2c79", "f|bio_registra_slug()": "e8c9208442517f72c1f64ecc6b5cfb2d", "f|bio_relatorio(p_tenant uuid, p_desde date, p_ate date)": "a91b06bba633257f616b13e6aabcb670", "t|bio_contagens": "c39da7f1605b7f185db441b3a69035b8", "t|bio_pages": "bd259afbabda80540720fe5e78281ed7", "t|bio_slugs": "c75871f8691ac0e2371ba87d9c46b5ec"}
```

Se o classificador negar (DML em banco compartilhado, mesmo com rollback), mande ao Igor o mesmo comando em PowerShell (`Set-Location "<WT>\apps\web"; supabase link --project-ref wfjuwogxaupyadwhvoxy --yes; if ($LASTEXITCODE -eq 0) { supabase db query --linked -o json -f ..\..\infra\tests\bio-pages-check.sql }`) e espere a saída.

**`FALHOU: …` aqui = defeito com a migração JÁ aplicada e registrada em dev.** Não edite o arquivo aplicado: o registro em `ops.applied_migrations` impede a reaplicação, e prod receberia um arquivo que dev nunca rodou. Escreva uma migração de ajuste no mesmo PR — `apps/web/supabase/migrations/20261019120100_link_da_bio_ajuste.sql`, idempotente (`create or replace function` + o bloco de `revoke`/`grant` da função de novo; mudança de tabela por `alter table … drop constraint if exists …, add constraint …`, porque `create table if not exists` não refaz tabela) —, a linha dela no fim da `apply-order`, a chave da baseline se a assinatura mudou, commit, push, e repita os Steps 3 e 4. Se o defeito for do **check** (expectativa errada), corrija só o check.

- [ ] **Step 5: CI todo verde** — `gh pr checks <N> --repo codingB0y/Girumo`: `verify`, `migrate-dev`, `drift`, `advisors` e `e2e` em `pass`. O `advisors` não deve trazer lint novo citando `bio_` (o `rls_enabled_no_policy` está tolerado por classe em `deploy/supabase/advisors-allowlist.json`); se trouxer, corrija a migração (ajuste, como no Step 4), não a allowlist.

---

### Task 3: merge, prod e fechamento (card, grafo)

**Files:** nenhum arquivo do repositório (cria `C:\Users\Igor\AppData\Local\Temp\link-da-bio-pr1-card.sql`).

**Interfaces:**
- Consumes: PR `<N>` verde (Task 2).
- Produces: migração em prod, provada pelo `--conferir-baseline` e pelo check; card com o `blocker` novo; decisão no grafo. É o que o PR 2 exige para começar.

- [ ] **Step 1: merge** (na mesma sessão; se o classificador negar, entregue ao Igor `gh pr checks <N> --repo codingB0y/Girumo` e `gh pr merge <N> --squash --delete-branch --repo codingB0y/Girumo`):

```bash
gh pr merge <N> --squash --delete-branch --repo codingB0y/Girumo
```

- [ ] **Step 2: `migrate-prod`** — o push na `main` aplica em prod e compara prod ao vivo com a baseline:

```bash
SHA=$(gh pr view <N> --repo codingB0y/Girumo --json mergeCommit -q .mergeCommit.oid); RUN=$(gh run list --repo codingB0y/Girumo --commit "$SHA" --workflow verify.yml --limit 1 --json databaseId -q '.[0].databaseId'); gh run watch "$RUN" --repo codingB0y/Girumo --exit-status; gh run view "$RUN" --repo codingB0y/Girumo --log | grep -E "Aplicando|Falhou em|Schema de prod|diverge da baseline|  x "
```

`RUN` vazio = o run do merge ainda não nasceu: espere alguns segundos e repita. Esperado: `Aplicando apps/web/supabase/migrations/20261019120000_link_da_bio.sql`, `Schema de prod x deploy/supabase/schema-baseline.json:` e **nenhum** `diverge da baseline`. Falhou em prod = pare e mostre ao Igor (dev está à frente; a saída é migração de ajuste ou de reversão, nunca DDL à mão).

- [ ] **Step 3: SQL do card** — ferramenta Write em `C:\Users\Igor\AppData\Local\Temp\link-da-bio-pr1-card.sql`, trocando `<DD/MM>` e `<N>`:

```sql
-- Link da bio, PR 1 mergeado. O card continua em_construcao: move_card para o MESMO status não grava
-- evento (board_features_log_move só registra troca de status), então o avanço vai no blocker.
update public.board_features
   set blocker = 'PR 1 (banco) no ar em <DD/MM> (#<N>): bio_pages, bio_slugs (+ trigger), bio_contagens, bio_contar e bio_relatorio nos dois bancos; infra/tests/bio-pages-check.sql ok em dev e prod. Próximo: PR 2 (núcleo: documento.ts, cores.ts, conferir.ts, store bio-pages.ts, cache.ts) — docs/superpowers/plans/2026-10-19-link-da-bio-pr2-nucleo.md.'
 where key = 'link-da-bio'
returning key, status, blocker;
```

- [ ] **Step 4: PEÇA AO IGOR — prod (check + card)**, logo depois do Step 2 (PowerShell 5.1; o link volta para dev no fim):

```powershell
Set-Location "<WT>\apps\web"
supabase link --project-ref nidoatbxaylrkcgbszns --yes
$linkou = ($LASTEXITCODE -eq 0)
if ($linkou) { supabase db query --linked -o json -f ..\..\infra\tests\bio-pages-check.sql }
if ($linkou -and $LASTEXITCODE -eq 0) { supabase db query --linked -o json -f "$env:TEMP\link-da-bio-pr1-card.sql" }
supabase link --project-ref wfjuwogxaupyadwhvoxy --yes
```

Confira na saída dele: o check **sem erro** e `rows[0].r` idêntico ao de dev (Task 2, Step 4); o card com 1 linha, `status` `em_construcao` e o `blocker` novo. Zero linhas no card = key diferente: peça `select key, status from public.board_features where key ilike '%bio%';` e refaça com a key certa. `FALHOU` em prod com dev verde = os bancos divergem em algo que o gate não vê (ACL, CHECK, trigger): migração de ajuste (Task 2, Step 4), nunca DDL à mão.

- [ ] **Step 5: decisão no grafo** — `kg_insert_text` (MCP LightRAG) com `source` `decisao-<AAAA-MM-DD>-link-da-bio-banco` e o texto:

```
decisão (Link da bio, PR 1, #<N>): bio_slugs guarda todo slug já usado e o trigger bio_pages_registra_slug recusa (23505, mensagem citando bio_slugs) slug que já foi de outra página ou de página apagada — slug nunca volta para outra loja, nem para a própria depois de apagar a página. Contadores por dia de America/Sao_Paulo em bio_contagens, escritos só por bio_contar; relatório agregado no SQL por bio_relatorio (porDia com todos os dias, porLink por toques). As três tabelas com RLS ligado e sem policy, nada para anon/authenticated; bio_slugs só select/insert até para service_role. Prova: infra/tests/bio-pages-check.sql nos dois bancos.
```

Se o MCP não responder (memória `finding-kg-query-retorna-none`), entregue ao Igor, na raiz do checkout principal: `.\tools\lightrag\.venv\Scripts\rag.exe insert "<o texto acima>" --source decisao-<AAAA-MM-DD>-link-da-bio-banco`.

- [ ] **Step 6: encerrar** — apagar o worktree só se não houver nada fora do commit (`git -C "$WT" status --porcelain` vazio) e reportar: "PRs que deixei abertos: nenhum" (ou o número e o motivo).

---

## Critérios de aceite do PR

- Quatro arquivos: migração, check, `apply-order.txt` (uma entrada no fim) e `schema-baseline.json` (seis chaves no fim, `gerado_em` intacto).
- `migrate-dev` aplicou no PR e `migrate-prod` aplicou no merge; os dois sem `Falhou em`; `--conferir-baseline` sem `diverge da baseline`.
- `infra/tests/bio-pages-check.sql` sem erro em dev **e** em prod, `r` idêntico nos dois e igual às seis chaves da baseline.
- `verify`, `migrate-dev`, `drift`, `advisors` e `e2e` verdes no PR; nenhum lint novo citando `bio_`.
- Trigger, RPCs, RLS e privilégios conforme a "Interface com os outros PRs" abaixo.
- PR mergeado e branch apagada na mesma sessão; `blocker` do card `link-da-bio` reescrito; decisão no grafo.

## Comandos de verificação

| O quê | Comando | Esperado |
|---|---|---|
| RED (antes do PR) | `cd "$WT/apps/web" && supabase link --project-ref wfjuwogxaupyadwhvoxy --yes && supabase db query --linked -o json -f ../../infra/tests/bio-pages-check.sql` | erro `FALHOU: tabela public.bio_pages ausente` |
| Idempotência e ordem do ACL | os dois `grep` da Task 1, Step 6 | só `drop trigger if exists` + `create trigger`; `create or replace` antes de todo `revoke`/`grant` |
| Ordem e definers | `node --test infra/scripts/apply-migrations.test.ts` (raiz) · `node --test src/lib/supabase/privilegio-definer.test.ts` (`apps/web`) | `fail 0` nos dois |
| Baseline | `git diff --stat deploy/supabase/schema-baseline.json` | `7 insertions(+), 1 deletion(-)` |
| CI do PR | `gh pr checks <N> --repo codingB0y/Girumo --watch` + log | `Aplicando …link_da_bio.sql`, `Sem drift fora da allowlist.` |
| GREEN dev | o comando do RED, depois do `migrate-dev` | exit 0, `rows[0].r` = as seis chaves |
| Prod | log do run do merge (Task 3, Step 2) + check do Igor (Step 4) | sem `diverge da baseline`; check sem erro, `r` igual ao de dev |

## Riscos e pontos de atenção

- **Drift vermelho nos outros PRs** desde o `migrate-dev` deste até o merge (dev tem os objetos, a baseline deles não). Fechar este PR sem pausa; nos outros, depois do merge, `gh pr update-branch <M>` ou `git merge origin/main`. Conflito em `apply-order.txt`/`schema-baseline.json` com PR paralelo: manter as duas entradas, na ordem das datas.
- **Defeito achado depois do `migrate-dev`**: o arquivo aplicado não se edita (o registro é por nome); a correção é migração de ajuste no mesmo PR. Defeito achado com o `migrate-dev` **falhando**: aí sim edita o arquivo, nada foi aplicado.
- **PR abandonado** deixa dev com as tabelas e prod sem: escrever a migração de reversão (cabeçalho da migração), não fechar e esquecer.
- **`alvo` tem de ser `'visita'` ou uuid minúsculo**, senão 23514 (`bio_contagens_alvo_check`). `crypto.randomUUID()` gera minúsculo; o `documentoBio` (PR 2) deve exigir id minúsculo e a rota do toque (PR 4b) validar com regex minúscula — senão um id em maiúsculas vira toque perdido com erro no log.
- **Slug de página apagada fica preso para sempre**, inclusive para a própria loja (o id da página muda). O `criarPaginaDaLoja` (PR 2) já trata 23505 que não é `bio_pages_tenant_id_key` como slug ocupado e tenta com sufixo; o `slugDisponivel` precisa dizer "em uso" nesse caso (linha em `bio_slugs` com `pagina_id` nulo ou de outra página).
- **`bio_relatorio` não tem teto de intervalo**: a API (PR 5) só passa 7 ou 30 dias. Um intervalo de anos devolveria um `porDia` enorme.
- **O check roda em prod**: escreve só dentro de `begin`…`rollback` (lojas falsas, slugs `girumo-check-bio-*`); se a conexão cair no meio, o banco desfaz.
- **`set lock_timeout = '5s'`**: em prod, com `organizations` ocupada, o `migrate-prod` pode falhar com `lock timeout` — rodar o job de novo (`gh run rerun <id> --failed`); o arquivo é idempotente.
- **`move_card` não entra neste PR**: mesmo status não gera evento; o card só muda de coluna no fim da série (§13).

## Interface com os outros PRs

**Este PR exporta** (no banco; o consumidor direto é o store `apps/web/src/lib/stores/bio-pages.ts` do PR 2, e por ele os PRs 4a, 4b e 5):

| Objeto | Contrato |
|---|---|
| `public.bio_pages` | colunas do §5; `documento` sem default (o insert manda); `versao` default 1; `publicada` default false; `updated_at` sem trigger (o store grava junto com `versao + 1`); `tenant_id` nunca muda |
| `public.bio_slugs` | `slug` pk, `pagina_id` (nulo = página apagada), `criado_em`; escrita **só** pelo trigger; o app lê por `slug` (`lerPublicadaPorSlug`, `slugDisponivel`); service_role sem UPDATE/DELETE |
| `public.bio_contagens` | pk `(pagina_id, dia, alvo)`; escrita só por `bio_contar`, leitura só por `bio_relatorio` |
| trigger `bio_pages_registra_slug` | `after insert or update of slug`; slug que já foi de outra página ou de página apagada → 23505 |
| `public.bio_contar(p_pagina uuid, p_alvo text) returns void` | +1 no dia de hoje em `America/Sao_Paulo`; página inexistente = nada, sem erro; `p_alvo` fora de `'visita'`/uuid minúsculo = 23514 |
| `public.bio_relatorio(p_tenant uuid, p_desde date, p_ate date) returns jsonb` | `RelatorioBio` (§9): `porDia` com todo dia de `p_desde` a `p_ate` em ordem crescente (zeros incluídos); `porLink` sem `visita`, por `toques` desc e `linkId`; `p_desde > p_ate` → `{visitas:0, toques:0, porLink:[], porDia:[]}`; loja sem página → zeros com os dias |
| privilégios | só `service_role` (`getSupabaseAdmin()`); anon/authenticated recebem permission denied em tudo |
| slug | CHECK `^[a-z0-9]+(-[a-z0-9]+)*$` e 3–40 no banco: `_dominio` (rota da raiz do domínio próprio, PR 4a) nunca colide com página; os reservados de `slugReservado` ficam no app (PR 2) |

Erros que o PR 2 lê (`code` e `message` como o PostgREST devolve):

| Situação | `code` | `message` |
|---|---|---|
| segunda página da loja (insert) | `23505` | `duplicate key value violates unique constraint "bio_pages_tenant_id_key"` |
| slug atual de outra página | `23505` | `duplicate key value violates unique constraint "bio_pages_slug_key"` |
| slug que já foi de outra página ou de página apagada | `23505` | `bio_slugs: o slug "<slug>" já foi de outra página` |
| slug fora do formato / `versao` ≤ 0 | `23514` | `new row for relation "bio_pages" violates check constraint "bio_pages_slug_check"` / `"bio_pages_versao_check"` |
| `alvo` fora do formato | `23514` | `new row for relation "bio_contagens" violates check constraint "bio_contagens_alvo_check"` |

Como o PR 2 chama e o que volta (TypeScript; `RelatorioBio` é declarado no PR 2, §9 — aqui só o formato que o banco entrega):

```ts
// Linha de public.bio_pages como o PostgREST devolve (o PR 2 mapeia para PaginaBio, §9):
type LinhaBioPage = {
  id: string; tenant_id: string; slug: string; publicada: boolean; bloqueada_em: string | null;
  documento: unknown; versao: number; created_at: string; updated_at: string;
};
// getSupabaseAdmin().rpc("bio_contar", { p_pagina: string, p_alvo: "visita" | string /* uuid minúsculo */ })
//   → { data: null; error: PostgrestError | null }
// getSupabaseAdmin().rpc("bio_relatorio", { p_tenant: string, p_desde: string /* YYYY-MM-DD */, p_ate: string })
//   → { data: RelatorioBio; error: PostgrestError | null }
type RelatorioBio = {
  visitas: number; toques: number;
  porLink: { linkId: string; toques: number }[];
  porDia: { dia: string /* YYYY-MM-DD */; visitas: number; toques: number }[];
};
```

**Este PR usa de outro PR:** nada. Depende só do que já está em `main`: `public.organizations(id)`, `public.schema_signature()` e os papéis `anon`, `authenticated` e `service_role`.
