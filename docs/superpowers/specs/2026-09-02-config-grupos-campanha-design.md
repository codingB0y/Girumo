# Configurações dos grupos e da campanha — desenho

> **Data:** 02/09/2026 · **Status:** aprovado pelo Igor em 02/09/2026 ("pode seguir no padrão")
> **Origem:** 8 prints do Meu Grupo Vip (menu da campanha, formulário de edição, página de
> espera, tela de 5 segundos, integrações, ajuda) confrontados com o código atual.
> **Proposta visual:** artifact `claude.ai/code/artifact/5baa2bf5-4de1-4356-982e-07a03ac3e4ea`
> (mockups A, B e C, fluxo do clique, decisões D1–D11).

## Problema

O link mestre `/r/<slug>` já rotaciona grupos e já conta cliques, mas a campanha **não tem
nenhuma configuração de comportamento**:

- O pixel do Facebook só existe em `tracked_links.metadata.pixelId`, e o link mestre é criado
  com `{ campaignName, master: true }` — **o pixel de campanha não tem interface**. Só os
  links comuns (`/api/links`) e as campanhas de anúncio (`/api/ad-campaigns`) gravam pixel.
- O intersticial atual ("Entrando no grupo… aguarde um instante", 0,7 s, fundo escuro) só
  dispara o pixel do navegador. Se o navegador do Instagram mata a página, o Lead se perde.
