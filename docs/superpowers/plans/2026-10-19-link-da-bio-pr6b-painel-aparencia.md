# Link da bio — PR 6b: abas Aparência, Perfil e Divulgar + item no menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O lojista termina a página no painel e chega nela pelo menu: no Perfil troca a foto (com o foco), as logos, os textos de cima, o bloco "Antes de pagar, confere" e o selo; na folha de link põe até 3 fotos no botão e a foto da fachada; na Aparência escolhe o modelo pelas miniaturas vivas, a paleta ou as cores da marca e a animação; na Divulgar põe a página no ar, acerta o endereço (conferido ao digitar), copia, baixa o QR e vê visitas e toques dos últimos 7 ou 30 dias — tudo atrás do item "Link da bio" em Lotar.

**Architecture:** Três abas novas no registro `ABAS` do 6a (`abas.tsx`); cada uma recebe `PropsDaAba` e muda o rascunho só por função (`mudarDocumento`, `mudarPagina`) — o hook e a tela do 6a não mudam de forma. O erro do salvar que é da aba entra por um hook só (`useErroDaAba`): o caminho do zod acha o "lugar" na lista da aba (`lugarDoErro`), a frase vai embaixo do campo, o foco vai até ele (`idNaTela`) e o que não tem lugar vai pro aviso do topo da aba. As regras puras moram em três módulos novos ao lado do `editor.ts` do 6a (`editor-perfil.ts`, `editor-aparencia.ts`, `editor-divulgar.ts`). Foto sobe pelo `uploadMediaFile` (direto pro Storage, `lp-media`/`lp-logo`), que passa a mandar a loja aberta. A prévia do 6a ganha 300 ms de espera (digitar não recarrega o iframe a cada letra) e vira também a miniatura de cada modelo (`miniatura`: `inert` + `aria-hidden`).

**Tech Stack:** Next 15 (página cliente), React 19.2, zod 4 (o `documentoBio` do PR 2, também no navegador), Tailwind 4 (tema G2 do painel), lucide-react 1.21, qrcode.react 4.2 (`QRCodeCanvas`, já no `package.json`), `node:test` + `react-dom/server` (`renderToStaticMarkup`), Playwright (só a checagem do menu).

**Spec:** `docs/superpowers/specs/2026-10-19-link-da-bio-design.md` — §8 (Aparência, Perfil, Divulgar, item no menu), §3 (cores da marca, logos, foto), §4 (mídia, `perfil`, `confere`), §7 (números do painel), §9 (contratos), §11 (acessibilidade do painel), §12 linha 6b. Visual e textos: `Desktop/girumo-design-refs/link-da-bio/project/Editor.dc.html`, abas Aparência, Perfil e Divulgar (fora do repo; tem dado da loja-piloto, que **não** entra em nenhum arquivo deste PR).

**Depende de:** PR 6a (as duas partes), PR 3a (`renderPaginaBio`, `urlDaImagem`, `pontoDoFoco`, `src/test/bio-dados-falsos.ts`), PR 3b (Vitrine, Romaneio e Clássico — só a Parte 2), PR 5 (`GET /api/link-da-bio/slug`, `GET /api/link-da-bio/relatorio`, tipos de `painel-api.ts`) e PR 2, todos em `main`. Índice: `docs/superpowers/plans/2026-10-19-link-da-bio-00-indice.md`. Quem depende deste: PR 7 (o "Avançado" é mais um cartão no fim do Perfil; ver "Interface com os outros PRs").

## Tamanho e divisão

São 15 arquivos de código (17 alterações: `previa.tsx` e `abas.tsx` mudam nas duas partes). Vai em dois PRs, cada um com branch própria, CI verde e merge na mesma sessão:

| Parte | Branch | O quê | Código | Teste |
|---|---|---|---|---|
| 1 | `feat/link-da-bio-6b1-perfil` | upload na loja aberta, regras do Perfil, erro por aba, campo de foto, aba Perfil, fotos na folha de link, prévia que espera a digitação | 9 | 5 |
| 2 | `feat/link-da-bio-6b2-aparencia-divulgar` | aba Aparência (miniaturas vivas, paletas, cores da marca, animação), aba Divulgar (no ar, endereço, Instagram, QR, números) e o item no menu | 8 | 9 |

A Parte 2 sai de `origin/main` **depois** da Parte 1 mergeada e do PR 3b em `main`. Entre as duas a rota tem Links e Perfil e ainda não publica (o interruptor "Página no ar" é da Divulgar) — e ninguém chega nela sem digitar a URL, porque o item no menu só entra no fim da Parte 2 (§8: "O item no menu só entra no PR 6b, com Aparência e Perfil prontos").

## Decisões deste plano

| Decisão | Por quê | Custo se estiver errada |
|---|---|---|
| **`uploadMediaFile` passa a usar `authenticatedFetch`** (Bearer + `x-tenant-id`) no `prepare` e no `register` | Hoje ele chama com `fetch` puro: o servidor resolve a loja só pelo cookie e, sem `x-tenant-id`, `findMembershipTenantId` pega a **mais antiga**. Quem tem duas lojas sobe a foto na outra loja, e o salvar do link da bio dá 400 (`conferirDocumentoDaLoja` confere que a mídia é da loja, §4). É o mesmo achado do "tenant cookie × Bearer"; vale para todo upload do painel, que passa a cair na loja aberta | Se algum caminho dependia de cair na loja mais antiga, ele muda — o roteiro da Task 7 sobe arquivo no Postar para conferir |
| **Erro do salvar por aba num hook só** (`useErroDaAba(erro, limparErro, lugares, versao)`) | Três abas novas recebem o erro do mesmo jeito (contrato `PropsDaAba.erro` do 6a); o hook acha o lugar pela lista da aba, foca o campo (ou o aviso do topo) e devolve o erro ao editor. O salvar que dá certo (`versao` sobe) limpa o que estava na aba | — |
| **Lugar do erro pelo prefixo mais longo** (`lugarDoErro`) e id do campo pelo caminho (`idNaTela`: `perfil.nome` → `bio-perfil-nome`) | O zod e o `conferirDocumentoDaLoja` mandam caminhos como `perfil.capa.id` ou `perfil.destaques.2`: o campo que os mostra é `perfil.capa` / `perfil.destaques`. Uma convenção de id serve ao PR 7 sem combinar nada | — |
| **A prévia espera 300 ms depois da última mudança; a rodada passa na hora** (`QuadroDaPrevia`) | O 6a deixou isso para o 6b ("No Perfil cada tecla recarregaria"): sem espera, cada letra (e cada passo do seletor de cor) recarrega o iframe, que pisca e volta ao topo. A rodada (link novo, troca de modelo, "Rever a animação") passa sem espera porque é ela que anima | A prévia mostra a última letra 300 ms depois |
| **A miniatura do modelo é o `QuadroDaPrevia` com `miniatura`** (`inert`, `aria-hidden`, `tabIndex=-1`, `sandbox=""`, `rodada` fixa em 0) | Um iframe só, com a mesma espera e a mesma regra de "parado" (`animarEntrada: false` porque a rodada nunca muda) | — |
| **A miniatura mostra a paleta que o toque daria**, não a primeira do modelo (o mockup e a nota "Como o 6b encaixa" do 6a usavam `PALETAS[modelo][0]`) | Trocar de modelo mantém a paleta quando ela existe no novo (todos têm `azul`) e mantém `marca`; com a miniatura na primeira paleta, tocar na "Vitrine creme" daria uma Vitrine azul. `comModelo` é a mesma função na miniatura e no toque | — |
| **Paleta pronta não apaga `cores`** (tocar numa paleta só troca `paleta`) | §9: `cores` é "obrigatório se paleta = marca", não proibido fora disso; voltar para "Cores da sua marca" recupera as duas. O teste da Task 8 prende essa premissa contra o `documentoBio` do PR 2 | Se o zod do PR 2 recusar `cores` com paleta pronta, o toque na paleta passa a gravar `cores: null` (o teste vermelho mostra) |
| **Amostra da paleta = `coresDoModelo`** (`fundo2` e `prin`; no Romaneio, `acento`); só os nomes são tabela | A bolinha mostra a cor que a página usa, sem uma segunda tabela de hex para envelhecer. Conferido em 19/10: os 16 pares do mockup são exatamente esses tokens do `paletas.json` | Se o PR 2 nomear os tokens de outro jeito, o teste da Task 8 aponta qual |
| **Destaques e linhas do "confere" em campos locais** (3 e 2); o documento recebe só os que têm texto | §4: cada item tem de 1 a 40 (ou 160) letras. Filtrar na hora sem campos locais faria o texto pular de caixa (digitar na 3ª com a 1ª vazia); guardar vazio quebraria o salvar | — |
| **CNPJ: sem pontuação e em maiúsculas no documento, máscara na tela; avisa na hora com 14 caracteres errados** (`erroNoCampo`, o mesmo `documentoBio`) | §4: "numérico ou alfanumérico (12 `[0-9A-Z]` + 2 dígitos); aceita com ou sem pontuação, guarda sem pontuação e em maiúsculas" e "dígito verificador válido". A regra do dígito mora no zod do PR 2; o painel só pergunta a ele. Por isso o campo não usa teclado numérico | — |
| **A paleta `azul` se chama "Azul"** (o mockup dizia "Azul da loja") | No mockup era a cor da loja-piloto; no produto a cor da loja é "Cores da sua marca" | — |
| **@ do Instagram limpo ao digitar** (`instagramDoCampo`: tira `@`, o link do perfil colado, deixa minúsculo) e o campo aceita colar até 100 | O `maxLength` de 30 cortaria `https://www.instagram.com/loja…` antes da limpeza; o corte de 30 vem depois. Caractere que não vale (espaço, hífen) fica e o painel avisa | — |
| **QR = endereço na Girumo** (`/bio/<slug salvo>`), mesmo com domínio próprio; "Copiar" = endereço principal (domínio ou Girumo) | O QR vai impresso na sacola: o endereço na Girumo sobrevive à troca de slug (301, §2) e à perda do domínio. A spec não diz qual endereço vai no QR | Se o Igor preferir o domínio no QR, é uma linha |
| **"Toques por visita"** com até 2 casas (`0,38`), nunca "% de quem tocou" (o mockup dizia "38% de quem visitou tocou em algo") | §7: "toques por visita (pode passar de 1; não é '% que tocou')" | — |
| **Links apagados somados numa linha** ("Links que saíram da página") e só link com toque na tabela | O relatório guarda o uuid; o título só existe para link que ainda está na página | — |
| **Slug conferido em duas camadas**: formato e reservado no navegador (`SLUG_BIO`, `slugReservado`, sem chamar a API); "em uso" pela API 400 ms depois da última tecla, e só a última resposta vale | §8: "conferência de disponível ao digitar, com atraso". Quem decide é o PATCH (409 cai embaixo do campo) | — |
| **Fotos do link e da fachada sem foco** (só a capa tem o `CropFocal`) | §4: "Foto: uma (`capa`) com ponto de foco" | Foto do botão sai centralizada |
| **"Remover" em toda foto** (o mockup só mostrava "Trocar") | Capa, logos e fachada são opcionais (§4); sem "Remover" não dá pra voltar a "sem foto" | — |
| **O dono do erro `rastreio.*` continua sem aba no 6b** (o regex do Perfil é `perfil|confere|feitoComGirumo`; o 6a sugeria incluir `rastreio`) | Sem o "Avançado" não há campo para mostrar o erro; sem dona ele cai no aviso do topo da tela (6a). O PR 7 acrescenta `rastreio` junto com os campos | — |
| **Quadro**: Parte 1 só reescreve o `blocker`; Parte 2 move o card para `no_ar_nao_verificado` | Depois da Parte 2 o lojista acha, monta e publica a página pelo menu; falta o rastreio (PR 7) e a prova do §13 | Se o Igor preferir `em_construcao` até o 7, um `move_card` de volta |

## Global Constraints

- Abas na ordem do §8: **Links · Aparência · Perfil · Divulgar**; cada aba nova é `export function AbaX(p: PropsDaAba)` em `components/painel/link-da-bio/aba-<nome>.tsx` e entra no `ABAS` de `abas.tsx` com `dona`: Aparência `/^(modelo|paleta|cores|animar)(\.|$)/`, Perfil `/^(perfil|confere|feitoComGirumo)(\.|$)/`, Divulgar `slug` e `publicada`.
- Documento só por `mudarDocumento((d) => …)`; slug e "Página no ar" só por `mudarPagina({ slug })` / `mudarPagina({ publicada })`. A entrada da prévia só toca em "Rever a animação", troca de modelo e link novo (§8): só esses chamam `reverAnimacao()`.
- Miniatura (§8): `renderPaginaBio(dados, { modo: "previa", nonce: null, animarEntrada: false })` num `<iframe srcDoc sandbox="">` com `inert`, `tabIndex={-1}` e `aria-hidden`, com os dados da loja nesse modelo.
- Cores da marca (§3, §9): `{ fundo, botao }` em `#RRGGBB` maiúsculo; o contraste quem acerta é `coresDoModelo` (PR 2) — o painel não mexe nas cores.
- Mídia (§4): `uploadMediaFile(arquivo, "lp-media")` para foto (capa, fachada, fotos do botão), `"lp-logo"` para logo; upload direto pro Storage, **nunca** pela função de 4,5 MB. Aceita PNG, JPEG e WebP; limite 10 MB na foto, 5 MB na logo (`resolveUploadLimitBytes`). `fotos` do link: até 3.
- Perfil (§4): `nome` 1–60, `frase` 0–120 (contador), `destaques` até 3 de 1–40, `local` 0–90, `instagram` 0–30 `^[a-z0-9._]+$` sem `@`, `capaAlt` 0–140; `confere.razao` 0–120, `confere.cnpj` sem pontuação e em maiúsculas (12 `[0-9A-Z]` + 2 dígitos, o CNPJ com letras vale) com dígito verificador, `linhas` até 2 de 1–160. **Sem** o bloco "Avançado" (Pixel/GA4 é do PR 7).
- Divulgar (§2, §7, §8): endereço Girumo = `origemGirumo` + `/bio/<slug>` (nunca `useLinkOrigin` nem `window.location`); slug 3–40, `^[a-z0-9]+(-[a-z0-9]+)*$`, reservados (`slugReservado`); `GET /api/link-da-bio/slug?valor=` → `{ disponivel, motivo? }`; `GET /api/link-da-bio/relatorio?dias=7|30` → `RelatorioBio`. Trocar o slug avisa que o antigo passa a levar ao novo.
- Item no menu (§8): "Link da bio", ícone `Link2`, grupo `lotar` do "Mais", logo depois de Páginas; **não** entra na barra de cima nem na de baixo; vendedora não vê (sem `modulo`).
- Reuso: `Interruptor`, `useToast`, `ErroDeCarga`, `CropFocal` (`components/pages/editor/crop-focal.tsx`), `uploadMediaFile`, `authenticatedFetch`, `QRCodeCanvas` (como em `campanhas/qr-link.tsx`: gerado no navegador, PNG pelo `toDataURL`), `urlDaImagem`/`pontoDoFoco` (3a), `coresDoModelo` (PR 2), `focarDepois`, `dadosDaPrevia`, `enderecoPrincipal` e `mesmoConteudo` (6a). Classes de campo e botão como no 6a. **Nada de `components/ui`.**
- `npm run painel:check` (sem `rounded-2xl`/`3xl`, gradiente, blur, a palavra do estilo editorial em inglês, roxo, mais de 2 fundos Acid por arquivo; `pn-skeleton` com `role="status"`/`aria-hidden`) e `npm run brand:check` (a marca antiga não aparece em `src/components`, nem em comentário). Texto nunca abaixo de 13 px (o `CropFocal` reusado tem 12 px: fica como está); campo de digitar com `text-[16px]`.
- Nomes acessíveis são contrato com os testes: `Trocar foto da loja`/`Escolher foto da loja`, `Remover foto da loja`, `Trocar logo clara`/`Escolher logo clara`, `Remover logo clara` (idem `logo escura`), `Ajustar o foco` (`aria-expanded`), `Pronto`, `Destaque 1..3`, `Aviso 1..2`, os nomes dos modelos (`aria-pressed`), `Mostrar o bloco Antes de pagar, confere`, `Mostrar “Feito com Girumo” no rodapé`, `Escolher fotos`, `Remover a foto N`, `Escolher foto da fachada`/`Trocar foto da fachada`/`Remover foto da fachada`, `Animação de entrada`, `Rever a animação`, os nomes das paletas e `Cores da sua marca` (`aria-pressed`), `Página no ar`, `Copiar o endereço`, `Baixar o QR code`, `7 dias`/`30 dias` (`aria-pressed`), link do menu `Link da bio`. Ids: `idNaTela(caminho)` (`bio-perfil-nome`, `bio-confere-cnpj`, `bio-slug`, `bio-cores-fundo`…), `bio-aba-aviso`, `bio-link-fotos`, `bio-link-foto`, `bio-perfil-foco`, `bio-perfil-ajustar-foco`, `bio-slug-msg`.
- Dados fictícios em teste e exemplo (repo público): a loja fictícia de `src/test/bio-dados-falsos.ts` (PR 3a), `loja-exemplo`, `links.loja.com.br`. Nada da loja-piloto.
- Testes: `node:test` + `node:assert/strict`; em `apps/web`: `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`. Componente: `renderToStaticMarkup(createElement(...))`, sem JSX no teste. `import type` (nunca `import { type … }`) para tipo de módulo `server-only` (`painel-api.ts`, `bio-pages.ts`). No HTML do React 19.2 no servidor: `tabindex`, `disabled=""`, `inert=""` e `multiple=""` saem minúsculos/vazios; `srcDoc`, `inputMode` e `maxLength` como no JSX; o `value` do `<input>` vai por último — as asserções seguem isso.
- Gate antes do push: `infra/scripts/verify-local.ps1` (os dois `tsc`, lint, testes e build). PowerShell 5.1: sem `&&`. Commits em inglês com prefixo semântico.

## Review Focus

- **Digitar no Perfil (ou arrastar o seletor de cor) com a prévia aberta**: a prévia redesenha depois da pausa, não a cada letra; link novo e troca de modelo animam na hora. Coberto: os testes de `previa.test.ts` do 6a continuam verdes (a montagem desenha parada) e o roteiro das Tasks 7 e 13 — a espera é tempo de relógio, que o `renderToStaticMarkup` não roda.
- **Quem tem duas lojas sobe foto na segunda**: a foto vai para a loja aberta e o "Salvar" passa (antes da Task 1, 400 "mídia de outra loja"). Coberto: o roteiro da Task 7 (conta dona de duas lojas, no ambiente em que o roteiro rodar).
- **CNPJ colado com pontuação, digitado aos poucos, com letras (o CNPJ novo) ou com o dígito errado — inclusive com o bloco "confere" desligado**: máscara enquanto digita, aviso com 14 caracteres errados, e o erro do salvar aparece no campo, que fica na tela mesmo com o bloco desligado. Coberto: "CNPJ: o documento guarda 14 caracteres sem pontuação…" (Task 2), "CNPJ com máscara na tela; completo e errado avisa na hora…" e "erro do salvar no CNPJ com o bloco desligado…" (Task 4).
- **Endereço que outra loja pegou entre a conferência e o "Salvar"** (409 de slug): o editor troca para a Divulgar, a frase fica embaixo do campo, ligada por `aria-describedby`, e o foco vai nele. Coberto: "erro do salvar no endereço fica embaixo do campo…" (Task 11).
- **@ do Instagram colado como link do perfil, com `@` e maiúscula, ou maior que 30 antes da limpeza**: vira o @ certo. Coberto: "@ do Instagram: tira o @ e o endereço colado…" (Task 2) e o `maxLength="100"` no teste da aba (Task 4).

---

## Arquivos

| Arquivo | Parte | Responsabilidade |
|---|---|---|
| `apps/web/src/lib/media-upload-client.ts` (alterado) | 1 | `uploadMediaFile` com Bearer e `x-tenant-id` (loja aberta) |
| `apps/web/src/lib/bio/editor.ts` (alterado) | 1 | `idNaTela`, `lugarDoErro`, `erroNoCampo`; frases de `perfil.nome`, `perfil.instagram`, `confere.cnpj` |
| `apps/web/src/lib/bio/editor-perfil.ts` (+ `.test.ts`) | 1 | regras puras do Perfil e das fotos |
| `apps/web/src/components/painel/link-da-bio/erro-da-aba.tsx` | 1 | `useErroDaAba`, `AvisoDaAba` |
| `apps/web/src/components/painel/link-da-bio/campo-de-foto.tsx` (+ `.test.ts`) | 1 | `CampoDeFoto` (uma foto) e `CampoDeFotos` (até 3) |
| `apps/web/src/components/painel/link-da-bio/aba-perfil.tsx` (+ `.test.ts`) | 1 | aba Perfil |
| `apps/web/src/components/painel/link-da-bio/folha-de-link.tsx` (alterado, + teste alterado) | 1 | fotos do botão e foto da fachada |
| `apps/web/src/components/painel/link-da-bio/previa.tsx` (alterado; + teste alterado na 2) | 1 e 2 | espera de 300 ms; `miniatura` |
| `apps/web/src/components/painel/link-da-bio/abas.tsx` (alterado) | 1 e 2 | entradas `perfil`; `aparencia` e `divulgar` |
| `apps/web/src/lib/bio/editor.test.ts` (alterado) | 1 | testes das três funções novas |
| `apps/web/src/lib/bio/editor-aparencia.ts` (+ `.test.ts`) | 2 | paletas, cores da marca, troca de modelo |
| `apps/web/src/components/painel/link-da-bio/aba-aparencia.tsx` (+ `.test.ts`) | 2 | aba Aparência |
| `apps/web/src/lib/bio/editor-divulgar.ts` (+ `.test.ts`) | 2 | slug, textos do "no ar", relatório |
| `apps/web/src/components/painel/link-da-bio/numeros-da-pagina.tsx` | 2 | cartão "Últimos 7/30 dias" |
| `apps/web/src/components/painel/link-da-bio/aba-divulgar.tsx` (+ `.test.ts`) | 2 | aba Divulgar |
| `apps/web/src/components/painel/link-da-bio/aba-links.test.ts` e `editor.test.ts` (alterados) | 2 | o `slug` passa a ter aba dona |
| `apps/web/src/lib/painel-nav.ts` (+ `.test.ts` alterado) | 2 | item "Link da bio" |
| `apps/web/e2e/painel-vitrine-casca.spec.ts` (alterado) | 2 | o "Mais" lista "Link da bio" |

---

# Parte 1 — Perfil e fotos (`feat/link-da-bio-6b1-perfil`)

## Antes de tudo (Parte 1)

Na raiz do checkout principal (CLAUDE.md, "Regra de PR"):

```bash
git fetch origin main
git log origin/main --oneline -80 -i --grep "link-da-bio"
```

Expected: aparecem os merges das duas partes do 6a (e dos PRs 2, 3a, 4a e 5). Sem a Parte 2 do 6a, **parar** (este PR mexe em `previa.tsx`).

```bash
git worktree add -b feat/link-da-bio-6b1-perfil .claude/worktrees/bio-6b1 origin/main
```

No worktree novo: `node_modules` por junction (ver "Ambiente do worktree" no índice). Não há `.env` a copiar: o checkout principal não tem `apps/web/.env.local` (o da raiz só tem o `VERCEL_OIDC_TOKEN`), e a credencial do banco de dev só existe no CI, como `E2E_SUPABASE_*`. Os testes de unidade não precisam dela. Comandos de teste e de git abaixo rodam em `apps/web` do worktree novo (`git add` com caminhos relativos a `apps/web`).

Conferir os nomes que este plano consome (cada comando tem de achar todas as linhas):

```bash
git grep -n -E "export (type|const|function) (PropsDaAba|ABAS|AbaDoEditor|abaDoErro)\b" -- src/components/painel/link-da-bio/abas.tsx
git grep -n -E "export function (focarDepois|useEditorBio)\b" -- src/components/painel/link-da-bio/use-editor-bio.ts
git grep -n -E "export (const|function|type) (MENSAGENS_DOS_CAMPOS|mensagemDoCampo|mesmoConteudo|erroDoDocumento|ErroDeCampo|EstadoSalvavel|ContextoDoEditor|dadosDaPrevia)\b" -- src/lib/bio/editor.ts
git grep -n -E "export (type|function) (PropsDoConteudoDaFolha|ConteudoDaFolha|FolhaDeLink)\b" -- src/components/painel/link-da-bio/folha-de-link.tsx
git grep -n -E "export function QuadroDaPrevia\b" -- src/components/painel/link-da-bio/previa.tsx
git grep -n -E "export function (urlDaImagem|pontoDoFoco)\b" -- src/lib/bio/render/partes.ts
git grep -n -E "export (function|const) (documentoFalso|dadosFalsos|IDS)\b" -- src/test/bio-dados-falsos.ts
git grep -n -E "export (const|function|type) (documentoBio|documentoPadrao|DocumentoBio|MidiaRef)\b" -- src/lib/bio/documento.ts
```

Se um nome mudou no caminho, usar o de `main` e anotar no corpo do PR. Ler `previa.tsx`, `folha-de-link.tsx` e o fim de `editor.ts` como estão em `main`: os passos abaixo citam trechos do plano do 6a; se o texto mudou, aplicar a mesma mudança no texto de `main`.

Quadro ao começar (prod `nidoatbxaylrkcgbszns`; pelo `npx supabase db query --linked` ou pelo Igor quando o classificador recusar):

```sql
update public.board_features
   set blocker = 'PR 6b parte 1 (aba Perfil, fotos e upload na loja aberta) em construção; depois a parte 2 (Aparência, Divulgar e o item no menu).'
 where key = 'link-da-bio'
returning key, status, blocker;
```

### Task 1: Upload na loja que está aberta

**Files:**
- Modify: `apps/web/src/lib/media-upload-client.ts`

**Interfaces:**
- Consumes: `authenticatedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>` de `@/lib/supabase/client` (manda `Authorization: Bearer` quando há sessão e `x-tenant-id` da loja aberta).
- Produces: `uploadMediaFile(file: File, kind?: MediaKind): Promise<MediaUploadResult>` — mesma assinatura; o arquivo passa a cair na loja que está aberta.

Sem teste de unidade: a função fala com o Storage e com o cliente do Supabase do navegador, que o `node:test` não monta. A prova é a conferência da Task 7 (conta com duas lojas) e o Postar subindo foto como antes.

- [ ] **Step 1: Trocar o `fetch` das duas rotas pelo `authenticatedFetch`**

Trocar o import:

```ts
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
```

por:

```ts
import { authenticatedFetch, getSupabaseBrowserClient } from "@/lib/supabase/client";
```

Trocar `const prepareRes = await fetch("/api/media/prepare", {` por `const prepareRes = await authenticatedFetch("/api/media/prepare", {` e `const registerRes = await fetch("/api/media/register", {` por `const registerRes = await authenticatedFetch("/api/media/register", {`.

No comentário da função, logo depois da linha `` * `storage.objects`, que exclui a vendedora (spec 2026-10-07 §1, "RLS"). ``, acrescentar:

```ts
 *
 * As duas chamadas vão por `authenticatedFetch` (Bearer + `x-tenant-id`): quem
 * tem duas lojas sobe o arquivo na loja que está aberta. Com `fetch` puro o
 * servidor só via o cookie e caía na loja mais antiga — e o link da bio, que
 * confere se a foto é da loja no salvar, recusava (spec 2026-10-19 §4).
```

- [ ] **Step 2: Conferir**

Run: `git grep -n -E "await fetch\(" -- src/lib/media-upload-client.ts`
Expected: nenhuma linha.

Run: `npx tsc --noEmit --project tsconfig.json`
Expected: sem erro.

- [ ] **Step 3: Commit**

```bash
git add src/lib/media-upload-client.ts
git commit -m "fix(media): upload to the store that is open (Bearer + x-tenant-id)"
```

### Task 2: Regras do Perfil e do erro por aba

**Files:**
- Modify: `apps/web/src/lib/bio/editor.ts` (três entradas em `MENSAGENS_DOS_CAMPOS`; seção nova no fim)
- Create: `apps/web/src/lib/bio/editor-perfil.ts`
- Test: `apps/web/src/lib/bio/editor-perfil.test.ts`
- Test: `apps/web/src/lib/bio/editor.test.ts` (dois testes no fim)

**Interfaces:**
- Consumes: `documentoBio`, `mensagemDoCampo`, `type DocumentoBio` (já em `editor.ts`); `type MidiaRef` de `@/lib/bio/documento` (PR 2); `resolveUploadLimitBytes(kind: MediaKind, mime: string): number` de `@/lib/media-mime`; `type LpMediaRef` de `@/lib/pages/content`.
- Produces:
  - `editor.ts`: `idNaTela(campo: string): string`, `lugarDoErro(campo: string, lugares: readonly string[]): string | null`, `erroNoCampo(documento: DocumentoBio, campo: string): string | null`; frases `"perfil.nome"`, `"perfil.instagram"`, `"confere.cnpj"` em `MENSAGENS_DOS_CAMPOS`.
  - `editor-perfil.ts`: `FOTO_ACEITA: readonly ["image/png", "image/jpeg", "image/webp"]`, `type TipoDeFoto = "lp-media" | "lp-logo"`, `MAX_FOTOS_DO_LINK = 3`, `problemaDaImagem(arquivo: { type: string; size: number }, tipo: TipoDeFoto): string | null`, `cnpjDoCampo(valor: string): string`, `mascaraDoCnpj(cnpj: string): string`, `instagramDoCampo(valor: string): string`, `camposDaLista(lista: readonly string[], total: number): string[]`, `listaDosCampos(campos: readonly string[]): string[]`, `refDoCrop(m: MidiaRef): LpMediaRef`, `focoDoCrop(r: LpMediaRef): { x: number; y: number }`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/lib/bio/editor-perfil.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  camposDaLista,
  cnpjDoCampo,
  focoDoCrop,
  instagramDoCampo,
  listaDosCampos,
  mascaraDoCnpj,
  problemaDaImagem,
  refDoCrop,
} from "./editor-perfil";

test("foto: só PNG, JPEG e WebP; até 10 MB na foto e 5 MB na logo, antes de gastar o envio", () => {
  assert.equal(problemaDaImagem({ type: "image/jpeg", size: 3_000_000 }, "lp-media"), null);
  assert.equal(problemaDaImagem({ type: "image/webp", size: 4_900_000 }, "lp-logo"), null);
  assert.equal(problemaDaImagem({ type: "image/gif", size: 1000 }, "lp-media"), "Envie a foto em PNG, JPEG ou WebP.");
  assert.equal(problemaDaImagem({ type: "image/heic", size: 1000 }, "lp-media"), "Envie a foto em PNG, JPEG ou WebP.");
  assert.equal(problemaDaImagem({ type: "image/jpeg", size: 10_000_001 }, "lp-media"), "Foto grande demais: o limite é 10 MB.");
  assert.equal(problemaDaImagem({ type: "image/png", size: 5_000_001 }, "lp-logo"), "Foto grande demais: o limite é 5 MB.");
});

test("CNPJ: o documento guarda 14 caracteres sem pontuação, em maiúsculas; a tela mostra a máscara conforme digita", () => {
  assert.equal(cnpjDoCampo("11.222.333/0001-81"), "11222333000181");
  assert.equal(cnpjDoCampo("11222333000181999"), "11222333000181");
  // O CNPJ com letras (Receita, desde julho de 2026): 12 [0-9A-Z] + 2 dígitos.
  assert.equal(cnpjDoCampo("12.abc.345/01de-35"), "12ABC34501DE35");
  assert.equal(mascaraDoCnpj("12ABC34501DE35"), "12.ABC.345/01DE-35");
  const passos: Array<[string, string]> = [
    ["", ""],
    ["1", "1"],
    ["11", "11"],
    ["112", "11.2"],
    ["11222", "11.222"],
    ["112223", "11.222.3"],
    ["11222333", "11.222.333"],
    ["112223330", "11.222.333/0"],
    ["112223330001", "11.222.333/0001"],
    ["1122233300018", "11.222.333/0001-8"],
    ["11222333000181", "11.222.333/0001-81"],
  ];
  for (const [cnpj, tela] of passos) assert.equal(mascaraDoCnpj(cnpj), tela, cnpj);
  // Apagar logo depois de um separador não prende o separador na tela.
  assert.equal(mascaraDoCnpj(cnpjDoCampo("11.")), "11");
});

test("@ do Instagram: tira o @ e o endereço colado, minúsculo, até 30 depois da limpeza", () => {
  assert.equal(instagramDoCampo("@Loja.Exemplo"), "loja.exemplo");
  assert.equal(instagramDoCampo("  atelie_exemplo  "), "atelie_exemplo");
  assert.equal(instagramDoCampo("https://www.instagram.com/loja.exemplo/?hl=pt-br"), "loja.exemplo");
  assert.equal(instagramDoCampo("instagram.com/loja.exemplo"), "loja.exemplo");
  assert.equal(instagramDoCampo("https://www.instagram.com/atelie.exemplo.kids.revenda.br/"), "atelie.exemplo.kids.revenda.br");
  assert.equal(instagramDoCampo("a".repeat(40)), "a".repeat(30));
  // Caractere que não vale fica: o painel avisa, não apaga o que a lojista digitou.
  assert.equal(instagramDoCampo("loja exemplo"), "loja exemplo");
});

test("destaques e linhas: campos fixos na tela; o documento só guarda os que têm texto, na ordem", () => {
  assert.deepEqual(camposDaLista(["a partir de R$ 19,90"], 3), ["a partir de R$ 19,90", "", ""]);
  assert.deepEqual(camposDaLista(["a", "b", "c", "d"], 3), ["a", "b", "c"]);
  assert.deepEqual(listaDosCampos(["", "envio pro Brasil", "  "]), ["envio pro Brasil"]);
  // Espaço no fim é de quem ainda está digitando: fica.
  assert.deepEqual(listaDosCampos(["a partir ", ""]), ["a partir "]);
});

test("foco da capa: ida e volta do CropFocal, em 0..1 com duas casas", () => {
  assert.deepEqual(refDoCrop({ id: "capa-falsa", foco: null }), { media_id: "capa-falsa", alt: "" });
  assert.deepEqual(refDoCrop({ id: "capa-falsa", foco: { x: 0.5, y: 0.3 } }), {
    media_id: "capa-falsa",
    alt: "",
    focal_x: 0.5,
    focal_y: 0.3,
  });
  assert.deepEqual(focoDoCrop({ media_id: "capa-falsa", alt: "", focal_x: 0.37123, focal_y: 1.4 }), { x: 0.37, y: 1 });
  assert.deepEqual(focoDoCrop({ media_id: "capa-falsa", alt: "" }), { x: 0.5, y: 0.5 });
});
```

E no fim de `apps/web/src/lib/bio/editor.test.ts` (acrescentar `erroNoCampo`, `idNaTela` e `lugarDoErro` à lista importada de `"./editor"`):

```ts
test("id na tela e lugar do erro (abas do 6b): o caminho vira o id; o lugar é o mais longo que cobre o caminho", () => {
  assert.equal(idNaTela("perfil.nome"), "bio-perfil-nome");
  assert.equal(idNaTela("confere.linhas.1"), "bio-confere-linhas-1");
  assert.equal(idNaTela("slug"), "bio-slug");
  const lugares = ["perfil.capa", "perfil.capaAlt", "perfil.destaques", "confere", "confere.cnpj"];
  assert.equal(lugarDoErro("perfil.capa.id", lugares), "perfil.capa");
  assert.equal(lugarDoErro("perfil.capaAlt", lugares), "perfil.capaAlt");
  assert.equal(lugarDoErro("perfil.destaques.2", lugares), "perfil.destaques");
  assert.equal(lugarDoErro("confere.cnpj", lugares), "confere.cnpj");
  // Começo de palavra não conta; o caminho mais curto que o lugar também não.
  assert.equal(lugarDoErro("perfil.capaAltura", lugares), null);
  assert.equal(lugarDoErro("perfil", lugares), null);
  assert.equal(lugarDoErro("perfil.nome", []), null);
});

