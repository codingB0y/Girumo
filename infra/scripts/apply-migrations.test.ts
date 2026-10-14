import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CAMINHO_ORDEM,
  aplicar,
  lerOrdem,
  pendentes,
  sqlRegistrar,
  type Opcoes,
} from "./apply-migrations.ts";

/** Banco falso: guarda o registro e o SQL recebido, falha no arquivo marcado. */
function bancoFalso(registro: string[] | null, falharEm?: string) {
  const executado: string[] = [];
  let tabela = registro === null ? null : new Set(registro);
  const consultar: Opcoes["consultar"] = async (sql) => {
    executado.push(sql);
    if (sql.includes("to_regclass")) return [{ existe: tabela !== null }];
    if (sql.includes("create table if not exists ops.applied_migrations")) tabela = new Set();
    if (sql.startsWith("select filename")) return [...(tabela ?? [])].map((filename) => ({ filename }));
    if (sql.startsWith("insert into ops.applied_migrations")) {
      for (const m of sql.matchAll(/\('([^']+)'\)/g)) tabela?.add(m[1]);
    }
    if (falharEm && sql === `SQL de ${falharEm}`) throw new Error("syntax error");
    return [];
  };
  return { consultar, executado, registro: () => [...(tabela ?? [])] };
}

function opcoes(consultar: Opcoes["consultar"], extra: Partial<Opcoes> = {}): Opcoes {
  return {
    consultar,
    ordem: ["a.sql", "b.sql", "c.sql"],
    semente: null,
    lerArquivo: async (f) => `SQL de ${f}`,
    simular: false,
    log: () => {},
    ...extra,
  };
}

test("lerOrdem ignora comentario, linha vazia e CRLF", () => {
  assert.deepEqual(lerOrdem("# x\r\n\r\na/b.sql\r\n  # y\nc.sql\n"), ["a/b.sql", "c.sql"]);
});

test("lerOrdem recusa entrada que sairia do repo ou quebraria o SQL", () => {
  assert.throws(() => lerOrdem("../fora.sql"));
  assert.throws(() => lerOrdem("x'; drop table t; --.sql"));
});

test("a ordem real do repo e valida e aponta para arquivos existentes", () => {
  const ordem = lerOrdem(readFileSync(CAMINHO_ORDEM, "utf8"));
  assert.ok(ordem.length > 100);
  for (const f of ordem) readFileSync(new URL(`../../${f}`, import.meta.url));
});

test("pendentes preserva a ordem do arquivo", () => {
  assert.deepEqual(pendentes(["a", "b", "c"], ["b"]), ["a", "c"]);
});

test("sqlRegistrar escapa aspas", () => {
  assert.match(sqlRegistrar(["o'k.sql"]), /\('o''k\.sql'\)/);
});

test("aplica so o pendente, na ordem, e registra cada um", async () => {
  const db = bancoFalso(["a.sql"]);
  assert.deepEqual(await aplicar(opcoes(db.consultar)), ["b.sql", "c.sql"]);
  assert.deepEqual(db.registro().sort(), ["a.sql", "b.sql", "c.sql"]);
  assert.ok(db.executado.indexOf("SQL de b.sql") < db.executado.indexOf("SQL de c.sql"));
});

test("banco sem registro e sem semente: recusa em vez de reaplicar tudo", async () => {
  const db = bancoFalso(null);
  await assert.rejects(aplicar(opcoes(db.consultar)), /sem --seed-from/);
  assert.ok(!db.executado.some((s) => s.startsWith("SQL de")));
});

test("bootstrap: semente vira aplicada e so o novo roda", async () => {
  const db = bancoFalso(null);
  const feitos = await aplicar(opcoes(db.consultar, { semente: ["a.sql", "b.sql"] }));
  assert.deepEqual(feitos, ["c.sql"]);
  assert.deepEqual(db.registro().sort(), ["a.sql", "b.sql", "c.sql"]);
});

test("falha no meio para e nao registra o que falhou", async () => {
  const db = bancoFalso([], "b.sql");
  await assert.rejects(aplicar(opcoes(db.consultar)), /Falhou em b\.sql/);
  assert.deepEqual(db.registro(), ["a.sql"]);
  assert.ok(!db.executado.includes("SQL de c.sql"));
});

test("simulacao nao escreve nada", async () => {
  const db = bancoFalso(null);
  const feitos = await aplicar(opcoes(db.consultar, { semente: ["a.sql"], simular: true }));
  assert.deepEqual(feitos, ["b.sql", "c.sql"]);
  assert.deepEqual(db.executado.length, 1);
});
