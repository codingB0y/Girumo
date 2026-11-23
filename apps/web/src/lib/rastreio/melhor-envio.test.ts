import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { ErroMelhorEnvio } from "@/lib/melhor-envio/api";
import { ErroOAuthMelhorEnvio, type TokensMelhorEnvio } from "@/lib/melhor-envio/oauth";
import type { EtiquetaMelhorEnvio } from "@/lib/rastreio/marcos";
import { avisarReconectarMelhorEnvio, rodarMarcosDoMelhorEnvio, type DepsMarcos } from "@/lib/rastreio/melhor-envio";
import type { PedidoGravado } from "@/lib/rastreio/tipos";
import { abrir, selar } from "@/lib/security/secret-box";
import { contextoDoTokenMe, type ConexaoMelhorEnvio } from "@/lib/stores/melhorenvio-conexoes";
import type { PedidoACaminho } from "@/lib/stores/rastreio-pedidos";

const AGORA = new Date("2026-11-02T15:00:00Z");
const DIA = 86_400_000;
const CHAVE = Buffer.alloc(32, 7);
const CRED = { clientId: "cliente-teste", clientSecret: "segredo-teste" };
const daqui = (dias: number) => new Date(AGORA.getTime() + dias * DIA).toISOString();
const selado = (texto: string, campo: "access" | "refresh") => selar(texto, contextoDoTokenMe("loja-a", campo), CHAVE);
const aberto = (s: string, campo: "access" | "refresh") => abrir(s, contextoDoTokenMe("loja-a", campo), CHAVE);
const ACCESS_ENC = selado("access-velho", "access");
const REFRESH_ENC = selado("refresh-velho", "refresh");
const NOVOS: TokensMelhorEnvio = {
  accessToken: "access-novo", refreshToken: "refresh-novo", expiraEm: new Date(daqui(30)), renovacaoExpiraEm: new Date(daqui(45)),
};

function conexao(extra: Partial<ConexaoMelhorEnvio> = {}): ConexaoMelhorEnvio {
  return {
    tenantId: "loja-a", status: "ativa", accessTokenEnc: ACCESS_ENC, refreshTokenEnc: REFRESH_ENC,
    expiraEm: daqui(20), renovacaoExpiraEm: daqui(40), contaNome: null, contaEmail: null, temEtiqueta: null,
    primeiraPassadaEm: "2026-10-01T00:00:00.000Z", ultimaConsultaEm: null, ultimoErro: null, ...extra,
  };
}

const P1: PedidoACaminho = { id: "ped-1", numero: "1042", trackingCode: "AB123456789BR", orderCreatedAt: "2026-10-25T12:00:00.000Z" };
const P2: PedidoACaminho = { id: "ped-2", numero: "1043", trackingCode: "CD987654321BR", orderCreatedAt: "2026-10-26T12:00:00.000Z" };
const GRAVADO: PedidoGravado = {
  id: "ped-1", etapa: "entregue", etapaAnterior: "enviado", mudou: true, linkToken: "0".repeat(32),
  paradoEm: null, temTelefone: true, temEmail: true,
};

const etiqueta = (tracking: string | null, status: string, extra: Partial<EtiquetaMelhorEnvio> = {}): EtiquetaMelhorEnvio => ({
  tracking, status, criadaEm: "2026-10-30T00:00:00.000Z", atualizadaEm: "2026-11-01T17:32:00.000Z", entregueEm: null, ...extra,
});
const ENTREGUE_P1 = etiqueta("ab 123456789 br", "delivered", { entregueEm: "2026-11-01T17:32:00.000Z" });

type Pagina = Awaited<ReturnType<DepsMarcos["listar"]>>;
const VAZIA: Pagina = { etiquetas: [], ultimaPagina: 0 }; // o 204 do Melhor Envio

