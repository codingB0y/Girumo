# Recuperar (Yampi) — índice dos planos

**Spec:** `docs/superpowers/specs/2026-10-29-recuperar-yampi-design.md` (aprovada pelo Igor em 29/10/2026)
**Mockup:** https://claude.ai/artifact/4STrnMzSBg58JodRxW3j8Z — onde diz "número da recuperação", leia "número do atendimento"
**Rastreio (usa a mesma base):** `docs/superpowers/plans/2026-10-29-rastreio-pedidos-00-indice.md`, seção "Contrato pedido à base"
**Resultado da Fase 0:** `docs/superpowers/plans/_recuperar-fase-0-resultado.md` (a Fase 0 escreve; os planos 3, 4 e 6 conferem
contra ele no começo)

Um PR por linha da tabela, uma sessão de implementação por PR (os planos 2, 5 e 6 se partem em mais de um PR, na seção
de cada um). Os PRs marcados **comum** servem ao Recuperar e ao Rastreio: quem chegar primeiro implementa, o outro só
usa.

## Planos

| PR | Plano | Tarefas | Depende de | Status |
|---|---|---|---|---|
| Fase 0 | `2026-10-29-recuperar-yampi-fase-0-provas.md` | 1–5 (ferramentas, um PR) · 6–11 (provas, resultado e fixtures, outro PR) | recursos do Igor; nenhum PR de código | escrito |
| 1a · Banco comum (comum) | `2026-10-29-recuperar-yampi-01a-banco-comum.md` | 0–4 | — | escrito |
| 1b · Banco do Recuperar | `2026-10-29-recuperar-yampi-01b-banco-recuperar.md` | 1–4 | 1a | escrito |
| 2a · Número do atendimento: seletores (comum) | `2026-10-29-recuperar-yampi-02-numero-do-atendimento.md` | 1, 2, 3, 5, 6 e o fechamento (11) | 1a | escrito |
| 2b · Número do atendimento: conectar e cartão (comum) | idem | 4, 7, 8, 9, 10 e o fechamento (11) | 2a | escrito |
| 3 · Envio de DM (comum) | `2026-10-29-recuperar-yampi-03-envio-de-dm.md` | 1–8 | 2b + Fase 0 (prova do WhatsApp) | escrito, com conferência da Fase 0 no começo |
| 4 · Resposta 1:1 e status (comum) | `2026-10-29-recuperar-yampi-04-resposta-e-status.md` | 1–9 | 3 e 5a + Fase 0 (prova do WhatsApp) | escrito, com conferência da Fase 0 no começo |
| 5a · Cobrança e liberação | `2026-10-29-recuperar-yampi-05-cobranca-e-casca.md` | T1–T7 | 1a | escrito |
| 5b · Casca | idem | T8–T11 | 5a | escrito |
| 6 · Yampi: aviso e processador (comum) | `2026-10-29-recuperar-yampi-06-conexao-yampi.md` | 1–6 | 1a + Fase 0 (prova da Yampi) | escrito, com conferência da Fase 0 no começo |
| 6b · Yampi: cliente, 401 e cron (comum) | idem | 7–10 | 6 | escrito |
| 6c · Yampi: cartão em Integrações (comum) | idem | 11–12 (a 13, prova na piloto, depois do 6c em produção) | 6b | escrito |
| 7 · Pix automático | depois da Fase 0 | — | 1b, 4, 5b, 6c | a escrever com o resultado da Fase 0 |
| 8 · Conversas | depois da Fase 0 | — | 7 | idem |
| 9 · Carrinho automático | depois da Fase 0 | — | 7 | idem |
| 10 · Scripts e depoimentos | depois da Fase 0 | — | 9 | idem |
| 11 · Medição | depois da Fase 0 | — | 10 | idem |

Os planos de 7 a 11 esperam a Fase 0 de propósito: o formato do telefone e do link na Yampi, onde mora o código
Pix e a regra que liga a resposta ao telefone mudam o código deles, e um "não" na Fase 0 desliga o automático.

**Ordem de implementação:** 1a → (1b, 2a, 5a) → (2b, 5b) → Fase 0 → (3 → 4) em paralelo com (6 → 6b → 6c) → 7 →
(8, 9) → 10 → 11.

