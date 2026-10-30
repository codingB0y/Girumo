# Recuperar (Yampi) — PR 1b: banco do Recuperar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar no banco as quatro tabelas do Recuperar (`recovery_settings`, `recovery_cases`, `recovery_scripts`, `recovery_testimonials`), as quatro colunas do Recuperar na `private_messages`, a limpeza dos casos vencidos e o bucket privado `recuperar-depoimentos`, com a prova de RLS, privilégios e regras nos dois bancos.

**Architecture:** Uma migração idempotente aplicada pelo CI (`migrate-dev` no PR, `migrate-prod` no merge). Só o servidor (service_role) escreve; o navegador (`authenticated`) só lê as quatro tabelas, pelo helper `app.user_tenant_ids()`, que já exclui a vendedora. O que a spec põe em "não pode acontecer" (link com login embutido, JID `@lid`, depoimento sem autorização) vira CHECK. Duas provas: `infra/tests/recuperar-banco-check.sql` (catálogo, regras e limpeza, `begin`…`rollback`, nos dois bancos) e `banco.integration.test.ts` (o que o PostgREST e um JWT de verdade enxergam, no job `e2e`).

**Tech Stack:** Postgres 17 (Supabase), SQL/plpgsql, Supabase CLI (`db query --linked`), TypeScript strict + `node:test` via `tsx`, GitHub Actions (`.github/workflows/verify.yml`), `gh`.

**Spec:** `docs/superpowers/specs/2026-10-29-recuperar-yampi-design.md` — §2 inteiro; regras de §1.1, 1.2, 1.3, 1.8, 1.9, 1.10; retenção (§2); "Cobrança e liberação" (§3).
**Índice da série:** `docs/superpowers/plans/2026-10-29-recuperar-yampi-00-indice.md` ("Contrato comum") · **Card:** `recuperar-yampi` (prod, `em_construcao`)

Fora deste PR: seeds dos scripts padrão (PR 7, depois da Fase 0), qualquer TypeScript de produção (stores, rotas, telas, `requireRecuperar`) e o horário do número (está no `private_number_state`, PR 1a).

## Decisões deste plano (onde a spec e o contrato não diziam)

1. **Telefone.** `recovery_cases.phone_key` é coluna gerada com `public.phone_key(phone)` (já existe, `20261010130000_funil_anuncios_tabelas.sql:14`; ninguém cria outra). `phone` aceita só dígitos, 10 a 15, sem zero à esquerda — frouxo de propósito: a montagem `55` + DDD + número é do TypeScript (PR 7) e a Fase 0 confirma o formato. O zero à esquerda é recusado porque `phone_key` o descarta e deixaria o caso sem chave.
2. **RLS: o navegador lê as quatro tabelas; nenhuma escreve.** Uma policy por tabela, `for select to authenticated using (tenant_id = any (app.user_tenant_ids()))` — a forma da padronização de 13/07, que avalia o helper uma vez por consulta (`app.has_membership(tenant_id)` rodaria por linha). O helper exclui a vendedora com ou sem o módulo `recuperar`: ela passa por rota service-role + guarda. Hoje nada lê pelo JWT (a spec escolheu polling); a policy existe pela regra do CLAUDE.md ("RLS + policy assim mesmo") e para o teste "vendedora não lê" não ser vazio. Descartado: nenhuma policy, como em `bling_*` (a spec §2 manda policy, e o teste de RLS não teria controle). A policy **não** checa `recuperar_enabled`: add-on desligado deixa "os dados pra consulta" (spec §3) e o corte é do `requireRecuperar` (PR 5); também não substitui o `.eq('tenant_id')` das stores. `authenticated` fica só com SELECT.
3. **"Fechado", para a retenção** = todo status fora de `agendado` e `em_sequencia` (os que esperam o próximo passo automático). Entra `respondeu`, que não tem saída própria (a conversa segue com a equipe): sem isso um caso esquecido guardaria telefone e código Pix para sempre. O relógio é `updated_at` (caso fechado não muda mais; o trigger `set_updated_at` o mantém), limite `180 days`. Não existe `closed_at`.
4. **Limpeza em dois nomes.** `app.limpar_dados_vencidos_recuperar()` (contrato; `security invoker`) e o wrapper `public.limpar_dados_vencidos_recuperar()` (`security definer`, `set search_path = ''`), porque o PostgREST só enxerga `public` — mesmo desenho de `prune_instance_sends`. O `/api/cron/recuperar` chama `.rpc("limpar_dados_vencidos_recuperar")`. As duas: `revoke all … from public, anon, authenticated`, `execute` só para `service_role`.
5. **`first_sent_at`** em `recovery_cases` (fora da lista da spec): "recebeu sequência nos últimos 7 dias" (§1.1), "pagou depois de pelo menos um passo enviado" e "7 dias da C1" (§1.8) precisam saber quando saiu o primeiro passo.
6. **Confirmação de privacidade** (§3, "Na ativação, o lojista confirma…") **não** tem coluna aqui: o plano do PR 5 a grava em `logs` (`event = recuperar.aviso.confirmado`), sem migração, e o PR 5 não depende do 1b.
7. **Opções de §1.2/§1.3** viram colunas com CHECK nas listas da spec, `0` = "não mandar/não lembrar": `pix_espera_p1_min` (3, 5, 10; padrão 3), `pix_lembrete_antes_min` (0, 10, 30; padrão 10), `carrinho_espera_c1` (`3h` · `dia_seguinte_10h` · `dois_dias_10h`; padrão `dia_seguinte_10h`), `carrinho_c2_dias` (0, 1, 2; padrão 1), `carrinho_c3_ligado` (padrão false, "desligado por padrão"). `pix_ligado` nasce true e `carrinho_ligado` false: a spec só fixa `automatico` false e `controle` true; o carrinho só liga depois do teste de balanceamento escrito (§6) e o Pix é a primeira entrega.
8. **Scripts.** `variants` é `text[]` (1 a 3 textos; o contador por versão sai de `private_messages.script_id` + `variant`, sem coluna de contador); `fixed_variant` vai de 1 a `cardinality(variants)`; `kind` ganha `geral` (script de chat que serve aos dois tipos, ex.: frete e prazo); script de chat tem 1 versão (A/B é "por passo automático", §1.9); `geral` não existe em script automático.
9. **`step`, `step_key` e `stop_reason`** só têm CHECK de formato (`^[a-z0-9_]{1,30}$`; 40 em `stop_reason`): o vocabulário dos passos é do PR 7. `private_messages.variant` vai de 1 a 3.
10. **FKs para caso, script e conversa são `on delete set null`**, sem CHECK ligando `script_id` a `variant`: apagar caso, script ou conversa não pode derrubar o histórico nem fazer a ação da FK falhar.
11. **Depoimento.** `authorized_by` e `authorized_at` NOT NULL (sem autorização a linha não existe, §1.10), sem FK em `authorized_by`. `storage_path` começa com `<tenant_id>/`, sem `..`, termina em jpg/jpeg/png/webp. "Até 10 ativos" fica na rota do PR 10 (limite de produto, não de segurança). Bucket `recuperar-depoimentos`: privado, 524288 bytes (teto de segurança acima dos 300 KB que o código reduz), `image/jpeg`, `image/png`, `image/webp`, **sem policy** em `storage.objects` — só service-role (URL assinada).
12. **Recusado pelo banco porque a spec manda:** `link` só `https://` e sem `customerToken`/`customer_token` (nunca o `simulate_url`); `jid` só `<dígitos>@s.whatsapp.net` (nunca `@lid` nem `@g.us`); `total_cents > 0` (valor zero fica de fora, §1.1); `items` é lista de até 30; `agendado` exige `next_step_at`; `recuperado` exige `recovered_at` e `recovered_cents`; `controle` exige `control`. Se a Fase 0 mostrar credencial com outro nome no link, o PR 7 troca o CHECK em migração própria.
13. **Baseline.** `npm run schema:baseline` regrava o arquivo inteiro a partir do dev: só vale se o diff trouxer apenas as chaves deste PR (conferência na Task 3). Sem credencial de dev na máquina, a Task 3 aplica só as seis chaves que o check devolve em `r`.

## Global Constraints

- Valores da spec que o banco fixa (verbatim): status do caso `agendado` · `em_sequencia` · `respondeu` · `recuperado` · `virou_pedido` · `parado` · `perdido` · `sem_whatsapp` · `nao_quer` · `controle`; `kind` `pix` · `carrinho`; `use` `automatico` · `chat`; `variants` 1 a 3; `items` até 30; legenda até 300 caracteres; `automatico` false; `controle` true; casos "180 dias depois de fechados"; bucket privado `recuperar-depoimentos`; "Toda tabela tem `tenant_id`, RLS ligado e policy no padrão `auth.uid()` + `memberships`".
- TypeScript strict, imports com `@/`, arquivos em `kebab-case`, sem `any` sem justificativa. Nomes de domínio seguem o código (em português).
- Store com service-role filtra `.eq('tenant_id', …)` sempre: o RLS não protege esse caminho.
- Migração: arquivo novo em `apps/web/supabase/migrations/` + linha no fim de `deploy/supabase/apply-order.txt`; o CI aplica em dev no PR e em prod no merge; baseline no mesmo PR; idempotente (`if not exists`); `security definer` sempre com `set search_path`; RLS ligado; policy no padrão `auth.uid()` + `memberships` (`app.has_membership`, `app.user_tenant_ids`), nunca GUC. **Nunca DDL à mão.**
- Função nova: conferir `has_function_privilege` de `anon`, `authenticated` e `public` (o event trigger `ensure_anon_revoked` cobre `anon`/`public` só em `public`; `authenticated` nasce com EXECUTE pelo default privilege; o schema `app` não tem event trigger).
- `hubflow-engine/DECISIONS.md` é vinculante: nada de "digitando", marcar como lida, texto girado, troca de aparelho, proxy. O número dos grupos nunca manda DM; o número do atendimento nunca posta em grupo (trava com teste mutante, PRs 2 e 3).
- Tipos: rodar os dois `tsc` (web e worker); lint e `tsx --test` não checam tipo. Antes do push: `verify-local.ps1` (secrets + build).
- Texto de tela em português do Brasil, design G2 — não se aplica a este PR, que não tem tela.
- Repo público: nenhum dado de cliente. Telefones de teste: `5511900000001`, `5511900000002` e a forma sem 55 e sem o 9º dígito, `1100000001`; lojas falsas. `pix_code`, telefone e link nunca vão para log (`log.ts`): vale para as mensagens dos testes.
- Bash do executor: o cwd reseta entre chamadas, todo comando começa com `WT=$(git rev-parse --show-toplevel)`. Blocos para o Igor: PowerShell 5.1 (sem `&&`), com o caminho Windows `<WT>` da Task 1.
- Commits em inglês, prefixo semântico, com a linha `Co-Authored-By` do assistente que executa (os exemplos usam `Claude Sonnet 5.5 <noreply@anthropic.com>`; troque pelo modelo da sessão). Um PR = uma coisa: 5 arquivos.

## Review Focus

