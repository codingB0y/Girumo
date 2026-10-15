/**
 * Aplica no banco as migracoes de `deploy/supabase/apply-order.txt` que ainda
 * nao rodaram la. Roda no CI: em DEV a cada PR, em PROD a cada push em `main`.
 *
 * Por que existe: ate 14/10/2026 toda migracao era aplicada a mao, nos dois
 * bancos, por `supabase db query --linked -f` — e o modo auto do Claude Code
 * recusa DDL em producao, entao cada PR com migracao parava esperando o Igor.
 * Aplicar so em um dos bancos ja deixou o gate de drift vermelho para todos os
 * PRs (#189, 02/09/2026).
 *
 * Registro: `ops.applied_migrations` (fora de `public` de proposito: nao entra
 * na `schema_signature()` do gate de drift e o PostgREST nao expoe). Cada
 * arquivo vai inteiro numa chamada, como o `db query --linked -f` fazia; o
 * registro e gravado logo depois. Se o job morrer entre os dois, o proximo run
 * reaplica o arquivo — as migracoes deste repo sao idempotentes por convencao
 * (`if not exists`, `create or replace`), que e o mesmo contrato do caminho manual.
 *
 * Bootstrap: num banco sem o registro, tudo que ja estava na ordem ANTES deste
 * run (o `--seed-from`, tirado do commit base) e dado como aplicado. Sem
 * `--seed-from`, o script recusa — senao reaplicaria 100+ migracoes antigas.
 *
 * Usa a Management API (o mesmo caminho do `--linked` do CLI): so o
 * SUPABASE_ACCESS_TOKEN, sem senha de banco.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { lerProjetos } from "./check-advisors.ts";
import {
  carregarAllowlist,
  carregarBaseline,
  diffAssinaturas,
  formatarRelatorio,
  type Assinatura,
  type EntradaAllowlist,
  type Resultado,
} from "./check-schema-drift.ts";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CAMINHO_ORDEM = path.join(RAIZ, "deploy", "supabase", "apply-order.txt");

/** Caminho relativo a raiz, so com caracteres que nao precisam de escape em SQL. */
const ARQUIVO_VALIDO = /^[A-Za-z0-9_./-]+\.sql$/;

/** Entradas da ordem, sem comentario nem linha vazia (aceita CRLF). */
export function lerOrdem(texto: string): string[] {
  const entradas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#"));
  for (const e of entradas) {
    if (!ARQUIVO_VALIDO.test(e) || e.includes("..")) {
      throw new Error(`Entrada invalida em apply-order.txt: "${e}"`);
    }
  }
  return entradas;
}

/** O que falta aplicar, na ordem do arquivo. */
export function pendentes(ordem: string[], aplicadas: Iterable<string>): string[] {
  const feitas = new Set(aplicadas);
  return ordem.filter((e) => !feitas.has(e));
}

export function sqlLiteral(valor: string): string {
  return `'${valor.replace(/'/g, "''")}'`;
}

export function sqlRegistrar(arquivos: string[]): string {
  const valores = arquivos.map((a) => `(${sqlLiteral(a)})`).join(", ");
  return `insert into ops.applied_migrations (filename) values ${valores} on conflict do nothing;`;
}

export const SQL_CRIAR_REGISTRO = `
create schema if not exists ops;
revoke all on schema ops from public, anon, authenticated;
create table if not exists ops.applied_migrations (
  filename text primary key,
  applied_at timestamptz not null default now()
);
revoke all on ops.applied_migrations from public, anon, authenticated;
`;

type Consulta = (sql: string) => Promise<Array<Record<string, unknown>>>;

export function clienteManagementApi(ref: string, token: string): Consulta {
  return async (sql) => {
    const resposta = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    });
    const corpo = await resposta.text();
    if (!resposta.ok) {
      throw new Error(`database/query respondeu ${resposta.status}: ${mensagemDeErro(corpo)}`);
    }
    const json = corpo ? (JSON.parse(corpo) as unknown) : [];
    // 2xx que nao e lista vira erro: tratar como [] faria `existe` dar falso e
    // o script cair de novo no bootstrap.
    if (!Array.isArray(json)) throw new Error(`database/query devolveu formato inesperado: ${corpo.slice(0, 200)}`);
    return json as Array<Record<string, unknown>>;
  };
}

/**
 * So o `message` do Postgres. O log do Actions e PUBLICO (repo publico) e o
 * corpo completo traz `detail`, que em violacao de unique cita os valores da
 * linha — telefone de cliente, por exemplo.
 */
export function mensagemDeErro(corpo: string): string {
  try {
    const json = JSON.parse(corpo) as { message?: unknown };
    if (typeof json.message === "string") return json.message.split("\n")[0].slice(0, 500);
  } catch {
    // corpo nao-JSON (proxy, 5xx): cai no generico abaixo
  }
  return "(corpo de erro omitido do log)";
}

export type Opcoes = {
  consultar: Consulta;
  ordem: string[];
  semente: string[] | null;
  lerArquivo: (relativo: string) => Promise<string>;
  simular: boolean;
  /** Registro fora da ordem trava o run. So prod: dev guarda migracao de PR aberto. */
  estrito: boolean;
  log: (linha: string) => void;
};

