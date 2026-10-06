# Painel G2 — PR 2 (barra volt no lugar do corredor e do letreiro) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O painel troca o corredor lateral + letreiro pela barra de cima volt do mockup G2 (desktop ≥ 1024 px: logo, loja, Início · Campanhas · Disparos · Relâmpago · Grupos · Contatos · Mais ▾, estado do número, sino, Postar, avatar; celular: barra volt de 52 px com símbolo, loja, ponto e sino, e a barra inferior continua).

**Architecture:** Um componente novo `BarraDeCima` substitui `Corredor` e `Letreiro` no layout; o "Mais" é um painel ancorado (`MenuMais`) que renderiza a mesma lista de módulos da folha "Mais" do celular, extraída para `ListaDosModulos` + hook `useResumoDosModulos`. CSS novo `.pn-barra*` e `.pn-menu-mais*` em `painel-vitrine.css`; as regras `.pn-letreiro*` e `.pn-corredor*` saem. Nada de dado novo.

**Tech Stack:** Next.js 15, React 19, Tailwind v4, `node --test` via tsx, Playwright (CI).

**Spec:** `docs/superpowers/specs/2026-10-05-painel-g2-barra-volt-design.md` (decisões 4, 5 e 11)

## Global Constraints

- A barra é volt `#071923` literal (não o token: dentro do painel `--color-volt-950` é a tinta) com texto branco; item ativo com traço de 2 px branco; sem busca (decisão 6 da D); sem seletor de loja.
- Postar na barra usa a classe `pn-postar` (o Acid tocável do painel) com `data-testid="painel-postar-barra"`; não aparece em `/painel/disparos`. Zero `button`/`a` com `bg-acid` em classe Tailwind na Início.
- Entre 1024 e 1280 px: nome da loja escondido, chip do número só com o ponto; a barra não pode criar rolagem horizontal em 1024.
- Acessibilidade: `nav aria-label="Módulos"`, `aria-current="page"` no ativo, Mais com `aria-expanded`/`aria-controls`, Esc fecha e devolve o foco ao botão, clique fora fecha; toque mínimo 44 px no celular.
- Código e commits em inglês; texto de tela em pt-BR. Commits terminam com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Em `apps/web`: unit `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`; tipos `npx tsc --noEmit -p tsconfig.json` **e** `npx tsc --noEmit -p tsconfig.e2e.json`; lint `npm run lint`; suíte `npm test`; lint da vitrine `npx tsx scripts/check-painel-vitrine.ts` se existir.
- Nunca `git add -A`; `git diff --cached --stat` antes de cada commit.

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/lib/painel-nav.ts` (+ `.test.ts`) | modificar | `curto` no `NavItem`, `NAV_BARRA_DESKTOP`; sai `tituloDaSecao` |
| `src/lib/painel/casca.ts` (+ `.test.ts`) | modificar | sai o ticker (`textoDoTicker`, `Entrada`, `UltimoPost`, `Ticker`) |
| `src/components/painel/use-resumo-modulos.ts` | criar | hook do estado dos módulos (vindo da folha Mais) |
| `src/components/painel/lista-dos-modulos.tsx` | criar | lista por verbo, compartilhada pela folha e pelo menu |
| `src/components/painel/folha-mais.tsx` | modificar | usa o hook e a lista |
| `src/components/painel/menu-mais.tsx` | criar | botão Mais ▾ + painel ancorado + romaneio |
| `src/components/painel/barra-de-cima.tsx` | criar | a barra |
| `src/components/painel/folha-postar.tsx` | modificar | aceita `emQualquerLargura` |
| `src/components/painel/notification-bell.tsx` | modificar | gatilho no estilo da barra |
| `src/components/painel/casca-context.tsx`, `home/avisos.tsx`, `home/ao-vivo/inicio-ao-vivo.tsx` | modificar | sai `passos`; checklist em toda largura |
| `src/app/painel/layout.tsx` | modificar | monta a barra; sai corredor e letreiro |
| `src/components/painel/corredor.tsx`, `letreiro.tsx` | apagar | — |
| `src/app/painel-vitrine.css` | modificar | `.pn-barra*`, `.pn-menu-mais*`; sai `.pn-letreiro*`, `.pn-corredor*` |
| `e2e/painel-vitrine-casca.spec.ts`, `e2e/painel-instagram.spec.ts` | modificar | contratos da casca nova |

---

### Task 1: navegação da barra e fim do ticker (TDD)

**Files:** `src/lib/painel-nav.ts`, `src/lib/painel-nav.test.ts`, `src/lib/painel/casca.ts`, `src/lib/painel/casca.test.ts`

- [ ] **Step 1 (teste):** em `painel-nav.test.ts`, apagar o teste `"a barra de cima nomeia a seção pelo item do menu que casa com a rota"` (e o import de `tituloDaSecao`) e acrescentar:

```ts
test("a barra de cima só aponta pra destinos do menu completo, no máximo seis, e o Relâmpago tem nome curto", () => {
  for (const item of NAV_BARRA_DESKTOP) assert.ok(NAV_ALL.includes(item), `${item.href} fora do menu`);
  assert.ok(NAV_BARRA_DESKTOP.length <= 6);
  assert.deepEqual(NAV_BARRA_DESKTOP.map((i) => i.href), ["/painel", "/painel/campanhas", "/painel/disparos", "/painel/relampago", "/painel/grupos", "/painel/contatos"]);
  assert.equal(NAV_BARRA_DESKTOP.find((i) => i.href === "/painel/relampago")?.curto, "Relâmpago");
});
```

- [ ] **Step 2:** rodar → FAIL (`NAV_BARRA_DESKTOP` não existe).
- [ ] **Step 3:** em `painel-nav.ts`: no `NavItem` acrescentar `/** Rótulo da barra de cima, quando o nome inteiro não cabe. */ curto?: string;`; em `RELAMPAGO` acrescentar `curto: "Relâmpago"`; depois de `NAV_BARRA_DIREITA`:

```ts
/** Barra de cima (spec G2, decisão 4): os seis módulos do dia; o resto fica no "Mais". */
export const NAV_BARRA_DESKTOP: NavItem[] = [INICIO, CAMPANHAS, DISPAROS, RELAMPAGO, GRUPOS, CONTATOS];
```

  Apagar `tituloDaSecao` (função e o comentário acima dela).
- [ ] **Step 4:** em `casca.test.ts` apagar os cinco testes do ticker (de `"entrada nas últimas 24h vira o ticker…"` até `"sem entrada nem post, aponta o próximo passo…"`) e o import de `textoDoTicker`. Em `casca.ts` apagar `Entrada`, `UltimoPost`, `Ticker`, `DIA_MS`, `DIAS`, `textoDoTicker` e o import de `timeAgo`; manter `dois`, `iniciaisDaLoja`, `abreviaNome` (usado por `campanha-visao.ts`), `AssinaturaResumo`, `romaneioDoPlano`.
- [ ] **Step 5:** `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/painel-nav.test.ts src/lib/painel/casca.test.ts` → PASS. Commit `feat(painel): top bar navigation list; ticker rules retired`.

### Task 2: lista dos módulos compartilhada

**Files:** criar `src/components/painel/use-resumo-modulos.ts`, `src/components/painel/lista-dos-modulos.tsx`; modificar `src/components/painel/folha-mais.tsx`.

- [ ] **Step 1:** `use-resumo-modulos.ts` — mover de `folha-mais.tsx` o tipo `Linha`, a função `lista` e o `useEffect` do resumo:

```ts
"use client";