1. **Telefone sem 55 ou sem o 9º dígito.** O mesmo celular chega como `5511900000001` no pedido e `1100000001` no cadastro; a chave tem de ser igual, senão o SAIR, a lista da equipe e "recebeu sequência nos últimos 7 dias" deixam passar a mesma pessoa. → Task 1: check bloco 2 e teste "phone_key".
2. **Aviso repetido, e o mesmo número em dois tipos.** A Yampi manda o aviso duas vezes e um carrinho e um pedido podem ter o mesmo id numérico. Repetir não cria outro caso; outro tipo ou outra loja passa. → Task 1: check bloco 2 e teste "único".
3. **Link com o login da cliente, JID `@lid`, valor zero.** O `simulate_url` entra logado na conta da cliente; o `@lid` seria mandado como telefone; valor zero fica de fora. Quem recusa é o banco, não o código de quem chamar. → Task 1: check bloco 2 e teste "CHECKs".
4. **Caso que ficou em `respondeu` e ninguém mais tocou, e caso apagado com mensagens no histórico.** Some depois de 180 dias; a mensagem fica com `case_id` nulo e a versão intacta; o que espera o próximo passo nunca some; a contagem devolvida é a certa. → Task 1: check bloco 3 e teste "limpeza".
5. **Vendedora (com ou sem o módulo), dona de outra loja, usuário logado tentando escrever, chamada anônima.** Leitura só da própria loja e nunca pela vendedora; nenhuma escrita; a limpeza não executa por JWT. → Task 1: teste "RLS", teste "authenticated só lê" e check bloco 1.

---

## Arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `infra/tests/recuperar-banco-check.sql` | criar | conferência nos dois bancos: catálogo (RLS, policy, ACL, trigger, FK, bucket), regras principais, limpeza, e a assinatura dos seis objetos da baseline |
| `apps/web/src/lib/recuperar/banco.integration.test.ts` | criar | o que o PostgREST e um JWT veem: RLS, escrita negada, a matriz de CHECKs, erros que o store lê, limpeza, FKs, bucket |
| `apps/web/supabase/migrations/20261029140000_recuperar_banco.sql` | criar | tabelas, colunas, índices, triggers, RLS, privilégios, limpeza, bucket |
| `deploy/supabase/apply-order.txt` | modificar | entrada da migração no fim |
| `deploy/supabase/schema-baseline.json` | modificar | quatro `t|` novas, `t|private_messages` mudada, uma `f|` nova |

---

### Task 1: preparação e testes primeiro (RED)

**Files:**
- Create: `infra/tests/recuperar-banco-check.sql`
- Create: `apps/web/src/lib/recuperar/banco.integration.test.ts`

**Interfaces:**
- Consumes (PR 1a já em `main` e aplicado em dev): `public.organizations(id)`, `public.private_conversations(id uuid)`, `public.private_messages(id uuid)`, `public.instances.purpose`, `memberships.modules` aceitando `recuperar`. Já existentes: `public.phone_key(text)`, `app.user_tenant_ids()`, `app.set_updated_at()`, `public.schema_signature()`, `getSupabaseAdmin()` e `getSupabaseAnonForToken(token)` de `@/lib/supabase/server`.
- Produces — os nomes que os dois testes fixam e a Task 2 cria **idênticos**:
  - tabelas `public.recovery_settings`, `recovery_cases`, `recovery_scripts`, `recovery_testimonials`; policies `<tabela>_select_member`; triggers `set_updated_at_<tabela>`;
  - funções `app.limpar_dados_vencidos_recuperar()` e `public.limpar_dados_vencidos_recuperar()` (`returns integer`);
  - `private_messages`: colunas `case_id uuid`, `step_key text`, `script_id uuid`, `variant smallint`; FKs `private_messages_case_id_fkey` e `private_messages_script_id_fkey` (`on delete set null`); CHECKs `private_messages_step_key_check` e `private_messages_variant_check`; índices `private_messages_case_idx` e `private_messages_script_idx`;
  - constraints: `recovery_settings_{pix_p1,pix_lembrete,carrinho_c1,carrinho_c2,textos,pedido_minimo,numeros}_check`; `recovery_cases_tenant_kind_yampi_key` e `recovery_cases_{kind,status,tamanhos,phone,jid,total,items,link,step,stop_reason,recovered_cents,recuperado,agendado,controle}_check`; `recovery_scripts_tenant_key_key` e `recovery_scripts_{key,kind,use,title,variants,fixed,chat,automatico}_check`; `recovery_testimonials_storage_path_key` e `recovery_testimonials_{path,caption,label,contadores}_check`;
  - índices `recovery_cases_{agendador,telefone,cart_token,lista,conversa}_idx` e `recovery_testimonials_ativos_idx`; bucket `recuperar-depoimentos`.

- [ ] **Step 1: worktree novo a partir de `origin/main`** (regra do CLAUDE.md global; nunca `checkout -b` no checkout principal). Se a sessão já está num worktree novo, só crie a branch: `git switch -c feat/recuperar-banco-recuperar origin/main`. Senão:

```bash
git -C /c/Users/Igor/Desktop/HubFlow-platform fetch origin main && git -C /c/Users/Igor/Desktop/HubFlow-platform worktree add .claude/worktrees/recuperar-1b -b feat/recuperar-banco-recuperar origin/main
```

Daqui em diante, trabalhe dentro desse worktree.

- [ ] **Step 2: posição, o PR 1a em `main` e nada do 1b existindo** (regra de PR do CLAUDE.md: defasagem e branches abertas):

```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" fetch origin main; git -C "$WT" status -sb | head -1; git -C "$WT" rev-list --count HEAD..origin/main; echo "--- 1a em main:"; git -C "$WT" grep -l "public.private_messages" origin/main -- apps/web/supabase/migrations; echo "--- 1b ja existe:"; git -C "$WT" grep -l "recovery_cases" origin/main -- apps/web/supabase/migrations; for b in $(git -C "$WT" for-each-ref --format='%(refname:short)' refs/remotes/origin | grep -v '/HEAD$'); do git -C "$WT" grep -l "recovery_cases" "$b" -- apps/web/supabase/migrations; done; gh pr list --repo codingB0y/Girumo --state open --json number,title,headRefName | grep -i -E "1b|recovery_|banco-recuperar"
```

Esperado: `## feat/recuperar-banco-recuperar`, `0`; sob "1a em main", o arquivo da migração do PR 1a; sob "1b ja existe" e depois dele, **nada**; nenhum PR aberto de banco do Recuperar. Nenhum arquivo da 1a em `main` = o PR 1a não mergeou: **pare**. Qualquer linha sob "1b ja existe" ou um PR/branch com `recovery_cases` em migração = outra sessão fez isto: **pare** e avise o Igor.

- [ ] **Step 3: anotar `<WT>` e o prefixo da migração.**

```bash
cygpath -w "$(git rev-parse --show-toplevel)"
```

O plano usa `20261029140000_recuperar_banco.sql`. Se hoje não é 29/10/2026, ou se o prefixo já existe em `apps/web/supabase/migrations/`, troque `20261029140000` por `<AAAAMMDD de hoje>140000` em todo lugar onde ele aparece neste plano e nos arquivos que você criar (`grep -rn 20261029140000` no fim confere). Prefixo duplicado quebra o Supabase CLI; a ordem de aplicação é a da `apply-order`, não a do prefixo.

- [ ] **Step 4: escrever a conferência SQL** — `infra/tests/recuperar-banco-check.sql`. Molde: `infra/tests/bio-pages-check.sql` (cabeçalho com o nome da migração e os comandos de execução nos dois bancos; tudo entre `begin` e `rollback`; cada bloco levanta `FALHOU: …`; a assinatura vem depois do `rollback`). Lojas falsas `TA = 0ec00000-0000-4000-8000-00000000000a` e `TB = …0b` (em `public.organizations (id, tenant_id, name, slug)`, slug `check-recuperar-0ec0-ta`/`-tb`). Antes da migração o bloco 1 falha com `FALHOU: tabela public.recovery_settings ausente` — é o RED. Para os casos que **têm de falhar**, uma função temporária que confere a constraint (a matriz completa de recusas é a do teste de integração, Step 6; aqui ficam as principais, para provar prod):

```sql
create function pg_temp.recusa(p_sql text, p_esperado text) returns void
language plpgsql as $$
declare v_constraint text; v_estado text; v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_constraint = constraint_name, v_estado = returned_sqlstate, v_msg = message_text;
    if p_esperado in (v_constraint, v_estado) then return; end if;
    raise exception 'FALHOU: "%" falhou por outro motivo (% / %): %', p_sql, v_estado, v_constraint, v_msg;
  end;
  raise exception 'FALHOU: aceito, deveria recusar: %', p_sql;
end $$;
```

Cada "→ constraint" abaixo é uma linha `select pg_temp.recusa($q$ … $q$, '<constraint ou sqlstate>');`. Base do caso: `insert into public.recovery_cases (tenant_id, kind, yampi_id, phone, total_cents, status) values (TA, 'pix', '<id novo>', '5511900000001', 15000, 'em_sequencia')`. Os blocos:

  1. **Estrutura e privilégios.** (a) as quatro tabelas existem, `relrowsecurity`, **exatamente uma** policy `<tabela>_select_member` com `polcmd = 'r'`, `polroles` só `authenticated` e `pg_get_expr(polqual)` contendo `user_tenant_ids`; (b) `anon` sem nenhum de `SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER`; `authenticated` com `SELECT` e sem `INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER` (nem `has_any_column_privilege` de escrita); `service_role` com `SELECT,INSERT,UPDATE,DELETE`; (c) quatro triggers `set_updated_at_<tabela>` com `tgenabled = 'O'` chamando `app.set_updated_at()`; (d) as duas funções de limpeza: `app.` com `not prosecdef`, `public.` com `prosecdef`, as duas com `search_path=` em `proconfig`, `proacl` não nulo e sem `EXECUTE` para PUBLIC (`aclexplode`, `grantee = 0`), sem `EXECUTE` para `anon`/`authenticated`, e `service_role` executando a `public.`; (e) `private_messages`: as quatro colunas com `format_type` `uuid`, `text`, `uuid`, `smallint`, as duas FKs com `confdeltype = 'n'` apontando para `recovery_cases` e `recovery_scripts`; (f) bucket: linha `recuperar-depoimentos` com `public = false`, `file_size_limit = 524288`, `allowed_mime_types` = jpeg, png, webp, e **nenhuma** policy de `storage.objects` sem `bucket_id` no `qual` ou citando `recuperar-depoimentos` (`FALHOU: policy de storage.objects expõe o bucket: <nome>`); (g) todo nome de constraint e de índice da lista em **Produces** aparece em `pg_constraint`/`pg_indexes`.
  2. **Regras.** `insert into recovery_settings (tenant_id) values (TA)` e ler os padrões da Decisão 7 mais `automatico false`, `pix_ligado true`, `carrinho_ligado false`, `controle true`, `responder_com_link true`, `numeros_ignorados '{}'`; `pix_espera_p1_min = 4` → `recovery_settings_pix_p1_check`; `numeros_ignorados = array['(85) 99999-0000']` → `recovery_settings_numeros_check`. Casos: `phone '5511900000001'` e `'1100000001'` dão `phone_key = '1100000001'` nos dois; `link` com `customerToken` → `recovery_cases_link_check`; `jid '123456789012345@lid'` → `recovery_cases_jid_check`; `total_cents 0` → `recovery_cases_total_check`; `status 'agendado'` sem `next_step_at` → `recovery_cases_agendado_check`; mesmo `(TA,'pix', id)` → `recovery_cases_tenant_kind_yampi_key`; mesmo `yampi_id` com `kind 'carrinho'` e na loja TB passa. Scripts (base `(TA, 'pix.p1', 'pix', 'automatico', 'Pix P1', array['a','b'])`): `use 'chat'` com duas versões → `recovery_scripts_chat_check`; `fixed_variant 3` com duas versões → `recovery_scripts_fixed_check`. Depoimentos (path `<TA>/foto-1.jpg`): `authorized_by` nulo → `23502`; path de TB → `recovery_testimonials_path_check`. Trigger: caso inserido com `updated_at = now() - interval '2 days'`, depois `update … set stop_reason = 'x'`, e `updated_at >= now()`.
  3. **Limpeza.** Em TA, sete casos com `updated_at` explícito no `insert` (o trigger só age em `update`): `perdido` 181 dias, `recuperado` 400 dias (com `recovered_at` e `recovered_cents`), `respondeu` 181 dias → somem; `parado` 179 dias, `respondeu` 10 dias, `agendado` 181 dias (com `next_step_at`), `em_sequencia` 181 dias → ficam. `select app.limpar_dados_vencidos_recuperar()` devolve `>= 3` (outras lojas reais podem ter vencidos; o rollback desfaz) e restam exatamente os quatro.
  4. **Assinatura** (depois do `rollback;`, só leitura): `select json_object_agg(kind || '|' || nome, sig order by kind || '|' || nome collate "C") as r from public.schema_signature() where (kind = 't' and nome in ('recovery_settings','recovery_cases','recovery_scripts','recovery_testimonials','private_messages')) or (kind = 'f' and nome = 'limpar_dados_vencidos_recuperar()');` — seis chaves.

