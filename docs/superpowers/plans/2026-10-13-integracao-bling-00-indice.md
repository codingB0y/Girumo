# Integração Bling — plano de implementação (índice e contratos)

**Spec:** `docs/superpowers/specs/2026-10-13-integracao-bling-design.md` (ler inteira antes de qualquer tarefa)
**Mockup:** https://claude.ai/artifact/Fpbmf3pLq7F8t6BzsAhX2z · **Card:** `integracao-bling` (prod)

Execução nesta sessão, com equipe de agentes: um implementador por tarefa (TDD), um revisor por PR, e o
controlador (a sessão) commitando por tarefa. Implementador **não commita** e não mexe em git.

## Restrições globais

- TypeScript strict, imports `@/`, sem `any` (use `unknown` + zod), sem `console.log` (só
  `console.error`/`console.warn` com prefixo `[bling/...]`, **nunca** token, telefone ou e-mail no log).
- Todo arquivo de servidor começa com `import "server-only";` quando toca banco ou segredo (os puros não).
- Toda query numa tabela com `tenant_id`: `.eq("tenant_id", tenantId)` explícito (service-role ignora RLS).
- Erros tratados na camada certa; nada engolido em silêncio. Rota nunca devolve mensagem de banco.
- Imutabilidade: nada de mutar argumento; funções < 50 linhas; arquivos < 400 linhas.
- Testes: `node:test` + `node:assert/strict`, rodados com
  `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivos>` a partir de `apps/web`.
  Rotas e stores: PostgREST falso com `node:http` (molde: `src/app/api/integracoes/site/chave/route.test.ts`).
  Lógica com rede ou relógio: dependências injetadas (fetch, esperar, agora), nunca timers reais.
- Tipo checado com `npx tsc --noEmit --project tsconfig.json` em `apps/web` (e `tsconfig.e2e.json` quando
  mexer em `e2e/`). `npm run lint` em `apps/web` nos arquivos tocados.
- Disco do C: quase cheio: **não** rodar `next build`; o CI faz.
- Next desta versão tem mudanças: conferir `node_modules/next/dist/docs/` antes de usar API de rota nova;
  `after` vem de `next/server` (molde: `src/app/api/ig/webhook/route.ts`).
- Comentários em português, no estilo da casa: dizem **por quê**, curtos.

## Mapa de PRs, arquivos e dependências

| PR | Branch | Files | Depends-on |
|---|---|---|---|
| 1 banco | `feat/bling-banco` | `apps/web/supabase/migrations/20261013120000_integracao_bling.sql`, `deploy/supabase/apply-order.txt`, `apps/web/src/lib/bling/banco.integration.test.ts`, (`deploy/supabase/schema-baseline.json` depois da DDL) | — |
| 2 núcleo Bling | `feat/bling-nucleo` | `apps/web/src/lib/security/secret-box{,.test}.ts`, `apps/web/src/lib/bling/{oauth,cliente,api,aviso,classificar}{,.test}.ts` | — |
| 3 núcleo Meta | `feat/bling-meta` | `apps/web/src/lib/meta/dados-do-cliente{,.test}.ts`, `apps/web/src/lib/campaigns/meta-capi{,.test}.ts`, `apps/web/src/lib/bling/eventos-meta{,.test}.ts` | — (usa só tipos do 2: ver nota) |
| 4 conexão | `feat/bling-conexao` | `apps/web/src/lib/stores/bling-conexoes{,.test}.ts`, `apps/web/src/lib/stores/bling-oauth-states.ts`, `apps/web/src/app/api/integracoes/bling/conectar/route{,.test}.ts`, `apps/web/src/app/api/integracoes/bling/retorno/route{,.test}.ts`, `apps/web/src/app/api/integracoes/bling/route{,.test}.ts` (só DELETE), `apps/web/src/lib/security/request-access-policy{,.test}.ts`, `apps/web/src/middleware.ts` | 2 |
| 5 motor | `feat/bling-motor` | `apps/web/src/lib/stores/bling-pedidos{,.test}.ts`, `apps/web/src/lib/stores/bling-contatos{,.test}.ts`, `apps/web/src/lib/stores/site-captures.ts` (+1 função), `apps/web/src/lib/bling/{pedido-girumo,processar-pedido,sincronizar}{,.test}.ts`, `apps/web/src/lib/bling/deps.ts`, `apps/web/src/lib/bling/avisar-reconectar.ts`, `apps/web/src/lib/email/templates.ts` | 2, 3, 4 |
| 6 entrada | `feat/bling-entrada` | `apps/web/src/app/api/integracoes/bling/webhook/route{,.test}.ts`, `apps/web/src/app/api/cron/bling/route{,.test}.ts`, `apps/web/vercel.json`, `apps/web/src/lib/security/request-access-policy{,.test}.ts`, `apps/web/src/middleware.ts` | 5 |
| 7 cartão API | `feat/bling-cartao-api` | `apps/web/src/app/api/integracoes/bling/route{,.test}.ts` (GET/PATCH), `apps/web/src/app/api/integracoes/bling/lista/route{,.test}.ts`, `apps/web/src/lib/bling/cartao.ts{,.test}` , `apps/web/src/lib/stores/vendas.ts`, `apps/web/src/lib/vendas/tipos.ts`, `apps/web/src/app/api/vendas/route.ts`, `apps/web/src/app/api/vendas/[id]/route.ts`, `apps/web/src/app/api/orders/route.ts` (+ testes existentes dessas rotas) | 4, 5 |
| 8 tela | `feat/bling-tela` | `apps/web/src/components/painel/configuracoes/bling-painel{,.test}.tsx/.ts`, `apps/web/src/components/painel/configuracoes/bling.tsx`, `apps/web/src/components/painel/configuracoes/vitrine/configuracoes-vitrine.tsx`, `apps/web/src/components/painel/vendas/minhas-vendas.tsx` (+ onde fica o "Registrar venda"), `apps/web/e2e/painel-integracao-bling.spec.ts` | 7 |

**Ondas** (regra de `~/.claude/rules/parallel-subagent-driven-development.md`): W1 = PR 1 ∥ PR 2 ∥ PR 3 ·
W2 = PR 4 ∥ tarefas 5a (stores de pedidos e contatos) · W3 = 5b (pedido-girumo, processar, sincronizar,
deps, e-mail) · W4 = PR 6 ∥ PR 7 · W5 = PR 8.

