# Recuperar (Yampi) — índice dos planos

**Spec:** `docs/superpowers/specs/2026-10-29-recuperar-yampi-design.md` (aprovada pelo Igor em 29/10/2026)
**Mockup:** https://claude.ai/artifact/4STrnMzSBg58JodRxW3j8Z — onde diz "número da recuperação", leia "número do atendimento"
**Rastreio (usa a mesma base):** `docs/superpowers/plans/2026-10-29-rastreio-pedidos-00-indice.md`, seção "Contrato pedido à base"

Um plano por PR, uma sessão de implementação por plano. Os planos marcados **comum** servem ao Recuperar e ao
Rastreio: quem chegar primeiro implementa, o outro só usa.

## Planos

| PR | Plano | Depende de | Status |
|---|---|---|---|
| Fase 0 | `2026-10-29-recuperar-yampi-fase-0-provas.md` | recursos do Igor | escrito |
| 1a · Banco comum (comum) | `2026-10-29-recuperar-yampi-01a-banco-comum.md` | — | escrito |
| 1b · Banco do Recuperar | `2026-10-29-recuperar-yampi-01b-banco-recuperar.md` | 1a | escrito |
| 2 · Número do atendimento (comum) | `2026-10-29-recuperar-yampi-02-numero-do-atendimento.md` | 1a | escrito |
| 3 · Envio de DM (comum) | `2026-10-29-recuperar-yampi-03-envio-de-dm.md` | 2 + prova do WhatsApp | escrito, com conferência da Fase 0 no começo |
| 4 · Resposta 1:1 e status (comum) | `2026-10-29-recuperar-yampi-04-resposta-e-status.md` | 3 | escrito, com conferência da Fase 0 no começo |
| 5 · Cobrança e casca | `2026-10-29-recuperar-yampi-05-cobranca-e-casca.md` | 1a | escrito |
| 6 · Conexão Yampi (comum) | `2026-10-29-recuperar-yampi-06-conexao-yampi.md` | 1a + prova da Yampi | escrito, com conferência da Fase 0 no começo |
| 7 · Pix automático | depois da Fase 0 | 1b, 4, 5, 6 | a escrever com o resultado da Fase 0 |
| 8 · Conversas | depois da Fase 0 | 7 | idem |
| 9 · Carrinho automático | depois da Fase 0 | 7 | idem |
| 10 · Scripts e depoimentos | depois da Fase 0 | 9 | idem |
| 11 · Medição | depois da Fase 0 | 10 | idem |

Os planos de 7 a 11 esperam a Fase 0 de propósito: o formato do telefone e do link na Yampi, onde mora o código
Pix e a regra que liga a resposta ao telefone mudam o código deles, e um "não" na Fase 0 desliga o automático.

**Ordem de implementação:** 1a → (1b, 2, 5, 6 juntos) → Fase 0 → 3 → 4 → 7 → (8, 9) → 10 → 11. O 1b e o 2 têm
migração: o segundo a mergear atualiza a branch e refaz a baseline. Antes do PR 1a: abrir o card
`recuperar-yampi` no quadro.

## Contrato comum (nomes fixos — todo plano usa estes)

Os planos não escolhem outro nome para o que está aqui. O que não está aqui, cada plano decide e põe no seu
bloco **Interfaces**.

### Banco (PR 1a, salvo indicação)

- Tabelas e colunas: exatamente as da seção 2 da spec (`yampi_connections`, `yampi_events`,
  `private_conversations`, `private_messages`, `private_number_state`, `private_signals`, `private_optouts`).
- `public.phone_key(p text)` **já existe**
  (`apps/web/supabase/migrations/20261010130000_funil_anuncios_tabelas.sql:14`: `immutable`, DDD + 8 últimos
  dígitos, espelho TS `chaveDoTelefone`). Nenhum plano cria outra. As colunas `phone_key` das tabelas novas são
  geradas com ela (`generated always as (public.phone_key(phone)) stored`, como `site_captures`).
- `instances.purpose text not null default 'grupos' check (purpose in ('grupos','privado'))` + índice único
  parcial `instances_one_privado_per_tenant on instances (tenant_id) where purpose = 'privado'`.
