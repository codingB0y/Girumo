import assert from "node:assert/strict";
import {
  adminCountDelta,
  protectionOf,
  summarizeProtection,
  tallyAdmins,
  type ParticipantLike,
} from "./admin-protection";

const CONTADO = "2026-08-29T12:00:00.000Z";
const MEU = "5511999990001";
const SEGUNDO = "5511999990002";

// === protectionOf ===

// Sem contagem não afirmamos nada — nem que está protegido, nem que está em
// risco. Este é o caso dos grupos que já existiam quando a coluna nasceu: com
// default 0, tratá-los como medidos acusaria risco em todos eles.
assert.equal(protectionOf({ admins_counted_at: null, admins_total: 0, admins_ours: 0 }), "nao_medido");
assert.equal(protectionOf({ admins_counted_at: undefined, admins_total: 5 }), "nao_medido");

// Um único admin no grupo é exatamente o caso que perde a lista.
assert.equal(
  protectionOf({ admins_counted_at: CONTADO, admins_total: 1, admins_ours: 1 }),
  "sem_backup",
);

// Nenhum admin detectado termina no mesmo lugar prático que "só eu administro".
assert.equal(
  protectionOf({ admins_counted_at: CONTADO, admins_total: 0, admins_ours: 0 }),
  "sem_backup",
);

// Dois admins, um nosso: existe um humano que segura o grupo se o número cair.
assert.equal(
  protectionOf({ admins_counted_at: CONTADO, admins_total: 2, admins_ours: 1 }),
  "backup_humano",
);

// Dois números nossos = redundância própria (o R1 completo, quando houver 2ª
// instância). A regra já distingue para não precisar mudar depois.
assert.equal(
  protectionOf({ admins_counted_at: CONTADO, admins_total: 2, admins_ours: 2 }),
  "backup_proprio",
);
assert.equal(
  protectionOf({ admins_counted_at: CONTADO, admins_total: 4, admins_ours: 3 }),
  "backup_proprio",
);

// Estado impossível vindo de delta fora de ordem (ours > total) não pode virar
// "protegido": o total manda.
assert.equal(
  protectionOf({ admins_counted_at: CONTADO, admins_total: 1, admins_ours: 9 }),
  "sem_backup",
);

// Negativo é saneado, não propagado.
assert.equal(
  protectionOf({ admins_counted_at: CONTADO, admins_total: -3, admins_ours: -1 }),
  "sem_backup",
);

// === summarizeProtection ===

const grupos = [
  // Administrado e sozinho: entra no risco.
  { id: "g1", name: "VIP Atacado 01", members: 900, is_admin: true, admins_total: 1, admins_ours: 1, admins_counted_at: CONTADO },
  { id: "g2", name: "VIP Atacado 02", members: 250, is_admin: true, admins_total: 1, admins_ours: 1, admins_counted_at: CONTADO },
  // Administrado e protegido por um humano.
  { id: "g3", name: "VIP Atacado 03", members: 700, is_admin: true, admins_total: 3, admins_ours: 1, admins_counted_at: CONTADO },
  // Administrado mas nunca contado.
  { id: "g4", name: "VIP Atacado 04", members: 400, is_admin: true, admins_total: 0, admins_ours: 0, admins_counted_at: null },
  // NÃO administrado: a pergunta não se aplica, mesmo com 1 admin só.
  { id: "g5", name: "Grupo de terceiro", members: 5000, is_admin: false, admins_total: 1, admins_ours: 0, admins_counted_at: CONTADO },
];

{
  const s = summarizeProtection(grupos);
  assert.equal(s.administrados, 4, "grupo de terceiro não entra na conta");
  assert.equal(s.medidos, 3);
  assert.equal(s.semBackup, 2);
  assert.equal(s.comBackup, 1);
  assert.equal(s.naoMedidos, 1);
  // 900 + 250 — e NÃO os 5000 do grupo que não administramos.
  assert.equal(s.membrosEmRisco, 1150);
  // Maior primeiro: é por onde o lojista começa a resolver.
  assert.deepEqual(s.emRisco.map((g) => g.id), ["g1", "g2"]);
}