Nota do PR 3: `eventos-meta.ts` e `dados-do-cliente.ts` não importam nada do PR 2. O tipo de contato que
`dados-do-cliente` recebe é o dele (`DadosDoCliente`), e o motor (PR 5) converte `ContatoBling` nele.

Publicação: uma branch local de integração com os commits na ordem dos PRs; cada PR vira branch própria a
partir de `origin/main` (cherry-pick dos commits dele) quando as dependências já estiverem em `main`; senão
empilha sobre a do PR de que depende. PRs 2–7 podem entrar antes da DDL (inertes sem as variáveis). PR 1 e
PR 8 esperam a DDL nos dois bancos.

---

## PR 1 — banco

SQL completo em `apps/web/supabase/migrations/20261013120000_integracao_bling.sql` (escrito pelo
controlador a partir da spec §2). Entrada no fim de `deploy/supabase/apply-order.txt`:

```
# 2026-10-13 - Integracao Bling (spec 2026-10-13-integracao-bling-design §2): bling_connections,
# bling_oauth_states, bling_contacts, bling_orders (RLS, sem policy, sem grant a authenticated),
# orders.source ('manual'|'bling') e as RPCs bling_claim / bling_release / bling_enqueue /
# bling_recompute_lists / bling_resumo (execute so service_role). Muda a baseline (t|orders e
# as tabelas/funcoes novas). O gate nao ve CHECK, indice nem ACL: conferir por SQL nos dois bancos.
apps/web/supabase/migrations/20261013120000_integracao_bling.sql
```

**Task 1.1 — teste de integração** `apps/web/src/lib/bling/banco.integration.test.ts` (roda só no job e2e,
contra o banco de **dev**, pula em prod e sem `E2E_TENANT_ID`; molde:
`src/lib/resultados/relatorio-anuncios.integration.test.ts`). Duas lojas descartáveis criadas em
`organizations` e apagadas no `after` (cascata leva as tabelas novas). Casos:

1. `bling_claim`: dois donos ao mesmo tempo → exatamente um `true`; o mesmo dono de novo → `true`; trava
   vencida (`lease_until` no passado via update direto) → outro dono pega; `status = 'reconectar'` → `false`;
   `paused_until` no futuro → `false`; `p_seconds` 5 → erro.
2. `bling_release` de dono errado não solta; do certo solta.
3. `bling_enqueue('aviso', [{id}])`: cria pendente com `origin = 'aviso'`; numa linha existente processada
   (pending false, snapshot preenchido) volta pendente, zera `attempts` e apaga `snapshot`, **sem** mudar
   `origin`.
4. `bling_enqueue('varredura', …)`: item igual ao último processado (situação/total/contato) → 0 linhas e
   continua `pending = false`; item com situação diferente → pendente com o retrato novo; item repetido no
   mesmo lote não quebra (distinct).
5. `bling_enqueue('historico', …)`: não toca linha existente; cria a que não existe.
6. `bling_recompute_lists`: venda ≥ alto → `alto_valor`; venda < alto → `comprador`; só pedido →
   `lead`; só ignorado → `null`; dois contatos com o mesmo telefone (um com venda, outro com pedido) → os
   dois `comprador`; `high_value` nulo → ninguém em `alto_valor`; mudar `high_value` e recalcular a loja
   move a pessoa; `lista_changed_at` só muda quando a lista muda.
7. `bling_resumo`: números de 30 dias (vendas, vendido, origem, estados do Meta), pessoas por lista
   (duas linhas da mesma pessoa contam 1), `historico_lidos`; nada da outra loja entra.
8. `orders.source` padrão `'manual'`; `'outro'` recusado pelo CHECK.

---

## PR 2 — núcleo Bling (puro, sem banco)

### `lib/security/secret-box.ts`

```ts
/** INTEGRATIONS_ENCRYPTION_KEY = base64 de exatamente 32 bytes. null = ausente ou inválida. */
export function chaveDeIntegracoes(env?: NodeJS.ProcessEnv): Buffer | null;
/** AES-256-GCM, IV aleatório de 12 bytes; `contexto` vira AAD (ex.: `bling:<tenant>:refresh`). */
export function selar(texto: string, contexto: string, chave: Buffer): string; // "v1.<iv>.<tag>.<cifra>" base64url
/** Lança Error("secret-box: …") para formato inválido, versão desconhecida, adulteração, chave ou contexto errados. */
export function abrir(selado: string, contexto: string, chave: Buffer): string;
```
Testes: ida e volta (inclusive texto de 3.000 caracteres, o JWT do Bling); dois `selar` do mesmo texto dão
saídas diferentes; adulterar 1 caractere de cada parte → erro; contexto trocado → erro; chave errada → erro;
`chaveDeIntegracoes` com 31/33 bytes, vazio e lixo → null.

### `lib/bling/oauth.ts`

```ts
export const BLING_AUTHORIZE_URL = "https://www.bling.com.br/Api/v3/oauth/authorize";
export const BLING_TOKEN_URL = "https://api.bling.com.br/Api/v3/oauth/token";
export const BLING_REVOKE_URL = "https://api.bling.com.br/Api/v3/oauth/revoke";
export type CredenciaisBling = { clientId: string; clientSecret: string };
/** BLING_CLIENT_ID e BLING_CLIENT_SECRET não vazios; senão null (integração indisponível). */
export function credenciaisBling(env?: NodeJS.ProcessEnv): CredenciaisBling | null;
export function urlDeAutorizacao(clientId: string, state: string): string; // response_type=code&client_id&state
export type TokensBling = { accessToken: string; refreshToken: string; expiraEm: Date };
export type TipoErroOAuth = "concessao_invalida" | "cliente_invalido" | "limite" | "transitorio" | "outro";
export class ErroOAuthBling extends Error { readonly tipo: TipoErroOAuth; readonly status: number | null }
type Opcoes = { fetchImpl?: typeof fetch; agora?: () => number; timeoutMs?: number };
export function trocarCodigo(code: string, cred: CredenciaisBling, opcoes?: Opcoes): Promise<TokensBling>;
export function renovarToken(refreshToken: string, cred: CredenciaisBling, opcoes?: Opcoes): Promise<TokensBling>;
/** Melhor esforço: nunca lança. */
export function revogarToken(token: string, cred: CredenciaisBling, opcoes?: Opcoes): Promise<void>;
```
- POST form-urlencoded; headers `Authorization: Basic base64(id:secret)`, `Accept: 1.0`, `enable-jwt: 1`;
  credenciais **nunca** no corpo; timeout 15 s (`AbortSignal.timeout`).
