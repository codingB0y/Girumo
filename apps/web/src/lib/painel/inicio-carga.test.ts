import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import type { carregarSessao as CarregarSessao } from "./inicio-carga";

/**
 * `carregarSessao` contra um PostgREST e uma Evolution de mentira num servidor só
 * (desenho de `lib/groups/sincronizar.test.ts`): a Início reconcilia o status na Evolution
 * antes de ler a sessão, e o que sai daqui é o que sai em produção; só a rede é trocada.
 */

type Chamada = { metodo: string; url: URL };
type Resposta = { status: number; corpo?: unknown };

const LOJA = "loja-a";
const chamadas: Chamada[] = [];

// Os dois números fora do ar, com sessão na Evolution: é o que faz a reconciliação perguntar a ela.
const GRUPOS = {
  id: "inst-g",
  tenant_id: LOJA,
  name: "Número dos grupos",
  phone: "5511900000001",
  purpose: "grupos",
  status: "qr",
  qr_code: null,
  provider: "evolution",
  provider_instance_id: "gr_inst-g",
  last_seen_at: null,
  connected_at: null,
  metadata: {},
  created_at: "2026-09-01T00:00:00+00:00",
  updated_at: "2026-09-01T00:00:00+00:00",
};
const ATENDIMENTO = { ...GRUPOS, id: "inst-p", name: "Atendimento", phone: "5511900000002", purpose: "privado", provider_instance_id: "gr_inst-p" };

function responder({ metodo, url }: Chamada): Resposta {
  // O atendimento vem PRIMEIRO: sem o filtro `purpose=eq.grupos`, é ele o primeiro conferido.
  if (metodo === "GET" && url.pathname === "/rest/v1/instances") {
    return {
      status: 200,
      corpo: [ATENDIMENTO, GRUPOS].filter((linha) => {
        const filtro = url.searchParams.get("purpose");
        return filtro === null || filtro === `eq.${linha.purpose}`;
      }),
    };
  }
  if (metodo === "GET" && url.pathname.startsWith("/instance/connectionState/")) {
    return { status: 200, corpo: { instance: { state: "close" } } };
  }
  // Chamada que ninguém previu vira 500, para aparecer.
  return { status: 500, corpo: { message: `inesperado: ${metodo} ${url.pathname}` } };
}

const servidor = createServer((req, res) => {
  const chamada: Chamada = { metodo: req.method ?? "", url: new URL(req.url ?? "/", "http://falso") };
  chamadas.push(chamada);
  const { status, corpo } = responder(chamada);
  res.setHeader("Content-Type", "application/json");
  res.statusCode = status;
  res.end(JSON.stringify(corpo));
});

let carregarSessao: typeof CarregarSessao;

before(async () => {
  await new Promise<void>((pronto) => servidor.listen(0, "127.0.0.1", pronto));
  const { port } = servidor.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_URL = base;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.EVOLUTION_API_URL = base;
  process.env.EVOLUTION_API_KEY = "chave-da-evolution-falsa";
  // O modo Supabase tem que valer antes de o módulo carregar: `USE_SUPABASE` é lido no import.
  process.env.HUBFLOW_USE_SUPABASE = "1";
  ({ carregarSessao } = await import("./inicio-carga"));
});

after(() => {
  servidor.close();
});

const feitas = (metodo: string, caminho: string) =>
  chamadas.filter((c) => c.metodo === metodo && c.url.pathname === caminho);

test("o Início só reconcilia o número dos grupos: o do atendimento nunca é conferido na Evolution", async () => {
  chamadas.length = 0;

  const sessao = await carregarSessao(LOJA);

  // Mutante: listInstances no lugar de listGroupInstances em carregarSessao — o atendimento seria conferido.
  // (`getSession` também filtra `purpose=eq.grupos`, então olhar só a leitura não pegaria o mutante.)
  assert.equal(feitas("GET", "/instance/connectionState/gr_inst-g").length, 1);
  assert.equal(feitas("GET", "/instance/connectionState/gr_inst-p").length, 0);
  // O service-role passa por cima do RLS: toda leitura de números filtra a loja.
  for (const c of feitas("GET", "/rest/v1/instances")) {
    assert.equal(c.url.searchParams.get("tenant_id"), `eq.${LOJA}`);
  }
  // A Evolution disse `close`: nada é promovido, a sessão continua desconectada.
  assert.equal(sessao.status, "disconnected");
  assert.equal(sessao.live, false);
});