- O 4 só espera o 3 e o 5a; o 6, o 6b e o 6c só esperam o 1a e a prova da Yampi: os dois ramos andam lado a lado. O
  7 espera os dois.
- A Fase 0 não depende de código: o PR das ferramentas (Tarefas 1–5) anda a qualquer hora, e as provas ao vivo podem
  vir antes se o Igor tiver os recursos. O que não pode é o 3, o 4 ou o 6 começarem sem o resultado dela.
- **Worker:** depois do merge do 2a, redeploy do worker no Coolify (plano 2, "Fatiamento em PRs" e Tarefa 11, Step 9).
  **Nenhuma loja ganha `recuperar_enabled` ou `rastreio_enabled` antes disso** — nem pelo admin do 5a, nem pelo
  Stripe: o worker antigo escolheria o número do atendimento para auto-grow e ações em massa. O 3 pede outro redeploy
  (o loop `dm`).
- Antes do PR 1a: abrir o card `recuperar-yampi` no quadro.
- A base que o Rastreio consome: 1a, 2a, 2b, 3, 4, 6 e 6b (o PR 2 dele espera o 6 e o 6b; o cartão do número
  do atendimento é do 2b; o cartão da Yampi, do 6c).

### Migrações

| PR | Arquivo (padrão) | Baseline |
|---|---|---|
| 1a | `20261029120000_base_comum_yampi_privado.sql` | 3 `t|` mudam; 7 `t|` e 2 `f|` entram |
| 1b | `20261029140000_recuperar_banco.sql` | 4 `t|` novas, `t|private_messages` e 1 `f|` |
| 2a | `20261030160000_numero_do_atendimento.sql` | não muda (só corpo, com trava de md5) |
| 3 | `20261030120000_envio_de_dm.sql` | `t|private_messages` e 6 `f|` |
| 4 | `20261030140000_privado_resposta.sql` | `t|private_conversations` e 3 `f|` |

- A ordem que vale é a de `deploy/supabase/apply-order.txt`: cada PR põe a sua linha no fim, no merge, e tem de dar
  1a < (1b, 2a) < 3 < 4. O 1b e o 2a não dependem um do outro; os prefixos padrão já os põem nessa ordem. Se a
  implementação cair em outro dia, troca-se a data e mantém-se o sufixo; o prefixo é sempre maior que o da última
  migração em `main` e nunca repete (o plano de cada um diz onde trocar).
- O 1b e o 2a andam juntos: o segundo a mergear atualiza a branch (o 2a não muda a baseline, mas o `drift` de cada um
  fica vermelho enquanto a migração do outro estiver só em dev). O 3 e o 4 mudam a baseline e andam em sequência.
- Nada nasce em dois planos: `private_messages.case_id`, `step_key`, `script_id` e `variant` são do 1b;
  `private_messages.sent_at`, `abre_conversa` e `conta_no_teto`, `app.privado_pausar` + `public.privado_pausar` e os
  índices `engine_commands_dm_instance_idx` e `optouts_tenant_phone_key_idx` são do 3;
  `private_conversations.sair_pendente_at` é do 4.
- As travas de md5 não se cruzam: o 2a trava `app.enqueue_broadcast`, `app.instance_caps` e
  `public.avaliar_disjuntor_saidas`; o 3 trava `app.claim_send_commands` (corpo de `20261023120000`), que o 2a não
  toca. O bloco 3 do check do 2a aceita o comando de post no número do atendimento `queued` (antes do 3) ou
  `canceled` (depois).

## Contrato comum (nomes fixos — todo plano usa estes)

Os planos não escolhem outro nome para o que está aqui. O que não está aqui, cada plano decide e põe no seu
bloco **Interfaces**.

### Banco (PR 1a, salvo indicação)

- Tabelas e colunas: exatamente as da seção 2 da spec (`yampi_connections`, `yampi_events`,
  `private_conversations`, `private_messages`, `private_number_state`, `private_signals`, `private_optouts`).
- `public.phone_key(p text)` **já existe**
  (`apps/web/supabase/migrations/20261010130000_funil_anuncios_tabelas.sql:14`: `immutable`, DDD + 8 últimos
  dígitos). O espelho TS é `chaveDoTelefone`, em `apps/web/src/lib/pages/phone.ts` (o mesmo arquivo do
  `normalizeWhatsappBR`). Nenhum plano cria outra. As colunas `phone_key` das tabelas novas são geradas com ela
  (`generated always as (public.phone_key(phone)) stored`, como `site_captures`).