- Resposta: `access_token`, `refresh_token`, `expires_in` (s) → `expiraEm = agora + expires_in`. Faltou
  campo → `ErroOAuthBling("outro")`.
- Classificação (aceita os dois formatos de erro: `{"error":"invalid_grant"}` e
  `{"error":{"type":"…","message":"…"}}`): 429 → `limite`; 5xx, rede, timeout → `transitorio`;
  `invalid_client` → `cliente_invalido`; 400/401/403 restantes → `concessao_invalida`; resto → `outro`.
  A mensagem do erro nunca contém o token nem o segredo.
- Revogação: `token` + `token_type_hint=refresh_token`, Basic auth.

### `lib/bling/cliente.ts`

```ts
export const BLING_API_BASE = "https://api.bling.com.br/Api/v3";
export type TipoErroBling = "auth" | "escopo" | "nao_encontrado" | "limite" | "transitorio" | "invalido";
export class ErroBling extends Error { readonly tipo: TipoErroBling; readonly status: number | null }
export type Query = Record<string, string | number | ReadonlyArray<string | number> | undefined>;
export type OpcoesCliente = {
  token: () => Promise<string>;   // access token vigente
  renovar: () => Promise<string>; // força renovação; chamado no máximo 1x por requisição (num 401)
  fetchImpl?: typeof fetch; esperar?: (ms: number) => Promise<void>; agora?: () => number;
  intervaloMs?: number; // 350
  timeoutMs?: number;   // 15000
};
export type ClienteBling = { get(caminho: string, query?: Query): Promise<unknown> };
export function criarClienteBling(opcoes: OpcoesCliente): ClienteBling;
```
- Headers: `Authorization: Bearer <token>`, `Accept: application/json`, `enable-jwt: 1`.
- Ritmo: entre o **início** de duas requisições do mesmo cliente, no mínimo `intervaloMs` (conta também as
  novas tentativas).
- Lista na query vira `chave[]=a&chave[]=b`; `undefined` some.
- 429 → espera 1 s, 2 s, 4 s e tenta de novo; persistiu → `ErroBling("limite")`.
- 5xx, erro de rede, timeout → 2 novas tentativas (1 s, 3 s); persistiu → `transitorio`.
- 401 → `renovar()` uma vez e repete; 401 de novo → `auth`. Falha do `renovar` sobe como está.
- 403 → `escopo`; 404 → `nao_encontrado`; outro 4xx → `invalido` (mensagem com `error.type`/`message` do
  Bling, sem dados do pedido).
- 2xx → JSON (`null` em 204 ou corpo vazio).

### `lib/bling/api.ts` (endpoints tipados; zod tolerante, `.passthrough()` nos objetos)

```ts
export type SituacaoBling = { id: number; nome: string; base: number }; // base = idHerdado > 0 ? idHerdado : id
export type PedidoResumo = { id: number; numero: string | null; data: string | null; total: number; contatoId: number | null; situacaoId: number };
export type ContatoBling = {
  id: number; nome: string | null; tipo: "F" | "J" | "E" | null;
  celular: string | null; telefone: string | null; email: string | null; emailNotaFiscal: string | null;
  municipio: string | null; uf: string | null; cep: string | null; pais: string | null;
  dataNascimento: string | null; sexo: "M" | "F" | null;
};
export type EmpresaBling = { id: string; nome: string | null };
export type FiltroPedidos = { pagina: number; limite?: number; dataInicial?: string; dataFinal?: string; dataAlteracaoInicial?: string; dataAlteracaoFinal?: string };
export function obterEmpresa(c: ClienteBling): Promise<EmpresaBling>;                 // GET /empresas/me/dados-basicos
export function listarSituacoesDeVenda(c: ClienteBling): Promise<SituacaoBling[] | null>; // null = módulo de vendas não achado
export function listarPedidos(c: ClienteBling, f: FiltroPedidos): Promise<PedidoResumo[]>; // GET /pedidos/vendas, limite padrão 100
export function obterPedido(c: ClienteBling, id: number): Promise<PedidoResumo | null>;  // 404 → null
export function obterContato(c: ClienteBling, id: number): Promise<ContatoBling | null>; // 404 → null
/** "YYYY-MM-DD HH:MM:SS" em America/Sao_Paulo (formato dos filtros dataAlteracao*). */
export function horaDoBling(d: Date): string;
/** "YYYY-MM-DD" em America/Sao_Paulo. */
export function diaDoBling(d: Date): string;
```
- Toda resposta vem em `{ data: … }`. Campo inválido vira `null` (nunca derruba a página inteira); item da
  lista sem `id` numérico positivo ou sem `situacao.id` é descartado.
- `numero` número → string. `data` `"0000-00-00"` ou inválida → `null`. `contato.id` 0 → `null`.
  `total` string numérica → número. String vazia → `null`. `sexo` só `M`/`F`; `tipo` só `F`/`J`/`E`.
- `endereco.geral.{municipio,uf,cep}`, `dadosAdicionais.{dataNascimento,sexo}`, `pais.nome`.
- Empresa: `data.id` (string não vazia, senão erro `invalido`); nome = `nome ?? razaoSocial ?? fantasia ?? null`.
- Módulo de vendas: em `GET /situacoes/modulos`, normalizar o nome (minúsculas, sem acento); escolher o
  primeiro igual a `vendas`, `pedidos de venda` ou `pedidos de vendas`; senão o primeiro que contém
  `venda` e não contém `pdv`, `proposta` nem `devolu`; nenhum → `null`. Depois
  `GET /situacoes/modulos/{id}` → `[{id, nome, idHerdado}]`.

### `lib/bling/aviso.ts`

