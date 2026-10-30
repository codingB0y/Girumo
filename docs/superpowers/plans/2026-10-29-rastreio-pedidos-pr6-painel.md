# Rastreio do pedido — PR 6: Painel (plano de implementação)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dono e administração ligam e ajustam o Rastreio (avisos por etapa e canal, página, WhatsApp da loja, convite do VIP), acompanham as entregas numa tabela densa em Vendas › Entregas e veem a saúde do código de rastreio no cartão da Yampi; o admin da Girumo liga o módulo loja a loja.

**Architecture:** Rotas finas em `/api/rastreio/*` (permissão `settings:connection` + `rastreio_enabled`) sobre um store de leitura (`rastreio-entregas.ts`: lista e contagens `head`+`count`, tudo com `tenant_id`) e regras puras em `lib/rastreio/` (rótulos, filtros, zod) que rodam no navegador e nos testes. A casca pergunta `GET /api/rastreio/status` a dono e admin e expõe `liberacoes.rastreio`; o item de menu (Entregas), a porta de Configurações e o bloco da Yampi só existem com ela. O admin grava a flag por `POST /api/admin/tenants/[id]/rastreio`.

**Tech Stack:** Next.js App Router, `tsx --test` (node:test) com PostgREST falso, zod 4, Playwright com `page.route`.

**Spec:** `docs/superpowers/specs/2026-10-29-rastreio-pedidos-design.md` (§1.5, §4, §5, §7). Mockups fora do repo (têm o nome da loja-piloto): `Rastreio`, `Entregas`, `Integracoes` `.dc.html` em `C:\Users\Igor\Desktop\girumo-design-refs\rastreio-pedidos\project\`; onde o mockup diz "celular de avisos", a tela diz **número do atendimento**.
Índice: `docs/superpowers/plans/2026-10-29-rastreio-pedidos-00-indice.md` — Contrato, Global Constraints e Review Focus valem aqui.

## Partes (um PR cada, em ordem)

| Parte | Branch | Entrega | Depende de |
|---|---|---|---|
| 1 · API das Entregas | `feat/rastreio-pr6-painel-p1` | regras puras, store, guarda das rotas, lista, reenvio, saúde | PR 1, PR 2 |
| 2 · Liberação | `feat/rastreio-pr6-painel-p2` | status, admin liga/desliga, `Liberacao "rastreio"` | P1 |
| 3 · Rota da configuração | `feat/rastreio-pr6-painel-p3` | zod, número da loja, GET/PATCH | P1, B·6b |
| 4 · Configurações › Rastreio de pedidos | `feat/rastreio-pr6-painel-p4` | porta e tela | P2, P3, B·2b (o cartão do número) |
| 5 · Vendas › Entregas e bloco da Yampi | `feat/rastreio-pr6-painel-p5` | tabela, página, abas, menu, bloco | P1, P2; a Task 13 (bloco) também B·6c (o cartão da Yampi) |

P3 e P5 não dividem arquivo (só `API_CONTRACTS.md`, em seções diferentes): podem andar juntas depois da P2. P4 e P5 dividem só `configuracoes-vitrine.tsx` (a P4 troca as portas e monta a tela do Rastreio; a P5 passa o bloco como `children` do `<Yampi>`), em trechos diferentes: quem mergear depois reconcilia. Este PR corre em paralelo com os PRs 3 e 4 da série e não toca `registrar.ts`, `cron.ts`, a página pública nem o e-mail.

## Antes de começar (cada Parte)

- Worktree novo a partir de `origin/main`: `git fetch origin main`; defasagem > ~20 commits → atualizar antes de escrever código.
- Em `main` antes da P1: PR 1 e PR 2. Antes da P3: B·6b (`conexaoYampiAtiva`). Antes da P4: B·2b (o cartão do número). Antes da Task 13 (P5): B·6c (o cartão da Yampi). Conferir:

```powershell
git fetch origin main
git ls-tree -r --name-only origin/main apps/web/src/lib/rastreio apps/web/src/lib/stores apps/web/src/lib/yampi apps/web/src/components/privado apps/web/src/components/painel/configuracoes | Select-String "rastreio|yampi|cartao-numero"
git grep -n -E "export (async )?function (conexaoYampiAtiva|Yampi|CartaoNumeroDoAtendimento)\(" origin/main -- apps/web/src/lib/yampi apps/web/src/components/privado apps/web/src/components/painel/configuracoes
```

Expected: `lib/rastreio/{tipos,documento,loja,link}.ts`, `lib/stores/rastreio-{pedidos,avisos,config}.ts`, `lib/yampi/{tipos,conexao,api}.ts`, `components/privado/cartao-numero-do-atendimento.tsx`, `components/painel/configuracoes/yampi.tsx` (o cartão, caminho fixo) e as 3 funções do `git grep` (`conexaoYampiAtiva` em `lib/yampi/conexao.ts`, `Yampi` em `yampi.tsx`, `CartaoNumeroDoAtendimento` no cartão do número). Faltou algo → não comece a Parte que depende dele.
- `git ls-tree origin/main apps/web/src/lib/rastreio/mensagens.ts apps/web/src/lib/rastreio/email.ts`: decide a Task 10, passo "Ver mensagem".

## Global Constraints (deste PR)

- Toda rota: `settings:connection` (dono e admin) + `rastreio_enabled`. Desligado → 403 `{ error: "O Rastreio de pedidos não está liberado para esta loja.", code: "rastreio_disabled" }` (texto do contrato do PR 1, molde `requireInstagram`; menos `status`). **Não** acrescentar `/api/rastreio` em `ROTAS` de `lib/auth/modulos.ts`: o mapa é fechado para a vendedora (403 `MENSAGEM_BLOQUEIO`) e assim fica.
- Toda query de store com `.eq("tenant_id", …)`, inclusive no embed (`tracking_notices.tenant_id`). Contagem só com `head` + `count: "exact"`; contagem que não veio é erro (molde `contagemDoHead` de `lib/stores/leads.ts`, copiado, não exportado).
- Documento (CPF/CNPJ) nunca na URL nem em log: a busca vai por `POST`. Telefone só na linha `problema` (para "Chamar compradora"); nunca e-mail, documento ou endereço na resposta.
- Texto de tela em pt-BR, "número do atendimento", loja de teste "Loja Exemplo", dados inventados (CPF `11144477735`, telefone `5511987654321`). Tailwind e classes `pn-*` existentes (`pn-card`, `pn-chip`, `pn-interruptor`, `pn-skeleton`); nenhum CSS novo.
- O nome acessível é contrato com o teste (`aria-label` dos interruptores, `aria-pressed` dos filtros). Teste de componente: `.test.ts` com `createElement` + `renderToStaticMarkup` (o glob de `npm test` é `src/**/*.test.ts`; molde `bling-painel.test.ts`).
- **Teste de um arquivo** (da raiz do worktree): `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/<caminho>.test.ts`. Gate da Parte: os quatro comandos do índice + `verify-local.ps1`.
- Commits em inglês com prefixo semântico; todo `git commit` leva `-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

## Arquivos

| Arquivo (sob `apps/web/src/`) | P | Responsabilidade |
|---|---|---|
| `lib/rastreio/entregas.ts` (+test) | 1 | tipos da API, filtros, rótulos, resumo dos avisos; puro (o navegador importa) |
| `lib/stores/rastreio-entregas.ts` (+test) | 1 | lista, números do topo, saúde do código |
| `lib/rastreio/rota-painel.ts` | 1 | guarda: sessão, permissão, liberação |
| `test/rastreio-painel-falso.ts` | 1 | PostgREST falso + login por Bearer (molde `test/bling-cartao-falso.ts`) |
| `app/api/rastreio/entregas/route.ts` (+test) | 1 | `GET`/`POST` da lista |
| `app/api/rastreio/entregas/[id]/reenviar/route.ts` (+test) | 1 | reabre o aviso da etapa atual |
| `app/api/rastreio/saude/route.ts` (+test) | 1 | saúde do código |
| `app/api/rastreio/status/route.ts` (+test) | 2 | `{ enabled }` para a casca |
| `lib/stores/tenant-settings.ts` (+`tenant-settings-rastreio.test.ts`) | 2 | `setRastreioEnabled` |
| `app/api/admin/tenants/[id]/rastreio/route.ts`, `components/admin/tenant-rastreio.tsx`, `app/admin/tenants/[id]/page.tsx` | 2 | admin liga e desliga |
| `lib/painel-nav.ts` (+test), `components/painel/casca-context.tsx`, `components/painel/rastreio/use-rastreio-liberado.ts` | 2 | `Liberacao`, `permissao`, hook |
| `lib/rastreio/config-painel.ts` (+test), `lib/bio/conferir.ts` (+test), `app/api/rastreio/config/route.ts` (+test) | 3 | zod do PATCH, número da loja, GET/PATCH |
| `lib/painel/configuracoes.ts` (+test), `components/painel/configuracoes/vitrine/configuracoes-vitrine.tsx`, `app/painel/configuracoes/page.tsx` | 4 | porta |
| `components/painel/rastreio/{rastreio-config,rastreio-config-painel,matriz-de-avisos}.tsx`, `lib/rastreio/previas.ts`, `e2e/painel-rastreio-config.spec.ts` | 4 | tela |
| `components/painel/rastreio/{entregas-tabela,entregas,abas-de-vendas}.tsx`, `app/painel/vendas/entregas/page.tsx`, `app/painel/vendas/page.tsx` | 5 | Entregas |
| `components/painel/rastreio/bloco-codigo-rastreio.tsx` (+test), `components/painel/configuracoes/vitrine/configuracoes-vitrine.tsx` (o bloco entra como `children` do `<Yampi>` do B·6c) | 5 | bloco |
| `e2e/painel-entregas.spec.ts`, `e2e/conteudo-esperado.ts`, `e2e/vendas-vendedora.spec.ts` | 5 | e2e |

