# Link da bio — PR 6a: painel, editor e aba Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O lojista abre `/painel/link-da-bio` (ainda sem item no menu), cria a página no estado vazio, monta a lista de links (adicionar pelos 6 atalhos, editar com erro embaixo do campo, excluir com confirmação na folha, ligar/desligar, reordenar com Subir/Descer anunciado), salva com trava de versão (409 com Recarregar) e vê a prévia viva da página — coluna fixa no computador, "Ver como fica" em tela cheia no celular — sem perder alteração ao sair.

**Architecture:** Um hook (`useEditorBio`) guarda o estado do editor: a versão salva (`PaginaBio` do GET), o rascunho local (`{ slug, publicada, documento }`), o contexto do GET e a `rodada` da animação; ele fala com a API do PR 5 por `authenticatedFetch`. A tela é um registro de abas (`ABAS` em `abas.tsx`): cada aba é um componente que recebe `PropsDaAba` e muda o documento só por função; o erro do salvar (caminho do zod, `links.2.numero`) vai para a aba `dona` do campo. A validação no navegador é o mesmo `documentoBio` do PR 2; as frases da tela saem de `MENSAGENS_DOS_CAMPOS`. A prévia é `<iframe srcdoc sandbox="">` com `renderPaginaBio(..., { modo: "previa" })` (PR 3a), e a entrada só toca quando a `rodada` sobe.

**Tech Stack:** Next 15 App Router (página cliente), React 19, zod 4 (o `documentoBio` do PR 2), Tailwind 4 (tema G2 do painel), lucide-react, `node:test` + `react-dom/server` (`renderToStaticMarkup`), Playwright (só o smoke do CI).

**Spec:** `docs/superpowers/specs/2026-10-19-link-da-bio-design.md` — §8 inteiro menos Aparência/Perfil/Divulgar, §9 (contratos), §11 (acessibilidade do painel), §12 linha 6a. Visual e textos: `Desktop/girumo-design-refs/link-da-bio/project/Editor.dc.html` (fora do repo; tem dado da loja-piloto, que **não** entra em nenhum arquivo deste PR).

**Depende de:** PR 2 (`documento.ts`, store `bio-pages.ts`), PR 3a (`renderPaginaBio` — só a Parte 2), PR 4a (o endereço que o painel mostra já abre) e PR 5 (`/api/link-da-bio` e os tipos de `lib/bio/painel-api.ts`), todos em `main`. Índice: `docs/superpowers/plans/2026-10-19-link-da-bio-00-indice.md`. Quem depende deste: 6b (abas Aparência, Perfil, Divulgar e o item no menu) e 7 (bloco "Avançado").

## Tamanho e divisão

São 13 arquivos de código (16 somando o que cada parte toca: `editor.ts`, `editor.tsx` e `painel-vitrine.css` mudam nas duas). Vai em dois PRs, cada um com branch própria, CI verde e merge na mesma sessão:

| Parte | Branch | O quê | Código | Teste |
|---|---|---|---|---|
| 1 | `feat/link-da-bio-6a1-links` | regras do editor, hook de estado, aba Links (lista, interruptor, Reordenar, folha Adicionar/Editar/Excluir), salvar/descartar com versão e 409, estado vazio + "Criar minha página", rota, borda do interruptor, barra de salvar do celular, smoke | 10 | 5 |
| 2 | `feat/link-da-bio-6a2-previa` | prévia (coluna fixa e tela cheia), rever a entrada, guarda de saída, "Ver como fica", `scroll-padding-bottom` | 6 | 2 (+1 alterado) |

A Parte 2 sai de `origin/main` **depois** da Parte 1 mergeada. Entre as duas a tela funciona (cria, edita, salva), só sem prévia e sem a pergunta ao sair — e ninguém chega nela sem digitar a URL, porque o item no menu só entra no 6b (§8).

## Decisões deste plano

| Decisão | Por quê | Custo se estiver errada |
|---|---|---|
| **Estado num hook só** (`useEditorBio`): versão salva + rascunho + contexto do GET + `rodada`. As abas recebem `PropsDaAba` e mudam o documento só por função (`mudarDocumento(d => …)`) | Uma fonte de verdade; duas mudanças no mesmo clique (link novo + rever a entrada) não se atropelam; o 6b só cria abas | — |
| **Registro de abas com `dona(campo)`** (`abas.tsx`) | "Salvar com erro → primeiro campo com erro" (§8) vira uma linha por aba: o editor troca para a aba dona e ela foca o campo. Campo sem dona (`slug` antes do 6b, `versao`, `documento`) cai no aviso do topo | — |
| **Validar no navegador com o `documentoBio` do PR 2**; um link é validado dentro do `documentoPadrao` (válido) e a SAÍDA do zod (já normalizada: `https://`, `55`+dígitos) é o que entra no rascunho. A frase da tela vem de `MENSAGENS_DOS_CAMPOS`, pelo caminho com os índices trocados por `*` | Uma regra só; a lojista lê português, não a frase padrão do zod; o rascunho guarda o que o servidor vai gravar | Se o PR 2 usar `z.union` em vez de `z.discriminatedUnion`, o caminho para em `links.N` e o erro sai como "Confira os dados deste link." — o teste "antes do PATCH…" (Task 1) pega |
| **"Alterações não salvas" compara com as chaves em ordem** (`mesmoConteudo`) | O jsonb devolve as chaves noutra ordem que o zod: editar um link e tocar em "Pronto" sem mudar nada sujaria a tela | — |
| **Aviso vermelho**: campanha decidida aqui (lista do GET: apagada ou sem link); número conectado só pela lista `linksEscondidos` da API e só enquanto o número (ou o `wa.me`) é o da versão salva. Depois de salvar, a lista zera | O PATCH devolve só `PaginaBio` (§9); o servidor recusa número conectado no salvar (§4), então o que acabou de salvar não tem link escondido por número. Sem GET extra | Número que vira conectado depois do salvar só ganha aviso quando a tela recarrega |
| **Chamadas por `authenticatedFetch`** (`lib/supabase/client.ts`), não `fetch` cru | Quem entrou pelo Google só tem Bearer (achado "tenant cookie × Bearer"); manda também o `x-tenant-id` de quem tem duas lojas. É o que o plano do PR 5 pede | — |
| **Excluir confirma na própria folha** ("Excluir “X” da página?" · Não · Excluir), não com `useConfirmacao` | §8; e duas `Folha` abertas disputam o Tab (achado do PR 7 do funil) | — |
| **Foco por `focarDepois(id)`** (`requestAnimationFrame`) | A `Folha` guarda quem a abriu e prende o foco no mesmo commit; focar antes faria o foco não voltar ao fechar. A linha que sobe ou desce troca de lugar no DOM e perde o foco | — |
| **"Reordenar" vira "Pronto", sem `aria-pressed`** | APG: botão de alternância não troca o rótulo. O mockup fazia as duas coisas | — |
| **Prévia com `key={rodada}` + "documento da rodada"** | A entrada só toca quando a rodada sobe (link novo, troca de modelo, "Rever a animação"); o resto redesenha parado; duas rodadas seguidas com o mesmo HTML ainda recarregam | A cada mudança o iframe recarrega e volta ao topo (sandbox opaco: não dá pra guardar a rolagem) |
| **Abrir "Ver como fica" não toca a entrada**; "Rever a animação" fica no rodapé da prévia (coluna e tela cheia) | O §8 lista só três gatilhos; o mockup tocava ao abrir. O botão no rodapé é do mockup do computador e dá ao 6a um jeito de ver a animação antes da aba Aparência | — |
| **Guarda de saída: `preventDefault` na captura, sem `stopPropagation`** | O `<Link>` do Next não navega quando vê `defaultPrevented`, e o resto do clique segue (a folha "Mais" fecha) | Se o Next deixar de olhar `defaultPrevented`, o clique navega sem perguntar — o roteiro da Task 11 pega |
| **Barras fixas do celular por CSS** (`.pn-bio-salvar`, `.pn-bio-ver`, `html:has(...)`) | A altura da barra de salvar e do "Ver como fica" mora junto do `scroll-padding-bottom` que depende dela; a prévia não precisa saber se há alteração | — |
| **Fotos do botão (`link.fotos`) e da fachada (`endereco.foto`) ficam para o 6b** | O upload nasce no 6b, com o Perfil (§12: "Perfil (uploads…)"). O 6a preserva o que vier (o rascunho é cópia do link) | O 6b mexe em `folha-de-link.tsx`, além de criar as três abas |
| **Quadro: o card continua `em_construcao`; só o `blocker` é reescrito** | `move_card` para o mesmo status não grava evento (achado de 14/10; PRs 1, 4a e 5 fazem igual) | — |

## Global Constraints

- Rota `/painel/link-da-bio`; **sem item no menu** neste PR ("O item no menu só entra no PR 6b", §8). Vendedora não vê: a `GuardaDeModulo` já bloqueia rota fora do mapa — nada a acrescentar em `lib/auth/modulos.ts`. Quem edita: `owner`, `admin`, `operator` (`campaign:edit`); a API cobra.
- Endereço principal (§8): `https://<dominio>/` se houver domínio ativo, senão `origemGirumo` + `/bio/<slug>` (**slug salvo**), os dois do GET. **Nunca** `useLinkOrigin` nem `window.location`.
- Contrato HTTP (§9 e plano do PR 5): `GET /api/link-da-bio` → `RespostaDoPainelBio`; `POST /api/link-da-bio` (sem corpo) → 201 `PaginaBio` (idempotente); `PATCH /api/link-da-bio` com `{ versao, slug, publicada, documento }` (exatamente essas chaves) → 200 `PaginaBio` · 400 `{ error, campo? }` · 404 `{ error }` · 409 `{ error, motivo: "versao" | "slug" }`; 401/403 em texto puro.
- 409 de versão: "Outra pessoa salvou antes. Recarregue pra ver a versão nova." com o botão **Recarregar** (§8). Salvar é explícito, nunca automático.
- Links (§4): 0–20 (`MAX_LINKS = 20`); no máximo **um** `destaque`, que não vale para `endereco`; `titulo` 1–50, `sub` 0–80, `mensagem` 0–300, `url` ≤ 500, `endereco` 5–200, `horario` 0–120; `id` uuid gerado no navegador (`crypto.randomUUID()`).
- Prévia (§8): `<iframe srcdoc sandbox="">` com `renderPaginaBio(dados, { modo: "previa", nonce: null, animarEntrada })`; computador: coluna fixa à direita, escalada por `transform`; celular: "Ver como fica" abre em tela cheia. Atualiza a cada mudança **sem** repetir a entrada; ela só toca em "Rever a animação", ao trocar de modelo e ao adicionar link.
- Saída com alterações (§8): `beforeunload` + clique em link interno interceptado na fase de captura + `useConfirmacao`. No celular a barra de salvar fica acima da barra de baixo; `scroll-padding-bottom` = altura das barras fixas (WCAG 2.4.11).
- Foco (§8): escolher tipo → primeiro campo; pedir exclusão → "Não"; excluir → "Adicionar link"; Subir/Descer na ponta → o outro botão; salvar com erro → primeiro campo com erro.
- Reuso obrigatório (§8): `Folha` (`emQualquerLargura`, `fundoFecha={false}`), `Interruptor` (`components/painel/instagram/interruptor.tsx`), `useConfirmacao`, `useToast`, `ErroDeCarga`; classes de campo e botão como em `dialogo-de-gasto.tsx`. **Nada de `components/ui`.** O trilho desligado do interruptor ganha borda ≥ 3:1 em `.pn-interruptor` (`app/painel-vitrine.css`, vale para o painel todo).
- `npm run painel:check` (sem `rounded-2xl`/`3xl`, gradiente, blur, a palavra do estilo editorial em itálico, roxo, mais de 2 fundos Acid por arquivo; `pn-skeleton` com `role="status"`/`aria-hidden`) e `npm run brand:check` (sem a marca antiga) passam. Texto nunca abaixo de 13 px; campo de digitar com `text-[16px]` (iOS não dá zoom).
- Nomes acessíveis são contrato com os testes: botões `Criar minha página`, `Salvar`, `Descartar`, `Recarregar`, `Reordenar`/`Pronto`, `Adicionar link` (id `bio-adicionar-link`), `Editar o link <título>`, `Mostrar na página: <título>` (switch), `Subir <título>`, `Descer <título>`, `Copiar o endereço da página`, link `Abrir a página numa aba nova`, `Voltar pros tipos de link`, `Adicionar`/`Pronto`/`Cancelar`, `Excluir` (id `bio-link-excluir`), `Não`, `Botão em destaque` (switch), `Ver como fica`, `Rever a animação`; tablist `Partes da página`; diálogos `Adicionar link`/`Novo link`/`Editar link` (`data-testid="bio-folha-link"`) e `Prévia da página`; região `Salvar alterações`.
- Dados fictícios em teste e exemplo (repo público): loja "Loja Exemplo", `loja-exemplo`, `loja.exemplo.com.br`, número `5562999990000`. Nada da loja-piloto.
- Testes: `node:test` + `node:assert/strict`; em `apps/web`: `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`. Componente: `renderToStaticMarkup(createElement(...))`, sem JSX no teste. `import type` (nunca `import { type … }`) para tipo de módulo `server-only` (`painel-api.ts`, `bio-pages.ts`). O HTML do React 19.2 no servidor (conferido): `tabindex`, `autofocus` e `disabled=""` saem minúsculos, mas `srcDoc`, `inputMode`, `maxLength` e `noValidate` saem como no JSX, e o `value` do `<input>` vai por último; as asserções seguem isso.
- Gate antes do push: `infra/scripts/verify-local.ps1` (os dois `tsc`, lint, testes e build). PowerShell 5.1: sem `&&`. Commits em inglês com prefixo semântico.

## Review Focus

- **Sair da tela com alteração** (clicar em "Campanhas" na barra, F5, fechar a aba): pergunta antes; "Abrir" (aba nova), clique com Ctrl/⌘ e link para outro site não interceptam. Coberto: "guarda de saída: só clique comum…" (`destinoInterno`, Task 8) e o roteiro da Task 11.
- **Editar um link e tocar em "Pronto" sem mudar nada**: não pode aparecer "Alterações não salvas" (o jsonb devolve as chaves noutra ordem que o zod, e o número volta formatado no campo). Coberto: "mesmo conteúdo ignora a ordem das chaves" (Task 1) e "editar um link e aplicar sem mudar nada não suja a página" (Task 2).
- **Número que virou conectado depois de salvo**: aviso vermelho na linha enquanto o número for o salvo; some quando a lojista troca o número; volta ao Descartar. Coberto: "aviso vermelho: …" (Task 2) e "link escondido pela API: aviso vermelho ligado ao botão de editar" (Task 5).
- **Outra pessoa salvou antes (409) ou a página sumiu (404)**: aviso com Recarregar, nunca grava por cima. Coberto: "PATCH: 200 grava; 409 de versão e 404 viram aviso com Recarregar…" (Task 1) e "409 vira aviso com Recarregar…" (Task 6).
- **Erro do servidor num link** (`links.2.numero`, o número conectado): a folha abre naquele link, com a frase do servidor embaixo do campo, ligada por `aria-describedby`, e o foco nele. Coberto: "erro do servidor num link vira a folha daquele link…" (Task 2) e "erro embaixo do campo, ligado por aria-describedby…" (Task 4).

---

## Arquivos

| Arquivo | Parte | Responsabilidade |
|---|---|---|
| `apps/web/src/lib/bio/editor.ts` | 1 (e 2) | regras puras do editor: guarda do GET, estado salvável, "não salvo", endereço, mensagens dos campos, resultado do PATCH, regras dos links; na Parte 2 os dados da prévia e a guarda de saída |
| `apps/web/src/lib/bio/editor.test.ts` | 1 | regras do estado e do PATCH |
| `apps/web/src/lib/bio/editor-links.test.ts` | 1 | regras dos links |
| `apps/web/src/components/painel/link-da-bio/use-editor-bio.ts` | 1 | estado do editor (GET, POST, PATCH com versão, rascunho, erro, rodada) + `focarDepois` |
| `apps/web/src/components/painel/link-da-bio/icone-do-link.tsx` | 1 | os 13 ícones do §4 (desenhos do sprite do mockup) |
| `apps/web/src/components/painel/link-da-bio/folha-de-link.tsx` (+ `.test.ts`) | 1 | folha Adicionar/Novo/Editar link, erro por campo, excluir na própria folha |
| `apps/web/src/components/painel/link-da-bio/aba-links.tsx` (+ `.test.ts`) | 1 | aba Links: lista, interruptor, Reordenar, anúncio, foco |
| `apps/web/src/components/painel/link-da-bio/abas.tsx` | 1 | registro das abas, `PropsDaAba`, barra WAI-ARIA |
| `apps/web/src/components/painel/link-da-bio/editor.tsx` (+ `.test.ts`) | 1 (e 2) | a tela: cabeçalho, endereço, avisos, abas, salvar; na Parte 2 a prévia e a guarda |
| `apps/web/src/app/painel/link-da-bio/page.tsx` | 1 | a rota |
| `apps/web/src/app/painel-vitrine.css` (alterado) | 1 e 2 | borda do interruptor, barra de salvar; tela cheia, "Ver como fica", `scroll-padding-bottom` |
| `apps/web/e2e/conteudo-esperado.ts` (alterado) | 1 | âncora e lista da rota nova |
| `apps/web/src/lib/bio/editor-previa.test.ts` | 2 | dados da prévia e guarda de saída |
| `apps/web/src/components/painel/folha.tsx` (alterado) | 2 | prop `telaCheia` |
| `apps/web/src/components/painel/link-da-bio/previa.tsx` (+ `.test.ts`) | 2 | `QuadroDaPrevia`, `PreviaNaColuna`, `PreviaNoCelular` |
| `apps/web/src/components/painel/link-da-bio/guarda-de-saida.ts` | 2 | `useGuardaDeSaida` |

---

# Parte 1 — editor e aba Links (`feat/link-da-bio-6a1-links`)

## Antes de tudo (Parte 1)

Na raiz do checkout principal (CLAUDE.md, "Regra de PR"):

```bash
git fetch origin main
git log origin/main --oneline -80 -i --grep "bio"
```

Expected: aparecem os commits dos PRs 1, 2, 3a, 4a e 5. Sem o 2, o 4a ou o 5, **parar** (o 3a só é preciso na Parte 2).
O 4a precisa estar com as **duas** partes (a raiz do domínio próprio é o endereço principal que o painel mostra):

```bash
git grep -n "bio-root" origin/main -- apps/web/src/lib/custom-domains/host.ts
```

Expected: ao menos uma linha. Vazio = a Parte 2 do 4a não entrou: **parar**.

```bash
git worktree add -b feat/link-da-bio-6a1-links .claude/worktrees/bio-6a1 origin/main
```

No worktree novo: `node_modules` por junction e e2e contra o dev só com `E2E_SUPABASE_*` no ambiente (ver "Ambiente do worktree" no índice). Comandos de teste e de git abaixo rodam em `apps/web` do worktree novo (`git add` com caminhos relativos a `apps/web`).

Conferir os nomes que este plano consome (cada linha tem de aparecer):

```bash
git grep -n -E "export (const|function|type) (documentoBio|documentoPadrao|DocumentoBio|LinkBio|Icone|Modelo|DadosRender)\b" -- src/lib/bio/documento.ts
git grep -n -E "export type PaginaBio\b" -- src/lib/stores/bio-pages.ts
git grep -n -E "export type (CampanhaDoPainel|RespostaDoPainelBio|CorpoDoPatchBio)\b" -- src/lib/bio/painel-api.ts
git grep -n -E "export async function (GET|POST|PATCH)\b" -- src/app/api/link-da-bio/route.ts
git grep -n -E "export async function authenticatedFetch\b" -- src/lib/supabase/client.ts
```

Se um nome mudou no caminho, usar o de `main` e anotar no corpo do PR. Ler `src/lib/bio/documento.ts` e confirmar duas premissas (o teste da Task 1 também cobra): (1) `documentoBio.safeParse(documentoPadrao({ nome: "Loja", campanhaId: null }))` dá `success: true`; (2) o item de `links` é `z.discriminatedUnion("tipo", …)`, para o erro do zod chegar no campo (`["links", 0, "titulo"]`). Se não for, anotar e seguir: o teste vermelho mostra onde.

### Task 1: Regras do estado do editor (GET, "não salvo", endereço, PATCH)

**Files:**
- Create: `apps/web/src/lib/bio/editor.ts`
- Test: `apps/web/src/lib/bio/editor.test.ts`

**Interfaces:**
- Consumes: `documentoBio: z.ZodType<DocumentoBio>`, `documentoPadrao(i: { nome: string; campanhaId: string | null }): DocumentoBio`, `type DocumentoBio`, `type LinkBio` de `@/lib/bio/documento` (PR 2); `type PaginaBio` de `@/lib/stores/bio-pages` (PR 2, só tipo); `type RespostaDoPainelBio`, `type CorpoDoPatchBio` de `@/lib/bio/painel-api` (PR 5, só tipo).
- Produces:
  - `type ContextoDoEditor = Omit<RespostaDoPainelBio, "pagina">`
  - `type EstadoSalvavel = Omit<CorpoDoPatchBio, "versao">`
  - `type ErroDeCampo = { campo: string; mensagem: string }`
  - `type ResultadoDoSalvar = { tipo: "ok"; pagina: PaginaBio } | { tipo: "conflito"; mensagem: string } | { tipo: "campo"; erro: ErroDeCampo } | { tipo: "falha"; mensagem: string }`
  - `MENSAGEM_DE_CONFLITO: string`, `MENSAGENS_DOS_CAMPOS: Readonly<Record<string, string>>`
  - `ehPaginaBio(v: unknown): v is PaginaBio`, `ehRespostaDoPainelBio(v: unknown): v is RespostaDoPainelBio`
  - `estadoDe(pagina: PaginaBio): EstadoSalvavel`, `contextoDe(r: RespostaDoPainelBio): ContextoDoEditor`
  - `mesmoConteudo(a: unknown, b: unknown): boolean`
  - `enderecoPrincipal(c: Pick<ContextoDoEditor, "dominio" | "origemGirumo">, slug: string): string`
  - `padraoDoCampo(campo: string): string`, `mensagemDoCampo(campo: string): string`
  - `erroDoDocumento(documento: DocumentoBio): ErroDeCampo | null`
  - `resultadoDoSalvar(status: number, corpo: unknown, texto: string): ResultadoDoSalvar`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/bio/editor.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { documentoPadrao, type DocumentoBio, type LinkBio } from "@/lib/bio/documento";
import type { RespostaDoPainelBio } from "@/lib/bio/painel-api";
import type { PaginaBio } from "@/lib/stores/bio-pages";

import {
  contextoDe,
  ehPaginaBio,
  ehRespostaDoPainelBio,
  enderecoPrincipal,
  erroDoDocumento,
  estadoDe,
  mensagemDoCampo,
  mesmoConteudo,
  padraoDoCampo,
  resultadoDoSalvar,
} from "./editor";

// Dados fictícios: nada da loja-piloto (repo público).
const ZAP: Extract<LinkBio, { tipo: "whatsapp" }> = {
  id: "6f1c2b9e-0a1d-4c3e-9b2a-1d2e3f4a5b01",
  tipo: "whatsapp",
  titulo: "Falar com a vendedora",
  sub: "Pedido no WhatsApp",
  icone: "whatsapp",
  ativo: true,
  destaque: true,
  numero: "5562999990000",
  mensagem: "Oi! Vim pelo Instagram. (BIO)",
};

function documento(links: LinkBio[]): DocumentoBio {
  return { ...documentoPadrao({ nome: "Loja Exemplo", campanhaId: null }), links };
}

const PAGINA: PaginaBio = {
  id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c01",
  tenantId: "tenant-exemplo",
  slug: "loja-exemplo",
  publicada: false,
  bloqueadaEm: null,
  documento: documento([ZAP]),
  versao: 3,
  updatedAt: "2026-10-19T12:00:00.000Z",
};

const RESPOSTA: RespostaDoPainelBio = {
  pagina: PAGINA,
  campanhas: [{ id: "0b7d6c5e-4f3a-4b2c-8d1e-0f9a8b7c6d01", nome: "VIP Atacado", slug: "vip-atacado" }],
  dominio: null,
  origemGirumo: "https://www.girumo.com.br",
  sugestaoSlug: "loja-exemplo",
  linksEscondidos: [],
};

test("guarda do GET: aceita com e sem página; recusa erro, campo faltando e tipo errado", () => {
  assert.equal(ehRespostaDoPainelBio(RESPOSTA), true);
  assert.equal(ehRespostaDoPainelBio({ ...RESPOSTA, pagina: null, dominio: "links.loja.com.br" }), true);
  assert.equal(ehRespostaDoPainelBio({ error: "Não autorizado." }), false);
  assert.equal(ehRespostaDoPainelBio(null), false);
  assert.equal(ehRespostaDoPainelBio({ ...RESPOSTA, campanhas: [{ id: "x", nome: "Sem slug" }] }), false);
  assert.equal(ehRespostaDoPainelBio({ ...RESPOSTA, linksEscondidos: [1] }), false);
  assert.equal(ehRespostaDoPainelBio({ ...RESPOSTA, pagina: { ...PAGINA, versao: "3" } }), false);
  assert.equal(ehPaginaBio({ ...PAGINA, documento: {} }), false);
});

test("estado salvável e contexto saem do GET", () => {
  assert.deepEqual(estadoDe(PAGINA), { slug: "loja-exemplo", publicada: false, documento: PAGINA.documento });
  assert.deepEqual(contextoDe(RESPOSTA), {
    campanhas: RESPOSTA.campanhas,
    dominio: null,
    origemGirumo: "https://www.girumo.com.br",
    sugestaoSlug: "loja-exemplo",
    linksEscondidos: [],
  });
});

test("mesmo conteúdo ignora a ordem das chaves (o jsonb reordena), mas não a dos links nem um valor", () => {
  assert.equal(mesmoConteudo({ a: 1, b: { c: 2, d: [1, 2] } }, { b: { d: [1, 2], c: 2 }, a: 1 }), true);
  assert.equal(mesmoConteudo({ a: [1, 2] }, { a: [2, 1] }), false);
  assert.equal(mesmoConteudo({ a: 1 }, { a: 2 }), false);
  const doBanco = Object.fromEntries(Object.entries(ZAP).reverse()) as LinkBio;
  assert.equal(mesmoConteudo(estadoDe(PAGINA), { ...estadoDe(PAGINA), documento: documento([doBanco]) }), true);
});

test("endereço principal: raiz do domínio próprio; senão a origem Girumo com /bio/<slug salvo>", () => {
  assert.equal(
    enderecoPrincipal({ dominio: "links.loja.com.br", origemGirumo: "https://www.girumo.com.br" }, "loja-exemplo"),
    "https://links.loja.com.br/",
  );
  assert.equal(
    enderecoPrincipal({ dominio: null, origemGirumo: "https://www.girumo.com.br" }, "loja-exemplo"),
    "https://www.girumo.com.br/bio/loja-exemplo",
  );
  assert.equal(
    enderecoPrincipal({ dominio: null, origemGirumo: "https://www.girumo.com.br/" }, "loja-exemplo"),
    "https://www.girumo.com.br/bio/loja-exemplo",
  );
});

test("mensagem do campo pelo caminho do zod, com os índices trocados", () => {
  assert.equal(padraoDoCampo("links.12.numero"), "links.*.numero");
  assert.equal(padraoDoCampo("perfil.destaques.1"), "perfil.destaques.*");
  assert.equal(mensagemDoCampo("links.3.numero"), "Número com DDD. Ex.: 62 99999-9999.");
  assert.equal(mensagemDoCampo("links.0.titulo"), "Escreva o texto do botão.");
  assert.equal(mensagemDoCampo("qualquer.coisa"), "Confira este campo.");
});

test("antes do PATCH, o documento passa pelo mesmo documentoBio; o primeiro erro vem com o caminho do campo", () => {
  assert.equal(erroDoDocumento(PAGINA.documento), null);
  assert.deepEqual(erroDoDocumento(documento([{ ...ZAP, titulo: "" }])), {
    campo: "links.0.titulo",
    mensagem: "Escreva o texto do botão.",
  });
});