```ts
export const LIMITE_CORPO_AVISO = 64 * 1024;
/** "sha256=<hex>" = HMAC-SHA256 do corpo cru com o client secret. Tempo constante. */
export function assinaturaBlingConfere(corpoCru: string, cabecalho: string | null, segredo: string): boolean;
export type EventoPedido = "order.created" | "order.updated" | "order.deleted";
export type AvisoBling = { eventoId: string; evento: EventoPedido; empresaId: string; pedidoId: number };
export function lerAviso(json: unknown): { ok: true; aviso: AvisoBling } | { ok: false; motivo: "outro_evento" | "formato" };
```
Molde de assinatura: `src/lib/ig/transport/signature.ts`. `data.id` número ou string de dígitos > 0.

### `lib/bling/classificar.ts`

```ts
export const SITUACAO = { EM_ABERTO: 6, ATENDIDO: 9, CANCELADO: 12, EM_ANDAMENTO: 15, VENDA_AGENCIADA: 18, EM_DIGITACAO: 21, VERIFICADO: 24 } as const;
export const SITUACOES_PADRAO: readonly SituacaoBling[]; // os 7 acima, base = id, nomes do Bling
export const BASES_BLOQUEADAS: ReadonlySet<number>;    // 12 e 21: nunca contam como venda
export function baseDaSituacao(id: number, situacoes: readonly SituacaoBling[]): number; // desconhecida → id
export function idsDeVendaPadrao(situacoes: readonly SituacaoBling[]): number[]; // todas com base 9 (inclui 9), ordenadas
export function idsDeVendaValidos(ids: readonly number[], situacoes: readonly SituacaoBling[]): boolean; // ≥1, todos conhecidos, nenhum com base bloqueada
export type TipoPedido = "venda" | "pedido" | "ignorado" | "excluido";
export function classificarPedido(p: Pick<PedidoResumo, "situacaoId" | "total"> | null, situacoes: readonly SituacaoBling[], idsDeVenda: readonly number[]): TipoPedido;
/** Hoje em São Paulo (ou data nula) → agora; outro dia → 12:00 de São Paulo daquele dia; nunca no futuro. */
export function horaDoPedido(dataPedido: string | null, agora: Date): Date;
export const JANELA_META_MS: number; // 6 d 23 h
export function dentroDaJanelaMeta(hora: Date, agora: Date): boolean;
```
Regra de `classificarPedido` (spec §1): `null` → `excluido`; base 21 → `ignorado`; `total ≤ 0` → `ignorado`;
`situacaoId ∈ idsDeVenda` → `venda`; resto → `pedido`.

---

## PR 3 — núcleo Meta (puro)

### `lib/meta/dados-do-cliente.ts`

```ts
export type DadosDoCliente = {
  nome: string | null; pessoaFisica: boolean; emails: readonly string[]; telefones: readonly string[];
  nascimento: string | null /* YYYY-MM-DD */; sexo: "M" | "F" | null;
  cidade: string | null; uf: string | null; cep: string | null; pais: string | null;
};
export type HashesMeta = {
  em?: string[]; ph?: string[]; fn?: string; ln?: string; db?: string; doby?: string; dobm?: string; dobd?: string;
  ge?: string; ct?: string; st?: string; zp?: string; country?: string; external_id?: string;
};
export function sha256Hex(texto: string): string;
/** `chave` = phone_key da pessoa (vira external_id). Campo sem valor válido fica de fora (nunca hash de ""). */
export function hashesDoCliente(d: DadosDoCliente, chave: string | null): HashesMeta;
```
Normalização (tabela da spec §4): e-mails separados por `, ; espaço`, aparados, minúsculos, regex simples
`^[^@\s]+@[^@\s]+\.[^@\s]+$`, sem repetição; telefones → para cada um, `variantesDoTelefone`
(`@/lib/vendas/telefone`) e fica só o que começa com `55`, sem repetição; nome só se `pessoaFisica`:
minúsculas, sem pontuação, acento mantido, `fn` = primeira palavra, `ln` = última (uma palavra só → só
`fn`); nascimento válido (ano 1900–ano atual) → `db` `YYYYMMDD` + `doby`/`dobm`/`dobd`; sexo → `m`/`f`
(só pessoa física); cidade minúscula sem dígito, pontuação nem espaço (acento mantido); UF de 2 letras
minúsculas; CEP com 8 dígitos; país vazio ou "Brasil" (sem acento/caixa) → `br`, outro → sem país.
Todos os valores saem em SHA-256 hex. Testes com exemplos conhecidos: `sha256("joao@x.com")`, telefone
com e sem 9, PJ sem nome, e-mail duplicado, data inválida, CEP com hífen.

### `lib/campaigns/meta-capi.ts` (generalização sem mudar o comportamento do `/r/`)

- Exportar `CapiUserData` (os campos atuais + `em?: string[]; ph?: string[]; fn; ln; db; ge; ct; st; zp;
  country; external_id`, todos `string`), `CapiEvent` (`action_source: "website" | "chat"`,
  `event_source_url?: string`, `custom_data: Record<string, string | number>`) e
  `CapiPayload = { data: CapiEvent[]; test_event_code?: string }`.
- `buildCapiPayload` continua montando o evento de site igual (testes atuais intactos).
- `temSinalDeCasamento` aceita também `em`, `ph`, `external_id` não vazios. A mensagem de erro do
  `sendCapiEvent` sem sinal continua a mesma.
- Teste novo: evento `chat` só com `ph` passa a guarda.

### `lib/bling/eventos-meta.ts`

