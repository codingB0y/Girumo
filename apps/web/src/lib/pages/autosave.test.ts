import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

type Coordinator<T> = {
  schedule(value: T): void;
  flush(): Promise<void>;
  runAfterFlush<R>(action: () => Promise<R>): Promise<R>;
  dispose(): void;
};

type CoordinatorFactory = <T>(options: {
  delayMs: number;
  save: (value: T) => Promise<void>;
  scheduleTimer?: (callback: () => void, delayMs: number) => unknown;
  cancelTimer?: (handle: unknown) => void;
}) => Coordinator<T>;

const autosavePath = path.join(process.cwd(), "src", "lib", "pages", "autosave.ts");
const editorPageSource = readFileSync(
  path.join(process.cwd(), "src", "app", "painel", "pages", "[id]", "page.tsx"),
  "utf8",
);

async function factory(): Promise<CoordinatorFactory> {
  assert.equal(existsSync(autosavePath), true, "o coordenador de autosave precisa existir");
  const loadedModule = (await import(pathToFileURL(autosavePath).href)) as {
    createAutosaveCoordinator?: CoordinatorFactory;
  };
  assert.equal(typeof loadedModule.createAutosaveCoordinator, "function");
  return loadedModule.createAutosaveCoordinator as CoordinatorFactory;
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function nextTurn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test("serializa PATCHes e nunca inicia a gravação nova antes da anterior terminar", async () => {
  const first = deferred();
  const calls: string[] = [];
  const coordinator = (await factory())<string>({
    delayMs: 60_000,
    save: async (value) => {
      calls.push(`start:${value}`);
      if (value === "primeiro") await first.promise;
      calls.push(`end:${value}`);
    },
  });

  coordinator.schedule("primeiro");
  const firstFlush = coordinator.flush();
  await nextTurn();
  coordinator.schedule("segundo");
  const secondFlush = coordinator.flush();
  await nextTurn();

  assert.deepEqual(calls, ["start:primeiro"]);
  first.resolve();
  await Promise.all([firstFlush, secondFlush]);
  assert.deepEqual(calls, [
    "start:primeiro",
    "end:primeiro",
    "start:segundo",
    "end:segundo",
  ]);
  coordinator.dispose();
});

test("coalesce alterações concorrentes e persiste somente o estado local mais recente", async () => {
  const first = deferred();
  const saved: string[] = [];
  const coordinator = (await factory())<string>({
    delayMs: 60_000,
    save: async (value) => {
      saved.push(value);
      if (value === "v1") await first.promise;
    },
  });

  coordinator.schedule("v1");
  const flushing = coordinator.flush();
  await nextTurn();
  coordinator.schedule("v2");
  coordinator.schedule("v3");
  first.resolve();
  await flushing;

  assert.deepEqual(saved, ["v1", "v3"]);
  coordinator.dispose();
});

test("ação de status cancela o debounce, drena o estado mais recente e roda em exclusão", async () => {
  const saveGate = deferred();
  const order: string[] = [];
  let timerCallback: (() => void) | undefined;
  let timerCancelled = false;
  const coordinator = (await factory())<string>({
    delayMs: 1_200,
    save: async (value) => {
      order.push(`save:start:${value}`);
      await saveGate.promise;
      order.push(`save:end:${value}`);
    },
    scheduleTimer: (callback) => {
      timerCallback = callback;
      return "debounce";
    },
    cancelTimer: (handle) => {
      assert.equal(handle, "debounce");
      timerCancelled = true;
    },
  });

  coordinator.schedule("conteúdo mais novo");
  const status = coordinator.runAfterFlush(async () => {
    order.push("status");
    return "published";
  });
  await nextTurn();

  assert.equal(timerCancelled, true);
  assert.deepEqual(order, ["save:start:conteúdo mais novo"]);
  saveGate.resolve();
  assert.equal(await status, "published");
  assert.deepEqual(order, [
    "save:start:conteúdo mais novo",
    "save:end:conteúdo mais novo",
    "status",
  ]);

  timerCallback?.();
  await nextTurn();
  assert.equal(order.filter((item) => item.startsWith("save:start")).length, 1);
  coordinator.dispose();
});

test("o editor usa o coordenador e não recarrega o servidor após publish/pause", () => {
  assert.match(editorPageSource, /createAutosaveCoordinator/);
  assert.match(
    editorPageSource,
    /latestValuesV2Ref\.current = next;\s*autosaveRef\.current\?\.schedule\(next\)/,
  );
  assert.match(editorPageSource, /autosaveRef\.current\?\.schedule\(next\)/);
  assert.match(
    editorPageSource,
    /async function changeStatus[\s\S]*runAfterFlush\(\(\) => requestStatus\(status\)\)/,
  );
  assert.doesNotMatch(
    editorPageSource,
    /async function changeStatus[\s\S]{0,1800}await load\(\)/,
  );
  assert.doesNotMatch(editorPageSource, /setTimeout\(\(\) => void saveV2\(valuesV2\)/);
  assert.doesNotMatch(
    editorPageSource,
    /setValuesV2\(\(current\)[\s\S]{0,300}autosaveRef\.current\?\.schedule/,
  );
});
