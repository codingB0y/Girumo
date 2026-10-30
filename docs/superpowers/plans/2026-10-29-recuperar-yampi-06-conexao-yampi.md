# Conexão Yampi (comum) — PR 6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A loja cola alias, `User-Token` e `User-Secret-Key` da Yampi uma vez (Configurações › Integrações); a Girumo cria o aviso na Yampi, recebe cada evento com a assinatura conferida, guarda uma vez e entrega ao módulo ligado (Rastreio, Recuperar), e oferece aos módulos uma API da Yampi que respeita o limite e derruba a conexão, com aviso no sino, quando a Yampi recusa o acesso.

**Architecture:** O aviso entra por `POST /api/integracoes/yampi/webhook?c=<id da conexão>` (HMAC do corpo cru com o segredo selado da conexão), vira uma linha de `yampi_events` (dedupe pelo hash do corpo) e é processado no `after()` por `processarEventoYampi`, que chama os consumidores de um registro (`consumidores.ts`, vazio neste PR). `yampiGet`/`yampiPost`/`yampiApagar` abrem as credenciais seladas, falam com `https://api.dooki.com.br/v2/{alias}` e tratam 401 e limite. Um cron de 5 min reprocessa evento parado e confere o aviso na Yampi; a mesma rota, na agenda diária, chama a limpeza do 1a. Nenhuma migração.

**Tech Stack:** Next 15 (route handlers, `after()`), Supabase/PostgREST com service-role, `node:crypto` + `lib/security/secret-box.ts`, zod 4, React 19 (cartão), `tsx --test` (node:test) com PostgREST falso e `fetch` falso, Playwright (1 teste de leitura).

**Spec:** `docs/superpowers/specs/2026-10-29-recuperar-yampi-design.md` — "Restrições externas" (Yampi), §3 "Conectar a Yampi" e "Aviso da Yampi" e "Cron", §6 (segurança), §7 (erros), §9 (PR 6), §10 (HMAC). **Índice:** `docs/superpowers/plans/2026-10-29-recuperar-yampi-00-indice.md` ("Contrato comum", "Restrições globais"). **Consumidor:** `…rastreio-pedidos-00-indice.md`, seção "Contrato pedido à base".

**Depende de:** PR 1a em `main` (`yampi_connections`, `yampi_events` e a função de limpeza) e a Fase 0 da Yampi feita, com as fixtures em `apps/web/src/lib/yampi/__fixtures__/`. A Task 1 confere as duas coisas e manda parar.

## Fatiamento em PRs

Uma sessão, três PRs em sequência, cada um de `origin/main` depois do merge do anterior (CLAUDE.md, "Regra de PR": passou de ~10 arquivos, são dois PRs; o conjunto tem ~30 de produção e ~20 de teste).

| PR | Tarefas | Entrega | Fica de pé sozinho porque |
|---|---|---|---|
| **6** `yampi-aviso` | 1–6 | Receber: tipos, credenciais, assinatura, envelope, stores, processador com registro de consumidores, rota do aviso, allowlist e teto | sem conexão gravada a rota só responde 401 |
| **6b** `yampi-cliente` | 7–10 | Falar: cliente HTTP, `yampiGet`, 401 → sino, `conexaoYampiAtiva`, criar/conferir/recriar o aviso, cron | só o cron e os módulos chamam; nada no painel |
| **6c** `yampi-cartao` | 11–12 | Conectar: serviço, API do cartão, cartão em Integrações, e2e | |
| — | 13 | Prova na loja piloto e quadro | depois do 6c em produção |

O Rastreio (PR 2 dele) precisa do 6 e do 6b; o piloto, do 6c. O PR 7 do Recuperar depende dos três.

## Arquivos (em `apps/web/src/`, teste ao lado)

| Arquivo | Task | Responsabilidade |
|---|---|---|
| `lib/yampi/tipos.ts` | 2 | `StatusYampi`, `EventoYampi`, `ConexaoYampi` |
| `lib/yampi/credenciais.ts` | 2 | formato de alias/token/chave, contexto da cifra, abrir |
| `lib/yampi/assinatura.ts` | 3 | HMAC base64 do corpo cru, tempo constante |
| `lib/yampi/envelope.ts` | 3 | ler o aviso, chave de dedupe, limite do corpo |
| `lib/stores/yampi-conexoes.ts`, `lib/stores/yampi-eventos.ts` | 4 | as duas tabelas e a limpeza |
| `lib/yampi/consumidores.ts`, `lib/yampi/processar.ts` | 5 | registro e `processarEventoYampi` |
| `app/api/integracoes/yampi/webhook/route.ts` | 6 | o aviso |
| `lib/security/request-access-policy.ts`, `middleware.ts` | 6, 10 | allowlist, teto por IP, cron |
| `lib/yampi/cliente.ts` | 7 | HTTP puro, `YampiErro`, limite |
| `test/yampi-falso.ts`, `lib/yampi/credencial-invalida.ts`, `lib/yampi/api.ts`, `lib/yampi/conexao.ts` | 8 | mundo falso; 401 → inválida + sino; `yampiGet/Post/Apagar`; `conexaoYampiAtiva` |
| `lib/yampi/webhooks.ts`, `lib/yampi/conferir.ts` | 9 | o aviso na Yampi; `conferirConexao` |
| `lib/yampi/cron.ts`, `app/api/cron/yampi/route.ts`, `vercel.json` | 10 | reprocessar, conferir, limpar |
| `lib/yampi/conectar.ts`, `lib/yampi/cartao.ts`, `app/api/integracoes/yampi/route.ts`, `…/testar/route.ts` | 11 | conectar, desconectar, cartão |
| `components/painel/configuracoes/yampi.tsx`, `yampi-painel.tsx`, `yampi-painel-texto.ts`, `…/vitrine/configuracoes-vitrine.tsx`, `e2e/painel-integracao-yampi.spec.ts` | 12 | a tela |

**Contrato do índice → arquivo** (o que o Rastreio e o PR 7 importam): `conexaoYampiAtiva` ← `lib/yampi/conexao`; `yampiGet`, `yampiPost`, `yampiApagar`, `YampiErro` ← `lib/yampi/api`; `processarEventoYampi` ← `lib/yampi/processar`; `ConsumidorDeEvento`, `CONSUMIDORES` ← `lib/yampi/consumidores`; `ConexaoYampi`, `StatusYampi`, `EventoYampi` ← `lib/yampi/tipos`; cartão `Yampi` ← `components/painel/configuracoes/yampi`. Sem arquivo-barril: o registro importa os módulos, então um barril criaria ciclo.

## Decisões deste plano

| Decisão | Por quê | Custo se estiver errada |
|---|---|---|
| `dedupe_key` = `<id da conexão>:<sha256 do corpo cru>` | O envelope da Yampi não traz id de evento; uma chave natural (evento + recurso + `time`) fundiria dois status seguidos do mesmo pedido que caíssem no mesmo segundo, e o hash do corpo não | Reenvio com corpo diferente processa duas vezes; os consumidores são idempotentes |
| Consumidores num registro (`CONSUMIDORES`), não num barramento | Dois módulos, chamada direta, e o processador só marca processado depois de todos | Cada módulo edita o mesmo arquivo (conflito trivial) |
| `conexaoYampiAtiva` devolve `ativa` **e** `aviso_desativado` | A credencial vale; só o aviso caiu e a varredura dos módulos cobre | Módulo que só confia em aviso confere `status` |
| Aviso: apagar os da nossa rota e criar outro (a spec diz "reaproveita") | O `secret_key` só vem no `POST`; o casamento é por rota + `?c=`, não pelo host | Alguns ms sem aviso; o que cair nessa janela a reconciliação dos módulos cobre |
| 401 derruba na 1ª recusa | O token só muda com a senha da Yampi | 401 espúrio da Yampi derruba até o lojista colar de novo (o cartão avisa) |
| Reprocessar sem coluna de tentativas: parado há mais de 3 min e menos de 24 h, até 50 por execução | O `after()` já tem 60 s; o 1a não criou `attempts` | Evento venenoso é tentado a cada 5 min por 24 h e fica com `error` escrito |
| Limpeza diária na mesma rota, pela agenda (`x-vercel-cron-schedule: 0 6 * * *`) | Sem relógio no código nem query string no `vercel.json` | Chamada manual sem o cabeçalho não limpa |
| Limite da Yampi: cabeçalho `X-RateLimit-Remaining`/`Retry-After` + 429; teto de 5/min por loja em Conectar e Testar | O limite (~60/min) é do IP de saída, dividido entre as lojas; um dono apertando botão não pode esgotá-lo | A contagem é por instância; quem decide é o servidor |
| Sino: `notifications` tipo `error`, um não lido por vez, sem e-mail | A spec pede só sino | — |
| Sem `key_fp` e sem migração | Chave de cifra trocada = lojista reconecta; as tabelas são do 1a | — |

## Global Constraints