```ts
export type EntradaEvento = {
  pedidoBlingId: number; numero: string | null; total: number; quando: Date;
  hashes: HashesMeta; fbc: string | null; fbp: string | null;
  origem: "anuncio" | "grupo" | "sem_origem"; faixa: "alto" | "normal";
};
export function temDadosDeCasamento(h: HashesMeta, fbc: string | null, fbp: string | null): boolean; // em, ph, external_id, fbc ou fbp
export function faixaDoValor(total: number, alto: number | null): "alto" | "normal";
export function eventoInitiateCheckout(e: EntradaEvento): CapiEvent; // event_id "bling-ic-<id>", value, currency BRL, order_id
export function eventoPurchase(e: EntradaEvento): CapiEvent;         // event_id "bling-<id>", + origem, faixa
export type PixelEscolhido = { campaignId: string; pixelId: string; token: string; testCode: string | null };
export type CampanhaComMetadata = { id: string; name: string | null; metadata: Record<string, unknown> | null };
/** Opções = campanhas com pixel E token (readIntegracoes). Escolhida válida → ela; senão um pixel único → o dele; senão motivo. */
export function opcoesDePixel(campanhas: readonly CampanhaComMetadata[]): PixelEscolhido[];
export function escolherPixel(campanhas: readonly CampanhaComMetadata[], escolhida: string | null): { ok: true; pixel: PixelEscolhido } | { ok: false; motivo: "sem_pixel" | "varios" };
```
`user_data` = hashes (sem `doby/dobm/dobd`, que são só do CSV) + `fbc`/`fbp` crus; `action_source: "chat"`;
`event_time` em segundos; `order_id` = número do pedido (ou o id se o número faltar). Vários pixels
**iguais** em campanhas diferentes contam como um.

---

## PR 4 — conexão

### `lib/stores/bling-conexoes.ts` (`import "server-only"`)

```ts
export type StatusConexao = "ativa" | "reconectar" | "desconectada";
export type ConexaoBling = {
  tenantId: string; companyId: string | null; companyName: string | null; status: StatusConexao;
  accessTokenEnc: string | null; refreshTokenEnc: string | null; accessExpiresAt: string | null; tokenVersion: number;
  situations: SituacaoBling[]; situationsAt: string | null; saleSituationIds: number[];
  highValue: number | null; metaEnabled: boolean; metaCampaignId: string | null;
  backfillFrom: string | null; backfillUntil: string | null; backfillPage: number; backfillDoneAt: string | null;
  scanCursor: string | null; pausedUntil: string | null; consecutiveFailures: number;
  lastWebhookAt: string | null; lastScanAt: string | null; lastScanChangeAt: string | null; lastSaleAt: string | null;
  lastError: string | null; lastErrorAt: string | null; reconnectAlertedAt: string | null; connectedAt: string;
};
export function lerConexao(tenantId: string): Promise<ConexaoBling | null>;
export function lerConexaoPorEmpresa(companyId: string): Promise<ConexaoBling | null>;
export function listarConexoesParaSincronizar(agora: Date): Promise<Array<{ tenantId: string; historicoPendente: boolean }>>; // ativa, fora da pausa, last_scan_at nulls first
export type DadosDaConexao = { companyId: string; companyName: string | null; accessTokenEnc: string; refreshTokenEnc: string; accessExpiresAt: Date; situations: SituacaoBling[]; connectedBy: string; hoje: string };
/** Nova → insere com padrões (spec §3 Conectar). Existente → troca tokens/empresa, status ativa, token_version+1, zera falhas e alerta, mantém ajustes; reabre histórico só se nunca terminou; sale_situation_ids vazio → padrão. */
export function salvarConexao(tenantId: string, d: DadosDaConexao): Promise<void>;
export function salvarTokensRenovados(tenantId: string, versaoLida: number, t: { accessTokenEnc: string; refreshTokenEnc: string; accessExpiresAt: Date }): Promise<boolean>; // false = outro processo renovou
export function marcarReconectar(tenantId: string, erro: string): Promise<void>;
export function marcarAlertaReconectar(tenantId: string): Promise<boolean>; // true só na 1ª vez (reconnect_alerted_at era nulo)
export type AtualizacaoConexao = Partial<{ /* snake_case dos campos operacionais e de ajuste, tipados */ }>;
export function atualizarConexao(tenantId: string, campos: AtualizacaoConexao): Promise<void>; // sempre updated_at
export function desconectarConexao(tenantId: string): Promise<ConexaoBling | null>; // devolve a anterior (para revogar)
export function pegarTrava(tenantId: string, dono: string, segundos: number): Promise<boolean>; // rpc bling_claim
export function soltarTrava(tenantId: string, dono: string): Promise<void>;                      // rpc bling_release
```
`AtualizacaoConexao` lista explicitamente: `situations, situations_at, sale_situation_ids, high_value,
meta_enabled, meta_campaign_id, backfill_page, backfill_done_at, scan_cursor, paused_until,
consecutive_failures, last_webhook_at, last_scan_at, last_scan_change_at, last_sale_at, last_error,
last_error_at`. Nunca tokens (só por `salvarTokensRenovados`/`salvarConexao`).

### `lib/stores/bling-oauth-states.ts`

```ts
export function criarEstadoOAuth(e: { stateHash: string; tenantId: string; userId: string; expiraEm: Date }): Promise<void>; // apaga antes os vencidos da loja
export function consumirEstadoOAuth(stateHash: string, agora: Date): Promise<{ tenantId: string; userId: string } | null>; // delete … expires_at > agora returning
```

### Rotas

- `POST /api/integracoes/bling/conectar` — spec §3 passo 1. Resposta `200 { url }` + `Set-Cookie`;
  `cache-control: no-store`; sem permissão 403; sem configuração 503 `{ error: "indisponivel" }`.
- `GET /api/integracoes/bling/retorno` — spec §3 passo 2. Sempre termina em `302` para
  `/painel/configuracoes?secao=integracoes&bling=<conectado|recusado|sessao|outra_loja|erro|indisponivel>`
  (URL relativa à origem do request) e apaga o cookie. Confere a membership do `userId` do state na loja do
  state (`memberships` com `accepted_at` não nulo e `role` owner/admin). Troca o código consumindo
  `checkRateLimit("bling:oauth-token", 10, 60_000)` antes (bloqueado → `bling=erro`). `after()` dispara
  `sincronizarLoja(tenant, "conexao", 240_000)` — **no PR 4 ainda não existe o motor**: o PR 4 não dispara
  nada; o PR 5 acrescenta o `after()` nesta rota.
- `DELETE /api/integracoes/bling` — spec §3 Desconectar. 200 `{ ok: true }`; sem conexão 404.
- `request-access-policy.ts`: `GET /api/integracoes/bling/retorno` → `public-rate-limited` (path exato,
  comentário dizendo por quê); `middleware.ts`: `RATE_LIMITS["/api/integracoes/bling/retorno"] = 20`.
