import { test } from "node:test";
import assert from "node:assert/strict";
import { startLoop } from "./loop.js";

test("startLoop não reentra: um tick lento não sobrepõe o próximo", async () => {
  let running = 0;
  let maxConcurrent = 0;
  let ticks = 0;
  let stopping = false;
  const loop = startLoop({
    name: "t",
    intervalMs: 5,
    isStopping: () => stopping,
    onError: () => undefined,
    async tick() {
      running += 1;
      maxConcurrent = Math.max(maxConcurrent, running);
      ticks += 1;
      await new Promise((r) => setTimeout(r, 20));
      running -= 1;
      if (ticks >= 3) stopping = true;
    },
  });
  await loop.done;
  assert.equal(maxConcurrent, 1);
  assert.equal(ticks, 3);
});

test("startLoop isola erro do tick e continua", async () => {
  let ticks = 0;
  let stopping = false;
  const errors: unknown[] = [];
  const loop = startLoop({
    name: "t",
    intervalMs: 1,
    isStopping: () => stopping,
    onError: (e) => errors.push(e),
    async tick() {
      ticks += 1;
      if (ticks === 1) throw new Error("boom");
      if (ticks >= 2) stopping = true;
    },
  });
  await loop.done;
  assert.equal(errors.length, 1);
  assert.equal(ticks, 2);
});