- [ ] **Step 5: RED do check em dev** (DML dentro de `begin`…`rollback`, só leitura no fim; liberado ao executor — se o classificador negar, pule: o `migrate-dev` e o GREEN da Task 3 cobrem):

```bash
WT=$(git rev-parse --show-toplevel); cd "$WT/apps/web" && supabase link --project-ref wfjuwogxaupyadwhvoxy --yes && supabase db query --linked -o json -f ../../infra/tests/recuperar-banco-check.sql
```

Esperado: sai com erro `… P0001: FALHOU: tabela public.recovery_settings ausente`. Qualquer outro `FALHOU` = já existe algo `recovery_` em dev: pare e investigue. (`apps/web/supabase/.temp/` está no `.gitignore`: o `link` não suja o git.)

- [ ] **Step 6: escrever o teste de integração** — `apps/web/src/lib/recuperar/banco.integration.test.ts`. Molde: `apps/web/src/lib/stores/order-items.integration.test.ts` — copie dele `pular()` (pula sem `E2E_TENANT_ID` ou com `SUPABASE_URL` de produção), `criarPessoa()` (usuário de auth novo + login por senha, JWT) e o `after()` que tenta tudo e junta as falhas. O `before()` cria **duas** lojas (`recuptest ${RUN}` e `recuptest vizinha ${RUN}`), três pessoas — `dona` (`owner` na loja), `vendedora` (`seller`, módulos vazios) e `vendedoraComModulo` (`seller`, `modules: ["recuperar"]`; o CHECK aceitar `recuperar` é do PR 1a) — e `semear(tenant)` nas duas lojas: uma linha de `recovery_settings` (só `tenant_id`), um caso (`yampi_id 'semente'`, `phone '5511900000002'`, `status 'em_sequencia'`), um script (`carrinho.c1`, `kind 'carrinho'`, `variants ['a']`) e um depoimento (`<tenant>/semente-${RUN}.jpg`, `authorized_by` = id da dona). O `after()` acrescenta: apagar do bucket os caminhos de `objetos` e contar as quatro tabelas nas duas lojas depois da cascata (devem ser 0). Declarações e helpers (corpo a escrever; só as assinaturas e os valores estão fixos):

```ts
const RUN = randomUUID().slice(0, 8);
const DIA = 86_400_000;
const BUCKET = "recuperar-depoimentos";
const STATUS_DA_SPEC = ["agendado", "em_sequencia", "respondeu", "recuperado", "virou_pedido", "parado", "perdido", "sem_whatsapp", "nao_quer", "controle"] as const;
const TABELAS = ["recovery_settings", "recovery_cases", "recovery_scripts", "recovery_testimonials"] as const;
type Tabela = (typeof TABELAS)[number];
type Linha = Record<string, unknown>;
type Erro = { code?: string; message: string } | null;
type Pessoa = { id: string; token: string };

const db = () => getSupabaseAdmin();
const usuarios: string[] = [];   // ids de auth criados; apagados no after()
const objetos: string[] = [];    // caminhos no bucket; apagados no after()
let loja = ""; let vizinha = "";
let dona: Pessoa = { id: "", token: "" }; let vendedora: Pessoa = { id: "", token: "" }; let vendedoraComModulo: Pessoa = { id: "", token: "" };

/** Insert pelo service-role; devolve o erro cru para os testes lerem code e message. */
async function inserir(tabela: string, linha: Linha): Promise<{ data: Linha | null; error: Erro }>;
/** assert.equal(erro?.code, code) e assert.match(erro?.message ?? "", new RegExp(trecho)): o que o store do PR 7 vai ler. */
function recusado(erro: Erro, code: string, trecho: string): void;
/** Linhas de `tenant` que o PostgREST devolve a este JWT (caminho authenticated, com RLS). */
async function visiveis(token: string, tabela: Tabela, tenant: string): Promise<number>;
const caso = (extra: Linha = {}): Linha => ({ tenant_id: loja, kind: "pix", yampi_id: `y-${randomUUID().slice(0, 8)}`,
  phone: "5511900000001", total_cents: 15_000, status: "em_sequencia", ...extra });
const script = (extra: Linha = {}): Linha => ({ tenant_id: loja, key: `pix.${randomUUID().slice(0, 6)}`, kind: "pix",
  use: "automatico", title: "Pix", variants: ["a", "b"], ...extra });
const depoimento = (extra: Linha = {}): Linha => ({ tenant_id: loja, storage_path: `${loja}/${randomUUID().slice(0, 6)}.jpg`,
  caption: "Amei", label: "Ana", authorized_by: dona.id, ...extra });
/**
 * Fixture mínima da 1a: uma `instances` (`purpose: "privado"`), uma `private_conversations` e uma `private_messages`
 * ligada ao caso e ao script, com `variant: 2`. Preencha as colunas NOT NULL e o valor de `direction` (saída) como a
 * migração do PR 1a, já em main, exige. Devolve o id da mensagem.
 */
async function mensagemDoCaso(casoId: string, scriptId: string): Promise<string>;
```

Os oito testes (todos com `{ skip: pular() }`), com as asserções:

