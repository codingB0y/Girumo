# Acesso da vendedora — PR 5 (tela de vendas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A vendedora entra no painel e cai em `/painel/vendas`: busca o cliente pelo número, lança os produtos com total ao vivo, registra a venda e vê as vendas dela no mês (corrige ou apaga até 24h). O menu, a barra, o botão Postar e a guarda de página mostram só os módulos dela; a casca não dispara nenhuma chamada que daria 403, não assina Realtime, e o upload de mídia do módulo `postar` funciona sem acesso dela ao banco.

**Architecture:** Regras puras da tela em `lib/painel/vendas.ts` (soma em centavos, validação de linha, resumo, rótulo de data) com teste. A tela é uma página client (`app/painel/vendas/page.tsx`) que orquestra quatro componentes em `components/painel/vendas/` e fala só com `/api/vendas*` (PR 4). O menu ganha `NavItem.modulo` e quatro funções puras em `painel-nav.ts` (`visivelNoMenu`, `podePostar`, `itensDaBarra`, `destinoDaPagina`) que todos os consumidores usam. Os providers da casca (`CascaProvider`, `SessionProvider`, `TrialProvider`) e os widgets da barra esperam `useRole().carregado` e pulam a vendedora. Uma `GuardaDeModulo` no layout segura a página até saber o papel, manda a vendedora da Início para Vendas e mostra "Essa área não foi liberada pra você" fora do acesso. O upload de mídia troca a RLS de `storage.objects` por token assinado pela service-role no `/api/media/prepare`. Um E2E com usuário `seller` próprio, criado e apagado pela service-role, prova o fluxo do spec §7.

**Tech Stack:** Next.js 15 (App Router, client components), React 19, Tailwind v4 com as classes `pn-*` da Vitrine, lucide-react 1.21, `@supabase/supabase-js` 2.108 (`createSignedUploadUrl`/`uploadToSignedUrl`), `node --test` via tsx, Playwright 1.62.

**Spec:** `docs/superpowers/specs/2026-10-07-acesso-vendedora-design.md` (§1 "RLS" e "Página", §4 Telas, §6 bordas, §7 Testes) · contrato vinculante: `docs/superpowers/plans/2026-10-07-acesso-vendedora-indice.md` (seções "PR 3 → PR 4, 5, 6" e "PR 4 → PR 5") · mockup aprovado: https://claude.ai/artifact/UdVL13GDUZU9ggZo4pjGsC (telas "Registrar venda", "Área não liberada", "Barra de cima por papel").

## Global Constraints

Regras que valem para os seis (índice):

- Código, identificadores e commits em inglês — **exceto** o vocabulário do painel, que já é pt-BR (`visivelNoMenu`, `liberado`, `paginaLiberada` do contrato); texto de tela e de erro em pt-BR. Commits com prefixo semântico e terminando em `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Em `apps/web`:
  - unit: `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`
  - tipos (os **dois**; lint e tsx não checam tipo): `npx tsc --noEmit -p tsconfig.json` e `npx tsc --noEmit -p tsconfig.e2e.json`
  - lint: `npm run lint` · suíte: `npm test` (só `src/**/*.test.ts`) · lint da Vitrine: `npx tsx scripts/check-painel-vitrine.ts`
- Antes do push: `infra/scripts/verify-local.ps1` (secrets + build) — é o gate real; o `verify` do CI é pulado na `main`.
- Nunca `git add -A`. `git diff --cached --stat` numa chamada **separada** antes de cada commit. Sempre `git -C <wt>` com caminho absoluto (`<wt>` = raiz do worktree da sessão, impressa na Task 0 Step 1; substituir literalmente em todo comando). Terminal é PowerShell 5.1: sem `&&`/`||`.
- Card `acesso-vendedora` em `em_construcao` ao começar (Task 0) e `move_card` ao terminar (Task 13). DML em prod passa pelo Igor.
- Fechar o loop na mesma sessão: revisar → CI verde → mergear → apagar branch. Ao encerrar: "PRs que deixei abertos: …".

Deste PR:

- **Depende de PR 3 e PR 4 mergeados em `main`** (e do PR 2 aplicado em dev — o E2E cria membership `seller` com `modules`). Consome, sem renomear: `@/lib/auth/modulos` (`Acesso`, `Modulo`, `ModuloOpcional`, `modulosDoAcesso`, `paginaLiberada`); `useRole()` com `carregado`, `acesso: Acesso | null` (null até `/api/auth/me` devolver o papel), `modules`; `@/lib/vendas/telefone` (`variantesDoTelefone`, `telefoneCanonico`); `@/lib/vendas/tipos` (`ItemDeVenda`, `ContatoDaVenda`, `BuscaDeContato`, `VendaDoMes`, `VendasDoMes`); rotas `GET /api/vendas/contato?telefone=`, `GET|POST /api/vendas`, `PATCH|DELETE /api/vendas/[id]` com as respostas do índice.
- **Owner/admin/operator: nada some.** O que muda para eles: Vendas nunca aparece no menu; os widgets da casca (número, sino, Relâmpago, Instagram, teste grátis, disparo em voo, avatar) e a própria página passam a montar depois do `/api/auth/me` — uma ida e volta a mais no carregamento frio (navegação client não muda: o layout não remonta). É o preço de a vendedora não ver o painel do dono piscar nem disparar 403.
- **Vendedora:** só Vendas (+ Disparos e Postar com `postar`), chip "Vendedora" e "Sair" no lugar do avatar; sem sino, sem chip do número, sem Mais, sem Relâmpago, sem teste grátis. Nenhum `/api/*` da casca responde 403 para ela e nenhum websocket de Realtime abre (a única assinatura de `postgres_changes` do app é a do sino, `notification-bell.tsx:81`, e ele não monta para ela — conferido com `grep "\.channel(\|postgres_changes"`).
- Textos de tela: os do mockup. Tradução para o painel real: barra Volt (`pn-barra`) no lugar da barra clara do mockup; raio 16 do mockup vira `rounded-xl` (12 — a Vitrine não tem raio 16, `painel-vitrine.css:29`); h1 no padrão do painel (`font-brand text-28 font-bold`); alvos ≥ 44px (o "Corrigir" de 32px do mockup vira 44); inputs 16px; `<label>` em todo campo; erro em `role="alert"`; a confirmação é anunciada por um `role="status"` **sempre montado** (região viva inserida já com texto não é anunciada — mesma lição de `trial-banner.tsx:14-15`).
- Bordas coloridas não pintam: `globals.css` tem `* { border-color: var(--color-line-200) }` fora de camada (ver `confirmacao.tsx:86-91`). Contorno colorido é `ring-*`.
- Item de R$ 0,00 é aceito (brinde); a venda precisa somar > 0 (spec §6) — o mockup recusava valor 0, o spec manda. Linha completa = nome, quantidade ≥ 1 e valor preenchido (≥ 0); valor vazio é incompleto.
- Erros: toda resposta não-ok mostra o `{ error }` da rota (`mensagemDeErro`), com as strings de `MESSAGES` do PR 4 — inclusive os status além do índice: `429` em `GET /api/vendas/contato` e `POST /api/vendas`, `400` de itens inválidos no `PATCH`, `404 { error: "Venda não encontrada." }`. O `403` do guard vem em texto puro e cai no texto padrão da tela.
- Opt-out: `GET /api/vendas/contato` devolve `{ contato: null, optout: true }`. A tela **não** oferece cadastro (o campo de nome some) e diz que a venda fica registrada sem entrar nos contatos (spec §3: "Número em opt-out → registra o pedido sem lead").
- E2E com usuário próprio por execução (`e2e-vendedora-<ts>-<hex>@girumo.test`), nunca o de QA: logout/troca de módulo de um run não derruba outro run no mesmo banco de dev (`finding-e2e-local-e-ci-corrida-no-mesmo-banco`).
- **22 arquivos** (18 de código, 2 de teste unitário, 2 de E2E). Passa da régua de ~10. Ver "Divisão sugerida" abaixo; o plano roda inteiro numa branch se o controller mantiver o PR único do índice.

## File Structure

| Arquivo (em `apps/web/`) | Ação | Responsabilidade | Task |
|---|---|---|---|
| `src/lib/painel/vendas.ts` | criar | regras puras da tela | 1 |
| `src/lib/painel/vendas.test.ts` | criar | teste das regras | 1 |
| `src/components/painel/vendas/itens-da-venda.tsx` | criar | linhas de produto, total, envio; classes de campo | 2 |
| `src/components/painel/vendas/venda-registrada.tsx` | criar | confirmação + "Registrar outra venda" | 2 |
| `src/components/painel/vendas/busca-do-cliente.tsx` | criar | busca por número e cartão do cliente | 3 |
| `src/components/painel/vendas/minhas-vendas.tsx` | criar | `useMinhasVendas`, lista do mês, corrigir/apagar | 4 |
| `src/app/painel/vendas/page.tsx` | criar | orquestra a tela | 5 |
| `e2e/conteudo-esperado.ts` | modificar | âncora e lista de `/painel/vendas` no smoke de rotas | 5 |
| `src/lib/painel-nav.ts` | modificar | `modulo`, `VENDAS`, `visivelNoMenu`, `podePostar`, `itensDaBarra`, `destinoDaPagina` | 6 |
| `src/lib/painel-nav.test.ts` | modificar | testes do menu por módulo | 6 |
| `src/components/painel/barra-de-cima.tsx` | modificar | itens por acesso, sem Mais/sino/número/Relâmpago para a vendedora, Sair | 7 |
| `src/components/painel/barra-mobile.tsx` | modificar | itens por acesso, Postar por módulo, disparo em voo só para quem posta | 7 |
| `src/components/painel/lista-dos-modulos.tsx` | modificar | `visivelNoMenu` no Mais | 7 |
| `src/components/painel/casca-context.tsx` | modificar | `/api/ig/status` só depois do papel, nunca para a vendedora | 8 |
| `src/components/painel/session-provider.tsx` | modificar | `/api/session` idem | 8 |
| `src/components/painel/trial/use-trial.ts` | modificar | `/api/billing/trial` idem | 8 |
| `src/components/painel/guarda-de-modulo.tsx` | criar | guarda de página | 9 |
| `src/app/painel/layout.tsx` | modificar | monta a guarda | 9 |
| `src/lib/media-store.ts` | modificar | `prepareMediaUpload` devolve token assinado | 10 |
| `src/app/api/media/prepare/route.ts` | modificar | `await` | 10 |
| `src/lib/media-upload-client.ts` | modificar | `uploadToSignedUrl` | 10 |
| `e2e/vendas-vendedora.spec.ts` | criar | fluxo da vendedora (spec §7) | 11 |

### Divisão em três PRs (decidida em 08/10 e registrada no índice como 5A, 5B, 5C)

| Bloco | Tasks | Arquivos | Branch | Depende de |
|---|---|---|---|---|
| A — tela | 1–5 | 8 | `feat/vendas-tela` | PR 4 |
| B — casca e guarda | 6–9 | 10 | `feat/vendedora-casca` | A |
| C — upload assinado + E2E | 10–11 | 4 | `feat/vendedora-e2e` | B |

O Task 10 sozinho (3 arquivos) pode sair antes de tudo como `fix(media)` — não depende de nada deste PR e **precisa** estar em `main` antes do PR 6 (é quando passa a existir vendedora). Sem dividir, seguir o plano em ordem numa branch só.

---

### Task 0: worktree, branch, defasagem, dependências e card

**Files:** nenhum.

- [ ] **Step 1:** na sessão (que já roda num worktree do app — não criar outro, `finding-harness-bloqueia-escrita-em-outro-worktree`):

```powershell
git rev-parse --show-toplevel
```

  Anotar a saída como `<wt>`. Daqui em diante todo `git` é `git -C <wt>`.

- [ ] **Step 2:** atualizar e conferir que PR 3 e PR 4 estão em `main`:

```powershell
git -C <wt> fetch origin main
```
```powershell
git -C <wt> ls-tree --name-only origin/main apps/web/src/lib/auth/modulos.ts apps/web/src/lib/vendas/tipos.ts apps/web/src/lib/vendas/telefone.ts apps/web/src/app/api/vendas/route.ts apps/web/src/app/api/vendas/contato/route.ts "apps/web/src/app/api/vendas/[id]/route.ts"
```

  Esperado: os seis caminhos. Faltando qualquer um → parar: PR 3 ou PR 4 não mergeou.

```powershell
git -C <wt> grep -n "acesso: Acesso | null" origin/main -- apps/web/src/components/painel/role-provider.tsx
```

  Esperado: uma linha. Vazio → PR 3 não mergeou.

- [ ] **Step 3:** branch a partir de `origin/main`, sem upstream herdado:

```powershell
git -C <wt> switch -c feat/vendas-tela origin/main
```
```powershell
git -C <wt> branch --unset-upstream
```
```powershell
git -C <wt> log HEAD..origin/main --oneline
```

  Esperado: vazio (defasagem zero).

- [ ] **Step 4:** colisão com outra sessão: `gh pr list --repo codingB0y/Girumo --state open --json number,headRefName,title` — nenhum PR aberto mexendo em `painel-nav.ts`, `barra-de-cima.tsx`, `barra-mobile.tsx`, `casca-context.tsx`, `session-provider.tsx`, `trial/use-trial.ts`, `app/painel/layout.tsx`, `media-store.ts` ou `media-upload-client.ts` (conferir com `gh pr diff <N> --repo codingB0y/Girumo --name-only` nos suspeitos). O PR 6 (`feat/equipe-vendedora`) mexe em `api/members` e na aba Equipe: disjunto.

- [ ] **Step 5:** dependências do worktree:

```powershell
Test-Path "<wt>\node_modules\next"
```

  `False` → `Set-Location <wt>; npm ci --workspace apps/web --include-workspace-root --no-audit --no-fund` (~1 min; o `node_modules` do checkout principal costuma estar vazio — `finding-worktree-node-modules-junction`).

- [ ] **Step 6:** `.env.local` para o E2E local (Task 12): se `Test-Path "<wt>\apps\web\.env.local"` for `False` e existir `C:\Users\Igor\Desktop\HubFlow-platform\apps\web\.env.local`, copiar:

```powershell
Copy-Item "C:\Users\Igor\Desktop\HubFlow-platform\apps\web\.env.local" "<wt>\apps\web\.env.local"
```

  Conferir só os nomes (nunca imprimir valor):

```powershell
Select-String -Path "<wt>\apps\web\.env.local" -Pattern '^(E2E_EMAIL|E2E_PASSWORD|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|HUBFLOW_USE_SUPABASE)=' | ForEach-Object { $_.Line.Split('=')[0] }
```

  Faltando `E2E_*` ou `SUPABASE_*`, o E2E local se marca skip e a prova visual da Task 12 fica no artefato `e2e-report` do CI.

- [ ] **Step 7 (Igor, prod):**

```sql
select public.move_card('acesso-vendedora', 'em_construcao', 'PR 5 começou: tela /painel/vendas e casca da vendedora', 'feat/vendas-tela');
```

---

### Task 1: regras puras da tela (TDD)

**Files:** criar `src/lib/painel/vendas.ts`, `src/lib/painel/vendas.test.ts`
**Depends-on:** Task 0
**Interfaces (produz):**
```ts
export const MAX_ITENS = 50;
export const MAX_NOME_DO_PRODUTO = 120;
export const ERRO_LINHA_INCOMPLETA: string; export const ERRO_TOTAL_ZERO: string; export const ERRO_MUITOS_ITENS: string;
export type LinhaDaVenda = { nome: string; quantidade: string; valor: string };
export const LINHA_VAZIA: LinhaDaVenda;
export function subtotalDaLinha(linha: LinhaDaVenda): number;
export function totalDasLinhas(linhas: readonly LinhaDaVenda[]): number;
export function pecasDasLinhas(linhas: readonly LinhaDaVenda[]): number;
export function rotuloDePecas(pecas: number): string;
export type Validacao = { ok: true; itens: ItemDeVenda[] } | { ok: false; erro: string };
export function validarLinhas(linhas: readonly LinhaDaVenda[]): Validacao;
export function resumoDosItens(itens: readonly ItemDeVenda[]): string;
export function valorParaCampo(valor: number): string;
export function linhasDaVenda(venda: Pick<VendaDoMes, "itens">): LinhaDaVenda[];
export function nomeDoCliente(venda: Pick<VendaDoMes, "cliente" | "telefone">): string;
export function quandoFoi(iso: string, agora: Date): string;
export function nomeDoMes(mes: string): string;
export function rotuloDeVendas(quantidade: number): string;
export function nomesDeProdutos(vendas: readonly Pick<VendaDoMes, "itens">[]): string[];
export function mensagemDeErro(corpo: unknown, padrao: string): string;
```

- [ ] **Step 1 (teste):** `src/lib/painel/vendas.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import {
  ERRO_LINHA_INCOMPLETA,
  ERRO_MUITOS_ITENS,
  ERRO_TOTAL_ZERO,
  LINHA_VAZIA,
  MAX_ITENS,
  linhasDaVenda,
  mensagemDeErro,
  nomeDoCliente,
  nomeDoMes,
  nomesDeProdutos,
  pecasDasLinhas,
  quandoFoi,
  resumoDosItens,
  rotuloDePecas,
  rotuloDeVendas,
  subtotalDaLinha,
  totalDasLinhas,
  validarLinhas,
  type LinhaDaVenda,
} from "./vendas";

const linha = (nome: string, quantidade: string, valor: string): LinhaDaVenda => ({ nome, quantidade, valor });

test("subtotal e total somam em centavos, com vírgula ou ponto decimal", () => {
  assert.equal(subtotalDaLinha(linha("Vestido midi", "2", "119,90")), 239.8);
  assert.equal(totalDasLinhas([linha("Vestido midi", "2", "119,90"), linha("Cropped", "1", "49.90")]), 289.7);
  // 3 × 0,10 em float é 0,30000000000000004: a tela não pode mostrar isso.
  assert.equal(totalDasLinhas([linha("Grampo", "3", "0,10")]), 0.3);
  assert.equal(totalDasLinhas([linha("Casaco", "1", "1.149,90")]), 1149.9);
});

test("linha incompleta vale zero e não quebra o total", () => {
  assert.equal(subtotalDaLinha(LINHA_VAZIA), 0);
  assert.equal(subtotalDaLinha(linha("Vestido", "", "10")), 0);
  assert.equal(totalDasLinhas([linha("Vestido", "2", "119,90"), linha("", "1", "")]), 239.8);
});

test("peças: soma só quantidade válida, com o plural certo", () => {
  assert.equal(pecasDasLinhas([linha("A", "2", "1"), linha("B", "3", "1"), linha("C", "", "1")]), 5);
  assert.equal(rotuloDePecas(1), "1 peça");
  assert.equal(rotuloDePecas(0), "0 peças");
  assert.equal(rotuloDePecas(5), "5 peças");
});

test("validarLinhas devolve os itens do POST, nome aparado e valor no centavo", () => {
  assert.deepEqual(validarLinhas([linha("  Vestido midi  ", "2", "119,90"), linha("Brinde", "1", "0")]), {
    ok: true,
    itens: [
      { nome: "Vestido midi", quantidade: 2, valorUnitario: 119.9 },
      { nome: "Brinde", quantidade: 1, valorUnitario: 0 },
    ],
  });
  // numeric(12,2) no banco: o que a tela soma tem que ser o que o banco grava.
  assert.deepEqual(validarLinhas([linha("Meia", "1", "19,999")]), {
    ok: true,
    itens: [{ nome: "Meia", quantidade: 1, valorUnitario: 20 }],
  });
});

test("validarLinhas recusa linha incompleta ou fora do limite, total zero e mais de 50 produtos", () => {
  const incompleta = { ok: false, erro: ERRO_LINHA_INCOMPLETA };
  assert.deepEqual(validarLinhas([]), incompleta);
  assert.deepEqual(validarLinhas([linha("", "1", "10")]), incompleta);
  assert.deepEqual(validarLinhas([linha("Vestido", "0", "10")]), incompleta);
  assert.deepEqual(validarLinhas([linha("Vestido", "1", "")]), incompleta);
  assert.deepEqual(validarLinhas([linha("Vestido", "10000", "10")]), incompleta);
  assert.deepEqual(validarLinhas([linha("Vestido", "1", "1000000")]), incompleta);
  assert.deepEqual(validarLinhas([linha("x".repeat(121), "1", "10")]), incompleta);
  assert.deepEqual(validarLinhas([linha("Brinde", "1", "0,00")]), { ok: false, erro: ERRO_TOTAL_ZERO });
  const demais = Array.from({ length: MAX_ITENS + 1 }, () => linha("Meia", "1", "5"));
  assert.deepEqual(validarLinhas(demais), { ok: false, erro: ERRO_MUITOS_ITENS });
});

test("resumo da venda como a lista mostra; pedido antigo diz que não tem itens", () => {
  assert.equal(
    resumoDosItens([
      { nome: "Conjunto alfaiataria", quantidade: 1, valorUnitario: 187.8 },
      { nome: "Blusa bufante", quantidade: 2, valorUnitario: 49.95 },
    ]),
    "Conjunto alfaiataria ×1 · Blusa bufante ×2",
  );
  assert.equal(resumoDosItens([]), "Pedido sem itens");
});

test("corrigir reabre os itens no formulário, e eles validam de volta iguais", () => {
  const itens = [
    { nome: "Vestido midi", quantidade: 2, valorUnitario: 119.9 },
    { nome: "Brinde", quantidade: 1, valorUnitario: 0 },
  ];
  const linhas = linhasDaVenda({ itens });
  assert.deepEqual(linhas, [linha("Vestido midi", "2", "119,90"), linha("Brinde", "1", "0,00")]);
  assert.deepEqual(validarLinhas(linhas), { ok: true, itens });
  assert.deepEqual(linhasDaVenda({ itens: [] }), [LINHA_VAZIA]);
});

test("nome do cliente: o nome, senão o número formatado, senão 'Cliente sem nome'", () => {
  assert.equal(nomeDoCliente({ cliente: "Fernanda Lima", telefone: "5511987654321" }), "Fernanda Lima");
  assert.equal(nomeDoCliente({ cliente: null, telefone: "5511987654321" }), "+55 11 98765-4321");
  assert.equal(nomeDoCliente({ cliente: "  ", telefone: "" }), "Cliente sem nome");
});

test("quandoFoi fala hoje, ontem ou a data, no fuso de Brasília", () => {
  const agora = new Date("2026-10-07T15:00:00Z"); // 12:00 em Brasília
  assert.equal(quandoFoi("2026-10-07T14:08:00Z", agora), "hoje 11:08");
  assert.equal(quandoFoi("2026-10-06T20:42:00Z", agora), "ontem 17:42");
  assert.equal(quandoFoi("2026-10-03T18:20:00Z", agora), "03/10 15:20");
  // 02:30 UTC de 07/10 ainda é 23:30 de 06/10 em Brasília.
  assert.equal(quandoFoi("2026-10-07T02:30:00Z", agora), "ontem 23:30");
  assert.equal(quandoFoi("lixo", agora), "");
});

test("nome do mês a partir de YYYY-MM; lixo vira vazio", () => {
  assert.equal(nomeDoMes("2026-10"), "outubro");
  assert.equal(nomeDoMes("2026-01"), "janeiro");
  assert.equal(nomeDoMes("2026-13"), "");
  assert.equal(nomeDoMes("outubro"), "");
});

test("contagem de vendas com o singular certo e sem zero seco", () => {
  assert.equal(rotuloDeVendas(0), "nenhuma venda");
  assert.equal(rotuloDeVendas(1), "1 venda");
  assert.equal(rotuloDeVendas(4), "4 vendas");
});

test("datalist: nomes usados no mês, sem repetir (caixa e espaço), o mais recente primeiro", () => {
  const vendas = [
    { itens: [{ nome: "Cropped tricô", quantidade: 1, valorUnitario: 49.9 }, { nome: "Vestido midi", quantidade: 1, valorUnitario: 119.9 }] },
    { itens: [{ nome: "vestido midi ", quantidade: 2, valorUnitario: 119.9 }, { nome: "Calça wide leg", quantidade: 6, valorUnitario: 89 }] },
  ];
  assert.deepEqual(nomesDeProdutos(vendas), ["Cropped tricô", "Vestido midi", "Calça wide leg"]);
});

test("mensagem de erro: a da API quando vem; o 403 em texto puro do guard cai no padrão", () => {
  assert.equal(mensagemDeErro({ error: "Digite o número com DDD." }, "padrão"), "Digite o número com DDD.");
  assert.equal(mensagemDeErro(null, "padrão"), "padrão");
  assert.equal(mensagemDeErro({ error: "" }, "padrão"), "padrão");
  assert.equal(mensagemDeErro({ message: "x" }, "padrão"), "padrão");
});
```

- [ ] **Step 2:** `Set-Location <wt>\apps\web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/painel/vendas.test.ts` → **FAIL** (`Cannot find module './vendas'`).

- [ ] **Step 3:** `src/lib/painel/vendas.ts`:

```ts
import { dayBR, dayBRAgo, dayBROf, diaMesBR, horaBR } from "@/lib/date-br";
import { parseValorDoPedido } from "@/lib/orders/valor-do-pedido";
import { formatPhoneBR } from "@/lib/phone";
import type { ItemDeVenda, VendaDoMes } from "@/lib/vendas/tipos";

/**
 * Regras da tela de vendas (spec 2026-10-07 §4), fora do componente para teste.
 * Os limites repetem os do servidor (zod de `POST /api/vendas` e checks de
 * `order_items`): a tela recusa antes do clique o que a API recusaria depois.
 */