## Review Focus (deste PR)

1. **Vendedora e operador não passam:** API 403 (vendedora: `MENSAGEM_BLOQUEIO` do mapa; operador: sem `settings:connection`) e a página não abre conteúdo. Testes: rotas (Tasks 3, 4, 5, 6, 9), nav (Task 8), e2e (Task 12).
2. **Isolamento de loja:** cada requisição do store leva `tenant_id=eq.<loja>` (e o embed). Reenvio de pedido de outra loja → 404 sem escrita (Task 4).
3. **Contagem sem o corte de 1000** e chip igual à lista: Task 2 compara os filtros da lista com os do HEAD de cada chip.
4. **Matriz sempre inteira:** PATCH parcial → 400 sem escrita (Task 9); senão um toggle apagaria as outras etapas.
5. **Documento fora de URL e de log:** Task 3 (GET ignora `busca`; log do erro sem os dígitos) e e2e (nenhuma URL com o CPF).
6. **Módulo desligado some:** rotas 403 `rastreio_disabled`, sem item de menu, sem porta, sem bloco (Tasks 3, 8, 10, 13).

---

## Parte 1 — API das Entregas

### Task 1: Regras puras das Entregas

**Files:**
- Create: `lib/rastreio/entregas.ts`, `lib/rastreio/entregas.test.ts`

**Interfaces:**
- Consumes: `Etapa`, `Canal`, `AvisoStatus`, `ETAPAS_COM_AVISO` de `@/lib/rastreio/tipos` (PR 1); `diaMesBR` de `@/lib/date-br`.
- Produces (sem `server-only`):
  - `FILTROS = ["todos","a_caminho","sem_codigo","problema","entregues","whatsapp_falhou"] as const`; `type FiltroDeEntregas`; `parseFiltroDeEntregas(v: string | null): FiltroDeEntregas` (desconhecido → `"todos"`).
  - `POR_PAGINA = 25`, `JANELA_DIAS = 30`, `DIAS_SEM_CODIGO = 2`, `STATUS_FATURADO = ["invoiced","ready_for_shipping","on_carriage"] as const`, `ETAPAS_DE_ENTREGA = ["enviado","retirada","problema","entregue"] as const`.
  - `type PedidoDaLista = { id: string; numero: string; buyerFirstName: string | null; buyerPhone: string | null; etapa: Etapa; etapaAt: string; trackingCode: string | null; statusRaw: string; linkToken: string }`; `type AvisoDoPedido = { orderId: string; etapa: Etapa; canal: Canal; status: AvisoStatus }`; `type ParteDoAviso = { texto: string; falhou: boolean }`.
  - `type LinhaDeEntrega = { id: string; numero: string; primeiroNome: string | null; etapa: Etapa; etapaAt: string; semCodigoHaDias: number | null; trackingCode: string | null; avisos: ParteDoAviso[]; link: string | null; telefone: string | null; podeReenviar: boolean }`.
  - `type NumerosDasEntregas = { todos: number; aCaminho: number; semCodigo: number; problema: number; whatsappFalhou: number; entreguesEm7Dias: number; avisosHoje: { whatsapp: number; email: number } }`; `type SaudeDoCodigo = { enviados: number; comCodigo: number; maisAntigoSemCodigo: { id: string; numero: string; desde: string } | null }`; `type RespostaDeEntregas = { numeros: NumerosDasEntregas; filtro: FiltroDeEntregas; pagina: number; porPagina: number; total: number; linhas: LinhaDeEntrega[]; atualizadoEm: string }`.
  - `diasSemCodigo(p: Pick<PedidoDaLista, "etapa" | "trackingCode" | "statusRaw" | "etapaAt">, agora: Date): number | null`; `linhaDeEntrega(p: PedidoDaLista, avisos: readonly AvisoDoPedido[], link: string | null, agora: Date): LinhaDeEntrega`; `rotuloDaSituacao(l: Pick<LinhaDeEntrega, "etapa" | "semCodigoHaDias">): { texto: string; tom: "neutro" | "atencao" | "risco" | "ok" }`; `novidadeDaLinha(l: Pick<LinhaDeEntrega, "etapa" | "etapaAt">): string`; `resumoDosAvisos(avisos: readonly Pick<AvisoDoPedido, "canal" | "status">[]): ParteDoAviso[]`; `corDoMedidor(com: number, de: number): "ok" | "atencao"`.

- [ ] **Step 1: Escrever os testes que falham** (`entregas.test.ts`; `agora = 2026-10-29T15:00:00Z`):
  - `"filtro desconhecido volta para todos"`: `"problema"` → `"problema"`; `"hack"` e `null` → `"todos"`.
  - `"sem código: faturado, sem código e parado há 2 dias ou mais"`: `{ separando, null, "invoiced", etapaAt 2026-10-25T15:00:00Z }` → `4`; com `"handling_products"` → `null`; com `trackingCode "AB123456789BR"` → `null`; com `etapaAt 2026-10-28T15:00:00Z` → `null`; etapa `enviado` → `null`.
  - `"situação por etapa"`: `enviado` → `{ texto: "A caminho", tom: "neutro" }`; `retirada` → `"Pronto para retirada"`; `problema` → `{ "Problema na entrega", "risco" }`; `entregue` → `{ "Entregue", "ok" }`; `separando` com `4` → `{ "Sem código há 4 dias", "atencao" }`; `separando` com `null` → `{ "Em separação", "neutro" }`.
  - `"novidade usa o dia de Brasília"`: `{ enviado, "2026-10-22T01:30:00Z" }` → `"Postado · 21/10"`; com `2026-10-27T15:00:00Z`: `problema` → `"Falha na entrega · 27/10"`, `retirada` → `"Na agência · 27/10"`, `entregue` → `"Entregue · 27/10"`, `separando` → `"Em separação · 27/10"`.
  - `"resumo dos avisos, WhatsApp primeiro"`: `[email enviado, whatsapp lido]` → `[{"WhatsApp lido", false}, {"e-mail enviado", false}]`; `[whatsapp falhou, email enviado]` → `[{"WhatsApp falhou", true}, {"e-mail enviado", false}]`; `[whatsapp entregue]` → `["WhatsApp entregue"]`; `[whatsapp pendente, email enviando]` → `["WhatsApp na fila", "e-mail na fila"]`; `[whatsapp pulado]` e `[]` → `[{ texto: "nenhum ainda", falhou: false }]`.
  - `"linha: telefone só no problema, avisos só da etapa atual"`: pedido `problema` com `buyerPhone "5511987654321"` e avisos `[{etapa:"enviado", whatsapp, lido}, {etapa:"problema", whatsapp, falhou}]` → `telefone "5511987654321"`, `avisos [{"WhatsApp falhou", true}]`, `podeReenviar true`; o mesmo pedido em `enviado` → `telefone null`; em `separando` → `podeReenviar false`.
  - `"medidor"`: `(14, 15)` e `(4, 5)` → `"ok"` (80% é o piso); `(11, 15)` → `"atencao"`; `(0, 0)` → `"ok"`.
- [ ] **Step 2: Rodar e ver falhar** — `teste src/lib/rastreio/entregas.test.ts`. Expected: FAIL, `Cannot find module './entregas'`.
- [ ] **Step 3: Implementar `entregas.ts`.** Rótulos (`Record<Etapa, …>`, para o `tsc` cobrar etapa nova): situação/novidade — `aguardando_pagamento` "Aguardando pagamento"/idem, `confirmado` "Pagamento confirmado"/idem, `separando` "Em separação"/"Em separação", `enviado` "A caminho"/"Postado", `retirada` "Pronto para retirada"/"Na agência", `problema` "Problema na entrega"/"Falha na entrega", `entregue` "Entregue"/"Entregue", `cancelado` "Cancelado"/idem. Novidade = `${rótulo} · ${diaMesBR(etapaAt)}`. Avisos: WhatsApp `lido|entregue|enviado` → "WhatsApp lido|entregue|enviado", `pendente|enviando` → "WhatsApp na fila", `falhou` → "WhatsApp falhou" (`falhou: true`), `pulado` fora; e-mail `enviado|entregue|lido` → "e-mail enviado", `pendente|enviando` → "e-mail na fila", `falhou` → "e-mail falhou" (`falhou: true`). `diasSemCodigo` = `floor((agora − etapaAt) / 86_400_000)` só se a condição da Task 2 (`sem_codigo`) vale e o resultado é ≥ `DIAS_SEM_CODIGO`. `podeReenviar` = `etapa ∈ ETAPAS_COM_AVISO`.
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/lib/rastreio/entregas.ts apps/web/src/lib/rastreio/entregas.test.ts
git commit -m "feat(rastreio): pure rules for the deliveries screen" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Store de leitura das Entregas

**Files:**
- Create: `lib/stores/rastreio-entregas.ts`, `lib/stores/rastreio-entregas.test.ts`

