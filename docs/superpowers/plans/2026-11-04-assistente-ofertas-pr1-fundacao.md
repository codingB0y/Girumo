# Assistente de ofertas: PR 1, fundação (plano)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** instalar o LangChain fixado e deixar pronto o que todo agente do Girumo vai usar: a config de execução que
carrega o tenant (e só ela carrega), a fábrica do modelo e um modelo de mentira para teste. Nenhuma rota, nenhuma tela.

**Índice:** `docs/superpowers/plans/2026-11-04-assistente-ofertas-00-indice.md` (decisões 4, 8 e "Versões fixadas").

**Arquivos (6):**
- `apps/web/package.json` e `package-lock.json`: dependências
- `apps/web/src/lib/agents/llm/run-config.ts` e `run-config.test.ts`
- `apps/web/src/lib/agents/llm/model.ts` e `model.test.ts`
- `apps/web/src/test/scripted-chat-model.ts`

## Global Constraints

- Versões exatas: `langchain@1.5.18`, `@langchain/core@1.2.18`, `@langchain/anthropic@1.5.12`. Sem `^`.
- Nenhum teste faz chamada de rede. A chave de teste é `"chave-de-teste"`: um texto com cara de `sk-ant-…` dispara o
  scan de secrets.
- `run-config.ts` não importa nada do LangChain. Ele aceita qualquer objeto com `configurable`, para não depender da
  tipagem de `config` entre versões.

## Task 0: preparar

- [ ] `git fetch origin main && git log HEAD..origin/main --oneline | wc -l`, worktree novo a partir de `origin/main`,
  branch `feat/assistente-ofertas-fundacao`.
- [ ] Criar o card `assistente-ofertas` em prod como `em_construcao`, com `blocker` = "série em construção: PR 1 de 5"
  (ver a spec do quadro sobre como criar card; o `move_card` exige motivo).

## Task 1: dependências

- [ ] Em `apps/web`: `npm i -E langchain@1.5.18 @langchain/core@1.2.18 @langchain/anthropic@1.5.12`.
- [ ] Conferir `npm ls @langchain/core` dentro de `apps/web`: **uma** versão só (todas `deduped`). Duas cópias do
  core quebram o `instanceof` entre pacotes.
- [ ] Conferir que o `zod` continua o mesmo do app (`^4.4.3`). O `langchain` aceita `^3.25.76 || ^4`.

## Task 2: modelo de mentira para teste

- [ ] Criar `apps/web/src/test/scripted-chat-model.ts`:

```ts
import { BaseChatModel, type BindToolsInput } from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";

/**
 * Chat model for tests: answers with the queued messages, in order, and records what it saw.
 * No network, no API key. `bindTools` only records the tool names (the agent still runs them).
 */
export class ScriptedChatModel extends BaseChatModel {
  readonly seen: BaseMessage[][] = [];
  boundTools: string[] = [];
  private readonly queue: AIMessage[];

  constructor(queue: AIMessage[]) {
    super({});
    this.queue = [...queue];
  }

  _llmType(): string {
    return "scripted";
  }

  // The agent calls bindTools before every turn; returning `this` keeps the queue shared.
  override bindTools(tools: BindToolsInput[]): this {
    this.boundTools = tools.map((t) => ("name" in t && typeof t.name === "string" ? t.name : "?"));
    return this;
  }

  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    this.seen.push(messages);
    const message = this.queue.shift() ?? new AIMessage("(script ended)");
    return { generations: [{ message, text: typeof message.content === "string" ? message.content : "" }] };
  }
}

/** An assistant turn that calls one tool. */
export function callTool(name: string, args: Record<string, unknown>, id = `call-${name}`): AIMessage {
  return new AIMessage({ content: "", tool_calls: [{ id, name, args, type: "tool_call" }] });
}
```

## Task 3: config da execução (o tenant mora aqui)

- [ ] Teste primeiro, `apps/web/src/lib/agents/llm/run-config.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { createAgent, tool } from "langchain";
import * as z from "zod";

import { callTool, ScriptedChatModel } from "@/test/scripted-chat-model";
import { buildRunConfig, RECURSION_LIMIT, tenantFromConfig } from "./run-config";

const LOJA = "11111111-1111-4111-8111-111111111111";
const OUTRA = "22222222-2222-4222-8222-222222222222";

function probeTool(seen: string[]) {
  return tool(
    async (_input, config) => {
      seen.push(tenantFromConfig(config));
      return "ok";
    },
    {
      name: "sonda",
      description: "test tool",
      schema: z.object({ tenantId: z.string().optional() }),
    },
  );
}

test("the tool reads the tenant from the run config, not from what the model wrote", async () => {
  const seen: string[] = [];
  const model = new ScriptedChatModel([callTool("sonda", { tenantId: OUTRA }), callTool("sonda", {}, "c2")]);
  const agent = createAgent({ model, tools: [probeTool(seen)] });
  await agent.invoke({ messages: [{ role: "user", content: "oi" }] }, buildRunConfig(LOJA));
  assert.deepEqual(seen, [LOJA, LOJA]);
});

test("a run without tenant fails inside the tool instead of reading someone's data", () => {
  assert.throws(() => tenantFromConfig(undefined), /tenantId/);
  assert.throws(() => tenantFromConfig({ configurable: { tenantId: "x" } }), /tenantId/);
  assert.throws(() => buildRunConfig("not-a-uuid"), /uuid/);
});

test("extra configurable keys cannot overwrite the tenant", () => {
  const cfg = buildRunConfig(LOJA, { tenantId: OUTRA });
  assert.equal(cfg.configurable.tenantId, LOJA);
});

test("an agent that never stops is cut at RECURSION_LIMIT", async () => {
  const loop = Array.from({ length: 50 }, (_, i) => callTool("sonda", {}, `l${i}`));
  const model = new ScriptedChatModel(loop);
  const agent = createAgent({ model, tools: [probeTool([])] });
  await assert.rejects(
    agent.invoke({ messages: [{ role: "user", content: "x" }] }, buildRunConfig(LOJA)),
    (e: Error) => e.name === "GraphRecursionError",
  );
  assert.ok(model.seen.length <= RECURSION_LIMIT);
});
```