- TypeScript strict, imports com `@/`, arquivos em `kebab-case`, sem `any` sem justificativa; nomes de domínio em português (índice, "Restrições globais").
- Store com service-role filtra `.eq("tenant_id", …)` sempre. As únicas leituras sem loja, de propósito: `lerConexaoYampiPorId`, `lerEventoYampi`, `listarEventosParados`, `listarConexoesParaConferir` (o aviso e o cron descobrem a loja pela linha).
- **Nenhuma migração neste PR**: as tabelas e a função de limpeza são do 1a. Nunca DDL à mão.
- Segredos: `INTEGRATIONS_ENCRYPTION_KEY` (já existe) sela com `lib/security/secret-box.ts`, contexto `yampi:<tenantId>:<campo>`. Nada de token, chave, segredo do aviso, corpo do aviso, telefone ou código Pix em log, em `last_error` ou em resposta de API.
- Yampi: base `https://api.dooki.com.br/v2/{alias}`; cabeçalhos `User-Token` e `User-Secret-Key`; ~60 req/min por rota e por IP (`X-RateLimit-Remaining`); 401 → conexão `credencial_invalida` + aviso no sino.
- Aviso: `POST /api/integracoes/yampi/webhook?c=<id da conexão>`; `X-Yampi-Hmac-SHA256` = base64 do HMAC-SHA256 do **corpo cru** com o `secret_key`, comparação em tempo constante; `merchant.alias` = alias da conexão; qualquer falha de autenticidade → 401 sem detalhe; responder 2xx em até 5 s (a Yampi desativa o aviso depois de 30 falhas); processar em `after()`. Eventos: `cart.reminder`, `order.created`, `order.paid`, `order.status.updated`, `transaction.payment.refused`.
- O corpo do aviso tem dado pessoal: guardado 30 dias (a limpeza é do 1a; o cron chama 1× por dia).
- Cron: `Authorization: Bearer <CRON_SECRET>` (`isCronAuthorized`), path exato em `classifyRequest`, entrada em `apps/web/vercel.json`.
- Tipos: rodar os dois `tsc` (lint e `tsx --test` não checam tipo). Regex sem a flag `s` (target ES2017, TS1501): usar `[\s\S]`.
- Texto de tela em português do Brasil, design G2 (fonte base 14 px; 12 px só em contador; verde ácido só em Postar/AO VIVO/LOTOU).
- Repositório público: fixtures anonimizadas (sem telefone, CPF, e-mail ou nome reais); token e chave de teste montados com `join` e sem os prefixos `sk_live_`, `sk_test_`, `whsec_` (o scan de secrets casa fixture com cara de chave); loja de teste = `loja-exemplo`, nunca o nome da loja piloto.
- Testes: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test <arquivo>` (da raiz do worktree). Gate antes de cada push: `verify-local.ps1` (seção "Fechamento").
- Commits em inglês com prefixo semântico e a linha `Co-Authored-By` que a sessão de execução recebe; sem `&&` em comando colado (o terminal é PowerShell 5.1).
- Revisão de segurança (agente Security Engineer) antes de mergear cada um dos três PRs.

## Review Focus

1. **Aviso forjado, de outra loja ou de conexão desligada**: assinatura errada, `?c` trocado, alias diferente e conexão desconectada dão 401 e não gravam nada. Testes: "assinatura errada, malformada ou ausente…", "assinatura de outra conexão no ?c errado…", "alias do envelope diferente…", "conexão desconhecida, desconectada…" (Task 6).
2. **Aviso repetido, fora de ordem, ou consumidor que falha**: uma linha por corpo; `paid` antes de `created` chega aos consumidores; um consumidor que falha não impede o outro, e o evento só fica processado quando todos terminam. Testes: "aviso repetido…" (Task 6), "avisos fora de ordem…", "um consumidor que falha…", "só marca processado depois de todos…" (Task 5).
3. **Credencial recusada e credencial colada errada**: 401 derruba a conexão uma vez, com um aviso no sino, e a conexão relida não chega mais à Yampi; e-mail no lugar da chave (autofill), alias com barra e texto curto são recusados no servidor. Testes: "401 marca a conexão…" (Task 8), "credencial: recorta…" (Task 2), "dados fora do formato…" (Task 11).
4. **Vazamento**: token, chave, segredo, corpo, telefone ou código Pix em log, em mensagem de erro, em `error` do evento ou na resposta do cartão. Testes: "o log nunca leva…" (Task 6), "o erro nunca carrega…" (Task 7), "o erro gravado não carrega o payload" (Task 5), "o cartão devolve só o final do token…" (Task 11).
5. **Yampi desligou o aviso, criar o aviso falhou pela metade, ou o limite estourou**: o cron recria; Conectar com a criação falhando deixa as credenciais gravadas com `aviso_desativado` e o cron conserta; 429 e `Remaining: 0` não martelam a Yampi e um dono apertando Testar não esgota o limite do IP. Testes: "conferirConexao…" (Task 9), "aviso não criado…" e "a sexta chamada no minuto…" (Task 11), "429…" e "X-RateLimit-Remaining 0…" (Task 7).

---

### Task 1: Pré-condições, worktree e conferência da Fase 0 (PARAR se contradisser)

**Files:**
- Create: `apps/web/src/lib/yampi/fase0-suposicoes.test.ts`
- Ler: `apps/web/src/lib/yampi/__fixtures__/*` (Fase 0), `apps/web/supabase/migrations/*` (1a)

**Interfaces:**
- Consumes: 1a em `main` e as fixtures da Fase 0.
- Produces: a certeza de que as suposições S1–S12 abaixo valem; o teste fica no repositório como trava das fixtures.

- [ ] **Step 1: Worktree novo a partir de `origin/main`** (nunca `checkout -b` no principal). `node_modules` por duas junctions (o `next` mora em `apps/web/node_modules`); conferir antes que o `node_modules` do principal não está vazio.

```powershell
git -C C:\Users\Igor\Desktop\HubFlow-platform fetch origin main
git -C C:\Users\Igor\Desktop\HubFlow-platform worktree add -b feat/yampi-aviso C:\Users\Igor\Desktop\HubFlow-platform\.claude\worktrees\yampi-aviso origin/main
cmd /c mklink /J "C:\Users\Igor\Desktop\HubFlow-platform\.claude\worktrees\yampi-aviso\node_modules" "C:\Users\Igor\Desktop\HubFlow-platform\node_modules"
cmd /c mklink /J "C:\Users\Igor\Desktop\HubFlow-platform\.claude\worktrees\yampi-aviso\apps\web\node_modules" "C:\Users\Igor\Desktop\HubFlow-platform\apps\web\node_modules"
```

Daqui em diante, tudo roda neste worktree. Ao apagar o worktree, desarmar as junctions antes (`[System.IO.Directory]::Delete(<junction>, $false)`).

- [ ] **Step 2: O 1a está em `main`?** (`yampi_connections`, `yampi_events`, o wrapper de limpeza)

```powershell
git grep -n -i "yampi_connections" origin/main -- apps/web/supabase/migrations
git grep -n -i "limpar_dados_vencidos_comuns" origin/main -- apps/web/supabase/migrations
```

Expected: pelo menos uma linha em cada. Sem a primeira → **parar** (o 1a não entrou). Se só aparecer `app.limpar_dados_vencidos_comuns` e nenhum `public.limpar_dados_vencidos_comuns`, **parar e pedir o wrapper ao 1a**: o PostgREST só chama funções de `public` (precedente: `app.posts_hoje_por_grupo` + `public.posts_hoje_por_grupo`), e este PR não faz DDL.

- [ ] **Step 3: Conferir as colunas que o plano usa** (na migração do 1a). Só o *nome* diferente → ajustar as constantes/literais de coluna nas duas stores da Task 4 e seguir. Coluna que **falta** → parar e pedir ao 1a.

| Tabela | Colunas usadas |
|---|---|
| `yampi_connections` | `id uuid` pk, `tenant_id` **único**, `alias`, `user_token`, `user_secret_key`, `webhook_id`, `webhook_secret`, `events`, `status` (CHECK com `ativa`, `credencial_invalida`, `aviso_desativado`, `desconectada`), `last_event_at`, `last_check_at`, `last_error` |
| `yampi_events` | `id uuid` pk, `tenant_id`, `connection_id`, `event`, `resource_id`, `dedupe_key` (único **sozinha**), `payload jsonb`, `received_at` (default `now()`), `processed_at`, `error` |
| função | `public.limpar_dados_vencidos_comuns() returns integer`, com `execute` para `service_role` |

- [ ] **Step 4: A Fase 0 terminou, com estas fixtures** (se a Fase 0 salvou com outros nomes, `git mv` para estes neste commit; ela mesma anonimiza):

`aviso-order-created.json` (Pix), `aviso-order-paid.json`, `aviso-order-status-updated.json`, `aviso-cart-reminder.json`, `cabecalhos-do-aviso.json` (`{"x-yampi-hmac-sha256": "<valor real, 44 caracteres>"}`), `webhook-criado.json` (resposta do `POST /webhooks`), `webhooks-lista.json` (resposta do `GET /webhooks` com o aviso ativo) e, só se o `PUT` aceitou `active: false` (Y20 do resultado), `webhooks-lista-desativado.json` (o mesmo aviso desativado: a Fase 0 não consegue os dois estados na mesma listagem), `pedidos-1.json` (`GET /orders?limit=1`), `erro-401.json` (`{"status": 401}` com credencial errada), `limite-cabecalhos.json` (`{"x-ratelimit-remaining": "58", "retry-after": "7"}`; o `retry-after` pode faltar), `credenciais-formato.json` (`{"userToken": {"tamanho": 40, "soImprimivelAscii": true, "temArroba": false}, "userSecretKey": {…}}`).

Conferir que nenhuma tem dado pessoal (repositório público):

```powershell
Select-String -Path apps\web\src\lib\yampi\__fixtures__\*.json -Pattern '@|\d{10,}'
```

Expected: as linhas que aparecerem são só ids da Yampi, hashes ou o telefone inventado `5511999990000`. Qualquer outro telefone, CPF, e-mail ou nome → anonimizar antes de commitar.

- [ ] **Step 5: Write the test** `apps/web/src/lib/yampi/fase0-suposicoes.test.ts`. Cada teste leva o nome da suposição. Helper do arquivo: `const DIR = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__")` e `ler(nome) = JSON.parse(readFileSync(join(DIR, nome), "utf8")) as Record<string, unknown>`, estreitando com cast local (é teste de fixture, não código de produção). Os cinco eventos entram como constante local (a Task 2 ainda não existe).

```ts
const CINCO = ["cart.reminder", "order.created", "order.paid", "order.status.updated", "transaction.payment.refused"];
const AVISOS = ["aviso-order-created.json", "aviso-order-paid.json", "aviso-order-status-updated.json", "aviso-cart-reminder.json"];

test("S1/S9/S10 envelope: objeto único com event, merchant.alias e resource; alias na regra; corpo abaixo de 1 MiB", () => {
  for (const arquivo of AVISOS) {
    const aviso = ler(arquivo);
    assert.ok(!Array.isArray(aviso), arquivo);
    assert.ok(CINCO.includes(String(aviso.event)), `${arquivo}: ${String(aviso.event)}`);
    assert.match(String((aviso.merchant as { alias?: unknown }).alias), /^[A-Za-z0-9][A-Za-z0-9_-]{1,62}$/, arquivo);
    assert.ok("resource" in aviso, arquivo);
    assert.ok(statSync(join(DIR, arquivo)).size < 1024 * 1024, arquivo);
  }
});
test("S2 o cabeçalho da assinatura é base64 padrão de 32 bytes", () => {
  assert.match(String(ler("cabecalhos-do-aviso.json")["x-yampi-hmac-sha256"]), /^[A-Za-z0-9+/]{43}=$/);
});
test("S3 o POST /webhooks devolve data.id e data.secret_key", () => {
  const data = ler("webhook-criado.json").data as { id: unknown; secret_key: unknown };
  assert.ok(["string", "number"].includes(typeof data.id));
  assert.ok(typeof data.secret_key === "string" && data.secret_key.length >= 16);
});
// A doc da Yampi não garante o que segue (S3b, S4b): checagem explícita, que pula em vez de parar.
test("S3b se o POST ecoar events, vêm os cinco (a doc só devolve events com include=events)", (t) => {
  const events = (ler("webhook-criado.json").data as { events?: unknown }).events;
  if (!Array.isArray(events)) return t.skip("sem eco: conferir os cinco eventos na linha Y8 do resultado da Fase 0");
  for (const e of CINCO) assert.ok((events as string[]).includes(e), e);
});
const desativado = (w: Record<string, unknown>) => w.active === false || Boolean(w.disabled_at);
test("S4 o GET /webhooks lista id e url, e o aviso ativo não aparece como desativado", () => {
  const lista = ler("webhooks-lista.json").data as Array<Record<string, unknown>>;
  assert.ok(lista.length >= 1 && lista.every((w) => "id" in w && typeof w.url === "string"));
  assert.ok(lista.some((w) => !desativado(w)));
});
test("S4b o aviso desativado aparece com active false ou disabled_at (arquivo próprio da Fase 0)", (t) => {
  if (!existsSync(join(DIR, "webhooks-lista-desativado.json"))) return t.skip("o PUT não aceitou active (Y20): o desativado fica pela doc");
  const lista = ler("webhooks-lista-desativado.json").data as Array<Record<string, unknown>>;
  assert.ok(lista.some(desativado));
});
test("S5/S6/S7/S8 limite, leitura barata, 401 e formato das credenciais", () => {
  assert.match(String(ler("limite-cabecalhos.json")["x-ratelimit-remaining"]), /^\d+$/);
  assert.ok(Array.isArray(ler("pedidos-1.json").data));
  assert.equal(ler("erro-401.json").status, 401);
  const f = ler("credenciais-formato.json") as Record<string, { tamanho: number; soImprimivelAscii: boolean; temArroba: boolean }>;
  for (const campo of ["userToken", "userSecretKey"]) {
    assert.ok(f[campo].tamanho >= 16 && f[campo].tamanho <= 300 && f[campo].soImprimivelAscii && !f[campo].temArroba, campo);
  }
});
```

Duas suposições não cabem em fixture. O **resultado escrito da Fase 0** (`docs/superpowers/plans/_recuperar-fase-0-resultado.md`, linhas Y18, Y9 e Y19) tem de dizer: **S11** criar o aviso por API não gerou chamada de teste ao nosso endpoint (ou gerou e a Yampi aceitou um 401); **S12** o cabeçalho real do aviso bateu com `base64(HMAC-SHA256(corpo cru, secret_key))` recalculado sobre o corpo original. E **S10b**: o maior corpo observado é menor que 1 MiB.

Mais quatro suposições que a doc da Yampi não garante, conferidas aqui por escrito (vão no corpo do PR):

| # | Suposição | Onde se responde | Se não valer |
|---|---|---|---|
| S3b | o aviso criado tem os cinco eventos (o `POST` ecoa `events`, ou a listagem com `include=events` mostra) | `webhook-criado.json`, Y8 | o `recriarAviso` (Task 9) não depende do eco; se a Yampi gravou menos eventos, **parar** |
| S4b | a listagem distingue o aviso desativado por `active: false` ou `disabled_at` — com os dois estados na mesma listagem (a Fase 0 só consegue o mesmo aviso em dois arquivos) | `webhooks-lista.json` + `webhooks-lista-desativado.json`, Y20 | sem o segundo arquivo, o `estadoDoAviso` segue a doc; nada muda no código, anotar no PR |
| S4c | o `PUT /webhooks/{id}` aceita `active` | Y20 | o plano não usa `PUT` (religar = apagar e criar, Task 9): só a fixture de S4b fica faltando |
| S6b | `GET /orders?limit=1` sem filtro responde 200 (a doc manda a busca **filtrada** para `/search/orders`) | `pedidos-1.json`, Y21 e Y10 | trocar `PEDIDO_DE_TESTE` (Task 11) para `/search/orders` e os literais `"/orders"` dos testes das Tasks 7, 8 e 11; anotar no PR |

- [ ] **Step 6: Run** `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/yampi/fase0-suposicoes.test.ts`. Expected: `# fail 0`. S3b e S4b pulam (não param) quando a Fase 0 não tem o dado; o que fazer está na tabela acima. **Falha em S1–S5, ou S11 / S12 / S10b não escritos na Fase 0 → PARAR**: elas mudam o desenho (envelope, assinatura, API de avisos, criação do aviso); não adaptar o código desta série, levar ao Igor o nome da suposição e o que a fixture mostra. **Falha em S6–S10 → ajustar só a constante indicada e seguir, anotando no PR**: S6 o mapeamento de status do cliente (Task 7), S7 os nomes dos cabeçalhos de limite (Task 7), S8 a regra de `lerCredencial` e S9 a de `lerAlias` (Task 2), S10 o `LIMITE_CORPO_AVISO` (Task 3).

- [ ] **Step 7: Commit**

```powershell
git add apps/web/src/lib/yampi/fase0-suposicoes.test.ts apps/web/src/lib/yampi/__fixtures__
git commit -m "test(yampi): pin the Fase 0 assumptions to the captured fixtures" -m "Co-Authored-By: <modelo da sessão> <noreply@anthropic.com>"
```

---

### Task 2: Tipos, formato das credenciais e cofre

**Files:**
- Create: `apps/web/src/lib/yampi/tipos.ts`, `apps/web/src/lib/yampi/credenciais.ts`
- Test: `apps/web/src/lib/yampi/credenciais.test.ts`

**Interfaces:**
- Consumes: `selar`, `abrir` de `@/lib/security/secret-box`.
- Produces:

```ts
// tipos.ts
export const STATUS_YAMPI = ["ativa", "credencial_invalida", "aviso_desativado", "desconectada"] as const;
export type StatusYampi = (typeof STATUS_YAMPI)[number];
export const EVENTOS_YAMPI = ["cart.reminder", "order.created", "order.paid", "order.status.updated", "transaction.payment.refused"] as const;
export type EventoYampi = (typeof EVENTOS_YAMPI)[number];
export type ConexaoYampi = {          // superconjunto do ConexaoYampi do contrato do Rastreio
  id: string; tenantId: string; alias: string; status: StatusYampi;
  userTokenSelado: string | null; userSecretKeySelado: string | null;      // cifra, nunca texto
  webhookId: string | null; webhookSecretSelado: string | null;
  lastEventAt: string | null; lastCheckAt: string | null; lastError: string | null;
};
// credenciais.ts
export function lerAlias(entrada: unknown): string | null;       // /^[A-Za-z0-9][A-Za-z0-9_-]{1,62}$/ depois do trim
export function lerCredencial(entrada: unknown): string | null;  // trim; ASCII imprimível sem espaço, 16–300, sem "@"
export type CampoSelado = "user_token" | "user_secret_key" | "webhook_secret";
export function contextoDoSegredo(tenantId: string, campo: CampoSelado): string;   // `yampi:${tenantId}:${campo}`
export function abrirCredenciais(c: ConexaoYampi, chave: Buffer): { token: string; secretKey: string };  // lança Error("Yampi: conexão sem credencial") se faltar
export function abrirSegredoDoAviso(c: ConexaoYampi, chave: Buffer): string;                             // lança Error("Yampi: conexão sem segredo do aviso")
```

- [ ] **Step 1: Write the failing test** `credenciais.test.ts`:

```ts
const CHAVE = Buffer.alloc(32, 7);
const TOKEN = ["Zk3pQ9vL2x", "W8cR5tN7mB4y"].join("");          // em pedaços: o scan de secrets
const CHAVE_SECRETA = ["h6jD1fG0aS", "e2uV7oK9nT3q"].join("");

test("alias: letras, números, hífen e sublinhado passam; o que viraria caminho ou consulta na URL não", () => {
  assert.equal(lerAlias(" loja-exemplo "), "loja-exemplo");
  for (const ok of ["Loja_01", "ab"]) assert.equal(lerAlias(ok), ok);
  for (const ruim of ["", "a", "../x", "a/b", "a?b", "a#b", "a b", "a%2Fb", "loja.com.br", "x".repeat(64), 42, null, undefined]) {
    assert.equal(lerAlias(ruim), null, String(ruim));
  }
});
test("credencial: recorta as pontas; recusa e-mail (autofill), texto curto, espaço no meio e caractere de controle", () => {
  assert.equal(lerCredencial(`  ${TOKEN}\n`), TOKEN);
  for (const ruim of ["igor@exemplo.com.br", "curto", `${TOKEN} ${CHAVE_SECRETA}`, `${TOKEN}\r\nX-Outro: 1`, "é".repeat(20), "a".repeat(301), 123, null]) {
    assert.equal(lerCredencial(ruim), null, String(ruim));
  }
});
test("o contexto da cifra separa a loja e o campo", () => {
  assert.equal(contextoDoSegredo("loja-a", "user_token"), "yampi:loja-a:user_token");
  assert.notEqual(contextoDoSegredo("loja-a", "user_token"), contextoDoSegredo("loja-a", "webhook_secret"));
});
test("abrirCredenciais devolve o par e abrirSegredoDoAviso o segredo; cifra de outra loja ou campo ausente lançam", () => {
  const selado = (valor: string, campo: CampoSelado) => selar(valor, contextoDoSegredo("loja-a", campo), CHAVE);   // sempre selado para a loja-a
  const c = (tenantId: string, over: Partial<ConexaoYampi> = {}): ConexaoYampi => ({
    id: "c1", tenantId, alias: "loja-exemplo", status: "ativa",
    userTokenSelado: selado(TOKEN, "user_token"), userSecretKeySelado: selado(CHAVE_SECRETA, "user_secret_key"),
    webhookId: null, webhookSecretSelado: selado("segredo-do-aviso", "webhook_secret"),
    lastEventAt: null, lastCheckAt: null, lastError: null, ...over,
  });
  assert.deepEqual(abrirCredenciais(c("loja-a"), CHAVE), { token: TOKEN, secretKey: CHAVE_SECRETA });
  assert.equal(abrirSegredoDoAviso(c("loja-a"), CHAVE), "segredo-do-aviso");
  assert.throws(() => abrirCredenciais(c("loja-b"), CHAVE), /secret-box/);
  assert.throws(() => abrirCredenciais(c("loja-a", { userTokenSelado: null }), CHAVE), /sem credencial/);
  assert.throws(() => abrirSegredoDoAviso(c("loja-a", { webhookSecretSelado: null }), CHAVE), /sem segredo do aviso/);
});
```

- [ ] **Step 2: Run** `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/yampi/credenciais.test.ts`. Expected: FAIL (`Cannot find module './credenciais'`).
- [ ] **Step 3: Implement** os dois arquivos com as assinaturas acima. `credenciais.ts` leva `import "server-only"`. `lerAlias`/`lerCredencial` devolvem `null` para tudo que não é string; a regra de `lerCredencial` é a do S8 (se a Task 1 mostrou outra, trocar só a regex).
- [ ] **Step 4: Run** o mesmo comando. Expected: `# fail 0`.
- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/lib/yampi/tipos.ts apps/web/src/lib/yampi/credenciais.ts apps/web/src/lib/yampi/credenciais.test.ts
git commit -m "feat(yampi): connection types, credential format and sealed-secret contexts" -m "Co-Authored-By: <modelo da sessão> <noreply@anthropic.com>"
```

---

### Task 3: Assinatura do aviso e envelope

**Files:**
- Create: `apps/web/src/lib/yampi/assinatura.ts`, `apps/web/src/lib/yampi/envelope.ts`
- Test: `apps/web/src/lib/yampi/assinatura.test.ts`, `apps/web/src/lib/yampi/envelope.test.ts`

**Interfaces:**
- Consumes: `EVENTOS_YAMPI`, `EventoYampi` (Task 2).
- Produces:

```ts
// assinatura.ts
export function assinaturaYampiConfere(corpo: Uint8Array | string, cabecalho: string | null, segredo: string): boolean;
// envelope.ts
export const LIMITE_CORPO_AVISO = 1024 * 1024;
export type EnvelopeYampi = { evento: EventoYampi; time: string | null; alias: string; recursoId: string | null; recurso: unknown };
export function lerEnvelope(json: unknown): { ok: true; envelope: EnvelopeYampi } | { ok: false; motivo: "formato" | "outro_evento" };
export function chaveDeDedupe(conexaoId: string, corpo: Uint8Array): string;   // `${conexaoId}:${sha256 hex do corpo}`
```

- [ ] **Step 1: Write the failing tests.** `assinatura.test.ts` — o vetor conhecido foi conferido fora do código (`openssl dgst -sha256 -hmac … -binary | base64`), então o teste não é circular:

```ts
const CORPO = '{"event":"order.paid","resource":{"id":42}}';
const SEGREDO = "segredo-de-teste-da-yampi";
const BOA = "AuFezIw0B8ulxtZZm4L3MwEvD39h0p4Bjl0Us/HsZa0=";
const b64 = (c: string | Uint8Array, s = SEGREDO) => createHmac("sha256", s).update(c).digest("base64");

test("vetor conhecido: o base64 do HMAC-SHA256 do corpo cru confere, com espaço em volta do cabeçalho", () => {
  assert.equal(b64(CORPO), BOA);
  assert.equal(assinaturaYampiConfere(CORPO, BOA, SEGREDO), true);
  assert.equal(assinaturaYampiConfere(CORPO, `  ${BOA} `, SEGREDO), true);
});
test("o HMAC é sobre os bytes crus: BOM e byte UTF-8 inválido conferem; o corpo decodificado antes, não", () => {
  const json = new TextEncoder().encode(CORPO);
  for (const bytes of [Uint8Array.from([0xef, 0xbb, 0xbf, ...json]), Uint8Array.from([...json.subarray(0, 10), 0xff, ...json.subarray(10)])]) {
    assert.equal(assinaturaYampiConfere(bytes, b64(bytes), SEGREDO), true);
    assert.equal(assinaturaYampiConfere(new TextDecoder().decode(bytes), b64(bytes), SEGREDO), false);
    assert.equal(assinaturaYampiConfere(Uint8Array.from([...bytes, 0x20]), b64(bytes), SEGREDO), false);
  }
});
test("corpo alterado, segredo errado ou vazio, cabeçalho ausente ou vazio: não confere", () => {
  assert.equal(assinaturaYampiConfere(`${CORPO} `, BOA, SEGREDO), false);
  assert.equal(assinaturaYampiConfere(CORPO, BOA, "outro"), false);
  assert.equal(assinaturaYampiConfere(CORPO, BOA, ""), false);
  assert.equal(assinaturaYampiConfere(CORPO, null, SEGREDO), false);
  assert.equal(assinaturaYampiConfere(CORPO, "", SEGREDO), false);
});
test("cabeçalho que não é base64 padrão de 32 bytes não confere e não lança (hex, sem '=', url-safe, curto, longo, com prefixo)", () => {
  const hex = createHmac("sha256", SEGREDO).update(CORPO).digest("hex");
  for (const c of [hex, BOA.slice(0, -1), BOA.replace("/", "_"), BOA.slice(0, 20), `${BOA}AA`, `sha256=${BOA}`, `${BOA.slice(0, 10)} ${BOA.slice(10)}`]) {
    assert.equal(assinaturaYampiConfere(CORPO, c, SEGREDO), false, c);
  }
});
```

`envelope.test.ts`:

```ts
const aviso = (extra: Record<string, unknown> = {}) => ({ event: "order.paid", time: "2026-10-29 10:00:00", merchant: { id: 1, alias: "loja-exemplo" }, resource: { id: 42 }, ...extra });

test("os cinco eventos viram evento tipado, com alias, time, recurso e o id do recurso como texto", () => {
  for (const evento of EVENTOS_YAMPI) {
    assert.deepEqual(lerEnvelope(aviso({ event: evento })), { ok: true, envelope: { evento, time: "2026-10-29 10:00:00", alias: "loja-exemplo", recursoId: "42", recurso: { id: 42 } } });
  }
});
test("recurso sem id legível: recursoId nulo e o aviso segue válido", () => {
  for (const resource of [{ numero: 5 }, null, "x", { id: {} }]) {
    const r = lerEnvelope(aviso({ resource }));
    assert.equal(r.ok && r.envelope.recursoId, null);
  }
});
test("outro evento é outro_evento, mesmo sem merchant ou resource; caixa diferente também", () => {
  assert.deepEqual(lerEnvelope({ event: "product.updated" }), { ok: false, motivo: "outro_evento" });
  assert.deepEqual(lerEnvelope(aviso({ event: "Order.Paid" })), { ok: false, motivo: "outro_evento" });
});
test("corpo que não é objeto, sem event string ou sem merchant.alias: formato", () => {
  for (const ruim of [null, undefined, "x", 42, [], [aviso()], {}, aviso({ event: 7 }), aviso({ merchant: {} }), aviso({ merchant: { alias: "" } }), aviso({ merchant: null })]) {
    assert.deepEqual(lerEnvelope(ruim), { ok: false, motivo: "formato" }, JSON.stringify(ruim));
  }
});
test("chaveDeDedupe: o mesmo corpo na mesma conexão repete; outro corpo ou outra conexão muda", () => {
  const a = new TextEncoder().encode("{}"), b = new TextEncoder().encode("{} ");
  assert.match(chaveDeDedupe("c1", a), /^c1:[0-9a-f]{64}$/);
  assert.equal(chaveDeDedupe("c1", a), chaveDeDedupe("c1", a));
  assert.notEqual(chaveDeDedupe("c1", a), chaveDeDedupe("c1", b));
  assert.notEqual(chaveDeDedupe("c1", a), chaveDeDedupe("c2", a));
});
```

- [ ] **Step 2: Run** `…--test src/lib/yampi/assinatura.test.ts src/lib/yampi/envelope.test.ts`. Expected: FAIL (módulos não existem).
- [ ] **Step 3: Implement.** `assinaturaYampiConfere`: cabeçalho aparado tem de casar `^[A-Za-z0-9+/]{43}=$` (base64 padrão de 32 bytes); calcular `createHmac("sha256", segredo).update(corpo).digest()` (string em UTF-8; bytes crus como vieram) e comparar com `timingSafeEqual` depois de checar o tamanho; segredo ou cabeçalho vazios → `false`. `lerEnvelope`: primeiro só `{ event: string }` (falhou → `formato`), depois `event` fora dos cinco → `outro_evento`, só então `merchant.alias` (string 1–100), `time` (string ou nulo) e `resource`; `recursoId` = `String(resource.id)` quando `id` é string não vazia ou número. `chaveDeDedupe` usa `createHash("sha256")`.
- [ ] **Step 4: Run** o mesmo comando. Expected: `# fail 0`.
- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/lib/yampi/assinatura.ts apps/web/src/lib/yampi/assinatura.test.ts apps/web/src/lib/yampi/envelope.ts apps/web/src/lib/yampi/envelope.test.ts
git commit -m "feat(yampi): verify X-Yampi-Hmac-SHA256 over the raw body and parse the event envelope" -m "Co-Authored-By: <modelo da sessão> <noreply@anthropic.com>"
```

---

### Task 4: Stores das conexões e dos eventos

**Files:**
- Create: `apps/web/src/lib/stores/yampi-conexoes.ts`, `apps/web/src/lib/stores/yampi-eventos.ts`
- Test: `apps/web/src/lib/stores/yampi-conexoes.test.ts`, `apps/web/src/lib/stores/yampi-eventos.test.ts`

**Interfaces:**
- Consumes: `ConexaoYampi`, `StatusYampi`, `EVENTOS_YAMPI` (Task 2); `getSupabaseAdmin`. O `select` é um literal só (`COLS`), com as colunas do 1a (Task 1, Step 3); `updated_at` não é gravado aqui.
- Produces:

```ts
// yampi-conexoes.ts
export async function lerConexaoYampi(tenantId: string): Promise<ConexaoYampi | null>;
export async function lerConexaoYampiPorId(id: string): Promise<ConexaoYampi | null>;   // sem loja, de propósito: o aviso e o processador acham a loja pela linha
export async function salvarConexaoYampi(tenantId: string, d: { alias: string; userTokenSelado: string; userSecretKeySelado: string }): Promise<ConexaoYampi>;  // upsert por tenant_id: status "aviso_desativado", aviso e erro zerados
export async function salvarAvisoYampi(tenantId: string, a: { webhookId: string; webhookSecretSelado: string }): Promise<void>;   // status "ativa", events = EVENTOS_YAMPI, last_error null, last_check_at agora
export type PatchConexaoYampi = Partial<{ status: StatusYampi; last_error: string | null; last_check_at: string | null; last_event_at: string | null }>;
export async function atualizarConexaoYampi(tenantId: string, patch: PatchConexaoYampi): Promise<void>;
export async function marcarCredencialInvalidaNoBanco(tenantId: string, erro: string): Promise<boolean>;   // só ativa/aviso_desativado mudam; true = mudou
export async function desconectarConexaoYampi(tenantId: string): Promise<ConexaoYampi | null>;             // devolve a de antes; apaga credenciais e aviso
export async function listarConexoesParaConferir(antesDe: Date, limite: number): Promise<string[]>;        // ids de loja, sem filtro de loja de propósito
// yampi-eventos.ts
export type EventoYampiGravado = { id: string; tenantId: string; connectionId: string; event: string; resourceId: string | null; payload: unknown; receivedAt: string; processedAt: string | null; error: string | null };
export async function gravarEventoYampi(e: { tenantId: string; connectionId: string; event: string; resourceId: string | null; dedupeKey: string; payload: unknown }): Promise<{ id: string } | null>;  // null = repetido
export async function lerEventoYampi(id: string): Promise<EventoYampiGravado | null>;                       // por id, sem loja
export async function marcarEventoProcessado(tenantId: string, id: string, nota?: string | null): Promise<void>;
export async function marcarEventoComErro(tenantId: string, id: string, erro: string): Promise<void>;       // corta em 300
export async function listarEventosParados(p: { antesDe: Date; depoisDe: Date; limite: number }): Promise<string[]>;  // ids, sem loja
export async function limparDadosVencidosComuns(): Promise<number>;                                          // rpc "limpar_dados_vencidos_comuns"
```

- [ ] **Step 1: Write the failing tests**, no molde de `lib/stores/bling-conexoes.test.ts` (servidor HTTP falso do PostgREST que registra `{metodo, url, corpo, headers}` — o dele ainda não guarda os cabeçalhos, e o teste do `Prefer` precisa deles — e responde em sequência; `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` apontando para ele). Linha-modelo da conexão com as colunas do Step 3 da Task 1. Asserções que cada teste fixa:

```ts
test("lerConexaoYampi filtra pela loja e mapeia as colunas para o tipo", async () => {
  preparar([200, [LINHA]]);
  const c = await lerConexaoYampi("loja-a");
  assert.deepEqual(filtros(0), { tenant_id: "eq.loja-a", limit: "1" });
  assert.deepEqual([c?.tenantId, c?.status, c?.userTokenSelado, c?.webhookSecretSelado], ["loja-a", "ativa", "v1.a.b.c", "v1.d.e.f"]);
  assert.equal((await lerConexaoYampi("loja-a")), null);          // PostgREST devolve [] na segunda
});
test("lerConexaoYampiPorId lê só pelo id (a única leitura sem loja, para o aviso)", async () => {
  preparar([200, [LINHA]]);
  await lerConexaoYampiPorId("c1");
  assert.deepEqual(filtros(0), { id: "eq.c1", limit: "1" });
});
test("salvarConexaoYampi: upsert por tenant_id, status aviso_desativado, aviso e erro zerados, devolve a linha com o id", async () => {
  preparar([200, [LINHA]]);
  const c = await salvarConexaoYampi("loja-a", { alias: "loja-exemplo", userTokenSelado: "v1.t", userSecretKeySelado: "v1.k" });
  assert.equal(pedidos[0].url.searchParams.get("on_conflict"), "tenant_id");
  assert.deepEqual(corpo(0), { tenant_id: "loja-a", alias: "loja-exemplo", user_token: "v1.t", user_secret_key: "v1.k", status: "aviso_desativado", webhook_id: null, webhook_secret: null, last_error: null, last_check_at: null });
  assert.equal(c.id, LINHA.id);
});
test("salvarAvisoYampi grava id e segredo selado, os cinco eventos e volta a ativa, filtrando pela loja", ...);   // PATCH: tenant_id=eq.loja-a; corpo.events deepEqual [...EVENTOS_YAMPI]; status "ativa"; last_error null; last_check_at ISO
test("marcarCredencialInvalidaNoBanco só muda ativa e aviso_desativado e devolve se mudou", async () => {
  preparar([200, [{ tenant_id: "loja-a" }]], [200, []]);
  assert.equal(await marcarCredencialInvalidaNoBanco("loja-a", "x"), true);
  assert.equal(await marcarCredencialInvalidaNoBanco("loja-a", "x"), false);
  assert.deepEqual([filtros(0).tenant_id, filtros(0).status], ["eq.loja-a", "in.(ativa,aviso_desativado)"]);
  assert.equal(corpo(0).status, "credencial_invalida");
});
test("desconectarConexaoYampi devolve a conexão de antes e apaga credenciais e aviso; sem linha devolve null", ...);   // PATCH: status "desconectada", user_token/user_secret_key/webhook_id/webhook_secret null, tenant_id=eq.loja-a
test("listarConexoesParaConferir: ativas ou com aviso desligado, sem checagem há mais de 1 h, as mais antigas primeiro, no limite", ...);   // status=in.(ativa,aviso_desativado); or=(last_check_at.is.null,last_check_at.lt.<iso>); order=last_check_at.asc.nullsfirst; limit=20; devolve tenant_id[]
```

`yampi-eventos.test.ts`:

```ts
test("gravarEventoYampi ignora a repetição pela dedupe_key e devolve o id só quando entrou", async () => {
  preparar([200, [{ id: "e1" }]], [200, []]);
  const e = { tenantId: "loja-a", connectionId: "c1", event: "order.paid", resourceId: "42", dedupeKey: "c1:abc", payload: { event: "order.paid" } };
  assert.deepEqual(await gravarEventoYampi(e), { id: "e1" });
  assert.equal(await gravarEventoYampi(e), null);
  assert.equal(pedidos[0].url.searchParams.get("on_conflict"), "dedupe_key");
  assert.match(pedidos[0].headers.prefer, /resolution=ignore-duplicates/);
  assert.deepEqual(corpo(0), { tenant_id: "loja-a", connection_id: "c1", event: "order.paid", resource_id: "42", dedupe_key: "c1:abc", payload: { event: "order.paid" } });
});
test("marcarEventoProcessado e marcarEventoComErro filtram por id E loja; o erro é cortado em 300; só o processado preenche processed_at", ...);
test("listarEventosParados: sem processar, entre depoisDe e antesDe, os mais antigos primeiro", ...);   // processed_at=is.null; received_at=lt.<antesDe>; received_at=gt.<depoisDe>; order=received_at.asc; limit
test("lerEventoYampi lê por id e mapeia o payload sem tocar nele; limparDadosVencidosComuns chama a função pública e devolve o número", ...);   // POST /rest/v1/rpc/limpar_dados_vencidos_comuns → 7
```

Um teste em cada arquivo trava a regra do CLAUDE.md: "toda função com loja manda `tenant_id=eq.<loja>`" (varrer `pedidos` das funções que recebem `tenantId`).

- [ ] **Step 2: Run** `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/stores/yampi-conexoes.test.ts src/lib/stores/yampi-eventos.test.ts`. Expected: FAIL (módulos não existem).
- [ ] **Step 3: Implement** os dois arquivos (`import "server-only"`, `getSupabaseAdmin()`). Padrões do repositório: `upsert(linha, { onConflict, ignoreDuplicates })` + `.select("id")` conta o que entrou (`lib/stores/group-bulk-jobs.ts`); `.update(...).select("tenant_id")` diz se mudou (`marcarAlertaReconectar` do Bling); `.or("last_check_at.is.null,last_check_at.lt.<iso>")`; erro do PostgREST vira `throw new Error(error.message)`. `salvarConexaoYampi` não usa `.single()`: lê `data[0]`.
- [ ] **Step 4: Run** o mesmo comando. Expected: `# fail 0`.
- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/lib/stores/yampi-conexoes.ts apps/web/src/lib/stores/yampi-conexoes.test.ts apps/web/src/lib/stores/yampi-eventos.ts apps/web/src/lib/stores/yampi-eventos.test.ts
git commit -m "feat(yampi): connection and event stores" -m "Co-Authored-By: <modelo da sessão> <noreply@anthropic.com>"
```

---

### Task 5: Processador do evento e ponto de extensão dos módulos

**Files:**
- Create: `apps/web/src/lib/yampi/consumidores.ts`, `apps/web/src/lib/yampi/processar.ts`
- Test: `apps/web/src/lib/yampi/processar.test.ts`

**Interfaces:**
- Consumes: `lerEventoYampi`, `marcarEventoProcessado`, `marcarEventoComErro` (Task 4); `lerConexaoYampiPorId` (Task 4); `lerEnvelope` (Task 3).
- Produces:

```ts
// consumidores.ts — o ponto de extensão. Cada módulo acrescenta UMA entrada no próprio PR.
export type EventoParaConsumir = { eventoId: string; tenantId: string; conexao: ConexaoYampi; evento: EventoYampi; time: string | null; recurso: unknown; payload: unknown };
export type ConsumidorDeEvento = {
  nome: string;                                        // "rastreio" | "recuperar": vai para o log e para a coluna error
  eventos: readonly EventoYampi[];                     // quais eventos interessam
  ligado: (tenantId: string) => Promise<boolean>;      // o módulo está ligado nesta loja?
  consumir: (e: EventoParaConsumir) => Promise<unknown>;   // IDEMPOTENTE: a retentativa roda de novo, inclusive os que já deram certo
};
export const CONSUMIDORES: readonly ConsumidorDeEvento[] = [];
// processar.ts
export type DepsDoProcessador = {
  lerEvento: typeof lerEventoYampi; lerConexao: typeof lerConexaoYampiPorId;
  marcarProcessado: typeof marcarEventoProcessado; marcarErro: typeof marcarEventoComErro;
  consumidores: readonly ConsumidorDeEvento[];
};
export async function processarEventoYampi(eventoId: string, deps?: DepsDoProcessador): Promise<void>;   // deps: produção por padrão
```

Exemplo do que os outros planos acrescentam (documentação no comentário de `consumidores.ts`, não código): `{ nome: "rastreio", eventos: ["order.created", "order.paid", "order.status.updated"], ligado: rastreioLigado, consumir: (e) => registrarPedidoDaYampi(e.tenantId, e.recurso, "aviso") }`. O que o módulo recebe como `payload` do contrato do Rastreio é `e.recurso` (o `resource` do envelope); o envelope inteiro está em `e.payload`.

- [ ] **Step 1: Write the failing test** `processar.test.ts`, com `deps` em memória (sem rede, sem banco). Montagem: `mundo({ evento?, conexao?, consumidores })` devolve `{ deps, chamadas: string[] }`; `lerEvento` devolve um evento `order.paid` da loja `loja-a`/conexão `c1` com `payload` `ENVELOPE` (`{ event: "order.paid", time: "2026-10-29 10:00:00", merchant: { alias: "loja-exemplo" }, resource: { id: 42, customer: { phone: "5511999990000" } } }`); `marcarProcessado` e `marcarErro` empurram `"processado e1 <nota>"` / `"erro e1: <texto>"` em `chamadas`; `consumidor(nome, over, registro)` ouve `order.paid`, está `ligado` e empurra `nome` em `registro`.

```ts
test("sem consumidor nenhum: marca processado e mais nada", async () => {
  const { deps, chamadas } = mundo({ consumidores: [] });
  await processarEventoYampi("e1", deps);
  assert.deepEqual(chamadas, ["processado e1"]);
});
test("chama só os consumidores ligados que assinam o evento", async () => {
  const registro: string[] = [];
  const { deps } = mundo({ consumidores: [
    consumidor("a", {}, registro),
    consumidor("b", { eventos: ["cart.reminder"] }, registro),     // não assina
    consumidor("c", { ligado: async () => false }, registro),       // desligado na loja
  ] });
  await processarEventoYampi("e1", deps);
  assert.deepEqual(registro, ["a"]);
});
test("o consumidor recebe a loja, a conexão, o evento, o time e o recurso do envelope", async () => {
  const vistos: EventoParaConsumir[] = [];
  const { deps } = mundo({ consumidores: [consumidor("a", { consumir: async (e) => { vistos.push(e); } })] });
  await processarEventoYampi("e1", deps);
  const [visto] = vistos;
  assert.deepEqual([visto.tenantId, visto.evento, visto.time, visto.conexao.id], ["loja-a", "order.paid", "2026-10-29 10:00:00", "c1"]);
  assert.equal((visto.recurso as { id: number }).id, 42);
});
test("um consumidor que falha não impede o outro: o outro roda, o evento NÃO é marcado processado, o erro leva nome e mensagem, e a função lança", async () => {
  const registro: string[] = [];
  const { deps, chamadas } = mundo({ consumidores: [consumidor("a", { consumir: async () => { throw new Error("falha ao gravar pedido"); } }), consumidor("b", {}, registro)] });
  await assert.rejects(processarEventoYampi("e1", deps), /1 consumidor/);
  assert.deepEqual(registro, ["b"]);
  assert.deepEqual(chamadas, ["erro e1: a: falha ao gravar pedido"]);
});
test("só marca processado depois de todos os consumidores terminarem", async () => {
  const ordem: string[] = [];
  const lento = consumidor("lento", { consumir: async () => { await new Promise((r) => setTimeout(r, 20)); ordem.push("lento terminou"); } });
  const { deps } = mundo({ consumidores: [lento, consumidor("rapido", { consumir: async () => { ordem.push("rapido terminou"); } })] });
  deps.marcarProcessado = async () => { ordem.push("processado"); };
  await processarEventoYampi("e1", deps);
  assert.deepEqual(ordem, ["rapido terminou", "lento terminou", "processado"]);
});
test("evento já processado: ninguém é chamado; evento inexistente: nada acontece", ...);        // processedAt preenchido / lerEvento → null
test("avisos fora de ordem: paid antes de created chegam, cada um, ao consumidor, na ordem em que são processados, sem erro", ...);   // dois eventos (e2 order.paid, e1 order.created) → registro ["order.paid", "order.created"]
test("conexão desconectada, ausente ou de outra loja: marca processado com nota e não chama consumidor", ...);   // chamadas: ["processado e1 conexão ausente, desconectada ou de outra loja"]
test("o erro gravado não carrega o payload (nem o telefone)", async () => {
  const { deps, chamadas } = mundo({ consumidores: [consumidor("a", { consumir: async () => { throw new Error("falhou"); } })] });
  await assert.rejects(processarEventoYampi("e1", deps));
  assert.deepEqual(chamadas, ["erro e1: a: falhou"]);
  assert.doesNotMatch(chamadas.join("\n"), /5511999990000/);
});
```

- [ ] **Step 2: Run** `…--test src/lib/yampi/processar.test.ts`. Expected: FAIL (módulos não existem).
- [ ] **Step 3: Implement.** `processarEventoYampi`, nesta ordem: ler o evento (inexistente ou `processedAt` → `return`); ler a conexão por `connectionId` (ausente, `desconectada` ou `tenantId` diferente do evento → `marcarProcessado(tenantId, id, "conexão ausente, desconectada ou de outra loja")` e `return`); `lerEnvelope(evento.payload)` (falhou → `marcarProcessado` com nota `"envelope inválido"` e `return`: o aviso já foi validado ao entrar, então repetir não conserta); os consumidores que assinam `evento.event` rodam **em paralelo** (`Promise.allSettled`; cada um faz `ligado(tenantId)` e, se ligado, `consumir(...)`), então um que falha não impede os outros; sem falha → `marcarProcessado(tenantId, id)`; com falha → `marcarErro(tenantId, id, "<nome>: <mensagem>; …")`, `console.error` com **só o id do evento e os nomes** dos que falharam (a mensagem fica na coluna, não no log) e `throw new Error("yampi evento <id>: N consumidor(es) falharam")`. `depsDeProducao()` liga as stores da Task 4 e `CONSUMIDORES`; `import "server-only"`.
- [ ] **Step 4: Run** o mesmo comando. Expected: `# fail 0`.
- [ ] **Step 5: Mutante**: mover o `marcarProcessado` para antes do laço dos consumidores; "só marca processado depois de todos…" tem de falhar. Desfazer.
- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/lib/yampi/consumidores.ts apps/web/src/lib/yampi/processar.ts apps/web/src/lib/yampi/processar.test.ts
git commit -m "feat(yampi): idempotent event processor with a consumer registry" -m "Co-Authored-By: <modelo da sessão> <noreply@anthropic.com>"
```

---

### Task 6: Rota do aviso, allowlist e teto (fecha o PR 6)

**Files:**
- Create: `apps/web/src/app/api/integracoes/yampi/webhook/route.ts`
- Modify: `apps/web/src/lib/security/request-access-policy.ts` (`PROVIDER_WEBHOOKS`), `apps/web/src/middleware.ts` (`RATE_LIMITS`)
- Test: `apps/web/src/app/api/integracoes/yampi/webhook/route.test.ts`, `apps/web/src/lib/security/request-access-policy.test.ts`

**Interfaces:**
- Consumes: `assinaturaYampiConfere`, `lerEnvelope`, `chaveDeDedupe`, `LIMITE_CORPO_AVISO` (Task 3); `lerConexaoYampiPorId`, `atualizarConexaoYampi`, `gravarEventoYampi` (Task 4); `abrirSegredoDoAviso` (Task 2); `chaveDeIntegracoes`; `processarEventoYampi` (Task 5).
- Produces: `export async function POST(req: Request): Promise<Response>` com `runtime = "nodejs"`, `dynamic = "force-dynamic"`, `maxDuration = 60`. Respostas: 200 `{ok:true}`; 401 `{error:"assinatura"}`; 413 `{error:"corpo grande demais"}`; 500 `{error:"tente de novo"}`; 503 `{error:"indisponivel"}`.

- [ ] **Step 1: Write the failing tests.** Antes, ler o guia de `after` em `apps/web/node_modules/next/dist/docs/` (AGENTS.md do `apps/web`); a rota segue `app/api/integracoes/bling/webhook/route.ts` e o teste copia o harness de `route.test.ts` dele (servidor falso do PostgREST que registra as chamadas; `AsyncLocalStorage` no global **antes** do `import` da rota; `workAsyncStorage.run` com um `afterContext` que só coleta as tarefas). Diferenças: o falso responde `GET /rest/v1/yampi_connections` (a conexão do `?c`), `POST /rest/v1/yampi_events` (`[{id:"e1"}]`, ou `[]` quando o teste pede repetição, ou 500), `PATCH /rest/v1/yampi_connections`, e — para a tarefa do `after()` — `GET`/`PATCH /rest/v1/yampi_events`. A conexão tem o segredo selado com `selar("segredo-do-aviso", contextoDoSegredo("loja-a", "webhook_secret"), CHAVE)`; `beforeEach` põe `INTEGRATIONS_ENCRYPTION_KEY`.

```ts
const URL_DO_AVISO = (c = CONEXAO_ID) => `http://girumo.test/api/integracoes/yampi/webhook?c=${c}`;
const assinado = (corpo: Corpo, segredo = SEGREDO, c = CONEXAO_ID) =>
  new Request(URL_DO_AVISO(c), { method: "POST", headers: { "x-yampi-hmac-sha256": createHmac("sha256", segredo).update(corpo).digest("base64") }, body: corpo });
const aviso = (extra = {}) => JSON.stringify({ event: "order.paid", time: "2026-10-29 10:00:00", merchant: { id: 1, alias: "loja-exemplo" }, resource: { id: 42, customer: { phone: "5511999990000", pix_qr_code: "000201PIXSECRETO" } }, ...extra });

test("assinatura errada, malformada ou ausente: 401 e só a leitura da conexão vai ao banco", async (t) => {
  t.mock.method(console, "warn", () => {});
  const corpo = aviso();
  const certa = createHmac("sha256", SEGREDO).update(corpo).digest("base64");
  for (const cab of [createHmac("sha256", "outro-segredo").update(corpo).digest("base64"), certa.slice(0, 20), "", null]) {
    const r = await POST(new Request(URL_DO_AVISO(), { method: "POST", headers: cab === null ? {} : { "x-yampi-hmac-sha256": cab }, body: corpo }));
    assert.equal(r.status, 401, String(cab));
  }
  assert.deepEqual([...new Set(banco.map((c) => `${c.metodo} ${c.url.pathname}`))], ["GET /rest/v1/yampi_connections"]);
  assert.equal(tarefasDepois.length, 0);
});
test("assinatura de outra conexão no ?c errado: 401", async () => {
  /* o falso responde a conexão cujo id vem em `id=eq.…`: A (CONEXAO_ID, segredo SEGREDO) e B (OUTRA_ID, outro segredo selado) */
  assert.equal((await POST(assinado(aviso(), SEGREDO, OUTRA_ID))).status, 401);       // assinado com o segredo da A, enviado para a B
  assert.equal((await POST(assinado(aviso(), SEGREDO, CONEXAO_ID))).status, 200);
});
test("conexão desconhecida, desconectada ou sem segredo, ou ?c que não é uuid: 401 — o ?c inválido nem consulta o banco", ...);
test("corpo acima do limite: 413 pelo content-length (sem ler o corpo) e pelo tamanho lido; no limite, entra", ...);   // LIMITE_CORPO_AVISO + 1; bodyUsed false
test("sem a chave de cifra: 503 e o banco não é tocado", ...);
test("alias do envelope diferente do da conexão, mesmo com a assinatura certa: 401 e nada gravado; maiúsculas não contam", async () => {
  assert.equal((await POST(assinado(aviso({ merchant: { id: 1, alias: "outra-loja" } })))).status, 401);
  assert.equal((await POST(assinado(aviso({ merchant: { id: 1, alias: "LOJA-EXEMPLO" } })))).status, 200);
  assert.equal(banco.filter((c) => c.metodo === "POST" && c.url.pathname === "/rest/v1/yampi_events").length, 1);
});
test("assinado mas fora dos cinco eventos, ou JSON quebrado: 200 e nada gravado", ...);   // "product.updated" → 200; "{não é json" → 200 + console.error sem o corpo
test("aviso válido: grava (tenant, conexão, event, resource_id, dedupe_key, payload), marca last_event_at, responde 200 e agenda o processamento", async () => {
  const r = await POST(assinado(aviso()));
  assert.equal(r.status, 200); assert.deepEqual(await r.json(), { ok: true });
  const [gravacao] = banco.filter((c) => c.metodo === "POST" && c.url.pathname === "/rest/v1/yampi_events");
  assert.deepEqual(Object.keys(gravacao.corpo as object).sort(), ["connection_id", "dedupe_key", "event", "payload", "resource_id", "tenant_id"]);
  assert.match((gravacao.corpo as { dedupe_key: string }).dedupe_key, new RegExp(`^${CONEXAO_ID}:[0-9a-f]{64}$`));
  const patch = banco.find((c) => c.metodo === "PATCH" && c.url.pathname === "/rest/v1/yampi_connections");
  assert.equal(patch?.url.searchParams.get("tenant_id"), "eq.loja-a");
  assert.equal(tarefasDepois.length, 1);
});
test("responde sem esperar o processamento: nada além da gravação acontece antes do after()", async () => {
  await POST(assinado(aviso()));
  assert.equal(banco.filter((c) => c.url.pathname === "/rest/v1/yampi_events" && c.metodo === "PATCH").length, 0);
  await (tarefasDepois[0] as () => Promise<void>)();      // roda o after(): lê o evento e o marca processado (nenhum consumidor)
  assert.equal(banco.filter((c) => c.url.pathname === "/rest/v1/yampi_events" && c.metodo === "PATCH").length, 1);
});
test("aviso repetido (o banco ignora a dedupe_key): 200 e nada agendado", ...);
test("banco fora ao gravar: 500, sem agendar e sem marcar last_event_at", ...);
test("a assinatura vale sobre os bytes crus: corpo com BOM confere", ...);
test("o log nunca leva corpo, telefone, código Pix nem segredo", async (t) => {
  const logs = [t.mock.method(console, "warn", () => {}), t.mock.method(console, "error", () => {})];
  /* três cenários: 401 por assinatura; corpo assinado que não é JSON (`{corpo-quebrado-secreto`); banco fora ao gravar um aviso válido */
  const logado = logs.flatMap((l) => l.mock.calls.map((c) => c.arguments.join(" "))).join("\n");
  assert.doesNotMatch(logado, /5511999990000|PIXSECRETO|segredo-do-aviso|corpo-quebrado-secreto/);
  assert.match(logado, new RegExp(CONEXAO_ID));       // o id da conexão (e o nome do evento) podem aparecer
});
```

`request-access-policy.test.ts` — acrescentar, no estilo dos testes do Bling:

```ts
test("o aviso da Yampi entra sem sessão, só no POST e só no path exato", () => {
  assert.equal(classifyRequest("/api/integracoes/yampi/webhook", "POST"), "webhook");
  assert.equal(classifyRequest("/api/integracoes/yampi/webhook", "GET"), "user");
  assert.equal(classifyRequest("/api/integracoes/yampi/webhook/outra", "POST"), "user");
  // O resto da família é chamada do painel, com Bearer: continua no gate de sessão.
  assert.equal(classifyRequest("/api/integracoes/yampi", "POST"), "user");
  assert.equal(classifyRequest("/api/integracoes/yampi/testar", "POST"), "user");
});
```

e incluir `"/api/integracoes/yampi/webhook"` na lista `conhecida` do teste estrutural "toda rota pública com teto…" e uma linha para ele em "o secret da Evolution não tira do teto as outras rotas de webhook".

- [ ] **Step 2: Run** `…--test src/app/api/integracoes/yampi/webhook/route.test.ts src/lib/security/request-access-policy.test.ts`. Expected: FAIL (rota inexistente; `classifyRequest` devolve `"user"` para o webhook).
- [ ] **Step 3: Implement a rota**, nesta ordem (a ordem é parte do contrato: nada de banco antes de checar o tamanho e o `c`; HMAC antes de decodificar o JSON):
  1. `content-length` > `LIMITE_CORPO_AVISO` → 413 sem ler.
  2. `c` = `new URL(req.url).searchParams.get("c")`; `z.uuid().safeParse(c)` falhou → 401.
  3. `chaveDeIntegracoes()` nula → 503 + `console.error` (sem banco).
  4. `new Uint8Array(await req.arrayBuffer())`; acima do limite → 413.
  5. `lerConexaoYampiPorId(c)`: ausente, `desconectada` ou sem `webhookSecretSelado` → 401; lançou → 500.
  6. `abrirSegredoDoAviso`; lançou → 500 + `console.error` sem o segredo.
  7. `assinaturaYampiConfere(corpo, req.headers.get("x-yampi-hmac-sha256"), segredo)` falso → 401 + `console.warn("[yampi/webhook] assinatura não confere (conexão <id>)")`.
  8. JSON do corpo decodificado em UTF-8 (só agora; o decodificador tira o BOM que entrou no HMAC); inválido → 200 + `console.error` sem o corpo (4xx repetido faz a Yampi desligar o aviso).
  9. `lerEnvelope`: `!ok` → 200 + `console.warn` com o motivo.
  10. `envelope.alias` ≠ `conexao.alias` (sem diferença de caixa) → 401.
  11. `gravarEventoYampi({ tenantId: conexao.tenantId, connectionId: conexao.id, event, resourceId: envelope.recursoId, dedupeKey: chaveDeDedupe(conexao.id, corpo), payload: json })`; lançou → 500 `{error:"tente de novo"}` + `console.error` com só o id da conexão e o evento.
  12. Gravou (`!== null`): `atualizarConexaoYampi(conexao.tenantId, { last_event_at: agora })` (falhou → `console.warn`, segue) e `after(async () => { try { await processarEventoYampi(id) } catch { console.error("[yampi/webhook] evento <id> ficou para o cron") } })`. Repetido: não agenda.
  13. 200 `{ ok: true }`.

  **Policy e middleware**: `PROVIDER_WEBHOOKS` ganha `"POST /api/integracoes/yampi/webhook"` (comentário: sem sessão, quem autentica é o HMAC do corpo cru com o segredo da conexão do `?c`); `RATE_LIMITS` ganha `"/api/integracoes/yampi/webhook": 300` (comentário igual ao do Bling: o gate real é o HMAC; a Yampi manda de poucos IPs para todas as lojas, então é teto do volume somado).
- [ ] **Step 4: Run** o mesmo comando. Expected: `# fail 0`. (Entre acrescentar a rota à policy e acrescentar o teto ao middleware, o teste estrutural "toda rota pública com teto…" fica vermelho — é a trava funcionando.)
- [ ] **Step 5: Mutantes**: (a) apagar a checagem do alias → "alias do envelope diferente…" falha; (b) trocar `assinaturaYampiConfere(...)` por `true` → "assinatura errada…" e "assinatura de outra conexão…" falham; (c) tirar a entrada do `RATE_LIMITS` → o teste estrutural falha. Desfazer.
- [ ] **Step 6: Types e commit** — `npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.json` (Expected: sem saída).