**Interfaces:**
- Consumes: `getSupabaseAdmin`; `normalizarDocumento`, `docHmac`, `pepperDoRastreio` de `@/lib/rastreio/documento` (PR 2); `dayBR` de `@/lib/date-br`; tipos e constantes da Task 1.
- Produces (`server-only`):
  - `type ConsultaDeEntregas = { filtro: FiltroDeEntregas; busca: string | null; pedidoId: string | null; pagina: number; agora: Date }`
  - `listarEntregas(tenantId: string, c: ConsultaDeEntregas): Promise<{ pedidos: PedidoDaLista[]; avisos: AvisoDoPedido[]; total: number }>`
  - `numerosDasEntregas(tenantId: string, agora: Date): Promise<NumerosDasEntregas>`
  - `saudeDoCodigo(tenantId: string, agora: Date): Promise<SaudeDoCodigo>`

A regra do escopo vive num `escopo(query, filtro, agora)` só, usado pela lista e pelo HEAD de cada chip (os dois nunca discordam). Sempre `tenant_id` e `etapa_at ≥ agora − 30 dias`, mais:

| Filtro | Condição |
|---|---|
| `todos` | `etapa ∈ {enviado, retirada, problema, entregue}` **ou** `sem_codigo` (um `.or()`) |
| `a_caminho` | `etapa ∈ {enviado, retirada}` |
| `sem_codigo` | `etapa = separando`, `tracking_code is null`, `status_raw ∈ STATUS_FATURADO`, `etapa_at ≤ agora − 2 dias` |
| `problema` / `entregues` | `etapa = problema` / `etapa = entregue` |
| `whatsapp_falhou` | `todos` + embed `tracking_notices!inner(id)` com `channel = whatsapp`, `status = falhou`, `tenant_id` |

- [ ] **Step 1: Escrever os testes que falham** (`rastreio-entregas.test.ts`; molde `leads.test.ts`: PostgREST falso, `RASTREIO_DOC_PEPPER = "p".repeat(32)` antes do import dinâmico; `AGORA = 2026-10-29T15:00:00.000Z`; loja `loja-a`):
  - `"lista: loja, janela de 30 dias, ordem e página"`: `pagina: 2`, resposta com `Content-Range 25-49/61` → pedido `GET /rest/v1/tracking_orders` com `tenant_id=eq.loja-a`, `etapa_at` incluindo `gte.2026-09-29T15:00:00.000Z`, `order=etapa_at.desc`, `offset=25`, `limit=25`, `Prefer` com `count=exact`; `total === 61`.
  - `"cada filtro vira a condição da tabela, e o chip usa a mesma"`: valores exatos — `a_caminho` `etapa=in.(enviado,retirada)`; `problema` `etapa=eq.problema`; `entregues` `etapa=eq.entregue`; `sem_codigo` `etapa=eq.separando`, `tracking_code=is.null`, `status_raw=in.(invoiced,ready_for_shipping,on_carriage)`, `etapa_at` com `lte.2026-10-27T15:00:00.000Z`; `todos` `or=(etapa.in.(enviado,retirada,problema,entregue),and(etapa.eq.separando,tracking_code.is.null,status_raw.in.(invoiced,ready_for_shipping,on_carriage),etapa_at.lte.2026-10-27T15:00:00.000Z))`. Para `todos`, `a_caminho`, `sem_codigo`, `problema` e `whatsapp_falhou`: os filtros da lista (sem `select`, `order`, `offset`, `limit`) `deepEqual` aos do HEAD do mesmo chip em `numerosDasEntregas`.
  - `"WhatsApp falhou junta com os avisos da própria loja"`: `select` com `tracking_notices!inner(id)`; `tracking_notices.channel=eq.whatsapp`, `tracking_notices.status=eq.falhou`, `tracking_notices.tenant_id=eq.loja-a`.
  - `"busca: documento, número ou primeiro nome"`: `"111.444.777-35"` → `doc_hmac=eq.${docHmac("11144477735", PEPPER)}` e nenhum `numero`/`buyer_first_name`; `"#1541"` → `numero=ilike.1541%`; `"Ana Paula"` → `buyer_first_name=ilike.Ana%`; `"50%_x"` → `buyer_first_name=ilike.50\%\_x%` (curinga escapado).
  - `"documento sem pepper falha sem consultar o banco"`: sem `RASTREIO_DOC_PEPPER`, `busca "11144477735"` rejeita `/RASTREIO_DOC_PEPPER/` e o PostgREST falso recebe **zero** pedidos (mutante: cair na busca por nome).
  - `"pedido do sininho: só loja e id, sem janela"`: `pedidoId` → só `tenant_id=eq.loja-a` e `id=eq.<uuid>`; nenhum `etapa_at`.
  - `"avisos da página numa consulta só"`: pedidos `p1`, `p2` → `GET /rest/v1/tracking_notices` com `tenant_id=eq.loja-a` e `order_id=in.(p1,p2)`; página vazia → nenhuma consulta de avisos.
  - `"números do topo"`: 8 HEAD (todos, a caminho, sem código, problema, WhatsApp falhou, entregues em 7 dias, avisos hoje por canal), todos com `tenant_id=eq.loja-a` e `Prefer count=exact`; o falso responde o `Content-Range` pelo predicado e o resultado é `{ todos: 29, aCaminho: 23, semCodigo: 4, problema: 2, whatsappFalhou: 1, entreguesEm7Dias: 41, avisosHoje: { whatsapp: 12, email: 6 } }`. Avisos de hoje: `status=in.(enviado,entregue,lido)`, `sent_at=gte.2026-10-29T03:00:00.000Z`; com `agora = 2026-10-29T02:30:00.000Z` (ainda 28/10 em Brasília) → `gte.2026-10-28T03:00:00.000Z` (mutante: meia-noite UTC). Entregues: `etapa=eq.entregue`, `etapa_at=gte.2026-10-22T15:00:00.000Z`.
  - `"contagem que não veio é erro, nunca zero"`: 404 vazio → `numerosDasEntregas` rejeita `/204/` (mutante: `count ?? 0`).
  - `"saúde do código"`: base `or=(etapa.in.(enviado,retirada,problema,entregue),and(etapa.eq.separando,status_raw.eq.on_carriage))` + `etapa_at=gte.2026-10-22T15:00:00.000Z`; o HEAD de "com código" soma `tracking_code=not.is.null`; o mais antigo usa a condição de `sem_codigo`, `order=etapa_at.asc`, `limit=1`. Resultado `{ enviados: 15, comCodigo: 14, maisAntigoSemCodigo: { id: "p9", numero: "1539", desde: "2026-10-25T15:00:00.000Z" } }`; sem linha → `null`.
- [ ] **Step 2: Rodar e ver falhar** — Expected: FAIL, módulo ausente.
- [ ] **Step 3: Implementar.** Colunas: `id, numero, buyer_first_name, buyer_phone, etapa, etapa_at, tracking_code, status_raw, link_token`. `escaparLike(t)`: `\`, `%`, `_` com barra antes. Classificar `busca` na ordem: `normalizarDocumento` ≠ null → HMAC (chama `pepperDoRastreio()` **antes** de qualquer consulta); só dígitos (com `#` opcional) → `numero ilike`; senão primeira palavra (≥ 2 caracteres) → `buyer_first_name ilike`. Com `pedidoId`, ignora filtro, busca e janela. Início do dia de Brasília = `${dayBR(agora)}T03:00:00.000Z` (`// ponytail: UTC−3 fixo desde 2019`). Avisos: no máximo 10 por pedido (5 etapas × 2 canais), cabem nas 1000 linhas.
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** (`git add` dos dois arquivos; `feat(rastreio): deliveries store with head counts`).

### Task 3: Guarda das rotas, mundo falso e lista de Entregas

**Files:**
- Create: `lib/rastreio/rota-painel.ts`, `test/rastreio-painel-falso.ts`, `app/api/rastreio/entregas/route.ts`, `app/api/rastreio/entregas/route.test.ts`

**Interfaces:**
- Consumes: `getRouteTenantContext` (`@/lib/route-tenant-context`), `hasPermission`, `rastreioLigado` (PR 1), `lojaDoRastreio` e `linkDoPedido` (PR 2), `resposta` e `falhou` de `@/lib/bio/painel-api`, Tasks 1 e 2.
- Produces:
  - `RASTREIO_DISABLED = { error: "O Rastreio de pedidos não está liberado para esta loja.", code: "rastreio_disabled" }`; `lojaDoRastreioNoPainel(req: Request, opcoes?: { exigirLigado?: boolean }): Promise<{ tenantId: string } | Response>` — `allowEngine: false`; sem `settings:connection` → 403 `{ error: "Sem permissão para esta ação." }`; `exigirLigado` (padrão `true`) e módulo desligado → 403 `RASTREIO_DISABLED`; `Response` lançada pelo contexto (401, ou 403 `MENSAGEM_BLOQUEIO` da vendedora) é devolvida como está.
  - `servirRastreio(estado: { chamadas: Chamada[]; papel: () => string; tabelas: () => Record<string, Resposta> }): { doBanco(): Chamada[]; escritas(): Chamada[] }`, molde `servirCartao`: PostgREST falso em `before`/`after`; responde sozinho `/auth/v1/user` e `/rest/v1/memberships` (`tenant_id: "loja-b"`, `role: papel()`, `modules: []`); o resto por `"<MÉTODO> /rest/v1/<tabela>"` → corpo ou `(c) => { status; corpo?; contentRange? }`; ausente → 500 `inesperado: …`. `doBanco()` = chamadas a `/rest/v1/` menos `memberships`; `escritas()` = método ≠ GET/HEAD.
  - `GET|POST /api/rastreio/entregas` → 200 `RespostaDeEntregas`. POST: corpo `{ filtro?, busca?, pagina?, pedido? }`; GET: query `filtro`, `pagina`, `pedido` (**ignora** `busca`). `pagina` fora de 1..400 → 1; `busca` cortada em 80 caracteres; `pedido` que não é uuid → 400 `{ error: "Pedido inválido." }`. Roda `listarEntregas`, `numerosDasEntregas` e `lojaDoRastreio` em paralelo; `link` = `linkDoPedido(loja, linkToken)` (`null` sem loja).