/** Devolve os arquivos aplicados neste run. */
export async function aplicar(o: Opcoes): Promise<string[]> {
  const [{ existe } = { existe: false }] = await o.consultar(
    "select to_regclass('ops.applied_migrations') is not null as existe;",
  );

  if (!existe) {
    if (!o.semente) {
      throw new Error(
        "Banco sem ops.applied_migrations e sem --seed-from: recuso aplicar a ordem inteira do zero.",
      );
    }
    o.log(`Registro ausente: criando e semeando com ${o.semente.length} entradas ja existentes.`);
    if (!o.simular) {
      await o.consultar(SQL_CRIAR_REGISTRO);
      if (o.semente.length > 0) await o.consultar(sqlRegistrar(o.semente));
    }
  }

  const aplicadas = existe
    ? (await o.consultar("select filename from ops.applied_migrations;")).map((r) => String(r.filename))
    : (o.semente ?? []);
  // Registro com arquivo que saiu da ordem. Em PROD todo registro veio de `main`,
  // entao isso e quase sempre um rename — e seguir reaplicaria o arquivo com o nome
  // novo. Em DEV e normal: o banco e compartilhado e guarda a migracao de outro PR
  // ainda aberto (15/10/2026: o #456 travou na de `pool_sem_estrutura_de_comunidade`).
  const naOrdem = new Set(o.ordem);
  const orfas = aplicadas.filter((a) => !naOrdem.has(a));
  if (orfas.length > 0 && o.estrito) {
    throw new Error(
      `Registradas mas fora de apply-order.txt (renomeadas?): ${orfas.join(", ")}. ` +
        "Corrija o registro (update ops.applied_migrations set filename = ...) antes de seguir.",
    );
  }
  if (orfas.length > 0) {
    o.log(`Aviso: no registro mas fora desta ordem (PR aberto ou rename): ${orfas.join(", ")}`);
  }

  const falta = pendentes(o.ordem, aplicadas);

  if (falta.length === 0) {
    o.log("Nenhuma migracao pendente.");
    return [];
  }

  for (const arquivo of falta) {
    if (o.simular) {
      o.log(`[simulacao] aplicaria ${arquivo}`);
      continue;
    }
    o.log(`Aplicando ${arquivo}`);
    const sql = await o.lerArquivo(arquivo);
    try {
      await o.consultar(sql);
    } catch (erro) {
      throw new Error(`Falhou em ${arquivo}: ${(erro as Error).message}`);
    }
    await o.consultar(sqlRegistrar([arquivo]));
  }
  return falta;
}

/**
 * Compara o banco ao vivo com a baseline versionada. Em prod, depois de migrar:
 * e a unica medida de prod que existe — o gate `drift` so le dev. Pega migracao
 * semeada no bootstrap que nunca rodou de fato e baseline contaminada por outro PR.
 */
export async function conferirBaseline(
  consultar: Consulta,
  baseline: Assinatura,
  allowlist: EntradaAllowlist[],
): Promise<Resultado> {
  const linhas = await consultar("select kind, nome, sig from public.schema_signature();");
  const aoVivo: Assinatura = {};
  for (const l of linhas) aoVivo[`${String(l.kind)}|${String(l.nome)}`] = String(l.sig);
  return diffAssinaturas(baseline, aoVivo, allowlist);
}

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function principal(): Promise<number> {
  const alvo = argumento("--alvo");
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = lerProjetos(process.env.ADVISOR_PROJECT_REFS).find((p) => p.rotulo === alvo)?.ref;
  if (!alvo || !token || !ref) {
    console.error(
      "Uso: apply-migrations.ts --alvo <dev|prod> [--seed-from arquivo] [--simular]\n" +
        "Precisa de SUPABASE_ACCESS_TOKEN e de ADVISOR_PROJECT_REFS com o rotulo do alvo.",
    );
    return 1;
  }

  const sementeArq = argumento("--seed-from");
  const semente = sementeArq ? lerOrdem(await fs.readFile(sementeArq, "utf8")) : null;
  const consultar = clienteManagementApi(ref, token);
  const aplicados = await aplicar({
    consultar,
    ordem: lerOrdem(await fs.readFile(CAMINHO_ORDEM, "utf8")),
    semente,
    lerArquivo: (relativo) => fs.readFile(path.join(RAIZ, relativo), "utf8"),
    simular: process.argv.includes("--simular"),
    estrito: alvo === "prod",
    log: (l) => console.log(l),
  });

  const resumo = process.env.GITHUB_STEP_SUMMARY;
  if (resumo) {
    const linhas = aplicados.length
      ? [`### Migracoes aplicadas em ${alvo}`, ...aplicados.map((a) => `- \`${a}\``)]
      : [`### Nenhuma migracao pendente em ${alvo}`];
    await fs.appendFile(resumo, `${linhas.join("\n")}\n`);
  }

  if (process.argv.includes("--conferir-baseline")) {
    const [baseline, allowlist] = await Promise.all([carregarBaseline(), carregarAllowlist()]);
    const r = await conferirBaseline(consultar, baseline.objetos, allowlist);
    console.log(`Schema de ${alvo} x deploy/supabase/schema-baseline.json:`);
    console.log(formatarRelatorio(r));
    if (r.bloqueantes.length > 0) {
      console.error(
        `${alvo} diverge da baseline. Migracao semeada que nunca rodou, objeto criado a mao ` +
          "ou baseline gerada com migracao de outro PR — conferir por SQL antes de seguir.",
      );
      return 1;
    }
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().then(
    (codigo) => process.exit(codigo),
    (erro: unknown) => {
      console.error(erro instanceof Error ? erro.message : erro);
      process.exit(1);
    },
  );
}
