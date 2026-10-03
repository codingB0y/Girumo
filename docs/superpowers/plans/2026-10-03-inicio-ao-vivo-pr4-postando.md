# Início "Ao vivo" — PR 4 (Postando agora + layout em colunas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Em `/painel?ao-vivo`, a coluna da esquerda do mockup F, "Postando agora": o post que está saindo (ou o último de hoje), a barra "27 de 40 grupos", "termina por volta de HH:MM", a prévia na bolha do WhatsApp com a foto, a grade de entrega grupo a grupo **por número** e "Próximos" (3 agendamentos). E a tela passa a ter o layout do mockup: faixa em cima e, de 1280 px para cima, colunas (Postando | mapa + gráfico).

**Architecture:** Sem DDL e sem parte nova: o post vem de `disparos` (`TenantDispatchView[]`, já na resposta), escolhido por `postDaTabela`; a entrega grupo a grupo vem de `useEntrega` + `GET /api/disparos/[id]/grupos` (a mesma da página da campanha); a foto vem de `GET /api/media/[id]` (já serve os bytes ao tenant logado); os agendamentos vêm de `schedules`. A lógica fica pura em `lib/painel/ao-vivo/postando.ts`; o componente só desenha.

**Tech Stack:** Next.js 15, React 19, Tailwind v4, TypeScript strict, `node --test` via tsx, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-02-painel-inicio-ao-vivo-design.md` (seção "Postando agora" e PR 4)

## Global Constraints

- Sem ordem de envio e sem posição na fila: a grade é por número do grupo (decisão 8 da spec D; `lib/painel/entrega.ts` explica).
- "Pediram até agora: N" **não** entra neste PR: o número vem das ofertas relâmpago, que chegam com a parte `relampago` no PR 5 (registrar na spec).
- Acid só em Postar, AO VIVO e LOTOU; **zero** `button`/`a` com `bg-acid` na Início. O "Postar" do estado quieto é link comum, não acid.
- Tudo que aparece tem estado quieto com frase: sem post hoje, entrega que não carregou, sem agendamento.
- A cor nunca é a única pista: cada célula da grade tem nome acessível com o estado por extenso.
- `/painel` sem o parâmetro não muda; a página da campanha não muda.
- Código e commits em inglês; texto de tela em pt-BR. Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Em `apps/web`: unit `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`; tipos `npx tsc --noEmit -p tsconfig.json` **e** `npx tsc --noEmit -p tsconfig.e2e.json`; lint `npm run lint`; suíte `npm test`.
- Nunca `git add -A`; `git diff --cached --stat` antes de cada commit. Sem `next build` local, sem dev server, sem SQL.

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `apps/web/src/lib/campaigns/dispatch-eta.ts` | modificar | exportar `SEGUNDOS_POR_MENSAGEM` |
| `apps/web/src/lib/painel/ao-vivo/mapa.ts` (+ teste) | modificar | exportar `numeroDoGrupo`; "1 entrou / 1 saiu hoje" no nome acessível |
| `apps/web/src/lib/painel/ao-vivo/postando.ts` (+ `.test.ts`) | criar | término estimado, grade por número, próximos agendamentos (puro) |
| `apps/web/src/components/painel/home/ao-vivo/postando-agora.tsx` | criar | a coluna |
| `apps/web/src/components/painel/home/ao-vivo/inicio-ao-vivo.tsx` | modificar | layout em colunas; monta a coluna |
| `apps/web/src/app/painel/page.tsx` | modificar | passa `schedules` |
| `apps/web/e2e/painel-inicio-ao-vivo.spec.ts` | modificar | a coluna aparece |
| spec | modificar | "Pediram" no PR 5; layout em colunas a partir de 1280 |

---

### Task 1: a lógica pura (TDD)

**Files:** `dispatch-eta.ts`, `mapa.ts` + `mapa.test.ts`, criar `postando.ts` + `postando.test.ts`.

**Interfaces (exatamente estes nomes):**

```ts
// dispatch-eta.ts
export const SEGUNDOS_POR_MENSAGEM = 6; // já existe; só ganha export

// mapa.ts
export function numeroDoGrupo(g: Group): number | null; // já existe; só ganha export