import { useEffect, useState } from "react";
import type { ResumoDados } from "@/lib/painel-nav";

type Linha = { status?: string; enabled?: boolean; createdAt?: string };

/** Aceita lista pura ou envelope ({ offers: [...] }, como /api/relampago/offers). */
async function lista(url: string): Promise<Linha[]> {
  const r = await fetch(url).then((res) => (res.ok ? res.json() : [])).catch(() => []);
  if (Array.isArray(r)) return r;
  const envelope = r && typeof r === "object" ? Object.values(r).find(Array.isArray) : undefined;
  return Array.isArray(envelope) ? envelope : [];
}

/** O estado de cada módulo ("Campanhas · 3"). Busca só enquanto `aberto`. */
export function useResumoDosModulos(aberto: boolean): ResumoDados | null {
  const [dados, setDados] = useState<ResumoDados | null>(null);
  useEffect(() => {
    if (!aberto) return;
    let cancelado = false;
    (async () => {
      const [campanhas, disparos, ofertas, funisAgendados, paginas] = await Promise.all([
        lista("/api/campanhas"),
        lista("/api/disparos"),
        lista("/api/relampago/offers"),
        // Envelope { agendados, enviados }: `lista` pega o 1º array, que é `agendados`.
        lista("/api/funis"),
        lista("/api/pages"),
      ]);
      if (cancelado) return;
      setDados({
        campanhas: campanhas.length,
        ultimoDisparo: disparos[0]?.createdAt ?? null,
        relampagoAoVivo: ofertas.some((o) => o.status === "open"),
        funisAgendados: funisAgendados.length,
        paginasNoAr: paginas.filter((p) => p.status === "published").length,
      });
    })();
    return () => {
      cancelado = true;
    };
  }, [aberto]);
  return dados;
}
```

- [ ] **Step 2:** `lista-dos-modulos.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ALL, NAV_GRUPOS_ORDEM, NAV_GRUPO_TITULO, isNavItemActive, liberado, resumo, type ResumoDados } from "@/lib/painel-nav";
import { useCasca } from "./casca-context";

