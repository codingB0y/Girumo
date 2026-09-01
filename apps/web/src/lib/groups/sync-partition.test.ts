import assert from "node:assert/strict";
import { partitionByAdmin } from "./sync-partition";

const MEU = "5511999990001";
const OUTRO = "5511999990002";

const admin = (id: string, quem: string) => ({
  id,
  subject: `Grupo ${id}`,
  participants: [{ phoneNumber: quem, admin: "admin" }],
});

const membro = (id: string) => ({
  id,
  subject: `Grupo ${id}`,
  participants: [
    { phoneNumber: MEU, admin: null },
    { phoneNumber: OUTRO, admin: "superadmin" },
  ],
});

// === o caso central: só entra o que administramos ===
{
  const r = partitionByAdmin([admin("a@g.us", MEU), membro("b@g.us"), membro("c@g.us")], MEU);
  assert.deepEqual(r.admin.map((g) => g.id), ["a@g.us"]);
  assert.deepEqual(r.descartar, ["b@g.us", "c@g.us"]);
  assert.equal(r.deteccaoSuspeita, false);
}

// Grupo sem id não vai para lado nenhum: não dá para gravar nem para remover.
{
  const r = partitionByAdmin([{ id: "", subject: "x" }, { id: null, subject: "y" }], MEU);
  assert.deepEqual(r.admin, []);
  assert.deepEqual(r.descartar, []);
  // Sem grupo válido não há detecção a suspeitar — a conta é que está vazia.
  assert.equal(r.deteccaoSuspeita, false);
}

// === o guarda-corpo ===
// Zero admin com grupos existindo é indistinguível de detecção quebrada. Se o
// descarte rodasse aqui, um contrato mudado na Evolution apagaria a base
// inteira do lojista no primeiro sync.
{
  const r = partitionByAdmin([membro("b@g.us"), membro("c@g.us")], MEU);
  assert.deepEqual(r.admin, []);
  assert.deepEqual(r.descartar, [], "não pode propor remoção quando nada foi detectado como admin");
  assert.equal(r.deteccaoSuspeita, true);
}

// Telefone da instância desconhecido cai no mesmo lugar: isAdminGroup devolve
// false para todos, então nada é removido.
{
  const r = partitionByAdmin([admin("a@g.us", MEU)], null);
  assert.deepEqual(r.descartar, []);
  assert.equal(r.deteccaoSuspeita, true);
}

// Lista vazia não é suspeita — é uma conta sem grupos.
{
  const r = partitionByAdmin([], MEU);
  assert.equal(r.deteccaoSuspeita, false);
  assert.deepEqual(r.descartar, []);
}

console.log("sync-partition: ok");