test("frases do Perfil e o erro de um campo só: nome vazio, @ com espaço e CNPJ que não fecha", () => {
  const base = documentoPadrao({ nome: "Loja Exemplo", campanhaId: null });
  const semNome: DocumentoBio = { ...base, perfil: { ...base.perfil, nome: "" } };
  assert.deepEqual(erroDoDocumento(semNome), { campo: "perfil.nome", mensagem: "Escreva o nome da loja." });
  const comEspaco: DocumentoBio = { ...base, perfil: { ...base.perfil, instagram: "loja exemplo" } };
  assert.deepEqual(erroDoDocumento(comEspaco), {
    campo: "perfil.instagram",
    mensagem: "No @ do Instagram só vão letras, números, ponto e _.",
  });
  const cnpjRuim: DocumentoBio = {
    ...base,
    confere: { ativo: true, razao: "Loja Exemplo Ltda", cnpj: "11222333000180", linhas: [] },
  };
  assert.deepEqual(erroDoDocumento(cnpjRuim), { campo: "confere.cnpj", mensagem: "Confira o CNPJ: os números não batem." });
  assert.equal(erroNoCampo(cnpjRuim, "confere.cnpj"), "Confira o CNPJ: os números não batem.");
  assert.equal(erroNoCampo({ ...cnpjRuim, confere: { ...cnpjRuim.confere, cnpj: "11222333000181" } }, "confere.cnpj"), null);
  // Erro em outro campo não acende este.
  assert.equal(erroNoCampo(semNome, "confere.cnpj"), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/editor-perfil.test.ts src/lib/bio/editor.test.ts`
Expected: FAIL — `Cannot find module './editor-perfil'` e, em `editor.test.ts`, `idNaTela` (e as outras duas) não exportadas.

- [ ] **Step 3: Write `editor-perfil.ts`**

```ts
// apps/web/src/lib/bio/editor-perfil.ts
import type { MidiaRef } from "@/lib/bio/documento";
import { resolveUploadLimitBytes } from "@/lib/media-mime";
import type { LpMediaRef } from "@/lib/pages/content";

/**
 * Regras puras da aba Perfil e das fotos do editor do link da bio (spec 2026-10-19 §4, §8).
 * Roda no navegador e nos testes: nada de fetch, React ou Supabase aqui.
 */

/** Tipos de foto aceitos: o `accept` do seletor e a conferência antes de enviar. */
export const FOTO_ACEITA = ["image/png", "image/jpeg", "image/webp"] as const;

/** `kind` do upload (§4): `lp-media` para foto, `lp-logo` para logo — os dois saem em /api/p/media. */
export type TipoDeFoto = "lp-media" | "lp-logo";

/** "`fotos` até 3 mídias" no link (§4). */
export const MAX_FOTOS_DO_LINK = 3;

/** Por que o arquivo não serve, antes de gastar o envio; null se serve. Quem decide de verdade é o servidor. */
export function problemaDaImagem(arquivo: { type: string; size: number }, tipo: TipoDeFoto): string | null {
  if (!(FOTO_ACEITA as readonly string[]).includes(arquivo.type)) return "Envie a foto em PNG, JPEG ou WebP.";
  const limite = resolveUploadLimitBytes(tipo, arquivo.type);
  return arquivo.size > limite ? `Foto grande demais: o limite é ${Math.round(limite / 1_000_000)} MB.` : null;
}

/**
 * O CNPJ que vai pro documento (§4): sem pontuação, em maiúsculas, no máximo 14. Letra fica:
 * desde julho de 2026 a Receita emite CNPJ com 12 caracteres `[0-9A-Z]` + 2 dígitos.
 */
export function cnpjDoCampo(valor: string): string {
  return valor.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 14);
}

/** A máscara da tela enquanto digita ("11.222.333/0001-81"): cada separador só aparece quando chega o caractere seguinte. */
export function mascaraDoCnpj(cnpj: string): string {
  return cnpjDoCampo(cnpj)
    .replace(/^([0-9A-Z]{2})([0-9A-Z])/, "$1.$2")
    .replace(/^([0-9A-Z]{2})\.([0-9A-Z]{3})([0-9A-Z])/, "$1.$2.$3")
    .replace(/\.([0-9A-Z]{3})([0-9A-Z])/, ".$1/$2")
    .replace(/([0-9A-Z]{4})([0-9A-Z])/, "$1-$2");
}

/**
 * O @ como a página guarda (§4: minúsculo, sem @). Tira o @ e o link do perfil colado
 * ("https://www.instagram.com/loja.exemplo/?hl=pt") e corta em 30 DEPOIS da limpeza — por
 * isso o campo aceita colar mais que 30. Caractere que não vale (espaço, hífen) fica: o
 * painel avisa (`erroNoCampo`) e o salvar recusa.
 */
export function instagramDoCampo(valor: string): string {
  return valor
    .trim()
    .toLowerCase()
    .replace(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/^@+/, "")
    .slice(0, 30);
}

/** Os campos fixos da tela (3 destaques, 2 linhas do "confere") a partir da lista do documento. */
export function camposDaLista(lista: readonly string[], total: number): string[] {
  return Array.from({ length: total }, (_, i) => lista[i] ?? "");
}

/** A lista que vai pro documento: só os campos com texto, na ordem (cada item precisa de pelo menos 1 letra, §4). */
export function listaDosCampos(campos: readonly string[]): string[] {
  return campos.filter((campo) => campo.trim() !== "");
}

/** A capa no formato que o `CropFocal` (editor de páginas) lê. */
export function refDoCrop(m: MidiaRef): LpMediaRef {
  return m.foco ? { media_id: m.id, alt: "", focal_x: m.foco.x, focal_y: m.foco.y } : { media_id: m.id, alt: "" };
}

/** O foco que o `CropFocal` devolve, em 0..1 com duas casas (a página usa porcentagem inteira). */
export function focoDoCrop(r: LpMediaRef): { x: number; y: number } {
  const duasCasas = (n: number | undefined) => Math.round(Math.min(1, Math.max(0, n ?? 0.5)) * 100) / 100;
  return { x: duasCasas(r.focal_x), y: duasCasas(r.focal_y) };
}
```

- [ ] **Step 4: Acrescentar ao `editor.ts`**

Em `MENSAGENS_DOS_CAMPOS`, logo depois da linha `"links.*.horario": "O horário vai até 120 letras.",`:

```ts
  "perfil.nome": "Escreva o nome da loja.",
  "perfil.instagram": "No @ do Instagram só vão letras, números, ponto e _.",
  "confere.cnpj": "Confira o CNPJ: os números não batem.",
```

E no fim do arquivo:

```ts
// ------------------------------------------------- erro nas abas do 6b (§8, §11)

/** Id do elemento que mostra um campo do documento: "perfil.nome" → "bio-perfil-nome"; "slug" → "bio-slug". */
export function idNaTela(campo: string): string {
  return `bio-${campo.replaceAll(".", "-")}`;
}

/**
 * O lugar da aba que mostra o erro: o mais longo da lista que é o caminho do erro ou o começo
 * dele ("perfil.capa" mostra "perfil.capa.id"); null quando a aba não tem lugar para ele.
 */
export function lugarDoErro(campo: string, lugares: readonly string[]): string | null {
  let achado: string | null = null;
  for (const lugar of lugares) {
    const cobre = campo === lugar || campo.startsWith(`${lugar}.`);
    if (cobre && (achado === null || lugar.length > achado.length)) achado = lugar;
  }
  return achado;
}

/**
 * A frase do erro do documento NESTE campo (caminho exato), ou null. É o mesmo `documentoBio`
 * do salvar: o painel avisa antes (o CNPJ com 14 dígitos errados, o @ com espaço).
 */
export function erroNoCampo(documento: DocumentoBio, campo: string): string | null {
  const r = documentoBio.safeParse(documento);
  if (r.success) return null;
  return r.error.issues.some((issue) => issue.path.map(String).join(".") === campo) ? mensagemDoCampo(campo) : null;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/editor-perfil.test.ts src/lib/bio/editor.test.ts`
Expected: PASS (5 testes novos + os do 6a + 2 novos). Se "frases do Perfil…" falhar no **caminho** (`campo`), o PR 2 guardou o erro noutro caminho (ex.: CNPJ em `confere`, por `superRefine` no objeto): anotar no PR, mandar o `path` do CNPJ para `["confere", "cnpj"]` no PR 2 (é o que o salvar e o foco usam) — nunca afrouxar a asserção. Se falhar só por o zod aceitar `"loja exemplo"`, o PR 2 não aplicou o `^[a-z0-9._]+$` do §4: defeito de lá.

- [ ] **Step 6: Commit**

```bash
git add src/lib/bio/editor-perfil.ts src/lib/bio/editor-perfil.test.ts src/lib/bio/editor.ts src/lib/bio/editor.test.ts
git commit -m "feat(link-da-bio): profile rules and per-tab error placement"
```

### Task 3: Campo de foto e o erro por aba

**Files:**
- Create: `apps/web/src/components/painel/link-da-bio/erro-da-aba.tsx`
- Create: `apps/web/src/components/painel/link-da-bio/campo-de-foto.tsx`
- Test: `apps/web/src/components/painel/link-da-bio/campo-de-foto.test.ts`

**Interfaces:**
- Consumes: Task 2 (`idNaTela`, `lugarDoErro`, `FOTO_ACEITA`, `MAX_FOTOS_DO_LINK`, `problemaDaImagem`, `TipoDeFoto`); `type ErroDeCampo` (6a, `@/lib/bio/editor`); `urlDaImagem(id: string, largura: number): string | null` e `pontoDoFoco(foco: MidiaRef["foco"]): { x: number; y: number } | null` de `@/lib/bio/render/partes` (PR 3a); `uploadMediaFile` (Task 1); `type MidiaRef` (PR 2).
- Produces:
  - `erro-da-aba.tsx`: `ID_DO_AVISO_DA_ABA = "bio-aba-aviso"`, `type ErroDaAba = { erroDe: (lugar: string) => string | undefined; erroSolto: string | null; corrigiu: (lugar: string) => void }`, `useErroDaAba(erro: ErroDeCampo | null, limparErro: () => void, lugares: readonly string[], versao: number): ErroDaAba`, `AvisoDaAba(p: { mensagem: string }): React.JSX.Element`.
  - `campo-de-foto.tsx`: `type FormatoDaFoto = "foto" | "logo-clara" | "logo-escura"`, `type PropsDoCampoDeFoto` (abaixo), `CampoDeFoto(p: PropsDoCampoDeFoto): React.JSX.Element`, `type PropsDoCampoDeFotos = { id: string; valor: readonly MidiaRef[]; aoMudar: (fotos: MidiaRef[]) => void }`, `CampoDeFotos(p: PropsDoCampoDeFotos): React.JSX.Element`.

O `useErroDaAba` não tem teste próprio: o efeito (foco, `limparErro`) não roda no `renderToStaticMarkup`; o estado inicial (o erro na tela) é coberto pelos testes das abas (Tasks 4, 9 e 11) e o foco pelo roteiro da Task 7.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/components/painel/link-da-bio/campo-de-foto.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CampoDeFoto, CampoDeFotos, type PropsDoCampoDeFoto } from "./campo-de-foto";

const noop = () => {};

function foto(over: Partial<PropsDoCampoDeFoto> = {}): string {
  const props: PropsDoCampoDeFoto = {
    id: "bio-perfil-capa",
    rotulo: "Foto da loja",
    nome: "foto da loja",
    tipo: "lp-media",
    formato: "foto",
    valor: null,
    aoMudar: noop,
    ...over,
  };
  return renderToStaticMarkup(createElement(CampoDeFoto, props));
}

test("sem foto: Escolher com o nome do campo; seletor de arquivo escondido, fora do Tab, só PNG, JPEG e WebP", () => {
  const h = foto();
  assert.match(h, /<button type="button" id="bio-perfil-capa" aria-label="Escolher foto da loja"[^>]*>[\s\S]*Escolher foto<\/button>/);
  assert.doesNotMatch(h, /Remover/);
  assert.match(h, /<input type="file" accept="image\/png,image\/jpeg,image\/webp" tabindex="-1" aria-hidden="true" class="sr-only"\/>/);
  assert.doesNotMatch(h, /<img /);
});

test("com foto: miniatura pelo otimizador no ponto de foco, Trocar e Remover", () => {
  const h = foto({ valor: { id: "capa-falsa", foco: { x: 0.5, y: 0.3 } } });
  assert.match(
    h,
    /<img src="\/_next\/image\?url=%2Fapi%2Fp%2Fmedia%2Fcapa-falsa&amp;w=128&amp;q=75" alt="" width="64" height="80" style="object-position:50% 30%"/,
  );
  assert.match(h, /aria-label="Trocar foto da loja"[^>]*>[\s\S]*Trocar foto<\/button>/);
  assert.match(h, /<button type="button" aria-label="Remover foto da loja"[^>]*>Remover<\/button>/);
});

test("logo clara em fundo escuro, logo escura em fundo claro; a logo vem pelo otimizador em 256", () => {
  const clara = foto({
    id: "bio-perfil-logoClara",
    rotulo: "Logo clara",
    nome: "logo clara",
    ajuda: "Pra fundo escuro",
    tipo: "lp-logo",
    formato: "logo-clara",
    valor: { id: "logo-clara-falsa", foco: null },
  });
  assert.match(clara, /class="[^"]*bg-volt-950[^"]*"><img src="\/_next\/image\?url=%2Fapi%2Fp%2Fmedia%2Flogo-clara-falsa&amp;w=256&amp;q=75"/);
  assert.match(clara, /id="bio-perfil-logoClara" aria-label="Trocar logo clara" aria-describedby="bio-perfil-logoClara-ajuda"/);
  const escura = foto({ formato: "logo-escura", tipo: "lp-logo", nome: "logo escura" });
  assert.match(escura, /class="[^"]*bg-canvas-100[^"]*"><svg/);
  assert.match(escura, /aria-label="Escolher logo escura"[^>]*>[\s\S]*Escolher logo<\/button>/);
});

test("erro do salvar: embaixo do campo, ligado ao botão e anunciado", () => {
  const h = foto({ valor: { id: "capa-falsa", foco: null }, erro: "Essa foto não é da loja. Envie de novo." });
  assert.match(h, /id="bio-perfil-capa" aria-label="Trocar foto da loja" aria-describedby="bio-perfil-capa-erro"/);
  assert.match(h, /<p id="bio-perfil-capa-erro" role="alert"[^>]*>Essa foto não é da loja\. Envie de novo\.<\/p>/);
});

test("fotos do botão: miniatura e Remover de cada uma; Escolher fotos (várias) só enquanto cabe", () => {
  const html = (n: number) =>
    renderToStaticMarkup(
      createElement(CampoDeFotos, {
        id: "bio-link-fotos",
        valor: Array.from({ length: n }, (_, i) => ({ id: `kit-${i + 1}-falso`, foco: null })),
        aoMudar: noop,
      }),
    );
  const duas = html(2);
  assert.match(duas, /<span id="bio-link-fotos-rotulo"[^>]*>Fotos no botão \(opcional, até 3\)<\/span>/);
  assert.match(duas, /<ul aria-labelledby="bio-link-fotos-rotulo"/);
  assert.equal(duas.match(/<img /g)?.length, 2);
  assert.match(duas, /src="\/_next\/image\?url=%2Fapi%2Fp%2Fmedia%2Fkit-1-falso&amp;w=128&amp;q=75"/);
  assert.match(duas, /aria-label="Remover a foto 2"/);
  assert.match(duas, /<button type="button" id="bio-link-fotos" aria-describedby="bio-link-fotos-ajuda"[^>]*>[\s\S]*Escolher fotos<\/button>/);
  assert.match(duas, /<input type="file" accept="image\/png,image\/jpeg,image\/webp" multiple="" tabindex="-1"/);
  assert.doesNotMatch(html(3), /Escolher fotos/);
  assert.doesNotMatch(html(0), /<ul /);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/link-da-bio/campo-de-foto.test.ts`
Expected: FAIL — `Cannot find module './campo-de-foto'`.

- [ ] **Step 3: Write `erro-da-aba.tsx`**

```tsx
// apps/web/src/components/painel/link-da-bio/erro-da-aba.tsx
"use client";

import { useCallback, useEffect, useState } from "react";

import { idNaTela, lugarDoErro, type ErroDeCampo } from "@/lib/bio/editor";

/** Id do aviso no topo da aba: o erro do salvar que não tem campo nela. Só uma aba fica na tela. */
export const ID_DO_AVISO_DA_ABA = "bio-aba-aviso";

export type ErroDaAba = {
  /** A frase do erro, se ele é deste lugar ("perfil.nome", "confere.cnpj", "slug"). */
  erroDe: (lugar: string) => string | undefined;
  /** O erro desta aba que não tem lugar nela: vai no aviso do topo. */
  erroSolto: string | null;
  /** A lojista mexeu no lugar: o erro dele some (§8, "erro aparece embaixo do campo e some ao corrigir"). */
  corrigiu: (lugar: string) => void;
};

type ErroGuardado = { lugar: string | null; mensagem: string };

function guardar(erro: ErroDeCampo, lugares: readonly string[]): ErroGuardado {
  return { lugar: lugarDoErro(erro.campo, lugares), mensagem: erro.mensagem };
}

/**
 * O erro do salvar que é desta aba (`PropsDaAba.erro`, contrato do 6a): a aba guarda, mostra
 * embaixo do campo (ou no topo, sem campo nela), leva o foco até ele (§8: "salvar com erro →
 * primeiro campo com erro") e devolve o erro ao editor (`limparErro`). Salvar dá certo
 * (`versao` sobe): o que estava na aba some. `lugares` tem de ser constante do módulo.
 */
export function useErroDaAba(
  erro: ErroDeCampo | null,
  limparErro: () => void,
  lugares: readonly string[],
  versao: number,
): ErroDaAba {
  // Começa já com o erro: a aba monta com ele quando o editor troca para ela.
  const [guardado, setGuardado] = useState<ErroGuardado | null>(() => (erro ? guardar(erro, lugares) : null));
  const [versaoVista, setVersaoVista] = useState(versao);
  if (versao !== versaoVista) {
    setVersaoVista(versao);
    setGuardado(null);
  }

  useEffect(() => {
    if (!erro) return;
    const novo = guardar(erro, lugares);
    setGuardado(novo);
    // O próprio campo, senão o lugar (o grupo dos destaques), senão o aviso do topo.
    const ids = novo.lugar ? [idNaTela(erro.campo), idNaTela(novo.lugar)] : [ID_DO_AVISO_DA_ABA];
    requestAnimationFrame(() => {
      for (const id of ids) {
        const alvo = document.getElementById(id);
        if (alvo) {
          alvo.focus();
          return;
        }
      }
    });
    limparErro();
  }, [erro, limparErro, lugares]);

  const corrigiu = useCallback((lugar: string) => setGuardado((g) => (g?.lugar === lugar ? null : g)), []);

  return {
    erroDe: (lugar) => (guardado && guardado.lugar === lugar ? guardado.mensagem : undefined),
    erroSolto: guardado && guardado.lugar === null ? guardado.mensagem : null,
    corrigiu,
  };
}

/** O aviso do topo da aba (erro sem campo nela); recebe o foco por programa. */
export function AvisoDaAba({ mensagem }: { mensagem: string }) {
  return (
    <p id={ID_DO_AVISO_DA_ABA} role="alert" tabIndex={-1} className="pn-aviso rounded-[var(--radius-control)]">
      {mensagem}
    </p>
  );
}
```

- [ ] **Step 4: Write `campo-de-foto.tsx`**

```tsx
// apps/web/src/components/painel/link-da-bio/campo-de-foto.tsx
"use client";

/* eslint-disable @next/next/no-img-element */
import { useRef, useState, type ReactNode } from "react";
import { ImagePlus } from "lucide-react";

import type { MidiaRef } from "@/lib/bio/documento";
import { FOTO_ACEITA, MAX_FOTOS_DO_LINK, problemaDaImagem, type TipoDeFoto } from "@/lib/bio/editor-perfil";
import { pontoDoFoco, urlDaImagem } from "@/lib/bio/render/partes";
import { uploadMediaFile } from "@/lib/media-upload-client";
import { cn } from "@/lib/utils";

/**
 * Campos de foto do editor do link da bio (spec 2026-10-19 §4): a capa e as logos (Perfil), a
 * foto da fachada e as fotos do botão (folha de link). O arquivo sobe direto pro Storage
 * (`uploadMediaFile`), nunca pela função da Vercel (limite de 4,5 MB), com o `kind` que a
 * página pública lê: `lp-media` para foto, `lp-logo` para logo. A miniatura vem pelo
 * otimizador (`urlDaImagem`): foto de 10 MB não desce inteira no 4G.
 */

const ACEITA = FOTO_ACEITA.join(",");
const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";
const ROTULO = "text-15 font-semibold text-volt-950";
const AJUDA = "text-13 text-slate-600";
const ERRO = "text-13 font-medium text-danger-700";
const SECUNDARIO = `inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-line-200 bg-paper-0 px-4 text-15 font-semibold text-volt-950 transition-colors hover:border-slate-600 disabled:cursor-wait disabled:opacity-60 ${FOCO}`;
const FANTASMA = `inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg px-3 text-15 font-semibold text-slate-600 transition-colors hover:text-volt-950 ${FOCO}`;
const PERIGO = `inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg px-1 text-13 font-semibold text-danger-700 hover:bg-canvas-100 ${FOCO}`;

function srcDaMiniatura(id: string, largura: number): string {
  return urlDaImagem(id, largura) ?? "";
}

function mensagemDoEnvio(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Não deu pra enviar a foto. Tente de novo.";
}

/** Confere e sobe uma foto. Volta sem foco (§4: só a capa tem foco, ajustado depois). */
async function enviarFoto(arquivo: File, tipo: TipoDeFoto): Promise<MidiaRef> {
  const problema = problemaDaImagem(arquivo, tipo);
  if (problema) throw new Error(problema);
  const { id } = await uploadMediaFile(arquivo, tipo);
  return { id, foco: null };
}

export type FormatoDaFoto = "foto" | "logo-clara" | "logo-escura";

function Miniatura({ valor, formato }: { valor: MidiaRef | null; formato: FormatoDaFoto }) {
  if (formato === "foto") {
    if (!valor) {
      return (
        <span
          aria-hidden="true"
          className="grid h-20 w-16 flex-none place-items-center rounded-lg border border-dashed border-line-200 bg-canvas-100 text-slate-600"
        >
          <ImagePlus className="h-5 w-5" />
        </span>
      );
    }
    const ponto = pontoDoFoco(valor.foco);
    return (
      <img
        src={srcDaMiniatura(valor.id, 128)}
        alt=""
        width={64}
        height={80}
        style={ponto ? { objectPosition: `${ponto.x}% ${ponto.y}%` } : undefined}
        className="h-20 w-16 flex-none rounded-lg bg-canvas-100 object-cover"
      />
    );
  }
  // Logo clara vai em fundo escuro, logo escura em fundo claro: é assim que a página escolhe (§3).
  const escuro = formato === "logo-clara";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid h-14 w-[120px] flex-none place-items-center rounded-lg p-2",
        escuro ? "bg-volt-950 text-paper-0" : "border border-line-200 bg-canvas-100 text-slate-600",
      )}
    >
      {valor ? (
        <img src={srcDaMiniatura(valor.id, 256)} alt="" className="max-h-full max-w-full object-contain" />
      ) : (
        <ImagePlus className="h-5 w-5" />
      )}
    </span>
  );
}

export type PropsDoCampoDeFoto = {
  /** Id do botão de escolher: o foco do erro do salvar chega nele. */
  id: string;
  /** Rótulo visível ("Foto da loja"). */
  rotulo: string;
  /** Nome lido no botão ("foto da loja" → "Trocar foto da loja"). */
  nome: string;
  ajuda?: string;
  tipo: TipoDeFoto;
  formato: FormatoDaFoto;
  valor: MidiaRef | null;
  aoMudar: (foto: MidiaRef | null) => void;
  /** Erro do salvar neste campo (ex.: foto que não é da loja). */
  erro?: string;
  /** Botões a mais na linha (o "Ajustar o foco" da capa). */
  acoes?: ReactNode;
};

/** Uma foto (capa, logo, fachada): miniatura, Escolher/Trocar e Remover. */
export function CampoDeFoto({ id, rotulo, nome, ajuda, tipo, formato, valor, aoMudar, erro, acoes }: PropsDoCampoDeFoto) {
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const mensagem = falha ?? erro;
  const verbo = valor ? "Trocar" : "Escolher";
  const coisa = formato === "foto" ? "foto" : "logo";
  const descricoes = [mensagem ? `${id}-erro` : null, ajuda ? `${id}-ajuda` : null].filter(Boolean).join(" ") || undefined;

  async function enviar(arquivo: File) {
    setFalha(null);
    setEnviando(true);
    try {
      aoMudar(await enviarFoto(arquivo, tipo));
    } catch (e) {
      setFalha(mensagemDoEnvio(e));
    } finally {
      setEnviando(false);
      if (entrada.current) entrada.current.value = ""; // mandar o mesmo arquivo de novo dispara o change
    }
  }

  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-3">
        <Miniatura valor={valor} formato={formato} />
        <div className="grid min-w-0 gap-1.5">
          <span className={ROTULO}>{rotulo}</span>
          {ajuda && (
            <span id={`${id}-ajuda`} className={AJUDA}>
              {ajuda}
            </span>
          )}
          <span className="flex flex-wrap gap-2">
            <button
              type="button"
              id={id}
              onClick={() => entrada.current?.click()}
              disabled={enviando}
              aria-label={enviando ? undefined : `${verbo} ${nome}`}
              aria-describedby={descricoes}
              className={SECUNDARIO}
            >
              <ImagePlus className="h-4 w-4" aria-hidden="true" />
              {enviando ? "Enviando…" : `${verbo} ${coisa}`}
            </button>
            {valor && !enviando && (
              <button type="button" aria-label={`Remover ${nome}`} onClick={() => aoMudar(null)} className={FANTASMA}>
                Remover
              </button>
            )}
            {acoes}
          </span>
        </div>
      </div>
      {mensagem && (
        <p id={`${id}-erro`} role="alert" className={ERRO}>
          {mensagem}
        </p>
      )}
      <input
        ref={entrada}
        type="file"
        accept={ACEITA}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          if (arquivo) void enviar(arquivo);
        }}
      />
    </div>
  );
}

export type PropsDoCampoDeFotos = { id: string; valor: readonly MidiaRef[]; aoMudar: (fotos: MidiaRef[]) => void };

/** As fotos do botão (`link.fotos`, até 3, §4): miniatura com Remover e "Escolher fotos" (várias de uma vez). */
export function CampoDeFotos({ id, valor, aoMudar }: PropsDoCampoDeFotos) {
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const cabem = MAX_FOTOS_DO_LINK - valor.length;

  async function enviar(arquivos: File[]) {
    setFalha(null);
    setEnviando(true);
    let lista = [...valor];
    try {
      for (const arquivo of arquivos.slice(0, cabem)) {
        lista = [...lista, await enviarFoto(arquivo, "lp-media")];
        aoMudar(lista);
      }
      if (arquivos.length > cabem) setFalha(`Cabem ${MAX_FOTOS_DO_LINK} fotos no botão: as outras ficaram de fora.`);
    } catch (e) {
      setFalha(mensagemDoEnvio(e));
    } finally {
      setEnviando(false);
      if (entrada.current) entrada.current.value = "";
    }
  }

  return (
    <div className="grid gap-1.5">
      <span id={`${id}-rotulo`} className={ROTULO}>
        Fotos no botão (opcional, até 3)
      </span>
      <div className="flex flex-wrap items-start gap-2">
        {valor.length > 0 && (
          <ul aria-labelledby={`${id}-rotulo`} className="flex gap-2">
            {valor.map((foto, i) => (
              <li key={`${foto.id}-${i}`} className="grid w-14 justify-items-center gap-0.5">
                <img
                  src={srcDaMiniatura(foto.id, 128)}
                  alt=""
                  width={48}
                  height={56}
                  className="h-14 w-12 rounded-lg bg-canvas-100 object-cover"
                />
                <button
                  type="button"
                  aria-label={`Remover a foto ${i + 1}`}
                  onClick={() => aoMudar(valor.filter((_, j) => j !== i))}
                  className={PERIGO}
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
        )}
        {cabem > 0 && (
          <button
            type="button"
            id={id}
            aria-describedby={`${id}-ajuda`}
            onClick={() => entrada.current?.click()}
            disabled={enviando}
            className={SECUNDARIO}
          >
            <ImagePlus className="h-4 w-4" aria-hidden="true" />
            {enviando ? "Enviando…" : "Escolher fotos"}
          </button>
        )}
      </div>
      <span id={`${id}-ajuda`} className={AJUDA}>
        Com fotos, o botão mostra as capas no lugar do ícone.
      </span>
      {falha && (
        <p role="alert" className={ERRO}>
          {falha}
        </p>
      )}
      <input
        ref={entrada}
        type="file"
        accept={ACEITA}
        multiple
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(e) => {
          const arquivos = Array.from(e.target.files ?? []);
          if (arquivos.length > 0) void enviar(arquivos);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/link-da-bio/campo-de-foto.test.ts`
Expected: PASS (5 testes). Se uma asserção de atributo falhar só pela ORDEM em que o React serializou, ajustar a ordem das props no JSX à testada — nunca afrouxar a asserção com `[^>]*` dos dois lados do mesmo atributo.

- [ ] **Step 6: Lint**

Run: `npm run painel:check` e `npx eslint src/components/painel/link-da-bio/erro-da-aba.tsx src/components/painel/link-da-bio/campo-de-foto.tsx`
Expected: `painel:check OK`; eslint sem erro nem aviso.

- [ ] **Step 7: Commit**

```bash
git add src/components/painel/link-da-bio/erro-da-aba.tsx src/components/painel/link-da-bio/campo-de-foto.tsx src/components/painel/link-da-bio/campo-de-foto.test.ts
git commit -m "feat(link-da-bio): photo fields and per-tab save-error hook"
```

### Task 4: Aba Perfil

**Files:**
- Create: `apps/web/src/components/painel/link-da-bio/aba-perfil.tsx`
- Modify: `apps/web/src/components/painel/link-da-bio/abas.tsx` (import e entrada `perfil`)
- Test: `apps/web/src/components/painel/link-da-bio/aba-perfil.test.ts`

**Interfaces:**
- Consumes: Task 2 (`erroNoCampo`, `cnpjDoCampo`, `mascaraDoCnpj`, `instagramDoCampo`, `camposDaLista`, `listaDosCampos`, `refDoCrop`, `focoDoCrop`); Task 3 (`useErroDaAba`, `AvisoDaAba`, `type ErroDaAba`, `CampoDeFoto`); 6a (`type PropsDaAba`, `ABAS`, `abaDoErro`, `mesmoConteudo`, `focarDepois`, `estadoDe` e `type ContextoDoEditor` nos testes); `CropFocal({ media: LpMediaRef; onChange: (ref: LpMediaRef) => void; disabled?: boolean })` de `@/components/pages/editor/crop-focal`; `Interruptor({ ligado, aoMudar(ligado: boolean), rotulo, desabilitado? })`; `documentoFalso()` e `IDS` de `@/test/bio-dados-falsos` (PR 3a).
- Produces: `AbaPerfil(p: PropsDaAba): React.JSX.Element`; entrada `{ id: "perfil", nome: "Perfil", dona: (campo) => /^(perfil|confere|feitoComGirumo)(\.|$)/.test(campo), Conteudo: AbaPerfil }` em `ABAS`, logo depois de Links.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/components/painel/link-da-bio/aba-perfil.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { DocumentoBio } from "@/lib/bio/documento";
import { estadoDe, type ContextoDoEditor, type ErroDeCampo } from "@/lib/bio/editor";
import type { PaginaBio } from "@/lib/stores/bio-pages";
import { documentoFalso, IDS } from "@/test/bio-dados-falsos";

import { AbaPerfil } from "./aba-perfil";
import { ABAS, abaDoErro, type PropsDaAba } from "./abas";

const noop = () => {};
// A loja fictícia do PR 3a: nada da loja-piloto (repo público).
const DOC = documentoFalso();
const PAGINA: PaginaBio = {
  id: IDS.pagina,
  tenantId: "tenant-exemplo",
  slug: "atelie-exemplo",
  publicada: false,
  bloqueadaEm: null,
  documento: DOC,
  versao: 3,
  updatedAt: "2026-10-19T12:00:00.000Z",
};
const CONTEXTO: ContextoDoEditor = {
  campanhas: [],
  dominio: null,
  origemGirumo: "https://www.girumo.com.br",
  sugestaoSlug: "atelie-exemplo",
  linksEscondidos: [],
};

function html(documento: DocumentoBio = DOC, erro: ErroDeCampo | null = null): string {
  const props: PropsDaAba = {
    pagina: PAGINA,
    rascunho: { ...estadoDe(PAGINA), documento },
    contexto: CONTEXTO,
    mudarDocumento: noop,
    mudarPagina: noop,
    reverAnimacao: noop,
    erro,
    limparErro: noop,
  };
  return renderToStaticMarkup(createElement(AbaPerfil, props));
}

test("Foto e logo: a capa com Trocar, Remover e Ajustar o foco fechado; a descrição; as duas logos", () => {
  const h = html();
  assert.match(h, /<h2 id="bio-fotos-titulo"[^>]*>Foto e logo<\/h2>/);
  assert.match(h, /aria-label="Trocar foto da loja"/);
  assert.match(h, /aria-label="Remover foto da loja"/);
  assert.match(
    h,
    /<button type="button" id="bio-perfil-ajustar-foco" aria-expanded="false" aria-controls="bio-perfil-foco"[^>]*>[\s\S]*Ajustar o foco<\/button>/,
  );
  assert.doesNotMatch(h, /role="application"/);
  assert.match(h, /<input type="text" id="bio-perfil-capaAlt"[^>]*value="Fachada da loja de exemplo"/);
  assert.match(h, /aria-label="Trocar logo clara"/);
  assert.match(h, /aria-label="Trocar logo escura"/);
  const semCapa = html({ ...DOC, perfil: { ...DOC.perfil, capa: null } });
  assert.match(semCapa, /aria-label="Escolher foto da loja"/);
  assert.doesNotMatch(semCapa, /Ajustar o foco/);
});

test("Nome e textos: nome, frase com contador, 3 destaques num grupo nomeado, onde fica e o @ fora do valor", () => {
  const h = html();
  assert.match(h, /<label for="bio-perfil-nome"[^>]*>Nome da loja<\/label>/);
  assert.match(h, /id="bio-perfil-nome"[^>]*value="Ateliê Exemplo Kids"/);
  assert.match(h, new RegExp(`id="bio-perfil-frase-conta"[^>]*>${DOC.perfil.frase.length}/120<`));
  assert.match(h, /<div role="group" id="bio-perfil-destaques" tabindex="-1" aria-labelledby="bio-perfil-destaques-rotulo"/);
  assert.match(h, /id="bio-perfil-destaques-0" aria-label="Destaque 1"[^>]*value="a partir de R\$ 19,90 a peça"/);
  assert.match(h, /id="bio-perfil-destaques-2" aria-label="Destaque 3"[^>]*value="envio pro Brasil inteiro"/);
  assert.match(h, /id="bio-perfil-local"[^>]*value="Loja na Rua Exemplo, 100, Centro, Cidade Exemplo"/);
  assert.match(h, />@<\/span><input type="text"[^>]*id="bio-perfil-instagram"[^>]*maxLength="100"[^>]*value="atelie\.exemplo"/);
  // Um destaque só: os outros campos ficam vazios, prontos pra digitar.
  const um = html({ ...DOC, perfil: { ...DOC.perfil, destaques: ["12 kits no catálogo"] } });
  assert.match(um, /id="bio-perfil-destaques-1" aria-label="Destaque 2"[^>]*value=""/);
});

test("CNPJ com máscara na tela; completo e errado avisa na hora; pela metade não", () => {
  const h = html();
  assert.match(h, /role="switch" aria-checked="true" aria-label="Mostrar o bloco Antes de pagar, confere"/);
  assert.match(h, /id="bio-confere-razao"[^>]*value="Ateliê Exemplo Comércio de Roupas Ltda"/);
  assert.match(h, /id="bio-confere-cnpj"[^>]*value="11\.222\.333\/0001-81"/);
  assert.match(h, /id="bio-confere-linhas-1" aria-label="Aviso 2"/);
  assert.doesNotMatch(h, /Confira o CNPJ/);
  const errado = html({ ...DOC, confere: { ...DOC.confere, cnpj: "11222333000180" } });
  assert.match(errado, /id="bio-confere-cnpj"[^>]*aria-invalid="true" aria-describedby="bio-confere-cnpj-erro bio-confere-cnpj-ajuda"/);
  assert.match(errado, /<p id="bio-confere-cnpj-erro"[^>]*>Confira o CNPJ: os números não batem\.<\/p>/);
  const metade = html({ ...DOC, confere: { ...DOC.confere, cnpj: "1122233" } });
  assert.match(metade, /id="bio-confere-cnpj"[^>]*value="11\.222\.33"/);
  assert.doesNotMatch(metade, /Confira o CNPJ/);
});

test("erro do salvar no CNPJ com o bloco desligado: a frase embaixo do campo, que continua na tela", () => {
  const desligado: DocumentoBio = { ...DOC, confere: { ...DOC.confere, ativo: false } };
  const h = html(desligado, { campo: "confere.cnpj", mensagem: "Esse CNPJ não fecha." });
  assert.match(h, /role="switch" aria-checked="false" aria-label="Mostrar o bloco Antes de pagar, confere"/);
  assert.match(h, /id="bio-confere-cnpj"[^>]*aria-invalid="true"/);
  assert.match(h, /<p id="bio-confere-cnpj-erro"[^>]*>Esse CNPJ não fecha\.<\/p>/);
  assert.doesNotMatch(h, /id="bio-aba-aviso"/);
});

test("erro do salvar: o do nome embaixo do nome; o de um destaque embaixo do grupo; o sem lugar no aviso do topo", () => {
  const nome = html(DOC, { campo: "perfil.nome", mensagem: "Escreva o nome da loja." });
  assert.match(nome, /id="bio-perfil-nome"[^>]*aria-invalid="true" aria-describedby="bio-perfil-nome-erro"/);
  assert.match(nome, /<p id="bio-perfil-nome-erro"[^>]*>Escreva o nome da loja\.<\/p>/);
  const destaque = html(DOC, { campo: "perfil.destaques.1", mensagem: "Cada destaque vai até 40 letras." });
  assert.match(destaque, /aria-describedby="bio-perfil-destaques-erro"/);
  assert.match(destaque, /<p id="bio-perfil-destaques-erro"[^>]*>Cada destaque vai até 40 letras\.<\/p>/);
  const solto = html(DOC, { campo: "perfil", mensagem: "Confira o perfil." });
  assert.match(solto, /<p id="bio-aba-aviso" role="alert" tabindex="-1"[^>]*>Confira o perfil\.<\/p>/);
});

test("selo e Romaneio: interruptor do Feito com Girumo; o Romaneio avisa que não usa a foto", () => {
  assert.match(html(), /role="switch" aria-checked="true" aria-label="Mostrar “Feito com Girumo” no rodapé"/);
  assert.doesNotMatch(html(), /não usa a foto/);
  assert.match(html({ ...DOC, modelo: "romaneio", paleta: "kraft" }), /O modelo Romaneio não usa a foto/);
});

test("registro: Perfil depois de Links; os erros de perfil, confere e selo vão pra ela", () => {
  const ids = ABAS.map((a) => a.id);
  assert.ok(ids.indexOf("perfil") > ids.indexOf("links"), String(ids));
  assert.equal(abaDoErro({ campo: "perfil.destaques.2", mensagem: "x" })?.id, "perfil");
  assert.equal(abaDoErro({ campo: "confere.cnpj", mensagem: "x" })?.id, "perfil");
  assert.equal(abaDoErro({ campo: "feitoComGirumo", mensagem: "x" })?.id, "perfil");
  assert.equal(abaDoErro({ campo: "perfilado", mensagem: "x" }), undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/link-da-bio/aba-perfil.test.ts`
Expected: FAIL — `Cannot find module './aba-perfil'`.

- [ ] **Step 3: Write `aba-perfil.tsx`**

```tsx
// apps/web/src/components/painel/link-da-bio/aba-perfil.tsx
"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Crosshair } from "lucide-react";

import { CropFocal } from "@/components/pages/editor/crop-focal";
import { Interruptor } from "@/components/painel/instagram/interruptor";
import type { DocumentoBio } from "@/lib/bio/documento";
import { erroNoCampo, mesmoConteudo } from "@/lib/bio/editor";
import {
  camposDaLista,
  cnpjDoCampo,
  focoDoCrop,
  instagramDoCampo,
  listaDosCampos,
  mascaraDoCnpj,
  refDoCrop,
} from "@/lib/bio/editor-perfil";
import { cn } from "@/lib/utils";

import type { PropsDaAba } from "./abas";
import { CampoDeFoto } from "./campo-de-foto";
import { AvisoDaAba, useErroDaAba, type ErroDaAba } from "./erro-da-aba";
import { focarDepois } from "./use-editor-bio";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";
const CAMPO =
  "min-h-11 w-full rounded-lg border border-line-200 bg-paper-0 px-3 py-2.5 text-[16px] leading-snug text-volt-950 aria-invalid:border-danger-700 focus-visible:outline-2 focus-visible:outline-cobalt-500";
const ROTULO = "text-15 font-semibold text-volt-950";
const AJUDA = "text-13 text-slate-600";
const ERRO = "text-13 font-medium text-danger-700";
const SECUNDARIO = `inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-line-200 bg-paper-0 px-4 text-15 font-semibold text-volt-950 transition-colors hover:border-slate-600 ${FOCO}`;
const CARTAO = "pn-card grid gap-4 rounded-xl p-4 lg:p-5";
const TITULO = "font-brand text-15 font-bold text-volt-950";

/** Os campos da aba que mostram erro do salvar (`lugarDoErro`); o resto vai pro aviso do topo. */
const LUGARES_DO_PERFIL: readonly string[] = [
  "perfil.capa",
  "perfil.capaAlt",
  "perfil.logoClara",
  "perfil.logoEscura",
  "perfil.nome",
  "perfil.frase",
  "perfil.destaques",
  "perfil.local",
  "perfil.instagram",
  "confere.razao",
  "confere.cnpj",
  "confere.linhas",
];

const comPerfil =
  (mudanca: Partial<DocumentoBio["perfil"]>) =>
  (d: DocumentoBio): DocumentoBio => ({ ...d, perfil: { ...d.perfil, ...mudanca } });
const comConfere =
  (mudanca: Partial<DocumentoBio["confere"]>) =>
  (d: DocumentoBio): DocumentoBio => ({ ...d, confere: { ...d.confere, ...mudanca } });

type ExtraDoCampo = Pick<InputHTMLAttributes<HTMLInputElement>, "autoComplete" | "autoCapitalize" | "spellCheck" | "placeholder">;

type PropsDoCampo = {
  id: string;
  /** Rótulo visível; sem ele, `nome` vira o `aria-label` (destaques e avisos, num grupo nomeado). */
  rotulo?: string;
  nome?: string;
  valor: string;
  aoMudar: (valor: string) => void;
  maxLength: number;
  erro?: string | null;
  ajuda?: string;
  contador?: boolean;
  /** Texto fixo antes do campo ("@"), fora do valor. */
  prefixo?: string;
  extra?: ExtraDoCampo;
};

function Campo({ id, rotulo, nome, valor, aoMudar, maxLength, erro, ajuda, contador = false, prefixo, extra }: PropsDoCampo) {
  const descricoes =
    [erro ? `${id}-erro` : null, ajuda ? `${id}-ajuda` : null, contador ? `${id}-conta` : null].filter(Boolean).join(" ") ||
    undefined;
  const entrada = (
    <input
      type="text"
      {...extra}
      id={id}
      aria-label={rotulo ? undefined : nome}
      value={valor}
      maxLength={maxLength}
      aria-invalid={erro ? true : undefined}
      aria-describedby={descricoes}
      onChange={(e) => aoMudar(e.target.value)}
      className={cn(CAMPO, prefixo && "pl-7")}
    />
  );
  return (
    <div className="grid gap-1.5">
      {rotulo && (
        <label htmlFor={id} className={ROTULO}>
          {rotulo}
        </label>
      )}
      {prefixo ? (
        <div className="relative">
          <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-slate-600">
            {prefixo}
          </span>
          {entrada}
        </div>
      ) : (
        entrada
      )}
      {erro && (
        <p id={`${id}-erro`} className={ERRO}>
          {erro}
        </p>
      )}
      {(ajuda || contador) && (
        <div className="flex items-start gap-3">
          {ajuda && (
            <p id={`${id}-ajuda`} className={cn(AJUDA, "min-w-0 flex-1")}>
              {ajuda}
            </p>
          )}
          {contador && (
            <span id={`${id}-conta`} className={cn(AJUDA, "ml-auto font-data")}>
              {`${valor.length}/${maxLength}`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Campos fixos (3 destaques, 2 avisos) por cima da lista do documento: o texto não pula de caixa
 * enquanto se digita, e o documento só recebe os que têm texto (§4: cada item com pelo menos 1 letra).
 */
function useCamposDaLista(lista: readonly string[], total: number): [string[], (i: number, valor: string) => string[]] {
  const [campos, setCampos] = useState(() => camposDaLista(lista, total));
  // A lista mudou por fora (Descartar, Recarregar): os campos voltam a ela. As duas pontas
  // normalizadas: um item só de espaço não faz a tela reescrever os campos sem parar.
  if (!mesmoConteudo(listaDosCampos(campos), listaDosCampos(lista))) setCampos(camposDaLista(lista, total));
  function mudar(i: number, valor: string): string[] {
    const novos = campos.map((campo, j) => (j === i ? valor : campo));
    setCampos(novos);
    return listaDosCampos(novos);
  }
  return [campos, mudar];
}

type PropsDoCartao = { documento: DocumentoBio; mudarDocumento: PropsDaAba["mudarDocumento"]; erros: ErroDaAba };

function CartaoFotos({ documento, mudarDocumento, erros }: PropsDoCartao) {
  const [ajustando, setAjustando] = useState(false);
  const p = documento.perfil;
  const capa = p.capa;
  return (
    <section aria-labelledby="bio-fotos-titulo" className={CARTAO}>
      <h2 id="bio-fotos-titulo" className={TITULO}>
        Foto e logo
      </h2>
      {documento.modelo === "romaneio" && (
        <p className={AJUDA}>O modelo Romaneio não usa a foto: ela volta se você trocar de modelo.</p>
      )}
      <CampoDeFoto
        id="bio-perfil-capa"
        rotulo="Foto da loja"
        nome="foto da loja"
        ajuda="A foto do topo da página: a fachada, a arara, a equipe."
        tipo="lp-media"
        formato="foto"
        valor={capa}
        erro={erros.erroDe("perfil.capa")}
        aoMudar={(nova) => {
          erros.corrigiu("perfil.capa");
          setAjustando(false);
          mudarDocumento(comPerfil({ capa: nova }));
        }}
        acoes={
          capa && (
            <button
              type="button"
              id="bio-perfil-ajustar-foco"
              aria-expanded={ajustando}
              aria-controls="bio-perfil-foco"
              onClick={() => setAjustando((a) => !a)}
              className={SECUNDARIO}
            >
              <Crosshair className="h-4 w-4" aria-hidden="true" />
              Ajustar o foco
            </button>
          )
        }
      />
      {ajustando && capa && (
        <div id="bio-perfil-foco" className="grid gap-2">
          <CropFocal
            media={refDoCrop(capa)}
            onChange={(r) => mudarDocumento(comPerfil({ capa: { id: capa.id, foco: focoDoCrop(r) } }))}
          />
          <button
            type="button"
            onClick={() => {
              setAjustando(false);
              focarDepois("bio-perfil-ajustar-foco");
            }}
            className={cn(SECUNDARIO, "w-fit")}
          >
            Pronto
          </button>
        </div>
      )}
      <Campo
        id="bio-perfil-capaAlt"
        rotulo="Descrição da foto (opcional)"
        valor={p.capaAlt}
        maxLength={140}
        erro={erros.erroDe("perfil.capaAlt")}
        ajuda="Pra quem usa leitor de tela. Ex.: Fachada da loja com as araras na calçada."
        aoMudar={(capaAlt) => {
          erros.corrigiu("perfil.capaAlt");
          mudarDocumento(comPerfil({ capaAlt }));
        }}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoDeFoto
          id="bio-perfil-logoClara"
          rotulo="Logo clara"
          nome="logo clara"
          ajuda="Pra fundo escuro"
          tipo="lp-logo"
          formato="logo-clara"
          valor={p.logoClara}
          erro={erros.erroDe("perfil.logoClara")}
          aoMudar={(logoClara) => {
            erros.corrigiu("perfil.logoClara");
            mudarDocumento(comPerfil({ logoClara }));
          }}
        />
        <CampoDeFoto
          id="bio-perfil-logoEscura"
          rotulo="Logo escura"
          nome="logo escura"
          ajuda="Pra fundo claro"
          tipo="lp-logo"
          formato="logo-escura"
          valor={p.logoEscura}
          erro={erros.erroDe("perfil.logoEscura")}
          aoMudar={(logoEscura) => {
            erros.corrigiu("perfil.logoEscura");
            mudarDocumento(comPerfil({ logoEscura }));
          }}
        />
      </div>
      <p className={AJUDA}>Com uma logo só, a página usa ela numa plaquinha quando o fundo não combina.</p>
    </section>
  );
}

function CartaoTextos({ documento, mudarDocumento, erros }: PropsDoCartao) {
  const p = documento.perfil;
  const [destaques, mudarDestaque] = useCamposDaLista(p.destaques, 3);
  const erroDosDestaques = erros.erroDe("perfil.destaques");
  return (
    <section aria-labelledby="bio-textos-titulo" className={CARTAO}>
      <h2 id="bio-textos-titulo" className={TITULO}>
        Nome e textos
      </h2>
      <Campo
        id="bio-perfil-nome"
        rotulo="Nome da loja"
        valor={p.nome}
        maxLength={60}
        erro={erros.erroDe("perfil.nome")}
        aoMudar={(nome) => {
          erros.corrigiu("perfil.nome");
          mudarDocumento(comPerfil({ nome }));
        }}
      />
      <Campo
        id="bio-perfil-frase"
        rotulo="Frase (opcional)"
        valor={p.frase}
        maxLength={120}
        contador
        erro={erros.erroDe("perfil.frase")}
        ajuda="O que a loja vende, numa linha."
        aoMudar={(frase) => {
          erros.corrigiu("perfil.frase");
          mudarDocumento(comPerfil({ frase }));
        }}
      />
      <div className="grid gap-1.5">
        <span id="bio-perfil-destaques-rotulo" className={ROTULO}>
          Destaques (opcional, até 3)
        </span>
        <div
          role="group"
          id="bio-perfil-destaques"
          tabIndex={-1}
          aria-labelledby="bio-perfil-destaques-rotulo"
          aria-describedby={erroDosDestaques ? "bio-perfil-destaques-erro" : "bio-perfil-destaques-ajuda"}
          className="grid gap-2"
        >
          {destaques.map((valor, i) => (
            <Campo
              key={i}
              id={`bio-perfil-destaques-${i}`}
              nome={`Destaque ${i + 1}`}
              valor={valor}
              maxLength={40}
              aoMudar={(v) => {
                erros.corrigiu("perfil.destaques");
                mudarDocumento(comPerfil({ destaques: mudarDestaque(i, v) }));
              }}
            />
          ))}
        </div>
        {erroDosDestaques && (
          <p id="bio-perfil-destaques-erro" className={ERRO}>
            {erroDosDestaques}
          </p>
        )}
        <p id="bio-perfil-destaques-ajuda" className={AJUDA}>
          Frases curtas embaixo do nome. Ex.: 12 kits no catálogo
        </p>
      </div>
      <Campo
        id="bio-perfil-local"
        rotulo="Onde fica (opcional)"
        valor={p.local}
        maxLength={90}
        erro={erros.erroDe("perfil.local")}
        aoMudar={(local) => {
          erros.corrigiu("perfil.local");
          mudarDocumento(comPerfil({ local }));
        }}
      />
      {/* Letra que não vale no @ aparece na hora; o tamanho o próprio campo segura. */}
      <Campo
        id="bio-perfil-instagram"
        rotulo="@ do Instagram (opcional)"
        prefixo="@"
        valor={p.instagram}
        maxLength={100}
        extra={{ autoComplete: "off", autoCapitalize: "none", spellCheck: false, placeholder: "sualoja" }}
        erro={erros.erroDe("perfil.instagram") ?? erroNoCampo(documento, "perfil.instagram")}
        ajuda="Pode colar o link do perfil: fica só o @."
        aoMudar={(v) => {
          erros.corrigiu("perfil.instagram");
          mudarDocumento(comPerfil({ instagram: instagramDoCampo(v) }));
        }}
      />
    </section>
  );
}

function CartaoConfere({ documento, mudarDocumento, erros }: PropsDoCartao) {
  const c = documento.confere;
  const [linhas, mudarLinha] = useCamposDaLista(c.linhas, 2);
  // Com os 14 caracteres o zod já sabe se o dígito fecha; antes disso, digitar não acende erro.
  const erroDoCnpj = erros.erroDe("confere.cnpj") ?? (c.cnpj.length === 14 ? erroNoCampo(documento, "confere.cnpj") : null);
  const erroDasLinhas = erros.erroDe("confere.linhas");
  return (
    <section aria-labelledby="bio-confere-titulo" className={CARTAO}>
      <div className="flex items-center gap-3">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h2 id="bio-confere-titulo" className={TITULO}>
            Antes de pagar, confere
          </h2>
          <p className={AJUDA}>Mostra em nome de quem cai o Pix, com o CNPJ pra copiar. Ajuda a cliente a fugir de perfil falso.</p>
        </div>
        <Interruptor
          ligado={c.ativo}
          aoMudar={(ativo) => mudarDocumento(comConfere({ ativo }))}
          rotulo="Mostrar o bloco Antes de pagar, confere"
        />
      </div>
      {/* Os campos ficam na tela com o bloco desligado: o erro do salvar sempre tem onde aparecer. */}
      <Campo
        id="bio-confere-razao"
        rotulo="Razão social (opcional)"
        valor={c.razao}
        maxLength={120}
        erro={erros.erroDe("confere.razao")}
        ajuda="O nome que aparece pra quem paga no Pix."
        aoMudar={(razao) => {
          erros.corrigiu("confere.razao");
          mudarDocumento(comConfere({ razao }));
        }}
      />
      <Campo
        id="bio-confere-cnpj"
        rotulo="CNPJ (opcional)"
        valor={mascaraDoCnpj(c.cnpj)}
        maxLength={18}
        extra={{ autoComplete: "off", autoCapitalize: "characters", spellCheck: false, placeholder: "00.000.000/0000-00" }}
        erro={erroDoCnpj}
        ajuda="Com ou sem pontuação. Vale o CNPJ novo, com letras."
        aoMudar={(v) => {
          erros.corrigiu("confere.cnpj");
          mudarDocumento(comConfere({ cnpj: cnpjDoCampo(v) }));
        }}
      />
      <div className="grid gap-1.5">
        <span id="bio-confere-linhas-rotulo" className={ROTULO}>
          Outros avisos (opcional, até 2)
        </span>
        <div
          role="group"
          id="bio-confere-linhas"
          tabIndex={-1}
          aria-labelledby="bio-confere-linhas-rotulo"
          aria-describedby={erroDasLinhas ? "bio-confere-linhas-erro" : "bio-confere-linhas-ajuda"}
          className="grid gap-2"
        >
          {linhas.map((valor, i) => (
            <Campo
              key={i}
              id={`bio-confere-linhas-${i}`}
              nome={`Aviso ${i + 1}`}
              valor={valor}
              maxLength={160}
              aoMudar={(v) => {
                erros.corrigiu("confere.linhas");
                mudarDocumento(comConfere({ linhas: mudarLinha(i, v) }));
              }}
            />
          ))}
        </div>
        {erroDasLinhas && (
          <p id="bio-confere-linhas-erro" className={ERRO}>
            {erroDasLinhas}
          </p>
        )}
        <p id="bio-confere-linhas-ajuda" className={AJUDA}>
          Ex.: A gente só envia depois do Pix confirmado.
        </p>
      </div>
    </section>
  );
}

function CartaoSelo({ documento, mudarDocumento }: PropsDoCartao) {
  return (
    <section aria-labelledby="bio-selo-titulo" className={CARTAO}>
      <div className="flex items-center gap-3">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h2 id="bio-selo-titulo" className={TITULO}>
            Selo no rodapé
          </h2>
          <p className={AJUDA}>Um “Feito com Girumo” pequeno, no fim da página.</p>
        </div>
        <Interruptor
          ligado={documento.feitoComGirumo}
          aoMudar={(feitoComGirumo) => mudarDocumento((d) => ({ ...d, feitoComGirumo }))}
          rotulo="Mostrar “Feito com Girumo” no rodapé"
        />
      </div>
    </section>
  );
}

/**
 * Aba Perfil (spec §8): foto e logos, nome e textos, "Antes de pagar, confere" e o selo. O
 * "Avançado" (Pixel da Meta e GA4) é do PR 7: entra depois do `CartaoSelo`, e os lugares dele
 * (`LUGARES_DO_AVANCADO`) vão no fim do `LUGARES_DO_PERFIL` — o erro `rastreio.*` passa pelo
 * mesmo `useErroDaAba` da aba, sem filtro.
 */
export function AbaPerfil({ pagina, rascunho, mudarDocumento, erro, limparErro }: PropsDaAba) {
  const erros = useErroDaAba(erro, limparErro, LUGARES_DO_PERFIL, pagina.versao);
  const cartao: PropsDoCartao = { documento: rascunho.documento, mudarDocumento, erros };
  return (
    <div className="grid gap-4">
      {erros.erroSolto && <AvisoDaAba mensagem={erros.erroSolto} />}
      <CartaoFotos {...cartao} />
      <CartaoTextos {...cartao} />
      <CartaoConfere {...cartao} />
      <CartaoSelo {...cartao} />
    </div>
  );
}
```

- [ ] **Step 4: Registrar a aba** — em `abas.tsx`, logo depois de `import { AbaLinks } from "./aba-links";`:

```tsx
import { AbaPerfil } from "./aba-perfil";
```

e trocar o `ABAS` por:

```tsx
/** As abas do editor, na ordem da tela (§8: Links · Aparência · Perfil · Divulgar). */
export const ABAS: readonly AbaDoEditor[] = [
  { id: "links", nome: "Links", dona: (campo) => campo === "links" || campo.startsWith("links."), Conteudo: AbaLinks },
  // Sem `rastreio`: o PR 7 acrescenta junto com os campos do "Avançado" (sem eles, o erro cai no aviso da tela).
  { id: "perfil", nome: "Perfil", dona: (campo) => /^(perfil|confere|feitoComGirumo)(\.|$)/.test(campo), Conteudo: AbaPerfil },
];
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/link-da-bio/aba-perfil.test.ts src/components/painel/link-da-bio/aba-links.test.ts src/components/painel/link-da-bio/editor.test.ts`
Expected: PASS (7 novos; os do 6a continuam verdes — o `slug` ainda não tem aba dona nesta parte). Se "CNPJ com máscara…" falhar só no aviso do CNPJ errado, conferir antes o teste "frases do Perfil…" da Task 2 (o caminho do zod).

- [ ] **Step 6: Lint**

Run: `npm run painel:check` · `npm run brand:check` · `npx eslint src/components/painel/link-da-bio`
Expected: `painel:check OK`, `brand:check` verde, eslint sem erro nem aviso.

- [ ] **Step 7: Commit**

```bash
git add src/components/painel/link-da-bio/aba-perfil.tsx src/components/painel/link-da-bio/aba-perfil.test.ts src/components/painel/link-da-bio/abas.tsx
git commit -m "feat(link-da-bio): profile tab (photo, logos, texts, confere block, badge)"
```

### Task 5: Fotos na folha de link

**Files:**
- Modify: `apps/web/src/components/painel/link-da-bio/folha-de-link.tsx`
- Test: `apps/web/src/components/painel/link-da-bio/folha-de-link.test.ts` (o `html()` ganha dois campos; dois testes novos no fim)

**Interfaces:**
- Consumes: Task 3 (`CampoDeFoto`, `CampoDeFotos`); 6a (`ConteudoDaFolha`, `FolhaDeLink`, `PropsDoConteudoDaFolha`); `type MidiaRef` (PR 2).
- Produces: `PropsDoConteudoDaFolha` ganha `aoFotos: (fotos: MidiaRef[]) => void` e `aoFoto: (foto: MidiaRef | null) => void`. `FolhaDeLink` não muda de props.

- [ ] **Step 1: Write the failing tests** — em `folha-de-link.test.ts`, no objeto `props` do `html()`, logo depois de `aoDestaque: noop,`:

```ts
    aoFotos: noop,
    aoFoto: noop,
```

e no fim do arquivo:

```ts
test("Catálogo ou site: fotos do botão com miniatura e Remover; Escolher fotos enquanto cabe", () => {
  const h = html({ rascunho: { ...SITE, fotos: [{ id: "kit-1-falso", foco: null }] }, novo: false });
  assert.match(h, />Fotos no botão \(opcional, até 3\)</);
  assert.match(h, /aria-label="Remover a foto 1"/);
  assert.match(h, /id="bio-link-fotos"[^>]*>[\s\S]*Escolher fotos<\/button>/);
  assert.doesNotMatch(html({ rascunho: linkDoAtalho("whatsapp", { id: ID, campanhas: CAMPANHAS }) }), /Fotos no botão|Foto da fachada/);
});

test("Como chegar: foto da fachada opcional, com Escolher", () => {
  const h = html({ rascunho: linkDoAtalho("endereco", { id: ID, campanhas: [] }) });
  assert.match(h, />Foto da fachada \(opcional\)</);
  assert.match(h, /id="bio-link-foto" aria-label="Escolher foto da fachada" aria-describedby="bio-link-foto-ajuda"/);
  assert.doesNotMatch(h, /Fotos no botão/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/link-da-bio/folha-de-link.test.ts`
Expected: FAIL — os dois testes novos (o texto "Fotos no botão" e o `bio-link-foto` não aparecem); os 8 do 6a passam.

- [ ] **Step 3: Implement** — em `folha-de-link.tsx`:

Trocar `import type { Icone, LinkBio } from "@/lib/bio/documento";` por:

```tsx
import type { Icone, LinkBio, MidiaRef } from "@/lib/bio/documento";
```

e, logo depois de `import { IconeDoLink, QuadradoDoIcone } from "./icone-do-link";`:

```tsx
import { CampoDeFoto, CampoDeFotos } from "./campo-de-foto";
```

Em `PropsDoConteudoDaFolha`, logo depois de `aoDestaque: () => void;`:

```tsx
  /** Fotos do botão (`link`, até 3) e da fachada (`endereco`): 6b. */
  aoFotos: (fotos: MidiaRef[]) => void;
  aoFoto: (foto: MidiaRef | null) => void;
```

No `Formulario`, trocar `<SeletorDeIcone atual={r.icone} aoIcone={p.aoIcone} />` por:

```tsx
          <SeletorDeIcone atual={r.icone} aoIcone={p.aoIcone} />
          <CampoDeFotos id="bio-link-fotos" valor={r.fotos} aoMudar={p.aoFotos} />
```

e, no bloco do `endereco`, logo antes de `<p className={AJUDA}>Na página, o botão abre ali mesmo com o endereço, o horário e o botão do Google Maps.</p>`:

```tsx
          <CampoDeFoto
            id="bio-link-foto"
            rotulo="Foto da fachada (opcional)"
            nome="foto da fachada"
            ajuda="Aparece quando a pessoa abre o Como chegar."
            tipo="lp-media"
            formato="foto"
            valor={r.foto}
            aoMudar={p.aoFoto}
          />
```

Em `FolhaDeLink`, logo depois da função `mudar`:

```tsx
  // Foto trocada: o erro geral (foto de outra loja, §4) some junto (§8, "some ao corrigir").
  function mudarFoto(mudanca: (r: LinkBio) => LinkBio) {
    setRascunho((r) => (r ? mudanca(r) : r));
    setErros((atual) => {
      const resto = { ...atual };
      delete resto.geral;
      return resto;
    });
  }
```

e, no `<ConteudoDaFolha …>`, logo depois da prop `aoDestaque={…}`:

```tsx
        aoFotos={(fotos) => mudarFoto((r) => (r.tipo === "link" ? { ...r, fotos } : r))}
        aoFoto={(foto) => mudarFoto((r) => (r.tipo === "endereco" ? { ...r, foto } : r))}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/link-da-bio/folha-de-link.test.ts src/components/painel/link-da-bio/campo-de-foto.test.ts`
Expected: PASS (10 + 5).

- [ ] **Step 5: Typecheck e commit**

Run: `npx tsc --noEmit --project tsconfig.json` e `npm run painel:check`
Expected: sem erro; `painel:check OK`.

```bash
git add src/components/painel/link-da-bio/folha-de-link.tsx src/components/painel/link-da-bio/folha-de-link.test.ts
git commit -m "feat(link-da-bio): button photos and storefront photo in the link sheet"
```

### Task 6: A prévia espera a digitação

**Files:**
- Modify: `apps/web/src/components/painel/link-da-bio/previa.tsx` (`QuadroDaPrevia`)

**Interfaces:**
- Consumes: 6a (`QuadroDaPrevia`, `renderPaginaBio`).
- Produces: `QuadroDaPrevia(p: { dados: DadosRender; rodada: number; className?: string }): React.JSX.Element` — mesma assinatura; desenha os `dados` de 300 ms atrás, e a rodada na hora.

Sem teste novo: a espera é tempo de relógio, que o `renderToStaticMarkup` não roda (o efeito não executa no servidor). Os testes do 6a seguem provando o que importa no primeiro desenho (montar parado, HTML do modo prévia); o roteiro da Task 7 confere a espera.

- [ ] **Step 1: Implement** — em `previa.tsx`, trocar `import { useMemo, useState } from "react";` por `import { useEffect, useMemo, useState } from "react";`; logo depois da linha `const SECUNDARIO = …`, acrescentar:

```tsx
/** Quanto a prévia espera a última mudança antes de redesenhar: digitar não recarrega o iframe a cada letra. */
const ESPERA_DA_PREVIA_MS = 300;
```

e trocar o corpo de `QuadroDaPrevia` (do `// Guarda o documento da última rodada…` até o `const html = useMemo(…)`) por:

```tsx
  // Guarda o documento da última rodada: é com ele, e só com ele, que a entrada toca
  // (padrão do React de guardar a prop anterior no estado).
  const [rodadaVista, setRodadaVista] = useState(rodada);
  const [documentoDaRodada, setDocumentoDaRodada] = useState<DocumentoBio | null>(null);
  // O que o iframe mostra: os `dados` da última mudança depois de 300 ms parados.
  const [mostrados, setMostrados] = useState(dados);
  if (rodada !== rodadaVista) {
    setRodadaVista(rodada);
    setDocumentoDaRodada(dados.documento);
    setMostrados(dados); // a rodada passa na hora: é ela que toca a entrada
  }
  useEffect(() => {
    if (mostrados === dados) return;
    const espera = setTimeout(() => setMostrados(dados), ESPERA_DA_PREVIA_MS);
    return () => clearTimeout(espera);
  }, [dados, mostrados]);
  const animarEntrada = mostrados.documento.animar && mostrados.documento === documentoDaRodada;
  const html = useMemo(
    () => renderPaginaBio(mostrados, { modo: "previa", nonce: null, animarEntrada }),
    [mostrados, animarEntrada],
  );
```

No comentário da função, logo depois da frase que termina em `redesenha parado.`, acrescentar: `Essas mudanças esperam 300 ms paradas (o CropFocal e o seletor de cor mandam uma por movimento).`

- [ ] **Step 2: Run tests to verify they still pass**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/link-da-bio/previa.test.ts src/components/painel/link-da-bio/editor.test.ts`
Expected: PASS (os 4 + 10 do 6a).

- [ ] **Step 3: Typecheck e lint**

Run: `npx tsc --noEmit --project tsconfig.json` · `npx eslint src/components/painel/link-da-bio/previa.tsx`
Expected: sem erro nem aviso (nenhum `react-hooks/exhaustive-deps`).

- [ ] **Step 4: Commit**

```bash
git add src/components/painel/link-da-bio/previa.tsx
git commit -m "feat(link-da-bio): preview waits 300 ms after the last change"
```

### Task 7: Gate, conferência, PR e quadro (Parte 1)

**Files:** nenhum novo.

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces: PR da Parte 1 mergeado; `blocker` do card reescrito.

- [ ] **Step 1: Gate local** — em `apps/web`: `npm test` (verde, com os 21 testes novos: 7 da Task 2, 5 da 3, 7 da 4 e 2 da 5). Depois, em PowerShell, na raiz do worktree:

```
Set-Location <caminho do worktree bio-6b1>; & .\infra\scripts\verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
```

Expected: `EXIT=0`.

- [ ] **Step 2: Onde o roteiro roda** — a credencial do banco de dev só existe no CI (`E2E_SUPABASE_*`). Com essas variáveis no ambiente da máquina, subir o dev local a partir do `apps/web` deste worktree apontado pro dev (o `preview_start` serve o checkout principal: usar Playwright) e rodar o roteiro abaixo antes do PR. Sem elas — o normal —, o que valida antes do merge é o CI (testes, build e o smoke `/painel/link-da-bio renderiza` do e2e), e o roteiro abaixo roda **em produção depois do merge** (Step 5), numa loja de teste, com o Igor logado no painel do navegador. Achado no roteiro vira PR de correção na mesma sessão.

  Roteiro, em `/painel/link-da-bio` (pela URL: o menu só ganha o item na Parte 2):
  - aba Perfil: "Escolher foto da loja" com um JPEG de teste (nunca foto da loja-piloto) → miniatura; "Ajustar o foco" → arrastar e usar as setas → a prévia (1280) acompanha depois da pausa; "Pronto" → o foco volta ao botão; GIF → "Envie a foto em PNG, JPEG ou WebP."; logo clara e escura;
  - digitar a frase com a prévia aberta (1280) → a prévia redesenha quando para de digitar, sem piscar a cada letra; o contador acompanha;
  - colar `11.222.333/0001-81` no CNPJ → fica com máscara; trocar o último dígito → "Confira o CNPJ: os números não batem."; colar `https://www.instagram.com/loja.exemplo/` no @ → `loja.exemplo`;
  - apagar o nome, ir para a aba Links e tocar "Salvar" → a tela vai para Perfil, a frase aparece embaixo do nome e o foco cai nele; digitar → a frase some;
  - **duas lojas**: com uma conta dona de duas lojas de teste, abrir a segunda (seletor de loja), subir uma foto e salvar → "Salvo…" (antes da Task 1 dava 400 de foto de outra loja); conferir na tabela `uploads` (SQL no banco do ambiente, pelo `npx supabase db query --linked` ou pelo Igor) que a linha da foto tem o `tenant_id` da segunda loja;
  - aba Links: "Catálogo ou site" → "Escolher fotos" com 4 arquivos → entram 3 e o aviso das outras; "Remover a foto 2"; "Como chegar" → foto da fachada; aplicar e salvar → a prévia mostra as capas no botão e a fachada no `<details>`;
  - Postar (Disparos) → anexar uma imagem e um vídeo curto: sobem como antes (o `uploadMediaFile` mudou para todo o painel);
  - 390: Tab do começo ao fim da aba Perfil, com a barra de salvar aberta: nenhum campo focado fica atrás das barras fixas.

- [ ] **Step 3: PR** — `git fetch origin main` e `git log HEAD..origin/main --oneline` (atrasada → `git merge origin/main` antes do push); push com `-u`; `gh pr create` com o título "feat(link-da-bio): aba Perfil, fotos e upload na loja aberta (PR 6b, parte 1)" e o corpo com: o que entra (aba Perfil, campo de foto, fotos na folha, prévia que espera 300 ms, `uploadMediaFile` com Bearer + `x-tenant-id`), as decisões (erro por aba com `useErroDaAba`, CNPJ com letras, campos fixos de destaque, `rastreio` fora da dona do Perfil até o PR 7), prints em 1280 e 390 e o plano de teste; terminar com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 4: CI e merge** — `gh pr checks <N> --watch`; verde → `gh pr merge <N> --squash --delete-branch` (a `main` não tem proteção: merge à mão no verde). Vermelho no e2e só por `processing`/timeout de rede → rerun, nunca afrouxar o smoke.

- [ ] **Step 5: Prova depois do deploy** — em produção, numa loja de teste, pela URL: o roteiro do Step 2 inteiro, se ele não rodou antes do PR; senão, ao menos Perfil com foto nova, CNPJ e salvar, e a prévia mostrando a foto (a página continua fora do ar). Print no PR. Nenhuma página da loja-piloto muda sem o OK do Igor.

- [ ] **Step 6: Quadro** — o card continua `em_construcao`; o Igor roda em prod:

```sql
update public.board_features
   set blocker = 'Editor com Links e Perfil em /painel/link-da-bio (sem item no menu) desde o PR #<N>. Falta: Aparência, Divulgar e o item no menu (6b parte 2), rastreio (7).'
 where key = 'link-da-bio'
returning key, status, blocker;
```

---

# Parte 2 — Aparência, Divulgar e o item no menu (`feat/link-da-bio-6b2-aparencia-divulgar`)

## Antes de tudo (Parte 2)

Na raiz do checkout principal:

```bash
git fetch origin main
git log origin/main --oneline -60 -i --grep "link-da-bio"
git worktree add -b feat/link-da-bio-6b2-aparencia-divulgar .claude/worktrees/bio-6b2 origin/main
```

Expected: o merge da Parte 1 e o do PR 3b aparecem; sem algum dos dois, **parar** (as miniaturas desenham os quatro modelos). No worktree novo: `node_modules` por junction e sem `.env` a copiar, como na Parte 1. Comandos em `apps/web` do worktree.

```bash
git grep -n -E "export (const|function) (MODELOS|PALETAS|SLUG_BIO|slugReservado)\b" -- src/lib/bio/documento.ts
git grep -n -E "export function coresDoModelo\b" -- src/lib/bio/cores.ts
git grep -n -E "export type (RespostaDoSlug|MotivoDoSlug)\b" -- src/lib/bio/painel-api.ts
git grep -n -E "export type RelatorioBio\b" -- src/lib/stores/bio-pages.ts
git ls-files src/app/api/link-da-bio/slug/route.ts src/app/api/link-da-bio/relatorio/route.ts
git grep -n -E "vitrine|romaneio|classico" -- src/lib/bio/render/index.ts
```

Expected: todas as linhas existem (a última prova que o 3b ligou os três modelos no `renderPaginaBio`).

Quadro ao começar (prod):

```sql
update public.board_features
   set blocker = 'PR 6b parte 2 (Aparência, Divulgar e o item no menu) em construção; depois o rastreio (7).'
 where key = 'link-da-bio'
returning key, status, blocker;
```

### Task 8: Regras da Aparência

**Files:**
- Create: `apps/web/src/lib/bio/editor-aparencia.ts`
- Test: `apps/web/src/lib/bio/editor-aparencia.test.ts`

**Interfaces:**
- Consumes: `coresDoModelo(modelo: Modelo, paleta: string, cores: DocumentoBio["cores"]): TokensBio` de `@/lib/bio/cores` (PR 2; chaves com `--`, valores `#RRGGBB`; o Romaneio não tem `--prin`); `MODELOS`, `PALETAS`, `documentoBio`, `documentoPadrao`, `type DocumentoBio`, `type Modelo` de `@/lib/bio/documento` (PR 2).
- Produces:
  - `NOME_DA_PALETA: Readonly<Record<(typeof PALETAS)[Modelo][number], string>>`, `DESCRICAO_DO_MODELO: Readonly<Record<Modelo, string>>`
  - `type CoresDaMarca = NonNullable<DocumentoBio["cores"]>`
  - `amostraDaPaleta(modelo: Modelo, paleta: string): readonly [fundo: string, botao: string]`
  - `paletaAoTrocar(paleta: string, modelo: Modelo): string`, `comModelo(d: DocumentoBio, modelo: Modelo): DocumentoBio`
  - `coresDaMarca(d: DocumentoBio): CoresDaMarca`, `corDoSeletor(valor: string): string | null`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/bio/editor-aparencia.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { documentoBio, documentoPadrao, MODELOS, PALETAS, type DocumentoBio } from "@/lib/bio/documento";

import {
  amostraDaPaleta,
  comModelo,
  corDoSeletor,
  coresDaMarca,
  DESCRICAO_DO_MODELO,
  NOME_DA_PALETA,
} from "./editor-aparencia";

const BASE: DocumentoBio = documentoPadrao({ nome: "Loja Exemplo", campanhaId: null });

test("cada paleta pronta tem nome, e cada modelo uma descrição", () => {
  for (const modelo of MODELOS) {
    for (const paleta of PALETAS[modelo]) assert.ok(NOME_DA_PALETA[paleta], `${modelo}/${paleta}`);
    assert.ok(DESCRICAO_DO_MODELO[modelo], modelo);
  }
  assert.equal(NOME_DA_PALETA.azul, "Azul");
  assert.equal(NOME_DA_PALETA.escuro, "Preto e amarelo");
});

test("amostra da paleta: o fundo e o botão em destaque que a página pinta (no Romaneio, o carimbo)", () => {
  assert.deepEqual(amostraDaPaleta("etiqueta", "azul"), ["#286AA6", "#E98B2B"]);
  assert.deepEqual(amostraDaPaleta("vitrine", "papel"), ["#FAF7F2", "#1B1A17"]);
  assert.deepEqual(amostraDaPaleta("romaneio", "kraft"), ["#C4A07A", "#B3261E"]);
  assert.deepEqual(amostraDaPaleta("classico", "escuro"), ["#111111", "#FFD400"]);
});

test("trocar de modelo: a mesma paleta se o novo tem, a da marca fica, senão a primeira; o documento continua válido", () => {
  const rosa: DocumentoBio = { ...BASE, modelo: "etiqueta", paleta: "rosa" };
  assert.equal(comModelo(rosa, "vitrine").paleta, "papel");
  assert.equal(comModelo({ ...BASE, paleta: "azul" }, "romaneio").paleta, "azul");
  const marca: DocumentoBio = { ...BASE, paleta: "marca", cores: { fundo: "#FFF0E0", botao: "#C2185B" } };
  assert.deepEqual(comModelo(marca, "classico"), { ...marca, modelo: "classico" });
  for (const modelo of MODELOS) assert.ok(documentoBio.safeParse(comModelo(rosa, modelo)).success, modelo);
});

test("cores da marca: as escolhidas; sem elas, as da paleta que está na tela", () => {
  assert.deepEqual(coresDaMarca({ ...BASE, modelo: "etiqueta", paleta: "rosa", cores: null }), { fundo: "#B83A6B", botao: "#FFD24D" });
  assert.deepEqual(coresDaMarca({ ...BASE, paleta: "marca", cores: { fundo: "#FFF0E0", botao: "#C2185B" } }), {
    fundo: "#FFF0E0",
    botao: "#C2185B",
  });
});

test("paleta pronta guarda as cores da marca pra quando voltar: o documento continua válido", () => {
  // Premissa sobre o PR 2 (§9: `cores` é obrigatório com "marca", não proibido sem ela).
  assert.equal(documentoBio.safeParse({ ...BASE, paleta: "rosa", cores: { fundo: "#FFF0E0", botao: "#C2185B" } }).success, true);
});

test("seletor de cor: seis dígitos hex, com ou sem #, viram #RRGGBB maiúsculo; o resto não é cor", () => {
  assert.equal(corDoSeletor("#286aa6"), "#286AA6");
  assert.equal(corDoSeletor(" 286AA6 "), "#286AA6");
  assert.equal(corDoSeletor("#28a"), null);
  assert.equal(corDoSeletor("azul"), null);
  assert.equal(corDoSeletor("#286AA6F"), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/editor-aparencia.test.ts`
Expected: FAIL — `Cannot find module './editor-aparencia'`.

- [ ] **Step 3: Write `editor-aparencia.ts`**

```ts
// apps/web/src/lib/bio/editor-aparencia.ts
import { coresDoModelo } from "@/lib/bio/cores";
import { PALETAS, type DocumentoBio, type Modelo } from "@/lib/bio/documento";

/** Regras puras da aba Aparência (spec 2026-10-19 §3, §8). Roda no navegador e nos testes. */

/** Nome de cada paleta pronta na tela; o id é o do §9 (o `azul` era "Azul da loja" no mockup). */
export const NOME_DA_PALETA: Readonly<Record<(typeof PALETAS)[Modelo][number], string>> = {
  azul: "Azul",
  rosa: "Rosa chiclete",
  menta: "Verde-água",
  grafite: "Grafite e dourado",
  papel: "Papel",
  noite: "Noite",
  rose: "Rosé",
  kraft: "Kraft",
  caneta: "Azul caneta",
  nota: "Verde nota",
  claro: "Claro",
  escuro: "Preto e amarelo",
  lavanda: "Lavanda",
};

/** Uma linha sobre cada modelo, embaixo da miniatura (textos do mockup). */
export const DESCRICAO_DO_MODELO: Readonly<Record<Modelo, string>> = {
  etiqueta: "Botões como etiquetas penduradas num fio. Balançam ao entrar e no toque.",
  vitrine: "Foto cheia da loja em cima; a lista sobe por cima dela.",
  romaneio: "A nota do fardo: itens numerados e o botão principal carimbado.",
  classico: "O formato que todo mundo conhece: foto redonda e botões.",
};

export type CoresDaMarca = NonNullable<DocumentoBio["cores"]>;

/** As duas bolinhas da paleta: o fundo da página e o botão em destaque, como a página pinta. */
export function amostraDaPaleta(modelo: Modelo, paleta: string): readonly [fundo: string, botao: string] {
  const t = coresDoModelo(modelo, paleta, null);
  // O Romaneio não tem `--prin`: o botão carimbado é o `--acento`.
  return [t["--fundo2"], t["--prin"] ?? t["--acento"]];
}

/** A paleta ao trocar de modelo: a mesma, se o novo modelo tem (todos têm `azul`); "marca" fica; senão a primeira. */
export function paletaAoTrocar(paleta: string, modelo: Modelo): string {
  const doModelo: readonly string[] = PALETAS[modelo];
  return paleta === "marca" || doModelo.includes(paleta) ? paleta : doModelo[0];
}

/** O documento noutro modelo. A miniatura e o toque usam a mesma função: a miniatura é o que o toque dá. */
export function comModelo(d: DocumentoBio, modelo: Modelo): DocumentoBio {
  return { ...d, modelo, paleta: paletaAoTrocar(d.paleta, modelo) };
}

/** As cores dos dois seletores: as da marca, se já tem; senão as da paleta que está na tela. */
export function coresDaMarca(d: DocumentoBio): CoresDaMarca {
  if (d.cores) return d.cores;
  const [fundo, botao] = amostraDaPaleta(d.modelo, d.paleta);
  return { fundo, botao };
}

/** `#RRGGBB` maiúsculo (§9) a partir do seletor ou do que foi digitado, com ou sem `#`; null se não for cor. */
export function corDoSeletor(valor: string): string | null {
  const hex = valor.trim().replace(/^#/, "");
  return /^[0-9A-Fa-f]{6}$/.test(hex) ? `#${hex.toUpperCase()}` : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/editor-aparencia.test.ts`
Expected: PASS (6 testes). Se "amostra da paleta…" falhar, comparar `PALETAS_PRONTAS` do PR 2 com o `paletas.json` (a amostra é o que a página pinta: o erro é de lá). Se "paleta pronta guarda…" falhar, o PR 2 proíbe `cores` fora da marca: na Task 9 o toque numa paleta passa a gravar `cores: null`, este teste passa a esperar `false`, e a decisão vai no corpo do PR.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bio/editor-aparencia.ts src/lib/bio/editor-aparencia.test.ts
git commit -m "feat(link-da-bio): appearance rules (palette names, swatches, model switch, brand colors)"
```

### Task 9: Miniaturas e a aba Aparência

**Files:**
- Modify: `apps/web/src/components/painel/link-da-bio/previa.tsx` (prop `miniatura`)
- Create: `apps/web/src/components/painel/link-da-bio/aba-aparencia.tsx`
- Modify: `apps/web/src/components/painel/link-da-bio/abas.tsx` (entrada `aparencia`)
- Test: `apps/web/src/components/painel/link-da-bio/aba-aparencia.test.ts`
- Test: `apps/web/src/components/painel/link-da-bio/previa.test.ts` (um teste no fim)

**Interfaces:**
- Consumes: Task 8; Task 3 (`useErroDaAba`, `AvisoDaAba`, `type ErroDaAba`); 6a (`dadosDaPrevia`, `NOME_DO_MODELO`, `type PropsDaAba`, `abaDoErro`, `QuadroDaPrevia`); `Interruptor`; `MODELOS`, `PALETAS`, `type DadosRender`, `type DocumentoBio`, `type Modelo` (PR 2); `renderPaginaBio` com os quatro modelos (3a + 3b).
- Produces: `QuadroDaPrevia(p: { dados: DadosRender; rodada: number; className?: string; miniatura?: boolean }): React.JSX.Element`; `AbaAparencia(p: PropsDaAba): React.JSX.Element`; entrada `{ id: "aparencia", nome: "Aparência", dona: (campo) => /^(modelo|paleta|cores|animar)(\.|$)/.test(campo), Conteudo: AbaAparencia }` entre Links e Perfil.

- [ ] **Step 1: Write the failing tests** — no fim de `previa.test.ts`:

```ts
test("miniatura do modelo: inert e escondida do leitor de tela; a prévia comum não", () => {
  const mini = renderToStaticMarkup(createElement(QuadroDaPrevia, { dados: DADOS, rodada: 0, miniatura: true }));
  assert.match(mini, /sandbox="" tabindex="-1" inert="" aria-hidden="true" class=/);
  const comum = renderToStaticMarkup(createElement(QuadroDaPrevia, { dados: DADOS, rodada: 0 }));
  assert.match(comum, /sandbox="" tabindex="-1" class=/);
});
```

e o teste da aba:

```ts
// apps/web/src/components/painel/link-da-bio/aba-aparencia.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { DocumentoBio } from "@/lib/bio/documento";
import { estadoDe, type ContextoDoEditor } from "@/lib/bio/editor";
import type { PaginaBio } from "@/lib/stores/bio-pages";
import { documentoFalso, IDS } from "@/test/bio-dados-falsos";

import { AbaAparencia } from "./aba-aparencia";
import { abaDoErro, type PropsDaAba } from "./abas";

const noop = () => {};
// A loja fictícia do PR 3a: nada da loja-piloto (repo público).
const DOC = documentoFalso();
const PAGINA: PaginaBio = {
  id: IDS.pagina,
  tenantId: "tenant-exemplo",
  slug: "atelie-exemplo",
  publicada: false,
  bloqueadaEm: null,
  documento: DOC,
  versao: 3,
  updatedAt: "2026-10-19T12:00:00.000Z",
};
const CONTEXTO: ContextoDoEditor = {
  campanhas: [{ id: IDS.campanha, nome: "VIP Exemplo", slug: "vip-exemplo" }],
  dominio: null,
  origemGirumo: "https://www.girumo.com.br",
  sugestaoSlug: "atelie-exemplo",
  linksEscondidos: [],
};

function html(documento: DocumentoBio = DOC): string {
  const props: PropsDaAba = {
    pagina: PAGINA,
    rascunho: { ...estadoDe(PAGINA), documento },
    contexto: CONTEXTO,
    mudarDocumento: noop,
    mudarPagina: noop,
    reverAnimacao: noop,
    erro: null,
    limparErro: noop,
  };
  return renderToStaticMarkup(createElement(AbaAparencia, props));
}

/** O `<button>` cujo texto termina em `nome`, do `<button` ao `</button>`. */
function botao(h: string, nome: string): string {
  return new RegExp(String.raw`<button(?:(?!<button)[\s\S])*?>${nome}</button>`).exec(h)?.[0] ?? "";
}

test("quatro modelos com miniatura viva (inert, fora do Tab, escondida do leitor), nome, descrição e o atual marcado", () => {
  const h = html();
  assert.equal(h.match(/sandbox="" tabindex="-1" inert="" aria-hidden="true"/g)?.length, 4);
  assert.match(botao(h, "Etiqueta"), /aria-pressed="true" aria-describedby="bio-modelo-etiqueta-desc"/);
  for (const nome of ["Vitrine", "Romaneio", "Clássico"]) assert.match(botao(h, nome), /aria-pressed="false"/, nome);
  assert.match(h, /<p id="bio-modelo-romaneio-desc"[^>]*>A nota do fardo: itens numerados e o botão principal carimbado\.<\/p>/);
});

test("cores: as quatro paletas do modelo com nome e bolinhas, a atual marcada; os seletores só com a marca", () => {
  const h = html();
  assert.match(botao(h, "Azul"), /aria-pressed="true"/);
  assert.match(botao(h, "Azul"), /style="background-color:#286AA6"[\s\S]*style="background-color:#E98B2B"/);
  for (const nome of ["Rosa chiclete", "Verde-água", "Grafite e dourado"]) assert.match(botao(h, nome), /aria-pressed="false"/, nome);
  assert.match(botao(h, "Cores da sua marca"), /aria-pressed="false"/);
  assert.doesNotMatch(h, /id="bio-cores-fundo"/);
  const marca = html({ ...DOC, paleta: "marca", cores: { fundo: "#FFF0E0", botao: "#C2185B" } });
  assert.match(botao(marca, "Cores da sua marca"), /aria-pressed="true"/);
  assert.match(marca, /<label for="bio-cores-fundo"[^>]*>Fundo da página<\/label>/);
  assert.match(marca, /<input type="color" id="bio-cores-fundo"[^>]*value="#fff0e0"/);
  assert.match(marca, /id="bio-cores-botao-hex" aria-label="Botão em destaque, código da cor"[^>]*value="#C2185B"/);
  // No Romaneio, as paletas dele.
  const romaneio = html({ ...DOC, modelo: "romaneio", paleta: "kraft" });
  for (const nome of ["Kraft", "Azul caneta", "Verde nota", "Azul"]) assert.ok(botao(romaneio, nome), nome);
});

test("Animação de entrada: interruptor e Rever a animação, desligado com a animação desligada", () => {
  const h = html();
  assert.match(h, /role="switch" aria-checked="true" aria-label="Animação de entrada"/);
  assert.match(botao(h, "Rever a animação"), /^<button type="button" class=/);
  assert.match(botao(html({ ...DOC, animar: false }), "Rever a animação"), /^<button type="button" disabled=""/);
});

test("os erros de modelo, paleta, cores e animação vão pra Aparência", () => {
  for (const campo of ["modelo", "paleta", "cores", "cores.fundo", "animar"]) {
    assert.equal(abaDoErro({ campo, mensagem: "x" })?.id, "aparencia", campo);
  }
  assert.equal(abaDoErro({ campo: "coresx", mensagem: "x" }), undefined);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/link-da-bio/previa.test.ts src/components/painel/link-da-bio/aba-aparencia.test.ts`
Expected: FAIL — `Cannot find module './aba-aparencia'` e, em `previa.test.ts`, o teste novo (sem `inert`).

- [ ] **Step 3: `miniatura` no `QuadroDaPrevia`** — em `previa.tsx`, na assinatura, trocar `{ dados, rodada, className }: { dados: DadosRender; rodada: number; className?: string }` por:

```tsx
{
  dados,
  rodada,
  className,
  miniatura = false,
}: {
  dados: DadosRender;
  rodada: number;
  className?: string;
  /** Miniatura de modelo (aba Aparência): fora do Tab, do mouse e do leitor de tela. */
  miniatura?: boolean;
}
```

e, no `<iframe>`, logo depois de `tabIndex={-1}`:

```tsx
      inert={miniatura}
      aria-hidden={miniatura || undefined}
```

- [ ] **Step 4: Write `aba-aparencia.tsx`**

```tsx
// apps/web/src/components/painel/link-da-bio/aba-aparencia.tsx
"use client";

import { useMemo, useState } from "react";
import { Play } from "lucide-react";

import { Interruptor } from "@/components/painel/instagram/interruptor";
import { MODELOS, PALETAS, type DadosRender, type DocumentoBio, type Modelo } from "@/lib/bio/documento";
import { dadosDaPrevia, NOME_DO_MODELO } from "@/lib/bio/editor";
import {
  amostraDaPaleta,
  comModelo,
  corDoSeletor,
  coresDaMarca,
  DESCRICAO_DO_MODELO,
  NOME_DA_PALETA,
  type CoresDaMarca,
} from "@/lib/bio/editor-aparencia";
import { cn } from "@/lib/utils";

import type { PropsDaAba } from "./abas";
import { AvisoDaAba, useErroDaAba, type ErroDaAba } from "./erro-da-aba";
import { QuadroDaPrevia } from "./previa";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";
const CAMPO =
  "min-h-11 w-full rounded-lg border border-line-200 bg-paper-0 px-3 py-2.5 text-[16px] leading-snug text-volt-950 aria-invalid:border-danger-700 focus-visible:outline-2 focus-visible:outline-cobalt-500";
const ROTULO = "text-15 font-semibold text-volt-950";
const AJUDA = "text-13 text-slate-600";
const ERRO = "text-13 font-medium text-danger-700";
const SECUNDARIO = `inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-line-200 bg-paper-0 px-4 text-15 font-semibold text-volt-950 transition-colors hover:border-slate-600 disabled:cursor-not-allowed disabled:opacity-45 ${FOCO}`;
const CARTAO = "pn-card grid gap-4 rounded-xl p-4 lg:p-5";
const TITULO = "font-brand text-15 font-bold text-volt-950";

/** Os campos da aba que mostram erro do salvar; o resto vai pro aviso do topo. */
const LUGARES_DA_APARENCIA: readonly string[] = ["cores.fundo", "cores.botao"];

type IdDaPaleta = (typeof PALETAS)[Modelo][number];
type Miniatura = { modelo: Modelo; dados: DadosRender };

function Bolinhas({ fundo, botao }: { fundo: string; botao: string }) {
  return (
    <span aria-hidden="true" className="flex flex-none">
      <span className="h-7 w-7 rounded-full ring-1 ring-line-200" style={{ backgroundColor: fundo }} />
      <span className="-ml-2 h-7 w-7 rounded-full ring-2 ring-paper-0" style={{ backgroundColor: botao }} />
    </span>
  );
}

function BotaoDePaleta({
  ativa,
  fundo,
  botao,
  aoEscolher,
  children,
}: {
  ativa: boolean;
  fundo: string;
  botao: string;
  aoEscolher: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativa}
      onClick={aoEscolher}
      className={cn(
        "inline-flex min-h-11 items-center gap-2.5 rounded-full border bg-paper-0 py-1.5 pl-1.5 pr-4 text-15 font-semibold text-volt-950",
        FOCO,
        ativa ? "border-2 border-volt-950" : "border-line-200 hover:border-slate-600",
      )}
    >
      <Bolinhas fundo={fundo} botao={botao} />
      {children}
    </button>
  );
}

/** Seletor de cor + o código (#RRGGBB): o código digitado só vai pro documento quando forma uma cor. */
function CampoDeCor({
  id,
  rotulo,
  valor,
  erro,
  aoMudar,
}: {
  id: string;
  rotulo: string;
  valor: string;
  erro?: string;
  aoMudar: (cor: string) => void;
}) {
  const [texto, setTexto] = useState(valor);
  const [valorVisto, setValorVisto] = useState(valor);
  if (valor !== valorVisto) {
    setValorVisto(valor);
    setTexto(valor);
  }
  function mudar(entrada: string) {
    const cor = corDoSeletor(entrada);
    if (cor) aoMudar(cor);
  }
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className={ROTULO}>
        {rotulo}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          id={id}
          value={valor.toLowerCase()}
          aria-describedby={erro ? `${id}-erro` : undefined}
          onChange={(e) => mudar(e.target.value)}
          className={cn("h-11 w-14 flex-none cursor-pointer rounded-lg border border-line-200 bg-paper-0 p-1", FOCO)}
        />
        <input
          type="text"
          id={`${id}-hex`}
          aria-label={`${rotulo}, código da cor`}
          value={texto}
          maxLength={7}
          spellCheck={false}
          aria-invalid={corDoSeletor(texto) === null ? true : undefined}
          onChange={(e) => {
            setTexto(e.target.value);
            mudar(e.target.value);
          }}
          onBlur={() => setTexto(valor)}
          className={cn(CAMPO, "w-32 font-data")}
        />
      </div>
      {erro && (
        <p id={`${id}-erro`} className={ERRO}>
          {erro}
        </p>
      )}
    </div>
  );
}

function CartaoModelo({ atual, miniaturas, aoTrocar }: { atual: Modelo; miniaturas: readonly Miniatura[]; aoTrocar: (m: Modelo) => void }) {
  return (
    <section aria-labelledby="bio-modelo-titulo" className={CARTAO}>
      <h2 id="bio-modelo-titulo" className={TITULO}>
        Modelo
      </h2>
      <ul aria-labelledby="bio-modelo-titulo" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {miniaturas.map(({ modelo, dados }) => {
          const ativo = modelo === atual;
          return (
            <li
              key={modelo}
              className={cn(
                "relative grid content-start gap-2 rounded-xl border bg-paper-0 p-2.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-cobalt-500",
                ativo ? "border-2 border-volt-950" : "border-line-200 hover:border-slate-600",
              )}
            >
              {/* A página da loja neste modelo, a 30%: 390×653 vira 117×196 (mockup). */}
              <div className="mx-auto h-[196px] w-[117px] overflow-hidden rounded-lg bg-canvas-100">
                <QuadroDaPrevia miniatura dados={dados} rodada={0} className="h-[653px] w-[390px] origin-top-left scale-[0.3]" />
              </div>
              {/* O botão cobre o cartão inteiro (::after); o iframe fica fora dele (iframe não pode morar num botão). */}
              <button
                type="button"
                aria-pressed={ativo}
                aria-describedby={`bio-modelo-${modelo}-desc`}
                onClick={() => aoTrocar(modelo)}
                className="text-left text-15 font-semibold text-volt-950 outline-none after:absolute after:inset-0 after:rounded-xl"
              >
                {NOME_DO_MODELO[modelo]}
              </button>
              <p id={`bio-modelo-${modelo}-desc`} className="text-13 leading-snug text-slate-600">
                {DESCRICAO_DO_MODELO[modelo]}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CartaoCores({
  documento,
  mudarDocumento,
  erros,
}: {
  documento: DocumentoBio;
  mudarDocumento: PropsDaAba["mudarDocumento"];
  erros: ErroDaAba;
}) {
  const paletas: readonly IdDaPaleta[] = PALETAS[documento.modelo];
  const marca = coresDaMarca(documento);
  function mudarMarca(mudanca: Partial<CoresDaMarca>) {
    mudarDocumento((d) => ({ ...d, paleta: "marca", cores: { ...coresDaMarca(d), ...mudanca } }));
  }
  return (
    <section aria-labelledby="bio-cores-titulo" className={CARTAO}>
      <div className="grid gap-0.5">
        <h2 id="bio-cores-titulo" className={TITULO}>
          Cores
        </h2>
        <p className={AJUDA}>As quatro do modelo, ou as cores da sua marca.</p>
      </div>
      <div role="group" aria-labelledby="bio-cores-titulo" className="flex flex-wrap gap-2">
        {paletas.map((p) => {
          const [fundo, botao] = amostraDaPaleta(documento.modelo, p);
          // Paleta pronta não apaga `cores`: voltar pra "Cores da sua marca" recupera as duas.
          return (
            <BotaoDePaleta key={p} ativa={documento.paleta === p} fundo={fundo} botao={botao} aoEscolher={() => mudarDocumento((d) => ({ ...d, paleta: p }))}>
              {NOME_DA_PALETA[p]}
            </BotaoDePaleta>
          );
        })}
        <BotaoDePaleta ativa={documento.paleta === "marca"} fundo={marca.fundo} botao={marca.botao} aoEscolher={() => mudarMarca({})}>
          Cores da sua marca
        </BotaoDePaleta>
      </div>
      {documento.paleta === "marca" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoDeCor
            id="bio-cores-fundo"
            rotulo="Fundo da página"
            valor={marca.fundo}
            erro={erros.erroDe("cores.fundo")}
            aoMudar={(fundo) => {
              erros.corrigiu("cores.fundo");
              mudarMarca({ fundo });
            }}
          />
          <CampoDeCor
            id="bio-cores-botao"
            rotulo="Botão em destaque"
            valor={marca.botao}
            erro={erros.erroDe("cores.botao")}
            aoMudar={(botao) => {
              erros.corrigiu("cores.botao");
              mudarMarca({ botao });
            }}
          />
          <p className={cn(AJUDA, "sm:col-span-2")}>
            A página acerta o tom do texto e dos ícones pra continuarem legíveis em cima das suas cores.
          </p>
        </div>
      )}
    </section>
  );
}

/** Aba Aparência (spec §8): o modelo pelas miniaturas vivas, a paleta ou as cores da marca e a animação. */
export function AbaAparencia({ pagina, rascunho, contexto, mudarDocumento, reverAnimacao, erro, limparErro }: PropsDaAba) {
  const documento = rascunho.documento;
  const erros = useErroDaAba(erro, limparErro, LUGARES_DA_APARENCIA, pagina.versao);
  // Cada miniatura: a página da loja naquele modelo, com a paleta que o toque daria (`comModelo`).
  const miniaturas = useMemo(
    () => MODELOS.map((modelo) => ({ modelo, dados: dadosDaPrevia(pagina, comModelo(documento, modelo), contexto) })),
    [pagina, documento, contexto],
  );

  function trocarModelo(modelo: Modelo) {
    if (modelo === documento.modelo) return;
    mudarDocumento((d) => comModelo(d, modelo));
    reverAnimacao(); // trocar de modelo toca a entrada na prévia (§8)
  }

  return (
    <div className="grid gap-4">
      {erros.erroSolto && <AvisoDaAba mensagem={erros.erroSolto} />}
      <CartaoModelo atual={documento.modelo} miniaturas={miniaturas} aoTrocar={trocarModelo} />
      <CartaoCores documento={documento} mudarDocumento={mudarDocumento} erros={erros} />
      <section aria-labelledby="bio-animacao-titulo" className={CARTAO}>
        <div className="flex items-center gap-3">
          <div className="grid min-w-0 flex-1 gap-0.5">
            <h2 id="bio-animacao-titulo" className={TITULO}>
              Animação de entrada
            </h2>
            <p className={AJUDA}>
              Os botões entram um a um quando a página abre. Quem pediu menos movimento no celular vê a página parada.
            </p>
          </div>
          <Interruptor
            ligado={documento.animar}
            aoMudar={(animar) => mudarDocumento((d) => ({ ...d, animar }))}
            rotulo="Animação de entrada"
          />
        </div>
        <button type="button" onClick={reverAnimacao} disabled={!documento.animar} className={cn(SECUNDARIO, "w-fit")}>
          <Play className="h-4 w-4" aria-hidden="true" />
          Rever a animação
        </button>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Registrar a aba** — em `abas.tsx`, logo depois de `import { AbaLinks } from "./aba-links";`:

```tsx
import { AbaAparencia } from "./aba-aparencia";
```

e, no `ABAS`, entre a entrada `links` e a `perfil`:

```tsx
  { id: "aparencia", nome: "Aparência", dona: (campo) => /^(modelo|paleta|cores|animar)(\.|$)/.test(campo), Conteudo: AbaAparencia },
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/link-da-bio/aba-aparencia.test.ts src/components/painel/link-da-bio/previa.test.ts src/components/painel/link-da-bio/aba-perfil.test.ts`
Expected: PASS (4 + 5 + 7). O primeiro teste da aba renderiza os quatro modelos: um erro dentro do `renderPaginaBio` de um deles é defeito do 3b.

- [ ] **Step 7: Lint**

Run: `npm run painel:check` · `npx eslint src/components/painel/link-da-bio`
Expected: `painel:check OK`; eslint sem erro nem aviso.

- [ ] **Step 8: Commit**

```bash
git add src/components/painel/link-da-bio/previa.tsx src/components/painel/link-da-bio/previa.test.ts src/components/painel/link-da-bio/aba-aparencia.tsx src/components/painel/link-da-bio/aba-aparencia.test.ts src/components/painel/link-da-bio/abas.tsx
git commit -m "feat(link-da-bio): appearance tab with live model thumbnails, palettes and brand colors"
```

### Task 10: Regras da Divulgar

**Files:**
- Create: `apps/web/src/lib/bio/editor-divulgar.ts`
- Test: `apps/web/src/lib/bio/editor-divulgar.test.ts`

**Interfaces:**
- Consumes: `SLUG_BIO: RegExp` (já com o 3–40), `slugReservado(slug: string): boolean`, `type LinkBio` de `@/lib/bio/documento` (PR 2); `type MotivoDoSlug`, `type RespostaDoSlug` de `@/lib/bio/painel-api` (PR 5, só tipo: o módulo é `server-only`); `type RelatorioBio` de `@/lib/stores/bio-pages` (PR 2, só tipo).
- Produces:
  - `slugDoCampo(valor: string): string`, `motivoLocalDoSlug(slug: string): Exclude<MotivoDoSlug, "em-uso"> | null`
  - `type ConsultaDoSlug = { slug: string; resposta: RespostaDoSlug | null }`, `type AvisoDoSlug = { texto: string; tom: "neutro" | "ok" | "erro" }`
  - `avisoDoSlug(slug: string, salvo: string, consulta: ConsultaDoSlug | null, prefixo: string): AvisoDoSlug`, `prefixoDoSlug(origemGirumo: string): string`
  - `ehRespostaDoSlug(v: unknown): v is RespostaDoSlug`, `textoDoNoAr(publicada: boolean, salva: boolean, bloqueada: boolean): string`
  - `ehRelatorioBio(v: unknown): v is RelatorioBio`, `type LinhaDoRelatorio = { chave: string; titulo: string; toques: string }`, `type ResumoDoRelatorio = { vazio: boolean; visitas: string; toques: string; porVisita: string; linhas: LinhaDoRelatorio[] }`, `resumoDoRelatorio(r: RelatorioBio, links: readonly LinkBio[]): ResumoDoRelatorio`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/bio/editor-divulgar.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import type { LinkBio } from "@/lib/bio/documento";
import type { RelatorioBio } from "@/lib/stores/bio-pages";

import {
  avisoDoSlug,
  ehRelatorioBio,
  ehRespostaDoSlug,
  motivoLocalDoSlug,
  prefixoDoSlug,
  resumoDoRelatorio,
  slugDoCampo,
  textoDoNoAr,
} from "./editor-divulgar";

// Dados fictícios: nada da loja-piloto (repo público).
const ZAP: LinkBio = {
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
const GRUPO: LinkBio = {
  id: "6f1c2b9e-0a1d-4c3e-9b2a-1d2e3f4a5b02",
  tipo: "grupo",
  titulo: "Entrar no grupo VIP",
  sub: "",
  icone: "coroa",
  ativo: true,
  destaque: false,
  campanhaId: "0b7d6c5e-4f3a-4b2c-8d1e-0f9a8b7c6d01",
};
const P = "girumo.com.br/bio/";

test("endereço digitado vira slug: minúsculo, sem acento, espaço vira hífen, até 40; o hífen do fim espera a próxima letra", () => {
  assert.equal(slugDoCampo("Ateliê Exemplo"), "atelie-exemplo");
  assert.equal(slugDoCampo("loja_kids  2026"), "loja-kids-2026");
  assert.equal(slugDoCampo("--Loja!@#"), "loja");
  assert.equal(slugDoCampo("loja-"), "loja-");
  assert.equal(slugDoCampo("a".repeat(50)).length, 40);
});

test("formato e reservado sem ir ao servidor; em uso só a API diz", () => {
  assert.equal(motivoLocalDoSlug("ab"), "formato");
  assert.equal(motivoLocalDoSlug("loja-"), "formato");
  assert.equal(motivoLocalDoSlug("a".repeat(41)), "formato");
  assert.equal(motivoLocalDoSlug("loja-girumo"), "reservado");
  assert.equal(motivoLocalDoSlug("atelie-exemplo"), null);
});

test("aviso do endereço: atual, formato, conferindo, livre, em uso e falha de rede; resposta de outro slug não vale", () => {
  assert.deepEqual(avisoDoSlug("atelie-exemplo", "atelie-exemplo", null, P), { texto: "Este é o endereço atual da página.", tom: "neutro" });
  assert.deepEqual(avisoDoSlug("ab", "atelie-exemplo", null, P), {
    texto: "Use de 3 a 40 letras minúsculas, números e hífen, sem espaço nem acento.",
    tom: "erro",
  });
  assert.deepEqual(avisoDoSlug("loja-girumo", "atelie-exemplo", null, P), { texto: "Esse endereço é reservado. Escolha outro.", tom: "erro" });
  assert.equal(avisoDoSlug("atelie-novo", "atelie-exemplo", null, P).texto, "Conferindo se está livre…");
  // A resposta de "atelie-nov" chegou depois de digitar o "o": ainda conferindo.
  assert.equal(
    avisoDoSlug("atelie-novo", "atelie-exemplo", { slug: "atelie-nov", resposta: { disponivel: true } }, P).texto,
    "Conferindo se está livre…",
  );
  assert.deepEqual(avisoDoSlug("atelie-novo", "atelie-exemplo", { slug: "atelie-novo", resposta: { disponivel: true } }, P), {
    texto: "Livre: girumo.com.br/bio/atelie-novo",
    tom: "ok",
  });
  assert.deepEqual(
    avisoDoSlug("atelie-novo", "atelie-exemplo", { slug: "atelie-novo", resposta: { disponivel: false, motivo: "em-uso" } }, P),
    { texto: "Esse endereço já está em uso. Escolha outro.", tom: "erro" },
  );
  assert.deepEqual(avisoDoSlug("atelie-novo", "atelie-exemplo", { slug: "atelie-novo", resposta: null }, P), {
    texto: "Não deu pra conferir agora. Se estiver em uso, o salvar avisa.",
    tom: "neutro",
  });
});

test("começo do endereço: o host da Girumo sem www; sem origem que preste, o da produção", () => {
  assert.equal(prefixoDoSlug("https://www.girumo.com.br"), "girumo.com.br/bio/");
  assert.equal(prefixoDoSlug("http://localhost:3000/"), "localhost:3000/bio/");
  assert.equal(prefixoDoSlug("lixo"), "girumo.com.br/bio/");
});

test("respostas da API: só o formato do contrato passa", () => {
  assert.equal(ehRespostaDoSlug({ disponivel: true }), true);
  assert.equal(ehRespostaDoSlug({ disponivel: false, motivo: "em-uso" }), true);
  assert.equal(ehRespostaDoSlug({ disponivel: false, motivo: "outro" }), false);
  assert.equal(ehRespostaDoSlug(null), false);
  const ok: RelatorioBio = { visitas: 3, toques: 1, porLink: [{ linkId: ZAP.id, toques: 1 }], porDia: [] };
  assert.equal(ehRelatorioBio(ok), true);
  assert.equal(ehRelatorioBio({ ...ok, visitas: "3" }), false);
  assert.equal(ehRelatorioBio({ ...ok, porLink: [{ linkId: 1, toques: 1 }] }), false);
  assert.equal(ehRelatorioBio({ visitas: 3, toques: 1 }), false);
});

test("Página no ar: o que vale agora e o que muda ao salvar; bloqueada manda", () => {
  assert.equal(textoDoNoAr(true, true, false), "No ar: quem abre o endereço vê a página.");
  assert.equal(textoDoNoAr(true, false, false), "Vai pro ar quando você salvar.");
  assert.equal(textoDoNoAr(false, true, false), "Sai do ar quando você salvar.");
  assert.equal(textoDoNoAr(false, false, false), "Fora do ar: quem abre o endereço vê “Página não encontrada”.");
  assert.match(textoDoNoAr(true, true, true), /^A Girumo tirou esta página do ar/);
});

test("números: milhar com ponto, toques por visita com até 2 casas e passando de 1, botões do mais tocado, os que saíram somados", () => {
  const r: RelatorioBio = {
    visitas: 1234,
    toques: 470,
    porLink: [
      { linkId: GRUPO.id, toques: 120 },
      { linkId: ZAP.id, toques: 300 },
      { linkId: "9f0e8d7c-0000-4000-8000-000000000001", toques: 30 },
      { linkId: "9f0e8d7c-0000-4000-8000-000000000002", toques: 20 },
    ],
    porDia: [],
  };
  assert.deepEqual(resumoDoRelatorio(r, [ZAP, GRUPO]), {
    vazio: false,
    visitas: "1.234",
    toques: "470",
    porVisita: "0,38",
    linhas: [
      { chave: ZAP.id, titulo: "Falar com a vendedora", toques: "300" },
      { chave: GRUPO.id, titulo: "Entrar no grupo VIP", toques: "120" },
      { chave: "saiu", titulo: "Links que saíram da página", toques: "50" },
    ],
  });
  assert.equal(resumoDoRelatorio({ visitas: 10, toques: 25, porLink: [], porDia: [] }, []).porVisita, "2,5");
  const nada = resumoDoRelatorio({ visitas: 0, toques: 0, porLink: [{ linkId: ZAP.id, toques: 0 }], porDia: [] }, [ZAP]);
  assert.equal(nada.vazio, true);
  assert.equal(nada.porVisita, "—");
  assert.deepEqual(nada.linhas, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/editor-divulgar.test.ts`
Expected: FAIL — `Cannot find module './editor-divulgar'`.

- [ ] **Step 3: Write `editor-divulgar.ts`**

```ts
// apps/web/src/lib/bio/editor-divulgar.ts
import { SLUG_BIO, slugReservado, type LinkBio } from "@/lib/bio/documento";
import type { MotivoDoSlug, RespostaDoSlug } from "@/lib/bio/painel-api";
import type { RelatorioBio } from "@/lib/stores/bio-pages";

/** Regras puras da aba Divulgar (spec 2026-10-19 §2, §7, §8). Roda no navegador e nos testes. */

// ------------------------------------------------------------------ endereço (§2)

/** O que a lojista digita vira slug: minúsculo, sem acento, espaço e _ viram hífen, até 40. O hífen do fim fica: ainda está digitando. */
export function slugDoCampo(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "")
    .slice(0, 40);
}

/** Formato e reservado sem ir ao servidor (a regra do `motivoDoSlug` do PR 5, que é server-only). "Em uso" só a API sabe. */
export function motivoLocalDoSlug(slug: string): Exclude<MotivoDoSlug, "em-uso"> | null {
  if (!SLUG_BIO.test(slug)) return "formato";
  return slugReservado(slug) ? "reservado" : null;
}

/** A última resposta do `GET /api/link-da-bio/slug` para um endereço; `resposta: null` = não deu pra conferir. */
export type ConsultaDoSlug = { slug: string; resposta: RespostaDoSlug | null };

export type AvisoDoSlug = { texto: string; tom: "neutro" | "ok" | "erro" };

// Os mesmos textos do PATCH (PR 5): o painel avisa antes, com as palavras do salvar.
const TEXTO_DO_MOTIVO: Readonly<Record<MotivoDoSlug, string>> = {
  formato: "Use de 3 a 40 letras minúsculas, números e hífen, sem espaço nem acento.",
  reservado: "Esse endereço é reservado. Escolha outro.",
  "em-uso": "Esse endereço já está em uso. Escolha outro.",
};

/** A linha embaixo do campo do endereço. Resposta de outro slug (a digitação passou na frente) vale como "conferindo". */
export function avisoDoSlug(slug: string, salvo: string, consulta: ConsultaDoSlug | null, prefixo: string): AvisoDoSlug {
  if (slug === salvo) return { texto: "Este é o endereço atual da página.", tom: "neutro" };
  const local = motivoLocalDoSlug(slug);
  if (local) return { texto: TEXTO_DO_MOTIVO[local], tom: "erro" };
  if (!consulta || consulta.slug !== slug) return { texto: "Conferindo se está livre…", tom: "neutro" };
  if (!consulta.resposta) return { texto: "Não deu pra conferir agora. Se estiver em uso, o salvar avisa.", tom: "neutro" };
  if (consulta.resposta.disponivel) return { texto: `Livre: ${prefixo}${slug}`, tom: "ok" };
  return { texto: TEXTO_DO_MOTIVO[consulta.resposta.motivo], tom: "erro" };
}

/** "girumo.com.br/bio/": o começo fixo do endereço, sem esquema nem www. */
export function prefixoDoSlug(origemGirumo: string): string {
  try {
    return `${new URL(origemGirumo).host.replace(/^www\./, "")}/bio/`;
  } catch {
    return "girumo.com.br/bio/";
  }
}

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Guarda da resposta do `GET /api/link-da-bio/slug`: fora do contrato, "não deu pra conferir". */
export function ehRespostaDoSlug(v: unknown): v is RespostaDoSlug {
  if (!ehObjeto(v)) return false;
  return v.disponivel === true || (v.disponivel === false && (v.motivo === "formato" || v.motivo === "reservado" || v.motivo === "em-uso"));
}

// ------------------------------------------------------------------ no ar (§8)

/** O que o interruptor "Página no ar" quer dizer agora: o que está salvo e o que muda ao salvar. */
export function textoDoNoAr(publicada: boolean, salva: boolean, bloqueada: boolean): string {
  if (bloqueada) return "A Girumo tirou esta página do ar. Ela não aparece pra ninguém até ser liberada; fale com o suporte.";
  if (publicada && salva) return "No ar: quem abre o endereço vê a página.";
  if (publicada) return "Vai pro ar quando você salvar.";
  if (salva) return "Sai do ar quando você salvar.";
  return "Fora do ar: quem abre o endereço vê “Página não encontrada”.";
}

// --------------------------------------------------------------- números (§7)

const ehNumero = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** Guarda do `GET /api/link-da-bio/relatorio`: corpo fora do formato é erro de carga, nunca zero. */
export function ehRelatorioBio(v: unknown): v is RelatorioBio {
  return (
    ehObjeto(v) &&
    ehNumero(v.visitas) &&
    ehNumero(v.toques) &&
    Array.isArray(v.porLink) &&
    v.porLink.every((p: unknown) => ehObjeto(p) && typeof p.linkId === "string" && ehNumero(p.toques)) &&
    Array.isArray(v.porDia)
  );
}

export type LinhaDoRelatorio = { chave: string; titulo: string; toques: string };
export type ResumoDoRelatorio = { vazio: boolean; visitas: string; toques: string; porVisita: string; linhas: LinhaDoRelatorio[] };

const numero = (n: number) => n.toLocaleString("pt-BR");

/**
 * O cartão "Últimos N dias" (§7): visitas, toques e toques POR VISITA (passa de 1 quando a mesma
 * pessoa toca em dois botões; não é "% que tocou"). Os botões com toque, do mais tocado; os que
 * saíram da página (o relatório só guarda o id) somam numa linha só, no fim.
 */
export function resumoDoRelatorio(r: RelatorioBio, links: readonly LinkBio[]): ResumoDoRelatorio {
  const titulos = new Map(links.map((l) => [l.id, l.titulo] as const));
  const tocados = r.porLink.filter((p) => p.toques > 0);
  const linhas: LinhaDoRelatorio[] = tocados
    .filter((p) => titulos.has(p.linkId))
    .sort((a, b) => b.toques - a.toques)
    .map((p) => ({ chave: p.linkId, titulo: titulos.get(p.linkId) ?? "", toques: numero(p.toques) }));
  const saiu = tocados.filter((p) => !titulos.has(p.linkId)).reduce((soma, p) => soma + p.toques, 0);
  if (saiu > 0) linhas.push({ chave: "saiu", titulo: "Links que saíram da página", toques: numero(saiu) });
  return {
    vazio: r.visitas === 0 && r.toques === 0,
    visitas: numero(r.visitas),
    toques: numero(r.toques),
    porVisita: r.visitas > 0 ? (r.toques / r.visitas).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—",
    linhas,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/editor-divulgar.test.ts`
Expected: PASS (7 testes). Se "formato e reservado…" falhar no `"a".repeat(41)`, o `SLUG_BIO` do PR 2 perdeu o `(?=.{3,40}$)`: defeito de lá (o check do banco também é 3–40).

- [ ] **Step 5: Commit**

```bash
git add src/lib/bio/editor-divulgar.ts src/lib/bio/editor-divulgar.test.ts
git commit -m "feat(link-da-bio): share-tab rules (slug input, availability notice, report summary)"
```

### Task 11: Aba Divulgar e os números

**Files:**
- Create: `apps/web/src/components/painel/link-da-bio/numeros-da-pagina.tsx`
- Create: `apps/web/src/components/painel/link-da-bio/aba-divulgar.tsx`
- Modify: `apps/web/src/components/painel/link-da-bio/abas.tsx` (entrada `divulgar`)
- Test: `apps/web/src/components/painel/link-da-bio/aba-divulgar.test.ts`
- Modify: `apps/web/src/components/painel/link-da-bio/aba-links.test.ts` e `editor.test.ts` (o `slug` passa a ter aba dona)

**Interfaces:**
- Consumes: Task 10; Task 3 (`useErroDaAba`, `AvisoDaAba`, `type ErroDaAba`); 6a (`enderecoPrincipal`, `type ContextoDoEditor`, `type PropsDaAba`, `ABAS`, `abaDoErro`, `estadoDe`, `type EstadoSalvavel`); `Interruptor`, `useToast`, `ErroDeCarga({ titulo, aoTentarDeNovo })`, `authenticatedFetch`, `type Carga`; `QRCodeCanvas` de `qrcode.react` (já no `package.json`; `forwardRef` para o `<canvas>`); `GET /api/link-da-bio/slug?valor=` e `GET /api/link-da-bio/relatorio?dias=7|30` (PR 5).
- Produces: `type PeriodoDosNumeros = 7 | 30`, `QuadroDosNumeros(p: { resumo: ResumoDoRelatorio }): React.JSX.Element`, `NumerosDaPagina(p: { links: readonly LinkBio[] }): React.JSX.Element`; `AbaDivulgar(p: PropsDaAba): React.JSX.Element`; entrada `{ id: "divulgar", nome: "Divulgar", dona: (campo) => campo === "slug" || campo === "publicada", Conteudo: AbaDivulgar }` no fim de `ABAS`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/components/painel/link-da-bio/aba-divulgar.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { estadoDe, type ContextoDoEditor, type ErroDeCampo, type EstadoSalvavel } from "@/lib/bio/editor";
import { resumoDoRelatorio } from "@/lib/bio/editor-divulgar";
import type { PaginaBio } from "@/lib/stores/bio-pages";
import { documentoFalso, IDS } from "@/test/bio-dados-falsos";

import { AbaDivulgar } from "./aba-divulgar";
import { ABAS, abaDoErro, type PropsDaAba } from "./abas";
import { NumerosDaPagina, QuadroDosNumeros } from "./numeros-da-pagina";

const noop = () => {};
// A loja fictícia do PR 3a: nada da loja-piloto (repo público).
const DOC = documentoFalso();
const PAGINA: PaginaBio = {
  id: IDS.pagina,
  tenantId: "tenant-exemplo",
  slug: "atelie-exemplo",
  publicada: false,
  bloqueadaEm: null,
  documento: DOC,
  versao: 3,
  updatedAt: "2026-10-19T12:00:00.000Z",
};
const CONTEXTO: ContextoDoEditor = {
  campanhas: [],
  dominio: null,
  origemGirumo: "https://www.girumo.com.br",
  sugestaoSlug: "atelie-exemplo",
  linksEscondidos: [],
};

function html(
  o: { pagina?: Partial<PaginaBio>; rascunho?: Partial<EstadoSalvavel>; contexto?: Partial<ContextoDoEditor>; erro?: ErroDeCampo } = {},
): string {
  const pagina: PaginaBio = { ...PAGINA, ...o.pagina };
  const props: PropsDaAba = {
    pagina,
    rascunho: { ...estadoDe(pagina), ...o.rascunho },
    contexto: { ...CONTEXTO, ...o.contexto },
    mudarDocumento: noop,
    mudarPagina: noop,
    reverAnimacao: noop,
    erro: o.erro ?? null,
    limparErro: noop,
  };
  return renderToStaticMarkup(createElement(AbaDivulgar, props));
}

/** O `<button>` cujo texto termina em `nome`, do `<button` ao `</button>`. */
function botao(h: string, nome: string): string {
  return new RegExp(String.raw`<button(?:(?!<button)[\s\S])*?>${nome}</button>`).exec(h)?.[0] ?? "";
}

test("Página no ar: interruptor com o rascunho e o que acontece ao salvar; bloqueada trava", () => {
  const h = html();
  assert.match(h, /role="switch" aria-checked="false" aria-label="Página no ar"/);
  assert.match(h, />Fora do ar: quem abre o endereço vê “Página não encontrada”\.</);
  const vai = html({ rascunho: { publicada: true } });
  assert.match(vai, /role="switch" aria-checked="true" aria-label="Página no ar"/);
  assert.match(vai, />Vai pro ar quando você salvar\.</);
  const bloqueada = html({ pagina: { publicada: true, bloqueadaEm: "2026-10-19T12:00:00.000Z" } });
  assert.match(bloqueada, /role="switch" aria-checked="false" aria-label="Página no ar" disabled=""/);
  assert.match(bloqueada, />A Girumo tirou esta página do ar/);
});

test("endereço: o principal com Copiar; o da Girumo com o começo fixo e o slug editável, que avisa ser o atual", () => {
  const h = html();
  assert.match(h, />https:\/\/www\.girumo\.com\.br\/bio\/atelie-exemplo</);
  assert.ok(botao(h, "Copiar o endereço"));
  assert.match(h, /<label for="bio-slug"[^>]*>Endereço na Girumo<\/label>/);
  assert.match(h, /<span aria-hidden="true"[^>]*>girumo\.com\.br\/bio\/<\/span>/);
  assert.match(h, /<input type="text" id="bio-slug"[^>]*aria-describedby="bio-slug-msg"[^>]*value="atelie-exemplo"/);
  assert.match(h, /<p id="bio-slug-msg" aria-live="polite"[^>]*>Este é o endereço atual da página\.<\/p>/);
  const dominio = html({ contexto: { dominio: "links.loja.com.br" } });
  assert.match(dominio, />https:\/\/links\.loja\.com\.br\/</);
  assert.match(dominio, /No seu domínio/);
});

test("trocar o endereço: avisa que o antigo leva pro novo; formato e reservado avisam na hora, sem ir ao servidor", () => {
  const novo = html({ rascunho: { slug: "atelie-novo" } });
  assert.match(novo, />Conferindo se está livre…</);
  assert.match(novo, /Quando você salvar, o endereço antigo \(girumo\.com\.br\/bio\/atelie-exemplo\) passa a levar pro novo\./);
  const curto = html({ rascunho: { slug: "ab" } });
  assert.match(curto, /id="bio-slug"[^>]*aria-invalid="true"/);
  assert.match(curto, />Use de 3 a 40 letras minúsculas, números e hífen, sem espaço nem acento\.</);
  assert.match(html({ rascunho: { slug: "loja-girumo" } }), />Esse endereço é reservado\. Escolha outro\.</);
  assert.doesNotMatch(html(), /passa a levar pro novo/);
});

test("erro do salvar no endereço fica embaixo do campo, ligado a ele", () => {
  const h = html({ rascunho: { slug: "atelie-novo" }, erro: { campo: "slug", mensagem: "Esse endereço já está em uso. Escolha outro." } });
  assert.match(h, /id="bio-slug"[^>]*aria-invalid="true" aria-describedby="bio-slug-msg"/);
  assert.match(h, /<p id="bio-slug-msg" aria-live="polite"[^>]*>Esse endereço já está em uso\. Escolha outro\.<\/p>/);
  assert.doesNotMatch(h, /id="bio-aba-aviso"/);
});

test("Instagram passo a passo e o QR do endereço da Girumo (o salvo, mesmo com domínio), com Baixar", () => {
  const h = html({ contexto: { dominio: "links.loja.com.br" }, rascunho: { slug: "atelie-novo" } });
  assert.match(h, /<ol[^>]*>[\s\S]*Editar perfil[\s\S]*<\/ol>/);
  assert.match(
    h,
    /<canvas style="height:128px;width:128px" height="512" width="512" role="img" aria-label="QR code que abre https:\/\/www\.girumo\.com\.br\/bio\/atelie-exemplo"/,
  );
  assert.ok(botao(h, "Baixar o QR code"));
});

test("Últimos dias: período 7 ou 30 com o atual marcado; carregando anunciado", () => {
  const h = renderToStaticMarkup(createElement(NumerosDaPagina, { links: DOC.links }));
  assert.match(h, /<h2 id="bio-numeros-titulo"[^>]*>Últimos 7 dias<\/h2>/);
  assert.match(h, /role="group" aria-label="Período"/);
  assert.match(h, /<button type="button" aria-pressed="true"[^>]*>7 dias<\/button>/);
  assert.match(h, /<button type="button" aria-pressed="false"[^>]*>30 dias<\/button>/);
  assert.match(h, /role="status"[^>]*><span class="sr-only">Carregando os números…<\/span>/);
});

test("números: visitas, toques e toques por visita; tabela dos botões; sem visita, diz o que fazer", () => {
  const resumo = resumoDoRelatorio({ visitas: 1234, toques: 470, porLink: [{ linkId: IDS.whatsapp, toques: 300 }], porDia: [] }, DOC.links);
  const h = renderToStaticMarkup(createElement(QuadroDosNumeros, { resumo }));
  assert.match(h, /<dt[^>]*>Visitas<\/dt><dd[^>]*>1\.234<\/dd>/);
  assert.match(h, /<dt[^>]*>Toques por visita<\/dt><dd[^>]*>0,38<\/dd>/);
  assert.match(h, /<caption class="sr-only">Toques em cada botão<\/caption>/);
  assert.match(h, /<td[^>]*>Falar com a vendedora<\/td><td[^>]*>300<\/td>/);
  const vazio = renderToStaticMarkup(
    createElement(QuadroDosNumeros, { resumo: resumoDoRelatorio({ visitas: 0, toques: 0, porLink: [], porDia: [] }, DOC.links) }),
  );
  assert.match(vazio, /Nenhuma visita nesses dias\. Quando o endereço estiver na bio, os números aparecem aqui\./);
});

test("registro das abas: Links, Aparência, Perfil e Divulgar; endereço e Página no ar são da Divulgar", () => {
  assert.deepEqual(
    ABAS.map((a) => [a.id, a.nome]),
    [
      ["links", "Links"],
      ["aparencia", "Aparência"],
      ["perfil", "Perfil"],
      ["divulgar", "Divulgar"],
    ],
  );
  assert.equal(abaDoErro({ campo: "slug", mensagem: "x" })?.id, "divulgar");
  assert.equal(abaDoErro({ campo: "publicada", mensagem: "x" })?.id, "divulgar");
  assert.equal(abaDoErro({ campo: "slugs", mensagem: "x" }), undefined);
  assert.equal(abaDoErro({ campo: "v", mensagem: "x" }), undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/link-da-bio/aba-divulgar.test.ts`
Expected: FAIL — `Cannot find module './aba-divulgar'`.

- [ ] **Step 3: Write `numeros-da-pagina.tsx`**

```tsx
// apps/web/src/components/painel/link-da-bio/numeros-da-pagina.tsx
"use client";

import { useEffect, useState } from "react";

import { ErroDeCarga } from "@/components/painel/erro-de-carga";
import type { LinkBio } from "@/lib/bio/documento";
import { ehRelatorioBio, resumoDoRelatorio, type ResumoDoRelatorio } from "@/lib/bio/editor-divulgar";
import type { Carga } from "@/lib/painel/types";
import type { RelatorioBio } from "@/lib/stores/bio-pages";
import { authenticatedFetch } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type PeriodoDosNumeros = 7 | 30;

const PERIODOS: readonly PeriodoDosNumeros[] = [7, 30];
const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";

/** Os números de um período (§7), já resumidos. Só desenha. */
export function QuadroDosNumeros({ resumo }: { resumo: ResumoDoRelatorio }) {
  if (resumo.vazio) {
    return (
      <p className="text-15 text-slate-600">Nenhuma visita nesses dias. Quando o endereço estiver na bio, os números aparecem aqui.</p>
    );
  }
  const numeros: readonly (readonly [string, string])[] = [
    ["Visitas", resumo.visitas],
    ["Toques", resumo.toques],
    ["Toques por visita", resumo.porVisita],
  ];
  return (
    <div className="grid gap-4">
      <dl className="grid grid-cols-3 gap-2">
        {numeros.map(([rotulo, valor]) => (
          <div key={rotulo} className="grid content-start gap-0.5 rounded-lg bg-canvas-100 p-3">
            <dt className="text-13 text-slate-600">{rotulo}</dt>
            <dd className="font-data text-28 font-bold leading-tight text-volt-950">{valor}</dd>
          </div>
        ))}
      </dl>
      {resumo.linhas.length > 0 && (
        <table className="w-full text-15">
          <caption className="sr-only">Toques em cada botão</caption>
          <thead>
            <tr className="border-b border-line-200 text-left text-13 text-slate-600">
              <th scope="col" className="py-2 font-semibold">
                Botão
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                Toques
              </th>
            </tr>
          </thead>
          <tbody>
            {resumo.linhas.map((l) => (
              <tr key={l.chave} className="border-b border-line-200 last:border-b-0">
                <td className="py-2 pr-3 text-volt-950">{l.titulo}</td>
                <td className="py-2 text-right font-data text-volt-950">{l.toques}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-13 text-slate-600">Toques por visita passa de 1 quando a mesma pessoa toca em mais de um botão.</p>
    </div>
  );
}

/** "Últimos 7/30 dias" da aba Divulgar: busca `GET /api/link-da-bio/relatorio?dias=` e mostra o resumo. */
export function NumerosDaPagina({ links }: { links: readonly LinkBio[] }) {
  const [dias, setDias] = useState<PeriodoDosNumeros>(7);
  const [tentativa, setTentativa] = useState(0);
  const [carga, setCarga] = useState<Carga>("carregando");
  const [relatorio, setRelatorio] = useState<RelatorioBio | null>(null);

  useEffect(() => {
    // Trocar de período rápido dispara duas buscas: só a última escreve.
    let valendo = true;
    setCarga("carregando");
    void (async () => {
      try {
        const r = await authenticatedFetch(`/api/link-da-bio/relatorio?dias=${dias}`, { cache: "no-store" });
        const corpo: unknown = r.ok ? await r.json() : null;
        if (!valendo) return;
        if (ehRelatorioBio(corpo)) {
          setRelatorio(corpo);
          setCarga("ok");
        } else {
          setCarga("erro");
        }
      } catch {
        if (valendo) setCarga("erro");
      }
    })();
    return () => {
      valendo = false;
    };
  }, [dias, tentativa]);

  return (
    <section aria-labelledby="bio-numeros-titulo" className="pn-card grid gap-4 rounded-xl p-4 lg:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="bio-numeros-titulo" className="font-brand text-15 font-bold text-volt-950">
          {`Últimos ${dias} dias`}
        </h2>
        <div role="group" aria-label="Período" className="flex gap-1 rounded-lg bg-canvas-100 p-1">
          {PERIODOS.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={dias === n}
              onClick={() => setDias(n)}
              className={cn(
                "min-h-11 rounded-md px-3 text-13 font-semibold",
                FOCO,
                dias === n ? "bg-paper-0 text-volt-950" : "text-slate-600 hover:text-volt-950",
              )}
            >
              {`${n} dias`}
            </button>
          ))}
        </div>
      </div>
      {carga === "carregando" && (
        <div role="status" className="grid gap-2">
          <span className="sr-only">Carregando os números…</span>
          <div aria-hidden="true" className="pn-skeleton h-20 rounded-lg" />
        </div>
      )}
      {carga === "erro" && (
        <ErroDeCarga titulo="Não deu para carregar os números." aoTentarDeNovo={() => setTentativa((n) => n + 1)} />
      )}
      {carga === "ok" && relatorio && <QuadroDosNumeros resumo={resumoDoRelatorio(relatorio, links)} />}
    </section>
  );
}
```

- [ ] **Step 4: Write `aba-divulgar.tsx`**

```tsx
// apps/web/src/components/painel/link-da-bio/aba-divulgar.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Copy, Download } from "lucide-react";

import { Interruptor } from "@/components/painel/instagram/interruptor";
import { useToast } from "@/components/toast";
import { enderecoPrincipal, type ContextoDoEditor } from "@/lib/bio/editor";
import {
  avisoDoSlug,
  ehRespostaDoSlug,
  motivoLocalDoSlug,
  prefixoDoSlug,
  slugDoCampo,
  textoDoNoAr,
  type AvisoDoSlug,
  type ConsultaDoSlug,
} from "@/lib/bio/editor-divulgar";
import type { RespostaDoSlug } from "@/lib/bio/painel-api";
import type { PaginaBio } from "@/lib/stores/bio-pages";
import { authenticatedFetch } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import type { PropsDaAba } from "./abas";
import { AvisoDaAba, useErroDaAba, type ErroDaAba } from "./erro-da-aba";
import { NumerosDaPagina } from "./numeros-da-pagina";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";
const ROTULO = "text-15 font-semibold text-volt-950";
const AJUDA = "text-13 text-slate-600";
const SECUNDARIO = `inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-line-200 bg-paper-0 px-4 text-15 font-semibold text-volt-950 transition-colors hover:border-slate-600 ${FOCO}`;
const CARTAO = "pn-card grid gap-4 rounded-xl p-4 lg:p-5";
const TITULO = "font-brand text-15 font-bold text-volt-950";
const TOM: Readonly<Record<AvisoDoSlug["tom"], string>> = {
  neutro: "text-slate-600",
  ok: "text-success-700",
  erro: "font-medium text-danger-700",
};

/** Os campos da aba que mostram erro do salvar; o resto vai pro aviso do topo. */
const LUGARES_DO_DIVULGAR: readonly string[] = ["slug"];
/** A conferência espera a digitação parar (§8, "com atraso"). */
const ESPERA_DO_SLUG_MS = 400;

/** O endereço digitado está livre? 400 ms depois da última tecla; só a última resposta vale. */
function useConsultaDoSlug(slug: string, salvo: string): ConsultaDoSlug | null {
  const [consulta, setConsulta] = useState<ConsultaDoSlug | null>(null);
  const conferir = slug !== salvo && motivoLocalDoSlug(slug) === null;
  useEffect(() => {
    if (!conferir) return;
    let valendo = true;
    const espera = setTimeout(() => {
      void (async () => {
        let resposta: RespostaDoSlug | null = null;
        try {
          const r = await authenticatedFetch(`/api/link-da-bio/slug?valor=${encodeURIComponent(slug)}`, { cache: "no-store" });
          const corpo: unknown = r.ok ? await r.json() : null;
          if (ehRespostaDoSlug(corpo)) resposta = corpo;
        } catch {
          // Sem rede: `resposta` fica null e a tela diz que não deu pra conferir (o PATCH confere de novo).
        }
        if (valendo) setConsulta({ slug, resposta });
      })();
    }, ESPERA_DO_SLUG_MS);
    return () => {
      valendo = false;
      clearTimeout(espera);
    };
  }, [slug, conferir]);
  return consulta;
}

function CartaoNoAr({ pagina, publicada, aoMudar }: { pagina: PaginaBio; publicada: boolean; aoMudar: (publicada: boolean) => void }) {
  const bloqueada = pagina.bloqueadaEm !== null;
  return (
    <section aria-labelledby="bio-no-ar-titulo" className={CARTAO}>
      <div className="flex items-center gap-3">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h2 id="bio-no-ar-titulo" className={TITULO}>
            Página no ar
          </h2>
          <p className={AJUDA}>{textoDoNoAr(publicada, pagina.publicada, bloqueada)}</p>
        </div>
        <Interruptor ligado={publicada && !bloqueada} aoMudar={aoMudar} rotulo="Página no ar" desabilitado={bloqueada} />
      </div>
    </section>
  );
}

function CartaoEndereco({
  pagina,
  slug,
  contexto,
  erros,
  aoMudarSlug,
  aoCopiar,
}: {
  pagina: PaginaBio;
  slug: string;
  contexto: ContextoDoEditor;
  erros: ErroDaAba;
  aoMudarSlug: (slug: string) => void;
  aoCopiar: (url: string) => void;
}) {
  const consulta = useConsultaDoSlug(slug, pagina.slug);
  const prefixo = prefixoDoSlug(contexto.origemGirumo);
  const doSalvar = erros.erroDe("slug");
  const aviso: AvisoDoSlug = doSalvar ? { texto: doSalvar, tom: "erro" } : avisoDoSlug(slug, pagina.slug, consulta, prefixo);
  // O endereço que vai na bio é sempre o SALVO (§2, §8); o slug em edição só vale depois do Salvar.
  const principal = enderecoPrincipal(contexto, pagina.slug);
  return (
    <section aria-labelledby="bio-endereco-titulo" className={CARTAO}>
      <h2 id="bio-endereco-titulo" className={TITULO}>
        Endereço da página
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-[1_1_220px] break-all font-data text-15 font-medium text-volt-950">{principal}</p>
        <button type="button" onClick={() => aoCopiar(principal)} className={SECUNDARIO}>
          <Copy className="h-4 w-4" aria-hidden="true" />
          Copiar o endereço
        </button>
      </div>
      {contexto.dominio && <p className={AJUDA}>No seu domínio. O endereço na Girumo, aqui embaixo, também abre a página.</p>}
      <div className="grid gap-1.5">
        <label htmlFor="bio-slug" className={ROTULO}>
          Endereço na Girumo
        </label>
        <div
          className={cn(
            "flex min-h-11 items-center rounded-lg border bg-paper-0 focus-within:outline-2 focus-within:outline-cobalt-500",
            aviso.tom === "erro" ? "border-danger-700" : "border-line-200",
          )}
        >
          <span aria-hidden="true" className="whitespace-nowrap pl-3 font-data text-[16px] text-slate-600">
            {prefixo}
          </span>
          <input
            type="text"
            id="bio-slug"
            value={slug}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={aviso.tom === "erro" ? true : undefined}
            aria-describedby="bio-slug-msg"
            onChange={(e) => {
              erros.corrigiu("slug");
              aoMudarSlug(slugDoCampo(e.target.value));
            }}
            className="min-h-11 min-w-0 flex-1 rounded-r-lg bg-transparent py-2.5 pr-3 font-data text-[16px] text-volt-950 outline-none"
          />
        </div>
        <p id="bio-slug-msg" aria-live="polite" className={cn("text-13", TOM[aviso.tom])}>
          {aviso.texto}
        </p>
        {slug !== pagina.slug && (
          <p className={AJUDA}>
            {`Quando você salvar, o endereço antigo (${prefixo}${pagina.slug}) passa a levar pro novo. Quem tiver o QR ou o link antigo continua chegando.`}
          </p>
        )}
      </div>
    </section>
  );
}

function CartaoInstagram() {
  return (
    <section aria-labelledby="bio-instagram-titulo" className={CARTAO}>
      <h2 id="bio-instagram-titulo" className={TITULO}>
        Pôr na bio do Instagram
      </h2>
      <ol className="grid list-decimal gap-1.5 pl-5 text-15 text-volt-950">
        <li>Toque em Copiar o endereço, aqui em cima.</li>
        <li>No Instagram, abra o seu perfil e toque em Editar perfil.</li>
        <li>Em Links, toque em Adicionar link externo, cole o endereço e salve.</li>
      </ol>
    </section>
  );
}

/**
 * QR do endereço na Girumo com o slug SALVO, mesmo com domínio próprio: vai impresso na sacola e
 * sobrevive à troca de endereço (o antigo leva ao novo, §2) e à de domínio. Gerado no navegador,
 * como o QR da campanha (`campanhas/qr-link.tsx`): o link não sai da máquina.
 */
function CartaoQr({ endereco, slug }: { endereco: string; slug: string }) {
  const qr = useRef<HTMLCanvasElement>(null);
  function baixar() {
    const canvas = qr.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `qr-link-da-bio-${slug}.png`;
    a.click();
  }
  return (
    <section aria-labelledby="bio-qr-titulo" className={CARTAO}>
      <div className="flex flex-wrap items-center gap-4">
        <QRCodeCanvas
          ref={qr}
          value={endereco}
          size={512}
          level="M"
          marginSize={4}
          bgColor="#FFFFFF"
          fgColor="#071923"
          style={{ width: 128, height: 128 }}
          aria-label={`QR code que abre ${endereco}`}
          className="flex-none rounded-lg ring-1 ring-line-200"
        />
        <div className="grid min-w-0 flex-[1_1_220px] gap-2">
          <h2 id="bio-qr-titulo" className={TITULO}>
            QR code
          </h2>
          <p className={AJUDA}>
            Pra imprimir na sacola, na etiqueta e no balcão. Ele abre o endereço na Girumo, que continua valendo mesmo depois de
            trocar o endereço ou o domínio.
          </p>
          <button type="button" onClick={baixar} className={cn(SECUNDARIO, "w-fit")}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Baixar o QR code
          </button>
        </div>
      </div>
    </section>
  );
}

/** Aba Divulgar (spec §8): no ar, o endereço (com o slug editável), o Instagram, o QR e os números. */
export function AbaDivulgar({ pagina, rascunho, contexto, mudarPagina, erro, limparErro }: PropsDaAba) {
  const toast = useToast();
  const erros = useErroDaAba(erro, limparErro, LUGARES_DO_DIVULGAR, pagina.versao);

  async function copiar(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast("Endereço copiado. Agora é só colar na bio.");
    } catch {
      toast("Não deu pra copiar. Selecione o endereço e copie à mão.", "error");
    }
  }

  return (
    <div className="grid gap-4">
      {erros.erroSolto && <AvisoDaAba mensagem={erros.erroSolto} />}
      <CartaoNoAr pagina={pagina} publicada={rascunho.publicada} aoMudar={(publicada) => mudarPagina({ publicada })} />
      <CartaoEndereco
        pagina={pagina}
        slug={rascunho.slug}
        contexto={contexto}
        erros={erros}
        aoMudarSlug={(slug) => mudarPagina({ slug })}
        aoCopiar={(url) => void copiar(url)}
      />
      <CartaoInstagram />
      <CartaoQr endereco={enderecoPrincipal({ dominio: null, origemGirumo: contexto.origemGirumo }, pagina.slug)} slug={pagina.slug} />
      {/* Os títulos vêm da versão salva: é ela que está no ar e que recebe os toques. */}
      <NumerosDaPagina links={pagina.documento.links} />
    </div>
  );
}
```

- [ ] **Step 5: Registrar a aba e atualizar os testes do 6a** — em `abas.tsx`, logo depois de `import { AbaAparencia } from "./aba-aparencia";`:

```tsx
import { AbaDivulgar } from "./aba-divulgar";
```

e, no fim do `ABAS` (depois da entrada `perfil`):

```tsx
  { id: "divulgar", nome: "Divulgar", dona: (campo) => campo === "slug" || campo === "publicada", Conteudo: AbaDivulgar },
```

Em `aba-links.test.ts`, trocar `assert.equal(abaDoErro({ campo: "slug", mensagem: "x" }), undefined);` por:

```ts
  assert.equal(abaDoErro({ campo: "slug", mensagem: "x" })?.id, "divulgar");
```

Em `editor.test.ts` (o da pasta `components/painel/link-da-bio`), no teste "409 vira aviso com Recarregar…", trocar o bloco

```ts
  assert.match(
    html({ erro: { campo: "slug", mensagem: "Esse endereço já é de outra loja." } }),
    /role="alert"[^>]*>Esse endereço já é de outra loja\.</,
  );
```

por:

```ts
  // Campo que nenhuma aba mostra (o `v` do documento) vira aviso no topo; o `slug` é da Divulgar desde o 6b.
  assert.match(
    html({ erro: { campo: "v", mensagem: "Esse documento é de uma versão que o painel não conhece." } }),
    /role="alert"[^>]*>Esse documento é de uma versão que o painel não conhece\.</,
  );
  assert.doesNotMatch(html({ erro: { campo: "slug", mensagem: "Endereço em uso." } }), /role="alert"[^>]*>Endereço em uso\./);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/components/painel/link-da-bio/aba-divulgar.test.ts src/components/painel/link-da-bio/aba-links.test.ts src/components/painel/link-da-bio/editor.test.ts src/components/painel/link-da-bio/aba-aparencia.test.ts src/components/painel/link-da-bio/aba-perfil.test.ts`
Expected: PASS (8 novos; os do 6a, 6b1 e da Task 9 verdes).

- [ ] **Step 7: Typecheck e lint**

Run: `npx tsc --noEmit --project tsconfig.json` · `npm run painel:check` · `npm run brand:check` · `npx eslint src/components/painel/link-da-bio`
Expected: tudo verde.

- [ ] **Step 8: Commit**

```bash
git add src/components/painel/link-da-bio/numeros-da-pagina.tsx src/components/painel/link-da-bio/aba-divulgar.tsx src/components/painel/link-da-bio/aba-divulgar.test.ts src/components/painel/link-da-bio/abas.tsx src/components/painel/link-da-bio/aba-links.test.ts src/components/painel/link-da-bio/editor.test.ts
git commit -m "feat(link-da-bio): share tab (publish, address with availability check, QR, last 7/30 days)"
```

### Task 12: "Link da bio" no menu

**Files:**
- Modify: `apps/web/src/lib/painel-nav.ts`
- Modify: `apps/web/src/lib/painel-nav.test.ts` (import e um teste no fim)
- Modify: `apps/web/e2e/painel-vitrine-casca.spec.ts` (teste "Mais lista os modulos por grupo…")

**Interfaces:**
- Consumes: `type NavItem` e os arrays de `painel-nav.ts`; `Link2` de `lucide-react`; a rota `/painel/link-da-bio` (6a).
- Produces: item `{ href: "/painel/link-da-bio", label: "Link da bio", icon: Link2, grupo: "lotar" }` em `NAV_GROUPS` (grupo "Crescimento", logo depois de Páginas) e, por tabela, em `NAV_ALL`; fora de `NAV_BARRA_DESKTOP`, `NAV_BARRA_ESQUERDA`, `NAV_BARRA_DIREITA` e `NAV_MOBILE_PRIMARY`.

- [ ] **Step 1: Write the failing test** — em `painel-nav.test.ts`, logo depois de `import path from "node:path";`:

```ts
import { Link2 } from "lucide-react";
```

e no fim do arquivo:

```ts
test("Link da bio fica em Lotar logo depois de Páginas, fora das barras, e a vendedora não vê", () => {
  const lotar = NAV_ALL.filter((i) => i.grupo === "lotar").map((i) => i.href);
  assert.equal(lotar.indexOf("/painel/link-da-bio"), lotar.indexOf("/painel/pages") + 1);
  const bio = item("/painel/link-da-bio");
  assert.equal(bio.label, "Link da bio");
  assert.equal(bio.icon, Link2);
  assert.equal(bio.modulo, undefined);
  for (const barra of [NAV_BARRA_DESKTOP, NAV_BARRA_ESQUERDA, NAV_BARRA_DIREITA, NAV_MOBILE_PRIMARY]) {
    assert.ok(!barra.some((i) => i.href === "/painel/link-da-bio"));
  }
  assert.ok(visiveis(DONO).includes("/painel/link-da-bio"));
  assert.ok(visiveis(OPERADOR).includes("/painel/link-da-bio"));
  assert.ok(!visiveis(VENDEDORA_POSTA).includes("/painel/link-da-bio"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/painel-nav.test.ts`
Expected: FAIL só no teste novo (`item("/painel/link-da-bio")` é `undefined`).

- [ ] **Step 3: Implement** — em `painel-nav.ts`, no import do `lucide-react`, logo depois de `PanelsTopLeft,`:

```ts
  Link2,
```

logo depois de `const PAGINAS: NavItem = …`:

```ts
/** Link da bio (spec 2026-10-19 §8): em Lotar, logo depois de Páginas; nunca nas barras. */
const LINK_DA_BIO: NavItem = { href: "/painel/link-da-bio", label: "Link da bio", icon: Link2, grupo: "lotar" };
```

e trocar `{ title: "Crescimento", items: [PAGINAS, RESULTADOS] },` por:

```ts
  { title: "Crescimento", items: [PAGINAS, LINK_DA_BIO, RESULTADOS] },
```

- [ ] **Step 4: e2e do "Mais"** — em `e2e/painel-vitrine-casca.spec.ts`, no teste "Mais lista os modulos por grupo com o estado de cada um", logo depois de `await expect(folha.getByRole("link", { name: "Configurações" })).toBeVisible();`:

```ts
    await expect(folha.getByRole("link", { name: "Link da bio" })).toBeVisible();
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/painel-nav.test.ts` e `npx tsc --noEmit --project tsconfig.e2e.json`
Expected: PASS (todos, inclusive "every navigation destination is a route that exists" e "dono e operador veem o menu de antes"); o `tsc` do e2e sem erro. O e2e roda no CI (precisa do servidor e da conta de QA).

- [ ] **Step 6: Commit**

```bash
git add src/lib/painel-nav.ts src/lib/painel-nav.test.ts e2e/painel-vitrine-casca.spec.ts
git commit -m "feat(link-da-bio): Link da bio menu item in Lotar, after Pages"
```

### Task 13: Gate, conferência, PR e quadro (Parte 2)

**Files:** nenhum novo.

**Interfaces:**
- Consumes: Tasks 8–12.
- Produces: PR da Parte 2 mergeado; card `link-da-bio` em `no_ar_nao_verificado`; decisão no grafo.

- [ ] **Step 1: Gate local** — em `apps/web`: `npm test` (verde, com os 27 testes novos: 6 da Task 8, 5 da 9, 7 da 10, 8 da 11 e 1 da 12). Depois, em PowerShell, na raiz do worktree:

```
Set-Location <caminho do worktree bio-6b2>; & .\infra\scripts\verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
```

Expected: `EXIT=0`.

- [ ] **Step 2: Conferir no navegador** — onde roda, como no Step 2 da Task 7: dev local só com as `E2E_SUPABASE_*` no ambiente; sem elas, o CI valida antes do merge (testes, build, o smoke da rota e o e2e do "Mais" desta parte) e este roteiro roda em produção depois do merge (Step 5), numa loja de teste:
  - 390: "Mais" → Lotar mostra Campanhas, (Instagram, se liberado), Páginas e **Link da bio**; no computador, o "Mais" da barra também; a barra de cima e a de baixo não mudaram; logado como vendedora, o item não aparece;
  - Aparência: as 4 miniaturas mostram a loja de teste em cada modelo, sem animar; Tab passa direto pelas miniaturas e para nos botões dos modelos (o anel aparece no cartão inteiro); tocar "Vitrine" → a prévia toca a entrada, e a paleta é a que a miniatura mostrava; "Rosa chiclete" → a prévia muda sem animar; "Cores da sua marca" → os 2 seletores; arrastar o seletor do fundo → a prévia acompanha depois da pausa; digitar `#1b1a17` no código do fundo → vira `#1B1A17`; um fundo bem claro com botão bem claro → a página acerta o tom do texto (legível); desligar a animação → "Rever a animação" desliga;
  - Divulgar: "Página no ar" → "Vai pro ar quando você salvar." → Salvar → chip "No ar" e a página abre no endereço; digitar o slug de outra loja de teste → depois de ~0,4 s, "Esse endereço já está em uso. Escolha outro."; `loja-girumo` → reservado na hora; um livre → "Livre: …"; salvar → o endereço antigo leva ao novo (301); "Copiar o endereço" → toast; "Baixar o QR code" → PNG `qr-link-da-bio-<slug>.png`, que a câmera do celular abre; abrir a página duas vezes e tocar um botão → em "Últimos 7 dias" (depois do cache do relatório), visitas 2, toques 1, "0,5"; "30 dias" troca a busca;
  - loja de teste com domínio próprio ativo (se houver uma no ambiente): "No seu domínio", e o QR continua com o endereço da Girumo;
  - 390, Tab do começo ao fim das três abas novas com alteração pendente: nada focado atrás das barras fixas.

- [ ] **Step 3: PR** — atualizar com `origin/main` se atrasada; push com `-u`; `gh pr create` com o título "feat(link-da-bio): abas Aparência e Divulgar e o item no menu (PR 6b, parte 2)" e o corpo com: o que entra (miniaturas vivas, paletas e cores da marca, Divulgar com conferência do endereço, QR, números, item no menu), as decisões (miniatura = toque, paleta não apaga `cores`, QR com o endereço da Girumo, "toques por visita", slug conferido em duas camadas), prints em 1280 e 390 das três abas e o plano de teste; terminar com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 4: CI e merge** — `gh pr checks <N> --watch`; verde → `gh pr merge <N> --squash --delete-branch`. Vermelho no e2e do "Mais" só por timeout de rede → rerun, nunca afrouxar.

- [ ] **Step 5: Prova depois do deploy** — em produção, numa loja de teste, pelo **menu**: o roteiro do Step 2 inteiro, se ele não rodou antes do PR; e, de todo jeito, montar, publicar, abrir o endereço no celular, ler o QR e conferir os números no dia seguinte. Print no PR. A página da loja-piloto só com o OK do Igor.

- [ ] **Step 6: Quadro** — o Igor roda em prod (o `move_card` não limpa o `blocker`: o `update` vem junto):

```sql
select public.move_card('link-da-bio', 'no_ar_nao_verificado', 'Link da bio no menu (Lotar) com Links, Aparência, Perfil e Divulgar', 'PR #<N>');
update public.board_features
   set blocker = 'Falta: rastreio (PR 7) e a prova do §13 (página publicada da loja de teste com o relatório, domínio próprio da piloto, Lighthouse ≥ 90).'
 where key = 'link-da-bio'
returning key, status, blocker;
```

- [ ] **Step 7: Grafo** — sugerir ao Igor (PowerShell):

```
rag insert "decisão: painel do link da bio (6b) — erro do salvar por aba com useErroDaAba (lugarDoErro + idNaTela: perfil.nome -> bio-perfil-nome; sem campo, aviso no topo da aba); a prévia espera 300 ms e a miniatura de modelo é o mesmo QuadroDaPrevia com inert; miniatura = o que o toque dá (comModelo); uploadMediaFile manda Bearer + x-tenant-id (loja aberta); QR = endereço Girumo com o slug salvo; números em toques por visita, nunca % que tocou." --source decisao-2026-10-19-link-da-bio-6b
```

Encerrar com "PRs que deixei abertos: nenhum" (ou o número e o motivo).

---

## Critérios de aceite do PR

**Parte 1**
- Aba **Perfil** depois de Links: foto da loja (escolher, trocar, remover, ajustar o foco com o `CropFocal` e "Pronto"), descrição da foto, logo clara e escura; nome (1–60), frase com contador (até 120), 3 destaques em campos fixos, onde fica, @ (limpo ao digitar ou colar o link do perfil), "Antes de pagar, confere" (interruptor, razão, CNPJ com máscara — com letras também — e aviso com 14 caracteres errados, 2 avisos) e "Feito com Girumo". Sem "Avançado".
- Foto e logo sobem direto pro Storage (`lp-media`, `lp-logo`) na **loja aberta**; PNG, JPEG ou WebP; 10 MB na foto, 5 MB na logo; erro em português antes do envio.
- Folha de link: até 3 fotos no "Catálogo ou site"/"Outro link" e a foto da fachada no "Como chegar"; trocar a foto apaga o erro geral.
- Erro do salvar: a tela vai para a aba, a frase fica embaixo do campo (`aria-describedby`, `aria-invalid`), o foco chega nele; sem campo na aba → aviso no topo (`bio-aba-aviso`); some ao corrigir e no próximo salvar que dá certo.
- Prévia redesenha 300 ms depois da última mudança; link novo continua tocando a entrada na hora.
- 21 testes novos verdes; `painel:check`, `brand:check`, os dois `tsc`, lint e build verdes; Postar sobe imagem e vídeo como antes.

**Parte 2**
- Aba **Aparência**: 4 modelos com miniatura viva (o mesmo renderizador, `inert`, `tabindex="-1"`, `aria-hidden`, com os dados da loja e a paleta que o toque daria), botão por modelo com `aria-pressed` e descrição; trocar de modelo toca a entrada; 4 paletas do modelo + "Cores da sua marca" (seletor e código #RRGGBB, contraste acertado pelo `coresDoModelo`); "Animação de entrada" + "Rever a animação".
- Aba **Divulgar**: "Página no ar" (o que muda ao salvar; bloqueada trava); endereço principal com "Copiar o endereço"; endereço na Girumo com o slug editável (formato e reservado na hora, "em uso" pela API 400 ms depois, aviso de que o antigo leva ao novo, erro do 409 embaixo do campo); passo a passo do Instagram; QR do endereço da Girumo com "Baixar o QR code" (PNG); "Últimos 7/30 dias" com visitas, toques, toques por visita e a tabela por botão.
- Menu: "Link da bio" (`Link2`) em Lotar, logo depois de Páginas; fora das barras; vendedora não vê; o e2e do "Mais" encontra o item.
- 27 testes novos verdes; gate e build verdes; card `link-da-bio` em `no_ar_nao_verificado`.

## Comandos de verificação

Em `apps/web` do worktree:

```
npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/editor.test.ts src/lib/bio/editor-perfil.test.ts src/components/painel/link-da-bio/campo-de-foto.test.ts src/components/painel/link-da-bio/aba-perfil.test.ts src/components/painel/link-da-bio/folha-de-link.test.ts src/components/painel/link-da-bio/previa.test.ts
npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/editor-aparencia.test.ts src/lib/bio/editor-divulgar.test.ts src/components/painel/link-da-bio/aba-aparencia.test.ts src/components/painel/link-da-bio/aba-divulgar.test.ts src/components/painel/link-da-bio/aba-links.test.ts src/components/painel/link-da-bio/editor.test.ts src/lib/painel-nav.test.ts
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

- **`uploadMediaFile` muda para o painel todo.** Com Bearer e `x-tenant-id`, o arquivo cai na loja aberta em Postar, Páginas e Biblioteca também — é o certo, mas é mudança de comportamento para quem tem duas lojas. O `/api/media/prepare` e o `/api/media/register` já aceitam Bearer (`resolveMediaAuth`); o roteiro da Task 7 sobe imagem e vídeo no Postar.
- **Premissas sobre o PR 2.** O caminho do zod tem de ser o do campo (`perfil.nome`, `perfil.instagram`, `confere.cnpj`) — os testes "frases do Perfil…" (Task 2) e "CNPJ com máscara…" (Task 4) acusam; `cores` precisa ser aceito com paleta pronta (Task 8); `SLUG_BIO` com o 3–40 (Task 10). O `formatarCnpj` do 3a só formata CNPJ numérico (`/^\d{14}$/`): o CNPJ com letras sai sem pontuação na página pública — avisar o dono do 3a; o painel mascara os dois.
- **Cinco iframes na Aparência.** A prévia e 4 miniaturas renderizam a página inteira; cada mudança redesenha as 5 depois de 300 ms. O `useMemo` segura o HTML entre renders e as abas desmontam ao trocar; em celular fraco, se pesar, as miniaturas passam a usar só o documento sem os links (hoje usam tudo). As fontes das miniaturas dependem do mesmo `Access-Control-Allow-Origin: *` da prévia (6a).
- **`CropFocal` carrega a foto inteira** (`/api/p/media/<id>`, sem o otimizador) quando a lojista abre "Ajustar o foco": até 10 MB no 4G, só nesse momento. O componente é do editor de Páginas; trocar para `urlDaImagem` lá vale para os dois e fica fora deste PR. Ele também usa texto de 12 px (o painel pede 13): reaproveitado como está.
- **Conferência do endereço.** Uma chamada por pausa de 400 ms; resposta fora de ordem é descartada (`consulta.slug`). Quem decide é o PATCH: o 409 de slug (corrida entre conferir e salvar) cai embaixo do campo. Se a rota limitar requisições, o aviso vira "Não deu pra conferir agora…" sem travar nada.
- **QR no domínio próprio.** O QR leva o endereço da Girumo de propósito; quem preferir o domínio no QR é uma linha (`CartaoQr`). Se o Igor decidir isso, registrar no grafo.
- **`inert` e `has-[:focus-visible]`.** Navegador sem `inert` (Safari < 15.5) ainda deixa a miniatura fora do Tab (`tabindex=-1`), muda (`sandbox=""`) e escondida (`aria-hidden`); sem `:has`, o anel de foco do cartão do modelo some — o botão continua acessível pelo nome.
- **Testes do 6a mudam na Parte 2** (o `slug` ganha dona). Branch aberta que mexa em `aba-links.test.ts` ou `editor.test.ts` do painel conflita: resolver mantendo as duas mudanças.
- **Números do dia.** O relatório agrega por dia em Brasília (PR 5) e pode ter cache: a conferência dos números na Task 13 olha no dia seguinte, não no mesmo minuto.

## Interface com os outros PRs

### O que este PR exporta

`apps/web/src/lib/media-upload-client.ts` (Parte 1; mesma assinatura, agora na loja aberta):

```ts
export async function uploadMediaFile(file: File, kind?: MediaKind): Promise<MediaUploadResult>;
```

`apps/web/src/lib/bio/editor.ts` (Parte 1, acrescenta ao do 6a):

```ts
export function idNaTela(campo: string): string;                                     // "perfil.nome" → "bio-perfil-nome"
export function lugarDoErro(campo: string, lugares: readonly string[]): string | null; // o lugar mais longo que cobre o caminho
export function erroNoCampo(documento: DocumentoBio, campo: string): string | null;   // o mesmo documentoBio, só neste caminho
// MENSAGENS_DOS_CAMPOS ganha "perfil.nome", "perfil.instagram" e "confere.cnpj"
```

`apps/web/src/lib/bio/editor-perfil.ts` (Parte 1):

```ts
export const FOTO_ACEITA: readonly ["image/png", "image/jpeg", "image/webp"];
export type TipoDeFoto = "lp-media" | "lp-logo";
export const MAX_FOTOS_DO_LINK = 3;
export function problemaDaImagem(arquivo: { type: string; size: number }, tipo: TipoDeFoto): string | null;
export function cnpjDoCampo(valor: string): string;       // sem pontuação, maiúsculo, até 14 (CNPJ com letras vale)
export function mascaraDoCnpj(cnpj: string): string;      // "11.222.333/0001-81" conforme digita
export function instagramDoCampo(valor: string): string;
export function camposDaLista(lista: readonly string[], total: number): string[];
export function listaDosCampos(campos: readonly string[]): string[];
export function refDoCrop(m: MidiaRef): LpMediaRef;
export function focoDoCrop(r: LpMediaRef): { x: number; y: number };
```

`apps/web/src/lib/bio/editor-aparencia.ts` (Parte 2):

```ts
export const NOME_DA_PALETA: Readonly<Record<(typeof PALETAS)[Modelo][number], string>>;
export const DESCRICAO_DO_MODELO: Readonly<Record<Modelo, string>>;
export type CoresDaMarca = NonNullable<DocumentoBio["cores"]>;
export function amostraDaPaleta(modelo: Modelo, paleta: string): readonly [fundo: string, botao: string];
export function paletaAoTrocar(paleta: string, modelo: Modelo): string;
export function comModelo(d: DocumentoBio, modelo: Modelo): DocumentoBio;
export function coresDaMarca(d: DocumentoBio): CoresDaMarca;
export function corDoSeletor(valor: string): string | null;
```

`apps/web/src/lib/bio/editor-divulgar.ts` (Parte 2):

```ts
export function slugDoCampo(valor: string): string;
export function motivoLocalDoSlug(slug: string): Exclude<MotivoDoSlug, "em-uso"> | null;
export type ConsultaDoSlug = { slug: string; resposta: RespostaDoSlug | null };
export type AvisoDoSlug = { texto: string; tom: "neutro" | "ok" | "erro" };
export function avisoDoSlug(slug: string, salvo: string, consulta: ConsultaDoSlug | null, prefixo: string): AvisoDoSlug;
export function prefixoDoSlug(origemGirumo: string): string;
export function ehRespostaDoSlug(v: unknown): v is RespostaDoSlug;
export function textoDoNoAr(publicada: boolean, salva: boolean, bloqueada: boolean): string;
export function ehRelatorioBio(v: unknown): v is RelatorioBio;
export type LinhaDoRelatorio = { chave: string; titulo: string; toques: string };
export type ResumoDoRelatorio = { vazio: boolean; visitas: string; toques: string; porVisita: string; linhas: LinhaDoRelatorio[] };
export function resumoDoRelatorio(r: RelatorioBio, links: readonly LinkBio[]): ResumoDoRelatorio;
```

Componentes (`apps/web/src/components/painel/link-da-bio/`):

```ts
// erro-da-aba.tsx (Parte 1)
export const ID_DO_AVISO_DA_ABA = "bio-aba-aviso";
export type ErroDaAba = { erroDe: (lugar: string) => string | undefined; erroSolto: string | null; corrigiu: (lugar: string) => void };
export function useErroDaAba(erro: ErroDeCampo | null, limparErro: () => void, lugares: readonly string[], versao: number): ErroDaAba;
export function AvisoDaAba(p: { mensagem: string }): React.JSX.Element;
// campo-de-foto.tsx (Parte 1)
export type FormatoDaFoto = "foto" | "logo-clara" | "logo-escura";
export type PropsDoCampoDeFoto = {
  id: string; rotulo: string; nome: string; ajuda?: string; tipo: TipoDeFoto; formato: FormatoDaFoto;
  valor: MidiaRef | null; aoMudar: (foto: MidiaRef | null) => void; erro?: string; acoes?: ReactNode;
};
export function CampoDeFoto(p: PropsDoCampoDeFoto): React.JSX.Element;
export type PropsDoCampoDeFotos = { id: string; valor: readonly MidiaRef[]; aoMudar: (fotos: MidiaRef[]) => void };
export function CampoDeFotos(p: PropsDoCampoDeFotos): React.JSX.Element;
// aba-perfil.tsx (Parte 1), aba-aparencia.tsx e aba-divulgar.tsx (Parte 2)
export function AbaPerfil(p: PropsDaAba): React.JSX.Element;
export function AbaAparencia(p: PropsDaAba): React.JSX.Element;
export function AbaDivulgar(p: PropsDaAba): React.JSX.Element;
// numeros-da-pagina.tsx (Parte 2)
export type PeriodoDosNumeros = 7 | 30;
export function QuadroDosNumeros(p: { resumo: ResumoDoRelatorio }): React.JSX.Element;
export function NumerosDaPagina(p: { links: readonly LinkBio[] }): React.JSX.Element;
// folha-de-link.tsx (6a; Parte 1 acrescenta ao PropsDoConteudoDaFolha)
//   aoFotos: (fotos: MidiaRef[]) => void; aoFoto: (foto: MidiaRef | null) => void
// previa.tsx (6a; espera de 300 ms na Parte 1, `miniatura` na Parte 2)
export function QuadroDaPrevia(p: { dados: DadosRender; rodada: number; className?: string; miniatura?: boolean }): React.JSX.Element;
// abas.tsx (6a): ABAS = links, aparencia, perfil, divulgar
//   aparencia: /^(modelo|paleta|cores|animar)(\.|$)/ · perfil: /^(perfil|confere|feitoComGirumo)(\.|$)/ · divulgar: "slug" | "publicada"
```

Fora da pasta:

- `apps/web/src/lib/painel-nav.ts`: item `{ href: "/painel/link-da-bio", label: "Link da bio", icon: Link2, grupo: "lotar" }` em `NAV_GROUPS` (logo depois de Páginas) e em `NAV_ALL`; fora das barras.
- `apps/web/e2e/painel-vitrine-casca.spec.ts`: o "Mais" lista "Link da bio".
- Ids que viram contrato (testes, roteiro e PR 7): `idNaTela(caminho)` para todo campo do documento (`bio-perfil-nome`, `bio-perfil-destaques-0..2`, `bio-confere-cnpj`, `bio-confere-linhas-0..1`, `bio-cores-fundo`, `bio-slug` …), `bio-aba-aviso`, `bio-perfil-ajustar-foco`, `bio-perfil-foco`, `bio-link-fotos`, `bio-link-foto`, `bio-slug-msg`, `bio-cores-fundo-hex`/`bio-cores-botao-hex`, `bio-modelo-<modelo>-desc`; títulos `bio-fotos-titulo`, `bio-textos-titulo`, `bio-confere-titulo`, `bio-selo-titulo`, `bio-modelo-titulo`, `bio-cores-titulo`, `bio-animacao-titulo`, `bio-no-ar-titulo`, `bio-endereco-titulo`, `bio-instagram-titulo`, `bio-qr-titulo`, `bio-numeros-titulo`.

### O que este PR usa de outros PRs

| Símbolo | Arquivo | PR |
|---|---|---|
| `documentoBio`, `documentoPadrao`, `MODELOS`, `PALETAS`, `SLUG_BIO`, `slugReservado`, `type DocumentoBio`, `type LinkBio`, `type MidiaRef`, `type Modelo`, `type DadosRender` | `apps/web/src/lib/bio/documento.ts` | 2 |
| `coresDoModelo(modelo, paleta, cores): TokensBio` (chaves com `--`) | `apps/web/src/lib/bio/cores.ts` | 2 |
| `type PaginaBio`, `type RelatorioBio` (só tipo: `server-only`) | `apps/web/src/lib/stores/bio-pages.ts` | 2 |
| `urlDaImagem(id: string, largura: number): string \| null`, `pontoDoFoco(foco: MidiaRef["foco"]): { x: number; y: number } \| null` | `apps/web/src/lib/bio/render/partes.ts` | 3a |
| `renderPaginaBio` (via `QuadroDaPrevia`), com os 4 modelos | `apps/web/src/lib/bio/render/index.ts` | 3a + 3b |
| `documentoFalso()`, `IDS` (testes) | `apps/web/src/test/bio-dados-falsos.ts` | 3a |
| `type MotivoDoSlug`, `type RespostaDoSlug` (só tipo: `server-only`); `GET /api/link-da-bio/slug?valor=`; `GET /api/link-da-bio/relatorio?dias=7\|30`; PATCH 409 `{ error, motivo: "slug" }` e 400 `{ error, campo }` | `apps/web/src/lib/bio/painel-api.ts` e `app/api/link-da-bio/**` | 5 |
| `type PropsDaAba`, `ABAS`, `abaDoErro`; `useEditorBio` (indireto), `focarDepois`; `dadosDaPrevia`, `NOME_DO_MODELO`, `enderecoPrincipal`, `mesmoConteudo`, `MENSAGENS_DOS_CAMPOS`, `mensagemDoCampo`, `estadoDe`, `type ContextoDoEditor`, `type ErroDeCampo`, `type EstadoSalvavel`; `QuadroDaPrevia`; `ConteudoDaFolha`/`FolhaDeLink` | `apps/web/src/components/painel/link-da-bio/*` e `lib/bio/editor.ts` | 6a |
| `CropFocal`, `Interruptor`, `useToast`, `ErroDeCarga`, `authenticatedFetch`, `resolveUploadLimitBytes`, `type LpMediaRef`, `type Carga`, `QRCodeCanvas` (`qrcode.react`), `cn` | já em `main` | — |

### O que o PR 7 encaixa aqui

Nomes finais que o plano do PR 7 usa (conferidos contra `2026-10-19-link-da-bio-pr7-rastreio.md`, Task 5):

- `aba-perfil.tsx` (não exportados; o PR 7 edita o próprio arquivo):
  - `const LUGARES_DO_PERFIL: readonly string[]`, constante de módulo, terminando em `"confere.linhas",` — o PR 7 acrescenta `...LUGARES_DO_AVANCADO,` no fim;
  - na `AbaPerfil` (que desestrutura `pagina`, `rascunho`, `mudarDocumento`, `erro`, `limparErro`): `const erros = useErroDaAba(erro, limparErro, LUGARES_DO_PERFIL, pagina.versao);` e `const cartao: PropsDoCartao = { documento: rascunho.documento, mudarDocumento, erros };`;
  - os cartões, nesta ordem: `CartaoFotos`, `CartaoTextos`, `CartaoConfere`, `CartaoSelo` (o último, `id="bio-selo-titulo"`, com "Feito com Girumo") — o PR 7 põe `<BlocoAvancado rastreio={rascunho.documento.rastreio} mudarDocumento={mudarDocumento} erroDe={erros.erroDe} corrigiu={erros.corrigiu} />` logo depois de `<CartaoSelo {...cartao} />`;
  - sem filtro de erro: com os lugares do Avançado na lista, o `useErroDaAba` guarda o `rastreio.*` no lugar dele e o bloco lê por `erroDe`. O comentário da `AbaPerfil` já descreve isso (o passo do PR 7 que trocava a frase "o PR 7 filtra o `erro`…" fica sem efeito).
- `aba-perfil.test.ts`: `html(documento?: DocumentoBio, erro?: ErroDeCampo | null): string`, `DOC` (o `documentoFalso()` do 3a) e o import de `abaDoErro` — o PR 7 acrescenta os testes dele no fim.
- `erro-da-aba.tsx`: `useErroDaAba(erro: ErroDeCampo | null, limparErro: () => void, lugares: readonly string[], versao: number): ErroDaAba` com `erroDe`, `erroSolto` e `corrigiu`; `ID_DO_AVISO_DA_ABA = "bio-aba-aviso"`.
- `editor.ts`: `idNaTela` (`"rastreio.ga4Id"` → `"bio-rastreio-ga4Id"`) e `lugarDoErro`; o PR 7 acrescenta as frases de `rastreio.metaPixelId` e `rastreio.ga4Id` em `MENSAGENS_DOS_CAMPOS`.
- `abas.tsx`: a dona do Perfil passa a `/^(perfil|confere|feitoComGirumo|rastreio)(\.|$)/` e sai a linha de comentário "Sem `rastreio`: o PR 7 acrescenta…" que fica em cima dela (o 6b deixou o `rastreio` de fora de propósito: sem campo na tela, o erro iria pro aviso do topo).

### Fotos na folha de link

As fotos do botão e a da fachada entram no rascunho do link pela folha e passam pelo `validarLink` do 6a quando a lojista toca em "Adicionar"/"Pronto" — o mesmo `documentoBio` com o link dentro de um `documentoPadrao`, que já confere `fotos` (até 3) e o formato do id; erro em foto vira `erros.geral` (`errosDoLink`). Que a mídia é da loja quem confere é o PATCH (`conferirDocumentoDaLoja`, §4), e o 400 volta para a folha pelo `erroNoLink`. Trocar para o `linkBio` seria mudança no `validarLink` do 6a, fora deste PR.
