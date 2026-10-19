# Link da bio — design

Data: 19/10/2026 · Mockup navegável (validado): https://claude.ai/artifact/AU7UMh4kNjtRqRYnyrjE5z
Fonte do mockup fora do repositório (tem foto e dado da loja-piloto): `Desktop/girumo-design-refs/link-da-bio/`
(`project/Main.dc.html` = os 4 modelos; `project/Editor.dc.html` = o editor; `interage.cjs` = as checagens).

## 1. Por que existe

O link da bio do Instagram é a porta de entrada da loja de atacado: é por ali que a revendedora
chega no WhatsApp da vendedora, no grupo VIP e no catálogo. Hoje o lojista monta essa página fora da
Girumo (Linktree ou site próprio). A loja-piloto ganhou uma página feita à mão (`/links` do site
dela, etiquetas penduradas num fio que balançam) e é ela a referência: o modelo **Etiqueta** é a
mesma página, portada.

Queremos que **qualquer lojista** tenha essa página em 2 minutos dentro do painel: escolhe um
modelo pronto, edita cada link, adiciona mais, e o endereço vai na bio. O botão "Grupo VIP" usa o
link de campanha da Girumo (enche o grupo certo), o que nenhum Linktree faz.

**Objetivos**
- Página pública feita para celular, leve (abre no navegador do Instagram em 4G), bonita e animada.
- 4 modelos com paletas prontas + "cores da sua marca" sem quebrar contraste.
- Editor no painel (celular e computador) com prévia fiel, sem código.
- Contagem de visitas e de toques por botão.

**Fora da v1 (não fazer agora):** mais de uma página por loja; arrastar e soltar; agendar ou expirar
link; vídeo dentro do "Como chegar"; indexação no Google; visitante único; limite por plano; modelos
além dos 4.

**Seria fracasso mesmo funcionando:** página pesada (Lighthouse celular < 90) ou com cara de
template genérico; botão do WhatsApp apontando pro número que a Girumo usa para postar (risco de
banimento); qualquer texto do lojista virando HTML/script na página; um lojista ler ou mexer na
página de outro.

## 2. Endereço público

- **Endereço Girumo** (sempre): `https://www.girumo.com.br/bio/<slug>`. A origem é constante do servidor —
  `getPublicSiteUrl()` (`lib/brand.ts`: `NEXT_PUBLIC_SITE_URL`, padrão `https://www.girumo.com.br`) —, **nunca** o
  `Host`/`Origin` do request. Chega ao painel como `origemGirumo` no GET da API (§9). O painel **não** usa
  `useLinkOrigin`: ele devolve o domínio próprio, onde `/bio/*` é 404.
- **Nunca em `app.girumo.com.br`** (a sessão do supabase-js fica no `localStorage` dessa origem): `/bio/:path*` em
  `app.` e no apex `girumo.com.br` → **308** para `https://www.girumo.com.br/bio/:path*`. Regra nova em
  `lib/domain-redirects.ts`, irmã de `appDomainRedirects` (destino com `PUBLIC_SITE_HOST`), com teste em
  `domain-redirects.test.ts`.
- **Domínio próprio ativo** (`custom_domains`, já em produção): só a **raiz** `/` serve, e só a página da própria
  loja. Ex.: `https://links.sualoja.com.br/`. `/bio/*` nesse host continua 404 (`customHostRoute` → `"not-found"`).
  Loja sem página publicada (ou bloqueada): continua o 404 de texto atual do middleware ("Link não encontrado.").
  O painel mostra esse endereço como principal quando houver.
- `slug`: 3–40, `^[a-z0-9]+(-[a-z0-9]+)*$`, único entre as páginas de bio (não colide com `/r/` nem
  `/p/`, são prefixos diferentes). Sugestão inicial = `slugify(nome da loja)` (`lib/pages/slug.ts`).
  Reservados: `_dominio`, `admin`, `api`, `bio`, `girumo`, `painel`, `login`, `ajuda`, `suporte` **e qualquer slug
  que contenha `girumo`, `hubflow`, `whatsapp`, `instagram`, `meta`, `facebook`, `oficial` ou `suporte`** (`TRECHOS_RESERVADOS`; decisão do Igor em 19/10, contra página que finge ser canal oficial).
- **Slug não volta para outra loja**: todo slug já usado fica em `bio_slugs` (§5). Trocar o slug: o antigo responde
  **301** para `/bio/<atual>` (QR impresso continua funcionando). A loja pode voltar a um slug que já foi dela.
- **Bloqueio** (`bio_pages.bloqueada_em`, só admin, por SQL): a página some do público e o painel avisa.
- `noindex` na página e `/bio/` no `disallow` do `robots.ts`, como `/p/`.

## 3. Modelos e aparência

| Modelo | Ideia | Fontes (self-hosted, OFL) | Paletas prontas (id) |
|---|---|---|---|
| `etiqueta` (padrão) | Botões = etiquetas de roupa furadas na ponta, penduradas num fio; entram balançando e balançam no toque. Foto da loja em cima, logo, frase, 3 destaques. | Lexend | `azul`, `rosa`, `menta`, `grafite` |
| `vitrine` | Foto cheia da loja no topo com a logo e a frase em itálico; a lista sobe por cima como uma folha; botão principal em pílula com um brilho que passa uma vez. | Bodoni Moda + Jost | `papel`, `noite`, `rose`, `azul` |
| `romaneio` | A nota do fardo do atacado: papel com borda serrilhada que "imprime" na entrada, itens numerados com pontilhado, botão principal carimbado, código de barras no fim. Não usa a foto. | IBM Plex Mono (400–700) | `kraft`, `caneta`, `nota`, `azul` |
| `classico` | O formato que todo mundo conhece: foto redonda, nome, @, botões em pílula; anel pulsando no principal. | Manrope | `claro`, `escuro`, `lavanda`, `azul` |