```powershell
git add apps/web/src/app/api/integracoes/yampi/webhook apps/web/src/lib/security/request-access-policy.ts apps/web/src/lib/security/request-access-policy.test.ts apps/web/src/middleware.ts
git commit -m "feat(yampi): signed webhook route, session-less allowlist and rate-limit entry" -m "Co-Authored-By: <modelo da sessão> <noreply@anthropic.com>"
```

- [ ] **Step 7: Fechar o PR 6** (seção "Fechamento de cada PR"; título sugerido: `feat(yampi): signed webhook intake and event processor`). Antes do PR 6b: `git worktree add -b feat/yampi-cliente …\yampi-cliente origin/main` (mais as duas junctions).

---

### Task 7: Cliente HTTP da Yampi

**Files:**
- Create: `apps/web/src/lib/yampi/cliente.ts`
- Test: `apps/web/src/lib/yampi/cliente.test.ts`

**Interfaces:**
- Consumes: `lerAlias` (Task 2); `lerTextoComTeto` e `TETO_RESPOSTA_BYTES` de `@/lib/bling/cliente` (reuso: lê o corpo aos pedaços e para no teto — não duplicar).
- Produces:

```ts
export const YAMPI_API_BASE = "https://api.dooki.com.br/v2";
export class YampiErro extends Error { readonly status: number /* 0 = sem resposta */; readonly retryAfterMs: number | null; constructor(status: number, mensagem: string, retryAfterMs?: number | null) }
export type Query = Record<string, string | number>;
export type ClienteYampi = {
  get<T>(caminho: string, query?: Query): Promise<T>;
  post<T>(caminho: string, corpo: unknown): Promise<T>;
  apagar(caminho: string): Promise<void>;
};
export type OpcoesClienteYampi = {
  alias: string; token: string; secretKey: string;
  fetchImpl?: typeof fetch; esperar?: (ms: number) => Promise<void>; agora?: () => number;
  bloqueios?: Map<string, number>;     // alias → epoch ms até quando não chamar; padrão: um Map do módulo
};
export function criarClienteYampi(o: OpcoesClienteYampi): ClienteYampi;      // lança YampiErro(0) se o alias não passa em lerAlias
```

