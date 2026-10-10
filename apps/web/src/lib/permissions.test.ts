import assert from "node:assert/strict";
import { test } from "node:test";

import { hasPermission, parseInviteRole, type Action, type TenantRole } from "./permissions";

/** Exaustivo pelo tipo: ação nova que não entrar aqui não compila (tsc). */
const ACOES: Record<Action, true> = {
  "billing:manage": true,
  "billing:view": true,
  "team:invite": true,
  "team:remove": true,
  "campaign:delete": true,
  "campaign:create": true,
  "campaign:edit": true,
  "settings:connection": true,
  "settings:account": true,
  "account:delete": true,
  "message:send": true,
};

test("a vendedora só tem message:send na matriz", () => {
  for (const acao of Object.keys(ACOES) as Action[]) {
    assert.equal(hasPermission("seller", acao), acao === "message:send", acao);
  }
});

test("message:send vale para os quatro papéis; editar campanha continua sem a vendedora", () => {
  for (const papel of ["owner", "admin", "operator", "seller"] as TenantRole[]) {
    assert.equal(hasPermission(papel, "message:send"), true, papel);
  }
  assert.equal(hasPermission("operator", "campaign:edit"), true);
  assert.equal(hasPermission("seller", "campaign:edit"), false);
});

test("convite aceita admin e operator, sem ligar pra caixa e espaço", () => {
  assert.equal(parseInviteRole("admin"), "admin");
  assert.equal(parseInviteRole(" Operator "), "operator");
});

test("convite recusa owner, seller (o PR 6 libera), vazio e lixo — nada vira operator calado", () => {
  for (const lixo of ["owner", "seller", "", "gerente", null, undefined, 1, ["admin"]]) {
    assert.equal(parseInviteRole(lixo), null, JSON.stringify(lixo) ?? "undefined");
  }
});