function montar(extra: Partial<DepsMarcos> = {}, paginas: Record<number, Pagina> = { 1: VAZIA }) {
  const log = {
    aCaminho: [] as unknown[], listar: [] as unknown[], renovar: [] as unknown[], trocar: [] as unknown[][],
    reautorizar: [] as unknown[], reconectar: 0, gravar: [] as unknown[], avisar: [] as unknown[], concluir: [] as unknown[],
  };
  const deps: DepsMarcos = {
    reivindicar: async () => conexao(),
    aCaminho: async (t, desde) => { log.aCaminho.push([t, desde]); return [P1, P2]; },
    listar: async (token, pagina) => { log.listar.push([token, pagina]); return paginas[pagina] ?? VAZIA; },
    credenciais: () => CRED,
    chave: () => CHAVE,
    renovar: async (refresh) => { log.renovar.push(refresh); return NOVOS; },
    trocarTokens: async (t, lido, novo) => { log.trocar.push([t, lido, novo]); return true; },
    reautorizar: async (t, lido, erro) => { log.reautorizar.push([t, lido, erro]); return true; },
    avisarReconectar: async () => { log.reconectar++; },
    gravarMarco: async (t, id, m) => { log.gravar.push([t, id, m]); return { ...GRAVADO, id, etapa: m.etapa }; },
    avisar: async (t, g, e) => { log.avisar.push([t, g.id, e]); return []; },
    concluir: async (t, r) => { log.concluir.push([t, r]); },
    ...extra,
  };
  return { deps, log };
}

const concluido = (r: { primeiraPassada?: boolean; temEtiqueta: boolean | null; erro: string | null }) =>
  [["loja-a", { agora: AGORA, primeiraPassada: false, ...r }]];

test("fora da vez: null, e nada mais é chamado", async () => {
  const { deps, log } = montar({ reivindicar: async () => null });
  assert.equal(await rodarMarcosDoMelhorEnvio("loja-a", AGORA, deps), null);
  assert.deepEqual([log.aCaminho, log.listar, log.concluir], [[], [], []]);
});

test("sem pedido a caminho, não chama a API e fecha a primeira passada", async () => {
  const { deps, log } = montar({ reivindicar: async () => conexao({ primeiraPassadaEm: null }), aCaminho: async (t, desde) => { log.aCaminho.push([t, desde]); return []; } });
  assert.deepEqual(await rodarMarcosDoMelhorEnvio("loja-a", AGORA, deps), { pedidos: 0, casados: 0, marcos: 0, paginas: 0 });
  assert.deepEqual(log.aCaminho, [["loja-a", new Date(AGORA.getTime() - 30 * DIA)]]);
  assert.deepEqual(log.listar, []);
  assert.deepEqual(log.concluir, concluido({ primeiraPassada: true, temEtiqueta: null, erro: null }));
});

test("casa pelo código igual (sem espaço, caixa alta), nunca pelo prefixo, e grava o marco", async () => {
  const pagina1 = { etiquetas: [ENTREGUE_P1, etiqueta("AB123456789BRX", "delivered"), etiqueta("CD987654321BR", "posted")], ultimaPagina: 1 };
  const { deps, log } = montar({}, { 1: pagina1 });
  assert.deepEqual(await rodarMarcosDoMelhorEnvio("loja-a", AGORA, deps), { pedidos: 2, casados: 2, marcos: 1, paginas: 1 });
  assert.deepEqual(log.listar, [["access-velho", 1]]);
  assert.deepEqual(log.gravar, [["loja-a", "ped-1", { etapa: "entregue", em: "2026-11-01T17:32:00.000Z", statusRaw: "melhorenvio:delivered" }]]);
  assert.deepEqual(log.avisar, [["loja-a", "ped-1", { origem: "varredura", atualizadoEm: "2026-11-01T17:32:00.000Z", numero: "1042" }]]);
  assert.deepEqual(log.concluir, concluido({ temEtiqueta: true, erro: null }));
});

test("primeira passada grava sem aviso", async () => {
  const { deps, log } = montar({ reivindicar: async () => conexao({ primeiraPassadaEm: null }) }, { 1: { etiquetas: [ENTREGUE_P1], ultimaPagina: 1 } });
  await rodarMarcosDoMelhorEnvio("loja-a", AGORA, deps);
  assert.deepEqual(log.avisar, [["loja-a", "ped-1", { origem: "importacao", atualizadoEm: "2026-11-01T17:32:00.000Z", numero: "1042" }]]);
  assert.deepEqual(log.concluir, concluido({ primeiraPassada: true, temEtiqueta: true, erro: null }));
});