- Cookie: nome `bling_oauth_state`, valor = state cru; comparação em tempo constante do sha256 dos dois.

Testes (PostgREST falso + fetch do Bling falso injetado por variável de módulo ou `globalThis.fetch`
trocado no teste): dono recebe a URL com `state` e o cookie; operador/vendedora 403; sem env 503;
retorno feliz grava tokens **cifrados** (o corpo gravado não contém o token) e redireciona `conectado`;
retorno repetido com o mesmo state → `sessao` e **nenhuma** segunda chamada a `/oauth/token`; cookie
ausente/diferente → `sessao` sem chamar o Bling; `?error=access_denied` → `recusado`; empresa já ligada a
outra loja → `outra_loja` e o token novo é revogado; usuário que deixou de ser admin → `sessao`; DELETE
apaga tokens e chama a revogação.

---

## PR 5 — motor

### `lib/stores/bling-pedidos.ts`

```ts
export type LinhaPedidoBling = {
  tenantId: string; blingOrderId: number; numero: string | null; orderDate: string | null; total: number | null;
  situacaoId: number | null; blingContactId: number | null; kind: TipoPedido | null; orderId: string | null;
  origin: "aviso" | "varredura" | "historico"; firstSeenAt: string; saleAt: string | null;
  icStatus: StatusEvento | null; purchaseStatus: StatusEvento | null; metaError: string | null;
  origem: "anuncio" | "grupo" | "sem_origem" | null; origemDetalhe: string | null;
  snapshot: PedidoResumo | null; pending: boolean; attempts: number; nextTryAt: string; lastError: string | null;
};
export type StatusEvento = "enviado" | "fora_da_janela" | "sem_pixel" | "desligado" | "sem_dados" | "erro";
export function enfileirarPedidos(tenantId: string, origem: "aviso", itens: { id: number }[]): Promise<number>;
export function enfileirarPedidos(tenantId: string, origem: "varredura" | "historico", itens: PedidoResumo[]): Promise<number>; // rpc bling_enqueue; dedup por id antes
export function listarPendentes(tenantId: string, agora: Date, limite: number): Promise<LinhaPedidoBling[]>;
export function existePendenteVencido(tenantId: string, agora: Date): Promise<boolean>;
export function contarPendentes(tenantId: string): Promise<number>; // head + count
export type ResultadoProcessamento = { numero; orderDate; total; situacaoId; blingContactId; kind; orderId; saleAt; icStatus; icSentAt; purchaseStatus; purchaseSentAt; metaError; origem; origemDetalhe; snapshot: PedidoResumo | null }; // snapshot = estado usado (o SQL da varredura compara com ele)
export function salvarProcessado(tenantId: string, id: number, r: ResultadoProcessamento, agenda: { pendente: false } | { pendente: true; tentativas: number; proxima: Date; erro: string }): Promise<void>;
export function agendarNovaTentativa(tenantId: string, id: number, tentativas: number, proxima: Date | null, erro: string): Promise<void>; // proxima null → pending false (desistiu)
export function reabrirDesde(tenantId: string, dia: string): Promise<number>; // pending true para order_date >= dia (ajuste mudou)
```

### `lib/stores/bling-contatos.ts`

```ts
export type ContatoGuardado = { blingContactId: number; name: string | null; personType: "F" | "J" | "E" | null; phone: string | null; phoneKey: string | null; metaHashes: HashesMeta; lista: "alto_valor" | "comprador" | "lead" | null; fetchedAt: string };
export function lerContato(tenantId: string, id: number): Promise<ContatoGuardado | null>;
export function salvarContato(tenantId: string, c: { blingContactId: number; name: string | null; personType: "F" | "J" | "E" | null; phone: string | null; metaHashes: HashesMeta }): Promise<ContatoGuardado>; // upsert, fetched_at = now, devolve phone_key gerado
export function recalcularListas(tenantId: string, contato?: number): Promise<number>; // rpc bling_recompute_lists
export function lerContatosPorIds(tenantId: string, ids: number[]): Promise<ContatoGuardado[]>; // para "últimas vendas"
export function paginaDaLista(tenantId: string, lista: "alto_valor" | "comprador" | "lead", depoisDe: number, tamanho: number): Promise<ContatoGuardado[]>; // order by bling_contact_id, id > depoisDe
```

### `lib/stores/site-captures.ts` (+1 função)

```ts
/** Cadastro mais recente da mesma chave até `ate`, nos 90 dias antes. Para fbc/fbp e a origem "anúncio". */
export function ultimoCadastroDaChave(tenantId: string, phoneKey: string, ate: Date): Promise<{ utmCampaign: string | null; utmContent: string | null; fbc: string | null; fbp: string | null } | null>;
```

### `lib/bling/pedido-girumo.ts` — projeção em `orders` (spec §1 "Pedido na Girumo")

```ts
export type LeadDaVenda = SaleLead | null; // de @/lib/stores/vendas
export function projetarPedido(tenantId: string, p: { tipo: TipoPedido; orderId: string | null; total: number; telefone: string | null; saleAt: Date; lead: LeadDaVenda }): Promise<string | null>; // devolve o order_id atual
```
Criação por `recordOrder(tenantId, lead, write)` (`@/lib/orders/registrar`) com `write` inserindo
`{ tenant_id, phone (só dígitos, '' sem telefone), lead_id, group_name: lead?.source_group_name ?? null,
campaign_id, value: total, source: 'bling', created_at: saleAt }`. Atualização e remoção sempre com
`.eq("tenant_id").eq("source", "bling")`. Atualização que não acha a linha → cria de novo.

### `lib/bling/processar-pedido.ts`

