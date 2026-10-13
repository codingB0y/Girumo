# Funil de anúncios — PR 3: Configurações › Integrações › Site próprio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O dono vê, em Configurações › Integrações › Site próprio, se o site dele está mandando cadastros, gera/troca a chave escolhendo o link de destino, copia os parâmetros de URL dos anúncios, lê o contrato para quem programa o site, faz um teste sem gravar nada e vê os 5 últimos cadastros com a situação de cada pessoa.

**Architecture:** Duas rotas novas atrás de `settings:connection`: `GET /api/integracoes/site` (situação, chave mascarada, link, `recebidos_30d` por HEAD+count, 5 últimos) e `POST /api/integracoes/site/teste` (ensaio que monta o redirect sem gravar). A situação de cada cadastro sai de uma função pura que aplica a regra da spec §1 sobre o histórico da pessoa, lido por igualdade de telefone (`variantesDoTelefone`) e conferido pela chave (`chaveDoTelefone`, espelho de `public.phone_key`) — sem SQL novo. A tela é uma porta nova "Integrações" na Vitrine de Configurações, com um componente de estado (`site-proprio.tsx`) e um de desenho testável sem navegador (`site-proprio-painel.tsx`).

**Tech Stack:** Next 15 route handlers, Supabase service-role, React client component, `node:test` com PostgREST falso e `renderToStaticMarkup`, Playwright no job e2e.

**Spec:** `docs/superpowers/specs/2026-10-10-funil-anuncios-design.md` (§1 regras, §3 "Integração", §4 "Configurações › Integrações › Site próprio", §6 bordas, §7 segurança, §8 testes). Mockup: `Integracao.dc.html`. Índice: `docs/superpowers/plans/2026-10-10-funil-anuncios-00-indice.md`.

**Depende de:** PR 1 (tabelas `site_integrations`/`site_captures`, colunas `link_click_events.capture_id`, função `public.phone_key`), PR 2 (`integracaoDaLoja`, `POST /api/integracoes/site/chave`, `lerCadastro`, `redirectDoCadastro`) e PR 4 (cliques gravam `capture_id`). Os três estão em `main`.

## Dividido em DOIS PRs

A spec §10 estimava 5 arquivos; com as duas rotas, a regra da situação, a porta nova e os testes passa de 10. Dois PRs, nesta ordem:

| PR | Conteúdo | Arquivos |
|---|---|---|
| **3a** | `chaveDoTelefone`/`telefoneMascarado`, regra da situação, store de leitura, `GET /api/integracoes/site`, `POST /api/integracoes/site/teste`, teste de integração (paridade com `phone_key` e com `attribution_report`) | 10 |
| **3b** | Porta "Integrações", tela Site próprio (desenho + estado), E2E da tela, E2E da vendedora nas rotas novas | 8 |

O 3b começa **depois do merge do 3a E do PR 5a** (aba Anúncios), em worktree novo a partir de `origin/main`: o 3b chama as rotas do 3a e edita `e2e/vendas-vendedora.spec.ts`, que o 5a também edita. **Antes da Task 9, reler `apps/web/e2e/vendas-vendedora.spec.ts` em `origin/main`** e encaixar o teste novo no estado que estiver lá (o trecho deste plano foi escrito contra `0c16c328`).

## Decisões (registrar no grafo ao fechar o 3b)

1. **Sem DDL.** A situação dos 5 últimos é calculada em TypeScript: `leads` e `orders` são lidos por `in("phone", variantes)` (os dois writers gravam só dígitos; a busca de vendas já faz assim, `findLeadByPhones`) e conferidos por `chaveDoTelefone`, espelho de `public.phone_key`. `site_captures.phone_key` é coluna gerada, filtrável direto. São no máximo 5 pessoas: nada chega perto do teto de 1000. **Risco assumido:** a regra de §1 fica escrita duas vezes (SQL em `attribution_report`, TS em `situacao-do-cadastro.ts`). O que segura as duas juntas é o teste de integração da Task 5 (banco de dev): `chaveDoTelefone` contra `public.phone_key` numa tabela de casos, e a situação de três pessoas de uma fixture (entrou, comprou por pedido sem telefone, já era do grupo) contra o que o `attribution_report` diz delas. Quem mudar a regra no SQL e não no TS quebra esse teste. *Se estiver errado:* telefone gravado fora do padrão "só dígitos" (ex.: `0` de tronco num pedido digitado) não casa aqui mas casa no relatório; a tela diz "Ainda não abriu o link" para quem comprou. Corrigir = função SQL por id de cadastro (DDL do Igor nos dois bancos).
2. **Só os cadastros do site disputam o crédito na tela.** Os das páginas `/p/` (`lp_captures`, 7 no banco inteiro em 10/10) ficam de fora desta tela (o relatório da aba Anúncios continua considerando os dois). *Se estiver errado:* uma pessoa que se cadastrou no site e depois numa página `/p/` aparece aqui com o crédito que o relatório dá à página.
3. **"Enviar cadastro de teste" é um ensaio que não grava.** `POST /api/integracoes/site/teste` passa um cadastro fixo pelo mesmo parser do endpoint real (`lerCadastro`), resolve link e domínio próprio como o real e devolve o redirect com `cid` zerado (que o `/r/` ignora), com `gravado: false`. Nenhuma linha em `site_captures`, nenhum clique, relatório intacto, sem SQL. *Se estiver errado:* o teste prova chave + link + domínio, não que o servidor do site chama a Girumo; isso continua sendo provado pela linha "Último há N min".
4. **Trocar o link de destino exige gerar outra chave.** O seletor alimenta o `POST /chave` que já existe; não há `PATCH` só do link. A tela avisa ("Trocar o link só vale com uma chave nova"). *Se estiver errado:* trocar de link obriga a atualizar o segredo no site; acrescentar `PATCH /api/integracoes/site` + `trocarLink` no store custa ~3 arquivos.
5. **`GET` traz dois campos além do contrato da spec §3:** `gerada_em` ("Gerada em DD/MM" do mockup) e `links` (opções do seletor, `{ id, slug }`), para a tela não depender de `/api/links` (que serve outro formato e cai em lista vazia sem tenant). *Custo se errado:* nenhum consumidor além desta tela.
6. **Quinta situação, fora da lista da spec:** cadastro sem clique, sem entrada e sem pedido → **"Ainda não abriu o link do grupo"** (o site não redirecionou ou a pessoa fechou). Prioridade quando mais de uma vale: Comprou › Já era do grupo › Entrou › Foi pro grupo › Ainda não abriu. Entrada em outro dia sai "Entrou no grupo em DD/MM às HH:MM". *Se estiver errado:* só texto.
7. **`telefoneMascarado` e `chaveDoTelefone` moram em `lib/pages/phone.ts`**, ao lado de `normalizeWhatsappBR`: é o módulo de telefone BR que já é compartilhado (o cadastro do site importa de lá) e não tem `server-only`. A gaveta do PR 6 importa `telefoneMascarado` de `@/lib/pages/phone`. O `maskPhone` de `lib/utils.ts` tem outro formato (`+55 11 •••••-••21`) e fica como está.
8. **Porta "Integrações" aparece para todos os papéis que entram em Configurações**; para quem não tem `settings:connection` (operador) a seção mostra só o recado "Só o dono ou a administração…" (`SiteSemAcesso`, testado) e não chama a rota. A vendedora nem abre `/painel/configuracoes` (fora de `PAGINAS` em `lib/auth/modulos.ts`) e nenhuma rota nova entra em `ROTAS`: o mapa é fechado por padrão, nada a fazer além de não incluir. Prova: o E2E da vendedora (Task 9) recebe 403 nas duas rotas novas; os testes de rota provam o 403 de `operator` e `seller` por `hasPermission`.

## Global Constraints

- Toda query em tabela com `tenant_id` leva `.eq("tenant_id", tenantId)` com o tenant do **contexto** (`getRouteTenantContext(req, { allowEngine: false })`), nunca do corpo nem da URL. Service-role bypassa RLS: o filtro é a proteção.
- `settings:connection` (owner/admin) em `GET /api/integracoes/site` e `POST /api/integracoes/site/teste`; 403 antes de qualquer leitura de dado da loja.
- Telefone sempre mascarado no servidor: `(62) 9••••-4821` (celular) / `(62) ••••-4821` (fixo). A resposta nunca traz `whatsapp`, `phone` nem o número inteiro.
- `recebidos_30d` por `select("id", { count: "exact", head: true })` — nunca contando linhas (PostgREST corta em 1000 sem erro).
- Regra de crédito idêntica à `attribution_report`: último cadastro da mesma chave em `[evento − 7 dias, evento]` para entrada e `[evento − 90 dias, evento]` para pedido, bordas inclusivas, empate pelo id maior; "já era do grupo" = primeira entrada da chave antes do cadastro; telefone do pedido = `phone` aparado, senão o do lead por `lead_id`.
- Erro que não é `Response` → 500 com `console.error` e mensagem genérica; nunca a mensagem do banco.
- Respostas com `cache-control: no-store` (mesmo `resposta()` das rotas do PR 2).
- Rotas Next só exportam handlers e config (`runtime`, `dynamic`): constantes de teste ficam sem `export`.
- Testes: `node:test` + `node:assert/strict`, arquivos `*.test.ts` (o `npm test` só pega `.test.ts`); rodar em `apps/web` com `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`.
- Visual: painel G2 (classes `pn-card`, `pn-aviso`, `pn-skeleton`, `font-data`, raio `var(--radius-control)`); tipografia só na escala do `@theme` (`text-12`, `text-13`, `text-15`, `text-20`…), nunca `text-[Npx]`. Nada de gradiente, blur, itálico, raio > 12 px (`vitrine-lint`). Esqueleto sempre com `role="status"`.
- Datas e horas em `America/Sao_Paulo` (`horaBR`, `diaMesBR`, `dayBROf` de `@/lib/date-br`).
- Nomes acessíveis (contrato com o E2E): seção `data-testid="configuracoes-site"`, título `Site próprio`; botões `Gerar chave` / `Gerar outra chave`, `Copiar a chave`, `Copiar parâmetros`, `Enviar cadastro de teste`, `Tentar de novo`; seletor rotulado `Mandar pro grupo pelo link`; porta `Integrações`; `?secao=integracoes`.
- Commits em inglês com prefixo semântico. O controller commita; implementador não faz push.

## Review Focus

- **Lead gravado sem o nono dígito** (`556299994821`, 12 dígitos) e cadastro com o nono (`+5562999994821`): é a mesma pessoa e a situação tem que dizer "Entrou". Pinado na Task 2 (unidade) e na Task 3 (rota, lead `l5`).
- **Mesma pessoa com dois cadastros:** o mais novo leva a entrada; o antigo não pode dizer "Entrou". Pinado na Task 2.
- **Pedido sem telefone casa pelo lead; pedido de outra pessoa ligado ao mesmo lead não casa.** Pinado na Task 2 (os dois) e na Task 3 (pedido `o1` só por `lead_id`).
- **Operador e vendedora abrindo a porta:** 403 nas duas rotas sem tocar em dado da loja; a tela mostra o recado, nunca "Não deu para carregar". Pinado nas Tasks 3 e 4 (rotas), 7 (`SiteSemAcesso` e `SiteComErro` renderizados) e 9 (E2E da vendedora).
- **Regra reescrita em TS divergindo do SQL** (chave de telefone ou crédito). Pinado na Task 5 (integração no banco de dev).
- **Número inteiro vazando na resposta** (o GET lê `whatsapp` para mascarar): o JSON não pode conter os dígitos. Pinado na Task 3.

---

## Arquivos

| Arquivo | PR | Responsabilidade |
|---|---|---|
| `apps/web/src/lib/pages/phone.ts` (+ `phone.test.ts`) | 3a | `chaveDoTelefone`, `telefoneMascarado` |
| `apps/web/src/lib/integracoes/situacao-do-cadastro.ts` (+ `.test.ts`) | 3a | regra de crédito e texto da situação |
| `apps/web/src/lib/stores/painel-do-site.ts` | 3a | leituras filtradas por tenant para a tela |
| `apps/web/src/app/api/integracoes/site/route.ts` (+ `route.test.ts`) | 3a | `GET` |
| `apps/web/src/app/api/integracoes/site/teste/route.ts` (+ `route.test.ts`) | 3a | ensaio sem gravar |
| `apps/web/src/lib/integracoes/situacao-do-cadastro.integration.test.ts` | 3a | paridade TS × banco (`phone_key`, `attribution_report`), store contra o banco real |
| `apps/web/src/components/painel/configuracoes/site-proprio-painel.tsx` (+ `.test.ts`) | 3b | desenho da seção, recado sem acesso, erro + formatos |
| `apps/web/src/components/painel/configuracoes/site-proprio.tsx` | 3b | estado, chamadas, confirmação |
| `apps/web/src/lib/painel/configuracoes.ts` | 3b | porta "Integrações" |
| `apps/web/src/components/painel/configuracoes/vitrine/configuracoes-vitrine.tsx` | 3b | ligar a porta |
| `apps/web/src/app/painel/configuracoes/page.tsx` | 3b | `?secao=integracoes` |
| `apps/web/e2e/painel-integracao-site.spec.ts` | 3b | porta + GET contra o banco de dev |
| `apps/web/e2e/vendas-vendedora.spec.ts` | 3b | vendedora recebe 403 nas rotas novas |

---

# PR 3a — API

Branch: worktree novo a partir de `origin/main` (`git fetch origin main` antes; base nunca é outra branch de feature).

### Task 1: Chave e máscara de telefone

**Files:**
- Modify: `apps/web/src/lib/pages/phone.ts`
- Modify: `apps/web/src/lib/pages/phone.test.ts`

**Interfaces:**
- Produces:
  - `function chaveDoTelefone(raw: string | null | undefined): string | null` — DDD + últimos 8 dígitos, ou `null`
  - `function telefoneMascarado(raw: string | null | undefined): string` — `(62) 9••••-4821`, `(62) ••••-4821` ou `•••`

- [ ] **Step 1: Write the failing test**

Trocar as duas primeiras linhas de `apps/web/src/lib/pages/phone.test.ts`:

```ts
import assert from "node:assert/strict";
import { normalizeWhatsappBR } from "./phone";
```

por:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { chaveDoTelefone, normalizeWhatsappBR, telefoneMascarado } from "./phone";
```

E acrescentar no fim do arquivo (depois do `console.log("phone tests passed");`):

```ts
test("chave de telefone: os exemplos da spec §1 dão a mesma chave", () => {
  for (const telefone of ["(62) 99999-8888", "556299998888", "+55 62 99999-8888", "5562 9999-8888", "062999998888"]) {
    assert.equal(chaveDoTelefone(telefone), "6299998888", telefone);
  }
  assert.equal(chaveDoTelefone("+5511987654321"), "1187654321");
});