- [ ] **Step 1: Escrever o falso e os testes que falham** (`route.test.ts`; `lojaDoRastreio` do PR 2 lê `tracking_settings`, domínio, perfil e bio: na maioria dos testes o falso devolve `[]` para `tracking_settings`, a loja vem nula e `link` é `null`):
  - `"dono lista as entregas da própria loja"`: POST `{ filtro: "problema", pagina: 1 }` → 200; `linhas[0].numero`, `numeros.problema` dos HEAD; todos os pedidos às tabelas `tracking_*` com `tenant_id=eq.loja-b`; `Cache-Control: no-store`.
  - `"link do pedido na linha"`: com a config da loja em `tracking_settings` (`public_slug "loja-exemplo"`) e as linhas mínimas que os stores de domínio, perfil e bio pedem → `link` `https://www.girumo.com.br/rastreio/loja-exemplo/<link_token>`.
  - `"telefone só na linha de problema"`: linha `problema` traz `telefone`; linha `enviado` traz `telefone: null`; a resposta inteira não contém `buyer_email_enc` nem `doc_hmac`.
  - `"GET ignora a busca"`: `GET ?filtro=sem_codigo&busca=11144477735` → a consulta de pedidos não tem `doc_hmac` (documento não anda em URL).
  - `"erro de busca não vaza o documento no log"`: sem pepper, POST `{ busca: "11144477735" }` → 500 `{ error: "Não deu para buscar as entregas." }` e `console.error` (espiado) sem `11144477735`.
  - `"vendedora recebe o 403 do mapa"`: `papel "seller"` → 403, corpo `MENSAGEM_BLOQUEIO`, nenhum acesso a `tenant_settings` nem `tracking_*`.
  - `"operador não tem settings:connection"`: 403 `{ error: "Sem permissão para esta ação." }`, nenhum acesso a `tracking_*`.
  - `"módulo desligado: 403 e nenhuma leitura de pedido"`: `tenant_settings` com `rastreio_enabled: false` → 403 `RASTREIO_DISABLED`.
  - `"pedido que não é uuid"` → 400.
- [ ] **Step 2: Rodar e ver falhar** — Expected: FAIL, módulos ausentes.
- [ ] **Step 3: Implementar** os três módulos. Falha inesperada: `falhou("api/rastreio/entregas", tenantId, e, "Não deu para buscar as entregas.")` (log só com a mensagem do erro, nunca o corpo).
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** (`feat(rastreio): deliveries list route and painel guard`).

### Task 4: `POST /api/rastreio/entregas/[id]/reenviar`

**Files:**
- Create: `app/api/rastreio/entregas/[id]/reenviar/route.ts`, `route.test.ts`

**Interfaces:**
- Consumes: `lojaDoRastreioNoPainel`; `lerPedido` (`@/lib/stores/rastreio-pedidos`), `lerConfig` (`rastreio-config`), `reabrirAvisos` (`rastreio-avisos`), `ETAPAS_COM_AVISO`.
- Produces: `POST` → 200 `{ reabertos: number; canais: Canal[] }`. Ordem das recusas: `id` não uuid → 400 "Pedido inválido."; `lerPedido` nulo (inclui pedido de outra loja) → 404 "Pedido não encontrado."; `noticesStoppedAt` → 409 `{ error: "A compradora pediu para parar os avisos deste pedido.", code: "avisos_parados" }`; etapa fora de `ETAPAS_COM_AVISO` → 409 `{ error: "Este pedido não está numa etapa com aviso.", code: "etapa_sem_aviso" }`; canais = os ligados na matriz da etapa **e** com contato (`whatsapp` com `buyerPhone`, `email` com `buyerEmailEnc`); vazio (ou loja sem config) → 409 `{ error: "Nenhum canal ligado tem contato da compradora nesta etapa.", code: "sem_canal" }`. Só então `reabrirAvisos(tenantId, id, etapa, canais)`. O envio sai pelo cron (até 5 min); a rota não envia.

- [ ] **Step 1: Escrever os testes que falham:** pedido `enviado` com telefone, e-mail e matriz `enviado: { whatsapp: true, email: true }` → 200 `{ canais: ["whatsapp","email"] }` e escrita em `tracking_notices` com `loja-b`; matriz só e-mail → `canais: ["email"]`; `notices_stopped_at` preenchido → 409 `avisos_parados` e `escritas()` vazio; etapa `separando` → 409 `etapa_sem_aviso` e `escritas()` vazio; sem telefone nem e-mail → 409 `sem_canal`; **pedido de outra loja** (o falso só devolve o pedido com `tenant_id=eq.loja-b`) → 404 e `escritas()` vazio; vendedora → 403 `MENSAGEM_BLOQUEIO`; operador → 403.
- [ ] **Step 2: Rodar e ver falhar.** **Step 3: Implementar.** **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** (`feat(rastreio): resend the notice of the current stage`).

### Task 5: `GET /api/rastreio/saude`

**Files:**
- Create: `app/api/rastreio/saude/route.ts`, `route.test.ts`

**Interfaces:**
- Consumes: `lojaDoRastreioNoPainel`, `saudeDoCodigo` (Task 2). Produces: `GET` → 200 `SaudeDoCodigo`, `Cache-Control: no-store`.

- [ ] **Step 1: Testes que falham:** dono → 200 com `{ enviados: 15, comCodigo: 14, maisAntigoSemCodigo: { numero: "1539", … } }` (HEAD e GET com `tenant_id=eq.loja-b`); sem pedido sem código → `maisAntigoSemCodigo: null`; módulo desligado → 403 `rastreio_disabled`; operador → 403; vendedora → 403 `MENSAGEM_BLOQUEIO`.
- [ ] **Step 2: Rodar e ver falhar.** **Step 3: Implementar.** **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** (`feat(rastreio): code health route`).

---

## Parte 2 — Liberação

### Task 6: `GET /api/rastreio/status` e `setRastreioEnabled`

**Files:**
- Create: `app/api/rastreio/status/route.ts`, `route.test.ts`, `lib/stores/tenant-settings-rastreio.test.ts`
- Modify: `lib/stores/tenant-settings.ts`

**Interfaces:**
- Produces: `setRastreioEnabled(tenantId: string, enabled: boolean): Promise<void>` — molde exato de `setInstagramEnabled`: upsert `{ tenant_id, rastreio_enabled, updated_at }` com `onConflict: "tenant_id"`, service-role (o trigger do B·1a só deixa o servidor escrever); erro lança. `GET /api/rastreio/status` → 200 `{ enabled: boolean }` (`lojaDoRastreioNoPainel(req, { exigirLigado: false })` + `rastreioLigado`).

- [ ] **Step 1: Testes que falham:** `setRastreioEnabled("loja-a", true)` → `POST /rest/v1/tenant_settings`, `on_conflict=tenant_id`, `Prefer` com `resolution=merge-duplicates`, corpo com exatamente as chaves `tenant_id: "loja-a"`, `rastreio_enabled: true`, `updated_at` (string); erro 500 → rejeita com a mensagem. Rota: dono com flag ligada → `{ enabled: true }`; desligada → 200 `{ enabled: false }`; operador → 403; vendedora → 403 `MENSAGEM_BLOQUEIO`.
- [ ] **Step 2: Rodar e ver falhar.** **Step 3: Implementar.** **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** (`feat(rastreio): status route and rastreio_enabled setter`).

### Task 7: Admin liga e desliga o Rastreio da loja

**Files:**
- Create: `app/api/admin/tenants/[id]/rastreio/route.ts`, `components/admin/tenant-rastreio.tsx`
- Modify: `app/admin/tenants/[id]/page.tsx`

**Interfaces:**
- Consumes: `getAdminContext`, `setRastreioEnabled`, `rastreioLigado`.
- Produces: `POST /api/admin/tenants/[id]/rastreio` com `{ enabled: boolean }` → `{ enabled }`; `TenantRastreio({ tenantId, enabled }: { tenantId: string; enabled: boolean | null })`.

Molde: `[id]/plan/route.ts` e `[id]/instagram-invite/route.ts` (não existe botão que ligue `instagram_enabled`: só o webhook do Stripe e SQL à mão). A rota: sem admin → 401; id fora do formato uuid ou loja inexistente (`organizations`) → 404 "Tenant não encontrado."; corpo fora de `{ enabled: boolean }` → 400 "Corpo inválido."; grava; insere em `logs` (`event: "admin.rastreio.liberacao"`, `level: "warn"`, `metadata: { admin_email, enabled }`; falha de log só vai ao console, como nas rotas vizinhas). O componente: `role="switch"` com `aria-label="Rastreio de pedidos liberado"` e `aria-checked`, texto "Libera Configurações › Rastreio de pedidos, Vendas › Entregas e os avisos de pedido pelo número do atendimento. Sem cobrança na v1: os avisos saem só para loja com plano ativo."; `enabled === null` (leitura falhou) → interruptor desabilitado e "Não deu para ler o estado."; depois do POST, `router.refresh()`. Na página: `rastreioLigado(id).catch(() => null)` e `<TenantRastreio …/>` abaixo de `<TenantInstagramInvite />`.