// postando.ts
export type CelulaDaGrade = { id: string; rotulo: string; nome: string; estado: EstadoDaEntrega; quando: string | null };
export type Proximo = { id: string; quando: string; nome: string };
export function terminaPorVolta(resumo: ResumoDaEntrega, agora: Date): string | null;
export function gradeDaEntrega(entrega: EntregaNoGrupo[], grupos: Group[]): CelulaDaGrade[];
export function proximosAgendamentos(agendamentos: { id: string; campaignName?: string; scheduledAt?: string; status?: string }[], agora: Date, limite?: number): Proximo[];
export function rotuloDaCelula(c: CelulaDaGrade): string;
```

Regras:
- `terminaPorVolta`: restantes = `postando + naFila`; zero → `null`; senão `horaBR(agora + restantes × SEGUNDOS_POR_MENSAGEM s)` ("HH:MM", Brasília). É a mesma promessa de `etaDisparo` (6 s por mensagem, nunca otimista).
- `gradeDaEntrega`: uma célula por item de `entrega`, com o grupo achado em `grupos` por `whatsappGroupId`. Ordem: `numeroDoGrupo` crescente; sem número, depois, por nome com `localeCompare("pt-BR", { numeric: true })`; grupo que não está no cadastro usa o id como nome e vai por último. `rotulo` = `#n` com número, senão a posição `"5º"`.
- `proximosAgendamentos`: só `status === "pending"` com `scheduledAt` depois de `agora`, em ordem, no máximo `limite` (padrão 3). `quando`: "HH:MM" se for hoje (dia de Brasília), "amanhã HH:MM" se for amanhã, senão "DD/MM HH:MM". `nome` = `campaignName` ou "Post agendado".
- `rotuloDaCelula`: `"#3, Moda Sul 03: entregue às 14:08"`, `"…: postando"`, `"…: na fila"`, `"…: falhou"`, `"…: cancelado"` (o nome entra só se for diferente do rótulo).
- `mapa.ts` `rotuloAcessivel`: `1 entrou hoje` / `N entraram hoje`, `1 saiu hoje` / `N saíram hoje` (hoje sai "1 saíram hoje", visto em produção).

- [ ] **Step 1:** escrever os testes (`postando.test.ts` e o caso novo em `mapa.test.ts`) cobrindo: término com 13 restantes às 14:10:00 BRT → "14:11" (13 × 6 s = 78 s → 14:11:18); término `null` com 0 restantes; grade com "X 2", "X 10", "X 9", um sem número e um fora do cadastro → `#2,#9,#10,4º,5º` nessa ordem; próximos com um passado, um `done`, hoje 19:00, amanhã 06:30 e um em 3 dias → `["19:00", "amanhã 06:30", "DD/MM HH:MM"]` respeitando o limite 3; `rotuloDaCelula` entregue com hora e na fila; mapa com `{ entraram: 1, sairam: 1 }` → "1 entrou hoje, 1 saiu hoje".
- [ ] **Step 2:** rodar e ver falhar.
- [ ] **Step 3:** implementar (exports + `postando.ts` + concordância no `rotuloAcessivel`).
- [ ] **Step 4:** teste verde; os dois `tsc`, lint, `npm test`.
- [ ] **Step 5:** commit `feat(painel): live home posting-now model`.

---

### Task 2: a coluna e o layout

**Files:** criar `postando-agora.tsx`; modificar `inicio-ao-vivo.tsx`, `page.tsx`, `e2e/painel-inicio-ao-vivo.spec.ts`, spec.

**Interfaces:**
- Consumes: `postDaTabela`, `resumoDaEntrega`, `aindaSaindo`, `type EstadoDaEntrega` de `@/lib/painel/entrega`; `useEntrega` de `@/components/painel/campanhas/detalhe/entrega`; `quandoDoPost` de `@/lib/painel/campanha-visao`; `Bolha` de `@/components/painel/bolha`; Task 1; `horaBR` de `@/lib/date-br`; `numero` de `@/lib/painel/grupos`.
- Produces: `PostandoAgora({ posts, grupos, agendamentos, versao })` com `data-testid="inicio-postando"` e `<h2>` "Postando agora".