```ts
test("RLS: a dona lê as quatro tabelas da loja; as duas vendedoras leem zero; a vizinha não aparece", async () => {
  for (const t of TABELAS) {
    assert.ok((await visiveis(dona.token, t, loja)) > 0, `a dona não viu ${t}: o controle falhou e o teste não prova nada`);
    assert.equal(await visiveis(vendedora.token, t, loja), 0, `a vendedora leu ${t} direto do banco`);
    assert.equal(await visiveis(vendedoraComModulo.token, t, loja), 0, `o módulo recuperar abriu ${t} pelo PostgREST`);
    assert.equal(await visiveis(dona.token, t, vizinha), 0, `a dona leu ${t} da vizinha`);
  }
});

test("authenticated só lê: escrever pelo JWT da dona, ler com a anon key e chamar a limpeza dão 42501", async () => {
  const jwtDona = getSupabaseAnonForToken(dona.token);
  const anon = getSupabaseAnonForToken(process.env.SUPABASE_ANON_KEY ?? "");
  for (const t of TABELAS) {
    assert.equal((await jwtDona.from(t).insert({ tenant_id: loja })).error?.code, "42501", `insert em ${t}`);
    assert.equal((await jwtDona.from(t).update({ updated_at: new Date().toISOString() }).eq("tenant_id", loja)).error?.code, "42501", `update em ${t}`);
    assert.equal((await jwtDona.from(t).delete().eq("tenant_id", loja)).error?.code, "42501", `delete em ${t}`);
    assert.equal((await anon.from(t).select("tenant_id")).error?.code, "42501", `anon leu ${t}`);
  }
  assert.equal((await jwtDona.rpc("limpar_dados_vencidos_recuperar")).error?.code, "42501");
  assert.equal((await anon.rpc("limpar_dados_vencidos_recuperar")).error?.code, "42501");
});

test("phone_key: telefone com e sem 55 e 9º dígito gera a mesma chave, e a busca por ela acha os dois", async () => {
  const a = await inserir("recovery_cases", caso({ yampi_id: "pk-a", phone: "5511900000001" }));
  const b = await inserir("recovery_cases", caso({ yampi_id: "pk-b", kind: "carrinho", phone: "1100000001" }));
  assert.equal(a.error, null); assert.equal(b.error, null);
  assert.equal(a.data?.phone_key, "1100000001"); assert.equal(b.data?.phone_key, "1100000001");
  const { data } = await db().from("recovery_cases").select("yampi_id").eq("tenant_id", loja).eq("phone_key", "1100000001");
  assert.deepEqual((data ?? []).map((r) => r.yampi_id).sort(), ["pk-a", "pk-b"]);
});

test("único: (loja, tipo, id da Yampi), chave do script e caminho do depoimento; o mesmo id em outro tipo ou outra loja passa", async () => {
  assert.equal((await inserir("recovery_cases", caso({ yampi_id: "dup-1" }))).error, null);
  recusado((await inserir("recovery_cases", caso({ yampi_id: "dup-1" }))).error, "23505", "recovery_cases_tenant_kind_yampi_key");
  assert.equal((await inserir("recovery_cases", caso({ yampi_id: "dup-1", kind: "carrinho" }))).error, null);
  assert.equal((await inserir("recovery_cases", { ...caso({ yampi_id: "dup-1" }), tenant_id: vizinha })).error, null);
  const s = script({ key: "pix.dup" }); const d = depoimento();
  assert.equal((await inserir("recovery_scripts", s)).error, null);
  recusado((await inserir("recovery_scripts", s)).error, "23505", "recovery_scripts_tenant_key_key");
  assert.equal((await inserir("recovery_testimonials", d)).error, null);
  recusado((await inserir("recovery_testimonials", d)).error, "23505", "recovery_testimonials_storage_path_key");
});

test("CHECKs: o banco recusa o que a spec proíbe, com o code e a constraint que o store do PR 7 lê", async () => {
  const recusas: Array<[Tabela, Linha, string, string]> = [
    ["recovery_cases", caso({ kind: "boleto" }), "23514", "recovery_cases_kind_check"],
    ["recovery_cases", caso({ status: "pago" }), "23514", "recovery_cases_status_check"],
    ["recovery_cases", caso({ phone: "(11) 90000-0001" }), "23514", "recovery_cases_phone_check"],
    ["recovery_cases", caso({ jid: "123456789012345@lid" }), "23514", "recovery_cases_jid_check"],
    ["recovery_cases", caso({ jid: "120363000000000000@g.us" }), "23514", "recovery_cases_jid_check"],
    ["recovery_cases", caso({ total_cents: 0 }), "23514", "recovery_cases_total_check"],
    ["recovery_cases", caso({ items: Array.from({ length: 31 }, (_, i) => ({ nome: `p${i}` })) }), "23514", "recovery_cases_items_check"],
    ["recovery_cases", caso({ link: "https://seguro.loja.test/c/abc?customerToken=xyz" }), "23514", "recovery_cases_link_check"],
    ["recovery_cases", caso({ link: "http://seguro.loja.test/c/abc" }), "23514", "recovery_cases_link_check"],
    ["recovery_cases", caso({ pix_code: "0".repeat(2049) }), "23514", "recovery_cases_tamanhos_check"],
    ["recovery_cases", caso({ step: "P1" }), "23514", "recovery_cases_step_check"],
    ["recovery_cases", caso({ stop_reason: "Pago por outro" }), "23514", "recovery_cases_stop_reason_check"],
    ["recovery_cases", caso({ recovered_cents: 0 }), "23514", "recovery_cases_recovered_cents_check"],
    ["recovery_cases", caso({ status: "agendado" }), "23514", "recovery_cases_agendado_check"],      // sem next_step_at
    ["recovery_cases", caso({ status: "recuperado" }), "23514", "recovery_cases_recuperado_check"],  // sem recovered_at e recovered_cents
    ["recovery_cases", caso({ status: "controle" }), "23514", "recovery_cases_controle_check"],      // control false
    ["recovery_scripts", script({ variants: [] }), "23514", "recovery_scripts_variants_check"],
    ["recovery_scripts", script({ variants: ["a", "b", "c", "d"] }), "23514", "recovery_scripts_variants_check"],
    ["recovery_scripts", script({ fixed_variant: 3 }), "23514", "recovery_scripts_fixed_check"],     // a base tem 2 versões
    ["recovery_scripts", script({ use: "chat", kind: "geral" }), "23514", "recovery_scripts_chat_check"],
    ["recovery_scripts", script({ kind: "geral" }), "23514", "recovery_scripts_automatico_check"],
    ["recovery_scripts", script({ key: "Pix.P1" }), "23514", "recovery_scripts_key_check"],
    ["recovery_scripts", script({ kind: "boleto" }), "23514", "recovery_scripts_kind_check"],
    ["recovery_scripts", script({ use: "manual" }), "23514", "recovery_scripts_use_check"],
    ["recovery_scripts", script({ title: "   " }), "23514", "recovery_scripts_title_check"],
    ["recovery_testimonials", depoimento({ authorized_by: null }), "23502", "authorized_by"],
    ["recovery_testimonials", depoimento({ storage_path: `${vizinha}/f.jpg` }), "23514", "recovery_testimonials_path_check"],
    ["recovery_testimonials", depoimento({ storage_path: `${loja}/../${vizinha}/f.jpg` }), "23514", "recovery_testimonials_path_check"],
    ["recovery_testimonials", depoimento({ storage_path: `${loja}/f.gif` }), "23514", "recovery_testimonials_path_check"],
    ["recovery_testimonials", depoimento({ caption: "x".repeat(301) }), "23514", "recovery_testimonials_caption_check"],
    ["recovery_testimonials", depoimento({ label: "  " }), "23514", "recovery_testimonials_label_check"],
    ["recovery_testimonials", depoimento({ sends: -1 }), "23514", "recovery_testimonials_contadores_check"],
  ];
  for (const [tabela, linha, code, trecho] of recusas) recusado((await inserir(tabela, linha)).error, code, trecho);
  const ajustes: Array<[Linha, string]> = [ // a linha da loja já existe: update
    [{ pix_espera_p1_min: 4 }, "recovery_settings_pix_p1_check"],
    [{ pix_lembrete_antes_min: 15 }, "recovery_settings_pix_lembrete_check"],
    [{ carrinho_espera_c1: "amanha" }, "recovery_settings_carrinho_c1_check"],
    [{ carrinho_c2_dias: 3 }, "recovery_settings_carrinho_c2_check"],
    [{ cupom: "" }, "recovery_settings_textos_check"],
    [{ pedido_minimo_cents: 0 }, "recovery_settings_pedido_minimo_check"],
    [{ numeros_ignorados: ["(85) 99999-0000"] }, "recovery_settings_numeros_check"],
  ];
  for (const [campos, constraint] of ajustes) {
    recusado((await db().from("recovery_settings").update(campos).eq("tenant_id", loja)).error, "23514", constraint);
  }
});

test("padrões e vocabulário: os ajustes nascem no padrão da ativação; os 10 status e os scripts válidos passam", async () => {
  const { data } = await db().from("recovery_settings").select("*").eq("tenant_id", loja).single();
  const esperado = { automatico: false, pix_ligado: true, carrinho_ligado: false, controle: true, responder_com_link: true,
    pix_espera_p1_min: 3, pix_lembrete_antes_min: 10, carrinho_espera_c1: "dia_seguinte_10h", carrinho_c2_dias: 1,
    carrinho_c3_ligado: false, numeros_ignorados: [] };
  assert.deepEqual(Object.fromEntries(Object.keys(esperado).map((k) => [k, (data as Linha)[k]])), esperado);
  for (const status of STATUS_DA_SPEC) {
    const agora = new Date().toISOString();
    const { error } = await inserir("recovery_cases", caso({ status, next_step_at: agora, recovered_at: agora, recovered_cents: 15_000, control: status === "controle" }));
    assert.equal(error, null, status);
  }
  assert.equal((await inserir("recovery_cases", caso({ link: "https://seguro.loja.test/c/abc?utm=x", jid: "5511900000001@s.whatsapp.net" }))).error, null);
  assert.equal((await inserir("recovery_scripts", script({ key: "chat.frete", use: "chat", kind: "geral", variants: ["a"] }))).error, null);
  assert.equal((await inserir("recovery_scripts", script({ variants: ["a", "b", "c"], fixed_variant: 3 }))).error, null);
});

test("limpeza: apaga fechado e `respondeu` parados há mais de 180 dias e guarda o resto; a mensagem do caso apagado fica sem caso e sem perder a versão", async () => {
  const velho = (dias: number) => new Date(Date.now() - dias * DIA).toISOString();
  const cenario: Array<[string, number]> = [ // [status, dias sem mudar]; os três primeiros somem, os quatro últimos ficam
    ["perdido", 181], ["recuperado", 400], ["respondeu", 181], ["parado", 179], ["respondeu", 10], ["agendado", 181], ["em_sequencia", 181],
  ];
  const ids: string[] = [];
  for (const [i, [status, dias]] of cenario.entries()) {
    const { data, error } = await inserir("recovery_cases", caso({ yampi_id: `lp-${i}`, status, updated_at: velho(dias),
      next_step_at: velho(dias), recovered_at: velho(dias), recovered_cents: 15_000 }));
    assert.equal(error, null, `${status} ${dias}d`);
    ids.push(String(data?.id));
  }
  const usado = (await inserir("recovery_scripts", script({ key: "pix.limpeza" }))).data;
  const mensagem = await mensagemDoCaso(ids[0], String(usado?.id)); // ligada ao `perdido` de 181 dias, variant 2
  const mudarMensagem = (campos: Linha) => db().from("private_messages").update(campos).eq("id", mensagem);
  recusado((await mudarMensagem({ variant: 4 })).error, "23514", "private_messages_variant_check");
  recusado((await mudarMensagem({ step_key: "P1" })).error, "23514", "private_messages_step_key_check");

  const { data: n, error } = await db().rpc("limpar_dados_vencidos_recuperar");
  assert.equal(error, null);
  assert.ok(Number(n) >= 3, `devolveu ${n}`); // outras lojas de dev podem ter vencidos
  const { data: restam } = await db().from("recovery_cases").select("yampi_id").eq("tenant_id", loja).like("yampi_id", "lp-%");
  assert.deepEqual((restam ?? []).map((r) => r.yampi_id).sort(), ["lp-3", "lp-4", "lp-5", "lp-6"]);
  const lida = async () => (await db().from("private_messages").select("case_id, script_id, variant").eq("id", mensagem).single()).data;
  assert.deepEqual(await lida(), { case_id: null, script_id: usado?.id, variant: 2 });
  assert.equal((await db().from("recovery_scripts").delete().eq("id", String(usado?.id))).error, null); // script usado: set null, não falha
  assert.deepEqual(await lida(), { case_id: null, script_id: null, variant: 2 });
});

test("bucket recuperar-depoimentos: privado, 512 KiB, só jpeg/png/webp; a dona não lista, não baixa e não assina", async () => {
  const { data: bucket, error } = await db().storage.getBucket(BUCKET);
  assert.equal(error, null);
  assert.equal(bucket?.public, false);
  assert.equal(bucket?.file_size_limit, 524_288);
  assert.deepEqual([...(bucket?.allowed_mime_types ?? [])].sort(), ["image/jpeg", "image/png", "image/webp"]);
  const caminho = `${loja}/bucket-${RUN}.png`;
  objetos.push(caminho);
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  assert.equal((await db().storage.from(BUCKET).upload(caminho, bytes, { contentType: "image/png" })).error, null);
  assert.ok((await db().storage.from(BUCKET).upload(`${loja}/x-${RUN}.gif`, bytes, { contentType: "image/gif" })).error, "gif passou");
  assert.equal((await db().storage.from(BUCKET).createSignedUrl(caminho, 60)).error, null, "o service-role assina");
  const comoDona = getSupabaseAnonForToken(dona.token).storage.from(BUCKET);
  assert.ok((await comoDona.download(caminho)).error, "a dona baixou");
  assert.ok((await comoDona.createSignedUrl(caminho, 60)).error, "a dona assinou");
  assert.deepEqual((await comoDona.list(loja)).data ?? [], [], "a dona listou");
});
```

- [ ] **Step 7: tipos e lint**

```bash
WT=$(git rev-parse --show-toplevel); cd "$WT" && npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.json && cd "$WT/apps/web" && npx eslint src/lib/recuperar/banco.integration.test.ts
```

Esperado: sem saída e exit 0.

- [ ] **Step 8: RED do teste.** Descubra se há credencial de dev nesta máquina (imprime só o ref do projeto, nunca a chave):

```bash
for f in /c/Users/Igor/Desktop/HubFlow-platform/apps/web/.env.local /c/Users/Igor/Desktop/HubFlow-platform/.env.local; do [ -f "$f" ] && echo "$f -> $(grep -oE '^SUPABASE_URL=https://[a-z]+' "$f")"; done
```

Se algum arquivo mostrar `https://wfjuwogxaupyadwhvoxy`, guarde o caminho como `ENVFILE` e rode (a anon key pode estar só como `NEXT_PUBLIC_SUPABASE_ANON_KEY`; `E2E_TENANT_ID` aqui é só a chave de ligar):