- Quando não há vaga, o visitante vê um card cru ("Todos os grupos desta campanha estão
  cheios") sem nome da loja e sem caminho — o lead que não coube hoje não entra amanhã.
- O bloco "Ações em massa" da aba Grupos sabe aplicar foto, descrição e abrir/fechar, mas não
  diz em que estado os grupos estão, não confere se os convites salvos ainda valem, e não
  remove ninguém — nem quem pediu descadastro.

O concorrente cobre isso com deep link, "bloquear lead em mais de um grupo", página de espera,
integrações (pixel, GA4, GTM, Google Ads), revisar links e remover membros. Mas confessa um
trade-off em maiúsculas: com deep link ligado, **nenhum evento do pixel é registrado**. Nós
não precisamos desse trade-off.

## Decisão

Duas superfícies, dois verbos:

| Superfície | Verbo | O que mora lá |
|---|---|---|
| `/painel/campanhas/[slug]` (aba Grupos) | **operar** | Bloco **"Configurações dos grupos"** (hoje "Ações em massa"): Identidade · Estado · Manutenção |
| `/painel/campanhas/[slug]/editar` | **configurar** | **"Configurações da campanha"**: abas Cadastro · Grupos · **Entrada** · **Integrações** |

O botão "Editar" da página da campanha vira **"Configurar"** (ícone de engrenagem). O cabeçalho
ganha **chips de estado** (deep link, um grupo por pessoa, pixel, o que acontece ao lotar), cada
um levando para a aba certa, e um **QR code** do link mestre (`qrcode.react` já instalado).

O evento Lead passa a ser registrado em **duas vias com o mesmo `event_id`**: o pixel no
navegador (como hoje) e a **API de Conversões da Meta no servidor**, disparada em `after()` para
nunca atrasar o redirecionamento. É isso que dissolve o trade-off do concorrente: com deep link
ligado, o servidor já registrou o Lead antes de o app abrir.

### Decisões de produto travadas com o Igor (02/09)

| # | Pergunta | Decisão |
|---|---|---|
| D1 | Nomes e lugares | Duas superfícies como acima; "Editar" vira "Configurar". |
| D2 | Deep link por padrão | **Ligado.** Só em celular; desktop nunca tenta `whatsapp://`. Botão de fallback sempre visível. |
| D3 | Um grupo por pessoa: grupo lembrado lotou | **O grupo lembrado vence** enquanto estiver na campanha e tiver convite — quem clicou uma vez quase sempre já está lá. |
| D4 | Quando lotar | Três modos: **aviso** (inicial), **Página da conta** (Flow Page, captura com consentimento), **URL externa**. Data de **encerramento automático** entra nesta fase. |
| D5 | Integrações | **Meta** (pixel, evento, token CAPI, código de teste), **GA4**, **Google Ads**. GTM e TikTok ficam fora. |
| D6 | Evento padrão do pixel | **Lead.** Seletor com Contact, CompleteRegistration e nome personalizado. |
| D7 | Revisar links: ritmo | **10 leituras a cada 10 min** (política do backfill), como lote no worker, mais varredura automática de madrugada. |
| D8 | Remover pessoas: escopo | **Descadastrados + números colados** primeiro; duplicados (via `leads.also_in`) numa fase seguinte, com o aviso dos ~13 % sem telefone. |
| D9 | Ajuda | **Painel lateral** aberto pelo "?" em qualquer aba, com texto; vídeos quando existirem. |
| D10 | Tela de entrada | **Texto fixo** (nome da loja + campanha + grupo), sem os seis campos de customização. |
| D11 | QR code do link mestre | **Sim**, no primeiro PR. |

### Abordagens descartadas

- **Uma aba "Configurações" na página da campanha, com tudo dentro.** Mistura o que persiste
  (pixel) com o que se aplica agora (fechar os grupos) e deixa a página de operar pesada. O
  concorrente faz isso no menu de contexto — nove ações com o mesmo peso — e é exatamente o
  que confunde.
- **Colunas novas em `campaign_groups`.** Exigiria migração nos dois bancos e baseline do
  gate de drift para um punhado de flags. `metadata` é `jsonb`, já existe e já guarda `loja`.
- **Página de 5 segundos configurável** (título, texto, botão, mensagem de busca…). Seis
  campos para uma tela que dura menos de um segundo. O pixel dispara em < 500 ms; cada
  segundo a mais dentro do navegador do Instagram é abandono.
- **Google Tag Manager no intersticial.** Um container carregando numa tela de meio segundo
  é a forma mais garantida de não disparar nada. Quem tem GTM configura o que quiser por ele.
- **Lista de espera também para campanha não configurada** (sem convite, sem admin). Isso
  esconde do lojista o que ele precisa arrumar. Esses casos mantêm a mensagem honesta de hoje.
- **Redirect 302 direto para `whatsapp://`.** Navegadores bloqueiam ou pedem confirmação
  para esquema customizado em redirect de servidor; o esquema precisa de uma página que
  navegue por JS, com fallback e botão.

## Arquitetura

```
apps/web/src/lib/campaigns/
  settings.ts                      schema zod, defaults, parse tolerante, máscara do token (puro)   (PR A)
  deep-link.ts                     código do convite → whatsapp://chat?code=…, detecção mobile (puro) (PR A)
  entry-page.ts                    HTML do intersticial e da tela de lotado (puro)                    (PR A/B)
  meta-capi.ts                     payload da API de Conversões, fbc de fbclid (puro) + envio        (PR B)
apps/web/src/lib/links/
  resolve-click-target.ts          + grupo lembrado, + encerramento, + motivo "closed"               (PR A)
apps/web/src/app/r/[slug]/route.ts + cookie, deep link, destino de lotado, CAPI em after()           (PR A/B)
apps/web/src/app/api/campanhas/route.ts   PATCH aceita `settings` (validado)                        (PR A)
apps/web/src/app/api/campanhas/[slug]/    GET devolve `settings` mascarado                          (PR A)
apps/web/src/app/api/campanhas/[slug]/integracoes/teste/route.ts  evento de teste CAPI             (PR B)
apps/web/src/components/painel/campaign-config.tsx   abas Entrada e Integrações                     (PR A/B)
apps/web/src/components/painel/campanhas/
  config-chips.tsx                 chips de estado no cabeçalho                                      (PR A)
  qr-link.tsx                      QR do link mestre                                                  (PR A)
  ajuda-painel.tsx                 painel lateral de ajuda                                            (PR A)
apps/web/src/components/painel/grupos/acoes-em-massa.tsx   vira "Configurações dos grupos"          (PR C)
apps/web/src/lib/security/csp.ts   hosts do Google no `/r/`                                         (PR B)
apps/web/src/lib/groups/bulk-batch.ts + stores/group-bulk-jobs.ts   ações check_invite, remove      (PR C/D)
apps/worker/src/bulk-loop.ts, bulk-deps.ts, evolution-groups.ts     executores novos                 (PR C/D)
```

## Modelo de dados

### `campaign_groups.metadata.settings` (PR A/B) — sem migração

```jsonc
{
  "entrada": {
    "deep_link": true,                 // D2 — só age em celular
    "um_grupo_por_pessoa": true,       // D3 — cookie gr_<campaignId>, HttpOnly, 90 dias, path /r/<slug>
    "encerra_em": null,                // "YYYY-MM-DD" | null — fim do dia em America/Sao_Paulo
    "lotado": { "modo": "aviso" }      // | { "modo": "pagina", "pagina_slug": "..." } | { "modo": "url", "url": "https://..." }
  },
  "integracoes": {
    "meta":       { "pixel_id": "", "evento": "Lead", "capi_token": "", "test_code": "" },
    "ga4":        { "id": "" },
    "google_ads": { "id": "", "label": "" }
  }
}
```

- **Parse tolerante:** `settings` ausente, parcial ou com chave desconhecida cai nos defaults
  campo a campo — nunca derruba o `/r/`. Escrita valida estrito com zod na rota (400 com o
  campo errado).
- **`capi_token` é write-only.** O GET devolve `capi_token_set: true` e os 4 últimos
  caracteres; enviar `capi_token: ""` apaga, omitir mantém. O token só é lido pelo caminho
  service-role do `/r/`. Mesmo regime das chaves da Evolution: segredo do tenant no banco,
  nunca no navegador.
- **`pixel_id`** aceita só `^\d{5,20}$` (mesma regra de `readPixelId`). `ga4.id` `^G-[A-Z0-9]+$`,
  `google_ads.id` `^AW-\d+$`, `google_ads.label` `^[A-Za-z0-9_-]+$`. `lotado.url` só `https://`.
- O `/r/` lê o pixel **da campanha** primeiro e cai no `tracked_links.metadata.pixelId` atual
  se a campanha não tiver — links comuns continuam funcionando como hoje.

### Cookie "um grupo por pessoa" (PR A)

`gr_<campaignId sem hífens>` = `<whatsapp_group_id>` · `HttpOnly; Secure; SameSite=Lax;
Path=/r/<slug>; Max-Age=7776000`. Sem PII (só o id do grupo). Cookie funcional, não de
rastreamento — entra na política de privacidade como tal. Gravado só quando o redirect
acontece, nunca em bloqueio.

### PR C — revisão de links

`group_bulk_jobs.action` ganha `check_invite` (a CHECK constraint precisa ser recriada —
migração nos **dois** bancos + `deploy/supabase/apply-order.txt` + baseline do gate de drift).
Resultado gravado em `groups`: `invite_checked_at timestamptz`, `invite_check text check in
('same','changed','broken')`. Job com sucesso e código diferente **atualiza `invite_url`** e
marca `changed`; 404/sem acesso marca `broken` e não apaga o convite salvo.

### PR D — remoção

`group_bulk_jobs.action` ganha `remove_participants`; carga em coluna `payload jsonb`
(`{ phones: [...] }`). O worker lista participantes do grupo (`GET /group/participants`),
casa por `phoneNumber`/JID e chama `POST /group/updateParticipant` com `action: "remove"`
(schema da 2.3.7: `participants` com `minItems: 1`). Quem não foi localizado (regime `@lid`
sem telefone) volta no `ack` como `not_found`, e a tela diz quantos.

## Fluxo do clique (`/r/<slug>`)

1. Resolve link → campanha → grupos (como hoje). Lê `settings` da campanha.
2. **Encerramento:** se `encerra_em` passou → motivo `closed`.
3. **Grupo lembrado:** se `um_grupo_por_pessoa` e o cookie aponta um grupo que está em
   `group_ids` e tem convite utilizável → é o destino (ignora lotação, D3). Senão, rotação
   normal (`nextAvailableGroup`).
4. **Bloqueio:** `all-full`, `cap-reached`, `closed` → destino de lotado conforme `lotado.modo`
   (aviso com nome da loja / 302 para `/p/<pagina_slug>` / 302 para a URL). `empty-pool`,
   `no-invite`, `no-admin` → mensagem honesta de hoje, sem lista de espera.
5. **Registro:** contador + evento de clique (como hoje) e, se houver `capi_token`, o Lead pela
   API de Conversões em `after()`.
6. **Resposta:** se há qualquer integração configurada **ou** deep link em celular → intersticial;
   senão → 302 (como hoje). Cookie gravado na resposta.

### Intersticial (tela de entrada)

- Fundo claro do produto, nome da loja (`metadata.loja`), "Abrindo o WhatsApp…", nome do
  grupo, linha de progresso de 600 ms, **botão "Abrir WhatsApp" visível desde o primeiro
  frame**, rodapé "girumo".
- Scripts com nonce da CSP (como hoje): pixel (`fbq('init')`, `PageView`, evento escolhido com
  `{ eventID }`), GA4 (`gtag('event','generate_lead')`), Google Ads
  (`gtag('event','conversion',{ send_to })`).
- Em 600 ms: celular com deep link → `location.href = whatsapp://chat?code=<CODE>`; em 1,2 s,
  se `document.visibilityState === "visible"`, cai em `https://chat.whatsapp.com/<CODE>`.
  Desktop ou deep link desligado → `location.replace(https)` em 600 ms. `<noscript>` com
  `meta refresh` para o link https.
- `<CODE>` é o último segmento do `invite_url`; se não casar `^https://chat\.whatsapp\.com/[A-Za-z0-9]+$`,
  o deep link é ignorado e vale o link normal.

### API de Conversões (PR B)

`POST https://graph.facebook.com/<versão>/<pixel_id>/events` com `access_token` no corpo:

```jsonc
{ "data": [{
  "event_name": "Lead", "event_time": <unix>, "event_id": "<uuid compartilhado>",
  "action_source": "website", "event_source_url": "<URL do /r/>",
  "user_data": { "client_ip_address": "<x-forwarded-for[0]>", "client_user_agent": "<UA>",
                 "fbc": "fb.1.<agora_ms>.<fbclid>",      // só quando há fbclid real na URL
                 "fbp": "<cookie _fbp, se existir>" },
  "custom_data": { "campaign": "<nome>", "group": "<whatsapp_group_id>" }
}], "test_event_code": "<opcional>" }
```

Timeout de 3 s, falha só loga (`[r/capi]`), nunca toca o redirect. Versão da Graph API numa
constante (`v23.0` hoje — a Meta mantém cada versão por ~2 anos). Bots (`BOT_UA`) não geram
CAPI. O botão "Enviar teste" na aba Integrações chama uma rota que monta o mesmo payload com
`test_event_code` e devolve `events_received` da resposta da Meta.

## Interface

**Página da campanha:** chips no cabeçalho (`Deep link · ligado`, `1 grupo por pessoa`,
`Pixel · …3456` ou `Pixel · não configurado`, `Lotado → lista de espera`), botão "Configurar",
QR do link ao lado do "Copiar link". Aba Grupos: bloco "Configurações dos grupos" com
**Identidade** (igual), **Estado** (contagem `abertos / fechados / sem informação` a partir de
`groups.send_state` antes dos botões; horário automático citado como próximo passo, sem botão
morto), **Manutenção** (Revisar links com última revisão e contagem `iguais / trocados /
quebrados` + "Revisar agora" com ETA honesto; Remover pessoas com contagem de descadastrados
ainda em grupo, botão perigoso com confirmação, e "Colar números…"). Progresso único embaixo.

**Configurações da campanha (`/editar`):** abas Cadastro · Grupos · Entrada · Integrações, com
"? Ajuda" no cabeçalho. **Entrada:** dois toggles com estado à direita, "Encerrar
automaticamente" (data + "faltam N dias"), "Quando lotar" como grupo de rádios (aviso / Página
da conta com seletor das páginas publicadas / outro link), prévia da tela ao lado.
**Integrações:** um card por serviço com etiqueta de estado (`recebendo eventos`, `sem token`,
`não configurado`), campos, "Enviar teste" e o aviso "Lead registrado mesmo com deep link".
Texto explicativo curto abaixo de cada campo; a consequência técnica fica no painel de ajuda.

