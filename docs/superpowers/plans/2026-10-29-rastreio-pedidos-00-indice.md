# Rastreio do pedido — índice da série (plano de implementação)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A compradora da loja acompanha o pedido da Yampi numa página com a cara da loja (busca por CPF/CNPJ + 4
dígitos do celular, ou link do aviso) e recebe sozinha os avisos de enviado, retirada, problema e entregue por e-mail
e por WhatsApp (número de privado da base).

**Architecture:** O pedido chega pela base comum da Yampi (aviso → `yampi_events` → processador da base chama
`registrarPedidoDaYampi`) e por uma varredura por `updated_at` no cron do Rastreio. Uma RPC grava o pedido aplicando
"a etapa não volta" dentro do banco; o TypeScript escolhe os canais e cria `tracking_notices` (um por pedido × etapa ×
canal). O e-mail sai pelo `sendEmail` com o layout da loja; o WhatsApp, pelo produtor de DM da base. A página pública é
HTML do servidor no molde da bio, no `www` e no domínio do lojista.

**Tech Stack:** Next.js App Router (route handlers que devolvem HTML), Supabase/Postgres (migração pelo CI, RPC
`security definer`), `tsx --test` (node:test) com PostgREST falso, Playwright no e2e, Resend (`sendEmail`), Evolution
pela base do privado.