- [ ] **Step 1: O componente** (`"use client"`), `section` com `aria-labelledby` e borda/fundo como o mapa (`rounded-[10px] border border-line-200 bg-paper-0`), cabeçalho `<h2 className="text-[16px] font-semibold text-volt-950">Postando agora</h2>`:
  - `post = postDaTabela(posts, agora)`; `useEntrega(post?.id ?? null, versao)`.
  - **Sem post hoje:** "Nada saindo agora." + texto "O post que estiver saindo aparece aqui, grupo a grupo." + link "Postar" para `/painel/disparos` (link comum, sem acid).
  - **Com post:** linha com o começo do texto do post (1 linha, `truncate`) e "· {campaignName}"; barra de progresso (`pn-lotacao`, como no mapa/faixa) com `entregues / total` da entrega (ou `post.sent / post.total` enquanto a entrega não carregou) e o texto "27 de 40 grupos". Saindo (`aindaSaindo`): "termina por volta de HH:MM" (`terminaPorVolta`). Terminou: "Saiu às HH:MM · 40 de 40" ou "38 de 40 · 2 falharam" (hora = `horaBR(quandoDoPost(post))`), com link "Ver na campanha" para `/painel/campanhas/{post.campaignSlug}` quando houver slug.
  - **Prévia:** `<Bolha grupo={campaignName} hora={horaBR(quandoDoPost(post))} texto={post.body} vazio="Post com mídia, sem texto." foto={post.mediaType === "image" && post.mediaId ? `/api/media/${post.mediaId}` : undefined} mencaoTodos={post.mentionAll} />` dentro de um contêiner que corta o texto em ~6 linhas com um botão "ver tudo"/"ver menos" (`aria-expanded`) quando o texto for longo (mais de 280 caracteres ou mais de 6 quebras de linha). Vídeo/áudio/arquivo: sem foto, e uma linha "com vídeo"/"com áudio"/"com arquivo" abaixo da bolha.
  - **Grade "Entrega nos N grupos":** `<ul>` com `flex flex-wrap gap-1`, células de ~22 px quadradas, cor por estado (entregue `bg-success-700/70`, postando `bg-cobalt-500` com `motion-safe:animate-pulse`, na fila `bg-line-200`, falhou `bg-saida`, cancelado `bg-slate-600/40`), cada `<li>` com `title` e `aria-label` = `rotuloDaCelula`, `role="img"`. Embaixo, a `LegendaDaEntrega` existente (`hora`, `resumo`, `desatualizada`). Entrega lendo: 'lendo a entrega…'; falhou sem dado: "A entrega não carregou." Nunca escrever "ordem de envio".
  - **Próximos:** `<h3>` "Próximos" e `<ol>` com `proximosAgendamentos(agendamentos, agora)` ("19:00 · Novidades da semana"); vazio: "Nada agendado." + link "Agendar" para `/painel/agenda`.
  - O relógio da tela (`agora`) vem por prop do `InicioAoVivo` (o de 30 s), não um `new Date()` em render.
- [ ] **Step 2: Layout em colunas.** Em `inicio-ao-vivo.tsx`: depois da faixa, um `div` com `grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)] xl:items-start`; coluna 1 = `<PostandoAgora …/>`; coluna 2 = `div.space-y-6` com `<MapaDosGrupos/>` e `<EntradasESaidas/>`. Abaixo de 1280 px fica empilhado com o Postando em cima. Comentário: o PR 5 acrescenta a terceira coluna (Relâmpago, `_340px`). Props novas: `schedules: Schedule[]` (de `@/components/painel/home/types`) e repassar `agora` e `versao` (= `Date.parse(atividade?.geradoEm ?? "") || 0`, para a entrega reler a cada recarga de 60 s).
- [ ] **Step 3:** `page.tsx` passa `schedules={schedules}` (já em `data`).
- [ ] **Step 4: e2e** — no primeiro teste de `painel-inicio-ao-vivo.spec.ts`, depois do gráfico: `await expect(page.getByTestId("inicio-postando").getByRole("heading", { name: "Postando agora" })).toBeVisible();`.
- [ ] **Step 5: Spec** — em "Postando agora": "Pediram até agora" entra no PR 5 (vem das ofertas relâmpago); o término usa a mesma promessa de `etaDisparo` (6 s por mensagem), não o ritmo medido; colunas a partir de 1280 px, empilhado abaixo.
- [ ] **Step 6:** os dois `tsc`, lint, `npm test`. Commits: `feat(painel): posting-now column and column layout on the live home` (código + e2e) e `docs: Início ao vivo spec notes for PR 4`.

---

### Task 3: PR, CI, merge e verificação em produção

- [ ] `git fetch origin main && git merge origin/main`; diff só com os arquivos deste plano.
- [ ] Push, `gh pr create` (`feat(painel): Início ao vivo PR 4 — postando agora + colunas (?ao-vivo)`), `get_status`.
- [ ] CI verde → `gh pr merge <N> --squash` → apagar o branch remoto.
- [ ] Produção logado (1440 / 1100 / 390): duas colunas em 1440, empilhado em 1100 e 390; o post do dia (ou o estado quieto) confere com `/api/disparos`; a grade confere com `/api/disparos/<id>/grupos`; próximos conferem com `/api/schedules`; contraste sem falha; zero acid em botão/link.
