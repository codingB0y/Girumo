# Oferta Relâmpago — design

**Data:** 2026-09-01
**Estado:** desenho aprovado, sem implementação

## O problema

A lojista anuncia uma promoção no grupo VIP e pede que as clientes comentem uma
palavra-chave — "EU QUERO". Quem comenta primeiro tem prioridade na compra. Hoje
isso é feito no olho: alguém rola o grupo, anota nomes num papel e chama uma por
uma. Três coisas quebram nesse processo:

1. **Ninguém consegue provar a ordem.** Duas clientes comentam com segundos de
   diferença e as duas juram que foram a primeira. Sem registro, a discussão não
   tem fim — e o custo não é a venda perdida, é a cliente que sai do grupo.
2. **Com mais de uma vendedora, duas chamam a mesma pessoa** ou duas vendem a
   mesma peça. Quando o estoque é menor que o número de vendedoras, isso é
   garantido, não é azar.
3. **A cliente que comentou e não foi chamada não sabe se está na fila ou se foi
   ignorada.** É a origem da maior parte do atrito.

Este documento desenha o subsistema que resolve os três.

## O que já existe e o que falta

Levantado no código em 01/09/2026.

| Peça | Estado |
|---|---|
| Webhook da Evolution | Existe em `apps/web/src/app/api/webhooks/evolution/route.ts`, autenticado por secret, idempotente por `event_id` + UNIQUE em `engine_events`. |
| Evento `messages.upsert` | **Não existe.** O `webhook-schema.ts` só aceita `qrcode.updated`, `connection.update`, `group-participants.update`, `groups.upsert` e `messages.update`. Hoje o sistema não vê nenhuma mensagem que as clientes escrevem. |
| Papel de vendedora | Existe: `memberships.role` já tem `owner` / `admin` / `operator`. Não precisa entidade nova. |
| Id da mensagem que enviamos ao grupo | **Não guardamos.** `/api/dispatch/ack` só devolve `sent`/`total`. Irrelevante para este design (ver "Amarração"), mas registrado porque foi avaliado e descartado. |
| Resolução de `@lid` para telefone | Parcial: `apps/web/src/lib/evolution/admin-group.ts` já casa `@lid` com `phoneNumber` lendo os participantes do grupo. Precisa virar um mapa reusável. |
| Menu do painel | Fonte única em `apps/web/src/lib/painel-nav.ts`. Adicionar item é trivial. |

## Decisões

Fechadas no brainstorming de 01/09/2026.

### D1 — Amarração: janela aberta por grupo

O comentário pertence à oferta que está **aberta naquele grupo naquele momento**.
Não por reply, não por palavra-chave distinta.

O gestor abre a oferta escolhendo os grupos; enquanto ela está aberta, todo
comentário com a palavra-chave naqueles grupos entra na fila dela. **Só pode
haver uma oferta aberta por grupo por vez** — e isso é garantido por índice
único no banco, não por disciplina de tela.

Rejeitado: exigir reply na mensagem do post. Seria mais preciso, mas quem só
digita "EU QUERO" solto — a maioria — ficaria fora da fila, e essa exclusão
silenciosa é pior que a imprecisão que ela evita.

### D2 — Ritmo: paralelo limitado por vagas

O gestor informa quantas peças tem. O número de reservas simultâneas nunca passa
disso. Com 10 peças e 3 vendedoras, as três atendem em paralelo. Com 1 peça, o
próprio número serializa tudo sozinho, sem regra especial.

Uma regra cobre os dois cenários. Não existe modo "série" e modo "paralelo".

### D3 — Fim do timer: depende de quem falhou

O cronômetro **só começa quando a vendedora declara que chamou**. Antes disso ela
tem o mesmo prazo para chamar.

- **Estourou sem ela chamar** → a falha foi da loja. A cliente volta para a fila
  **na mesma posição** e outra vendedora pode pegá-la.
- **Estourou depois de chamada** → a cliente não respondeu. Vai para o **fim da
  fila**, sem perder o registro do horário original.