test("para de paginar: todos casados, etiqueta mais velha que os pedidos, ou o teto de 20 páginas", async (t) => {
  const a = montar({}, { 1: { etiquetas: [ENTREGUE_P1, etiqueta("CD987654321BR", "posted")], ultimaPagina: 5 } });
  await rodarMarcosDoMelhorEnvio("loja-a", AGORA, a.deps);
  assert.equal(a.log.listar.length, 1, "todos casados");

  const b = montar({}, { 1: { etiquetas: [etiqueta("ZZ000000000BR", "posted", { criadaEm: "2026-10-23T00:00:00.000Z" })], ultimaPagina: 5 } });
  await rodarMarcosDoMelhorEnvio("loja-a", AGORA, b.deps);
  assert.equal(b.log.listar.length, 1, "etiqueta criada antes do pedido mais velho menos 1 dia");
  const folga = montar({}, { 1: { etiquetas: [etiqueta("ZZ000000000BR", "posted", { criadaEm: "2026-10-24T18:00:00.000Z" })], ultimaPagina: 2 } });
  await rodarMarcosDoMelhorEnvio("loja-a", AGORA, folga.deps);
  assert.equal(folga.log.listar.length, 2, "dentro da folga de 1 dia ainda pagina");

  const avisos: string[] = [];
  t.mock.method(console, "warn", (m: unknown) => avisos.push(String(m)));
  const cheia = (p: number): Pagina => ({ etiquetas: Array.from({ length: 10 }, (_, i) => etiqueta(`XX${p}N${i}`, "posted")), ultimaPagina: 50 });
  const c = montar({ listar: async (token, p) => { c.log.listar.push([token, p]); return cheia(p); } });
  assert.deepEqual(await rodarMarcosDoMelhorEnvio("loja-a", AGORA, c.deps), { pedidos: 2, casados: 0, marcos: 0, paginas: 20 });
  assert.equal(c.log.listar.length, 20);
  assert.deepEqual(avisos, ["[rastreio/melhor-envio] loja-a: parou no teto de 20 páginas"]);
});

test("lista vazia (204): uma chamada, e a conta fica marcada sem etiqueta", async () => {
  const { deps, log } = montar();
  assert.deepEqual(await rodarMarcosDoMelhorEnvio("loja-a", AGORA, deps), { pedidos: 2, casados: 0, marcos: 0, paginas: 1 });
  assert.equal(log.listar.length, 1);
  assert.deepEqual(log.concluir, concluido({ temEtiqueta: false, erro: null }));
});

test("renova antes de vencer: o par novo vai selado, condicionado ao refresh lido, e a lista usa o acesso novo", async () => {
  const { deps, log } = montar({ reivindicar: async () => conexao({ expiraEm: daqui(3) }) });
  await rodarMarcosDoMelhorEnvio("loja-a", AGORA, deps);
  assert.deepEqual(log.renovar, ["refresh-velho"]);
  const [[loja, lido, novo]] = log.trocar as [[string, string, { accessTokenEnc: string; refreshTokenEnc: string; expiraEm: Date; renovacaoExpiraEm: Date }]];
  assert.deepEqual([loja, lido], ["loja-a", REFRESH_ENC]);
  assert.deepEqual([aberto(novo.accessTokenEnc, "access"), aberto(novo.refreshTokenEnc, "refresh")], ["access-novo", "refresh-novo"]);
  assert.deepEqual([novo.expiraEm, novo.renovacaoExpiraEm], [NOVOS.expiraEm, NOVOS.renovacaoExpiraEm]);
  assert.deepEqual(log.listar, [["access-novo", 1]]);
});

test("reconectaram no meio da renovação: para quieta", async () => {
  const { deps, log } = montar({ reivindicar: async () => conexao({ expiraEm: daqui(3) }), trocarTokens: async () => false });
  assert.equal(await rodarMarcosDoMelhorEnvio("loja-a", AGORA, deps), null);
  assert.deepEqual([log.listar, log.reautorizar, log.reconectar, log.concluir], [[], [], 0, []]);
});

