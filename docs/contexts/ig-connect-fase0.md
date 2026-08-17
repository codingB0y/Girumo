# IG Connect — Fase 0: validação técnica

> Pesquisa contra a documentação oficial da Meta (developers.facebook.com), agosto/2026.
> Objetivo: decidir GO/NO-GO antes de escrever PRD e código.
> **Veredito no fim do documento.** Leia o §8 antes de aprovar qualquer sprint.

---

## 0. O que a feature precisa fazer

| Fluxo | Gatilho | Ação |
|---|---|---|
| **A** | Comentário com palavra-chave em post/reel do lojista | DM automática (*private reply*) com mensagem + link rastreado |
| **B** | DM recebida com palavra-chave | Resposta automática com mensagem + link rastreado |

O link de destino já existe: `GET /r/[slug]` (`apps/web/src/app/r/[slug]/route.ts`). Ele já resolve
o grupo aberto do pool (`campaign_group_id` → `resolveClickTarget`), grava clique
(`link_click_events`), dispara Pixel e redireciona pro convite do WhatsApp. **Nada disso precisa
ser reescrito** — o IG Connect só precisa entregar essa URL dentro de uma DM.

---

## 1. Rota de login: qual usar e por quê

A Meta oferece dois caminhos, documentados lado a lado no
[Instagram Platform — Overview](https://developers.facebook.com/docs/instagram-platform/overview/):

| | **Instagram API with Instagram Login** | **Instagram API with Facebook Login** |
|---|---|---|
| Página do Facebook vinculada | **Não exigida** | **Exigida** |
| Escopos | `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_comments`, `instagram_business_manage_messages` | `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, `instagram_manage_insights`, `instagram_manage_messages`, `pages_show_list`, `pages_read_engagement` |
| Token | *Instagram User access token* (direto da conta IG) | *Facebook User* ou *Page token* |
| Mensageria | Nativa (`graph.instagram.com`) | Via Messenger Platform |
| Comentários | Sim | Sim |
| App Review + Business Verification | Necessários pra Advanced Access | Necessários pra Advanced Access |

### Escolha: **Instagram API with Instagram Login**

Três motivos, em ordem de peso:

1. **Elimina o pior ponto de atrito do onboarding multi-tenant.** A rota Facebook Login exige que
   cada lojista tenha uma Página do Facebook vinculada à conta profissional do Instagram, com
   permissão de admin na Página. Na prática, no nosso público (atacadista do Brás/44), isso é
   metade dos tickets de suporte: Página que não existe, Página de outro dono, admin perdido.
   A rota Instagram Login pede **só** que a conta do Instagram seja profissional (Business ou
   Creator) — que os nossos lojistas já são.
2. **Menos escopos = App Review menor.** Não precisamos de `pages_show_list` nem
   `pages_read_engagement`. Cada permissão a menos é um ciclo de revisão a menos e uma
   justificativa a menos pra escrever.
3. **Token é da conta, não de uma Página.** O modelo de dados fica trivialmente multi-tenant:
   uma linha por conta IG conectada, com `tenant_id` + token. Sem árvore Página↔IG pra resolver.

**Custo da escolha:** o token do Instagram Login vale **60 dias** e precisa de refresh
(`GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token`). Isso é um
cron, não um bloqueio — e já temos infraestrutura de cron na Vercel.

**Escopos que vamos pedir (só 3, `content_publish` fica de fora):**

```
instagram_business_basic
instagram_business_manage_messages
instagram_business_manage_comments
```

---

## 2. Fluxo OAuth (Business Login for Instagram)

Fonte: [Business Login for Instagram](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login).

```
1) Autorização (browser do lojista)
   GET https://www.instagram.com/oauth/authorize
       ?client_id=<INSTAGRAM_APP_ID>
       &redirect_uri=<HTTPS_CALLBACK>
       &response_type=code
       &scope=instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments
       &state=<CSRF + tenant_id assinado>

2) Troca do code (server-to-server) — code vale 1 hora, uso único
   POST https://api.instagram.com/oauth/access_token
       client_id, client_secret, grant_type=authorization_code, redirect_uri, code
   → short-lived token

3) Long-lived (server-to-server)
   GET https://graph.instagram.com/access_token
       ?grant_type=ig_exchange_token&client_secret=<SECRET>&access_token=<SHORT_LIVED>
   → token válido por 60 dias

4) Refresh (cron, antes do dia 60)
   GET https://graph.instagram.com/refresh_access_token
       ?grant_type=ig_refresh_token&access_token=<LONG_LIVED>

5) Assinar os webhooks pra essa conta
   POST /me/subscribed_apps?subscribed_fields=comments,messages&access_token=<TOKEN>