**Regra de liberação (não-negociável):** nenhuma loja ganha `rastreio_enabled` — por este botão ou por SQL à mão — antes do
merge do B·2a em `main` **e** do redeploy do worker no Coolify: o worker antigo escolheria o número do atendimento para
o auto-grow e as ações em massa. O código do botão pode ir a `main` antes; a primeira loja ligada, não. O redeploy é passo
manual do Igor: confirmar os dois antes do Step 3 e antes de ligar a loja-piloto.

- [ ] **Step 1: Sem teste automático novo** (o repositório não testa rotas de admin: `getAdminContext` exige sessão assinada; a parte com regra está em `setRastreioEnabled`, Task 6). Implementar os três arquivos.
- [ ] **Step 2: Rodar** `app/admin/admin-pages-guard.test.ts` (continua verde) e os dois `tsc`.
- [ ] **Step 3: Conferir em dev** (a tela local aponta para o Supabase de dev; vale a regra de liberação acima): ligar a loja de QA em `/admin/tenants/<id>`, depois, de `apps/web`: `supabase db query --linked "select rastreio_enabled from tenant_settings where tenant_id = '<id>'"`. Expected: `true`; desligar → `false`.
- [ ] **Step 4: Commit** (`feat(admin): switch rastreio on and off per store`).

### Task 8: `Liberacao "rastreio"`, permissão no item e a casca

**Files:**
- Modify: `lib/painel-nav.ts`, `lib/painel-nav.test.ts`, `components/painel/casca-context.tsx`
- Create: `components/painel/rastreio/use-rastreio-liberado.ts`

**Interfaces:**
- Produces: `Liberacao = "instagram" | "rastreio"`; `NavItem.permissao?: Action` (de `@/lib/permissions`). `visivelNoMenu`: item com `permissao` só aparece a papel que a tem (`hasPermission(acesso.role, item.permissao)`), e **nunca** com `acesso === null`; a vendedora segue vendo só item com `modulo`. `useRastreioLiberado(): boolean` = `carregado && acesso !== null && can("settings:connection") && liberacoes?.rastreio === true` (`useRole` + `useCasca`). A casca (`CascaProvider`) pergunta `GET /api/rastreio/status` só quando `carregado && acesso && hasPermission(acesso.role, "settings:connection")` (operador e vendedora não perguntam); falha ou resposta torta → `false`; `liberacoes = instagram ? { instagram: instagram.enabled, rastreio: rastreio === true } : null`.

- [ ] **Step 1: Escrever os testes que falham** (`painel-nav.test.ts`, item sintético `{ href: "/x", label: "X", icon: Link2, grupo: "vender", requer: "rastreio", permissao: "settings:connection" }`): dono e admin com `{ instagram: false, rastreio: true }` → `true`; dono com `rastreio: false` → `false`; **operador** com `rastreio: true` → `false`; vendedora (com e sem `postar`) → `false`; `acesso null` → `false`; `liberacoes null` → `false`. Os literais `{ instagram: … }` já no arquivo ganham `rastreio: false` (o `tsc` aponta onde).
- [ ] **Step 2: Rodar e ver falhar** (`teste src/lib/painel-nav.test.ts`). Expected: FAIL nos casos novos.
- [ ] **Step 3: Implementar** os quatro arquivos.
- [ ] **Step 4: Rodar e ver passar**, mais os dois `tsc` e `npm --workspace apps/web run lint` (o tipo `Liberacoes` mudou).
- [ ] **Step 5: Commit** (`feat(painel): rastreio release flag in the shell and nav`).

---

## Parte 3 — Rota da configuração

### Task 9: Regras e rota de `GET/PATCH /api/rastreio/config`

**Files:**
- Create: `lib/rastreio/config-painel.ts`, `config-painel.test.ts`, `app/api/rastreio/config/route.ts`, `route.test.ts`
- Modify: `lib/bio/conferir.ts`, `lib/bio/conferir.test.ts`

**Interfaces:**
- Consumes: `garantirConfig`, `salvarConfig`, `SlugEmUso` (`@/lib/stores/rastreio-config`, PR 1); `lojaDoRastreio`, `linkDaBusca` (PR 2); `conexaoYampiAtiva` (`@/lib/yampi/conexao`, B·6b: a conexão `ativa` ou `aviso_desativado`, `null` no resto) e o tipo `ConexaoYampi` (`@/lib/yampi/tipos`); `getTrackedLinkById`, `listTrackedLinks`; `SLUG_BIO`, `slugReservado` de `@/lib/bio/documento`; `normalizeWhatsappBR`; `MatrizAvisos`, `ETAPAS_COM_AVISO`.
- Produces:
  - `config-painel.ts` (puro): `corpoDoPatchDaConfig` (zod `strictObject` parcial, ≥ 1 chave): `publicSlug` (formato + reservado), `matrix` (**completa**: as 5 etapas de `ETAPAS_COM_AVISO`, cada uma `{ whatsapp: boolean, email: boolean }`, sem etapa extra), `notifyStoreOnProblem`, `vipLinkId` (`uuid | null`, minúsculo), `storeWhatsapp` (`string | null`; vazio → `null`; senão `normalizeWhatsappBR` sem o `+`, isto é, `55` + DDD + número, o formato que os PRs 3 e 5 esperam); `erroDoPatchDaConfig(e: z.ZodError): { error: string; campo: string }` (`campo` = primeira chave do caminho; chave desconhecida → `"corpo"`); `alternarCanal(m: MatrizAvisos, etapa: EtapaComAviso, canal: Canal): MatrizAvisos` (cópia nova); `NUMERO_DA_LOJA_CONECTADO`; `type RespostaDaConfig = { config: Omit<RastreioConfig, "tenantId" | "sweepCursor">; linkDaBusca: string | null; loja: string | null; yampi: ConexaoYampi["status"] | null; linksDeConvite: { id: string; slug: string }[] }` (o contrato do PR 1 traz `{ config, linkDaBusca }`; o resto é acréscimo).
  - `conferir.ts`: `numeroEhDeInstanciaDaLoja(tenantId: string, numero: string): Promise<boolean>` (reusa `chavesDasInstancias` + `ehDaLoja`, hoje privadas; comparação por `chaveDoTelefone`, com e sem nono dígito).
  - Rotas: `GET` → 200 `RespostaDaConfig` (`garantirConfig` cria com os padrões, como o PR 1 documenta; `linksDeConvite` = `listTrackedLinks` só com `campaign_group_id`, por `slug`, máx. 200; `yampi` = o `status` de `conexaoYampiAtiva`, isto é, `ativa`, `aviso_desativado` ou `null`: sem conexão, `credencial_invalida` e `desconectada` caem em `null`). `PATCH` → `garantirConfig` (o `salvarConfig` do PR 1 falha sem linha), depois `salvarConfig`, e responde como o GET. Recusas `400 { error, campo }`; `SlugEmUso` → `409 { error: "Esse endereço já está em uso. Escolha outro.", campo: "publicSlug" }`.

Mensagens (exatas): formato "Use de 3 a 40 letras minúsculas, números e hífen, sem espaço nem acento."; reservado "Esse endereço é reservado. Escolha outro."; matriz "Escolha os avisos de todas as etapas."; link do VIP "Esse link não é da sua loja."; número "Informe um WhatsApp com DDD, ex.: (11) 91234-5678."; `NUMERO_DA_LOJA_CONECTADO` "Esse número está conectado na Girumo (grupos ou avisos). Informe o WhatsApp onde você atende as clientes." (o `NUMERO_CONECTADO` do bio diz "Use o número de atendimento", que aqui seria o chip).

- [ ] **Step 1: Escrever os testes que falham:**
  - `config-painel.test.ts`: matriz sem `entregue` → erro com `campo "matrix"`; matriz com `aguardando_pagamento` → erro; `alternarCanal` devolve objeto novo e não muda o original; `publicSlug: "AB"` → formato (`campo "publicSlug"`); `"loja-girumo"` → reservado; `storeWhatsapp: ""` → `null`; `"(11) 91234-5678"` → `"5511912345678"`; `"123"` → erro; corpo `{}` → erro.
  - `conferir.test.ts`: instância com `5511912345678` → `numeroEhDeInstanciaDaLoja(LOJA, "(11) 91234-5678")` e `"11 1234-5678"` (sem nono dígito) `true`; outro número `false`; a consulta a `instances` leva `tenant_id=eq.<loja>`.
  - `route.test.ts`: GET dono → `config`, `linkDaBusca`, `linksDeConvite` só da loja (`tracked_links` com `tenant_id=eq.loja-b`), `yampi: null` sem conexão; PATCH em loja sem config cria antes (POST em `tracking_settings` antes da escrita); PATCH com matriz parcial (só `enviado`) → 400 `campo "matrix"` e `escritas()` vazio; `publicSlug: "loja-girumo"` → 400 reservado; `vipLinkId` de outra loja (falso devolve `[]` para `tenant_id=eq.loja-b`) → 400 "Esse link não é da sua loja."; `storeWhatsapp` igual ao telefone de uma instância → 400 `NUMERO_DA_LOJA_CONECTADO`; `storeWhatsapp: ""` grava `null` (corpo da escrita contém `"store_whatsapp":null`); escrita que o banco recusa com 409 `23505` e `message` `duplicate key value violates unique constraint "tracking_settings_public_slug_key"` (o `salvarConfig` real lança `SlugEmUso`) → 409 `campo "publicSlug"`; vendedora → 403 `MENSAGEM_BLOQUEIO`; operador → 403; módulo desligado → 403 `RASTREIO_DISABLED`.
- [ ] **Step 2: Rodar e ver falhar** (três arquivos). **Step 3: Implementar.** **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** (`feat(rastreio): config route with slug, matrix and store number checks`).