## Testes

- **Unitário, sem rede** (`tsx --test`, arquivos puros): `settings.ts` (defaults, parse
  tolerante, máscara, rejeições), `deep-link.ts` (código válido/inválido, UA), `entry-page.ts`
  (nonce presente nos dois scripts, sem scripts quando nada configurado), `meta-capi.ts`
  (fbc só com fbclid, `event_id` igual ao do HTML, `test_event_code` só quando pedido),
  `resolve-click-target.ts` (grupo lembrado vence lotado; grupo lembrado fora do pool cai na
  rotação; `closed` por data; pool não configurado nunca vira lista de espera).
- **Integração:** `/r/` com cookie → mesmo grupo; sem cookie → cookie gravado; PATCH de
  `settings` inválido → 400 nomeando o campo; GET nunca devolve o token inteiro. Rodar o
  mutante (trocar `>=` por `>` no encerramento) e ver o teste cair.
- **E2E:** salvar Entrada e Integrações e ver os chips do cabeçalho refletirem — contraste
  API × tela (âncora + derivação em runtime), nunca número fixo. `page.reload()` antes de ler.
- **Manual em produção (PR B):** evento de teste chegando na aba "Testar eventos" do
  Gerenciador; clique real num anúncio com `fbclid` e o Lead aparecendo deduplicado.