É a diferença entre "a loja me ignorou" e "eu sumi", e é o que impede o sistema
de punir a cliente por lentidão interna.

### D4 — Distribuição: a vendedora puxa

Não há rodízio automático. A vendedora clica em **"Pegar próxima"** e leva a
primeira da fila que estiver livre.

O resultado prático é o rodízio que se queria (A clica e pega a 1ª, B clica e
pega a 2ª), mas vendedora ausente não segura ninguém, e não é preciso um controle
de "estou disponível" que alguém sempre esquece de marcar.

### D5 — Escopo da primeira entrega: só o motor

Captura, fila, reserva, timer e telas. Reação ✅ no comentário, aviso de
"esgotou" no grupo e publicação da fila ficam para depois de ver uma promoção
real rodando.

## Arquitetura

Tudo em `apps/web`. Nenhuma infraestrutura nova.

```
Evolution API
   │  messages.upsert
   ▼
/api/webhooks/evolution   ── descarta cedo: não é grupo? é nossa? sem oferta
   │                          aberta? não casa a palavra? → 200 e fim
   ▼
flash_offer_entries        ── só o que casa vira linha
   │
   ▼
/painel/relampago/[id]     ── a vendedora puxa, chama, marca o desfecho
```

**O timer não é um processo.** É aritmética sobre `claimed_at` / `contacted_at` e
o prazo da oferta, calculada na leitura. A tela da vendedora dá poll de qualquer
forma; quem lê é quem recicla o que venceu. Não há cron, não há job, não há fila.

Rejeitado: pôr a expiração no `apps/worker`. Cada mudança viraria um redeploy no
Coolify, e o worker já é gargalo de outras coisas — para resolver o que uma coluna
`timestamptz` resolve.

**Volume e privacidade.** Ligar `messages.upsert` faz o webhook receber toda
mensagem de todos os grupos onde a instância está — 194 grupos hoje. O receiver
descarta na primeira condição que falhar, então **nada disso vira linha no banco**;
só persiste o que casa com uma janela aberta. É requisito, não otimização: são
dados pessoais de gente que não é cliente de ninguém.

## Modelo de dados

Quatro tabelas. Nomes de coluna e padrões copiados de `group_bulk_jobs`.

### `flash_offers`

A oferta. `keyword` guardada já normalizada (minúscula, sem acento).

| coluna | tipo | nota |
|---|---|---|
| `id` | uuid pk | |
| `tenant_id` | uuid not null | → `organizations(id)` |
| `name` | text not null | "Combo de roupas X" |
| `keyword` | text not null | normalizada; default `'eu quero'` |
| `slots` | integer not null | quantas peças; `check (slots > 0)` |
| `timer_seconds` | integer | **null = sem timer** |
| `status` | text not null | `draft` / `open` / `closed` |
| `opened_at`, `closed_at` | timestamptz | |
| `created_by` | uuid | auth user que abriu |
| `created_at`, `updated_at` | timestamptz not null | |

### `flash_offer_groups`

Os grupos-alvo. Existe como tabela — e não como `group_ids uuid[]` no estilo de
`broadcasts` — porque **carrega o índice que torna a divergência impossível**:

```sql
create unique index flash_offer_groups_um_aberto_uidx
  on public.flash_offer_groups (tenant_id, whatsapp_group_id)
  where closed_at is null;
```

Com ele, abrir uma segunda oferta num grupo que já tem uma aberta é recusado pelo
Postgres. Nenhuma tela pode errar isso.

| coluna | tipo | nota |
|---|---|---|
| `id` | uuid pk | |
| `tenant_id` | uuid not null | |
| `offer_id` | uuid not null | → `flash_offers(id) on delete cascade` |
| `group_id` | uuid not null | → `groups(id)` |
| `whatsapp_group_id` | text not null | desnormalizado: o webhook não faz join |
| `opened_at` | timestamptz not null | corta comentário atrasado (ver R3) |
| `closed_at` | timestamptz | null = aberta |
| `lid_map` | jsonb not null default `'{}'` | `@lid` → telefone (ver R1) |

### `flash_offer_entries`

Um comentário capturado. Uma linha por cliente por oferta.