test("chave de telefone: DDD 55 com 11 dígitos não perde o DDD; curto ou vazio é null", () => {
  assert.equal(chaveDoTelefone("55987654321"), "5587654321");
  assert.equal(chaveDoTelefone("999998888"), null);
  assert.equal(chaveDoTelefone(""), null);
  assert.equal(chaveDoTelefone(null), null);
  assert.equal(chaveDoTelefone(undefined), null);
});

test("máscara: DDD, o 9 da frente e os 4 últimos; fixo sem o 9", () => {
  assert.equal(telefoneMascarado("+5562999994821"), "(62) 9••••-4821");
  assert.equal(telefoneMascarado("62999994821"), "(62) 9••••-4821");
  assert.equal(telefoneMascarado("(62) 99999-4821"), "(62) 9••••-4821");
  assert.equal(telefoneMascarado("556299994821"), "(62) ••••-4821");
  assert.equal(telefoneMascarado("55987654321"), "(55) 9••••-4321");
});

test("máscara: o que não é telefone BR não mostra dígito nenhum", () => {
  assert.equal(telefoneMascarado("123"), "•••");
  assert.equal(telefoneMascarado(""), "•••");
  assert.equal(telefoneMascarado(null), "•••");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (em `apps/web`): `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/pages/phone.test.ts`
Expected: FAIL — `chaveDoTelefone` não é exportado.

- [ ] **Step 3: Write minimal implementation**

Acrescentar ao fim de `apps/web/src/lib/pages/phone.ts`:

```ts
/**
 * Dígitos sem os zeros da frente e sem o 55 do país (só quando sobram 12+:
 * com 11, o 55 é o DDD de Santa Maria/RS).
 */
function numeroNacional(raw: string | null | undefined): string {
  const digitos = String(raw ?? "").replace(/\D/g, "").replace(/^0+/, "");
  return digitos.length >= 12 && digitos.startsWith("55") ? digitos.slice(2) : digitos;
}

/**
 * Chave de telefone da atribuição (spec 2026-10-10-funil-anuncios §1): DDD +
 * últimos 8 dígitos. Resolve o nono dígito: com e sem ele dão a mesma chave.
 *
 * Espelho EXATO de `public.phone_key` no banco — mudar um sem o outro faz a
 * tela de integração e o relatório da aba Anúncios discordarem.
 */
export function chaveDoTelefone(raw: string | null | undefined): string | null {
  const d = numeroNacional(raw);
  return d.length >= 10 ? d.slice(0, 2) + d.slice(-8) : null;
}

/**
 * Telefone de terceiro em lista (spec §7): DDD, o 9 da frente do celular e os
 * 4 últimos — `(62) 9••••-4821`. O número inteiro só aparece em Contatos.
 */
export function telefoneMascarado(raw: string | null | undefined): string {
  const d = numeroNacional(raw);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d[2]}••••-${d.slice(-4)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ••••-${d.slice(-4)}`;
  return "•••";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/pages/phone.test.ts`
Expected: PASS (os asserts de topo de `normalizeWhatsappBR` + 4 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/pages/phone.ts apps/web/src/lib/pages/phone.test.ts
git commit -m "feat(pages): phone key mirror of public.phone_key and masked phone for lists"
```

---

### Task 2: Situação de cada cadastro (regra da spec §1)

**Files:**
- Create: `apps/web/src/lib/integracoes/situacao-do-cadastro.ts`
- Test: `apps/web/src/lib/integracoes/situacao-do-cadastro.test.ts`

**Interfaces:**
- Consumes: `chaveDoTelefone`, `telefoneMascarado` de `@/lib/pages/phone` (Task 1); `dayBROf`, `diaMesBR`, `horaBR` de `@/lib/date-br`.
- Produces:
  - `type CadastroLido = { id: string; whatsapp: string; phone_key: string | null; utm_campaign: string | null; utm_content: string | null; created_at: string }`
  - `type CadastroDaChave = Pick<CadastroLido, "id" | "phone_key" | "created_at">`
  - `type LeadLido = { id: string; phone: string | null; entered_at: string }`
  - `type PedidoLido = { id: string; phone: string | null; lead_id: string | null; value: number | string; created_at: string }`
  - `type HistoricoDosCadastros = { ultimos: CadastroLido[]; daChave: CadastroDaChave[]; leads: LeadLido[]; pedidos: PedidoLido[]; comClique: ReadonlySet<string> }`
  - `type LinhaDoCadastro = { hora: string; telefone_mascarado: string; anuncio: string; situacao: string }`
  - `function cadastroCreditado(chave: string, instante: string, janelaMs: number, cadastros: readonly CadastroDaChave[]): string | null`
  - `function situacoesDosCadastros(h: HistoricoDosCadastros): LinhaDoCadastro[]` — uma linha por `h.ultimos`, mesma ordem
  - `const JANELA_ENTRADA_MS`, `const JANELA_VENDA_MS`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/integracoes/situacao-do-cadastro.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cadastroCreditado,
  situacoesDosCadastros,
  type CadastroLido,
  type HistoricoDosCadastros,
} from "./situacao-do-cadastro";

const DIA_MS = 86_400_000;
const mais = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString();

/** 14:52 em Brasília (UTC−3). */
const T0 = "2026-10-10T17:52:00.000Z";

function cadastro(id: string, criado: string, over: Partial<CadastroLido> = {}): CadastroLido {
  return {
    id,
    whatsapp: "+5562999994821",
    phone_key: "6299994821",
    utm_campaign: "Verão",
    utm_content: "Verão Kids — vídeo 15s",
    created_at: criado,
    ...over,
  };
}

function historico(over: Partial<HistoricoDosCadastros>): HistoricoDosCadastros {
  return { ultimos: [], daChave: [], leads: [], pedidos: [], comClique: new Set(), ...over };
}

/** O `Intl` separa "R$" do número com espaço não separável. */
const texto = (s: string) => s.replace(/\s/g, " ");

test("entrou no mesmo dia: hora de Brasília; lead gravado sem o 9 casa pela chave", () => {
  const [linha] = situacoesDosCadastros(
    historico({
      ultimos: [cadastro("c1", T0)],
      leads: [{ id: "l1", phone: "556299994821", entered_at: mais(T0, 60_000) }],
    }),
  );
  assert.deepEqual(linha, {
    hora: T0,
    telefone_mascarado: "(62) 9••••-4821",
    anuncio: "Verão Kids — vídeo 15s",
    situacao: "Entrou no grupo às 14:53",
  });
});

test("entrou em outro dia: a data vai junto da hora", () => {
  const [linha] = situacoesDosCadastros(
    historico({
      ultimos: [cadastro("c1", T0)],
      leads: [{ id: "l1", phone: "5562999994821", entered_at: "2026-10-12T12:05:00.000Z" }],
    }),
  );
  assert.equal(linha.situacao, "Entrou no grupo em 12/10 às 09:05");
});

test("janela de 7 dias: a borda conta, um milissegundo depois não", () => {
  const dentro = situacoesDosCadastros(
    historico({ ultimos: [cadastro("c1", T0)], leads: [{ id: "l1", phone: "5562999994821", entered_at: mais(T0, 7 * DIA_MS) }] }),
  );
  assert.match(dentro[0].situacao, /^Entrou no grupo em /);

  const fora = situacoesDosCadastros(
    historico({
      ultimos: [cadastro("c1", T0)],
      leads: [{ id: "l1", phone: "5562999994821", entered_at: mais(T0, 7 * DIA_MS + 1) }],
      comClique: new Set(["c1"]),
    }),
  );
  assert.equal(fora[0].situacao, "Foi pro grupo, ainda não entrou");
});

test("mesma pessoa com dois cadastros: o mais novo leva a entrada, o antigo não", () => {
  const antigo = cadastro("c-antigo", mais(T0, -2 * 3_600_000));
  const novo = cadastro("c-novo", T0);
  const linhas = situacoesDosCadastros(
    historico({
      ultimos: [novo, antigo],
      leads: [{ id: "l1", phone: "5562999994821", entered_at: mais(T0, 30 * 60_000) }],
    }),
  );
  assert.deepEqual(
    linhas.map((l) => l.situacao),
    ["Entrou no grupo às 15:22", "Ainda não abriu o link do grupo"],
  );
});

test("o cadastro mais novo que não está entre os 5 últimos também tira o crédito", () => {
  const [linha] = situacoesDosCadastros(
    historico({
      ultimos: [cadastro("c1", T0)],
      daChave: [{ id: "c-depois", phone_key: "6299994821", created_at: mais(T0, 60_000) }],
      leads: [{ id: "l1", phone: "5562999994821", entered_at: mais(T0, 120_000) }],
    }),
  );
  assert.equal(linha.situacao, "Ainda não abriu o link do grupo");
});

test("já era do grupo: primeira entrada antes do cadastro, mesmo com clique", () => {
  const [linha] = situacoesDosCadastros(
    historico({
      ultimos: [cadastro("c1", T0)],
      leads: [{ id: "l1", phone: "5562999994821", entered_at: "2026-09-01T12:00:00.000Z" }],
      comClique: new Set(["c1"]),
    }),
  );
  assert.equal(linha.situacao, "Já era do grupo");
});

test("comprou: soma os pedidos creditados; sem telefone vale o do lead; pedido de outra pessoa não entra", () => {
  const [linha] = situacoesDosCadastros(
    historico({
      ultimos: [cadastro("c1", T0)],
      leads: [{ id: "l1", phone: "5562999994821", entered_at: mais(T0, 60_000) }],
      pedidos: [
        { id: "o1", phone: "", lead_id: "l1", value: "720", created_at: mais(T0, DIA_MS) },
        { id: "o2", phone: "5562999994821", lead_id: null, value: 30.5, created_at: mais(T0, 2 * DIA_MS) },
        // ligado ao mesmo lead, mas com telefone de outra pessoa: a chave é a do pedido
        { id: "o3", phone: "5511987654321", lead_id: "l1", value: 999, created_at: mais(T0, DIA_MS) },
        // fora da janela de 90 dias
        { id: "o4", phone: "5562999994821", lead_id: null, value: 500, created_at: mais(T0, 90 * DIA_MS + 1) },
      ],
    }),
  );
  assert.equal(texto(linha.situacao), "Comprou · R$ 750,50");
});

test("comprou vence já era do grupo (o pedido depois do cadastro conta normalmente)", () => {
  const [linha] = situacoesDosCadastros(
    historico({
      ultimos: [cadastro("c1", T0)],
      leads: [{ id: "l1", phone: "5562999994821", entered_at: "2026-09-01T12:00:00.000Z" }],
      pedidos: [{ id: "o1", phone: "5562999994821", lead_id: null, value: 100, created_at: mais(T0, DIA_MS) }],
    }),
  );
  assert.equal(texto(linha.situacao), "Comprou · R$ 100,00");
});

test("anúncio: utm_content, senão utm_campaign, senão (sem UTM)", () => {
  const linhas = situacoesDosCadastros(
    historico({
      ultimos: [
        cadastro("a", T0),
        cadastro("b", T0, { utm_content: "  " }),
        cadastro("c", T0, { utm_content: null, utm_campaign: null }),
      ],
    }),
  );
  assert.deepEqual(linhas.map((l) => l.anuncio), ["Verão Kids — vídeo 15s", "Verão", "(sem UTM)"]);
});

test("crédito: empate no mesmo instante vai para o id maior, como no banco", () => {
  const cadastros = [
    { id: "a", phone_key: "6299994821", created_at: T0 },
    { id: "b", phone_key: "6299994821", created_at: T0 },
    { id: "z", phone_key: "1111111111", created_at: T0 },
  ];
  assert.equal(cadastroCreditado("6299994821", mais(T0, 1000), DIA_MS, cadastros), "b");
  assert.equal(cadastroCreditado("6299994821", mais(T0, -1), DIA_MS, cadastros), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/integracoes/situacao-do-cadastro.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/integracoes/situacao-do-cadastro.ts
import { dayBROf, diaMesBR, horaBR } from "@/lib/date-br";
import { chaveDoTelefone, telefoneMascarado } from "@/lib/pages/phone";

/**
 * A situação de cada um dos últimos cadastros na tela de integração (spec
 * 2026-10-10-funil-anuncios §3), pela MESMA regra de §1 que `attribution_report`
 * aplica no banco: vale o último cadastro da pessoa (chave de telefone) antes do
 * evento — entrada até 7 dias antes, pedido até 90, bordas inclusivas, empate
 * pelo id maior.
 *
 * Puro e sem `server-only`: a tela importa os tipos daqui.
 *
 * ponytail: só os cadastros do SITE disputam o crédito; os das páginas /p/
 * (`lp_captures`, 7 no banco inteiro em 10/10) ficam de fora. Se as páginas
 * crescerem, ler os dois aqui como a função do banco lê.
 */

const DIA_MS = 86_400_000;
export const JANELA_ENTRADA_MS = 7 * DIA_MS;
export const JANELA_VENDA_MS = 90 * DIA_MS;
const SEM_UTM = "(sem UTM)";
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export type CadastroLido = {
  id: string;
  whatsapp: string;
  phone_key: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  created_at: string;
};
export type CadastroDaChave = Pick<CadastroLido, "id" | "phone_key" | "created_at">;
export type LeadLido = { id: string; phone: string | null; entered_at: string };
export type PedidoLido = {
  id: string;
  phone: string | null;
  lead_id: string | null;
  value: number | string;
  created_at: string;
};

export type HistoricoDosCadastros = {
  /** Os últimos cadastros, do mais novo ao mais antigo. */
  ultimos: CadastroLido[];
  /** Todos os cadastros do site com as mesmas chaves (disputam o crédito). */
  daChave: CadastroDaChave[];
  leads: LeadLido[];
  pedidos: PedidoLido[];
  /** Ids de cadastro com pelo menos um clique no link do grupo. */
  comClique: ReadonlySet<string>;
};

export type LinhaDoCadastro = { hora: string; telefone_mascarado: string; anuncio: string; situacao: string };

const ms = (iso: string) => Date.parse(iso);

/** O cadastro que leva o crédito do evento: o último da mesma chave em [instante − janela, instante]. */
export function cadastroCreditado(
  chave: string,
  instante: string,
  janelaMs: number,
  cadastros: readonly CadastroDaChave[],
): string | null {
  const fim = ms(instante);
  let melhor: { id: string; t: number } | null = null;
  for (const c of cadastros) {
    const t = ms(c.created_at);
    if (c.phone_key !== chave || t > fim || t < fim - janelaMs) continue;
    if (!melhor || t > melhor.t || (t === melhor.t && c.id > melhor.id)) melhor = { id: c.id, t };
  }
  return melhor?.id ?? null;
}

/** Soma dos pedidos creditados ao cadastro; `null` = nenhum. */
function vendidoAoCadastro(
  c: CadastroLido,
  chave: string,
  h: HistoricoDosCadastros,
  cadastros: readonly CadastroDaChave[],
): number | null {
  const telefoneDoLead = new Map(h.leads.map((l) => [l.id, l.phone]));
  let total: number | null = null;
  for (const p of h.pedidos) {
    // O mesmo `coalesce(nullif(btrim(o.phone), ''), l.phone)` da função do banco.
    const telefone = p.phone?.trim() || (p.lead_id ? telefoneDoLead.get(p.lead_id) : null);
    if (chaveDoTelefone(telefone) !== chave) continue;
    if (cadastroCreditado(chave, p.created_at, JANELA_VENDA_MS, cadastros) !== c.id) continue;
    total = (total ?? 0) + (Number(p.value) || 0);
  }
  return total;
}

function textoDaEntrada(entrada: string, cadastro: string): string {
  const hora = horaBR(entrada);
  return dayBROf(entrada) === dayBROf(cadastro)
    ? `Entrou no grupo às ${hora}`
    : `Entrou no grupo em ${diaMesBR(entrada)} às ${hora}`;
}

/** Comprou › Já era do grupo › Entrou › Foi pro grupo › Ainda não abriu. */
function situacao(c: CadastroLido, h: HistoricoDosCadastros, cadastros: readonly CadastroDaChave[]): string {
  const chave = c.phone_key;
  if (chave) {
    const vendido = vendidoAoCadastro(c, chave, h, cadastros);
    if (vendido !== null) return `Comprou · ${BRL.format(vendido)}`;
    const entradas = h.leads
      .filter((l) => chaveDoTelefone(l.phone) === chave)
      .map((l) => l.entered_at)
      .sort((a, b) => ms(a) - ms(b));
    if (entradas.length > 0 && ms(entradas[0]) < ms(c.created_at)) return "Já era do grupo";
    const entrada = entradas.find((e) => cadastroCreditado(chave, e, JANELA_ENTRADA_MS, cadastros) === c.id);
    if (entrada) return textoDaEntrada(entrada, c.created_at);
  }
  return h.comClique.has(c.id) ? "Foi pro grupo, ainda não entrou" : "Ainda não abriu o link do grupo";
}

export function situacoesDosCadastros(h: HistoricoDosCadastros): LinhaDoCadastro[] {
  const porId = new Map<string, CadastroDaChave>();
  for (const c of [...h.daChave, ...h.ultimos]) porId.set(c.id, c);
  const cadastros = [...porId.values()];
  return h.ultimos.map((c) => ({
    hora: c.created_at,
    telefone_mascarado: telefoneMascarado(c.whatsapp),
    anuncio: c.utm_content?.trim() || c.utm_campaign?.trim() || SEM_UTM,
    situacao: situacao(c, h, cadastros),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/integracoes/situacao-do-cadastro.test.ts`
Expected: PASS (10 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/integracoes/situacao-do-cadastro.ts apps/web/src/lib/integracoes/situacao-do-cadastro.test.ts
git commit -m "feat(integracoes): signup situation by the attribution rule (last signup before the event)"
```

---

### Task 3: Store de leitura + `GET /api/integracoes/site`

**Files:**
- Create: `apps/web/src/lib/stores/painel-do-site.ts`
- Create: `apps/web/src/app/api/integracoes/site/route.ts`
- Test: `apps/web/src/app/api/integracoes/site/route.test.ts` (cobre o store pelo PostgREST falso)

**Interfaces:**
- Consumes: `situacoesDosCadastros` e os tipos de `@/lib/integracoes/situacao-do-cadastro` (Task 2); `variantesDoTelefone(entrada: string): string[] | null` de `@/lib/vendas/telefone`; `integracaoDaLoja(tenantId): Promise<SiteIntegration | null>` de `@/lib/stores/site-integrations`; `listTrackedLinks(tenantId): Promise<TrackedLink[]>` de `@/lib/stores/tracked-links`; `getRouteTenantContext`, `hasPermission`.
- Produces:
  - `lerPainelDoSite(tenantId: string, desde: string): Promise<HistoricoDosCadastros & { recebidos30d: number }>`
  - `GET /api/integracoes/site` → 200 `{ ativa: boolean, key_last4: string | null, gerada_em: string | null, link: { id: string, slug: string } | null, last_used_at: string | null, recebidos_30d: number, ultimos: LinhaDoCadastro[], links: { id: string, slug: string }[] }`; 403 sem `settings:connection`; 500 genérico.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/app/api/integracoes/site/route.test.ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { GET } from "./route";

/** Dono logado por Bearer contra um Supabase de mentira (molde de site/chave/route.test.ts). */

const LINK = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";
const OUTRO_LINK = "7d6c5b4a-3e2f-4a1b-8c9d-0e1f2a3b4c5d";
type Chamada = { metodo: string; url: URL };
const chamadas: Chamada[] = [];
let papel = "owner";
let integrada = true;
let leadsQuebrado = false;

/** 14:52, 14:47, 14:31, 14:12 e 13:58 em Brasília. */
const CADASTROS = [
  { id: "c5", whatsapp: "+5562999994821", phone_key: "6299994821", utm_campaign: "Verão", utm_content: "Verão Kids — vídeo 15s", created_at: "2026-10-10T17:52:00+00:00" },
  { id: "c4", whatsapp: "+5564999993390", phone_key: "6499993390", utm_campaign: "Provador", utm_content: "Provador ao vivo — reels", created_at: "2026-10-10T17:47:00+00:00" },
  { id: "c3", whatsapp: "+5562999991107", phone_key: "6299991107", utm_campaign: "Kit", utm_content: "Kit 10 peças — carrossel", created_at: "2026-10-10T17:31:00+00:00" },
  { id: "c2", whatsapp: "+5561999990458", phone_key: "6199990458", utm_campaign: null, utm_content: null, created_at: "2026-10-10T17:12:00+00:00" },
  { id: "c1", whatsapp: "+5562999997712", phone_key: "6299997712", utm_campaign: "Verão", utm_content: "Verão Kids — vídeo 15s", created_at: "2026-10-10T16:58:00+00:00" },
];
const LEADS = [
  { id: "l5", phone: "556299994821", entered_at: "2026-10-10T17:53:00+00:00" }, // sem o 9: casa pela chave
  { id: "l3", phone: "5562999991107", entered_at: "2026-09-01T12:00:00+00:00" },
  { id: "l1", phone: "5562999997712", entered_at: "2026-10-10T17:00:00+00:00" },
];
const PEDIDO_PELO_LEAD = { id: "o1", phone: "", lead_id: "l1", value: 720, created_at: "2026-10-10T18:30:00+00:00" };

const supabase = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://supabase.falso");
  chamadas.push({ metodo: req.method ?? "", url });
  const chave = `${req.method} ${url.pathname}`;
  let status = 200;
  let corpo: unknown = [];
  if (url.pathname === "/auth/v1/user") corpo = { id: "usuario-1", email: "dono@loja.test" };
  else if (url.pathname === "/rest/v1/memberships") corpo = [{ tenant_id: "loja-b", role: papel }];
  else if (chave === "GET /rest/v1/site_integrations")
    corpo = integrada
      ? [{ tenant_id: "loja-b", key_last4: "7f2a", tracked_link_id: LINK, created_at: "2026-10-01T12:00:00+00:00", rotated_at: "2026-10-10T12:00:00+00:00", last_used_at: "2026-10-10T17:52:01+00:00" }]
      : [];
  else if (chave === "GET /rest/v1/tracked_links") corpo = [{ id: LINK, slug: "vip-atacado" }, { id: OUTRO_LINK, slug: "moda-sul" }];
  else if (chave === "HEAD /rest/v1/site_captures") res.setHeader("Content-Range", integrada ? "*/612" : "*/0");
  else if (chave === "GET /rest/v1/site_captures") corpo = integrada ? CADASTROS : [];
  else if (chave === "GET /rest/v1/leads") [status, corpo] = leadsQuebrado ? [500, { message: "permission denied for table leads" }] : [200, LEADS];
  else if (chave === "GET /rest/v1/orders") corpo = url.searchParams.has("lead_id") ? [PEDIDO_PELO_LEAD] : [];
  else if (chave === "GET /rest/v1/link_click_events") corpo = [{ capture_id: "c4" }];
  else [status, corpo] = [500, { message: `inesperado: ${chave}` }];
  res.statusCode = status;
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(corpo));
});

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";
  process.env.HUBFLOW_USE_SUPABASE = "1";
});
after(() => { supabase.close(); });

function pedir(): Request {
  return new Request("http://girumo.test/api/integracoes/site", {
    headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-b" },
  });
}

function reiniciar(over: { papel?: string; integrada?: boolean; leadsQuebrado?: boolean } = {}): void {
  chamadas.length = 0;
  papel = over.papel ?? "owner";
  integrada = over.integrada ?? true;
  leadsQuebrado = over.leadsQuebrado ?? false;
}

const doBanco = (c: Chamada) => c.url.pathname.startsWith("/rest/v1/") && c.url.pathname !== "/rest/v1/memberships";

test("dono vê chave mascarada, link, contagem e os 5 últimos com a situação", async () => {
  reiniciar();
  const resposta = await GET(pedir());
  assert.equal(resposta.status, 200);
  assert.equal(resposta.headers.get("cache-control"), "no-store");
  const corpo = await resposta.json();

  assert.equal(corpo.ativa, true);
  assert.equal(corpo.key_last4, "7f2a");
  assert.equal(corpo.gerada_em, "2026-10-10T12:00:00+00:00");
  assert.deepEqual(corpo.link, { id: LINK, slug: "vip-atacado" });
  assert.equal(corpo.last_used_at, "2026-10-10T17:52:01+00:00");
  assert.equal(corpo.recebidos_30d, 612);
  assert.deepEqual(corpo.links, [{ id: LINK, slug: "vip-atacado" }, { id: OUTRO_LINK, slug: "moda-sul" }]);

  assert.deepEqual(
    corpo.ultimos.map((u: { situacao: string }) => u.situacao.replace(/\s/g, " ")),
    [
      "Entrou no grupo às 14:53",
      "Foi pro grupo, ainda não entrou",
      "Já era do grupo",
      "Ainda não abriu o link do grupo",
      "Comprou · R$ 720,00",
    ],
  );
  assert.deepEqual(corpo.ultimos[0], {
    hora: "2026-10-10T17:52:00+00:00",
    telefone_mascarado: "(62) 9••••-4821",
    anuncio: "Verão Kids — vídeo 15s",
    situacao: "Entrou no grupo às 14:53",
  });
  assert.equal(corpo.ultimos[3].anuncio, "(sem UTM)");

  // A contagem é HEAD (count), nunca as linhas: o PostgREST corta em 1000 sem erro.
  const contagem = chamadas.find((c) => c.metodo === "HEAD" && c.url.pathname === "/rest/v1/site_captures");
  assert.match(contagem?.url.searchParams.get("created_at") ?? "", /^gte\./);
  const ultimos = chamadas.find((c) => c.metodo === "GET" && c.url.pathname === "/rest/v1/site_captures" && c.url.searchParams.has("limit"));
  assert.equal(ultimos?.url.searchParams.get("limit"), "5");
  assert.equal(ultimos?.url.searchParams.get("order"), "created_at.desc");
});

test("o número inteiro nunca sai na resposta", async () => {
  reiniciar();
  const texto = await (await GET(pedir())).text();
  for (const c of CADASTROS) assert.ok(!texto.includes(c.whatsapp.slice(5)), c.whatsapp);
  assert.ok(!texto.includes("whatsapp"));
  assert.ok(!texto.includes("phone"));
});

test("toda consulta ao banco filtra pela loja do contexto", async () => {
  reiniciar();
  await GET(pedir());
  const consultas = chamadas.filter(doBanco);
  assert.ok(consultas.length >= 8, `consultas: ${consultas.length}`);
  for (const c of consultas) assert.equal(c.url.searchParams.get("tenant_id"), "eq.loja-b", `${c.metodo} ${c.url.pathname}`);
});

test("operador e vendedora: 403 sem tocar em dado da loja", async () => {
  for (const p of ["operator", "seller"]) {
    reiniciar({ papel: p });
    assert.equal((await GET(pedir())).status, 403);
    assert.equal(chamadas.filter(doBanco).length, 0, p);
  }
});

test("loja sem integração: ativa falsa, sem chave nem link, e nada além dos cadastros é lido", async () => {
  reiniciar({ integrada: false });
  const corpo = await (await GET(pedir())).json();
  assert.equal(corpo.ativa, false);
  assert.equal(corpo.key_last4, null);
  assert.equal(corpo.gerada_em, null);
  assert.equal(corpo.link, null);
  assert.equal(corpo.recebidos_30d, 0);
  assert.deepEqual(corpo.ultimos, []);
  assert.equal(corpo.links.length, 2);
  const lidas = new Set(chamadas.filter(doBanco).map((c) => c.url.pathname));
  assert.ok(!lidas.has("/rest/v1/leads") && !lidas.has("/rest/v1/orders") && !lidas.has("/rest/v1/link_click_events"));
});

test("banco falhando: 500 sem a mensagem do banco", async () => {
  reiniciar({ leadsQuebrado: true });
  const resposta = await GET(pedir());
  assert.equal(resposta.status, 500);
  assert.ok(!(await resposta.text()).includes("permission denied"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/app/api/integracoes/site/route.test.ts`
Expected: FAIL — `./route` não existe.

- [ ] **Step 3: Write the store**

```ts
// apps/web/src/lib/stores/painel-do-site.ts
import "server-only";

import type {
  CadastroDaChave,
  CadastroLido,
  HistoricoDosCadastros,
  LeadLido,
  PedidoLido,
} from "@/lib/integracoes/situacao-do-cadastro";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { variantesDoTelefone } from "@/lib/vendas/telefone";

const ULTIMOS = 5;
const COLUNAS_DO_PEDIDO = "id, phone, lead_id, value, created_at";

type Resultado = { data: unknown; error: { message: string } | null };

async function linhas<T>(consulta: PromiseLike<Resultado> | null): Promise<T[]> {
  if (!consulta) return [];
  const { data, error } = await consulta;
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

/**
 * O que a tela de integração do site mostra (spec 2026-10-10-funil-anuncios §3):
 * quantos cadastros chegaram desde `desde` e os 5 últimos com o histórico da
 * pessoa para a situação (`situacoesDosCadastros`).
 *
 * Toda consulta filtra `tenant_id` — service-role passa por cima do RLS. A
 * contagem é HEAD + count: listar as linhas pararia em 1000 sem erro. O resto é
 * o histórico de no máximo 5 pessoas, longe do teto.
 *
 * `leads` e `orders` são lidos por igualdade de telefone (com/sem 55, com/sem o
 * 9: `variantesDoTelefone`) porque o índice de `phone_key(phone)` é de expressão
 * e o PostgREST não filtra por função. Os dois writers gravam só dígitos
 * (`upsert_lead`, `addOrder`); a chave exata é conferida depois, em
 * `situacoesDosCadastros`.
 */
export async function lerPainelDoSite(
  tenantId: string,
  desde: string,
): Promise<HistoricoDosCadastros & { recebidos30d: number }> {
  const db = getSupabaseAdmin();
  const [ultimos, contagem] = await Promise.all([
    linhas<CadastroLido>(
      db
        .from("site_captures")
        .select("id, whatsapp, phone_key, utm_campaign, utm_content, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(ULTIMOS),
    ),
    db.from("site_captures").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("created_at", desde),
  ]);
  // HEAD não tem corpo: erro chega sem mensagem e contagem ausente é erro, nunca zero.
  if (contagem.error) throw new Error(contagem.error.message || `HTTP ${contagem.status}`);
  if (contagem.count === null || !Number.isInteger(contagem.count)) throw new Error(`HTTP ${contagem.status} sem contagem`);

  const vazio = { ultimos, daChave: [], leads: [], pedidos: [], comClique: new Set<string>(), recebidos30d: contagem.count };
  if (ultimos.length === 0) return vazio;

  const chaves = [...new Set(ultimos.flatMap((c) => (c.phone_key ? [c.phone_key] : [])))];
  const telefones = [...new Set(ultimos.flatMap((c) => variantesDoTelefone(c.whatsapp) ?? []))];
  const [daChave, leads, cliques] = await Promise.all([
    linhas<CadastroDaChave>(
      chaves.length > 0
        ? db.from("site_captures").select("id, phone_key, created_at").eq("tenant_id", tenantId).in("phone_key", chaves)
        : null,
    ),
    linhas<LeadLido>(
      telefones.length > 0
        ? db.from("leads").select("id, phone, entered_at").eq("tenant_id", tenantId).in("phone", telefones)
        : null,
    ),
    linhas<{ capture_id: string }>(
      db.from("link_click_events").select("capture_id").eq("tenant_id", tenantId).in("capture_id", ultimos.map((c) => c.id)),
    ),
  ]);

  const leadIds = leads.map((l) => l.id);
  const [porTelefone, porLead] = await Promise.all([
    linhas<PedidoLido>(
      telefones.length > 0
        ? db.from("orders").select(COLUNAS_DO_PEDIDO).eq("tenant_id", tenantId).in("phone", telefones)
        : null,
    ),
    // Pedido sem telefone casa pelo telefone do lead (o coalesce da função do banco).
    linhas<PedidoLido>(
      leadIds.length > 0
        ? db.from("orders").select(COLUNAS_DO_PEDIDO).eq("tenant_id", tenantId).in("lead_id", leadIds)
        : null,
    ),
  ]);
  const pedidos = [...new Map([...porTelefone, ...porLead].map((p) => [p.id, p])).values()];

  return { ...vazio, daChave, leads, pedidos, comClique: new Set(cliques.map((c) => c.capture_id)) };
}
```

- [ ] **Step 4: Write the route**

```ts
// apps/web/src/app/api/integracoes/site/route.ts
import { situacoesDosCadastros } from "@/lib/integracoes/situacao-do-cadastro";
import { hasPermission } from "@/lib/permissions";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { lerPainelDoSite } from "@/lib/stores/painel-do-site";
import { integracaoDaLoja } from "@/lib/stores/site-integrations";
import { listTrackedLinks } from "@/lib/stores/tracked-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRINTA_DIAS_MS = 30 * 86_400_000;

function resposta(corpo: unknown, status: number): Response {
  return Response.json(corpo, { status, headers: { "cache-control": "no-store" } });
}

/**
 * GET /api/integracoes/site — a tela Configurações › Integrações › Site próprio
 * (spec 2026-10-10-funil-anuncios §3). A chave nunca sai inteira (só os 4
 * últimos) e o telefone sai mascarado: quem vê a lista não vê o número.
 *
 * Além do contrato da spec: `gerada_em` ("Gerada em DD/MM") e `links` (as
 * opções do seletor de destino).
 */
export async function GET(req: Request): Promise<Response> {
  let tenantId: string;
  try {
    const ctx = await getRouteTenantContext(req, { allowEngine: false });
    if (!ctx.role || !hasPermission(ctx.role, "settings:connection")) {
      return resposta({ error: "Sem permissão para esta ação." }, 403);
    }
    tenantId = ctx.tenantId;
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(`[integracoes/site] contexto: ${(e as Error).message}`);
    return resposta({ error: "erro" }, 500);
  }

  try {
    const desde = new Date(Date.now() - TRINTA_DIAS_MS).toISOString();
    const [integracao, links, painel] = await Promise.all([
      integracaoDaLoja(tenantId),
      listTrackedLinks(tenantId),
      lerPainelDoSite(tenantId, desde),
    ]);
    const link = integracao ? links.find((l) => l.id === integracao.trackedLinkId) : undefined;
    return resposta(
      {
        ativa: integracao !== null,
        key_last4: integracao?.keyLast4 ?? null,
        gerada_em: integracao ? (integracao.rotatedAt ?? integracao.createdAt) : null,
        link: link ? { id: link.id, slug: link.slug } : null,
        last_used_at: integracao?.lastUsedAt ?? null,
        recebidos_30d: painel.recebidos30d,
        ultimos: situacoesDosCadastros(painel),
        links: links.map((l) => ({ id: l.id, slug: l.slug })),
      },
      200,
    );
  } catch (e) {
    console.error(`[integracoes/site] ${tenantId}: ${(e as Error).message}`);
    return resposta({ error: "Não foi possível carregar a integração." }, 500);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/app/api/integracoes/site/route.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 6: Tipos**

Run (em `apps/web`): `npx tsc --noEmit`
Expected: sem erro novo. Se o `linhas<T>(builder)` acusar incompatibilidade de tipo do builder do postgrest-js, trocar a assinatura para `consulta: PromiseLike<{ data: unknown; error: { message: string } | null }> | null` com o tipo exato que o `tsc` mostrar — **não** usar `any`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/stores/painel-do-site.ts apps/web/src/app/api/integracoes/site/route.ts apps/web/src/app/api/integracoes/site/route.test.ts
git commit -m "feat(integracoes): GET site integration status, 30-day count and last signups"
```

---

### Task 4: `POST /api/integracoes/site/teste` (ensaio sem gravar)

**Files:**
- Create: `apps/web/src/app/api/integracoes/site/teste/route.ts`
- Test: `apps/web/src/app/api/integracoes/site/teste/route.test.ts`

**Interfaces:**
- Consumes: `lerCadastro(bruto)` de `@/lib/integracoes/cadastro-do-site`; `redirectDoCadastro({ dominioAtivo, slug, captureId })` de `@/lib/integracoes/redirect-do-cadastro`; `integracaoDaLoja`; `getTrackedLinkById(tenantId, id)`; `getCustomDomain(tenantId)` de `@/lib/stores/custom-domains`.
- Produces: `POST /api/integracoes/site/teste` (sem corpo) → 200 `{ gravado: false, enviado: { whatsapp, page_url, event_id }, resposta: { status: 201, corpo: { redirect: string, capture_id: "00000000-0000-0000-0000-000000000000" } } }`; 409 `{ error }` sem chave ou sem link; 403 sem `settings:connection`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/app/api/integracoes/site/teste/route.test.ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { POST } from "./route";

const LINK = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";
const CID_ZERO = "00000000-0000-0000-0000-000000000000";
type Chamada = { metodo: string; url: URL };
const chamadas: Chamada[] = [];
let papel = "owner";
let integrada = true;
let dominio: "active" | "pending" | null = null;

const supabase = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://supabase.falso");
  chamadas.push({ metodo: req.method ?? "", url });
  const chave = `${req.method} ${url.pathname}`;
  let status = 200;
  let corpo: unknown = [];
  if (url.pathname === "/auth/v1/user") corpo = { id: "usuario-1", email: "dono@loja.test" };
  else if (url.pathname === "/rest/v1/memberships") corpo = [{ tenant_id: "loja-b", role: papel }];
  else if (chave === "GET /rest/v1/site_integrations")
    corpo = integrada ? [{ tenant_id: "loja-b", key_last4: "7f2a", tracked_link_id: LINK, created_at: "t", rotated_at: null, last_used_at: null }] : [];
  else if (chave === "GET /rest/v1/tracked_links")
    corpo = [{ id: LINK, tenant_id: "loja-b", slug: "vip-atacado", campaign_group_id: null, target_url: "x", clicks: 0, metadata: {}, created_at: "t", updated_at: "t" }];
  else if (chave === "GET /rest/v1/custom_domains")
    corpo = dominio
      ? [{ tenant_id: "loja-b", hostname: "links.loja.com.br", verification_token: "v", status: dominio, last_error: null, checked_at: null, verified_at: null }]
      : [];
  else [status, corpo] = [500, { message: `inesperado: ${chave}` }];
  res.setHeader("Content-Type", "application/json");
  res.statusCode = status;
  res.end(JSON.stringify(corpo));
});

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";
  process.env.HUBFLOW_USE_SUPABASE = "1";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.girumo.com.br";
});
after(() => { supabase.close(); });

function pedir(): Request {
  return new Request("http://girumo.test/api/integracoes/site/teste", {
    method: "POST",
    headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-b" },
  });
}

function reiniciar(over: { papel?: string; integrada?: boolean; dominio?: "active" | "pending" | null } = {}): void {
  chamadas.length = 0;
  papel = over.papel ?? "owner";
  integrada = over.integrada ?? true;
  dominio = over.dominio ?? null;
}

test("dono testa: vê o que o site mandaria e a resposta, e nada é gravado", async () => {
  reiniciar();
  const resposta = await POST(pedir());
  assert.equal(resposta.status, 200);
  assert.equal(resposta.headers.get("cache-control"), "no-store");
  const corpo = await resposta.json();
  assert.equal(corpo.gravado, false);
  assert.equal(corpo.enviado.whatsapp, "62999998888");
  assert.match(corpo.enviado.page_url, /utm_campaign=/);
  assert.match(corpo.enviado.event_id, /^[A-Za-z0-9_-]{8,100}$/);
  assert.equal(corpo.resposta.status, 201);
  assert.deepEqual(corpo.resposta.corpo, {
    redirect: `https://app.girumo.com.br/r/vip-atacado?cid=${CID_ZERO}`,
    capture_id: CID_ZERO,
  });
  // Ensaio: só leitura. Nenhum cadastro, nenhum clique, nenhuma escrita.
  for (const c of chamadas) assert.equal(c.metodo, "GET", `${c.metodo} ${c.url.pathname}`);
  assert.ok(!chamadas.some((c) => c.url.pathname === "/rest/v1/site_captures"));
  for (const c of chamadas.filter((x) => x.url.pathname.startsWith("/rest/v1/") && x.url.pathname !== "/rest/v1/memberships")) {
    assert.equal(c.url.searchParams.get("tenant_id"), "eq.loja-b", c.url.pathname);
  }
});

test("domínio próprio ativo sai no redirect; pendente não", async () => {
  reiniciar({ dominio: "active" });
  const ativo = await (await POST(pedir())).json();
  assert.equal(ativo.resposta.corpo.redirect, `https://links.loja.com.br/vip-atacado?cid=${CID_ZERO}`);
  reiniciar({ dominio: "pending" });
  const pendente = await (await POST(pedir())).json();
  assert.equal(pendente.resposta.corpo.redirect, `https://app.girumo.com.br/r/vip-atacado?cid=${CID_ZERO}`);
});

test("sem chave: 409 pedindo para gerar antes", async () => {
  reiniciar({ integrada: false });
  const resposta = await POST(pedir());
  assert.equal(resposta.status, 409);
  assert.match((await resposta.json()).error, /Gere a chave/);
});

test("operador e vendedora: 403 sem ler a integração", async () => {
  for (const p of ["operator", "seller"]) {
    reiniciar({ papel: p });
    assert.equal((await POST(pedir())).status, 403);
    assert.ok(!chamadas.some((c) => c.url.pathname === "/rest/v1/site_integrations"), p);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/app/api/integracoes/site/teste/route.test.ts`
Expected: FAIL — `./route` não existe.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/app/api/integracoes/site/teste/route.ts
import { lerCadastro } from "@/lib/integracoes/cadastro-do-site";
import { redirectDoCadastro } from "@/lib/integracoes/redirect-do-cadastro";
import { hasPermission } from "@/lib/permissions";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { getCustomDomain } from "@/lib/stores/custom-domains";
import { integracaoDaLoja } from "@/lib/stores/site-integrations";
import { getTrackedLinkById } from "@/lib/stores/tracked-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Nenhum cadastro tem este id, e o /r/ ignora `cid` que não é desta loja (PR 4). */
const CID_DE_TESTE = "00000000-0000-0000-0000-000000000000";

/** O que um site de verdade mandaria (spec §5). */
const CADASTRO_DE_TESTE = {
  whatsapp: "62999998888",
  page_url:
    "https://seusite.com.br/vip?utm_source=ig&utm_medium=paid&utm_campaign=Teste&utm_term=Conjunto&utm_content=Anuncio",
  event_id: "teste-da-girumo",
};

function resposta(corpo: unknown, status: number): Response {
  return Response.json(corpo, { status, headers: { "cache-control": "no-store" } });
}

/**
 * POST /api/integracoes/site/teste — "Enviar cadastro de teste".
 *
 * Ensaio, não cadastro: passa um cadastro fixo pelo mesmo parser do endpoint
 * real e monta o redirect com a mesma chave/link/domínio, sem gravar nada. Um
 * cadastro de verdade entraria no funil e sujaria o relatório da loja; marcar
 * "teste" no banco pediria SQL novo nos dois bancos. Que o SERVIDOR do site
 * chama a Girumo continua provado pela linha "Último há N min".
 */
export async function POST(req: Request): Promise<Response> {
  let tenantId: string;
  try {
    const ctx = await getRouteTenantContext(req, { allowEngine: false });
    if (!ctx.role || !hasPermission(ctx.role, "settings:connection")) {
      return resposta({ error: "Sem permissão para esta ação." }, 403);
    }
    tenantId = ctx.tenantId;
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(`[integracoes/site/teste] contexto: ${(e as Error).message}`);
    return resposta({ error: "erro" }, 500);
  }

  try {
    const integracao = await integracaoDaLoja(tenantId);
    if (!integracao) return resposta({ error: "Gere a chave antes de testar." }, 409);

    // Se o parser mudar e passar a recusar a amostra, isto aparece aqui e não na loja.
    const lido = lerCadastro(CADASTRO_DE_TESTE);
    if (!lido.ok) throw new Error(`cadastro de teste recusado pelo parser: ${lido.erro}`);

    const [link, dominio] = await Promise.all([
      getTrackedLinkById(tenantId, integracao.trackedLinkId),
      getCustomDomain(tenantId),
    ]);
    if (!link) return resposta({ error: "O link de destino não existe mais. Gere outra chave escolhendo um link." }, 409);

    const redirect = redirectDoCadastro({
      dominioAtivo: dominio?.status === "active" ? dominio.hostname : null,
      slug: link.slug,
      captureId: CID_DE_TESTE,
    });
    return resposta(
      { gravado: false, enviado: CADASTRO_DE_TESTE, resposta: { status: 201, corpo: { redirect, capture_id: CID_DE_TESTE } } },
      200,
    );
  } catch (e) {
    console.error(`[integracoes/site/teste] ${tenantId}: ${(e as Error).message}`);
    return resposta({ error: "Não foi possível testar agora." }, 500);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/app/api/integracoes/site/teste/route.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/integracoes/site/teste/route.ts apps/web/src/app/api/integracoes/site/teste/route.test.ts
git commit -m "feat(integracoes): dry-run test signup that writes nothing"
```

---

### Task 5: Paridade com o banco (integração, banco de dev)

**Files:**
- Create: `apps/web/src/lib/integracoes/situacao-do-cadastro.integration.test.ts`

**Interfaces:**
- Consumes: `chaveDoTelefone` (Task 1); `situacoesDosCadastros` (Task 2); `lerPainelDoSite` (Task 3); `lerRelatorioAnuncios`, `type RelatorioAnuncios` de `@/lib/resultados/relatorio-anuncios`; RPCs `public.phone_key(p text)` (parâmetro `p`, migração `20261010130000`; `service_role` executa) e `public.attribution_report(p_tenant, p_de, p_ate)`.
- Produces: nada além do teste. Roda no job `e2e` do CI (`--test "src/**/*.integration.test.ts"`, banco de dev); sem `E2E_TENANT_ID` pula (o `npm test` local passa por ele pulando), e pula sempre se `SUPABASE_URL` for de produção. Molde: `src/lib/resultados/relatorio-anuncios.integration.test.ts`.

Por que existe: a regra de §1 e a chave de telefone estão escritas duas vezes (SQL e TS). O PostgREST falso da Task 3 não confere nome de coluna nem a regra do banco; este confere as duas coisas na loja descartável que ele cria e apaga.

- [ ] **Step 1: Write the test**

```ts
// apps/web/src/lib/integracoes/situacao-do-cadastro.integration.test.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { chaveDoTelefone } from "@/lib/pages/phone";
import { lerRelatorioAnuncios, type RelatorioAnuncios } from "@/lib/resultados/relatorio-anuncios";
import { lerPainelDoSite } from "@/lib/stores/painel-do-site";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { situacoesDosCadastros } from "./situacao-do-cadastro";

/**
 * A tela de integração reescreve em TypeScript duas coisas que o banco já faz:
 * `public.phone_key` (como `chaveDoTelefone`) e a regra de crédito de
 * `attribution_report` (como `situacoesDosCadastros`). Este teste roda no
 * Supabase de DEV, numa loja descartável criada aqui e apagada no fim, e
 * reprova se as duas cópias contarem histórias diferentes:
 *
 * - Maria: cadastro pelo A1, entra 5 min depois com o lead SEM o nono dígito.
 * - Bia: cadastro pelo A2, entra e compra R$ 250 num pedido SEM telefone (só lead_id).
 * - João: cadastro pelo A3 quando já estava no grupo desde dezembro.
 */

const LIGADO = Boolean(process.env.E2E_TENANT_ID);
const EM_PRODUCAO = (process.env.SUPABASE_URL ?? "").includes("nidoatbxaylrkcgbszns");
const RUN = randomUUID().slice(0, 8);

let loja = "";

function pular(): boolean {
  if (EM_PRODUCAO) {
    console.log("SUPABASE_URL é de produção — teste de integração pulado");
    return true;
  }
  if (!LIGADO) {
    console.log("E2E_TENANT_ID ausente — teste de integração pulado");
    return true;
  }
  return false;
}

async function inserir(tabela: string, linhas: Record<string, unknown>[]): Promise<{ id: string }[]> {
  const { data, error } = await getSupabaseAdmin().from(tabela).insert(linhas).select("id");
  if (error) throw new Error(`${tabela}: ${error.message}`);
  return data as { id: string }[];
}

async function relatorio(de: string, ate: string): Promise<RelatorioAnuncios> {
  const { data, error } = await getSupabaseAdmin().rpc("attribution_report", { p_tenant: loja, p_de: de, p_ate: ate });
  if (error) throw new Error(error.message);
  return lerRelatorioAnuncios(data);
}

function cadastro(evento: string, whatsapp: string, quando: string, anuncio: string) {
  return {
    tenant_id: loja,
    event_id: `${evento}-${RUN}`,
    whatsapp,
    created_at: quando,
    utm_source: "ig",
    utm_campaign: "C1",
    utm_term: "S1",
    utm_content: anuncio,
  };
}

before(async () => {
  if (pular()) return;
  const [org] = await inserir("organizations", [{ name: `sitetest ${RUN}`, slug: `sitetest-${RUN}` }]);
  loja = org.id;

  await inserir("site_captures", [
    cadastro("maria", "+5562999921111", "2026-01-05T10:00:00-03:00", "A1"),
    cadastro("bia", "+5562988822222", "2026-01-06T12:00:00-03:00", "A2"),
    cadastro("joao", "+5562977723333", "2026-01-07T12:00:00-03:00", "A3"),
  ]);
  const [, bia] = await inserir("leads", [
    { tenant_id: loja, phone: "556299921111", entered_at: "2026-01-05T10:05:00-03:00" },
    { tenant_id: loja, phone: "5562988822222", entered_at: "2026-01-06T12:10:00-03:00" },
    { tenant_id: loja, phone: "5562977723333", entered_at: "2025-12-01T12:00:00-03:00" },
  ]);
  await inserir("orders", [
    { tenant_id: loja, phone: "", lead_id: bia.id, value: 250, created_at: "2026-01-10T15:00:00-03:00" },
  ]);
});

after(async () => {
  if (pular() || !loja) return;
  // organizations leva o resto junto (on delete cascade).
  const { error } = await getSupabaseAdmin().from("organizations").delete().eq("id", loja);
  if (error) throw new Error(`limpeza incompleta: ${loja}: ${error.message}`);
});

test("chaveDoTelefone dá a mesma chave que public.phone_key", { skip: pular() }, async () => {
  const casos: (string | null)[] = [
    "(62) 99999-8888",
    "556299998888",
    "+55 62 99999-8888",
    "5562 9999-8888",
    "062999998888",
    "00556299998888",
    "55987654321",
    "999998888",
    "",
    null,
  ];
  for (const caso of casos) {
    const { data, error } = await getSupabaseAdmin().rpc("phone_key", { p: caso });
    if (error) throw new Error(`phone_key(${JSON.stringify(caso)}): ${error.message}`);
    assert.equal(chaveDoTelefone(caso), (data as string | null) ?? null, JSON.stringify(caso));
  }
});

test("a situação da tela conta a mesma história que attribution_report", { skip: pular() }, async () => {
  // O store contra o banco de verdade: nomes de coluna, filtros e HEAD+count.
  const painel = await lerPainelDoSite(loja, "2026-01-01T00:00:00Z");
  assert.equal(painel.recebidos30d, 3);
  const naTela = Object.fromEntries(
    situacoesDosCadastros(painel).map((l) => [l.anuncio, l.situacao.replace(/\s/g, " ")]),
  );
  assert.deepEqual(naTela, {
    A3: "Já era do grupo",
    A2: "Comprou · R$ 250,00",
    A1: "Entrou no grupo às 10:05",
  });

  const r = await relatorio("2026-01-01", "2026-01-31");
  const anuncio = (nome: string) => {
    const achada = r.linhas.find((l) => l.nivel === "anuncio" && l.anuncio === nome);
    assert.ok(achada, `linha do anúncio ${nome} não veio`);
    return achada;
  };
  const a1 = anuncio("A1");
  const a2 = anuncio("A2");
  const a3 = anuncio("A3");
  assert.deepEqual([a1.entraram, a1.compradores], [1, 0], "Maria: entrou, não comprou");
  assert.deepEqual([a2.compradores, a2.vendido], [1, 250], "Bia: comprou R$ 250 pelo lead");
  assert.deepEqual([a3.entraram, a3.ja_membros], [0, 1], "João: já era do grupo");
});
```

- [ ] **Step 2: Run localmente (pula sem credencial)**

Run (em `apps/web`): `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/integracoes/situacao-do-cadastro.integration.test.ts`
Expected: os 2 testes `# SKIP` com "E2E_TENANT_ID ausente". A prova de verdade é o job `e2e` do CI: os 2 testes PASS. Se o `phone_key` reprovar num caso, o TS está errado (o banco é a autoridade): corrigir `chaveDoTelefone`, nunca a tabela de casos.

- [ ] **Step 3: Tipos**

Run: `npx tsc --noEmit`
Expected: sem erro novo (`l.nivel`, `l.anuncio`, `entraram`, `compradores`, `vendido`, `ja_membros` vêm de `LinhaRelatorio`; conferir os nomes em `relatorio-anuncios.ts` se o `tsc` acusar).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/integracoes/situacao-do-cadastro.integration.test.ts
git commit -m "test(integracoes): phone key and signup situation match the database (phone_key, attribution_report)"
```

---

### Task 6: Verificação, PR 3a e card

- [ ] **Step 1: Defasagem.** `git fetch origin main` e `git log HEAD..origin/main --oneline` — se houver commits, `git merge origin/main` antes do push (baseline e testes alheios).
- [ ] **Step 2: Gate local** (em `apps/web`): `npm run lint`, `npx tsc --noEmit`, `npm test`. Expected: tudo verde. Depois, da raiz: `powershell -File infra/scripts/verify-local.ps1` (secrets + build, o gate real do CI).
- [ ] **Step 3: `git diff origin/main --stat`** — exatamente os 10 arquivos da tabela (3a). Nada de `.env*`.
- [ ] **Step 4: Push e PR** "feat(integracoes): site integration status, last signups and dry-run test (funil de anúncios, PR 3a)". Corpo: as decisões 1–3, 5 e 6 deste plano em uma linha cada; "Sem DDL". Terminar com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- [ ] **Step 5:** CI verde (inclusive o job `e2e`, que roda o teste de integração da Task 5) → merge → apagar a branch (mesma sessão).
- [ ] **Step 6: Card** (prod): `select public.move_card('funil-anuncios', 'em_construcao', 'PR 3a: GET da integração do site e teste sem gravar no ar; falta a tela (3b)', 'PR #<n>');`

---

# PR 3b — Tela

Branch: worktree novo a partir de `origin/main` **depois do merge do 3a**.

### Task 7: Desenho da seção Site próprio

**Files:**
- Create: `apps/web/src/components/painel/configuracoes/site-proprio-painel.tsx`
- Test: `apps/web/src/components/painel/configuracoes/site-proprio-painel.test.ts`

**Interfaces:**
- Consumes: `type LinhaDoCadastro` de `@/lib/integracoes/situacao-do-cadastro` (PR 3a); `dayBROf`, `diaMesBR`, `horaBR`.
- Produces:
  - `type LeituraDoSite` (o corpo do GET do 3a)
  - `type TesteDoSite = { enviado: Record<string, string>; resposta: { status: number; corpo: Record<string, string> } }`
  - `type PropsDoPainel = { leitura: LeituraDoSite; agora: Date; origem: string; linkEscolhido: string; onLink: (id: string) => void; chaveNova: string | null; ocupado: "chave" | "teste" | null; teste: TesteDoSite | null; onGerar: () => void; onTestar: () => void }`
  - `function PainelDoSite(p: PropsDoPainel): JSX.Element`
  - `function situacaoDoSite(l: Pick<LeituraDoSite, "ativa" | "last_used_at" | "recebidos_30d">, agora: Date): { titulo: string; detalhe: string | null; tom: "ok" | "alerta" | "neutro" }`
  - `function haQuanto(iso: string, agora: Date): string`, `function quando(iso: string, agora: Date): string`, `function chaveMascarada(last4: string): string`, `const PARAMETROS_DE_URL`
  - `function SiteSemAcesso(): JSX.Element` — recado para quem não tem `settings:connection` (ou recebeu 403)
  - `function SiteComErro({ onTentar }: { onTentar: () => void }): JSX.Element` — "Não deu para carregar" + "Tentar de novo"

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/components/painel/configuracoes/site-proprio-painel.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  PainelDoSite,
  SiteComErro,
  SiteSemAcesso,
  chaveMascarada,
  haQuanto,
  quando,
  situacaoDoSite,
  type LeituraDoSite,
  type PropsDoPainel,
} from "./site-proprio-painel";

const noop = () => {};
/** 14:52 em Brasília. */
const AGORA = new Date("2026-10-10T17:52:00.000Z");
const LEITURA: LeituraDoSite = {
  ativa: true,
  key_last4: "7f2a",
  gerada_em: "2026-10-10T12:00:00.000Z",
  link: { id: "l1", slug: "vip-atacado" },
  last_used_at: "2026-10-10T17:49:00.000Z",
  recebidos_30d: 612,
  ultimos: [
    { hora: "2026-10-10T17:47:00.000Z", telefone_mascarado: "(62) 9••••-4821", anuncio: "Verão Kids — vídeo 15s", situacao: "Entrou no grupo às 14:48" },
  ],
  links: [{ id: "l1", slug: "vip-atacado" }, { id: "l2", slug: "moda-sul" }],
};

function html(over: Partial<PropsDoPainel> = {}, leitura: Partial<LeituraDoSite> = {}): string {
  const props: PropsDoPainel = {
    leitura: { ...LEITURA, ...leitura },
    agora: AGORA,
    origem: "https://app.girumo.com.br",
    linkEscolhido: "l1",
    onLink: noop,
    chaveNova: null,
    ocupado: null,
    teste: null,
    onGerar: noop,
    onTestar: noop,
    ...over,
  };
  return renderToStaticMarkup(createElement(PainelDoSite, props));
}

test("há quanto tempo: minutos, horas e dias", () => {
  assert.equal(haQuanto("2026-10-10T17:51:30.000Z", AGORA), "há menos de 1 min");
  assert.equal(haQuanto("2026-10-10T17:49:00.000Z", AGORA), "há 3 min");
  assert.equal(haQuanto("2026-10-10T12:52:00.000Z", AGORA), "há 5 h");
  assert.equal(haQuanto("2026-10-07T17:52:00.000Z", AGORA), "há 3 dias");
});

test("situação: recebendo, parado há mais de um dia, esperando e desligada", () => {
  assert.deepEqual(situacaoDoSite(LEITURA, AGORA), {
    titulo: "Recebendo cadastros",
    detalhe: "Último há 3 min · 612 nos últimos 30 dias",
    tom: "ok",
  });
  assert.equal(situacaoDoSite({ ...LEITURA, last_used_at: "2026-10-08T17:52:00.000Z" }, AGORA).titulo, "Sem cadastros há mais de um dia");
  assert.equal(situacaoDoSite({ ...LEITURA, last_used_at: "2026-10-08T17:52:00.000Z" }, AGORA).tom, "alerta");
  // Chave recém-gerada zera `last_used_at` (salvarChave): o site ainda não usou a nova.
  assert.equal(situacaoDoSite({ ...LEITURA, last_used_at: null }, AGORA).titulo, "Esperando o primeiro cadastro");
  assert.equal(situacaoDoSite({ ...LEITURA, ativa: false, last_used_at: null }, AGORA).titulo, "Integração desligada");
});

test("hora da lista: só HH:MM hoje; DD/MM HH:MM em outro dia (Brasília)", () => {
  assert.equal(quando("2026-10-10T17:47:00.000Z", AGORA), "14:47");
  assert.equal(quando("2026-10-09T17:47:00.000Z", AGORA), "09/10 14:47");
});

test("chave mascarada mostra só os 4 últimos", () => {
  assert.equal(chaveMascarada("7f2a"), "gk_live_••••••••••••••••7f2a");
});

test("seção com situação, chave mascarada, seletor e Gerar outra chave", () => {
  const h = html();
  assert.match(h, /data-testid="configuracoes-site"/);
  assert.match(h, /Site próprio/);
  assert.match(h, /Recebendo cadastros/);
  assert.match(h, /Último há 3 min · 612 nos últimos 30 dias/);
  assert.match(h, /gk_live_••••••••••••••••7f2a/);
  assert.match(h, /Gerada em 10\/10/);
  assert.match(h, /Mandar pro grupo pelo link/);
  assert.match(h, /<option value="l2">moda-sul<\/option>/);
  assert.match(h, />Gerar outra chave</);
  assert.doesNotMatch(h, /Trocar o link só vale com uma chave nova/);
});

test("link diferente do atual avisa que precisa de chave nova", () => {
  assert.match(html({ linkEscolhido: "l2" }), /Trocar o link só vale com uma chave nova/);
});

test("chave recém-gerada aparece inteira uma vez, com Copiar e o aviso", () => {
  const chave = "gk_live_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";
  const h = html({ chaveNova: chave });
  assert.ok(h.includes(chave));
  assert.match(h, /aria-label="Copiar a chave"/);
  assert.match(h, /não aparece de novo/);
  assert.doesNotMatch(h, /gk_live_••••/);
});

test("sem integração: Gerar chave, e o teste fica desligado", () => {
  const h = html({}, { ativa: false, key_last4: null, gerada_em: null, link: null, last_used_at: null });
  assert.match(h, />Gerar chave</);
  assert.match(h, /<button[^>]*disabled=""[^>]*>Enviar cadastro de teste</);
  assert.match(h, /Integração desligada/);
});

test("sem link de grupo: não dá para gerar a chave", () => {
  const h = html({ linkEscolhido: "" }, { ativa: false, key_last4: null, link: null, last_used_at: null, links: [] });
  assert.match(h, /Crie um link de grupo antes de gerar a chave/);
  assert.match(h, /<button[^>]*disabled=""[^>]*>Gerar chave</);
});

test("parâmetros de URL e contrato do envio com a origem do app", () => {
  const h = html();
  assert.match(h, /utm_source=\{\{site_source_name\}\}&amp;utm_medium=paid&amp;utm_campaign=\{\{campaign\.name\}\}/);
  assert.match(h, /aria-label="Copiar parâmetros"/);
  assert.match(h, /POST https:\/\/app\.girumo\.com\.br\/api\/integracoes\/cadastro/);
  assert.match(h, /nunca do navegador/);
});

test("últimos cadastros: hora, telefone mascarado, anúncio e situação; vazio diz que não chegou nada", () => {
  const h = html();
  assert.match(h, /14:47/);
  assert.match(h, /\(62\) 9••••-4821/);
  assert.match(h, /Entrou no grupo às 14:48/);
  assert.match(html({}, { ultimos: [] }), /Nenhum cadastro recebido ainda/);
});

test("resultado do teste mostra a resposta e avisa que nada foi gravado", () => {
  const h = html({
    teste: {
      enviado: { whatsapp: "62999998888" },
      resposta: { status: 201, corpo: { redirect: "https://app.girumo.com.br/r/vip-atacado?cid=00000000-0000-0000-0000-000000000000" } },
    },
  });
  assert.match(h, /Nada foi gravado/);
  assert.match(h, /vip-atacado\?cid=00000000/);
});

test("sem acesso (operador, ou 403 da rota): recado, sem chave, sem erro e sem botão", () => {
  const h = renderToStaticMarkup(createElement(SiteSemAcesso));
  assert.match(h, /data-testid="configuracoes-site"/);
  assert.match(h, /Site próprio/);
  assert.match(h, /Só o dono ou a administração da loja mexe na integração do site/);
  assert.doesNotMatch(h, /Não deu para carregar/);
  assert.doesNotMatch(h, /gk_live_/);
  assert.doesNotMatch(h, /<button/);
});

test("erro de carga: avisa e oferece Tentar de novo, sem fingir integração desligada", () => {
  const h = renderToStaticMarkup(createElement(SiteComErro, { onTentar: noop }));
  assert.match(h, /data-testid="configuracoes-site"/);
  assert.match(h, /role="alert"[^>]*>Não deu para carregar a integração do site/);
  assert.match(h, /<button[^>]*>Tentar de novo<\/button>/);
  assert.doesNotMatch(h, /Integração desligada/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/configuracoes/site-proprio-painel.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/web/src/components/painel/configuracoes/site-proprio-painel.tsx
"use client";

import { useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { dayBROf, diaMesBR, horaBR } from "@/lib/date-br";
import type { LinhaDoCadastro } from "@/lib/integracoes/situacao-do-cadastro";
import { cn } from "@/lib/utils";

/** Corpo de GET /api/integracoes/site (spec 2026-10-10-funil-anuncios §3, + `gerada_em` e `links`). */
export type LeituraDoSite = {
  ativa: boolean;
  key_last4: string | null;
  gerada_em: string | null;
  link: { id: string; slug: string } | null;
  last_used_at: string | null;
  recebidos_30d: number;
  ultimos: LinhaDoCadastro[];
  links: { id: string; slug: string }[];
};

/** Corpo de POST /api/integracoes/site/teste — nada é gravado. */
export type TesteDoSite = {
  enviado: Record<string, string>;
  resposta: { status: number; corpo: Record<string, string> };
};

export type PropsDoPainel = {
  leitura: LeituraDoSite;
  agora: Date;
  /** Origem do app ("https://app.girumo.com.br"), para o contrato do envio. */
  origem: string;
  linkEscolhido: string;
  onLink: (id: string) => void;
  /** A chave inteira, só logo depois de gerada. */
  chaveNova: string | null;
  ocupado: "chave" | "teste" | null;
  teste: TesteDoSite | null;
  onGerar: () => void;
  onTestar: () => void;
};

/** O que o lojista cola em anúncio › Rastreamento › Parâmetros de URL (spec §1). */
export const PARAMETROS_DE_URL =
  "utm_source={{site_source_name}}&utm_medium=paid&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}";

const MINUTO_MS = 60_000;
const HORA_MS = 60 * MINUTO_MS;
const DIA_MS = 24 * HORA_MS;

const CARTAO = "pn-card rounded-[var(--radius-control)] p-6 lg:p-8";
const TITULO = "text-15 font-semibold text-volt-950";
const AJUDA = "mt-1 text-13 text-slate-600";
const CODIGO =
  "font-data mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-[var(--radius-control)] border border-line-200 bg-canvas-100 p-3 text-12 text-volt-950";
const PRIMARIO =
  "inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-volt-950 px-4 text-15 font-semibold text-paper-0 transition-colors hover:bg-volt-800 disabled:cursor-not-allowed disabled:bg-volt-950/30";
const SECUNDARIO =
  "inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-line-200 px-4 text-15 font-semibold text-volt-950 transition-colors hover:bg-canvas-100 disabled:cursor-not-allowed disabled:opacity-60";

export function haQuanto(iso: string, agora: Date): string {
  const passou = Math.max(0, agora.getTime() - Date.parse(iso));
  if (passou < MINUTO_MS) return "há menos de 1 min";
  if (passou < HORA_MS) return `há ${Math.floor(passou / MINUTO_MS)} min`;
  if (passou < 2 * DIA_MS) return `há ${Math.floor(passou / HORA_MS)} h`;
  return `há ${Math.floor(passou / DIA_MS)} dias`;
}

/**
 * Parado há mais de um dia costuma ser chave trocada sem atualizar o site
 * (spec §6): o site cai no link de sempre e ninguém vê, só esta linha.
 */
export function situacaoDoSite(
  l: Pick<LeituraDoSite, "ativa" | "last_used_at" | "recebidos_30d">,
  agora: Date,
): { titulo: string; detalhe: string | null; tom: "ok" | "alerta" | "neutro" } {
  const nos30 = `${l.recebidos_30d.toLocaleString("pt-BR")} nos últimos 30 dias`;
  if (!l.ativa) return { titulo: "Integração desligada", detalhe: "Gere a chave e entregue a quem programa o site.", tom: "neutro" };
  if (!l.last_used_at) return { titulo: "Esperando o primeiro cadastro", detalhe: nos30, tom: "neutro" };
  const parado = agora.getTime() - Date.parse(l.last_used_at) > DIA_MS;
  return {
    titulo: parado ? "Sem cadastros há mais de um dia" : "Recebendo cadastros",
    detalhe: `Último ${haQuanto(l.last_used_at, agora)} · ${nos30}`,
    tom: parado ? "alerta" : "ok",
  };
}

/** Hora de Brasília; a data só entra quando não é hoje. */
export function quando(iso: string, agora: Date): string {
  return dayBROf(iso) === dayBROf(agora.toISOString()) ? horaBR(iso) : `${diaMesBR(iso)} ${horaBR(iso)}`;
}

export function chaveMascarada(last4: string): string {
  return `gk_live_${"•".repeat(16)}${last4}`;
}

function exemploDeEnvio(origem: string): string {
  return [
    `POST ${origem}/api/integracoes/cadastro`,
    "Authorization: Bearer gk_live_…",
    "Content-Type: application/json",
    "",
    "{",
    '  "whatsapp": "62999998888",',
    '  "page_url": "https://seusite.com.br/vip?utm_source=…",',
    '  "event_id": "id único do cadastro",',
    '  "fbc": "cookie _fbc (opcional)",',
    '  "fbp": "cookie _fbp (opcional)"',
    "}",
  ].join("\n");
}

const EXEMPLO_DE_RESPOSTA = [
  "201 cadastro novo · 200 mesmo event_id de novo (não duplica)",
  "{",
  '  "redirect": "<link do grupo>?cid=<id do cadastro>",',
  '  "capture_id": "<id do cadastro>"',
  "}",
  "",
  '422 { "error": "numero" }: WhatsApp inválido, peça de novo.',
  "Qualquer outra resposta, ou 2 s sem resposta: mande para o link de sempre.",
].join("\n");

function BotaoCopiar({ valor, rotulo }: { valor: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      /* clipboard indisponível: o valor continua na tela para copiar à mão */
    }
  }
  return (
    <button type="button" onClick={copiar} aria-label={rotulo} className={cn(SECUNDARIO, "min-h-9 shrink-0 px-3 text-13")}>
      {copiado ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
      {copiado ? "Copiado" : "Copiar"}
    </button>
  );
}

function CartaoDaSituacao(p: PropsDoPainel) {
  const situacao = situacaoDoSite(p.leitura, p.agora);
  return (
    <section className={CARTAO} aria-labelledby="site-proprio-titulo">
      <h2 id="site-proprio-titulo" className="text-20 font-semibold text-volt-950">
        Site próprio
      </h2>
      <p className={AJUDA}>
        Seu site manda cada cadastro pra Girumo e recebe de volta o link do grupo. Assim cada venda sabe de qual anúncio
        veio.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-line-200 pt-5">
        <div role="status">
          <p
            className={cn(
              "text-15 font-semibold",
              situacao.tom === "ok" ? "text-success-700" : situacao.tom === "alerta" ? "text-warning-700" : "text-volt-950",
            )}
          >
            {situacao.titulo}
          </p>
          {situacao.detalhe && <p className="font-data mt-0.5 text-13 text-slate-600">{situacao.detalhe}</p>}
        </div>
        <button type="button" onClick={p.onTestar} disabled={!p.leitura.ativa || p.ocupado !== null} className={SECUNDARIO}>
          {p.ocupado === "teste" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Enviar cadastro de teste
        </button>
      </div>
      {p.teste && (
        <div role="status" className="mt-4">
          <p className="text-13 text-volt-950">
            A Girumo responderia {p.teste.resposta.status} ao seu site. Nada foi gravado: o relatório da loja não muda.
          </p>
          <pre className={CODIGO}>{JSON.stringify(p.teste.resposta.corpo, null, 2)}</pre>
        </div>
      )}
    </section>
  );
}

function CartaoDaChave(p: PropsDoPainel) {
  const { leitura } = p;
  const semLinks = leitura.links.length === 0;
  return (
    <section className={CARTAO} aria-labelledby="site-chave-titulo">
      <h3 id="site-chave-titulo" className={TITULO}>
        Chave da integração
      </h3>
      {p.chaveNova ? (
        <div role="status" className="pn-aviso mt-3 rounded-[var(--radius-control)] p-4">
          <p className="text-13 text-volt-950">
            Guarde agora: esta chave não aparece de novo. Entregue a quem programa o site; ela fica no servidor do site,
            nunca na página.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="font-data min-w-0 flex-1 break-all text-13 text-volt-950">{p.chaveNova}</code>
            <BotaoCopiar valor={p.chaveNova} rotulo="Copiar a chave" />
          </div>
        </div>
      ) : leitura.ativa && leitura.key_last4 ? (
        <p className="font-data mt-3 break-all text-15 text-volt-950">{chaveMascarada(leitura.key_last4)}</p>
      ) : (
        <p className={AJUDA}>Nenhuma chave ainda.</p>
      )}
      {leitura.ativa && leitura.gerada_em && (
        <p className={AJUDA}>
          {/* Uma string só: texto + expressão viraria "Gerada em <!-- -->10/10" no HTML. */}
          {`Gerada em ${diaMesBR(leitura.gerada_em)}. A chave só aparece inteira uma vez, quando é gerada. Gerar outra desliga a atual na hora: o site precisa receber a nova antes.`}
        </p>
      )}
      <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-line-200 pt-5">
        {semLinks ? (
          <p className="text-13 text-slate-600">Crie um link de grupo antes de gerar a chave.</p>
        ) : (
          <div className="min-w-[220px] flex-1">
            <label htmlFor="site-proprio-link" className="mb-1.5 block text-13 font-semibold text-volt-950">
              Mandar pro grupo pelo link
            </label>
            <select
              id="site-proprio-link"
              value={p.linkEscolhido}
              onChange={(e) => p.onLink(e.target.value)}
              className="min-h-11 w-full rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-15 text-volt-950"
            >
              {leitura.links.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.slug}
                </option>
              ))}
            </select>
            {leitura.ativa && leitura.link && p.linkEscolhido !== leitura.link.id && (
              <p className="mt-1 text-13 text-slate-600">Trocar o link só vale com uma chave nova.</p>
            )}
          </div>
        )}
        <button type="button" onClick={p.onGerar} disabled={semLinks || p.ocupado !== null} className={PRIMARIO}>
          {p.ocupado === "chave" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {leitura.ativa ? "Gerar outra chave" : "Gerar chave"}
        </button>
      </div>
    </section>
  );
}

function CartaoDosParametros() {
  return (
    <section className={CARTAO} aria-labelledby="site-utm-titulo">
      <h3 id="site-utm-titulo" className={TITULO}>
        Parâmetros de URL dos anúncios
      </h3>
      <p className={AJUDA}>
        No Gerenciador de Anúncios: anúncio › Rastreamento › Parâmetros de URL. Cole uma vez; o Meta preenche campanha,
        conjunto e anúncio sozinho.
      </p>
      <div className="mt-3 flex items-start gap-2 rounded-[var(--radius-control)] border border-line-200 bg-canvas-100 p-3">
        <code className="font-data min-w-0 flex-1 break-all text-13 text-volt-950">{PARAMETROS_DE_URL}</code>
        <BotaoCopiar valor={PARAMETROS_DE_URL} rotulo="Copiar parâmetros" />
      </div>
      <p className={AJUDA}>Renomear um anúncio no Meta separa o histórico dele em dois nomes aqui.</p>
    </section>
  );
}

function CartaoParaQuemPrograma({ origem }: { origem: string }) {
  return (
    <section className={CARTAO} aria-labelledby="site-dev-titulo">
      <h3 id="site-dev-titulo" className={TITULO}>
        Para quem programa o site
      </h3>
      <p className={AJUDA}>
        Chame do servidor do site (nunca do navegador: a chave é secreta). Se a Girumo não responder em 2 segundos, mande
        a pessoa pro link de sempre. Ela nunca fica fora do grupo por causa disto.
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="min-w-0">
          <p className="text-12 font-semibold text-slate-600">O site envia</p>
          <pre className={CODIGO}>{exemploDeEnvio(origem)}</pre>
        </div>
        <div className="min-w-0">
          <p className="text-12 font-semibold text-slate-600">A Girumo responde</p>
          <pre className={CODIGO}>{EXEMPLO_DE_RESPOSTA}</pre>
        </div>
      </div>
    </section>
  );
}

function CartaoDosUltimos({ ultimos, agora }: { ultimos: LinhaDoCadastro[]; agora: Date }) {
  return (
    <section className={CARTAO} aria-labelledby="site-ultimos-titulo">
      <h3 id="site-ultimos-titulo" className={TITULO}>
        Últimos cadastros recebidos
      </h3>
      {ultimos.length === 0 ? (
        <p className={AJUDA}>Nenhum cadastro recebido ainda.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr className="text-12 text-slate-600">
                <th scope="col" className="pb-2 font-normal">Hora</th>
                <th scope="col" className="pb-2 font-normal">WhatsApp</th>
                <th scope="col" className="pb-2 font-normal">Anúncio</th>
                <th scope="col" className="pb-2 font-normal">Situação</th>
              </tr>
            </thead>
            <tbody>
              {ultimos.map((u, i) => (
                <tr key={`${u.hora}-${i}`} className="border-t border-line-200 align-top">
                  <td className="font-data py-3 pr-3 text-13 text-volt-950">{quando(u.hora, agora)}</td>
                  <td className="font-data py-3 pr-3 text-13 text-volt-950">{u.telefone_mascarado}</td>
                  <td className="py-3 pr-3 text-13 text-volt-950">{u.anuncio}</td>
                  <td
                    className={cn(
                      "py-3 text-13",
                      /^(Entrou|Comprou)/.test(u.situacao) ? "text-success-700" : "text-slate-600",
                    )}
                  >
                    {u.situacao}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * Quem não tem `settings:connection` (operador) ou recebeu 403 da rota. Recado,
 * nunca "Não deu para carregar": nada quebrou, a área é que não é dele.
 */
export function SiteSemAcesso() {
  return (
    <section className={CARTAO} data-testid="configuracoes-site" aria-labelledby="site-proprio-titulo">
      <h2 id="site-proprio-titulo" className="text-20 font-semibold text-volt-950">
        Site próprio
      </h2>
      <p className="mt-2 text-13 text-slate-600">Só o dono ou a administração da loja mexe na integração do site.</p>
    </section>
  );
}

/** A rota falhou: dizer isso, nunca mostrar "desligada" (seria zero inventado, padrão `carga` da Vitrine). */
export function SiteComErro({ onTentar }: { onTentar: () => void }) {
  return (
    <section className={CARTAO} data-testid="configuracoes-site" aria-labelledby="site-proprio-titulo">
      <h2 id="site-proprio-titulo" className="text-20 font-semibold text-volt-950">
        Site próprio
      </h2>
      <p role="alert" className="mt-2 text-13 text-danger-700">Não deu para carregar a integração do site.</p>
      <button type="button" onClick={onTentar} className={cn(SECUNDARIO, "mt-4")}>
        Tentar de novo
      </button>
    </section>
  );
}

/**
 * Configurações › Integrações › Site próprio (spec §4, mockup Integracao.dc.html).
 * Só desenho: estado e chamadas ficam em `site-proprio.tsx`.
 */
export function PainelDoSite(p: PropsDoPainel) {
  return (
    <div className="space-y-6" data-testid="configuracoes-site">
      <CartaoDaSituacao {...p} />
      <CartaoDaChave {...p} />
      <CartaoDosParametros />
      <CartaoParaQuemPrograma origem={p.origem} />
      <CartaoDosUltimos ultimos={p.leitura.ultimos} agora={p.agora} />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/configuracoes/site-proprio-painel.test.ts`
Expected: PASS (14 testes). Se o atributo `disabled=""` sair em outra posição na tag, o regex `<button[^>]*disabled=""[^>]*>` continua casando; se o texto do botão vier depois de um comentário do React, ajustar o regex para `>(?:<!-- -->)?Gerar chave<` — não mudar o componente para agradar o teste.

- [ ] **Step 5: Lint do painel**

Run (em `apps/web`): `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/painel/vitrine-lint.test.ts` e `npm run lint`
Expected: PASS (sem gradiente/blur/itálico/raio > 12 px; esqueleto anunciado).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/painel/configuracoes/site-proprio-painel.tsx apps/web/src/components/painel/configuracoes/site-proprio-painel.test.ts
git commit -m "feat(configuracoes): site integration panel layout (status, key, URL params, contract, last signups)"
```

---

### Task 8: Estado da seção e porta "Integrações"

**Files:**
- Create: `apps/web/src/components/painel/configuracoes/site-proprio.tsx`
- Modify: `apps/web/src/lib/painel/configuracoes.ts` (tipo `Porta` e `resumoDasPortas`)
- Modify: `apps/web/src/components/painel/configuracoes/vitrine/configuracoes-vitrine.tsx` (`PORTAS`, import, render)
- Modify: `apps/web/src/app/painel/configuracoes/page.tsx` (`Section`, `SECAO_POR_SLUG`)

**Interfaces:**
- Consumes: `PainelDoSite`, `LeituraDoSite`, `TesteDoSite`, `SiteSemAcesso`, `SiteComErro` (Task 7); `GET /api/integracoes/site`, `POST /api/integracoes/site/teste` (PR 3a); `POST /api/integracoes/site/chave` `{ tracked_link_id }` → 201 `{ chave, key_last4, link }` (PR 2); `useRole().can`, `useToast()`, `useConfirmacao()`, `authenticatedFetch`.
- Produces: `function SiteProprio(): JSX.Element`; `type Porta = "Conexão" | "Integrações" | "Equipe" | "Notificações" | "Plano" | "Conta"`; `?secao=integracoes`.

Sem teste unitário novo de propósito: o resumo da porta é uma constante (`null`), e `Record<Porta, string | null>` em `resumoDasPortas` já obriga a chave no `tsc`. O desenho e os dois estados de recado são testados na Task 7; a ligação da porta, no E2E da Task 9.

- [ ] **Step 1: Porta no modelo** (conferido contra `origin/main` `0c16c328`, depois do #435: o tipo `Porta` continua na linha ~19 e `resumoDasPortas` na ~126)

Em `apps/web/src/lib/painel/configuracoes.ts`, trocar:

```ts
export type Porta = "Conexão" | "Equipe" | "Notificações" | "Plano" | "Conta";
```

por:

```ts
export type Porta = "Conexão" | "Integrações" | "Equipe" | "Notificações" | "Plano" | "Conta";
```

e, dentro do objeto devolvido por `resumoDasPortas`, logo depois da linha de `"Conexão"`:

```ts
    // A integração do site carrega a própria leitura dentro da seção (só dono
    // e administração podem lê-la): a porta não escreve o que não sabe.
    "Integrações": null,
```

- [ ] **Step 2: Confere que os testes existentes continuam verdes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/painel/configuracoes.test.ts`
Expected: PASS (nada mudou no que eles medem).

- [ ] **Step 3: O componente de estado**

```tsx
// apps/web/src/components/painel/configuracoes/site-proprio.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useConfirmacao } from "@/components/painel/confirmacao";
import { useRole } from "@/components/painel/role-provider";
import { useToast } from "@/components/toast";
import { authenticatedFetch } from "@/lib/supabase/client";
import {
  PainelDoSite,
  SiteComErro,
  SiteSemAcesso,
  type LeituraDoSite,
  type TesteDoSite,
} from "./site-proprio-painel";

type Carga = "carregando" | "ok" | "erro" | "proibido";

/**
 * Configurações › Integrações › Site próprio (spec 2026-10-10-funil-anuncios §4):
 * estado e chamadas. O desenho é `PainelDoSite`, testado sem navegador.
 *
 * Só dono e administração (`settings:connection`) leem a integração; o operador
 * vê o recado e a rota nem é chamada. 403 da rota cai no mesmo recado, nunca em
 * "Não deu para carregar" — que diria que algo quebrou quando nada quebrou.
 */
export function SiteProprio() {
  const { can } = useRole();
  const toast = useToast();
  const { pedirConfirmacao, folhaDeConfirmacao } = useConfirmacao();
  const pode = can("settings:connection");
  const [carga, setCarga] = useState<Carga>("carregando");
  const [leitura, setLeitura] = useState<LeituraDoSite | null>(null);
  const [agora, setAgora] = useState(() => new Date());
  const [origem, setOrigem] = useState("");
  const [linkEscolhido, setLinkEscolhido] = useState("");
  const [chaveNova, setChaveNova] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<"chave" | "teste" | null>(null);
  const [teste, setTeste] = useState<TesteDoSite | null>(null);

  const carregar = useCallback(async () => {
    // Recarga depois de gerar a chave não volta ao esqueleto: a chave nova continua na tela.
    setCarga((atual) => (atual === "ok" ? atual : "carregando"));
    try {
      const res = await authenticatedFetch("/api/integracoes/site");
      if (res.status === 403) {
        setCarga("proibido");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const dados = (await res.json()) as LeituraDoSite;
      setLeitura(dados);
      setAgora(new Date());
      setLinkEscolhido((atual) => atual || dados.link?.id || dados.links[0]?.id || "");
      setCarga("ok");
    } catch {
      setCarga("erro");
    }
  }, []);

  useEffect(() => {
    setOrigem(window.location.origin);
    if (pode) void carregar();
  }, [pode, carregar]);

  async function gerar() {
    if (!leitura || !linkEscolhido) return;
    if (leitura.ativa) {
      const ok = await pedirConfirmacao({
        titulo: "Gerar outra chave",
        texto:
          "A chave atual para de funcionar na hora. Até o site receber a nova, os cadastros vão direto pro link de sempre, sem origem.",
        rotulo: "Gerar outra chave",
        destrutivo: true,
      });
      if (!ok) return;
    }
    setOcupado("chave");
    try {
      const res = await authenticatedFetch("/api/integracoes/site/chave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tracked_link_id: linkEscolhido }),
      });
      const corpo = (await res.json().catch(() => ({}))) as { chave?: string; error?: string };
      if (!res.ok || !corpo.chave) {
        toast(corpo.error || "Não foi possível gerar a chave.", "error");
        return;
      }
      setChaveNova(corpo.chave);
      setTeste(null);
      await carregar();
    } catch {
      toast("Erro de conexão.", "error");
    } finally {
      setOcupado(null);
    }
  }

  async function testar() {
    setOcupado("teste");
    try {
      const res = await authenticatedFetch("/api/integracoes/site/teste", { method: "POST" });
      const corpo = (await res.json().catch(() => ({}))) as Partial<TesteDoSite> & { error?: string };
      if (!res.ok || !corpo.resposta) {
        toast(corpo.error || "O teste não respondeu. Tente de novo.", "error");
        return;
      }
      setTeste({ enviado: corpo.enviado ?? {}, resposta: corpo.resposta });
    } catch {
      toast("Erro de conexão.", "error");
    } finally {
      setOcupado(null);
    }
  }

  if (!pode || carga === "proibido") return <SiteSemAcesso />;
  if (carga === "erro") return <SiteComErro onTentar={() => void carregar()} />;
  if (carga === "carregando" || !leitura) {
    return (
      <div
        className="pn-skeleton h-40 rounded-[var(--radius-control)]"
        data-testid="painel-skeleton"
        role="status"
        aria-label="Carregando a integração do site"
      />
    );
  }

  return (
    <>
      <PainelDoSite
        leitura={leitura}
        agora={agora}
        origem={origem}
        linkEscolhido={linkEscolhido}
        onLink={setLinkEscolhido}
        chaveNova={chaveNova}
        ocupado={ocupado}
        teste={teste}
        onGerar={() => void gerar()}
        onTestar={() => void testar()}
      />
      {folhaDeConfirmacao}
    </>
  );
}
```

- [ ] **Step 4: Ligar a porta na Vitrine**

Em `apps/web/src/components/painel/configuracoes/vitrine/configuracoes-vitrine.tsx`:

Depois de `import { DominioProprio } from "@/components/painel/configuracoes/dominio-proprio";`, acrescentar:

```tsx
import { SiteProprio } from "@/components/painel/configuracoes/site-proprio";
```

Trocar:

```tsx
const PORTAS: Porta[] = ["Conexão", "Equipe", "Notificações", "Plano", "Conta"];
```

por:

```tsx
const PORTAS: Porta[] = ["Conexão", "Integrações", "Equipe", "Notificações", "Plano", "Conta"];
```

E, logo depois do bloco `{porta === "Conexão" && ( … )}`, acrescentar:

```tsx
          {porta === "Integrações" && <SiteProprio />}
```

- [ ] **Step 5: `?secao=integracoes` na página**

Em `apps/web/src/app/painel/configuracoes/page.tsx` (em `origin/main` depois do #435 o arquivo já importa de `@/lib/painel/configuracoes`; reaproveitar esse import, não criar outro). Trocar:

```tsx
import { montarConvite, type FuncaoDoConvite } from "@/lib/painel/configuracoes";
```

por:

```tsx
import { montarConvite, type FuncaoDoConvite, type Porta } from "@/lib/painel/configuracoes";
```

Trocar:

```tsx
type Section = "Conexão" | "Equipe" | "Notificações" | "Plano" | "Conta";
```

por:

```tsx
type Section = Porta;
```

E em `SECAO_POR_SLUG`, depois de `conexao: "Conexão",`:

```tsx
  integracoes: "Integrações",
```

- [ ] **Step 6: Tipos, lint e testes do painel**

Run (em `apps/web`): `npx tsc --noEmit`, `npm run lint`, `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/painel/configuracoes.test.ts src/lib/painel/vitrine-lint.test.ts src/components/painel/configuracoes/site-proprio-painel.test.ts`
Expected: tudo verde. (`Record<Porta, string | null>` obriga `"Integrações"` em `resumoDasPortas`: se o `tsc` acusar, faltou o Step 1.)

- [ ] **Step 7: Olhar a tela** (dev local com Supabase, `HUBFLOW_USE_SUPABASE=1`): em worktree o `preview_start` serve o checkout principal — usar Playwright/`next dev` do próprio worktree. Abrir `/painel/configuracoes?secao=integracoes` como dono: a porta "Integrações" marcada, os cinco cartões, "Copiar parâmetros" copiando, "Enviar cadastro de teste" desligado se a loja de dev não tiver chave. **Não** clicar em "Gerar outra chave" em loja que tenha site ligado.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/painel/configuracoes/site-proprio.tsx apps/web/src/lib/painel/configuracoes.ts apps/web/src/components/painel/configuracoes/vitrine/configuracoes-vitrine.tsx apps/web/src/app/painel/configuracoes/page.tsx
git commit -m "feat(configuracoes): Integrations door with the own-site section (key, test, last signups)"
```

---

### Task 9: E2E, verificação, PR 3b e prova

**Files:**
- Create: `apps/web/e2e/painel-integracao-site.spec.ts`
- Modify: `apps/web/e2e/vendas-vendedora.spec.ts` (um teste novo no `describe` da vendedora; **reler o arquivo em `origin/main` antes**: o PR 5a também o edita e o 3b só começa depois do merge dele)

**Interfaces:**
- Consumes: nomes acessíveis da Global Constraints; `GET /api/integracoes/site` contra o banco de dev; `MENSAGEM_BLOQUEIO` (já importado no spec da vendedora) e o `page` logado como vendedora que os testes dele compartilham.

- [ ] **Step 1: Write the E2E**

```ts
// apps/web/e2e/painel-integracao-site.spec.ts
import { expect, test } from "@playwright/test";

/**
 * Configurações › Integrações › Site próprio (funil de anúncios, PR 3b).
 *
 * Só lê. Gerar chave aqui trocaria a chave da loja de QA no banco de dev que
 * todo run compartilha. O que este teste guarda é o que o PostgREST falso dos
 * testes de rota não vê: as consultas do GET (colunas, filtros, HEAD) contra o
 * banco de verdade, e a porta nova ligada na Vitrine.
 */
test("a porta Integrações abre o site próprio com a situação e os parâmetros", async ({ page }) => {
  await page.goto("/painel/configuracoes?secao=integracoes", { waitUntil: "load" });

  const porta = page.getByTestId("configuracoes-portas").getByRole("button", { name: /Integrações/ });
  await expect(porta).toHaveAttribute("aria-current", "true", { timeout: 30_000 });

  const site = page.getByTestId("configuracoes-site");
  await expect(site.getByRole("heading", { name: "Site próprio" })).toBeVisible({ timeout: 30_000 });
  await expect(site).not.toContainText("Não deu para carregar");
  await expect(site.getByRole("button", { name: "Copiar parâmetros" })).toBeVisible();
  await expect(site).toContainText("utm_source={{site_source_name}}");
  await expect(site).toContainText(
    /Integração desligada|Esperando o primeiro cadastro|Recebendo cadastros|Sem cadastros há mais de um dia/,
  );
});
```

- [ ] **Step 2: Vendedora nas rotas novas**

Reler `apps/web/e2e/vendas-vendedora.spec.ts` em `origin/main`. Em `0c16c328` o teste "as rotas do dono respondem 403 para ela; as de vendas, 200" (linha ~281) usa `page.request` com a sessão dela e compara o corpo com `MENSAGEM_BLOQUEIO`. Logo depois dele, no mesmo `describe`, acrescentar:

```ts
  test("as rotas da integração do site respondem 403 para ela", async () => {
    // Mapa de módulos fechado por padrão (lib/auth/modulos.ts): rota nova que
    // ninguém pôs no mapa já nasce fora do acesso dela.
    const leitura = await page.request.get("/api/integracoes/site");
    expect(leitura.status(), "GET /api/integracoes/site").toBe(403);
    expect(await leitura.text()).toBe(MENSAGEM_BLOQUEIO);
    const teste = await page.request.post("/api/integracoes/site/teste");
    expect(teste.status(), "POST /api/integracoes/site/teste").toBe(403);
  });
```

O corpo só é comparado no GET: no POST um 403 de outra camada (CSRF, papel) também serve de prova de que ela não passa, e é o que o teste vizinho de `/api/media/prepare` já faz. Se o 5a tiver mudado o jeito de obter `page` ou o nome do `describe`, seguir o padrão que estiver no arquivo, sem mudar o que o teste afirma.

- [ ] **Step 2b: E2E da cadeia completa da spec §8** (o 5b só prova cadastro → funil, plantando direto em `site_captures`; aqui entra a parte pública). Novo `apps/web/e2e/painel-anuncios-cadeia.spec.ts`, no molde de `e2e/painel-anuncios.spec.ts` (mesmo `bancoDeDev`, skip sem credenciais/service role, limpeza no `afterAll`). Fluxo: gerar a chave do tenant de QA pela rota → `POST /api/integracoes/cadastro` com Bearer → `GET` no `redirect` com user-agent de navegador → cobrar `foram ≥ 1` em `GET /api/resultados/anuncios`:

```ts
import { randomBytes, randomInt } from "node:crypto";

import { expect, request as novoRequest, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { BASE_URL, ESTADO_LOGADO } from "./caminhos";
import { TEM_CREDENCIAIS } from "./sessao-helpers";

const URL_SUPABASE = process.env.E2E_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const CHAVE_SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const TEM_BANCO = Boolean(URL_SUPABASE && CHAVE_SERVICE_ROLE);
const PREFIXO = "e2e-cadeia-";
const NAVEGADOR =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

type Funil = { relatorio: { total: { cadastros: number; foram: number } } };

function bancoDeDev(): SupabaseClient {
  return createClient(URL_SUPABASE, CHAVE_SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });
}

test.describe("cadeia da spec §8: chave → cadastro → redirect → clique → funil", () => {
  test.skip(!TEM_CREDENCIAIS || !TEM_BANCO, "Precisa do usuário de QA e da service role de dev.");

  const eventId = `${PREFIXO}${randomBytes(6).toString("hex")}`;
  let banco: SupabaseClient | undefined;
  let loja = "";
  let captureId = "";

  test.afterAll(async () => {
    if (!banco || !loja) return;
    // O clique referencia o cadastro com `on delete set null`: sai primeiro, senão fica órfão na loja de QA.
    if (captureId) await banco.from("link_click_events").delete().eq("tenant_id", loja).eq("capture_id", captureId);
    const { error } = await banco.from("site_captures").delete().eq("tenant_id", loja).eq("event_id", eventId);
    if (error) throw new Error(`limpeza do cadastro ${eventId}: ${error.message}`);
  });

  test("o clique no redirect do cadastro vira 'foram' no funil", async () => {
    banco = bancoDeDev();
    const dono = await novoRequest.newContext({ baseURL: BASE_URL, storageState: ESTADO_LOGADO });
    const publico = await novoRequest.newContext({ baseURL: BASE_URL, userAgent: NAVEGADOR });
    try {
      const me = (await (await dono.get("/api/auth/me")).json()) as { tenantId?: string | null };
      if (!me.tenantId) throw new Error("o usuário de QA não tem loja");
      loja = me.tenantId;

      const antes = (await (await dono.get("/api/resultados/anuncios")).json()) as Funil;

      // Link de destino: o primeiro que a tela de integração oferece (`links` do GET do 3a).
      const painel = (await (await dono.get("/api/integracoes/site")).json()) as { links: Array<{ id: string }> };
      expect(painel.links.length, "a loja de QA precisa de ao menos um link rastreado").toBeGreaterThan(0);
      const geracao = await dono.post("/api/integracoes/site/chave", { data: { tracked_link_id: painel.links[0].id } });
      expect(geracao.status()).toBe(201);
      const { chave } = (await geracao.json()) as { chave: string };

      const cadastro = await publico.post("/api/integracoes/cadastro", {
        headers: { authorization: `Bearer ${chave}` },
        data: {
          whatsapp: `+55629${String(randomInt(10_000_000, 100_000_000))}`,
          event_id: eventId,
          page_url: "https://e2e.example/vip?utm_source=ig&utm_campaign=e2e-cadeia",
        },
      });
      expect(cadastro.status()).toBe(201);
      const corpo = (await cadastro.json()) as { redirect: string; capture_id: string };
      captureId = corpo.capture_id;

      // Sem seguir o 302: o clique é gravado na resposta do /r/, e o destino (WhatsApp) não é da conta do teste.
      const destino = new URL(corpo.redirect);
      const clique = await publico.get(`${destino.pathname}${destino.search}`, { maxRedirects: 0 });
      expect([301, 302, 303, 307, 308]).toContain(clique.status());

      await expect
        .poll(
          async () => {
            const depois = (await (await dono.get("/api/resultados/anuncios")).json()) as Funil;
            return depois.relatorio.total.foram - antes.relatorio.total.foram;
          },
          { timeout: 15_000 },
        )
        .toBeGreaterThanOrEqual(1);
    } finally {
      await dono.dispose();
      await publico.dispose();
    }
  });
});
```

O `redirect` pode vir com o host de um domínio próprio ativo da loja de QA; o teste usa só o caminho e a query, contra `BASE_URL`. A chave gerada fica no tenant de QA (não há rota de revogação; a próxima execução gera outra). Antes de commitar, reler `e2e/painel-anuncios.spec.ts` em `origin/main` e alinhar nomes e imports; se o 3a tiver mudado `links` ou o corpo de `POST /chave`, seguir o que estiver na rota.

- [ ] **Step 3:** Os dois E2E rodam no job `e2e` do CI (banco de dev); localmente só com as variáveis de `e2e/README.md`. Não rodar contra produção. Commit:

```bash
git add apps/web/e2e/painel-integracao-site.spec.ts apps/web/e2e/vendas-vendedora.spec.ts
git commit -m "test(e2e): own-site section on the Integrations door; seller gets 403 on the new routes"
```
- [ ] **Step 4: Defasagem.** `git fetch origin main`; havendo commits novos, `git merge origin/main` antes do push.
- [ ] **Step 5: Gate local** (em `apps/web`): `npm run lint`, `npx tsc --noEmit`, `npm test`; da raiz `powershell -File infra/scripts/verify-local.ps1`. `git diff origin/main --stat`: os 8 arquivos da tabela (3b).
- [ ] **Step 6: Push e PR** "feat(configuracoes): Integrações › Site próprio screen (funil de anúncios, PR 3b)". Corpo: decisões 4, 6, 7 e 8 deste plano; "Sem DDL". Terminar com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. CI verde (inclusive o job `e2e`) → merge → apagar a branch.
- [ ] **Step 7: Prova em prod (leitura, sem gerar chave).** Na loja-piloto (`076cafce-4aa6-4203-8b60-3b68228e886f`), abrir `/painel/configuracoes?secao=integracoes` como dono. Conferir o número de "nos últimos 30 dias" contra:

```sql
select count(*) from public.site_captures
 where tenant_id = '076cafce-4aa6-4203-8b60-3b68228e886f'
   and created_at >= now() - interval '30 days';
```

Antes do site da loja mandar cadastros (spec §5) a prova é "Esperando o primeiro cadastro" com o mesmo `0`; depois, uma linha nos "Últimos cadastros" com o telefone mascarado.
- [ ] **Step 8: Card** (prod): `select public.move_card('funil-anuncios', 'em_construcao', 'PR 3b: tela Configurações › Integrações › Site próprio no ar; contagem bate com SQL na loja-piloto', 'PR #<n>');`
- [ ] **Step 9: Grafo** (PowerShell, do checkout principal):

```powershell
rag insert "decisão: a situação dos últimos cadastros na tela de integração do site é calculada em TypeScript (variantes de telefone + chaveDoTelefone, espelho de public.phone_key), sem SQL novo; 'Enviar cadastro de teste' é um ensaio que não grava; trocar o link de destino exige gerar outra chave" --source decisao-2026-10-10
```

- [ ] **Step 10:** Reportar ao encerrar: "PRs que deixei abertos: nenhum" (ou o número e o motivo).