```bash
ENVFILE=<arquivo de cima>; WT=$(git rev-parse --show-toplevel); cd "$WT/apps/web" && set -a && source <(grep -E '^(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ANON_KEY|NEXT_PUBLIC_SUPABASE_ANON_KEY)=' "$ENVFILE" | sed 's/\r$//') && SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$NEXT_PUBLIC_SUPABASE_ANON_KEY}" && set +a && E2E_TENANT_ID=ligado npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/recuperar/banco.integration.test.ts
```

Esperado: FAIL no `before` por tabela ausente (`PGRST205` / `Could not find the table 'public.recovery_settings'`); as lojas e usuários criados até ali são apagados pelo `after()`. Sem credencial de dev, rode o mesmo comando sem as variáveis e confirme `skipped 8` e exit 0 (é o que o `verify` do CI faz); o GREEN fica para o job `e2e` (Task 3).

- [ ] **Step 9: commit**

```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" add infra/tests/recuperar-banco-check.sql apps/web/src/lib/recuperar/banco.integration.test.ts && git -C "$WT" diff --cached --stat && git -C "$WT" commit -F - <<'EOF'
test(db): recuperar tables check and integration test (PR 1b)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

Esperado no `--stat`: só esses dois arquivos (índice sujo de outra sessão aparece aqui).

---

### Task 2: a migração

**Files:**
- Create: `apps/web/supabase/migrations/20261029140000_recuperar_banco.sql`
- Modify: `deploy/supabase/apply-order.txt` (fim do arquivo)

**Interfaces:**
- Consumes: os nomes de **Task 1 → Produces** (idênticos) e, do PR 1a, `public.private_conversations(id)` e `public.private_messages(id)`.
- Produces: o schema que as Tasks 1 e 3 provam; contrato para os PRs 5, 7, 8, 9, 10 e 11 em "Interface com os outros PRs".

- [ ] **Step 1: escrever a migração** — `apps/web/supabase/migrations/20261029140000_recuperar_banco.sql`:

```sql
-- 2026-10-29 — Recuperar (Yampi), PR 1b: banco do Recuperar (spec 2026-10-29-recuperar-yampi-design §2).
--
-- Quatro tabelas por loja (ajustes, casos, scripts, depoimentos), as colunas do Recuperar na private_messages
-- (PR 1a), a limpeza dos casos vencidos e o bucket privado dos depoimentos. Escrita só do servidor
-- (service_role); authenticated só lê, por app.user_tenant_ids() (exclui a vendedora). Sem seeds: os scripts
-- padrão nascem na ativação (PR 7). Depende da migração do PR 1a: sem ela o arquivo para no topo.
--
-- Idempotente. Muda a baseline (4 t| novas, t|private_messages, f|limpar_dados_vencidos_recuperar()). O gate
-- de drift não vê RLS, policy, ACL, trigger, CHECK, bucket nem função de app: conferir com
-- infra/tests/recuperar-banco-check.sql nos dois bancos.
-- Reversão (PR abandonado depois do migrate-dev): drop das quatro tabelas, das quatro colunas novas da
-- private_messages e das duas funções, e delete do bucket.

set lock_timeout = '5s';

do $$
begin
  if to_regclass('public.private_conversations') is null or to_regclass('public.private_messages') is null then
    raise exception 'recuperar_banco: aplique antes a migração do PR 1a (private_conversations, private_messages)';
  end if;
end;
$$;

-- 1) Ajustes da loja: uma linha por loja, criada na ativação (PR 7). O horário não está aqui: é do
--    private_number_state, comum com o Rastreio.
create table if not exists public.recovery_settings (
  tenant_id                  uuid primary key references public.organizations(id) on delete cascade,
  automatico                 boolean not null default false,
  pix_ligado                 boolean not null default true,
  carrinho_ligado            boolean not null default false,
  pix_espera_p1_min          smallint not null default 3,
  pix_lembrete_antes_min     smallint not null default 10,        -- 0 = não lembrar
  carrinho_espera_c1         text not null default 'dia_seguinte_10h',
  carrinho_c2_dias           smallint not null default 1,         -- 0 = não mandar
  carrinho_c3_ligado         boolean not null default false,
  responder_com_link         boolean not null default true,
  cupom                      text,
  controle                   boolean not null default true,
  assinatura                 text,
  nome_loja                  text,
  pedido_minimo_cents        integer,
  prazo_troca                text,
  numeros_ignorados          text[] not null default '{}',
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint recovery_settings_pix_p1_check check (pix_espera_p1_min in (3, 5, 10)),
  constraint recovery_settings_pix_lembrete_check check (pix_lembrete_antes_min in (0, 10, 30)),
  constraint recovery_settings_carrinho_c1_check check (carrinho_espera_c1 in ('3h', 'dia_seguinte_10h', 'dois_dias_10h')),
  constraint recovery_settings_carrinho_c2_check check (carrinho_c2_dias in (0, 1, 2)),
  constraint recovery_settings_textos_check check (
        (cupom is null or char_length(btrim(cupom)) between 1 and 40)
    and (assinatura is null or char_length(btrim(assinatura)) between 1 and 40)
    and (nome_loja is null or char_length(btrim(nome_loja)) between 1 and 60)
    and (prazo_troca is null or char_length(btrim(prazo_troca)) between 1 and 60)
  ),
  constraint recovery_settings_pedido_minimo_check check (pedido_minimo_cents is null or pedido_minimo_cents > 0),
  -- Só dígitos (DDI e DDD incluídos), como o telefone do caso: formatação ("(85) 9…") é recusada.
  constraint recovery_settings_numeros_check check (
        cardinality(numeros_ignorados) <= 50
    and array_position(numeros_ignorados, null) is null
    and array_to_string(numeros_ignorados, ',') ~ '^([1-9][0-9]{9,14}(,[1-9][0-9]{9,14})*)?$'
  )
);

comment on table public.recovery_settings is
  'Ajustes do Recuperar por loja (uma linha, criada na ativação). 0 em pix_lembrete_antes_min / carrinho_c2_dias = não mandar. Escrita só pelo servidor.';

-- 2) Casos: um por (loja, tipo, id na Yampi).
create table if not exists public.recovery_cases (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.organizations(id) on delete cascade,
  kind             text not null,
  yampi_id         text not null,
  cart_token       text,
  order_number     text,
  customer_name    text,
  phone            text not null,
  phone_key        text generated always as (public.phone_key(phone)) stored,
  jid              text,
  total_cents      integer not null,
  items            jsonb not null default '[]'::jsonb,
  link             text,
  pix_code         text,
  pix_expires_at   timestamptz,
  status           text not null default 'agendado',
  stop_reason      text,
  control          boolean not null default false,
  step             text,
  next_step_at     timestamptz,
  first_sent_at    timestamptz,
  conversation_id  uuid references public.private_conversations(id) on delete set null,
  recovered_at     timestamptz,
  recovered_cents  integer,
  recovered_manual boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint recovery_cases_tenant_kind_yampi_key unique (tenant_id, kind, yampi_id),
  constraint recovery_cases_kind_check check (kind in ('pix', 'carrinho')),
  constraint recovery_cases_status_check check (status in (
    'agendado', 'em_sequencia', 'respondeu', 'recuperado', 'virou_pedido',
    'parado', 'perdido', 'sem_whatsapp', 'nao_quer', 'controle')),
  constraint recovery_cases_tamanhos_check check (
        char_length(yampi_id) between 1 and 64
    and (cart_token is null or char_length(cart_token) between 1 and 128)
    and (order_number is null or char_length(order_number) between 1 and 40)
    and (customer_name is null or char_length(customer_name) <= 120)
    and (pix_code is null or char_length(pix_code) <= 2048)
  ),
  -- Sem zero à esquerda: public.phone_key o descartaria e o caso ficaria sem chave.
  constraint recovery_cases_phone_check check (phone ~ '^[1-9][0-9]{9,14}$'),
  -- Só o JID resolvido (<dígitos>@s.whatsapp.net): nunca @lid nem @g.us.
  constraint recovery_cases_jid_check check (jid is null or jid ~ '^[1-9][0-9]{9,14}@s\.whatsapp\.net$'),
  constraint recovery_cases_total_check check (total_cents > 0),
  constraint recovery_cases_items_check check (
    case when jsonb_typeof(items) = 'array' then jsonb_array_length(items) <= 30 else false end
  ),
  -- Nunca o simulate_url (entra logado na conta da cliente, leva customerToken).
  constraint recovery_cases_link_check check (
    link is null or (char_length(link) <= 2048 and link ~ '^https://' and link !~* 'customer_?token')
  ),
  constraint recovery_cases_step_check check (step is null or step ~ '^[a-z0-9_]{1,30}$'),
  constraint recovery_cases_stop_reason_check check (stop_reason is null or stop_reason ~ '^[a-z0-9_]{1,40}$'),
  constraint recovery_cases_recovered_cents_check check (recovered_cents is null or recovered_cents > 0),
  constraint recovery_cases_recuperado_check check (status <> 'recuperado' or (recovered_at is not null and recovered_cents is not null)),
  constraint recovery_cases_agendado_check check (status <> 'agendado' or next_step_at is not null),
  constraint recovery_cases_controle_check check (status <> 'controle' or control)
);

-- agendador (todas as lojas): o que venceu e ainda espera passo.
create index if not exists recovery_cases_agendador_idx
  on public.recovery_cases (next_step_at) where status in ('agendado', 'em_sequencia');
-- "recebeu sequência nos últimos 7 dias" e carrinho novo do mesmo telefone (§1.1), pela chave tolerante.
create index if not exists recovery_cases_telefone_idx
  on public.recovery_cases (tenant_id, phone_key, created_at desc);
-- "o carrinho virou pedido?" (order.created com o cart_token).
create index if not exists recovery_cases_cart_token_idx
  on public.recovery_cases (tenant_id, cart_token) where cart_token is not null;
-- Hoje: a fila e os números do mês.
create index if not exists recovery_cases_lista_idx
  on public.recovery_cases (tenant_id, created_at desc);
-- A conversa do lado do caso, e a ação da FK quando a conversa é apagada.
create index if not exists recovery_cases_conversa_idx
  on public.recovery_cases (conversation_id) where conversation_id is not null;

comment on table public.recovery_cases is
  'Caso do Recuperar: Pix pendente ou carrinho abandonado da Yampi, um por (loja, tipo, id na Yampi). Fechado = fora de agendado/em_sequencia (retenção em app.limpar_dados_vencidos_recuperar).';
comment on column public.recovery_cases.pix_code is 'Código Pix copia-e-cola. Nunca em log.';
comment on column public.recovery_cases.phone is 'Só dígitos (55 + DDD + número). Nunca em log.';

