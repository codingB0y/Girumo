import assert from "node:assert/strict";
import { test } from "node:test";

import { abrir } from "@/lib/security/secret-box";
import { hashDoEstado } from "@/lib/stores/bling-oauth-states";
import { contextoDoTokenMe } from "@/lib/stores/melhorenvio-conexoes";

import { ErroMelhorEnvio } from "./api";
import { concluirRetorno, destinoNoApp, iniciarConexao, type DepsConexao } from "./conexao";
import { ErroOAuthMelhorEnvio } from "./oauth";

const CHAVE = Buffer.alloc(32, 7);
const AGORA = new Date("2026-11-07T12:00:00Z");
const TOKENS = {
  accessToken: "access-aberto",
  refreshToken: "refresh-aberto",
  expiraEm: new Date("2026-12-07T12:00:00Z"),
  renovacaoExpiraEm: new Date("2026-12-22T12:00:00Z"),
};

type Espiao = {
  estados: Array<{ stateHash: string; tenantId: string; userId: string; expiraEm: Date }>;
  consumidos: string[];
  salvos: Array<{ tenantId: string; c: Record<string, unknown> }>;
};

function montar(sobre: Partial<DepsConexao> = {}): { deps: DepsConexao; e: Espiao } {
  const e: Espiao = { estados: [], consumidos: [], salvos: [] };
  const deps: DepsConexao = {
    credenciais: () => ({ clientId: "cid", clientSecret: "csecret" }),
    chave: () => CHAVE,
    ligado: async () => true,
    limite: async () => false,
    criarEstado: async (x) => void e.estados.push(x),
    consumirEstado: async (h) => {
      e.consumidos.push(h);
      return e.estados.some((x) => x.stateHash === h) ? { tenantId: "loja-a", userId: "usuario-1" } : null;
    },
    papel: async () => "owner",
    trocar: async () => TOKENS,
    conta: async () => ({ nome: "Ana Souza", email: "ana@loja.com" }),
    primeiraPagina: async () => ({
      etiquetas: [{ tracking: "T1", status: "posted", criadaEm: null, atualizadaEm: null, entregueEm: null }],
      ultimaPagina: 1,
    }),
    salvar: async (tenantId, c) => void e.salvos.push({ tenantId, c: c as unknown as Record<string, unknown> }),
    agora: () => AGORA,
    ...sobre,
  };
  return { deps, e };
}

async function comecar(deps: DepsConexao) {
  const r = await iniciarConexao({ tenantId: "loja-a", userId: "usuario-1" }, deps);
  const state = new URL((r.corpo as { url: string }).url).searchParams.get("state")!;
  return { r, state };
}
const retorno = (q: string) => new URL(`https://app.girumo.com.br/api/integracoes/melhor-envio/retorno?${q}`);

test("começar: state só em hash no banco, inteiro no cookie e na URL", async () => {
  const { deps, e } = montar();
  const { r, state } = await comecar(deps);
  assert.equal(r.status, 200);
  assert.deepEqual(e.estados, [
    { stateHash: hashDoEstado(state), tenantId: "loja-a", userId: "usuario-1", expiraEm: new Date(AGORA.getTime() + 600_000) },
  ]);
  assert.ok(!JSON.stringify(e.estados).includes(state));
  assert.match(r.cookie!, new RegExp(`^melhorenvio_oauth_state=${state}; Path=/api/integracoes/melhor-envio; .*Max-Age=600$`));
});

test("começar sem Rastreio / sem env / limitado", async () => {
  let m = montar({ ligado: async () => false });
  let r = await iniciarConexao({ tenantId: "loja-a", userId: "u" }, m.deps);
  assert.equal(r.status, 403);
  assert.equal((r.corpo as { code: string }).code, "rastreio_disabled");
  assert.equal(m.e.estados.length, 0);

  for (const sobre of [{ credenciais: () => null }, { chave: () => null }]) {
    m = montar(sobre);
    r = await iniciarConexao({ tenantId: "loja-a", userId: "u" }, m.deps);
    assert.deepEqual([r.status, r.corpo], [503, { error: "indisponivel" }]);
    assert.equal(m.e.estados.length, 0);
  }

  m = montar({ limite: async () => true });
  r = await iniciarConexao({ tenantId: "loja-a", userId: "u" }, m.deps);
  assert.deepEqual([r.status, r.corpo, r.cookie], [429, { error: "Muitas tentativas. Tente de novo em alguns minutos." }, undefined]);
  assert.equal(m.e.estados.length, 0);
});

test("retorno recusado na tela do Melhor Envio", async () => {
  const { deps, e } = montar();
  assert.equal(await concluirRetorno(retorno("error=access_denied&state=x"), "x", deps), "recusado");
  assert.equal(e.consumidos.length, 0);
});

