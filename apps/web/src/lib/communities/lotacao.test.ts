import assert from "node:assert/strict";
import { test } from "node:test";

import { AVISO_A_PARTIR_DE, avisoDaComunidade, comunidadesLotando, TETO_DA_COMUNIDADE, type GrupoLido } from "./lotacao";

const grupo = (over: Partial<GrupoLido> & Pick<GrupoLido, "whatsapp_group_id">): GrupoLido => ({
  name: over.whatsapp_group_id,
  members: 100,
  community_jid: null,
  community_role: null,
  ...over,
});

const comunidade = (jid: string, nome: string, pessoasNoAvisos: number, comPai = true): GrupoLido[] => [
  ...(comPai ? [grupo({ whatsapp_group_id: jid, name: nome, members: 2, community_jid: jid, community_role: "parent" })] : []),
  grupo({ whatsapp_group_id: `${jid}-av`, name: "Avisos", members: pessoasNoAvisos, community_jid: jid, community_role: "announce" }),
  grupo({ whatsapp_group_id: `${jid}-1`, members: 900, community_jid: jid, community_role: "member" }),
  grupo({ whatsapp_group_id: `${jid}-2`, members: 950, community_jid: jid, community_role: "member" }),
];

test("só a comunidade a partir de 1.800 pessoas no Avisos entra, com o nome do pai e a maior primeiro", () => {
  const lotando = comunidadesLotando([
    ...comunidade("c1@g.us", "Comunidade 1", AVISO_A_PARTIR_DE),
    ...comunidade("c2@g.us", "Comunidade 2", AVISO_A_PARTIR_DE - 1),
    ...comunidade("c3@g.us", "Comunidade 3", 1950),
    grupo({ whatsapp_group_id: "solto@g.us", members: 1900 }),
  ]);

  assert.deepEqual(lotando, [
    { communityJid: "c3@g.us", nome: "Comunidade 3", avisoJid: "c3@g.us-av", pessoas: 1950, cheia: false },
    { communityJid: "c1@g.us", nome: "Comunidade 1", avisoJid: "c1@g.us-av", pessoas: AVISO_A_PARTIR_DE, cheia: false },
  ]);
});

test("a soma dos grupos não decide: 1.850 pessoas em grupos com Avisos de 1.200 é comunidade com folga", () => {
  // Quem está em dois grupos conta uma vez só no Avisos. Mutante: somar `members` dos membros.
  assert.deepEqual(comunidadesLotando(comunidade("c1@g.us", "Comunidade 1", 1200)), []);
});

test("sem o pai, o nome vem do Avisos; sem o Avisos, a comunidade fica de fora", () => {
  const semPai = comunidadesLotando(comunidade("c1@g.us", "Comunidade 1", 1900, false));
  assert.equal(semPai.length, 1);
  assert.equal(semPai[0].nome, "Avisos");

  const semAvisos = comunidadesLotando(
    comunidade("c1@g.us", "Comunidade 1", 1900).filter((g) => g.community_role !== "announce"),
  );
  assert.deepEqual(semAvisos, []);
});

test("no teto a comunidade é marcada cheia e o aviso muda de tom", () => {
  const [cheia] = comunidadesLotando(comunidade("c1@g.us", "Moda Sul · 1", TETO_DA_COMUNIDADE));
  assert.equal(cheia.cheia, true);

  const aviso = avisoDaComunidade(cheia);
  assert.equal(aviso.type, "comunidade_quase_cheia");
  assert.equal(aviso.title, 'Comunidade "Moda Sul · 1" chegou ao limite');
  assert.match(aviso.body, /^2\.000 pessoas: é o máximo do WhatsApp\./);
  assert.match(aviso.body, /até alguém sair/);
});

test("o aviso de quase cheia diz quantas são, o que acontece em 2.000 e para onde ir; o href leva o JID", () => {
  const [c] = comunidadesLotando(comunidade("120363@g.us", "Moda Sul · 2", 1850));
  const aviso = avisoDaComunidade(c);

  assert.equal(aviso.title, 'Comunidade "Moda Sul · 2" quase cheia');
  assert.match(aviso.body, /^1\.850 de 2\.000 pessoas\./);
  assert.match(aviso.body, /barra quem tentar entrar/);
  assert.match(aviso.body, /Crie outra comunidade/);
  // O href é a chave do "uma vez por semana": precisa identificar a comunidade, não só a tela.
  assert.equal(aviso.href, "/painel/comunidades?comunidade=120363%40g.us");
});
