/**
 * Gate de advisors de seguranca do Supabase, nos DOIS bancos.
 *
 * Por que existe: em 30/08/2026 o advisor foi quem achou DUAS falhas reais de
 * autorizacao que nenhum outro gate pegava. `confirm_lp_capture` e
 * `record_lp_tracking_event` (PR #190) eram `security definer` recebendo
 * `tenant_id` como PARAMETRO com EXECUTE para `authenticated` — qualquer usuario
 * logado escrevia na base de outro lojista. E `funnel_tenant_matrix` devolvia a
 * lista de todos os tenants, com e-mail de cliente, para qualquer usuario logado.
 *
 * O gate de drift NAO cobre isso: `public.schema_signature()` hasheia
 * `pg_get_function_result | prosecdef | provolatile`, e ACL nao entra. Privilegio
 * e exatamente a dimensao em que os dois bancos divergem em silencio — dev ficou
 * 10 dias com o grant sobrando sem ninguem notar. Ate aqui, quem rodava o advisor
 * era uma pessoa lembrando de rodar, e gate que so roda quando alguem lembra e
 * gate que nao pega regressao.
 *
 * CONTRATO: falha so no lint NOVO. Os ja conhecidos vivem em
 * `deploy/supabase/advisors-allowlist.json` com motivo e prazo. Isso e
 * deliberado: `--fail-on warn` puro deixaria o gate cronicamente vermelho (havia
 * 4 lints conhecidos em prod no dia em que este arquivo nasceu), e gate sempre
 * vermelho e gate que o time aprende a ignorar — o mesmo raciocinio que ja esta
 * escrito no `verify.yml` sobre job sem segredo.
 *
 * Sem dependencia nova de proposito: `fetch` e global no Node 22. Em 21/08/2026
 * um import sem dependencia declarada derrubou o deploy de producao por ~4h.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Um lint como a Management API devolve. */
export type Lint = {
  name: string;
  title: string;
  level: string;
  detail: string;
  /** Identidade estavel do lint + objeto. E a chave usada pela allowlist. */
  cacheKey: string;
  metadata?: { name?: string; schema?: string };
};

export type EntradaAllowlist = {
  /** `cacheKey` do lint tolerado. */
  lint: string;
  motivo: string;
  desde: string;
  prazo: string;
};

export type Achado = { projeto: string; lint: Lint };

export type Resultado = {
  bloqueantes: Achado[];
  tolerados: Achado[];
  /** Entradas da allowlist que nao correspondem a nenhum lint real (ja resolvido). */
  allowlistOciosa: string[];
};

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const CAMINHO_ALLOWLIST = path.join(
  RAIZ,
  "deploy",
  "supabase",
  "advisors-allowlist.json",
);

/**
 * Le a lista de projetos de `ADVISOR_PROJECT_REFS`, no formato
 * `rotulo=ref,rotulo=ref`. Os refs NAO ficam hardcoded aqui de proposito: o ref
 * de producao e o hostname publico da API, e o repositorio e publico desde
 * 31/08/2026.
 */
export function lerProjetos(bruto: string | undefined): Array<{ rotulo: string; ref: string }> {
  if (!bruto) return [];
  return bruto
    .split(",")
    .map((par) => par.trim())
    .filter((par) => par !== "")
    .map((par) => {
      const [rotulo, ref] = par.split("=").map((parte) => parte.trim());
      if (!rotulo || !ref) {
        throw new Error(
          `ADVISOR_PROJECT_REFS malformado em "${par}". Formato esperado: dev=abc123,prod=xyz789`,
        );
      }
      return { rotulo, ref };
    });
}

export async function buscarLints(ref: string, token: string): Promise<Lint[]> {
  const resposta = await fetch(`https://api.supabase.com/v1/projects/${ref}/advisors/security`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(
      `advisors/security respondeu ${resposta.status} para o projeto ${ref}: ${corpo.slice(0, 300)}` +
        (resposta.status === 401 || resposta.status === 403
          ? "\nO SUPABASE_ACCESS_TOKEN tem acesso a este projeto?"
          : ""),
    );
  }

  const corpo = (await resposta.json()) as { lints?: Lint[]; results?: Lint[] };
  return corpo.lints ?? corpo.results ?? [];
}