- `instances.purpose text not null default 'grupos' check (purpose in ('grupos','privado'))` + índice único
  parcial `instances_one_privado_per_tenant on instances (tenant_id) where purpose = 'privado'`.
- `tenant_settings.recuperar_enabled boolean not null default false` e
  `tenant_settings.rastreio_enabled boolean not null default false`, com a trava
  `tenant_settings_guard_recuperar_rastreio_flags` (só o servidor muda).
- `memberships.modules`: o CHECK aceita `postar`, `recuperar`, `rastreio`.
- Valores de texto (CHECK no banco, união no TypeScript):
  - módulo: `recuperar` · `rastreio` · `teste`
  - prioridade do DM: `resposta` · `pix` · `pedido` · `carrinho` (é a ordem no teto)
  - status da mensagem: `na_fila` · `enviada` · `entregue` · `lida` · `falhou` · `cancelada`. **Não existe
    `vencida`:** a mensagem que passou do `valid_until` fica `cancelada` com `error = 'vencida'`.
  - autor: `automatico` · `pessoa` · `cliente` · `celular`
  - `direction`: `saida` · `entrada`
  - `private_signals.kind`: `sair` · `recusa`
  - `private_number_state.pause_reason`: `sinais` · `restricao` · `entrega`
- `engine_commands`, no comando de DM: `private_message_id uuid` (FK `private_messages`, `on delete set null`),
  `dm_module text`, `valid_until timestamptz`. Tipos de comando novos: `dm_text` e `dm_image`.
- `private_messages` ganha também `priority text`, `dedupe_key text` (única por loja quando não nula),
  `part_index smallint` (0, 1, 2 — partes do mesmo passo) e `phone` (destino em dígitos), além do que a seção 2
  da spec lista. Cada parte de um passo grava a sua chave, `<dedupeKey do pedido>#<part_index>` (PR 3); a mensagem
  recebida grava `evo:<key.id>` (PR 4).
- RLS: as cinco `private_*` têm `<tabela>_select_member`
  (`for select to authenticated using (tenant_id = any (app.user_tenant_ids()))`, vendedora fora) e `authenticated`
  só com SELECT; as quatro do 1b seguem a mesma forma. `yampi_connections` e `yampi_events` ficam com RLS e sem
  policy, só do service-role (credencial selada; payload cru com dado pessoal). Ninguém escreve pelo JWT.
- Retenção: `app.limpar_dados_vencidos_comuns() returns integer` (PR 1a) e
  `app.limpar_dados_vencidos_recuperar() returns integer` (PR 1b), cada uma com um wrapper `public.` de mesmo
  nome, `security definer`, EXECUTE só pra `service_role` (o PostgREST só enxerga `public`; precedente
  `prune_instance_sends`). O `/api/cron/yampi` chama `public.limpar_dados_vencidos_comuns()` 1× por dia; o
  `/api/cron/recuperar`, a do Recuperar.
- Funções SQL públicas (EXECUTE só `service_role`; o app chama por `rpc`):
  - PR 3: `enfileirar_dm(p_tenant uuid, p_pedido jsonb) returns jsonb` (`{message_ids}` ou `{recusado}`),
    `claim_dm_commands(p_max integer default 5, p_tenant uuid default null)`,
    `registrar_dm_enviada(p_command_id uuid, p_provider_message_id text, p_jid text, p_lid text)`,
    `registrar_dm_falhou(p_command_id uuid, p_erro text, p_definitivo boolean, p_restricao boolean)`,
    `limpar_fila_dm(p_tenant uuid default null) returns integer` e
    `privado_pausar(p_tenant uuid, p_instance uuid, p_motivo text) returns boolean` (wrapper de `app.privado_pausar`).
  - PR 4: `privado_registrar_mensagem(p_tenant uuid, p_instance uuid, p_m jsonb) returns jsonb`,
    `privado_registrar_status(p_tenant uuid, p_instance uuid, p_provider_id text, p_status text) returns jsonb` e
    `privado_vincular_conversa(p_tenant uuid, p_conversa uuid, p_telefone text) returns jsonb`.
  - Só no `app` (quem precisar pela API cria o wrapper `public.`, como a tela "Ritmo do número" do PR 7):
    `app.ritmo_privado(p_instance uuid)` (fonte única de teto, contagens do dia, horário e pausa),
    `app.modulo_privado_ligado(p_tenant, p_modulo)` e `app.telefone_bloqueado(p_tenant, p_phone)`.