export const MAX_ITENS = 50;
export const MAX_NOME_DO_PRODUTO = 120;
const MAX_QUANTIDADE = 9999;
const MAX_VALOR = 999_999.99;

// As duas primeiras são as mesmas strings de `MESSAGES.items`/`MESSAGES.zeroTotal` da API (PR 4,
// `lib/vendas/` — rotas devolvem `{ error }` com elas): a tela não pode dizer uma coisa e a rota outra.
export const ERRO_LINHA_INCOMPLETA = "Preencha nome, quantidade e valor de cada produto.";
export const ERRO_TOTAL_ZERO = "A venda precisa somar mais que zero.";
export const ERRO_MUITOS_ITENS = `No máximo ${MAX_ITENS} produtos por venda.`;

/** Uma linha do formulário como a vendedora digita: tudo texto até validar. */
export type LinhaDaVenda = { nome: string; quantidade: string; valor: string };

export const LINHA_VAZIA: LinhaDaVenda = { nome: "", quantidade: "1", valor: "" };

/** Reais em centavos inteiros: 3 × 0,10 em float dá 0,30000000000000004. */
function centavos(reais: number): number {
  return Number.isFinite(reais) ? Math.round(reais * 100) : 0;
}

/**
 * O valor unitário como o banco grava (`numeric(12,2)`): arredondado ao centavo.
 * Mesma leitura de `parseValorDoPedido` que a rota usa — "149,90" e "149.90" valem igual.
 */
function valorUnitario(linha: LinhaDaVenda): number {
  return centavos(parseValorDoPedido(linha.valor)) / 100;
}

export function subtotalDaLinha(linha: LinhaDaVenda): number {
  const quantidade = Number(linha.quantidade);
  return Number.isFinite(quantidade) ? centavos(quantidade * valorUnitario(linha)) / 100 : 0;
}

export function totalDasLinhas(linhas: readonly LinhaDaVenda[]): number {
  return linhas.reduce((soma, linha) => soma + centavos(subtotalDaLinha(linha)), 0) / 100;
}

export function pecasDasLinhas(linhas: readonly LinhaDaVenda[]): number {
  return linhas.reduce((soma, linha) => {
    const quantidade = Number(linha.quantidade);
    return Number.isInteger(quantidade) && quantidade > 0 ? soma + quantidade : soma;
  }, 0);
}

export function rotuloDePecas(pecas: number): string {
  return pecas === 1 ? "1 peça" : `${pecas} peças`;
}

function itemDaLinha(linha: LinhaDaVenda): ItemDeVenda | null {
  const nome = linha.nome.trim();
  const quantidade = Number(linha.quantidade);
  const valor = parseValorDoPedido(linha.valor);
  if (nome === "" || nome.length > MAX_NOME_DO_PRODUTO) return null;
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > MAX_QUANTIDADE) return null;
  if (!Number.isFinite(valor) || valor < 0 || valor > MAX_VALOR) return null;
  return { nome, quantidade, valorUnitario: valorUnitario(linha) };
}

export type Validacao = { ok: true; itens: ItemDeVenda[] } | { ok: false; erro: string };

/** Item de R$ 0,00 passa (brinde); a venda inteira precisa somar mais que zero (spec §6). */
export function validarLinhas(linhas: readonly LinhaDaVenda[]): Validacao {
  if (linhas.length > MAX_ITENS) return { ok: false, erro: ERRO_MUITOS_ITENS };
  const itens = linhas.map(itemDaLinha).filter((item): item is ItemDeVenda => item !== null);
  if (itens.length === 0 || itens.length !== linhas.length) return { ok: false, erro: ERRO_LINHA_INCOMPLETA };
  if (totalDasLinhas(linhas) <= 0) return { ok: false, erro: ERRO_TOTAL_ZERO };
  return { ok: true, itens };
}

/** "Vestido midi ×2 · Cropped ×1"; pedido antigo, sem itens, diz isso (spec §2). */
export function resumoDosItens(itens: readonly ItemDeVenda[]): string {
  if (itens.length === 0) return "Pedido sem itens";
  return itens.map((item) => `${item.nome} ×${item.quantidade}`).join(" · ");
}

/** O valor de volta no campo, como ela digitaria: 119.9 → "119,90". */
export function valorParaCampo(valor: number): string {
  return valor.toFixed(2).replace(".", ",");
}

/** Corrigir abre o formulário com os itens da venda; pedido sem itens começa numa linha vazia. */
export function linhasDaVenda(venda: Pick<VendaDoMes, "itens">): LinhaDaVenda[] {
  if (venda.itens.length === 0) return [LINHA_VAZIA];
  return venda.itens.map((item) => ({
    nome: item.nome,
    quantidade: String(item.quantidade),
    valor: valorParaCampo(item.valorUnitario),
  }));
}

/** Quem comprou, como a lista e a confirmação mostram: o nome, o número formatado, ou "Cliente sem nome". */
export function nomeDoCliente(venda: Pick<VendaDoMes, "cliente" | "telefone">): string {
  return venda.cliente?.trim() || formatPhoneBR(venda.telefone) || "Cliente sem nome";
}

/** "hoje 11:08", "ontem 17:42", "03/10 15:20" — no fuso de Brasília, como o resto do painel. */
export function quandoFoi(iso: string, agora: Date): string {
  const dia = dayBROf(iso);
  if (!dia) return "";
  const hora = horaBR(iso);
  if (dia === dayBR(agora)) return `hoje ${hora}`;
  if (dia === dayBRAgo(1, agora)) return `ontem ${hora}`;
  return `${diaMesBR(iso)} ${hora}`;
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
] as const;

/** "2026-10" → "outubro" (o `mes` de `VendasDoMes`); lixo vira "". */
export function nomeDoMes(mes: string): string {
  const numero = Number(/^\d{4}-(\d{2})$/.exec(mes)?.[1]);
  return MESES[numero - 1] ?? "";
}

export function rotuloDeVendas(quantidade: number): string {
  if (quantidade === 0) return "nenhuma venda";
  return quantidade === 1 ? "1 venda" : `${quantidade} vendas`;
}

/** Nomes que ela já usou no mês, para o `<datalist>`: sem repetir, o mais recente primeiro. */
export function nomesDeProdutos(vendas: readonly Pick<VendaDoMes, "itens">[]): string[] {
  const vistos = new Map<string, string>();
  for (const venda of vendas) {
    for (const item of venda.itens) {
      const nome = item.nome.trim();
      const chave = nome.toLocaleLowerCase("pt-BR");
      if (chave && !vistos.has(chave)) vistos.set(chave, nome);
    }
  }
  return [...vistos.values()];
}

/** O `{ error }` das rotas de vendas; o 403 do guard vem em texto puro (`MENSAGEM_BLOQUEIO`) e cai no padrão. */
export function mensagemDeErro(corpo: unknown, padrao: string): string {
  const erro = (corpo as { error?: unknown } | null)?.error;
  return typeof erro === "string" && erro.trim() ? erro : padrao;
}
```

- [ ] **Step 4:** rodar o Step 2 de novo → **PASS** (13 testes).

- [ ] **Step 5:** commit:

```powershell
git -C <wt> add apps/web/src/lib/painel/vendas.ts apps/web/src/lib/painel/vendas.test.ts
```
```powershell
git -C <wt> diff --cached --stat
```
```powershell
git -C <wt> commit -m "feat(vendas): pure rules for the sales screen" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: formulário de produtos e confirmação

**Files:** criar `src/components/painel/vendas/itens-da-venda.tsx`, `src/components/painel/vendas/venda-registrada.tsx`
**Depends-on:** Task 1
**Interfaces (produz):**
```ts
export const LISTA_DE_PRODUTOS = "vendas-produtos";
export const CLASSE_DO_CAMPO: string; export const CLASSE_DO_ROTULO: string;
export function FormularioDeItens(props: {
  idBase: string; titulo: string; linhasIniciais: readonly LinhaDaVenda[]; verbo: string;
  aoEnviar: (itens: ItemDeVenda[]) => Promise<string | null>; // mensagem de erro, ou null quando deu certo
}): JSX.Element;
export function VendaRegistrada(props: { venda: VendaDoMes; aoNovaVenda: () => void }): JSX.Element;
```

