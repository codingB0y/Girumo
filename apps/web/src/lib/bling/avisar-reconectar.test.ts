import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { avisarReconectar, type DepsDoAviso } from "./avisar-reconectar";

type Enviado = Parameters<DepsDoAviso["enviar"]>[0];

function montar(extra: Partial<DepsDoAviso> = {}) {
  const enviados: Enviado[] = [];
  const desmarcados: string[] = [];
  let alertado = false;
  const deps: DepsDoAviso = {
    marcarAlerta: async () => {
      if (alertado) return false;
      alertado = true;
      return true;
    },
    desmarcarAlerta: async (tenantId) => {
      desmarcados.push(tenantId);
      alertado = false;
    },
    donos: async () => [
      { email: "ana@loja.test", nome: "Ana Paula" },
      { email: "beto@loja.test", nome: "<b>Beto</b> Souza" },
    ],
    enviar: async (opcoes) => {
      enviados.push(opcoes);
      return true;
    },
    appUrl: () => "https://app.girumo.test",
    ...extra,
  };
  return { deps, enviados, desmarcados };
}

/** As linhas de log (warn e error) guardadas em vez de impressas. */
async function comLog(f: () => Promise<void>): Promise<string[]> {
  const [erro, aviso] = [console.error, console.warn];
  const linhas: string[] = [];
  console.error = (...args: unknown[]) => void linhas.push(args.map(String).join(" "));
  console.warn = console.error;
  try {
    await f();
  } finally {
    [console.error, console.warn] = [erro, aviso];
  }
  return linhas;
}

test("avisa cada dono uma vez por queda, com o botão para as Integrações", async () => {
  const { deps, enviados, desmarcados } = montar();
  await avisarReconectar("loja-1", deps);
  await avisarReconectar("loja-1", deps);

  assert.deepEqual(enviados.map((e) => e.to), ["ana@loja.test", "beto@loja.test"]);
  assert.ok(enviados.every((e) => e.kind === "bling_reconectar" && e.tenantId === "loja-1"));
  assert.match(enviados[0].subject, /Bling/);
  assert.ok(enviados[0].html.includes('href="https://app.girumo.test/painel/configuracoes?secao=integracoes"'));
  assert.ok(enviados[0].html.includes("Ana"));
  // O nome vem do cadastro da pessoa: vai escapado no HTML.
  assert.ok(!enviados[1].html.includes("<b>Beto</b>"));
  assert.deepEqual(desmarcados, []);
});

test("nenhum e-mail saiu: o alerta volta para o cron reenviar, e o log diz a loja (sem endereço)", async () => {
  const { deps, desmarcados } = montar({ enviar: async () => false });
  const linhas = await comLog(() => avisarReconectar("loja-1", deps));

  // Mutante: o alerta ficava marcado e a dona nunca sabia que as vendas pararam de chegar.
  assert.deepEqual(desmarcados, ["loja-1"]);
  assert.ok(linhas.some((l) => l.includes("loja loja-1") && /nenhum e-mail saiu/.test(l)), linhas.join("\n"));
  assert.ok(!linhas.some((l) => l.includes("@loja.test")), "nenhum endereço no log");
});

test("um e-mail que explode conta como não saiu, e os outros donos ainda recebem: com um que saiu, o alerta fica", async () => {
  let n = 0;
  const { deps, enviados, desmarcados } = montar();
  const enviar = deps.enviar;
  deps.enviar = async (opcoes) => {
    n += 1;
    if (n === 1) throw new Error("resend fora do ar");
    return enviar(opcoes);
  };
  await comLog(() => avisarReconectar("loja-1", deps));

  assert.deepEqual(enviados.map((e) => e.to), ["beto@loja.test"]);
  assert.deepEqual(desmarcados, []);
});

test("donos que não carregam (banco fora): nenhum e-mail saiu, o alerta volta", async () => {
  const { deps, desmarcados } = montar({
    donos: async () => {
      throw new Error("banco fora do ar");
    },
  });
  await comLog(() => avisarReconectar("loja-1", deps));
  assert.deepEqual(desmarcados, ["loja-1"]);
});