```ts
export type ContextoLoja = { tenantId: string; conexao: ConexaoBling; cliente: ClienteBling; deps: DepsBling; agora: () => Date };
/** Processa uma linha da fila. Lança ErroBling (o chamador reagenda). Erro do Meta não lança: vira status + nova tentativa. */
export function processarPedido(ctx: ContextoLoja, linha: LinhaPedidoBling): Promise<{ conexao: ConexaoBling }>; // conexão pode voltar com situações recarregadas
```
Ordem (spec §3 "Processar um pedido"): estado (retrato ou GET) → situação desconhecida e situações com mais
de 1 h → recarrega (`listarSituacoesDeVenda`, falha ignorada) → classifica → contato (cache 24 h ou GET →
`hashesDoCliente` → `salvarContato`) → `lead` (`findLeadByPhones(tenant, variantesDoTelefone(phone))`) →
`projetarPedido` → origem (`ultimoCadastroDaChave` com utm → `anuncio` com detalhe
`utm_campaign · utm_content`; senão lead → `grupo` com o nome do grupo; senão `sem_origem`) → Meta (spec §4:
eventos ainda não `enviado`, exceto `fora_da_janela`, que é final; um envio com os dois eventos;
`test_event_code` da campanha quando houver) → `salvarProcessado` (grava **também** `snapshot` = o
`PedidoResumo` usado, ou `null` se excluído) → **só então** `recalcularListas(contato)` e do contato anterior,
se mudou (a função lê o `kind` gravado; recalcular antes deixaria a lista um pedido atrasada; falha aqui é
logada e não reagenda: a rede de segurança do cron recalcula a loja). Venda → `last_sale_at` da conexão. Erro
do Meta → status `erro` e `agenda` com nova tentativa (mesmos intervalos do Bling).

Páginas (varredura e histórico): ler até página **vazia** (o `listarPedidos` descarta item malformado, então
"menos de 100" não prova o fim). Execução de cron que processou ≥ 1 pedido termina com
`recalcularListas(tenantId)` (loja toda), e o fim do histórico também.

### `lib/bling/sincronizar.ts`

```ts
export type Gatilho = "aviso" | "cron" | "conexao";
export type Resultado = { tenantId: string; trava: boolean; processados: number; falhas: number; varredura: number; historico: number; parou?: "indisponivel" | "inativa" | "reconectar" | "pausa" | "escopo" | "orcamento" | "erros" };
export function sincronizarLoja(tenantId: string, gatilho: Gatilho, orcamentoMs: number, deps?: DepsBling): Promise<Resultado>;
/** Para a rota de cron e o retorno: as três variáveis existem e a chave é válida. */
export function blingDisponivel(env?: NodeJS.ProcessEnv): boolean;
```
Fluxo exato na spec §3 (trava, token, situações, varredura e histórico só em `cron`/`conexao`, drenagem em
lotes de 20 com 5 s de folga no orçamento, disjuntor, solta a trava no `finally`, e depois confere
`existePendenteVencido` e repete no máximo 2 vezes se sobrar orçamento > 10 s). Token: renova quando falta
< 30 min, com `limiteTokenGlobal()` antes; `concessao_invalida` → relê a conexão; `token_version` igual →
`marcarReconectar` + `avisarReconectar`. O cliente HTTP recebe `token` (o vigente) e `renovar` (renovação
forçada uma vez, mesma regra). `escopo` → `last_error` "Falta permissão no app do Bling" e para.
Disjuntor (spec §3 "Cliente HTTP"): 5 falhas `limite`/`transitorio` seguidas → `paused_until = agora +
15 min × 2^(consecutive_failures)`, teto 2 h, `consecutive_failures + 1`; sucesso zera (só grava se > 0).
Mais de 20 erros na execução → para.

### `lib/bling/deps.ts`

```ts
export type DepsBling = {
  agora: () => Date; esperar: (ms: number) => Promise<void>; novoId: () => string; fetchImpl: typeof fetch;
  conexoes: Pick<typeof import("@/lib/stores/bling-conexoes"), "lerConexao" | "salvarTokensRenovados" | "marcarReconectar" | "atualizarConexao" | "pegarTrava" | "soltarTrava">;
  pedidos: Pick<typeof import("@/lib/stores/bling-pedidos"), "enfileirarPedidos" | "listarPendentes" | "existePendenteVencido" | "contarPendentes" | "salvarProcessado" | "agendarNovaTentativa">;
  contatos: Pick<typeof import("@/lib/stores/bling-contatos"), "lerContato" | "salvarContato" | "recalcularListas">;
  leads: { porTelefones: (tenantId: string, telefones: string[]) => Promise<SaleLead | null> };
  cadastros: { ultimoDaChave: typeof import("@/lib/stores/site-captures").ultimoCadastroDaChave };
  campanhas: { comMetadata: (tenantId: string) => Promise<CampanhaComMetadata[]> };
  projetar: typeof import("./pedido-girumo").projetarPedido;
  meta: { enviar: typeof import("@/lib/campaigns/meta-capi").sendCapiEvent };
  oauth: { renovar: typeof import("./oauth").renovarToken; credenciais: () => CredenciaisBling | null };
  cifra: { chave: () => Buffer | null };
  limiteTokenGlobal: () => Promise<boolean>; // true = bloqueado (checkRateLimit("bling:oauth-token", 10, 60_000))
  avisarReconectar: (tenantId: string) => Promise<void>;
};
export function depsDeProducao(): DepsBling;
```

### `lib/bling/avisar-reconectar.ts` + `lib/email/templates.ts`

`blingReconectarEmail(nome, appUrl)` no estilo de `disconnectAlertEmail` (assunto "O Bling desconectou da
Girumo — as vendas pararam de chegar", botão "Reconectar Bling" para
`${appUrl}/painel/configuracoes?secao=integracoes`). `avisarReconectar(tenantId)`: `marcarAlertaReconectar`
→ só na primeira vez busca os donos (`memberships` role owner, `accepted_at` não nulo) e manda com
`sendEmail({ kind: "bling_reconectar", tenantId, … })`. Nunca lança.

Testes do motor (dependências falsas em memória, relógio e esperar falsos): venda nova → `orders` +
Purchase + IC; pedido em aberto → só IC e lista `lead`; venda → cancelada → `orders` removido e lista
recalculada; aviso duplicado → um processamento; 404 → `excluido` e remoção; histórico com 2 páginas e a
3ª vazia → `backfill_done_at`; varredura incompleta não avança o cursor; `concessao_invalida` → reconectar
+ e-mail uma vez; versão do token mudou → segue com o token novo sem marcar reconectar; 429 persistente
5× → pausa e para; trava ocupada → não faz nada; orçamento acaba → solta a trava e deixa o resto pendente;
erro do Meta → status `erro` e nova tentativa agendada; evento com mais de 7 dias → `fora_da_janela` e
não envia; Meta desligado → `desligado`; sem pixel → `sem_pixel`; sem nenhum dado → `sem_dados`.

