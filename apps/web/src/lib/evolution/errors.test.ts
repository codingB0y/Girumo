import assert from "node:assert/strict";
import { EvolutionError, FETCH_GROUPS_TIMEOUT_MS, isEvolutionTimeout } from "./errors";

// O fetch de grupos TEM que desistir antes da função morrer. A rota que o chama
// roda com `maxDuration = 60` (teto do plano); com os dois iguais, a Vercel
// matava a função antes de o fetch estourar e o lojista via um 504 mudo, sem
// nada gravado em `logs`. Este teste é o que impede alguém devolver o número
// para 60_000 sem perceber o que isso reintroduz.
assert.ok(
  FETCH_GROUPS_TIMEOUT_MS <= 50_000,
  "o timeout do fetch precisa deixar folga dentro do maxDuration de 60s da rota",
);

// Timeout: é o caso de "tente de novo", e a mensagem ao lojista depende disso.
assert.equal(isEvolutionTimeout(new EvolutionError("/group/fetchAllGroups/x", 0, "TimeoutError")), true);

// Rede caída também não chega na Evolution (status 0), mas NÃO é tempo — dizer
// "demorou demais" quando o host não resolve manda o lojista esperar por nada.
assert.equal(isEvolutionTimeout(new EvolutionError("/group/fetchAllGroups/x", 0, "TypeError")), false);
assert.equal(isEvolutionTimeout(new EvolutionError("/group/fetchAllGroups/x", 0)), false);

// A Evolution respondendo erro é o oposto de timeout: ela respondeu, e rápido.
assert.equal(isEvolutionTimeout(new EvolutionError("/group/fetchAllGroups/x", 500, "boom")), false);
assert.equal(isEvolutionTimeout(new EvolutionError("/group/fetchAllGroups/x", 404, "TimeoutError")), false);

// Erro que não é da Evolution não pode ser classificado como timeout dela.
assert.equal(isEvolutionTimeout(new Error("TimeoutError")), false);
assert.equal(isEvolutionTimeout({ status: 0, detail: "TimeoutError" }), false);
assert.equal(isEvolutionTimeout(null), false);
assert.equal(isEvolutionTimeout(undefined), false);