// Grupo sem nome não vira string vazia na tela.
assert.equal(
  summarizeProtection([
    { id: "g9", name: "   ", members: 10, is_admin: true, admins_total: 1, admins_ours: 1, admins_counted_at: CONTADO },
  ]).emRisco[0].name,
  "Grupo sem nome",
);

// O limite corta a LISTA, nunca a contagem: o resumo continua dizendo a verdade
// sobre quantos grupos e quantas pessoas estão em risco.
{
  const muitos = Array.from({ length: 25 }, (_, i) => ({
    id: `x${i}`,
    name: `Grupo ${i}`,
    members: 100,
    is_admin: true,
    admins_total: 1,
    admins_ours: 1,
    admins_counted_at: CONTADO,
  }));
  const s = summarizeProtection(muitos, 10);
  assert.equal(s.emRisco.length, 10);
  assert.equal(s.semBackup, 25);
  assert.equal(s.membrosEmRisco, 2500);
}

// Conta sem nenhum grupo administrado não é conta em risco.
{
  const s = summarizeProtection([]);
  assert.equal(s.administrados, 0);
  assert.equal(s.semBackup, 0);
  assert.equal(s.membrosEmRisco, 0);
}

// === tallyAdmins ===

const participantes: ParticipantLike[] = [
  { id: `${MEU}@s.whatsapp.net`, phoneNumber: MEU, admin: "superadmin" },
  { id: "88817263548@lid", phoneNumber: "5511988887777", admin: "admin" },
  { id: "99912345678@lid", phoneNumber: "5511977776666", admin: null },
  { id: "11122233344@lid", phoneNumber: "5511966665555" },
];

{
  const t = tallyAdmins(participantes, [MEU]);
  assert.equal(t.total, 2, "só admin/superadmin contam");
  assert.equal(t.ours, 1);
}

// Nosso número casa pelo `phoneNumber` mesmo quando o `id` é um @lid opaco —
// que é o caso normal no WhatsApp moderno e a razão de admin-group.ts não
// confiar no id.
assert.equal(
  tallyAdmins([{ id: "5566778899@lid", phoneNumber: MEU, admin: "admin" }], [MEU]).ours,
  1,
);

// E casa pelo `id` quando ele é um JID de telefone e o phoneNumber não veio.
assert.equal(
  tallyAdmins([{ id: `${MEU}@s.whatsapp.net`, admin: "admin" }], [MEU]).ours,
  1,
);

// Telefone nosso formatado com máscara ainda casa com o JID cru.
assert.equal(
  tallyAdmins([{ id: `${MEU}@s.whatsapp.net`, admin: "admin" }], ["+55 (11) 99999-0001"]).ours,
  1,
);

// Sem telefone conhecido, nada é "nosso" — mas o total continua certo.
{
  const t = tallyAdmins(participantes, [null, undefined, ""]);
  assert.equal(t.total, 2);
  assert.equal(t.ours, 0);
}

// Duas instâncias nossas administrando: é o que o R1 completo produz.
assert.deepEqual(
  tallyAdmins(
    [
      { id: `${MEU}@s.whatsapp.net`, phoneNumber: MEU, admin: "superadmin" },
      { id: `${SEGUNDO}@s.whatsapp.net`, phoneNumber: SEGUNDO, admin: "admin" },
    ],
    [MEU, SEGUNDO],
  ),
  { total: 2, ours: 2 },
);

assert.deepEqual(tallyAdmins(null, [MEU]), { total: 0, ours: 0 });

// === adminCountDelta ===

// Promoção de um humano: o grupo ganha backup sem ganhar número nosso.
assert.deepEqual(
  adminCountDelta("promote", [{ id: "77@lid", phoneNumber: "5511955554444" }], [MEU]),
  { total: 1, ours: 0 },
);