- **Valores exatos** das cores, medidas, sombras, máscaras e animações estão em
  `girumo-design-refs/link-da-bio/project/Main.dc.html` (CSS por modelo, prefixos `et-`, `vt-`, `rm-`,
  `cl-`) e em `paletas.json` (lá a paleta `azul` se chama `mks`). O renderizador copia esses valores; não reinventar.
- **Sem atributo `style=`** (a CSP da página não deixa, §6): os tokens de cor vão numa regra `.lk{--fundo1:…}` dentro
  do `<style nonce>`; o atraso de entrada sai de `:nth-child`; o foco da foto (`object-position` e o zoom do Clássico)
  é uma regra gerada só com números validados. Teste: `doesNotMatch(/\sstyle=/)`.
- **Contraste**: cada paleta pronta passou no `contraste.py` (texto ≥ 4,5:1, ícone e seta ≥ 3:1); o teste do PR 2
  repete em TypeScript. Valem para toda paleta: nada de `opacity` em texto; véu ≥ 60% sob texto em cima de foto;
  `--foco` ≥ 3:1 contra os fundos onde ficam os links (Etiqueta `fundo1`–`fundo3`, Vitrine e Clássico `fundo2`,
  Romaneio o papel). Onde a cor da paleta não passa (no mockup: Etiqueta `azul`/`rosa`/`menta`, 1,9–2,9:1, e Clássico
  `azul`), `coresDoModelo` troca pela de **maior contraste mínimo** entre o texto daquele fundo, `#000000` e `#FFFFFF`.
  Nos blocos de papel (confere, endereço) o anel é `var(--tinta)`. No Romaneio, fora do papel vale `--foco-fora`,
  escolhido do mesmo jeito contra `fundo1`–`fundo3`. O teste exige ≥ 3:1 nas 16 paletas e nos 500 hex aleatórios.
- **Cores da sua marca** (`paleta = "marca"`): o lojista escolhe `fundo` e `botao` (hex). `coresDoModelo` deriva os
  demais tons como a `derivada` do mockup, com extremos `#000000`/`#FFFFFF` (o mockup usa `#141414`) e
  `garante(…, 4.5)` em todo token usado como texto, inclusive `--ico` quando é texto; ícone e seta 3:1. Teste com 500
  hex aleatórios cobrindo texto (4,5), ícone (3) e foco (3). Reaproveitar `parseHex`, `relativeLuminance` e
  `contrastRatio` de `lib/pages/palette.ts`.
- Logo: duas opcionais, `logoClara` (para fundo escuro) e `logoEscura` (para fundo claro). A página
  escolhe pela luminância do fundo; se só existir a "errada", desenha uma plaquinha branca atrás.
- Foto: uma (`capa`) com ponto de foco (`crop-focal.tsx` já existe). No `classico` vira o círculo,
  com `object-position` no foco e zoom fixo de 2,2× em volta dele.
- **Fontes** em `public/fonts/bio/` (fora do prefixo `/bio/`), cada família com seu `OFL.txt`: Manrope e IBM Plex
  Mono copiadas de `src/fonts/` (a Manrope é variável, um arquivo; da Plex Mono lá só há 400 e 500, e o Romaneio usa
  também 600 e 700 → vendorizar os dois); Lexend, Bodoni Moda e Jost vendorizadas (woff2 latin). A página carrega só
  as do modelo escolhido (o Vitrine usa duas famílias).
- **Animação**: só CSS, só `transform`/`opacity`/`clip-path`. Entrada desligável (`animar`).
  `prefers-reduced-motion: reduce` desliga tudo, sempre. O toque (balanço, carimbo, brilho) é feedback
  e continua mesmo com `animar = false`, exceto em movimento reduzido. O pulso do Clássico dá no máximo 2 voltas.

## 4. Conteúdo (documento) e validação

Uma página = um documento JSON validado no servidor por zod (fonte única) e guardado numa coluna.

| Campo | Regra |
|---|---|
| `perfil.nome` | 1–60, obrigatório. Padrão: `organizations.name`. |
| `perfil.frase` | 0–120 |
| `perfil.destaques` | até 3, cada um 1–40. O primeiro número (ou `R$ 16,90`) é destacado sozinho. |
| `perfil.local` | 0–90 |
| `perfil.instagram` | 0–30, `^[a-z0-9._]+$`, sem `@` |
| `perfil.capa`, `perfil.capaAlt` | mídia opcional + descrição 0–140 (vira o `alt`; vazio = `alt=""`) |
| `perfil.logoClara`, `perfil.logoEscura` | mídia opcional |
| `confere` | `ativo`; `razao` 0–120; `cnpj` com dígito verificador válido, numérico ou alfanumérico (a Receita emite CNPJ com letras desde julho de 2026: 12 caracteres `[0-9A-Z]` + 2 dígitos); aceita com ou sem pontuação, guarda sem pontuação e em maiúsculas; `linhas` até 2, cada 1–160. Com `ativo` e `razao`+`cnpj` preenchidos, mostra "O Pix cai só no nome …" + Copiar CNPJ. |
| `rastreio` | `metaPixelId` `^\d{5,20}$` ou vazio; `ga4Id` `^G-[A-Z0-9]{4,}$` ou vazio. Eventos (PR 7): Pixel `PageView` ao abrir, `Contact` no toque do WhatsApp e o custom `BioToque {botao}` nos outros; GA4 `page_view` e `bio_toque {botao}` (`botao` = tipo do link). Nunca `Lead`: o `/r/` já pode disparar o evento da campanha. |
| `feitoComGirumo` | boolean, padrão `true` |
| `animar` | boolean, padrão `true` |
| `links` | 0–20. Na página só entram os `ativo` que não estão em `linksEscondidos` (§6). No máximo **um** `destaque` (não vale para `endereco`). |

