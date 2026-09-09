import assert from "node:assert/strict";
import { test } from "node:test";

import { iniciaisDoEmail, papelEmPortugues, resumoDasPortas } from "./configuracoes";

function leitura(over: Partial<Parameters<typeof resumoDasPortas>[0]> = {}) {
  return {
    conexao: { ok: true, live: true },
    equipe: { ok: true, aceitos: 1, pendentes: 0 },
    avisos: { ok: true, ligados: 3, total: 3 },
    plano: { ok: true, nome: "GROWTH", vigente: true },
    conta: { papel: "owner" as string | null },
    ...over,
  };
}

/* -------------------------------------------------------------------------- */
/* Papéis: "owner" e "operator" nunca chegam à tela (spec 12.6).              */
/* -------------------------------------------------------------------------- */

test("papel do banco vira palavra em português", () => {
  assert.equal(papelEmPortugues("owner"), "Dono");
  assert.equal(papelEmPortugues("admin"), "Administração");
  assert.equal(papelEmPortugues("operator"), "Atendimento");
});

test("papel desconhecido não vaza o identificador cru do banco", () => {
  assert.equal(papelEmPortugues("gerente_regional"), "Equipe");
  assert.equal(papelEmPortugues(""), "Equipe");
  assert.equal(papelEmPortugues(null), "Equipe");
});

test("papel é reconhecido independente de caixa e espaço", () => {
  assert.equal(papelEmPortugues(" OWNER "), "Dono");
});

/* -------------------------------------------------------------------------- */
/* Iniciais: o avatar da ficha de equipe sai do e-mail.                        */
/* -------------------------------------------------------------------------- */

test("e-mail com separador vira as iniciais das duas partes", () => {
  assert.equal(iniciaisDoEmail("igor.toledo@girumo.com.br"), "IT");
  assert.equal(iniciaisDoEmail("ana_paula@x.com"), "AP");
});

test("e-mail de uma palavra usa as duas primeiras letras", () => {
  assert.equal(iniciaisDoEmail("igor@girumo.com.br"), "IG");
});

/**
 * `(email ?? "?").slice(0, 2)` — o que a tela antiga fazia — devolvia "A@"
 * para "a@x.com": a arroba ia parar dentro do avatar.
 */
test("e-mail curto não leva a arroba para dentro do avatar", () => {
  assert.equal(iniciaisDoEmail("a@x.com"), "A");
});

test("sem e-mail o avatar não quebra nem inventa letra", () => {
  assert.equal(iniciaisDoEmail(null), "•");
  assert.equal(iniciaisDoEmail(""), "•");
  assert.equal(iniciaisDoEmail("@x.com"), "•");
});

/* -------------------------------------------------------------------------- */
/* Portas: o dado embaixo de cada uma, antes do clique (spec 12.6).           */
/* -------------------------------------------------------------------------- */

test("cada porta mostra o próprio estado sem precisar abrir", () => {
  const r = resumoDasPortas(leitura());
  assert.equal(r["Conexão"], "conectado");
  assert.equal(r["Notificações"], "3 ligadas");
  assert.equal(r["Plano"], "GROWTH");
  assert.equal(r["Conta"], "Dono");
});

test("equipe conta pessoas, e sozinho não é zero pessoas", () => {
  assert.equal(resumoDasPortas(leitura()).Equipe, "só você");
  assert.equal(
    resumoDasPortas(leitura({ equipe: { ok: true, aceitos: 2, pendentes: 0 } })).Equipe,
    "2 pessoas",
  );
});

test("convite pendente aparece sem virar pessoa da equipe", () => {
  assert.equal(
    resumoDasPortas(leitura({ equipe: { ok: true, aceitos: 1, pendentes: 1 } })).Equipe,
    "só você · 1 convite",
  );
  assert.equal(
    resumoDasPortas(leitura({ equipe: { ok: true, aceitos: 2, pendentes: 2 } })).Equipe,
    "2 pessoas · 2 convites",
  );
});

test("aviso desligado é contado, não escondido", () => {
  assert.equal(
    resumoDasPortas(leitura({ avisos: { ok: true, ligados: 1, total: 3 } }))["Notificações"],
    "1 ligada de 3",
  );
  assert.equal(
    resumoDasPortas(leitura({ avisos: { ok: true, ligados: 0, total: 3 } }))["Notificações"],
    "nenhuma ligada",
  );
});

/**
 * `plan_id` guarda o plano ESCOLHIDO no checkout, não o pago. Dizer "GROWTH"
 * para quem está com a assinatura cancelada e teto zero é a promessa que faz o
 * cliente tomar 402 em tudo sem ligar uma coisa na outra.
 */
test("plano escolhido mas não pago não é anunciado como se valesse", () => {
  assert.equal(
    resumoDasPortas(leitura({ plano: { ok: true, nome: "GROWTH", vigente: false } })).Plano,
    "GROWTH · inativo",
  );
});

test("sem assinatura nenhuma a porta diz isso, não fica em branco", () => {
  assert.equal(
    resumoDasPortas(leitura({ plano: { ok: true, nome: null, vigente: false } })).Plano,
    "sem plano",
  );
});

/* -------------------------------------------------------------------------- */
/* Ausência de dado ≠ estado. Todos os fetches da tela têm catch silencioso.   */
/* -------------------------------------------------------------------------- */

/**
 * `/api/session` fora do ar deixava `live` como false, e a tela afirmava
 * "Desconectado" — a mesma frase que aparece quando o número caiu de verdade.
 * A porta prefere não dizer nada a dizer o que não sabe.
 */
test("consulta que falhou não vira estado afirmado", () => {
  const r = resumoDasPortas(
    leitura({
      conexao: { ok: false, live: false },
      equipe: { ok: false, aceitos: 0, pendentes: 0 },
      avisos: { ok: false, ligados: 0, total: 3 },
      plano: { ok: false, nome: null, vigente: false },
      conta: { papel: null },
    }),
  );
  assert.equal(r["Conexão"], null);
  assert.equal(r.Equipe, null);
  assert.equal(r["Notificações"], null);
  assert.equal(r.Plano, null);
  assert.equal(r.Conta, null);
});

test("desconectado de verdade continua sendo dito", () => {
  assert.equal(resumoDasPortas(leitura({ conexao: { ok: true, live: false } }))["Conexão"], "desconectado");
});