---

## Parte 4 — Configurações › Rastreio de pedidos

### Task 10: A porta e a tela

**Files:**
- Modify: `lib/painel/configuracoes.ts`, `lib/painel/configuracoes.test.ts`, `components/painel/configuracoes/vitrine/configuracoes-vitrine.tsx`, `app/painel/configuracoes/page.tsx`
- Create: `components/painel/rastreio/rastreio-config.tsx` (estado e chamadas), `rastreio-config-painel.tsx` (desenho), `matriz-de-avisos.tsx`, `rastreio-config-painel.test.ts`, `lib/rastreio/previas.ts`, `e2e/painel-rastreio-config.spec.ts`

**Interfaces:**
- Consumes: `RespostaDaConfig`, `alternarCanal`; `useRastreioLiberado`; `CartaoNumeroDoAtendimento` de `@/components/privado/cartao-numero-do-atendimento` (B·2b; sem props: lê `GET /api/privado/numero` sozinho e some quando a loja não tem nenhum dos dois add-ons; a tela só o importa e renderiza; o horário do número mora nesse cartão, **não** criar editor de horário); `authenticatedFetch`, `useToast`.
- Produces: `Porta` ganha `"Rastreio de pedidos"`; `portasVisiveis(e: { rastreio: boolean }): Porta[]`; `resumoDasPortas(...)["Rastreio de pedidos"]` = `null` (o estado do número é do cartão); `SECAO_POR_SLUG.rastreio`; `RastreioConfiguracoes()` (sem props); `PainelDoRastreio(props: { dados: RespostaDaConfig; cartaoDoNumero: React.ReactNode; salvando: string | null; erro: string | null; aoAlternar(etapa: EtapaComAviso, canal: Canal): void; aoAlternarProblema(): void; aoSalvarNumero(v: string): void; aoEscolherConvite(id: string | null): void; aoCopiar(): void })`; `previaDoWhatsapp(etapa: EtapaComAviso, d: DadosDaPrevia): string | null`, `previaDoEmail(etapa, d): { assunto: string; texto: string } | null`.

Comportamento. **Porta:** ordem `Conexão, Integrações, Rastreio de pedidos, Equipe, Notificações, Plano, Conta`; a de Rastreio só com `useRastreioLiberado()`; `?secao=rastreio` sem liberação mostra, no corpo, "O Rastreio de pedidos ainda não foi liberado para a sua loja." (403 `rastreio_disabled` da rota de config). **Tela** (`data-testid="rastreio-config"`; textos do mockup): cartão do número (`<CartaoNumeroDoAtendimento />`, passado em `cartaoDoNumero`); aviso de Yampi (`yampi: null` → "Conecte a Yampi para os pedidos chegarem aqui." + link "Conectar a Yampi" para `/painel/configuracoes?secao=integracoes`; status ≠ `ativa` → "A conexão com a Yampi precisa de atenção." + "Abrir Integrações"); `importedAt: null` → "Importando os pedidos dos últimos 30 dias. Em poucos minutos eles aparecem em Entregas."; seção "Avisos automáticos" (`aria-labelledby`), tabela com `scope`, linhas "Pedido confirmado", "Pedido enviado", "Pronto para retirada", "Problema na entrega", "Entregue" e interruptores `aria-label="WhatsApp em <linha>"` / `"E-mail em <linha>"` (`role="switch"`, `aria-checked`, `.pn-interruptor`); alerta do e-mail repetido; interruptor "Me avisar quando um pedido tiver problema na entrega"; seção "Página de rastreio": link (`linkDaBusca`, mono), "Copiar" (`navigator.clipboard`; toast "Link copiado", ou "Não deu para copiar. Selecione o link e copie." se o navegador recusar), "Abrir" (`target="_blank" rel="noopener noreferrer"`), campo "WhatsApp da loja" (`type="tel"`, ajuda: "Aparece como “Falar com a loja” na página e no aviso de entregue. Vazio: o botão some."), convite do VIP (interruptor + `<select>` com rótulo "Link do convite"; sem links de campanha, desabilitado com "Crie uma campanha com link para oferecer o convite"). Cada mudança manda `PATCH` (matriz sempre inteira, vinda de `alternarCanal`), atualiza otimista e volta ao estado anterior com `role="alert"` se falhar. Não há campo de endereço (spec §5 não lista; a rota aceita `publicSlug`).

- [ ] **Step 1: Escrever os testes que falham:** `configuracoes.test.ts` — `portasVisiveis({ rastreio: false })` = as seis de hoje; `{ rastreio: true }` = `["Conexão","Integrações","Rastreio de pedidos","Equipe","Notificações","Plano","Conta"]`; `resumoDasPortas(leitura())["Rastreio de pedidos"] === null`. `rastreio-config-painel.test.ts` — com `dados` de fixture ("Loja Exemplo", matriz padrão do índice): botões `role="switch"` com os `aria-label` acima e `aria-checked` iguais à matriz (`enviado.whatsapp` `true`, `confirmado.email` `false`, `entregue.email` `false`); o `<h3>` das duas seções; `yampi: null` → texto "Conecte a Yampi" e `href="/painel/configuracoes?secao=integracoes"`; `yampi: "ativa"` → sem o aviso; `importedAt: null` → "Importando os pedidos"; `linkDaBusca` visível; `linksDeConvite: []` → select desabilitado. Sem Yampi o link de Abrir ainda aparece.
- [ ] **Step 2: Rodar e ver falhar** (os dois arquivos). Expected: FAIL, exports ausentes.
- [ ] **Step 3: Implementar** porta, tela e a ligação (`configuracoes-vitrine.tsx` troca a constante `PORTAS` por `portasVisiveis` e renderiza `<RastreioConfiguracoes />`; `page.tsx` acrescenta `rastreio: "Rastreio de pedidos"` ao `SECAO_POR_SLUG`).
- [ ] **Step 4: "Ver mensagem" (`lib/rastreio/previas.ts`).** Fontes: `mensagemWhatsapp` (PR 5) e `montarEmailDoAviso` (PR 4). Conferir o que está em `main`: existe → a função chama a fonte com `DADOS_DE_EXEMPLO` (`primeiroNome "Ana"`, `numero "1541"`, `loja` = nome da loja, `servico "PAC"`, `codigo "AB123456789BR"`, `link` = `linkDaBusca`, `numeroDaLoja` = `storeWhatsapp ? formatPhoneBR(storeWhatsapp) : null`, como o envio do PR 5) e o teste afirma o início exato do texto do índice (enviado: `"Oi, Ana! Seu pedido nº 1541 da Loja Exemplo foi enviado (PAC). Código de rastreio: AB123456789BR. Acompanhe aqui: "`); não existe → a função devolve `null` e o teste afirma `null`. A coluna "Mensagem" com o link "Ver mensagem" (abre `Folha` com o texto) só é desenhada quando alguma das duas devolve algo. Registrar na descrição do PR qual fonte faltava (ver "Interface com os outros PRs").
- [ ] **Step 5: e2e curto** (`painel-rastreio-config.spec.ts`; exige login de QA): `page.route` em `**/api/rastreio/status` (`{ enabled: true }`) e `**/api/rastreio/config` (GET devolve fixture; PATCH guarda o corpo e devolve a fixture com a mudança); abrir `/painel/configuracoes?secao=rastreio`; clicar `getByRole("switch", { name: "WhatsApp em Pedido enviado" })`; Expected: o PATCH recebido tem `matrix` com as 5 etapas e `matrix.enviado.whatsapp === false`.
- [ ] **Step 6: Rodar** testes, os dois `tsc`, lint. **Step 7: Commit** (`feat(painel): Configurações › Rastreio de pedidos`).

---

## Parte 5 — Vendas › Entregas e bloco da Yampi

### Task 11: A tabela densa

**Files:**
- Create: `components/painel/rastreio/entregas-tabela.tsx`, `entregas-tabela.test.ts`

**Interfaces:**
- Consumes: `RespostaDeEntregas`, `LinhaDeEntrega`, `rotuloDaSituacao`, `novidadeDaLinha`, `FILTROS`.
- Produces: `TabelaDeEntregas(props: { resposta: RespostaDeEntregas; filtro: FiltroDeEntregas; busca: string; carregando: boolean; erro: string | null; aoFiltrar(f: FiltroDeEntregas): void; aoBuscar(b: string): void; aoPaginar(p: number): void; aoReenviar(l: LinhaDeEntrega): void; reenviando: string | null })`.

Desenho (mockup `Entregas`, painel denso, sem metáfora): cinco cartões de números ("A caminho" · "enviados, ainda não entregues"; "Sem código há +2 dias" · "faturados sem rastreio"; "Problema na entrega" · "a transportadora não conseguiu entregar"; "Entregues em 7 dias"; "Avisos hoje" · "N WhatsApp · M e-mail"); chips `aria-pressed` ("Todos · N", "A caminho · N", "Sem código · N", "Problema · N", "Entregues", "WhatsApp falhou · N" só se N > 0 ou ativo); `<input type="search">` com rótulo "Buscar pedido" e placeholder "Buscar por nº, nome ou CPF/CNPJ"; tabela com `<caption class="sr-only">` e colunas Pedido · Compradora (só o primeiro nome ou "—") · Situação (`.pn-chip`) · Código (mono, "—") · Última novidade · Avisos (parte `falhou` em negrito, o texto já diz "falhou") · coluna "Ação" (`sr-only` no cabeçalho): "Ver" (`link`, nova aba, só se houver), "Chamar compradora" (`https://wa.me/<telefone>`, só com `telefone`), "Reenviar aviso" (botão, só com `podeReenviar`); paginação "Anterior"/"Próxima" e "Página N de M"; rodapé "Pedidos da Yampi dos últimos 30 dias · atualizado às HH:mm (`horaBR`) · WhatsApp falhou = o aviso não saiu pelo WhatsApp (número sem WhatsApp, número do atendimento fora do ar, pedido para sair); o e-mail saiu no lugar, quando havia e-mail."; vazio "Nenhum pedido em andamento nos últimos 30 dias." (filtro: "Nenhum pedido neste filtro."; busca: "Nenhum pedido encontrado nas entregas dos últimos 30 dias. Pedido que ainda não saiu da loja não aparece aqui."); `erro` em `role="alert"`; `carregando` mantém a tabela com `aria-busy`.