test("PATCH: 200 grava; 409 de versão e 404 viram aviso com Recarregar; 409 de slug e 400 com campo vão pro campo", () => {
  assert.deepEqual(resultadoDoSalvar(200, PAGINA, ""), { tipo: "ok", pagina: PAGINA });
  assert.deepEqual(resultadoDoSalvar(409, { error: "Versão velha.", motivo: "versao" }, ""), {
    tipo: "conflito",
    mensagem: "Outra pessoa salvou antes. Recarregue pra ver a versão nova.",
  });
  assert.deepEqual(resultadoDoSalvar(404, { error: "Loja sem página." }, ""), {
    tipo: "conflito",
    mensagem: "Essa página não existe mais. Recarregue pra ver como ela está agora.",
  });
  assert.deepEqual(resultadoDoSalvar(409, { error: "Esse endereço já é de outra loja.", motivo: "slug" }, ""), {
    tipo: "campo",
    erro: { campo: "slug", mensagem: "Esse endereço já é de outra loja." },
  });
  const conectado = "Esse é o número que a Girumo usa para postar nos grupos. Use o número de atendimento.";
  assert.deepEqual(resultadoDoSalvar(400, { error: conectado, campo: "links.2.numero" }, ""), {
    tipo: "campo",
    erro: { campo: "links.2.numero", mensagem: conectado },
  });
  assert.deepEqual(resultadoDoSalvar(400, { campo: "links.0.url" }, ""), {
    tipo: "campo",
    erro: { campo: "links.0.url", mensagem: "Esse endereço não parece um link. Ex.: sualoja.com.br/catalogo" },
  });
});