**Spec:** `docs/superpowers/specs/2026-10-29-rastreio-pedidos-design.md` (§0 = o que vem da base, §1 = regras, §2 =
dados, §3 = fluxos, §9 = PRs, §10 = Fase 0). Ler inteira antes do primeiro PR.
**Mockup:** https://claude.ai/artifact/MWC77x1LE213aFpNFQ7Z8c. Fonte local (fora do repo, tem o nome da loja-piloto):
`C:\Users\Igor\Desktop\girumo-design-refs\rastreio-pedidos\project\` (`Pedido`, `Problema`, `Main` = busca,
`WhatsApp`, `Email`, `Integracoes`, `Rastreio`, `Entregas`, `Estrutura` `.dc.html`).
**Base comum:** spec do Recuperar, `docs/superpowers/specs/2026-10-29-recuperar-yampi-design.md` (§2, §3 "Conectar a
Yampi", "Aviso da Yampi", "Envio", "Resposta", "Base do privado"; §9 PRs "comum"), e os planos dela,
`docs/superpowers/plans/2026-10-29-recuperar-yampi-*.md` (índice `-00-indice.md`, seção "Contrato comum"; commit
7225b674 na branch `docs/recuperar-spec` até o PR de docs do Recuperar entrar em `main`).
**Card do quadro (prod):** `rastreio-pedidos`. **Prompt para o chat de implementação:**
`docs/superpowers/plans/2026-10-29-rastreio-pedidos-prompts-sessao.md`.

## Ordem e dependências

| PR | O quê | Depende de | Plano |
|---|---|---|---|
| B | Base comum, nos planos do Recuperar: **1a** banco comum (com `rastreio_enabled`) · **2a** número do atendimento: seletores · **2b** conectar e cartão · **3** envio de DM · **4** resposta e status · **6** Yampi: aviso e processador · **6b** cliente da API, 401 e cron · **6c** cartão em Integrações | — (ordem da base: 1a → 2a → 2b → Fase 0 → (3 → 4) junto com (6 → 6b → 6c)) | `2026-10-29-recuperar-yampi-01a-banco-comum.md`, `-02-numero-do-atendimento.md`, `-03-envio-de-dm.md`, `-04-resposta-e-status.md`, `-06-conexao-yampi.md` |
| 1 · Partes 1–2 | Banco do Rastreio (migração, conferência, baseline) · tipos, stores e `API_CONTRACTS.md` | B·1a (a flag mora lá) | `2026-10-29-rastreio-pedidos-pr1-banco.md` |
| 2 · Partes 1–2 | Núcleo puro (etapa, documento, pedido da Yampi, avisar, link; pode ir antes da Fase 0) · loja, registro, importação, varredura, cron e entrada em `CONSUMIDORES` | 1; a Parte 2 também B·6 e B·6b | `…-pr2-pedidos.md` |
| 3 · Partes 1–2 | Página no `www` e registros · domínio do lojista, "parar avisos", convite e e2e | 2; a Parte 2 também o 4·1 (`conviteDoGrupo`) | `…-pr3-pagina.md` |
| 4 · Partes 1–3 | `fromName` e layout da loja + `conviteDoGrupo` · envio e retentativa · e-mail de problema à loja | 2 | `…-pr4-email.md` |
| 6 · Partes 1–5 | API das Entregas · liberação · rota da configuração · Configurações › Rastreio · Entregas + bloco da Yampi | 2; o cartão do número do atendimento espera B·2b e o bloco no cartão da Yampi, B·6c | `…-pr6-painel.md` |
| 5 | WhatsApp: mensagens, envio pela base, status, fallback para e-mail, cancelar no "parar" | 4, 3·2, B·3, B·4 (que já vêm depois de B·2a e B·2b) | `…-pr5-whatsapp.md` |
| 7 | `/privacidade`, prova em prod, card | 3, 4, 6 (e 5 e 8, se já estiverem no ar) | `…-pr7-privacidade-prova.md` |
| 8 | Melhor Envio: conexão OAuth e os marcos entregue, não entregue e pausado (spec §3.6) | 4 e 2; provas 4 e 5 da Fase 0 | a escrever com o resultado das provas 4 e 5 |

Ondas (regra de waves: arquivos disjuntos e sem dependência): o **1** vem logo depois do B·1a. Depois do **2**, os
PRs **3, 4 e 6** podem andar em paralelo; os arquivos de cada um estão listados nos planos e não se cruzam, e só a
Parte 2 do 3 espera a Parte 1 do 4. O **5** vem depois do 4 e da Parte 2 do 3 (mexe em `lib/rastreio/registrar.ts`,
`lib/rastreio/cron.ts` e na rota de "parar avisos") e da base do privado. O **8** (Melhor Envio) vem logo depois do
4, se a Fase 0 pedir (provas 4 e 5); ele e o 5 mexem no `cron.ts`, então um de cada vez. Página e
e-mail vão ao ar antes do WhatsApp. Com a Fase 0 (spec §10) pendente, o PR 1 pode ir a `main`; o 2 espera a prova do
payload da Yampi. Um chip só para Rastreio e Recuperar (decisão do Igor, 29/10); na tela ele se chama **"número do
atendimento"**.

**Nenhuma loja ganha `rastreio_enabled` antes do B·2a em `main` e do redeploy do worker no Coolify** (regra da base:
o worker antigo escolheria o número do atendimento para o auto-grow e as ações em massa). Vale para a liberação do
admin (PR 6) e para a prova (PR 7).

## Contrato entre os PRs

Nomes fixos. Plano que precisar de nome novo acrescenta; nunca renomeia. Cada plano traz no bloco **Interfaces** de
cada tarefa o que consome e o que produz.

### Tipos — `apps/web/src/lib/rastreio/tipos.ts` (PR 1)

```ts
export const ETAPAS = ["aguardando_pagamento", "confirmado", "separando", "enviado", "retirada", "problema", "entregue", "cancelado"] as const;
export type Etapa = (typeof ETAPAS)[number];
export const ETAPAS_COM_AVISO = ["confirmado", "enviado", "retirada", "problema", "entregue"] as const;
export type EtapaComAviso = (typeof ETAPAS_COM_AVISO)[number];
export type Canal = "whatsapp" | "email";
export type MatrizAvisos = Record<EtapaComAviso, Record<Canal, boolean>>;
export const MATRIZ_PADRAO: MatrizAvisos; // §1.1: confirmado off/off, enviado on/on, retirada on/on, problema on/on, entregue on/off
export type AvisoStatus = "pendente" | "enviando" | "enviado" | "entregue" | "lido" | "falhou" | "pulado";
export type OrigemDoPedido = "aviso" | "varredura" | "importacao";
export type EventoDaLinha = { etapa: Etapa; at: string }; // ISO
export type PedidoParaGravar = {
  externalId: string; numero: string; orderCreatedAt: string; statusRaw: string;
  etapa: Etapa | null;                 // null = alias desconhecido: mantém a etapa gravada
  trackingCode: string | null; trackingUrl: string | null; shipmentService: string | null;
  buyerFirstName: string | null; buyerPhone: string | null; // canônico 55+DDD+número (telefoneCanonico)
  buyerEmail: string | null;           // em texto: a store sela antes da RPC
  docHmac: string | null;
  historico: EventoDaLinha[];          // de include=statuses com data; [] quando não houver
  atualizadoNaYampi: string;           // updated_at do pedido na Yampi (ISO)
};
export type PedidoGravado = {
  id: string; etapa: Etapa; etapaAnterior: Etapa | null; mudou: boolean; linkToken: string;
  paradoEm: string | null; temTelefone: boolean; temEmail: boolean; // do que ficou gravado (nulo não apaga contato)
};
export type PedidoPublico = {
  id: string; numero: string; orderCreatedAt: string; etapa: Etapa; etapaAt: string; events: EventoDaLinha[];
  shipmentService: string | null; trackingCode: string | null; trackingUrl: string | null;
  linkToken: string; noticesStoppedAt: string | null;
};
export type PedidoInterno = PedidoPublico & {
  tenantId: string; externalId: string; statusRaw: string;
  buyerFirstName: string | null; buyerPhone: string | null; buyerEmailEnc: string | null;
};
export type RastreioConfig = {
  tenantId: string; publicSlug: string; matrix: MatrizAvisos; notifyStoreOnProblem: boolean;
  vipLinkId: string | null; storeWhatsapp: string | null; importedAt: string | null; sweepCursor: string | null;
};
export type AvisoParaEnviar = { id: string; orderId: string; etapa: EtapaComAviso; canal: Canal; attempts: number; resends: number; messageId: string | null };
```

### Banco (PR 1)

- Tabelas do spec §2 (com `tracking_settings.imported_at`, `tracking_settings.sweep_cursor` e
  `tracking_notices.resends`). `tracking_notices.message_id` referencia `private_messages(id) on delete set null`
  (B·1a). A flag `rastreio_enabled` e o trigger de guarda dela são do B·1a: o PR 1 só confere que existem.
- `app.rastreio_etapa_ordem(p_etapa text) returns int` — `immutable`: aguardando_pagamento 1, confirmado 2, separando 3,
  enviado 4, retirada 5, problema 5, entregue 6, cancelado 7.
- `app.rastreio_etapa_pode_mudar(p_atual text, p_nova text) returns boolean` — `immutable`. Verdadeiro quando:
  `p_atual is null`; ou `p_nova <> p_atual` e `p_atual <> 'cancelado'` e (`p_nova = 'cancelado'`, ou
  `p_nova = 'enviado' and p_atual in ('retirada','problema')`, ou `ordem(p_nova) >= ordem(p_atual)`).
- `public.rastreio_gravar_pedido(p_tenant uuid, p_pedido jsonb) returns jsonb` — `security definer`, só
  `service_role`. Chaves de `p_pedido` em snake_case (`external_id`, `numero`, `order_created_at`, `status_raw`,
  `etapa`, `tracking_code`, `tracking_url`, `shipment_service`, `buyer_first_name`, `buyer_phone`, `buyer_email_enc`,
  `doc_hmac`, `historico`). Faz o upsert por `(tenant_id, 'yampi', external_id)` numa instrução só (com `for update` no
  caminho de atualização), aplica `rastreio_etapa_pode_mudar`, carimba `etapa_at` e acrescenta `{etapa, at: now()}`
  em `events` quando muda (na criação: `historico` se vier, senão `[{etapa, now()}]`; etapa nula na criação vira
  `aguardando_pagamento`), atualiza sempre código/URL/serviço/contato, põe `purge_after = now() + 90 days` em
  `entregue`/`cancelado`. Devolve `{"id", "etapa", "etapa_anterior", "mudou", "link_token", "notices_stopped_at",
  "tem_telefone", "tem_email"}` (os três últimos do que ficou gravado, para o PR 2 decidir o aviso sem outra leitura).
- `public.rastreio_purgar() returns integer` — apaga `tracking_orders` com `purge_after < now()` (os avisos vão em
  cascata). `security definer`, só `service_role`.

### Stores (PR 1; o PR 6 acrescenta `rastreio-entregas.ts`)

`apps/web/src/lib/stores/rastreio-pedidos.ts`:
- `gravarPedido(tenantId: string, pedido: PedidoParaGravar, origem: OrigemDoPedido): Promise<PedidoGravado>` — manda
  `carimbar = origem !== "importacao"` à RPC (importado sem histórico datado fica com `events = []` e
  `etapa_at = order_created_at`: nada de data inventada, spec §1.1); sela `buyerEmail` com
  `selar(email, \`rastreio:${tenantId}:yampi:${externalId}:email\`, chave)` e chama a RPC.
- `lerPedido(tenantId: string, orderId: string): Promise<PedidoInterno | null>`
- `abrirEmailDoPedido(pedido: PedidoInterno): string | null` — `abrir` com o mesmo contexto; falha de cifra → `null` +
  `console.error` sem dado pessoal.
- `buscarPedidos(tenantId: string, docHmac: string, phoneLast4: string, desde: Date): Promise<PedidoPublico[]>` — mais
  novo primeiro, no máximo 20.
- `pedidoPorToken(tenantId: string, linkToken: string): Promise<PedidoPublico | null>`
- `pararAvisos(tenantId: string, linkToken: string): Promise<{ orderId: string } | null>` — grava
  `notices_stopped_at` (se nulo) e passa a `pulado` os avisos `pendente` daquele pedido. Não toca em `optouts`.

`apps/web/src/lib/stores/rastreio-avisos.ts`:
- `criarAvisos(tenantId: string, orderId: string, etapa: EtapaComAviso, canais: Canal[]): Promise<{ id: string; canal: Canal }[]>`
  — insere com `on conflict (order_id, etapa, channel) do nothing`; devolve só os criados agora.
- `avisosParaEnviar(tenantId: string, canal: Canal, limite: number, agora: Date): Promise<AvisoParaEnviar[]>` —
  `pendente` com `next_try_at` nulo ou vencido.
- `avisosEnviando(tenantId: string, canal: Canal, limite: number): Promise<AvisoParaEnviar[]>`
- `marcarAviso(tenantId: string, avisoId: string, patch: { status: AvisoStatus; error?: string | null; messageId?: string | null; nextTryAt?: string | null; somarTentativa?: boolean; sentAt?: string | null }): Promise<void>`
- `reabrirAvisos(tenantId: string, orderId: string, etapa: EtapaComAviso, canais: Canal[]): Promise<number>` — o que
  existe volta a `pendente` com `resends + 1`, `attempts 0`, `message_id` nulo; o que falta é criado.

`apps/web/src/lib/stores/rastreio-config.ts`:
- `rastreioLigado(tenantId: string): Promise<boolean>`
- `lojasComRastreio(): Promise<string[]>` — leitura global de `tenant_settings` (é a lista de lojas; não há tenant a
  filtrar).
- `lerConfig(tenantId: string): Promise<RastreioConfig | null>`
- `garantirConfig(tenantId: string): Promise<RastreioConfig>` — cria com os padrões; `public_slug` = slug do nome da
  loja, com sufixo `-2`, `-3`… se já existir.
- `salvarConfig(tenantId: string, patch: Partial<Pick<RastreioConfig, "publicSlug" | "matrix" | "notifyStoreOnProblem" | "vipLinkId" | "storeWhatsapp">>): Promise<RastreioConfig>`
- `lojaPorSlug(slug: string): Promise<RastreioConfig | null>` — só loja com `rastreio_enabled`.
- `marcarImportado(tenantId: string, em: Date): Promise<void>`; `avancarCursor(tenantId: string, cursor: string): Promise<void>`

### Núcleo e fluxo (PR 2)

- `lib/rastreio/etapas.ts`: `etapaDaYampi(e: { statusAlias: string | null; trackCode: string | null; delivered: boolean }): Etapa | null`
- `lib/rastreio/documento.ts`: `normalizarDocumento(entrada: string): { tipo: "cpf" | "cnpj"; digitos: string } | null`;
  `docHmac(digitos: string, pepper: string): string` (64 hex); `pepperDoRastreio(): string` (lança se
  `RASTREIO_DOC_PEPPER` faltar ou tiver menos de 32 caracteres); `ultimos4(telefoneCanonico: string): string`.
- `lib/rastreio/pedido-yampi.ts`: `pedidoDaYampi(payload: unknown, pepper: string): PedidoParaGravar | null` (zod;
  payload malformado → `null`).
- `lib/rastreio/avisar.ts`: `canaisDoAviso(e: { gravado: PedidoGravado; origem: OrigemDoPedido; atualizadoNaYampi: string; agora: Date; matriz: MatrizAvisos; paradoEm: string | null; temTelefone: boolean; temEmail: boolean }): Canal[]`
- `lib/rastreio/registrar.ts`: `registrarPedidoDaYampi(tenantId: string, payload: unknown, origem: OrigemDoPedido): Promise<{ gravado: PedidoGravado; avisos: { id: string; canal: Canal }[] } | null>`
  (`payload` = o pedido como a Yampi manda: o `e.recurso` do aviso, ou o item da API na importação e na varredura);
  `avisarLojaDoProblema(tenantId: string, pedido: { id: string; numero: string }): Promise<boolean>` (sininho
  `rastreio_problema`, dedupe por select; `true` = criou agora).
- `lib/rastreio/loja.ts`: `type LojaDoRastreio = { tenantId: string; nome: string; publicSlug: string; dominio: string | null; corPrimaria: string | null; storeWhatsapp: string | null; vipLinkId: string | null }`;
  `lojaDoRastreio(tenantId: string): Promise<LojaDoRastreio | null>`.
- `lib/rastreio/link.ts`: `linkDoPedido(loja: LojaDoRastreio, token: string): string`;
  `linkDaBusca(loja: LojaDoRastreio): string` — domínio ativo → `https://<dominio>/rastreio[/<token>]`; senão
  `https://www.girumo.com.br/rastreio/<publicSlug>[/<token>]` (mesma origem pública da bio).
- `lib/rastreio/importar.ts`: `importarPedidos(tenantId: string, desde: Date): Promise<number>`;
  `varrerPedidos(tenantId: string, agora: Date): Promise<number>`.
- `lib/rastreio/cron.ts`: `rodarCronRastreio(agora: Date): Promise<{ lojas: number; falhas: number }>` — por loja de
  `lojasComRastreio()`, cada passo num `try/catch` próprio (uma loja com erro não para as outras). O PR 4 acrescenta
  o passo de e-mail; o PR 5, os de WhatsApp; o PR 8, o dos marcos do Melhor Envio (nomes no plano dele). Rota: `apps/web/src/app/api/cron/rastreio/route.ts` (`GET`,
  `isCronAuthorized`).
- Rotas do painel citadas por outros PRs (o PR 6 cria): Vendas › Entregas em `/painel/vendas/entregas`; o sininho do
  problema aponta para `/painel/vendas/entregas?pedido=<id>`.

### Página (PR 3), e-mail (PR 4), WhatsApp (PR 5), painel (PR 6)

- PR 3: rotas `app/rastreio/[slug]/route.ts`, `app/rastreio/[slug]/[token]/route.ts`,
  `app/rastreio/[slug]/[token]/parar/route.ts`; domínio do lojista reescrito para o slug interno `_dominio`
  (`RASTREIO_DOMINIO`, molde do `BIO_DOMINIO`); `CustomHostRoute` ganha `"rastreio"`; `NonceSurface` ganha
  `"rastreio"`.
- PR 4: `SendOptions.fromName?: string`; `EmailKind` ganha `"rastreio"` e `"rastreio_problema"`;
  `lib/rastreio/email.ts` → `montarEmailDoAviso(loja: LojaDoRastreio, pedido: PedidoInterno, etapa: EtapaComAviso, convite: { url: string } | null): { subject: string; html: string; text: string }`;
  `lib/rastreio/enviar-email.ts` → `enviarEmailsPendentes(tenantId: string, agora: Date, limite?: number): Promise<number>`
  e `enviarAvisoPorEmail(tenantId: string, avisoId: string): Promise<boolean>`. Chave de idempotência:
  `rastreio:<id do aviso>:<resends>`.
- PR 5: `lib/rastreio/mensagens.ts` → `mensagemWhatsapp(etapa: EtapaComAviso, d: { primeiroNome: string | null; numero: string; loja: string; servico: string | null; codigo: string | null; link: string; numeroDaLoja: string | null }): string`;
  `lib/rastreio/enviar-whatsapp.ts` → `enviarWhatsappsPendentes(tenantId: string, agora: Date, limite?: number): Promise<number>`,
  `atualizarStatusWhatsapp(tenantId: string, agora: Date): Promise<number>`.
- PR 6: `lib/stores/rastreio-entregas.ts` (lista, números do topo, saúde do código); rotas
  `/api/rastreio/config`, `/api/rastreio/entregas`, `/api/rastreio/entregas/[id]/reenviar`, `/api/rastreio/saude`;
  `Porta` ganha `"Rastreio de pedidos"`; `Liberacao` ganha `"rastreio"`.

## Contrato da base (fixado no índice do Recuperar)

Fonte: `docs/superpowers/plans/2026-10-29-recuperar-yampi-00-indice.md`, seção "Contrato comum" (commit 7225b674).
Abaixo, só o que o Rastreio usa. Se a base mudar um nome antes de ir a `main`, o executor do PR da vez troca aqui e
no plano dele, no mesmo PR, e anota no PR.

```ts
// apps/web/src/lib/privado/numero.ts (B·2b; dm.ts reexporta numeroDoAtendimento e o tipo)
export type NumeroDoAtendimento = { instanceId: string; instanceName: string; status: string; phone: string | null };
export async function numeroDoAtendimento(tenantId: string): Promise<NumeroDoAtendimento | null>; // o Rastreio não chama
export async function privadoLiberado(tenantId: string): Promise<boolean>;      // recuperar_enabled || rastreio_enabled
export async function pausaDoNumero(tenantId: string, instanceId: string): Promise<string | null>; // o Rastreio não chama

// apps/web/src/lib/privado/dm.ts (B·3). Um número `privado` por loja; os ids são da `private_messages`
export type ModuloPrivado = "recuperar" | "rastreio" | "teste";
export type PrioridadeDm = "resposta" | "pix" | "pedido" | "carrinho";     // no teto do número, nessa ordem
export type StatusDm = "na_fila" | "enviada" | "entregue" | "lida" | "falhou" | "cancelada";
export type ParteDm = { texto: string } | { imagem: string; legenda?: string }; // 1 a 3, em ordem
export interface PedidoDeDm { tenantId: string; modulo: ModuloPrivado; telefone: string; partes: ParteDm[];
  prioridade: PrioridadeDm; validoAte: Date; dedupeKey: string; autor?: { tipo: "automatico" } | { tipo: "pessoa"; userId: string } }
export type ResultadoDm = { messageIds: string[] } | { recusado: "sem_numero" | "modulo_desligado" | "bloqueado" };
export async function enfileirarDm(pedido: PedidoDeDm): Promise<ResultadoDm>; // pedido inválido LANÇA (dedupeKey > 200, validoAte no passado)
export async function statusDosDms(tenantId: string, messageIds: string[]): Promise<Record<string, { status: StatusDm; erro: string | null }>>;
export async function cancelarDms(tenantId: string, messageIds: string[]): Promise<number>; // quantas mudaram

// apps/web/src/lib/yampi/ (B·6 e B·6b; sem arquivo-barril)
// tipos.ts: StatusYampi, EventoYampi e ConexaoYampi ({ id, tenantId, alias, status, … credenciais seladas, lastEventAt… })
// consumidores.ts (B·6) — o ponto de extensão:
export type EventoParaConsumir = { eventoId: string; tenantId: string; conexao: ConexaoYampi; evento: EventoYampi; time: string | null; recurso: unknown; payload: unknown };
export type ConsumidorDeEvento = { nome: string; eventos: readonly EventoYampi[]; ligado: (tenantId: string) => Promise<boolean>; consumir: (e: EventoParaConsumir) => Promise<unknown> };
export const CONSUMIDORES: readonly ConsumidorDeEvento[]; // vazio no B·6; cada módulo acrescenta a sua entrada no próprio PR
// cliente.ts (B·6b), reexportado por api.ts:
export class YampiErro extends Error { readonly status: number; readonly retryAfterMs: number | null } // status 0 = sem resposta
// api.ts (B·6b):
export async function yampiGet<T>(conexao: ConexaoYampi, caminho: string, query?: Record<string, string | number>): Promise<T>;
// conexao.ts (B·6b):
export async function conexaoYampiAtiva(tenantId: string): Promise<ConexaoYampi | null>; // ativa OU aviso_desativado (a credencial vale)
```

- **`erro` do `statusDosDms`** = `private_messages.error`, código fixo, nulo enquanto a mensagem não falhou nem foi
  cancelada. Com `cancelada`: `vencida` (passou do `valid_until`), `cancelada` (`cancelarDms`), `bloqueado` (SAIR ou
  `optouts` depois de enfileirar), `parte_anterior`, `trava_numero`. Com `falhou`: `sem_whatsapp`, `modulo_desligado`,
  `trava_numero`, `payload_invalido`, `destino_invalido`, `tipo_inesperado` e, esgotadas as tentativas, `restricao`,
  `evolution_<status http>`, `erro_de_envio`, `sem_instancia`, `imagem_indisponivel`. O aviso do Rastreio grava
  `erro ?? status` no `error` dele.
- **Número caído:** a DM entra na fila e vence no `validoAte` (`cancelada`/`vencida`); `sem_numero` só quando a loja
  não tem número do atendimento.
- **401** em `yampiGet` marca a conexão `credencial_invalida` e avisa no sino uma vez (a base); conexão já inválida
  lança `YampiErro(401)` sem chamar a Yampi.
- **Gancho do Rastreio (PR 2):** uma entrada em `CONSUMIDORES` —
  `{ nome: "rastreio", eventos: ["order.created", "order.paid", "order.status.updated"], ligado: rastreioLigado,
  consumir: (e) => registrarPedidoDaYampi(e.tenantId, e.recurso, "aviso") }`. O processador (`processarEventoYampi`,
  B·6) chama só os consumidores ligados que assinam o evento e marca o evento processado depois de todos; a
  retentativa é do cron comum `/api/cron/yampi` (B·6b: evento parado entre 3 min e 24 h, até 50 por execução; aviso da
  Yampi conferido e recriado se caiu; limpeza da base às 06:00 UTC). O cron do Rastreio não reprocessa a inbox: ele
  varre pedidos por `updated_at`.
- **Painel:** `CartaoNumeroDoAtendimento` (`components/privado/cartao-numero-do-atendimento.tsx`, B·2b) é sem props e
  lê `GET /api/privado/numero`; o cartão da Yampi é `Yampi({ children })`
  (`components/painel/configuracoes/yampi.tsx`, B·6c), e os blocos de cada módulo entram como `children` (só aparecem
  com conexão). O PR 6 só importa os dois.
- **Fora da v1 do Rastreio:** `CONSUMIDORES_DE_RESPOSTA` (B·4; o SAIR já cancela os DMs pendentes da conversa dos dois
  módulos) e o aviso de pausa do número no sininho (da base; em loja só com o Rastreio, chega sem link).

## Global Constraints

- Etapas e status da Yampi (spec §1.1, exatos): `waiting_payment`, `authorized`, `created` → `aguardando_pagamento`;
  `paid` → `confirmado`; `handling_products`, `invoiced`, `ready_for_shipping` → `separando`; `on_carriage` com
  `track_code` → `enviado` (sem código continua `separando`); `track_code` presente em etapa `confirmado`/`separando` →
  `enviado`; `ready_for_pickup` → `retirada`; `shipment_exception` → `problema`; `delivered` ou `delivered = true` →
  `entregue`; `refused`, `cancelled` → `cancelado`. Alias desconhecido → `null` + `console.warn` só com o alias.
- Aviso só quando: a etapa mudou, `origem !== "importacao"`, `atualizadoNaYampi` ≥ agora − 3 dias, a etapa é de
  `ETAPAS_COM_AVISO`, a matriz liga o canal, o pedido não tem `notices_stopped_at`, há contato do canal (telefone
  para WhatsApp, e-mail para e-mail) e a loja tem plano ativo (`tenantGrantsPlan` de `lib/billing/entitlements.ts`;
  sem plano, a página e o painel seguem e nenhum aviso é criado). Loja sem `rastreio_enabled` não grava pedido.
- Busca: 11 ou 14 dígitos com dígitos verificadores conferidos + 4 últimos dígitos do telefone canônico; pedidos dos
  últimos **90 dias**; limite por IP + loja de **5/min e 20/h** com `checkRateLimit` na rota.
- Textos fixos da página (exatos): "Não encontramos pedido com esses dados. Confira o CPF/CNPJ e o celular." e "Muitas
  tentativas, tente daqui a pouco".
- WhatsApp (exatos, spec §1.4): enviado "Oi, {primeiro nome}! Seu pedido nº {nº} da {loja} foi enviado ({serviço}).
  Código de rastreio: {código}. Acompanhe aqui: {link}"; retirada "Seu pedido nº {nº} da {loja} está pronto para
  retirada. Detalhes: {link}" (a página manda combinar a retirada com a loja); problema "A transportadora não conseguiu entregar o pedido nº {nº} da {loja}. A
  loja já foi avisada e vai falar com você. Detalhes: {link}"; entregue "Seu pedido nº {nº} da {loja} foi entregue. Se
  alguma peça não estiver certa, fale com a loja: {número da loja}" (sem número: termina em "fale com a loja.");
  confirmado "Recebemos o pagamento do pedido nº {nº} da {loja}. Acompanhe: {link}". Rodapé dos modelos com link:
  "Aviso automático de pedido · para parar, use o link acima". Sem primeiro nome, "Oi, {primeiro nome}!" vira "Olá!".
  Sem serviço, some o "({serviço})".
- DM: módulo `rastreio`, `partes: [{ texto }]`, prioridade `pedido` (no teto: resposta > pix > pedido > carrinho),
  validade **24 h**, `dedupeKey` `rastreio:<id do aviso>:<resends>`. Status pelo `statusDosDms`: `falhou` ou
  `cancelada` → aviso `falhou` com `error = erro ?? status` e e-mail no lugar (com o número caído, isso só acontece no
  vencimento, em até 24 h; nas etapas com e-mail ligado na matriz o e-mail já saiu na hora).
- Nenhuma loja ganha `rastreio_enabled` antes do B·2a em `main` e do redeploy do worker (ver "Ordem e dependências").
- Retenção: `purge_after` = **90 dias** depois de `entregue`/`cancelado`; o purge roda uma vez por dia (06:00 UTC).
- Segredos: `RASTREIO_DOC_PEPPER` (≥ 32 caracteres, nos dois ambientes da Vercel); e-mail selado com
  `INTEGRATIONS_ENCRYPTION_KEY` (`lib/security/secret-box.ts`). Documento nunca em texto, nem em log.
- Página pública: `x-robots-tag: noindex`, `cache-control: private, no-store`, CSP com nonce e sem atributo `style=`;
  `<title>` sem dado do pedido ("Acompanhe seu pedido · {loja}"), porque a prévia de link do WhatsApp lê o título.
  Mostra só nº, data, etapas, serviço, código e link de histórico.
- Painel: rotas com `settings:connection`; Vendas › Entregas só para dono e admin; a lista com busca vai por `POST`
  (CPF na query string iria para o log da Vercel).
- Problema na entrega: o sininho `rastreio_problema` sai sempre (o texto à compradora diz "A loja já foi avisada"); o
  `notifyStoreOnProblem` decide só o e-mail à loja, e o rótulo na tela é "Me avisar por e-mail quando houver
  problema".
- Prévia "Ver mensagem" (PR 6, `lib/rastreio/previas.ts`): quem chegar depois liga — o PR 4 troca o `null` do e-mail e
  o PR 5 o do WhatsApp se o PR 6 já estiver em `main`; senão o PR 6 liga os que já existem. `email.ts` e
  `mensagens.ts` ficam puros (sem `server-only`).
- O B·5 do Recuperar também mexe em `painel-nav.ts`, `casca-context.tsx` e na página de admin da loja: quem mergear
  depois reconcilia.
- Banco: migração pelo CI (`migrate-dev` no PR, `migrate-prod` no merge), nunca DDL à mão; `create … if not exists`;
  `security definer` sempre com `set search_path`; `revoke all … from public, anon, authenticated` e `grant … to
  service_role`; RLS ligado e sem policy nas três tabelas. Toda query de store com `.eq("tenant_id", …)`.
- Repo público: CPF/CNPJ, telefone, e-mail e nome de teste são inventados (CPF e CNPJ gerados com dígito calculado
  no próprio teste); o nome da loja-piloto, que aparece no mockup, nunca entra no repo.
- Verificação TS (raiz do repo): `npm --workspace apps/web test`;
  `npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.json`;
  `npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.e2e.json`; `npm --workspace apps/web run lint`.
  Gate antes de cada push: `powershell -ExecutionPolicy Bypass -File infra/scripts/verify-local.ps1`.
- Commits em inglês com prefixo semântico e a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **O mesmo pedido chegando por dois caminhos ao mesmo tempo** (aviso da Yampi e varredura do cron, ou aviso
   repetido fora de ordem): a etapa final é a mais adiantada e sai um aviso só. Testes: bloco de concorrência e de
   "não volta" no `infra/tests/rastreio-check.sql` (PR 1, `entregue` depois `enviado` → fica `entregue`) e
   `criarAvisos` duas vezes → uma linha (PR 1, store).
2. **Pedido velho reaparecendo** (importação, varredura depois de dias fora, reconexão da Yampi reenviando avisos): a
   página atualiza e ninguém recebe mensagem. Teste: `canaisDoAviso` com `atualizadoNaYampi` de 4 dias atrás → `[]`, e
   com `origem: "importacao"` → `[]` (PR 2).
3. **CPF/CNPJ e celular digitados do jeito que a pessoa digita** (pontos, traço, barra, espaços, +55, DDD, nono
   dígito): a busca acha. Documento inválido roda a mesma consulta e devolve a mesma resposta. Testes:
   `normalizarDocumento("111.444.777-35")`, CNPJ com barra, `ultimos4("5511987654321") === "4321"` (PR 2); rota de busca
   com documento inválido → mesmo HTML do "não achei" e consulta feita (PR 3).
4. **Link do aviso aberto por quem não é a compradora** (prévia do WhatsApp, link encaminhado): `GET` nunca muda nada,
   a página do token mostra um pedido só, e "parar avisos" só por `POST`. Testes: `GET …/parar` → 405 sem gravar;
   página do token não lista outros pedidos do mesmo documento (PR 3).
5. **Uma loja quebrada no cron** (token da Yampi trocado junto com a senha → 401, `RASTREIO_DOC_PEPPER` ausente): as
   outras lojas seguem, e nada é gravado com `doc_hmac` nulo por engano. Testes: `rodarCronRastreio` com a primeira
   loja lançando → a segunda processa e `falhas === 1` (PR 2); `registrarPedidoDaYampi` sem pepper lança e não chama
   `gravarPedido` (PR 2).

## Ambiente do worktree

Vale sobre qualquer linha dos planos que diga outra coisa.

- `node_modules` por **duas junctions** (o `next` mora em `apps/web/node_modules`), custo zero de disco:

  ```powershell
  cmd /c mklink /J "<worktree>\node_modules" "C:\Users\Igor\Desktop\HubFlow-platform\node_modules"
  cmd /c mklink /J "<worktree>\apps\web\node_modules" "C:\Users\Igor\Desktop\HubFlow-platform\apps\web\node_modules"
  ```

  Antes, conferir que o `node_modules` do checkout principal não está vazio; se estiver, `npm ci` no worktree. Ao
  apagar o worktree, desarmar as junctions primeiro (`[System.IO.Directory]::Delete(<junction>, $false)`).
- Não há `.env.local` com credencial de dev nesta máquina. O e2e e os `*.integration.test.ts` rodam no job `e2e` do
  CI. Consulta de conferência no banco de dev: `supabase db query --linked` (de `apps/web`, com o projeto de dev
  `wfjuwogxaupyadwhvoxy` ligado) ou o MCP do Supabase, só leitura.
- O `tsconfig` mira ES2017: regex com a flag `s` não compila (TS1501) — use `[\s\S]`.

## Fechamento de cada PR

Revisar → CI verde → mergear → apagar a branch, na mesma sessão (CLAUDE.md, "Regra de PR"). Revisão de segurança
(agente Security Engineer) antes de mergear os PRs 1, 3, 4 · Parte 1 (texto do banco no `From` e no HTML do e-mail)
e 5. No card `rastreio-pedidos` (prod): mover para
`em_construcao` no PR 1, reescrever o `blocker` a cada PR e chamar `select public.move_card(...)` quando o status
mudar. `no_ar_verificado` só com a prova do plano do PR 7, colhida na hora.

## Decisões deste plano (o spec já foi ajustado)

- AAD do e-mail com `external_id`: o `id` só existe depois do upsert (spec §2.1).
- "A etapa não volta" mora na RPC, numa transação: o aviso e a varredura podem gravar o mesmo pedido ao mesmo tempo.
  O TypeScript só traduz status em etapa.
- Ligar o Rastreio não exige gancho no admin: o cron acha a loja com `rastreio_enabled` e `imported_at` nulo, cria a
  config e importa 30 dias sem aviso.
- O cron anda loja por loja (`lojasComRastreio`) e toda query filtra o tenant; só a lista de lojas e o purge são
  globais.
- Reenvio manual reabre o aviso com `resends + 1` (o `unique (order_id, etapa, channel)` não deixa criar outro, e a
  chave de idempotência do Resend segura o mesmo id por 24 h).
- O link público usa a mesma origem da bio (`www`), não `app.` (spec §3.5).