-- 3) Scripts. key = '<pix|carrinho|chat>.<passo>'; variants = 1 a 3 textos (o A/B). Os contadores por versão
--    saem de private_messages.script_id + variant.
create table if not exists public.recovery_scripts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.organizations(id) on delete cascade,
  key           text not null,
  kind          text not null,
  use           text not null,
  title         text not null,
  variants      text[] not null,
  fixed_variant smallint,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint recovery_scripts_tenant_key_key unique (tenant_id, key),
  constraint recovery_scripts_key_check check (key ~ '^[a-z0-9_]+\.[a-z0-9_]+$' and char_length(key) <= 60),
  constraint recovery_scripts_kind_check check (kind in ('pix', 'carrinho', 'geral')),
  constraint recovery_scripts_use_check check (use in ('automatico', 'chat')),
  constraint recovery_scripts_title_check check (char_length(btrim(title)) between 1 and 80),
  constraint recovery_scripts_variants_check check (cardinality(variants) between 1 and 3 and array_position(variants, null) is null),
  constraint recovery_scripts_fixed_check check (fixed_variant is null or fixed_variant between 1 and cardinality(variants)),
  constraint recovery_scripts_chat_check check (use = 'automatico' or cardinality(variants) = 1),
  constraint recovery_scripts_automatico_check check (use = 'chat' or kind <> 'geral')
);

comment on table public.recovery_scripts is
  'Scripts do Recuperar (automático e chat) por loja. variants = 1 a 3 textos; chat tem 1. kind geral só em script de chat.';

-- 4) Depoimentos. A foto vive no bucket privado recuperar-depoimentos, em <tenant_id>/<arquivo>.
create table if not exists public.recovery_testimonials (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.organizations(id) on delete cascade,
  storage_path  text not null,
  caption       text not null default '',
  label         text,
  authorized_by uuid not null,                       -- sem FK: a prova de autorização sobrevive ao usuário
  authorized_at timestamptz not null default now(),
  active        boolean not null default true,
  sends         integer not null default 0,
  conversions   integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint recovery_testimonials_storage_path_key unique (storage_path),
  constraint recovery_testimonials_path_check check (
        char_length(storage_path) <= 200
    and starts_with(storage_path, tenant_id::text || '/')
    and storage_path !~ '\.\.'
    and storage_path ~* '\.(jpg|jpeg|png|webp)$'
  ),
  constraint recovery_testimonials_caption_check check (char_length(caption) <= 300),
  constraint recovery_testimonials_label_check check (label is null or char_length(btrim(label)) between 1 and 80),
  constraint recovery_testimonials_contadores_check check (sends >= 0 and conversions >= 0)
);

-- A C2 sorteia entre os ativos da loja; o índice também cobre a FK de tenant_id.
create index if not exists recovery_testimonials_ativos_idx on public.recovery_testimonials (tenant_id, active);

comment on table public.recovery_testimonials is
  'Depoimentos da C2: foto no bucket privado recuperar-depoimentos + legenda. Só existe com a autorização da cliente. O limite de 10 ativos é da rota.';

-- 5) Colunas do Recuperar na private_messages (PR 1a). FKs on delete set null: apagar caso ou script não
--    derruba o histórico; sem CHECK ligando script_id a variant (a ação da FK deixaria variant sozinho).
alter table public.private_messages
  add column if not exists case_id uuid references public.recovery_cases(id) on delete set null,
  add column if not exists step_key text,
  add column if not exists script_id uuid references public.recovery_scripts(id) on delete set null,
  add column if not exists variant smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.private_messages'::regclass and conname = 'private_messages_step_key_check') then
    alter table public.private_messages
      add constraint private_messages_step_key_check check (step_key is null or step_key ~ '^[a-z0-9_]{1,30}$');
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.private_messages'::regclass and conname = 'private_messages_variant_check') then
    alter table public.private_messages
      add constraint private_messages_variant_check check (variant is null or variant between 1 and 3);
  end if;
end;
$$;

-- FK com set null precisa de índice, ou cada caso apagado varre a tabela de mensagens.
create index if not exists private_messages_case_idx on public.private_messages (case_id) where case_id is not null;
create index if not exists private_messages_script_idx on public.private_messages (script_id) where script_id is not null;

-- 6) updated_at (app.set_updated_at, o mesmo das outras tabelas): é o relógio da retenção dos casos.
drop trigger if exists set_updated_at_recovery_settings on public.recovery_settings;
create trigger set_updated_at_recovery_settings before update on public.recovery_settings
  for each row execute function app.set_updated_at();
drop trigger if exists set_updated_at_recovery_cases on public.recovery_cases;
create trigger set_updated_at_recovery_cases before update on public.recovery_cases
  for each row execute function app.set_updated_at();
drop trigger if exists set_updated_at_recovery_scripts on public.recovery_scripts;
create trigger set_updated_at_recovery_scripts before update on public.recovery_scripts
  for each row execute function app.set_updated_at();
drop trigger if exists set_updated_at_recovery_testimonials on public.recovery_testimonials;
create trigger set_updated_at_recovery_testimonials before update on public.recovery_testimonials
  for each row execute function app.set_updated_at();

-- 7) RLS e privilégios. authenticated só lê, dos tenants em que é membro aceito e não vendedora
--    (app.user_tenant_ids). Escrita só do servidor. Não "destravar" com using (true).
alter table public.recovery_settings enable row level security;
alter table public.recovery_cases enable row level security;
alter table public.recovery_scripts enable row level security;
alter table public.recovery_testimonials enable row level security;

drop policy if exists recovery_settings_select_member on public.recovery_settings;
create policy recovery_settings_select_member on public.recovery_settings
  for select to authenticated using (tenant_id = any (app.user_tenant_ids()));
drop policy if exists recovery_cases_select_member on public.recovery_cases;
create policy recovery_cases_select_member on public.recovery_cases
  for select to authenticated using (tenant_id = any (app.user_tenant_ids()));
drop policy if exists recovery_scripts_select_member on public.recovery_scripts;
create policy recovery_scripts_select_member on public.recovery_scripts
  for select to authenticated using (tenant_id = any (app.user_tenant_ids()));
drop policy if exists recovery_testimonials_select_member on public.recovery_testimonials;
create policy recovery_testimonials_select_member on public.recovery_testimonials
  for select to authenticated using (tenant_id = any (app.user_tenant_ids()));

revoke all on public.recovery_settings, public.recovery_cases, public.recovery_scripts, public.recovery_testimonials
  from anon, authenticated;
grant select on public.recovery_settings, public.recovery_cases, public.recovery_scripts, public.recovery_testimonials
  to authenticated;
grant select, insert, update, delete
  on public.recovery_settings, public.recovery_cases, public.recovery_scripts, public.recovery_testimonials
  to service_role;

-- 8) Limpeza dos casos vencidos (spec §2, "casos 180 dias depois de fechados"). Fechado = tudo fora de
--    agendado/em_sequencia (esperam o próximo passo automático); inclui `respondeu`, que não tem saída
--    própria. O relógio é updated_at: caso fechado não muda mais. As mensagens ficam (case_id vira null) e
--    saem pela retenção da conversa (PR 1a). Chamada diária pelo /api/cron/recuperar (PR 7).
create or replace function app.limpar_dados_vencidos_recuperar()
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_n integer;
begin
  delete from public.recovery_cases c
   where c.status not in ('agendado', 'em_sequencia')
     and c.updated_at < now() - interval '180 days';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- O PostgREST só enxerga public: o cron chama este wrapper (mesmo desenho de prune_instance_sends).
create or replace function public.limpar_dados_vencidos_recuperar()
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  select app.limpar_dados_vencidos_recuperar();
$$;

comment on function app.limpar_dados_vencidos_recuperar() is
  'Apaga casos do Recuperar fora de agendado/em_sequencia sem mudar há 180 dias. Devolve quantos.';
comment on function public.limpar_dados_vencidos_recuperar() is
  'Wrapper para o PostgREST de app.limpar_dados_vencidos_recuperar(). Só service_role.';

-- Função nova nasce executável por PUBLIC e (em public) por authenticated: revogar depois do último
-- create or replace e conceder só ao service_role.
revoke all on function app.limpar_dados_vencidos_recuperar() from public, anon, authenticated;
grant execute on function app.limpar_dados_vencidos_recuperar() to service_role;
revoke all on function public.limpar_dados_vencidos_recuperar() from public, anon, authenticated;
grant execute on function public.limpar_dados_vencidos_recuperar() to service_role;

-- 9) Bucket privado dos depoimentos. SEM policy em storage.objects: só o service-role (URL assinada) alcança.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recuperar-depoimentos', 'recuperar-depoimentos', false, 524288, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- O PostgREST passa a enxergar as tabelas e o wrapper sem esperar o recarregamento automático.
notify pgrst, 'reload schema';
```

- [ ] **Step 2: `apply-order.txt`** — acrescentar ao **fim** de `deploy/supabase/apply-order.txt`, exatamente (ASCII, como as outras entradas):

```
# 2026-10-29 - Recuperar (Yampi), PR 1b (spec 2026-10-29-recuperar-yampi-design secao 2): recovery_settings,
# recovery_cases (phone_key gerada com public.phone_key), recovery_scripts, recovery_testimonials, as colunas
# case_id / step_key / script_id / variant na private_messages, app.limpar_dados_vencidos_recuperar() e o
# wrapper public.limpar_dados_vencidos_recuperar() (execute so service_role) e o bucket privado
# recuperar-depoimentos. RLS ligado: authenticated so le (policy app.user_tenant_ids); escrita so servidor.
# Depende da migracao do PR 1a. Muda a baseline (4 t| novas, t|private_messages, 1 f|). O gate nao ve RLS,
# policy, ACL, trigger, CHECK, bucket nem funcao de app: conferir com infra/tests/recuperar-banco-check.sql
# nos dois bancos.
apps/web/supabase/migrations/20261029140000_recuperar_banco.sql
```

- [ ] **Step 3: conferências locais, sem banco**

Idempotência (todo `create`/`drop` com `if not exists`/`or replace`, exceto policy e trigger, que vêm logo depois do `drop … if exists`) e ordem do ACL (todo `revoke`/`grant` de função depois do último `create or replace`):

```bash
WT=$(git rev-parse --show-toplevel); M="$WT/apps/web/supabase/migrations/20261029140000_recuperar_banco.sql"; grep -nE "^\s*(create|drop)\s" "$M" | grep -vE "if not exists|or replace"; echo "---"; grep -nE "^(create or replace function|revoke all on function|grant execute)" "$M"
```

Esperado: antes do `---`, **16 linhas** em pares consecutivos — `drop policy if exists`/`create policy` ×4 e `drop trigger if exists`/`create trigger` ×4; depois do `---`, os dois `create or replace function` com número de linha **menor** que os quatro `revoke all on function`/`grant execute`.

A ordem real aponta para arquivos que existem, e a função `security definer` nova tem `revoke … authenticated` na última migração que a toca (os dois testes rodam sem `node_modules`, no Node 24):

```bash
WT=$(git rev-parse --show-toplevel); cd "$WT" && node --test infra/scripts/apply-migrations.test.ts 2>&1 | tail -8; cd "$WT/apps/web" && node --test src/lib/supabase/privilegio-definer.test.ts 2>&1 | tail -8
```

Esperado: `fail 0` nos dois.

- [ ] **Step 4: revisão antes do push.** Depois do `migrate-dev` o arquivo aplicado não se edita (correção vira migração de ajuste), então revise **agora**. Despache, **na mesma mensagem**, o `ecc:database-reviewer` e o Security Engineer sobre `git -C "$WT" diff origin/main...HEAD`, pedindo atenção a: policy e privilégios (só `authenticated` SELECT; vendedora fora), ACL e `search_path` das duas funções, CHECKs (link, JID, caminho do depoimento, `numeros_ignorados`), FKs `set null` com índice, bucket sem policy, idempotência e ordem. Para cada linha crítica, o revisor confirma que **tirá-la derruba um teste**:

| Se sair… | Cai… |
|---|---|
| `link !~* 'customer_?token'` | teste "CHECKs" e bloco 2 do check |
| `grant select … to authenticated`, ou `using (…)` virar `using (true)` | teste "RLS" (controle da dona, vendedoras, vizinha) |
| `revoke all on function … from … authenticated` | teste "authenticated só lê" (rpc) e `privilegio-definer.test.ts` |
| `status not in ('agendado','em_sequencia')` | teste "limpeza" e bloco 3 do check |
| `starts_with(storage_path, tenant_id::text || '/')` | teste "CHECKs" e bloco 2 do check |

Corrija CRITICAL/HIGH no arquivo (ainda não aplicado) e repita o Step 3.

- [ ] **Step 5: commit**

```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" add apps/web/supabase/migrations/20261029140000_recuperar_banco.sql deploy/supabase/apply-order.txt && git -C "$WT" diff --cached --stat && git -C "$WT" commit -F - <<'EOF'
feat(db): recuperar tables, retention and testimonial bucket (PR 1b)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: PR, `migrate-dev`, GREEN em dev e baseline

