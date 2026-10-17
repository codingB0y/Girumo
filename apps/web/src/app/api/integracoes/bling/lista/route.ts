import { diaDoBling } from "@/lib/bling/api";
import { blingDisponivel } from "@/lib/bling/deps";
import type { HashesMeta } from "@/lib/meta/dados-do-cliente";
import { hasPermission } from "@/lib/permissions";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { lerConexao } from "@/lib/stores/bling-conexoes";
import { paginaDaLista, type ContatoGuardado, type ListaBling } from "@/lib/stores/bling-contatos";
import { chavesEmOptout } from "@/lib/stores/optouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LISTAS: readonly ListaBling[] = ["alto_valor", "comprador", "lead"];
/** O teto do PostgREST: página menor que isso é a última. */
const TAMANHO_DA_PAGINA = 1000;
/** Colunas da lista de clientes do Meta, já em hash (spec §4 "CSV por lista"). */
const CABECALHO = "email,email,phone,phone,phone,fn,ln,ct,st,zip,country,doby,dobm,dobd,gen,extern_id";

function resposta(corpo: unknown, status: number): Response {
  return Response.json(corpo, { status, headers: { "cache-control": "no-store" } });
}

/**
 * GET /api/integracoes/bling/lista?l=alto_valor|comprador|lead — o CSV de uma lista para o
 * público do Meta (as vendas de antes de conectar; as novas chegam pelos eventos). Uma linha
 * por pessoa, como o cartão conta (menos quem está no descadastro); nada em texto além dos hashes.
 */
export async function GET(req: Request): Promise<Response> {
  let tenantId: string;
  try {
    const ctx = await getRouteTenantContext(req, { allowEngine: false });
    if (!ctx.role || !hasPermission(ctx.role, "settings:connection")) {
      return resposta({ error: "Sem permissão para esta ação." }, 403);
    }
    tenantId = ctx.tenantId;
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(`[bling/lista] contexto: ${(e as Error).message}`);
    return resposta({ error: "erro" }, 500);
  }

  const pedida = new URL(req.url).searchParams.get("l");
  const lista = LISTAS.find((l) => l === pedida);
  if (!lista) return resposta({ error: "Lista inválida." }, 400);
  if (!blingDisponivel()) return resposta({ error: "indisponivel" }, 503);

  try {
    const conexao = await lerConexao(tenantId);
    if (!conexao || conexao.status === "desconectada") return resposta({ error: "Sem conexão com o Bling." }, 404);
    // Quem pediu para sair não vai ao Meta (contato sem telefone não tem como estar no descadastro).
    const descadastro = await chavesEmOptout(tenantId);
    const linhas = (await pessoasDaLista(tenantId, lista))
      .filter((c) => !c.phoneKey || !descadastro.has(c.phoneKey))
      .map((c) => linhaDoCsv(c.metaHashes));
    return new Response([CABECALHO, ...linhas].join("\r\n"), {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="girumo-${lista}-${diaDoBling(new Date())}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    console.error(`[bling/lista] ${tenantId}: ${(e as Error).message}`);
    return resposta({ error: "Não foi possível gerar a lista." }, 500);
  }
}

const buscadoEm = (c: ContatoGuardado) => Date.parse(c.fetchedAt) || 0;

/**
 * Pessoa = chave do telefone (contato sem telefone é uma pessoa sozinho), como o `bling_resumo`
 * conta. Dois cadastros da mesma cliente: fica o buscado por último no Bling. Lê tudo antes de
 * escrever porque o outro cadastro pode estar em outra página.
 * ponytail: a lista inteira em memória (~1 KB por pessoa); escrever em stream se passar de 100 mil.
 */
async function pessoasDaLista(tenantId: string, lista: ListaBling): Promise<ContatoGuardado[]> {
  const pessoas = new Map<string, ContatoGuardado>();
  for (let depoisDe = 0; ; ) {
    const pagina = await paginaDaLista(tenantId, lista, depoisDe, TAMANHO_DA_PAGINA);
    for (const c of pagina) {
      const pessoa = c.phoneKey ?? `c:${c.blingContactId}`;
      const atual = pessoas.get(pessoa);
      if (!atual || buscadoEm(c) > buscadoEm(atual)) pessoas.set(pessoa, c);
    }
    if (pagina.length < TAMANHO_DA_PAGINA) return [...pessoas.values()];
    depoisDe = pagina[pagina.length - 1].blingContactId;
  }
}

/** A ordem do cabeçalho. `db` não entra: a lista de clientes usa ano, mês e dia separados. */
function linhaDoCsv(h: HashesMeta): string {
  const celulas = [h.em?.[0], h.em?.[1], h.ph?.[0], h.ph?.[1], h.ph?.[2], h.fn, h.ln, h.ct, h.st, h.zp, h.country, h.doby, h.dobm, h.dobd, h.ge, h.external_id];
  return celulas.map((v) => celula(v ?? "")).join(",");
}

/** RFC 4180. Hash hexadecimal nunca precisa; o arquivo só não pode quebrar se um dia vier outro texto. */
function celula(valor: string): string {
  return /[",\r\n]/.test(valor) ? `"${valor.replaceAll('"', '""')}"` : valor;
}