Tipos de link (todos têm `id` uuid gerado no navegador, `titulo` 1–50, `sub` 0–80, `icone`, `ativo`):

| Tipo | Campos | Na página |
|---|---|---|
| `whatsapp` | `numero` (BR, 10–11 dígitos nacionais; guarda `55`+dígitos), `mensagem` 0–300 | `https://wa.me/<numero>?text=<mensagem codificada>`. **Recusado** (400) se a `chaveDoTelefone` (`lib/pages/phone.ts`) do número bater com a de **qualquer** instância da loja (`listInstances`, `lib/stores/instances.ts`): "Esse é o número que a Girumo usa para postar nos grupos. Use o número de atendimento." Número que virou conectado depois de salvo: o botão **some** da página e o painel mostra aviso vermelho pedindo para trocar. |
| `grupo` | `campanhaId` (uuid de `campaign_groups` **da loja**, conferido no servidor) | Link mestre da campanha: `campaignLinkPath(origem, slug)` (`/<slug>` no domínio próprio, `/r/<slug>` no host Girumo). Campanha apagada ou sem link mestre → o botão some da página e o painel mostra aviso vermelho. |
| `link` | `url` (só `http`/`https`, ≤ 500, host com ponto; sem esquema → `https://`), `fotos` até 3 mídias | `href` = `url.href`. Com fotos, mostra as capas no lugar do ícone. URL de `wa.me`/`api.whatsapp.com` com número conectado: mesma regra do `whatsapp` (400 no salvar, some no render). |
| `endereco` | `endereco` 5–200 (multilinha), `horario` 0–120, `foto` mídia opcional | Abre ali mesmo (`<details>`): foto, endereço, horário e "Abrir no Google Maps" (`https://www.google.com/maps/search/?api=1&query=<endereço em uma linha>`). |

Ícones (lista fechada): `whatsapp catalogo coroa mapa canal instagram site sacola etiqueta caminhao video cartao link`.
Os desenhos (paths SVG) são os do sprite do mockup.

**Mídia**: upload pelo fluxo que já existe (`uploadMediaFile`, upload direto para o storage, sem passar
pela função de 4,5 MB), `kind` `lp-media` para fotos e `lp-logo` para logos. No salvar, **todo id de mídia do
documento precisa ser da loja** (`conferirDocumentoDaLoja`, §9), senão 400: id só `^[A-Za-z0-9_-]+$`;
`encode(decode(id)) === id` (base64url, o formato de `encodeMediaId`/`decodeMediaId` em `lib/media-store.ts`);
o caminho passa em `mediaPathBelongsToTenant` (`lib/media-path.ts`); e existe a linha da loja em `uploads` com
`kind` `lp-media`/`lp-logo` (sem esse `kind`, `/api/p/media/<id>` dá 404 público). Na página, imagem passa pelo
otimizador do Next (`/_next/image?url=/api/p/media/<id>&w=…&q=75`) com `srcset` 384/640/828 (390 dá 400: o
otimizador só aceita as larguras padrão de `imageSizes`/`deviceSizes`, e o `next.config.ts` não as muda),
`width`/`height` declarados, `fetchpriority="high"` só na foto do topo e `loading="lazy"` no resto.

## 5. Banco

Migração única (PR 1), nos dois bancos pelo CI (`migrate-dev` no PR, `migrate-prod` no merge):

```sql
create table if not exists public.bio_pages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.organizations(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 40),
  publicada boolean not null default false,
  bloqueada_em timestamptz,                        -- só admin, por SQL: some do público
  documento jsonb not null,
  versao integer not null default 1 check (versao > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.bio_slugs (       -- todo slug já usado; nunca volta para outra loja
  slug text primary key,
  pagina_id uuid references public.bio_pages(id) on delete set null,
  criado_em timestamptz not null default now()
);
create table if not exists public.bio_contagens (
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  pagina_id uuid not null references public.bio_pages(id) on delete cascade,
  dia date not null,                               -- America/Sao_Paulo
  alvo text not null                               -- 'visita' ou o uuid do link
    check (alvo = 'visita' or alvo ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'),
  total integer not null default 0,
  primary key (pagina_id, dia, alvo)
);
```

- `bio_slugs` é mantida por trigger `after insert or update of slug` em `bio_pages` (função `bio_registra_slug`):
  grava `(new.slug, new.id)`; se o slug já existe com outra `pagina_id` (ou `null`, de página apagada), levanta
  `unique_violation` (23505, mensagem citando `bio_slugs`) e a gravação inteira desfaz. Slug que já foi da própria
  página passa.
- `public.bio_contar(p_pagina uuid, p_alvo text) returns void`: `insert … on conflict (pagina_id, dia, alvo) do
  update set total = bio_contagens.total + 1`, com `tenant_id` lido de `bio_pages` e `dia` = hoje em
  `America/Sao_Paulo`.
- `public.bio_relatorio(p_tenant uuid, p_desde date, p_ate date) returns jsonb`: soma `bio_contagens` da loja nos
  dias do intervalo (inclusivo) e devolve já em camelCase `{visitas, toques, porLink: [{linkId, toques}],
  porDia: [{dia, visitas, toques}]}` = `RelatorioBio` (§9). Agregado no SQL (nunca no app: o PostgREST corta em 1000).
- Funções `security invoker`, `set search_path = public`, `revoke execute … from public, anon, authenticated`;
  `bio_contar` e `bio_relatorio` com `grant execute … to service_role`.
- RLS ligado nas três tabelas, **sem policy**, `revoke all … from anon, authenticated`: só o servidor (service role)
  lê e grava; `bio_pages` e `bio_contagens` sempre com `.eq('tenant_id', …)`; `bio_slugs` (sem `tenant_id`) só por slug.