test("sessão: sem state, sem cookie, cookie de outro state, state desconhecido, papel inválido", async () => {
  const { deps, e } = montar();
  const { state } = await comecar(deps);
  assert.equal(await concluirRetorno(retorno("code=c"), state, deps), "sessao");
  assert.equal(await concluirRetorno(retorno(`code=c&state=${state}`), null, deps), "sessao");
  assert.equal(await concluirRetorno(retorno(`code=c&state=${state}`), "outro-state", deps), "sessao");
  assert.equal(e.consumidos.length, 0);

  assert.equal(await concluirRetorno(retorno("code=c&state=desconhecido"), "desconhecido", deps), "sessao");

  for (const papel of ["operator", null] as const) {
    const m = montar({ papel: async () => papel });
    const { state: s } = await comecar(m.deps);
    assert.equal(await concluirRetorno(retorno(`code=c&state=${s}`), s, m.deps), "sessao");
    assert.equal(m.e.salvos.length, 0);
  }
});

test("code ausente depois de um state válido é erro", async () => {
  const { deps, e } = montar();
  const { state } = await comecar(deps);
  assert.equal(await concluirRetorno(retorno(`state=${state}`), state, deps), "erro");
  assert.equal(e.salvos.length, 0);
});

test("sem env no retorno: indisponível", async () => {
  const { deps } = montar({ credenciais: () => null });
  assert.equal(await concluirRetorno(retorno("code=c&state=s"), "s", deps), "indisponivel");
});

test("troca recusada e conta sem users-read", async () => {
  let m = montar({
    trocar: async () => {
      throw new ErroOAuthMelhorEnvio("outro", 400, "recusou");
    },
  });
  let { state } = await comecar(m.deps);
  assert.equal(await concluirRetorno(retorno(`code=c&state=${state}`), state, m.deps), "erro");
  assert.equal(m.e.salvos.length, 0);

  m = montar({
    conta: async () => {
      throw new ErroMelhorEnvio(403);
    },
  });
  ({ state } = await comecar(m.deps));
  const erros: string[] = [];
  const original = console.error;
  console.error = (...a: unknown[]) => void erros.push(a.join(" "));
  try {
    assert.equal(await concluirRetorno(retorno(`code=c&state=${state}`), state, m.deps), "erro");
  } finally {
    console.error = original;
  }
  assert.deepEqual(erros, ["[melhor-envio/retorno] /me recusado (403): falta o escopo users-read?"]);
  assert.equal(m.e.salvos.length, 0);
});

test("conta sem etiqueta: conta_vazia, salva com temEtiqueta false", async () => {
  const { deps, e } = montar({ primeiraPagina: async () => ({ etiquetas: [], ultimaPagina: 0 }) });
  const { state } = await comecar(deps);
  assert.equal(await concluirRetorno(retorno(`code=c&state=${state}`), state, deps), "conta_vazia");
  assert.equal(e.salvos[0].c.temEtiqueta, false);
});

test("conectado: salva com conta, tokens selados e sem token aberto", async () => {
  const { deps, e } = montar();
  const { state } = await comecar(deps);
  assert.equal(await concluirRetorno(retorno(`code=c&state=${state}`), state, deps), "conectado");
  const { tenantId, c } = e.salvos[0];
  assert.equal(tenantId, "loja-a");
  assert.deepEqual(
    [c.contaNome, c.contaEmail, c.temEtiqueta, c.conectadaPor, c.expiraEm, c.renovacaoExpiraEm],
    ["Ana Souza", "ana@loja.com", true, "usuario-1", TOKENS.expiraEm, TOKENS.renovacaoExpiraEm],
  );
  assert.equal(abrir(String(c.accessTokenEnc), contextoDoTokenMe("loja-a", "access"), CHAVE), "access-aberto");
  assert.equal(abrir(String(c.refreshTokenEnc), contextoDoTokenMe("loja-a", "refresh"), CHAVE), "refresh-aberto");
  const json = JSON.stringify(c);
  assert.ok(!json.includes("access-aberto") && !json.includes("refresh-aberto"));
});

test("state de uso único: o segundo retorno não troca o code", async () => {
  let usado = false;
  const { deps, e } = montar({
    consumirEstado: async () => (usado ? null : ((usado = true), { tenantId: "loja-a", userId: "usuario-1" })),
  });
  const { state } = await comecar(deps);
  assert.equal(await concluirRetorno(retorno(`code=c&state=${state}`), state, deps), "conectado");
  assert.equal(await concluirRetorno(retorno(`code=c&state=${state}`), state, deps), "sessao");
  assert.equal(e.salvos.length, 1);
});

test("primeira página falhando não impede conectar", async () => {
  const { deps, e } = montar({
    primeiraPagina: async () => {
      throw new ErroMelhorEnvio(0);
    },
  });
  const { state } = await comecar(deps);
  assert.equal(await concluirRetorno(retorno(`code=c&state=${state}`), state, deps), "conectado");
  assert.equal(e.salvos[0].c.temEtiqueta, null);
});

test("destinoNoApp: www vai para app., mesmo host fica", () => {
  const url = new URL("https://www.girumo.com.br/api/integracoes/melhor-envio/retorno?code=c&state=s");
  assert.equal(
    destinoNoApp(url, "https://app.girumo.com.br"),
    "https://app.girumo.com.br/api/integracoes/melhor-envio/retorno?code=c&state=s",
  );
  assert.equal(destinoNoApp(retorno("code=c"), "https://app.girumo.com.br"), null);
});