## Riscos

| Risco | Tratamento |
|---|---|
| Token CAPI vaza pelo GET | Write-only; GET só devolve `capi_token_set` + 4 últimos; teste cobre. |
| iOS/navegador do Instagram bloqueia `whatsapp://` sem gesto | Botão sempre visível; fallback https em 1,2 s por `visibilityState`. |
| Match quality baixa sem `fbp` na primeira visita | `fbc` + IP + UA é o mínimo recomendado pela Meta para clique de anúncio; `fbp` entra quando o cookie já existe. |
| CSP bloqueia gtag no `/r/` | Política `click-redirect` ganha os hosts do Google (script, img, connect); teste de CSP existente cobre. |
| Cookie e LGPD | Sem PII, funcional, 90 dias, path restrito ao slug. Citar na política de privacidade. |
| Versão da Graph API expira | Constante única; a Meta avisa 90 dias antes. |
| Ritmo de revisão (10/10 min) parece lento | ETA honesto na tela ("≈ 1 h 30 para 91 grupos"); varredura noturna torna o manual raro. |
| Migração só num banco (PR C/D) | Dev **e** prod + `apply-order.txt` + baseline; o gate de drift quebra se faltar. |
| Remoção de quem não pediu | Confirmação explícita com a contagem; números colados passam por normalização e prévia. |

## Fora de escopo

- GTM, TikTok; customização de texto da tela de entrada; vídeos de ajuda (entram quando
  existirem); horário automático de abrir/fechar (PR 3 da spec de 30/08); remoção de
  duplicados por `also_in` (fase seguinte de D8); server-side GA4 (Measurement Protocol).

## Fatiamento

Um PR único passaria de 30 arquivos. Quatro PRs, cada um fechado (review → CI → merge) antes do
seguinte:

1. **PR A — Entrada.** `settings.ts` + zod, PATCH/GET de settings, aba Entrada, chips, botão
   "Configurar", QR, painel de ajuda, `/r/` com deep link, cookie, encerramento e destino de
   lotado, tela de entrada nova. Sem integrações.
2. **PR B — Integrações.** Aba Integrações, `meta-capi.ts` + `after()`, GA4 e Google Ads no
   intersticial, CSP, rota de evento de teste.
3. **PR C — Configurações dos grupos: Estado e Revisar links.** Renomear o bloco, contagem por
   `send_state`, ação `check_invite` (migração), varredura noturna, badges de link.
4. **PR D — Remover pessoas.** Ação `remove_participants` (migração), listagem de
   participantes no worker, descadastrados + números colados, contagem de não localizados.