- Sem trigger de `updated_at`: o store grava `updated_at = now()` junto com `versao + 1`.
- Baseline (`npm run schema:baseline` contra dev) e uma checagem `infra/tests/bio-pages-check.sql`
  (RLS ligado nas três, zero policy, privilégios de `anon`/`authenticated` vazios em tabelas e funções,
  `bio_contar` e `bio_relatorio` só para `service_role`), porque o gate de drift não vê ACL nem policy.

## 6. Página pública (rota e cache)

- `GET|HEAD /bio/[slug]` = **route handler** (`app/bio/[slug]/route.ts`, `runtime = "nodejs"`,
  `dynamic = "force-dynamic"`) que devolve o HTML pronto de `renderPaginaBio`. Não é uma página
  React: a página não carrega o layout raiz (título "| Girumo", favicon, Sentry, banner de
  impersonação), nem React no navegador. Mesmo caminho do `/r/` (`lib/campaigns/entry-page.ts`).
- Serve em `www` (e em preview/local); `app.` e apex nunca chegam aqui (o 308 do §2 roda antes do middleware).
  Slug antigo da página → **301** para `/bio/<atual>`, com `cache-control: no-store` (a loja pode voltar ao slug
  antigo, e um 301 guardado no navegador viraria laço).
- **Domínio próprio**: o middleware reescreve a raiz `/` de host de lojista para `/bio/_dominio` (novo valor
  `"bio-root"` em `CustomHostRoute`, devolvido por `customHostRoute("/")`; resposta irmã de `rootLinkResponse`, com o
  CSP de nonce). O handler só aceita `_dominio` com `!isFirstPartyHost(hostnameFromHostHeader(host))`, resolve a loja
  por `getActiveDomainTenant` e lê a página dela (`paginaPublicaDaLoja`, origem `https://<host ativo>`). Em host
  Girumo, `/bio/_dominio` é 404.
- Registros obrigatórios (ver o achado "rota pública precisa de 3 registros"), cada um com o teste que já trava o
  padrão: `surfaceForPath` em `lib/security/csp.ts` (superfície nova `"bio"`), entrada `"/bio/:path*"` no `matcher`
  do middleware, a regra de `headers()` do `next.config.ts` (`bio/|bio$` no lookahead negativo + `headersWithoutCsp`),
  `robots.ts`, `lib/domain-redirects.ts` (308 de `app.`/apex, §2), `lib/custom-domains/host.ts` (`"bio-root"`).
- CSP da superfície `"bio"` (`buildCsp`): `default-src 'none'; script-src 'self' 'nonce-…'; style-src 'self'
  'nonce-…'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none';
  form-action 'none'; frame-ancestors 'none'`. O PR 7 acrescenta os hosts da Meta e do GA **fixos**, como já fazem as
  superfícies `p` e `r` em `buildCsp`: a CSP sai do middleware, que não sabe se a loja tem rastreio. O `<style>` e o
  `<script>` do HTML levam o nonce da request. **Exatamente um** header `Content-Security-Policy` — a regra global de
  `headers()` também casa `/`: conferir com `curl -sI` em `www…/bio/<slug>` e na raiz de um domínio próprio.
- Dado em cache, HTML por request (o nonce muda): `unstable_cache` em `lib/bio/cache.ts` (PR 2), `revalidate: 300`,
  tags `bio-slug:<slug>`, `bio-loja:<tenantId>` e `bio-pagina:<id>`. Toda entrada que monta `DadosRender` leva
  `bio-loja` e `bio-pagina` (achar a página pela chave num passo; montar os dados noutro, já com as tags dela).
  O cache calcula `linksEscondidos`: número conectado (`whatsapp` ou `wa.me` num `link`) e campanha sumida ou sem
  link mestre.
- Invalidação: salvar no painel → `invalidarBio` com o slug novo e o antigo; renomear (trocar o slug) ou apagar
  campanha (`PATCH` e `DELETE` de `app/api/campanhas/route.ts`, PR 4a) → `invalidarBioDaLoja`. Bloqueio por SQL não
  invalida: a página some em até 5 min.
- 404: inexistente, não publicada, bloqueada ou `_dominio` em host Girumo → HTML mínimo ("Página não encontrada"), sem
  marca Girumo. Raiz de domínio próprio sem página → o mesmo texto de `customHostNotFound` do middleware.
- `<head>`: `lang="pt-BR"`, `<title>` = nome da loja, `description` = frase, `robots noindex`,
  Open Graph (título, frase, foto), `theme-color` = fundo, ícone = logo da loja (ou nenhum: `data:,`).

## 7. Contagem

- Só contadores por dia (`bio_contagens`, via `bio_contar`). Nada de IP, user agent ou referer guardado.
- **Visita**: no handler, depois de responder (`after()`), `contarBio(paginaId, "visita")` — exceto `HEAD`
  (`req.method`), prefetch (`Sec-Purpose`/`Purpose: prefetch`) e robô (`isBotUserAgent`, `lib/pages/analytics.ts`, que
  já cobre `facebookexternalhit` e `whatsapp`, das prévias de link), e com teto por IP+página
  (`isRateLimited("bio-visita", req, 30, paginaId)`, o teto do `track`).
- **Toque**: `navigator.sendBeacon('/api/p/bio/toque', '{"p":"<pagina>","l":"<link>"}')` no clique
  (corpo `text/plain`, sem preflight). A rota (`/api/p/*`, pública nos dois hosts): corpo ≤ 256 B; valida os dois
  uuids; lê a página por id no cache (`paginaPublicaPorId`: publicada e não bloqueada; o link existe, está ativo e fora
  de `linksEscondidos`); filtro de robô; `isRateLimited("bio-toque", req, 30, paginaId)`; `contarBio(p, l)` (o
  `tenant_id` sai da página); responde **204 sempre** (não revela nada).