- [ ] **Step 1: Escrever os testes que falham** (fixture com 3 linhas — `problema` com telefone, `enviado`, `separando` há 4 dias; contagens 29/23/4/2): chips com `aria-pressed="true"` só no filtro ativo e textos "Todos · 29", "Problema · 2"; cabeçalho da coluna de ação com o texto `Ação` em `sr-only`; linha `problema` tem "Chamar compradora" com `href="https://wa.me/5511987654321"` e `rel="noopener noreferrer"`; linha `enviado` não tem "Chamar compradora"; "Reenviar aviso" só nas linhas com `podeReenviar`; "Sem código há 4 dias"; `WhatsApp falhou` dentro de `<strong>`; sem `<td>` com e-mail ou documento; vazio por filtro e por busca com os textos exatos; `erro` renderiza `role="alert"`; o rodapé contém "atualizado às 12:00" para `atualizadoEm 2026-10-29T15:00:00Z`.
- [ ] **Step 2: Rodar e ver falhar.** **Step 3: Implementar.** **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** (`feat(painel): dense deliveries table`).

### Task 12: Página, abas, menu e e2e

**Files:**
- Create: `components/painel/rastreio/entregas.tsx`, `abas-de-vendas.tsx`, `app/painel/vendas/entregas/page.tsx`, `e2e/painel-entregas.spec.ts`
- Modify: `app/painel/vendas/page.tsx`, `lib/painel-nav.ts`, `lib/painel-nav.test.ts`, `e2e/conteudo-esperado.ts`, `e2e/vendas-vendedora.spec.ts`

**Interfaces:**
- Consumes: `TabelaDeEntregas`, `useRastreioLiberado`, `ErroDeCarga`, `useConfirmacao`, `useToast`, `authenticatedFetch`, `parseFiltroDeEntregas`.
- Produces: `EntregasPage()` (client, `export default`); `AbasDeVendas({ ativa, visivel }: { ativa: "registrar" | "entregas"; visivel: boolean })` — `<nav aria-label="Abas de Vendas">` com "Registrar venda" (`/painel/vendas`) e "Entregas" (`/painel/vendas/entregas`), `aria-current="page"` na ativa, `null` se `!visivel`; item `ENTREGAS = { href: "/painel/vendas/entregas", label: "Entregas", icon: Truck, grupo: "vender", requer: "rastreio", permissao: "settings:connection" }` em `NAV_GROUPS[0]` logo depois de `VENDAS`.

Comportamento da página: sem `can("settings:connection")` → "Entregas é só do dono e da administração da loja." (a página da vendedora abre por prefixo em `paginaLiberada`; quem barra é a API, o recado é só experiência); 403 `rastreio_disabled` → "O Rastreio de pedidos ainda não foi liberado para a sua loja."; erro → `<ErroDeCarga titulo="Não deu para carregar as entregas." />`. Lê `?filtro=` e `?pedido=` de `window.location.search` **antes** da primeira consulta (sininho do PR 2 e link da Yampi; `pedido` só vale com formato de uuid); com `pedido`, mostra "Mostrando o pedido nº <n>." + botão "Ver todos". Toda consulta é `POST /api/rastreio/entregas` (a busca leva documento); busca com atraso de 350 ms e só a última resposta vale (contador, como `bling.tsx`). "Reenviar aviso" → `pedirConfirmacao({ titulo: "Reenviar o aviso?", texto: "A compradora recebe “<situação>” de novo, pelos canais ligados. O envio sai em até 5 minutos.", rotulo: "Reenviar" })` → `POST …/reenviar` → toast "Aviso reenviado. Sai em até 5 minutos." (erro: a mensagem da rota) e recarrega. A página de Vendas ganha `<AbasDeVendas ativa="registrar" visivel={useRastreioLiberado()} />` no topo.

- [ ] **Step 1: Escrever os testes que falham:** `painel-nav.test.ts` — o item aparece para dono e admin com `{ instagram: false, rastreio: true }`, não para operador, vendedora (com e sem `postar`), `acesso null` nem `rastreio: false`; fica em `grupo "vender"` logo depois de `/painel/vendas`; fora das barras (`NAV_BARRA_DESKTOP` etc.); a expectativa de "dono e operador veem o menu de antes, sem Vendas" passa a excluir também `/painel/vendas/entregas` (flag desligada em `COM_INSTAGRAM`); `destinoDaPagina(VENDEDORA, "/painel/vendas/entregas")` é `"mostrar"` (documenta a divergência: a barreira é a API). O teste "every navigation destination is a route that exists" exige o `page.tsx` do item.
- [ ] **Step 2: Rodar e ver falhar** (`teste src/lib/painel-nav.test.ts`). Expected: FAIL (item ausente; rota sem `page.tsx`).
- [ ] **Step 3: Implementar** página, abas, item de menu e edição da Vendas. Em `e2e/conteudo-esperado.ts`: entrada `"/painel/vendas/entregas"` com `ancora: /Pedidos da Yampi dos últimos 30 dias/`, `indisponivel` (consulta `/api/rastreio/status`; motivo "A loja de QA não tem rastreio_enabled; libere em tenant_settings."), `lista: { api: "/api/rastreio/entregas", marca: (j) => primeiroTexto((j as { linhas?: unknown } | null)?.linhas, "numero"), vazio: /Nenhum pedido em andamento/i }` (o smoke `painel-rotas.spec.ts` cobra a declaração de toda rota nova).
- [ ] **Step 4: e2e** (`painel-entregas.spec.ts`; login de QA; `page.route` em `**/api/rastreio/status` e `**/api/rastreio/entregas`, fixture com os pedidos 1541 `problema` e 1532 `enviado`): (a) as linhas aparecem, "Problema · 2" filtra e o corpo do POST traz `filtro: "problema"`; (b) digitar `11144477735` na busca: o POST traz `busca`, e **nenhuma** URL requisitada contém `11144477735`; (c) "Reenviar aviso" → "Reenviar" na folha → `POST /api/rastreio/entregas/<id>/reenviar` chamado. Em `vendas-vendedora.spec.ts`, no teste "as rotas do dono respondem 403 para ela": `GET /api/rastreio/entregas` → 403 com `MENSAGEM_BLOQUEIO`.
- [ ] **Step 5: Rodar** testes, dois `tsc`, lint. **Step 6: Commit** (`feat(painel): Vendas › Entregas page, tabs and menu item`).

### Task 13: Bloco "Código de rastreio nos pedidos enviados" no cartão da Yampi

**Files:**
- Create: `components/painel/rastreio/bloco-codigo-rastreio.tsx`, `bloco-codigo-rastreio.test.ts`
- Modify: `components/painel/configuracoes/vitrine/configuracoes-vitrine.tsx` (onde o B·6c monta `<Yampi />`; a P4 também edita este arquivo, em outro trecho)

**Interfaces:**
- Consumes: `Yampi({ children })` de `@/components/painel/configuracoes/yampi` (B·6c: o cartão que a base monta em Configurações › Integrações; os `children` são os blocos de cada módulo e **só aparecem com conexão**), `SaudeDoCodigo`, `corDoMedidor`, `useRastreioLiberado`, `authenticatedFetch`, `diaMesBR`.
- Produces: `BlocoCodigoRastreio()` (lê `GET /api/rastreio/saude`; sem liberação, 403 `rastreio_disabled` ou erro → `null`, sem barulho); `PainelDoBlocoCodigo({ saude }: { saude: SaudeDoCodigo })`.

Desenho (mockup `Integracoes`, coluna da direita): título "Código de rastreio nos pedidos enviados"; `enviados === 0` → "Nenhum pedido enviado nos últimos 7 dias." (sem medidor); senão `"{com} de {de}"` em mono + "enviados nos últimos 7 dias chegaram com código" e barra `aria-hidden` (`corDoMedidor`: `ok` verde, `atencao` âmbar; largura `round(com/de*100)%`); com `maisAntigoSemCodigo`: aviso "Pedido nº <n> está faturado desde <dd/mm> e ainda sem código." + link "Ver em Entregas" (`/painel/vendas/entregas?filtro=sem_codigo`); dica "O código chega sozinho quando a etiqueta é comprada pelo Melhor Envio dentro da Yampi. Se a etiqueta sai pelo Bling, ligue “Sincronizar rastreamento automaticamente” nas configurações de lojas virtuais do Bling."; o texto do spec §5 "A Girumo lê os pedidos e cria na sua loja só o aviso de pedido novo. Não muda pedido, produto nem preço."; rodapé "Os avisos e a página de rastreio ficam em" + link "Rastreio de pedidos" (`/painel/configuracoes?secao=rastreio`). O bloco entra como `children` do cartão da base: `<Yampi><BlocoCodigoRastreio /></Yampi>` no `configuracoes-vitrine.tsx`; o Rastreio não monta outro cartão da Yampi, e quem posiciona os `children` (o mockup põe a coluna da direita) é o cartão. Sem conexão o cartão não os desenha; sem liberação do Rastreio o bloco some sozinho (`null`). O Recuperar monta o mesmo `Yampi` em Recuperar › Ajustes (PR 7 dele) com os blocos dele.

