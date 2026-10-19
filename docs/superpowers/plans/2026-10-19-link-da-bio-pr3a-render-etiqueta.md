# Link da bio — PR 3a: renderizador base + modelo Etiqueta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `renderPaginaBio` devolve o HTML pronto da página pública do link da bio no modelo Etiqueta (o padrão) — e a mesma página sem script e sem `href` para a prévia do painel —, `renderPaginaNaoEncontrada` devolve o 404 mínimo e `scriptDaPagina` o JS inline ("Abrindo…", balanço do toque, "Copiado"), com a fonte Lexend servida de `public/`.

**Architecture:** HTML por concatenação, sem React, num módulo puro (`lib/bio/render/`) que roda na rota `/bio` (PR 4a) e no navegador (prévia, PR 6a). `index.ts` monta a página — cabeça, um `<style nonce>` com as variáveis de cor (`coresDoModelo` do PR 2, revalidadas), o CSS base e o do modelo — e chama o `corpo` do modelo num mapa `Record<Modelo, ModeloRender>` em que vitrine, romaneio e clássico ainda apontam para o Etiqueta. `modelo.ts` é o contrato que o PR 3b segue; `partes.ts` tem as peças que os 4 modelos usam (ícone, imagem, destino de cada tipo de link, endereço, confere, selo, CSS base). Nenhuma rota, nenhuma DDL.

**Tech Stack:** TypeScript strict, HTML/CSS puros, `node:test` + `node:assert/strict` via tsx, Playwright só na conferência visual (script fora do repo).

**Spec:** `docs/superpowers/specs/2026-10-19-link-da-bio-design.md` — §3 (modelos e aparência), §4 coluna "Na página", §6 (`<head>` e 404), §9 (`render/index.ts`, `render/script.ts` e a marcação que o JS lê), §10 e §11 (página). Visual: `C:\Users\Igor\Desktop\girumo-design-refs\link-da-bio\project\Main.dc.html` (CSS e marcação `.et-*`) e os prints `...\link-da-bio\shots\Main-1-topo.png` e `Main-2-rolagem.png`. Ficam fora do repo: têm foto e CNPJ da loja-piloto.

**Depende de:** PR 2 em `main` (`lib/bio/documento.ts`, `lib/bio/cores.ts` e `escapeHtml` escapando `'`). Índice da série: `docs/superpowers/plans/2026-10-19-link-da-bio-00-indice.md`.

**Já rodado:** o código deste plano passou antes de virar plano — 58 testes, `tsc` strict, o ESLint do repo e a conferência visual da Task 6 ("TUDO OK", HTML de exemplo 19,9 KB, página cheia 31,5 KB, JS 906 B) —, com um `documento.ts`/`cores.ts` de mentira no lugar do PR 2. O que pode mudar com o PR 2 de verdade é o teste de contraste (Task 4, passo 5).

## Arquivos (10 de código + 2 da fonte: um PR só)

| Arquivo | Task | Responsabilidade |
|---|---|---|
| `apps/web/src/test/bio-dados-falsos.ts` | 1 | loja fictícia (`dadosFalsos`, `dadosCheios`) para os testes, a conferência visual e os PRs 3b/4a |
| `apps/web/src/lib/bio/render/modelo.ts` | 1 | tipos do contrato dos modelos |
| `apps/web/src/lib/bio/render/partes.ts` (+ `partes.test.ts`) | 1, 2 | peças comuns e `CSS_BASE` |
| `apps/web/src/lib/bio/render/script.ts` (+ `script.test.ts`) | 3 | `scriptDaPagina` |
| `apps/web/src/lib/bio/render/etiqueta.ts` (+ `etiqueta.test.ts`) | 4, 5 | CSS e corpo do Etiqueta; contraste e regras do CSS |
| `apps/web/public/fonts/bio/lexend/lexend-latin.woff2` e `OFL.txt` | 4 | a fonte do Etiqueta |
| `apps/web/src/lib/bio/render/index.ts` (+ `index.test.ts`) | 5 | `renderPaginaBio`, `renderPaginaNaoEncontrada`, mapa dos modelos |

## Decisões deste plano

O mockup é a fonte dos valores; as linhas abaixo são onde o código se afasta dele (ou decide o que a spec não diz).

| Decisão | Por quê | Custo se estiver errada |
|---|---|---|
| "Abrindo o WhatsApp…" aparece numa pílula fixa embaixo (`#lk-status`, `role="status"`), não no subtítulo do botão | A spec pede um único `role="status"` fora da lista; trocar o subtítulo mudaria o nome acessível do link. No 4G o aviso visível segura o toque repetido | Visual diferente do mockup num detalhe de 1,6–3 s |
| Véu do "onde fica" sobre a foto = `rgb(0 0 0 / .62)` com texto `#fff` | O mockup usa `--fundo3` a 82% com `#fff`: com "cores da sua marca" clara o texto cai para 1,2:1. Véu ≥ 60% (spec §3) e preto passa em qualquer foto (≥ 6:1) | A faixa fica cinza-escura em vez de azul-marinho nas paletas prontas |
| Horário do endereço em `--tinta` (mockup: `--tinta2`) | `tinta2` sobre `papel` não está entre os pares que o PR 2 garante; `tinta`/`papel` está | Hierarquia só pelo tamanho (13 px) |
| "Copiar CNPJ" e "Feito com Girumo" com 44 px de altura (mockup: 34 e 32) | Spec §11: alvo de toque ≥ 44 px | Botões um pouco mais altos |
| Linhas do "confere" com o ícone ✓ (`check`) | O documento não tem ícone por linha (spec §4); o vídeo/caminhão do editor do mockup mentiria para texto qualquer | Menos ilustrativo que o mockup |
| Sem "Política de privacidade" no rodapé | Não existe campo no documento (spec §4) | Nenhum |
| CNPJ no rodapé só com o "confere" ligado | Quem desligou o bloco não vê mais o campo no editor | Nenhum |
| Miniaturas do catálogo (32×42) com uma largura só, `w=128` (largura válida do otimizador), sem `srcset` | Com 384/640/828 em 60 miniaturas a página de 20 links passa de 40 KB; 384 já sobra para 32 px | Nenhum: `srcset` 384/640/828 continua em toda foto |
| Logo numa caixa fixa (190×84, `object-fit:contain`) e sem `loading="lazy"` | `MidiaRef` não traz a proporção: com `height:auto` a página pularia ao carregar; a logo fica acima da dobra | Logo quadrada sai menor (84 px) |
| Logo do fundo errado: placa branca atrás da logo escura (fundo escuro) e placa `#141414` atrás da clara (fundo claro) | A spec diz "plaquinha branca", que só funciona no fundo escuro; logo branca em placa branca some | Nenhum |
| Sem foto, o "onde fica" sai embaixo da frase | No mockup ele só existia em cima da foto: sem foto o endereço sumia | Nenhum |
| Entrada só com `o.animarEntrada && documento.animar` (classe `lk-entra`); o toque usa a classe `lk-toque`, posta pelo script | Um lugar só para cada coisa; o painel controla a entrada, o lojista a desliga | Nenhum |
| Foco visível dentro do papel (confere, endereço) em `--tinta` | O `--foco` é para o degradê; sobre o papel ele dá ~2:1 | Nenhum |
| A classe de foco da foto (`lk-f-X-Y`) leva `object-position` **e** `transform-origin` | O zoom de 2,2× do Clássico (PR 3b) cresce em volta do foco sem regra por página | Nenhum (sem `transform`, a origem não faz nada) |
| `:hover` da etiqueta só com `(hover:hover)` | No celular o `:hover` gruda depois do toque e a etiqueta fica torta | Nenhum |
| "Feito com Girumo" vai para `getPublicSiteUrl()` + `?utm_source=link-da-bio&utm_medium=rodape` | Nunca o domínio da página (no domínio próprio seria a loja); a UTM mede quem chega pelo selo | Nenhum |
| Sprite com só os símbolos usados; tokens aceitos com ou sem `--` na chave | Bytes; o §9 descreve `TokensBio` como "--fundo1, --on" sem fixar o formato da chave | Nenhum |
| Script da conferência visual fora do repo (o código está na Task 6) | É ferramenta de quem implementa; o PR 3b copia daqui | Nenhum |

## Global Constraints

- Renderizador puro: nada de `server-only`, Supabase, React ou `node:` em `lib/bio/render/*.ts` (spec §9); roda no navegador na prévia do PR 6a.
- Texto do lojista só por `escapeHtml` (`lib/campaigns/entry-page.ts`), sempre entre aspas duplas; nenhum texto do lojista dentro de `<script>` (spec §10).
- Nenhum atributo `style=` (spec §3); `<style>` e `<script>` com `nonceAttribute(nonce)`; o `<style>` só recebe cor `^#[0-9A-F]{6}$` e números (spec §10).
- URL só por `new URL`, protocolo `https:` ou `http:`, emitida como `url.href`; o que falhar some do render (spec §10).
- A página tem de funcionar sob a CSP da superfície "bio" (spec §6): `default-src 'none'; script-src 'self' 'nonce-…'; style-src 'self' 'nonce-…'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`.
- Imagem pelo otimizador: `/_next/image?url=/api/p/media/<id>&w=…&q=75`, `srcset` 384/640/828, `width`/`height`, `fetchpriority="high"` só na foto do topo, `loading="lazy"` no resto (spec §4).
- Fonte em `public/fonts/bio/<família>/` com o `OFL.txt`; só a do modelo, `preload` só dela (spec §3, §11).
- Animação só CSS (`transform`/`opacity`/`clip-path`); `prefers-reduced-motion: reduce` desliga tudo; o toque continua com `animar = false` (spec §3).
- HTML ≤ 40 KB sem compressão; JS inline ≤ 3 KB; alvo de toque ≥ 44 px; reflow em 320 px sem rolagem lateral (spec §11).
- `h1` = nome da loja (a logo é `img` dentro dele, `alt` = nome); frase em `<p>`; `capaAlt` vazio → `alt=""`; decoração com `aria-hidden`; um único `role="status"`, fora da lista, limpo no `pageshow`; "Copiado" só se o `writeText` resolver (spec §11).
- Marcação que o JS lê (contrato com 4b e 7, spec §9): `<body data-pagina="<uuid>">`; cada botão `<a … data-link="<uuid>" data-tipo="<tipo>">` (o `<summary>` do endereço também); `<button type="button" data-copiar="<CNPJ sem pontuação, só [0-9A-Z]>">`; `<p id="lk-status">`.
- Repositório público: nada de foto, nome, CNPJ ou telefone de cliente; os testes usam a loja fictícia de `src/test/bio-dados-falsos.ts`.
- Testes: um arquivo, em `apps/web`: `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`. Commits em inglês com prefixo semântico. Nenhuma DDL, nenhuma rota.

## Review Focus

- **Página recém-criada** (o `documentoPadrao` do PR 2: sem foto, logo, frase, destaques nem confere) tem de abrir com o `h1` = nome e sem elemento vazio. Teste: "página recém-criada (documentoPadrao)…" (Task 5).
- **Todos os links desligados ou escondidos** (número que virou conectado, campanha apagada): nada de `<ul>` vazio anunciado como lista. Teste: "todos os links escondidos…" (Task 5).
- **Mensagem do WhatsApp com `#`, `&` ou emoji**: o texto chega inteiro no WhatsApp. Teste: o caso `Kit #3 & tchau 😀` em "WhatsApp: wa.me…" (Task 2).
- **Título sem espaço ou @ comprido em 320 px**: sem rolagem lateral. `dadosCheios` traz um título de 50 letras sem espaço e um @ de 30; a conferência da Task 6 reprova rolagem lateral.
- **Copiar CNPJ tocado de novo, ou área de transferência negada**: o botão volta a "Copiar CNPJ" e nada diz "Copiado" à toa. Teste: "Copiar CNPJ: 'Copiado' só quando o writeText resolve" (Task 3).

---

### Task 0: Branch e pré-condições

**Files:** nenhum.

- [ ] **Step 1: O PR 2 está em `main`?** Na raiz do checkout principal (`C:\Users\Igor\Desktop\HubFlow-platform`):

```bash
git fetch origin main
git log origin/main --oneline -3 -- apps/web/src/lib/bio/documento.ts apps/web/src/lib/bio/cores.ts
```

Expected: o commit do PR 2 na lista. Vazio → parar: este PR depende dele.

- [ ] **Step 2: Worktree novo a partir de `origin/main`** (CLAUDE.md, "Regra de PR"; nunca `checkout -b` no checkout principal):

```bash
git worktree add -b feat/link-da-bio-pr3a-render .claude/worktrees/link-da-bio-pr3a origin/main
cd .claude/worktrees/link-da-bio-pr3a
# node_modules: duas junctions (ver "Ambiente do worktree" no índice); npm ci só se o do checkout principal estiver vazio
```

Daqui em diante todo comando roda em `apps/web` deste worktree.

- [ ] **Step 3: Conferir o que o PR 2 exporta** (os nomes do §9 são contrato):

```bash
grep -n "export type DadosRender\|export const PALETAS\|export const documentoBio\|export function documentoPadrao" src/lib/bio/documento.ts
grep -n "export type TokensBio\|export function coresDoModelo" src/lib/bio/cores.ts
grep -n "&#39;\|&#x27;\|&apos;" src/lib/campaigns/entry-page.ts
```

Expected: uma linha para cada export e a linha do `escapeHtml` com o `'`. Faltando algum → parar e reportar (o plano usa esses nomes).

- [ ] **Step 4: Quadro ao começar** (prod `nidoatbxaylrkcgbszns`; rodar com `npx supabase --workdir <pasta vazia> db query --linked -f arquivo.sql` depois de `npx supabase --workdir <pasta vazia> link --project-ref nidoatbxaylrkcgbszns --yes`; se o classificador recusar, pedir ao Igor):

```sql
update public.board_features
   set blocker = 'PR 3a (renderizador da página + modelo Etiqueta) em construção; a rota pública vem no PR 4a.',
       updated_at = now()
 where key = 'link-da-bio';
```

---

### Task 1: Loja fictícia, contrato dos modelos e peças de imagem e texto

**Files:**
- Create: `apps/web/src/test/bio-dados-falsos.ts`
- Create: `apps/web/src/lib/bio/render/modelo.ts`
- Create: `apps/web/src/lib/bio/render/partes.ts` (primeira metade; a Task 2 completa)
- Test: `apps/web/src/lib/bio/render/partes.test.ts`

**Interfaces:**
- Consumes (PR 2): `DadosRender`, `DocumentoBio`, `LinkBio`, `MidiaRef` de `@/lib/bio/documento`; `TokensBio` de `@/lib/bio/cores`. Do repo: `escapeHtml` (`@/lib/campaigns/entry-page`), `parseHex` e `relativeLuminance` (`@/lib/pages/palette`).
- Produces:
  - `modelo.ts`: os tipos `ModoRender`, `FonteDoModelo`, `LinkVisivel`, `LogoDaPagina`, `ContextoRender`, `ModeloRender` (código abaixo).
  - `partes.ts`: `LARGURA_MINIATURA`, `icone(nome: string, classe?: string): string`, `sprite(html: string): string`, `urlDaImagem(id: string, largura: number): string | null`, `pontoDoFoco(foco: MidiaRef["foco"]): { x: number; y: number } | null`, `classeDoFoco(foco: MidiaRef["foco"]): string`, `regrasDoFoco(doc: DocumentoBio): string`, `type OpcoesDaImagem`, `imagem(m: MidiaRef, o: OpcoesDaImagem): string`, `destaqueEmPartes(texto: string): { antes: string; num: string; depois: string }`, `destaqueHtml(texto: string): string`, `formatarCnpj(digitos: string): string`, `logoDaPagina(doc: DocumentoBio, fundo: string): LogoDaPagina | null`, `tokensValidos(t: TokensBio): TokensBio`, `atrasos(seletor: string, inicioMs: number, passoMs: number): string`.
  - `bio-dados-falsos.ts`: `IDS`, `SLUG_DA_CAMPANHA`, `documentoFalso(): DocumentoBio`, `dadosFalsos(): DadosRender`, `dadosCheios(): DadosRender`.

- [ ] **Step 1: A loja fictícia** — criar `apps/web/src/test/bio-dados-falsos.ts`:

```ts
/**
 * Página de link da bio de uma loja que NÃO existe, para testes e para a
 * conferência visual. O repositório é público: nada de foto, nome, CNPJ ou
 * telefone de cliente aqui. O CNPJ é o exemplo clássico (dígitos válidos).
 */
import type { DadosRender, DocumentoBio, LinkBio } from "@/lib/bio/documento";

export const IDS = {
  pagina: "0c8f6a2e-5b1d-4c3a-9e7f-1a2b3c4d5e6f",
  campanha: "7d1e2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6",
  whatsapp: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  catalogo: "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
  grupo: "c3d4e5f6-a7b8-4c9d-8e0f-2a3b4c5d6e7f",
  endereco: "d4e5f6a7-b8c9-4d0e-9f1a-3b4c5d6e7f80",
  canal: "e5f6a7b8-c9d0-4e1f-8a2b-4c5d6e7f8091",
} as const;

export const SLUG_DA_CAMPANHA = "vip-exemplo";

export function documentoFalso(): DocumentoBio {
  return {
    v: 1,
    modelo: "etiqueta",
    paleta: "azul",
    cores: null,
    animar: true,
    feitoComGirumo: true,
    perfil: {
      nome: "Ateliê Exemplo Kids",
      frase: "Kits de roupa infantil pra revender, do RN ao 14 anos.",
      destaques: ["a partir de R$ 19,90 a peça", "12 kits no catálogo", "envio pro Brasil inteiro"],
      local: "Loja na Rua Exemplo, 100, Centro, Cidade Exemplo",
      instagram: "atelie.exemplo",
      capa: { id: "capa-falsa", foco: { x: 0.5, y: 0.3 } },
      capaAlt: "Fachada da loja de exemplo",
      logoClara: { id: "logo-clara-falsa", foco: null },
      logoEscura: { id: "logo-escura-falsa", foco: null },
    },
    confere: {
      ativo: true,
      razao: "Ateliê Exemplo Comércio de Roupas Ltda",
      cnpj: "11222333000181",
      linhas: [
        "Na primeira compra, a gente mostra a loja por chamada de vídeo antes do Pix.",
        "Envio pro Brasil inteiro, com nota fiscal.",
      ],
    },
    rastreio: { metaPixelId: "", ga4Id: "" },
    links: [
      { id: IDS.whatsapp, tipo: "whatsapp", titulo: "Falar com a vendedora", sub: "Pedido, preço e estoque no WhatsApp", icone: "whatsapp", ativo: true, destaque: true, numero: "5562900000000", mensagem: "Oi! Vim pelo Instagram e quero ver os kits." },
      { id: IDS.catalogo, tipo: "link", titulo: "Catálogo de kits", sub: "Cada kit com vídeo, peças e preço", icone: "catalogo", ativo: true, destaque: false, url: "https://exemplo.com.br/catalogo", fotos: [{ id: "kit-1-falso", foco: null }, { id: "kit-2-falso", foco: { x: 0.375, y: 0.2 } }, { id: "kit-3-falso", foco: null }] },
      { id: IDS.grupo, tipo: "grupo", titulo: "Entrar no grupo VIP", sub: "Kit novo e reposição saem primeiro no grupo", icone: "coroa", ativo: true, destaque: false, campanhaId: IDS.campanha },
      { id: IDS.endereco, tipo: "endereco", titulo: "Como chegar na loja", sub: "Endereço, horário e o mapa", icone: "mapa", ativo: true, endereco: "Rua Exemplo, 100\nCentro, Cidade Exemplo", horario: "Seg a sex, das 8h às 17h", foto: { id: "fachada-falsa", foco: null } },
      { id: IDS.canal, tipo: "link", titulo: "Seguir o canal da loja", sub: "Novidades no seu WhatsApp", icone: "canal", ativo: true, destaque: false, url: "https://whatsapp.com/channel/EXEMPLO", fotos: [] },
    ],
  };
}

export function dadosFalsos(): DadosRender {
  return {
    documento: documentoFalso(),
    paginaId: IDS.pagina,
    campanhas: { [IDS.campanha]: SLUG_DA_CAMPANHA },
    linksEscondidos: [],
    origem: "https://www.girumo.com.br",
    dominioProprio: false,
  };
}

/** Texto com acento, cortado no tamanho pedido (o limite do campo no spec §4). */
function texto(n: number): string {
  return "Coleção de verão com peças à pronta-entrega e reposição toda semana ".repeat(4).slice(0, n);
}

/** A página no limite: 20 links com texto no máximo (um título sem espaço), 3 deles com 3 fotos. */
export function dadosCheios(): DadosRender {
  const d = dadosFalsos();
  const extras: LinkBio[] = Array.from({ length: 15 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    tipo: "link" as const,
    titulo: i === 2 ? "Promoçãorelâmpagodeverãocompeçasàpronta-entregajá!" : texto(50),
    sub: texto(80),
    icone: "sacola" as const,
    ativo: true,
    destaque: false,
    url: `https://exemplo.com.br/colecao/${String(i + 1).padStart(2, "0")}?utm_source=instagram&utm_medium=bio`,
    fotos: i < 2 ? [{ id: `foto-${i}-a`, foco: null }, { id: `foto-${i}-b`, foco: null }, { id: `foto-${i}-c`, foco: null }] : [],
  }));
  const base = d.documento.links.map((l) => ({ ...l, titulo: texto(50), sub: texto(80) }));
  return {
    ...d,
    documento: {
      ...d.documento,
      perfil: {
        ...d.documento.perfil,
        nome: texto(60),
        frase: texto(120),
        destaques: [texto(40), texto(40), texto(40)],
        local: texto(90),
        instagram: "atelie.exemplo.kids.revenda.br",
        capaAlt: texto(140),
      },
      confere: { ...d.documento.confere, razao: texto(120), linhas: [texto(160), texto(160)] },
      links: [...base, ...extras],
    },
  };
}
```

- [ ] **Step 2: O contrato dos modelos** — criar `apps/web/src/lib/bio/render/modelo.ts`:

```ts
/**
 * O que cada modelo do link da bio entrega ao `index.ts`, e o que recebe dele.
 * O PR 3b cria vitrine.ts, romaneio.ts e classico.ts com este formato.
 */
import type { TokensBio } from "@/lib/bio/cores";
import type { DadosRender, LinkBio, MidiaRef } from "@/lib/bio/documento";

export type ModoRender = "publica" | "previa";

/** Um woff2 (subset latin) em `public/fonts/bio/<arquivo>`; vira @font-face e preload. */
export type FonteDoModelo = {
  familia: string; // nome usado no CSS do modelo, ex. "Lexend"
  arquivo: string; // caminho sob /fonts/bio/, ex. "lexend/lexend-latin.woff2"
  peso: string; // descritor font-weight: "100 900" (variável) ou "400"
  estilo: "normal" | "italic";
};

/** Link que sai na página: ativo, fora de `linksEscondidos` e com destino válido. */
export type LinkVisivel = {
  link: LinkBio;
  href: string; // destino; no `endereco` é o "Abrir no Google Maps"
  principal: boolean; // o primeiro `destaque` (nunca um `endereco`)
};

/** Logo escolhida pela luminância do fundo; `placa` quando só existe a do fundo errado. */
export type LogoDaPagina = { midia: MidiaRef; placa: "clara" | "escura" | null };

export type ContextoRender = {
  d: DadosRender;
  modo: ModoRender;
  tokens: TokensBio; // já revalidados: chave "--nome", valor "#RRGGBB"
  links: readonly LinkVisivel[];
  logo: LogoDaPagina | null;
};

export type ModeloRender = {
  fontes: readonly FonteDoModelo[];
  /** CSS fixo: nenhuma interpolação; cor de paleta só por var(--…); a fonte do texto em `.lk{font-family:…}`. */
  css: string;
  /** `theme-color` (hex) a partir dos tokens. */
  corDoTopo: (t: TokensBio) => string;
  /** Fundo (hex) atrás da logo: decide entre logoClara e logoEscura. */
  fundoDoLogo: (t: TokensBio) => string;
  /** O `<main>` do modelo, com exatamente um `<h1>`. */
  corpo: (c: ContextoRender) => string;
};
```

- [ ] **Step 3: Write the failing test** — criar `apps/web/src/lib/bio/render/partes.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { documentoFalso } from "@/test/bio-dados-falsos";
import {
  atrasos,
  classeDoFoco,
  destaqueEmPartes,
  destaqueHtml,
  formatarCnpj,
  icone,
  imagem,
  logoDaPagina,
  pontoDoFoco,
  regrasDoFoco,
  sprite,
  tokensValidos,
  urlDaImagem,
} from "./partes";

test("imagem: srcset 384/640/828 pelo otimizador, src de 640, & escapado", () => {
  const html = imagem({ id: "capa-falsa", foco: null }, { largura: 640, altura: 512, sizes: "100vw", alt: "Fachada", carregamento: "prioridade" });
  assert.match(html, /src="\/_next\/image\?url=%2Fapi%2Fp%2Fmedia%2Fcapa-falsa&amp;w=640&amp;q=75"/);
  assert.match(html, /srcset="[^"]*w=384&amp;q=75 384w, [^"]*w=640&amp;q=75 640w, [^"]*w=828&amp;q=75 828w"/);
  assert.match(html, /sizes="100vw" width="640" height="512" alt="Fachada" fetchpriority="high" decoding="async">/);
  assert.doesNotMatch(html, /loading=/);
});

test("imagem: miniatura com uma largura só, lazy, sem srcset", () => {
  const html = imagem({ id: "kit", foco: null }, { largura: 32, altura: 42, sizes: "32px", alt: "", carregamento: "lazy", larguras: [128] });
  assert.match(html, /src="[^"]*w=128&amp;q=75"/);
  assert.doesNotMatch(html, /srcset|sizes=/);
  assert.match(html, /alt="" loading="lazy"/);
});

test("imagem: id fora do formato não vira <img>", () => {
  assert.equal(imagem({ id: "../x", foco: null }, { largura: 1, altura: 1, sizes: "1px", alt: "", carregamento: "lazy" }), "");
  assert.equal(urlDaImagem('a"b', 384), null);
});

test("foco: porcentagem inteira, classe e regra com object-position e transform-origin", () => {
  assert.deepEqual(pontoDoFoco({ x: 0.375, y: 0.2 }), { x: 38, y: 20 });
  assert.deepEqual(pontoDoFoco({ x: 7, y: -1 }), { x: 100, y: 0 });
  assert.equal(pontoDoFoco(null), null);
  assert.equal(pontoDoFoco({ x: Number.NaN, y: 0.5 }), null);
  assert.equal(classeDoFoco({ x: 0.375, y: 0.2 }), "lk-f-38-20");
  assert.equal(classeDoFoco(null), "");
  const regras = regrasDoFoco(documentoFalso());
  assert.match(regras, /\.lk \.lk-f-38-20\{object-position:38% 20%;transform-origin:38% 20%\}/);
  assert.match(regras, /\.lk \.lk-f-50-30\{object-position:50% 30%;transform-origin:50% 30%\}/);
  assert.equal(regras.match(/lk-f-/g)?.length, 2);
});