- `isRateLimited` ganha os baldes `"bio-visita"` e `"bio-toque"`: o limitador do middleware não roda em `/api/p`.
- Painel: `bio_relatorio` dos últimos 7 ou 30 dias (`dayBRAgo`/`dayBR`, `lib/date-br.ts`): visitas, toques,
  **toques por visita** (pode passar de 1; não é "% que tocou") e toques por botão.

## 8. Painel

Rota `/painel/link-da-bio`, item **"Link da bio"** (ícone `Link2`) no grupo `lotar` do "Mais", logo
depois de Páginas (não entra na barra de cima nem na de baixo; os testes de `painel-nav` travam isso).
O item no menu só entra no PR 6b, com Aparência e Perfil prontos: até lá a rota existe (e o e2e a visita), mas o
lojista não chega numa página pela metade.
Vendedora não vê (guarda de módulo fechada por padrão). Quem edita: `owner`, `admin`, `operator`
(ação `campaign:edit`, a mesma que libera editar a loja em Configurações).

Telas (ver o mockup, quadros "Editor no celular" e "Editor no computador"):
- **Cabeçalho**: "Link da bio" + chip No ar / Fora do ar (bloqueada → aviso); endereço principal com Copiar e Abrir:
  `https://<dominio>/` se houver domínio ativo, senão `origemGirumo` + `/bio/<slug>` (os dois vêm do GET; nunca
  `useLinkOrigin`); no computador, "Alterações não salvas · Descartar · Salvar" à direita.
- **Abas** (WAI-ARIA: `role="tab"`, tabindex móvel, setas): Links · Aparência · Perfil · Divulgar.
  - *Links*: lista na ordem da página (`key=id`); cada linha abre a edição; interruptor liga/desliga (desligado
    some da página e fica guardado); link em `linksEscondidos` (número que virou conectado, campanha apagada) ganha
    aviso vermelho pedindo para trocar; "Reordenar" troca os interruptores por Subir/Descer (44×44) e
    anuncia a nova posição (`aria-live`); "Adicionar link" abre a folha com 6 atalhos (WhatsApp da loja,
    Grupo VIP, Catálogo ou site, Como chegar, Canal do WhatsApp, Outro link) que preenchem tipo, ícone
    e textos padrão; erro aparece embaixo do campo e some ao corrigir; editar tem "Excluir" com
    confirmação na própria folha. Aviso fixo no WhatsApp: não usar o número conectado.
  - *Aparência*: 4 modelos com miniatura viva (o mesmo renderizador, em iframe pequeno com `inert`, `tabindex=-1` e
    `aria-hidden`, com os dados da loja); 4 paletas do modelo + "Cores da sua marca" (2 seletores); "Animação de
    entrada" + "Rever a animação".
  - *Perfil*: foto (trocar, ajustar o foco, descrição), logo clara e escura, nome, frase (contador),
    3 destaques, onde fica, @instagram, bloco "Antes de pagar, confere", "Feito com Girumo", e um
    "Avançado" fechado com Pixel da Meta e GA4 — este bloco entra só no PR 7, junto do código que usa os ids (antes
    disso o campo existiria sem efeito).
  - *Divulgar*: Página no ar; endereço do domínio próprio + endereço Girumo com slug editável
    (conferência de disponível ao digitar, com atraso; trocar avisa que o antigo passa a levar ao novo); passo a
    passo do Instagram; QR code (`qrcode.react`, baixar PNG); últimos 7/30 dias.
- **Prévia**: `<iframe srcdoc sandbox="">` com o HTML de `renderPaginaBio(..., modo: "previa")`: sem `<script>` e com
  os `<a>` sem `href` (senão o clique navega o iframe). `sandbox=""` basta porque os arquivos de `public/` saem com
  `Access-Control-Allow-Origin: *` (conferido em 19/10 com `curl -sI` em `/next.svg`, no www e no app); se deixarem de
  sair, `allow-same-origin` sem `allow-scripts`. Escalado por `transform` (computador: coluna fixa à direita; celular:
  botão "Ver como fica" abre em tela cheia). Atualiza a cada mudança **sem** repetir a animação de entrada; ela só
  toca em "Rever a animação", ao trocar de modelo e ao adicionar link.
- **Salvar explícito** (não é autosave): tudo fica local até "Salvar"; trava otimista por `versao`
  (409 → "Outra pessoa salvou antes. Recarregue pra ver a versão nova." com botão Recarregar).
  Sair com alterações: `beforeunload` + clique em link interno interceptado na fase de captura + `useConfirmacao`.
  No celular a barra de salvar fica acima da barra de baixo; `scroll-padding-bottom` = altura das barras fixas.
- **Para onde vai o foco**: escolher tipo → primeiro campo; pedir exclusão → "Não"; excluir → "Adicionar link";
  Subir/Descer na ponta da lista → o outro botão; salvar com erro → primeiro campo com erro.
- **Primeira vez**: sem página, estado vazio "Monte o link da bio da loja" → "Criar minha página"
  (POST) cria com modelo `etiqueta`, paleta `azul`, nome da loja, slug sugerido livre, um link
  "Entrar no grupo VIP" se a loja tiver campanha com link mestre, `publicada = false`.
- Componentes existentes a reusar: `Folha` (`components/painel/folha.tsx`, com trava de foco e Esc) com
  `emQualquerLargura` (vira diálogo no computador) e `fundoFecha={false}` (tocar fora não fecha); `Interruptor`
  (`components/painel/instagram/interruptor.tsx`), cujo trilho desligado ganha borda ≥ 3:1 em `.pn-interruptor`
  (`app/painel-vitrine.css`, vale para o painel todo); `useConfirmacao`; `useToast`; classes de campo/botão como em
  `dialogo-de-gasto.tsx`. Nada de `components/ui` (o primário de lá é Acid). Regras do `painel:check` valem nos
  arquivos do painel; o CSS dos modelos públicos vive em `lib/bio/render/` (fora do alcance desse lint, como os
  templates de LP).