- [ ] Rodar e ver falhar (módulo não existe).
- [ ] Criar `apps/web/src/lib/agents/llm/run-config.ts`:

```ts
import "server-only";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Hard cap on model+tool steps per run: a looping agent costs money, this is the ceiling. */
export const RECURSION_LIMIT = 16;
/** Below the route's maxDuration (60 s) so the route can still answer. */
export const RUN_TIMEOUT_MS = 50_000;

type WithConfigurable = { configurable?: Record<string, unknown> } | undefined;

/**
 * The tenant of this run. It comes ONLY from the server-built run config — never from
 * tool arguments, which the model writes and a prompt injection can steer.
 */
export function tenantFromConfig(config: WithConfigurable): string {
  const id = config?.configurable?.tenantId;
  if (typeof id !== "string" || !UUID.test(id)) {
    throw new Error("agent run without a valid tenantId in config.configurable");
  }
  return id;
}

/** Run config every agent invocation must use. `extra` goes into `configurable`. */
export function buildRunConfig(tenantId: string, extra: Record<string, unknown> = {}) {
  if (!UUID.test(tenantId)) throw new Error("buildRunConfig: tenantId is not a uuid");
  return {
    configurable: { ...extra, tenantId },
    recursionLimit: RECURSION_LIMIT,
    signal: AbortSignal.timeout(RUN_TIMEOUT_MS),
  };
}
```

- [ ] Rodar e ver passar (4 testes). O teste "nunca para" prova que o `recursionLimit` corta com `GraphRecursionError`.
  O PR 3 traduz esse erro para 422.

## Task 4: fábrica do modelo

- [ ] Teste, `apps/web/src/lib/agents/llm/model.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { ChatAnthropic } from "@langchain/anthropic";

import { ASSISTANT_MODEL, createAssistantModel } from "./model";

test("without ANTHROPIC_API_KEY there is no model (route answers 503)", () => {
  assert.equal(createAssistantModel({}), null);
});

test("with a key it builds the pinned Claude model, without calling the network", () => {
  const model = createAssistantModel({ ANTHROPIC_API_KEY: "chave-de-teste" });
  assert.ok(model instanceof ChatAnthropic);
  assert.equal((model as ChatAnthropic).model, ASSISTANT_MODEL);
});
```

- [ ] Criar `apps/web/src/lib/agents/llm/model.ts`:

```ts
import "server-only";

import { ChatAnthropic } from "@langchain/anthropic";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

/** The model of the offers assistant. PR 5 measures whether Haiku 5.5 is enough. */
export const ASSISTANT_MODEL = "claude-sonnet-5-5";

/** null = no key in this environment; the caller answers 503 instead of crashing. */
export function createAssistantModel(env: Record<string, string | undefined> = process.env): BaseChatModel | null {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new ChatAnthropic({ model: ASSISTANT_MODEL, apiKey, maxTokens: 4096, maxRetries: 1 });
}
```

- [ ] Sem `temperature`: deixar o padrão do modelo. Sem `apiKey` → `null`, nunca `throw` (o copy-agent faz o mesmo
  com o fallback dele).

## Task 5: gate e PR

- [ ] Os dois `tsc`, `npm test`, build. O build ainda não inclui o LangChain (nenhuma rota importa). O teste de
  empacotamento é no PR 3.
- [ ] Commit `feat(agents): langchain foundation — run config carries the tenant, scripted model for tests`.
- [ ] PR com corpo curto: "Fundação do assistente de ofertas, sem rota nem tela. Ver plano PR 1."
- [ ] CI verde → merge → apagar branch → `blocker` do card: "PR 1 em main; falta PR 2 (leitura)".

## Interface com os outros PRs

- `tenantFromConfig(config)`: toda ferramenta chama na primeira linha.
- `buildRunConfig(tenantId, extra)`: todo `agent.invoke` usa. `extra` vai para `configurable` e **não** sobrescreve o
  tenant.
- `RECURSION_LIMIT = 16`, `RUN_TIMEOUT_MS = 50_000` (abaixo do `maxDuration = 60` da rota do PR 3).
- `ScriptedChatModel` + `callTool(name, args, id)`: o único jeito de testar agente.