test("ícone decorativo e sprite só com o que a página usa", () => {
  assert.equal(icone("coroa"), '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><use href="#lk-i-coroa"></use></svg>');
  assert.match(icone("nao-existe"), /#lk-i-link/);
  const s = sprite(`${icone("coroa")}${icone("seta", "i et-seta")}${icone("coroa")}`);
  assert.match(s, /^<svg class="lk-sprite" aria-hidden="true" focusable="false">/);
  assert.equal(s.match(/<symbol /g)?.length, 2);
  assert.match(s, /id="lk-i-coroa"/);
  assert.equal(sprite("<p>sem ícone</p>"), "");
  assert.equal(sprite("#lk-i-constructor"), "");
});

test("destaque: só o primeiro número (ou R$) vai em <b>", () => {
  assert.deepEqual(destaqueEmPartes("a partir de R$ 19,90 a peça"), { antes: "a partir de ", num: "R$ 19,90", depois: " a peça" });
  assert.deepEqual(destaqueEmPartes("12 kits no catálogo"), { antes: "", num: "12", depois: " kits no catálogo" });
  assert.deepEqual(destaqueEmPartes("frete grátis acima de 1.000."), { antes: "frete grátis acima de ", num: "1.000", depois: "." });
  assert.deepEqual(destaqueEmPartes("envio pro Brasil inteiro"), { antes: "envio pro Brasil inteiro", num: "", depois: "" });
  assert.equal(destaqueHtml("<b>3</b> kits"), "&lt;b&gt;<b>3</b>&lt;/b&gt; kits");
});

test("CNPJ: numérico ou alfanumérico com pontuação; o resto volta como veio", () => {
  assert.equal(formatarCnpj("11222333000181"), "11.222.333/0001-81");
  assert.equal(formatarCnpj("12ABC34501DE35"), "12.ABC.345/01DE-35");
  assert.equal(formatarCnpj("123"), "123");
});

test("logo: a certa para o fundo; só a errada vai numa placa", () => {
  const doc = documentoFalso();
  const escuro = "#286AA6";
  const claro = "#F4F7FB";
  assert.deepEqual(logoDaPagina(doc, escuro), { midia: doc.perfil.logoClara, placa: null });
  assert.deepEqual(logoDaPagina(doc, claro), { midia: doc.perfil.logoEscura, placa: null });
  const soEscura = { ...doc, perfil: { ...doc.perfil, logoClara: null } };
  assert.deepEqual(logoDaPagina(soEscura, escuro), { midia: doc.perfil.logoEscura, placa: "clara" });
  const soClara = { ...doc, perfil: { ...doc.perfil, logoEscura: null } };
  assert.deepEqual(logoDaPagina(soClara, claro), { midia: doc.perfil.logoClara, placa: "escura" });
  const semLogo = { ...doc, perfil: { ...doc.perfil, logoClara: null, logoEscura: null } };
  assert.equal(logoDaPagina(semLogo, escuro), null);
});

test("tokens: só --nome com #RRGGBB vão para o <style>", () => {
  assert.deepEqual(
    tokensValidos({ "--fundo1": "#3a80bf", on: "#FFFFFF", "--x": "red", "--y": "#FFF;}body{x:1", "--Z": "#000000" }),
    { "--fundo1": "#3A80BF", "--on": "#FFFFFF" },
  );
});

test("atrasos de entrada por :nth-child, até 20 links", () => {
  const css = atrasos(".x>li", 0, 70);
  assert.doesNotMatch(css, /nth-child\(1\)/);
  assert.match(css, /\.x>li:nth-child\(2\)\{animation-delay:70ms\}/);
  assert.match(css, /\.x>li:nth-child\(20\)\{animation-delay:1330ms\}/);
  assert.doesNotMatch(css, /nth-child\(21\)/);
  assert.match(atrasos(".y>li", 350, 60), /\.y>li:nth-child\(1\)\{animation-delay:350ms\}/);
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/render/partes.test.ts`
Expected: FAIL — `Cannot find module` para `./partes`.

- [ ] **Step 5: Implement** — criar `apps/web/src/lib/bio/render/partes.ts` com a primeira metade. Os desenhos do sprite são os do mockup (`Main.dc.html`, `<symbol id="lk-i-…">`), copiados sem mudança:

```ts
/**
 * Peças comuns aos 4 modelos do link da bio: ícones, imagem, foco da foto,
 * destino de cada tipo de link, bloco "confere", endereço, rodapé e o CSS base.
 *
 * Puro (sem server-only, Supabase, React ou node:): roda na rota pública e na
 * prévia do painel. Texto do lojista só entra por `escapeHtml`, sempre entre
 * aspas duplas; URL só sai de `new URL` com protocolo da lista.
 */
import type { TokensBio } from "@/lib/bio/cores";
import type { DocumentoBio, MidiaRef } from "@/lib/bio/documento";
import { escapeHtml } from "@/lib/campaigns/entry-page";
import { parseHex, relativeLuminance } from "@/lib/pages/palette";
import type { LogoDaPagina } from "./modelo";

/** Larguras do otimizador do Next (imageSizes/deviceSizes padrão); 390 daria 400. */
const LARGURAS_FOTO = [384, 640, 828] as const;
/** Miniatura de até 48 px: uma largura só (srcset não teria o que escolher). */
export const LARGURA_MINIATURA = [128] as const;
/** Máximo de links do documento (spec §4); limita as regras de atraso. */
const MAX_LINKS = 20;

const ID_DE_MIDIA = /^[A-Za-z0-9_-]+$/;
const NOME_DE_TOKEN = /^--[a-z][a-z0-9-]*$/;
const COR = /^#[0-9A-Fa-f]{6}$/;
/** CNPJ guardado sem pontuação: 12 caracteres [0-9A-Z] + 2 dígitos (o alfanumérico da Receita vale). */
export const CNPJ = /^[0-9A-Z]{12}\d{2}$/;

// Desenhos do sprite do mockup (Main.dc.html), 24x24, traço em currentColor.
const SIMBOLOS: Record<string, string> = {
  whatsapp:
    '<path fill="currentColor" stroke="none" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-2-1.2 7.4 7.4 0 0 1-1.4-1.7c-.1-.2 0-.4.1-.5l.4-.4.2-.4v-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c.6.3 1.1.4 1.5.5a3.6 3.6 0 0 0 1.7.1 2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z"/>',
  catalogo: '<path d="M2.5 5.5C5 4.2 8 4.3 12 6.2c4-1.9 7-2 9.5-.7V19c-2.5-1.3-5.5-1.2-9.5.7-4-1.9-7-2-9.5-.7z"/><path d="M12 6.2v13.5"/>',
  coroa: '<path d="M3.5 8.5l4.2 3.6L12 5l4.3 7.1 4.2-3.6-1.8 9.5H5.3z"/><path d="M5.5 20h13"/>',
  mapa: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><path d="M9.5 9.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0"/>',
  canal: '<path d="M4 10v4h3l6 4V6L7 10z"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/>',
  instagram:
    '<path d="M7.5 3h9A4.5 4.5 0 0 1 21 7.5v9a4.5 4.5 0 0 1-4.5 4.5h-9A4.5 4.5 0 0 1 3 16.5v-9A4.5 4.5 0 0 1 7.5 3z"/><path d="M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0"/><path d="M17.3 6.7h.01"/>',
  site: '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0"/><path d="M3.5 9h17M3.5 15h17"/><path d="M12 3c2.6 2.7 3.8 5.7 3.8 9s-1.2 6.3-3.8 9c-2.6-2.7-3.8-5.7-3.8-9S9.4 5.7 12 3z"/>',
  sacola: '<path d="M5 8h14l-1.2 12.5H6.2z"/><path d="M9 10.5V7a3 3 0 0 1 6 0v3.5"/>',
  etiqueta: '<path d="M3 12.2V4h8.2l9.3 9.3-8.2 8.2z"/><path d="M7.6 7.6h.01"/>',
  caminhao:
    '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><path d="M5.2 17.5a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0"/><path d="M15.2 17.5a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0"/>',
  video: '<path d="M4.5 6.5h9a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z"/><path d="M15.5 10.5l6-3.5v10l-6-3.5"/>',
  cartao: '<path d="M5 6h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/><path d="M3 10h18M7 15h3"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  seta: '<path d="M9 6l6 6-6 6"/>',
  "mapa-dobrado": '<path d="M9 4L3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
  check: '<path d="M5 12.5l4.2 4L19 7"/>',
  girumo: '<path d="M12 3a9 9 0 1 0 9 9h-9"/>',
};

/** `<svg>` decorativo que usa um símbolo do sprite; nome fora da lista vira "link". */
export function icone(nome: string, classe = "i"): string {
  const n = Object.hasOwn(SIMBOLOS, nome) ? nome : "link";
  return `<svg class="${classe}" viewBox="0 0 24 24" aria-hidden="true"><use href="#lk-i-${n}"></use></svg>`;
}

/** Sprite só com os símbolos que o HTML usa (procura `#lk-i-…`). */
export function sprite(html: string): string {
  const usados = [...new Set(html.match(/#lk-i-[a-z-]+/g) ?? [])]
    .map((ref) => ref.slice("#lk-i-".length))
    .filter((n) => Object.hasOwn(SIMBOLOS, n));
  if (usados.length === 0) return "";
  const simbolos = usados.map((n) => `<symbol id="lk-i-${n}" viewBox="0 0 24 24">${SIMBOLOS[n]}</symbol>`).join("");
  return `<svg class="lk-sprite" aria-hidden="true" focusable="false">${simbolos}</svg>`;
}

/** URL do otimizador do Next para a mídia pública; `null` se o id não tem o formato. */
export function urlDaImagem(id: string, largura: number): string | null {
  if (!ID_DE_MIDIA.test(id)) return null;
  return `/_next/image?url=${encodeURIComponent(`/api/p/media/${id}`)}&w=${largura}&q=75`;
}

/** Ponto de foco em porcentagem inteira (0..100); `null` sem foco ou com número inválido. */
export function pontoDoFoco(foco: MidiaRef["foco"]): { x: number; y: number } | null {
  if (!foco || !Number.isFinite(foco.x) || !Number.isFinite(foco.y)) return null;
  const pct = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 100);
  return { x: pct(foco.x), y: pct(foco.y) };
}

/** Classe que posiciona a foto no foco (a regra sai de `regrasDoFoco`); "" sem foco. */
export function classeDoFoco(foco: MidiaRef["foco"]): string {
  const p = pontoDoFoco(foco);
  return p ? `lk-f-${p.x}-${p.y}` : "";
}

/**
 * Uma regra por foco distinto do documento. `transform-origin` junto: o zoom do
 * Clássico (PR 3b) cresce em volta do mesmo ponto sem regra própria.
 */
export function regrasDoFoco(doc: DocumentoBio): string {
  const p = doc.perfil;
  const midias: (MidiaRef | null)[] = [p.capa, p.logoClara, p.logoEscura];
  for (const l of doc.links) {
    if (l.tipo === "link") midias.push(...l.fotos);
    if (l.tipo === "endereco") midias.push(l.foto);
  }
  const regras = new Set<string>();
  for (const m of midias) {
    const f = m ? pontoDoFoco(m.foco) : null;
    if (f) regras.add(`.lk .lk-f-${f.x}-${f.y}{object-position:${f.x}% ${f.y}%;transform-origin:${f.x}% ${f.y}%}`);
  }
  return [...regras].join("");
}

export type OpcoesDaImagem = {
  classe?: string;
  largura: number; // width declarado (o tamanho do espaço no CSS)
  altura: number; // height declarado
  sizes: string; // constante do modelo
  alt: string; // texto do lojista ou ""
  carregamento: "prioridade" | "normal" | "lazy"; // prioridade = foto do topo
  larguras?: readonly number[]; // padrão LARGURAS_FOTO
};

/** `<img>` pelo otimizador, com srcset, width/height e foco; "" se o id é inválido. */
export function imagem(m: MidiaRef, o: OpcoesDaImagem): string {
  const larguras = o.larguras ?? LARGURAS_FOTO;
  const src = urlDaImagem(m.id, larguras[Math.min(1, larguras.length - 1)]);
  if (!src) return "";
  const candidatos = larguras.map((w) => `${escapeHtml(urlDaImagem(m.id, w) ?? "")} ${w}w`).join(", ");
  const srcset = larguras.length > 1 ? ` srcset="${candidatos}" sizes="${o.sizes}"` : "";
  const classes = [o.classe, classeDoFoco(m.foco)].filter(Boolean).join(" ");
  const carga =
    o.carregamento === "prioridade" ? ' fetchpriority="high"' : o.carregamento === "lazy" ? ' loading="lazy"' : "";
  return `<img${classes ? ` class="${classes}"` : ""} src="${escapeHtml(src)}"${srcset} width="${o.largura}" height="${o.altura}" alt="${escapeHtml(o.alt)}"${carga} decoding="async">`;
}

/** Destaque do perfil: o primeiro número (ou valor em R$) sai sozinho. */
export function destaqueEmPartes(texto: string): { antes: string; num: string; depois: string } {
  const m = /(?:R\$\s?)?\d+(?:[.,]\d+)*/.exec(texto);
  if (!m) return { antes: texto, num: "", depois: "" };
  return { antes: texto.slice(0, m.index), num: m[0], depois: texto.slice(m.index + m[0].length) };
}

export function destaqueHtml(texto: string): string {
  const { antes, num, depois } = destaqueEmPartes(texto);
  return `${escapeHtml(antes)}${num ? `<b>${escapeHtml(num)}</b>` : ""}${escapeHtml(depois)}`;
}

/** CNPJ sem pontuação → 00.000.000/0000-00 (ou 12.ABC.345/01DE-35); qualquer outra coisa volta como veio. */
export function formatarCnpj(digitos: string): string {
  if (!CNPJ.test(digitos)) return digitos;
  return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12)}`;
}

/** Fundo escuro pede a logoClara; sem ela, a escura vai numa placa clara (e o espelho no fundo claro). */
export function logoDaPagina(doc: DocumentoBio, fundo: string): LogoDaPagina | null {
  const rgb = parseHex(fundo);
  const escuro = rgb ? relativeLuminance(rgb) < 0.4 : false;
  const { logoClara, logoEscura } = doc.perfil;
  const certa = escuro ? logoClara : logoEscura;
  if (certa) return { midia: certa, placa: null };
  const errada = escuro ? logoEscura : logoClara;
  return errada ? { midia: errada, placa: escuro ? "clara" : "escura" } : null;
}

/** Tokens que podem ir para o `<style>`: chave `--nome`, valor `#RRGGBB` (aceita a chave sem `--`). */
export function tokensValidos(t: TokensBio): TokensBio {
  return Object.fromEntries(
    Object.entries(t).flatMap(([chave, valor]) => {
      const nome = chave.startsWith("--") ? chave : `--${chave}`;
      return NOME_DE_TOKEN.test(nome) && COR.test(valor) ? [[nome, valor.toUpperCase()]] : [];
    }),
  );
}

/** Atraso de entrada por posição (no lugar do `style="--i:n"` do mockup). */
export function atrasos(seletor: string, inicioMs: number, passoMs: number): string {
  let css = "";
  for (let n = 1; n <= MAX_LINKS; n++) {
    const ms = inicioMs + (n - 1) * passoMs;
    if (ms > 0) css += `${seletor}:nth-child(${n}){animation-delay:${ms}ms}`;
  }
  return css;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/render/partes.test.ts`
Expected: PASS — `tests 10`, `pass 10`, `fail 0`.

- [ ] **Step 7: Commit**

```bash
git add src/test/bio-dados-falsos.ts src/lib/bio/render/modelo.ts src/lib/bio/render/partes.ts src/lib/bio/render/partes.test.ts
git commit -m "feat(bio): render pieces for images, icons and text on the bio page"
```

---

### Task 2: Destino de cada link, endereço, confere, selo e CSS base

**Files:**
- Modify: `apps/web/src/lib/bio/render/partes.ts` (imports + segunda metade no fim)
- Test: `apps/web/src/lib/bio/render/partes.test.ts` (import + 9 testes no fim)

**Interfaces:**
- Consumes: Task 1 (`imagem`, `icone`, `formatarCnpj`, `CNPJ`, tipos de `modelo.ts`); do repo: `campaignLinkPath(origin: string, slug: string): string` (`@/lib/custom-domains/host`, sem import nenhum, roda no Edge e no navegador) e `getPublicSiteUrl(): string` (`@/lib/brand`, sem import; no navegador o Next embute o `NEXT_PUBLIC_SITE_URL`, e na prévia o selo nem leva `href`).
- Produces (`partes.ts`): `conteudoDoH1(c: ContextoRender, o: { classe: string; largura: number; altura: number; sizes: string }): string`, `hrefDoLink(l: LinkBio, d: DadosRender): string | null`, `linksVisiveis(d: DadosRender): LinkVisivel[]`, `hrefAttr(href: string, modo: ModoRender): string`, `dadosDoLink(v: LinkVisivel): string`, `detalhesDoEndereco(v: LinkVisivel, c: ContextoRender, o: { prefixo: string; classeDoResumo: string; resumo: string; foto: { largura: number; altura: number; sizes: string }; mapa?: string }): string`, `blocoConfere(doc: DocumentoBio, prefixo: string): string`, `feitoComGirumo(c: ContextoRender): string`, `CSS_BASE: string`.

- [ ] **Step 1: Write the failing tests** — em `partes.test.ts`, trocar o bloco de imports por:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import type { DadosRender, LinkBio } from "@/lib/bio/documento";
import { IDS, dadosFalsos, documentoFalso } from "@/test/bio-dados-falsos";
import type { ContextoRender } from "./modelo";
import {
  CSS_BASE,
  atrasos,
  blocoConfere,
  classeDoFoco,
  conteudoDoH1,
  destaqueEmPartes,
  destaqueHtml,
  detalhesDoEndereco,
  feitoComGirumo,
  formatarCnpj,
  hrefAttr,
  hrefDoLink,
  icone,
  imagem,
  linksVisiveis,
  logoDaPagina,
  pontoDoFoco,
  regrasDoFoco,
  sprite,
  tokensValidos,
  urlDaImagem,
} from "./partes";

const link = (id: string): LinkBio => {
  const achado = dadosFalsos().documento.links.find((l) => l.id === id);
  assert.ok(achado);
  return achado;
};
```

e acrescentar ao fim do arquivo:

```ts
test("WhatsApp: wa.me com a mensagem codificada; sem mensagem, sem ?text", () => {
  const d = dadosFalsos();
  const zap = link(IDS.whatsapp);
  assert.equal(hrefDoLink(zap, d), "https://wa.me/5562900000000?text=Oi!%20Vim%20pelo%20Instagram%20e%20quero%20ver%20os%20kits.");
  assert.equal(hrefDoLink({ ...zap, mensagem: "" } as LinkBio, d), "https://wa.me/5562900000000");
  assert.equal(hrefDoLink({ ...zap, numero: "62900000000" } as LinkBio, d), null);
  assert.equal(
    hrefDoLink({ ...zap, mensagem: "Kit #3 & tchau 😀" } as LinkBio, d),
    "https://wa.me/5562900000000?text=Kit%20%233%20%26%20tchau%20%F0%9F%98%80",
  );
});

test("grupo: /r/<slug> no host Girumo, /<slug> no domínio próprio; campanha sumida some", () => {
  const d = dadosFalsos();
  const grupo = link(IDS.grupo);
  assert.equal(hrefDoLink(grupo, d), "/r/vip-exemplo");
  assert.equal(hrefDoLink(grupo, { ...d, origem: "https://links.lojaexemplo.com.br", dominioProprio: true }), "/vip-exemplo");
  assert.equal(hrefDoLink(grupo, { ...d, campanhas: {} }), null);
  assert.equal(hrefDoLink({ ...grupo, campanhaId: "__proto__" } as LinkBio, d), null);
  assert.equal(hrefDoLink(grupo, { ...d, campanhas: { [IDS.campanha]: "../x" } }), null);
});

test("link: só http/https com host de verdade, emitido como url.href", () => {
  const d = dadosFalsos();
  const base = link(IDS.catalogo);
  const com = (url: string) => hrefDoLink({ ...base, url } as LinkBio, d);
  assert.equal(com("https://exemplo.com.br/a b"), "https://exemplo.com.br/a%20b");
  assert.equal(com("javascript:alert(1)"), null);
  assert.equal(com("data:text/html,oi"), null);
  assert.equal(com("ftp://exemplo.com.br"), null);
  assert.equal(com("https://localhost/x"), null);
  assert.equal(com("não é url"), null);
});

test("endereço: Google Maps com o endereço numa linha", () => {
  assert.equal(
    hrefDoLink(link(IDS.endereco), dadosFalsos()),
    "https://www.google.com/maps/search/?api=1&query=Rua%20Exemplo%2C%20100%2C%20Centro%2C%20Cidade%20Exemplo",
  );
});

test("links visíveis: desligado, escondido e sem destino somem; um principal só, nunca o endereço", () => {
  const d = dadosFalsos();
  const links = d.documento.links.map((l) =>
    l.id === IDS.canal ? { ...l, ativo: false } : l.tipo === "link" ? { ...l, destaque: true } : l,
  );
  const dados: DadosRender = { ...d, documento: { ...d.documento, links }, linksEscondidos: [IDS.grupo] };
  const v = linksVisiveis(dados);
  assert.deepEqual(v.map((x) => x.link.id), [IDS.whatsapp, IDS.catalogo, IDS.endereco]);
  assert.deepEqual(v.map((x) => x.principal), [true, false, false]);
  const semGrupo = linksVisiveis({ ...d, campanhas: {} });
  assert.ok(!semGrupo.some((x) => x.link.id === IDS.grupo));
});

test("prévia não leva href; a pública escapa o destino", () => {
  assert.equal(hrefAttr("https://a.com.br/?x=1&y=2", "previa"), "");
  assert.equal(hrefAttr("https://a.com.br/?x=1&y=2", "publica"), ' href="https://a.com.br/?x=1&amp;y=2"');
});

test("confere: Pix com Copiar CNPJ só com razão e CNPJ; linhas com ✓; nada sem conteúdo", () => {
  const doc = documentoFalso();
  const html = blocoConfere(doc, "et");
  assert.match(html, /^<section class="et-confere" aria-labelledby="lk-confere"><h2 id="lk-confere">Antes de pagar, confere<\/h2>/);
  assert.match(html, /O Pix cai só no nome <b>Ateliê Exemplo Comércio de Roupas Ltda<\/b>\./);
  assert.match(html, /<span>CNPJ 11\.222\.333\/0001-81<\/span><button type="button" class="et-copiar" data-copiar="11222333000181">Copiar CNPJ<\/button>/);
  assert.equal(html.match(/#lk-i-check/g)?.length, 2);
  assert.equal(blocoConfere({ ...doc, confere: { ...doc.confere, ativo: false } }, "et"), "");
  assert.doesNotMatch(blocoConfere({ ...doc, confere: { ...doc.confere, razao: "" } }, "et"), /data-copiar/);
  assert.equal(blocoConfere({ ...doc, confere: { ativo: true, razao: "", cnpj: "", linhas: [] } }, "et"), "");
});

test("h1, endereço e selo saem do contexto: logo ou nome, <details> e selo sem href na prévia", () => {
  const d = dadosFalsos();
  const ctx = (o: Partial<ContextoRender>): ContextoRender => ({ d, modo: "publica", tokens: {}, links: linksVisiveis(d), logo: null, ...o });
  const tam = { classe: "et-logo", largura: 190, altura: 84, sizes: "190px" };
  assert.equal(conteudoDoH1(ctx({}), tam), "Ateliê Exemplo Kids");
  const logo = { midia: { id: "logo-x", foco: null }, placa: "escura" as const };
  assert.match(conteudoDoH1(ctx({ logo }), tam), /^<span class="lk-placa lk-placa--escura"><img class="et-logo" src="[^"]*logo-x[^"]*"[^>]*alt="Ateliê Exemplo Kids" decoding="async"><\/span>$/);
  const endereco = ctx({}).links.find((v) => v.link.tipo === "endereco");
  assert.ok(endereco);
  const det = detalhesDoEndereco(endereco, ctx({ modo: "previa" }), { prefixo: "x", classeDoResumo: "x-tag", resumo: "R", foto: { largura: 640, altura: 480, sizes: "100vw" }, mapa: "Mapa →" });
  assert.match(det, /^<details class="x-abre"><summary class="x-tag" data-link="[^"]+" data-tipo="endereco">R<\/summary><div class="x-caminho"><img /);
  assert.match(det, /<a class="x-mapa">Mapa →<\/a><\/div><\/details>$/);
  assert.match(feitoComGirumo(ctx({ modo: "previa" })), /^<a class="lk-feito"><svg/);
  assert.equal(feitoComGirumo(ctx({ d: { ...d, documento: { ...d.documento, feitoComGirumo: false } } })), "");
});

test("CSS base: foco visível, alvo de 44 px no selo e movimento reduzido desliga tudo", () => {
  assert.match(CSS_BASE, /\.lk :focus-visible\{outline:3px solid var\(--foco\);outline-offset:3px\}/);
  assert.match(CSS_BASE, /\.lk-feito\{[^}]*min-height:44px/);
  assert.match(CSS_BASE, /@media \(prefers-reduced-motion:reduce\)\{\.lk \*,\.lk \*::before,\.lk \*::after\{animation:none!important;transition:none!important\}\}/);
  assert.match(CSS_BASE, /\.lk-status:empty\{/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/render/partes.test.ts`
Expected: FAIL — os 9 testes novos com `is not a function` (ou `CSS_BASE` indefinido); os 10 da Task 1 seguem passando.

- [ ] **Step 3: Implement** — em `partes.ts`, trocar o bloco de imports por:

```ts
import type { TokensBio } from "@/lib/bio/cores";
import type { DadosRender, DocumentoBio, LinkBio, MidiaRef } from "@/lib/bio/documento";
import { getPublicSiteUrl } from "@/lib/brand";
import { escapeHtml } from "@/lib/campaigns/entry-page";
import { campaignLinkPath } from "@/lib/custom-domains/host";
import { parseHex, relativeLuminance } from "@/lib/pages/palette";
import type { ContextoRender, LinkVisivel, LogoDaPagina, ModoRender } from "./modelo";
```

acrescentar, junto das outras constantes (logo abaixo de `ID_DE_MIDIA`):

```ts
const SLUG_DE_CAMPANHA = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
```

e acrescentar ao fim do arquivo:

```ts
/** Miolo do `<h1>`: a logo (alt = nome) ou o nome em texto. */
export function conteudoDoH1(
  c: ContextoRender,
  o: { classe: string; largura: number; altura: number; sizes: string },
): string {
  const nome = c.d.documento.perfil.nome;
  const img = c.logo ? imagem(c.logo.midia, { ...o, alt: nome, carregamento: "normal" }) : "";
  if (!img) return escapeHtml(nome);
  if (!c.logo?.placa) return img;
  return `<span class="lk-placa${c.logo.placa === "escura" ? " lk-placa--escura" : ""}">${img}</span>`;
}

function urlSegura(bruta: string): string | null {
  try {
    const u = new URL(bruta);
    const protocoloOk = u.protocol === "https:" || u.protocol === "http:";
    return protocoloOk && u.hostname.includes(".") ? u.href : null;
  } catch {
    return null;
  }
}

/** Destino de cada tipo (spec §4); `null` = o link some da página. */
export function hrefDoLink(l: LinkBio, d: DadosRender): string | null {
  switch (l.tipo) {
    case "whatsapp": {
      if (!/^55\d{10,11}$/.test(l.numero)) return null;
      const texto = l.mensagem ? `?text=${encodeURIComponent(l.mensagem)}` : "";
      return urlSegura(`https://wa.me/${l.numero}${texto}`);
    }
    case "grupo": {
      const slug = Object.hasOwn(d.campanhas, l.campanhaId) ? d.campanhas[l.campanhaId] : "";
      return SLUG_DE_CAMPANHA.test(slug) ? campaignLinkPath(d.origem, slug) : null;
    }
    case "link":
      return urlSegura(l.url);
    case "endereco": {
      const linha = l.endereco.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join(", ");
      return linha ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(linha)}` : null;
    }
  }
}

/** Os links que saem, na ordem do documento; o primeiro `destaque` vira o principal. */
export function linksVisiveis(d: DadosRender): LinkVisivel[] {
  const escondidos = new Set(d.linksEscondidos);
  const saida: LinkVisivel[] = [];
  for (const link of d.documento.links) {
    if (!link.ativo || escondidos.has(link.id)) continue;
    const href = hrefDoLink(link, d);
    if (!href) continue;
    const principal = link.tipo !== "endereco" && link.destaque && !saida.some((v) => v.principal);
    saida.push({ link, href, principal });
  }
  return saida;
}

/** ` href="…"` na página pública; nada na prévia (o clique não navega o iframe). */
export function hrefAttr(href: string, modo: ModoRender): string {
  return modo === "publica" ? ` href="${escapeHtml(href)}"` : "";
}

/** O que o JS da página lê: uuid do link e o tipo (lista fechada). */
export function dadosDoLink(v: LinkVisivel): string {
  return ` data-link="${escapeHtml(v.link.id)}" data-tipo="${v.link.tipo}"`;
}

/** "Como chegar": abre ali mesmo, com foto, endereço, horário e o mapa. */
export function detalhesDoEndereco(
  v: LinkVisivel,
  c: ContextoRender,
  o: {
    prefixo: string;
    classeDoResumo: string;
    resumo: string;
    foto: { largura: number; altura: number; sizes: string };
    mapa?: string;
  },
): string {
  if (v.link.tipo !== "endereco") return "";
  const l = v.link;
  const foto = l.foto ? imagem(l.foto, { ...o.foto, alt: "", carregamento: "lazy" }) : "";
  const hora = l.horario ? `<p class="${o.prefixo}-hora">${escapeHtml(l.horario)}</p>` : "";
  const mapa = o.mapa ?? `${icone("mapa-dobrado")}Abrir no Google Maps`;
  return `<details class="${o.prefixo}-abre"><summary class="${o.classeDoResumo}"${dadosDoLink(v)}>${o.resumo}</summary><div class="${o.prefixo}-caminho">${foto}<address>${escapeHtml(l.endereco)}</address>${hora}<a class="${o.prefixo}-mapa"${hrefAttr(v.href, c.modo)}>${mapa}</a></div></details>`;
}

/** "Antes de pagar, confere": Pix com CNPJ (razão + CNPJ válido) e até 2 linhas; "" sem nada a mostrar. */
export function blocoConfere(doc: DocumentoBio, prefixo: string): string {
  const cf = doc.confere;
  if (!cf.ativo) return "";
  const itens: string[] = [];
  if (cf.razao && CNPJ.test(cf.cnpj)) {
    itens.push(
      `<li>${icone("cartao")}<span>O Pix cai só no nome <b>${escapeHtml(cf.razao)}</b>.<span class="${prefixo}-cnpj"><span>CNPJ ${formatarCnpj(cf.cnpj)}</span><button type="button" class="${prefixo}-copiar" data-copiar="${cf.cnpj}">Copiar CNPJ</button></span></span></li>`,
    );
  }
  for (const linha of cf.linhas) {
    if (linha.trim()) itens.push(`<li>${icone("check")}<span>${escapeHtml(linha)}</span></li>`);
  }
  if (itens.length === 0) return "";
  return `<section class="${prefixo}-confere" aria-labelledby="lk-confere"><h2 id="lk-confere">Antes de pagar, confere</h2><ul>${itens.join("")}</ul></section>`;
}

/** Selo do rodapé; leva ao site da Girumo (nunca ao domínio da página), com a origem do clique. */
export function feitoComGirumo(c: ContextoRender): string {
  if (!c.d.documento.feitoComGirumo) return "";
  const url = `${getPublicSiteUrl()}/?utm_source=link-da-bio&utm_medium=rodape`;
  return `<a class="lk-feito"${hrefAttr(url, c.modo)}>${icone("girumo")}Feito com Girumo</a>`;
}

/** CSS comum: reset do `.lk`, foco, ícones, "Feito com Girumo", placa da logo, aviso e movimento reduzido. */
export const CSS_BASE = [
  "body{margin:0}",
  ".lk{position:relative;min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;overflow-wrap:anywhere;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;text-size-adjust:100%}",
  ".lk>main{flex:1 0 auto}",
  ":where(.lk) *,:where(.lk) *::before,:where(.lk) *::after{box-sizing:border-box}",
  ":where(.lk) img{max-width:100%;display:block}",
  ":where(.lk) :is(h1,h2,p,figure){margin:0}",
  ":where(.lk) :is(ul,ol){margin:0;padding:0;list-style:none}",
  ":where(.lk) a{color:inherit}",
  ":where(.lk) button{font:inherit}",
  ".lk :focus-visible{outline:3px solid var(--foco);outline-offset:3px}",
  ".lk-sprite{position:absolute;width:0;height:0;overflow:hidden}",
  ".lk svg.i{width:22px;height:22px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}",
  ".lk details>summary{list-style:none;cursor:pointer}",
  ".lk details>summary::-webkit-details-marker{display:none}",
  ".lk-feito{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:4px 14px;border-radius:999px;border:1px solid currentColor;font-size:12px;font-weight:600;text-decoration:none;color:inherit}",
  ".lk-feito svg.i{width:14px;height:14px}",
  ".lk-placa{display:inline-block;padding:8px 18px;border-radius:999px;background:#fff}",
  ".lk-placa--escura{background:#141414}",
  ".lk-status{position:fixed;left:50%;bottom:16px;z-index:9;max-width:calc(100% - 32px);padding:10px 16px;border-radius:999px;background:var(--tinta);color:var(--papel);font-size:14px;font-weight:600;line-height:1.3;text-align:center;transform:translateX(-50%);box-shadow:0 10px 30px -10px rgb(0 0 0 / .45)}",
  ".lk-status:empty{padding:0;box-shadow:none}",
  "@media (prefers-reduced-motion:reduce){.lk *,.lk *::before,.lk *::after{animation:none!important;transition:none!important}}",
].join("");
```

(`.lk-status:empty` sem padding vira uma caixa 0×0: some da tela e continua na árvore de acessibilidade, que é o que faz o leitor de tela anunciar quando o texto chega.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/render/partes.test.ts`
Expected: PASS — `tests 19`, `pass 19`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bio/render/partes.ts src/lib/bio/render/partes.test.ts
git commit -m "feat(bio): link targets, address, confere, badge and base CSS for the bio page"
```

---

### Task 3: O JS da página (`script.ts`)

**Files:**
- Create: `apps/web/src/lib/bio/render/script.ts`
- Test: `apps/web/src/lib/bio/render/script.test.ts`

**Interfaces:**
- Consumes: nada (o JS só lê a marcação do §9).
- Produces: `scriptDaPagina(o: { rastreio: { metaPixelId: string; ga4Id: string } | null }): string` — o JS sem a tag. Neste PR ignora `o` (o `index.ts` passa `rastreio: null`). Comportamento: clique num `[data-link]` põe a classe `lk-toque` por 1,6 s e, para `whatsapp`/`grupo`/`link`, escreve "Abrindo o WhatsApp…"/"Abrindo o grupo…"/"Abrindo…" no `#lk-status` por 3 s; clique num `[data-copiar]` chama `navigator.clipboard.writeText(<CNPJ sem pontuação>)` e só quando resolver troca o rótulo por "Copiado" (volta a "Copiar CNPJ" em 2,2 s) e anuncia "CNPJ copiado."; `pageshow` limpa o status.

- [ ] **Step 1: Write the failing test** — criar `apps/web/src/lib/bio/render/script.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { scriptDaPagina } from "./script";

const JS = scriptDaPagina({ rastreio: null });

type Ouvinte = (e: unknown) => void;

/** Roda o script com um DOM falso: só o que ele usa (status, clique, pageshow, área de transferência). */
function monta(clipboard: "ok" | "falha" | "sem" = "ok") {
  const status = { textContent: "" };
  const ouvintes: Record<string, Ouvinte> = {};
  const copiados: string[] = [];
  const timers: (() => void)[] = [];
  const navegador =
    clipboard === "sem"
      ? {}
      : {
          clipboard: {
            writeText: (t: string) => {
              copiados.push(t);
              return clipboard === "ok" ? Promise.resolve() : Promise.reject(new Error("negado"));
            },
          },
        };
  const documento = {
    getElementById: (id: string) => (id === "lk-status" ? status : null),
    addEventListener: (tipo: string, fn: Ouvinte) => {
      ouvintes[tipo] = fn;
    },
  };
  new Function("document", "navigator", "addEventListener", "setTimeout", "clearTimeout", JS)(
    documento,
    navegador,
    (tipo: string, fn: Ouvinte) => {
      ouvintes[`janela:${tipo}`] = fn;
    },
    (fn: () => void) => timers.push(fn),
    () => undefined,
  );
  /** Roda os setTimeout pendentes (o relógio do teste). */
  const passa = () => timers.splice(0).forEach((fn) => fn());
  return { status, ouvintes, copiados, passa };
}

function elemento(attrs: Record<string, string>) {
  const classes = new Set<string>();
  const el = {
    textContent: "Copiar CNPJ",
    offsetWidth: 0,
    getAttribute: (n: string) => (n in attrs ? attrs[n] : null),
    classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) },
    closest: (): unknown => el,
  };
  return { el, classes };
}

const tique = () => new Promise((r) => setImmediate(r));

test("cabe em 3 KB e não tem '<' (nunca fecha o <script>)", () => {
  assert.ok(Buffer.byteLength(JS) <= 3 * 1024, `${Buffer.byteLength(JS)} bytes`);
  assert.doesNotMatch(JS, /</);
});

test("toque no WhatsApp: 'Abrindo o WhatsApp…' no status e a classe do balanço", () => {
  const { status, ouvintes } = monta();
  const { el, classes } = elemento({ "data-link": "x", "data-tipo": "whatsapp" });
  ouvintes.click({ target: el });
  assert.equal(status.textContent, "Abrindo o WhatsApp…");
  assert.ok(classes.has("lk-toque"));
});

test("grupo e link dizem o que abrem; endereço só balança", () => {
  const casos: [string, string][] = [["grupo", "Abrindo o grupo…"], ["link", "Abrindo…"], ["endereco", ""], ["constructor", ""]];
  for (const [tipo, esperado] of casos) {
    const { status, ouvintes } = monta();
    const { el, classes } = elemento({ "data-link": "x", "data-tipo": tipo });
    ouvintes.click({ target: el });
    assert.equal(status.textContent, esperado, tipo);
    assert.ok(classes.has("lk-toque"), tipo);
  }
});

test("clique fora de botão não faz nada", () => {
  const { status, ouvintes } = monta();
  ouvintes.click({ target: { closest: () => null } });
  ouvintes.click({ target: null });
  assert.equal(status.textContent, "");
});

test("Copiar CNPJ: 'Copiado' só quando o writeText resolve", async () => {
  const ok = monta("ok");
  const botao = elemento({ "data-copiar": "11222333000181" });
  ok.ouvintes.click({ target: botao.el });
  await tique();
  assert.deepEqual(ok.copiados, ["11222333000181"]);
  assert.equal(botao.el.textContent, "Copiado");
  assert.equal(ok.status.textContent, "CNPJ copiado.");
  assert.ok(!botao.classes.has("lk-toque"));
  ok.passa();
  assert.equal(botao.el.textContent, "Copiar CNPJ");
  assert.equal(ok.status.textContent, "");

  const negado = monta("falha");
  const outro = elemento({ "data-copiar": "11222333000181" });
  negado.ouvintes.click({ target: outro.el });
  await tique();
  assert.equal(outro.el.textContent, "Copiar CNPJ");
  assert.equal(negado.status.textContent, "");

  const sem = monta("sem");
  const terceiro = elemento({ "data-copiar": "11222333000181" });
  sem.ouvintes.click({ target: terceiro.el });
  await tique();
  assert.equal(terceiro.el.textContent, "Copiar CNPJ");
});

test("voltar para a página (pageshow) limpa o status", () => {
  const { status, ouvintes } = monta();
  ouvintes.click({ target: elemento({ "data-link": "x", "data-tipo": "link" }).el });
  assert.equal(status.textContent, "Abrindo…");
  ouvintes["janela:pageshow"]({});
  assert.equal(status.textContent, "");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/render/script.test.ts`
Expected: FAIL — `Cannot find module` para `./script`.

- [ ] **Step 3: Implement** — criar `apps/web/src/lib/bio/render/script.ts`. O JS é ES5 de propósito (navegador do Instagram antigo) e sem `<` (nunca fecha o `<script>`):

```ts
/**
 * O JS inline da página do link da bio, devolvido sem a tag (o `index.ts` o
 * embrulha em `<script nonce>`). Nenhum texto do lojista entra aqui: o script
 * só lê `data-*` que o renderizador emite (uuid do link, tipo de lista fechada,
 * CNPJ sem pontuação, só [0-9A-Z]). PR 3a: "Abrindo…" no `#lk-status`, balanço do toque e
 * "Copiado". PR 4b acrescenta o sendBeacon no ramo do `[data-link]`; PR 7, o
 * Pixel e o GA4 a partir de `rastreio`.
 */
const JS = [
  "(function(){",
  'var d=document,s=d.getElementById("lk-status"),t=0,',
  'M={whatsapp:"Abrindo o WhatsApp…",grupo:"Abrindo o grupo…",link:"Abrindo…"};',
  'function diz(x){if(!s)return;s.textContent=x;clearTimeout(t);if(x)t=setTimeout(function(){s.textContent=""},3000)}',
  'd.addEventListener("click",function(e){',
  'var a=e.target&&e.target.closest?e.target.closest("[data-link],[data-copiar]"):null;if(!a)return;',
  'var c=a.getAttribute("data-copiar");',
  "if(c!==null){var n=navigator.clipboard;if(n&&n.writeText)n.writeText(c).then(function(){",
  'a.textContent="Copiado";diz("CNPJ copiado.");setTimeout(function(){a.textContent="Copiar CNPJ"},2200)},function(){});return}',
  'a.classList.remove("lk-toque");void a.offsetWidth;a.classList.add("lk-toque");',
  'setTimeout(function(){a.classList.remove("lk-toque")},1600);',
  'var k=a.getAttribute("data-tipo");if(k&&M.hasOwnProperty(k))diz(M[k])});',
  'addEventListener("pageshow",function(){diz("")})',
  "})();",
].join("");

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function scriptDaPagina(o: { rastreio: { metaPixelId: string; ga4Id: string } | null }): string {
  return JS; // PR 7 passa a ler o.rastreio
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/render/script.test.ts`
Expected: PASS — `tests 6`, `pass 6`, `fail 0` (o JS tem 906 bytes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/bio/render/script.ts src/lib/bio/render/script.test.ts
git commit -m "feat(bio): inline page script for the opening status, tap swing and copy CNPJ"
```

---

### Task 4: CSS do Etiqueta, fonte Lexend e contraste

**Files:**
- Create: `apps/web/src/lib/bio/render/etiqueta.ts` (só o CSS; a Task 5 completa)
- Create: `apps/web/public/fonts/bio/lexend/lexend-latin.woff2`, `apps/web/public/fonts/bio/lexend/OFL.txt`
- Test: `apps/web/src/lib/bio/render/etiqueta.test.ts`

**Interfaces:**
- Consumes: `atrasos` e `tokensValidos` (Task 1); PR 2: `coresDoModelo(modelo: Modelo, paleta: string, cores: DocumentoBio["cores"]): TokensBio` e `PALETAS`; do repo: `contrastRatio`, `parseHex` (`@/lib/pages/palette`).
- Produces: `CSS_ETIQUETA: string` (o CSS fixo do modelo; nenhuma interpolação de dado da loja) e os arquivos da fonte em `/fonts/bio/lexend/lexend-latin.woff2`.

- [ ] **Step 1: A fonte** (Git Bash, em `apps/web`). O woff2 é o subset `latin` da Lexend variável (pesos 100–900), o **mesmo arquivo** que o Google Fonts serve (`fonts.gstatic.com/s/lexend/v26/…-6QU.woff2`, método do `src/fonts/README.md`); o pacote npm fixa a versão:

```bash
mkdir -p public/fonts/bio/lexend
D=$(mktemp -d)
npm pack @fontsource-variable/lexend@5.3.0 --pack-destination "$D" --silent
tar -xzf "$D/fontsource-variable-lexend-5.3.0.tgz" -C "$D" package/files/lexend-latin-wght-normal.woff2
cp "$D/package/files/lexend-latin-wght-normal.woff2" public/fonts/bio/lexend/lexend-latin.woff2
curl -fsSL -o public/fonts/bio/lexend/OFL.txt "https://raw.githubusercontent.com/google/fonts/beda156f5a2abc96ec52442f60bb1ab4d122e38d/ofl/lexend/OFL.txt"
rm -rf "$D"
sha256sum public/fonts/bio/lexend/lexend-latin.woff2 public/fonts/bio/lexend/OFL.txt
wc -c public/fonts/bio/lexend/lexend-latin.woff2
head -1 public/fonts/bio/lexend/OFL.txt
```

Expected:
```
b7e7538f59bff1812841d7627f8e49e70fe86438f9f7b397a028c0d05301c874 *public/fonts/bio/lexend/lexend-latin.woff2
5da8505887d0fa7fe963445fd58852707fda34adfeb65af25c99d152bab285bd *public/fonts/bio/lexend/OFL.txt
39680 public/fonts/bio/lexend/lexend-latin.woff2
Copyright 2018 The Lexend Project Authors (https://github.com/googlefonts/lexend), with Reserved Font Name “RevReading Lexend”.
```

Hash diferente → parar (arquivo errado). O `OFL.txt` vem do commit fixo do `google/fonts` (o README dos `src/fonts` manda copiar de lá).

- [ ] **Step 2: Write the failing test** — criar `apps/web/src/lib/bio/render/etiqueta.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { coresDoModelo } from "@/lib/bio/cores";
import { PALETAS } from "@/lib/bio/documento";
import { contrastRatio, parseHex } from "@/lib/pages/palette";
import { CSS_ETIQUETA } from "./etiqueta";
import { CSS_BASE, tokensValidos } from "./partes";

/** Todo par de cor que o CSS do Etiqueta desenha: [frente, fundo, mínimo, onde]. */
const PARES: [string, string, number, string][] = [
  ["on", "fundo2", 4.5, "frase, nome e Abrir no Google Maps"],
  ["on", "fundo1", 3, "topo do degradê (o contraste.py do mockup aceita 3)"],
  ["on", "chip", 4.5, "destaques"],
  ["acento", "chip", 4.5, "número do destaque"],
  ["on2", "fundo3", 4.5, "rodapé"],
  ["tinta", "cartao", 4.5, "título da etiqueta"],
  ["tinta2", "cartao", 4.5, "subtítulo da etiqueta"],
  ["seta", "cartao", 3, "seta"],
  ["ico", "icobg", 4.5, "ícone e texto do Copiar CNPJ"],
  ["printinta", "prin", 4.5, "etiqueta principal"],
  ["tinta", "papel", 4.5, "confere, endereço, horário e o aviso #lk-status"],
  ["ico", "papel", 4.5, "título do confere"],
  ["foco", "fundo1", 3, "anel de foco no degradê"],
  ["foco", "fundo2", 3, "anel de foco no degradê"],
  ["foco", "fundo3", 3, "anel de foco no degradê"],
];

const razao = (a: string, b: string) => contrastRatio(parseHex(a)!, parseHex(b)!);

/** O ícone do principal fica sobre rgb(0 0 0 / .1) em cima de --prin. */
function escurece(hex: string, t: number): string {
  const c = parseHex(hex)!;
  return `#${[c.r, c.g, c.b].map((v) => Math.round(v * (1 - t)).toString(16).padStart(2, "0")).join("")}`;
}

function falhas(t: Record<string, string>): string[] {
  const cor = (nome: string) => t[`--${nome}`];
  const lista = PARES.flatMap(([a, b, min, onde]) =>
    !cor(a) || !cor(b) || razao(cor(a), cor(b)) < min ? [`${a}/${b} (${onde})`] : [],
  );
  if (!cor("printinta") || !cor("prin") || razao(cor("printinta"), escurece(cor("prin"), 0.1)) < 3) lista.push("ícone do principal");
  return lista;
}

/** mulberry32: 500 cores iguais em toda rodada. */
function sorteio(semente: number) {
  let s = semente;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `[seletor, declarações]` de cada regra (inclusive as de dentro do @media). */
function regras(css: string): [string, string][] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]]);
}

test("as 4 paletas do Etiqueta passam em todo par que o modelo desenha", () => {
  for (const paleta of PALETAS.etiqueta) {
    assert.deepEqual(falhas(tokensValidos(coresDoModelo("etiqueta", paleta, null))), [], paleta);
  }
});

test("cores da marca: 500 pares aleatórios passam em todo par", () => {
  const r = sorteio(20261019);
  const hex = () => `#${Math.floor(r() * 0x1000000).toString(16).padStart(6, "0").toUpperCase()}`;
  const ruins: string[] = [];
  for (let i = 0; i < 500; i++) {
    const cores = { fundo: hex(), botao: hex() };
    const f = falhas(tokensValidos(coresDoModelo("etiqueta", "marca", cores)));
    if (f.length) ruins.push(`${cores.fundo}/${cores.botao}: ${f.join(", ")}`);
  }
  assert.deepEqual(ruins.slice(0, 5), []);
});

test("toda variável que o CSS lê existe nas 4 paletas e na marca", () => {
  const usadas = [...new Set(`${CSS_BASE}${CSS_ETIQUETA}`.match(/var\(--[a-z0-9-]+\)/g))].map((v) => v.slice(4, -1));
  assert.ok(usadas.length >= 20);
  for (const paleta of [...PALETAS.etiqueta, "marca"]) {
    const cores = paleta === "marca" ? { fundo: "#3A80BF", botao: "#F28C28" } : null;
    const t = tokensValidos(coresDoModelo("etiqueta", paleta, cores));
    assert.deepEqual(usadas.filter((v) => !(v in t)), [], paleta);
  }
});

test("a máscara da etiqueta fica no ::before: o <a> focado não é recortado", () => {
  const comMascara = regras(CSS_ETIQUETA).filter(([, decl]) => /(?:^|;)(?:-webkit-)?mask/.test(decl));
  assert.ok(comMascara.length > 0);
  for (const [seletor] of comMascara) assert.match(seletor, /::before$/, seletor);
});

test("nada de opacity em texto: só o fio decorativo usa", () => {
  const comOpacity = regras(CSS_ETIQUETA).filter(([, decl]) => /opacity/.test(decl)).map(([s]) => s);
  assert.deepEqual(comOpacity, [".et-fio::before"]);
});

test("cor de paleta só por var(--…): hex literal só fora da paleta", () => {
  const literais = new Set(CSS_ETIQUETA.match(/#[0-9A-Fa-f]{3,8}\b/g));
  assert.deepEqual([...literais].sort(), ["#0000", "#000", "#25D366", "#fff"].sort());
});

test("o balanço do toque não depende da entrada; tudo que mexe fica em no-preference", () => {
  const [antes, depois] = CSS_ETIQUETA.split("@media (prefers-reduced-motion:no-preference){");
  assert.ok(depois);
  assert.doesNotMatch(antes, /animation|transition/);
  assert.match(depois, /\.et-tag\.lk-toque\{animation:et-balanca/);
  assert.doesNotMatch(depois, /\.lk-entra \.et-tag\.lk-toque/);
  assert.match(depois, /\.lk-entra \.et-fio>li\{animation:et-assenta/);
  assert.match(depois, /\.lk-entra \.et-fio>li:nth-child\(2\)\{animation-delay:70ms\}/);
});

test("alvo de toque ≥ 44 px no que não é etiqueta", () => {
  assert.match(CSS_ETIQUETA, /\.et-copiar\{[^}]*min-height:44px/);
  assert.match(CSS_ETIQUETA, /\.et-mapa\{[^}]*min-height:48px/);
  assert.match(CSS_ETIQUETA, /\.et-tag\{[^}]*min-height:76px/);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/render/etiqueta.test.ts`
Expected: FAIL — `Cannot find module` para `./etiqueta`.

- [ ] **Step 4: Implement** — criar `apps/web/src/lib/bio/render/etiqueta.ts` com o CSS. São os valores do mockup (`Main.dc.html`, bloco "ETIQUETA") com as mudanças da tabela de decisões: a máscara e o fundo da etiqueta passam para o `::before` (com `isolation:isolate` no `<a>`), o subtítulo do principal perde o `opacity:.82`, `h1`/frase/local ganham classes próprias, o véu do "onde fica" é fixo, os alvos sobem para 44 px, o foco dentro do papel usa `--tinta`, e todo movimento fica em `no-preference`:

```ts
/**
 * Modelo Etiqueta (padrão): botões = etiquetas de roupa furadas na ponta,
 * penduradas num fio; entram balançando e balançam no toque. Valores do
 * mockup (Main.dc.html, prefixo `et-`) com as regras da revisão: a máscara
 * fica no ::before (o foco do <a> não é recortado), sem opacity em texto,
 * alvos ≥ 44 px, h1 = nome da loja, nada de style=.
 */
import { atrasos } from "./partes";

const MASCARA =
  "radial-gradient(circle 5.5px at 21px 50%,#0000 96%,#000 100%),linear-gradient(135deg,#0000 15px,#000 15.5px),linear-gradient(45deg,#0000 15px,#000 15.5px)";

export const CSS_ETIQUETA = [
  '.lk{font-family:"Lexend","Segoe UI",system-ui,sans-serif}',
  ".et{background:radial-gradient(120% 60% at 50% 0%,var(--fundo1) 0%,var(--fundo2) 55%,var(--fundo3) 130%);color:var(--on);font-size:16px;line-height:1.45;padding:18px 16px 28px}",
  ".et-col{max-width:460px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr);gap:18px}",
  ".et-vitrine{position:relative;border-radius:22px;overflow:hidden;aspect-ratio:5/4;background:var(--fundo3);box-shadow:0 22px 50px -26px rgb(10 30 55 / .7)}",
  ".et-vitrine img{width:100%;height:100%;object-fit:cover}",
  ".et-onde{position:absolute;left:12px;bottom:12px;right:12px;display:flex;align-items:center;gap:8px;background:rgb(0 0 0 / .62);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);border-radius:12px;padding:8px 12px;font-size:13px;line-height:1.3;color:#fff}",
  ".et-onde svg.i,.et-local svg.i{width:16px;height:16px;color:var(--fio)}",
  ".et-marca{display:grid;justify-items:center;gap:10px;text-align:center}",
  ".et-nome{font-size:26px;font-weight:700;letter-spacing:-.02em;line-height:1.15;max-width:22ch}",
  ".et-logo{width:190px;height:84px;object-fit:contain}",
  ".lk-placa .et-logo{width:150px;height:66px}",
  ".et-frase{font-size:17px;font-weight:500;letter-spacing:-.005em;max-width:30ch;line-height:1.35}",
  ".et-local{display:flex;align-items:center;justify-content:center;gap:6px;font-size:13.5px;line-height:1.35}",
  ".et-fatos{display:flex;flex-wrap:wrap;justify-content:center;gap:6px}",
  ".et-fatos li{font-size:12.5px;font-weight:500;padding:5px 11px;border-radius:999px;background:var(--chip);border:1px solid var(--chipbd)}",
  ".et-fatos b{font-weight:700;color:var(--acento)}",
  ".et-fio{position:relative;padding:6px 0;display:grid;gap:12px}",
  '.et-fio::before{content:"";position:absolute;left:21px;top:-10px;bottom:-10px;width:2px;margin-left:-1px;border-radius:2px;background:var(--fio);opacity:.9}',
  ".et-fio>li{filter:drop-shadow(0 10px 16px rgb(10 30 55 / .32));transform-origin:21px 50%}",
  ".et-tag{position:relative;isolation:isolate;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px;min-height:76px;padding:12px 16px 12px 40px;color:var(--tinta);text-decoration:none;border-radius:0 16px 16px 0;transform-origin:21px 50%;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}",
  `.et-tag::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit;background:var(--cartao);-webkit-mask:${MASCARA};-webkit-mask-composite:source-in,source-in;mask:${MASCARA};mask-composite:intersect}`,
  ".et-ico{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--icobg);color:var(--ico)}",
  ".et-txt{display:grid;gap:2px;min-width:0}",
  ".et-rot{font-size:17px;font-weight:700;letter-spacing:-.01em;line-height:1.2}",
  ".et-sub{font-size:13.5px;color:var(--tinta2);line-height:1.3}",
  ".lk svg.et-seta{width:20px;height:20px;color:var(--seta);stroke-width:2.4}",
  ".et-tag--prin{color:var(--printinta);min-height:88px}",
  ".et-tag--prin::before{background:var(--prin)}",
  ".et-tag--prin .et-rot{font-size:18.5px}",
  ".et-tag--prin .et-sub,.lk .et-tag--prin svg.et-seta{color:var(--printinta)}",
  ".et-tag--prin .et-ico{background:rgb(0 0 0 / .1);color:var(--printinta);border-radius:50%}",
  ".lk .et-ico--zap,.lk .et-tag--prin .et-ico--zap{background:#25D366;color:#fff;border-radius:50%}",
  ".et-capas{display:flex;flex:none}",
  ".et-capas img{width:32px;height:42px;object-fit:cover;border-radius:7px;border:2px solid #fff;margin-left:-14px;box-shadow:0 4px 10px -4px rgb(10 30 55 / .5)}",
  ".et-capas img:first-child{margin-left:0;rotate:-6deg}",
  ".et-capas img:last-child{rotate:6deg}",
  ".et-abre[open] svg.et-seta{transform:rotate(90deg)}",
  ".et-caminho{margin:10px 0 0 34px;padding:14px;border-radius:16px;background:var(--papel);color:var(--tinta);display:grid;gap:12px}",
  ".et-caminho img{width:100%;height:auto;aspect-ratio:4/3;object-fit:cover;object-position:50% 30%;border-radius:12px}",
  ".et-caminho address{font-style:normal;font-size:14px;line-height:1.45;white-space:pre-line}",
  ".et-hora{font-size:13px}",
  ".et-mapa{display:flex;align-items:center;justify-content:center;gap:8px;min-height:48px;border-radius:12px;background:var(--fundo2);color:var(--on);font-weight:600;text-decoration:none}",
  ".et-mapa svg.i{width:18px;height:18px}",
  ".et-confere{position:relative;background:var(--papel);color:var(--tinta);border-radius:16px;padding:20px 18px 18px;display:grid;gap:12px}",
  '.et-confere::before{content:"";position:absolute;left:14px;right:14px;top:9px;border-top:2px dashed var(--linha)}',
  ".et-confere h2{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--ico);font-weight:700;margin-top:4px}",
  ".et-confere ul{display:grid;gap:10px}",
  ".et-confere li{display:grid;grid-template-columns:22px minmax(0,1fr);gap:10px;font-size:14.5px;line-height:1.4}",
  ".et-confere li svg.i{width:20px;height:20px;color:var(--ico);margin-top:1px}",
  ".et-confere b{font-weight:600}",
  ".et-cnpj{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:6px}",
  ".et-cnpj>span{font-variant-numeric:tabular-nums;font-weight:600}",
  ".et-copiar{font-size:12.5px;font-weight:600;line-height:1;color:var(--ico);background:var(--icobg);border:0;border-radius:999px;min-height:44px;padding:0 14px;cursor:pointer}",
  ".et-confere :focus-visible,.et-caminho :focus-visible{outline-color:var(--tinta)}",
  ".et-rodape{display:grid;justify-items:center;gap:8px;text-align:center;font-size:13px;color:var(--on2)}",
  ".et-rodape small{font-size:11.5px}",
  "@media (prefers-reduced-motion:no-preference){",
  ".et-tag{transition:transform .45s cubic-bezier(.22,1,.36,1)}",
  ".et-tag:active{transform:rotate(-2.4deg) scale(.99);transition-duration:.12s}",
  ".lk svg.et-seta{transition:transform .3s cubic-bezier(.22,1,.36,1)}",
  ".lk-entra .et-fio>li{animation:et-assenta .9s cubic-bezier(.22,1,.36,1) both}",
  atrasos(".lk-entra .et-fio>li", 0, 70),
  ".et-tag.lk-toque{animation:et-balanca .8s cubic-bezier(.22,1,.36,1)}",
  "}",
  // hover só onde existe ponteiro: no celular o :hover gruda depois do toque
  "@media (prefers-reduced-motion:no-preference) and (hover:hover){.et-tag:hover{transform:rotate(-1.2deg)}}",
  "@keyframes et-assenta{0%{transform:rotate(7deg) translateY(10px)}55%{transform:rotate(-2deg)}100%{transform:none}}",
  "@keyframes et-balanca{0%{transform:rotate(-7deg)}28%{transform:rotate(4deg)}56%{transform:rotate(-1.8deg)}80%{transform:rotate(.6deg)}100%{transform:none}}",
].join("");
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/render/etiqueta.test.ts`
Expected: PASS — `tests 8`, `pass 8`, `fail 0`.

Qualquer falha aqui (inclusive `foco/…`) é regressão do PR 2, que já entrega `--foco` ≥ 3:1 em todo modelo e paleta (decisões 1–2 do plano do PR 2): **parar** e reportar com as 5 linhas que o teste imprime; não mexer em `cores.ts` neste PR.

- [ ] **Step 6: Commit**

```bash
git add src/lib/bio/render/etiqueta.ts src/lib/bio/render/etiqueta.test.ts public/fonts/bio/lexend/lexend-latin.woff2 public/fonts/bio/lexend/OFL.txt
git commit -m "feat(bio): Etiqueta model CSS and the self-hosted Lexend font"
```

---

### Task 5: Corpo do Etiqueta e a página inteira (`index.ts`)

**Files:**
- Modify: `apps/web/src/lib/bio/render/etiqueta.ts` (imports + corpo + o `ModeloRender`)
- Create: `apps/web/src/lib/bio/render/index.ts`
- Test: `apps/web/src/lib/bio/render/index.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4; PR 2: `coresDoModelo`, `documentoBio`, `documentoPadrao(i: { nome: string; campanhaId: string | null }): DocumentoBio`; do repo: `nonceAttribute(nonce: string | null | undefined): string` (`@/lib/security/csp`, que só importa `lib/observability/sentry-options.ts`, sem dependência; já vai no bundle do cliente pela `entrada-preview.tsx`).
- Produces:
  - `etiqueta.ts`: `etiqueta: ModeloRender` (`fontes` = Lexend 100–900, `corDoTopo` = `--fundo1`, `fundoDoLogo` = `--fundo2`).
  - `index.ts`: `renderPaginaBio(d: DadosRender, o: { modo: "publica" | "previa"; nonce: string | null; animarEntrada: boolean }): string` e `renderPaginaNaoEncontrada(nonce: string | null): string` (nomes e assinaturas do §9).

- [ ] **Step 1: Write the failing test** — criar `apps/web/src/lib/bio/render/index.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { documentoBio, documentoPadrao, type DadosRender } from "@/lib/bio/documento";
import { getPublicSiteUrl } from "@/lib/brand";
import { IDS, dadosCheios, dadosFalsos } from "@/test/bio-dados-falsos";
import { renderPaginaBio, renderPaginaNaoEncontrada } from "./index";

const NONCE = "AAAAAAAAAAAAAAAAAAAAAA==";
const publica = (d: DadosRender, animarEntrada = true) => renderPaginaBio(d, { modo: "publica", nonce: NONCE, animarEntrada });
const comPerfil = (mudar: Partial<DadosRender["documento"]["perfil"]>): DadosRender => {
  const d = dadosFalsos();
  return { ...d, documento: { ...d.documento, perfil: { ...d.documento.perfil, ...mudar } } };
};
const conta = (html: string, re: RegExp) => html.match(re)?.length ?? 0;

test("os dados falsos são documentos válidos pelo zod do PR 2", () => {
  documentoBio.parse(dadosFalsos().documento);
  documentoBio.parse(dadosCheios().documento);
});

test("cabeça: idioma, título, noindex, descrição, Open Graph, cor do tema, ícone e só a fonte do modelo", () => {
  const html = publica(dadosFalsos());
  assert.match(html, /^<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">/);
  assert.match(html, /<title>Ateliê Exemplo Kids<\/title>/);
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /<meta name="description" content="Kits de roupa infantil pra revender, do RN ao 14 anos\.">/);
  assert.match(html, /<meta property="og:title" content="Ateliê Exemplo Kids">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/www\.girumo\.com\.br\/_next\/image\?url=%2Fapi%2Fp%2Fmedia%2Fcapa-falsa&amp;w=828&amp;q=75">/);
  assert.match(html, /<meta name="theme-color" content="#[0-9A-F]{6}">/);
  assert.match(html, /<link rel="icon" href="\/_next\/image\?url=%2Fapi%2Fp%2Fmedia%2Flogo-clara-falsa&amp;w=384&amp;q=75">/);
  assert.equal(conta(html, /rel="preload"/g), 1);
  assert.match(html, /<link rel="preload" href="\/fonts\/bio\/lexend\/lexend-latin\.woff2" as="font" type="font\/woff2" crossorigin>/);
  assert.match(html, /@font-face\{font-family:"Lexend";font-style:normal;font-weight:100 900;font-display:swap;src:url\(\/fonts\/bio\/lexend\/lexend-latin\.woff2\) format\("woff2"\)\}/);
  assert.match(html, /<body data-pagina="0c8f6a2e-5b1d-4c3a-9e7f-1a2b3c4d5e6f">/);
});

test("sem logo e sem frase: ícone vazio, sem descrição", () => {
  const html = publica(comPerfil({ logoClara: null, logoEscura: null, frase: "" }));
  assert.match(html, /<link rel="icon" href="data:,">/);
  assert.doesNotMatch(html, /name="description"|og:description|class="et-frase"/);
});

test("um h1 só: a logo dentro, com alt = nome; a frase é <p>", () => {
  const html = publica(dadosFalsos());
  assert.equal(conta(html, /<h1/g), 1);
  assert.match(html, /<h1 class="et-nome"><img class="et-logo" src="[^"]*logo-clara-falsa[^"]*"[^>]*alt="Ateliê Exemplo Kids" decoding="async"><\/h1>/);
  assert.match(html, /<p class="et-frase">Kits de roupa infantil/);
});

test("sem logo, o h1 é o nome; só a logo do fundo errado ganha placa", () => {
  assert.match(publica(comPerfil({ logoClara: null, logoEscura: null })), /<h1 class="et-nome">Ateliê Exemplo Kids<\/h1>/);
  assert.match(publica(comPerfil({ logoClara: null })), /<h1 class="et-nome"><span class="lk-placa"><img class="et-logo" src="[^"]*logo-escura-falsa/);
});

test("lista: um <li> por link visível, na ordem, com data-link e data-tipo", () => {
  const html = publica(dadosFalsos());
  assert.match(html, /<ul class="et-fio" aria-label="Links da Ateliê Exemplo Kids">/);
  const ids = [...html.matchAll(/data-link="([^"]+)" data-tipo="([a-z]+)"/g)].map((m) => `${m[2]}:${m[1]}`);
  assert.deepEqual(ids, [
    `whatsapp:${IDS.whatsapp}`,
    `link:${IDS.catalogo}`,
    `grupo:${IDS.grupo}`,
    `endereco:${IDS.endereco}`,
    `link:${IDS.canal}`,
  ]);
  assert.match(html, /<a class="et-tag et-tag--prin" href="https:\/\/wa\.me\/5562900000000\?text=Oi!%20Vim/);
  assert.match(html, /<a class="et-tag" href="\/r\/vip-exemplo" data-link/);
  assert.match(html, /<a class="et-tag" href="https:\/\/exemplo\.com\.br\/catalogo" data-link/);
});

test("some da página: desligado, linksEscondidos, grupo sem link mestre e URL javascript:", () => {
  const d = dadosFalsos();
  const links = d.documento.links.map((l) =>
    l.id === IDS.canal ? { ...l, ativo: false } : l.id === IDS.catalogo && l.tipo === "link" ? { ...l, url: "javascript:alert(1)" } : l,
  );
  const html = publica({ ...d, documento: { ...d.documento, links }, linksEscondidos: [IDS.whatsapp], campanhas: {} });
  for (const id of [IDS.canal, IDS.catalogo, IDS.whatsapp, IDS.grupo]) assert.doesNotMatch(html, new RegExp(id));
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, new RegExp(`data-link="${IDS.endereco}"`));
});

test("domínio próprio: o grupo vai para /<slug> na raiz", () => {
  const html = publica({ ...dadosFalsos(), origem: "https://links.lojaexemplo.com.br", dominioProprio: true });
  assert.match(html, /<a class="et-tag" href="\/vip-exemplo" data-link/);
});

test("endereço abre ali mesmo: <details> com foto lazy, endereço e o mapa", () => {
  const html = publica(dadosFalsos());
  assert.match(html, new RegExp(`<details class="et-abre"><summary class="et-tag" data-link="${IDS.endereco}" data-tipo="endereco">`));
  assert.match(html, /<div class="et-caminho"><img src="[^"]*fachada-falsa[^"]*"[^>]*alt="" loading="lazy" decoding="async"><address>Rua Exemplo, 100\nCentro, Cidade Exemplo<\/address><p class="et-hora">Seg a sex, das 8h às 17h<\/p><a class="et-mapa" href="https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=Rua%20Exemplo%2C%20100%2C%20Centro%2C%20Cidade%20Exemplo">/);
});

test("texto do lojista nunca vira HTML", () => {
  const d = comPerfil({ nome: '"><script>alert(1)</script>', frase: "Loja d'Ana <img src=x onerror=alert(1)>", capaAlt: '" onload="x' });
  const links = d.documento.links.map((l) => ({ ...l, titulo: "<b>x</b>", sub: "a\"b'c" }));
  const html = publica({ ...d, documento: { ...d.documento, links } });
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<b>x<\/b>/);
  assert.doesNotMatch(html, /" onload="x/);
  assert.doesNotMatch(html, /d'Ana/);
  assert.match(html, /<title>&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/title>/);
  assert.match(html, /d(?:&#39;|&#x27;|&apos;)Ana/);
});

test("sem atributo style= em lugar nenhum", () => {
  assert.doesNotMatch(publica(dadosFalsos()), /\sstyle=/);
  assert.doesNotMatch(publica(dadosCheios()), /\sstyle=/);
});

test("<style> e <script> levam o nonce; nonce inválido não sai", () => {
  const html = publica(dadosFalsos());
  assert.match(html, /<style nonce="AAAAAAAAAAAAAAAAAAAAAA==">/);
  assert.equal(conta(html, /<script/g), 1);
  assert.match(html, /<script nonce="AAAAAAAAAAAAAAAAAAAAAA==">\(function\(\)\{/);
  const ruim = renderPaginaBio(dadosFalsos(), { modo: "publica", nonce: '"><x', animarEntrada: true });
  assert.doesNotMatch(ruim, /nonce=/);
});

test("um único role=status, fora da lista", () => {
  const html = publica(dadosFalsos());
  assert.equal(conta(html, /role="status"/g), 1);
  assert.match(html, /<\/main><p id="lk-status" class="lk-status" role="status"><\/p><\/div>/);
  assert.doesNotMatch(html, /aria-live/);
});

test("decoração fica fora da árvore de acessibilidade", () => {
  const html = publica(dadosFalsos());
  assert.match(html, /<svg class="lk-sprite" aria-hidden="true" focusable="false">/);
  assert.match(html, /<span class="et-capas" aria-hidden="true">/);
  for (const svg of html.match(/<svg class="i[^"]*"[^>]*>/g) ?? []) assert.match(svg, /aria-hidden="true"/);
});

test("prévia: nenhum <script> e nenhum href", () => {
  const html = renderPaginaBio(dadosFalsos(), { modo: "previa", nonce: null, animarEntrada: false });
  assert.doesNotMatch(html, /<script/);
  assert.doesNotMatch(html, /<a [^>]*href=/);
  assert.match(html, /<a class="et-tag et-tag--prin" data-link=/);
});

test("entrada só com animarEntrada e documento.animar; o toque continua sem ela", () => {
  assert.match(publica(dadosFalsos(), true), /<div class="lk lk-entra">/);
  const parado = publica(dadosFalsos(), false);
  assert.match(parado, /<div class="lk">/);
  assert.match(parado, /\.et-tag\.lk-toque\{animation:et-balanca/);
  const d = dadosFalsos();
  assert.match(publica({ ...d, documento: { ...d.documento, animar: false } }, true), /<div class="lk">/);
});

test("capa: fetchpriority alta e alt vazio sem descrição; o resto é lazy", () => {
  const html = publica(comPerfil({ capaAlt: "" }));
  assert.match(html, /<img class="lk-f-50-30" src="[^"]*capa-falsa[^"]*" srcset="[^"]*384w[^"]*640w[^"]*828w" sizes="[^"]+" width="640" height="512" alt="" fetchpriority="high" decoding="async">/);
  assert.equal(conta(html, /fetchpriority=/g), 1);
  assert.equal(conta(html, /<img /g) - conta(html, /loading="lazy"/g), 2); // capa e logo
});

test("sem capa, o 'onde fica' sai abaixo da frase", () => {
  const html = publica(comPerfil({ capa: null }));
  assert.doesNotMatch(html, /<figure|fetchpriority=/);
  assert.match(html, /<p class="et-local"><svg[^>]*><use href="#lk-i-mapa"><\/use><\/svg><span>Loja na Rua Exemplo/);
});

test("foco da foto vira regra no <style>, nunca style=", () => {
  const html = publica(dadosFalsos());
  assert.match(html, /\.lk \.lk-f-50-30\{object-position:50% 30%;transform-origin:50% 30%\}/);
  assert.match(html, /<img class="lk-f-38-20" src="[^"]*kit-2-falso/);
});

test("rodapé: Instagram, CNPJ só com o confere ligado, Feito com Girumo desligável", () => {
  const html = publica(dadosFalsos());
  assert.match(html, /<footer class="et-rodape"><span>Instagram @atelie\.exemplo<\/span><small>Ateliê Exemplo Kids · CNPJ 11\.222\.333\/0001-81<\/small><a class="lk-feito"/);
  const selo = `<a class="lk-feito" href="${getPublicSiteUrl()}/?utm_source=link-da-bio&amp;utm_medium=rodape">`;
  assert.ok(html.includes(selo));
  assert.ok(publica({ ...dadosFalsos(), origem: "https://links.lojaexemplo.com.br", dominioProprio: true }).includes(selo));
  const d = dadosFalsos();
  const sem = publica({ ...d, documento: { ...d.documento, feitoComGirumo: false, confere: { ...d.documento.confere, ativo: false } } });
  assert.doesNotMatch(sem, /class="lk-feito"|Feito com Girumo|<small>/);
});

test("página recém-criada (documentoPadrao) abre sem elemento vazio", () => {
  const d: DadosRender = { ...dadosFalsos(), documento: documentoPadrao({ nome: "Loja Nova", campanhaId: IDS.campanha }) };
  const html = publica(d);
  assert.match(html, /<h1 class="et-nome">Loja Nova<\/h1>/);
  assert.match(html, /href="\/r\/vip-exemplo"/);
  assert.doesNotMatch(html, /<(p|ul|h1|figure|footer|section) class="[^"]*"><\/\1>/);
  const vazia = publica({ ...d, documento: documentoPadrao({ nome: "Loja Nova", campanhaId: null }) });
  assert.doesNotMatch(vazia, /<ul class="et-fio"/);
});

test("todos os links escondidos: nenhuma lista vazia", () => {
  const d = dadosFalsos();
  const html = publica({ ...d, linksEscondidos: d.documento.links.map((l) => l.id) });
  assert.doesNotMatch(html, /<ul class="et-fio"/);
  assert.match(html, /<h1 class="et-nome">/);
});

test("página cheia (20 links no limite) cabe em 40 KB", () => {
  const html = publica(dadosCheios());
  assert.equal(conta(html, /data-link=/g), 20);
  const bytes = Buffer.byteLength(html);
  assert.ok(bytes <= 40 * 1024, `${bytes} bytes`);
});

test("404: mínima, sem marca e sem script", () => {
  const html = renderPaginaNaoEncontrada(NONCE);
  assert.match(html, /<title>Página não encontrada<\/title>/);
  assert.match(html, /<h1>Página não encontrada<\/h1>/);
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /<style nonce="AAAAAAAAAAAAAAAAAAAAAA==">/);
  assert.doesNotMatch(html, /girumo|<script|\sstyle=/i);
  assert.doesNotMatch(renderPaginaNaoEncontrada(null), /nonce=/);
});

test("o renderizador é puro: sem server-only, Supabase, React nem node:", () => {
  const pasta = path.dirname(fileURLToPath(import.meta.url));
  const fontes = readdirSync(pasta).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
  assert.ok(fontes.length >= 5);
  for (const f of fontes) {
    const src = readFileSync(path.join(pasta, f), "utf8");
    assert.doesNotMatch(src, /from "(?:server-only|@supabase\/[^"]+|react|react-dom[^"]*|node:[^"]+)"|import "server-only"/, f);
  }
});
```

O teste "página recém-criada" supõe o que o §8 descreve para o `documentoPadrao`: sem foto e sem logo, e um link de grupo ativo quando recebe `campanhaId`. Se o PR 2 tiver decidido diferente (ex.: link desligado), ajustar só o `assert.match(html, /href="\/r\/vip-exemplo"/)` ao que o PR 2 faz — o resto do teste vale para qualquer documento padrão.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/render/index.test.ts`
Expected: FAIL — `Cannot find module` para `./index`.

- [ ] **Step 3: Implement o corpo do Etiqueta** — em `etiqueta.ts`, trocar a linha `import { atrasos } from "./partes";` por:

```ts
import { escapeHtml } from "@/lib/campaigns/entry-page";
import type { ContextoRender, FonteDoModelo, LinkVisivel, ModeloRender } from "./modelo";
import {
  CNPJ,
  LARGURA_MINIATURA,
  atrasos,
  blocoConfere,
  conteudoDoH1,
  dadosDoLink,
  destaqueHtml,
  detalhesDoEndereco,
  feitoComGirumo,
  formatarCnpj,
  hrefAttr,
  icone,
  imagem,
} from "./partes";

const FONTES_ETIQUETA: readonly FonteDoModelo[] = [
  { familia: "Lexend", arquivo: "lexend/lexend-latin.woff2", peso: "100 900", estilo: "normal" },
];
```

e acrescentar ao fim do arquivo a marcação (a do mockup, `<sc-if value="{{eEtiqueta}}">`, com o `h1` = nome, a frase em `<p>` e os `data-*` do §9):

```ts
const SIZES_CAPA = "(max-width: 492px) calc(100vw - 32px), 460px";
const SIZES_CAMINHO = "(max-width: 492px) calc(100vw - 94px), 398px";

function etiquetaDoLink(v: LinkVisivel, c: ContextoRender): string {
  const l = v.link;
  const sub = l.sub ? `<span class="et-sub">${escapeHtml(l.sub)}</span>` : "";
  const texto = `<span class="et-txt"><span class="et-rot">${escapeHtml(l.titulo)}</span>${sub}</span>`;
  const seta = icone("seta", "i et-seta");
  if (l.tipo === "endereco") {
    return detalhesDoEndereco(v, c, {
      prefixo: "et",
      classeDoResumo: "et-tag",
      resumo: `<span class="et-ico">${icone(l.icone)}</span>${texto}${seta}`,
      foto: { largura: 640, altura: 480, sizes: SIZES_CAMINHO },
    });
  }
  const fotos = l.tipo === "link" ? l.fotos : [];
  const miniaturas = fotos
    .map((f) => imagem(f, { largura: 32, altura: 42, sizes: "32px", alt: "", carregamento: "lazy", larguras: LARGURA_MINIATURA }))
    .join("");
  const lado = miniaturas
    ? `<span class="et-capas" aria-hidden="true">${miniaturas}</span>`
    : `<span class="et-ico${l.icone === "whatsapp" ? " et-ico--zap" : ""}">${icone(l.icone)}</span>`;
  return `<a class="et-tag${v.principal ? " et-tag--prin" : ""}"${hrefAttr(v.href, c.modo)}${dadosDoLink(v)}>${lado}${texto}${seta}</a>`;
}

function rodape(c: ContextoRender): string {
  const doc = c.d.documento;
  const insta = doc.perfil.instagram ? `<span>Instagram @${escapeHtml(doc.perfil.instagram)}</span>` : "";
  const cnpj =
    doc.confere.ativo && CNPJ.test(doc.confere.cnpj)
      ? `<small>${escapeHtml(doc.perfil.nome)} · CNPJ ${formatarCnpj(doc.confere.cnpj)}</small>`
      : "";
  const feito = feitoComGirumo(c);
  return insta || cnpj || feito ? `<footer class="et-rodape">${insta}${cnpj}${feito}</footer>` : "";
}

function corpo(c: ContextoRender): string {
  const doc = c.d.documento;
  const p = doc.perfil;
  const local = p.local ? escapeHtml(p.local) : "";
  const capa = p.capa
    ? imagem(p.capa, { largura: 640, altura: 512, sizes: SIZES_CAPA, alt: p.capaAlt, carregamento: "prioridade" })
    : "";
  const onde = local ? `<figcaption class="et-onde">${icone("mapa")}<span>${local}</span></figcaption>` : "";
  const vitrine = capa ? `<figure class="et-vitrine">${capa}${onde}</figure>` : "";
  const localSemFoto = !capa && local ? `<p class="et-local">${icone("mapa")}<span>${local}</span></p>` : "";
  const h1 = `<h1 class="et-nome">${conteudoDoH1(c, { classe: "et-logo", largura: 190, altura: 84, sizes: "190px" })}</h1>`;
  const frase = p.frase ? `<p class="et-frase">${escapeHtml(p.frase)}</p>` : "";
  const fatos = p.destaques.length
    ? `<ul class="et-fatos">${p.destaques.map((t) => `<li>${destaqueHtml(t)}</li>`).join("")}</ul>`
    : "";
  const lista = c.links.length
    ? `<ul class="et-fio" aria-label="Links da ${escapeHtml(p.nome)}">${c.links.map((v) => `<li>${etiquetaDoLink(v, c)}</li>`).join("")}</ul>`
    : "";
  return `<main class="et"><div class="et-col">${vitrine}<header class="et-marca">${h1}${frase}${localSemFoto}${fatos}</header>${lista}${blocoConfere(doc, "et")}${rodape(c)}</div></main>`;
}

export const etiqueta: ModeloRender = {
  fontes: FONTES_ETIQUETA,
  css: CSS_ETIQUETA,
  corDoTopo: (t) => t["--fundo1"] ?? "",
  fundoDoLogo: (t) => t["--fundo2"] ?? "",
  corpo,
};
```

- [ ] **Step 4: Implement a página** — criar `apps/web/src/lib/bio/render/index.ts`:

```ts
/**
 * HTML da página pública do link da bio, montado por concatenação (sem React):
 * abre rápido no navegador do Instagram e não leva nada da Girumo junto (layout
 * raiz, Sentry, favicon). Mesmo caminho do /r/ (`lib/campaigns/entry-page.ts`).
 *
 * Puro: roda na rota /bio (PR 4a) e no navegador, na prévia do painel (PR 6a).
 * CSP da página (spec §6): `style-src` e `script-src` só por nonce — por isso
 * nenhum atributo style=, e cor só de token revalidado (`tokensValidos`).
 */
import { coresDoModelo } from "@/lib/bio/cores";
import type { DadosRender, Modelo } from "@/lib/bio/documento";
import { escapeHtml } from "@/lib/campaigns/entry-page";
import { nonceAttribute } from "@/lib/security/csp";
import { etiqueta } from "./etiqueta";
import type { ContextoRender, FonteDoModelo, ModeloRender, ModoRender } from "./modelo";
import { CSS_BASE, linksVisiveis, logoDaPagina, regrasDoFoco, sprite, tokensValidos, urlDaImagem } from "./partes";
import { scriptDaPagina } from "./script";

/** O PR 3b troca as três últimas entradas pelos modelos próprios. */
const MODELOS_RENDER: Record<Modelo, ModeloRender> = {
  etiqueta,
  vitrine: etiqueta,
  romaneio: etiqueta,
  classico: etiqueta,
};

const COR = /^#[0-9A-F]{6}$/;

function fontes(lista: readonly FonteDoModelo[]): { css: string; preload: string } {
  const unicas = [...new Map(lista.map((f) => [`${f.familia}|${f.arquivo}`, f])).values()];
  return {
    css: unicas
      .map(
        (f) =>
          `@font-face{font-family:"${f.familia}";font-style:${f.estilo};font-weight:${f.peso};font-display:swap;src:url(/fonts/bio/${f.arquivo}) format("woff2")}`,
      )
      .join(""),
    preload: [...new Set(unicas.map((f) => f.arquivo))]
      .map((a) => `<link rel="preload" href="/fonts/bio/${a}" as="font" type="font/woff2" crossorigin>`)
      .join(""),
  };
}

function imagemAbsoluta(origem: string, id: string): string | null {
  const caminho = urlDaImagem(id, 828);
  if (!caminho) return null;
  try {
    return new URL(caminho, origem).href;
  } catch {
    return null;
  }
}

function cabeca(c: ContextoRender, m: ModeloRender, preload: string): string {
  const p = c.d.documento.perfil;
  const nome = escapeHtml(p.nome);
  const frase = escapeHtml(p.frase);
  const tema = m.corDoTopo(c.tokens);
  const icone = c.logo ? urlDaImagem(c.logo.midia.id, 384) : null;
  const og = p.capa ? imagemAbsoluta(c.d.origem, p.capa.id) : null;
  return [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${nome}</title>`,
    frase ? `<meta name="description" content="${frase}">` : "",
    '<meta name="robots" content="noindex">',
    '<meta property="og:type" content="website">',
    `<meta property="og:title" content="${nome}">`,
    frase ? `<meta property="og:description" content="${frase}">` : "",
    og ? `<meta property="og:image" content="${escapeHtml(og)}">` : "",
    COR.test(tema) ? `<meta name="theme-color" content="${tema}">` : "",
    `<link rel="icon" href="${icone ? escapeHtml(icone) : "data:,"}">`,
    preload,
  ].join("");
}

/**
 * A página inteira. "previa": nenhum <script> e nenhum href (o iframe do painel
 * não navega nem dispara nada). A entrada só toca com `animarEntrada` E
 * `documento.animar`; o balanço do toque não depende dela.
 */
export function renderPaginaBio(
  d: DadosRender,
  o: { modo: ModoRender; nonce: string | null; animarEntrada: boolean },
): string {
  const doc = d.documento;
  const modelo = MODELOS_RENDER[doc.modelo];
  const tokens = tokensValidos(coresDoModelo(doc.modelo, doc.paleta, doc.cores));
  const c: ContextoRender = {
    d,
    modo: o.modo,
    tokens,
    links: linksVisiveis(d),
    logo: logoDaPagina(doc, modelo.fundoDoLogo(tokens)),
  };
  const corpo = modelo.corpo(c);
  const nonce = nonceAttribute(o.nonce);
  const f = fontes(modelo.fontes);
  const variaveis = `.lk{${Object.entries(tokens).map(([k, v]) => `${k}:${v}`).join(";")}}`;
  const css = `${f.css}${variaveis}${CSS_BASE}${modelo.css}${regrasDoFoco(doc)}`;
  const entra = o.animarEntrada && doc.animar ? " lk-entra" : "";
  const script = o.modo === "publica" ? `<script${nonce}>${scriptDaPagina({ rastreio: null })}</script>` : "";
  return `<!doctype html><html lang="pt-BR"><head>${cabeca(c, modelo, f.preload)}<style${nonce}>${css}</style></head><body data-pagina="${escapeHtml(d.paginaId)}"><div class="lk${entra}">${sprite(corpo)}${corpo}<p id="lk-status" class="lk-status" role="status"></p></div>${script}</body></html>`;
}

const CSS_404 =
  'body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box;background:#F4F4F2;color:#1A1A1A;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center}h1{margin:0 0 8px;font-size:22px;line-height:1.25}p{margin:0;color:#4A4A4A}';

/** 404 da rota /bio: mínima e sem marca (inexistente, fora do ar, bloqueada). */
export function renderPaginaNaoEncontrada(nonce: string | null): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Página não encontrada</title><link rel="icon" href="data:,"><style${nonceAttribute(nonce)}>${CSS_404}</style></head><body><main><h1>Página não encontrada</h1><p>Confira o endereço com a loja.</p></main></body></html>`;
}
```

- [ ] **Step 5: Run the render tests to verify they pass**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/render/index.test.ts src/lib/bio/render/etiqueta.test.ts src/lib/bio/render/partes.test.ts src/lib/bio/render/script.test.ts`
Expected: PASS — `tests 58`, `pass 58`, `fail 0`.

- [ ] **Step 6: Tipos**

Run: `npx tsc --noEmit --project tsconfig.json`
Expected: nenhuma saída (exit 0).

- [ ] **Step 7: Commit**

```bash
git add src/lib/bio/render/etiqueta.ts src/lib/bio/render/index.ts src/lib/bio/render/index.test.ts
git commit -m "feat(bio): renderPaginaBio with the Etiqueta model and the not-found page"
```

---

### Task 6: Conferência visual e medidas

**Files:** nenhum no repo. O script fica no scratchpad da sessão (ou em `%TEMP%\bio-previa\`); o PR 3b copia daqui.

- [ ] **Step 1: O Playwright está lá?** Em `apps/web`: `node -e "require.resolve('@playwright/test')"` não pode dar erro (a junction do `node_modules` da Task 0 resolve). O navegador de teste já está em `%LOCALAPPDATA%\ms-playwright` (`chromium_headless_shell-1234`, o do Playwright 1.62); se o script reclamar de executável, `npx playwright install chromium`.

- [ ] **Step 2: Escrever o script** — salvar como `<scratchpad>/bio-previa.ts`:

```ts
// Conferência visual do link da bio — FORA do repositório. Rodar em apps/web:
//   npx tsx <caminho>/bio-previa.ts [modelo] [paleta]
// Serve o HTML com a CSP da superfície "bio" (spec §6), a fonte de public/ e
// fotos falsas; tira print em 390 e 320 px e reprova CSP violada, rolagem
// lateral, fonte que não carregou, alvo < 44 px e animação com movimento reduzido.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

import type { DadosRender, Modelo } from "@/lib/bio/documento";
import { renderPaginaBio } from "@/lib/bio/render";
import { scriptDaPagina } from "@/lib/bio/render/script";
import { dadosCheios, dadosFalsos } from "@/test/bio-dados-falsos";

const { chromium } = createRequire(path.join(process.cwd(), "package.json"))("@playwright/test") as typeof import("@playwright/test");

const [modelo = "etiqueta", paleta = "azul"] = process.argv.slice(2);
const NONCE = "AAAAAAAAAAAAAAAAAAAAAA==";
const CSP = `default-src 'none'; script-src 'self' 'nonce-${NONCE}'; style-src 'self' 'nonce-${NONCE}'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
const SAIDA = path.join(tmpdir(), "bio-previa");
const FOTO = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="#c9a27e"/><stop offset="1" stop-color="#4d6a89"/></linearGradient></defs><rect width="800" height="1000" fill="url(#g)"/><circle cx="400" cy="360" r="140" fill="#f1e2d2"/><rect x="250" y="520" width="300" height="420" rx="40" fill="#2f3b4a"/></svg>`;
const logo = (cor: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="320"><text x="360" y="215" font-family="Arial" font-size="170" font-weight="700" text-anchor="middle" fill="${cor}">exemplo</text></svg>`;

function comModelo(d: DadosRender): DadosRender {
  return { ...d, documento: { ...d.documento, modelo: modelo as Modelo, paleta } };
}

async function main() {
  mkdirSync(SAIDA, { recursive: true });
  const browser = await chromium.launch();
  const falhas: string[] = [];
  for (const [nome, dados] of Object.entries({ exemplo: dadosFalsos(), cheia: dadosCheios() })) {
    const html = renderPaginaBio(comModelo(dados), { modo: "publica", nonce: NONCE, animarEntrada: false });
    writeFileSync(path.join(SAIDA, `${nome}.html`), html);
    console.log(`${nome}: HTML ${Buffer.byteLength(html)} B`);
    for (const largura of [390, 320]) {
      const ctx = await browser.newContext({ viewport: { width: largura, height: 844 }, deviceScaleFactor: 2, reducedMotion: "reduce", hasTouch: true });
      const page = await ctx.newPage();
      const erros: string[] = [];
      page.on("console", (m) => { if (m.type() === "error") erros.push(m.text()); });
      page.on("pageerror", (e) => erros.push(e.message));
      await page.route("http://bio.local/**", (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === "/") return route.fulfill({ body: html, headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": CSP } });
        if (url.pathname.startsWith("/fonts/bio/")) return route.fulfill({ body: readFileSync(path.join("public", url.pathname)), headers: { "content-type": "font/woff2" } });
        if (url.pathname === "/_next/image") {
          const fonte = url.searchParams.get("url") ?? "";
          const corpo = fonte.includes("logo-clara") ? logo("#ffffff") : fonte.includes("logo") ? logo("#16304f") : FOTO;
          return route.fulfill({ body: corpo, headers: { "content-type": "image/svg+xml" } });
        }
        erros.push(`404 ${url.pathname}`);
        return route.fulfill({ status: 404, body: "" });
      });
      await page.goto("http://bio.local/");
      await page.evaluate(() => document.fonts.ready);
      await page.locator("summary").first().click();
      const m = await page.evaluate(() => ({
        rolagemLateral: document.documentElement.scrollWidth > window.innerWidth,
        fonte: [...document.fonts].some((f) => f.status === "loaded"),
        animacoes: document.getAnimations().length,
        pequenos: [...document.querySelectorAll<HTMLElement>("a,button,summary")]
          .map((el) => ({ el, r: el.getBoundingClientRect() }))
          .filter(({ r }) => r.height > 0 && r.height < 44)
          .map(({ el, r }) => `${el.className} ${Math.round(r.height)}px`),
      }));
      if (m.rolagemLateral) falhas.push(`${nome}@${largura}: rolagem lateral`);
      if (!m.fonte) falhas.push(`${nome}@${largura}: a fonte do modelo não carregou`);
      if (m.animacoes) falhas.push(`${nome}@${largura}: ${m.animacoes} animação(ões) com movimento reduzido`);
      if (m.pequenos.length) falhas.push(`${nome}@${largura}: alvo < 44 px: ${m.pequenos.join(", ")}`);
      falhas.push(...erros.map((e) => `${nome}@${largura}: ${e}`));
      await page.screenshot({ path: path.join(SAIDA, `${nome}-${largura}.png`), fullPage: true });
      await ctx.close();
    }
  }
  await browser.close();
  console.log(`JS ${Buffer.byteLength(scriptDaPagina({ rastreio: null }))} B`);
  console.log(`prints em ${SAIDA}`);
  console.log(falhas.length ? `FALHAS:\n${falhas.join("\n")}` : "TUDO OK");
  process.exitCode = falhas.length ? 1 : 0;
}

void main();
```

Uma violação de CSP (um `style=` que escapou, um `<script>` sem nonce, fonte ou foto de fora) aparece como erro de console e reprova.

- [ ] **Step 3: Rodar**

Run (em `apps/web`): `npx tsx "<scratchpad>/bio-previa.ts"`
Expected (os bytes do HTML variam alguns bytes com o PR 2 de verdade):
```
exemplo: HTML 19887 B
cheia: HTML 31535 B
JS 906 B
prints em C:\Users\Igor\AppData\Local\Temp\bio-previa
TUDO OK
```

- [ ] **Step 4: Olhar os prints** (`exemplo-390.png`, `exemplo-320.png`, `cheia-390.png`, `cheia-320.png`) ao lado de `Desktop\girumo-design-refs\link-da-bio\shots\Main-1-topo.png` e `Main-2-rolagem.png`. Tem de bater: degradê azul, foto 5:4 de cantos 22 px, chips com o número em dourado, etiquetas brancas com o furo e o fio dourado passando por ele, a principal laranja com o círculo verde do WhatsApp, miniaturas inclinadas no catálogo, o "Como chegar" aberto com o papel claro e o botão azul do mapa, o bloco "Antes de pagar, confere" com a linha tracejada, o rodapé com o selo. Diferenças **esperadas** (tabela de decisões): faixa do "onde fica" cinza-escura, ✓ nas linhas do confere, "Copiar CNPJ" mais alto, sem "Política de privacidade". Em 320 px a página "cheia" quebra o título sem espaço e o @ comprido sem rolar de lado.

- [ ] **Step 5: Anotar as medidas** para o corpo do PR: HTML do exemplo e da página cheia, JS. O Lighthouse ≥ 90 (spec §11) só dá para medir com a rota no ar: fica para o PR 4a / prova do §13.

---

### Task 7: Gate, PR, merge e card

**Files:** nenhum.

- [ ] **Step 1: Gate da web** (em `apps/web`):

```bash
npm run lint
npx tsc --noEmit --project tsconfig.json
npx tsc --noEmit --project tsconfig.e2e.json
npm run painel:check
npm run brand:check
npm test
```

Expected: lint sem erro (e sem aviso nos arquivos novos); os dois `tsc` sem saída; `painel:check OK` (nada daqui está em `PAINEL_ROOTS`); `brand:check` verde; `npm test` com `fail 0`.

- [ ] **Step 2: Gate completo** (na raiz do worktree; Windows PowerShell 5.1: `powershell -ExecutionPolicy Bypass -File infra/scripts/verify-local.ps1`):

Expected: `Verificacao local concluida com sucesso.`

- [ ] **Step 3: PR** — `git push -u origin feat/link-da-bio-pr3a-render`; PR "feat(bio): page renderer and the Etiqueta model (link da bio, PR 3a)" com: o que entra (renderizador puro, Etiqueta, Lexend, `script.ts`), que nada é servido ainda (a rota vem no 4a), as medidas da Task 6, a tabela de decisões resumida (pílula de status, véu fixo, alvos 44 px, ✓ no confere, miniatura 128, placa escura, foco no papel em `--tinta`), e terminando com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 4: CI verde → merge** (a `main` não tem proteção: o auto-merge do GitHub mergearia na hora, então é à mão, no verde):

```bash
gh pr checks <n> --watch
gh pr merge <n> --squash --delete-branch
```

- [ ] **Step 5: Card** (prod; mesmo jeito da Task 0):

```sql
select public.move_card('link-da-bio', 'em_construcao',
  'PR 3a: renderizador da página e modelo Etiqueta em main (ainda sem rota)', 'PR #<n>');
update public.board_features
   set blocker = 'Página pública ainda não abre: falta a rota /bio (PR 4a). Modelos Vitrine, Romaneio e Clássico no PR 3b.',
       updated_at = now()
 where key = 'link-da-bio';
```

(`move_card` não limpa o `blocker`; por isso o `update` à mão.)

- [ ] **Step 6: Grafo** — sugerir ao Igor (PowerShell): `rag insert "decisão: link da bio renderizado por concatenação em lib/bio/render (puro, roda na rota e na prévia); modelos implementam ModeloRender (modelo.ts); 'Abrindo…' numa pílula #lk-status; véu do 'onde fica' fixo rgb(0 0 0 / .62)" --source decisao-2026-10-19`.

- [ ] **Step 7: Fechar** — apagar o worktree (`git worktree remove .claude/worktrees/link-da-bio-pr3a`) e reportar "PRs que deixei abertos: nenhum" (ou o número e o motivo).

---

## Critérios de aceite do PR

- `renderPaginaBio`, `renderPaginaNaoEncontrada` e `scriptDaPagina` existem com os nomes e as assinaturas do §9; `vitrine`, `romaneio` e `classico` ainda renderizam o Etiqueta.
- 58 testes novos passando (`partes` 19, `script` 6, `etiqueta` 8, `index` 25) e a suíte inteira verde.
- Página de exemplo ~19,9 KB, página cheia (20 links no limite) ≤ 40 KB, JS ≤ 3 KB (906 B).
- Conferência visual "TUDO OK" em 390 e 320 px sob a CSP da superfície "bio": sem violação, sem rolagem lateral, fonte carregada, alvos ≥ 44 px, nenhuma animação com movimento reduzido; prints batendo com o mockup, exceto as diferenças da tabela.
- Nenhum `style=`; nenhum texto do lojista em `<script>`; prévia sem `<script>` e sem `href`.
- `lexend-latin.woff2` e `OFL.txt` com os SHA-256 da Task 4.
- `verify-local.ps1` verde, CI verde, mergeado na mesma sessão, card movido e `blocker` reescrito.

## Comandos de verificação

```bash
# em apps/web do worktree do PR
npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/render/partes.test.ts src/lib/bio/render/script.test.ts src/lib/bio/render/etiqueta.test.ts src/lib/bio/render/index.test.ts
npx tsc --noEmit --project tsconfig.json
npx tsc --noEmit --project tsconfig.e2e.json
npm run lint
npm run painel:check
npm run brand:check
npm test
npx tsx "<scratchpad>/bio-previa.ts"            # conferência visual (Task 6)
sha256sum public/fonts/bio/lexend/lexend-latin.woff2   # b7e7538f…c874
# na raiz do worktree
powershell -ExecutionPolicy Bypass -File infra/scripts/verify-local.ps1
```

## Riscos e pontos de atenção

- **Contraste depende do PR 2.** O teste da Task 4 confere os pares que o Etiqueta desenha contra o `coresDoModelo` de verdade. O foco dourado do mockup reprovava em três paletas (azul 1,9:1, rosa 2,9:1, menta 2,7:1) e a derivação de "cores da sua marca" do mockup falhava em tons médios: o PR 2 já corrige as duas coisas (decisões 1–2 do plano dele). Se o teste falhar aqui, é regressão do PR 2 — o 3a para e reporta.
- **Formato da chave de `TokensBio`.** O §9 lista "--fundo1, --on" sem dizer se a chave leva `--`; `tokensValidos` aceita os dois e o teste de contraste lê `--nome`.
- **`escapeHtml` com `'`** é do PR 2: sem ele o teste "texto do lojista nunca vira HTML" falha (é a pré-condição da Task 0).
- **`documentoPadrao`**: o teste "página recém-criada" supõe o que o §8 descreve (sem foto/logo, grupo ativo com `campanhaId`); a Task 5 diz o que ajustar se o PR 2 decidiu diferente.
- **Cache da fonte.** `public/` sai sem cache longo na Vercel; cada visita revalida o woff2 (304). O PR 4a, que já mexe no `headers()` do `next.config.ts`, pode dar `Cache-Control: public, max-age=31536000, immutable` a `/fonts/bio/:path*` (trocar o nome do arquivo ao trocar a fonte).
- **`Object.hasOwn`** roda no navegador da prévia (painel); o painel já usa (`bling-painel-texto.ts`) e o Next traz o polyfill. O JS da página pública é ES5 e não depende disso.
- **`<summary>` em grade** (o "Como chegar"): o WebKit só passou a respeitar `display:grid`/`flex` no `<summary>` com a correção de 2021 ([bug 190065](https://bugs.webkit.org/show_bug.cgi?id=190065)); iOS mais antigo empilha o conteúdo dessa etiqueta, sem quebrar o toque.
- **40 KB no pior caso.** A página cheia do teste (20 links, textos no máximo, URLs de ~90 caracteres) dá 31,5 KB. Medido à parte: com as 17 URLs no limite de 500 caracteres e a mensagem do WhatsApp no de 300, dá 39,4 KB (39 378 B) — cabe, sem folga. O teste trava o caso realista; o PR 3b (CSS e marcação maiores) tem de medir o pior caso do mesmo jeito.
- **Prévia no painel (6a).** O `<link rel="icon">`, o Open Graph e o preload da fonte vão também no `srcdoc`; inofensivos. A fonte carrega no iframe `sandbox=""` porque `public/` sai com `Access-Control-Allow-Origin: *` (spec §8).
- **Dados falsos são compartilhados** com o 3b e o 4a: nunca trocar por dado de cliente (repo público).

## Interface com os outros PRs

### O que este PR exporta

```ts
// apps/web/src/lib/bio/render/index.ts — contrato do §9
export function renderPaginaBio(
  d: DadosRender,
  o: { modo: "publica" | "previa"; nonce: string | null; animarEntrada: boolean },
): string; // "previa": nenhum <script>, nenhum href; entrada só com animarEntrada && d.documento.animar
export function renderPaginaNaoEncontrada(nonce: string | null): string;

// apps/web/src/lib/bio/render/script.ts — contrato do §9
export function scriptDaPagina(o: { rastreio: { metaPixelId: string; ga4Id: string } | null }): string;
// JS sem a tag, ES5, sem "<". O index chama com { rastreio: null }.

// apps/web/src/lib/bio/render/modelo.ts — o contrato dos modelos (PR 3b)
export type ModoRender = "publica" | "previa";
export type FonteDoModelo = { familia: string; arquivo: string /* sob /fonts/bio/ */; peso: string; estilo: "normal" | "italic" };
export type LinkVisivel = { link: LinkBio; href: string; principal: boolean };
export type LogoDaPagina = { midia: MidiaRef; placa: "clara" | "escura" | null };
export type ContextoRender = { d: DadosRender; modo: ModoRender; tokens: TokensBio; links: readonly LinkVisivel[]; logo: LogoDaPagina | null };
export type ModeloRender = {
  fontes: readonly FonteDoModelo[];
  css: string;
  corDoTopo: (t: TokensBio) => string;
  fundoDoLogo: (t: TokensBio) => string;
  corpo: (c: ContextoRender) => string;
};

// apps/web/src/lib/bio/render/partes.ts — peças comuns
export const LARGURA_MINIATURA: readonly [128];
export function icone(nome: string, classe?: string): string;
export function sprite(html: string): string;
export function urlDaImagem(id: string, largura: number): string | null;
export function pontoDoFoco(foco: MidiaRef["foco"]): { x: number; y: number } | null;
export function classeDoFoco(foco: MidiaRef["foco"]): string;
export function regrasDoFoco(doc: DocumentoBio): string;
export type OpcoesDaImagem = { classe?: string; largura: number; altura: number; sizes: string; alt: string;
  carregamento: "prioridade" | "normal" | "lazy"; larguras?: readonly number[] };
export function imagem(m: MidiaRef, o: OpcoesDaImagem): string;
export function destaqueEmPartes(texto: string): { antes: string; num: string; depois: string };
export function destaqueHtml(texto: string): string;
export const CNPJ: RegExp; // /^[0-9A-Z]{12}\d{2}$/ — CNPJ sem pontuação, numérico ou alfanumérico
export function formatarCnpj(digitos: string): string;
export function logoDaPagina(doc: DocumentoBio, fundo: string): LogoDaPagina | null;
export function conteudoDoH1(c: ContextoRender, o: { classe: string; largura: number; altura: number; sizes: string }): string;
export function hrefDoLink(l: LinkBio, d: DadosRender): string | null;
export function linksVisiveis(d: DadosRender): LinkVisivel[];
export function hrefAttr(href: string, modo: ModoRender): string;
export function dadosDoLink(v: LinkVisivel): string;
export function detalhesDoEndereco(v: LinkVisivel, c: ContextoRender, o: { prefixo: string; classeDoResumo: string; resumo: string;
  foto: { largura: number; altura: number; sizes: string }; mapa?: string }): string;
export function blocoConfere(doc: DocumentoBio, prefixo: string): string;
export function feitoComGirumo(c: ContextoRender): string;
export function tokensValidos(t: TokensBio): TokensBio;
export function atrasos(seletor: string, inicioMs: number, passoMs: number): string;
export const CSS_BASE: string;

// apps/web/src/lib/bio/render/etiqueta.ts
export const CSS_ETIQUETA: string;
export const etiqueta: ModeloRender;

// apps/web/src/test/bio-dados-falsos.ts — loja fictícia (3b e 4a reaproveitam)
export const IDS: Readonly<Record<"pagina" | "campanha" | "whatsapp" | "catalogo" | "grupo" | "endereco" | "canal", string>>; // uuids fixos (as const)
export const SLUG_DA_CAMPANHA: "vip-exemplo";
export function documentoFalso(): DocumentoBio;
export function dadosFalsos(): DadosRender;   // origem www, campanha com link mestre, 5 links
export function dadosCheios(): DadosRender;   // 20 links no limite
```

Arquivos estáticos: `/fonts/bio/lexend/lexend-latin.woff2` (Lexend variável 100–900, subset latin) e `/fonts/bio/lexend/OFL.txt`.

Marcação que o JS lê (§9), garantida pelos testes: `<body data-pagina="<uuid>">`; `<a … data-link="<uuid>" data-tipo="whatsapp|grupo|link">` e `<summary … data-link="<uuid>" data-tipo="endereco">`; `<button type="button" class="<prefixo>-copiar" data-copiar="<CNPJ sem pontuação, só [0-9A-Z]>">Copiar CNPJ</button>`; `<p id="lk-status" class="lk-status" role="status"></p>` logo depois do `</main>`. O script põe a classe `lk-toque` no `[data-link]` tocado (1,6 s) e a raiz é `<div class="lk">` ou `<div class="lk lk-entra">`.

### O que este PR usa

- **PR 2** (`lib/bio/documento.ts`): `Modelo`, `PALETAS`, `MidiaRef`, `LinkBio`, `DocumentoBio`, `DadosRender`, `documentoBio` e `documentoPadrao` (os dois últimos só nos testes).
- **PR 2** (`lib/bio/cores.ts`): `TokensBio`, `coresDoModelo(modelo, paleta, cores)`. Para o Etiqueta, as chaves que o CSS lê são as do `paletas.json` do mockup: `fundo1 fundo2 fundo3 on on2 chip chipbd fio acento cartao tinta tinta2 icobg ico seta prin printinta papel linha foco` (com ou sem `--`). Faltando uma, o teste "toda variável que o CSS lê…" (Task 4) acusa.
- **PR 2** (`lib/campaigns/entry-page.ts`): `escapeHtml` escapando `'`.
- **Repo**: `campaignLinkPath` (`lib/custom-domains/host.ts`), `nonceAttribute` (`lib/security/csp.ts`), `getPublicSiteUrl` (`lib/brand.ts`), `parseHex`/`relativeLuminance`/`contrastRatio` (`lib/pages/palette.ts`). Os quatro módulos não importam nada de servidor: podem ir para o navegador.

### Quem usa o quê

- **PR 3b**: cria `vitrine.ts`, `romaneio.ts`, `classico.ts`, cada um exportando um `ModeloRender`, e troca as três entradas de `MODELOS_RENDER` no `index.ts` (nada mais muda lá). Regras herdadas deste PR: um `h1` por modelo (o Romaneio também), via `conteudoDoH1`; a fonte do texto em `.lk{font-family:…}` (o `#lk-status` fica fora do `<main>`); CSS constante, cor de paleta só por `var(--…)`; máscara/recorte só em pseudo-elemento; feedback de toque pela classe `lk-toque` e entrada sob `.lk-entra`, com movimento dentro de `@media (prefers-reduced-motion:no-preference)` e atrasos por `atrasos()`; a pílula `#lk-status` usa `--tinta` (fundo) e `--papel` (texto) — o par precisa de 4,5:1 em todo modelo; foco dentro do papel em `--tinta`. Vitrine e Clássico usam `blocoConfere(doc, "vt" | "cl")` e `detalhesDoEndereco`; o Romaneio monta o próprio confere (mantendo `data-copiar` e o rótulo "Copiar CNPJ") e passa `mapa` ao `detalhesDoEndereco`. O zoom de 2,2× do Clássico é só `transform:scale(2.2)` no CSS: a classe de foco já leva o `transform-origin`. O `fundoDoLogo` do Vitrine é a foto escura (pode devolver um hex fixo). Conferência visual: o script da Task 6 com `npx tsx <scratchpad>/bio-previa.ts vitrine papel`.
- **PR 4a** (rota `/bio/[slug]` e raiz do domínio próprio): `renderPaginaBio(dados, { modo: "publica", nonce, animarEntrada: true })` — o render já combina com o `documento.animar`, então passar `dados.documento.animar` dá no mesmo — e `renderPaginaNaoEncontrada(nonce)` com status 404 (a raiz de domínio próprio sem página usa o texto do `customHostNotFound`, "Link não encontrado.", spec §6). A CSP da superfície `"bio"` precisa de `font-src 'self'` e `img-src 'self' data:`; o `nonce` é o do header da request.
- **PR 4b**: acrescenta ao `JS` de `script.ts`, no ramo do `[data-link]` (depois da linha da classe `lk-toque`), o `navigator.sendBeacon("/api/p/bio/toque", …)` com `{"p": <data-pagina do body>, "l": <data-link>}`; o orçamento de 3 KB é do JS inteiro (hoje 906 B).
- **PR 6a** (prévia): `renderPaginaBio(dados, { modo: "previa", nonce: null, animarEntrada })` num `<iframe srcdoc sandbox="">`, com `animarEntrada: true` só em "Rever a animação", troca de modelo e link novo.
- **PR 7**: no `index.ts`, troca `scriptDaPagina({ rastreio: null })` por `scriptDaPagina({ rastreio: <documento.rastreio quando houver id> })` e implementa o Pixel/GA4 dentro de `script.ts` (o `o` deixa de ser ignorado).