| coluna | tipo | nota |
|---|---|---|
| `id` | uuid pk | |
| `tenant_id`, `offer_id` | uuid not null | |
| `group_id`, `whatsapp_group_id` | | de onde veio |
| `participant_jid` | text not null | como chegou: `@lid` **ou** `@s.whatsapp.net` |
| `phone` | text | **null quando não resolvemos. Nunca inventado.** |
| `push_name` | text | nome do WhatsApp, não nome real |
| `message_text` | text not null | o comentário cru — é a prova |
| `message_id` | text not null | `key.id`; idempotência |
| `commented_at` | timestamptz not null | **timestamp do WhatsApp**, não o nosso |
| `deprioritized_at` | timestamptz | null = na ordem original (ver D3) |
| `outcome` | text | null / `sold` / `dropped` |
| `created_at`, `updated_at` | timestamptz not null | |

Índices que carregam regra:

```sql
-- Reentrega do webhook vira no-op.
create unique index flash_offer_entries_msg_uidx
  on public.flash_offer_entries (tenant_id, message_id);

-- Mesma pessoa comentando 5x ocupa UM lugar, o primeiro. Casa por telefone
-- quando temos, por jid quando não — senão a mesma cliente vinda como @lid num
-- evento e como @s.whatsapp.net noutro entraria duas vezes.
create unique index flash_offer_entries_pessoa_uidx
  on public.flash_offer_entries (offer_id, coalesce(phone, participant_jid));
```

**A ordem da fila é:**

```sql
order by deprioritized_at nulls first, commented_at
```

`commented_at` nunca é reescrito — é a prova que o gestor mostra quando duas
clientes discutem. Mandar alguém para o fim escreve `deprioritized_at`, o que
preserva o registro original intacto.

### `flash_offer_claims`

A reserva. Um claim ativo por entrada.

| coluna | tipo | nota |
|---|---|---|
| `id` | uuid pk | |
| `tenant_id`, `offer_id`, `entry_id` | uuid not null | |
| `seller_user_id` | uuid not null | quem puxou |
| `claimed_at` | timestamptz not null | prazo para chamar corre daqui |
| `contacted_at` | timestamptz | clicou "chamei" — prazo passa a correr daqui |
| `released_at` | timestamptz | |
| `release_reason` | text | `seller_timeout` / `customer_timeout` / `sold` / `dropped` / `manual` |

```sql
-- Duas vendedoras não pegam a mesma cliente. Garantido pelo banco.
create unique index flash_offer_claims_ativo_uidx
  on public.flash_offer_claims (entry_id) where released_at is null;
```

**O estado da entrada é derivado, não duplicado.** Não existe coluna `status` em
`flash_offer_entries`; ter estado em duas tabelas é ter duas versões da verdade.

| Situação | Estado |
|---|---|
| `outcome` preenchido | terminal (`sold` / `dropped`) |
| sem claim ativo | `na_fila` |
| claim ativo, `contacted_at` nulo | `reservada` |
| claim ativo, `contacted_at` preenchido | `em_conversa` |
| posição > vagas restantes | `espera` (visualmente separada) |

"Vagas restantes" é `slots` menos as entradas com `outcome = 'sold'`. Quem era a
11ª numa oferta de 10 peças entra na fila de verdade assim que a primeira venda
fecha — a linha da espera anda junto com o estoque, não é fixa na abertura.

## O timer

Um único número, `timer_seconds`, com dois efeitos:

```
prazo = coalesce(contacted_at, claimed_at) + timer_seconds
```

- Estourou com `contacted_at` **nulo** → libera, `release_reason = 'seller_timeout'`,
  a entrada **mantém a posição**.
- Estourou com `contacted_at` **preenchido** → libera,
  `release_reason = 'customer_timeout'`, a entrada recebe `deprioritized_at = now()`.

`timer_seconds` nulo = sem timer: a reserva fica com a vendedora até ela resolver.
O resto do motor não muda.

A decisão vive numa função pura em TypeScript — `claimState(claim, offer, now)` —
testável sem banco. A aplicação em lote é um RPC `security definer` chamado antes
de servir a fila:

```sql
create or replace function public.release_expired_flash_claims(p_tenant uuid, p_offer uuid)
returns integer
language plpgsql security definer set search_path = public, pg_temp;
-- corpo: libera os claims vencidos conforme as duas regras acima, escrevendo
-- `deprioritized_at` só nos que já tinham `contacted_at`. Devolve quantos liberou.

revoke all on function public.release_expired_flash_claims(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.release_expired_flash_claims(uuid, uuid) to service_role;
```

O `revoke ... from public, anon, authenticated` não é zelo excessivo: neste
projeto `authenticated` mantém os sete privilégios por default, e a função recebe
o tenant como **parâmetro** — sem o revoke, qualquer usuário logado chamaria a
RPC com o `tenant_id` de outro. Foi exatamente o que o advisor apontou em
`claim_bulk_jobs`.

## Captura

Adicionar `messages.upsert` ao `evolutionWebhookSchema`. Campos usados:

```
data.key.remoteJid      → termina em "@g.us" = grupo
data.key.fromMe         → true = nossa própria mensagem, descarta
data.key.id             → message_id
data.key.participant    → quem falou (pode ser @lid)
data.pushName           → nome do WhatsApp
data.message.conversation | data.message.extendedTextMessage.text
data.messageTimestamp   → unix seconds → commented_at
```

Ordem do descarte, do mais barato para o mais caro:

1. `remoteJid` não termina em `@g.us` → fora (conversa privada, nunca é capturada)
2. `fromMe` → fora
3. sem texto (mídia, áudio, figurinha) → fora
4. sem `flash_offer_groups` aberto para esse `(tenant, whatsapp_group_id)` → fora
5. texto não casa a palavra-chave → fora
6. `commented_at` < `opened_at` da janela → fora (ver R3)

Só depois disso vira linha.

**Comparação da palavra-chave:** ambos os lados normalizados — minúscula, sem
acento, espaços colapsados — e a busca é por substring, não igualdade. "eu quero
esse!!!" e "EU QUERO 😍" contam. "euquero" não; casar sem espaço abriria falso
positivo em palavra maior.

## Telas

**Menu:** `/painel/relampago`, rótulo **"Oferta Relâmpago"**, primeiro grupo do
`NAV_GROUPS`, abaixo de Disparos. Ícone `Flame` (`Zap` já é Automações).

**`/painel/relampago`** — ofertas do tenant, aberta no topo, botão "Nova oferta".