// Promoção do NOSSO número conta nos dois.
assert.deepEqual(
  adminCountDelta("promote", [{ id: `${MEU}@s.whatsapp.net`, phoneNumber: MEU }], [MEU]),
  { total: 1, ours: 1 },
);

// Rebaixar o nosso número: perdemos a administração, e a contagem precisa cair
// nos dois — senão a tela seguiria dizendo que o grupo está protegido por nós.
assert.deepEqual(
  adminCountDelta("demote", [{ id: `${MEU}@s.whatsapp.net`, phoneNumber: MEU }], [MEU]),
  { total: -1, ours: -1 },
);

// Sair um MEMBRO comum não mexe em contagem de admin. Este é o evento mais
// frequente do produto: tratá-lo como saída de admin inventaria risco em todo
// grupo VIP toda vez que alguém desiste.
assert.deepEqual(
  adminCountDelta("remove", [{ id: "77@lid", phoneNumber: "5511955554444" }], [MEU]),
  { total: 0, ours: 0 },
);

// Sair um admin marcado como tal no payload conta.
assert.deepEqual(
  adminCountDelta("remove", [{ id: "77@lid", phoneNumber: "5511955554444", admin: "admin" }], [MEU]),
  { total: -1, ours: 0 },
);

// Removeram o nosso número da administração.
assert.deepEqual(
  adminCountDelta("remove", [{ id: `${MEU}@s.whatsapp.net`, phoneNumber: MEU, admin: "superadmin" }], [MEU]),
  { total: -1, ours: -1 },
);

// Entrar em grupo nunca é virar admin.
assert.deepEqual(
  adminCountDelta("add", [{ id: `${MEU}@s.whatsapp.net`, phoneNumber: MEU, admin: "admin" }], [MEU]),
  { total: 0, ours: 0 },
);

// Ação desconhecida (versão futura da Evolution) não pode mexer no estado.
assert.deepEqual(adminCountDelta("modify", [{ id: "77@lid" }], [MEU]), { total: 0, ours: 0 });
assert.deepEqual(adminCountDelta("", [{ id: "77@lid" }], [MEU]), { total: 0, ours: 0 });

// Ação em caixa alta é a mesma ação.
assert.deepEqual(
  adminCountDelta("PROMOTE", [{ id: "77@lid", phoneNumber: "5511955554444" }], [MEU]),
  { total: 1, ours: 0 },
);

// Participante repetido no mesmo payload conta uma vez só — dois +1 pelo mesmo
// admin deixariam o grupo permanentemente "protegido" por alguém que não existe.
assert.deepEqual(
  adminCountDelta(
    "promote",
    [
      { id: "77@lid", phoneNumber: "5511955554444" },
      { id: "77@lid", phoneNumber: "5511955554444" },
    ],
    [MEU],
  ),
  { total: 1, ours: 0 },
);

// Vários promovidos de uma vez.
assert.deepEqual(
  adminCountDelta(
    "promote",
    [
      { id: "77@lid", phoneNumber: "5511955554444" },
      { id: "88@lid", phoneNumber: "5511944443333" },
    ],
    [MEU],
  ),
  { total: 2, ours: 0 },
);

assert.deepEqual(adminCountDelta("promote", null, [MEU]), { total: 0, ours: 0 });

// Dois `promote` do MESMO participante em eventos SEPARADOS somam duas vezes: o
// delta não conhece o estado anterior, e cada evento é novo para o receiver. O
// WhatsApp não emite promote para quem já é admin, então isto não acontece em
// operação real — mas fixa por que o sync precisa ser a fonte da verdade, e não
// um detalhe de implementação. (A dedupe testada acima cobre só o payload único.)
{
  const mesmo = [{ id: "77@lid", phoneNumber: "5511955554444" }];
  const a = adminCountDelta("promote", mesmo, [MEU]);
  const b = adminCountDelta("promote", mesmo, [MEU]);
  assert.equal(a.total + b.total, 2);
}
