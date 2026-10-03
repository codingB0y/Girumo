# Início "Ao vivo" — PR 5 (Relâmpago AO VIVO) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Em `/painel?ao-vivo`, a coluna da direita do mockup F, "Relâmpago · AO VIVO": a oferta no ar com grupos, "no ar há", barra de peças, placar (Pediram · Atendidas · Vendeu · Esperando), a conversa na mão da vendedora logada (Chamar no WhatsApp · Vendeu · Não respondeu, com o cronômetro), "Pegar a próxima: <nome>", a fila compacta e "Fechar oferta". Junto: "Pediram até agora: N" no Postando agora, a marca "Relâmpago no ar" no gráfico e a terceira coluna do layout.

**Architecture:** Sem DDL. A Início ganha a parte `relampago` (só com `?ao-vivo`): as ofertas abertas com os grupos da janela, as ofertas abertas hoje e os totais por post de hoje (`offerTotalsByBroadcastIds`, que já existe). A coluna lê a oferta aberta pela rota que a tela da fila já usa (`GET /api/relampago/offers/[id]`, que devolve oferta, fila, `me` e `now`) e age pelas mesmas rotas (`/claim`, `/claims/[id]`, `POST /offers/[id]`). A lógica de carregar e agir sai de `FilaClient` para um hook compartilhado; `NaSuaMao` e `Situacao` passam a ser exportados de `fila-vitrine.tsx`. Nada de regra nova.

**Tech Stack:** Next.js 15, React 19, Tailwind v4, TypeScript strict, Supabase (PostgREST), `node --test` via tsx, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-02-painel-inicio-ao-vivo-design.md` (seção "Relâmpago AO VIVO" e PR 5)

## Global Constraints

- Toda query de store leva o tenant explícito (`.eq('tenant_id', …)`).
- Regra real: uma oferta aberta **por grupo** (`flash_offer_groups_um_aberto_uidx`); pode haver mais de uma oferta no ar. O "Abrir oferta desabilitado" do mockup não entra.
- A fila tem ordem real (`commented_at`, a prova): mostrar posição na fila da relâmpago é verdade (diferente da entrega de post).
- Acid só em Postar, AO VIVO e LOTOU; **zero** `button`/`a` com `bg-acid` na Início. O chip AO VIVO da coluna é `span`. "Pegar a próxima" é cobalt, não acid.
- Anti-ban: nunca DM automática; os botões da vendedora são os mesmos da tela da fila (abrem o WhatsApp para ela falar). Não mudar `NaSuaMao`.
- Nunca `window.confirm` (trava automação): "Fechar oferta" confirma na própria tela.
- Estados quietos com frase: sem oferta no ar; a oferta não carregou; ninguém comentou.
- `/painel` sem o parâmetro e a tela `/painel/relampago/[id]` não mudam de comportamento.
- Código e commits em inglês; texto de tela em pt-BR. Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Em `apps/web`: unit `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`; tipos `npx tsc --noEmit -p tsconfig.json` **e** `npx tsc --noEmit -p tsconfig.e2e.json`; lint `npm run lint`; suíte `npm test`.
- Nunca `git add -A`; `git diff --cached --stat` antes de cada commit. Sem `next build`, dev server ou SQL.

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `apps/web/src/lib/stores/flash-offers.ts` (+ teste) | modificar | `listOfertasDaInicio(tenantId, desde)` |
| `apps/web/src/lib/painel/relampago.ts` (+ teste) | modificar | `placarDaOferta`, `proximaDaFila`, `pecasRestantes` |
| `apps/web/src/app/api/painel/inicio/route.ts` | modificar | parte `relampago` com `?ao-vivo` |
| `apps/web/src/components/painel/home/types.ts`, `use-dashboard-data.ts` | modificar | `relampago` + `relampagoOk` |
| `apps/web/src/components/painel/relampago/use-oferta.ts` | criar | carregar/agir/pegar/fechar (sai de `FilaClient`) |
| `apps/web/src/app/painel/relampago/fila-client.tsx` | modificar | usa o hook (mesmo comportamento) |
| `apps/web/src/components/painel/relampago/vitrine/fila-vitrine.tsx` | modificar | exporta `NaSuaMao`, `Situacao`, `nomeDe` |
| `apps/web/src/components/painel/home/ao-vivo/relampago-ao-vivo.tsx` | criar | a coluna |
| `apps/web/src/lib/painel/atividade.ts` (+ teste) | modificar | `marcasDeRelampago` |
| `entradas-e-saidas.tsx`, `postando-agora.tsx`, `inicio-ao-vivo.tsx`, `page.tsx` | modificar | marca, "Pediram até agora", 3 colunas |
| e2e, spec | modificar | a coluna aparece; notas |

---

### Task 1: dados (store, parte da rota, placar puro)

**Interfaces:**

```ts
// flash-offers.ts
export type OfertaDaInicio = OfferRow & { groupIds: string[] };
/** Abertas (com os grupos da janela ainda aberta) e as abertas desde `desde` (qualquer status). */
export async function listOfertasDaInicio(tenantId: string, desde: string): Promise<{ abertas: OfertaDaInicio[]; doDia: OfferRow[] }>;