## 9. Contratos entre PRs (nomes fixos — os planos dependem deles)

```ts
// lib/bio/documento.ts (puro, roda no navegador e no servidor) — PR 2
export const MODELOS = ["etiqueta", "vitrine", "romaneio", "classico"] as const;
export type Modelo = (typeof MODELOS)[number];
export const PALETAS = { etiqueta: ["azul", "rosa", "menta", "grafite"], vitrine: ["papel", "noite", "rose", "azul"],
  romaneio: ["kraft", "caneta", "nota", "azul"], classico: ["claro", "escuro", "lavanda", "azul"] } as const; // azul = mks no paletas.json
export const ICONES = ["whatsapp", "catalogo", "coroa", "mapa", "canal", "instagram", "site", "sacola",
  "etiqueta", "caminhao", "video", "cartao", "link"] as const;
export type Icone = (typeof ICONES)[number];
export type MidiaRef = { id: string /* ^[A-Za-z0-9_-]+$ */; foco: { x: number; y: number } | null }; // x,y em 0..1
type Base = { id: string; titulo: string; sub: string; icone: Icone; ativo: boolean };
export type LinkBio =
  | (Base & { tipo: "whatsapp"; destaque: boolean; numero: string; mensagem: string })
  | (Base & { tipo: "grupo"; destaque: boolean; campanhaId: string })
  | (Base & { tipo: "link"; destaque: boolean; url: string; fotos: MidiaRef[] })
  | (Base & { tipo: "endereco"; endereco: string; horario: string; foto: MidiaRef | null });
export type DocumentoBio = {
  v: 1; modelo: Modelo; paleta: string /* de PALETAS[modelo] ou "marca" */;
  cores: { fundo: string; botao: string } | null /* #RRGGBB maiúsculo; obrigatório se paleta = "marca" */;
  animar: boolean; feitoComGirumo: boolean;
  perfil: { nome: string; frase: string; destaques: string[]; local: string; instagram: string;
    capa: MidiaRef | null; capaAlt: string; logoClara: MidiaRef | null; logoEscura: MidiaRef | null };
  confere: { ativo: boolean; razao: string; cnpj: string /* sem pontuação: [0-9A-Z]{12}[0-9]{2} ou vazio */; linhas: string[] };
  rastreio: { metaPixelId: string; ga4Id: string };
  links: LinkBio[];
};
export const documentoBio: z.ZodType<DocumentoBio>;          // strictObject; normaliza url/cnpj/numero
export function documentoPadrao(i: { nome: string; campanhaId: string | null }): DocumentoBio;
export const SLUG_BIO: RegExp; export const SLUGS_RESERVADOS: ReadonlySet<string>;
export function slugReservado(slug: string): boolean;         // SLUGS_RESERVADOS ou contém um TRECHOS_RESERVADOS
// Mora aqui, e não no renderizador, porque cache e conferir (PR 2) usam antes do PR 3a existir.
export type DadosRender = { documento: DocumentoBio; paginaId: string;
  campanhas: Record<string, string>;   // campanhaId -> slug do link mestre (só as que existem)
  linksEscondidos: string[];           // ids que não saem: número conectado (whatsapp ou wa.me) ou campanha sumida/sem link mestre
  origem: string; dominioProprio: boolean };

// lib/bio/cores.ts (puro) — PR 2
export type TokensBio = Record<string, string>;               // as variáveis CSS do modelo (--fundo1, --on, …)
export function coresDoModelo(modelo: Modelo, paleta: string, cores: DocumentoBio["cores"]): TokensBio;
export function garante(fg: string, bg: string, min: number): string; // mistura fg rumo a #000000/#FFFFFF até min:1

// lib/bio/conferir.ts (server-only) — PR 2
export function conferirDocumentoDaLoja(tenantId: string, documento: DocumentoBio):
  Promise<{ ok: true } | { ok: false; error: string; campo: string /* ex. "links.2.numero" */ }>;
  // mídia da loja (§4), campanhas (listCampaignGroups), número conectado (chaveDoTelefone × listInstances)
export function estadoDosLinks(tenantId: string, documento: DocumentoBio):
  Promise<Pick<DadosRender, "campanhas" | "linksEscondidos">>; // usado pelo cache e pelo GET do painel

// lib/stores/bio-pages.ts (server-only; bio_pages sempre .eq("tenant_id"); bio_slugs só por slug) — PR 2
export type PaginaBio = { id: string; tenantId: string; slug: string; publicada: boolean; bloqueadaEm: string | null;
  documento: DocumentoBio; versao: number; updatedAt: string };
export type RelatorioBio = { visitas: number; toques: number; porLink: { linkId: string; toques: number }[];
  porDia: { dia: string /* YYYY-MM-DD */; visitas: number; toques: number }[] };
export function lerPaginaDaLoja(tenantId: string): Promise<PaginaBio | null>;
export function criarPaginaDaLoja(tenantId: string, slug: string, documento: DocumentoBio): Promise<PaginaBio>;
  // 23505 citando bio_pages_tenant_id_key → devolve a existente; outro 23505 (slug) → sufixo e de novo, como createLandingPage
export function salvarPaginaDaLoja(tenantId: string, e: { versao: number; slug: string; publicada: boolean; documento: DocumentoBio }):
  Promise<{ ok: true; pagina: PaginaBio } | { ok: false; motivo: "versao" | "slug" | "sem-pagina" }>;
  // update condicional .eq("tenant_id").eq("versao"), espelho de compareAndSwapLandingPage; 23505 → "slug";
  // nenhuma linha atualizada → relê: não existe = "sem-pagina" (PATCH 404), existe = "versao" (409)
export function slugDisponivel(slug: string, tenantId: string): Promise<boolean>; // fora de bio_slugs, ou já da própria página
export function lerPublicadaPorSlug(slug: string): Promise<PaginaBio | null>;   // via bio_slugs: slug atual ou antigo
export function lerPublicadaPorId(id: string): Promise<PaginaBio | null>;
export function lerPublicadaDaLoja(tenantId: string): Promise<PaginaBio | null>;
  // as três lerPublicada*: publicada = true e bloqueada_em null
export function contarBio(paginaId: string, alvo: string /* "visita" ou id do link */): Promise<void>; // rpc bio_contar
export function relatorioBio(tenantId: string, desde: string, ate: string /* YYYY-MM-DD */): Promise<RelatorioBio>;

// lib/bio/cache.ts (server-only; unstable_cache, revalidate 300) — PR 2
export type BuscaPorSlug = { tipo: "pagina"; dados: DadosRender } | { tipo: "mudou"; slugAtual: string } | null;
export function paginaPublicaPorSlug(slug: string): Promise<BuscaPorSlug>;            // origem = getPublicSiteUrl()
export function paginaPublicaDaLoja(tenantId: string, origem: string): Promise<DadosRender | null>; // raiz do domínio próprio
export function paginaPublicaPorId(id: string): Promise<DadosRender | null>;           // rota do toque
export function invalidarBio(i: { tenantId: string; paginaId: string; slugs: string[] }): void; // slugs = novo e antigo
export function invalidarBioDaLoja(tenantId: string): void;                            // campanha com slug trocado ou apagada

// lib/bio/render/index.ts (puro; sem server-only, sem Supabase, sem React) — PR 3a
export function renderPaginaBio(d: DadosRender, o: { modo: "publica" | "previa"; nonce: string | null; animarEntrada: boolean }): string;
  // "previa": nenhum <script>, <a> sem href
export function renderPaginaNaoEncontrada(nonce: string | null): string;

// lib/bio/render/script.ts (puro) — PR 3a cria; 4b e 7 acrescentam
export function scriptDaPagina(o: { rastreio: { metaPixelId: string; ga4Id: string } | null }): string;
  // o JS inline (sem nenhum texto do lojista), devolvido sem a tag; renderPaginaBio o embrulha em <script nonce>.
  // PR 3a: "Abrindo…" (role="status") e "Copiado"; PR 4b: + sendBeacon do toque; PR 7: + Pixel/GA4.
  // 3a passa sempre rastreio: null; o PR 7 passa documento.rastreio quando houver id.
```

