import assert from "node:assert/strict";
import { test } from "node:test";
import type { TenantRole } from "@/lib/permissions";
import { decidirPessoas, type NivelPessoas } from "./pessoas-acesso";

const AGORA = Date.parse("2026-11-05T12:00:00Z");
const dias = (n: number) => new Date(AGORA - n * 86_400_000).toISOString();
const ver = (role: TenantRole, nivel: NivelPessoas, enabled = true, disabledAt: string | null = null) => decidirPessoas({ role, enabled, disabledAt, nivel, agoraMs: AGORA });
const codigo = (r: ReturnType<typeof ver>) => (r.ok ? null : r.code);

test("com o add-on ligado: operador lê e edita, mas CSV e apagar são do dono e do admin", () => {
  assert.equal(ver("operator", "ler").ok, true);
  assert.equal(ver("operator", "escrever").ok, true);
  for (const nivel of ["exportar", "apagar"] as const) {
    assert.equal(codigo(ver("operator", nivel)), "forbidden");
    assert.equal(ver("admin", nivel).ok, true);
    assert.equal(ver("owner", nivel).ok, true);
  }
});

test("vendedora não entra em nada", () => {
  for (const nivel of ["ler", "escrever", "exportar", "apagar"] as const) assert.equal(ver("seller", nivel).ok, false);
});

test("loja sem o add-on e sem carimbo: 403 instagram_disabled", () => {
  assert.equal(codigo(ver("owner", "ler", false)), "instagram_disabled");
});

test("cancelado há 10 dias: dono lê e exporta; escrever e apagar dão 403 só leitura; operador fica de fora", () => {
  const lido = ver("owner", "ler", false, dias(10));
  assert.ok(lido.ok && lido.somenteLeitura && lido.podeExportar && !lido.podeApagar);
  assert.equal(lido.ok ? lido.fichasSomemEm : null, new Date(AGORA + 20 * 86_400_000).toISOString());
  assert.equal(ver("admin", "exportar", false, dias(10)).ok, true);
  for (const nivel of ["escrever", "apagar"] as const) assert.equal(codigo(ver("owner", nivel, false, dias(10))), "instagram_read_only");
  assert.equal(codigo(ver("operator", "ler", false, dias(10))), "instagram_disabled");
});

test("cancelado há mais de 30 dias: as fichas já somem, tudo fechado", () => {
  assert.equal(codigo(ver("owner", "exportar", false, dias(31))), "instagram_disabled");
});