// relampago.ts
export type PlacarDaOferta = { pediram: number; atendidas: number; vendeu: number; esperando: number };
export function placarDaOferta(fila: readonly EntradaLike[]): PlacarDaOferta;
export function proximaDaFila<T extends EntradaLike>(fila: readonly T[]): T | null;
export function pecasRestantes(oferta: OfertaLike, fila: readonly EntradaLike[]): { restantes: number; pecas: number };

// parte nova (tipo do cliente)
export type RelampagoDaInicio = { abertas: OfertaDaInicio[]; doDia: OfferRow[]; totaisDoDia: OfferTotalsRow[] };
```

Regras:
- `listOfertasDaInicio`: (1) `flash_offers` `status = 'open'`, `.eq('tenant_id')`, ordem `opened_at desc`, com `flash_offer_groups(whatsapp_group_id, closed_at)` embutido; `groupIds` = os de `closed_at` nulo. (2) `flash_offers` com `opened_at >= desde`, `.eq('tenant_id')`, ordem `opened_at asc`, `limit(50)`. Duas leituras em paralelo.
- `placarDaOferta`: pediram = tamanho da fila; atendidas = entradas com `claim` ou com `outcome`; vendeu = `outcome === "sold"`; esperando = sem `claim` e sem `outcome`.
- `proximaDaFila`: a primeira (na ordem da fila) sem `claim` e sem `outcome`.
- `pecasRestantes`: `restantes = max(0, slots − vendidas)`.
- Rota: com `?ao-vivo` (mesmo gate da `atividade`), parte `relampago` = `{ ...await listOfertasDaInicio(tenantId, inicioDoDiaBR), totaisDoDia: await offerTotalsByBroadcastIds(tenantId, broadcastIds das doDia com broadcast_id) }` (`inicioDoDiaBR` = `janelasDaAtividade(new Date()).porHora.de.toISOString()`). Sem `USE_SUPABASE`: `null`.
- Cliente: `DashboardData.relampago: RelampagoDaInicio | null` e `relampagoOk: boolean` (padrão de `ordersOk`).

- [ ] **Step 1:** testes primeiro: store contra o PostgREST falso (padrão de `campaign-activity.test.ts`/`group-grow-jobs.test.ts`) provando `tenant_id=eq.<loja>` nas duas leituras, o filtro `status=eq.open`, o `opened_at=gte.<desde>` e que `groupIds` ignora janela fechada; placar/próxima/peças com uma fila de exemplo (vendida, dropped, em conversa, reservada, duas esperando).
- [ ] **Step 2:** ver falhar; **Step 3:** implementar store, puros, rota e tipos; **Step 4:** verde + os dois `tsc` + lint + `npm test`.
- [ ] **Step 5:** commit `feat(painel): flash offer data for the live home`.

---

### Task 2: hook compartilhado e exports (refactor sem mudança de comportamento)

**Interfaces:**

```ts
// use-oferta.ts ("use client")
export type FilaPayload = { offer: FilaOferta; queue: FilaEntrada[]; me: string; now: string };
export function useOferta(offerId: string | null, opcoes: { pollMs: number }): {
  dados: FilaPayload | null; erro: string | null; aviso: string | null; ocupado: boolean; agora: Date;
  agir: (claimId: string, acao: "contacted" | "sold" | "dropped") => Promise<void>;
  pegarProxima: () => Promise<void>; fechar: () => Promise<void>; recarregar: () => Promise<void>;
};
```

- [ ] **Step 1:** mover de `fila-client.tsx` para `use-oferta.ts`, sem mudar a lógica: `carregar`, a deriva do relógio do servidor, o poll, o tick de 1 s, `acao`, `pegarProxima` (409 vira aviso e recarrega), `fechar`. `offerId` nulo = não busca. Com a aba escondida o poll não busca (como `useRecarga`).
- [ ] **Step 2:** `FilaClient` passa a ser `useOferta(offerId, { pollMs: 5000 })` + o mesmo JSX (erro, skeleton, `FilaVitrine`). As mensagens e o `data-testid` não mudam.
- [ ] **Step 3:** em `fila-vitrine.tsx`, `export` em `NaSuaMao`, `Situacao` e `nomeDe` (sem mudar os corpos).
- [ ] **Step 4:** os dois `tsc`, lint, `npm test` (os e2e `painel-vitrine-relampago.spec.ts` cobrem a tela da fila no CI).
- [ ] **Step 5:** commit `refactor(painel): share flash offer loading between queue screen and home`.

---

### Task 3: a coluna, "Pediram até agora", a marca e as 3 colunas

- [ ] **Step 1: `relampago-ao-vivo.tsx`** (`"use client"`), `section` `data-testid="inicio-relampago"` com `aria-labelledby`, `<h2 className="text-[16px] font-semibold text-volt-950">Relâmpago</h2>` + chip `span.pn-chip.pn-chip--acid` "AO VIVO" quando há oferta no ar. Props: `relampago`, `relampagoOk`, `grupos`, `agora`.
  - `relampagoOk` falso: "A relâmpago não carregou."
  - Sem `abertas`: "Nenhuma relâmpago no ar." Se `doDia` tem oferta fechada hoje: "Última hoje: <nome>". Link "Abrir relâmpago" → `/painel/relampago` (link comum).
  - Com oferta: `oferta = abertas[0]`; `useOferta(oferta.id, { pollMs: 10_000 })`. Cabeçalho: nome; "em N grupos" com os nomes (achados em `grupos` por `whatsappGroupId`, até 2 nomes + "e mais N"); "no ar há {noArHa}"; barra `pn-lotacao` com `restantes/pecas` e o texto "{restantes} de {pecas} peças".
  - Placar em 4 células (`Pediram`, `Atendidas`, `Vendeu`, `Esperando`) com `placarDaOferta(dados.queue)`.
  - Conversa na mão: `minha = queue.find(e => e.claim?.seller_user_id === me && !e.outcome)`; se houver, `<NaSuaMao …/>` com as props que `FilaVitrine` passa.
  - "Pegar a próxima: {nomeDe(proximaDaFila(queue))}" (botão cobalt). Desligado com o motivo escrito ao lado: com conversa na mão "termine a conversa atual antes", sem peças "as peças acabaram", sem ninguém esperando "ninguém esperando". `aviso` do hook embaixo.
  - Fila compacta: as próximas 5 sem desfecho, `ordinal(i)` na posição real da fila, nome, `horarioComSegundos`, `<Situacao …/>`; link "ver fila inteira" → `/painel/relampago/{id}`.
  - "+N outra(s) no ar" (link para `/painel/relampago`) quando `abertas.length > 1`.
  - "Fechar oferta" discreto: primeiro clique mostra "Fechar a oferta agora?" com "Fechar" e "Cancelar"; "Fechar" chama `fechar()`.
  - Oferta que não carregou (`erro` do hook): "A oferta não carregou." + o resto do cabeçalho com o que veio da parte.
- [ ] **Step 2: "Pediram até agora".** Em `postando-agora.tsx`, prop `totaisDoDia: OfferTotalsRow[]`; com `totaisDoDia.find(t => t.broadcastId === post.id)`, uma linha "Pediram até agora: {pediram}" (com "· {vendeu} vendidas" se > 0). Sem oferta ligada, nenhuma linha.
- [ ] **Step 3: marca no gráfico.** `marcasDeRelampago(ofertas: OfferRow[], agora: Date): MarcaDePost[]` em `atividade.ts` (TDD): uma marca por oferta com `opened_at` hoje (dia de Brasília), texto "Relâmpago no ar"; `EntradasESaidas` recebe `ofertasDoDia` e junta às marcas de Hoje.
- [ ] **Step 4: 3 colunas.** Em `inicio-ao-vivo.tsx`: de `min-[1400px]` para cima, `grid-cols-[300px_minmax(0,1fr)_300px]` (Postando | mapa + gráfico | Relâmpago); entre 1280 e 1400, a grade de 2 colunas do PR 4 com a coluna da esquerda empilhando Relâmpago (se houver oferta no ar) em cima do Postando; abaixo de 1280, empilhado (Relâmpago no ar primeiro, depois Postando, depois mapa e gráfico). Manter `grid-cols-[minmax(0,1fr)]` e `min-w-0` do PR 4 (sem estouro em 390).
- [ ] **Step 5:** `page.tsx` repassa `relampago`/`relampagoOk`. e2e: `await expect(page.getByTestId("inicio-relampago").getByRole("heading", { name: "Relâmpago" })).toBeVisible();` (o tenant de QA não tem oferta aberta: estado quieto).
- [ ] **Step 6: spec** — "Relâmpago AO VIVO": a coluna lê a oferta pela rota da fila; o "última oferta (vendeu X de Y)" virou "Última hoje: <nome>"; 3 colunas a partir de 1400 px, porque o menu lateral da D ocupa a largura que o mockup dava às colunas.
- [ ] **Step 7:** os dois `tsc`, lint, `npm test`. Commits: `feat(painel): flash offer column on the live home` e `docs: Início ao vivo spec notes for PR 5`.

---

### Task 4: PR, CI, merge e verificação em produção

- [ ] `git fetch origin main && git merge origin/main`; diff só com este plano.
- [ ] Push, `gh pr create` (`feat(painel): Início ao vivo PR 5 — relâmpago AO VIVO (?ao-vivo)`), `get_status`; CI verde → `gh pr merge --squash` → apagar branch.
- [ ] Produção logado (1440 / 1100 / 390): 3 colunas em 1440 (sem estouro), estado quieto da relâmpago (ou a oferta no ar conferida com `/api/relampago/offers/<id>`); a tela da fila `/painel/relampago/<id>` igual a antes; contraste; zero acid em botão/link. **Não clicar** em Pegar/Vendeu/Fechar em produção.