export async function carregarAllowlist(caminho = CAMINHO_ALLOWLIST): Promise<EntradaAllowlist[]> {
  try {
    const bruto = JSON.parse(await fs.readFile(caminho, "utf8")) as {
      entradas?: EntradaAllowlist[];
    };
    return bruto.entradas ?? [];
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw erro;
  }
}

export function diffLints(achados: Achado[], allowlist: EntradaAllowlist[]): Resultado {
  const tolerados = new Set(allowlist.map((entrada) => entrada.lint));
  const vistos = new Set(achados.map((achado) => achado.lint.cacheKey));

  return {
    bloqueantes: achados.filter((achado) => !tolerados.has(achado.lint.cacheKey)),
    tolerados: achados.filter((achado) => tolerados.has(achado.lint.cacheKey)),
    allowlistOciosa: [...tolerados].filter((chave) => !vistos.has(chave)),
  };
}

export function formatarRelatorio(resultado: Resultado): string {
  const linhas: string[] = [];

  if (resultado.bloqueantes.length > 0) {
    linhas.push(`ADVISOR: ${resultado.bloqueantes.length} lint(s) de seguranca fora da allowlist`);
    for (const { projeto, lint } of resultado.bloqueantes) {
      const alvo = lint.metadata?.name ? `${lint.metadata.schema}.${lint.metadata.name}` : "";
      linhas.push(`  x [${projeto}] ${lint.name}${alvo ? ` -> ${alvo}` : ""}`);
      linhas.push(`      ${lint.detail.replace(/`/g, "").slice(0, 200)}`);
      linhas.push(`      allowlist: "${lint.cacheKey}"`);
    }
  }

  if (resultado.tolerados.length > 0) {
    linhas.push(`\n${resultado.tolerados.length} lint(s) tolerado(s) pela allowlist.`);
  }

  if (resultado.allowlistOciosa.length > 0) {
    linhas.push(
      `\nAllowlist ociosa (o lint sumiu — apague a linha): ${resultado.allowlistOciosa.join(", ")}`,
    );
  }

  return linhas.join("\n");
}

async function principal(): Promise<number> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const projetos = lerProjetos(process.env.ADVISOR_PROJECT_REFS);

  // Mesmo padrao do job `drift`: sem credencial o gate vira aviso, nao vermelho.
  // CI vermelho por falta de segredo ensina o time a ignorar o gate.
  if (!token || projetos.length === 0) {
    console.warn(
      "Gate de advisors pulado: defina SUPABASE_ACCESS_TOKEN e " +
        "ADVISOR_PROJECT_REFS (formato dev=abc123,prod=xyz789).",
    );
    return 0;
  }

  const achados: Achado[] = [];
  for (const { rotulo, ref } of projetos) {
    const lints = await buscarLints(ref, token);
    console.log(`${rotulo}: ${lints.length} lint(s) de seguranca.`);
    for (const lint of lints) achados.push({ projeto: rotulo, lint });
  }

  const resultado = diffLints(achados, await carregarAllowlist());
  const relatorio = formatarRelatorio(resultado);
  if (relatorio) console.log(`\n${relatorio}`);

  if (resultado.bloqueantes.length > 0) {
    console.error(
      "\nO gate reprovou. Corrija o lint, ou declare a excecao em " +
        "deploy/supabase/advisors-allowlist.json com motivo e prazo.",
    );
    return 1;
  }

  console.log("\nSem lint de seguranca fora da allowlist.");
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal()
    .then((codigo) => {
      process.exitCode = codigo;
    })
    .catch((erro) => {
      console.error(erro instanceof Error ? erro.message : erro);
      process.exitCode = 2;
    });
}