test("gravar o par novo que falha repete com o par em memória e nunca vira reautorizar", async () => {
  let falhas = 2;
  const ok = montar({
    reivindicar: async () => conexao({ expiraEm: daqui(3) }),
    trocarTokens: async (t, lido, novo) => { ok.log.trocar.push([t, lido, novo]); if (falhas-- > 0) throw new Error("banco fora"); return true; },
  });
  await rodarMarcosDoMelhorEnvio("loja-a", AGORA, ok.deps);
  assert.equal(ok.log.trocar.length, 3);
  assert.equal(new Set(ok.log.trocar.map((c) => (c[2] as { refreshTokenEnc: string }).refreshTokenEnc)).size, 1); // o mesmo par
  assert.deepEqual([ok.log.renovar.length, ok.log.reautorizar, ok.log.listar], [1, [], [["access-novo", 1]]]);

  const fora = montar({ reivindicar: async () => conexao({ expiraEm: daqui(3) }), trocarTokens: async () => { throw new Error("banco fora"); } });
  await assert.rejects(rodarMarcosDoMelhorEnvio("loja-a", AGORA, fora.deps), /banco fora/);
  assert.deepEqual([fora.log.reautorizar, fora.log.listar], [[], []]);
});

test("renovação recusada vira reautorizar, com sininho só na transição", async () => {
  const recusa = async (): Promise<TokensMelhorEnvio> => { throw new ErroOAuthMelhorEnvio("concessao_invalida", 400, "Melhor Envio OAuth recusou: HTTP 400 (invalid_grant)"); };
  const a = montar({ reivindicar: async () => conexao({ expiraEm: daqui(3) }), renovar: recusa });
  assert.equal(await rodarMarcosDoMelhorEnvio("loja-a", AGORA, a.deps), null);
  assert.deepEqual([a.log.reautorizar, a.log.reconectar, a.log.listar], [[["loja-a", REFRESH_ENC, "renovacao_recusada"]], 1, []]);

  const b = montar({ reivindicar: async () => conexao({ expiraEm: daqui(3) }), renovar: recusa, reautorizar: async () => false });
  await rodarMarcosDoMelhorEnvio("loja-a", AGORA, b.deps);
  assert.deepEqual([b.log.reconectar, b.log.listar], [0, []]);
});

test("renovação de 45 dias vencida vira reautorizar sem tentar renovar", async () => {
  const { deps, log } = montar({ reivindicar: async () => conexao({ renovacaoExpiraEm: daqui(-1) }) });
  assert.equal(await rodarMarcosDoMelhorEnvio("loja-a", AGORA, deps), null);
  assert.deepEqual([log.reautorizar, log.renovar, log.listar, log.reconectar], [[["loja-a", REFRESH_ENC, "renovacao_vencida"]], [], [], 1]);
});

test("401 na lista força a renovação e para", async () => {
  const { deps, log } = montar({ listar: async (token, p) => { log.listar.push([token, p]); throw new ErroMelhorEnvio(401); } });
  await rodarMarcosDoMelhorEnvio("loja-a", AGORA, deps);
  assert.deepEqual([log.renovar, log.trocar.map((c) => c[1]), log.gravar], [["refresh-velho"], [REFRESH_ENC], []]);
  assert.deepEqual(log.concluir, concluido({ temEtiqueta: null, erro: "chave_recusada" }));
});

test("reautorizar depois de uma renovação da mesma passada usa o refresh novo", async () => {
  let renovou = false;
  const { deps, log } = montar({
    reivindicar: async () => conexao({ expiraEm: daqui(3) }),
    renovar: async () => { if (renovou) throw new ErroOAuthMelhorEnvio("concessao_invalida", 400, "recusou"); renovou = true; return NOVOS; },
    listar: async () => { throw new ErroMelhorEnvio(401); },
  });
  assert.equal(await rodarMarcosDoMelhorEnvio("loja-a", AGORA, deps), null);
  const [[, lido, erro]] = log.reautorizar as [[string, string, string]];
  assert.equal(aberto(lido, "refresh"), "refresh-novo");
  assert.equal(erro, "renovacao_recusada");
});