- [ ] **Step 1:** `src/components/painel/vendas/itens-da-venda.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { brl } from "@/components/painel/home/format";
import {
  LINHA_VAZIA,
  MAX_ITENS,
  MAX_NOME_DO_PRODUTO,
  pecasDasLinhas,
  rotuloDePecas,
  subtotalDaLinha,
  totalDasLinhas,
  validarLinhas,
  type LinhaDaVenda,
} from "@/lib/painel/vendas";
import { cn } from "@/lib/utils";
import type { ItemDeVenda } from "@/lib/vendas/tipos";

/** id do `<datalist>` com os nomes já usados no mês; a página o renderiza uma vez. */
export const LISTA_DE_PRODUTOS = "vendas-produtos";

/** 16px no campo: abaixo disso o iOS dá zoom ao focar (spec §4). */
export const CLASSE_DO_CAMPO =
  "h-11 w-full rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-[16px] text-volt-950 placeholder:text-slate-600";
export const CLASSE_DO_ROTULO = "mb-1 block text-13 font-semibold text-volt-950";

/** Chave estável: com o índice, remover a 2ª de 3 linhas levaria foco e texto em composição para a linha errada. */
type LinhaNaTela = LinhaDaVenda & { chave: number };

type Props = {
  /** Prefixo dos ids: o registro e cada correção têm o seu, senão dois "Nome do produto" dividem o mesmo id. */
  idBase: string;
  titulo: string;
  linhasIniciais: readonly LinhaDaVenda[];
  /** "Registrar venda" → botão "Registrar venda · R$ 289,70". */
  verbo: string;
  /** Devolve a mensagem de erro, ou null quando deu certo. */
  aoEnviar: (itens: ItemDeVenda[]) => Promise<string | null>;
};

/**
 * Produtos da venda (spec §4, mockup "Registrar venda"): nome com `<datalist>`,
 * quantidade, valor unitário, subtotal e remover por linha; "Adicionar produto";
 * total ao vivo e o envio com o total no rótulo. Valida com as mesmas regras da
 * API antes de enviar e desabilita o botão enquanto salva (clique duplo não
 * duplica a venda — spec §6, mesmo padrão do `RegistroDePedido`).
 */
export function FormularioDeItens({ idBase, titulo, linhasIniciais, verbo, aoEnviar }: Props) {
  const proxima = useRef(linhasIniciais.length);
  const [linhas, setLinhas] = useState<LinhaNaTela[]>(() => linhasIniciais.map((linha, i) => ({ ...linha, chave: i })));
  const [focar, setFocar] = useState<number | null>(null);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const total = totalDasLinhas(linhas);
  const idTitulo = `${idBase}-titulo`;

  function mudar(chave: number, campo: keyof LinhaDaVenda, valor: string) {
    setLinhas((atuais) => atuais.map((linha) => (linha.chave === chave ? { ...linha, [campo]: valor } : linha)));
    setErro("");
  }

  function adicionar() {
    const chave = proxima.current;
    proxima.current += 1;
    setLinhas((atuais) => [...atuais, { ...LINHA_VAZIA, chave }]);
    setFocar(chave);
  }

  function remover(chave: number) {
    setLinhas((atuais) => atuais.filter((linha) => linha.chave !== chave));
  }

  async function enviar() {
    if (enviando) return;
    const validacao = validarLinhas(linhas);
    if (!validacao.ok) {
      setErro(validacao.erro);
      return;
    }
    setErro("");
    setEnviando(true);
    try {
      const falha = await aoEnviar(validacao.itens);
      if (falha) setErro(falha);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      aria-labelledby={idTitulo}
      onSubmit={(e) => {
        e.preventDefault();
        void enviar();
      }}
      className="flex flex-col gap-3.5 rounded-xl border border-line-200 bg-paper-0 p-4"
    >
      <h2 id={idTitulo} className="font-brand text-15 font-bold text-volt-950">
        {titulo}
      </h2>

      {linhas.map((linha, i) => {
        const id = `${idBase}-${linha.chave}`;
        return (
          <fieldset key={linha.chave} className="flex flex-col gap-2 border-b border-line-200 pb-3.5">
            <legend className="font-data mb-1.5 text-12 text-slate-600">Produto {i + 1}</legend>
            <div>
              <label htmlFor={`${id}-nome`} className={CLASSE_DO_ROTULO}>
                Nome do produto
              </label>
              <input
                id={`${id}-nome`}
                list={LISTA_DE_PRODUTOS}
                value={linha.nome}
                onChange={(e) => mudar(linha.chave, "nome", e.target.value)}
                autoComplete="off"
                autoFocus={linha.chave === focar}
                maxLength={MAX_NOME_DO_PRODUTO}
                placeholder="Ex.: Vestido midi canelado"
                className={CLASSE_DO_CAMPO}
              />
            </div>
            <div className="grid grid-cols-[76px_minmax(0,1fr)_44px] items-end gap-2">
              <div>
                <label htmlFor={`${id}-qtd`} className={CLASSE_DO_ROTULO}>
                  Qtd
                </label>
                <input
                  id={`${id}-qtd`}
                  inputMode="numeric"
                  value={linha.quantidade}
                  onChange={(e) => mudar(linha.chave, "quantidade", e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className={cn(CLASSE_DO_CAMPO, "font-data text-center")}
                />
              </div>
              <div>
                <label htmlFor={`${id}-valor`} className={CLASSE_DO_ROTULO}>
                  Valor un. (R$)
                </label>
                <input
                  id={`${id}-valor`}
                  inputMode="decimal"
                  value={linha.valor}
                  onChange={(e) => mudar(linha.chave, "valor", e.target.value.replace(/[^\d,.]/g, ""))}
                  placeholder="0,00"
                  className={cn(CLASSE_DO_CAMPO, "font-data")}
                />
              </div>
              <button
                type="button"
                aria-label={`Remover produto ${i + 1}`}
                disabled={linhas.length === 1}
                onClick={() => remover(linha.chave)}
                className="grid h-11 w-11 place-items-center rounded-[var(--radius-control)] border border-line-200 bg-paper-0 text-slate-600 disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <p className="text-right text-13 text-slate-600">
              Subtotal <span className="font-data font-medium text-volt-950">{brl.format(subtotalDaLinha(linha))}</span>
            </p>
          </fieldset>
        );
      })}

      <button
        type="button"
        onClick={adicionar}
        disabled={linhas.length >= MAX_ITENS}
        className="inline-flex h-11 items-center gap-1.5 self-start rounded-[var(--radius-control)] border border-dashed border-line-200 px-3.5 text-[14px] font-semibold text-volt-950 disabled:opacity-40"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Adicionar produto
      </button>

      <div className="flex items-baseline justify-between gap-3 pt-1">
        <span className="text-[14px] font-semibold text-volt-950">Total · {rotuloDePecas(pecasDasLinhas(linhas))}</span>
        <span data-testid="vendas-total" className="font-data text-20 font-semibold tabular-nums text-volt-950">
          {brl.format(total)}
        </span>
      </div>

      {erro && (
        <p role="alert" className="text-13 text-danger-700">
          {erro}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="h-12 rounded-[var(--radius-control)] bg-cobalt-500 text-15 font-semibold text-paper-0 disabled:opacity-50"
      >
        {enviando ? "Salvando…" : `${verbo} · ${brl.format(total)}`}
      </button>
    </form>
  );
}
```

- [ ] **Step 2:** `src/components/painel/vendas/venda-registrada.tsx`:

```tsx
"use client";

import { Check } from "lucide-react";
import { brl } from "@/components/painel/home/format";
import { nomeDoCliente } from "@/lib/painel/vendas";
import type { VendaDoMes } from "@/lib/vendas/tipos";

/**
 * Depois do registro (spec §4): o que foi gravado, a janela de 24h e o caminho
 * para a próxima. O anúncio para leitor de tela é o `role="status"` sempre
 * montado na página; este cartão é o que se vê. O foco vai para "Registrar
 * outra venda": o botão de envio sumiu, e sem isso o foco cairia no `body`.
 */
export function VendaRegistrada({ venda, aoNovaVenda }: { venda: VendaDoMes; aoNovaVenda: () => void }) {
  return (
    <section
      data-testid="venda-registrada"
      aria-labelledby="venda-registrada-titulo"
      className="flex flex-col gap-3 rounded-xl bg-paper-0 p-4 ring-1 ring-inset ring-success-700"
    >
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-success-700 text-paper-0">
          <Check className="h-4 w-4" strokeWidth={2.5} />
        </span>
        <div className="min-w-0">
          <p id="venda-registrada-titulo" className="text-15 font-semibold text-volt-950">
            Venda registrada
          </p>
          <p className="mt-0.5 truncate text-13 text-slate-600">
            {nomeDoCliente(venda)} · <span className="font-data">{brl.format(venda.total)}</span>
          </p>
        </div>
      </div>
      <p className="text-13 text-slate-600">Dá pra corrigir nas próximas 24 horas. Depois disso, só o dono da loja.</p>
      <button
        type="button"
        onClick={aoNovaVenda}
        autoFocus
        className="h-11 rounded-[var(--radius-control)] bg-volt-950 text-[14px] font-semibold text-paper-0"
      >
        Registrar outra venda
      </button>
    </section>
  );
}
```

- [ ] **Step 3:** `Set-Location <wt>\apps\web; npx tsc --noEmit -p tsconfig.json` → limpo.

- [ ] **Step 4:** commit:

```powershell
git -C <wt> add apps/web/src/components/painel/vendas/itens-da-venda.tsx apps/web/src/components/painel/vendas/venda-registrada.tsx
```
```powershell
git -C <wt> diff --cached --stat
```
```powershell
git -C <wt> commit -m "feat(vendas): product lines form and sale confirmation" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: busca do cliente por número

**Files:** criar `src/components/painel/vendas/busca-do-cliente.tsx`
**Depends-on:** Task 2 (classes de campo)
**Interfaces (produz):**
```ts
export type ClienteBuscado = BuscaDeContato & { telefone: string }; // o número como ela digitou
export function BuscaDoCliente(props: { aoEncontrar: (cliente: ClienteBuscado) => void; focar: boolean }): JSX.Element;
export function ClienteDaVenda(props: { cliente: ClienteBuscado; nome: string; aoMudarNome: (nome: string) => void; aoTrocar: () => void }): JSX.Element;
```
**Consome:** `GET /api/vendas/contato?telefone=` → `200 BuscaDeContato` · `400/429 { error }`; `variantesDoTelefone`, `telefoneCanonico`.

- [ ] **Step 1:** `src/components/painel/vendas/busca-do-cliente.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { iniciais } from "@/lib/painel/inicio";
import { mensagemDeErro } from "@/lib/painel/vendas";
import { formatPhoneBR } from "@/lib/phone";
import { telefoneCanonico, variantesDoTelefone } from "@/lib/vendas/telefone";
import type { BuscaDeContato } from "@/lib/vendas/tipos";
import { CLASSE_DO_CAMPO, CLASSE_DO_ROTULO } from "./itens-da-venda";

/** O resultado da busca mais o número como ela digitou: é ele que vai no POST quando não há contato. */
export type ClienteBuscado = BuscaDeContato & { telefone: string };

const ERRO_NA_BUSCA = "Não deu pra buscar agora. Tente de novo.";

/**
 * Só por número (decisão de 07/10): a vendedora nunca vê a lista de contatos da
 * loja. Sem DDD a busca nem sai — mesma regra da rota (`variantesDoTelefone`).
 */
export function BuscaDoCliente({ aoEncontrar, focar }: { aoEncontrar: (cliente: ClienteBuscado) => void; focar: boolean }) {
  const [telefone, setTelefone] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState("");

  async function buscar() {
    if (buscando) return;
    if (variantesDoTelefone(telefone) === null) {
      setErro("Digite o número com DDD.");
      return;
    }
    setErro("");
    setBuscando(true);
    try {
      const res = await fetch(`/api/vendas/contato?telefone=${encodeURIComponent(telefone)}`);
      const corpo: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setErro(mensagemDeErro(corpo, ERRO_NA_BUSCA));
        return;
      }
      const busca = corpo as BuscaDeContato;
      aoEncontrar({ contato: busca.contato ?? null, optout: busca.optout === true, telefone });
    } catch {
      setErro(ERRO_NA_BUSCA);
    } finally {
      setBuscando(false);
    }
  }

  return (
    <form
      aria-label="Buscar cliente"
      onSubmit={(e) => {
        e.preventDefault();
        void buscar();
      }}
      className="flex flex-col gap-1"
    >
      <label htmlFor="vendas-telefone" className={CLASSE_DO_ROTULO}>
        WhatsApp do cliente
      </label>
      <div className="flex gap-2">
        <input
          id="vendas-telefone"
          value={telefone}
          onChange={(e) => {
            setTelefone(e.target.value);
            setErro("");
          }}
          inputMode="tel"
          autoComplete="off"
          autoFocus={focar}
          maxLength={30}
          placeholder="(11) 98765-4321"
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? "vendas-telefone-erro" : undefined}
          className={CLASSE_DO_CAMPO}
        />
        <button
          type="submit"
          disabled={buscando}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] bg-volt-950 px-4 text-[14px] font-semibold text-paper-0 disabled:opacity-50"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          {buscando ? "Buscando…" : "Buscar"}
        </button>
      </div>
      {erro && (
        <p id="vendas-telefone-erro" role="alert" className="text-13 text-danger-700">
          {erro}
        </p>
      )}
    </form>
  );
}

function BotaoTrocar({ aoTrocar }: { aoTrocar: () => void }) {
  return (
    <button
      type="button"
      onClick={aoTrocar}
      aria-label="Trocar cliente"
      className="inline-flex min-h-11 shrink-0 items-center px-2 text-13 font-semibold text-cobalt-500"
    >
      Trocar
    </button>
  );
}

type ClienteProps = {
  cliente: ClienteBuscado;
  nome: string;
  aoMudarNome: (nome: string) => void;
  aoTrocar: () => void;
};

/**
 * O cliente escolhido (mockup): o contato achado, ou "Nenhum cliente com esse
 * número" com o nome opcional — ele entra nos contatos junto com a venda. Número
 * em opt-out registra a venda sem virar contato (spec §3), então o nome some.
 */