- [ ] **Step 1: Write the failing test.** Montagem: `cliente(respostas: Array<Response | Error>, over?)` devolve `{ c, pedidos, esperas }`; o `fetchImpl` falso empurra `{ url: string, init: RequestInit & { headers: Record<string, string> } }` em `pedidos` (o cliente manda os cabeçalhos num objeto simples) e consome `respostas`; `esperar` empurra em `esperas` e adianta o relógio falso (`agora`); cada teste leva um `bloqueios: new Map()` novo. `json(corpo, status = 200, cabecalhos = {})` monta um `Response`.

```ts
test("get monta a URL com o alias e a consulta, manda User-Token e User-Secret-Key e não segue redirecionamento", async () => {
  const { c, pedidos } = cliente([json({ data: [] })]);
  await c.get("/orders", { limit: 1 });
  assert.equal(pedidos[0].url, "https://api.dooki.com.br/v2/loja-exemplo/orders?limit=1");
  assert.deepEqual([pedidos[0].init.headers["User-Token"], pedidos[0].init.headers["User-Secret-Key"], pedidos[0].init.redirect], [TOKEN, CHAVE_SECRETA, "error"]);
});
test("alias fora da regra nunca chega ao fetch", () => {
  let chamadas = 0;
  const fetchImpl = (async () => { chamadas += 1; return new Response("{}"); }) as typeof fetch;
  for (const alias of ["../x", "a/b", "a?b", ""]) {
    assert.throws(() => criarClienteYampi({ alias, token: TOKEN, secretKey: CHAVE_SECRETA, fetchImpl }), (e) => e instanceof YampiErro && e.status === 0);
  }
  assert.equal(chamadas, 0);
});
test("401 e 404 não repetem: YampiErro com o status", ...);        // um pedido só
test("429 com Retry-After espera e repete uma vez; o segundo 429 vira YampiErro 429", async () => {
  const { c, esperas, pedidos } = cliente([json({}, 429, { "retry-after": "1" }), json({ data: [1] })]);
  assert.deepEqual(await c.get("/orders"), { data: [1] });
  assert.deepEqual(esperas, [1000]); assert.equal(pedidos.length, 2);
  const outro = cliente([json({}, 429, { "retry-after": "1" }), json({}, 429, { "retry-after": "1" })]);
  await assert.rejects(outro.c.get("/orders"), (e) => e instanceof YampiErro && e.status === 429);
});
test("Retry-After acima de 10 s: não espera, YampiErro 429 na hora com retryAfterMs", async () => {
  const { c, esperas } = cliente([json({}, 429, { "retry-after": "30" })]);
  await assert.rejects(c.get("/orders"), (e) => e instanceof YampiErro && e.status === 429 && e.retryAfterMs === 30_000);
  assert.deepEqual(esperas, []);
});
test("X-RateLimit-Remaining 0 adia a chamada seguinte até o fim da janela (Retry-After, ou 60 s sem ele)", async () => {
  const { c, esperas } = cliente([json({ data: [] }, 200, { "x-ratelimit-remaining": "0", "retry-after": "2" }), json({ data: [] })]);
  await c.get("/orders"); await c.get("/orders");
  assert.deepEqual(esperas, [2000]);
  /* sem Retry-After: a janela é de 60 s, maior que 10 s → a segunda chamada lança YampiErro 429 sem esperar */
});
test("5xx e rede: duas novas tentativas (1 s e 3 s); depois YampiErro com o status, ou 0 sem resposta", async () => {
  const { c, esperas } = cliente([json({}, 500), json({}, 502), json({ ok: 1 })]);
  assert.deepEqual(await c.get("/x"), { ok: 1 }); assert.deepEqual(esperas, [1000, 3000]);
  const rede = cliente([new TypeError("fetch failed"), new TypeError("fetch failed"), new TypeError("fetch failed")]);
  await assert.rejects(rede.c.get("/x"), (e) => e instanceof YampiErro && e.status === 0);
});
test("o erro nunca carrega token, chave nem o corpo da resposta, e a mensagem não leva a consulta", async () => {
  const rede = cliente([1, 2, 3].map(() => new TypeError(`Invalid header value: ${TOKEN}`)));
  const erro = await rede.c.get("/orders", { search: "fulana@exemplo.com" }).catch((e: Error) => e);
  assert.doesNotMatch(erro.message, new RegExp(`${TOKEN}|fulana`));
  const corpo500 = cliente([json({ email: "fulana@exemplo.com" }, 500), json({}, 500), json({}, 500)]);
  assert.doesNotMatch((await corpo500.c.get("/orders").catch((e: Error) => e)).message, /fulana/);
});
test("post manda JSON; apagar aceita 204; resposta que não é JSON vira YampiErro 502", ...);
```