---

## PR 6 — entrada

- `POST /api/integracoes/bling/webhook` (`runtime nodejs`, `maxDuration = 60`): spec §3 "Aviso". Corpo
  > 64 KB (por `content-length` e pelo tamanho lido) → 413. Assinatura com `BLING_CLIENT_SECRET` (ausente
  → 503, para o Bling tentar de novo quando configurarem). `after(() => sincronizarLoja(tenant, "aviso",
  45_000))`. Erro de banco → 500 (o Bling retenta).
- `GET /api/cron/bling` (`maxDuration = 300`): `isCronAuthorized`; `blingDisponivel()` falso → 200
  `{ ok: true, pulado: "indisponivel" }` **sem tocar no banco**; senão `listarConexoesParaSincronizar` e, em
  sequência, cada loja com `min(restante − 5 s, historicoPendente ? 150 s : 60 s)`, orçamento total 270 s.
  Resposta só com contagens (sem ids de cliente).
- `vercel.json`: `{ "path": "/api/cron/bling", "schedule": "*/5 * * * *" }`.
- `request-access-policy.ts`: `POST /api/integracoes/bling/webhook` em `PROVIDER_WEBHOOKS`;
  `/api/cron/bling` na lista de crons. `middleware.ts`: `RATE_LIMITS["/api/integracoes/bling/webhook"] = 300`.
- Testes: assinatura errada 401 sem tocar no banco; corpo grande 413; evento de outro recurso 200 sem
  enfileirar; empresa desconhecida 200; feliz → enfileira, grava `last_webhook_at`, 200; cron sem secret
  401; cron sem env 200 sem consulta; política: as duas classificações + o teste que garante entrada em
  `RATE_LIMITS` para toda rota `public-rate-limited`/`webhook` (se não existir, criar).

---

## PR 7 — API do cartão e Vendas no servidor

- `lib/bling/cartao.ts`: monta o JSON do `GET` (spec §5) a partir de `lerConexao`, `rpc("bling_resumo")`,
  últimas 8 linhas de `bling_orders` (`kind in (venda, pedido)`, `updated_at desc`) + `lerContatosPorIds`,
  e `opcoesDePixel` das campanhas da loja. Telefone sempre mascarado com a função do PR 3a do funil
  (`@/lib/pages/phone`, a mesma do Site próprio). `tempo_real` pela regra da spec §5.
- `GET/PATCH /api/integracoes/bling` (owner/admin, `settings:connection`): PATCH com zod `.strict()`, pelo
  menos um campo; efeitos colaterais da spec §5 (`reabrirDesde`, `recalcularListas`); devolve `{ ok: true }`.
  Sem conexão → GET `{ disponivel, conexao: null, … }` com 200; PATCH 404.
- `GET /api/integracoes/bling/lista?l=` → CSV (spec §4), `content-disposition: attachment`,
  `cache-control: no-store`; uma linha por pessoa (o contato com `fetched_at` mais recente); páginas de 1000.
- Vendas: `SALE_COLUMNS` + `source`; `VendaDoMes` ganha `origem: "manual" | "bling"`; venda do Bling sai
  `editavel: false`; `VendasDoMes` ganha `blingAtivo: boolean` (conexão `ativa` da loja, uma consulta
  `head`); `PATCH/DELETE /api/vendas/[id]` e `DELETE /api/orders` devolvem **409**
  `{ error: "Venda do Bling: altere no Bling." }` quando `source = 'bling'` (função
  `origemDoPedido(tenantId, id)` em `stores/vendas.ts`).
- Testes: owner vê o cartão sem token no JSON; operador 403; PATCH recusa situação bloqueada, valor ≤ 0,
  campo extra; troca de situações chama `reabrirDesde`; CSV com cabeçalho certo e uma linha por pessoa;
  409 nas três rotas; venda do Bling no mês com `editavel: false` e `origem: "bling"`.

---

## PR 8 — tela

- `bling-painel.tsx` (só desenho, props = JSON do `GET` + callbacks) e `bling.tsx` (estado: carrega,
  conectar → `POST conectar` → `window.location.assign(url)`, salvar ajustes, desconectar com
  `useConfirmacao`, baixar CSV, mensagem do `?bling=` uma vez e limpa a URL). Mesmos componentes e tokens
  do `site-proprio-painel.tsx`. Estados do mockup: não conectado, importando, conectado, ajustes, listas,
  alertas (tempo real parado; reconectar), indisponível. Acessível: `<button>`, `<label>`, `aria-live` nas
  mensagens, números em `font-data tabular-nums`.
- `configuracoes-vitrine.tsx`: `<Bling />` abaixo de `<SiteProprio />` na porta Integrações.
- `minhas-vendas.tsx`: selo "Bling" e, no lugar de "Corrigir"/"Fechada", "Altere no Bling" para
  `origem === "bling"`; "Registrar venda" com o aviso quando `blingAtivo`.
- E2E `e2e/painel-integracao-bling.spec.ts`: dono vê "Conectar Bling" (sem env no CI: estado
  "indisponível" ou "não conectado" — conferir qual o CI tem e afirmar esse); vendedora 403 em
  `GET /api/integracoes/bling`; pedido com `source = 'bling'` criado pela service-role aparece em Vendas com
  o selo e sem "Corrigir", e é apagado no fim.

---

## Entrega (controlador)

1. Por PR: revisor → correções → `verify` local sem build → push → PR → CI verde → merge (ou comandos).
2. DDL do PR 1: blocos para o Igor (dev, depois prod), conferência por SQL de leitura, advisor, baseline
   por `schema_signature()`, merge do PR 1, merge do PR 8.
3. Card `integracao-bling`: `no_ar_nao_verificado` com o último merge; `no_ar_verificado` só com a prova
   da spec §9 (loja piloto conectada, venda real chegando).
4. `kg_insert_text` com a decisão (`decisao-2026-10-13-integracao-bling`).
