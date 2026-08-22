/**
 * Gate de drift de schema entre os dois bancos Supabase (D.4 da auditoria de
 * 22/08/2026).
 *
 * O problema que ele resolve: o E2E roda contra o Supabase de DEV. Enquanto o
 * schema de dev diferir do de prod, a suite verde nao e evidencia sobre
 * producao — e mover card para `no_ar_verificado` com base nela e falso
 * positivo por construcao. Foi assim que passou o B.1 (duas colunas que so
 * existiam em dev; em prod a tela mostrava MRR R$ 0,00 sem nenhum erro).
 *
 * Como ele alcanca os dois bancos sem chave de producao no CI: a assinatura de
 * PROD e versionada em `deploy/supabase/schema-baseline.json`, gerada por quem
 * tem as credenciais (`npm run schema:baseline`). O CI conecta so em DEV e
 * compara com o arquivo. O custo dessa escolha e que a baseline envelhece — por
 * isso ela carrega `gerado_em` e o gate avisa quando passa de AVISO_DIAS.
 *
 * Contrato: ESPELHO. Os dois bancos tem os mesmos objetos com a mesma forma.
 * Excecao so via `deploy/supabase/drift-allowlist.json`, com motivo e prazo.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** "t|plans" ou "f|move_card(...)" -> md5 da forma do objeto. */
export type Assinatura = Record<string, string>;

export type Baseline = {
  gerado_em: string;
  projeto: string;
  objetos: Assinatura;
};

export type EntradaAllowlist = {
  objeto: string;
  motivo: string;
  desde: string;
  prazo: string;
};

export type TipoDivergencia = "faltando_em_dev" | "faltando_em_prod" | "forma_diferente";

export type Divergencia = {
  objeto: string;
  tipo: TipoDivergencia;
  detalhe: string;
};

export type Resultado = {
  bloqueantes: Divergencia[];
  toleradas: Divergencia[];
  /** Entradas da allowlist que nao correspondem a nenhuma divergencia real. */
  allowlistOciosa: string[];
};

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const CAMINHO_BASELINE = path.join(RAIZ, "deploy", "supabase", "schema-baseline.json");
export const CAMINHO_ALLOWLIST = path.join(RAIZ, "deploy", "supabase", "drift-allowlist.json");

/** Acima disso a baseline provavelmente nao reflete mais prod. Avisa, nao reprova. */
export const AVISO_DIAS = 30;

const DESCRICAO: Record<TipoDivergencia, string> = {
  faltando_em_dev: "existe em prod, falta em dev",
  faltando_em_prod: "existe em dev, falta em prod",
  forma_diferente: "existe nos dois com forma diferente",
};

/**
 * Compara duas assinaturas. Funcao pura de proposito: e o unico jeito de testar
 * que o gate REPROVA — um gate exercitado so no caminho verde nao prova que
 * barra alguma coisa.
 */
export function diffAssinaturas(
  prod: Assinatura,
  dev: Assinatura,
  allowlist: EntradaAllowlist[],
): Resultado {
  const tolerados = new Set(allowlist.map((e) => e.objeto));
  const usados = new Set<string>();
  const bloqueantes: Divergencia[] = [];
  const toleradas: Divergencia[] = [];

  const registrar = (d: Divergencia) => {
    if (tolerados.has(d.objeto)) {
      usados.add(d.objeto);
      toleradas.push(d);
      return;
    }
    bloqueantes.push(d);
  };

  for (const objeto of Object.keys(prod).sort()) {
    if (!(objeto in dev)) {
      registrar({ objeto, tipo: "faltando_em_dev", detalhe: DESCRICAO.faltando_em_dev });
      continue;
    }
    if (prod[objeto] !== dev[objeto]) {
      registrar({
        objeto,
        tipo: "forma_diferente",
        // Os md5 inteiros nao ajudam a ler o relatorio; o prefixo basta para
        // confirmar que sao mesmo diferentes e casar com uma consulta manual.
        detalhe: `${DESCRICAO.forma_diferente} (prod ${prod[objeto].slice(0, 8)} != dev ${dev[objeto].slice(0, 8)})`,
      });
    }
  }

  // O sentido mais perigoso e este: e o do B.1. Objeto que so existe em dev
  // passa em todo teste local e some em producao.
  for (const objeto of Object.keys(dev).sort()) {
    if (!(objeto in prod)) {
      registrar({ objeto, tipo: "faltando_em_prod", detalhe: DESCRICAO.faltando_em_prod });
    }
  }

  return {
    bloqueantes,
    toleradas,
    allowlistOciosa: allowlist.map((e) => e.objeto).filter((o) => !usados.has(o)).sort(),
  };
}

/** Idade da baseline em dias inteiros. */
export function idadeEmDias(geradoEm: string, agora: Date): number {
  const t = Date.parse(geradoEm);
  if (Number.isNaN(t)) throw new Error(`baseline.gerado_em invalido: ${geradoEm}`);
  return Math.floor((agora.getTime() - t) / 86_400_000);
}