- [ ] **Step 2: Run** `…--test src/lib/yampi/cliente.test.ts`. Expected: FAIL (módulo não existe).
- [ ] **Step 3: Implement** `cliente.ts` (sem `server-only`; `fetch`, relógio e espera são injetáveis; padrão `fetchImpl ?? fetch` lido na hora da chamada). Regras que o teste fixa e a assinatura não: cabeçalhos `User-Token`, `User-Secret-Key`, `Accept: application/json` (e `Content-Type: application/json` no `post`) num objeto simples; `redirect: "error"`; timeout de 10 s por chamada (`AbortSignal.timeout`); corpo lido por `lerTextoComTeto`; **antes** de cada chamada, se `bloqueios.get(alias) - agora()` > 0: ≤ 10 s → `esperar`, > 10 s → `YampiErro(429, …, espera)` sem chamar; **depois** de cada resposta, `X-RateLimit-Remaining` ≤ 0 grava o bloqueio em `agora() + (Retry-After em ms ?? 60_000)`; 429: espera o `Retry-After` (padrão 2 s) e repete **uma** vez, e `Retry-After` > 10 s lança na hora; 5xx e falha de rede: novas tentativas após 1 s e 3 s; 4xx (inclui 401, 403, 404, 422): sem nova tentativa. Mensagens fixas: `Yampi: HTTP <status> em <caminho sem consulta>` e `Yampi: sem resposta em <caminho sem consulta>` — nunca o erro do `fetch` (o undici cita o valor do cabeçalho, ou seja, o token), nunca o corpo. A espera do 429 e o bloqueio por `Remaining` usam o mesmo relógio: depois de esperar não se espera de novo. `// ponytail: a contagem é por instância; quem decide é o servidor, pelo cabeçalho`.
- [ ] **Step 4: Run** o mesmo comando. Expected: `# fail 0`.
- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/lib/yampi/cliente.ts apps/web/src/lib/yampi/cliente.test.ts
git commit -m "feat(yampi): HTTP client with rate-limit and retry handling" -m "Co-Authored-By: <modelo da sessão> <noreply@anthropic.com>"
```

---

### Task 8: `yampiGet`, 401 → credencial inválida com aviso no sino, `conexaoYampiAtiva`

**Files:**
- Create: `apps/web/src/lib/yampi/credencial-invalida.ts`, `apps/web/src/lib/yampi/api.ts`, `apps/web/src/lib/yampi/conexao.ts`, `apps/web/src/test/yampi-falso.ts`
- Test: `apps/web/src/lib/yampi/credencial-invalida.test.ts`, `apps/web/src/lib/yampi/api.test.ts`, `apps/web/src/lib/yampi/conexao.test.ts`

**Interfaces:**
- Consumes: `criarClienteYampi`, `YampiErro`, `Query` (Task 7); `abrirCredenciais` (Task 2); `marcarCredencialInvalidaNoBanco`, `lerConexaoYampi` (Task 4); `chaveDeIntegracoes`; tabela `notifications` (`tenant_id, type, title, body, href, read_at`).
- Produces:

```ts
// credencial-invalida.ts — nunca lança (roda no caminho do erro)
export async function marcarCredencialInvalida(tenantId: string): Promise<void>;
// api.ts — o contrato do índice
export { YampiErro } from "./cliente";
export async function yampiGet<T>(conexao: ConexaoYampi, caminho: string, query?: Record<string, string | number>): Promise<T>;
export async function yampiPost<T>(conexao: ConexaoYampi, caminho: string, corpo: unknown): Promise<T>;
export async function yampiApagar(conexao: ConexaoYampi, caminho: string): Promise<void>;
// conexao.ts
export async function conexaoYampiAtiva(tenantId: string): Promise<ConexaoYampi | null>;   // "ativa" ou "aviso_desativado"; senão null
```

`marcarCredencialInvalida`: `marcarCredencialInvalidaNoBanco(tenantId, "A Yampi recusou o acesso (credencial inválida).")`; se mudou, procura em `notifications` um não lido da loja com o mesmo `title` e, se não houver, insere `{ tenant_id, type: "error", title: "A Yampi recusou o acesso", body: "Troque o token e a chave em Configurações › Integrações para voltar a receber os pedidos.", href: "/painel/configuracoes?secao=integracoes" }`. Falha do banco vira `console.error` com o id da loja.

`api.ts`, interno: `comCliente(conexao, fn)`: conexão `credencial_invalida` ou `desconectada` → `throw new YampiErro(401, "Yampi: conexão sem credencial válida")` **sem** chamar a Yampi nem o banco; sem `chaveDeIntegracoes()` → `Error("Yampi indisponível: INTEGRATIONS_ENCRYPTION_KEY ausente")`; senão abre as credenciais, cria o cliente e roda; `YampiErro` de status 401 → `await marcarCredencialInvalida(conexao.tenantId)` e relança.

- [ ] **Step 1: Criar o mundo falso** `src/test/yampi-falso.ts` (modelo: `src/test/bling-cartao-falso.ts`, que o `route.test.ts` do Bling usa). É o único arquivo de suporte; as Tasks 9 e 11 o reusam. Contrato:

```ts
export const TENANT = "loja-b", ALIAS = "loja-exemplo", CONEXAO_ID = "4f8c2d1e-9b3a-4c7d-8e5f-1a2b3c4d5e6f";
export const CHAVE = Buffer.alloc(32, 7), ENV = { INTEGRATIONS_ENCRYPTION_KEY: CHAVE.toString("base64"), NEXT_PUBLIC_APP_URL: "https://app.girumo.test", CRON_SECRET: "segredo-do-cron-com-mais-de-24-caracteres" };
export const TOKEN = ["Zk3pQ9vL2x", "W8cR5tN7mB4y"].join(""), CHAVE_SECRETA = ["h6jD1fG0aS", "e2uV7oK9nT3q"].join("");
export type RespostaFalsa = [status: number, corpo: unknown, cabecalhos?: Record<string, string>];
export type EstadoYampiFalso = {
  papel: () => string;                                            // papel do usuário logado por Bearer; padrão "owner"
  tenant?: () => string;                                          // loja do usuário; padrão TENANT. Testes de rota usam uma loja distinta por teste (o teto de 5/min é por loja)
  banco: () => Record<string, RespostaFalsa | RespostaFalsa[]>;   // "GET /rest/v1/yampi_connections" → resposta; lista = em sequência, a última se repete
  yampi: () => Record<string, RespostaFalsa | RespostaFalsa[]>;   // "GET /loja-exemplo/orders" → resposta (host api.dooki.com.br)
  chamadas: Chamada[];                                            // PostgREST, na ordem: { metodo, url, corpo }
  chamadasYampi: ChamadaYampi[];                                  // { metodo, caminho, consulta, cabecalhos, corpo }
  linhaDoTempo: string[];                                         // "db GET yampi_connections" / "yampi POST /loja-exemplo/webhooks": a ordem entre os dois mundos
};
export function servirYampi(estado: EstadoYampiFalso): void;      // liga before/after no arquivo de teste
export function linhaDaConexao(over?: Record<string, unknown>, tenant?: string): Record<string, unknown>;   // yampi_connections com token, chave e segredo do aviso SELADOS para `tenant` (padrão TENANT)
```

  `servirYampi`: servidor HTTP falso do PostgREST que responde `/auth/v1/user` (`{id:"usuario-1"}`) e `/rest/v1/memberships` (`[{tenant_id: tenant(), role: papel(), modules: []}]`) além do `banco()`; `globalThis.fetch` trocado por um que responde `https://api.dooki.com.br/v2/` pelo `yampi()` e repassa o resto ao fetch original; `after` restaura. Rota sem resposta combinada → 500 `{message: "inesperado: <rota>"}`.