export function ClienteDaVenda({ cliente, nome, aoMudarNome, aoTrocar }: ClienteProps) {
  const numero = formatPhoneBR(cliente.contato?.telefone ?? telefoneCanonico(cliente.telefone)) ?? cliente.telefone;

  if (cliente.contato) {
    const nomeDoContato = cliente.contato.nome?.trim() || null;
    return (
      <section aria-label="Cliente encontrado" className="flex items-center gap-3 rounded-xl border border-line-200 bg-paper-0 p-4">
        <span
          aria-hidden="true"
          className="font-data grid h-11 w-11 shrink-0 place-items-center rounded-full bg-canvas-100 text-13 font-semibold text-volt-950"
        >
          {iniciais(nomeDoContato)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-15 font-semibold text-volt-950">{nomeDoContato ?? "Cliente sem nome"}</p>
          <p className="font-data mt-0.5 truncate text-13 text-slate-600">{numero}</p>
        </div>
        <BotaoTrocar aoTrocar={aoTrocar} />
      </section>
    );
  }

  return (
    <section aria-label="Cliente não encontrado" className="flex flex-col gap-3 rounded-xl border border-dashed border-line-200 bg-paper-0 p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-15 font-semibold text-volt-950">Nenhum cliente com esse número</p>
          <p className="mt-0.5 text-13 text-slate-600">
            {cliente.optout
              ? "Esse número pediu pra não receber mensagens da loja: a venda fica registrada sem entrar nos contatos."
              : "Ele entra nos contatos da loja junto com a venda."}
          </p>
          <p className="font-data mt-1 text-13 text-volt-950">{numero}</p>
        </div>
        <BotaoTrocar aoTrocar={aoTrocar} />
      </div>
      {!cliente.optout && (
        <div>
          <label htmlFor="vendas-nome-cliente" className={CLASSE_DO_ROTULO}>
            Nome do cliente <span className="font-normal text-slate-600">(opcional)</span>
          </label>
          <input
            id="vendas-nome-cliente"
            value={nome}
            onChange={(e) => aoMudarNome(e.target.value)}
            autoComplete="off"
            maxLength={80}
            placeholder="Ex.: Maria Oliveira"
            className={CLASSE_DO_CAMPO}
          />
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2:** `npx tsc --noEmit -p tsconfig.json` → limpo.

- [ ] **Step 3:** commit:

```powershell
git -C <wt> add apps/web/src/components/painel/vendas/busca-do-cliente.tsx
```
```powershell
git -C <wt> diff --cached --stat
```
```powershell
git -C <wt> commit -m "feat(vendas): customer lookup by phone number only" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: minhas vendas do mês, corrigir e apagar

**Files:** criar `src/components/painel/vendas/minhas-vendas.tsx`
**Depends-on:** Task 2
**Interfaces (produz):**
```ts
export type MinhasVendasEstado = { dados: VendasDoMes | null; erro: boolean; recarregar: () => Promise<void> };
export function useMinhasVendas(): MinhasVendasEstado;
export function MinhasVendas(props: { estado: MinhasVendasEstado }): JSX.Element;
```
**Consome:** `GET /api/vendas` → `200 VendasDoMes`; `PATCH /api/vendas/[id]` body `{ itens }` → `200 VendaDoMes` · `403 { error }` · `404`; `DELETE /api/vendas/[id]` → `200 { ok: true }` · `403 { error }` · `404`.

- [ ] **Step 1:** `src/components/painel/vendas/minhas-vendas.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { useConfirmacao } from "@/components/painel/confirmacao";
import { brl } from "@/components/painel/home/format";
import { monthBR } from "@/lib/date-br";
import {
  linhasDaVenda,
  mensagemDeErro,
  nomeDoCliente,
  nomeDoMes,
  quandoFoi,
  resumoDosItens,
  rotuloDeVendas,
} from "@/lib/painel/vendas";
import type { ItemDeVenda, VendaDoMes, VendasDoMes } from "@/lib/vendas/tipos";
import { FormularioDeItens } from "./itens-da-venda";

export type MinhasVendasEstado = {
  dados: VendasDoMes | null;
  /** A última leitura falhou. Com `dados`, a lista anterior continua na tela. */
  erro: boolean;
  recarregar: () => Promise<void>;
};

/**
 * `GET /api/vendas` do mês corrente (Brasília). Recarregar mantém a lista na
 * tela até a resposta: depois de registrar, a venda nova entra sem esqueleto.
 */
export function useMinhasVendas(): MinhasVendasEstado {
  const [dados, setDados] = useState<VendasDoMes | null>(null);
  const [erro, setErro] = useState(false);

  const recarregar = useCallback(async () => {
    try {
      const res = await fetch("/api/vendas", { cache: "no-store" });
      if (!res.ok) throw new Error(`GET /api/vendas ${res.status}`);
      setDados((await res.json()) as VendasDoMes);
      setErro(false);
    } catch {
      setErro(true);
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  return { dados, erro, recarregar };
}

const ERRO_AO_SALVAR = "Não deu pra salvar a correção. Tente de novo.";
const ERRO_AO_APAGAR = "Não deu pra apagar a venda. Tente de novo.";
// Fallback só para resposta sem `{ error }`; com corpo, vale o da API (`MESSAGES.notFound`, PR 4).
const VENDA_SUMIU = "Venda não encontrada.";

type CorrecaoProps = {
  venda: VendaDoMes;
  cliente: string;
  aoFechar: () => void;
  aoMudou: () => Promise<void>;
};

/**
 * Corrigir (PATCH) e apagar (DELETE), inline na linha — a gramática da Vitrine
 * não usa modal para editar; só a pergunta de apagar vira folha
 * (`useConfirmacao`). 403 e 404 recarregam a lista: a linha vira "Fechada" ou
 * some, e a mensagem do servidor fica no painel aberto, que "Cancelar" fecha.
 */
function CorrecaoDaVenda({ venda, cliente, aoFechar, aoMudou }: CorrecaoProps) {
  const { pedirConfirmacao, folhaDeConfirmacao } = useConfirmacao();
  const [apagando, setApagando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar(itens: ItemDeVenda[]): Promise<string | null> {
    try {
      const res = await fetch(`/api/vendas/${venda.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens }),
      });
      if (!res.ok) {
        const corpo: unknown = await res.json().catch(() => null);
        if (res.status === 403 || res.status === 404) void aoMudou();
        return mensagemDeErro(corpo, res.status === 404 ? VENDA_SUMIU : ERRO_AO_SALVAR);
      }
      await aoMudou();
      aoFechar();
      return null;
    } catch {
      return ERRO_AO_SALVAR;
    }
  }

  async function apagar() {
    const confirmou = await pedirConfirmacao({
      titulo: "Apagar esta venda?",
      texto: `A venda de ${cliente} (${brl.format(venda.total)}) sai das suas vendas e do caixa da loja. Não dá pra desfazer.`,
      rotulo: "Apagar venda",
      destrutivo: true,
    });
    if (!confirmou) return;
    setApagando(true);
    setErro("");
    try {
      const res = await fetch(`/api/vendas/${venda.id}`, { method: "DELETE" });
      if (!res.ok) {
        const corpo: unknown = await res.json().catch(() => null);
        if (res.status === 403 || res.status === 404) void aoMudou();
        setErro(mensagemDeErro(corpo, res.status === 404 ? VENDA_SUMIU : ERRO_AO_APAGAR));
        return;
      }
      aoFechar();
      await aoMudou();
    } catch {
      setErro(ERRO_AO_APAGAR);
    } finally {
      setApagando(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <FormularioDeItens
        idBase={`corrigir-${venda.id}`}
        titulo="Corrigir venda"
        linhasIniciais={linhasDaVenda(venda)}
        verbo="Salvar correção"
        aoEnviar={salvar}
      />
      {erro && (
        <p role="alert" className="text-13 text-danger-700">
          {erro}
        </p>
      )}
      <div className="flex flex-wrap justify-between gap-2">
        <button
          type="button"
          onClick={aoFechar}
          className="min-h-11 rounded-[var(--radius-control)] border border-line-200 px-4 text-[14px] font-semibold text-volt-950"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void apagar()}
          disabled={apagando}
          className="min-h-11 rounded-[var(--radius-control)] px-4 text-[14px] font-semibold text-danger-700 disabled:opacity-50"
        >
          {apagando ? "Apagando…" : "Apagar venda"}
        </button>
      </div>
      {folhaDeConfirmacao}
    </div>
  );
}

type VendaNaListaProps = {
  venda: VendaDoMes;
  agora: Date;
  corrigindo: boolean;
  aoAbrir: () => void;
  aoFechar: () => void;
  aoMudou: () => Promise<void>;
};

/** Uma venda: quem, o quê, quando, quanto; "Corrigir" até 24h (`editavel` vem do servidor), depois "Fechada". */
function VendaNaLista({ venda, agora, corrigindo, aoAbrir, aoFechar, aoMudou }: VendaNaListaProps) {
  const cliente = nomeDoCliente(venda);
  const idPainel = `painel-corrigir-${venda.id}`;
  return (
    <li className="border-b border-line-200 last:border-b-0">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-volt-950">{cliente}</p>
          <p className="mt-0.5 truncate text-12 text-slate-600">{resumoDosItens(venda.itens)}</p>
          <p className="font-data mt-0.5 text-12 text-slate-600">{quandoFoi(venda.criadaEm, agora)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="font-data text-[14px] font-semibold tabular-nums text-volt-950">{brl.format(venda.total)}</span>
          {venda.editavel ? (
            <button
              type="button"
              aria-expanded={corrigindo}
              aria-controls={idPainel}
              aria-label={`${corrigindo ? "Fechar correção" : "Corrigir venda"} de ${cliente}`}
              onClick={corrigindo ? aoFechar : aoAbrir}
              className="min-h-11 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-12 font-semibold text-volt-950"
            >
              {corrigindo ? "Fechar" : "Corrigir"}
            </button>
          ) : (
            <span title="Passou de 24h: só o dono corrige" className="inline-flex items-center gap-1 text-12 text-slate-600">
              <Lock className="h-3 w-3" aria-hidden="true" />
              Fechada
              <span className="sr-only">: passou de 24 horas, só o dono da loja corrige</span>
            </span>
          )}
        </div>
      </div>
      {corrigindo && (
        <div id={idPainel} className="px-4 pb-4">
          <CorrecaoDaVenda venda={venda} cliente={cliente} aoFechar={aoFechar} aoMudou={aoMudou} />
        </div>
      )}
    </li>
  );
}

/**
 * "Minhas vendas · mês" (spec §4): total vendido por ela no mês e a lista, mais
 * recentes primeiro. Só as vendas de quem chamou — o caixa da loja fica com
 * dono e admin (decisão de 07/10). `truncado`: o PostgREST corta em 1000 sem
 * erro, e a tela diz que o total é parcial (spec §3).
 */
export function MinhasVendas({ estado }: { estado: MinhasVendasEstado }) {
  const { dados, erro, recarregar } = estado;
  const [corrigindo, setCorrigindo] = useState<string | null>(null);
  const agora = new Date();

  return (
    <section aria-labelledby="minhas-vendas-titulo" className="mt-2 flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="minhas-vendas-titulo" className="font-brand text-15 font-bold text-volt-950">
          Minhas vendas · {nomeDoMes(dados?.mes ?? monthBR(agora))}
        </h2>
        {dados && <span className="text-13 text-slate-600">{rotuloDeVendas(dados.quantidade)}</span>}
      </div>

      {dados ? (
        <>
          <div className="flex items-baseline justify-between gap-3 rounded-xl bg-volt-950 px-4 py-3.5">
            <span className="text-13 text-canvas-100">Vendido por você no mês</span>
            <span data-testid="vendas-total-do-mes" className="font-data text-20 font-semibold tabular-nums text-paper-0">
              {brl.format(dados.total)}
            </span>
          </div>
          {dados.truncado && (
            <p className="text-13 text-slate-600">Total parcial: o mês passou de mil vendas e a lista mostra as mais recentes.</p>
          )}
          {erro && (
            <p role="alert" className="text-13 text-danger-700">
              Não deu pra atualizar a lista agora.
            </p>
          )}
          {dados.vendas.length === 0 ? (
            <p className="rounded-xl border border-line-200 bg-paper-0 px-4 py-6 text-center text-[14px] text-slate-600">
              Nenhuma venda registrada neste mês.
            </p>
          ) : (
            <ul className="rounded-xl border border-line-200 bg-paper-0">
              {dados.vendas.map((venda) => (
                <VendaNaLista
                  key={venda.id}
                  venda={venda}
                  agora={agora}
                  corrigindo={corrigindo === venda.id}
                  aoAbrir={() => setCorrigindo(venda.id)}
                  aoFechar={() => setCorrigindo(null)}
                  aoMudou={recarregar}
                />
              ))}
            </ul>
          )}
        </>
      ) : erro ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line-200 bg-paper-0 px-4 py-3 text-[14px] text-volt-950"
        >
          Não deu pra carregar suas vendas agora.
          <button
            type="button"
            onClick={() => void recarregar()}
            className="min-h-11 rounded-[var(--radius-control)] border border-line-200 px-3 text-13 font-semibold text-volt-950"
          >
            Tentar de novo
          </button>
        </div>
      ) : (
        <div role="status" aria-label="Carregando suas vendas" className="space-y-2.5">
          <div className="pn-skeleton h-14 rounded-xl" data-testid="painel-skeleton" />
          <div className="pn-skeleton h-40 rounded-xl" data-testid="painel-skeleton" />
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2:** `npx tsc --noEmit -p tsconfig.json` → limpo.

- [ ] **Step 3:** commit:

```powershell
git -C <wt> add apps/web/src/components/painel/vendas/minhas-vendas.tsx
```
```powershell
git -C <wt> diff --cached --stat
```
```powershell
git -C <wt> commit -m "feat(vendas): my sales of the month with fix and delete within 24h" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: página `/painel/vendas` e o smoke de rotas

**Files:** criar `src/app/painel/vendas/page.tsx`; modificar `e2e/conteudo-esperado.ts`
**Depends-on:** Tasks 2, 3, 4
**Consome:** `POST /api/vendas` body `{ leadId?, telefone?, nome?, itens }` → `201 VendaDoMes` · `400 { error }`.

- [ ] **Step 1:** `src/app/painel/vendas/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { brl } from "@/components/painel/home/format";
import { BuscaDoCliente, ClienteDaVenda, type ClienteBuscado } from "@/components/painel/vendas/busca-do-cliente";
import { FormularioDeItens, LISTA_DE_PRODUTOS } from "@/components/painel/vendas/itens-da-venda";
import { MinhasVendas, useMinhasVendas } from "@/components/painel/vendas/minhas-vendas";
import { VendaRegistrada } from "@/components/painel/vendas/venda-registrada";
import { LINHA_VAZIA, mensagemDeErro, nomeDoCliente, nomesDeProdutos } from "@/lib/painel/vendas";
import type { ItemDeVenda, VendaDoMes } from "@/lib/vendas/tipos";

const ERRO_AO_REGISTRAR = "Não deu pra registrar a venda. Tente de novo.";

/**
 * Registrar venda (spec 2026-10-07 §4, mockup "Registrar venda"): busca por
 * número → cliente → produtos com total ao vivo → confirmação; embaixo, as
 * vendas dela no mês. Celular primeiro, uma coluna em qualquer largura.
 *
 * O formulário de produtos fica montado (escondido) enquanto ela troca o
 * cliente, para não perder o que já digitou; "Registrar outra venda" o remonta
 * vazio (`rodada`).
 */
export default function PainelVendas() {
  const minhas = useMinhasVendas();
  const [cliente, setCliente] = useState<ClienteBuscado | null>(null);
  const [nome, setNome] = useState("");
  const [venda, setVenda] = useState<VendaDoMes | null>(null);
  const [rodada, setRodada] = useState(0);
  const [focarBusca, setFocarBusca] = useState(false);
  const [anuncio, setAnuncio] = useState("");
  const produtos = nomesDeProdutos(minhas.dados?.vendas ?? []);

  async function registrar(itens: ItemDeVenda[]): Promise<string | null> {
    if (!cliente) return "Busque o cliente pelo número primeiro.";
    const clienteNovo = !cliente.contato && !cliente.optout;
    try {
      const res = await fetch("/api/vendas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: cliente.contato?.id,
          telefone: cliente.telefone,
          nome: clienteNovo ? nome.trim() || undefined : undefined,
          itens,
        }),
      });
      const corpo: unknown = await res.json().catch(() => null);
      if (!res.ok) return mensagemDeErro(corpo, ERRO_AO_REGISTRAR);
      const salva = corpo as VendaDoMes;
      setVenda(salva);
      setAnuncio(`Venda registrada: ${nomeDoCliente(salva)}, ${brl.format(salva.total)}.`);
      void minhas.recarregar();
      return null;
    } catch {
      return ERRO_AO_REGISTRAR;
    }
  }

  function escolher(encontrado: ClienteBuscado) {
    setCliente(encontrado);
    setNome("");
  }

  function trocarCliente() {
    setCliente(null);
    setFocarBusca(true);
  }

  function novaVenda() {
    setVenda(null);
    setCliente(null);
    setNome("");
    setAnuncio("");
    setRodada((r) => r + 1);
    setFocarBusca(true);
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 py-5 lg:py-8">
      <header>
        <h1 className="font-brand text-28 font-bold tracking-[-0.4px] text-volt-950">Registrar venda</h1>
        <p className="mt-1 text-[14px] text-slate-600">Busque o cliente pelo número do WhatsApp.</p>
      </header>

      {/* Sempre montado: região viva inserida já com texto não é anunciada (trial-banner.tsx:14-15). */}
      <p role="status" className="sr-only">
        {anuncio}
      </p>

      {venda ? (
        <VendaRegistrada venda={venda} aoNovaVenda={novaVenda} />
      ) : cliente ? (
        <ClienteDaVenda cliente={cliente} nome={nome} aoMudarNome={setNome} aoTrocar={trocarCliente} />
      ) : (
        <BuscaDoCliente aoEncontrar={escolher} focar={focarBusca} />
      )}

      <div hidden={!cliente || venda !== null}>
        <FormularioDeItens
          key={rodada}
          idBase="venda"
          titulo="Produtos"
          linhasIniciais={[LINHA_VAZIA]}
          verbo="Registrar venda"
          aoEnviar={registrar}
        />
      </div>

      <datalist id={LISTA_DE_PRODUTOS}>
        {produtos.map((produto) => (
          <option key={produto} value={produto} />
        ))}
      </datalist>

      <MinhasVendas estado={minhas} />
    </div>
  );
}
```

- [ ] **Step 2:** o smoke de rotas (`e2e/rotas.ts`) acha a página sozinho e a guarda de completude de `e2e/conteudo-esperado.ts` reprova rota sem entrada. Em `e2e/conteudo-esperado.ts`, depois de `import type { APIRequestContext } from "@playwright/test";` (L17):

```ts

import { formatPhoneBR } from "../src/lib/phone";
```

  e, depois da entrada `"/painel/resultados"` (antes do `};` final do objeto `CONTEUDO_ESPERADO`):

```ts

  "/painel/vendas": {
    // O <h1> é da página, não do shell; o botão "Registrar venda · R$ …" fica escondido até
    // escolher o cliente, então só o título casa visível.
    ancora: /Registrar venda/,
    lista: {
      // Para o usuário de QA (dono), "Minhas vendas" são as vendas que ELE registrou: quase
      // sempre nenhuma, e a tela tem que dizer isso em vez de travar no esqueleto.
      api: "/api/vendas",
      marca: (j) => {
        const vendas = (j as { vendas?: Array<{ cliente?: unknown; telefone?: unknown }> } | null)?.vendas;
        if (!Array.isArray(vendas) || vendas.length === 0) return null;
        // Sem nome, a lista mostra o número formatado (nomeDoCliente).
        return primeiroTexto(vendas, "cliente") ?? formatPhoneBR(String(vendas[0]?.telefone ?? ""));
      },
      vazio: /Nenhuma venda registrada/i,
    },
  },
```

- [ ] **Step 3:** `npx tsc --noEmit -p tsconfig.json`; `npx tsc --noEmit -p tsconfig.e2e.json`; `npm run lint`; `npx tsx scripts/check-painel-vitrine.ts` → limpos.

- [ ] **Step 4:** commit (fim do bloco A):

```powershell
git -C <wt> add apps/web/src/app/painel/vendas/page.tsx apps/web/e2e/conteudo-esperado.ts
```
```powershell
git -C <wt> diff --cached --stat
```
```powershell
git -C <wt> commit -m "feat(vendas): /painel/vendas page" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: menu por módulo (TDD)

**Files:** modificar `src/lib/painel-nav.ts`, `src/lib/painel-nav.test.ts`
**Depends-on:** Task 5 (o teste "every navigation destination is a route that exists" exige `app/painel/vendas/page.tsx`)
**Interfaces (produz):**
```ts
export type NavItem = { …; modulo?: Modulo };
export function visivelNoMenu(item: NavItem, acesso: Acesso | null, liberacoes: Liberacoes | null): boolean;
export function podePostar(acesso: Acesso | null): boolean;
export function itensDaBarra(acesso: Acesso | null, liberacoes: Liberacoes | null): NavItem[];
export type DestinoDaPagina = "mostrar" | "ir-para-vendas" | "bloquear";
export function destinoDaPagina(acesso: Acesso | null, pathname: string): DestinoDaPagina;
```

Decisões (testadas no Step 1):
- `VENDAS` entra em `NAV_GROUPS` (logo, em `NAV_ALL`) depois de `INICIO`, antes de `DISPAROS`: a ordem da vendedora fica "Vendas, Disparos", como no mockup. **Não** entra em `NAV_BARRA_DESKTOP`, que continua os seis do dono (o teste existente segue verde); a barra da vendedora é `NAV_ALL` filtrado (`itensDaBarra`).
- `acesso === null` (o `/api/auth/me` não respondeu ou falhou): só aparece item **sem** `modulo` e liberado — Vendas e Disparos nunca piscam para quem não tem. A casca nem desenha módulos enquanto `carregado` é falso (Task 7); `null` depois de carregar é falha do `/api/auth/me`, e aí o painel mostra o que mostrava antes menos Vendas/Disparos/Postar.
- `seller`: só item cujo `modulo` está em `modulosDoAcesso(acesso)` (e liberado). Outros papéis: `liberado` como hoje, e `VENDAS` escondido.
- `podePostar` = Disparos visível: quem não vê a tela de postar não ganha o atalho.
- `destinoDaPagina`: papel ≠ `seller` (ou desconhecido) → `"mostrar"`; vendedora em `/painel` → `"ir-para-vendas"`; fora de `paginaLiberada` → `"bloquear"`.

- [ ] **Step 1 (teste):** em `src/lib/painel-nav.test.ts`, trocar o bloco de import (L5-18) por:

```ts
import type { Acesso } from "@/lib/auth/modulos";
import {
  NAV_ALL,
  NAV_BARRA_DESKTOP,
  NAV_BARRA_DIREITA,
  NAV_BARRA_ESQUERDA,
  NAV_FOOTER,
  NAV_GROUPS,
  NAV_GRUPOS_ORDEM,
  NAV_MOBILE_PRIMARY,
  destinoDaPagina,
  isNavItemActive,
  itensDaBarra,
  liberado,
  podePostar,
  resumo,
  visivelNoMenu,
  type NavItem,
} from "./painel-nav";
```

  e acrescentar no fim do arquivo:

```ts
// --- Acesso da vendedora (spec 2026-10-07 §1, "Página") ---

const DONO: Acesso = { role: "owner", modules: [] };
const OPERADOR: Acesso = { role: "operator", modules: [] };
const VENDEDORA: Acesso = { role: "seller", modules: [] };
const VENDEDORA_POSTA: Acesso = { role: "seller", modules: ["postar"] };
const COM_INSTAGRAM = { instagram: true };

const item = (href: string) => NAV_ALL.find((i) => i.href === href) as NavItem;
const visiveis = (acesso: Acesso | null) =>
  NAV_ALL.filter((i) => visivelNoMenu(i, acesso, COM_INSTAGRAM)).map((i) => i.href);

test("Vendas é item do módulo vendas, em Vender; Disparos é do módulo postar; a barra do dono não muda", () => {
  assert.equal(item("/painel/vendas").modulo, "vendas");
  assert.equal(item("/painel/vendas").grupo, "vender");
  assert.equal(item("/painel/disparos").modulo, "postar");
  assert.ok(!NAV_BARRA_DESKTOP.some((i) => i.href === "/painel/vendas"));
});

test("dono e operador veem o menu de antes, sem Vendas", () => {
  for (const acesso of [DONO, OPERADOR]) {
    assert.ok(!visiveis(acesso).includes("/painel/vendas"));
    assert.deepEqual(visiveis(acesso), NAV_ALL.filter((i) => i.href !== "/painel/vendas").map((i) => i.href));
    assert.equal(visivelNoMenu(item("/painel/instagram"), acesso, { instagram: false }), false);
  }
});

test("a vendedora só vê os itens dos módulos dela, Vendas primeiro", () => {
  assert.deepEqual(visiveis(VENDEDORA), ["/painel/vendas"]);
  assert.deepEqual(visiveis(VENDEDORA_POSTA), ["/painel/vendas", "/painel/disparos"]);
});

test("sem acesso conhecido, nada que dependa de módulo aparece", () => {
  assert.equal(visivelNoMenu(item("/painel/vendas"), null, COM_INSTAGRAM), false);
  assert.equal(visivelNoMenu(item("/painel/disparos"), null, COM_INSTAGRAM), false);
  assert.equal(visivelNoMenu(item("/painel/grupos"), null, COM_INSTAGRAM), true);
  assert.equal(visivelNoMenu(item("/painel/instagram"), null, null), false);
});

test("Postar segue Disparos", () => {
  assert.equal(podePostar(DONO), true);
  assert.equal(podePostar(OPERADOR), true);
  assert.equal(podePostar(VENDEDORA), false);
  assert.equal(podePostar(VENDEDORA_POSTA), true);
  assert.equal(podePostar(null), false);
});

test("barra de cima: o dono vê os seis do dia; a vendedora, só o que é dela", () => {
  assert.deepEqual(itensDaBarra(DONO, COM_INSTAGRAM).map((i) => i.href), NAV_BARRA_DESKTOP.map((i) => i.href));
  assert.deepEqual(itensDaBarra(VENDEDORA, null).map((i) => i.href), ["/painel/vendas"]);
  assert.deepEqual(itensDaBarra(VENDEDORA_POSTA, null).map((i) => i.href), ["/painel/vendas", "/painel/disparos"]);
});

test("guarda: a Início da vendedora é Vendas; fora do acesso, bloqueio; outros papéis passam", () => {
  assert.equal(destinoDaPagina(VENDEDORA, "/painel"), "ir-para-vendas");
  assert.equal(destinoDaPagina(VENDEDORA, "/painel/vendas"), "mostrar");
  assert.equal(destinoDaPagina(VENDEDORA, "/painel/contatos"), "bloquear");
  assert.equal(destinoDaPagina(VENDEDORA, "/painel/configuracoes"), "bloquear");
  assert.equal(destinoDaPagina(VENDEDORA, "/painel/disparos"), "bloquear");
  assert.equal(destinoDaPagina(VENDEDORA_POSTA, "/painel/disparos"), "mostrar");
  assert.equal(destinoDaPagina(DONO, "/painel"), "mostrar");
  assert.equal(destinoDaPagina(DONO, "/painel/contatos"), "mostrar");
  assert.equal(destinoDaPagina(null, "/painel/contatos"), "mostrar");
});
```

- [ ] **Step 2:** `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/painel-nav.test.ts` → **FAIL** (`destinoDaPagina`/`itensDaBarra`/`podePostar`/`visivelNoMenu` não exportados).

- [ ] **Step 3:** `src/lib/painel-nav.ts`:

  (a) L1-16: acrescentar `ShoppingBag,` depois de `Camera,` e, depois do bloco de import do lucide, a linha:

```ts
import { modulosDoAcesso, paginaLiberada, type Acesso, type Modulo } from "@/lib/auth/modulos";
```

  (b) no comentário de topo, depois do parágrafo de `/painel/disparos` (L31-33), acrescentar:

```ts
 *
 * /painel/vendas ENTROU em 07/10 (acesso da vendedora): é a tela dela, e
 * `visivelNoMenu` a esconde dos outros papéis na v1.
```

  (c) em `NavItem` (L51-59), depois de `curto?: string;`:

```ts
  /**
   * Módulo da vendedora que libera o item (spec 2026-10-07 §1). Para `seller`
   * só aparece item com módulo liberado; sem módulo, ela não vê.
   */
  modulo?: Modulo;
```

  (d) depois de `const INICIO …` (L67):

```ts
const VENDAS: NavItem = { href: "/painel/vendas", label: "Vendas", icon: ShoppingBag, grupo: "vender", modulo: "vendas" };
```

  e `DISPAROS` (L71) vira:

```ts
const DISPAROS: NavItem = { href: "/painel/disparos", label: "Disparos", icon: Send, grupo: "vender", modulo: "postar" };
```

  (e) `NAV_GROUPS` (L83) — `VENDAS` depois de `INICIO`:

```ts
  { title: null, items: [INICIO, VENDAS, CAMPANHAS, INSTAGRAM, DISPAROS, BIBLIOTECA, RELAMPAGO, FUNIS, COMUNIDADES, GRUPOS, CONTATOS] },
```

  (f) depois de `liberado` (L120-123):

```ts
/**
 * O item aparece no menu deste acesso (spec 2026-10-07 §1, "Página")?
 * - vendedora: só item com `modulo` liberado para ela (`vendas` sempre; `postar` se o dono marcou);
 * - outros papéis: a regra de antes (`liberado`), e Vendas fica fora — o dono não usa a tela na v1;
 * - `null` (o `/api/auth/me` não respondeu): nada que dependa de módulo, para não piscar Vendas
 *   ou Disparos para quem não tem. A casca nem desenha os módulos enquanto `carregado` é falso.
 */
export function visivelNoMenu(item: NavItem, acesso: Acesso | null, liberacoes: Liberacoes | null): boolean {
  if (acesso === null) return item.modulo === undefined && liberado(item, liberacoes);
  if (acesso.role === "seller") {
    return item.modulo !== undefined && modulosDoAcesso(acesso).includes(item.modulo) && liberado(item, liberacoes);
  }
  return item.modulo !== "vendas" && liberado(item, liberacoes);
}

/** Postar (barra e celular) segue Disparos: quem não vê a tela de postar não ganha o atalho. */
export function podePostar(acesso: Acesso | null): boolean {
  return visivelNoMenu(DISPAROS, acesso, null);
}

/**
 * Itens da barra de cima. Outros papéis: os seis do dia. Vendedora: o menu
 * inteiro filtrado — é curto (Vendas e o que o dono liberou) e nenhum item
 * dela está entre os seis do dono.
 */
export function itensDaBarra(acesso: Acesso | null, liberacoes: Liberacoes | null): NavItem[] {
  const base = acesso?.role === "seller" ? NAV_ALL : NAV_BARRA_DESKTOP;
  return base.filter((item) => visivelNoMenu(item, acesso, liberacoes));
}

export type DestinoDaPagina = "mostrar" | "ir-para-vendas" | "bloquear";

/**
 * O que a guarda faz com a página (spec §1, "Página"). Só experiência: quem
 * barra é o guard das rotas de API. A Início da vendedora é Vendas; fora de
 * `paginaLiberada`, a tela de bloqueio.
 */
export function destinoDaPagina(acesso: Acesso | null, pathname: string): DestinoDaPagina {
  if (acesso?.role !== "seller") return "mostrar";
  if (pathname === INICIO.href) return "ir-para-vendas";
  return paginaLiberada(acesso, pathname) ? "mostrar" : "bloquear";
}
```

- [ ] **Step 4:** rodar o Step 2 → **PASS** (todos, inclusive os antigos: "every navigation destination…", "has no duplicate destinations", "Instagram fica em Lotar…", e o dos seis da barra).

- [ ] **Step 5:** commit:

```powershell
git -C <wt> add apps/web/src/lib/painel-nav.ts apps/web/src/lib/painel-nav.test.ts
```
```powershell
git -C <wt> diff --cached --stat
```
```powershell
git -C <wt> commit -m "feat(painel): module-aware navigation with the Vendas item" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: barra de cima, barra de baixo e Mais filtrados

**Files:** modificar `src/components/painel/barra-de-cima.tsx`, `src/components/painel/barra-mobile.tsx`, `src/components/painel/lista-dos-modulos.tsx`
**Depends-on:** Task 6
**Consome:** `useRole()` → `{ tenantName, carregado, acesso }`; `itensDaBarra`, `podePostar`, `visivelNoMenu`.

O que muda (spec §1 "Página"; mockup "Barra de cima por papel"):
- Nada de módulo enquanto `carregado` é falso (barra de cima, barra de baixo, Postar, avatar).
- Vendedora: só os itens dela (`itensDaBarra`), sem Mais, sem chip do número, **sem sino** (é a única assinatura Realtime do app: `notification-bell.tsx:81`; `postgres_changes` respeita a RLS e o PR 2 tira dela todo acesso `authenticated` — ela não receberia nada), sem sinal do Relâmpago (a leitura daria 403), chip "Vendedora" e "Sair" no lugar do avatar → Configurações (não existe nome da pessoa em `useRole`, e "Sair" em texto é mais honesto que um avatar que desloga). Postar só com `postar`.
- Celular da vendedora: os itens dela à esquerda do Postar, sem Mais. O mockup mostra "Vendas + Postar"; com `postar` liberado o plano mostra também **Disparos**, porque ela não tem Mais e o toast do Postar diz "Acompanhe em Disparos" — sem a aba, não haveria caminho no celular.
- `/api/disparos` (disparo em voo do celular) só para quem pode postar.

- [ ] **Step 1:** substituir `src/components/painel/barra-de-cima.tsx` inteiro por:

```tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
import { Logo, LogoSymbol } from "@/components/brand/logo";
import { useCasca } from "@/components/painel/casca-context";
import { NotificationBell } from "@/components/painel/notification-bell";
import { useRole } from "@/components/painel/role-provider";
import { usePanelSession } from "@/components/painel/session-provider";
import type { Acesso } from "@/lib/auth/modulos";
import { iniciaisDaLoja } from "@/lib/painel/casca";
import { numero } from "@/lib/painel/grupos";
import { placarDaOferta, type EntradaLike } from "@/lib/painel/relampago";
import { isNavItemActive, itensDaBarra, podePostar } from "@/lib/painel-nav";
import { cn } from "@/lib/utils";
import { FolhaPostar } from "./folha-postar";
import { MenuMais } from "./menu-mais";

const DISPAROS = "/painel/disparos";
const RELAMPAGO = "/painel/relampago";
const CONECTAR = "/painel/conectar";
const REFRESCO_MS = 60_000;

type Oferta = { id?: string; status?: string };
type Relampago = { noAr: boolean; esperando: number | null };
const QUIETO: Relampago = { noAr: false, esperando: null };

async function lerJson(url: string): Promise<unknown> {
  return fetch(url, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
}

/** A oferta aberta e, se a fila vier, quantas pessoas esperam nela — duas leituras das rotas que já existem. */
async function lerRelampago(): Promise<Relampago> {
  const lista = (await lerJson("/api/relampago/offers")) as { offers?: Oferta[] } | null;
  const aberta = (Array.isArray(lista?.offers) ? lista.offers : []).find((o) => o.status === "open");
  if (!aberta?.id) return QUIETO;
  const detalhe = (await lerJson(`/api/relampago/offers/${aberta.id}`)) as { queue?: EntradaLike[] } | null;
  return { noAr: true, esperando: Array.isArray(detalhe?.queue) ? placarDaOferta(detalhe.queue).esperando : null };
}

/**
 * Há oferta relâmpago no ar, e quantas pessoas esperam na fila dela (spec G2, decisão 4)? Busca ao montar,
 * ao entrar ou sair de /relampago e quando a aba volta a ficar visível depois de um minuto; com oferta no
 * ar confere a cada minuto, porque ela fecha por tempo e a fila anda. O layout não remonta entre rotas.
 * `ativo` falso (modo foco, papel ainda desconhecido, vendedora) não busca nada.
 */
function useRelampagoNaBarra(ativo: boolean): Relampago {
  const naArea = usePathname().startsWith(RELAMPAGO);
  const [relampago, setRelampago] = useState<Relampago>(QUIETO);
  const noAr = relampago.noAr;
  useEffect(() => {
    if (!ativo) return;
    let cancelado = false;
    let ultimaBusca = 0;
    async function buscar() {
      ultimaBusca = Date.now();
      const lido = await lerRelampago();
      if (!cancelado) setRelampago(lido);
    }
    void buscar();
    const aoVoltar = () => {
      if (document.visibilityState === "visible" && Date.now() - ultimaBusca > REFRESCO_MS) void buscar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    const conferir = noAr
      ? setInterval(() => {
          if (document.visibilityState === "visible") void buscar();
        }, REFRESCO_MS)
      : undefined;
    return () => {
      cancelado = true;
      document.removeEventListener("visibilitychange", aoVoltar);
      clearInterval(conferir);
    };
  }, [ativo, naArea, noAr]);
  return relampago;
}

const ESTADO_DO_NUMERO = {
  verificando: { texto: "Verificando…", ponto: "pn-ponto--indefinido" },
  conectado: { texto: "Conectado", ponto: "pn-ponto--conectado pn-respira" },
  desconectado: { texto: "Desconectado", ponto: "pn-ponto--desconectado" },
} as const;

/**
 * Estado do número: ponto e palavra (a cor sozinha não basta). Conectado vira
 * só o ponto abaixo de 1280px; os outros estados mantêm a palavra em toda largura.
 */
function ChipDoNumero() {
  const pathname = usePathname();
  const { session, loading } = usePanelSession();
  const estado = loading || !session ? "verificando" : session.live ? "conectado" : "desconectado";
  const { texto, ponto } = ESTADO_DO_NUMERO[estado];
  const nome = `${texto} · seu número`;
  return (
    <Link
      href={CONECTAR}
      title={nome}
      aria-label={nome}
      aria-current={isNavItemActive(pathname, CONECTAR) ? "page" : undefined}
      className={cn("pn-barra__numero", estado === "conectado" && "pn-barra__numero--ok")}
    >
      <span className={cn("pn-ponto", ponto)} aria-hidden="true" />
      <span className="pn-barra__numero-rotulo">{texto}</span>
    </Link>
  );
}

/** Oferta no ar: quantas pessoas esperam na fila (decisão 4); sem a fila lida, o ponto Paper de antes. */
function SinalDoRelampago({ noAr, esperando }: Relampago) {
  if (!noAr) return null;
  if (esperando === null) return <span className="pn-barra__ponto" role="img" aria-label="oferta no ar" />;
  return (
    <span className="pn-barra__contador">
      {numero(esperando)}
      <span className="sr-only"> esperando</span>
    </span>
  );
}

/**
 * Os módulos do acesso e o Mais; só no desktop (no celular a navegação é a barra
 * inferior). A vendedora vê só os dela e não tem Mais (spec 2026-10-07 §4).
 */
function NavDaBarra({ relampago, acesso }: { relampago: Relampago; acesso: Acesso | null }) {
  const pathname = usePathname();
  const { liberacoes } = useCasca();
  return (
    <nav aria-label="Módulos" className="pn-barra__nav hidden lg:flex">
      {itensDaBarra(acesso, liberacoes).map((item) => (
        <Link key={item.href} href={item.href} aria-current={isNavItemActive(pathname, item.href) ? "page" : undefined} className="pn-barra__item">
          {item.curto ?? item.label}
          {item.href === RELAMPAGO && <SinalDoRelampago {...relampago} />}
        </Link>
      ))}
      {acesso?.role !== "seller" && <MenuMais />}
    </nav>
  );
}

/**
 * A vendedora não tem Configurações (spec 2026-10-07 §1): no lugar do avatar,
 * o papel dela e a saída. Com a rede fora o cookie fica, mas ela não pode ficar
 * presa num "Saindo…" — vai para o login de qualquer jeito.
 */
function SaidaDaVendedora() {
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);
  function sair() {
    setSaindo(true);
    void fetch("/api/auth/logout", { method: "POST" })
      .catch(() => null)
      .then(() => router.push("/login"));
  }
  return (
    <>
      <span className="rounded-full px-2.5 py-0.5 text-12 font-semibold text-canvas-100 ring-1 ring-inset ring-paper-0/30">Vendedora</span>
      <button type="button" onClick={sair} disabled={saindo} className="pn-barra__item min-h-11">
        {saindo ? "Saindo…" : "Sair"}
      </button>
    </>
  );
}

/**
 * Barra de cima (spec G2, decisão 4): a única peça Volt da casca. Desktop:
 * logo, loja, os módulos do acesso, Mais, estado do número, sino, Postar e
 * avatar. Celular (52px): símbolo, loja, estado do número e sino — a navegação
 * fica na barra inferior (decisão 5). A vendedora (spec 2026-10-07): logo,
 * loja, os módulos dela, Postar se liberado, chip "Vendedora" e Sair.
 */
export function BarraDeCima() {
  const pathname = usePathname();
  const { tenantName, carregado, acesso } = useRole();
  const { foco } = useCasca();
  const vendedora = acesso?.role === "seller";
  // Só depois de saber quem é: a vendedora não tem Relâmpago, e a leitura daria 403.
  const relampago = useRelampagoNaBarra(!foco && carregado && !vendedora);
  const [postar, setPostar] = useState(false);
  const idPostar = useId();
  const fechar = useCallback(() => setPostar(false), []);
  if (foco) return null;

  const nomeDaLoja = carregado ? (tenantName ?? "Sua loja") : "";
  const iniciais = carregado ? iniciaisDaLoja(tenantName) : "";
  const comPostar = carregado && podePostar(acesso);

  return (
    <>
      <header data-testid="painel-barra" className="pn-barra sticky top-0 z-20">
        <Link href="/painel" aria-label="Girumo, início" className="pn-barra__logo">
          <Logo className="hidden text-[20px] text-paper-0 lg:inline-flex" title={null} />
          <LogoSymbol className="h-[22px] w-[22px] lg:hidden" />
        </Link>
        {carregado ? (
          <span data-testid="painel-barra-loja" title={nomeDaLoja} className="pn-barra__loja">
            {nomeDaLoja}
          </span>
        ) : (
          <span role="status" aria-label="Carregando nome da loja" className="pn-skeleton inline-block h-4 w-24 rounded-[var(--radius-chip)]" />
        )}
        {/* Até o /api/auth/me responder, nada de módulo: com `role` nulo o menu do dono piscaria pra vendedora. */}
        {carregado && <NavDaBarra relampago={relampago} acesso={acesso} />}
        <div className="pn-barra__direita">
          {carregado && !vendedora && (
            <>
              <ChipDoNumero />
              <NotificationBell />
            </>
          )}
          {comPostar && pathname !== DISPAROS && (
            <button type="button" data-testid="painel-postar-barra" aria-haspopup="dialog" aria-expanded={postar} aria-controls={idPostar} onClick={() => setPostar(true)} className="pn-postar pn-barra__postar hidden lg:inline-flex">
              Postar
            </button>
          )}
          {carregado &&
            (vendedora ? (
              <SaidaDaVendedora />
            ) : (
              <Link href="/painel/configuracoes" title="Configurações" aria-label={iniciais ? `${iniciais} · Configurações da loja` : "Configurações da loja"} className="pn-barra__avatar hidden lg:grid">
                {iniciais}
              </Link>
            ))}
        </div>
      </header>
      {comPostar && <FolhaPostar id={idPostar} aberta={postar} aoFechar={fechar} aoPostar={fechar} emQualquerLargura />}
    </>
  );
}
```

- [ ] **Step 2:** substituir `src/components/painel/barra-mobile.tsx` inteiro por:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  NAV_BARRA_DIREITA,
  NAV_BARRA_ESQUERDA,
  isNavItemActive,
  itensDaBarra,
  podePostar,
  visivelNoMenu,
  type NavItem,
} from "@/lib/painel-nav";
import type { TenantDispatchView } from "@/lib/campaigns/dispatch-view";
import { useCasca } from "./casca-context";
import { FolhaMais } from "./folha-mais";
import { FolhaPostar } from "./folha-postar";
import { useRole } from "./role-provider";

type EmVoo = { sent: number; total: number } | null;

async function disparoEmVoo(): Promise<EmVoo> {
  const lista: TenantDispatchView[] = await fetch("/api/disparos")
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []);
  const ativo = Array.isArray(lista)
    ? lista.find((d) => d.status === "queued" || d.status === "running")
    : undefined;
  return ativo && ativo.total > 0 ? { sent: ativo.sent, total: ativo.total } : null;
}

/**
 * Disparo em voo (fila ou enviando). Só consulta enquanto houver um — e só para
 * quem pode postar: sem o módulo, `/api/disparos` daria 403 para a vendedora.
 */
function useDisparoEmVoo(ativo: boolean) {
  const [emVoo, setEmVoo] = useState<EmVoo>(null);

  const recarregar = useCallback(async () => {
    setEmVoo(await disparoEmVoo());
  }, []);

  useEffect(() => {
    if (!ativo) return;
    let cancelado = false;
    void disparoEmVoo().then((voo) => {
      if (!cancelado) setEmVoo(voo);
    });
    return () => {
      cancelado = true;
    };
  }, [ativo]);

  const voando = emVoo !== null;
  useEffect(() => {
    if (!voando) return;
    const t = setInterval(() => void recarregar(), 10_000);
    return () => clearInterval(t);
  }, [voando, recarregar]);

  return { emVoo, recarregar };
}

function Item({ item, pathname }: { item: NavItem; pathname: string }) {
  const ativo = isNavItemActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link href={item.href} aria-current={ativo ? "page" : undefined} className="pn-barra-mobile__item">
      <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
      {item.label}
    </Link>
  );
}

/**
 * Barra inferior da Vitrine Aberta (spec 3.2): Início, Grupos, Postar, Contatos,
 * Mais. Postar é o único Acid tocável do painel e está em toda tela; em voo
 * mostra "7/13" com a barra de 3px na base.
 *
 * Vendedora (spec 2026-10-07 §4): os itens dela (Vendas; Disparos com `postar`)
 * e o Postar se liberado, sem Mais. Até o `/api/auth/me` responder a barra fica
 * vazia no lugar — sem isso o menu do dono piscaria para ela.
 */
export function BarraMobile() {
  const pathname = usePathname();
  const [folha, setFolha] = useState<"postar" | "mais" | null>(null);
  const fechar = useCallback(() => setFolha(null), []);
  const { carregado, acesso } = useRole();
  const { foco, liberacoes } = useCasca();
  const comPostar = carregado && podePostar(acesso);
  const { emVoo, recarregar } = useDisparoEmVoo(comPostar);
  const idPostar = useId();
  const idMais = useId();
  if (foco) return null;

  const vendedora = acesso?.role === "seller";
  const visivel = (item: NavItem) => visivelNoMenu(item, acesso, liberacoes);
  const esquerda = !carregado ? [] : vendedora ? itensDaBarra(acesso, liberacoes) : NAV_BARRA_ESQUERDA.filter(visivel);
  const direita = carregado && !vendedora ? NAV_BARRA_DIREITA.filter(visivel) : [];
  const comMais = carregado && !vendedora;
  // Dono: 2 + Postar + 1 + Mais = as 5 colunas do CSS. Vendedora: 1 ou 3.
  const colunas = esquerda.length + direita.length + Number(comPostar) + Number(comMais);

  return (
    <>
      <nav
        data-testid="painel-mobile-nav"
        aria-label="Navegação"
        aria-busy={!carregado || undefined}
        className="pn-barra-mobile fixed inset-x-0 bottom-0 z-30 lg:hidden"
        style={colunas > 0 ? { gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))` } : undefined}
      >
        {esquerda.map((item) => (
          <Item key={item.href} item={item} pathname={pathname} />
        ))}
        {comPostar && (
          <div className="flex items-center justify-center">
            <span className="pn-postar-sombra">
              <button
                type="button"
                data-testid="painel-postar"
                aria-haspopup="dialog"
                aria-expanded={folha === "postar"}
                aria-controls={idPostar}
                aria-label={emVoo ? `Postar (enviando ${emVoo.sent} de ${emVoo.total} grupos)` : "Postar"}
                onClick={() => setFolha("postar")}
                className={cn("pn-postar", emVoo && "pn-postar--voo")}
                style={emVoo ? { ["--p" as string]: emVoo.sent / emVoo.total } : undefined}
              >
                {emVoo ? (
                  <span className="font-data text-13 tabular-nums">
                    {emVoo.sent}/{emVoo.total}
                  </span>
                ) : (
                  "Postar"
                )}
              </button>
            </span>
          </div>
        )}
        {direita.map((item) => (
          <Item key={item.href} item={item} pathname={pathname} />
        ))}
        {comMais && (
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={folha === "mais"}
            aria-controls={idMais}
            onClick={() => setFolha("mais")}
            className="pn-barra-mobile__item"
          >
            <Menu className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            Mais
          </button>
        )}
      </nav>

      {comPostar && <FolhaPostar id={idPostar} aberta={folha === "postar"} aoFechar={fechar} aoPostar={recarregar} />}
      {comMais && <FolhaMais id={idMais} aberta={folha === "mais"} aoFechar={fechar} />}
    </>
  );
}
```

- [ ] **Step 3:** substituir `src/components/painel/lista-dos-modulos.tsx` inteiro por (a troca é `liberado` → `visivelNoMenu` com o acesso; é o que esconde Vendas do Mais do dono):

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ALL, NAV_GRUPOS_ORDEM, NAV_GRUPO_TITULO, isNavItemActive, resumo, visivelNoMenu, type ResumoDados } from "@/lib/painel-nav";
import { useCasca } from "./casca-context";
import { useRole } from "./role-provider";

type Props = {
  dados: ResumoDados | null;
  aoEscolher: () => void;
  classeDoGrupo: string;
  classeDoItem: string;
};

/**
 * Todos os módulos por verbo (Vender, Lotar, Loja) com o estado de cada um
 * antes do toque. A folha "Mais" do celular e o menu "Mais" da barra
 * renderizam esta lista; só as classes mudam. Filtra pelo acesso de quem vê
 * (spec 2026-10-07 §1): Vendas não entra no Mais do dono.
 */
export function ListaDosModulos({ dados, aoEscolher, classeDoGrupo, classeDoItem }: Props) {
  const pathname = usePathname();
  const { liberacoes } = useCasca();
  const { acesso } = useRole();
  const linhas = dados ? resumo(dados) : {};
  return (
    <>
      {NAV_GRUPOS_ORDEM.map((grupo) => (
        <section key={grupo}>
          <h3 className={classeDoGrupo}>{NAV_GRUPO_TITULO[grupo]}</h3>
          <ul>
            {NAV_ALL.filter((item) => item.grupo === grupo && visivelNoMenu(item, acesso, liberacoes)).map(({ href, label, icon: Icon }) => {
              const ativo = isNavItemActive(pathname, href);
              return (
                <li key={href}>
                  <Link href={href} onClick={aoEscolher} aria-current={ativo ? "page" : undefined} className={classeDoItem}>
                    <Icon className="h-[18px] w-[18px] shrink-0 text-slate-600" strokeWidth={1.75} aria-hidden="true" />
                    <span className={linhas[href] ? "font-data text-13 tabular-nums" : "font-medium"}>{linhas[href] ?? label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
```

- [ ] **Step 4:** `npx tsc --noEmit -p tsconfig.json`; `npm run lint`; `npx tsx scripts/check-painel-vitrine.ts` → limpos.

- [ ] **Step 5:** commit:

```powershell
git -C <wt> add apps/web/src/components/painel/barra-de-cima.tsx apps/web/src/components/painel/barra-mobile.tsx apps/web/src/components/painel/lista-dos-modulos.tsx
```
```powershell
git -C <wt> diff --cached --stat
```
```powershell
git -C <wt> commit -m "feat(painel): top and bottom bars follow the member's modules" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: providers da casca sem chamada proibida

**Files:** modificar `src/components/painel/casca-context.tsx`, `src/components/painel/session-provider.tsx`, `src/components/painel/trial/use-trial.ts`
**Depends-on:** Task 0 (independe de 6/7)

Os três montam no layout, dentro do `RoleProvider` (`app/painel/layout.tsx:19-26`), e disparavam no mount: `/api/ig/status` (Instagram não é módulo da vendedora), `/api/session` (só no mapa de `postar`, e o chip do número nem aparece para ela) e `/api/billing/trial` (fora do mapa). Passam a esperar `carregado` e a pular `seller`. Para os outros papéis a leitura sai uma ida e volta depois — o `/api/auth/me` — e o resto não muda (inclusive a releitura do teste depois do Checkout: o efeito roda quando `ligado` vira verdadeiro, com a URL `?billing=trial_started` ainda intacta).

- [ ] **Step 1:** `src/components/painel/casca-context.tsx`: acrescentar o import depois do de `painel-nav` (L4):

```ts
import { useRole } from "./role-provider";
```

  e trocar `CascaProvider` (L51-84) por:

```tsx
export function CascaProvider({ children }: { children: React.ReactNode }) {
  const [foco, definirFoco] = useState(false);
  const [instagram, setInstagram] = useState<StatusInstagram | null>(null);
  const [versao, setVersao] = useState(0);
  const recarregarInstagram = useCallback(() => setVersao((v) => v + 1), []);
  const { carregado, acesso } = useRole();
  // Espera saber quem é: a vendedora não tem Instagram, e a pergunta daria 403 (spec 2026-10-07 §1).
  // Para ela `instagram` fica null — o item do menu já não aparece por não ter módulo.
  const pergunta = carregado && acesso?.role !== "seller";

  useEffect(() => {
    if (!pergunta) return;
    let cancelado = false;
    fetch("/api/ig/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((raw: StatusInstagram | null) => {
        if (cancelado) return;
        setInstagram(raw && typeof raw.enabled === "boolean" ? { enabled: raw.enabled, account: raw.account ?? null, live: Number(raw.live) || 0, startedLastHour: Number(raw.startedLastHour) || 0 } : DESLIGADO);
      })
      .catch(() => {
        if (!cancelado) setInstagram(DESLIGADO);
      });
    return () => {
      cancelado = true;
    };
  }, [versao, pergunta]);

  const valor = useMemo<CascaCtx>(
    () => ({
      foco,
      definirFoco,
      instagram,
      liberacoes: instagram ? { instagram: instagram.enabled } : null,
      recarregarInstagram,
    }),
    [foco, instagram, recarregarInstagram],
  );
  return <CascaContext.Provider value={valor}>{children}</CascaContext.Provider>;
}
```

- [ ] **Step 2:** `src/components/painel/session-provider.tsx`: acrescentar depois do import de `react` (L3):

```ts
import { useRole } from "./role-provider";
```

  e trocar `SessionProvider` (L31-62) por:

```tsx
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>({ session: null, loading: true });
  const { carregado, acesso } = useRole();
  // O único leitor é o chip do número da barra, que a vendedora não tem; e a rota
  // daria 403 para ela sem `postar`. Os outros papéis perguntam depois do /api/auth/me.
  const pergunta = carregado && acesso?.role !== "seller";

  useEffect(() => {
    if (!pergunta) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/session");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();
        if (cancelled) return;
        setState({
          session: {
            live: raw?.live === true,
            phone: raw?.phone ? String(raw.phone) : null,
            profileName: raw?.profileName ? String(raw.profileName) : null,
          },
          loading: false,
        });
      } catch {
        if (!cancelled) setState({ session: null, loading: false });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pergunta]);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}
```

- [ ] **Step 3:** `src/components/painel/trial/use-trial.ts`: depois de `import type { TrialView } from "@/lib/billing/trial";` (L5) acrescentar:

```ts
import { useRole } from "@/components/painel/role-provider";
```

  e trocar `TrialProvider` (L145-153) por:

```ts
/**
 * Uma leitura só para o painel inteiro (montado no layout). Cada componente lendo
 * sozinho discordava: o paywall aberto em outra rota durante o "Ativando…" não via a
 * volta do Checkout e oferecia o teste de novo.
 *
 * Espera o papel: a vendedora não vê teste nem plano, e `GET /api/billing/trial`
 * está fora do mapa de módulos dela (403). Para ela a leitura nunca liga e `view`
 * fica nulo — nenhuma faixa, nenhum modal.
 */
export function TrialProvider({ children }: { children: ReactNode }) {
  const { carregado, acesso } = useRole();
  const estado = useLeituraDoTeste(carregado && acesso?.role !== "seller");
  return createElement(TrialContext.Provider, { value: estado }, children);
}
```

- [ ] **Step 4:** Realtime — conferir que não sobrou assinatura fora do sino (que a Task 7 já não monta para a vendedora):

```powershell
Set-Location <wt>\apps\web; git -C <wt> grep -n -E "\.channel\(|postgres_changes" -- apps/web/src/components apps/web/src/app/painel apps/web/src/lib
```

  Esperado: só `apps/web/src/components/painel/notification-bell.tsx` (L81 e L83). Aparecendo outro arquivo de cliente montado pela casca ou por `/painel/vendas`/`/painel/disparos` → gatear do mesmo jeito (`carregado && acesso?.role !== "seller"`) antes de seguir.

- [ ] **Step 5:** `npx tsc --noEmit -p tsconfig.json`; `npm run lint`; `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/trial/use-trial.test.ts` → limpos/PASS.

- [ ] **Step 6:** commit:

```powershell
git -C <wt> add apps/web/src/components/painel/casca-context.tsx apps/web/src/components/painel/session-provider.tsx apps/web/src/components/painel/trial/use-trial.ts
```
```powershell
git -C <wt> diff --cached --stat
```
```powershell
git -C <wt> commit -m "fix(painel): shell providers wait for the role and skip seller-forbidden calls" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: guarda de página

**Files:** criar `src/components/painel/guarda-de-modulo.tsx`; modificar `src/app/painel/layout.tsx`
**Depends-on:** Task 6
**Interfaces (produz):** `export function GuardaDeModulo({ children }: { children: React.ReactNode }): JSX.Element`

A guarda não monta a página até o `/api/auth/me` responder. Sem isso, a vendedora que entra por `/painel` (o `next` padrão do login) montaria a Início do dono, que dispara ~15 chamadas (`painel-rotas.spec.ts`, comentário da âncora) — todas 403 — e piscaria na tela antes do redirect. O custo para o dono é uma ida e volta no carregamento frio; o esqueleto usa `data-testid="painel-skeleton"`, que os E2E existentes já esperam sumir.

- [ ] **Step 1:** `src/components/painel/guarda-de-modulo.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Lock } from "lucide-react";
import { useRole } from "@/components/painel/role-provider";
import { destinoDaPagina } from "@/lib/painel-nav";

const VENDAS = "/painel/vendas";

/** Mockup "Área não liberada": a vendedora numa página que o dono não liberou. */
function AreaNaoLiberada({ loja }: { loja: string | null }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-start gap-4 px-6 py-12">
      <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-xl border border-line-200 bg-paper-0 text-slate-600">
        <Lock className="h-[22px] w-[22px]" />
      </span>
      <h1 className="font-brand text-[22px] font-extrabold tracking-[-0.02em] text-volt-950">Essa área não foi liberada pra você</h1>
      <p className="text-15 text-slate-600">
        Quem escolhe o que cada pessoa da equipe acessa é o dono da {loja ?? "loja"}. Se você precisa disso pro seu
        trabalho, peça pra ele liberar em Configurações › Equipe.
      </p>
      <Link
        href={VENDAS}
        className="mt-2 inline-flex h-12 items-center rounded-[var(--radius-control)] bg-cobalt-500 px-5 text-15 font-semibold text-paper-0"
      >
        Voltar pra Vendas
      </Link>
    </div>
  );
}

/**
 * Guarda de página da vendedora (spec 2026-10-07 §1, "Página"). Só experiência:
 * quem barra de verdade é o guard das rotas de API (PR 3). Enquanto o
 * `/api/auth/me` não responde, não monta a página — senão a Início do dono
 * dispararia as chamadas dela (403 para a vendedora) e piscaria na tela.
 * Vendedora em `/painel` vai para Vendas; fora de `paginaLiberada`, o bloqueio.
 * Outros papéis (e papel desconhecido depois de carregar): a página de sempre.
 */
export function GuardaDeModulo({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { carregado, acesso, tenantName } = useRole();
  const destino = carregado ? destinoDaPagina(acesso, pathname) : null;

  useEffect(() => {
    if (destino === "ir-para-vendas") router.replace(VENDAS);
  }, [destino, router]);

  if (destino === "mostrar") return <>{children}</>;
  if (destino === "bloquear") return <AreaNaoLiberada loja={tenantName} />;
  return (
    <div role="status" aria-label="Carregando o painel" className="space-y-4 px-4 py-5 lg:px-8 lg:py-8">
      <div className="pn-skeleton h-9 w-48 rounded-[var(--radius-control)]" data-testid="painel-skeleton" />
      <div className="pn-skeleton h-64 rounded-xl" data-testid="painel-skeleton" />
    </div>
  );
}
```

- [ ] **Step 2:** `src/app/painel/layout.tsx`: acrescentar depois do import de `BarraMobile` (L3):

```ts
import { GuardaDeModulo } from "@/components/painel/guarda-de-modulo";
```

  e a L28 `<MioloDoPainel>{children}</MioloDoPainel>` vira:

```tsx
                <MioloDoPainel>
                  <GuardaDeModulo>{children}</GuardaDeModulo>
                </MioloDoPainel>
```

- [ ] **Step 3:** `npx tsc --noEmit -p tsconfig.json`; `npm run lint`; `npx tsx scripts/check-painel-vitrine.ts` → limpos.

- [ ] **Step 4:** commit (fim do bloco B):

```powershell
git -C <wt> add apps/web/src/components/painel/guarda-de-modulo.tsx apps/web/src/app/painel/layout.tsx
```
```powershell
git -C <wt> diff --cached --stat
```
```powershell
git -C <wt> commit -m "feat(painel): page guard sends sellers to Vendas and blocks unreleased areas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: upload de mídia por token assinado (módulo `postar`)

**Files:** modificar `src/lib/media-store.ts`, `src/app/api/media/prepare/route.ts`, `src/lib/media-upload-client.ts`
**Depends-on:** Task 0 (independe do resto; pode sair em PR próprio — ver "Divisão sugerida")
**Interfaces (produz):** `prepareMediaUpload(mime, tenantId, kind): Promise<{ storagePath: string; token: string }>`; `POST /api/media/prepare` → `200 { storagePath, token }`.

**Por quê (verificado no código em 07/10):** `media-upload-client.ts:43-45` sobe o binário com `getSupabaseBrowserClient().storage.from("uploads").upload(...)` — o JWT da pessoa contra a RLS de `storage.objects`. A policy de INSERT é `storage_uploads_insert_member … app.has_membership((storage.foldername(name))[1]::uuid)` (`infra/rls/202606240004_storage_policies.sql`), e o PR 2 tira `seller` de `app.has_membership()` (spec §1, "RLS"). Sem esta task, o upload da vendedora com `postar` quebra no Storage depois de o `/api/media/prepare` responder 200 (o toast "Não foi possível enviar o arquivo."). Com o token emitido pela service-role no `prepare`, o upload não passa pela RLS; o tenant do caminho continua decidido no servidor (`buildMediaStoragePath`), e o `register` continua relendo tamanho e tipo do objeto real. Vale para todos os papéis — para o dono nada muda além do caminho de autorização. A remoção no cliente em falha do `register` (L63) continua como está: para quem não tem DELETE na policy ela já falhava em silêncio, e o `register` apaga o objeto nas falhas dele.

- [ ] **Step 1:** `src/lib/media-store.ts`, trocar o bloco L91-112 (comentário + `prepareMediaUpload`) por:

```ts
/**
 * Decide ONDE o browser vai subir o arquivo direto pro Storage — sem receber
 * o binário. Existe porque uma Vercel Function tem um limite fixo de 4.5MB de
 * corpo de requisição (infra, não contornável por código): vídeo/áudio reais
 * estouram isso o tempo todo, então o binário nunca pode passar por uma rota
 * desta app; só o path e o token (JSON minúsculo) saem daqui.
 *
 * O tenant continua 100% resolvido no SERVIDOR (mesma auth de sempre) — o
 * client não precisa saber seu próprio tenant pra montar o path, então isto
 * funciona mesmo se o localStorage do painel estiver vazio/desatualizado.
 *
 * O token é de upload assinado pela service-role (`createSignedUploadUrl`): o
 * browser sobe com `uploadToSignedUrl`, que não passa pela RLS de
 * `storage.objects`. Desde o acesso da vendedora (spec 2026-10-07 §1, "RLS")
 * `app.has_membership()` exclui `seller`, e a policy de INSERT barraria o upload
 * dela no módulo postar. Vale só para ESTE caminho, e por duas horas.
 */
export async function prepareMediaUpload(
  mime: string,
  tenantId: string,
  kind: MediaKind = "media",
): Promise<{ storagePath: string; token: string }> {
  if (!isLpMediaAllowed(kind, mime)) {
    throw Response.json({ error: "Envie uma imagem (PNG, JPEG ou WebP)." }, { status: 415 });
  }
  const storagePath = buildMediaStoragePath(tenantId, mime);
  const { data, error } = await getSupabaseAdmin().storage.from(BUCKET).createSignedUploadUrl(storagePath);
  if (error || !data?.token) {
    throw Response.json({ error: "Não foi possível preparar o envio." }, { status: 500 });
  }
  return { storagePath, token: data.token };
}
```

  e, no comentário de `registerUploadedMedia` (L114-116), trocar

```ts
 * Storage (via `getSupabaseBrowserClient()`, autorizado pela RLS de
 * `storage.objects` — ver `prepareMediaUpload`). Reaplica as MESMAS regras do
```

  por

```ts
 * Storage (via `uploadToSignedUrl`, com o token de `prepareMediaUpload` — sem
 * passar pela RLS de `storage.objects`). Reaplica as MESMAS regras do
```

- [ ] **Step 2:** `src/app/api/media/prepare/route.ts` L35: `const prepared = prepareMediaUpload(mime, tenantId, kind);` → `const prepared = await prepareMediaUpload(mime, tenantId, kind);`

- [ ] **Step 3:** `src/lib/media-upload-client.ts`: o comentário L13-23 vira:

```ts
/**
 * Sobe um arquivo direto do browser pro Supabase Storage com o token de upload
 * assinado que `/api/media/prepare` emite (path e tenant resolvidos pelo
 * SERVIDOR — não pelo localStorage) e só então registra a metadata via
 * `/api/media/register`, um JSON pequeno. O token não depende da RLS de
 * `storage.objects`, que exclui a vendedora (spec 2026-10-07 §1, "RLS").
 *
 * Existe porque uma Vercel Function tem um limite fixo de 4.5MB de corpo de
 * requisição (infra da plataforma, não contornável por código de app);
 * mandar o binário pela function fazia todo vídeo/áudio real falhar sempre,
 * "tentar de novo" incluso, porque não é uma falha transitória.
 */
```

  e L41-45 viram:

```ts
  const { storagePath, token } = (await prepareRes.json()) as { storagePath: string; token: string };

  const { error: uploadError } = await getSupabaseBrowserClient()
    .storage.from(MEDIA_BUCKET)
    .uploadToSignedUrl(storagePath, token, file, { contentType: file.type });
```

- [ ] **Step 4:** `npx tsc --noEmit -p tsconfig.json`; `npm run lint`; `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/media-store.test.ts src/lib/security/request-access-policy.test.ts` → limpos/PASS. (A prova de ponta a ponta — o navegador da vendedora subindo uma imagem — é o Task 11, teste 5.)

- [ ] **Step 5:** commit:

```powershell
git -C <wt> add apps/web/src/lib/media-store.ts apps/web/src/app/api/media/prepare/route.ts apps/web/src/lib/media-upload-client.ts
```
```powershell
git -C <wt> diff --cached --stat
```
```powershell
git -C <wt> commit -m "fix(media): direct upload via signed upload token instead of storage RLS" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: E2E da vendedora (spec §7)

**Files:** criar `e2e/vendas-vendedora.spec.ts`
**Depends-on:** Tasks 5, 7, 8, 9, 10

Estratégia do usuário `seller`:
- Roda no projeto `chromium` (depende do `setup`, que grava a sessão do usuário de QA em `ESTADO_LOGADO`). O spec **não** usa o `page` do fixture: abre contexto próprio, sem estado, e loga pela tela como a vendedora.
- `beforeAll`, com a service-role do banco de dev (`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, que o job `e2e` do CI já exporta para o `web:e2e` e o `playwright.config.ts` lê do `.env.local` localmente): varre restos de execução morta (usuário com o prefixo e mais de uma hora), descobre a loja de QA por `GET /api/auth/me` com a sessão do usuário de QA, cria um usuário novo (`e2e-vendedora-<ts>-<hex>@girumo.test`, senha aleatória que morre com ele, `email_confirm: true`) e insere `memberships (role 'seller', accepted_at now(), modules '{}')` nessa loja. O telefone da venda é sorteado (`119` + 8 dígitos).
- `afterAll`: apaga pedidos com `created_by` = ela (itens caem em cascata), os contatos que esses pedidos criaram (só os nascidos depois do usuário — número que já existia fica), as mídias que ela registrou (linha em `uploads` + objeto no bucket), a membership e o usuário. Erro de limpeza reprova o run: resto no tenant de QA mexe no caixa e na equipe dos outros testes.
- Resíduo conhecido: se a loja de QA tivesse zero pedidos, a primeira venda grava o evento `first_order` do funil (`funnel_events`, best-effort, `onlyFirst`). Não é desfeito.
- "Dono libera Postar" é um `update memberships set modules = '{postar}'` pela service-role — o `PATCH /api/members` é do PR 6, que corre em paralelo.

- [ ] **Step 1:** `e2e/vendas-vendedora.spec.ts`:

```ts
import { randomBytes, randomInt } from "node:crypto";

import { expect, request as novoRequest, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { BASE_URL, ESTADO_LOGADO } from "./caminhos";
import { TEM_CREDENCIAIS } from "./sessao-helpers";

/**
 * A vendedora de ponta a ponta (spec 2026-10-07 §7): entra → só vê Vendas →
 * registra venda com dois produtos → a venda aparece em Minhas vendas → a API do
 * dono responde 403 para ela. O dono libera Postar → a API de postar responde
 * na hora, o upload de mídia funciona sem acesso dela ao banco, e Disparos
 * aparece no menu ao recarregar, sem relogar.
 *
 * Usuário próprio, criado por execução: logout ou troca de módulo de um run não
 * derruba outro (local e CI dividem o banco de dev). Entra na loja de QA (a do
 * usuário E2E) como `seller` e sai no afterAll levando pedidos, contato criado
 * pela venda, mídia, membership e usuário. Resto de execução que morreu no meio
 * é varrido no começo da próxima (mais de uma hora de idade). A senha é
 * aleatória e morre com o usuário: se cair no trace de uma falha, não abre nada.
 */

const URL_SUPABASE = process.env.E2E_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const CHAVE_SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const TEM_BANCO = Boolean(URL_SUPABASE && CHAVE_SERVICE_ROLE);

const PREFIXO = "e2e-vendedora-";
const UMA_HORA_MS = 3_600_000;
const BUCKET = "uploads";
const CLIENTE = "Cliente E2E Vendedora";
const DESKTOP = { width: 1280, height: 900 };
const CELULAR = { width: 390, height: 844 };
/** PNG 1×1: o menor arquivo que o `register` aceita como imagem. */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

type Vendedora = { userId: string; email: string; senha: string; tenantId: string; criadaEm: string; telefone: string };

function bancoDeDev(): SupabaseClient {
  return createClient(URL_SUPABASE, CHAVE_SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** A loja em que o usuário de QA cai ao logar: é nela que a vendedora entra. */
async function lojaDeQa(): Promise<string> {
  const api = await novoRequest.newContext({ baseURL: BASE_URL, storageState: ESTADO_LOGADO });
  try {
    const res = await api.get("/api/auth/me");
    if (!res.ok()) throw new Error(`GET /api/auth/me do usuário de QA respondeu ${res.status()}`);
    const me = (await res.json()) as { tenantId?: string | null };
    if (!me.tenantId) throw new Error("o usuário de QA não tem loja");
    return me.tenantId;
  } finally {
    await api.dispose();
  }
}

async function criarVendedora(banco: SupabaseClient, tenantId: string): Promise<Vendedora> {
  const email = `${PREFIXO}${Date.now()}-${randomBytes(3).toString("hex")}@girumo.test`;
  const senha = randomBytes(24).toString("base64url");
  const { data, error } = await banco.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser: ${error?.message ?? "sem usuário"}`);
  const userId = data.user.id;
  const { error: erroMembro } = await banco.from("memberships").insert({
    tenant_id: tenantId,
    user_id: userId,
    role: "seller",
    invited_email: email,
    accepted_at: new Date().toISOString(),
  });
  if (erroMembro) {
    await banco.auth.admin.deleteUser(userId);
    throw new Error(`membership seller: ${erroMembro.message}`);
  }
  // DDD 11 + 9 + oito dígitos sorteados: número que nenhum contato da loja de QA tem.
  const telefone = `119${String(randomInt(100_000_000)).padStart(8, "0")}`;
  // `created_at` do Auth (relógio do banco): é o corte da limpeza de contatos.
  return { userId, email, senha, tenantId, criadaEm: data.user.created_at, telefone };
}

/** Tudo que a vendedora deixou, em ordem de dependência, e por fim o usuário. */
async function limparVendedora(banco: SupabaseClient, userId: string, criadaEm: string): Promise<void> {
  const { data: membros, error: erroMembros } = await banco.from("memberships").select("tenant_id").eq("user_id", userId);
  if (erroMembros) throw new Error(`memberships da vendedora: ${erroMembros.message}`);
  for (const { tenant_id: tenantId } of (membros ?? []) as { tenant_id: string }[]) {
    const { data: pedidos, error: erroPedidos } = await banco
      .from("orders")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("created_by", userId)
      .select("lead_id");
    if (erroPedidos) throw new Error(`pedidos da vendedora: ${erroPedidos.message}`);
    const leads = [
      ...new Set(((pedidos ?? []) as { lead_id: string | null }[]).map((p) => p.lead_id).filter((id): id is string => id !== null)),
    ];
    if (leads.length > 0) {
      // Só o contato que a venda criou: número que já existia na loja antes do teste fica.
      const { error } = await banco.from("leads").delete().eq("tenant_id", tenantId).in("id", leads).gte("created_at", criadaEm);
      if (error) throw new Error(`contatos da venda: ${error.message}`);
    }
    const { data: midias, error: erroMidias } = await banco
      .from("uploads")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("created_by", userId)
      .select("metadata");
    if (erroMidias) throw new Error(`mídias da vendedora: ${erroMidias.message}`);
    const caminhos = ((midias ?? []) as { metadata: { storage_path?: string } | null }[])
      .map((m) => m.metadata?.storage_path)
      .filter((c): c is string => Boolean(c));
    if (caminhos.length > 0) {
      const { error } = await banco.storage.from(BUCKET).remove(caminhos);
      if (error) throw new Error(`objetos da vendedora: ${error.message}`);
    }
    const { error: erroMembro } = await banco.from("memberships").delete().eq("tenant_id", tenantId).eq("user_id", userId);
    if (erroMembro) throw new Error(`membership da vendedora: ${erroMembro.message}`);
  }
  const { error } = await banco.auth.admin.deleteUser(userId);
  if (error) throw new Error(`deleteUser: ${error.message}`);
}

/** Resto de execução que morreu antes do afterAll. Mais de uma hora: não pega um run vivo em paralelo. */
async function limparVendedorasVelhas(banco: SupabaseClient): Promise<void> {
  // ponytail: uma página de 1000 — o banco de dev tem dezenas de usuários; paginar quando passar disso.
  const { data, error } = await banco.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`listUsers: ${error.message}`);
  const corte = Date.now() - UMA_HORA_MS;
  for (const user of data.users) {
    if (user.email?.startsWith(PREFIXO) && Date.parse(user.created_at) < corte) {
      await limparVendedora(banco, user.id, user.created_at);
    }
  }
}

async function entrar(page: Page, vendedora: Vendedora): Promise<void> {
  await page.goto("/login?next=%2Fpainel");
  await page.getByTestId("login-email").fill(vendedora.email);
  await page.getByTestId("login-senha").fill(vendedora.senha);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  // `next=/painel` de propósito: quem leva para Vendas é a guarda da página.
  await page.waitForURL((url) => url.pathname === "/painel/vendas", { timeout: 30_000 });
}

test.describe("vendedora: só o que o dono liberou", () => {
  test.describe.configure({ mode: "serial", timeout: 90_000 });
  test.skip(
    !TEM_CREDENCIAIS || !TEM_BANCO,
    "Precisa do usuário de QA (E2E_EMAIL/E2E_PASSWORD) e da service role de dev (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY).",
  );

  let banco: SupabaseClient;
  let vendedora: Vendedora | undefined;
  let page: Page;
  /** 403 que a casca ou a tela dela receberam: tem que ficar vazio (spec §1). */
  const proibidas: string[] = [];
  /** Websocket de Realtime aberto: a RLS não entrega nada a ela, então não pode assinar. */
  const realtime: string[] = [];

  function ela(): Vendedora {
    if (!vendedora) throw new Error("o beforeAll não criou a vendedora");
    return vendedora;
  }

  test.beforeAll(async ({ browser }) => {
    banco = bancoDeDev();
    await limparVendedorasVelhas(banco);
    vendedora = await criarVendedora(banco, await lojaDeQa());
    const contexto = await browser.newContext({ baseURL: BASE_URL, viewport: DESKTOP });
    page = await contexto.newPage();
    page.on("response", (resposta) => {
      const url = new URL(resposta.url());
      if (resposta.status() === 403 && url.pathname.startsWith("/api/")) {
        proibidas.push(`${resposta.request().method()} ${url.pathname}`);
      }
    });
    page.on("websocket", (ws) => {
      // Sem a query: ela carrega a apikey.
      if (ws.url().includes("/realtime/")) realtime.push(ws.url().split("?")[0]);
    });
    await entrar(page, vendedora);
  });

  test.afterAll(async () => {
    await page?.context().close();
    if (vendedora) await limparVendedora(banco, vendedora.userId, vendedora.criadaEm);
  });

  test("entra direto em Vendas e a casca só mostra o que é dela", async () => {
    await expect(page).toHaveURL(/\/painel\/vendas$/);
    const barra = page.getByTestId("painel-barra");
    const modulos = barra.getByRole("navigation", { name: "Módulos" });
    await expect(modulos.getByRole("link")).toHaveText(["Vendas"]);
    await expect(modulos.getByRole("link", { name: "Vendas" })).toHaveAttribute("aria-current", "page");
    await expect(barra.getByText("Vendedora", { exact: true })).toBeVisible();
    await expect(barra.getByRole("button", { name: "Sair" })).toBeVisible();
    await expect(modulos.getByRole("button", { name: "Mais" })).toHaveCount(0);
    await expect(barra.getByTestId("painel-postar-barra")).toHaveCount(0);
    await expect(barra.getByRole("button", { name: /^Notificações/ })).toHaveCount(0);
    await expect(barra.getByRole("link", { name: /seu número$/ })).toHaveCount(0);
    await expect(barra.getByRole("link", { name: /Configurações da loja$/ })).toHaveCount(0);

    await page.setViewportSize(CELULAR);
    const baixo = page.getByTestId("painel-mobile-nav");
    await expect(baixo.getByRole("link")).toHaveText(["Vendas"]);
    await expect(baixo.getByTestId("painel-postar")).toHaveCount(0);
    await expect(baixo.getByRole("button", { name: "Mais" })).toHaveCount(0);
    await page.setViewportSize(DESKTOP);
  });

  test("registra venda com dois produtos e ela aparece em Minhas vendas", async () => {
    const t = ela().telefone;
    await page.getByLabel("WhatsApp do cliente").fill(`(${t.slice(0, 2)}) ${t.slice(2, 7)}-${t.slice(7)}`);
    await page.getByRole("button", { name: "Buscar" }).click();
    await expect(page.getByText("Nenhum cliente com esse número")).toBeVisible();
    await page.getByLabel(/Nome do cliente/).fill(CLIENTE);

    const produto1 = page.getByRole("group", { name: "Produto 1" });
    await produto1.getByLabel("Nome do produto").fill("Vestido E2E");
    await produto1.getByLabel("Qtd").fill("2");
    await produto1.getByLabel("Valor un. (R$)").fill("119,90");
    await page.getByRole("button", { name: "Adicionar produto" }).click();
    const produto2 = page.getByRole("group", { name: "Produto 2" });
    await produto2.getByLabel("Nome do produto").fill("Cropped E2E");
    await produto2.getByLabel("Valor un. (R$)").fill("49,90");
    await expect(page.getByTestId("vendas-total")).toHaveText(/R\$\s289,70/);

    await page.getByRole("button", { name: /^Registrar venda · R\$\s289,70$/ }).click();
    const confirmacao = page.getByTestId("venda-registrada");
    await expect(confirmacao).toContainText("Venda registrada");
    await expect(confirmacao).toContainText(CLIENTE);

    const minhas = page.getByRole("region", { name: /^Minhas vendas/ });
    const linha = minhas.getByRole("listitem").filter({ hasText: CLIENTE });
    await expect(linha).toContainText("Vestido E2E ×2 · Cropped E2E ×1");
    await expect(linha).toContainText(/R\$\s289,70/);
    await expect(linha.getByRole("button", { name: `Corrigir venda de ${CLIENTE}` })).toBeVisible();

    // A prova visual do quadro: vai para o e2e-report (local e artefato do CI).
    await test.info().attach("vendas-1280", { body: await page.screenshot(), contentType: "image/png" });
    await page.setViewportSize(CELULAR);
    await page.evaluate(() => window.scrollTo(0, 0));
    await test.info().attach("vendas-390-topo", { body: await page.screenshot(), contentType: "image/png" });
    await minhas.scrollIntoViewIfNeeded();
    await test.info().attach("vendas-390-minhas", { body: await page.screenshot(), contentType: "image/png" });
    await page.setViewportSize(DESKTOP);
  });

  test("as rotas do dono respondem 403 para ela; as de vendas, 200", async () => {
    // O contraste: a sessão vale (200), então o 403 é o guard, não falta de login.
    expect((await page.request.get("/api/vendas")).status()).toBe(200);
    expect((await page.request.get("/api/orders")).status()).toBe(403);
    // Sem `postar`, nem o upload pelo cookie (findMembershipTenantId com guard, PR 3).
    const preparo = await page.request.post("/api/media/prepare", { data: { mime: "image/png", kind: "media" } });
    expect(preparo.status()).toBe(403);
  });

  test("página fora do acesso mostra o bloqueio e volta para Vendas", async () => {
    await page.goto("/painel/contatos");
    await expect(page.getByRole("heading", { name: "Essa área não foi liberada pra você" })).toBeVisible();
    await expect(page.getByTestId("contatos-lista")).toHaveCount(0);
    await page.getByRole("link", { name: "Voltar pra Vendas" }).click();
    await expect(page).toHaveURL(/\/painel\/vendas$/);
  });

  test("dono libera Postar: a API responde na hora, o upload funciona e Disparos aparece ao recarregar", async () => {
    const v = ela();
    const { error } = await banco.from("memberships").update({ modules: ["postar"] }).eq("tenant_id", v.tenantId).eq("user_id", v.userId);
    expect(error).toBeNull();

    // Sem recarregar nem relogar: o guard lê `modules` a cada chamada (spec §6).
    expect((await page.request.get("/api/campanhas")).status()).toBe(200);

    await page.reload();
    const barra = page.getByTestId("painel-barra");
    await expect(barra.getByRole("navigation", { name: "Módulos" }).getByRole("link")).toHaveText(["Vendas", "Disparos"]);
    await expect(barra.getByTestId("painel-postar-barra")).toBeVisible();

    // O upload de verdade, pelo navegador dela: token assinado no prepare, sem a RLS de
    // storage.objects (que exclui a vendedora desde o PR 2). Sem o Task 10, o toast de erro.
    await page.goto("/painel/disparos");
    await expect(page.getByPlaceholder("Digite sua mensagem...")).toBeVisible({ timeout: 20_000 });
    const escolha = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Imagem" }).click();
    await (await escolha).setFiles({ name: "e2e-vendedora.png", mimeType: "image/png", buffer: PNG_1X1 });
    await expect(page.getByRole("button", { name: "Remover mídia" })).toBeVisible({ timeout: 20_000 });
  });

  test("a casca dela não chamou rota fora do acesso nem abriu Realtime", async () => {
    expect(proibidas, "chamadas que o guard recusou durante a navegação dela").toEqual([]);
    expect(realtime, "canal de Realtime aberto para a vendedora").toEqual([]);
  });
});
```

- [ ] **Step 2:** `npx tsc --noEmit -p tsconfig.e2e.json`; `npm run lint` → limpos.

- [ ] **Step 3:** commit:

```powershell
git -C <wt> add apps/web/e2e/vendas-vendedora.spec.ts
```
```powershell
git -C <wt> diff --cached --stat
```
```powershell
git -C <wt> commit -m "test(e2e): seller registers a sale and only reaches her modules" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: verificação visual em 390 e 1280, e o mutante

**Files:** nenhum (o mutante é revertido no fim).
**Depends-on:** Task 11

Em worktree, nada de `preview_start` nem do pane do app (servem o checkout principal — `finding-preview-serve-checkout-principal`). O Playwright do próprio worktree sobe o app e fotografa.

- [ ] **Step 1:** nenhum outro E2E batendo no banco de dev agora (`finding-e2e-local-e-ci-corrida-no-mesmo-banco`):

```powershell
gh run list --repo codingB0y/Girumo --workflow Verify --status in_progress --json databaseId,headBranch
```

  Lista não vazia → esperar terminar.

- [ ] **Step 2:** subir o dev server do worktree numa porta própria, em background (porta 3000 pode ter o servidor de outra sessão, e `reuseExistingServer` o reusaria):

```powershell
Set-Location <wt>\apps\web; npx next dev -p 3005
```

  (`run_in_background: true`.) Esperar responder: `Invoke-WebRequest http://localhost:3005/login -UseBasicParsing | Select-Object StatusCode` → 200.

- [ ] **Step 3:** rodar o spec da vendedora e o da casca do dono contra ele:

```powershell
Set-Location <wt>\apps\web; $env:E2E_BASE_URL = "http://localhost:3005"; npx playwright test e2e/vendas-vendedora.spec.ts e2e/painel-vitrine-casca.spec.ts --project=chromium
```

  Esperado: verde (o setup do QA roda como dependência). Skip por falta de credencial → a prova visual fica no artefato `e2e-report` do CI (Task 13), e este Step se repete lá.

- [ ] **Step 4:** ler as três capturas anexadas (`vendas-1280`, `vendas-390-topo`, `vendas-390-minhas`): `Get-ChildItem <wt>\apps\web\e2e-report\data\*.png | Sort-Object LastWriteTime -Descending | Select-Object -First 3` e abrir cada uma com a ferramenta Read. Conferir contra o mockup:
  - 1280: barra Volt com logo, loja, só "Vendas" (traço branco de ativo), chip "Vendedora" e "Sair"; sem sino, sem chip do número, sem Mais, sem Postar; coluna central ≤ 576px.
  - 390 topo: barra Volt 52px (símbolo, loja, "Vendedora", "Sair") sem rolagem lateral; h1 "Registrar venda"; cartão verde "Venda registrada" com cliente e total; botão "Registrar outra venda".
  - 390 minhas: "Minhas vendas · <mês>", faixa Volt "Vendido por você no mês" com o total, linha com "Vestido E2E ×2 · Cropped E2E ×1", "hoje HH:MM", total e "Corrigir" de 44px; barra de baixo só com "Vendas".
  - Nada de raio 16, nada de Acid fora do Postar.
  Defeito visual → corrigir no componente, commitar, repetir os Steps 3–4.

- [ ] **Step 5 (mutante, spec §7):** tirar o guard do `getTenantContext` tem que derrubar este E2E. Localizar o `throw`:

```powershell
git -C <wt> grep -n "MENSAGEM_BLOQUEIO" -- apps/web/src/lib/supabase/tenant-context.ts
```

  Comentar só a linha do `throw new Response(MENSAGEM_BLOQUEIO, …)` (o dev server recarrega) e rodar:

```powershell
Set-Location <wt>\apps\web; $env:E2E_BASE_URL = "http://localhost:3005"; npx playwright test e2e/vendas-vendedora.spec.ts --project=chromium
```

  Esperado: **FAIL** em "as rotas do dono respondem 403…" (`/api/orders` responde 200). Reverter e conferir:

```powershell
git -C <wt> checkout -- apps/web/src/lib/supabase/tenant-context.ts
```
```powershell
git -C <wt> status --short
```

  Esperado: `tenant-context.ts` fora da lista.

- [ ] **Step 6:** derrubar o dev server pelo PID (o `TaskStop` não mata o `next dev` — `finding-taskstop-nao-mata-next-dev`):

```powershell
Get-NetTCPConnection -LocalPort 3005 -State Listen | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }
```

---

### Task 13: verificação final, revisão, PR e comandos para o Igor

**Files:** nenhum novo.

- [ ] **Step 1:** em `<wt>\apps\web`, um por vez:
  - `npx tsc --noEmit -p tsconfig.json`
  - `npx tsc --noEmit -p tsconfig.e2e.json`
  - `npm run lint`
  - `npm test`
  - `npx tsx scripts/check-painel-vitrine.ts`

- [ ] **Step 2:** o gate real (sem `2>&1` nem `*>` — o PS 5.1 transforma aviso de stderr em falha):

```powershell
Set-Location <wt>; & .\infra\scripts\verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
```

  Esperado: `EXIT=0`.

- [ ] **Step 3:** revisão final do diff inteiro (a revisão por task não vê a costura entre elas — `pattern-revisao-final-pega-o-que-revisao-por-task-nao-ve`): superpowers:requesting-code-review sobre `git -C <wt> diff origin/main...HEAD`, com foco em (1) nenhuma chamada da casca para a vendedora fora do mapa; (2) owner sem regressão (Vendas fora do Mais e da barra, Postar e avatar depois do `/api/auth/me`); (3) upload assinado não abre caminho de tenant pelo cliente. CRITICAL/HIGH → corrigir e commitar antes do push.

- [ ] **Step 4:** `git -C <wt> fetch origin main` e `git -C <wt> log HEAD..origin/main --oneline` — commits novos → `git -C <wt> merge origin/main` (não rebase), Step 1 de novo.

- [ ] **Step 5:** `git -C <wt> status --short` limpo e `git -C <wt> log origin/main..HEAD --oneline` com os 11 commits deste plano.

#### Comandos para o Igor

Push e PR:

```bash
git -C <wt> push -u origin feat/vendas-tela
```

```bash
gh pr create --repo codingB0y/Girumo --base main --head feat/vendas-tela --title "feat(vendas): tela de vendas e casca da vendedora" --body "## O que entra

- /painel/vendas: busca do cliente só por número, produtos com total ao vivo, confirmação, Minhas vendas do mês com Corrigir/Apagar até 24h (consome /api/vendas* do PR 4).
- Menu por módulo: NavItem.modulo, item Vendas, visivelNoMenu/podePostar/itensDaBarra/destinoDaPagina em painel-nav.ts, aplicados na barra de cima, na barra de baixo, no Mais e no Postar.
- Casca da vendedora: chip Vendedora e Sair no lugar do avatar; sem sino (única assinatura Realtime), sem número, sem Relâmpago, sem Mais. CascaProvider, SessionProvider e TrialProvider esperam o /api/auth/me e pulam seller.
- Guarda de página: vendedora em /painel vai para Vendas; fora do acesso, 'Essa área não foi liberada pra você'.
- fix(media): upload direto por token assinado da service-role, sem a RLS de storage.objects (que o PR 2 fecha para seller).
- E2E com usuário seller próprio por execução (criado e apagado pela service-role de dev).

## Para o dono

Vendas não aparece. Os widgets da casca e a página montam uma ida e volta depois (/api/auth/me) no carregamento frio.

## Teste

- [x] npm test, tsc x2, lint, painel:check, verify-local.ps1
- [x] e2e/vendas-vendedora.spec.ts e painel-vitrine-casca.spec.ts (local ou CI)
- [x] mutante: sem o guard do getTenantContext o E2E reprova
- [ ] CI verde

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

CI e merge (trocar `<N>` pelo número do PR):

```bash
gh pr checks <N> --repo codingB0y/Girumo
```

```bash
gh pr merge <N> --squash --delete-branch --repo codingB0y/Girumo
```

E2E vermelho com 401/500 em specs que não são deste PR = corrida no banco de dev com outro run: `gh run rerun <run-id> --failed --repo codingB0y/Girumo` depois que o outro terminar.

Quadro (prod, depois do merge). Ninguém consegue entrar como vendedora até o PR 6, então o card continua em construção:

```sql
select public.move_card('acesso-vendedora', 'em_construcao', 'PR 5 mergeado: tela /painel/vendas, menu por módulo, casca e guarda da vendedora, upload por token assinado', 'PR #<N>');
```

Se o PR 6 **ainda não** mergeou:

```sql
update public.board_features set blocker = 'Falta o PR 6 (aba Equipe): sem ele ninguém convida vendedora' where key = 'acesso-vendedora';
```

Se o PR 6 **já** mergeou, a feature está completa: verificar em prod (convidar uma vendedora de teste, entrar, registrar venda, ver o 403 de /api/orders) e só então:

```sql
select public.move_card('acesso-vendedora', 'no_ar_verificado', 'Vendedora em prod: entra, só vê Vendas, registra venda, /api/orders 403', '<link da prova>');
```
```sql
update public.board_features set blocker = null where key = 'acesso-vendedora';
```

Grafo (PowerShell, na raiz do checkout principal):

```bash
rag insert "decisão: o painel da vendedora filtra menu, Postar e páginas por NavItem.modulo (visivelNoMenu/destinoDaPagina em painel-nav.ts); a casca espera /api/auth/me e não chama nada fora do mapa dela; upload de mídia usa token assinado pela service-role, sem RLS de storage" --source decisao-2026-10-07-vendedora-casca
```

Ao encerrar: "PRs que deixei abertos: …".