```

⚠️ **O passo 5 é fácil de esquecer e quebra tudo silenciosamente.** Assinar o app no App Dashboard
só configura o *endpoint*; sem `POST /me/subscribed_apps` **por conta conectada**, nenhum webhook
daquela conta chega. É o bug nº1 de quem integra essa API.

⚠️ **`state` é obrigatório na prática.** O callback do OAuth é público; sem um `state` assinado
carregando o `tenant_id`, qualquer um pode fazer um callback e associar uma conta IG ao tenant
errado. Tratar como CSRF token, com TTL curto.

---

## 3. Webhooks

Fonte: [Instagram Platform — Webhooks](https://developers.facebook.com/docs/instagram-platform/webhooks)
e [Webhooks Reference — Instagram](https://developers.facebook.com/docs/graph-api/webhooks/reference/instagram/).

### 3.1 Handshake de verificação (GET)

A Meta chama o endpoint com `hub.mode=subscribe`, `hub.challenge=<int>`, `hub.verify_token=<string>`.
O endpoint deve **validar o `hub.verify_token`** contra o valor configurado e responder o
`hub.challenge` cru (text/plain).

### 3.2 Assinatura (POST)

Todo payload vem assinado em `X-Hub-Signature-256: sha256=<hmac>`, HMAC-SHA256 do **corpo cru**
com o *App Secret*. Validar com comparação em tempo constante.

⚠️ **Precisa do body cru.** Em Next.js App Router, `await req.text()` antes de qualquer
`JSON.parse` — reserializar o JSON quebra a assinatura (ordem de chaves/espaços).

### 3.3 Campos que vamos assinar

Só dois: `comments` e `messages`. (Existem `live_comments`, `mentions`, `message_reactions`,
`messaging_postbacks`, `messaging_seen`, `standby`, `story_insights` etc. — fora do MVP.)

### 3.4 Payload — `comments`

Formato observado (a doc oficial lista os campos; exemplo consolidado):

```json
{
  "object": "instagram",
  "entry": [{
    "id": "<IG_ID_DA_CONTA_DO_LOJISTA>",
    "time": 1778223729,
    "changes": [{
      "field": "comments",
      "value": {
        "id": "<COMMENT_ID>",
        "text": "EU QUERO",
        "from": { "id": "<IGSID_DO_COMENTARISTA>", "username": "fulana" },
        "media": { "id": "<MEDIA_ID>", "media_product_type": "REELS" },
        "parent_id": "<COMMENT_ID_PAI, se for resposta a outro comentário>"
      }
    }]
  }]
}
```

Campos que a referência oficial declara em `value`: `from` (`id`, `username`), `id`,
`self_ig_scoped_id`, `media` (`id`, `media_product_type`), `parent_id`, `text`.

⚠️ **Filtrar o próprio lojista.** Comentário feito pela própria conta conectada também gera evento.
Sem filtro (`value.from.id === entry.id`, ou `self_ig_scoped_id`), o sistema responde a si mesmo em
loop. **Também filtrar `parent_id` presente** no MVP: só responder comentário de primeiro nível.

### 3.5 Payload — `messages`

Campos declarados na referência: `sender`, `recipient`, `timestamp`, `message` (com `mid`, `text`,
`attachments`, `reply_to`, `story`), `is_self`, `is_deleted`, `folder`.

⚠️ **Echo da própria mensagem.** A DM que *nós* enviamos volta como evento. Filtrar `is_self`
(e/ou `message_echoes` não assinado) senão o bot conversa sozinho.

### 3.6 Prazo de resposta

O endpoint deve responder **em menos de 20 segundos**, senão a Meta considera falha e reenvia
(com backoff). Consequência de arquitetura: **o webhook não pode chamar a API de envio na mesma
request**. Recebe → valida assinatura → grava evento → responde `200` → processa fora do caminho
crítico.

---

## 4. Private reply (o coração do Fluxo A)

Endpoint (mesmo da DM normal, trocando o destinatário):

```
POST https://graph.instagram.com/v25.0/<IG_ID>/messages
{
  "recipient": { "comment_id": "<COMMENT_ID>" },
  "message":   { "text": "<TEXTO + LINK>" }
}
```

Limites **duros**, confirmados:

| Limite | Valor | Consequência de produto |
|---|---|---|
| Replies por comentário | **1, pra sempre** | Segunda tentativa → erro `subcode 2534014`. Precisamos de **idempotência por `comment_id`** no banco, não só "tenta e vê". |
| Idade máxima do comentário | **7 dias corridos** (a partir de `created_time`) | Comentário antigo não é respondível. Backfill de comentários velhos é impossível — não prometer isso. |
| Tamanho do texto | **1000 bytes**, UTF-8 | Emoji custa 4 bytes. Validar no painel em **bytes**, não em caracteres. |
| Janela de 24h | Resposta a evento do usuário | Irrelevante pro nosso caso: respondemos em segundos. |

Se a pessoa responder à nossa private reply, abre uma conversa normal com nova janela de 24h.
**Fora do escopo do MVP** — o porteiro manda 1 mensagem e acabou.

### Rate limits (rota Instagram Login)

- **100 chamadas/segundo** por conta profissional pra mensagens de texto/link.
- **10 chamadas/segundo** pra áudio/vídeo.
- **750 private replies/hora** por conta, em posts e reels.

Nosso volume alvo (~50 contatos/dia/cliente) usa **fração de 1%** disso. Rate limit **não é risco**.

> Correção ao briefing: o número "~200 chamadas/h" que circula na internet é convenção de
> ferramentas de terceiros pra evitar detecção de spam, **não** um limite publicado pela Meta.
> Os limites oficiais são os três acima.

---

## 5. App Review, Business Verification e modo desenvolvimento

### 5.1 O que precisa

- **Business Verification** do CNPJ no Meta Business Manager. É **pré-requisito**, e tem processo
  de documentos próprio. Tentar App Review antes da verificação passar é o erro de sequência mais
  comum e gera rejeição.
- **App Review** por permissão: `instagram_business_manage_messages` e
  `instagram_business_manage_comments` são revisões **separadas**, cada uma com sua justificativa
  e sua prova visual no screencast.
- **Screencast** mostrando o caso de uso real de cada permissão, com login funcional no nosso
  domínio e uma conta de teste pro revisor.
- **URLs públicas obrigatórias:** Política de Privacidade, Termos de Uso e **Data Deletion**
  (callback ou página de instruções). O callback precisa devolver **JSON** com `url` e
  `confirmation_code` — devolver HTML reprova. O revisor cruza a política de privacidade contra o
  método de deleção e contra as permissões pedidas; inconsistência entre os três é gatilho comum
  de rejeição.

### 5.2 Prazo

Permissões de mensageria têm requisitos mais estritos (caso de uso de atendimento) e demoram mais
que as de leitura. Na prática: **semanas**, com possibilidade de uma ou mais rejeições e
re-submissões. Não é um prazo que dá pra prometer pro cliente.

### 5.3 O modo desenvolvimento salva o ano 1

Em Development Mode, **só contas com role no app conseguem autorizar** — e a rota Instagram Login
tem um papel específico pra isso: **Instagram Testers**.

Fluxo (App Dashboard → *Roles* → *Instagram Testers* → *Add Instagram Testers* → username):
o lojista aceita em `instagram.com` → *Editar perfil* → *Apps e sites* → *Convites de testador*.

Depois de aceito, **a integração funciona de verdade** (webhooks, DMs, private replies) — não é
sandbox falso. O teto é da ordem de **25 testadores**, que cobre a carteira do ano 1 (~24 clientes).

**Estratégia confirmada como viável:** beta fechado em modo desenvolvimento, com App Review
correndo em paralelo. Mas veja o risco R2 no §8 — não é de graça.

---

## 6. Privacidade / LGPD

O que precisamos guardar por evento, e **nada além**:

| Campo | Por quê |
|---|---|
| `ig_user_id` (IGSID) | Identificador **escopado ao app** — não é o @ público, não é reidentificável fora do nosso app. |
| `username` (opcional) | Só pra o lojista reconhecer quem foi, na tela de atendimentos. Descartável. |
| `comment_id` / `message_id` | Idempotência (obrigatório, ver §4). |
| `keyword` casada + `trigger_id` | Telemetria. |
| `timestamp`, `status`, `error_code` | Operação e suporte. |

**Não guardar:** texto integral de DMs, mídia, foto de perfil, lista de seguidores, qualquer coisa
sobre terceiros. O texto do comentário/DM só é necessário no instante do match — guardar no máximo
a palavra-chave que casou, não a frase inteira.

Retenção: expirar eventos em **90 dias** (basta pro suporte e pra métrica mensal). Já temos padrão
de `tenant_id` + RLS no repositório; seguir igual.

Deleção: implementar o **Data Deletion Callback** (§5.1) apagando as linhas de `ig_*` do
`ig_user_id` informado — é requisito de review **e** de LGPD ao mesmo tempo.

---

## 7. Custo

A API de mensageria do Instagram **não cobra por mensagem** (diferente da WhatsApp Cloud API).
Confirmado: não há tabela de preço por conversa na documentação do Instagram Platform. O custo do
IG Connect é engenharia + compute, não Meta. **Isso confirma a margem do upsell.**

---

## 8. Riscos — o que pode dar errado

| # | Risco | Severidade | Mitigação |
|---|---|---|---|
| **R1** | **App Review reprovar por "caso de uso".** As permissões de mensagem são posicionadas pela Meta como *customer service*. Nosso uso — responder quem pede o link e mandar pra fora da plataforma — é exatamente o que o ManyChat faz (e ele é Meta Business Partner), então é prática aprovada. Mas *nós* não somos partner, e a régua pra app novo é mais dura. | 🔴 Alta | Enquadrar o screencast como atendimento: cliente **pergunta** ("quero o catálogo"), negócio **responde** com o canal de atendimento. Nunca narrar como "captação" ou "geração de leads". |
| **R2** | **Teto de 25 testadores é ilusão de folga.** Cada convite exige o lojista logar no Instagram web e aceitar um convite escondido em *Editar perfil → Apps e sites*. No nosso público isso é suporte 1-a-1. E se a carteira passar de ~25 **antes** do review aprovar, a fila trava. | 🟠 Média | Aceitar. Submeter o App Review **junto** com o início do beta, não depois. Documentar o passo-a-passo do convite com print, em PT-BR. |
| **R3** | **Token de 60 dias expira em silêncio.** Se o cron de refresh falhar, a automação do lojista para e ninguém percebe — igual ao caso do heartbeat da engine que já aconteceu aqui. | 🟠 Média | Refresh no dia ~50, `status` explícito na conta conectada, badge no painel + e-mail quando expirar. |
| **R4** | **Meta muda a plataforma.** Precedente real: os escopos foram renomeados pra `instagram_business_*` em 27/01/2025, e em 27/04/2026 três Message Tags passaram a devolver erro 100. | 🟠 Média | Não usar Message Tags (não precisamos). Fixar versão da Graph API na env, não hardcoded. Logar `error_code` da Meta em toda falha. |
| **R5** | **Assinatura por conta esquecida** (`/me/subscribed_apps`) → "conectou mas não funciona". | 🟡 Baixa | Fazer no fim do OAuth e **verificar** com `GET /me/subscribed_apps`; refletir no painel como "escutando: sim/não". |
| **R6** | **Loop de auto-resposta** (comentário/DM da própria conta). | 🟡 Baixa | Filtros do §3.4/§3.5 + teste automatizado com payload de echo. |
| **R7** | **Conta pessoal, não profissional.** Lojista tenta conectar e o OAuth falha com erro cru. | 🟡 Baixa | Detectar e mostrar instrução em PT-BR de como virar conta profissional. |

### O que **não** é risco (verificado, pra não gastar tempo à toa)
- Rate limit (§4) — sobra 100x.
- Custo por mensagem (§7) — zero.
- Janela de 24h (§4) — respondemos em segundos.
- Exigir Página do Facebook (§1) — evitado pela escolha da rota.

---

## 9. Veredito: **GO** — com uma condição

A integração é tecnicamente viável, os limites da plataforma cabem folgadamente no nosso volume, o
custo marginal é zero, e o destino da mensagem (o link rastreado) já existe e funciona. A escolha
da rota **Instagram Login** remove a maior fricção de onboarding.

**A condição:** o caminho crítico do projeto **não é o código, é o App Review (R1)**. O código do
MVP é de ordem de dias; a aprovação da Meta é de ordem de semanas e pode ser reprovada por como a
história é contada, não por como o software funciona.

Portanto, a sequência que a Fase 1 precisa respeitar:

1. **Igor começa a Business Verification do CNPJ hoje** — é pré-requisito, roda em paralelo e não
   depende de linha de código nenhuma.
2. Construir o MVP em modo desenvolvimento, com 1 conta de teste.
3. Submeter o App Review **assim que houver screencast gravável** — não esperar o produto estar
   polido.
4. Beta fechado com testadores enquanto o review corre.

**NO-GO parcial, explícito:** não vender, prometer nem anunciar o "+ Instagram" pra base antes da
aprovação do App Review sair. Em modo desenvolvimento a feature funciona, mas cada cliente novo
custa um convite manual e existe um teto rígido.

---

## Fontes

- [Instagram Platform — Overview](https://developers.facebook.com/docs/instagram-platform/overview/)
- [Instagram API with Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/)
- [Business Login for Instagram](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login)
- [Send Messages (Instagram Login)](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/)
- [Instagram Platform — Webhooks](https://developers.facebook.com/docs/instagram-platform/webhooks)
- [Webhooks Reference — Instagram](https://developers.facebook.com/docs/graph-api/webhooks/reference/instagram/)
- [Graph API — Rate Limiting](https://developers.facebook.com/docs/graph-api/overview/rate-limiting/)
- [App Modes (Development vs Live)](https://developers.facebook.com/docs/development/build-and-test/app-modes/)
- [Data Deletion Request Callback](https://developers.facebook.com/documentation/development/create-an-app/app-dashboard/data-deletion-callback)
- [Messenger Platform](https://developers.facebook.com/docs/messenger-platform/)