- [ ] **Step 2: Write the failing tests.**

```ts
// api.test.ts (servirYampi; banco: GET yampi_connections, PATCH yampi_connections, GET/POST notifications)
test("yampiGet abre as credenciais seladas, chama a Yampi com os cabeçalhos e devolve o JSON", async () => {
  yampi = { "GET /loja-exemplo/orders": [200, { data: [{ id: 1 }] }] };
  assert.deepEqual(await yampiGet(conexao(), "/orders", { limit: 1 }), { data: [{ id: 1 }] });
  assert.deepEqual([estado.chamadasYampi[0].cabecalhos["user-token"], estado.chamadasYampi[0].consulta.get("limit")], [TOKEN, "1"]);
});
test("401 marca a conexão como credencial_invalida, avisa no sino uma vez e lança YampiErro 401; a conexão relida nem chega à Yampi", async () => {
  banco = { ...base, "PATCH /rest/v1/yampi_connections": [[200, [{ tenant_id: TENANT }]], [200, []]], "GET /rest/v1/notifications": [200, []], "POST /rest/v1/notifications": [201, []] };
  yampi = { "GET /loja-exemplo/orders": [401, { message: "Unauthenticated." }] };
  await assert.rejects(yampiGet(conexao(), "/orders"), (e) => e instanceof YampiErro && e.status === 401);
  const sino = estado.chamadas.filter((c) => c.metodo === "POST" && c.url.pathname === "/rest/v1/notifications").map((c) => c.corpo as { tenant_id: string; type: string; title: string; href: string });
  assert.deepEqual(sino.map((n) => [n.tenant_id, n.type, n.title, n.href]), [[TENANT, "error", "A Yampi recusou o acesso", "/painel/configuracoes?secao=integracoes"]]);
  // 401 repetido com a conexão velha em memória: o PATCH condicional não muda nada e o sino não repete
  await assert.rejects(yampiGet(conexao(), "/orders"));
  assert.equal(estado.chamadas.filter((c) => c.metodo === "POST" && c.url.pathname === "/rest/v1/notifications").length, 1);
  // a conexão relida (já inválida) nem sai
  const antes = estado.chamadasYampi.length;
  await assert.rejects(yampiGet(conexao({ status: "credencial_invalida" }), "/orders"), (e) => e instanceof YampiErro && e.status === 401);
  assert.equal(estado.chamadasYampi.length, antes);
});
test("conexão credencial_invalida ou desconectada: YampiErro 401 sem chamar a Yampi nem o banco", ...);
test("404 e 500 não marcam a conexão", ...);                 // nenhum PATCH em yampi_connections
test("sem a chave de cifra: lança sem chamar a Yampi", ...);
test("yampiPost manda o corpo em JSON e yampiApagar chama DELETE", ...);
// credencial-invalida.test.ts
test("aviso não lido igual já existe: não insere de novo", ...);   // GET notifications → [{id}] ; nenhum POST
test("falha do banco no sino não lança e vai para o log com o id da loja", ...);
// conexao.test.ts
test("conexaoYampiAtiva devolve ativa e aviso_desativado; credencial_invalida, desconectada e sem linha devolvem null", ...);
```

- [ ] **Step 3: Run** `…--test src/lib/yampi/credencial-invalida.test.ts src/lib/yampi/api.test.ts src/lib/yampi/conexao.test.ts`. Expected: FAIL (módulos não existem).
- [ ] **Step 4: Implement** os três arquivos (`import "server-only"`). `conexaoYampiAtiva` = `lerConexaoYampi(tenantId)` filtrado por status.
- [ ] **Step 5: Run** o mesmo comando. Expected: `# fail 0`.
- [ ] **Step 6: Mutante**: não chamar `marcarCredencialInvalida` no 401 → "401 marca a conexão…" falha. Desfazer.
- [ ] **Step 7: Commit**

```powershell
git add apps/web/src/test/yampi-falso.ts apps/web/src/lib/yampi/credencial-invalida.ts apps/web/src/lib/yampi/credencial-invalida.test.ts apps/web/src/lib/yampi/api.ts apps/web/src/lib/yampi/api.test.ts apps/web/src/lib/yampi/conexao.ts apps/web/src/lib/yampi/conexao.test.ts
git commit -m "feat(yampi): yampiGet and friends, 401 invalidates the connection with a bell notice" -m "Co-Authored-By: <modelo da sessão> <noreply@anthropic.com>"
```

---

### Task 9: O aviso na Yampi: criar, conferir e recriar

**Files:**
- Create: `apps/web/src/lib/yampi/webhooks.ts`, `apps/web/src/lib/yampi/conferir.ts`
- Test: `apps/web/src/lib/yampi/webhooks.test.ts`, `apps/web/src/lib/yampi/conferir.test.ts`

**Interfaces:**
- Consumes: `yampiGet`, `yampiPost`, `yampiApagar`, `YampiErro` (Task 8); `salvarAvisoYampi`, `atualizarConexaoYampi`, `lerConexaoYampi` (Task 4); `contextoDoSegredo` (Task 2); `selar`, `chaveDeIntegracoes`; `getAppUrl` de `@/lib/environment`; `EVENTOS_YAMPI`.
- Produces:

```ts
// webhooks.ts
export const NOME_DO_AVISO = "Girumo";
export function urlDoAviso(conexaoId: string): string;       // `${getAppUrl()}/api/integracoes/yampi/webhook?c=${conexaoId}`
export type AvisoNaYampi = { id: string; url: string; ativo: boolean };      // ativo = active !== false e sem disabled_at
export async function listarAvisosDaYampi(c: ConexaoYampi): Promise<AvisoNaYampi[]>;      // GET /webhooks?limit=100
export type EstadoDoAviso = "ativo" | "desativado" | "ausente";
export function estadoDoAviso(lista: readonly AvisoNaYampi[], c: Pick<ConexaoYampi, "webhookId">): EstadoDoAviso;   // pelo id guardado: só o aviso cujo segredo temos conta
export async function apagarAvisosDaNossaUrl(c: ConexaoYampi): Promise<void>;             // lista, apaga os da nossa rota + ?c (qualquer host), ignora 404
export async function recriarAviso(c: ConexaoYampi): Promise<void>;                       // apaga os nossos, cria, valida, grava id + segredo selado, status ativa; lança se falhar
// conferir.ts
export type ResultadoDaConferencia = { credenciais: "ok" | "invalida" | "erro"; aviso: "ativo" | "recriado" | "falhou" | "desconhecido" };
export async function conferirConexao(tenantId: string): Promise<ResultadoDaConferencia | null>;   // null = sem conexão ou desconectada
```

- [ ] **Step 1: Write the failing tests** (`servirYampi`; fixtures `webhooks-lista.json` e `webhook-criado.json` da Fase 0 como corpos):

```ts
// webhooks.test.ts
test("estadoDoAviso: ativo, desativado (active:false e disabled_at) e ausente (id fora da lista), ignorando avisos de outra URL", () => {
  const lista = [{ id: "7", url: urlDoAviso(CONEXAO_ID), ativo: true }, { id: "8", url: "https://outro.exemplo/x", ativo: true }];
  assert.equal(estadoDoAviso(lista, { webhookId: "7" }), "ativo");
  assert.equal(estadoDoAviso([{ ...lista[0], ativo: false }], { webhookId: "7" }), "desativado");
  assert.equal(estadoDoAviso(lista, { webhookId: "9" }), "ausente");
  assert.equal(estadoDoAviso(lista, { webhookId: null }), "ausente");
});
test("listarAvisosDaYampi lê data[] e traduz active/disabled_at em ativo", ...);          // webhooks-lista.json (o ativo) e, se existir, webhooks-lista-desativado.json; sem ela, o desativado é o da doc (active: false)
test("recriarAviso apaga os avisos da nossa rota (até os de outro host), cria um com os cinco eventos e a URL da conexão e grava id e segredo selado", async () => {
  /* GET /webhooks → [nosso em https://app.hubflow.com.br/api/integracoes/yampi/webhook?c=<id>, nosso atual, de outro ?c, de outro sistema]
     DELETE só nos dois nossos; POST /webhooks → webhook-criado.json */
  assert.deepEqual(estado.chamadasYampi.filter((c) => c.metodo === "DELETE").map((c) => c.caminho), ["/loja-exemplo/webhooks/11", "/loja-exemplo/webhooks/12"]);
  assert.deepEqual(estado.chamadasYampi.find((c) => c.metodo === "POST")?.corpo, { name: "Girumo", url: urlDoAviso(CONEXAO_ID), events: [...EVENTOS_YAMPI] });
  const salvo = estado.chamadas.find((c) => c.metodo === "PATCH" && c.url.pathname === "/rest/v1/yampi_connections")?.corpo as { webhook_id: string; webhook_secret: string; status: string };
  assert.equal(salvo.status, "ativa");
  assert.equal(salvo.webhook_id, String(ID_DA_FIXTURE));                                                                   // data.id de webhook-criado.json
  assert.notEqual(salvo.webhook_secret, SECRET_KEY_DA_FIXTURE);                                                           // nunca em texto
  assert.equal(abrir(salvo.webhook_secret, contextoDoSegredo(TENANT, "webhook_secret"), CHAVE), SECRET_KEY_DA_FIXTURE);   // data.secret_key, selado para a loja
});
test("recriarAviso: resposta sem secret_key apaga o aviso criado e lança; falha ao gravar também apaga o criado", ...);
// conferir.test.ts
test("conferirConexao: aviso ativo só atualiza last_check_at e limpa o erro; nada é recriado", ...);
test("conferirConexao: aviso desativado (a Yampi desliga depois de 30 falhas) ou ausente é recriado", ...);   // resultado { credenciais: "ok", aviso: "recriado" }
test("conferirConexao: falha ao recriar vira aviso_desativado com last_error escrito e resultado aviso: falhou", ...);
test("conferirConexao: 401 vira credencial inválida (a conexão é marcada e o sino avisa)", ...);   // { credenciais: "invalida", aviso: "desconhecido" }
test("conferirConexao: Yampi fora grava last_error e last_check_at e mantém o status", ...);        // { credenciais: "erro", aviso: "desconhecido" }
test("conferirConexao: credencial_invalida não chama a Yampi; sem conexão ou desconectada devolve null", ...);
```