test("outro erro do Melhor Envio fica gravado como código e sobe", async () => {
  for (const [erro, codigo] of [[new ErroMelhorEnvio(503), "http_503"], [new ErroMelhorEnvio(0), "sem_resposta"]] as const) {
    const { deps, log } = montar({ listar: async () => { throw erro; } });
    await assert.rejects(rodarMarcosDoMelhorEnvio("loja-a", AGORA, deps), erro);
    assert.deepEqual(log.concluir, concluido({ temEtiqueta: null, erro: codigo }), codigo);
  }
});

test("sem credencial do app ou sem chave, lança antes de abrir token", async () => {
  for (const extra of [{ credenciais: () => null }, { chave: () => null }]) {
    const { deps, log } = montar(extra);
    await assert.rejects(rodarMarcosDoMelhorEnvio("loja-a", AGORA, deps), /MELHORENVIO_CLIENT_ID\/SECRET ou INTEGRATIONS_ENCRYPTION_KEY ausente/);
    assert.deepEqual(log.listar, []);
  }
});

test("um pedido que não grava não para os outros, e o log não leva o código de rastreio", async (t) => {
  const erros: string[] = [];
  t.mock.method(console, "error", (m: unknown) => erros.push(String(m)));
  const { deps, log } = montar(
    { gravarMarco: async (tid, id, m) => { if (id === "ped-1") throw new Error("banco fora"); log.gravar.push([tid, id, m]); return { ...GRAVADO, id }; } },
    { 1: { etiquetas: [ENTREGUE_P1, etiqueta("CD987654321BR", "delivered")], ultimaPagina: 1 } },
  );
  assert.deepEqual(await rodarMarcosDoMelhorEnvio("loja-a", AGORA, deps), { pedidos: 2, casados: 2, marcos: 1, paginas: 1 });
  assert.deepEqual([log.gravar.map((g) => (g as unknown[])[1]), log.avisar.map((a) => (a as unknown[])[1])], [["ped-2"], ["ped-2"]]);
  assert.deepEqual(erros, ["[rastreio/melhor-envio] loja-a: pedido ped-1 não gravou: banco fora"]);
  assert.ok(!erros.some((e) => /AB123456789BR/i.test(e)));
});

test("pedido purgado: sem aviso; marco repetido não conta", async () => {
  const pagina = { 1: { etiquetas: [ENTREGUE_P1], ultimaPagina: 1 } };
  const a = montar({ gravarMarco: async () => null }, pagina);
  assert.deepEqual(await rodarMarcosDoMelhorEnvio("loja-a", AGORA, a.deps), { pedidos: 2, casados: 1, marcos: 0, paginas: 1 });
  assert.deepEqual(a.log.avisar, []);
  const b = montar({ gravarMarco: async () => ({ ...GRAVADO, mudou: false }) }, pagina);
  assert.equal((await rodarMarcosDoMelhorEnvio("loja-a", AGORA, b.deps))?.marcos, 0);
  assert.equal(b.log.avisar.length, 1); // o problema repetido ainda recria o sininho, como na Yampi
});

// --- sininho de reconexão, com PostgREST falso ---
const corpos: unknown[] = [];
const postgrest = createServer((req, res) => {
  let texto = "";
  req.on("data", (c) => (texto += c));
  req.on("end", () => {
    corpos.push({ metodo: req.method, caminho: req.url, corpo: texto ? JSON.parse(texto) : null });
    res.statusCode = 201;
    res.end();
  });
});
before(async () => {
  await new Promise<void>((ok) => postgrest.listen(0, "127.0.0.1", ok));
  process.env.SUPABASE_URL = `http://127.0.0.1:${(postgrest.address() as AddressInfo).port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
});
after(() => { postgrest.close(); });

test("o sininho de reconexão aponta para Integrações", async () => {
  await avisarReconectarMelhorEnvio("loja-a");
  assert.deepEqual(corpos, [{
    metodo: "POST", caminho: "/rest/v1/notifications",
    corpo: {
      tenant_id: "loja-a", type: "rastreio_melhor_envio", title: "Melhor Envio desconectado",
      body: "Reconecte o Melhor Envio para os avisos de entrega", href: "/painel/configuracoes?secao=integracoes",
    },
  }]);
});