- [ ] **Step 1: Escrever os testes que falham:** `{ enviados: 15, comCodigo: 14, maisAntigoSemCodigo: { id, numero: "1539", desde: "2026-10-25T15:00:00Z" } }` → "14 de 15", "Pedido nº 1539 está faturado desde 25/10 e ainda sem código.", link com `href` exato de Entregas, barra com `width: 93%`, frase de segurança do spec §5; `{ enviados: 15, comCodigo: 11, maisAntigoSemCodigo: null }` → barra âmbar (classe de `atencao`), sem aviso; `{ 0, 0, null }` → "Nenhum pedido enviado nos últimos 7 dias." e sem barra; `maisAntigoSemCodigo: null` → sem aviso.
- [ ] **Step 2: Rodar e ver falhar.** **Step 3: Implementar** o bloco e passá-lo como `children` do `<Yampi>`. **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** (`feat(painel): code health block in the Yampi card`).

---

## Fechamento de cada Parte

- [ ] Gate local: `npm --workspace apps/web test`, os dois `tsc` (`tsconfig.json` e `tsconfig.e2e.json`), `npm --workspace apps/web run lint` e `powershell -ExecutionPolicy Bypass -File infra/scripts/verify-local.ps1`.
- [ ] `apps/web/system/API_CONTRACTS.md`: na seção Rastreio (PR 1), ajustar ao que a Parte criou — P1: `GET|POST /entregas` (POST por causa do documento), `/reenviar`, `/saude`; P2: `/status`; P3: `/config`.
- [ ] Revisão antes de abrir o PR: agente Code Reviewer na diff; P1, P2 e P3 também com Security Engineer (permissão, `tenant_id`, vendedora, documento). CRITICAL e HIGH corrigidos antes do merge.
- [ ] `git push -u origin <branch>`; `gh pr create --base main` (título `feat(rastreio): <parte> (painel, parte N)`; corpo com resumo, spec, plano de teste e `🤖 Generated with [Claude Code](https://claude.com/claude-code)`); `gh pr checks <N>`; verde → `gh pr merge <N> --squash --delete-branch` à mão (a `main` não tem proteção: nada de auto-merge); apagar a branch.
- [ ] Card `rastreio-pedidos` (prod): `select public.move_card('rastreio-pedidos', 'em_construcao', 'PR 6 parte N no ar: <o que>', 'PR #<N>');` e reescrever o `blocker` (o `move_card` não limpa). `no_ar_verificado` só com a prova do PR 7.
- [ ] Ao encerrar a sessão: "PRs que deixei abertos: #N (motivo)" ou "nenhum". Comando do Igor no fim (prod): ligar a loja-piloto em `/admin/tenants/<id>` › Rastreio de pedidos, depois da Parte 2 e antes da prova do PR 7 — e só depois do merge do B·2a em `main` e do redeploy do worker no Coolify: nenhuma loja ganha `rastreio_enabled` antes disso, porque o worker antigo escolheria o número do atendimento para o auto-grow e as ações em massa.

## Interface com os outros PRs

- **PR 2 (`registrar.ts`):** o sininho `rastreio_problema` leva `href` `/painel/vendas/entregas?pedido=<id>`; a Parte 5 trata o `pedido`. O sino (`notification-bell.tsx`) mostra `title`, `body`, `href` da linha e cai em `info` para tipo desconhecido: nenhum código novo.
- **PR 3 / PR 5:** `PATCH /config` grava `publicSlug`, `vipLinkId` e `storeWhatsapp`; este último como `55` + DDD + número (`5511912345678`, o que os planos 3 e 5 usam) e já recusado se for de instância da loja. `mensagens.ts` (PR 5) e `email.ts` (PR 4) são puros, sem `server-only`, e precisam continuar assim: `lib/rastreio/previas.ts` roda no navegador.
- **PR 4 e PR 5:** se mergearem depois deste PR, trocam o `null` de `previaDoEmail` / `previaDoWhatsapp` em `lib/rastreio/previas.ts` pela chamada de `montarEmailDoAviso` / `mensagemWhatsapp` (3 linhas) e ajustam o teste. O PR 7 confere que "Ver mensagem" aparece.
- **B·2b:** `CartaoNumeroDoAtendimento` (`components/privado/cartao-numero-do-atendimento.tsx`) importado como está, sem props: lê `GET /api/privado/numero` e some quando a loja não tem nenhum dos dois add-ons; o horário do número é dele. **B·6b:** `conexaoYampiAtiva` (`lib/yampi/conexao.ts`) na rota de config. **B·6c:** `Yampi({ children })` (`components/painel/configuracoes/yampi.tsx`) é montado pela base em Configurações › Integrações; o Rastreio só passa `<BlocoCodigoRastreio />` como `children` e não monta outro cartão.
- **Recuperar B·5 ("cobrança e casca"):** também mexe em `painel-nav.ts`, `casca-context.tsx` e `app/admin/tenants/[id]/page.tsx` (liberação do `recuperar_enabled`). Quem mergear depois reconcilia: um mecanismo de `Liberacao`, não dois; no admin, um bloco por módulo.
- **PR 7:** telas para o roteiro de prova: Configurações › Rastreio de pedidos, Vendas › Entregas, bloco da Yampi; o `conteudo-esperado` de Entregas já existe.

## Divergências com o código

1. **O admin não tem botão que ligue `instagram_enabled`:** só `setInstagramEnabled` (webhook do Stripe) e SQL à mão. O "molde do Instagram" aqui é a rota de admin por loja (`plan`, `instagram-invite`) + componente em `components/admin/`, criados do zero (Task 7).
2. **A lista de Entregas também é `POST`** (a spec §4 diz `GET`): documento na query string iria para o log da Vercel, e o índice proíbe documento em log. O `GET` existe sem `busca`, para o smoke e para links. O texto de `API_CONTRACTS.md` que o PR 1 escreveu para esta rota (`q`, `pedidos`, `entregues7d`, `mediaDiasAteEntregar`, `proximaPagina`) é reescrito na Parte 1: `busca` no corpo, `linhas`, `entreguesEm7Dias`, `total` + `pagina`. As outras rotas seguem o texto do PR 1 (403 `rastreio_disabled`, `saude { enviados, comCodigo, maisAntigoSemCodigo }`, `config { config, linkDaBusca }`, 409 `SlugEmUso`) com acréscimos (`code` nos 409 do reenvio, `yampi` e `linksDeConvite` na config).
3. **`paginaLiberada` casa por prefixo:** `/painel/vendas` libera `/painel/vendas/entregas` para a vendedora na guarda de página. A API (mapa fechado) e o recado da própria página barram; o item de menu e as abas não aparecem para ela.
4. **Dono e admin não veem "Vendas" no menu hoje** (`visivelNoMenu` tira o módulo `vendas`): o item novo "Entregas" (Mais › Vender) é a porta, e a barra "Registrar venda | Entregas" só existe com o módulo ligado. `NavItem.permissao` é novo para o operador não ver o que a API nega.
5. **Do mockup ficaram de fora:** média de dias até entregar (exigiria agregação no banco; o PostgREST corta em 1000 sem erro), contador na aba, "Abrir na Yampi" (URL do pedido no painel da Yampi não confirmada na Fase 0), ordem por prioridade (não cabe em `order` com paginação; a lista sai por `etapa_at desc` e os chips fazem o trabalho), "Ana P." (o banco guarda só o primeiro nome, spec §7), subtítulo da porta com o estado do número (só o cartão da base sabe) e edição do endereço da página.
6. **Contrato do número do atendimento (resolvida):** os dois índices dizem o mesmo agora — `numeroDoAtendimento(tenantId)` devolve `{ instanceId, instanceName, status, phone } | null` (`lib/privado/numero.ts`, B·2b). Este PR não chama a função; só renderiza `CartaoNumeroDoAtendimento` (sem props), que lê `GET /api/privado/numero`.
7. **`etapa_at` de pedido importado sem histórico é a hora da importação** (RPC do PR 1): "sem código há +2 dias" e "Última novidade" contam a partir de quando a Girumo viu a etapa, não da data da Yampi.
8. **`NUMERO_CONECTADO` do bio** diz "Use o número de atendimento"; com o chip chamado de "número do atendimento" a frase confunde, então o Rastreio tem texto próprio (Task 9).
9. **O contrato do PR 1 diz "nada da compradora além do primeiro nome" nas rotas do painel;** a linha `problema` leva também o telefone, só para o botão "Chamar compradora" (`wa.me`) do mockup. O painel já mostra telefone em Contatos; a resposta nunca leva e-mail, documento ou endereço. Se o Igor preferir o contrato à risca, o botão cai e o resto não muda.
10. **O `yampi` da config vem de `conexaoYampiAtiva`** (B·6b), que só devolve `ativa` e `aviso_desativado`: a loja com `credencial_invalida` ou `desconectada` chega como `null`, e a tela diz "Conecte a Yampi para os pedidos chegarem aqui." (o link leva a Integrações, onde o cartão da base mostra o estado de verdade, e o sino da base já avisou do 401). "A conexão com a Yampi precisa de atenção." fica, na prática, para `aviso_desativado`; ter a frase também para a credencial recusada exigiria a base expor o status em qualquer estado.