Marcação que o JS lê (o PR 3a emite; 4b e 7 usam, nenhum outro dado vem do HTML): `<body data-pagina="<uuid>">`;
cada botão `<a … data-link="<uuid>" data-tipo="<tipo>">` (o `<summary>` do `endereco` também leva os dois);
Copiar CNPJ = `<button type="button" data-copiar="<CNPJ sem pontuação, só [0-9A-Z]>">`; o `role="status"` é `<p id="lk-status">`.

API do painel (JSON puro, erro `{ error }`, sem envelope; PATCH, nunca PUT):
- `GET /api/link-da-bio` → `{ pagina: PaginaBio | null, campanhas: [{ id, nome, slug | null }], dominio: string | null, origemGirumo: string /* getPublicSiteUrl() */, sugestaoSlug: string, linksEscondidos: string[] }`
- `POST /api/link-da-bio` → 201 `PaginaBio` (idempotente)
- `PATCH /api/link-da-bio` body `{ versao, slug, publicada, documento }` → 200 `PaginaBio` · 400 `{ error, campo? }` · 404 `{ error }` (loja sem página) · 409 `{ error, motivo: "versao" | "slug" }`.
  Ordem: `documentoBio` e slug (formato, `slugReservado`) → `conferirDocumentoDaLoja` → `salvarPaginaDaLoja` → `invalidarBio`.
- `GET /api/link-da-bio/slug?valor=` → `{ disponivel: boolean, motivo?: "formato" | "reservado" | "em-uso" }` (`em-uso` inclui slug que já foi de outra loja)
- `GET /api/link-da-bio/relatorio?dias=7|30` → `RelatorioBio`
- Público: `POST /api/p/bio/toque` → 204

## 10. Segurança

- **Escape**: texto do lojista só entra no HTML por `escapeHtml` (de `lib/campaigns/entry-page.ts`), que passa a
  escapar `'` também (PR 2, com teste). Atributo sempre entre aspas duplas. Nenhum texto do lojista dentro de
  `<script>`: o JS só lê uuids de `data-*` (e, no PR 7, o tipo do link, que é de lista fechada). O `<style>` só recebe
  tokens revalidados (cor `^#[0-9A-F]{6}$`) e números; nenhum atributo `style=`. Nenhum campo aceita HTML/CSS; ícone
  só da lista.
- **URL**: montada com `new URL`, protocolo na allowlist (`https:`, `http:`), emitindo `url.href`; o que falhar some
  do render.
- **Host**: nunca em `app.girumo.com.br` (§2); `_dominio` só fora dos hosts Girumo.
- Isolamento: store sempre com `tenant_id`; leitura pública só de `publicada = true` e `bloqueada_em is null`; slug
  nunca volta para outra loja; mídia, campanha e número conferidos no salvar (`conferirDocumentoDaLoja`) **e** campanha
  e número de novo no render (`linksEscondidos`).
- Toque: só incrementa contador próprio, com limite por IP+página; responde 204 sempre.
- Anti-ban: número conectado recusado no salvar (servidor), além do aviso na tela; o que virar conectado depois some
  da página.
- Rotas novas do painel: `getRouteTenantContext` + `assertPermission(role, "campaign:edit")` no PATCH/POST.
- Revisão de segurança obrigatória antes de mergear os PRs 4a, 4b e 5.

## 11. Desempenho e acessibilidade (critérios de aceite)

