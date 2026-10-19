import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { abrir, impressaoDaChave } from "@/lib/security/secret-box";
import { contextoDoToken } from "@/lib/stores/bling-conexoes";
import {
  banco,
  bling,
  CHAVE,
  conexoes,
  destino,
  emitidos,
  estados,
  GET,
  iniciar,
  montarRetorno,
  retorno,
  revogados,
  sha256,
  tarefasDepois,
  trocas,
} from "@/test/bling-retorno-falso";

/**
 * O retorno do OAuth do Bling de ponta a ponta, no mundo falso de `src/test/bling-retorno-falso.ts`: o
 * caminho feliz e a sessão — o state de uso único preso ao cookie, quem pediu ainda dono/admin, a recusa
 * na tela do Bling. A troca do code e a gravação estão em `route-gravacao.test.ts`.
 */

let papel: string | null = "owner";
montarRetorno({ papel: () => papel });
beforeEach(() => {
  papel = "owner";
});

test("retorno feliz: troca o code uma vez, grava os tokens só cifrados e volta conectado", async () => {
  const { state, cookie } = await iniciar();
  assert.equal(destino(await GET(retorno(`code=codigo-1&state=${state}`, cookie))), "conectado");

  assert.equal(trocas().length, 1);
  const troca = new URLSearchParams(trocas()[0].corpo);
  assert.deepEqual([troca.get("grant_type"), troca.get("code")], ["authorization_code", "codigo-1"]);
  const gravada = conexoes.get("loja-b");
  assert.ok(gravada);
  assert.deepEqual(
    [gravada.company_id, gravada.company_name, gravada.status, gravada.token_version, gravada.connected_by],
    ["empresa-1", "Moda da Ana", "ativa", 1, "usuario-1"],
  );
  // A loja ainda não escolheu: o motor calcula o padrão na hora (uma filha de Atendido criada depois entra).
  assert.ok(!("sale_situation_ids" in gravada));
  assert.deepEqual(gravada.situations, [{ id: 6, nome: "Em aberto", base: 6 }, { id: 9, nome: "Atendido", base: 9 }, { id: 4321, nome: "Pago no Pix", base: 9 }]);
  assert.equal(typeof gravada.situations_at, "string");
  assert.equal(abrir(String(gravada.access_token_enc), contextoDoToken("loja-b", "access"), CHAVE), emitidos.access);
  assert.equal(abrir(String(gravada.refresh_token_enc), contextoDoToken("loja-b", "refresh"), CHAVE), emitidos.refresh);
  // A impressão da chave que selou: se a chave mudar depois, o motor não manda a loja reconectar à toa.
  assert.equal(gravada.key_fp, impressaoDaChave(CHAVE));
  // Nenhum corpo mandado ao banco leva token aberto.
  const corpos = JSON.stringify(banco.map((c) => c.corpo));
  assert.ok(!corpos.includes(emitidos.access) && !corpos.includes(emitidos.refresh));
  assert.deepEqual(revogados(), []);
  assert.equal(tarefasDepois.length, 1, "a primeira sincronização sai depois da resposta");
});

test("o mesmo retorno de novo (duplo clique, F5) cai em sessao sem trocar o code outra vez", async () => {
  const { state, cookie } = await iniciar();
  assert.equal(destino(await GET(retorno(`code=codigo-1&state=${state}`, cookie))), "conectado");
  assert.equal(destino(await GET(retorno(`code=codigo-1&state=${state}`, cookie))), "sessao");
  assert.equal(trocas().length, 1);
  assert.equal(tarefasDepois.length, 1, "só a conexão que gravou agenda a sincronização");
});

test("cookie ausente ou diferente: sessao sem chamar o Bling e sem gastar o state", async () => {
  const { state } = await iniciar();
  assert.equal(destino(await GET(retorno(`code=c&state=${state}`))), "sessao");
  assert.equal(destino(await GET(retorno(`code=c&state=${state}`, "bling_oauth_state=outro-state"))), "sessao");
  assert.equal(bling.length, 0);
  assert.equal(estados.size, 1);
});

test("sem state na URL (instalação pela Central de Extensões do Bling): comece_aqui, sem chamar o Bling nem gastar o state", async () => {
  const { cookie } = await iniciar();
  assert.equal(destino(await GET(retorno("code=c", cookie))), "comece_aqui");
  assert.equal(destino(await GET(retorno("code=c"))), "comece_aqui");
  assert.equal(bling.length, 0);
  assert.equal(estados.size, 1);
});

test("state vencido ou desconhecido: sessao sem trocar o code", async () => {
  const { state, cookie } = await iniciar();
  const linha = estados.get(sha256(state));
  assert.ok(linha);
  estados.set(sha256(state), { ...linha, expires_at: new Date(Date.now() - 1_000).toISOString() });
  assert.equal(destino(await GET(retorno(`code=c&state=${state}`, cookie))), "sessao");
  // Cookie e parâmetro iguais, mas o state nunca passou pelo conectar.
  assert.equal(destino(await GET(retorno("code=c&state=inventado", "bling_oauth_state=inventado"))), "sessao");
  assert.equal(trocas().length, 0);
});

test("a loja recusou no Bling (?error=): recusado sem chamar o Bling", async () => {
  const { state, cookie } = await iniciar();
  assert.equal(destino(await GET(retorno(`error=access_denied&state=${state}`, cookie))), "recusado");
  assert.equal(bling.length, 0);
});

test("quem pediu deixou de ser dono/admin ou saiu da loja: sessao sem trocar o code", async () => {
  for (const depois of ["operator", null]) {
    papel = "owner";
    const { state, cookie } = await iniciar();
    papel = depois;
    assert.equal(destino(await GET(retorno(`code=c&state=${state}`, cookie))), "sessao", String(depois));
  }
  assert.equal(trocas().length, 0);
  const consulta = banco.filter((c) => c.url.pathname === "/rest/v1/memberships").at(-1);
  assert.ok(consulta);
  assert.deepEqual(
    Object.fromEntries([...consulta.url.searchParams].filter(([k]) => k !== "select")),
    { tenant_id: "eq.loja-b", user_id: "eq.usuario-1", accepted_at: "not.is.null", limit: "1" },
  );
});

test("code ausente: erro, e o state já foi gasto", async () => {
  const { state, cookie } = await iniciar();
  assert.equal(destino(await GET(retorno(`state=${state}`, cookie))), "erro");
  assert.equal(bling.length, 0);
  assert.equal(estados.size, 0);
});

test("sem as variáveis do Bling: indisponivel sem tocar no banco nem no Bling", async () => {
  delete process.env.INTEGRATIONS_ENCRYPTION_KEY;
  assert.equal(destino(await GET(retorno("code=c&state=s", "bling_oauth_state=s"))), "indisponivel");
  assert.equal(banco.length, 0);
  assert.equal(bling.length, 0);
});