- **Pausa:** `app.privado_pausar` (PR 3) é a única porta: 24 h, `pause_reason`, `healthy_since = paused_until` (o teto
  volta pra 20), `false` se já estava pausado; quando pausa agora, grava o aviso no sino (`notifications`, `type`
  `privado_pausa`; `href` `/painel/recuperar/ajustes` só com o Recuperar ligado) para qualquer motivo. Quem chama (o
  worker na restrição, o PR 4 em sinais e entrega) não avisa de novo.
- **SAIR:** a confirmação é a DM com `dedupeKey` `privado:sair:<conversation_id>` (PR 4), a única que atravessa a
  barreira de bloqueio (no `enfileirar_dm`, no claim e na limpeza). O casamento é por prefixo `privado:sair:`, porque o
  PR 3 grava `<dedupeKey>#<part_index>`.

### `apps/web/src/lib/privado/` (PRs 2b, 3 e 4)

```ts
// numero.ts — PR 2b (dm.ts reexporta numeroDoAtendimento e o tipo)
export type NumeroDoAtendimento = { instanceId: string; instanceName: string; status: string; phone: string | null };
export async function numeroDoAtendimento(tenantId: string): Promise<NumeroDoAtendimento | null>; // qualquer status (instances.status); quem chama olha
export async function privadoLiberado(tenantId: string): Promise<boolean>;                         // recuperar_enabled || rastreio_enabled
export async function pausaDoNumero(tenantId: string, instanceId: string): Promise<string | null>; // paused_until ou null

// dm.ts — PR 3
export type ModuloPrivado = "recuperar" | "rastreio" | "teste";
export type PrioridadeDm = "resposta" | "pix" | "pedido" | "carrinho";
export type StatusDm = "na_fila" | "enviada" | "entregue" | "lida" | "falhou" | "cancelada";
export type ParteDm = { texto: string } | { imagem: string; legenda?: string }; // imagem = "<bucket>/<caminho>"
export type AutorDm = { tipo: "automatico" } | { tipo: "pessoa"; userId: string };

export interface PedidoDeDm {
  tenantId: string;
  modulo: ModuloPrivado;
  telefone: string;        // só dígitos, com ou sem 55
  partes: ParteDm[];       // 1 a 3; saem em ordem, 5–15 s entre elas
  prioridade: PrioridadeDm;
  validoAte: Date;
  dedupeKey: string;       // até 200 caracteres; repetir a chave devolve os mesmos ids (idempotente)
  autor?: AutorDm;         // padrão: automatico
}
export type ResultadoDm =
  | { messageIds: string[] }
  | { recusado: "sem_numero" | "modulo_desligado" | "bloqueado" };

export function validarPedidoDeDm(pedido: PedidoDeDm, agora?: Date): PedidoDeDm; // lança Error("pedido de DM inválido: <campo>")
export async function enfileirarDm(pedido: PedidoDeDm): Promise<ResultadoDm>;   // pedido inválido lança (não vira recusado)
export async function statusDosDms(tenantId: string, messageIds: string[]): Promise<Record<string, { status: StatusDm; erro: string | null }>>;
export async function cancelarDms(tenantId: string, messageIds: string[]): Promise<number>; // quantas mudaram
```

`erro` = `private_messages.error`, um código fixo (tabela na Tarefa 2 do plano 3), nulo enquanto a mensagem não
falhou nem foi cancelada:

- com `cancelada`: `vencida` (passou do `valid_until`, inclusive com o módulo desligado), `cancelada`
  (`cancelarDms`), `bloqueado` (SAIR ou `optouts` depois de enfileirar), `parte_anterior` (a parte anterior do passo
  não saiu), `trava_numero` (DM fora do número do atendimento);