test("sem dono com e-mail legível: o alerta fica (reenviar não adianta) e o log diz a loja", async () => {
  const { deps, desmarcados } = montar({ donos: async () => [] });
  const linhas = await comLog(() => avisarReconectar("loja-1", deps));

  assert.deepEqual(desmarcados, []);
  assert.ok(linhas.some((l) => l.includes("loja loja-1") && /dono/.test(l)), linhas.join("\n"));
});

test("nunca lança: e-mail recusado, envio que explode, donos, alerta ou a volta do alerta que não carregam", async () => {
  const falhas: Array<Partial<DepsDoAviso>> = [
    { enviar: async () => false },
    {
      enviar: async () => {
        throw new Error("resend fora do ar");
      },
    },
    {
      donos: async () => {
        throw new Error("banco fora do ar");
      },
    },
    {
      marcarAlerta: async () => {
        throw new Error("banco fora do ar");
      },
    },
    {
      enviar: async () => false,
      desmarcarAlerta: async () => {
        throw new Error("banco fora do ar");
      },
    },
  ];
  await comLog(async () => {
    for (const extra of falhas) await assert.doesNotReject(avisarReconectar("loja-1", montar(extra).deps));
  });
});

// --- Com as dependências de produção: o Auth de um PostgREST de mentira ----------------------

const DONO = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
type Chamada = { metodo: string; caminho: string; corpo: unknown };
const chamadas: Chamada[] = [];
let respostaDoAuth: [number, unknown] = [200, {}];

const supabase = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const { pathname } = new URL(req.url ?? "/", "http://supabase.falso");
    chamadas.push({ metodo: req.method ?? "", caminho: pathname, corpo: bruto ? JSON.parse(bruto) : undefined });
    let [status, corpo]: [number, unknown] = [500, { message: `inesperado: ${req.method} ${pathname}` }];
    // marcarAlertaReconectar: o UPDATE ... is null pegou a linha; a volta do alerta não devolve nada.
    if (pathname === "/rest/v1/bling_connections") [status, corpo] = [200, req.method === "PATCH" ? [{ tenant_id: "loja-b" }] : []];
    else if (pathname === "/rest/v1/memberships") [status, corpo] = [200, [{ user_id: DONO }]];
    else if (pathname === `/auth/v1/admin/users/${DONO}`) [status, corpo] = respostaDoAuth;
    res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(JSON.stringify(corpo));
  });
});

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  Object.assign(process.env, { SUPABASE_URL: `http://127.0.0.1:${port}`, SUPABASE_SERVICE_ROLE_KEY: "chave-falsa" });
});
after(() => supabase.close());

/** O que cada gravação da conexão fez com o alerta: a hora (marcou) ou null (voltou). */
const alertas = () =>
  chamadas.filter((c) => c.metodo === "PATCH").map((c) => ((c.corpo as Record<string, unknown>).reconnect_alerted_at === null ? "voltou" : "marcou"));

test("Auth fora por um instante (503): os donos não carregam, o alerta volta e o cron reenvia (prova R2-E1)", async () => {
  chamadas.length = 0;
  respostaDoAuth = [503, { message: "upstream unavailable" }];
  const linhas = await comLog(() => avisarReconectar("loja-b"));

  // Mutante: o erro passageiro valia como "sem e-mail legível", o alerta ficava marcado e a dona nunca sabia.
  assert.deepEqual(alertas(), ["marcou", "voltou"]);
  assert.ok(linhas.some((l) => l.includes("loja loja-b") && /donos/.test(l)), linhas.join("\n"));
  assert.ok(!linhas.some((l) => l.includes("@")), "nenhum endereço no log");
});

test("dono sem e-mail no Auth: definitivo, o alerta fica marcado (reenviar não adianta)", async () => {
  chamadas.length = 0;
  respostaDoAuth = [200, { id: DONO, email: null, user_metadata: {} }];
  const linhas = await comLog(() => avisarReconectar("loja-b"));

  assert.deepEqual(alertas(), ["marcou"]);
  assert.ok(linhas.some((l) => l.includes("loja loja-b") && /e-mail legível/.test(l)), linhas.join("\n"));
});