- [ ] **Step 2: Run** `…--test src/lib/yampi/webhooks.test.ts src/lib/yampi/conferir.test.ts`. Expected: FAIL (módulos não existem).
- [ ] **Step 3: Implement.** `recriarAviso`, em ordem: `apagarAvisosDaNossaUrl(c)`; `yampiPost(c, "/webhooks", { name: NOME_DO_AVISO, url: urlDoAviso(c.id), events: [...EVENTOS_YAMPI] })`; ler `data.id` e `data.secret_key` com zod (resposta sem `secret_key` ou sem `id` → apagar o criado, quando houver id, e lançar `Error("Yampi: o aviso criado não trouxe segredo")`); `selar(secret_key, contextoDoSegredo(c.tenantId, "webhook_secret"), chave)` e `salvarAvisoYampi`; se a gravação falhar, tentar apagar o criado e relançar. Um aviso é "nosso" quando o `pathname` da URL é `/api/integracoes/yampi/webhook` e o `c` é o id da conexão (o host não conta: sobrevive à troca de domínio). `conferirConexao`: `lerConexaoYampi`; sem linha/`desconectada` → `null`; `credencial_invalida` → `{invalida, desconhecido}` sem chamar a Yampi; `listarAvisosDaYampi` (401 → `{invalida, desconhecido}`; outro `YampiErro` → gravar `last_check_at` e `last_error: "A Yampi não respondeu na última conferência."`, manter o status, `{erro, desconhecido}`); `estadoDoAviso`: `ativo` → gravar `last_check_at`, `last_error: null`, `status: "ativa"`; senão `recriarAviso` (sucesso → `recriado`; 401 → `invalida`; outra falha → `status: "aviso_desativado"`, `last_error: "Não foi possível religar o aviso na Yampi."`, `last_check_at`, `{ok, falhou}`). `// ponytail: sem trava entre o cron e o Testar; uma corrida deixa o segredo errado até a próxima conferência (≤ 1 h)`.
- [ ] **Step 4: Run** o mesmo comando. Expected: `# fail 0`.
- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/lib/yampi/webhooks.ts apps/web/src/lib/yampi/webhooks.test.ts apps/web/src/lib/yampi/conferir.ts apps/web/src/lib/yampi/conferir.test.ts
git commit -m "feat(yampi): create, check and recreate the Yampi webhook" -m "Co-Authored-By: <modelo da sessão> <noreply@anthropic.com>"
```

---

### Task 10: Cron — reprocessar, conferir o aviso e limpar (fecha o PR 6b)

**Files:**
- Create: `apps/web/src/lib/yampi/cron.ts`, `apps/web/src/app/api/cron/yampi/route.ts`
- Modify: `apps/web/vercel.json`, `apps/web/src/lib/security/request-access-policy.ts` (lista de crons)
- Test: `apps/web/src/lib/yampi/cron.test.ts`, `apps/web/src/app/api/cron/yampi/route.test.ts`, `apps/web/src/lib/security/request-access-policy.test.ts`

**Interfaces:**
- Consumes: `listarEventosParados`, `limparDadosVencidosComuns` (Task 4); `listarConexoesParaConferir` (Task 4); `processarEventoYampi` (Task 5); `conferirConexao`, `ResultadoDaConferencia` (Task 9); `isCronAuthorized`; `chaveDeIntegracoes`.
- Produces:

```ts
export const AGENDA_DA_LIMPEZA = "0 6 * * *";
export type DepsDoCron = {
  agora: () => number;
  listarParados: (p: { antesDe: Date; depoisDe: Date; limite: number }) => Promise<string[]>;
  processar: (eventoId: string) => Promise<void>;
  listarParaConferir: (antesDe: Date, limite: number) => Promise<string[]>;
  conferir: (tenantId: string) => Promise<ResultadoDaConferencia | null>;
  limpar: () => Promise<number>;
};
export type ResumoDoCronYampi = { reprocessados: number; conferidas: number; avisosRecriados: number; limpos: number | null; erros: number };
export async function executarCronYampi(deps: DepsDoCron, agenda: string | null): Promise<ResumoDoCronYampi>;
// route.ts: GET (runtime nodejs, dynamic force-dynamic, maxDuration 120)
```

Constantes (em `cron.ts`): reprocessar eventos parados há mais de **3 min** e menos de **24 h**, até **50** por execução, sem começar outro depois de **90 s**; conferir conexões sem checagem há mais de **1 h**, até **20** por execução.

- [ ] **Step 1: Write the failing tests.** `cron.test.ts` (deps em memória, relógio falso):

```ts
test("agenda da limpeza: só a limpeza roda, uma vez, e o número entra no resumo", async () => {
  const { deps, chamadas } = mundo({ limpar: async () => 7 });
  assert.deepEqual(await executarCronYampi(deps, AGENDA_DA_LIMPEZA), { reprocessados: 0, conferidas: 0, avisosRecriados: 0, limpos: 7, erros: 0 });
  assert.deepEqual(chamadas, ["limpar"]);
});
test("execução comum: reprocessa os parados (> 3 min, < 24 h, até 50) e confere as conexões sem checagem há 1 h (até 20); a limpeza não roda", async () => {
  const { deps, chamadas, args } = mundo({ parados: ["e1", "e2"], conexoes: ["loja-a", "loja-b"], conferencia: { "loja-b": { credenciais: "ok", aviso: "recriado" } } });
  const r = await executarCronYampi(deps, "*/5 * * * *");
  assert.deepEqual([r.reprocessados, r.conferidas, r.avisosRecriados, r.limpos, r.erros], [2, 2, 1, null, 0]);
  assert.deepEqual(args.parados, { antesDe: new Date(INICIO - 3 * 60_000), depoisDe: new Date(INICIO - 24 * 3_600_000), limite: 50 });
  assert.deepEqual(args.conferir, { antesDe: new Date(INICIO - 3_600_000), limite: 20 });
  assert.ok(!chamadas.includes("limpar"));
});
test("um evento ou uma conexão que falha conta erro e não para os outros", ...);
test("depois de 90 s não começa outro evento (o relógio salta durante o primeiro)", ...);
test("limpeza que lança: erros 1 e o resto do resumo preservado", ...);
```

`route.test.ts` (molde: `app/api/cron/bling/route.test.ts`, com PostgREST falso: `GET /rest/v1/yampi_events` → `[]`, `GET /rest/v1/yampi_connections` → `[]`, `POST /rest/v1/rpc/limpar_dados_vencidos_comuns` → `3`):

```ts
test("cron sem o secret certo: 401 e nada roda", ...);                 // null, outro segredo, CRON_SECRET ausente
test("sem a chave de cifra: 200 pulado e nenhuma consulta ao banco", ...);   // { ok: true, pulado: "indisponivel" }
test("execução comum: consulta eventos e conexões, nunca chama a limpeza; a resposta só conta (sem id de loja)", ...);
test("com o cabeçalho x-vercel-cron-schedule da limpeza: só a função de limpeza é chamada", ...);
test("passo que falha: o outro roda, resposta 500 com o resumo e sem id de loja", ...);   // ok: false
```

e, no fim de `cron.test.ts`, a trava entre o código e o agendamento (a rota decide a limpeza pelo cabeçalho, então a agenda do `vercel.json` e a constante têm de ser a mesma):

```ts
test("vercel.json tem as duas agendas da rota e a da limpeza é AGENDA_DA_LIMPEZA", () => {
  const crons = JSON.parse(readFileSync(join(AQUI, "..", "..", "..", "vercel.json"), "utf8")).crons as Array<{ path: string; schedule: string }>;
  assert.deepEqual(crons.filter((c) => c.path === "/api/cron/yampi").map((c) => c.schedule).sort(), ["*/5 * * * *", AGENDA_DA_LIMPEZA].sort());
});
```

`request-access-policy.test.ts` — o cron e a trava estrutural (nenhum teste ligava `vercel.json` à política; o comentário da política avisa que esquecer o path deixa o cron inerte em produção):

```ts
test("o cron da Yampi usa a autenticação do próprio handler, em path exato", () => {
  assert.equal(classifyRequest("/api/cron/yampi", "GET"), "cron");
  assert.equal(classifyRequest("/api/cron/yampi/outra", "GET"), "user");
});
test("todo cron do vercel.json está na lista de crons da política — fora dela o cron leva 401 do gate de sessão em produção", () => {
  const crons = JSON.parse(readFileSync(join(AQUI, "..", "..", "..", "vercel.json"), "utf8")).crons as Array<{ path: string }>;
  assert.ok(crons.length >= 5);          // emails, alertas, bling e as duas agendas da Yampi: se a leitura quebrar, o laço não pode passar vazio
  for (const { path } of crons) assert.equal(classifyRequest(path.split("?")[0], "GET"), "cron", path);
});
```

- [ ] **Step 2: Run** `…--test src/lib/yampi/cron.test.ts src/app/api/cron/yampi/route.test.ts src/lib/security/request-access-policy.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `executarCronYampi`: `agenda === AGENDA_DA_LIMPEZA` → só `limpar()` (try/catch: `erros + 1`); senão, reprocessar (cada `processar(id)` num `try/catch`; para de começar quando `agora() - inicio > 90_000`) e depois conferir (cada `conferir(tenantId)` num `try/catch`; `null` não conta; `aviso === "recriado"` soma em `avisosRecriados`). Cada passo isolado: lançar na listagem de um passo conta `erros + 1` e não impede o outro. Logs `[yampi/cron] <passo>: <mensagem>` com ids de evento e de loja, nunca payload. A rota: `isCronAuthorized(authorization, CRON_SECRET)` senão 401; `chaveDeIntegracoes()` nula → 200 `{ ok: true, pulado: "indisponivel" }`; `executarCronYampi(depsDeProducao, req.headers.get("x-vercel-cron-schedule"))`; resposta `{ ok: resumo.erros === 0, ...resumo }` com status 200, ou 500 quando `erros > 0`. `vercel.json` ganha `{ "path": "/api/cron/yampi", "schedule": "*/5 * * * *" }` e `{ "path": "/api/cron/yampi", "schedule": "0 6 * * *" }`; a lista de crons da política ganha `pathname === "/api/cron/yampi"` (com o comentário que as outras têm).
- [ ] **Step 4: Run** o mesmo comando. Expected: `# fail 0`.
- [ ] **Step 5: Mutante**: tirar `/api/cron/yampi` da lista da política → "todo cron do vercel.json…" falha. Desfazer.
- [ ] **Step 6: Types e commit** — `npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.json` (sem saída).

```powershell
git add apps/web/src/lib/yampi/cron.ts apps/web/src/lib/yampi/cron.test.ts apps/web/src/app/api/cron/yampi apps/web/vercel.json apps/web/src/lib/security/request-access-policy.ts apps/web/src/lib/security/request-access-policy.test.ts
git commit -m "feat(yampi): cron for stuck events, webhook check and daily cleanup" -m "Co-Authored-By: <modelo da sessão> <noreply@anthropic.com>"
```

- [ ] **Step 7: Fechar o PR 6b** (título sugerido: `feat(yampi): Yampi client, 401 handling, webhook check and cron`). Antes do 6c: worktree `feat/yampi-cartao` de `origin/main`.

---

### Task 11: Conectar, desconectar, testar e a API do cartão

**Files:**
- Create: `apps/web/src/lib/yampi/conectar.ts`, `apps/web/src/lib/yampi/cartao.ts`, `apps/web/src/app/api/integracoes/yampi/route.ts`, `apps/web/src/app/api/integracoes/yampi/testar/route.ts`
- Test: `apps/web/src/lib/yampi/conectar.test.ts`, `apps/web/src/lib/yampi/cartao.test.ts`, `apps/web/src/app/api/integracoes/yampi/route.test.ts`

**Interfaces:**
- Consumes: `criarClienteYampi`, `YampiErro` (Task 7); `lerAlias`, `lerCredencial`, `contextoDoSegredo`, `abrirCredenciais` (Task 2); `salvarConexaoYampi`, `desconectarConexaoYampi`, `atualizarConexaoYampi`, `lerConexaoYampi` (Task 4); `recriarAviso`, `apagarAvisosDaNossaUrl` (Task 9); `conferirConexao` (Task 9); `getRouteTenantContext`, `hasPermission` (`settings:connection`); `checkRateLimit`.
- Produces:

```ts
// conectar.ts
export type FalhaDeConexao = "indisponivel" | "dados_invalidos" | "credencial_invalida" | "yampi_fora" | "aviso_nao_criado";
export type ResultadoDaConexao = { ok: true } | { ok: false; falha: FalhaDeConexao };
export async function conectarYampi(tenantId: string, entrada: unknown): Promise<ResultadoDaConexao>;   // entrada = { alias, user_token, user_secret_key }
export async function desconectarYampi(tenantId: string): Promise<boolean>;                             // false = não havia conexão
// cartao.ts
export type CartaoYampi = {
  disponivel: boolean;                                   // INTEGRATIONS_ENCRYPTION_KEY presente
  conexao: null | { status: Exclude<StatusYampi, "desconectada">; alias: string; token_final: string | null; ultimo_aviso_em: string | null; ultima_conferencia_em: string | null; ultimo_erro: string | null };
};
export async function montarCartaoYampi(tenantId: string): Promise<CartaoYampi>;
// rotas (runtime nodejs, dynamic force-dynamic, Cache-Control: no-store, settings:connection = dono e admin)
// GET    /api/integracoes/yampi          → CartaoYampi
// POST   /api/integracoes/yampi          → { alias, user_token, user_secret_key } → 200 { ok: true } | erro
// DELETE /api/integracoes/yampi          → 200 { ok: true } | 404 { error: "Sem conexão com a Yampi." }
// POST   /api/integracoes/yampi/testar   → 200 ResultadoDaConferencia | 404
```

`conectarYampi`, em ordem (a ordem dos efeitos é o contrato): (1) sem `chaveDeIntegracoes()` → `indisponivel`; (2) `lerAlias`/`lerCredencial` nos três campos, qualquer um nulo → `dados_invalidos`, **sem** Yampi nem banco; (3) leitura barata com o cliente puro (`criarClienteYampi`; ainda não há conexão para o `yampiGet`) — `GET /orders?limit=1`, constante `PEDIDO_DE_TESTE = { caminho: "/orders", query: { limit: 1 } }` (S6): 401 → `credencial_invalida`, outro erro → `yampi_fora`, **nada gravado**; (4) `salvarConexaoYampi` com token e chave selados (`contextoDoSegredo`); (5) `recriarAviso(conexao)`: sucesso → `{ ok: true }`; 401 → `credencial_invalida`; outra falha → `atualizarConexaoYampi(tenantId, { last_error: "Não foi possível criar o aviso na Yampi." })` e `aviso_nao_criado` (as credenciais ficam gravadas com `aviso_desativado`; o cron tenta de novo). `desconectarYampi`: `desconectarConexaoYampi` **primeiro** (banco: credenciais e aviso apagados, `desconectada`), depois `apagarAvisosDaNossaUrl(anterior)` em `try/catch` (melhor esforço; `console.warn` com o id da loja) — a conexão de antes é a que tem as credenciais.

`montarCartaoYampi`: sem chave → `{ disponivel: false, conexao: null }` sem consultar o banco; sem linha ou `desconectada` → `conexao: null`; `token_final` = últimos 4 do `User-Token` aberto (falha de cifra → `null`); nunca token, chave, segredo do aviso, nem `last_error` que não seja uma das frases fixas deste plano.

- [ ] **Step 1: Write the failing tests** (`servirYampi`).

```ts
// conectar.test.ts
test("conecta: testa a credencial, grava selada, cria o aviso e fica ativa — nessa ordem", async () => {
  /* yampi: GET /loja-exemplo/orders 200; GET /loja-exemplo/webhooks {data: []}; POST /loja-exemplo/webhooks webhook-criado.json
     banco: upsert yampi_connections (devolve a linha), PATCH yampi_connections */
  assert.deepEqual(await conectarYampi(TENANT, ENTRADA), { ok: true });
  assert.deepEqual(estado.linhaDoTempo, ["yampi GET /loja-exemplo/orders", "db POST yampi_connections", "yampi GET /loja-exemplo/webhooks", "yampi POST /loja-exemplo/webhooks", "db PATCH yampi_connections"]);
  const gravado = estado.chamadas.find((c) => c.metodo === "POST" && c.url.pathname === "/rest/v1/yampi_connections")?.corpo as Record<string, string>;
  assert.notEqual(gravado.user_token, TOKEN);                                         // selado
  assert.equal(abrir(gravado.user_token, contextoDoSegredo(TENANT, "user_token"), CHAVE), TOKEN);
  assert.equal(abrir(gravado.user_secret_key, contextoDoSegredo(TENANT, "user_secret_key"), CHAVE), CHAVE_SECRETA);
});
test("credencial recusada pela Yampi (401): credencial_invalida e nada é gravado", ...);        // nenhum POST/PATCH em yampi_connections
test("dados fora do formato (e-mail no lugar da chave, alias com barra, texto curto): dados_invalidos sem chamar a Yampi nem o banco", ...);
test("Yampi fora (500/429) no teste: yampi_fora e nada é gravado", ...);
test("aviso não criado: as credenciais ficam gravadas com aviso_desativado, last_error escrito, e a falha é aviso_nao_criado", ...);
test("desconectar: o banco primeiro, depois apaga o aviso na Yampi com as credenciais de antes; a Yampi fora não impede; sem conexão devolve false", async () => {
  assert.equal(await desconectarYampi(TENANT), true);
  assert.deepEqual(estado.linhaDoTempo.slice(0, 2), ["db GET yampi_connections", "db PATCH yampi_connections"]);   // banco antes da Yampi
  assert.ok(estado.chamadasYampi.some((c) => c.metodo === "DELETE"));
});
// cartao.test.ts
test("o cartão devolve só o final do token, nunca o token, a chave nem o segredo do aviso", async () => {
  const c = await montarCartaoYampi(TENANT);
  assert.equal(c.conexao?.token_final, TOKEN.slice(-4));
  assert.doesNotMatch(JSON.stringify(c), new RegExp(`${TOKEN}|${CHAVE_SECRETA}|segredo-do-aviso|v1\\.`));
});
test("sem a chave de cifra: disponivel false e nenhuma consulta; desconectada ou sem linha: conexao null", ...);
// route.test.ts (dono logado por Bearer, como o do Bling)
test("operador e vendedora: 403 em GET, POST, DELETE e testar sem tocar nas tabelas da Yampi", ...);
test("POST mapeia as falhas: dados_invalidos 400 (a frase cita o navegador), credencial_invalida 400, yampi_fora 502, aviso_nao_criado 502, indisponivel 503", async () => {
  /* frases: "Confira o alias e copie de novo o token e a chave da Yampi (o navegador pode ter preenchido um campo sozinho)." /
     "A Yampi recusou essas credenciais. Copie o token e a chave de novo em Perfil › Credenciais de API." /
     "A Yampi não respondeu agora. Tente de novo em instantes." /
     "Conectamos a Yampi, mas não conseguimos criar o aviso agora. Vamos tentar de novo sozinhos em alguns minutos." / { error: "indisponivel" } */
});
test("POST com JSON inválido ou campo desconhecido: 400", ...);
test("POST ok: 200 { ok: true } e nem a resposta nem os logs repetem o token ou a chave", ...);
test("a sexta chamada no minuto a Conectar ou a Testar: 429 sem chamar a Yampi", async () => { /* checkRateLimit(`yampi:${acao}:${tenantId}`, 5, 60_000); o balde em memória vive o arquivo inteiro, então cada teste de rota usa uma loja própria (estado.tenant) */ });
test("testar devolve o resultado da conferência; sem conexão: 404", ...);
test("DELETE: 200 e a Yampi recebe o DELETE do aviso; sem conexão: 404 { error: \"Sem conexão com a Yampi.\" }", ...);
```