export function formatarRelatorio(r: Resultado): string {
  const linhas: string[] = [];
  if (r.toleradas.length > 0) {
    linhas.push(`Divergencias toleradas (allowlist): ${r.toleradas.length}`);
    for (const d of r.toleradas) linhas.push(`  - ${d.objeto}: ${d.detalhe}`);
  }
  if (r.allowlistOciosa.length > 0) {
    linhas.push("");
    linhas.push("Allowlist ociosa — estas entradas nao correspondem a divergencia nenhuma.");
    linhas.push("Remova-as, senao a allowlist vira cemiterio e para de significar algo:");
    for (const o of r.allowlistOciosa) linhas.push(`  - ${o}`);
  }
  if (r.bloqueantes.length > 0) {
    linhas.push("");
    linhas.push(`DRIFT: ${r.bloqueantes.length} divergencia(s) fora da allowlist`);
    for (const d of r.bloqueantes) linhas.push(`  x ${d.objeto}: ${d.detalhe}`);
  }
  return linhas.join("\n");
}

/**
 * Le a assinatura de um banco via PostgREST. O `information_schema` nao e
 * exposto pelo PostgREST, entao a leitura passa pela RPC `schema_signature()`
 * (migracao 20260822180000). Sem dependencia nova de proposito: em 21/08/2026
 * um import sem dependencia declarada derrubou o deploy de producao por ~4h, e
 * `fetch` e global no Node 22.
 */
export async function buscarAssinatura(url: string, serviceRoleKey: string): Promise<Assinatura> {
  const resposta = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/schema_signature`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  if (!resposta.ok) {
    const corpo = await resposta.text();
    // 404 aqui quase sempre significa "a migracao 20260822180000 nao foi
    // aplicada neste banco", que e erro de operacao e nao de codigo.
    throw new Error(
      `schema_signature() respondeu ${resposta.status}: ${corpo.slice(0, 300)}` +
        (resposta.status === 404
          ? "\nA migracao 20260822180000_schema_signature.sql foi aplicada neste banco?"
          : ""),
    );
  }

  const linhas = (await resposta.json()) as Array<{ kind: string; nome: string; sig: string }>;
  const assinatura: Assinatura = {};
  for (const l of linhas) assinatura[`${l.kind}|${l.nome}`] = l.sig;
  return assinatura;
}

export async function carregarBaseline(caminho = CAMINHO_BASELINE): Promise<Baseline> {
  return JSON.parse(await fs.readFile(caminho, "utf8")) as Baseline;
}

export async function carregarAllowlist(caminho = CAMINHO_ALLOWLIST): Promise<EntradaAllowlist[]> {
  try {
    const bruto = JSON.parse(await fs.readFile(caminho, "utf8")) as { entradas?: EntradaAllowlist[] };
    return bruto.entradas ?? [];
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw erro;
  }
}

function lerAmbiente(): { url: string; chave: string } {
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    throw new Error(
      "Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY apontando para o banco a inspecionar.",
    );
  }
  return { url, chave };
}

/** Ref do projeto a partir da URL (https://<ref>.supabase.co), so para rotular. */
function refDoProjeto(url: string): string {
  return new URL(url).hostname.split(".")[0] ?? "desconhecido";
}

async function gerarBaseline(): Promise<number> {
  const { url, chave } = lerAmbiente();
  const objetos = await buscarAssinatura(url, chave);
  const baseline: Baseline = {
    gerado_em: new Date().toISOString(),
    projeto: refDoProjeto(url),
    objetos,
  };
  await fs.writeFile(CAMINHO_BASELINE, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
  console.log(
    `Baseline gravada: ${path.relative(RAIZ, CAMINHO_BASELINE)} ` +
      `(projeto ${baseline.projeto}, ${Object.keys(objetos).length} objetos)`,
  );
  return 0;
}

async function verificar(): Promise<number> {
  const { url, chave } = lerAmbiente();
  const [baseline, allowlist] = await Promise.all([carregarBaseline(), carregarAllowlist()]);
  const dev = await buscarAssinatura(url, chave);

  const idade = idadeEmDias(baseline.gerado_em, new Date());
  console.log(
    `Baseline de prod: projeto ${baseline.projeto}, ${Object.keys(baseline.objetos).length} objetos, ` +
      `gerada ha ${idade} dia(s).`,
  );
  console.log(`Banco inspecionado: ${refDoProjeto(url)}, ${Object.keys(dev).length} objetos.`);

  if (idade > AVISO_DIAS) {
    // Aviso e nao reprovacao: baseline velha nao e drift, e reprovar por isso
    // travaria PR por motivo que nada tem a ver com o PR.
    console.warn(
      `\nAVISO: a baseline tem ${idade} dias (limite ${AVISO_DIAS}). ` +
        "Se prod mudou desde entao, este gate esta verde por desatualizacao. " +
        "Rode `npm run schema:baseline` com as credenciais de prod.",
    );
  }

  const resultado = diffAssinaturas(baseline.objetos, dev, allowlist);
  const relatorio = formatarRelatorio(resultado);
  if (relatorio) console.log(`\n${relatorio}`);

  if (resultado.bloqueantes.length > 0) {
    console.error(
      "\nO gate reprovou. Ou aplique o objeto no banco que esta atras, ou " +
        "declare a excecao em deploy/supabase/drift-allowlist.json com motivo e prazo.",
    );
    return 1;
  }

  console.log("\nSem drift fora da allowlist.");
  return 0;
}

async function main(): Promise<void> {
  const gerar = process.argv.includes("--gerar-baseline");
  process.exitCode = gerar ? await gerarBaseline() : await verificar();
}

// Mesmo padrao de migrate-legacy-tenant-data.ts: so executa quando chamado
// direto, para que o teste importe as funcoes puras sem disparar rede.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 2;
  });
}