**Files:**
- Modify: `deploy/supabase/schema-baseline.json`
- Cria (fora do repo): `C:\Users\Igor\AppData\Local\Temp\recuperar-1b-pr.md`

**Interfaces:**
- Consumes: os dois commits das Tasks 1 e 2.
- Produces: PR `<N>` aberto, migração aplicada e registrada em dev (`ops.applied_migrations`), check e teste de integração verdes, `drift` verde com a baseline deste PR.

- [ ] **Step 1: gate local antes do push** (pede `npm ci` no worktree; se o disco não deixar — memória `finding-disco-cheio-c` —, o job `verify` do CI roda o mesmo script):

```powershell
Set-Location "<WT>"; & .\infra\scripts\verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
```

Esperado: `EXIT=0`. Depois o segundo `tsc` (o do worker não muda neste PR; roda por regra):

```bash
WT=$(git rev-parse --show-toplevel); cd "$WT" && npm --workspace apps/worker exec tsc -- --noEmit
```

Esperado: sem saída.

- [ ] **Step 2: corpo do PR, push e PR.** Ferramenta Write em `C:\Users\Igor\AppData\Local\Temp\recuperar-1b-pr.md` com três seções — **O que muda** (a migração, o que o banco recusa, RLS só de leitura, a baseline com 4 `t|` novas, `t|private_messages` mudada e 1 `f|`), **Como foi verificado** (`migrate-dev`, check em dev sem erro com a assinatura igual à baseline, `e2e` com os 8 testes, `drift` verde) e **Depois do merge** (`migrate-prod` aplica e confere a baseline; o check roda em prod, pelo Igor) — e a linha `🤖 Generated with [Claude Code](https://claude.com/claude-code)` no fim. Push e PR (o `migrate-dev` só roda em `pull_request` ou em push na `main`; se o classificador negar o push ou o `gh pr create`, entregue os dois comandos ao Igor e siga quando o PR existir):

```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" push -u origin feat/recuperar-banco-recuperar && gh pr create --repo codingB0y/Girumo --base main --head feat/recuperar-banco-recuperar --title "feat(db): recuperar tables, retention and testimonial bucket (PR 1b)" --body-file "C:/Users/Igor/AppData/Local/Temp/recuperar-1b-pr.md"
```

Anote o número `<N>`. A partir daqui o `drift` de **todo outro PR aberto** fica vermelho com os objetos novos (dev já os tem, a baseline deles não) até este PR entrar na `main` — não é defeito deles; feche este PR sem pausa.

- [ ] **Step 3: esperar o CI e ler o `migrate-dev`**

```bash
gh pr checks <N> --repo codingB0y/Girumo --watch; RUN=$(gh run list --repo codingB0y/Girumo --branch feat/recuperar-banco-recuperar --workflow verify.yml --limit 1 --json databaseId -q '.[0].databaseId'); gh run view "$RUN" --repo codingB0y/Girumo --log | grep -E "Aplicando|Falhou em|Nenhuma migracao|Sem drift|DRIFT|  x "
```

Esperado: `Aplicando apps/web/supabase/migrations/20261029140000_recuperar_banco.sql`. Nesta primeira rodada o `drift` fica vermelho (falta a baseline, Step 6) e o `e2e` pode falhar por tabela ausente: ele não espera o `migrate-dev`.
- `Falhou em …recuperar_banco.sql: <mensagem>` = erro de SQL. O arquivo roda numa transação só: **nada** ficou aplicado nem registrado. Corrija o próprio arquivo, refaça o Step 3 da Task 2, commit, push. Se a mensagem for permissão em `storage.buckets`, mova a seção 9 para `20261029140100_recuperar_bucket.sql` (com a sua linha na `apply-order`) e deixe o resto como está. Se citar `private_conversations`/`private_messages` ausentes, o PR 1a não está em dev: **pare**.
- `drift` vermelho só com `recovery_…`, `private_messages` e `limpar_dados_vencidos_recuperar` = falta a baseline (Step 6). Vermelho com **outros** objetos = migração de outro PR aberto aplicada em dev: espere aquele PR mergear e siga o Step 7; não use `drift-allowlist.json`.
- `e2e` vermelho por tabela ausente: depois que o `migrate-dev` passar, `gh run rerun "$RUN" --repo codingB0y/Girumo --failed`.

- [ ] **Step 4: GREEN do check em dev** (mesmo comando do RED, Task 1 Step 5):

```bash
WT=$(git rev-parse --show-toplevel); cd "$WT/apps/web" && supabase link --project-ref wfjuwogxaupyadwhvoxy --yes && supabase db query --linked -o json -f ../../infra/tests/recuperar-banco-check.sql
```

Esperado: exit 0 e `rows[0].r` com **seis** chaves — `f|limpar_dados_vencidos_recuperar()`, `t|private_messages`, `t|recovery_cases`, `t|recovery_scripts`, `t|recovery_settings`, `t|recovery_testimonials`. Com a ferramenta Write, salve o objeto `r` (JSON puro) em `C:\Users\Igor\AppData\Local\Temp\recuperar-1b-r.json`. Se o classificador negar, mande ao Igor o comando em PowerShell (`Set-Location "<WT>\apps\web"; supabase link --project-ref wfjuwogxaupyadwhvoxy --yes; if ($LASTEXITCODE -eq 0) { supabase db query --linked -o json -f ..\..\infra\tests\recuperar-banco-check.sql }`) e espere a saída.

**`FALHOU: …` aqui = defeito com a migração JÁ aplicada e registrada em dev.** Não edite o arquivo aplicado: o registro impede a reaplicação, e prod receberia um arquivo que dev nunca rodou. Escreva uma migração de ajuste no mesmo PR — `20261029140100_recuperar_banco_ajuste.sql`, idempotente (`create or replace function` + o bloco de `revoke`/`grant` de novo; mudança de tabela por `alter table … drop constraint if exists …, add constraint …`, porque `create table if not exists` não refaz tabela) —, a linha dela no fim da `apply-order`, e repita os Steps 3 e 4. Se o defeito for do **check** (expectativa errada), corrija só o check.

- [ ] **Step 5: GREEN do teste de integração.** O job `e2e` roda o teste (`src/**/*.integration.test.ts`) contra o dev já migrado: o passo "Integracao das stores contra o banco de dev" fica verde (ele mesmo falha se algum teste foi pulado) e a saída lista os 8 testes de `banco.integration.test.ts` como `ok`. Se o `e2e` falhou antes do `migrate-dev`, faça o re-run do Step 3. Com credencial de dev na máquina, o comando do RED (Task 1 Step 8) termina com `pass 8`.

- [ ] **Step 6: baseline.** Com credencial de dev na máquina (a do Step 8 da Task 1; `ENVFILE` com `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`):

```bash
ENVFILE=<arquivo>; WT=$(git rev-parse --show-toplevel); cd "$WT" && set -a && source <(grep -E '^(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=' "$ENVFILE" | sed 's/\r$//') && set +a && npm run schema:baseline && git -C "$WT" diff -U0 deploy/supabase/schema-baseline.json | grep -E '^[+-] ' | grep -vE 'recovery_|private_messages|limpar_dados_vencidos_recuperar|gerado_em'
```

Esperado: `Baseline gravada: …` e o `grep -v` final **vazio** — o diff traz só `gerado_em` e as chaves deste PR. Linha de outro objeto = migração de outro PR aberto aplicada em dev: `git checkout deploy/supabase/schema-baseline.json` e use o patch abaixo. Sem credencial de dev, aplique só as seis chaves do `r` (sem mexer em `gerado_em` nem `projeto`, como fizeram os PRs do Bling e do link da bio):

```bash
WT=$(git rev-parse --show-toplevel); cd "$WT" && node -e '
const fs = require("fs");
const f = "deploy/supabase/schema-baseline.json";
const bruto = fs.readFileSync(f, "utf8");
const eol = bruto.includes("\r\n") ? "\r\n" : "\n";
const b = JSON.parse(bruto);
Object.assign(b.objetos, JSON.parse(fs.readFileSync(process.argv[1], "utf8")));
fs.writeFileSync(f, JSON.stringify(b, null, 2).replace(/\n/g, eol) + eol);' "C:/Users/Igor/AppData/Local/Temp/recuperar-1b-r.json" && git -C "$WT" diff -U0 deploy/supabase/schema-baseline.json | grep -E '^[+-] '
```

Esperado: só as seis chaves (cinco novas e `t|private_messages` com hash novo). Commit e push:

```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" add deploy/supabase/schema-baseline.json && git -C "$WT" commit -F - <<'EOF'
chore(db): schema baseline for the recuperar tables (PR 1b)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
git -C "$WT" push
```

- [ ] **Step 7: se o PR 2a (o outro com migração nesta onda; o 5a e o 6 não têm) mergeou antes.** O segundo a mergear atualiza a branch e refaz a baseline (spec §9; a migração do 2a só troca corpo de função e não muda a baseline, mas a linha dela entra na `apply-order`):

```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" fetch origin main && git -C "$WT" merge origin/main
```

Conflito em `deploy/supabase/apply-order.txt`: manter as duas entradas, na ordem de merge. Conflito em `deploy/supabase/schema-baseline.json`: aceitar o de `main` (`git checkout --theirs deploy/supabase/schema-baseline.json`) e refazer o Step 6 inteiro — o dev já tem a migração do outro PR e a baseline de `main` já traz as chaves dele. Depois do merge, espere o `migrate-dev` do push (nada novo a aplicar) e confira que o `drift` fica verde.

- [ ] **Step 8: CI todo verde** — `gh pr checks <N> --repo codingB0y/Girumo`: `verify`, `migrate-dev`, `drift`, `advisors` e `e2e` em `pass`. O `advisors` não deve trazer lint novo citando `recovery_`, `private_messages` ou `limpar_dados_vencidos_recuperar` (as quatro tabelas têm policy; as funções têm `search_path` e ACL); se trouxer, corrija com migração de ajuste (Step 4), não com a allowlist.