- [ ] **Step 2: Run** `…--test src/lib/yampi/conectar.test.ts src/lib/yampi/cartao.test.ts src/app/api/integracoes/yampi/route.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** As rotas seguem `app/api/integracoes/bling/route.ts`: `lojaDoDono` com `getRouteTenantContext(req, { allowEngine: false })` e `hasPermission(role, "settings:connection")`, respostas com `cache-control: no-store`, corpo do POST com `z.strictObject({ alias: z.unknown(), user_token: z.unknown(), user_secret_key: z.unknown() })` (a validação de valor é do serviço), 429 `{ error: "Muitas tentativas. Aguarde 1 minuto." }` por `checkRateLimit("yampi:conectar:<tenantId>" | "yampi:testar:<tenantId>", 5, 60_000)` antes de qualquer chamada à Yampi.
- [ ] **Step 4: Run** o mesmo comando. Expected: `# fail 0`.
- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/lib/yampi/conectar.ts apps/web/src/lib/yampi/conectar.test.ts apps/web/src/lib/yampi/cartao.ts apps/web/src/lib/yampi/cartao.test.ts apps/web/src/app/api/integracoes/yampi
git commit -m "feat(yampi): connect, test and disconnect with the card API" -m "Co-Authored-By: <modelo da sessão> <noreply@anthropic.com>"
```

---

### Task 12: O cartão em Configurações › Integrações

**Files:**
- Create: `apps/web/src/components/painel/configuracoes/yampi.tsx`, `yampi-painel.tsx`, `yampi-painel-texto.ts`, `apps/web/e2e/painel-integracao-yampi.spec.ts`
- Modify: `apps/web/src/components/painel/configuracoes/vitrine/configuracoes-vitrine.tsx` (monta `<Yampi />` depois de `<Bling />`)
- Test: `apps/web/src/components/painel/configuracoes/yampi-painel.test.ts`

**Interfaces:**
- Consumes: `CartaoYampi` (Task 11, só o tipo: `import type`); `ResultadoDaConferencia` (Task 9, tipo); `useRole`, `useToast`, `useConfirmacao`, `authenticatedFetch` (como `bling.tsx`); `CARTAO`, `PRIMARIO`, `SECUNDARIO`, `ANEL`, `CAMPO`, `COR_DO_TOM` de `./bling-painel-estilo`; `type Tom` de `./bling-painel-texto`; `haQuanto` de `./site-proprio-painel`.
- Produces:

```tsx
// yampi-painel-texto.ts
export function chipDaYampi(status: Exclude<StatusYampi, "desconectada">): { texto: string; tom: Tom };
export function mensagemDoTeste(r: ResultadoDaConferencia): { texto: string; tom: "ok" | "erro" };
// yampi-painel.tsx ("use client"; importa React: o tsx do teste usa o runtime clássico de JSX)
export type PropsDaYampi = {
  cartao: CartaoYampi; agora: Date; ocupado: "conectar" | "testar" | "desconectar" | null; erroDoFormulario: string | null;
  onConectar: (c: { alias: string; user_token: string; user_secret_key: string }) => void; onTestar: () => void; onDesconectar: () => void;
  children?: React.ReactNode;       // blocos de cada módulo (Rastreio, Recuperar); só aparecem com conexão
};
export function PainelDaYampi(p: PropsDaYampi): React.JSX.Element;
export function YampiComErro(p: { onTentar: () => void }): React.JSX.Element;
// yampi.tsx
export function Yampi(p: { children?: React.ReactNode }): React.JSX.Element | null;   // o PR 7 monta o mesmo componente em Recuperar › Ajustes
```

Textos fixos (português do Brasil). O cartão é uma `<section aria-labelledby="yampi-titulo">` (é por ela que o e2e e o leitor de tela o acham) com o título em `h2#yampi-titulo` e o chip ao lado:

| Estado | Título (`h2#yampi-titulo`) | Chip | Corpo |
|---|---|---|---|
| indisponível | "Yampi" | — | "Integração com a Yampi indisponível no momento." (sem botão) |
| erro de carga | "Yampi" | — | `role="alert"` "Não deu para carregar a integração com a Yampi." + "Tentar de novo" |
| não conectada | "Yampi · não conectada" | — | "Os pedidos e os carrinhos da sua loja Yampi chegam na Girumo na hora. A conexão é a mesma do Rastreio do pedido e do Recuperar."; campos "Loja (alias na Yampi)", "User-Token", "User-Secret-Key"; ajuda "Copie em Perfil › Credenciais de API, na Yampi."; "Se você trocar a senha da Yampi, o token muda e a conexão cai: é só colar de novo aqui."; botão "Conectar Yampi" |
| ativa | "Yampi · {alias}" | "Conectada" (ok) | "Token ••••{final}"; "Último aviso: há 4 min" ou "Último aviso: ainda nenhum"; "Última conferência: há 22 min" ou "…: ainda não"; botões "Testar conexão", "Desconectar" |
| aviso_desativado | "Yampi · {alias}" | "Aviso desligado" (alerta) | `role="status"` "A Yampi parou de avisar a Girumo. Tentamos religar sozinhos a cada hora; use Testar conexão para tentar agora." + os dois botões |
| credencial_invalida | "Yampi · {alias}" | "Acesso recusado" (erro) | `role="alert"` "A Yampi recusou o acesso da Girumo" + "Isso acontece quando a senha da Yampi muda. Cole o token e a chave de novo."; formulário (botão "Reconectar Yampi") + "Desconectar" |

`mensagemDoTeste`: `{ok, ativo}` → "Tudo certo: a Yampi respondeu e o aviso está ligado." (ok); `{ok, recriado}` → "A Yampi respondeu e o aviso estava desligado. Religamos." (ok); `{ok, falhou}` → "A Yampi respondeu, mas não conseguimos religar o aviso. Tentamos de novo daqui a pouco." (erro); `{invalida, *}` → "A Yampi recusou o acesso. Cole o token e a chave de novo." (erro); `{erro, *}` → "A Yampi não respondeu agora. Tente de novo em instantes." (erro).

- [ ] **Step 1: Write the failing test** `yampi-painel.test.ts` (`renderToStaticMarkup(createElement(PainelDaYampi, props))` com `AGORA = 2026-10-29T17:52Z`, como `bling-painel.test.ts`; `campo(h, id)` acha a tag do input por `id`):

```ts
const ATIVA: CartaoYampi = { disponivel: true, conexao: { status: "ativa", alias: "loja-exemplo", token_final: "9aZ4", ultimo_aviso_em: "2026-10-29T17:48:00.000Z", ultima_conferencia_em: "2026-10-29T17:30:00.000Z", ultimo_erro: null } };

test("sem a chave de cifra: só o recado, nenhum botão", () => {
  const h = html({ disponivel: false, conexao: null });
  assert.match(h, /<h2 id="yampi-titulo"[^>]*>Yampi<\/h2>/);
  assert.match(h, /Integração com a Yampi indisponível no momento\./); assert.doesNotMatch(h, /<button/);
});
test("não conectada: título, promessa, três campos com rótulo e Conectar Yampi", () => {
  const h = html({ disponivel: true, conexao: null });
  for (const t of ["Yampi · não conectada", "Loja \\(alias na Yampi\\)", "User-Token", "User-Secret-Key", ">Conectar Yampi<", "Perfil › Credenciais de API", "a conexão cai"]) assert.match(h, new RegExp(t));
  assert.match(h, /<label[^>]*for="yampi-token"/);
});
test("os campos de segredo: type=password, autocomplete=new-password, fora do vocabulário de credencial e sem preenchimento de gerenciador", () => {
  const h = html({ disponivel: true, conexao: null });
  for (const id of ["yampi-token", "yampi-chave"]) {
    const tag = campo(h, id);
    assert.match(tag, /type="password"/); assert.match(tag, /autocomplete="new-password"/i);
    assert.match(tag, /data-1p-ignore/); assert.match(tag, /data-lpignore="true"/);
    assert.doesNotMatch(tag, /name="(password|senha|token|user|username)"/i);
  }
});
test("conectada: chip, alias, token só com o final, último aviso e conferência, Testar conexão e Desconectar, e nenhum campo", () => {
  const h = html(ATIVA);
  for (const t of [">Conectada<", "Yampi · loja-exemplo", "••••9aZ4", "Último aviso: há 4 min", "Última conferência: há 22 min", ">Testar conexão<", ">Desconectar<"]) assert.match(h, new RegExp(t));
  assert.doesNotMatch(h, /<input/);
});
test("ainda sem aviso nem conferência: 'ainda nenhum' e 'ainda não'", ...);
test("aviso desligado: chip âmbar, explicação em role=status e Testar conexão", ...);
test("acesso recusado: alerta, formulário para colar de novo (Reconectar Yampi) e Desconectar; sem Testar conexão", ...);
test("ocupado: os botões ficam desabilitados e o erro do formulário aparece em role=alert", ...);
test("children só aparecem com conexão", () => {
  assert.match(html(ATIVA, { children: createElement("p", null, "bloco do módulo") }), /bloco do módulo/);
  assert.doesNotMatch(html({ disponivel: true, conexao: null }, { children: createElement("p", null, "bloco do módulo") }), /bloco do módulo/);
});
test("mensagemDoTeste cobre as cinco combinações com o tom certo", ...);
test("chipDaYampi: ativa ok, aviso_desativado alerta, credencial_invalida erro", ...);
```

- [ ] **Step 2: Run** `…--test src/components/painel/configuracoes/yampi-painel.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** os três arquivos do cartão no padrão de `bling.tsx` / `bling-painel.tsx`: o container `yampi.tsx` só para dono/admin (`carregado && can("settings:connection")`, senão `null`), carrega `GET /api/integracoes/yampi`, e chama `POST`, `POST …/testar` (mostra `mensagemDoTeste` no toast e recarrega) e `DELETE` (antes, `pedirConfirmacao({ titulo: "Desconectar Yampi", texto: "A Girumo para de receber os pedidos e os carrinhos e apaga o acesso e o aviso na Yampi. O Rastreio e o Recuperar ficam parados até você conectar de novo.", rotulo: "Desconectar Yampi", destrutivo: true })`); o formulário usa `<label>` visível, `id`s `yampi-alias`, `yampi-token`, `yampi-chave`, `autoComplete="new-password"` e `data-1p-ignore`/`data-lpignore="true"` nos dois segredos, `name`s neutros (`yampi-campo-1`, `yampi-campo-2`), `spellCheck={false}`, `.trim()` ao enviar e botão desabilitado com algum campo vazio. Montar `<Yampi />` em `configuracoes-vitrine.tsx` logo depois de `<Bling />`, na porta Integrações.
- [ ] **Step 4: e2e de leitura** `e2e/painel-integracao-yampi.spec.ts`, no molde do primeiro teste de `painel-integracao-bling.spec.ts` (roda no job `e2e` do CI; sem `E2E_SUPABASE_*` local ele não roda):

```ts
test("o dono vê o cartão da Yampi na porta Integrações, no estado que a rota devolve", async ({ page }) => {
  const leitura = page.waitForResponse((r) => r.request().method() === "GET" && new URL(r.url()).pathname === "/api/integracoes/yampi", { timeout: 30_000 });
  await page.goto("/painel/configuracoes?secao=integracoes", { waitUntil: "load" });
  const resposta = await leitura;
  expect(resposta.status(), "GET /api/integracoes/yampi do dono").toBe(200);
  const cartao = (await resposta.json()) as { disponivel?: unknown; conexao?: unknown };
  const yampi = page.getByRole("region", { name: /^Yampi/ });
  await expect(yampi).toBeVisible({ timeout: 30_000 });
  await expect(yampi).not.toContainText("Não deu para carregar");
  if (cartao.disponivel === false) await expect(yampi).toContainText("Integração com a Yampi indisponível no momento.");
  else if (cartao.conexao === null) await expect(yampi.getByRole("button", { name: "Conectar Yampi" })).toBeVisible();
  else await expect(yampi.getByRole("heading", { name: /^Yampi · / })).toBeVisible();
});
```

- [ ] **Step 5: Run** o teste do Step 1 (Expected: `# fail 0`) e as verificações do painel:

```powershell
npm --workspace apps/web run painel:check
npm --workspace apps/web run brand:check
npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.json
npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.e2e.json
```

Expected: `painel:check OK`, `brand:check` sem achados, `tsc` sem saída nos dois projetos.
- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/components/painel/configuracoes/yampi.tsx apps/web/src/components/painel/configuracoes/yampi-painel.tsx apps/web/src/components/painel/configuracoes/yampi-painel-texto.ts apps/web/src/components/painel/configuracoes/yampi-painel.test.ts apps/web/src/components/painel/configuracoes/vitrine/configuracoes-vitrine.tsx apps/web/e2e/painel-integracao-yampi.spec.ts
git commit -m "feat(yampi): Yampi card in Configurações > Integrações" -m "Co-Authored-By: <modelo da sessão> <noreply@anthropic.com>"
```

- [ ] **Step 7: Fechar o PR 6c** (título sugerido: `feat(yampi): connect, test and disconnect the Yampi store from Integrações`).

---

### Task 13: Prova na loja piloto e quadro (precisa do Igor)

**Files:** nenhum.

- [ ] **Step 1: Conectar a loja piloto** (6c em produção): em Configurações › Integrações, colar alias, `User-Token` e `User-Secret-Key` da Yampi e clicar "Conectar Yampi". Expected: chip "Conectada" e "Token ••••XXXX" com o final certo; na Yampi, um aviso "Girumo" ativo com os cinco eventos.
- [ ] **Step 2: Provocar um evento** (um pedido de teste, ou mudar o status de um pedido) e ler o banco de **produção**, só leitura (`npx supabase --workdir <pasta vazia> db query --linked -f arquivo.sql`; se o classificador recusar, pedir ao Igor):

```sql
select e.event, e.received_at, e.processed_at, e.error
  from public.yampi_events e join public.yampi_connections c on c.id = e.connection_id
 where c.tenant_id = '<tenant da piloto>' order by e.received_at desc limit 5;
```

Expected: pelo menos uma linha, `processed_at` preenchido (sem consumidor, o evento fecha na hora) e `error` nulo; no cartão, "Último aviso: há X min". Se `processed_at` ficar nulo, ver `error` e o log da Vercel antes de qualquer coisa.
- [ ] **Step 3: Cron em produção**: nos logs da Vercel, `GET /api/cron/yampi` com 200 e `{ "ok": true, … }` a cada 5 min; no dia seguinte, a execução de 06:00 UTC com `limpos` preenchido.
- [ ] **Step 4: Quadro** (prod `nidoatbxaylrkcgbszns`; `move_card` não limpa o `blocker`, então é `update`):

```sql
update public.board_features
   set blocker = 'PR 6, 6b e 6c no ar: conexão Yampi, aviso assinado, processador e cron. Sem consumidor ainda: falta a Fase 0 do WhatsApp e o PR 7 (Pix).',
       updated_at = now()
 where key = 'recuperar-yampi';
```

- [ ] **Step 5: Grafo** (PowerShell, a partir da raiz do projeto): `rag insert "decisão: conexão Yampi comum — consumidores num registro (lib/yampi/consumidores.ts), dedupe pelo hash do corpo, aviso recriado apagando os da nossa rota, limpeza diária pela agenda do cron, 401 derruba na primeira recusa" --source decisao-2026-10-29-yampi-conexao`.
- [ ] **Step 6: Relatório de encerramento**: "PRs que deixei abertos: nenhum" (ou o número e o motivo).

---

## Fechamento de cada PR (6, 6b, 6c)

1. **Gate local** (tem de dar `EXIT=0`; sem `2>&1` nem `*>`, que no PowerShell 5.1 transformam stderr em falha):

```powershell
Set-Location C:\Users\Igor\Desktop\HubFlow-platform\.claude\worktrees\<worktree do PR>
& .\infra\scripts\verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
```

2. **Revisão de segurança**: agente Security Engineer sobre `git diff origin/main...HEAD`; corrigir CRITICAL e HIGH antes do push. Foco por PR: 6, a rota do aviso (HMAC, alias, corpo, log); 6b, o cliente e o tratamento do 401; 6c, o tratamento das credenciais coladas e as rotas do cartão.
3. **Push e PR** (base `main`, `git push -u origin <branch>`), sem `--auto`. Depois: `gh pr checks <N>` até ficar tudo verde (job `e2e` incluído; no 6, `migrate-dev` roda mas não há migração deste PR).
4. **Merge à mão no verde**, e limpar a branch (em worktree, o `--repo` evita o `checkout main` local):

```powershell
gh pr checks <N>
gh pr merge <N> --squash --delete-branch --repo codingB0y/Girumo
```

5. Antes do próximo PR da série: worktree novo de `origin/main` (as duas junctions). **Ao encerrar a sessão**: "PRs que deixei abertos: …".