type Props = {
  dados: ResumoDados | null;
  aoEscolher: () => void;
  classeDoGrupo: string;
  classeDoItem: string;
};

/**
 * Todos os módulos por verbo (Vender, Lotar, Loja) com o estado de cada um
 * antes do toque. A folha "Mais" do celular e o menu "Mais" da barra
 * renderizam esta lista; só as classes mudam.
 */
export function ListaDosModulos({ dados, aoEscolher, classeDoGrupo, classeDoItem }: Props) {
  const pathname = usePathname();
  const { liberacoes } = useCasca();
  const linhas = dados ? resumo(dados) : {};
  return (
    <>
      {NAV_GRUPOS_ORDEM.map((grupo) => (
        <section key={grupo}>
          <h3 className={classeDoGrupo}>{NAV_GRUPO_TITULO[grupo]}</h3>
          <ul>
            {NAV_ALL.filter((item) => item.grupo === grupo && liberado(item, liberacoes)).map(({ href, label, icon: Icon }) => {
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

- [ ] **Step 3:** `folha-mais.tsx` vira:

```tsx
"use client";

import { Folha } from "./folha";
import { ListaDosModulos } from "./lista-dos-modulos";
import { useResumoDosModulos } from "./use-resumo-modulos";

/** "Mais" da casca mobile (spec 3.2): todos os módulos por grupo, com o estado de cada um. */
export function FolhaMais({ id, aberta, aoFechar }: { id?: string; aberta: boolean; aoFechar: () => void }) {
  const dados = useResumoDosModulos(aberta);
  return (
    <Folha id={id} aberta={aberta} aoFechar={aoFechar} titulo="Mais" testId="painel-folha-mais">
      <nav aria-label="Todos os módulos" className="space-y-4 pb-2">
        <ListaDosModulos
          dados={dados}
          aoEscolher={aoFechar}
          classeDoGrupo="font-data px-2 pb-1 text-12 uppercase tracking-[0.08em] text-slate-600"
          classeDoItem="pn-folha__item"
        />
      </nav>
    </Folha>
  );
}
```

- [ ] **Step 4:** `npx tsc --noEmit -p tsconfig.json`; commit `refactor(painel): module list shared by the Mais sheet and the top bar`.

### Task 3: menu Mais, barra de cima e layout

**Files:** criar `menu-mais.tsx`, `barra-de-cima.tsx`; modificar `folha-postar.tsx`, `notification-bell.tsx`, `casca-context.tsx`, `home/avisos.tsx`, `home/ao-vivo/inicio-ao-vivo.tsx`, `app/painel/layout.tsx`; apagar `corredor.tsx`, `letreiro.tsx`.

- [ ] **Step 1:** `folha-postar.tsx`: em `Props` acrescentar `/** A barra de cima abre a folha em qualquer largura (diálogo centrado no desktop). */ emQualquerLargura?: boolean;`, destruturar e repassar: `<Folha id={id} aberta={aberta} aoFechar={aoFechar} titulo="Postar" testId="painel-folha-postar" emQualquerLargura={emQualquerLargura}>`.
- [ ] **Step 2:** `menu-mais.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { romaneioDoPlano, type AssinaturaResumo } from "@/lib/painel/casca";
import { ListaDosModulos } from "./lista-dos-modulos";
import { useResumoDosModulos } from "./use-resumo-modulos";

/** undefined enquanto carrega; null sem assinatura ou com a API fora. Busca na primeira abertura. */
function useAssinatura(aberto: boolean): AssinaturaResumo | undefined {
  const [sub, setSub] = useState<AssinaturaResumo | undefined>(undefined);
  useEffect(() => {
    if (!aberto || sub !== undefined) return;
    let cancelado = false;
    fetch("/api/subscription")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelado) setSub(data ?? null);
      })
      .catch(() => {
        if (!cancelado) setSub(null);
      });
    return () => {
      cancelado = true;
    };
  }, [aberto, sub]);
  return sub;
}

/**
 * "Mais" da barra de cima (spec G2, decisão 4): painel ancorado ao botão com
 * todos os módulos por verbo e o estado de cada um — a mesma lista da folha
 * "Mais" do celular — e o romaneio do plano no rodapé. Esc (devolvendo o foco
 * ao botão), clique fora e escolher um item fecham. Não é modal.
 */
export function MenuMais() {
  const [aberto, setAberto] = useState(false);
  const id = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const dados = useResumoDosModulos(aberto);
  const sub = useAssinatura(aberto);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setAberto(false);
      botao.current?.focus();
    };
    const aoClicar = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("keydown", aoTeclar);
    document.addEventListener("mousedown", aoClicar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.removeEventListener("mousedown", aoClicar);
    };
  }, [aberto]);

  return (
    <div ref={raiz} className="relative flex self-stretch">
      <button ref={botao} type="button" aria-expanded={aberto} aria-controls={id} onClick={() => setAberto((v) => !v)} className="pn-barra__item">
        Mais <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
      </button>
      {aberto && (
        <div id={id} data-testid="painel-menu-mais" className="pn-menu-mais">
          <nav aria-label="Todos os módulos" className="contents">
            <ListaDosModulos dados={dados} aoEscolher={() => setAberto(false)} classeDoGrupo="pn-menu-mais__grupo" classeDoItem="pn-menu-mais__item" />
          </nav>
          <Link href="/painel/configuracoes" data-testid="painel-romaneio" onClick={() => setAberto(false)} className="pn-menu-mais__rodape">
            {sub === undefined ? "…" : romaneioDoPlano(sub)}
          </Link>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3:** `barra-de-cima.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
import { Logo, LogoSymbol } from "@/components/brand/logo";
import { useCasca } from "@/components/painel/casca-context";
import { NotificationBell } from "@/components/painel/notification-bell";
import { useRole } from "@/components/painel/role-provider";
import { usePanelSession } from "@/components/painel/session-provider";
import { iniciaisDaLoja } from "@/lib/painel/casca";
import { NAV_BARRA_DESKTOP, isNavItemActive, liberado } from "@/lib/painel-nav";
import { cn } from "@/lib/utils";
import { FolhaPostar } from "./folha-postar";
import { MenuMais } from "./menu-mais";

const DISPAROS = "/painel/disparos";
const RELAMPAGO = "/painel/relampago";
const REFRESCO_MS = 60_000;

type Oferta = { status?: string };

/**
 * Há oferta relâmpago no ar? Busca ao montar e quando a aba volta a ficar
 * visível depois de um minuto; o layout não remonta entre rotas.
 */
function useRelampagoNoAr(): boolean {
  const [noAr, setNoAr] = useState(false);
  useEffect(() => {
    let cancelado = false;
    let ultimaBusca = 0;
    async function buscar() {
      ultimaBusca = Date.now();
      const json = await fetch("/api/relampago/offers")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (cancelado) return;
      const ofertas: Oferta[] = Array.isArray(json?.offers) ? json.offers : [];
      setNoAr(ofertas.some((o) => o.status === "open"));
    }
    void buscar();
    const aoVoltar = () => {
      if (document.visibilityState === "visible" && Date.now() - ultimaBusca > REFRESCO_MS) void buscar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      cancelado = true;
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, []);
  return noAr;
}

/**
 * Barra de cima (spec G2, decisão 4): a única peça Volt da casca. Desktop:
 * logo, loja, os seis módulos do dia, Mais, estado do número, sino, Postar e
 * avatar. Celular (52px): símbolo, loja, ponto do número e sino — a navegação
 * fica na barra inferior (decisão 5).
 */
export function BarraDeCima() {
  const pathname = usePathname();
  const { tenantName, carregado } = useRole();
  const { session, loading } = usePanelSession();
  const { foco, liberacoes } = useCasca();
  const noAr = useRelampagoNoAr();
  const [postar, setPostar] = useState(false);
  const idPostar = useId();
  const fechar = useCallback(() => setPostar(false), []);
  if (foco) return null;

  const nomeDaLoja = carregado ? (tenantName ?? "Sua loja") : "";
  const ponto = loading || !session ? "pn-ponto--indefinido" : session.live ? "pn-ponto--conectado pn-respira" : "pn-ponto--desconectado";
  const estado = loading || !session ? "Verificando…" : session.live ? "Conectado" : "Desconectado";
  const nomeDoNumero = !loading && session ? `Seu número: ${session.live ? "conectado" : "desconectado"}` : "Seu número";

  return (
    <>
      <header data-testid="painel-barra" className="pn-barra sticky top-0 z-20">
        <Link href="/painel" aria-label="Girumo, início" className="pn-barra__logo">
          <Logo className="hidden text-[20px] lg:inline-flex" title={null} />
          <LogoSymbol className="h-[22px] w-[22px] lg:hidden" />
        </Link>
        {carregado ? (
          <span data-testid="painel-barra-loja" title={nomeDaLoja} className="pn-barra__loja">
            {nomeDaLoja}
          </span>
        ) : (
          <span role="status" aria-label="Carregando nome da loja" className="pn-skeleton inline-block h-4 w-24 rounded-[var(--radius-chip)]" />
        )}

        <nav aria-label="Módulos" className="pn-barra__nav hidden lg:flex">
          {NAV_BARRA_DESKTOP.filter((item) => liberado(item, liberacoes)).map((item) => (
            <Link key={item.href} href={item.href} aria-current={isNavItemActive(pathname, item.href) ? "page" : undefined} className="pn-barra__item">
              {item.curto ?? item.label}
              {item.href === RELAMPAGO && noAr && <span className="pn-barra__ponto" role="img" aria-label="oferta no ar" />}
            </Link>
          ))}
          <MenuMais />
        </nav>

        <div className="pn-barra__direita">
          <Link
            href="/painel/conectar"
            title={nomeDoNumero}
            aria-label={nomeDoNumero}
            aria-current={isNavItemActive(pathname, "/painel/conectar") ? "page" : undefined}
            className="pn-barra__numero"
          >
            <span className={cn("pn-ponto", ponto)} aria-hidden="true" />
            <span className="pn-barra__numero-rotulo">{estado}</span>
          </Link>
          <NotificationBell />
          {pathname !== DISPAROS && (
            <button
              type="button"
              data-testid="painel-postar-barra"
              aria-haspopup="dialog"
              aria-expanded={postar}
              aria-controls={idPostar}
              onClick={() => setPostar(true)}
              className="pn-postar pn-barra__postar hidden lg:inline-flex"
            >
              Postar
            </button>
          )}
          <Link href="/painel/configuracoes" title="Configurações" aria-label={`Configurações · ${nomeDaLoja || "sua loja"}`} className="pn-barra__avatar hidden lg:grid">
            {carregado ? iniciaisDaLoja(tenantName) : ""}
          </Link>
        </div>
      </header>
      <FolhaPostar id={idPostar} aberta={postar} aoFechar={fechar} aoPostar={fechar} emQualquerLargura />
    </>
  );
}
```

- [ ] **Step 4:** `notification-bell.tsx` linha 140 — o gatilho passa a viver na barra volt: `className="relative flex h-11 w-11 items-center justify-center rounded-lg text-canvas-100/80 transition hover:bg-paper-0/10 hover:text-paper-0 lg:h-9 lg:w-9"`; no badge (linha 147) trocar `ring-canvas-100` por `ring-[#071923]`. O painel aberto (linha 155) fica como está (superfície clara).
- [ ] **Step 5:** sai o roteiro do corredor. `casca-context.tsx`: apagar `Passos`, `passos`, `definirPassos` (tipo, default, estado, `useMemo`) e o parágrafo do comentário que fala em "N de 5 passos". `home/avisos.tsx`: apagar o `useEffect` de `definirPassos` e o `useCasca` se ficar sem uso. `home/ao-vivo/inicio-ao-vivo.tsx`: o checklist volta a toda largura — trocar

```tsx
      {mostrarChecklist && (
        <div className="lg:hidden">
          <ActivationChecklist activation={activation} onDismiss={onDismissOnboarding} />
        </div>
      )}
```

  por `{mostrarChecklist && <ActivationChecklist activation={activation} onDismiss={onDismissOnboarding} />}`.
- [ ] **Step 6:** `app/painel/layout.tsx`: trocar os imports de `Letreiro`/`Corredor` por `import { BarraDeCima } from "@/components/painel/barra-de-cima";` e o miolo por

```tsx
            <div data-testid="painel-root" className="pn-root font-body flex min-h-screen w-full flex-col bg-canvas-100 text-volt-950">
              <BarraDeCima />
              <main className="mx-auto w-full max-w-[90rem] flex-1 pb-20 lg:pb-0">
                <PageTransition>{children}</PageTransition>
              </main>
              <BarraMobile />
            </div>
```

  com o comentário "Casca G2 (spec 2026-10-05): barra volt em cima em toda largura; barra inferior no celular." Apagar `corredor.tsx` e `letreiro.tsx` (`git rm`).
- [ ] **Step 7:** `npx tsc --noEmit -p tsconfig.json` limpo; commit `feat(painel): volt top bar with Mais panel replaces the corridor and the marquee`.

### Task 4: CSS da barra

**Files:** `src/app/painel-vitrine.css`

- [ ] **Step 1:** cabeçalho (linhas 9–11): "Gramática: barra volt em cima (única peça Volt) + balcão claro. Acid só em Postar, AO VIVO e LOTOU…". Tokens (linhas 33–36): trocar os quatro `--spacing-letreiro*`/`--spacing-corredor*` por `--spacing-barra: 56px;` e `--spacing-barra-mobile: 52px;`.
- [ ] **Step 2:** apagar os blocos `.pn-letreiro`, `.pn-letreiro__loja`, `.pn-letreiro__secao`, `.pn-letreiro__ticker` (linhas 61–95, mantendo `.pn-ponto*`), todo `.pn-corredor*` (112–241), `.pn-corredor__rodape` e `.pn-corredor__romaneio` (750–764), `.pn-corredor__passos*` (856–880), dentro da media de 1023.98 as regras `.pn-corredor__passos`, `.pn-letreiro` e `.pn-letreiro__loja`, e a media inteira `(min-width: 1024px) and (max-width: 1279.98px)` (907–946).
- [ ] **Step 3:** no lugar do letreiro (dentro de `@layer components`):

```css
/* --- Barra de cima (G2): a única peça Volt da casca. 56px no desktop, 52px no
   celular. Volt literal: dentro do painel --color-volt-950 é a tinta. --- */
.pn-barra {
  display: flex;
  align-items: center;
  gap: 8px;
  height: var(--spacing-barra);
  padding: 0 24px;
  background: #071923;
  color: #FFFFFF;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.pn-barra__logo {
  display: flex;
  align-items: center;
  color: #FFFFFF;
}
.pn-barra__loja {
  max-width: 220px;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pn-barra__nav {
  align-self: stretch;
  gap: 2px;
  margin-left: 8px;
}
.pn-barra__item {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.72);
  white-space: nowrap;
  transition: color var(--dur-fast) var(--ease-girumo);
}
.pn-barra__item:hover,
.pn-barra__item[aria-current="page"],
.pn-barra__item[aria-expanded="true"] {
  color: #FFFFFF;
}
.pn-barra__item[aria-current="page"]::after {
  content: "";
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: -1px;
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: #FFFFFF;
}
/* Oferta no ar: o ponto Acid ao lado de "Relâmpago". */
.pn-barra__ponto {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 9999px;
  background: var(--color-acid-500);
}
.pn-barra__direita {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}
.pn-barra__numero {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 12px 0 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #FFFFFF;
  white-space: nowrap;
}
/* O Postar da barra: o mesmo Acid do celular, sem o corte e sem a sombra dura. */
.pn-barra .pn-postar {
  width: auto;
  height: 36px;
  padding: 0 14px;
  border-radius: 8px;
  clip-path: none;
  font-size: 14px;
}
.pn-barra__avatar {
  place-items: center;
  width: 32px;
  height: 32px;
  margin-left: 4px;
  border-radius: 9999px;
  background: #FFFFFF;
  color: #071923;
  font-size: 12px;
  font-weight: 700;
}

/* --- Menu "Mais": painel ancorado ao botão, três colunas por verbo, romaneio no rodapé. --- */
.pn-menu-mais {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  z-index: 40;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px 24px;
  width: min(640px, calc(100vw - 48px));
  padding: 20px 24px 16px;
  background: var(--color-paper-0);
  color: var(--color-volt-950);
  border: 1px solid var(--color-line-200);
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(15, 36, 48, 0.14);
}
.pn-menu-mais__grupo {
  margin-bottom: 6px;
  font-size: 14px;
  font-weight: 600;
}
.pn-menu-mais__item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  margin: 0 -8px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 14px;
  color: var(--color-volt-950);
}
.pn-menu-mais__item:hover {
  background: var(--color-hover-ficha);
}
.pn-menu-mais__item[aria-current="page"] {
  background: var(--pn-selecionado);
}
.pn-menu-mais__rodape {
  grid-column: 1 / -1;
  padding-top: 12px;
  border-top: 1px solid var(--color-line-200);
  font-family: var(--font-data);
  font-size: 12px;
  letter-spacing: 0.04em;
  color: var(--color-slate-600);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Entre lg e 1280: sem o nome da loja (ficam as iniciais) e o número só com o ponto. */
@media (min-width: 1024px) and (max-width: 1279.98px) {
  .pn-barra__loja,
  .pn-barra__numero-rotulo {
    display: none;
  }
  .pn-barra__numero {
    width: 36px;
    padding: 0;
    justify-content: center;
  }
}
```

  e na media `(max-width: 1023.98px)` existente acrescentar:

```css
  .pn-barra {
    height: var(--spacing-barra-mobile);
    gap: 10px;
    padding: 0 10px 0 14px;
  }
  .pn-barra__loja {
    font-size: 15px;
  }
  /* Só o ponto, no alvo de 44px do dedo. */
  .pn-barra__numero {
    width: 44px;
    height: 44px;
    padding: 0;
    border: 0;
    justify-content: center;
  }
  .pn-barra__numero-rotulo {
    display: none;
  }
```

- [ ] **Step 4:** `grep -n "pn-letreiro\|pn-corredor\|spacing-letreiro\|spacing-corredor" src/app/painel-vitrine.css src -r` → vazio. Commit `feat(painel): top bar and Mais panel styles; corridor and marquee styles retired`.

### Task 5: e2e da casca

**Files:** `e2e/painel-vitrine-casca.spec.ts`, `e2e/painel-instagram.spec.ts`

- [ ] **Step 1:** em `painel-instagram.spec.ts` linha 44: `page.getByTestId("painel-barra")` no lugar de `painel-letreiro`.
- [ ] **Step 2:** em `painel-vitrine-casca.spec.ts`: no loop mobile, `painel-letreiro` → `painel-barra` (mensagem "sem a barra"). Substituir o `describe` desktop inteiro por:

```ts
test.describe("casca desktop G2: barra volt em cima", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("barra com loja, módulos, número, Postar e avatar; Mais abre o painel; barra inferior fora", async ({ page }) => {
    await page.goto("/painel", { waitUntil: "load" });
    await expect(page.getByTestId("painel-root")).toBeVisible();

    const barra = page.getByTestId("painel-barra");
    await expect(barra).toBeVisible();
    await expect(barra.getByTestId("painel-barra-loja")).toBeVisible({ timeout: 30_000 });
    const modulos = barra.getByRole("navigation", { name: "Módulos" });
    for (const nome of ["Início", "Campanhas", "Disparos", "Relâmpago", "Grupos", "Contatos"]) {
      await expect(modulos.getByRole("link", { name: nome, exact: true })).toBeVisible();
    }
    await expect(modulos.getByRole("link", { name: "Início", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(barra.getByRole("link", { name: /Seu número/ })).toBeVisible();
    await expect(barra.getByTestId("painel-postar-barra")).toBeVisible();
    await expect(barra.getByRole("link", { name: /^Configurações/ })).toBeVisible();

    await modulos.getByRole("button", { name: "Mais" }).click();
    const menu = page.getByTestId("painel-menu-mais");
    await expect(menu).toBeVisible();
    for (const grupo of ["Vender", "Lotar", "Loja"]) {
      await expect(menu.getByRole("heading", { name: grupo })).toBeVisible();
    }
    await expect(menu.getByRole("link", { name: /^Campanhas · / })).toBeVisible({ timeout: 30_000 });
    await expect(menu.getByTestId("painel-romaneio")).not.toHaveText("…", { timeout: 30_000 });
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(modulos.getByRole("button", { name: "Mais" })).toBeFocused();

    await expect(page.getByTestId("painel-mobile-nav")).toBeHidden();
  });

  test("Postar da barra abre a folha como diálogo e Esc fecha", async ({ page }) => {
    await page.goto("/painel/grupos", { waitUntil: "load" });
    await page.getByTestId("painel-postar-barra").click();
    const folha = page.getByTestId("painel-folha-postar");
    await expect(folha).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(folha).toHaveCount(0);
  });

  test("em Disparos a tela é o compositor: a barra não repete o Postar", async ({ page }) => {
    await page.goto("/painel/disparos", { waitUntil: "load" });
    await expect(page.getByTestId("painel-barra")).toBeVisible();
    await expect(page.getByTestId("painel-postar-barra")).toHaveCount(0);
  });

  test("Inicio ao vivo no desktop: faixa, mapa, postando e relampago no lugar", async ({ page }) => {
    await page.goto("/painel", { waitUntil: "load" });
    await expect(page.getByTestId("painel-skeleton")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("inicio-faixa")).toBeVisible();
    await expect(page.getByTestId("inicio-mapa")).toBeVisible();
    await expect(page.getByTestId("inicio-postando")).toBeVisible();
    await expect(page.getByTestId("inicio-relampago")).toBeVisible();
    // Sem fundo Acid alem do chip AO VIVO/LOTOU: nenhum botao Acid em classe Tailwind na tela.
    const acidButtons = await page.locator('button[class*="bg-acid"], a[class*="bg-acid"]').count();
    expect(acidButtons).toBe(0);
  });

  test("entre 1024 e 1280 a barra esconde o nome da loja e cabe sem rolagem", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto("/painel/grupos", { waitUntil: "load" });
    const barra = page.getByTestId("painel-barra");
    await expect(barra).toBeVisible();
    await expect(barra.getByTestId("painel-barra-loja")).toBeHidden();
    await expect(barra.getByRole("link", { name: "Grupos", exact: true })).toHaveAttribute("aria-current", "page");
    const largura = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(largura).toBeLessThanOrEqual(1024);
  });
});
```

- [ ] **Step 3:** `npx tsc --noEmit -p tsconfig.e2e.json`, `npm run lint`, `npm test`, `npx tsx scripts/check-painel-vitrine.ts` (se existir). Commit `test(e2e): shell contracts for the volt top bar`.

### Task 6: PR, CI, merge, produção

- [ ] `git fetch origin main`; push `-u`; `gh pr create` título `feat(painel): G2 PR 2 — barra volt no lugar do corredor e do letreiro`; CI verde; `gh pr merge --squash --delete-branch`.
- [ ] Produção logada em 1440, 1100, 1024 e 390: barra volt com o item ativo, Mais abrindo e fechando por Esc, Postar abrindo a folha, chip do número, sino; nenhuma rolagem lateral; barra inferior no celular; `/painel/instagram` em foco some a barra.
