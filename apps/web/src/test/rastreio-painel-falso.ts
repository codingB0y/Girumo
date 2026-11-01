/**
 * O mundo falso das rotas do painel do Rastreio (`app/api/rastreio/*`), molde `servirCartao`: o dono logado
 * por Bearer contra um PostgREST de mentira. A sessão e a membership respondem sozinhas; o resto vem de
 * `tabelas()` por `"<MÉTODO> /rest/v1/<tabela>"`. Chave ausente responde 500, para o teste ver o que a rota
 * pediu sem querer.
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before } from "node:test";

export type Chamada = { metodo: string; url: URL; corpo: unknown };

/** O que o PostgREST devolve: o corpo, ou uma função da chamada (status, corpo e `Content-Range` à mão). */
export type Resposta = unknown | ((c: Chamada) => { status: number; corpo?: unknown; contentRange?: string });

export type EstadoDoRastreio = {
  /** Cada chamada ao banco, na ordem. */
  chamadas: Chamada[];
  papel: () => string;
  tabelas: () => Record<string, Resposta>;
};

function responder(estado: EstadoDoRastreio, c: Chamada): { status: number; corpo?: unknown; contentRange?: string } {
  if (c.url.pathname === "/auth/v1/user") return { status: 200, corpo: { id: "usuario-1", email: "dono@loja.test" } };
  if (c.url.pathname === "/rest/v1/memberships") {
    return { status: 200, corpo: [{ tenant_id: "loja-b", role: estado.papel(), modules: [] }] };
  }
  const chave = `${c.metodo} ${c.url.pathname}`;
  const tabelas = estado.tabelas();
  if (!(chave in tabelas)) return { status: 500, corpo: { message: `inesperado: ${chave}` } };
  const r = tabelas[chave];
  if (typeof r === "function") return r(c);
  // Lista fixa: o Content-Range que o `count: "exact"` lê.
  return { status: 200, corpo: r, contentRange: Array.isArray(r) ? `0-${Math.max(0, r.length - 1)}/${r.length}` : undefined };
}

/** Liga o mundo falso no arquivo de teste; devolve os filtros das chamadas que os testes conferem. */
export function servirRastreio(estado: EstadoDoRastreio) {
  const supabase = createServer((req, res) => {
    let bruto = "";
    req.on("data", (parte: Buffer) => (bruto += parte));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://supabase.falso");
      const chamada = { metodo: req.method ?? "", url, corpo: bruto ? JSON.parse(bruto) : undefined };
      estado.chamadas.push(chamada);
      const { status, corpo, contentRange } = responder(estado, chamada);
      res.setHeader("Content-Type", "application/json");
      if (contentRange) res.setHeader("Content-Range", contentRange);
      res.statusCode = status;
      res.end(chamada.metodo === "HEAD" || corpo === undefined ? undefined : JSON.stringify(corpo));
    });
  });
  before(async () => {
    await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
    const { port } = supabase.address() as AddressInfo;
    process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
    process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";
  });
  after(() => {
    supabase.close();
  });
  const doBanco = () =>
    estado.chamadas.filter((c) => c.url.pathname.startsWith("/rest/v1/") && c.url.pathname !== "/rest/v1/memberships");
  return {
    /** Consultas a dado da loja (a sessão e a membership não contam). */
    doBanco,
    escritas: () => doBanco().filter((c) => c.metodo !== "GET" && c.metodo !== "HEAD"),
  };
}