test("PATCH sem campo: a frase da rota, o texto puro do 403; nunca HTML nem corpo estranho na tela", () => {
  const padrao = "Não deu pra salvar. Confira a internet e tente de novo.";
  assert.deepEqual(resultadoDoSalvar(400, { error: "Documento inválido." }, ""), { tipo: "falha", mensagem: "Documento inválido." });
  assert.deepEqual(resultadoDoSalvar(403, null, "Sem permissão para esta ação."), {
    tipo: "falha",
    mensagem: "Sem permissão para esta ação.",
  });
  assert.deepEqual(resultadoDoSalvar(401, null, "<!doctype html><title>x</title>"), { tipo: "falha", mensagem: padrao });
  assert.deepEqual(resultadoDoSalvar(502, null, "Bad gateway"), { tipo: "falha", mensagem: padrao });
  assert.deepEqual(resultadoDoSalvar(200, { ok: true }, ""), { tipo: "falha", mensagem: padrao });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/editor.test.ts`
Expected: FAIL — `Cannot find module './editor'`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/src/lib/bio/editor.ts
import { documentoBio, type DocumentoBio } from "@/lib/bio/documento";
import type { CorpoDoPatchBio, RespostaDoPainelBio } from "@/lib/bio/painel-api";
import type { PaginaBio } from "@/lib/stores/bio-pages";

/**
 * Regras puras do editor do link da bio no painel (spec 2026-10-19-link-da-bio §8–§9).
 * Roda no navegador e nos testes: nada de fetch, React ou Supabase aqui. A validação
 * é o MESMO `documentoBio` do servidor (PR 2); este arquivo só traduz o erro dele para
 * o campo da tela.
 */

// ------------------------------------------------------------------- estado (§9)

/** O GET sem a página: o que não muda enquanto se edita. */
export type ContextoDoEditor = Omit<RespostaDoPainelBio, "pagina">;

/** O que o PATCH grava junto da `versao`. */
export type EstadoSalvavel = Omit<CorpoDoPatchBio, "versao">;

/** Erro preso a um campo; `campo` é o caminho do zod: "links.2.numero", "perfil.nome", "slug". */
export type ErroDeCampo = { campo: string; mensagem: string };

export type ResultadoDoSalvar =
  | { tipo: "ok"; pagina: PaginaBio }
  | { tipo: "conflito"; mensagem: string }
  | { tipo: "campo"; erro: ErroDeCampo }
  | { tipo: "falha"; mensagem: string };

export const MENSAGEM_DE_CONFLITO = "Outra pessoa salvou antes. Recarregue pra ver a versão nova.";
const PAGINA_SUMIU = "Essa página não existe mais. Recarregue pra ver como ela está agora.";
const FALHA_AO_SALVAR = "Não deu pra salvar. Confira a internet e tente de novo.";
const SEM_MENSAGEM = "Confira este campo.";

/**
 * A frase de cada campo, pelo caminho com os índices trocados por "*". É a frase da tela,
 * e não a do zod: o mesmo schema serve a API, e a lojista lê português. O 6b acrescenta
 * as do Perfil e do Divulgar aqui.
 */
export const MENSAGENS_DOS_CAMPOS: Readonly<Record<string, string>> = {
  links: "A página aceita até 20 links e um só em destaque.",
  "links.*.titulo": "Escreva o texto do botão.",
  "links.*.sub": "O texto de apoio vai até 80 letras.",
  "links.*.numero": "Número com DDD. Ex.: 62 99999-9999.",
  "links.*.mensagem": "A mensagem vai até 300 letras.",
  "links.*.campanhaId": "Escolha a campanha.",
  "links.*.url": "Esse endereço não parece um link. Ex.: sualoja.com.br/catalogo",
  "links.*.endereco": "Escreva o endereço da loja, com pelo menos 5 letras.",
  "links.*.horario": "O horário vai até 120 letras.",
};

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function ehPaginaBio(v: unknown): v is PaginaBio {
  if (!ehObjeto(v)) return false;
  const documento = v.documento;
  return (
    typeof v.id === "string" &&
    typeof v.slug === "string" &&
    typeof v.publicada === "boolean" &&
    typeof v.versao === "number" &&
    (v.bloqueadaEm === null || typeof v.bloqueadaEm === "string") &&
    ehObjeto(documento) &&
    Array.isArray(documento.links)
  );
}

function ehCampanha(v: unknown): boolean {
  return (
    ehObjeto(v) &&
    typeof v.id === "string" &&
    typeof v.nome === "string" &&
    (v.slug === null || typeof v.slug === "string")
  );
}

/** Guarda do GET: corpo fora do formato é erro de carga, nunca dado. */
export function ehRespostaDoPainelBio(v: unknown): v is RespostaDoPainelBio {
  if (!ehObjeto(v)) return false;
  const { pagina, campanhas, dominio, origemGirumo, sugestaoSlug, linksEscondidos } = v;
  return (
    (pagina === null || ehPaginaBio(pagina)) &&
    Array.isArray(campanhas) &&
    campanhas.every(ehCampanha) &&
    (dominio === null || typeof dominio === "string") &&
    typeof origemGirumo === "string" &&
    typeof sugestaoSlug === "string" &&
    Array.isArray(linksEscondidos) &&
    linksEscondidos.every((id) => typeof id === "string")
  );
}

export function estadoDe(pagina: PaginaBio): EstadoSalvavel {
  return { slug: pagina.slug, publicada: pagina.publicada, documento: pagina.documento };
}

export function contextoDe(r: RespostaDoPainelBio): ContextoDoEditor {
  return {
    campanhas: r.campanhas,
    dominio: r.dominio,
    origemGirumo: r.origemGirumo,
    sugestaoSlug: r.sugestaoSlug,
    linksEscondidos: r.linksEscondidos,
  };
}

/** JSON com as chaves em ordem: o jsonb do banco devolve outra ordem que a do zod, e ordem de chave não é mudança. */
function chaveEstavel(v: unknown): string {
  return JSON.stringify(v, (_chave, valor: unknown) =>
    ehObjeto(valor)
      ? Object.fromEntries(Object.entries(valor).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : valor,
  );
}

/** Mesmo conteúdo, em qualquer ordem de chaves. É o que decide "Alterações não salvas". */
export function mesmoConteudo(a: unknown, b: unknown): boolean {
  return chaveEstavel(a) === chaveEstavel(b);
}

/**
 * O endereço que vai na bio (§2, §8): a raiz do domínio próprio, se houver; senão o da
 * Girumo com o slug SALVO. Nunca a origem do navegador (`useLinkOrigin` devolveria o
 * domínio próprio, onde `/bio/*` é 404).
 */
export function enderecoPrincipal(c: Pick<ContextoDoEditor, "dominio" | "origemGirumo">, slug: string): string {
  return c.dominio ? `https://${c.dominio}/` : `${c.origemGirumo.replace(/\/+$/, "")}/bio/${slug}`;
}

/** "links.2.numero" → "links.*.numero". */
export function padraoDoCampo(campo: string): string {
  return campo.replace(/\.\d+(?=\.|$)/g, ".*");
}

export function mensagemDoCampo(campo: string): string {
  return MENSAGENS_DOS_CAMPOS[padraoDoCampo(campo)] ?? SEM_MENSAGEM;
}

/** O primeiro erro do documento inteiro, no mesmo formato do 400 da API. Roda antes do PATCH. */
export function erroDoDocumento(documento: DocumentoBio): ErroDeCampo | null {
  const r = documentoBio.safeParse(documento);
  if (r.success) return null;
  const campo = (r.error.issues[0]?.path ?? []).map(String).join(".");
  return { campo, mensagem: mensagemDoCampo(campo) };
}

/**
 * O que fazer com a resposta do PATCH (§9): 200 `PaginaBio` · 400 `{ error, campo? }` · 404 ·
 * 409 `{ error, motivo }`. `texto` é o corpo cru: o 403 de permissão vem em texto puro.
 */
export function resultadoDoSalvar(status: number, corpo: unknown, texto: string): ResultadoDoSalvar {
  const o: Record<string, unknown> = ehObjeto(corpo) ? corpo : {};
  const erro = typeof o.error === "string" && o.error.trim() ? o.error.trim() : null;
  if (status === 200) {
    return ehPaginaBio(corpo) ? { tipo: "ok", pagina: corpo } : { tipo: "falha", mensagem: FALHA_AO_SALVAR };
  }
  if (status === 409 && o.motivo === "slug") {
    return { tipo: "campo", erro: { campo: "slug", mensagem: erro ?? "Esse endereço já é de outra loja. Escolha outro." } };
  }
  if (status === 409) return { tipo: "conflito", mensagem: MENSAGEM_DE_CONFLITO };
  if (status === 404) return { tipo: "conflito", mensagem: PAGINA_SUMIU };
  if (status === 400 && typeof o.campo === "string" && o.campo) {
    return { tipo: "campo", erro: { campo: o.campo, mensagem: erro ?? mensagemDoCampo(o.campo) } };
  }
  const cru = texto.trim();
  const legivel = cru && cru.length <= 200 && !cru.startsWith("<") ? cru : null;
  if (status >= 400 && status < 500) return { tipo: "falha", mensagem: erro ?? legivel ?? FALHA_AO_SALVAR };
  return { tipo: "falha", mensagem: FALHA_AO_SALVAR };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/editor.test.ts`
Expected: PASS (8 testes). Se só "antes do PATCH…" falhar com `campo: "links.0"`, o PR 2 não usa `discriminatedUnion`: anotar no corpo do PR e combinar a correção com o dono do PR 2 (o mapeamento por campo depende disso); se falhar porque `erroDoDocumento(PAGINA.documento)` não é `null`, o `documentoPadrao` não passa no `documentoBio` — é defeito do PR 2.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bio/editor.ts src/lib/bio/editor.test.ts
git commit -m "feat(link-da-bio): editor state rules (GET guard, dirty check, PATCH outcome)"
```

### Task 2: Regras dos links (atalhos, validação, avisos, ordem)

**Files:**
- Modify: `apps/web/src/lib/bio/editor.ts` (troca o bloco de imports; acrescenta a seção "links" no fim)
- Test: `apps/web/src/lib/bio/editor-links.test.ts`

**Interfaces:**
- Consumes: Task 1 (`ErroDeCampo`, `mensagemDoCampo`); `type Icone`, `type LinkBio`, `documentoPadrao` de `@/lib/bio/documento` (PR 2); `type CampanhaDoPainel` de `@/lib/bio/painel-api` (PR 5); `formatPhoneBR(raw: string | null | undefined): string | null` de `@/lib/phone`.
- Produces:
  - `MAX_LINKS = 20`
  - `type IdDoAtalho = "whatsapp" | "grupo" | "catalogo" | "endereco" | "canal" | "outro"`, `type Atalho = { id: IdDoAtalho; nome: string; descricao: string; icone: Icone }`, `ATALHOS: readonly Atalho[]`
  - `ICONES_DO_SELETOR: readonly (readonly [Icone, string])[]`
  - `CAMPOS_DO_LINK` (tupla `"titulo" | "sub" | "numero" | "mensagem" | "campanhaId" | "url" | "endereco" | "horario"`, nesta ordem), `type CampoDoLink`, `type ErrosDoLink = Partial<Record<CampoDoLink | "geral", string>>`
  - `type ContextoDosAvisos = { campanhas: readonly CampanhaDoPainel[]; linksEscondidos: readonly string[]; salvos: readonly LinkBio[] }`
  - `linkDoAtalho(atalho: IdDoAtalho, o: { id: string; campanhas: readonly CampanhaDoPainel[] }): LinkBio`
  - `rascunhoDoLink(link: LinkBio): LinkBio`
  - `errosDoLink(issues: readonly { readonly path: readonly PropertyKey[] }[], indice: number): ErrosDoLink`
  - `validarLink(link: LinkBio): { ok: true; link: LinkBio } | { ok: false; erros: ErrosDoLink }`
  - `erroNoLink(erro: ErroDeCampo): { indice: number; erros: ErrosDoLink } | null`
  - `primeiroCampoComErro(erros: ErrosDoLink): CampoDoLink | null`
  - `resumoDoLink(link: LinkBio, campanhas: readonly CampanhaDoPainel[]): string`
  - `avisoDoLink(link: LinkBio, c: ContextoDosAvisos): string | null`
  - `contagemDosLinks(links: readonly LinkBio[], c: ContextoDosAvisos): string`
  - `comLink(links: readonly LinkBio[], link: LinkBio): LinkBio[]`, `semLink(links: readonly LinkBio[], id: string): LinkBio[]`, `alternarLink(links: readonly LinkBio[], id: string): LinkBio[]`, `moverLink(links: readonly LinkBio[], id: string, passo: -1 | 1): LinkBio[]`
  - `anuncioDaOrdem(titulo: string, posicao: number, total: number): string`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/bio/editor-links.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { documentoPadrao, type DocumentoBio, type LinkBio } from "@/lib/bio/documento";
import type { CampanhaDoPainel } from "@/lib/bio/painel-api";

import {
  alternarLink,
  anuncioDaOrdem,
  ATALHOS,
  avisoDoLink,
  comLink,
  contagemDosLinks,
  erroNoLink,
  errosDoLink,
  linkDoAtalho,
  mesmoConteudo,
  moverLink,
  primeiroCampoComErro,
  rascunhoDoLink,
  resumoDoLink,
  semLink,
  validarLink,
  type ContextoDosAvisos,
  type ErrosDoLink,
} from "./editor";

type Tipo<T extends LinkBio["tipo"]> = Extract<LinkBio, { tipo: T }>;

// Dados fictícios: nada da loja-piloto (repo público).
const ZAP: Tipo<"whatsapp"> = {
  id: "6f1c2b9e-0a1d-4c3e-9b2a-1d2e3f4a5b01",
  tipo: "whatsapp",
  titulo: "Falar com a vendedora",
  sub: "Pedido no WhatsApp",
  icone: "whatsapp",
  ativo: true,
  destaque: true,
  numero: "5562999990000",
  mensagem: "Oi! Vim pelo Instagram. (BIO)",
};
const GRUPO: Tipo<"grupo"> = {
  id: "6f1c2b9e-0a1d-4c3e-9b2a-1d2e3f4a5b02",
  tipo: "grupo",
  titulo: "Entrar no grupo VIP",
  sub: "",
  icone: "coroa",
  ativo: true,
  destaque: false,
  campanhaId: "0b7d6c5e-4f3a-4b2c-8d1e-0f9a8b7c6d01",
};
const SITE: Tipo<"link"> = {
  id: "6f1c2b9e-0a1d-4c3e-9b2a-1d2e3f4a5b03",
  tipo: "link",
  titulo: "Catálogo",
  sub: "Kits e preços",
  icone: "catalogo",
  ativo: false,
  destaque: false,
  url: "https://loja.exemplo.com.br/catalogo",
  fotos: [],
};
const LOJA: Tipo<"endereco"> = {
  id: "6f1c2b9e-0a1d-4c3e-9b2a-1d2e3f4a5b04",
  tipo: "endereco",
  titulo: "Como chegar",
  sub: "",
  icone: "mapa",
  ativo: true,
  endereco: "Rua Exemplo, 100\nCentro, Goiânia",
  horario: "Seg a sáb, 8h às 18h",
  foto: null,
};
const CAMPANHAS: CampanhaDoPainel[] = [
  { id: "0b7d6c5e-4f3a-4b2c-8d1e-0f9a8b7c6d01", nome: "VIP Atacado", slug: "vip-atacado" },
  { id: "0b7d6c5e-4f3a-4b2c-8d1e-0f9a8b7c6d02", nome: "Saldão", slug: null },
];
const SALVOS: LinkBio[] = [ZAP, GRUPO, SITE, LOJA];
const CTX: ContextoDosAvisos = { campanhas: CAMPANHAS, linksEscondidos: [], salvos: SALVOS };
const APAGADA = "0b7d6c5e-4f3a-4b2c-8d1e-0f9a8b7c6d99";

function valido(link: LinkBio): LinkBio {
  const r = validarLink(link);
  assert.ok(r.ok, JSON.stringify(r));
  return r.link;
}

function erros(link: LinkBio): ErrosDoLink {
  const r = validarLink(link);
  assert.equal(r.ok, false);
  return r.ok ? {} : r.erros;
}

test("os seis atalhos preenchem tipo, ícone e textos; o Grupo VIP nasce na primeira campanha com link", () => {
  assert.deepEqual(
    ATALHOS.map((a) => a.nome),
    ["WhatsApp da loja", "Grupo VIP", "Catálogo ou site", "Como chegar", "Canal do WhatsApp", "Outro link"],
  );
  const id = "6f1c2b9e-0a1d-4c3e-9b2a-1d2e3f4a5b09";
  const feitos = ATALHOS.map((a) => linkDoAtalho(a.id, { id, campanhas: CAMPANHAS }));
  assert.deepEqual(
    feitos.map((l) => [l.tipo, l.icone, l.titulo]),
    [
      ["whatsapp", "whatsapp", "Falar com a vendedora"],
      ["grupo", "coroa", "Entrar no grupo VIP"],
      ["link", "catalogo", "Catálogo"],
      ["endereco", "mapa", "Como chegar na loja"],
      ["link", "canal", "Seguir o canal da loja"],
      ["link", "link", ""],
    ],
  );
  assert.ok(feitos.every((l) => l.id === id && l.ativo));
  const grupo = feitos[1];
  assert.equal(grupo.tipo === "grupo" && grupo.campanhaId, CAMPANHAS[0].id);
  // Só campanha sem link: nasce nela (o aviso da lista explica); nenhuma: vazio, e o Adicionar pede a campanha.
  const soSemLink = linkDoAtalho("grupo", { id, campanhas: [CAMPANHAS[1]] });
  assert.equal(soSemLink.tipo === "grupo" && soSemLink.campanhaId, CAMPANHAS[1].id);
  const nenhuma = linkDoAtalho("grupo", { id, campanhas: [] });
  assert.equal(nenhuma.tipo === "grupo" && nenhuma.campanhaId, "");
});

test("validarLink normaliza como o servidor: endereço sem esquema ganha https://, número formatado vira 55+dígitos, texto aparado", () => {
  const site = valido({ ...SITE, titulo: "  Catálogo  ", url: "loja.exemplo.com.br/catalogo" });
  assert.equal(site.titulo, "Catálogo");
  assert.equal(site.tipo === "link" && site.url, "https://loja.exemplo.com.br/catalogo");
  const zap = valido({ ...ZAP, numero: "(62) 99999-0000" });
  assert.equal(zap.tipo === "whatsapp" && zap.numero, "5562999990000");
  assert.equal(valido(LOJA).tipo, "endereco");
});

test("validarLink recusa com a frase do campo: título vazio, número curto, javascript:, sem ponto, endereço curto, campanha vazia", () => {
  assert.deepEqual(erros({ ...ZAP, titulo: "   " }), { titulo: "Escreva o texto do botão." });
  assert.equal(erros({ ...ZAP, numero: "1234" }).numero, "Número com DDD. Ex.: 62 99999-9999.");
  assert.equal(erros({ ...SITE, url: "javascript:alert(1)" }).url, "Esse endereço não parece um link. Ex.: sualoja.com.br/catalogo");
  assert.equal(erros({ ...SITE, url: "sem-ponto" }).url, "Esse endereço não parece um link. Ex.: sualoja.com.br/catalogo");
  assert.equal(erros({ ...LOJA, endereco: "Rua" }).endereco, "Escreva o endereço da loja, com pelo menos 5 letras.");
  assert.equal(erros({ ...GRUPO, campanhaId: "" }).campanhaId, "Escolha a campanha.");
});

test("editar um link e aplicar sem mudar nada não suja a página: a volta do número formatado dá o mesmo valor", () => {
  const salvo: DocumentoBio = { ...documentoPadrao({ nome: "Loja Exemplo", campanhaId: null }), links: [ZAP, SITE] };
  const reaplicado = { ...salvo, links: comLink(salvo.links, valido(rascunhoDoLink(ZAP))) };
  assert.equal(mesmoConteudo(reaplicado, salvo), true);
  assert.equal(mesmoConteudo({ ...salvo, links: alternarLink(salvo.links, ZAP.id) }, salvo), false);
});

test("rascunho da folha: o número volta formatado, o resto igual", () => {
  assert.equal((rascunhoDoLink(ZAP) as Tipo<"whatsapp">).numero, "+55 62 99999-0000");
  assert.equal(rascunhoDoLink(SITE), SITE);
});

test("erro do servidor num link vira a folha daquele link com o erro no campo; fora de link, null", () => {
  assert.deepEqual(erroNoLink({ campo: "links.2.numero", mensagem: "Número conectado." }), {
    indice: 2,
    erros: { numero: "Número conectado." },
  });
  assert.deepEqual(erroNoLink({ campo: "links.1.fotos.0", mensagem: "Foto de outra loja." }), {
    indice: 1,
    erros: { geral: "Foto de outra loja." },
  });
  assert.deepEqual(erroNoLink({ campo: "links.0", mensagem: "Tipo inválido." }), { indice: 0, erros: { geral: "Tipo inválido." } });
  assert.equal(erroNoLink({ campo: "links", mensagem: "Máximo de 20." }), null);
  assert.equal(erroNoLink({ campo: "perfil.nome", mensagem: "x" }), null);
  assert.equal(erroNoLink({ campo: "links.x.titulo", mensagem: "x" }), null);
});

test("erros do zod por campo, só do link pedido; o primeiro campo com erro segue a ordem da folha", () => {
  const issues = [
    { path: ["links", 1, "url"] },
    { path: ["links", 0, "titulo"] },
    { path: ["links", 0, "titulo"] },
    { path: ["links", 0, "fotos", 0] },
    { path: ["perfil", "nome"] },
  ];
  assert.deepEqual(errosDoLink(issues, 0), { titulo: "Escreva o texto do botão.", geral: "Confira os dados deste link." });
  assert.deepEqual(errosDoLink(issues, 1), { url: "Esse endereço não parece um link. Ex.: sualoja.com.br/catalogo" });
  assert.equal(primeiroCampoComErro({ url: "x", titulo: "y" }), "titulo");
  assert.equal(primeiroCampoComErro({ horario: "x", numero: "y" }), "numero");
  assert.equal(primeiroCampoComErro({ geral: "x" }), null);
});

test("resumo de cada tipo na segunda linha da lista", () => {
  assert.equal(resumoDoLink(ZAP, CAMPANHAS), "WhatsApp · +55 62 99999-0000");
  assert.equal(resumoDoLink({ ...ZAP, numero: "" }, CAMPANHAS), "WhatsApp · sem número");
  assert.equal(resumoDoLink(GRUPO, CAMPANHAS), "Grupo VIP · VIP Atacado");
  assert.equal(resumoDoLink({ ...GRUPO, campanhaId: APAGADA }, CAMPANHAS), "Grupo VIP · campanha apagada");
  assert.equal(resumoDoLink(SITE, CAMPANHAS), "loja.exemplo.com.br/catalogo");
  assert.equal(resumoDoLink({ ...SITE, url: "https://loja.exemplo.com.br/" }, CAMPANHAS), "loja.exemplo.com.br");
  assert.equal(resumoDoLink(LOJA, CAMPANHAS), "Rua Exemplo, 100");
});

test("aviso vermelho: campanha apagada ou sem link; número que a API escondeu, até ser trocado no rascunho", () => {
  assert.equal(avisoDoLink(GRUPO, CTX), null);
  assert.equal(
    avisoDoLink({ ...GRUPO, campanhaId: CAMPANHAS[1].id }, CTX),
    "Essa campanha não tem link pra entrar no grupo. Escolha outra campanha.",
  );
  assert.equal(avisoDoLink({ ...GRUPO, campanhaId: APAGADA }, CTX), "A campanha deste botão foi apagada. Escolha outra campanha.");
  const escondido: ContextoDosAvisos = { ...CTX, linksEscondidos: [ZAP.id, SITE.id, LOJA.id] };
  assert.match(avisoDoLink(ZAP, escondido) ?? "", /^Este é o número conectado na Girumo/);
  assert.match(avisoDoLink(SITE, escondido) ?? "", /^Este endereço leva pro número conectado/);
  // Trocou o número no rascunho: o aviso sai até o salvar conferir de novo.
  assert.equal(avisoDoLink({ ...ZAP, numero: "5562988887777" }, escondido), null);
  assert.equal(avisoDoLink(ZAP, CTX), null);
  assert.equal(avisoDoLink(LOJA, escondido), null);
  // Link que só existe no rascunho não herda aviso.
  const novoId = "6f1c2b9e-0a1d-4c3e-9b2a-1d2e3f4a5b07";
  assert.equal(avisoDoLink({ ...ZAP, id: novoId }, { ...escondido, linksEscondidos: [novoId] }), null);
});

test("contagem: aparecendo = ligado e sem aviso", () => {
  assert.equal(contagemDosLinks(SALVOS, CTX), "4 links · 3 aparecendo na página");
  assert.equal(contagemDosLinks(SALVOS, { ...CTX, linksEscondidos: [ZAP.id] }), "4 links · 2 aparecendo na página");
  assert.equal(contagemDosLinks([LOJA], CTX), "1 link · 1 aparecendo na página");
  assert.equal(contagemDosLinks([], CTX), "0 links · 0 aparecendo na página");
});

test("pôr, tirar, ligar e mover links sem mexer na lista original; destaque é um só", () => {
  const original = [...SALVOS];
  const novo: Tipo<"link"> = { ...SITE, id: "6f1c2b9e-0a1d-4c3e-9b2a-1d2e3f4a5b05", ativo: true, destaque: true };
  const com = comLink(SALVOS, novo);
  assert.deepEqual(com.map((l) => l.id), [...SALVOS.map((l) => l.id), novo.id]);
  assert.deepEqual(com.filter((l) => l.tipo !== "endereco" && l.destaque).map((l) => l.id), [novo.id]);
  const trocado = comLink(SALVOS, { ...GRUPO, titulo: "VIP" });
  assert.deepEqual(trocado.map((l) => l.titulo), ["Falar com a vendedora", "VIP", "Catálogo", "Como chegar"]);
  assert.equal((trocado[0] as Tipo<"whatsapp">).destaque, true);
  assert.deepEqual(semLink(SALVOS, GRUPO.id).map((l) => l.id), [ZAP.id, SITE.id, LOJA.id]);
  assert.equal(alternarLink(SALVOS, SITE.id)[2].ativo, true);
  assert.deepEqual(moverLink(SALVOS, SITE.id, -1).map((l) => l.id), [ZAP.id, SITE.id, GRUPO.id, LOJA.id]);
  assert.deepEqual(moverLink(SALVOS, SITE.id, 1).map((l) => l.id), [ZAP.id, GRUPO.id, LOJA.id, SITE.id]);
  assert.deepEqual(moverLink(SALVOS, ZAP.id, -1).map((l) => l.id), original.map((l) => l.id));
  assert.deepEqual(moverLink(SALVOS, LOJA.id, 1).map((l) => l.id), original.map((l) => l.id));
  assert.deepEqual(SALVOS, original);
  assert.equal(anuncioDaOrdem("Catálogo", 2, 4), "Catálogo: agora é o 2º de 4.");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/editor-links.test.ts`
Expected: FAIL — `SyntaxError: The requested module './editor' does not provide an export named 'alternarLink'` (ou a forma CJS: `alternarLink is not a function`).

- [ ] **Step 3: Write the implementation**

Trocar o bloco de imports do topo de `editor.ts` por:

```ts
import { documentoBio, documentoPadrao, type DocumentoBio, type Icone, type LinkBio } from "@/lib/bio/documento";
import type { CampanhaDoPainel, CorpoDoPatchBio, RespostaDoPainelBio } from "@/lib/bio/painel-api";
import { formatPhoneBR } from "@/lib/phone";
import type { PaginaBio } from "@/lib/stores/bio-pages";
```

E acrescentar no fim do arquivo:

```ts
// --------------------------------------------------------------- links (§4, §8)

/** "links | 0–20" (§4). */
export const MAX_LINKS = 20;

export type IdDoAtalho = "whatsapp" | "grupo" | "catalogo" | "endereco" | "canal" | "outro";
export type Atalho = { id: IdDoAtalho; nome: string; descricao: string; icone: Icone };

/** Os 6 atalhos da folha "Adicionar link" (§8), na ordem do mockup. */
export const ATALHOS: readonly Atalho[] = [
  { id: "whatsapp", nome: "WhatsApp da loja", descricao: "Conversa com a vendedora, com a mensagem já escrita", icone: "whatsapp" },
  { id: "grupo", nome: "Grupo VIP", descricao: "Entra no grupo da campanha que estiver com vaga", icone: "coroa" },
  { id: "catalogo", nome: "Catálogo ou site", descricao: "Catálogo, loja virtual ou qualquer página sua", icone: "catalogo" },
  { id: "endereco", nome: "Como chegar", descricao: "Endereço, horário e o mapa, ali na página", icone: "mapa" },
  { id: "canal", nome: "Canal do WhatsApp", descricao: "Novidades sem precisar conversar", icone: "canal" },
  { id: "outro", nome: "Outro link", descricao: "Instagram, TikTok, YouTube ou qualquer endereço", icone: "link" },
];

/** Os ícones que o link comum escolhe (o WhatsApp tem o seu, fixo), com o nome lido em voz alta. */
export const ICONES_DO_SELETOR: readonly (readonly [Icone, string])[] = [
  ["link", "Link"],
  ["catalogo", "Catálogo"],
  ["site", "Site"],
  ["sacola", "Sacola"],
  ["etiqueta", "Etiqueta"],
  ["instagram", "Instagram"],
  ["canal", "Canal"],
  ["video", "Vídeo"],
  ["coroa", "Coroa"],
  ["mapa", "Mapa"],
  ["caminhao", "Entrega"],
  ["cartao", "Pagamento"],
];

/** Os campos que a folha edita, na ordem da tela: é a ordem do "primeiro campo com erro". */
export const CAMPOS_DO_LINK = ["titulo", "sub", "numero", "mensagem", "campanhaId", "url", "endereco", "horario"] as const;
export type CampoDoLink = (typeof CAMPOS_DO_LINK)[number];
/** Erros da folha por campo; "geral" = erro do link que não é de um campo da folha (ex.: foto que não é da loja). */
export type ErrosDoLink = Partial<Record<CampoDoLink | "geral", string>>;

/** O que decide o aviso vermelho de um link (§8): a lista do GET e a versão salva. */
export type ContextoDosAvisos = {
  campanhas: readonly CampanhaDoPainel[];
  linksEscondidos: readonly string[];
  salvos: readonly LinkBio[];
};

const ERRO_GERAL_DO_LINK = "Confira os dados deste link.";

function ehCampoDoLink(v: unknown): v is CampoDoLink {
  return typeof v === "string" && (CAMPOS_DO_LINK as readonly string[]).includes(v);
}

/**
 * Link novo de um atalho, com tipo, ícone e textos padrão (mockup "Adicionar link"). `id` vem
 * de fora: `crypto.randomUUID()` no navegador, fixo no teste. O Grupo VIP nasce na primeira
 * campanha com link.
 */
export function linkDoAtalho(atalho: IdDoAtalho, o: { id: string; campanhas: readonly CampanhaDoPainel[] }): LinkBio {
  const base = { id: o.id, sub: "", ativo: true };
  switch (atalho) {
    case "whatsapp":
      return {
        ...base,
        tipo: "whatsapp",
        titulo: "Falar com a vendedora",
        sub: "Pedido, preço e estoque no WhatsApp",
        icone: "whatsapp",
        destaque: false,
        numero: "",
        mensagem: "Oi! Vim pelo Instagram e quero fazer um pedido. (BIO)",
      };
    case "grupo": {
      const campanha = o.campanhas.find((c) => c.slug !== null) ?? o.campanhas[0];
      return {
        ...base,
        tipo: "grupo",
        titulo: "Entrar no grupo VIP",
        sub: "Novidade e reposição saem primeiro no grupo",
        icone: "coroa",
        destaque: false,
        campanhaId: campanha?.id ?? "",
      };
    }
    case "catalogo":
      return { ...base, tipo: "link", titulo: "Catálogo", sub: "Veja os produtos e os preços", icone: "catalogo", destaque: false, url: "", fotos: [] };
    case "endereco":
      return { ...base, tipo: "endereco", titulo: "Como chegar na loja", sub: "Endereço, horário e o mapa", icone: "mapa", endereco: "", horario: "", foto: null };
    case "canal":
      return { ...base, tipo: "link", titulo: "Seguir o canal da loja", sub: "Novidades no seu WhatsApp", icone: "canal", destaque: false, url: "", fotos: [] };
    case "outro":
      return { ...base, tipo: "link", titulo: "", icone: "link", destaque: false, url: "", fotos: [] };
  }
}

/** O link como a folha edita: o número volta formatado ("+55 62 99999-0000"); o resto, igual. */
export function rascunhoDoLink(link: LinkBio): LinkBio {
  return link.tipo === "whatsapp" ? { ...link, numero: formatPhoneBR(link.numero) ?? link.numero } : link;
}

/** Os erros do zod que caem no link `indice`, por campo da folha (o primeiro de cada campo vence). */
export function errosDoLink(issues: readonly { readonly path: readonly PropertyKey[] }[], indice: number): ErrosDoLink {
  const erros: ErrosDoLink = {};
  for (const { path } of issues) {
    if (path[0] !== "links" || path[1] !== indice) continue;
    const campo = path[2];
    if (ehCampoDoLink(campo)) erros[campo] ??= mensagemDoCampo(`links.${indice}.${campo}`);
    else erros.geral ??= ERRO_GERAL_DO_LINK;
  }
  return erros;
}

/**
 * Valida UM link com o mesmo `documentoBio` do servidor, dentro do documento padrão (válido).
 * A saída vem normalizada pelo schema (endereço com https://, número com 55); o texto do botão
 * e o de apoio vão aparados.
 */
export function validarLink(link: LinkBio): { ok: true; link: LinkBio } | { ok: false; erros: ErrosDoLink } {
  const limpo = { ...link, titulo: link.titulo.trim(), sub: link.sub.trim() };
  const r = documentoBio.safeParse({ ...documentoPadrao({ nome: "Loja", campanhaId: null }), links: [limpo] });
  if (r.success) return { ok: true, link: r.data.links[0] };
  const erros = errosDoLink(r.error.issues, 0);
  return { ok: false, erros: Object.keys(erros).length > 0 ? erros : { geral: ERRO_GERAL_DO_LINK } };
}

/** "links.2.numero" → a folha do link 2 com o erro no Número; "links.2.fotos.0" → erro geral; fora de um link → null. */
export function erroNoLink(erro: ErroDeCampo): { indice: number; erros: ErrosDoLink } | null {
  const [raiz, indice, campo] = erro.campo.split(".");
  if (raiz !== "links" || indice === undefined || !/^\d+$/.test(indice)) return null;
  const erros: ErrosDoLink = {};
  if (ehCampoDoLink(campo)) erros[campo] = erro.mensagem;
  else erros.geral = erro.mensagem;
  return { indice: Number(indice), erros };
}

export function primeiroCampoComErro(erros: ErrosDoLink): CampoDoLink | null {
  return CAMPOS_DO_LINK.find((campo) => erros[campo]) ?? null;
}

/** A segunda linha de cada link na lista (mockup). */
export function resumoDoLink(link: LinkBio, campanhas: readonly CampanhaDoPainel[]): string {
  switch (link.tipo) {
    case "whatsapp":
      return `WhatsApp · ${formatPhoneBR(link.numero) ?? "sem número"}`;
    case "grupo":
      return `Grupo VIP · ${campanhas.find((c) => c.id === link.campanhaId)?.nome ?? "campanha apagada"}`;
    case "endereco":
      return link.endereco.split("\n")[0]?.trim() || "Sem endereço";
    case "link":
      return link.url.replace(/^https?:\/\//i, "").replace(/\/$/, "") || "Sem endereço";
  }
}

function destinoDe(link: LinkBio): string {
  return link.tipo === "whatsapp" ? link.numero : link.tipo === "link" ? link.url : "";
}

/**
 * Por que o link não sai na página mesmo ligado (§4, §6), ou null. Campanha: decide aqui, pela
 * lista do GET (apagada ou sem link). Número conectado: só a API sabe (ela vê as instâncias), e o
 * aviso vale enquanto o número (ou o endereço wa.me) é o mesmo da versão salva — trocou, o aviso
 * sai, e o salvar confere de novo.
 */
export function avisoDoLink(link: LinkBio, c: ContextoDosAvisos): string | null {
  if (link.tipo === "grupo") {
    const campanha = c.campanhas.find((x) => x.id === link.campanhaId);
    if (!campanha) return "A campanha deste botão foi apagada. Escolha outra campanha.";
    return campanha.slug === null ? "Essa campanha não tem link pra entrar no grupo. Escolha outra campanha." : null;
  }
  if (link.tipo === "endereco" || !c.linksEscondidos.includes(link.id)) return null;
  const salvo = c.salvos.find((s) => s.id === link.id);
  if (!salvo || salvo.tipo !== link.tipo || destinoDe(salvo) !== destinoDe(link)) return null;
  return link.tipo === "whatsapp"
    ? "Este é o número conectado na Girumo, então o botão saiu da página. Troque pelo número de atendimento."
    : "Este endereço leva pro número conectado na Girumo, então o botão saiu da página. Troque o endereço.";
}

/** "4 links · 3 aparecendo na página": aparecendo = ligado e sem aviso (o que a página vai mostrar). */
export function contagemDosLinks(links: readonly LinkBio[], c: ContextoDosAvisos): string {
  const aparecendo = links.filter((l) => l.ativo && avisoDoLink(l, c) === null).length;
  return `${links.length} ${links.length === 1 ? "link" : "links"} · ${aparecendo} aparecendo na página`;
}

/** Põe o link na lista (troca o de mesmo id, ou entra no fim). Destaque é um só (§4): ligar num desliga nos outros. */
export function comLink(links: readonly LinkBio[], link: LinkBio): LinkBio[] {
  const lista = links.some((l) => l.id === link.id)
    ? links.map((l) => (l.id === link.id ? link : l))
    : [...links, link];
  if (link.tipo === "endereco" || !link.destaque) return lista;
  return lista.map((l) => (l.id !== link.id && l.tipo !== "endereco" && l.destaque ? { ...l, destaque: false } : l));
}

export function semLink(links: readonly LinkBio[], id: string): LinkBio[] {
  return links.filter((l) => l.id !== id);
}

export function alternarLink(links: readonly LinkBio[], id: string): LinkBio[] {
  return links.map((l) => (l.id === id ? { ...l, ativo: !l.ativo } : l));
}

/** Sobe (-1) ou desce (+1) uma posição; na ponta, devolve a mesma ordem. */
export function moverLink(links: readonly LinkBio[], id: string, passo: -1 | 1): LinkBio[] {
  const lista = [...links];
  const i = lista.findIndex((l) => l.id === id);
  const j = i + passo;
  if (i < 0 || j < 0 || j >= lista.length) return lista;
  [lista[i], lista[j]] = [lista[j], lista[i]];
  return lista;
}

/** O que o leitor de tela ouve depois de Subir/Descer (§8, `aria-live`). */
export function anuncioDaOrdem(titulo: string, posicao: number, total: number): string {
  return `${titulo}: agora é o ${posicao}º de ${total}.`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/editor.test.ts src/lib/bio/editor-links.test.ts`
Expected: PASS (8 + 11 testes). Se "validarLink normaliza…" falhar só no valor do número ou da URL, comparar com a normalização real do PR 2 (§4: "guarda `55`+dígitos", "`url.href`") e ajustar a **asserção** à regra do PR 2 — nunca a função. Se "editar um link e aplicar sem mudar nada…" falhar, a normalização do PR 2 não é idempotente: é defeito de lá (o servidor revalida o documento salvo a cada PATCH).

- [ ] **Step 5: Commit**

```bash
git add src/lib/bio/editor.ts src/lib/bio/editor-links.test.ts
git commit -m "feat(link-da-bio): link rules for the editor (shortcuts, validation, warnings, ordering)"
```

### Task 3: Estado do editor (`useEditorBio`) e `focarDepois`

**Files:**
- Create: `apps/web/src/components/painel/link-da-bio/use-editor-bio.ts`

**Interfaces:**
- Consumes: Task 1 (`contextoDe`, `ehPaginaBio`, `ehRespostaDoPainelBio`, `erroDoDocumento`, `estadoDe`, `mesmoConteudo`, `resultadoDoSalvar`, `ContextoDoEditor`, `ErroDeCampo`, `EstadoSalvavel`); `type CorpoDoPatchBio` (PR 5); `type PaginaBio` (PR 2); `type DocumentoBio` (PR 2); `authenticatedFetch(input, init?): Promise<Response>` de `@/lib/supabase/client`; `useToast(): (message: string, type?: "success" | "error") => void` de `@/components/toast`; `type Carga = "carregando" | "ok" | "erro"` de `@/lib/painel/types`.
- Produces: `type EditorBio` (abaixo, completo), `useEditorBio(): EditorBio`, `focarDepois(id: string): void`.

Sem teste de unidade próprio: é cola (fetch + estado) sobre as regras testadas nas Tasks 1 e 2; quem o exerce são os testes de tela (Tasks 5 e 6, com um `EditorBio` montado à mão), o smoke do CI e a conferência da Task 7.

- [ ] **Step 1: Write the hook**

```ts
// apps/web/src/components/painel/link-da-bio/use-editor-bio.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useToast } from "@/components/toast";
import type { DocumentoBio } from "@/lib/bio/documento";
import {
  contextoDe,
  ehPaginaBio,
  ehRespostaDoPainelBio,
  erroDoDocumento,
  estadoDe,
  mesmoConteudo,
  resultadoDoSalvar,
  type ContextoDoEditor,
  type ErroDeCampo,
  type EstadoSalvavel,
} from "@/lib/bio/editor";
import type { CorpoDoPatchBio } from "@/lib/bio/painel-api";
import type { Carga } from "@/lib/painel/types";
import type { PaginaBio } from "@/lib/stores/bio-pages";
import { authenticatedFetch } from "@/lib/supabase/client";

/** Tudo o que a tela do editor lê e faz. As abas recebem um recorte disto (`PropsDaAba`, em abas.tsx). */
export type EditorBio = {
  /** Carga do GET. */
  carga: Carga;
  contexto: ContextoDoEditor | null;
  /** Última versão salva (null = loja sem página: estado vazio). */
  pagina: PaginaBio | null;
  /** O que está na tela, ainda sem salvar. */
  rascunho: EstadoSalvavel | null;
  sujo: boolean;
  salvando: boolean;
  criando: boolean;
  /** 409 de versão ou 404: a frase do aviso com "Recarregar". */
  conflito: string | null;
  /** Falha do salvar que não é de campo (rede, 403, 5xx). */
  aviso: string | null;
  /** Erro de campo do salvar, até a aba dona chamar `limparErro` ou o próximo salvar. */
  erro: ErroDeCampo | null;
  /** Sobe a cada pedido de rever a entrada; a prévia só anima quando ela muda. */
  rodada: number;
  carregar: () => void;
  criar: () => void;
  salvar: () => void;
  descartar: () => void;
  mudarDocumento: (mudar: (documento: DocumentoBio) => DocumentoBio) => void;
  mudarPagina: (mudanca: Partial<Pick<EstadoSalvavel, "slug" | "publicada">>) => void;
  reverAnimacao: () => void;
  limparErro: () => void;
};

const URL_DA_API = "/api/link-da-bio";
const SEM_CONEXAO = "Sem conexão. Confira a internet e tente de novo.";

/**
 * Leva o foco a `id` no próximo quadro. Depois do commit de propósito: a `Folha` guarda quem a
 * abriu e prende o foco no mesmo commit (focar antes faria o foco não voltar ao fechar), e a
 * linha que sobe ou desce troca de lugar no DOM e perde o foco que tinha.
 */
export function focarDepois(id: string): void {
  requestAnimationFrame(() => document.getElementById(id)?.focus());
}

/**
 * Estado do editor do link da bio (spec §8): a versão salva, o rascunho local, o contexto do GET
 * e a rodada da animação. Salvar é explícito, com trava otimista por `versao` (409 → Recarregar).
 * Fala com a API por `authenticatedFetch`: quem entrou pelo Google só tem Bearer.
 */
export function useEditorBio(): EditorBio {
  const toast = useToast();
  const [carga, setCarga] = useState<Carga>("carregando");
  const [contexto, setContexto] = useState<ContextoDoEditor | null>(null);
  const [pagina, setPagina] = useState<PaginaBio | null>(null);
  const [rascunho, setRascunho] = useState<EstadoSalvavel | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [criando, setCriando] = useState(false);
  const [conflito, setConflito] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<ErroDeCampo | null>(null);
  const [rodada, setRodada] = useState(0);
  // "Tentar de novo" e "Recarregar" rápidos disparam duas buscas: só a última escreve.
  const ultima = useRef(0);

  const carregar = useCallback(() => {
    const esta = ++ultima.current;
    setCarga("carregando");
    void (async () => {
      try {
        const r = await authenticatedFetch(URL_DA_API, { cache: "no-store" });
        const corpo: unknown = r.ok ? await r.json() : null;
        if (esta !== ultima.current) return;
        if (!ehRespostaDoPainelBio(corpo)) {
          setCarga("erro");
          return;
        }
        setContexto(contextoDe(corpo));
        setPagina(corpo.pagina);
        setRascunho(corpo.pagina ? estadoDe(corpo.pagina) : null);
        setConflito(null);
        setAviso(null);
        setErro(null);
        setCarga("ok");
      } catch {
        if (esta === ultima.current) setCarga("erro");
      }
    })();
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const sujo = useMemo(
    () => pagina !== null && rascunho !== null && !mesmoConteudo(rascunho, estadoDe(pagina)),
    [pagina, rascunho],
  );

  const criar = useCallback(async () => {
    setCriando(true);
    try {
      const r = await authenticatedFetch(URL_DA_API, { method: "POST" });
      const corpo: unknown = r.ok ? await r.json() : null;
      if (ehPaginaBio(corpo)) {
        setPagina(corpo);
        setRascunho(estadoDe(corpo));
      } else {
        toast("Não deu pra criar a página. Tente de novo.", "error");
      }
    } catch {
      toast(SEM_CONEXAO, "error");
    } finally {
      setCriando(false);
    }
  }, [toast]);

  const salvar = useCallback(async () => {
    if (!pagina || !rascunho || salvando) return;
    setErro(null);
    setAviso(null);
    const local = erroDoDocumento(rascunho.documento);
    if (local) {
      setErro(local);
      return;
    }
    const enviado = rascunho;
    const corpoDoPatch: CorpoDoPatchBio = { versao: pagina.versao, ...enviado };
    setSalvando(true);
    try {
      const r = await authenticatedFetch(URL_DA_API, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpoDoPatch),
      });
      // Corpo lido uma vez: JSON das nossas rotas, ou texto puro (403 de permissão e do guard).
      const texto = await r.text();
      let corpo: unknown = null;
      try {
        corpo = JSON.parse(texto);
      } catch {
        // texto puro: `resultadoDoSalvar` olha o texto.
      }
      const resultado = resultadoDoSalvar(r.status, corpo, texto);
      if (resultado.tipo === "ok") {
        const salva = resultado.pagina;
        setPagina(salva);
        // Mexeu durante o envio? Fica o que está na tela (continua sujo); senão vale o que o servidor gravou.
        setRascunho((atual) => (atual && !mesmoConteudo(atual, enviado) ? atual : estadoDe(salva)));
        // O servidor recusa número conectado no salvar (§4): no que acabou de salvar não sobra link escondido por número.
        setContexto((c) => (c ? { ...c, linksEscondidos: [] } : c));
        toast(salva.publicada ? "Salvo. A página no ar já mudou." : "Salvo. A página continua fora do ar.");
      } else if (resultado.tipo === "conflito") {
        setConflito(resultado.mensagem);
      } else if (resultado.tipo === "campo") {
        setErro(resultado.erro);
      } else {
        setAviso(resultado.mensagem);
      }
    } catch {
      setAviso(SEM_CONEXAO);
    } finally {
      setSalvando(false);
    }
  }, [pagina, rascunho, salvando, toast]);

  const descartar = useCallback(() => {
    if (!pagina) return;
    setRascunho(estadoDe(pagina));
    setErro(null);
    setAviso(null);
    toast("Alterações descartadas.");
  }, [pagina, toast]);

  const mudarDocumento = useCallback((mudar: (documento: DocumentoBio) => DocumentoBio) => {
    setRascunho((r) => (r ? { ...r, documento: mudar(r.documento) } : r));
  }, []);

  const mudarPagina = useCallback((mudanca: Partial<Pick<EstadoSalvavel, "slug" | "publicada">>) => {
    setRascunho((r) => (r ? { ...r, ...mudanca } : r));
  }, []);

  const reverAnimacao = useCallback(() => setRodada((n) => n + 1), []);
  const limparErro = useCallback(() => setErro(null), []);

  return {
    carga,
    contexto,
    pagina,
    rascunho,
    sujo,
    salvando,
    criando,
    conflito,
    aviso,
    erro,
    rodada,
    carregar,
    criar,
    salvar,
    descartar,
    mudarDocumento,
    mudarPagina,
    reverAnimacao,
    limparErro,
  };
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit --project tsconfig.json`
Expected: sem erro.

Run: `npx eslint src/components/painel/link-da-bio/use-editor-bio.ts`
Expected: sem erro nem aviso (em especial nenhum `react-hooks/exhaustive-deps`).

- [ ] **Step 3: Commit**

```bash
git add src/components/painel/link-da-bio/use-editor-bio.ts
git commit -m "feat(link-da-bio): editor state hook with explicit save and version lock"
```

### Task 4: Ícones e a folha "Adicionar / Editar link"

**Files:**
- Create: `apps/web/src/components/painel/link-da-bio/icone-do-link.tsx`
- Create: `apps/web/src/components/painel/link-da-bio/folha-de-link.tsx`
- Test: `apps/web/src/components/painel/link-da-bio/folha-de-link.test.ts`

**Interfaces:**
- Consumes: Task 2 (`ATALHOS`, `ICONES_DO_SELETOR`, `linkDoAtalho`, `rascunhoDoLink`, `validarLink`, `primeiroCampoComErro`, `CampoDoLink`, `ErrosDoLink`, `IdDoAtalho`); Task 3 (`focarDepois`); `type CampanhaDoPainel` (PR 5); `type Icone`, `type LinkBio` (PR 2); `Folha` (`@/components/painel/folha`, props `aberta, aoFechar, titulo, testId, emQualquerLargura?, fundoFecha?`); `Interruptor` (`@/components/painel/instagram/interruptor`, props `ligado, aoMudar(ligado: boolean), rotulo, desabilitado?`).
- Produces:
  - `IconeDoLink(p: { icone: Icone; className?: string }): React.JSX.Element`
  - `QuadradoDoIcone(p: { icone: Icone; apagado?: boolean }): React.JSX.Element`
  - `type InicioDaFolha = { modo: "tipos" } | { modo: "editar"; link: LinkBio; erros?: ErrosDoLink }`
  - `idDoCampo(campo: CampoDoLink): string` (= `` `bio-link-${campo}` ``)
  - `type PropsDoConteudoDaFolha` (abaixo), `ConteudoDaFolha(p: PropsDoConteudoDaFolha): React.JSX.Element`
  - `FolhaDeLink(p: { inicio: InicioDaFolha; campanhas: readonly CampanhaDoPainel[]; aoAplicar: (link: LinkBio, novo: boolean) => void; aoExcluir: (id: string) => void; aoFechar: () => void }): React.JSX.Element`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/components/painel/link-da-bio/folha-de-link.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { LinkBio } from "@/lib/bio/documento";
import { linkDoAtalho } from "@/lib/bio/editor";
import type { CampanhaDoPainel } from "@/lib/bio/painel-api";

import { ConteudoDaFolha, type PropsDoConteudoDaFolha } from "./folha-de-link";

const noop = () => {};
const ID = "6f1c2b9e-0a1d-4c3e-9b2a-1d2e3f4a5b09";
const CAMPANHAS: CampanhaDoPainel[] = [
  { id: "0b7d6c5e-4f3a-4b2c-8d1e-0f9a8b7c6d01", nome: "VIP Atacado", slug: "vip-atacado" },
  { id: "0b7d6c5e-4f3a-4b2c-8d1e-0f9a8b7c6d02", nome: "Saldão", slug: null },
];
const SITE: LinkBio = {
  id: ID,
  tipo: "link",
  titulo: "Catálogo",
  sub: "",
  icone: "catalogo",
  ativo: true,
  destaque: false,
  url: "https://loja.exemplo.com.br/catalogo",
  fotos: [],
};

function html(over: Partial<PropsDoConteudoDaFolha>): string {
  const props: PropsDoConteudoDaFolha = {
    rascunho: null,
    novo: true,
    erros: {},
    confirmando: false,
    campanhas: CAMPANHAS,
    aoEscolher: noop,
    aoVoltar: noop,
    aoMudar: noop,
    aoIcone: noop,
    aoDestaque: noop,
    aoAplicar: noop,
    aoCancelar: noop,
    aoPedirExclusao: noop,
    aoCancelarExclusao: noop,
    aoExcluir: noop,
    ...over,
  };
  return renderToStaticMarkup(createElement(ConteudoDaFolha, props));
}

test("Adicionar link: os seis atalhos, cada um com nome, descrição e id de foco", () => {
  const h = html({});
  for (const id of ["whatsapp", "grupo", "catalogo", "endereco", "canal", "outro"]) {
    assert.match(h, new RegExp(`id="bio-atalho-${id}"`));
  }
  assert.match(h, /<ul aria-label="Tipos de link"/);
  assert.match(h, />WhatsApp da loja</);
  assert.match(h, />Entra no grupo da campanha que estiver com vaga</);
  assert.match(h, />Outro link</);
  assert.doesNotMatch(h, /<form/);
});

test("novo WhatsApp: campos com rótulo, aviso do número conectado ligado ao campo, destaque e Adicionar", () => {
  const h = html({ rascunho: linkDoAtalho("whatsapp", { id: ID, campanhas: CAMPANHAS }) });
  assert.match(h, /<label for="bio-link-titulo"[^>]*>Texto do botão<\/label>/);
  assert.match(h, /<input[^>]*id="bio-link-titulo"[^>]*value="Falar com a vendedora"/);
  assert.match(h, /<label for="bio-link-numero"[^>]*>WhatsApp de atendimento, com DDD<\/label>/);
  assert.match(h, /<input[^>]*type="tel"[^>]*id="bio-link-numero"[^>]*aria-describedby="bio-link-numero-aviso"/);
  assert.match(h, /id="bio-link-numero-aviso"[^>]*>[\s\S]*Não use o número conectado na Girumo: é ele que posta nos grupos\./);
  assert.match(h, />Mensagem que já vai escrita</);
  assert.match(h, /role="switch" aria-checked="false" aria-label="Botão em destaque"/);
  assert.match(h, /aria-label="Voltar pros tipos de link"/);
  assert.match(h, /<button type="submit"[^>]*>Adicionar<\/button>/);
  assert.doesNotMatch(h, />Excluir</);
});

test("editar link: endereço, ícones com o atual marcado, Pronto e Excluir", () => {
  const h = html({ rascunho: SITE, novo: false });
  assert.match(h, /id="bio-link-url"[^>]*value="https:\/\/loja\.exemplo\.com\.br\/catalogo"/);
  assert.match(h, /inputMode="url"/);
  assert.match(h, /role="group" aria-labelledby="bio-link-icone"/);
  assert.match(h, /aria-pressed="true" aria-label="Catálogo"/);
  assert.match(h, /aria-pressed="false" aria-label="Instagram"/);
  assert.match(h, /<button type="submit"[^>]*>Pronto<\/button>/);
  assert.match(h, /<button type="button" id="bio-link-excluir"[^>]*>[\s\S]*Excluir<\/button>/);
  assert.doesNotMatch(h, /Voltar pros tipos de link/);
});

test("erro embaixo do campo, ligado por aria-describedby, com aria-invalid; erro geral anunciado", () => {
  const h = html({
    rascunho: SITE,
    novo: false,
    erros: { url: "Esse endereço não parece um link. Ex.: sualoja.com.br/catalogo", geral: "Foto de outra loja." },
  });
  assert.match(h, /id="bio-link-url"[^>]*aria-invalid="true"[^>]*aria-describedby="bio-link-url-erro"/);
  assert.match(h, /<p id="bio-link-url-erro"[^>]*>Esse endereço não parece um link\. Ex\.: sualoja\.com\.br\/catalogo<\/p>/);
  assert.match(h, /<p role="alert"[^>]*>Foto de outra loja\.<\/p>/);
  assert.doesNotMatch(h, /id="bio-link-titulo"[^>]*aria-invalid="/);
});

test("grupo: campanhas da loja, a sem link avisa no nome, a atual marcada; sem campanha diz o que fazer", () => {
  const h = html({ rascunho: linkDoAtalho("grupo", { id: ID, campanhas: CAMPANHAS }) });
  assert.match(h, /<label for="bio-link-campanhaId"[^>]*>Campanha<\/label>/);
  assert.match(h, /<option value="">Escolha a campanha…<\/option>/);
  assert.match(h, /<option value="0b7d6c5e-4f3a-4b2c-8d1e-0f9a8b7c6d01" selected="">VIP Atacado<\/option>/);
  assert.match(h, /<option value="0b7d6c5e-4f3a-4b2c-8d1e-0f9a8b7c6d02">Saldão \(sem link\)<\/option>/);
  assert.match(h, /O botão usa o link da campanha: quem toca entra no grupo que estiver com vaga\./);
  const vazio = html({ rascunho: linkDoAtalho("grupo", { id: ID, campanhas: [] }), campanhas: [] });
  assert.match(vazio, /Você ainda não tem campanha\. Crie uma em Campanhas e volte aqui\./);
  assert.match(vazio, /<option value="" selected="">Escolha a campanha…<\/option>/);
});

test("Como chegar: endereço em várias linhas e horário; sem destaque (não vale pro endereço)", () => {
  const h = html({ rascunho: linkDoAtalho("endereco", { id: ID, campanhas: [] }) });
  assert.match(h, /<textarea[^>]*id="bio-link-endereco"/);
  assert.match(h, /<label for="bio-link-horario"[^>]*>Horário \(opcional\)<\/label>/);
  assert.doesNotMatch(h, /Botão em destaque/);
});

test("confirmar exclusão: pergunta pelo título na própria folha, com Não e Excluir", () => {
  const h = html({ rascunho: SITE, novo: false, confirmando: true });
  assert.match(h, /Excluir “Catálogo” da página\?/);
  assert.match(h, /<button type="button"[^>]*>Não<\/button>/);
  assert.doesNotMatch(h, />Cancelar</);
  assert.doesNotMatch(h, /id="bio-link-excluir"/);
});

test("Outro link: placeholder do site; Canal do WhatsApp: placeholder do canal", () => {
  assert.match(html({ rascunho: linkDoAtalho("outro", { id: ID, campanhas: [] }) }), /placeholder="sualoja\.com\.br\/catalogo"/);
  assert.match(html({ rascunho: linkDoAtalho("canal", { id: ID, campanhas: [] }) }), /placeholder="whatsapp\.com\/channel\/…"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/link-da-bio/folha-de-link.test.ts`
Expected: FAIL — `Cannot find module './folha-de-link'`.

- [ ] **Step 3: Write `icone-do-link.tsx`**

```tsx
// apps/web/src/components/painel/link-da-bio/icone-do-link.tsx
import type { ReactNode } from "react";

import type { Icone } from "@/lib/bio/documento";
import { cn } from "@/lib/utils";

/**
 * Os 13 ícones da lista fechada (spec §4), com os desenhos do sprite do mockup — os mesmos da
 * página pública: o ícone que a lojista escolhe aqui é o que aparece lá.
 */
const DESENHOS: Record<Icone, ReactNode> = {
  whatsapp: (
    <path
      fill="currentColor"
      stroke="none"
      d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-2-1.2 7.4 7.4 0 0 1-1.4-1.7c-.1-.2 0-.4.1-.5l.4-.4.2-.4v-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c.6.3 1.1.4 1.5.5a3.6 3.6 0 0 0 1.7.1 2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z"
    />
  ),
  catalogo: (
    <>
      <path d="M2.5 5.5C5 4.2 8 4.3 12 6.2c4-1.9 7-2 9.5-.7V19c-2.5-1.3-5.5-1.2-9.5.7-4-1.9-7-2-9.5-.7z" />
      <path d="M12 6.2v13.5" />
    </>
  ),
  coroa: (
    <>
      <path d="M3.5 8.5l4.2 3.6L12 5l4.3 7.1 4.2-3.6-1.8 9.5H5.3z" />
      <path d="M5.5 20h13" />
    </>
  ),
  mapa: (
    <>
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
      <path d="M9.5 9.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0" />
    </>
  ),
  canal: (
    <>
      <path d="M4 10v4h3l6 4V6L7 10z" />
      <path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  instagram: (
    <>
      <path d="M7.5 3h9A4.5 4.5 0 0 1 21 7.5v9a4.5 4.5 0 0 1-4.5 4.5h-9A4.5 4.5 0 0 1 3 16.5v-9A4.5 4.5 0 0 1 7.5 3z" />
      <path d="M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0" />
      <path d="M17.3 6.7h.01" />
    </>
  ),
  site: (
    <>
      <path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0" />
      <path d="M3.5 9h17M3.5 15h17" />
      <path d="M12 3c2.6 2.7 3.8 5.7 3.8 9s-1.2 6.3-3.8 9c-2.6-2.7-3.8-5.7-3.8-9S9.4 5.7 12 3z" />
    </>
  ),
  sacola: (
    <>
      <path d="M5 8h14l-1.2 12.5H6.2z" />
      <path d="M9 10.5V7a3 3 0 0 1 6 0v3.5" />
    </>
  ),
  etiqueta: (
    <>
      <path d="M3 12.2V4h8.2l9.3 9.3-8.2 8.2z" />
      <path d="M7.6 7.6h.01" />
    </>
  ),
  caminhao: (
    <>
      <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" />
      <path d="M5.2 17.5a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0" />
      <path d="M15.2 17.5a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0" />
    </>
  ),
  video: (
    <>
      <path d="M4.5 6.5h9a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z" />
      <path d="M15.5 10.5l6-3.5v10l-6-3.5" />
    </>
  ),
  cartao: (
    <>
      <path d="M5 6h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
      <path d="M3 10h18M7 15h3" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
};

export function IconeDoLink({ icone, className }: { icone: Icone; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-5 w-5 flex-none", className)}
    >
      {DESENHOS[icone]}
    </svg>
  );
}

/** O quadradinho 40×40 da lista e dos atalhos (mockup): o verde do WhatsApp só no WhatsApp. */
export function QuadradoDoIcone({ icone, apagado = false }: { icone: Icone; apagado?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid h-10 w-10 flex-none place-items-center rounded-[10px]",
        icone === "whatsapp" ? "bg-zap text-paper-0" : "bg-canvas-100 text-volt-950",
        apagado && "opacity-55",
      )}
    >
      <IconeDoLink icone={icone} />
    </span>
  );
}
```

- [ ] **Step 4: Write `folha-de-link.tsx`**

```tsx
// apps/web/src/components/painel/link-da-bio/folha-de-link.tsx
"use client";

import { useEffect, useState, type InputHTMLAttributes } from "react";
import { AlertTriangle, ChevronLeft, Trash2 } from "lucide-react";

import { Folha } from "@/components/painel/folha";
import { Interruptor } from "@/components/painel/instagram/interruptor";
import type { Icone, LinkBio } from "@/lib/bio/documento";
import {
  ATALHOS,
  ICONES_DO_SELETOR,
  linkDoAtalho,
  primeiroCampoComErro,
  rascunhoDoLink,
  validarLink,
  type CampoDoLink,
  type ErrosDoLink,
  type IdDoAtalho,
} from "@/lib/bio/editor";
import type { CampanhaDoPainel } from "@/lib/bio/painel-api";
import { cn } from "@/lib/utils";

import { IconeDoLink, QuadradoDoIcone } from "./icone-do-link";
import { focarDepois } from "./use-editor-bio";

export type InicioDaFolha = { modo: "tipos" } | { modo: "editar"; link: LinkBio; erros?: ErrosDoLink };

export const idDoCampo = (campo: CampoDoLink) => `bio-link-${campo}`;
const ID_EXCLUIR = "bio-link-excluir";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";
const CAMPO =
  "min-h-11 w-full rounded-lg border border-line-200 bg-paper-0 px-3 py-2.5 text-[16px] leading-snug text-volt-950 aria-invalid:border-danger-700 focus-visible:outline-2 focus-visible:outline-cobalt-500";
const ROTULO = "text-15 font-semibold text-volt-950";
const AJUDA = "text-13 text-slate-600";
const ERRO = "text-13 font-medium text-danger-700";
const PRIMARIO = `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-cobalt-500 px-4 text-15 font-semibold text-paper-0 transition-colors hover:bg-cobalt-700 ${FOCO}`;
const SECUNDARIO = `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line-200 bg-paper-0 px-4 text-15 font-semibold text-volt-950 transition-colors hover:border-slate-600 ${FOCO}`;
const FANTASMA = `inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-15 font-semibold text-slate-600 transition-colors hover:text-volt-950 ${FOCO}`;
const PERIGO = `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-15 font-semibold text-danger-700 transition-colors hover:bg-canvas-100 ${FOCO}`;
const PERIGO_CHEIO = `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-danger-700 px-4 text-15 font-semibold text-paper-0 transition-[filter] hover:brightness-95 ${FOCO}`;

type ExtraDoCampo = Pick<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "inputMode" | "autoComplete" | "autoCapitalize" | "spellCheck" | "placeholder"
>;

function CampoDeTexto({
  campo,
  rotulo,
  valor,
  erro,
  ajuda,
  maxLength,
  multilinha = false,
  extra,
  outrasDescricoes,
  aoMudar,
}: {
  campo: CampoDoLink;
  rotulo: string;
  valor: string;
  erro?: string;
  ajuda?: string;
  maxLength: number;
  multilinha?: boolean;
  extra?: ExtraDoCampo;
  /** ids de textos que também descrevem o campo (o aviso do número conectado). */
  outrasDescricoes?: string;
  aoMudar: (campo: CampoDoLink, valor: string) => void;
}) {
  const id = idDoCampo(campo);
  const descricoes =
    [erro ? `${id}-erro` : null, ajuda ? `${id}-ajuda` : null, outrasDescricoes ?? null].filter(Boolean).join(" ") ||
    undefined;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className={ROTULO}>
        {rotulo}
      </label>
      {multilinha ? (
        <textarea
          id={id}
          value={valor}
          maxLength={maxLength}
          rows={3}
          aria-invalid={erro ? true : undefined}
          aria-describedby={descricoes}
          onChange={(e) => aoMudar(campo, e.target.value)}
          className={cn(CAMPO, "min-h-[84px] resize-y")}
        />
      ) : (
        <input
          type="text"
          {...extra}
          id={id}
          value={valor}
          maxLength={maxLength}
          aria-invalid={erro ? true : undefined}
          aria-describedby={descricoes}
          onChange={(e) => aoMudar(campo, e.target.value)}
          className={CAMPO}
        />
      )}
      {erro && (
        <p id={`${id}-erro`} className={ERRO}>
          {erro}
        </p>
      )}
      {ajuda && (
        <p id={`${id}-ajuda`} className={AJUDA}>
          {ajuda}
        </p>
      )}
    </div>
  );
}

function SeletorDeCampanha({
  valor,
  erro,
  campanhas,
  aoMudar,
}: {
  valor: string;
  erro?: string;
  campanhas: readonly CampanhaDoPainel[];
  aoMudar: (campo: CampoDoLink, valor: string) => void;
}) {
  const id = idDoCampo("campanhaId");
  const ajuda =
    campanhas.length === 0
      ? "Você ainda não tem campanha. Crie uma em Campanhas e volte aqui."
      : "O botão usa o link da campanha: quem toca entra no grupo que estiver com vaga.";
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className={ROTULO}>
        Campanha
      </label>
      <select
        id={id}
        value={valor}
        onChange={(e) => aoMudar("campanhaId", e.target.value)}
        aria-invalid={erro ? true : undefined}
        aria-describedby={[erro ? `${id}-erro` : null, `${id}-ajuda`].filter(Boolean).join(" ")}
        className={CAMPO}
      >
        <option value="">Escolha a campanha…</option>
        {campanhas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.slug === null ? `${c.nome} (sem link)` : c.nome}
          </option>
        ))}
      </select>
      {erro && (
        <p id={`${id}-erro`} className={ERRO}>
          {erro}
        </p>
      )}
      <p id={`${id}-ajuda`} className={AJUDA}>
        {ajuda}
      </p>
    </div>
  );
}

function SeletorDeIcone({ atual, aoIcone }: { atual: Icone; aoIcone: (icone: Icone) => void }) {
  return (
    <div className="grid gap-1.5">
      <span id="bio-link-icone" className={ROTULO}>
        Ícone
      </span>
      <div role="group" aria-labelledby="bio-link-icone" className="flex flex-wrap gap-2">
        {ICONES_DO_SELETOR.map(([icone, nome]) => (
          <button
            key={icone}
            type="button"
            aria-pressed={atual === icone}
            aria-label={nome}
            onClick={() => aoIcone(icone)}
            className={cn(
              "grid h-11 w-11 place-items-center rounded-lg border bg-paper-0 text-volt-950",
              FOCO,
              atual === icone ? "border-2 border-volt-950 bg-canvas-100" : "border-line-200",
            )}
          >
            <IconeDoLink icone={icone} />
          </button>
        ))}
      </div>
    </div>
  );
}

export type PropsDoConteudoDaFolha = {
  /** null = escolhendo o tipo (os 6 atalhos). */
  rascunho: LinkBio | null;
  novo: boolean;
  erros: ErrosDoLink;
  confirmando: boolean;
  campanhas: readonly CampanhaDoPainel[];
  aoEscolher: (atalho: IdDoAtalho) => void;
  aoVoltar: () => void;
  aoMudar: (campo: CampoDoLink, valor: string) => void;
  aoIcone: (icone: Icone) => void;
  aoDestaque: () => void;
  aoAplicar: () => void;
  aoCancelar: () => void;
  aoPedirExclusao: () => void;
  aoCancelarExclusao: () => void;
  aoExcluir: () => void;
};

function Tipos({ aoEscolher }: { aoEscolher: (atalho: IdDoAtalho) => void }) {
  return (
    <ul aria-label="Tipos de link" className="grid grid-cols-2 gap-2.5 pb-3 sm:grid-cols-3">
      {ATALHOS.map((a) => (
        <li key={a.id}>
          <button
            type="button"
            id={`bio-atalho-${a.id}`}
            onClick={() => aoEscolher(a.id)}
            className={`grid h-full min-h-[124px] w-full content-start gap-2 rounded-xl border border-line-200 bg-paper-0 p-3.5 text-left transition-colors hover:border-slate-600 ${FOCO}`}
          >
            <QuadradoDoIcone icone={a.icone} />
            <span className="text-15 font-semibold leading-snug text-volt-950">{a.nome}</span>
            <span className="text-13 leading-snug text-slate-600">{a.descricao}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Rodape(p: PropsDoConteudoDaFolha & { rascunho: LinkBio }) {
  return (
    <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t border-line-200 bg-paper-0 px-4 pb-1 pt-3">
      {p.confirmando ? (
        <>
          <p className="min-w-0 flex-[1_1_180px] text-15 font-semibold text-danger-700">
            {`Excluir “${p.rascunho.titulo}” da página?`}
          </p>
          {/* Pedir exclusão → foco no "Não" (§8). */}
          <button type="button" autoFocus onClick={p.aoCancelarExclusao} className={FANTASMA}>
            Não
          </button>
          <button type="button" onClick={p.aoExcluir} className={PERIGO_CHEIO}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Excluir
          </button>
        </>
      ) : (
        <>
          {!p.novo && (
            <button type="button" id={ID_EXCLUIR} onClick={p.aoPedirExclusao} className={PERIGO}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Excluir
            </button>
          )}
          <span className="ml-auto flex gap-2">
            <button type="button" onClick={p.aoCancelar} className={SECUNDARIO}>
              Cancelar
            </button>
            <button type="submit" className={PRIMARIO}>
              {p.novo ? "Adicionar" : "Pronto"}
            </button>
          </span>
        </>
      )}
    </div>
  );
}

function Formulario(p: PropsDoConteudoDaFolha & { rascunho: LinkBio }) {
  const r = p.rascunho;
  const e = p.erros;
  return (
    <form
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault();
        p.aoAplicar();
      }}
      className="grid gap-4"
    >
      {p.novo && (
        <button
          type="button"
          onClick={p.aoVoltar}
          aria-label="Voltar pros tipos de link"
          className={`-ml-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-lg px-2 text-15 font-semibold text-cobalt-500 hover:bg-canvas-100 ${FOCO}`}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Tipos de link
        </button>
      )}
      {e.geral && (
        <p role="alert" className={ERRO}>
          {e.geral}
        </p>
      )}
      <CampoDeTexto campo="titulo" rotulo="Texto do botão" valor={r.titulo} erro={e.titulo} maxLength={50} aoMudar={p.aoMudar} />
      <CampoDeTexto
        campo="sub"
        rotulo="Texto de apoio (opcional)"
        valor={r.sub}
        erro={e.sub}
        maxLength={80}
        ajuda="Uma linha embaixo do botão, explicando o que tem lá."
        aoMudar={p.aoMudar}
      />
      {r.tipo === "whatsapp" && (
        <>
          <CampoDeTexto
            campo="numero"
            rotulo="WhatsApp de atendimento, com DDD"
            valor={r.numero}
            erro={e.numero}
            maxLength={20}
            extra={{ type: "tel", inputMode: "tel", autoComplete: "off", placeholder: "62 99999-9999" }}
            outrasDescricoes="bio-link-numero-aviso"
            aoMudar={p.aoMudar}
          />
          <p id="bio-link-numero-aviso" className="flex items-start gap-2.5 rounded-lg bg-aviso-fundo px-3 py-2.5 text-13 text-warning-700">
            <AlertTriangle className="mt-px h-4 w-4 flex-none" aria-hidden="true" />
            <span>Use o número de quem atende os pedidos. Não use o número conectado na Girumo: é ele que posta nos grupos.</span>
          </p>
          <CampoDeTexto
            campo="mensagem"
            rotulo="Mensagem que já vai escrita"
            valor={r.mensagem}
            erro={e.mensagem}
            maxLength={300}
            multilinha
            ajuda="A pessoa só aperta enviar. Dá pra pôr um código, como (BIO), pra saber de onde veio."
            aoMudar={p.aoMudar}
          />
        </>
      )}
      {r.tipo === "grupo" && (
        <SeletorDeCampanha valor={r.campanhaId} erro={e.campanhaId} campanhas={p.campanhas} aoMudar={p.aoMudar} />
      )}
      {r.tipo === "link" && (
        <>
          <CampoDeTexto
            campo="url"
            rotulo="Endereço do link"
            valor={r.url}
            erro={e.url}
            maxLength={500}
            extra={{
              inputMode: "url",
              autoComplete: "off",
              autoCapitalize: "none",
              spellCheck: false,
              placeholder: r.icone === "canal" ? "whatsapp.com/channel/…" : "sualoja.com.br/catalogo",
            }}
            aoMudar={p.aoMudar}
          />
          <SeletorDeIcone atual={r.icone} aoIcone={p.aoIcone} />
        </>
      )}
      {r.tipo === "endereco" && (
        <>
          <CampoDeTexto
            campo="endereco"
            rotulo="Endereço da loja"
            valor={r.endereco}
            erro={e.endereco}
            maxLength={200}
            multilinha
            aoMudar={p.aoMudar}
          />
          <CampoDeTexto campo="horario" rotulo="Horário (opcional)" valor={r.horario} erro={e.horario} maxLength={120} aoMudar={p.aoMudar} />
          <p className={AJUDA}>Na página, o botão abre ali mesmo com o endereço, o horário e o botão do Google Maps.</p>
        </>
      )}
      {r.tipo !== "endereco" && (
        <div className="flex items-center gap-3">
          <div className="grid min-w-0 flex-1 gap-0.5">
            <span className={ROTULO}>Botão em destaque</span>
            <span className={AJUDA}>Fica maior e na cor de destaque. Só um por página.</span>
          </div>
          <Interruptor ligado={r.destaque} aoMudar={p.aoDestaque} rotulo="Botão em destaque" />
        </div>
      )}
      <Rodape {...p} />
    </form>
  );
}

/** O miolo da folha (mockup "Adicionar link"/"Editar link"): só desenha. */
export function ConteudoDaFolha(p: PropsDoConteudoDaFolha) {
  if (!p.rascunho) return <Tipos aoEscolher={p.aoEscolher} />;
  return <Formulario {...p} rascunho={p.rascunho} />;
}

/**
 * Folha de um link (spec §8): os 6 atalhos, o formulário do tipo, o erro embaixo do campo (some
 * ao corrigir) e "Excluir" com confirmação na própria folha. Monta aberta e desmonta ao fechar:
 * cada abertura começa limpa. `fundoFecha={false}`: tocar fora não apaga o que foi escrito.
 */
export function FolhaDeLink({
  inicio,
  campanhas,
  aoAplicar,
  aoExcluir,
  aoFechar,
}: {
  inicio: InicioDaFolha;
  campanhas: readonly CampanhaDoPainel[];
  aoAplicar: (link: LinkBio, novo: boolean) => void;
  aoExcluir: (id: string) => void;
  aoFechar: () => void;
}) {
  const [rascunho, setRascunho] = useState<LinkBio | null>(inicio.modo === "editar" ? rascunhoDoLink(inicio.link) : null);
  const [novo, setNovo] = useState(inicio.modo === "tipos");
  const [erros, setErros] = useState<ErrosDoLink>(inicio.modo === "editar" ? (inicio.erros ?? {}) : {});
  const [confirmando, setConfirmando] = useState(false);

  // Aberta por um erro do salvar: o foco vai pro campo do erro (depois de a Folha guardar quem a abriu).
  useEffect(() => {
    const campo = inicio.modo === "editar" && inicio.erros ? primeiroCampoComErro(inicio.erros) : null;
    if (campo) focarDepois(idDoCampo(campo));
  }, [inicio]);

  function escolher(atalho: IdDoAtalho) {
    setRascunho(linkDoAtalho(atalho, { id: crypto.randomUUID(), campanhas }));
    setNovo(true);
    setErros({});
    focarDepois(idDoCampo("titulo")); // escolher tipo → primeiro campo (§8)
  }

  function voltar() {
    setRascunho(null);
    setErros({});
    focarDepois("bio-atalho-whatsapp");
  }

  function mudar(campo: CampoDoLink, valor: string) {
    // O formulário só desenha os campos do tipo do rascunho, então `campo` sempre existe nele.
    setRascunho((r) => (r ? ({ ...r, [campo]: valor } as LinkBio) : r));
    // "O erro some ao corrigir" (§8).
    setErros((atual) => {
      const resto = { ...atual };
      delete resto[campo];
      return resto;
    });
  }

  function aplicar() {
    if (!rascunho) return;
    const r = validarLink(rascunho);
    if (r.ok) {
      aoAplicar(r.link, novo);
      return;
    }
    setErros(r.erros);
    const campo = primeiroCampoComErro(r.erros);
    if (campo) focarDepois(idDoCampo(campo));
  }

  const titulo = rascunho === null ? "Adicionar link" : novo ? "Novo link" : "Editar link";
  return (
    <Folha aberta aoFechar={aoFechar} titulo={titulo} testId="bio-folha-link" emQualquerLargura fundoFecha={false}>
      <ConteudoDaFolha
        rascunho={rascunho}
        novo={novo}
        erros={erros}
        confirmando={confirmando}
        campanhas={campanhas}
        aoEscolher={escolher}
        aoVoltar={voltar}
        aoMudar={mudar}
        aoIcone={(icone) => setRascunho((r) => (r ? { ...r, icone } : r))}
        aoDestaque={() => setRascunho((r) => (r && r.tipo !== "endereco" ? { ...r, destaque: !r.destaque } : r))}
        aoAplicar={aplicar}
        aoCancelar={aoFechar}
        aoPedirExclusao={() => setConfirmando(true)}
        aoCancelarExclusao={() => {
          setConfirmando(false);
          focarDepois(ID_EXCLUIR);
        }}
        aoExcluir={() => {
          if (inicio.modo === "editar") aoExcluir(inicio.link.id);
        }}
      />
    </Folha>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/link-da-bio/folha-de-link.test.ts`
Expected: PASS (8 testes). Se uma asserção de atributo falhar só pela ORDEM em que o React serializou, conferir o JSX contra a asserção e ajustar o JSX à ordem testada (a ordem das props) — nunca afrouxar a asserção para `[^>]*` dos dois lados do mesmo atributo.

- [ ] **Step 6: painel:check**

Run: `npm run painel:check`
Expected: `painel:check OK`.

- [ ] **Step 7: Commit**

```bash
git add src/components/painel/link-da-bio/icone-do-link.tsx src/components/painel/link-da-bio/folha-de-link.tsx src/components/painel/link-da-bio/folha-de-link.test.ts
git commit -m "feat(link-da-bio): add/edit link sheet with field errors and inline delete"
```

### Task 5: Aba Links e o registro das abas

**Files:**
- Create: `apps/web/src/components/painel/link-da-bio/aba-links.tsx`
- Create: `apps/web/src/components/painel/link-da-bio/abas.tsx`
- Test: `apps/web/src/components/painel/link-da-bio/aba-links.test.ts`

**Interfaces:**
- Consumes: Task 2 (`alternarLink`, `anuncioDaOrdem`, `avisoDoLink`, `comLink`, `contagemDosLinks`, `erroNoLink`, `MAX_LINKS`, `moverLink`, `resumoDoLink`, `semLink`, `ContextoDosAvisos`); Task 1 (`mesmoConteudo`, `ContextoDoEditor`, `ErroDeCampo`, `EstadoSalvavel`); Task 3 (`EditorBio`, `focarDepois`); Task 4 (`FolhaDeLink`, `InicioDaFolha`, `QuadradoDoIcone`); `Interruptor`; `useToast`; `type PaginaBio` (PR 2).
- Produces:
  - `aba-links.tsx`: `ID_ADICIONAR = "bio-adicionar-link"`, `type PropsDaLista` (abaixo), `ListaDeLinks(p: PropsDaLista): React.JSX.Element`, `AbaLinks(p: PropsDaAba): React.JSX.Element`
  - `abas.tsx`: `type IdDaAba = "links" | "aparencia" | "perfil" | "divulgar"`, `type PropsDaAba`, `type AbaDoEditor`, `ABAS: readonly AbaDoEditor[]`, `abaDoErro(erro: ErroDeCampo | null): AbaDoEditor | undefined`, `abaPelaTecla(atual: number, tecla: string, total: number): number | null`, `BarraDeAbas(p: { abas: readonly AbaDoEditor[]; atual: IdDaAba; aoEscolher: (id: IdDaAba) => void }): React.JSX.Element`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/components/painel/link-da-bio/aba-links.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { documentoPadrao, type LinkBio } from "@/lib/bio/documento";
import { estadoDe, type ContextoDoEditor, type ContextoDosAvisos } from "@/lib/bio/editor";
import type { CampanhaDoPainel } from "@/lib/bio/painel-api";
import type { PaginaBio } from "@/lib/stores/bio-pages";

import { AbaLinks, ListaDeLinks, type PropsDaLista } from "./aba-links";
import { ABAS, abaDoErro, abaPelaTecla, BarraDeAbas, type PropsDaAba } from "./abas";

const noop = () => {};
type Tipo<T extends LinkBio["tipo"]> = Extract<LinkBio, { tipo: T }>;

// Dados fictícios: nada da loja-piloto (repo público).
const ZAP: Tipo<"whatsapp"> = {
  id: "6f1c2b9e-0a1d-4c3e-9b2a-1d2e3f4a5b01",
  tipo: "whatsapp",
  titulo: "Falar com a vendedora",
  sub: "Pedido no WhatsApp",
  icone: "whatsapp",
  ativo: true,
  destaque: true,
  numero: "5562999990000",
  mensagem: "Oi! Vim pelo Instagram. (BIO)",
};
const GRUPO: Tipo<"grupo"> = {
  id: "6f1c2b9e-0a1d-4c3e-9b2a-1d2e3f4a5b02",
  tipo: "grupo",
  titulo: "Entrar no grupo VIP",
  sub: "",
  icone: "coroa",
  ativo: true,
  destaque: false,
  campanhaId: "0b7d6c5e-4f3a-4b2c-8d1e-0f9a8b7c6d01",
};
const SITE: Tipo<"link"> = {
  id: "6f1c2b9e-0a1d-4c3e-9b2a-1d2e3f4a5b03",
  tipo: "link",
  titulo: "Catálogo",
  sub: "Kits e preços",
  icone: "catalogo",
  ativo: false,
  destaque: false,
  url: "https://loja.exemplo.com.br/catalogo",
  fotos: [],
};
const LOJA: Tipo<"endereco"> = {
  id: "6f1c2b9e-0a1d-4c3e-9b2a-1d2e3f4a5b04",
  tipo: "endereco",
  titulo: "Como chegar",
  sub: "",
  icone: "mapa",
  ativo: true,
  endereco: "Rua Exemplo, 100\nCentro, Goiânia",
  horario: "",
  foto: null,
};
const CAMPANHAS: CampanhaDoPainel[] = [{ id: "0b7d6c5e-4f3a-4b2c-8d1e-0f9a8b7c6d01", nome: "VIP Atacado", slug: "vip-atacado" }];
const PAGINA: PaginaBio = {
  id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c01",
  tenantId: "tenant-exemplo",
  slug: "loja-exemplo",
  publicada: false,
  bloqueadaEm: null,
  documento: { ...documentoPadrao({ nome: "Loja Exemplo", campanhaId: null }), links: [ZAP, GRUPO, SITE, LOJA] },
  versao: 3,
  updatedAt: "2026-10-19T12:00:00.000Z",
};
const CONTEXTO: ContextoDoEditor = {
  campanhas: CAMPANHAS,
  dominio: null,
  origemGirumo: "https://www.girumo.com.br",
  sugestaoSlug: "loja-exemplo",
  linksEscondidos: [],
};
const CTX: ContextoDosAvisos = { campanhas: CAMPANHAS, linksEscondidos: [], salvos: PAGINA.documento.links };

function lista(over: Partial<PropsDaLista> = {}): string {
  const props: PropsDaLista = {
    links: PAGINA.documento.links,
    ctx: CTX,
    reordenando: false,
    movido: null,
    aoEditar: noop,
    aoAlternar: noop,
    aoMover: noop,
    ...over,
  };
  return renderToStaticMarkup(createElement(ListaDeLinks, props));
}

test("linhas na ordem da página; editar e mostrar nomeados pelo título; chips de destaque e escondido", () => {
  const h = lista();
  const posicoes = ["Falar com a vendedora", "Entrar no grupo VIP", "Catálogo", "Como chegar"].map((t) =>
    h.indexOf(`aria-label="Editar o link ${t}"`),
  );
  assert.ok(posicoes.every((p, i) => p > -1 && (i === 0 || p > posicoes[i - 1])), String(posicoes));
  assert.match(h, /<ul aria-label="Links, na ordem em que aparecem na página"/);
  assert.match(h, /role="switch" aria-checked="true" aria-label="Mostrar na página: Falar com a vendedora"/);
  assert.match(h, /role="switch" aria-checked="false" aria-label="Mostrar na página: Catálogo"/);
  assert.match(h, /Falar com a vendedora<span class="pn-chip">Destaque<\/span>/);
  assert.match(h, /Catálogo<span class="pn-chip">Escondido<\/span>/);
  assert.match(h, />WhatsApp · \+55 62 99999-0000</);
  assert.match(h, />Grupo VIP · VIP Atacado</);
  assert.match(h, />Rua Exemplo, 100</);
});

test("link escondido pela API: aviso vermelho ligado ao botão de editar daquele link", () => {
  const h = lista({ ctx: { ...CTX, linksEscondidos: [ZAP.id] } });
  assert.match(h, new RegExp(`aria-label="Editar o link Falar com a vendedora" aria-describedby="bio-link-${ZAP.id}-aviso"`));
  assert.match(h, new RegExp(`<p id="bio-link-${ZAP.id}-aviso"[^>]*>.*Este é o número conectado na Girumo`, "s"));
  assert.doesNotMatch(h, new RegExp(`bio-link-${GRUPO.id}-aviso`));
});

test("Reordenar troca os interruptores por Subir e Descer; na ponta o botão fica desligado", () => {
  const h = lista({ reordenando: true });
  assert.doesNotMatch(h, /role="switch"/);
  assert.match(h, new RegExp(`id="bio-subir-${ZAP.id}" aria-label="Subir Falar com a vendedora" disabled=""`));
  assert.match(h, new RegExp(`id="bio-descer-${LOJA.id}" aria-label="Descer Como chegar" disabled=""`));
  assert.match(h, new RegExp(`id="bio-subir-${GRUPO.id}" aria-label="Subir Entrar no grupo VIP" class=`));
  assert.match(h, new RegExp(`id="bio-descer-${ZAP.id}" aria-label="Descer Falar com a vendedora" class=`));
});

test("sem link: diz como começar", () => {
  assert.match(lista({ links: [] }), /Nenhum link ainda\. Toque em Adicionar link pra começar\./);
});

test("cartão Links: contagem, Reordenar com dois ou mais, Adicionar link com o id do foco, dica e região anunciada", () => {
  const props: PropsDaAba = {
    pagina: PAGINA,
    rascunho: estadoDe(PAGINA),
    contexto: CONTEXTO,
    mudarDocumento: noop,
    mudarPagina: noop,
    reverAnimacao: noop,
    erro: null,
    limparErro: noop,
  };
  const h = renderToStaticMarkup(createElement(AbaLinks, props));
  assert.match(h, /<h2 id="bio-links-titulo"[^>]*>Links<\/h2>/);
  assert.match(h, />4 links · 3 aparecendo na página</);
  assert.match(h, />Reordenar</);
  assert.match(h, /id="bio-adicionar-link" aria-haspopup="dialog"/);
  assert.match(h, /Desligado, o link some da página mas fica guardado aqui\. Só um link fica em destaque\./);
  assert.match(h, /<p aria-live="polite" class="sr-only"><\/p>/);
  const um = renderToStaticMarkup(
    createElement(AbaLinks, { ...props, rascunho: { ...estadoDe(PAGINA), documento: { ...PAGINA.documento, links: [LOJA] } } }),
  );
  assert.doesNotMatch(um, />Reordenar</);
});

test("abas: a seta anda em roda, Home e End vão às pontas, o resto não mexe", () => {
  assert.equal(abaPelaTecla(0, "ArrowRight", 4), 1);
  assert.equal(abaPelaTecla(3, "ArrowRight", 4), 0);
  assert.equal(abaPelaTecla(0, "ArrowLeft", 4), 3);
  assert.equal(abaPelaTecla(2, "Home", 4), 0);
  assert.equal(abaPelaTecla(1, "End", 4), 3);
  assert.equal(abaPelaTecla(1, "Enter", 4), null);
  assert.equal(abaPelaTecla(0, "ArrowRight", 1), 0);
});

test("barra de abas WAI-ARIA e dona do erro: tablist nomeado, painel controlado, tabindex móvel", () => {
  const abas = [ABAS[0], { ...ABAS[0], id: "perfil" as const, nome: "Perfil" }];
  const h = renderToStaticMarkup(createElement(BarraDeAbas, { abas, atual: "links", aoEscolher: noop }));
  assert.match(h, /role="tablist" aria-label="Partes da página"/);
  assert.match(h, /role="tab" id="bio-aba-links" aria-selected="true" aria-controls="bio-painel-links" tabindex="0"/);
  assert.match(h, /role="tab" id="bio-aba-perfil" aria-selected="false" aria-controls="bio-painel-perfil" tabindex="-1"/);
  assert.equal(ABAS[0].dona("links.2.numero"), true);
  assert.equal(ABAS[0].dona("links"), true);
  assert.equal(ABAS[0].dona("perfil.nome"), false);
  assert.equal(abaDoErro({ campo: "links.0.url", mensagem: "x" })?.id, "links");
  assert.equal(abaDoErro({ campo: "slug", mensagem: "x" }), undefined);
  assert.equal(abaDoErro(null), undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/link-da-bio/aba-links.test.ts`
Expected: FAIL — `Cannot find module './aba-links'`.

- [ ] **Step 3: Write `aba-links.tsx`**

```tsx
// apps/web/src/components/painel/link-da-bio/aba-links.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Eye, Plus } from "lucide-react";

import { Interruptor } from "@/components/painel/instagram/interruptor";
import { useToast } from "@/components/toast";
import type { LinkBio } from "@/lib/bio/documento";
import {
  alternarLink,
  anuncioDaOrdem,
  avisoDoLink,
  comLink,
  contagemDosLinks,
  erroNoLink,
  MAX_LINKS,
  mesmoConteudo,
  moverLink,
  resumoDoLink,
  semLink,
  type ContextoDosAvisos,
} from "@/lib/bio/editor";
import { cn } from "@/lib/utils";

import type { PropsDaAba } from "./abas";
import { FolhaDeLink, type InicioDaFolha } from "./folha-de-link";
import { QuadradoDoIcone } from "./icone-do-link";
import { focarDepois } from "./use-editor-bio";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";
const PRIMARIO = `inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-cobalt-500 px-4 text-15 font-semibold text-paper-0 transition-colors hover:bg-cobalt-700 ${FOCO}`;
const SECUNDARIO = `inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-line-200 bg-paper-0 px-4 text-15 font-semibold text-volt-950 transition-colors hover:border-slate-600 ${FOCO}`;
const ORDEM = `grid h-11 w-11 flex-none place-items-center rounded-lg border border-line-200 bg-paper-0 text-volt-950 disabled:cursor-not-allowed disabled:opacity-30 ${FOCO}`;

/** Destino do foco depois de excluir (a linha some junto com o botão que abriu a folha). */
export const ID_ADICIONAR = "bio-adicionar-link";
const idDaOrdem = (id: string, botao: "subir" | "descer") => `bio-${botao}-${id}`;

export type PropsDaLista = {
  links: readonly LinkBio[];
  ctx: ContextoDosAvisos;
  reordenando: boolean;
  /** Link que acabou de mudar de lugar ou de entrar: a linha pisca. */
  movido: string | null;
  aoEditar: (link: LinkBio) => void;
  aoAlternar: (link: LinkBio) => void;
  aoMover: (link: LinkBio, passo: -1 | 1) => void;
};

/** A lista na ordem da página (`key=id`): cada linha edita; o interruptor liga e desliga; em Reordenar, Subir/Descer. */
export function ListaDeLinks({ links, ctx, reordenando, movido, aoEditar, aoAlternar, aoMover }: PropsDaLista) {
  if (links.length === 0) {
    return <p className="px-4 py-6 text-15 text-slate-600">Nenhum link ainda. Toque em Adicionar link pra começar.</p>;
  }
  return (
    <ul aria-label="Links, na ordem em que aparecem na página">
      {links.map((link, i) => {
        const aviso = avisoDoLink(link, ctx);
        const idDoAviso = `bio-link-${link.id}-aviso`;
        return (
          <li
            key={link.id}
            className={cn(
              "border-b border-line-200 px-1.5 py-1 transition-colors duration-700 last:border-b-0",
              movido === link.id && "bg-cobalt-soft duration-0",
            )}
          >
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => aoEditar(link)}
                aria-label={`Editar o link ${link.titulo}`}
                aria-describedby={aviso ? idDoAviso : undefined}
                aria-haspopup="dialog"
                className={`flex min-h-[60px] min-w-0 flex-1 items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-hover-ficha ${FOCO}`}
              >
                <QuadradoDoIcone icone={link.icone} apagado={!link.ativo} />
                <span className="grid min-w-0 gap-px">
                  <span
                    className={cn(
                      "flex flex-wrap items-center gap-x-2 gap-y-1 text-15 font-semibold leading-snug",
                      link.ativo ? "text-volt-950" : "text-slate-600",
                    )}
                  >
                    {link.titulo}
                    {link.tipo !== "endereco" && link.destaque && link.ativo && <span className="pn-chip">Destaque</span>}
                    {!link.ativo && <span className="pn-chip">Escondido</span>}
                  </span>
                  <span className="truncate text-13 text-slate-600">{resumoDoLink(link, ctx.campanhas)}</span>
                </span>
              </button>
              {reordenando ? (
                <span className="flex gap-1.5">
                  <button
                    type="button"
                    id={idDaOrdem(link.id, "subir")}
                    aria-label={`Subir ${link.titulo}`}
                    disabled={i === 0}
                    onClick={() => aoMover(link, -1)}
                    className={ORDEM}
                  >
                    <ArrowUp className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    id={idDaOrdem(link.id, "descer")}
                    aria-label={`Descer ${link.titulo}`}
                    disabled={i === links.length - 1}
                    onClick={() => aoMover(link, 1)}
                    className={ORDEM}
                  >
                    <ArrowDown className="h-5 w-5" aria-hidden="true" />
                  </button>
                </span>
              ) : (
                <Interruptor ligado={link.ativo} aoMudar={() => aoAlternar(link)} rotulo={`Mostrar na página: ${link.titulo}`} />
              )}
            </div>
            {aviso && (
              <p id={idDoAviso} className="flex items-start gap-1.5 pb-2 pl-[62px] pr-2 text-13 font-medium text-danger-700">
                <AlertTriangle className="mt-px h-4 w-4 flex-none" aria-hidden="true" />
                {aviso}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Aba Links (spec §8): a lista, Reordenar, Adicionar link e a folha de cada link. */
export function AbaLinks({ pagina, rascunho, contexto, mudarDocumento, reverAnimacao, erro, limparErro }: PropsDaAba) {
  const toast = useToast();
  const links = rascunho.documento.links;
  const [reordenando, setReordenando] = useState(false);
  const [folha, setFolha] = useState<InicioDaFolha | null>(null);
  const [movido, setMovido] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState("");
  const [erroDaLista, setErroDaLista] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ordenando = reordenando && links.length > 1;
  const ctx: ContextoDosAvisos = {
    campanhas: contexto.campanhas,
    linksEscondidos: contexto.linksEscondidos,
    salvos: pagina.documento.links,
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // Erro do salvar num link (§8, "salvar com erro → primeiro campo com erro"): a folha abre nele, com o erro no campo.
  useEffect(() => {
    if (!erro) return;
    const alvo = erroNoLink(erro);
    const link: LinkBio | undefined = alvo ? links[alvo.indice] : undefined;
    if (alvo && link) setFolha({ modo: "editar", link, erros: alvo.erros });
    else setErroDaLista(erro.mensagem);
    limparErro();
  }, [erro, links, limparErro]);

  function piscar(id: string) {
    setMovido(id);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMovido(null), 900);
  }

  function aplicar(link: LinkBio, novo: boolean) {
    const antes = links.find((l) => l.id === link.id);
    setFolha(null);
    setErroDaLista(null);
    // "Pronto" sem mudar nada: só fecha (sem toast pedindo um Salvar que nem aparece).
    if (antes && mesmoConteudo(antes, link)) return;
    mudarDocumento((d) => ({ ...d, links: comLink(d.links, link) }));
    if (novo) reverAnimacao(); // link novo: a prévia toca a entrada (§8)
    piscar(link.id);
    toast(novo ? "Link adicionado. Toque em Salvar pra valer na página." : "Link alterado. Toque em Salvar pra valer na página.");
  }

  function excluir(id: string) {
    const titulo = links.find((l) => l.id === id)?.titulo ?? "";
    mudarDocumento((d) => ({ ...d, links: semLink(d.links, id) }));
    setFolha(null);
    setErroDaLista(null);
    toast(`“${titulo}” foi excluído. Toque em Salvar pra valer na página.`);
    focarDepois(ID_ADICIONAR); // excluir → "Adicionar link" (§8)
  }

  function alternar(link: LinkBio) {
    mudarDocumento((d) => ({ ...d, links: alternarLink(d.links, link.id) }));
    toast(link.ativo ? `“${link.titulo}” saiu da página. Fica guardado aqui.` : `“${link.titulo}” voltou pra página.`);
  }

  function mover(link: LinkBio, passo: -1 | 1) {
    const destino = links.findIndex((l) => l.id === link.id) + passo;
    if (destino < 0 || destino >= links.length) return;
    mudarDocumento((d) => ({ ...d, links: moverLink(d.links, link.id, passo) }));
    piscar(link.id);
    setAnuncio(anuncioDaOrdem(link.titulo, destino + 1, links.length));
    // A linha troca de lugar no DOM e perde o foco; na ponta, o botão apertado desliga: o foco vai pro outro (§8).
    const naPonta = (passo === -1 && destino === 0) || (passo === 1 && destino === links.length - 1);
    const botao = naPonta ? (passo === -1 ? "descer" : "subir") : passo === -1 ? "subir" : "descer";
    focarDepois(idDaOrdem(link.id, botao));
  }

  function adicionar() {
    if (links.length >= MAX_LINKS) {
      toast(`A página aceita até ${MAX_LINKS} links. Exclua um pra pôr outro.`, "error");
      return;
    }
    setFolha({ modo: "tipos" });
  }

  return (
    <>
      <section aria-labelledby="bio-links-titulo" className="pn-card rounded-xl">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-line-200 px-3 py-3 lg:px-4 lg:py-3.5">
          <div className="min-w-0 flex-[1_1_220px]">
            <h2 id="bio-links-titulo" className="font-brand text-15 font-bold text-volt-950">
              Links
            </h2>
            <p className="mt-0.5 text-13 text-slate-600">{contagemDosLinks(links, ctx)}</p>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            {links.length > 1 && (
              <button
                type="button"
                onClick={() => setReordenando((r) => !r)}
                className={cn(
                  SECUNDARIO,
                  "flex-1 sm:flex-none",
                  ordenando && "border-volt-950 bg-volt-950 text-paper-0 hover:border-volt-950",
                )}
              >
                {ordenando ? "Pronto" : "Reordenar"}
              </button>
            )}
            <button type="button" id={ID_ADICIONAR} aria-haspopup="dialog" onClick={adicionar} className={cn(PRIMARIO, "flex-1 sm:flex-none")}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Adicionar link
            </button>
          </div>
        </div>
        {erroDaLista && (
          <p role="alert" className="px-4 pt-3 text-13 font-medium text-danger-700">
            {erroDaLista}
          </p>
        )}
        <ListaDeLinks
          links={links}
          ctx={ctx}
          reordenando={ordenando}
          movido={movido}
          aoEditar={(link) => setFolha({ modo: "editar", link })}
          aoAlternar={alternar}
          aoMover={mover}
        />
      </section>
      <p className="mt-3 flex items-start gap-2 text-13 text-slate-600">
        <Eye className="mt-px h-4 w-4 flex-none" aria-hidden="true" />
        Desligado, o link some da página mas fica guardado aqui. Só um link fica em destaque.
      </p>
      {/* Subir/Descer anunciam a posição nova (§8, §11). */}
      <p aria-live="polite" className="sr-only">
        {anuncio}
      </p>
      {folha && (
        <FolhaDeLink
          inicio={folha}
          campanhas={contexto.campanhas}
          aoAplicar={aplicar}
          aoExcluir={excluir}
          aoFechar={() => setFolha(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 4: Write `abas.tsx`**

```tsx
// apps/web/src/components/painel/link-da-bio/abas.tsx
"use client";

import type { ComponentType, KeyboardEvent } from "react";

import type { ContextoDoEditor, ErroDeCampo, EstadoSalvavel } from "@/lib/bio/editor";
import type { PaginaBio } from "@/lib/stores/bio-pages";
import { cn } from "@/lib/utils";

import { AbaLinks } from "./aba-links";
import type { EditorBio } from "./use-editor-bio";

export type IdDaAba = "links" | "aparencia" | "perfil" | "divulgar";

/**
 * O que cada aba recebe do editor. A aba só desenha e chama estas funções; quem guarda o estado é
 * `useEditorBio`. O documento muda sempre por função (`mudarDocumento(d => …)`): duas mudanças no
 * mesmo clique não se atropelam.
 */
export type PropsDaAba = {
  /** A versão salva (a do servidor). */
  pagina: PaginaBio;
  /** O que está na tela, ainda sem salvar. */
  rascunho: EstadoSalvavel;
  /** O resto do GET: campanhas, domínio, origem Girumo, sugestão de slug, links escondidos pela API. */
  contexto: ContextoDoEditor;
  mudarDocumento: EditorBio["mudarDocumento"];
  /** Slug e publicada do rascunho (aba Divulgar, 6b). */
  mudarPagina: EditorBio["mudarPagina"];
  /** A prévia toca a entrada de novo: link novo, troca de modelo, "Rever a animação". */
  reverAnimacao: () => void;
  /** Erro de campo do salvar que é DESTA aba (`dona`); null nas outras. */
  erro: ErroDeCampo | null;
  /** A aba já mostrou (ou guardou) o erro: ele sai do editor. */
  limparErro: () => void;
};

export type AbaDoEditor = {
  id: IdDaAba;
  nome: string;
  /** Esta aba mostra o campo? (`campo` = caminho do zod: "links.2.numero", "perfil.nome", "slug"). */
  dona: (campo: string) => boolean;
  Conteudo: ComponentType<PropsDaAba>;
};

/** As abas do editor, na ordem da tela (§8: Links · Aparência · Perfil · Divulgar). O 6b acrescenta as três aqui. */
export const ABAS: readonly AbaDoEditor[] = [
  { id: "links", nome: "Links", dona: (campo) => campo === "links" || campo.startsWith("links."), Conteudo: AbaLinks },
];

/** A aba que mostra o campo do erro, se alguma mostra. */
export function abaDoErro(erro: ErroDeCampo | null): AbaDoEditor | undefined {
  return erro ? ABAS.find((aba) => aba.dona(erro.campo)) : undefined;
}

/** Tecla na barra de abas (WAI-ARIA): setas andam em roda, Home e End vão às pontas. */
export function abaPelaTecla(atual: number, tecla: string, total: number): number | null {
  if (tecla === "ArrowRight") return (atual + 1) % total;
  if (tecla === "ArrowLeft") return (atual - 1 + total) % total;
  if (tecla === "Home") return 0;
  if (tecla === "End") return total - 1;
  return null;
}

/** Barra de abas com tabindex móvel: a seta escolhe e leva o foco (ativação automática). */
export function BarraDeAbas({
  abas,
  atual,
  aoEscolher,
}: {
  abas: readonly AbaDoEditor[];
  atual: IdDaAba;
  aoEscolher: (id: IdDaAba) => void;
}) {
  function aoTeclar(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const destino = abaPelaTecla(i, e.key, abas.length);
    if (destino === null) return;
    e.preventDefault();
    const id = abas[destino].id;
    aoEscolher(id);
    document.getElementById(`bio-aba-${id}`)?.focus();
  }

  return (
    <div role="tablist" aria-label="Partes da página" className="flex border-b border-line-200 lg:gap-6">
      {abas.map((aba, i) => {
        const ativa = aba.id === atual;
        return (
          <button
            key={aba.id}
            type="button"
            role="tab"
            id={`bio-aba-${aba.id}`}
            aria-selected={ativa}
            aria-controls={`bio-painel-${aba.id}`}
            tabIndex={ativa ? 0 : -1}
            onClick={() => aoEscolher(aba.id)}
            onKeyDown={(e) => aoTeclar(e, i)}
            className={cn(
              "relative min-h-12 flex-1 px-0.5 text-center font-brand text-[14px] font-bold focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cobalt-500 lg:flex-none lg:text-15",
              ativa
                ? "text-volt-950 after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-volt-950"
                : "text-slate-600 hover:text-volt-950",
            )}
          >
            {aba.nome}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/link-da-bio/aba-links.test.ts src/components/painel/link-da-bio/folha-de-link.test.ts`
Expected: PASS (7 + 8 testes).

- [ ] **Step 6: Lint**

Run: `npm run painel:check` e `npx eslint src/components/painel/link-da-bio`
Expected: `painel:check OK`; eslint sem erro nem aviso.

- [ ] **Step 7: Commit**

```bash
git add src/components/painel/link-da-bio/aba-links.tsx src/components/painel/link-da-bio/abas.tsx src/components/painel/link-da-bio/aba-links.test.ts
git commit -m "feat(link-da-bio): links tab with toggle, reorder and tab registry"
```

### Task 6: A tela, a rota, a borda do interruptor e o smoke

**Files:**
- Create: `apps/web/src/components/painel/link-da-bio/editor.tsx`
- Create: `apps/web/src/app/painel/link-da-bio/page.tsx`
- Modify: `apps/web/src/app/painel-vitrine.css` (bloco do interruptor, dentro de `@layer components`)
- Modify: `apps/web/e2e/conteudo-esperado.ts` (entrada nova, antes de `"/painel/pages": {`)
- Test: `apps/web/src/components/painel/link-da-bio/editor.test.ts`

**Interfaces:**
- Consumes: Task 1 (`enderecoPrincipal`); Task 3 (`EditorBio`, `useEditorBio`); Task 5 (`ABAS`, `abaDoErro`, `BarraDeAbas`, `IdDaAba`); `ErroDeCarga` (`@/components/painel/erro-de-carga`, props `titulo`, `aoTentarDeNovo`); `useToast`; `type PaginaBio` (PR 2).
- Produces: `EditorDoLinkDaBio(): React.JSX.Element`, `TelaDoEditor(p: { editor: EditorBio; aba: IdDaAba; aoEscolherAba: (aba: IdDaAba) => void; aoCopiar: (url: string) => void }): React.JSX.Element`; classes CSS `.pn-bio` (raiz da tela) e `.pn-bio-salvar` (barra de salvar do celular).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/components/painel/link-da-bio/editor.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { documentoPadrao, type LinkBio } from "@/lib/bio/documento";
import { estadoDe, type ContextoDoEditor } from "@/lib/bio/editor";
import type { PaginaBio } from "@/lib/stores/bio-pages";

import { TelaDoEditor } from "./editor";
import type { EditorBio } from "./use-editor-bio";

const noop = () => {};

// Dados fictícios: nada da loja-piloto (repo público).
const ZAP: LinkBio = {
  id: "6f1c2b9e-0a1d-4c3e-9b2a-1d2e3f4a5b01",
  tipo: "whatsapp",
  titulo: "Falar com a vendedora",
  sub: "Pedido no WhatsApp",
  icone: "whatsapp",
  ativo: true,
  destaque: true,
  numero: "5562999990000",
  mensagem: "Oi! Vim pelo Instagram. (BIO)",
};
const PAGINA: PaginaBio = {
  id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c01",
  tenantId: "tenant-exemplo",
  slug: "loja-exemplo",
  publicada: false,
  bloqueadaEm: null,
  documento: { ...documentoPadrao({ nome: "Loja Exemplo", campanhaId: null }), links: [ZAP] },
  versao: 3,
  updatedAt: "2026-10-19T12:00:00.000Z",
};
const CONTEXTO: ContextoDoEditor = {
  campanhas: [],
  dominio: null,
  origemGirumo: "https://www.girumo.com.br",
  sugestaoSlug: "loja-exemplo",
  linksEscondidos: [],
};

function editor(over: Partial<EditorBio> = {}): EditorBio {
  return {
    carga: "ok",
    contexto: CONTEXTO,
    pagina: PAGINA,
    rascunho: estadoDe(PAGINA),
    sujo: false,
    salvando: false,
    criando: false,
    conflito: null,
    aviso: null,
    erro: null,
    rodada: 0,
    carregar: noop,
    criar: noop,
    salvar: noop,
    descartar: noop,
    mudarDocumento: noop,
    mudarPagina: noop,
    reverAnimacao: noop,
    limparErro: noop,
    ...over,
  };
}

function html(over: Partial<EditorBio> = {}): string {
  return renderToStaticMarkup(createElement(TelaDoEditor, { editor: editor(over), aba: "links", aoEscolherAba: noop, aoCopiar: noop }));
}

test("carregando: esqueleto anunciado, sem endereço nem abas", () => {
  const h = html({ carga: "carregando", pagina: null, rascunho: null, contexto: null });
  assert.match(h, /<h1[^>]*>Link da bio<\/h1>/);
  assert.match(h, /role="status"[^>]*><span class="sr-only">Carregando o link da bio…<\/span>/);
  assert.doesNotMatch(h, /role="tablist"/);
});

test("erro na carga: diz o que não veio e oferece tentar de novo", () => {
  const h = html({ carga: "erro", pagina: null, rascunho: null, contexto: null });
  assert.match(h, /Não deu para carregar o link da bio\./);
  assert.match(h, />Tentar de novo</);
});

test("loja sem página: estado vazio com Criar minha página; criando trava o botão", () => {
  const h = html({ pagina: null, rascunho: null });
  assert.match(h, /<h2 id="bio-vazio-titulo"[^>]*>Monte o link da bio da loja<\/h2>/);
  assert.match(h, /<button type="button"[^>]*>Criar minha página<\/button>/);
  assert.doesNotMatch(h, /role="tablist"/);
  assert.match(html({ pagina: null, rascunho: null, criando: true }), /<button type="button" disabled=""[^>]*>Criando…<\/button>/);
});

test("com página: endereço Girumo com o slug SALVO, Copiar e Abrir, Fora do ar, Salvar desligado sem mudança", () => {
  const h = html({ rascunho: { ...estadoDe(PAGINA), slug: "outro-slug" } });
  assert.match(h, /Link da bio<span class="pn-chip">Fora do ar<\/span>/);
  assert.match(h, /https:\/\/www\.girumo\.com\.br\/bio\/loja-exemplo/);
  assert.doesNotMatch(h, /outro-slug/);
  assert.match(h, /aria-label="Copiar o endereço da página"/);
  assert.match(
    h,
    /<a href="https:\/\/www\.girumo\.com\.br\/bio\/loja-exemplo" target="_blank" rel="noopener noreferrer" aria-label="Abrir a página numa aba nova"/,
  );
  assert.match(h, /<button type="button" disabled=""[^>]*>Salvar<\/button>/);
  assert.doesNotMatch(h, /Alterações não salvas/);
});

test("domínio próprio ativo: o endereço principal é a raiz dele", () => {
  const h = html({ contexto: { ...CONTEXTO, dominio: "links.loja.com.br" } });
  assert.match(h, /https:\/\/links\.loja\.com\.br\//);
  assert.match(h, />Domínio próprio</);
});

test("No ar só publicada e sem bloqueio; bloqueada avisa", () => {
  assert.match(html({ pagina: { ...PAGINA, publicada: true } }), /Link da bio<span class="pn-chip[^"]*">No ar<\/span>/);
  const bloqueada = html({ pagina: { ...PAGINA, publicada: true, bloqueadaEm: "2026-10-19T12:00:00.000Z" } });
  assert.match(bloqueada, />Fora do ar</);
  assert.match(bloqueada, /A Girumo tirou esta página do ar/);
});

test("alterações não salvas: Descartar e Salvar no cabeçalho e na barra do celular; salvando troca o rótulo", () => {
  const h = html({ sujo: true });
  assert.equal(h.match(/Alterações não salvas/g)?.length, 2);
  assert.match(h, /role="region" aria-label="Salvar alterações" class="pn-bio-salvar /);
  assert.equal(h.match(/>Descartar</g)?.length, 2);
  assert.doesNotMatch(h, /disabled=""[^>]*>Salvar</);
  assert.equal(html({ sujo: true, salvando: true }).match(/>Salvando…</g)?.length, 2);
});

test("409 vira aviso com Recarregar; falha e erro de campo sem aba dona viram aviso; erro de link fica com a aba", () => {
  assert.match(
    html({ conflito: "Outra pessoa salvou antes. Recarregue pra ver a versão nova." }),
    /role="alert"[^>]*>.*Outra pessoa salvou antes\. Recarregue pra ver a versão nova\..*>Recarregar</s,
  );
  assert.match(html({ aviso: "Sem permissão para esta ação." }), /role="alert"[^>]*>Sem permissão para esta ação\.</);
  assert.match(
    html({ erro: { campo: "slug", mensagem: "Esse endereço já é de outra loja." } }),
    /role="alert"[^>]*>Esse endereço já é de outra loja\.</,
  );
  assert.doesNotMatch(html({ erro: { campo: "links.0.numero", mensagem: "Número conectado." } }), /Número conectado\./);
});

test("abas: Links selecionada, com o painel ligado a ela", () => {
  const h = html();
  assert.match(h, /role="tablist" aria-label="Partes da página"/);
  assert.match(h, /role="tabpanel" id="bio-painel-links" aria-labelledby="bio-aba-links"/);
  assert.match(h, /<section aria-label="Editar a página"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/link-da-bio/editor.test.ts`
Expected: FAIL — `Cannot find module './editor'`.

- [ ] **Step 3: Write `editor.tsx`**

```tsx
// apps/web/src/components/painel/link-da-bio/editor.tsx
"use client";

import { useEffect, useState } from "react";
import { Copy, ExternalLink, Globe } from "lucide-react";

import { ErroDeCarga } from "@/components/painel/erro-de-carga";
import { useToast } from "@/components/toast";
import { enderecoPrincipal } from "@/lib/bio/editor";
import type { PaginaBio } from "@/lib/stores/bio-pages";
import { cn } from "@/lib/utils";

import { ABAS, abaDoErro, BarraDeAbas, type IdDaAba } from "./abas";
import { useEditorBio, type EditorBio } from "./use-editor-bio";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";
const PRIMARIO = `inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-cobalt-500 px-4 text-15 font-semibold text-paper-0 transition-colors hover:bg-cobalt-700 disabled:cursor-not-allowed disabled:opacity-45 ${FOCO}`;
const SECUNDARIO = `inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-line-200 bg-paper-0 px-4 text-15 font-semibold text-volt-950 transition-colors hover:border-slate-600 ${FOCO}`;
const FANTASMA = `inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg px-3 text-15 font-semibold text-slate-600 transition-colors hover:text-volt-950 ${FOCO}`;
const AVISO = "pn-aviso mt-4 rounded-[var(--radius-control)]";

/** Link da bio no painel (spec 2026-10-19-link-da-bio §8): liga o estado (`useEditorBio`) à tela. */
export function EditorDoLinkDaBio() {
  const editor = useEditorBio();
  const toast = useToast();
  const [aba, setAba] = useState<IdDaAba>("links");

  // Erro de campo no salvar: a tela vai para a aba que mostra o campo (é ela que mostra e foca).
  const dona = abaDoErro(editor.erro);
  useEffect(() => {
    if (dona) setAba(dona.id);
  }, [dona]);

  async function copiar(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast("Endereço copiado. Agora é só colar na bio.");
    } catch {
      toast("Não deu pra copiar. Selecione o endereço e copie à mão.", "error");
    }
  }

  return <TelaDoEditor editor={editor} aba={aba} aoEscolherAba={setAba} aoCopiar={(url) => void copiar(url)} />;
}

function ChipDeEstado({ pagina }: { pagina: PaginaBio }) {
  const noAr = pagina.publicada && !pagina.bloqueadaEm;
  return <span className={cn("pn-chip", noAr && "bg-success-700/10 text-success-700")}>{noAr ? "No ar" : "Fora do ar"}</span>;
}

function Pendente({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-13 text-slate-600", className)}>
      <span aria-hidden="true" className="h-2 w-2 flex-none rounded-full bg-quase" />
      Alterações não salvas
    </span>
  );
}

/** Computador: "Alterações não salvas · Descartar · Salvar" à direita do título (§8). */
function AcoesDeSalvar({ editor }: { editor: EditorBio }) {
  return (
    <div className="hidden flex-wrap items-center gap-2.5 lg:flex">
      {editor.sujo && (
        <>
          <Pendente />
          <button type="button" onClick={editor.descartar} className={FANTASMA}>
            Descartar
          </button>
        </>
      )}
      <button type="button" onClick={editor.salvar} disabled={!editor.sujo || editor.salvando} className={PRIMARIO}>
        {editor.salvando ? "Salvando…" : "Salvar"}
      </button>
    </div>
  );
}

/** Celular: a barra fica acima da barra de baixo (`.pn-bio-salvar` em painel-vitrine.css), só com alteração. */
function BarraDeSalvar({ editor }: { editor: EditorBio }) {
  return (
    <div
      role="region"
      aria-label="Salvar alterações"
      className="pn-bio-salvar fixed inset-x-0 z-30 flex min-h-16 items-center gap-2 border-t border-line-200 bg-paper-0 py-2.5 pl-4 pr-3 shadow-[0_-10px_24px_-18px_rgb(7_25_35/0.45)] lg:hidden"
    >
      <Pendente className="min-w-0 flex-1" />
      <button type="button" onClick={editor.descartar} className={FANTASMA}>
        Descartar
      </button>
      <button type="button" onClick={editor.salvar} disabled={editor.salvando} className={PRIMARIO}>
        {editor.salvando ? "Salvando…" : "Salvar"}
      </button>
    </div>
  );
}

function Endereco({ url, dominio, aoCopiar }: { url: string; dominio: string | null; aoCopiar: (url: string) => void }) {
  return (
    <div className="mt-3 flex items-center gap-2 rounded-xl border border-line-200 bg-paper-0 py-1.5 pl-3 pr-1.5 lg:mt-4 lg:gap-3 lg:py-2 lg:pl-4 lg:pr-2">
      <Globe className="hidden h-5 w-5 flex-none text-slate-600 lg:block" aria-hidden="true" />
      <p className="min-w-0 flex-1 truncate font-data text-13 font-medium text-volt-950 lg:text-15">
        <span className="sr-only">Endereço da página: </span>
        {url}
      </p>
      {dominio && <span className="pn-chip hidden lg:inline-flex">Domínio próprio</span>}
      <button type="button" onClick={() => aoCopiar(url)} aria-label="Copiar o endereço da página" className={cn(SECUNDARIO, "min-h-10 px-3")}>
        <Copy className="h-4 w-4" aria-hidden="true" />
        Copiar
      </button>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Abrir a página numa aba nova"
        className={cn(SECUNDARIO, "hidden min-h-10 px-3 lg:inline-flex")}
      >
        <ExternalLink className="h-4 w-4" aria-hidden="true" />
        Abrir
      </a>
    </div>
  );
}

function Esqueleto() {
  return (
    <div role="status" className="mt-6 space-y-3">
      <span className="sr-only">Carregando o link da bio…</span>
      <div aria-hidden="true" className="pn-skeleton h-12 rounded-xl" />
      <div aria-hidden="true" className="pn-skeleton h-72 rounded-xl" />
    </div>
  );
}

function EstadoVazio({ criando, aoCriar }: { criando: boolean; aoCriar: () => void }) {
  return (
    <section aria-labelledby="bio-vazio-titulo" className="pn-card mt-6 rounded-xl p-6">
      <h2 id="bio-vazio-titulo" className="font-brand text-20 font-bold text-volt-950">
        Monte o link da bio da loja
      </h2>
      <p className="mt-2 max-w-[60ch] text-15 text-slate-600">
        Uma página com o WhatsApp da loja, o grupo VIP e o que mais você quiser, num endereço só, pra pôr na bio do
        Instagram. Ela nasce fora do ar: você confere tudo antes de publicar.
      </p>
      <button type="button" onClick={aoCriar} disabled={criando} className={cn(PRIMARIO, "mt-4")}>
        {criando ? "Criando…" : "Criar minha página"}
      </button>
    </section>
  );
}

/** A tela (mockup "Editor no celular" e "Editor no computador"). Só desenha: o estado vem de `useEditorBio`. */
export function TelaDoEditor({
  editor,
  aba,
  aoEscolherAba,
  aoCopiar,
}: {
  editor: EditorBio;
  aba: IdDaAba;
  aoEscolherAba: (aba: IdDaAba) => void;
  aoCopiar: (url: string) => void;
}) {
  const { pagina, rascunho, contexto } = editor;
  const pronto = editor.carga === "ok" && pagina && rascunho && contexto ? { pagina, rascunho, contexto } : null;
  const dona = abaDoErro(editor.erro);
  const atual = ABAS.find((a) => a.id === aba) ?? ABAS[0];
  const Conteudo = atual.Conteudo;

  return (
    // pb-40 no celular: a barra de salvar (64 px) e o "Ver como fica" (80 px) ficam por cima do fim da tela.
    <div className="pn-bio mx-auto w-full max-w-[1320px] px-4 pb-40 pt-5 lg:px-8 lg:pb-14 lg:pt-7">
      <header className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="grid min-w-0 flex-[1_1_420px] gap-1.5">
          <h1 className="flex flex-wrap items-center gap-2.5 font-brand text-[22px] font-bold leading-tight tracking-[-0.4px] text-volt-950 lg:text-28">
            Link da bio
            {pronto && <ChipDeEstado pagina={pronto.pagina} />}
          </h1>
          <p className="hidden max-w-[64ch] text-15 text-slate-600 lg:block">
            A página que vai na bio do Instagram: o WhatsApp da loja, o grupo VIP e o que mais você quiser, num endereço
            só.
          </p>
        </div>
        {pronto && <AcoesDeSalvar editor={editor} />}
      </header>

      {editor.carga === "carregando" && <Esqueleto />}
      {editor.carga === "erro" && (
        <div className="mt-6">
          <ErroDeCarga titulo="Não deu para carregar o link da bio." aoTentarDeNovo={editor.carregar} />
        </div>
      )}
      {editor.carga === "ok" && !pagina && <EstadoVazio criando={editor.criando} aoCriar={editor.criar} />}

      {pronto && (
        <>
          <Endereco
            url={enderecoPrincipal(pronto.contexto, pronto.pagina.slug)}
            dominio={pronto.contexto.dominio}
            aoCopiar={aoCopiar}
          />
          {pronto.pagina.bloqueadaEm && (
            <p className={AVISO}>A Girumo tirou esta página do ar. Ela não aparece pra ninguém até ser liberada; fale com o suporte.</p>
          )}
          {editor.conflito && (
            <div role="alert" className={cn(AVISO, "flex flex-wrap items-center gap-3")}>
              <p className="min-w-0 flex-1">{editor.conflito}</p>
              <button type="button" onClick={editor.carregar} className={SECUNDARIO}>
                Recarregar
              </button>
            </div>
          )}
          {editor.aviso && (
            <p role="alert" className={AVISO}>
              {editor.aviso}
            </p>
          )}
          {editor.erro && !dona && (
            <p role="alert" className={AVISO}>
              {editor.erro.mensagem}
            </p>
          )}
          <section aria-label="Editar a página" className="mt-5 min-w-0">
            <BarraDeAbas abas={ABAS} atual={atual.id} aoEscolher={aoEscolherAba} />
            <div role="tabpanel" id={`bio-painel-${atual.id}`} aria-labelledby={`bio-aba-${atual.id}`} className="pt-4">
              <Conteudo
                pagina={pronto.pagina}
                rascunho={pronto.rascunho}
                contexto={pronto.contexto}
                mudarDocumento={editor.mudarDocumento}
                mudarPagina={editor.mudarPagina}
                reverAnimacao={editor.reverAnimacao}
                erro={dona?.id === atual.id ? editor.erro : null}
                limparErro={editor.limparErro}
              />
            </div>
          </section>
          {editor.sujo && <BarraDeSalvar editor={editor} />}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write `page.tsx`**

```tsx
// apps/web/src/app/painel/link-da-bio/page.tsx
"use client";

import { EditorDoLinkDaBio } from "@/components/painel/link-da-bio/editor";

/** Link da bio (spec 2026-10-19-link-da-bio §8). O item no menu só entra no PR 6b. */
export default function PainelLinkDaBio() {
  return <EditorDoLinkDaBio />;
}
```

- [ ] **Step 5: Borda do interruptor e barra de salvar** — em `apps/web/src/app/painel-vitrine.css`, trocar:

```css
/* Interruptor 48x28 (44x26 no mobile): Volt ligado, Line desligado, bolinha Paper. */
.pn-interruptor {
  position: relative;
  flex: none;
  width: 48px;
  height: 28px;
  border-radius: 9999px;
  background: var(--color-line-200);
  transition: background-color var(--dur-fast) var(--ease-girumo);
}
.pn-interruptor[aria-checked="true"] {
  background: var(--color-volt-950);
}
```

por:

```css
/* Interruptor 48x28 (44x26 no mobile): Volt ligado, Line desligado, bolinha Paper.
   Desligado, o Line dá 1,3:1 no Paper: a borda Slate por dentro (6,2:1 no Paper, 5,7:1 no
   Canvas) é o limite que o WCAG 1.4.11 pede (≥ 3:1). Sombra, e não border: a medida não muda. */
.pn-interruptor {
  position: relative;
  flex: none;
  width: 48px;
  height: 28px;
  border-radius: 9999px;
  background: var(--color-line-200);
  box-shadow: inset 0 0 0 2px var(--color-slate-600);
  transition: background-color var(--dur-fast) var(--ease-girumo);
}
.pn-interruptor[aria-checked="true"] {
  background: var(--color-volt-950);
  box-shadow: none;
}
```

E, logo depois do bloco `.pn-interruptor:disabled { opacity: 0.6; }`, acrescentar:

```css
/* Link da bio (spec 2026-10-19 §8): no celular a barra "Alterações não salvas" fica em cima da
   barra de baixo, que já tem a área segura do iPhone dentro dela. */
.pn-bio-salvar {
  bottom: calc(var(--spacing-barra-mobile) + env(safe-area-inset-bottom));
}
```

- [ ] **Step 6: Smoke da rota** — em `apps/web/e2e/conteudo-esperado.ts`, logo antes da entrada `"/painel/pages": {`, acrescentar:

```ts
  "/painel/link-da-bio": {
    // So existe depois do GET: o estado vazio ("Monte o link da bio da loja") ou a contagem do
    // cartao Links ("N links · M aparecendo na pagina"). O <h1> "Link da bio" monta antes da
    // resposta, entao nao serve de ancora.
    ancora: /Monte o link da bio da loja|aparecendo na página/,
    lista: {
      api: "/api/link-da-bio",
      // A pagina da loja e um documento so: com pagina, a tela mostra o endereco dela (o dominio
      // proprio, se houver; senao o slug salvo); sem pagina, o estado vazio.
      marca: (j) => {
        const o = (j ?? {}) as { pagina?: { slug?: string } | null; dominio?: string | null };
        if (!o.pagina) return null;
        return o.dominio ?? o.pagina.slug ?? null;
      },
      vazio: /Monte o link da bio da loja/,
    },
  },

```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/link-da-bio/editor.test.ts src/components/painel/link-da-bio/aba-links.test.ts src/components/painel/link-da-bio/folha-de-link.test.ts src/lib/bio/editor.test.ts src/lib/bio/editor-links.test.ts`
Expected: PASS (9 + 7 + 8 + 8 + 11 = 43 testes).

- [ ] **Step 8: Typecheck, lint e checks do painel**

Run: `npx tsc --noEmit --project tsconfig.json` · `npx tsc --noEmit --project tsconfig.e2e.json` · `npm run lint` · `npm run painel:check` · `npm run brand:check`
Expected: tudo verde; `painel:check OK`.

- [ ] **Step 9: Commit**

```bash
git add src/components/painel/link-da-bio/editor.tsx src/components/painel/link-da-bio/editor.test.ts src/app/painel/link-da-bio/page.tsx src/app/painel-vitrine.css e2e/conteudo-esperado.ts
git commit -m "feat(link-da-bio): /painel/link-da-bio editor page (no menu item yet)"
```

### Task 7: Gate, conferência, PR e quadro (Parte 1)

**Files:** nenhum novo.

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces: PR da Parte 1 mergeado; `blocker` do card reescrito.

- [ ] **Step 1: Gate local** (em `apps/web`)

Run: `npm test`
Expected: tudo verde, com os 43 testes novos.

Depois, em PowerShell, na raiz do worktree:

```
Set-Location <caminho do worktree bio-6a1>; & .\infra\scripts\verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
```

Expected: `EXIT=0`.

- [ ] **Step 2: Conferir no navegador** (dev local com `HUBFLOW_USE_SUPABASE=1`, banco dev, servidor subido a partir do `apps/web` deste worktree — o `preview_start` serve o checkout principal; logado como dono de uma loja de teste do dev; sem credencial na máquina, pedir ao Igor para entrar no painel do navegador). Em `/painel/link-da-bio`:
  - loja sem página → "Monte o link da bio da loja" → "Criar minha página" → editor com "Fora do ar" e o endereço `…/bio/<slug>`; "Copiar" mostra o toast; "Abrir" abre aba nova (o 404 de texto é o esperado com a página fora do ar);
  - "Adicionar link" → 6 atalhos; "WhatsApp da loja" → o foco cai em "Texto do botão"; "Adicionar" com o número vazio → erro embaixo do número e foco nele; digitar → o erro some; "Adicionar" → toast, a linha nova pisca, "Alterações não salvas · Descartar · Salvar" no cabeçalho (1280) e a barra acima da barra de baixo (390, sem cobrir nada);
  - "Salvar" → "Salvo. A página continua fora do ar."; recarregar a tela → o link continua lá;
  - editar o link e tocar em "Pronto" sem mudar nada → **não** aparece "Alterações não salvas";
  - "Excluir" → "Excluir “…” da página?" com foco no "Não"; "Não" → foco volta no "Excluir"; "Excluir" → a folha fecha e o foco fica em "Adicionar link";
  - com 3 ou mais links, "Reordenar" → Subir/Descer de 44 px; "Subir" no 2º → vira o 1º e o foco vai para o "Descer" dele; o DevTools (Accessibility) mostra o `aria-live` com "…: agora é o 1º de N."; "Pronto" volta aos interruptores;
  - interruptor desligado → chip "Escondido", contagem cai, o trilho desligado tem a borda escura;
  - abrir a tela em duas abas do navegador, salvar numa e depois mudar e salvar na outra → "Outra pessoa salvou antes. Recarregue pra ver a versão nova." + "Recarregar", que traz a versão nova;
  - pôr num link WhatsApp o número conectado da loja de teste e salvar → a folha abre naquele link com a frase do servidor embaixo do número, foco nele;
  - Tab do começo ao fim: abas com tabindex móvel (setas trocam), folha prende o foco, Esc fecha e devolve o foco a quem abriu.

- [ ] **Step 3: PR** — `git fetch origin main` e `git log HEAD..origin/main --oneline` (atrasada → `git merge origin/main` antes do push); push com `-u`; `gh pr create` com o título "feat(link-da-bio): editor no painel com a aba Links (PR 6a, parte 1)" e o corpo com: o que entra (hook de estado, aba Links, folha, salvar com versão, estado vazio, rota sem menu, borda do interruptor), as decisões (validação pelo `documentoBio`, `mesmoConteudo`, aviso vermelho sem GET extra, exclusão na própria folha, `authenticatedFetch`), prints em 1280 e 390 e o plano de teste; terminar com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 4: CI e merge** — `gh pr checks <N> --watch`; verde → `gh pr merge <N> --squash --delete-branch` (a `main` não tem proteção: merge à mão no verde). Vermelho no e2e só por `processing`/timeout de rede → rerun (achados "CI: corrida no banco dev" e "rede do runner caída"), nunca afrouxar o smoke.

- [ ] **Step 5: Prova depois do deploy** — em produção, logado numa loja de teste (o menu não tem o item; ir pela URL `/painel/link-da-bio`): a tela abre, cria a página, adiciona um link e salva; print anexado ao PR. Nenhuma página da loja-piloto é criada sem o OK do Igor.

- [ ] **Step 6: Quadro** — o card `link-da-bio` continua `em_construcao` (não chamar `move_card` para o mesmo status: não grava evento). O Igor roda em prod:

```sql
update public.board_features
   set blocker = 'Editor em /painel/link-da-bio (sem item no menu) desde o PR #<N>: aba Links, salvar com versão, estado vazio. Falta: prévia e guarda de saída (6a parte 2), 3b, Aparência/Perfil/Divulgar e o item no menu (6b), rastreio (7).'
 where key = 'link-da-bio'
returning key, status, blocker;
```

---

# Parte 2 — prévia, guarda de saída e barras do celular (`feat/link-da-bio-6a2-previa`)

## Antes de tudo (Parte 2)

Na raiz do checkout principal:

```bash
git fetch origin main
git log origin/main --oneline -40 -i --grep "link-da-bio"
git worktree add -b feat/link-da-bio-6a2-previa .claude/worktrees/bio-6a2 origin/main
```

Expected: o merge da Parte 1 aparece; sem ele, **parar**. No worktree novo: `node_modules` por junction e e2e contra o dev só com `E2E_SUPABASE_*` no ambiente (ver "Ambiente do worktree" no índice). Comandos em `apps/web` do worktree.

```bash
git grep -n -E "export function renderPaginaBio\b" -- src/lib/bio/render/index.ts
git grep -n -E "from \"(node:|fs|path|crypto|server-only)\"|require\(" -- src/lib/bio/render/
```

Expected: a primeira linha existe (PR 3a em `main`); a segunda volta **vazia** — o renderizador vai para o navegador nesta parte (spec §9: "puro; sem server-only, sem Supabase, sem React"). Se voltar algo, **parar** e corrigir no PR 3a: importar módulo de Node num componente cliente quebra o build.

### Task 8: Dados da prévia e a regra da guarda de saída

**Files:**
- Modify: `apps/web/src/lib/bio/editor.ts` (troca a primeira linha de import; acrescenta a seção "prévia e saída" no fim)
- Test: `apps/web/src/lib/bio/editor-previa.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2 (`ContextoDoEditor`, `ContextoDosAvisos`, `avisoDoLink`); `type DadosRender`, `type Modelo` (PR 2).
- Produces:
  - `NOME_DO_MODELO: Readonly<Record<Modelo, string>>`
  - `escondidosNaTela(links: readonly LinkBio[], c: ContextoDosAvisos): string[]`
  - `dadosDaPrevia(pagina: PaginaBio, documento: DocumentoBio, c: ContextoDoEditor): DadosRender`
  - `type CliqueLido = { defaultPrevented: boolean; button: number; comModificador: boolean; alvo: { href: string; target: string; download: boolean } | null }`
  - `destinoInterno(c: CliqueLido, aqui: { origin: string; pathname: string; search: string }): string | null`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/bio/editor-previa.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { documentoPadrao, type DocumentoBio, type LinkBio } from "@/lib/bio/documento";
import type { CampanhaDoPainel } from "@/lib/bio/painel-api";
import type { PaginaBio } from "@/lib/stores/bio-pages";

import {
  dadosDaPrevia,
  destinoInterno,
  escondidosNaTela,
  NOME_DO_MODELO,
  type CliqueLido,
  type ContextoDoEditor,
} from "./editor";

type Tipo<T extends LinkBio["tipo"]> = Extract<LinkBio, { tipo: T }>;

// Dados fictícios: nada da loja-piloto (repo público).
const ZAP: Tipo<"whatsapp"> = {
  id: "6f1c2b9e-0a1d-4c3e-9b2a-1d2e3f4a5b01",
  tipo: "whatsapp",
  titulo: "Falar com a vendedora",
  sub: "",
  icone: "whatsapp",
  ativo: true,
  destaque: true,
  numero: "5562999990000",
  mensagem: "",
};
const GRUPO: Tipo<"grupo"> = {
  id: "6f1c2b9e-0a1d-4c3e-9b2a-1d2e3f4a5b02",
  tipo: "grupo",
  titulo: "Entrar no grupo VIP",
  sub: "",
  icone: "coroa",
  ativo: true,
  destaque: false,
  campanhaId: "0b7d6c5e-4f3a-4b2c-8d1e-0f9a8b7c6d01",
};
const GRUPO_SEM_LINK: Tipo<"grupo"> = { ...GRUPO, id: "6f1c2b9e-0a1d-4c3e-9b2a-1d2e3f4a5b05", campanhaId: "0b7d6c5e-4f3a-4b2c-8d1e-0f9a8b7c6d02" };
const CAMPANHAS: CampanhaDoPainel[] = [
  { id: "0b7d6c5e-4f3a-4b2c-8d1e-0f9a8b7c6d01", nome: "VIP Atacado", slug: "vip-atacado" },
  { id: "0b7d6c5e-4f3a-4b2c-8d1e-0f9a8b7c6d02", nome: "Saldão", slug: null },
];

function documento(links: LinkBio[]): DocumentoBio {
  return { ...documentoPadrao({ nome: "Loja Exemplo", campanhaId: null }), links };
}

const PAGINA: PaginaBio = {
  id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c01",
  tenantId: "tenant-exemplo",
  slug: "loja-exemplo",
  publicada: false,
  bloqueadaEm: null,
  documento: documento([ZAP, GRUPO]),
  versao: 3,
  updatedAt: "2026-10-19T12:00:00.000Z",
};
const CONTEXTO: ContextoDoEditor = {
  campanhas: CAMPANHAS,
  dominio: null,
  origemGirumo: "https://www.girumo.com.br/",
  sugestaoSlug: "loja-exemplo",
  linksEscondidos: [ZAP.id],
};

test("dados da prévia: o rascunho, só as campanhas com link, os escondidos como a página vai ver, origem Girumo", () => {
  const rascunho = documento([ZAP, GRUPO, GRUPO_SEM_LINK]);
  const d = dadosDaPrevia(PAGINA, rascunho, CONTEXTO);
  assert.equal(d.documento, rascunho);
  assert.equal(d.paginaId, PAGINA.id);
  assert.deepEqual(d.campanhas, { [CAMPANHAS[0].id]: "vip-atacado" });
  assert.deepEqual(d.linksEscondidos, [ZAP.id, GRUPO_SEM_LINK.id]);
  assert.equal(d.origem, "https://www.girumo.com.br");
  assert.equal(d.dominioProprio, false);
  // Trocou o número no rascunho: a prévia já mostra o botão (o salvar confere de novo).
  assert.deepEqual(dadosDaPrevia(PAGINA, documento([{ ...ZAP, numero: "5562988887777" }]), CONTEXTO).linksEscondidos, []);
});

test("domínio próprio: a prévia monta os links como a raiz do domínio vai montar", () => {
  const d = dadosDaPrevia(PAGINA, PAGINA.documento, { ...CONTEXTO, dominio: "links.loja.com.br" });
  assert.equal(d.origem, "https://links.loja.com.br");
  assert.equal(d.dominioProprio, true);
});

test("escondidos na tela = links com aviso, na ordem da lista", () => {
  assert.deepEqual(
    escondidosNaTela([GRUPO_SEM_LINK, ZAP, GRUPO], { campanhas: CAMPANHAS, linksEscondidos: [ZAP.id], salvos: [ZAP] }),
    [GRUPO_SEM_LINK.id, ZAP.id],
  );
});

test("nome de cada modelo no chip da prévia", () => {
  assert.deepEqual(NOME_DO_MODELO, { etiqueta: "Etiqueta", vitrine: "Vitrine", romaneio: "Romaneio", classico: "Clássico" });
});

test("guarda de saída: só clique comum, num link do próprio app, para outra tela", () => {
  const aqui = { origin: "https://app.girumo.com.br", pathname: "/painel/link-da-bio", search: "" };
  const clique = (href: string, o: Partial<CliqueLido> = {}, alvo: Partial<NonNullable<CliqueLido["alvo"]>> = {}): CliqueLido => ({
    defaultPrevented: false,
    button: 0,
    comModificador: false,
    alvo: { href, target: "", download: false, ...alvo },
    ...o,
  });
  assert.equal(destinoInterno(clique("https://app.girumo.com.br/painel/campanhas?aba=1#x"), aqui), "/painel/campanhas?aba=1#x");
  assert.equal(destinoInterno(clique("https://app.girumo.com.br/painel", {}, { target: "_self" }), aqui), "/painel");
  // Outro site: quem pergunta é o beforeunload do navegador.
  assert.equal(destinoInterno(clique("https://www.girumo.com.br/bio/loja-exemplo"), aqui), null);
  // Mesma tela (só a âncora muda), aba nova, download, Ctrl/⌘, botão do meio, já tratado: não intercepta.
  assert.equal(destinoInterno(clique("https://app.girumo.com.br/painel/link-da-bio#links"), aqui), null);
  assert.equal(destinoInterno(clique("https://app.girumo.com.br/painel", {}, { target: "_blank" }), aqui), null);
  assert.equal(destinoInterno(clique("https://app.girumo.com.br/painel", {}, { download: true }), aqui), null);
  assert.equal(destinoInterno(clique("https://app.girumo.com.br/painel", { comModificador: true }), aqui), null);
  assert.equal(destinoInterno(clique("https://app.girumo.com.br/painel", { button: 1 }), aqui), null);
  assert.equal(destinoInterno(clique("https://app.girumo.com.br/painel", { defaultPrevented: true }), aqui), null);
  assert.equal(destinoInterno({ defaultPrevented: false, button: 0, comModificador: false, alvo: null }, aqui), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/editor-previa.test.ts`
Expected: FAIL — `dadosDaPrevia` (e os outros) não exportados.

- [ ] **Step 3: Write the implementation** — trocar a primeira linha de import de `editor.ts` por:

```ts
import {
  documentoBio,
  documentoPadrao,
  type DadosRender,
  type DocumentoBio,
  type Icone,
  type LinkBio,
  type Modelo,
} from "@/lib/bio/documento";
```

E acrescentar no fim do arquivo:

```ts
// --------------------------------------------------------- prévia e saída (§8)

/** O nome de cada modelo, para o chip da prévia (e as miniaturas do 6b). */
export const NOME_DO_MODELO: Readonly<Record<Modelo, string>> = {
  etiqueta: "Etiqueta",
  vitrine: "Vitrine",
  romaneio: "Romaneio",
  classico: "Clássico",
};

/** Os ids que não saem na página agora (§6): o `linksEscondidos` que a prévia desenha. */
export function escondidosNaTela(links: readonly LinkBio[], c: ContextoDosAvisos): string[] {
  return links.filter((l) => avisoDoLink(l, c) !== null).map((l) => l.id);
}

/**
 * Os dados que a prévia passa ao `renderPaginaBio` (PR 3a): o RASCUNHO, com as campanhas e os
 * escondidos do jeito que a página pública vai ver depois de salvar.
 */
export function dadosDaPrevia(pagina: PaginaBio, documento: DocumentoBio, c: ContextoDoEditor): DadosRender {
  return {
    documento,
    paginaId: pagina.id,
    campanhas: Object.fromEntries(c.campanhas.flatMap((x) => (x.slug ? [[x.id, x.slug] as const] : []))),
    linksEscondidos: escondidosNaTela(documento.links, {
      campanhas: c.campanhas,
      linksEscondidos: c.linksEscondidos,
      salvos: pagina.documento.links,
    }),
    origem: c.dominio ? `https://${c.dominio}` : c.origemGirumo.replace(/\/+$/, ""),
    dominioProprio: c.dominio !== null,
  };
}

/** O que a guarda de saída lê do clique (fase de captura). */
export type CliqueLido = {
  defaultPrevented: boolean;
  button: number;
  comModificador: boolean;
  alvo: { href: string; target: string; download: boolean } | null;
};

/**
 * Para onde o clique ia levar DENTRO do app, ou null quando não é navegação daqui (outra aba,
 * download, outro site, a mesma tela, clique com modificador). Outro site fica com o
 * `beforeunload` do navegador.
 */
export function destinoInterno(c: CliqueLido, aqui: { origin: string; pathname: string; search: string }): string | null {
  if (c.defaultPrevented || c.button !== 0 || c.comModificador || !c.alvo) return null;
  if ((c.alvo.target && c.alvo.target !== "_self") || c.alvo.download) return null;
  let url: URL;
  try {
    url = new URL(c.alvo.href);
  } catch {
    return null;
  }
  if (url.origin !== aqui.origin) return null;
  if (url.pathname === aqui.pathname && url.search === aqui.search) return null;
  return url.pathname + url.search + url.hash;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/editor-previa.test.ts src/lib/bio/editor.test.ts src/lib/bio/editor-links.test.ts`
Expected: PASS (5 + 8 + 11 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/bio/editor.ts src/lib/bio/editor-previa.test.ts
git commit -m "feat(link-da-bio): preview data and exit-guard rules"
```

### Task 9: A prévia (coluna fixa, tela cheia) e as barras do celular

**Files:**
- Modify: `apps/web/src/components/painel/folha.tsx` (prop `telaCheia`)
- Create: `apps/web/src/components/painel/link-da-bio/previa.tsx`
- Modify: `apps/web/src/app/painel-vitrine.css` (tela cheia da folha, "Ver como fica", `scroll-padding-bottom`)
- Test: `apps/web/src/components/painel/link-da-bio/previa.test.ts`

**Interfaces:**
- Consumes: Task 8 (`NOME_DO_MODELO`); `renderPaginaBio(d: DadosRender, o: { modo: "publica" | "previa"; nonce: string | null; animarEntrada: boolean }): string` de `@/lib/bio/render` (PR 3a); `type DadosRender`, `type DocumentoBio` (PR 2); `Folha`.
- Produces:
  - `folha.tsx`: prop nova `telaCheia?: boolean` (classe `pn-folha--tela-cheia`)
  - `type PropsDaPrevia = { dados: DadosRender; rodada: number; aoReverAnimacao: () => void }`
  - `QuadroDaPrevia(p: { dados: DadosRender; rodada: number; className?: string }): React.JSX.Element`
  - `PreviaNaColuna(p: PropsDaPrevia): React.JSX.Element`, `PreviaNoCelular(p: PropsDaPrevia): React.JSX.Element`
  - classes CSS `.pn-folha--tela-cheia`, `.pn-bio-ver`; `scroll-padding-bottom` em `html:has(.pn-bio)` / `html:has(.pn-bio-salvar)`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/components/painel/link-da-bio/previa.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { documentoPadrao, type DadosRender } from "@/lib/bio/documento";
import { renderPaginaBio } from "@/lib/bio/render";

import { PreviaNaColuna, PreviaNoCelular, QuadroDaPrevia } from "./previa";

const noop = () => {};
const DADOS: DadosRender = {
  documento: { ...documentoPadrao({ nome: "Loja Exemplo", campanhaId: null }), animar: true, links: [] },
  paginaId: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c01",
  campanhas: {},
  linksEscondidos: [],
  origem: "https://www.girumo.com.br",
  dominioProprio: false,
};

function srcdoc(h: string): string {
  return /srcDoc="([^"]*)"/.exec(h)?.[1] ?? "";
}

test("a prévia é um iframe sem permissão nenhuma, fora do Tab, com o HTML do renderizador em modo prévia", () => {
  const h = renderToStaticMarkup(createElement(QuadroDaPrevia, { dados: DADOS, rodada: 0 }));
  assert.match(h, /<iframe title="Prévia da página"/);
  assert.match(h, /sandbox=""/);
  assert.match(h, /tabindex="-1"/);
  const doc = srcdoc(h);
  assert.ok(doc.includes("Loja Exemplo"));
  assert.doesNotMatch(doc, /&lt;script/i);
});

test("ao montar, a prévia desenha parada: a entrada só toca quando a rodada muda", () => {
  const h = renderToStaticMarkup(createElement(QuadroDaPrevia, { dados: DADOS, rodada: 3 }));
  const parado = renderToStaticMarkup(
    createElement("iframe", { srcDoc: renderPaginaBio(DADOS, { modo: "previa", nonce: null, animarEntrada: false }) }),
  );
  assert.equal(srcdoc(h), srcdoc(parado));
});

test("coluna do computador: prévia nomeada, chip do modelo e Rever a animação (desligado sem animação)", () => {
  const h = renderToStaticMarkup(createElement(PreviaNaColuna, { dados: DADOS, rodada: 0, aoReverAnimacao: noop }));
  assert.match(h, /<aside aria-label="Prévia da página" class="hidden /);
  assert.match(h, />Modelo Etiqueta</);
  assert.match(h, /<button type="button" class="[^"]*">[\s\S]*Rever a animação<\/button>/);
  const sem = renderToStaticMarkup(
    createElement(PreviaNaColuna, {
      dados: { ...DADOS, documento: { ...DADOS.documento, animar: false } },
      rodada: 0,
      aoReverAnimacao: noop,
    }),
  );
  assert.match(sem, /<button type="button" disabled=""[^>]*>[\s\S]*Rever a animação/);
});

test("celular: botão Ver como fica, e a folha da tela cheia só monta ao tocar", () => {
  const h = renderToStaticMarkup(createElement(PreviaNoCelular, { dados: DADOS, rodada: 0, aoReverAnimacao: noop }));
  assert.match(h, /<button type="button" aria-haspopup="dialog" class="pn-bio-ver /);
  assert.match(h, />Ver como fica</);
  assert.doesNotMatch(h, /role="dialog"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/link-da-bio/previa.test.ts`
Expected: FAIL — `Cannot find module './previa'`.

- [ ] **Step 3: `telaCheia` na `Folha`** — em `apps/web/src/components/painel/folha.tsx`:

No tipo `Props`, logo depois de `fundoFecha?: boolean;`:

```tsx
  /**
   * Ocupa a tela inteira, sem alça, e o corpo vira coluna sem margem: a prévia do link da bio no
   * celular, onde a página tem de caber no iframe do topo ao pé.
   */
  telaCheia?: boolean;
```

Na assinatura, trocar `export function Folha({ aberta, aoFechar, titulo, testId, id, emQualquerLargura, fundoFecha = true, children }: Props) {` por:

```tsx
export function Folha({ aberta, aoFechar, titulo, testId, id, emQualquerLargura, fundoFecha = true, telaCheia = false, children }: Props) {
```

E trocar `className={cn("pn-folha", emQualquerLargura && "pn-folha--dialogo")}` por:

```tsx
        className={cn("pn-folha", emQualquerLargura && "pn-folha--dialogo", telaCheia && "pn-folha--tela-cheia")}
```

- [ ] **Step 4: Write `previa.tsx`**

```tsx
// apps/web/src/components/painel/link-da-bio/previa.tsx
"use client";

import { useMemo, useState } from "react";
import { Eye, Play } from "lucide-react";

import { Folha } from "@/components/painel/folha";
import type { DadosRender, DocumentoBio } from "@/lib/bio/documento";
import { NOME_DO_MODELO } from "@/lib/bio/editor";
import { renderPaginaBio } from "@/lib/bio/render";
import { cn } from "@/lib/utils";

export type PropsDaPrevia = { dados: DadosRender; rodada: number; aoReverAnimacao: () => void };

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";
const SECUNDARIO = `inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-line-200 bg-paper-0 px-4 text-15 font-semibold text-volt-950 transition-colors hover:border-slate-600 disabled:cursor-not-allowed disabled:opacity-45 ${FOCO}`;

/**
 * A página no iframe, com o MESMO renderizador da rota pública em modo "previa" (spec §8: sem
 * `<script>`, `<a>` sem href). `sandbox=""`: nada roda e nada navega; um `srcDoc` não herda a CSP
 * do painel, então o script tem de não existir no HTML — é o que o modo prévia garante.
 *
 * A entrada só toca quando `rodada` muda (link novo, troca de modelo, "Rever a animação"); qualquer
 * outra mudança redesenha parado. `key={rodada}`: duas rodadas com o mesmo HTML ainda recarregam.
 */
export function QuadroDaPrevia({ dados, rodada, className }: { dados: DadosRender; rodada: number; className?: string }) {
  // Guarda o documento da última rodada: é com ele, e só com ele, que a entrada toca
  // (padrão do React de guardar a prop anterior no estado).
  const [rodadaVista, setRodadaVista] = useState(rodada);
  const [documentoDaRodada, setDocumentoDaRodada] = useState<DocumentoBio | null>(null);
  if (rodada !== rodadaVista) {
    setRodadaVista(rodada);
    setDocumentoDaRodada(dados.documento);
  }
  const animarEntrada = dados.documento.animar && dados.documento === documentoDaRodada;
  const html = useMemo(() => renderPaginaBio(dados, { modo: "previa", nonce: null, animarEntrada }), [dados, animarEntrada]);
  return (
    <iframe
      key={rodada}
      title="Prévia da página"
      srcDoc={html}
      sandbox=""
      tabIndex={-1}
      className={cn("block border-0 bg-paper-0", className)}
    />
  );
}

function ReverAnimacao({ animar, aoReverAnimacao }: { animar: boolean; aoReverAnimacao: () => void }) {
  return (
    <button type="button" onClick={aoReverAnimacao} disabled={!animar} className={SECUNDARIO}>
      <Play className="h-4 w-4" aria-hidden="true" />
      Rever a animação
    </button>
  );
}

/**
 * Computador (≥ 1024 px): coluna fixa à direita (§8). O celular de 390 px é desenhado a 340 px:
 * iframe 390×803 escalado por `transform` (340/390 ≈ 0,8718) dentro da moldura 340×700.
 */
export function PreviaNaColuna({ dados, rodada, aoReverAnimacao }: PropsDaPrevia) {
  return (
    <aside aria-label="Prévia da página" className="hidden lg:sticky lg:top-[72px] lg:block">
      <div className="pn-card grid justify-items-center gap-3 rounded-xl p-3.5">
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-15 font-semibold text-volt-950">Prévia</span>
          <span className="pn-chip">{`Modelo ${NOME_DO_MODELO[dados.documento.modelo]}`}</span>
        </div>
        <div className="h-[700px] w-[340px] overflow-hidden rounded-xl bg-paper-0 shadow-[0_18px_40px_-26px_rgb(7_25_35/0.45)] ring-1 ring-line-200">
          <QuadroDaPrevia dados={dados} rodada={rodada} className="h-[803px] w-[390px] origin-top-left scale-[0.8718]" />
        </div>
        <ReverAnimacao animar={dados.documento.animar} aoReverAnimacao={aoReverAnimacao} />
      </div>
    </aside>
  );
}

/**
 * Celular: "Ver como fica" (acima da barra de baixo e, com alteração, acima da barra de salvar —
 * `.pn-bio-ver` em painel-vitrine.css) abre a prévia em tela cheia. Abrir não toca a entrada.
 */
export function PreviaNoCelular({ dados, rodada, aoReverAnimacao }: PropsDaPrevia) {
  const [aberta, setAberta] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setAberta(true)}
        className={`pn-bio-ver fixed right-4 z-30 inline-flex min-h-12 items-center gap-2 rounded-full bg-volt-950 px-[18px] text-15 font-semibold text-paper-0 shadow-[0_10px_24px_-10px_rgb(7_25_35/0.6)] lg:hidden ${FOCO}`}
      >
        <Eye className="h-5 w-5" aria-hidden="true" />
        Ver como fica
      </button>
      <Folha aberta={aberta} aoFechar={() => setAberta(false)} titulo="Prévia da página" testId="bio-previa-tela-cheia" telaCheia>
        <div className="flex items-center justify-between gap-2 border-b border-line-200 px-4 py-2">
          <span className="pn-chip">{`Modelo ${NOME_DO_MODELO[dados.documento.modelo]}`}</span>
          <ReverAnimacao animar={dados.documento.animar} aoReverAnimacao={aoReverAnimacao} />
        </div>
        <QuadroDaPrevia dados={dados} rodada={rodada} className="min-h-0 w-full flex-1" />
      </Folha>
    </>
  );
}
```

- [ ] **Step 5: CSS** — em `apps/web/src/app/painel-vitrine.css` (dentro de `@layer components`):

Logo depois do bloco

```css
.pn-folha__corpo {
  min-height: 0;
  overflow-y: auto;
  padding: 8px 16px 0;
}
```

acrescentar:

```css
/* Tela cheia (prévia do link da bio no celular): do topo ao pé, sem alça, corpo sem margem. */
.pn-folha--tela-cheia {
  top: 0;
  max-height: none;
  border-radius: 0;
  padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom);
}
.pn-folha--tela-cheia .pn-folha__alca {
  display: none;
}
.pn-folha--tela-cheia .pn-folha__corpo {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
}
```

E logo depois do bloco `.pn-bio-salvar { … }` (Parte 1), acrescentar:

```css
/* "Ver como fica" (celular): em cima da barra de baixo; sobe quando a barra de salvar aparece. */
.pn-bio-ver {
  bottom: calc(var(--spacing-barra-mobile) + 16px + env(safe-area-inset-bottom));
}
html:has(.pn-bio-salvar) .pn-bio-ver {
  bottom: calc(var(--spacing-barra-mobile) + 80px + env(safe-area-inset-bottom));
}
/* WCAG 2.4.11 (§8, §11): nada focado fica atrás das barras fixas do celular.
   80 = 16 + "Ver como fica" (48) + 16; 144 = barra de salvar (64) + 80. */
@media (max-width: 1023.98px) {
  html:has(.pn-bio) {
    scroll-padding-bottom: calc(var(--spacing-barra-mobile) + 80px + env(safe-area-inset-bottom));
  }
  html:has(.pn-bio-salvar) {
    scroll-padding-bottom: calc(var(--spacing-barra-mobile) + 144px + env(safe-area-inset-bottom));
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/link-da-bio/previa.test.ts`
Expected: PASS (4 testes). Se "a prévia é um iframe…" achar `&lt;script` no `srcdoc`, o modo "previa" do PR 3a emite script: é defeito de lá (spec §9: "previa: nenhum `<script>`"), não deste teste.

- [ ] **Step 7: painel:check**

Run: `npm run painel:check`
Expected: `painel:check OK`.

- [ ] **Step 8: Commit**

```bash
git add src/components/painel/folha.tsx src/components/painel/link-da-bio/previa.tsx src/components/painel/link-da-bio/previa.test.ts src/app/painel-vitrine.css
git commit -m "feat(link-da-bio): live preview (desktop column, full-screen on mobile)"
```

### Task 10: Guarda de saída e a prévia na tela do editor

**Files:**
- Create: `apps/web/src/components/painel/link-da-bio/guarda-de-saida.ts`
- Modify: `apps/web/src/components/painel/link-da-bio/editor.tsx`
- Modify: `apps/web/src/components/painel/link-da-bio/editor.test.ts` (um teste novo no fim)

**Interfaces:**
- Consumes: Task 8 (`dadosDaPrevia`, `destinoInterno`); Task 9 (`PreviaNaColuna`, `PreviaNoCelular`); `useConfirmacao()` (`@/components/painel/confirmacao`: `{ pedirConfirmacao(p: { titulo; texto; rotulo; destrutivo? }): Promise<boolean>; folhaDeConfirmacao: ReactNode }`); `useRouter` de `next/navigation`.
- Produces: `useGuardaDeSaida(sujo: boolean): React.ReactNode`.

- [ ] **Step 1: Write the failing test** — acrescentar ao fim de `editor.test.ts`:

```ts
test("com página: prévia na coluna do computador e Ver como fica no celular; sem página, nenhuma das duas", () => {
  const h = html();
  assert.match(h, /<aside aria-label="Prévia da página"/);
  assert.match(h, />Ver como fica</);
  const vazio = html({ pagina: null, rascunho: null });
  assert.doesNotMatch(vazio, /Prévia da página/);
  assert.doesNotMatch(vazio, /Ver como fica/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/link-da-bio/editor.test.ts`
Expected: FAIL só no teste novo (`<aside aria-label="Prévia da página"` não aparece).

- [ ] **Step 3: Write `guarda-de-saida.ts`**

```ts
// apps/web/src/components/painel/link-da-bio/guarda-de-saida.ts
"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { useConfirmacao } from "@/components/painel/confirmacao";
import { destinoInterno } from "@/lib/bio/editor";

/**
 * Sair com alteração não salva (spec §8): `beforeunload` (F5, fechar a aba, ir a outro site) e
 * clique em link interno interceptado na fase de CAPTURA, com a pergunta do `useConfirmacao`.
 *
 * Só `preventDefault`, sem `stopPropagation`: o clique continua até o React (a folha "Mais" fecha),
 * e o `<Link>` do Next não navega porque vê `defaultPrevented`. Confirmou → `router.push`.
 * Devolve a folha da pergunta, que a tela renderiza.
 */
export function useGuardaDeSaida(sujo: boolean): ReactNode {
  const router = useRouter();
  const { pedirConfirmacao, folhaDeConfirmacao } = useConfirmacao();

  useEffect(() => {
    if (!sujo) return;

    const aoSair = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    const aoClicar = (e: MouseEvent) => {
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      const destino = destinoInterno(
        {
          defaultPrevented: e.defaultPrevented,
          button: e.button,
          comModificador: e.metaKey || e.ctrlKey || e.shiftKey || e.altKey,
          alvo: a instanceof HTMLAnchorElement ? { href: a.href, target: a.target, download: a.hasAttribute("download") } : null,
        },
        window.location,
      );
      if (!destino) return;
      e.preventDefault();
      void pedirConfirmacao({
        titulo: "Sair sem salvar?",
        texto: "As alterações do link da bio que você não salvou vão se perder.",
        rotulo: "Sair sem salvar",
        destrutivo: true,
      }).then((ok) => {
        if (ok) router.push(destino);
      });
    };

    window.addEventListener("beforeunload", aoSair);
    document.addEventListener("click", aoClicar, true);
    return () => {
      window.removeEventListener("beforeunload", aoSair);
      document.removeEventListener("click", aoClicar, true);
    };
  }, [sujo, pedirConfirmacao, router]);

  return folhaDeConfirmacao;
}
```

- [ ] **Step 4: Ligar a prévia e a guarda em `editor.tsx`**

Trocar o bloco de imports do topo por:

```tsx
import { useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, Globe } from "lucide-react";

import { ErroDeCarga } from "@/components/painel/erro-de-carga";
import { useToast } from "@/components/toast";
import { dadosDaPrevia, enderecoPrincipal } from "@/lib/bio/editor";
import type { PaginaBio } from "@/lib/stores/bio-pages";
import { cn } from "@/lib/utils";

import { ABAS, abaDoErro, BarraDeAbas, type IdDaAba } from "./abas";
import { useGuardaDeSaida } from "./guarda-de-saida";
import { PreviaNaColuna, PreviaNoCelular } from "./previa";
import { useEditorBio, type EditorBio } from "./use-editor-bio";
```

Em `EditorDoLinkDaBio`, logo depois de `const [aba, setAba] = useState<IdDaAba>("links");`, acrescentar:

```tsx
  // Sair com alteração não salva pergunta antes (§8).
  const folhaDeSaida = useGuardaDeSaida(editor.sujo);
```

e trocar o `return` dele por:

```tsx
  return (
    <>
      <TelaDoEditor editor={editor} aba={aba} aoEscolherAba={setAba} aoCopiar={(url) => void copiar(url)} />
      {folhaDeSaida}
    </>
  );
```

Em `TelaDoEditor`, logo depois de `const Conteudo = atual.Conteudo;`, acrescentar:

```tsx
  // A prévia desenha o RASCUNHO; memo para o iframe só recarregar quando o documento mudar.
  const documento = rascunho?.documento;
  const dados = useMemo(
    () => (pagina && documento && contexto ? dadosDaPrevia(pagina, documento, contexto) : null),
    [pagina, documento, contexto],
  );
```

E trocar o trecho

```tsx
          <section aria-label="Editar a página" className="mt-5 min-w-0">
```

até o `</section>` correspondente, junto da linha `{editor.sujo && <BarraDeSalvar editor={editor} />}`, por:

```tsx
          <div className="mt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_372px] lg:items-start lg:gap-6">
            <section aria-label="Editar a página" className="min-w-0">
              <BarraDeAbas abas={ABAS} atual={atual.id} aoEscolher={aoEscolherAba} />
              <div role="tabpanel" id={`bio-painel-${atual.id}`} aria-labelledby={`bio-aba-${atual.id}`} className="pt-4">
                <Conteudo
                  pagina={pronto.pagina}
                  rascunho={pronto.rascunho}
                  contexto={pronto.contexto}
                  mudarDocumento={editor.mudarDocumento}
                  mudarPagina={editor.mudarPagina}
                  reverAnimacao={editor.reverAnimacao}
                  erro={dona?.id === atual.id ? editor.erro : null}
                  limparErro={editor.limparErro}
                />
              </div>
            </section>
            {dados && <PreviaNaColuna dados={dados} rodada={editor.rodada} aoReverAnimacao={editor.reverAnimacao} />}
          </div>
          {dados && <PreviaNoCelular dados={dados} rodada={editor.rodada} aoReverAnimacao={editor.reverAnimacao} />}
          {editor.sujo && <BarraDeSalvar editor={editor} />}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/link-da-bio/editor.test.ts src/components/painel/link-da-bio/previa.test.ts src/components/painel/link-da-bio/aba-links.test.ts src/components/painel/link-da-bio/folha-de-link.test.ts`
Expected: PASS (10 + 4 + 7 + 8 testes).

- [ ] **Step 6: Typecheck e lint**

Run: `npx tsc --noEmit --project tsconfig.json` · `npm run lint` · `npm run painel:check` · `npm run brand:check`
Expected: tudo verde.

- [ ] **Step 7: Commit**

```bash
git add src/components/painel/link-da-bio/guarda-de-saida.ts src/components/painel/link-da-bio/editor.tsx src/components/painel/link-da-bio/editor.test.ts
git commit -m "feat(link-da-bio): exit guard and preview wiring in the editor"
```

### Task 11: Gate, conferência, PR e quadro (Parte 2)

**Files:** nenhum novo.

**Interfaces:**
- Consumes: Tasks 8–10.
- Produces: PR da Parte 2 mergeado; `blocker` do card reescrito; decisão no grafo.

- [ ] **Step 1: Gate local** — em `apps/web`: `npm test` (verde, com os 10 testes novos e os 43 da Parte 1); depois, em PowerShell, na raiz do worktree:

```
Set-Location <caminho do worktree bio-6a2>; & .\infra\scripts\verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
```

Expected: `EXIT=0` (o build prova que o renderizador entrou no bundle do cliente sem módulo de Node).

- [ ] **Step 2: Conferir no navegador** (mesmo ambiente da Task 7, Step 2), em `/painel/link-da-bio`:
  - 1280: coluna "Prévia" à direita, fixa ao rolar a lista; chip "Modelo Etiqueta"; a primeira pintura vem parada;
  - adicionar link → a prévia toca a entrada; ligar/desligar e reordenar → a prévia muda **sem** tocar a entrada; "Rever a animação" toca de novo (duas vezes seguidas também);
  - na prévia, clicar num botão não navega e nada roda; "Como chegar" abre o `<details>`;
  - DevTools › Network: as fontes `/fonts/bio/…` respondem 200 com `access-control-allow-origin: *` (o iframe é de origem opaca); se faltar o header, a prévia cai na fonte do sistema — ver "Riscos";
  - 390: "Ver como fica" acima da barra de baixo; com alteração, sobe acima da barra de salvar; abre a prévia em tela cheia com o título "Prévia da página"; "Fechar" volta e o foco fica no botão;
  - com alteração: "Campanhas" na barra de cima (e um item do "Mais") → "Sair sem salvar?"; "Cancelar" fica na tela; "Sair sem salvar" navega; F5 e fechar a aba → aviso nativo do navegador; "Abrir" (aba nova) e Ctrl+clique não perguntam; sem alteração, nada pergunta;
  - 390, Tab do começo ao fim com alteração pendente: nenhum campo focado fica atrás das barras fixas.

- [ ] **Step 3: PR** — atualizar com `origin/main` se atrasada; push com `-u`; `gh pr create` com o título "feat(link-da-bio): prévia, guarda de saída e barras do celular (PR 6a, parte 2)", corpo com o que entra, as decisões (`key={rodada}`, abrir não toca a entrada, guarda só com `preventDefault`, barras por CSS `:has`), prints em 1280 e 390 (com a folha de tela cheia aberta) e o plano de teste; terminar com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 4: CI e merge** — `gh pr checks <N> --watch`; verde → `gh pr merge <N> --squash --delete-branch`.

- [ ] **Step 5: Prova depois do deploy** — em produção, loja de teste, pela URL: prévia na coluna em 1280 e "Ver como fica" em 390; a pergunta ao sair com alteração. Print no PR.

- [ ] **Step 6: Quadro** — o card continua `em_construcao`; o Igor roda em prod:

```sql
update public.board_features
   set blocker = 'Editor com prévia e guarda de saída em /painel/link-da-bio (sem item no menu) desde o PR #<N>. Falta: 3b, Aparência/Perfil/Divulgar e o item no menu (6b), rastreio (7).'
 where key = 'link-da-bio'
returning key, status, blocker;
```

- [ ] **Step 7: Grafo** — sugerir ao Igor (PowerShell):

```
rag insert "decisão: editor do link da bio = um hook (useEditorBio: versão salva + rascunho + contexto do GET + rodada) e um registro de abas (abas.tsx) com dona(campo) para o erro do salvar; validação no navegador pelo mesmo documentoBio; prévia em iframe srcdoc sandbox vazio que só anima quando a rodada sobe; guarda de saída só com preventDefault na captura." --source decisao-2026-10-19-link-da-bio-painel
```

Encerrar com "PRs que deixei abertos: nenhum" (ou o número e o motivo).

---

## Critérios de aceite do PR

**Parte 1**
- `/painel/link-da-bio` existe, sem item no menu; a vendedora vê "Essa área não foi liberada pra você".
- Sem página: "Monte o link da bio da loja" → "Criar minha página" (POST) → editor; o botão trava em "Criando…".
- Cabeçalho: "Link da bio" + "No ar"/"Fora do ar" (bloqueada = "Fora do ar" + aviso); endereço principal = `https://<dominio>/` ou `origemGirumo/bio/<slug salvo>`, com Copiar e Abrir (computador).
- Aba Links: lista na ordem da página; interruptor `role="switch"` com nome "Mostrar na página: …" e trilho desligado com borda ≥ 3:1; "Reordenar" → Subir/Descer 44×44, anúncio `aria-live`, foco no outro botão na ponta; aviso vermelho em campanha apagada/sem link e no número que a API escondeu.
- Folha: 6 atalhos; erro embaixo do campo, ligado por `aria-describedby`, que some ao corrigir; foco no primeiro campo (tipo escolhido) e no primeiro com erro; Excluir com confirmação na própria folha (foco no "Não"; depois de excluir, em "Adicionar link"); até 20 links e um destaque.
- Salvar com `versao`; 409 → "Outra pessoa salvou antes. Recarregue pra ver a versão nova." + Recarregar; erro de campo do servidor abre a folha no link; editar sem mudar nada não suja.
- 43 testes novos verdes; `painel:check`, `brand:check`, os dois `tsc`, lint, build e o smoke `/painel/link-da-bio renderiza` verdes.

**Parte 2**
- Prévia `<iframe srcdoc sandbox="">` com o modo "previa": coluna fixa à direita no computador; "Ver como fica" em tela cheia no celular; a entrada só toca com link novo e "Rever a animação" (e troca de modelo, no 6b).
- Sair com alteração pergunta (clique interno na captura + `useConfirmacao`), e o navegador avisa no F5/fechar; nada pergunta sem alteração.
- `scroll-padding-bottom` cobre as barras fixas do celular; "Ver como fica" sobe acima da barra de salvar.
- 10 testes novos verdes; gate e build verdes (o renderizador no bundle do cliente).

## Comandos de verificação

Em `apps/web` do worktree:

```
npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/editor.test.ts src/lib/bio/editor-links.test.ts src/components/painel/link-da-bio/folha-de-link.test.ts src/components/painel/link-da-bio/aba-links.test.ts src/components/painel/link-da-bio/editor.test.ts
npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/editor-previa.test.ts src/components/painel/link-da-bio/previa.test.ts
npm run lint
npx tsc --noEmit --project tsconfig.json
npx tsc --noEmit --project tsconfig.e2e.json
npm test
npm run painel:check
npm run brand:check
```

Na raiz do worktree (PowerShell 5.1, sem `&&`):

```
& .\infra\scripts\verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
```

## Riscos e pontos de atenção

- **Premissas sobre o PR 2.** `validarLink` valida o link dentro de `documentoPadrao(...)`: se ele não passar no `documentoBio`, todo "Adicionar" volta "Confira os dados deste link." (o teste "antes do PATCH…" pega). O mapa por campo precisa de `z.discriminatedUnion("tipo", …)` nos links; com `z.union` o caminho para em `links.N` e o erro sai geral. A normalização (`55`+dígitos, `url.href`) tem de ser idempotente — o servidor revalida o documento salvo a cada PATCH, e o "editar sem mudar nada" depende disso.
- **PR 3a no navegador.** `renderPaginaBio` entra no bundle do cliente na Parte 2: qualquer `node:`/`fs`/`server-only` nele quebra o build (o grep do "Antes de tudo" pega). O CSS dos 4 modelos (depois do 3b) vai junto, só no chunk desta rota.
- **Prévia recarrega a cada mudança e volta ao topo.** O iframe com `sandbox=""` é de origem opaca: não dá pra guardar a rolagem nem medir a altura. No 6a as mudanças são discretas (aplicar, ligar, mover); no celular a coluna do computador continua montada, escondida (`hidden lg:block`), e recarrega junto. No Perfil (6b) cada tecla recarregaria — se incomodar, o 6b atrasa a prévia uns 300 ms ou passa a `sandbox="allow-same-origin"` (ainda sem `allow-scripts`), que a spec já admite.
- **Fontes e imagens da prévia.** Origem opaca → a fonte exige `Access-Control-Allow-Origin: *` em `/fonts/bio/*` (conferido em 19/10 para `public/`). Sem o header, a prévia cai na fonte do sistema; a correção da spec é `allow-same-origin` sem `allow-scripts`.
- **Guarda de saída depende do `<Link>` olhar `defaultPrevented`.** É assim no Next 15; se mudar, o clique navega sem perguntar (o roteiro da Task 11 pega). Clique num item do "Mais" do celular: a folha "Mais" fecha pelo próprio clique e a pergunta abre por cima; com duas folhas o Tab pode disputar por um instante — toque funciona.
- **Número conectado entre salvar e reabrir.** A lista `linksEscondidos` zera depois de salvar (o servidor recusa número conectado no PATCH); um número que vira conectado depois só ganha aviso quando a tela recarrega — e o próximo salvar já volta 400 no campo, com a folha aberta nele.
- **Fotos do botão e da fachada.** Ficam para o 6b, com o upload; o 6a preserva `fotos`/`foto` do jeito que vierem (inclusive na validação: a saída do zod as devolve).
- **`crypto.randomUUID`** exige contexto seguro (https ou `localhost`): abrir o dev por IP da rede local em http quebra o "Adicionar".
- **Smoke só.** O e2e visita a rota (a loja de QA fica no estado vazio: os e2e do 4a e do 5 não criam página nela); o fluxo inteiro é coberto por teste de unidade e pela conferência das Tasks 7 e 11. Não criar página na loja de QA dentro de spec: `bio_slugs` não aceita DELETE e o estado ficaria preso no banco de dev.
- **Foco depois de salvar.** O "Salvar" do computador desliga (sem alteração) e a barra do celular some: o foco volta ao `body`; o toast (`role="status"`) anuncia "Salvo…". Sem destino definido na spec.

## Interface com os outros PRs

### O que este PR exporta

`apps/web/src/lib/bio/editor.ts` (puro; roda no navegador):

```ts
export type ContextoDoEditor = Omit<RespostaDoPainelBio, "pagina">;
export type EstadoSalvavel = Omit<CorpoDoPatchBio, "versao">; // { slug; publicada; documento }
export type ErroDeCampo = { campo: string; mensagem: string };
export type ResultadoDoSalvar =
  | { tipo: "ok"; pagina: PaginaBio }
  | { tipo: "conflito"; mensagem: string }
  | { tipo: "campo"; erro: ErroDeCampo }
  | { tipo: "falha"; mensagem: string };
export const MENSAGEM_DE_CONFLITO: string; // "Outra pessoa salvou antes. Recarregue pra ver a versão nova."
export const MENSAGENS_DOS_CAMPOS: Readonly<Record<string, string>>; // chave = caminho com "*" ("links.*.numero")
export function ehPaginaBio(v: unknown): v is PaginaBio;
export function ehRespostaDoPainelBio(v: unknown): v is RespostaDoPainelBio;
export function estadoDe(pagina: PaginaBio): EstadoSalvavel;
export function contextoDe(r: RespostaDoPainelBio): ContextoDoEditor;
export function mesmoConteudo(a: unknown, b: unknown): boolean;
export function enderecoPrincipal(c: Pick<ContextoDoEditor, "dominio" | "origemGirumo">, slug: string): string;
export function padraoDoCampo(campo: string): string;
export function mensagemDoCampo(campo: string): string;
export function erroDoDocumento(documento: DocumentoBio): ErroDeCampo | null;
export function resultadoDoSalvar(status: number, corpo: unknown, texto: string): ResultadoDoSalvar;
export const MAX_LINKS = 20;
export type IdDoAtalho = "whatsapp" | "grupo" | "catalogo" | "endereco" | "canal" | "outro";
export type Atalho = { id: IdDoAtalho; nome: string; descricao: string; icone: Icone };
export const ATALHOS: readonly Atalho[];
export const ICONES_DO_SELETOR: readonly (readonly [Icone, string])[];
export const CAMPOS_DO_LINK: readonly ["titulo", "sub", "numero", "mensagem", "campanhaId", "url", "endereco", "horario"];
export type CampoDoLink = (typeof CAMPOS_DO_LINK)[number];
export type ErrosDoLink = Partial<Record<CampoDoLink | "geral", string>>;
export type ContextoDosAvisos = { campanhas: readonly CampanhaDoPainel[]; linksEscondidos: readonly string[]; salvos: readonly LinkBio[] };
export function linkDoAtalho(atalho: IdDoAtalho, o: { id: string; campanhas: readonly CampanhaDoPainel[] }): LinkBio;
export function rascunhoDoLink(link: LinkBio): LinkBio;
export function errosDoLink(issues: readonly { readonly path: readonly PropertyKey[] }[], indice: number): ErrosDoLink;
export function validarLink(link: LinkBio): { ok: true; link: LinkBio } | { ok: false; erros: ErrosDoLink };
export function erroNoLink(erro: ErroDeCampo): { indice: number; erros: ErrosDoLink } | null;
export function primeiroCampoComErro(erros: ErrosDoLink): CampoDoLink | null;
export function resumoDoLink(link: LinkBio, campanhas: readonly CampanhaDoPainel[]): string;
export function avisoDoLink(link: LinkBio, c: ContextoDosAvisos): string | null;
export function contagemDosLinks(links: readonly LinkBio[], c: ContextoDosAvisos): string;
export function comLink(links: readonly LinkBio[], link: LinkBio): LinkBio[];
export function semLink(links: readonly LinkBio[], id: string): LinkBio[];
export function alternarLink(links: readonly LinkBio[], id: string): LinkBio[];
export function moverLink(links: readonly LinkBio[], id: string, passo: -1 | 1): LinkBio[];
export function anuncioDaOrdem(titulo: string, posicao: number, total: number): string;
// Parte 2
export const NOME_DO_MODELO: Readonly<Record<Modelo, string>>;
export function escondidosNaTela(links: readonly LinkBio[], c: ContextoDosAvisos): string[];
export function dadosDaPrevia(pagina: PaginaBio, documento: DocumentoBio, c: ContextoDoEditor): DadosRender;
export type CliqueLido = { defaultPrevented: boolean; button: number; comModificador: boolean; alvo: { href: string; target: string; download: boolean } | null };
export function destinoInterno(c: CliqueLido, aqui: { origin: string; pathname: string; search: string }): string | null;
```

`apps/web/src/components/painel/link-da-bio/use-editor-bio.ts`:

```ts
export type EditorBio = {
  carga: Carga; contexto: ContextoDoEditor | null; pagina: PaginaBio | null; rascunho: EstadoSalvavel | null;
  sujo: boolean; salvando: boolean; criando: boolean;
  conflito: string | null; aviso: string | null; erro: ErroDeCampo | null; rodada: number;
  carregar: () => void; criar: () => void; salvar: () => void; descartar: () => void;
  mudarDocumento: (mudar: (documento: DocumentoBio) => DocumentoBio) => void;
  mudarPagina: (mudanca: Partial<Pick<EstadoSalvavel, "slug" | "publicada">>) => void;
  reverAnimacao: () => void;
  limparErro: () => void;
};
export function useEditorBio(): EditorBio;
export function focarDepois(id: string): void; // foco no próximo quadro (depois do commit)
```

`apps/web/src/components/painel/link-da-bio/abas.tsx` (o registro que o 6b estende):

```ts
export type IdDaAba = "links" | "aparencia" | "perfil" | "divulgar";
export type PropsDaAba = {
  pagina: PaginaBio;                 // versão salva
  rascunho: EstadoSalvavel;          // o que está na tela
  contexto: ContextoDoEditor;        // o resto do GET
  mudarDocumento: EditorBio["mudarDocumento"];
  mudarPagina: EditorBio["mudarPagina"];
  reverAnimacao: () => void;
  erro: ErroDeCampo | null;          // só o erro de que esta aba é dona
  limparErro: () => void;
};
export type AbaDoEditor = { id: IdDaAba; nome: string; dona: (campo: string) => boolean; Conteudo: ComponentType<PropsDaAba> };
export const ABAS: readonly AbaDoEditor[]; // 6a: só { id: "links", … }
export function abaDoErro(erro: ErroDeCampo | null): AbaDoEditor | undefined;
export function abaPelaTecla(atual: number, tecla: string, total: number): number | null;
export function BarraDeAbas(p: { abas: readonly AbaDoEditor[]; atual: IdDaAba; aoEscolher: (id: IdDaAba) => void }): React.JSX.Element;
```

Os outros componentes (`apps/web/src/components/painel/link-da-bio/`):

```ts
// icone-do-link.tsx
export function IconeDoLink(p: { icone: Icone; className?: string }): React.JSX.Element;
export function QuadradoDoIcone(p: { icone: Icone; apagado?: boolean }): React.JSX.Element;
// folha-de-link.tsx
export type InicioDaFolha = { modo: "tipos" } | { modo: "editar"; link: LinkBio; erros?: ErrosDoLink };
export const idDoCampo: (campo: CampoDoLink) => string; // `bio-link-${campo}`
export type PropsDoConteudoDaFolha = {
  rascunho: LinkBio | null; novo: boolean; erros: ErrosDoLink; confirmando: boolean;
  campanhas: readonly CampanhaDoPainel[];
  aoEscolher: (atalho: IdDoAtalho) => void; aoVoltar: () => void;
  aoMudar: (campo: CampoDoLink, valor: string) => void; aoIcone: (icone: Icone) => void; aoDestaque: () => void;
  aoAplicar: () => void; aoCancelar: () => void;
  aoPedirExclusao: () => void; aoCancelarExclusao: () => void; aoExcluir: () => void;
};
export function ConteudoDaFolha(p: PropsDoConteudoDaFolha): React.JSX.Element;
export function FolhaDeLink(p: {
  inicio: InicioDaFolha; campanhas: readonly CampanhaDoPainel[];
  aoAplicar: (link: LinkBio, novo: boolean) => void; aoExcluir: (id: string) => void; aoFechar: () => void;
}): React.JSX.Element;
// aba-links.tsx
export const ID_ADICIONAR = "bio-adicionar-link";
export type PropsDaLista = {
  links: readonly LinkBio[]; ctx: ContextoDosAvisos; reordenando: boolean; movido: string | null;
  aoEditar: (link: LinkBio) => void; aoAlternar: (link: LinkBio) => void; aoMover: (link: LinkBio, passo: -1 | 1) => void;
};
export function ListaDeLinks(p: PropsDaLista): React.JSX.Element;
export function AbaLinks(p: PropsDaAba): React.JSX.Element;
// editor.tsx
export function EditorDoLinkDaBio(): React.JSX.Element;
export function TelaDoEditor(p: { editor: EditorBio; aba: IdDaAba; aoEscolherAba: (aba: IdDaAba) => void; aoCopiar: (url: string) => void }): React.JSX.Element;
// previa.tsx (Parte 2)
export type PropsDaPrevia = { dados: DadosRender; rodada: number; aoReverAnimacao: () => void };
export function QuadroDaPrevia(p: { dados: DadosRender; rodada: number; className?: string }): React.JSX.Element;
export function PreviaNaColuna(p: PropsDaPrevia): React.JSX.Element;
export function PreviaNoCelular(p: PropsDaPrevia): React.JSX.Element;
// guarda-de-saida.ts (Parte 2)
export function useGuardaDeSaida(sujo: boolean): React.ReactNode;
```

Fora da pasta:

- `apps/web/src/app/painel/link-da-bio/page.tsx`: a rota (`"use client"`, `export default function PainelLinkDaBio()`).
- `apps/web/src/components/painel/folha.tsx`: prop nova `telaCheia?: boolean` (Parte 2), classe `pn-folha--tela-cheia`. As outras props não mudam.
- `apps/web/src/app/painel-vitrine.css`: borda do trilho desligado em `.pn-interruptor` (vale para o painel todo); `.pn-bio` (raiz da tela, só marcador para o `:has`), `.pn-bio-salvar`, `.pn-bio-ver`, `.pn-folha--tela-cheia`; `scroll-padding-bottom` em `html:has(.pn-bio)` e `html:has(.pn-bio-salvar)` abaixo de 1024 px.
- `apps/web/e2e/conteudo-esperado.ts`: entrada `"/painel/link-da-bio"` (âncora + lista por `/api/link-da-bio`).
- Ids e `data-testid` que viram contrato (testes, e2e e 6b): `bio-adicionar-link`, `bio-aba-<id>`, `bio-painel-<id>`, `bio-link-<campo>` (+ `-erro`, `-ajuda`), `bio-link-numero-aviso`, `bio-link-<linkId>-aviso`, `bio-atalho-<atalho>`, `bio-subir-<linkId>`, `bio-descer-<linkId>`, `bio-link-excluir`, `bio-links-titulo`, `bio-vazio-titulo`; `data-testid="bio-folha-link"` e `"bio-previa-tela-cheia"`.

### O que este PR usa de outros PRs

| Símbolo | Arquivo | PR |
|---|---|---|
| `documentoBio: z.ZodType<DocumentoBio>`, `documentoPadrao(i: { nome: string; campanhaId: string \| null }): DocumentoBio`, `type DocumentoBio`, `type LinkBio`, `type Icone`, `type Modelo`, `type DadosRender` | `apps/web/src/lib/bio/documento.ts` | 2 |
| `type PaginaBio` (só tipo: o módulo é `server-only`) | `apps/web/src/lib/stores/bio-pages.ts` | 2 |
| `renderPaginaBio(d: DadosRender, o: { modo: "publica" \| "previa"; nonce: string \| null; animarEntrada: boolean }): string` — só a Parte 2, e o módulo tem de rodar no navegador | `apps/web/src/lib/bio/render/index.ts` | 3a |
| `/bio/<slug>` abre (o "Abrir" do cabeçalho; o painel nunca mostra endereço que não abre) | rota pública | 4a |
| `type CampanhaDoPainel`, `type RespostaDoPainelBio`, `type CorpoDoPatchBio` (só tipo: o módulo é `server-only`) | `apps/web/src/lib/bio/painel-api.ts` | 5 |
| `GET`, `POST` e `PATCH /api/link-da-bio` (contrato do §9: 200/201 `PaginaBio`, 400 `{ error, campo? }`, 404, 409 `{ error, motivo }`; 401/403 em texto) | `apps/web/src/app/api/link-da-bio/route.ts` | 5 |
| `Folha`, `Interruptor`, `useConfirmacao`, `useToast`, `ErroDeCarga`, `authenticatedFetch`, `formatPhoneBR`, `cn`, `type Carga` | já em `main` | — |

### Como o 6b encaixa

O 6b cria `aba-aparencia.tsx`, `aba-perfil.tsx` e `aba-divulgar.tsx` (cada uma `export function AbaX(p: PropsDaAba)`) e acrescenta três entradas em `ABAS`, na ordem do §8:

```ts
{ id: "aparencia", nome: "Aparência", dona: (campo) => /^(modelo|paleta|cores|animar)(\.|$)/.test(campo), Conteudo: AbaAparencia },
{ id: "perfil", nome: "Perfil", dona: (campo) => /^(perfil|confere|feitoComGirumo|rastreio)(\.|$)/.test(campo), Conteudo: AbaPerfil },
{ id: "divulgar", nome: "Divulgar", dona: (campo) => campo === "slug" || campo === "publicada", Conteudo: AbaDivulgar },
```

Regras para as abas novas (nada no hook nem na tela muda):

- O documento muda só por `mudarDocumento((d) => ({ ...d, … }))`; slug e "Página no ar" por `mudarPagina({ slug })` e `mudarPagina({ publicada })`. "Alterações não salvas", o PATCH com `versao`, o 409, o Descartar, a guarda de saída e a prévia já valem para elas.
- A entrada da prévia: trocar de modelo chama `mudarDocumento(…)` e `reverAnimacao()` no mesmo clique; o "Rever a animação" da Aparência chama `reverAnimacao()` (o do rodapé da prévia continua). Nenhuma outra mudança chama `reverAnimacao`.
- Erro do salvar: quando `erro` chega não nulo, a aba põe `erro.mensagem` embaixo do campo do caminho `erro.campo`, foca o campo com `focarDepois(id)` e chama `limparErro()` (como a `AbaLinks` faz com `erroNoLink`). Frases novas entram em `MENSAGENS_DOS_CAMPOS` (`"perfil.nome"`, `"perfil.destaques.*"`, `"confere.cnpj"`, `"cores.fundo"`…): elas valem para o erro do navegador (`erroDoDocumento`) e para o 400 sem `error`. O 409 de slug já chega como `{ campo: "slug", mensagem }`.
- Miniatura de modelo: `renderPaginaBio(dadosDaPrevia(pagina, { ...rascunho.documento, modelo, paleta: PALETAS[modelo][0] }, contexto), { modo: "previa", nonce: null, animarEntrada: false })` num `<iframe srcDoc sandbox="">` com `inert`, `tabIndex={-1}` e `aria-hidden`; o rótulo sai de `NOME_DO_MODELO`.
- Endereço do Divulgar: `enderecoPrincipal(contexto, pagina.slug)` é o salvo; o slug em edição é `rascunho.slug`, e a disponibilidade vem de `GET /api/link-da-bio/slug` (`RespostaDoSlug`, PR 5).
- Fotos do botão (`link.fotos`, até 3) e da fachada (`endereco.foto`): campos novos no `Formulario` de `folha-de-link.tsx`. `CAMPOS_DO_LINK` continua só com os de texto; erro de foto já cai em `erros.geral` (`erroNoLink` e `errosDoLink`).
- Item no menu: `lib/painel-nav.ts` (grupo `lotar` do "Mais", depois de Páginas, ícone `Link2`) com o teste de `painel-nav`. É o único arquivo fora de `components/painel/link-da-bio/` que o 6b precisa tocar.
- O "Avançado" do Perfil (Pixel da Meta e GA4) é do PR 7 e segue as mesmas regras (dona = `rastreio`).