- com `falhou`: `sem_whatsapp`, `modulo_desligado`, `trava_numero`, `payload_invalido`, `destino_invalido`,
  `tipo_inesperado` (na hora) e, esgotadas as 5 tentativas, `restricao`, `evolution_<status http>`,
  `erro_de_envio`, `sem_instancia`, `imagem_indisponivel`.

`sem_numero` só quando a loja não tem número do atendimento; com o número caído, a DM entra na fila e vence
(`cancelada`, `vencida`). Colunas que são só de um módulo (`case_id`, `step_key`… do Recuperar) o módulo grava
depois, nas linhas devolvidas em `messageIds`.

- Bloqueio (`bloqueado`): telefone em `private_optouts` ou na `optouts` da loja, comparando por `public.phone_key`.
- Cartão do número (PR 2b): `apps/web/src/components/privado/cartao-numero-do-atendimento.tsx` exporta
  `CartaoNumeroDoAtendimento` (sem props; some quando a loja não tem nenhum dos dois add-ons). Ele lê
  `GET /api/privado/numero` → `CartaoDoNumero = { liberado: boolean; numero: NumeroNaTela | null }`
  (`lib/privado/cartao.ts`; rota com `getTenantContext`, fora das `ROTAS` da vendedora). Os Ajustes do Recuperar e as
  Configurações do Rastreio importam o mesmo.
- Resposta da cliente (PR 4), em `apps/web/src/lib/privado/resposta/consumidores.ts`:

```ts
export type RespostaDaCliente = { tenantId: string; conversationId: string; telefone: string; tipo: "sair" | "recusa" | "resposta"; chegouEm: Date };
export type ConsumidorDeResposta = {
  nome: "recuperar" | "rastreio";
  ligado: (modulos: ModulosLigados) => boolean;          // { recuperar; rastreio }, de lib/stores/privado-respostas
  consumir: (r: RespostaDaCliente) => Promise<unknown>;  // IDEMPOTENTE: a reentrega da Evolution roda de novo
};
export const CONSUMIDORES_DE_RESPOSTA: readonly ConsumidorDeResposta[]; // vazio no PR 4; cada módulo acrescenta a sua entrada no próprio PR (o Recuperar, no 7)
```

  O SAIR já cancela os DMs pendentes da conversa (dos dois módulos) e enfileira a confirmação antes dos consumidores;
  o consumidor só cuida do que é do módulo.

### `apps/web/src/lib/yampi/` (PRs 6 e 6b; sem arquivo-barril: o registro importa os módulos, um barril criaria ciclo)

```ts
// tipos.ts (6)
export type StatusYampi = "ativa" | "credencial_invalida" | "aviso_desativado" | "desconectada";
export type EventoYampi = "cart.reminder" | "order.created" | "order.paid" | "order.status.updated" | "transaction.payment.refused";
export type ConexaoYampi = {
  id: string; tenantId: string; alias: string; status: StatusYampi;
  userTokenSelado: string | null; userSecretKeySelado: string | null; webhookId: string | null; webhookSecretSelado: string | null;
  lastEventAt: string | null; lastCheckAt: string | null; lastError: string | null;
};
// consumidores.ts (6) — o ponto de extensão
export type EventoParaConsumir = { eventoId: string; tenantId: string; conexao: ConexaoYampi; evento: EventoYampi; time: string | null; recurso: unknown; payload: unknown }; // recurso = o resource do envelope; payload = o envelope inteiro
export type ConsumidorDeEvento = {
  nome: string;
  eventos: readonly EventoYampi[];
  ligado: (tenantId: string) => Promise<boolean>;
  consumir: (e: EventoParaConsumir) => Promise<unknown>;   // IDEMPOTENTE
};
export const CONSUMIDORES: readonly ConsumidorDeEvento[]; // vazio no 6; cada módulo acrescenta a sua entrada no próprio PR
// processar.ts (6)
export async function processarEventoYampi(eventoId: string, deps?: DepsDoProcessador): Promise<void>;
// cliente.ts (6b), reexportado por api.ts
export class YampiErro extends Error { readonly status: number; readonly retryAfterMs: number | null } // status 0 = sem resposta
// api.ts (6b)
export async function yampiGet<T>(conexao: ConexaoYampi, caminho: string, query?: Record<string, string | number>): Promise<T>;
export async function yampiPost<T>(conexao: ConexaoYampi, caminho: string, corpo: unknown): Promise<T>;
export async function yampiApagar(conexao: ConexaoYampi, caminho: string): Promise<void>;
// conexao.ts (6b)
export async function conexaoYampiAtiva(tenantId: string): Promise<ConexaoYampi | null>; // ativa ou aviso_desativado (a credencial vale)
```