**Formulário de nova oferta** — nome, grupos-alvo, palavra-chave (default "EU
QUERO"), quantas peças, timer em minutos com opção "sem timer". Um botão **Abrir**.

**`/painel/relampago/[id]`** — a tela onde a promoção acontece:

- **Topo — o card da vendedora.** A cliente na mão dela agora: nome, telefone, o
  comentário exato, o horário. Botão **"Chamar no WhatsApp"** e o cronômetro.
  Depois de chamar: **Vendeu** / **Não respondeu**.
- **Abaixo — a fila inteira**, na ordem, mostrando quem está atendendo cada uma e
  onde termina o estoque. Todas veem tudo; cada uma só age no que é seu.
  Transparência interna é o que evita o "por que ela pegou a minha?".
- **Botão "Pegar próxima"**, habilitado só quando há vaga livre
  (`slots - claims_ativos > 0`).

**O botão "Chamar" é um link `wa.me`** com o texto pré-preenchido, abrindo o
WhatsApp da vendedora. **Não é envio pela nossa API.** Disparar DM em massa pela
Evolution é o caminho mais curto para queimar o número, e é decisão fechada neste
projeto que automação só posta no grupo. Clicar nesse link é o que grava
`contacted_at` e larga o cronômetro.

Quando `phone` é null, o card diz **"telefone não identificado"** e oferece um
botão para resolver na hora. Nunca um número inventado.

## Riscos

### R1 — `@lid` sem telefone (o que pode matar a feature)

O WhatsApp está migrando para LID. Em muitos grupos a Evolution entrega quem
falou como `22100000000000009@lid`, **sem o telefone ao lado**, e
`phoneFromWuid()` devolve `null` para tudo que não seja `@s.whatsapp.net`. O
projeto já conhece isso: `leads.phone` é nullable exatamente por causa disso.

Sem tratar, existe caso real em que se vê o comentário e não se consegue chamar
ninguém — a fila fica bonita e inútil.

**Mitigação:** ao abrir a oferta, buscar os participantes de cada grupo pela
Evolution — `admin-group.ts` já faz isso e entrega `id` (`@lid`) ao lado de
`phoneNumber` — e gravar o mapa em `flash_offer_groups.lid_map`. Uma chamada por
grupo, na abertura, não por comentário.

**Fallback:** `@lid` ausente do mapa (entrou no grupo depois) grava `phone = null`
e a tela oferece resolver sob demanda.

**Verificar antes de implementar:** capturar um `messages.upsert` real de um grupo
de produção e conferir o formato de `key.participant`. Se vier
`@s.whatsapp.net` na prática, o `lid_map` fica como defesa e sai do caminho
crítico.

### R2 — volume no receiver

194 grupos, todas as mensagens. Nada vira linha, mas tudo chega à Vercel. As
condições 1–3 do descarte são locais (zero I/O); a 4 é um index scan numa tabela
de dezenas de linhas. Aceitável para começar. Se pesar, o passo seguinte é cache
curto no Upstash, que já existe no projeto — não é preciso resolver antes.

### R3 — webhook fora de ordem

A entrega da Evolution não é ordenada; este projeto já foi mordido por isso (QR
atrasado rebaixando sessão viva de volta para `qr`). Aqui o risco é: fecha a
oferta do Combo X, abre a do Kit Y no mesmo grupo, e um evento atrasado do Combo X
chega depois e cai na fila do Kit Y — **é literalmente a divergência que a
feature existe para evitar.**

**Mitigação:** `commented_at` vem do WhatsApp, não do nosso relógio, e é comparado
com `flash_offer_groups.opened_at`. Comentário anterior à abertura da janela é
descartado.

### R4 — duas vendedoras na mesma cliente

Coberto por `flash_offer_claims_ativo_uidx`. A segunda tentativa recebe erro do
banco e a tela recarrega a fila. Não depende de a UI estar sincronizada.

## Testes

**Unitários** (sem banco):
- `matchesKeyword` — acento, caixa, emoji, pontuação; e o negativo "euquero"
- `claimState` — as quatro transições de D3, incluindo `timer_seconds` nulo
- `queueOrder` — `deprioritized_at nulls first, commented_at`

**Integração** (contra Supabase de dev — a regra do projeto é que teste de
integração precisa matar o mutante):
- `messages.upsert` de grupo sem oferta aberta → nenhuma linha
- comentário com a palavra-chave → uma entrada, na posição certa
- mesma pessoa 3× → uma entrada só
- mesmo `message_id` 2× → uma entrada só
- `commented_at` anterior a `opened_at` → descartado
- abrir segunda oferta no mesmo grupo → recusado pelo banco
- claim além de `slots` → recusado
- expiração antes e depois de `contacted_at` → posição mantida vs fim da fila

**E2E:** abrir oferta → simular comentário → puxar → chamar → vender.

## Fora do escopo

Fase 2, depois de rodar numa promoção real: reagir ✅ no comentário (precisa
passar pela fila anti-ban), aviso automático de "esgotou" no grupo, publicação da
fila no grupo, notificação para a vendedora, relatório de conversão por vendedora.

Avaliado e descartado: guardar o `key.id` de cada mensagem enviada ao grupo para
amarrar por reply. D1 tornou desnecessário.

## Aplicação

Migração nos **dois** bancos (dev `wfjuwogxaupyadwhvoxy`, prod
`nidoatbxaylrkcgbszns`), registrada em `deploy/supabase/apply-order.txt`. Rodar o
advisor de segurança do Supabase depois — as RPCs recebem `tenant_id` como
parâmetro e é exatamente esse formato que ele reprova quando falta o revoke.