---

### Task 4: merge, prod e fechamento

**Files:** nenhum arquivo do repositório (cria `C:\Users\Igor\AppData\Local\Temp\recuperar-1b-card.sql`).

**Interfaces:**
- Consumes: PR `<N>` verde (Task 3).
- Produces: migração em prod, provada pelo `--conferir-baseline` e pelo check; `blocker` do card reescrito; decisão no grafo. É o que os PRs 5, 7 e seguintes exigem do banco do Recuperar.

- [ ] **Step 1: merge** (na mesma sessão — regra de PR do CLAUDE.md; o merge é à mão e só no verde, porque a `main` não tem proteção e o auto-merge do GitHub mergearia na hora; se o classificador negar, entregue ao Igor `gh pr checks <N> --repo codingB0y/Girumo` e `gh pr merge <N> --squash --delete-branch --repo codingB0y/Girumo`):

```bash
gh pr merge <N> --squash --delete-branch --repo codingB0y/Girumo
```

- [ ] **Step 2: `migrate-prod`** — o push na `main` aplica em prod e compara prod ao vivo com a baseline:

```bash
SHA=$(gh pr view <N> --repo codingB0y/Girumo --json mergeCommit -q .mergeCommit.oid); RUN=$(gh run list --repo codingB0y/Girumo --commit "$SHA" --workflow verify.yml --limit 1 --json databaseId -q '.[0].databaseId'); gh run watch "$RUN" --repo codingB0y/Girumo --exit-status; gh run view "$RUN" --repo codingB0y/Girumo --log | grep -E "Aplicando|Falhou em|Schema de prod|diverge da baseline|  x "
```

`RUN` vazio = o run do merge ainda não nasceu: espere alguns segundos e repita. Esperado: `Aplicando apps/web/supabase/migrations/20261029140000_recuperar_banco.sql`, `Schema de prod x deploy/supabase/schema-baseline.json:` e **nenhum** `diverge da baseline`. `Falhou em` prod = pare e mostre ao Igor (dev está à frente; a saída é migração de ajuste ou de reversão, nunca DDL à mão).

- [ ] **Step 3: SQL do card.** O card continua `em_construcao`: `move_card` para o MESMO status não grava evento (o trigger só registra troca), então o avanço vai no `blocker`. Ferramenta Write em `C:\Users\Igor\AppData\Local\Temp\recuperar-1b-card.sql`, trocando `<DD/MM>` e `<N>`:

```sql
update public.board_features
   set blocker = 'PR 1b (banco do Recuperar) no ar em <DD/MM> (#<N>), check ok em dev e prod. Próximo: 2a e 5a (se ainda não entraram), depois 2b e 5b, e a Fase 0 (provas).'
 where key = 'recuperar-yampi'
returning key, status, blocker;
```

- [ ] **Step 4: PEÇA AO IGOR — prod (check + card)**, logo depois do Step 2 (PowerShell 5.1; o link volta para dev no fim):

```powershell
Set-Location "<WT>\apps\web"
supabase link --project-ref nidoatbxaylrkcgbszns --yes
$linkou = ($LASTEXITCODE -eq 0)
if ($linkou) { supabase db query --linked -o json -f ..\..\infra\tests\recuperar-banco-check.sql }
if ($linkou -and $LASTEXITCODE -eq 0) { supabase db query --linked -o json -f "$env:TEMP\recuperar-1b-card.sql" }
supabase link --project-ref wfjuwogxaupyadwhvoxy --yes
```

Confira na saída dele: o check **sem erro** e `rows[0].r` idêntico ao de dev (Task 3, Step 4); o card com 1 linha, `status` `em_construcao` e o `blocker` novo. Zero linhas no card = key diferente: peça `select key, status from public.board_features where key ilike '%recuper%';` e refaça com a key certa. `FALHOU` em prod com dev verde = os bancos divergem em algo que o gate não vê (ACL, CHECK, trigger, bucket): migração de ajuste (Task 3, Step 4), nunca DDL à mão.

- [ ] **Step 5: decisão no grafo** — `kg_insert_text` (MCP LightRAG), `source` `decisao-<AAAA-MM-DD>-recuperar-banco`, com as Decisões 2, 3, 4 e 12 deste plano em texto corrido (RLS de leitura sem escrita e sem `recuperar_enabled`; "fechado" = fora de `agendado`/`em_sequencia` com relógio `updated_at` e 180 dias; limpeza com wrapper público; o que o banco recusa), a prova (`recuperar-banco-check.sql` nos dois bancos) e o número `#<N>`. Se o MCP não responder (memória `finding-kg-query-retorna-none`), entregue ao Igor, na raiz do checkout principal, o `rag insert` equivalente: `.\tools\lightrag\.venv\Scripts\rag.exe insert "<o texto>" --source decisao-<AAAA-MM-DD>-recuperar-banco`.

- [ ] **Step 6: encerrar** — apagar o worktree só se não houver nada fora do commit (`git -C "$WT" status --porcelain` vazio) e reportar: "PRs que deixei abertos: nenhum" (ou o número e o motivo).

---

## Critérios de aceite do PR

- Cinco arquivos: migração, check, teste de integração, `apply-order.txt` (uma entrada no fim) e `schema-baseline.json` (seis chaves; `gerado_em` só muda se a baseline foi regenerada por `npm run schema:baseline`).
- `migrate-dev` aplicou no PR e `migrate-prod` no merge, sem `Falhou em`; `--conferir-baseline` sem `diverge da baseline`.
- `infra/tests/recuperar-banco-check.sql` sem erro em dev **e** em prod, com `r` idêntico nos dois.
- `verify`, `migrate-dev`, `drift`, `advisors` e `e2e` verdes; nenhum lint novo citando `recovery_`.
- PR mergeado e branch apagada na mesma sessão; `blocker` do card reescrito; decisão no grafo.

## Riscos e pontos de atenção

- **Fixtures de `private_*` dependem da 1a.** `mensagemDoCaso` usa as colunas NOT NULL e o valor de `direction` da migração do PR 1a; se a 1a mudar depois, só esse helper muda.
- **PRs 1b e 2a em paralelo** (os dois com migração; o 5a anda junto, sem migração): o primeiro a mergear entra na `apply-order` primeiro; o segundo faz o Step 7 da Task 3. O drift fica vermelho nos outros PRs do `migrate-dev` deste até o merge.
- **Defeito achado depois do `migrate-dev`:** o arquivo aplicado não se edita (o registro é por nome); a correção é migração de ajuste no mesmo PR. Com o `migrate-dev` **falhando**, aí sim edita: nada foi aplicado. PR abandonado deixa dev com as tabelas e prod sem: escrever a migração de reversão (cabeçalho da migração), não fechar e esquecer.
- **O check roda em prod:** escreve só dentro de `begin`…`rollback` (lojas falsas `0ec0…`); a chamada de `app.limpar_dados_vencidos_recuperar()` no bloco 3 apagaria casos reais vencidos, mas o rollback desfaz.
- **`set lock_timeout = '5s'`:** em prod, com `organizations` ou `private_messages` ocupadas, o `migrate-prod` pode falhar com `lock timeout` — `gh run rerun <id> --failed`; o arquivo é idempotente.
- **O CHECK do link** parte de `customerToken`/`customer_token` e `https://`; a Fase 0 confirma qual link abre o carrinho sem login. Se a credencial tiver outro nome, o PR 7 troca o CHECK em migração própria.

## Interface com os outros PRs

**Este PR exporta** (no banco; consumidores: PR 7 em diante. O PR 5 não lê estas tabelas — Decisão 6):

| Objeto | Contrato |
|---|---|
| `recovery_settings` | PK `tenant_id`; padrões da Decisão 7; `numeros_ignorados` só dígitos (compare por `public.phone_key`) |
| `recovery_cases` | único `recovery_cases_tenant_kind_yampi_key` (o processador trata `23505` como "já existe" e atualiza); `phone_key` gerada (busca tolerante a 55 e ao 9º dígito); `status` e `kind` da spec; `agendado` exige `next_step_at`, `recuperado` exige `recovered_at` e `recovered_cents`, `controle` exige `control`; o pagamento de um caso de controle (§1.8, "a mesma regra de pagou") não tem coluna própria — `recovered_at`/`recovered_cents` servem sem mudar o status e o banco não amarra isso: PR 7/11 decidem; `first_sent_at` é do PR 7 gravar no primeiro passo; `jid` só `<dígitos>@s.whatsapp.net`; `link` só `https://` sem `customerToken`; `items` até 30; agendador pelo índice `recovery_cases_agendador_idx` |
| `recovery_scripts` | `key` `^[a-z0-9_]+\.[a-z0-9_]+$` única por loja; `kind` `pix` · `carrinho` · `geral`; `use` `automatico` · `chat`; `variants` 1 a 3 (chat: 1); `fixed_variant` 1..`cardinality(variants)`; contador por versão = `private_messages` agrupada por `script_id` + `variant` |
| `recovery_testimonials` | `storage_path` = `<tenant_id>/<arquivo>.(jpg\|jpeg\|png\|webp)` no bucket `recuperar-depoimentos`; `authorized_by/at` obrigatórios; `sends` e `conversions` são do PR 9/10 incrementar; a atribuição de `conversions` pode sair de `private_messages.media_ref` (= `<bucket>/<storage_path>`) |
| `private_messages` | `case_id`, `step_key` (`^[a-z0-9_]{1,30}$`; vocabulário sugerido pela spec: `p1`, `p2`, `venceu`, `obrigado`, `c1`, `resposta`, `c2`, `c3` — o PR 7 confirma), `script_id`, `variant` 1..3; FKs `set null` |
| `public.limpar_dados_vencidos_recuperar()` | `.rpc("limpar_dados_vencidos_recuperar")` com service-role → `integer`; o `/api/cron/recuperar` (PR 7) chama 1× por dia |
| Erros que os stores leem | `23505` com `recovery_cases_tenant_kind_yampi_key` / `recovery_scripts_tenant_key_key` / `recovery_testimonials_storage_path_key`; `23514` com o nome da constraint (lista em Task 1 → Produces); `23502` com a coluna |
| Acesso | só `service_role` escreve; `authenticated` lê a própria loja (vendedora nunca); `anon` nada |

Vocabulário que o PR 7 declara em `apps/web/src/lib/recuperar/` (o banco já recusa o resto):

```ts
export type TipoDeCaso = "pix" | "carrinho";
export type StatusDoCaso = "agendado" | "em_sequencia" | "respondeu" | "recuperado" | "virou_pedido"
  | "parado" | "perdido" | "sem_whatsapp" | "nao_quer" | "controle";
export type UsoDoScript = "automatico" | "chat";
export type TipoDoScript = TipoDeCaso | "geral";
export type QuandoC1 = "3h" | "dia_seguinte_10h" | "dois_dias_10h";
```

**Este PR usa de outro PR:** do 1a, `private_conversations`, `private_messages` e `memberships.modules` com `recuperar`. Do que já está em `main`: `public.organizations(id)`, `public.phone_key(text)`, `app.user_tenant_ids()`, `app.set_updated_at()`, `public.schema_signature()` e os papéis `anon`, `authenticated` e `service_role`.