- 401 em `yampiGet`/`yampiPost`/`yampiApagar` marca a conexão `credencial_invalida` e avisa no sino uma vez; conexão
  já inválida ou desconectada lança `YampiErro(401)` sem chamar a Yampi.
- Rota do aviso (6): `POST /api/integracoes/yampi/webhook?c=<connection_id>`.
- `processarEventoYampi` chama cada consumidor ligado que assina o evento e só marca o evento processado depois de
  todos (um que falha não para os outros; o evento fica com `error` e volta no cron). O Rastreio acrescenta
  `{ nome: "rastreio", eventos: ["order.created", "order.paid", "order.status.updated"], ligado: rastreioLigado,
  consumir: (e) => registrarPedidoDaYampi(e.tenantId, e.recurso, "aviso") }`; o Recuperar entra no PR 7.
- Cron comum `/api/cron/yampi` (6b): a cada 5 min, reprocessa evento parado há mais de 3 min e menos de 24 h (até 50
  por execução) e confere o aviso das lojas sem conferência há 1 h (até 20; recria se caiu); às 06:00 UTC, pela
  agenda (`x-vercel-cron-schedule`), chama `public.limpar_dados_vencidos_comuns()`. A varredura de Pix e carrinho é
  do Recuperar (`/api/cron/recuperar`, PR 7); a de pedidos é do Rastreio.
- Cartão (6c): `Yampi({ children })` em `apps/web/src/components/painel/configuracoes/yampi.tsx`, em Configurações ›
  Integrações; `children` são os blocos de cada módulo, que só aparecem com conexão. O PR 7 monta o mesmo componente
  em Recuperar › Ajustes.

### Recuperar

- `requireRecuperar(req: Request): Promise<TenantContext>` em `apps/web/src/lib/recuperar/access.ts` (molde de
  `lib/ig/access.ts`), 403 `recuperar_disabled` (PR 5a).
- `GET /api/recuperar/status` → `{ enabled: boolean; precisaDeVoce: number }` (5a). Rotas do módulo (5b em diante):
  `/painel/recuperar` (Hoje), `/conversas`, `/automatico`, `/scripts`, `/ajustes`; a vendedora alcança só a raiz e
  `/conversas`.

## Decisões dos planos que o Igor pode vetar

Tomadas pelos planos além da spec (ou contra a letra dela); o porquê está no plano. Vetar = mudar o plano antes da
sessão de implementação.