- HTML ≤ 40 KB sem compressão na página cheia (20 links, textos no máximo; é o que os testes medem, nos 4 modelos e
  com rastreio); o pior caso artificial (URLs no limite de 500) só é acompanhado no script de conferência. Só as fontes do modelo escolhido (o Vitrine usa duas famílias), `preload` só delas;
  JS inline ≤ 3 KB; imagens com `srcset` 384/640/828; Lighthouse celular ≥ 90 em Desempenho e Acessibilidade na
  página de exemplo.
- Página: alvo de toque ≥ 44 px; lista semântica (`<ul>` de `<a>`); `<details>` no "Como chegar"; contraste conforme
  §3; movimento reduzido respeitado; e mais:
  - foco visível — no Etiqueta a forma recortada (mask) vai num `::before`, e o elemento focável não tem mask;
  - reflow em 320 px sem rolagem lateral (`overflow-wrap:anywhere`); Vitrine com `min-height` no topo e o texto no
    fluxo, sem cortar com zoom 200%;
  - `h1` = nome da loja (com logo, a logo é `img` dentro do `h1`, `alt` = nome); a frase é `<p>`; o Romaneio também
    tem `h1`; `capaAlt` vazio → `alt=""`;
  - "Item/Abrir" e os números "01" com `aria-hidden`; "Abrindo…" num único `role="status"` fora da lista, limpo no
    `pageshow`; "Copiado" só se o `writeText` resolver.
- Painel: rótulos visíveis, erro ligado ao campo (`aria-describedby`), interruptor `role="switch"` com trilho
  desligado ≥ 3:1, abas WAI-ARIA (tabindex móvel, setas), foco preso na folha (componente `Folha`) e destino de foco
  por caso (§8), `scroll-padding-bottom` sob as barras fixas (2.4.11), anúncio de reordenação.

## 12. PRs (ordem e dependências)

| PR | O quê | Depende de |
|---|---|---|
| 1 | Banco: `bio_pages`, `bio_slugs` (+ trigger), `bio_contagens`, `bio_contar`, `bio_relatorio`, check SQL, baseline, card no quadro | — |
| 2 | Núcleo: `documento.ts`, `cores.ts`, `escapeHtml` com `'`, `conferir.ts`, store `bio-pages.ts`, `cache.ts` + testes | 1 |
| 3a | Renderizador base + modelo Etiqueta + fonte Lexend + testes (escape, estrutura, contraste, sem `style=`) | 2 |
| 3b | Modelos Vitrine, Romaneio, Clássico + fontes (Bodoni Moda, Jost, IBM Plex Mono, Manrope) | 3a |
| 4a | Rota pública `/bio/[slug]` (+ 301 do slug antigo) + raiz do domínio próprio + registros + visita + 308 de `app.`/apex + `invalidarBioDaLoja` nas rotas de campanha + e2e público | 3a |
| 4b | Toque: `/api/p/bio/toque` + JS do beacon | 4a |
| 5 | API do painel (`/api/link-da-bio`, slug, relatório) + testes de rota | 2 |
| 6a | Painel: página (ainda sem item no menu), aba Links, folha de link, salvar/descartar, prévia, criar página | 3a, 4a, 5 |
| 6b | Painel: abas Aparência, Perfil (uploads, sem o "Avançado") e Divulgar (QR, números) + item no menu | 6a, 3b |
| 7 | Rastreamento: Pixel/GA4 na página pública + bloco "Avançado" no Perfil | 4b, 6b |

O 6a depende do 4a para o painel nunca mostrar um endereço que ainda dá 404.
Cada PR fecha com CI verde e merge na mesma sessão; nenhum passa de ~10 arquivos de código (se passar, o plano
divide em "Parte 1" e "Parte 2", cada uma com sua branch e seu PR, sem mudar os nomes do §9).
Índice dos planos: `docs/superpowers/plans/2026-10-19-link-da-bio-00-indice.md`.

## 13. Prova em produção (para `no_ar_verificado`)

1. Numa loja de teste: criar, publicar, abrir `https://www.girumo.com.br/bio/<slug>` num celular (390 px) e no
   navegador do Instagram; tocar em cada tipo de botão; conferir a visita e os toques no relatório.
2. Na loja-piloto (com o OK do Igor): domínio próprio na raiz mostrando a página; Lighthouse celular ≥ 90.
3. Card `link-da-bio` → `no_ar_verificado` com o print e o resultado do Lighthouse.

## 14. Decisões tomadas por mim (Igor: conferir)

1. Nome "Link da bio" no menu (evita confundir com "Páginas", que são as páginas de captura).
2. Endereço: raiz do domínio próprio + `https://www.girumo.com.br/bio/<slug>` (nunca em `app.`); trocar o slug faz
   o antigo responder 301 para o atual, e um slug usado nunca vai para outra loja.
3. Página feita como HTML puro (não React) para abrir rápido e não vazar nada da Girumo.
4. Salvar explícito, não autosave.
5. Reordenar com Subir/Descer, sem arrastar.
6. "Feito com Girumo" ligado por padrão, com opção de desligar, em todos os planos.
7. Sem limite por plano na v1; página continua no ar se a assinatura vencer (não derrubar a bio do lojista de surpresa) — rever com cobrança.
8. Rastreamento (Pixel/GA4) num PR próprio, por último. Eventos: Pixel `PageView`, `Contact` (WhatsApp) e `BioToque`;
   GA4 `page_view` e `bio_toque`; nunca `Lead`.
9. Número que vira conectado depois de salvo: o botão some da página e o painel pede para trocar (idem campanha apagada).
10. As três tabelas com RLS ligado **sem policy** e sem privilégio para `authenticated` (o CLAUDE.md pede policy
    "assim mesmo"): nenhum caminho do app lê essas tabelas com a sessão do usuário, então negar tudo é mais seguro do
    que uma policy que ninguém exercita. Se um dia precisar, policy no padrão `auth.uid()` + `memberships`.