- `tenant_settings.recuperar_enabled boolean not null default false` e
  `tenant_settings.rastreio_enabled boolean not null default false`.
- `memberships.modules`: o CHECK aceita `postar`, `recuperar`, `rastreio`.
- Valores de texto (CHECK no banco, união no TypeScript):
  - módulo: `recuperar` · `rastreio` · `teste`
  - prioridade do DM: `resposta` · `pix` · `pedido` · `carrinho` (é a ordem no teto)
  - status da mensagem: `na_fila` · `enviada` · `entregue` · `lida` · `falhou` · `cancelada`
  - autor: `automatico` · `pessoa` · `cliente` · `celular`
- `engine_commands`, no comando de DM: `private_message_id uuid` (FK `private_messages`, `on delete set null`),
  `dm_module text`, `valid_until timestamptz`. Tipos de comando novos: `dm_text` e `dm_image`.
- `private_messages` ganha também `priority text`, `dedupe_key text` (única por loja quando não nula),
  `part_index smallint` (0, 1, 2 — partes do mesmo passo) e `phone` (destino em dígitos), além do que a seção 2
  da spec lista.
- Retenção: `app.limpar_dados_vencidos_comuns() returns integer` (PR 1a; o `/api/cron/yampi` chama 1× por dia)
  e `app.limpar_dados_vencidos_recuperar() returns integer` (PR 1b; o `/api/cron/recuperar` chama).

### `apps/web/src/lib/privado/` (PRs 2, 3 e 4)

```ts
// dm.ts — PR 3 (numeroDoAtendimento nasce no PR 2, em numero.ts, e dm.ts reexporta)
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
  dedupeKey: string;       // repetir a chave devolve os mesmos ids (idempotente)
  autor?: AutorDm;         // padrão: automatico
}
export type ResultadoDm =
  | { messageIds: string[] }
  | { recusado: "sem_numero" | "modulo_desligado" | "bloqueado" };

export async function numeroDoAtendimento(tenantId: string): Promise<NumeroDoAtendimento | null>;
export async function enfileirarDm(pedido: PedidoDeDm): Promise<ResultadoDm>;
export async function statusDosDms(tenantId: string, messageIds: string[]): Promise<Record<string, StatusDm>>;
export async function cancelarDms(tenantId: string, messageIds: string[]): Promise<number>;
```

`NumeroDoAtendimento = { instanceId: string; instanceName: string; status: string; phone: string | null }`.
Colunas que são só de um módulo (`case_id`, `step_key`… do Recuperar) o módulo grava depois, nas linhas
devolvidas em `messageIds`.

- Bloqueio (`bloqueado`): telefone em `private_optouts` ou na `optouts` da loja, comparando por `public.phone_key`.
- Componente do cartão do número: `apps/web/src/components/privado/cartao-numero-do-atendimento.tsx`, exporta
  `CartaoNumeroDoAtendimento` (PR 2). Os Ajustes do Recuperar e as Configurações do Rastreio importam o mesmo.

### `apps/web/src/lib/yampi/` (PR 6)

```ts
export async function conexaoYampiAtiva(tenantId: string): Promise<ConexaoYampi | null>;
export async function yampiGet<T>(conexao: ConexaoYampi, caminho: string, query?: Record<string, string | number>): Promise<T>;
export class YampiErro extends Error { readonly status: number }
export async function processarEventoYampi(eventoId: string): Promise<void>;
```

- Rota do aviso: `POST /api/integracoes/yampi/webhook?c=<connection_id>`.
- Cron comum: `/api/cron/yampi` — confere o aviso na Yampi (recria se caiu) e reprocessa evento parado. A
  varredura de Pix e carrinho é do Recuperar (`/api/cron/recuperar`, PR 7); a de pedidos é do Rastreio.
- `processarEventoYampi` chama o consumidor de cada módulo ligado (o Rastreio:
  `registrarPedidoDaYampi(tenantId, payload, "aviso")`; o Recuperar entra no PR 7) e só marca o evento
  processado depois de todos.

### Recuperar

- `requireRecuperar()` em `apps/web/src/lib/recuperar/access.ts` (molde de `lib/ig/access.ts`), 403
  `recuperar_disabled`.

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