- **1a** — `yampi_connections` e `yampi_events` sem policy (a spec §2 pede policy em toda tabela): só o service-role lê credencial selada e payload cru.
- **1b** — "Caso fechado", para a retenção de 180 dias, é todo status fora de `agendado` e `em_sequencia` (entra `respondeu`), contado por `updated_at`.
- **1b** — `pix_ligado` nasce ligado e `carrinho_ligado` desligado (a spec só fixa `automatico` desligado e `controle` ligado).
- **2** — Chip repetido derruba sempre o número do atendimento, também na ordem inversa (o lojista conecta o número dos grupos com o chip que era do atendimento).
- **2** — A bio pode linkar o número do atendimento (só o número dos grupos fica fora da conferência da bio).
- **2** — `app.instance_caps` devolve zero linhas para o número do atendimento: ele sai do claim de post e da "Saúde do número".
- **3** — Quem escreveu nas últimas 24 h fica livre também do horário (a spec isenta da pausa e do limite de mensagens); só o intervalo vale.
- **3** — A parte seguinte de um passo ignora horário e teto (o teto do passo é reservado na parte 0); só a pausa segura.
- **3** — Conversa nova, na base, é a parte 0 para telefone que nunca escreveu e não recebeu nada do número em 7 dias.
- **3** — O envio de grupo passa a recusar destino que não seja `@g.us` (hoje aceita pessoa).
- **3** — O loop de DM fica desligado em DRY-RUN (só liga com `WORKER_SEND_ENABLED=true`); parado, a fila vence.
- **3** — Add-on desligado não cancela a fila: o claim não pega, e a DM vence pelo `valid_until`.
- **3** — Se a Fase 0 confirmar W2 e W3, sai o pré-check `whatsappNumbers` da spec: o envio já confere e o 400 `exists:false` vira `sem_whatsapp`.
- **3** — Toda pausa avisa no sino pela `app.privado_pausar`, também a por restrição; o texto do aviso de restrição é novo e precisa de revisão.
- **4** — A pausa por taxa de entrega dura 24 h (a spec só diz "imediata").
- **4** — Texto da confirmação do SAIR: "Pronto! Você não vai mais receber mensagens deste número."
- **4** — Nada do número do atendimento entra no `engine_events`, nem o `messages.update` (hoje ele vai cru para lá).
- **5** — Plano ativo = `active` ou `trialing`.
- **5** — O Recuperar, 7º item da barra, fica no Mais entre 1024 e 1279 px e só entra na barra a partir de 1280 px.
- **5** — Ajustes de copy em relação ao mockup: "número do atendimento", FAQ sem promessa de segurança (conexão não oficial), sai "sem limite de casos", painel de preço em papel (não Volt).
- **5** — A confirmação de privacidade fica em `logs` (`recuperar.aviso.confirmado`), sem coluna.
- **5** — Só Checkout hospedado (sem cobrar no cartão salvo); a liberação à mão no admin não desliga com o plano, e desligar à mão é recusado com assinatura viva.
- **6** — Ao (re)conectar, apaga os avisos da nossa rota na Yampi e cria outro (a spec diz "reaproveita").
- **6** — Evento parado é reprocessado de 3 min a 24 h depois de chegar, até 50 por execução, sem contador de tentativas.
- **6** — A limpeza diária roda pela agenda do cron (`x-vercel-cron-schedule: 0 6 * * *`); chamada manual sem o cabeçalho não limpa.
- **6** — 401 derruba a conexão na primeira recusa; Conectar e Testar ficam limitados a 5 por minuto por loja.
- **Fase 0** — O aviso criado na Yampi da piloto é apagado no fim da prova (o PR 6 cria o dele).
- **Fase 0** — GO = 3 ou mais respostas a envios nossos e nenhuma órfã; INCONCLUSIVO depois de 2 rodadas de reforço vale como NO-GO.

## Restrições globais (todo plano copia na sua seção "Global Constraints")

- TypeScript strict, imports com `@/`, arquivos em `kebab-case`, sem `any` sem justificativa. Nomes de domínio
  seguem o código (em português, como `reconciliarConexoes`).
- Store com service-role filtra `.eq('tenant_id', …)` sempre: o RLS não protege esse caminho.
- Migração: arquivo novo em `apps/web/supabase/migrations/` + linha no fim de `deploy/supabase/apply-order.txt`;
  o CI aplica em dev no PR e em prod no merge; baseline com `npm run schema:baseline` (credencial de dev) no
  mesmo PR; idempotente (`if not exists`); `security definer` sempre com `set search_path`; RLS ligado; policy
  no padrão `auth.uid()` + `memberships` (`app.has_membership`, `app.user_tenant_ids`), nunca GUC. Nunca DDL à
  mão.
- Função nova: conferir `has_function_privilege` de `anon`, `authenticated` e `public` (o event trigger
  `ensure_anon_revoked` cobre `anon`/`public`; `authenticated` nasce com EXECUTE pelo default privilege).
- `hubflow-engine/DECISIONS.md` é vinculante: nada de "digitando", marcar como lida, texto girado, troca de
  aparelho, proxy.
- O número dos grupos nunca manda DM; o número do atendimento nunca posta em grupo (trava com teste mutante).
- Tipos: rodar os dois `tsc` (web e worker); lint e `tsx --test` não checam tipo.
- Antes do push: `verify-local.ps1` (secrets + build).
- Texto de tela em português do Brasil, design G2 (fonte base 14 px; 12 px só em contador; verde ácido só em
  Postar/AO VIVO/LOTOU).
- Commit com prefixo semântico em inglês e a linha `Co-Authored-By` do assistente.
