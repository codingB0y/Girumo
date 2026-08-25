import { createClient } from "@supabase/supabase-js";

/**
 * O que cada tela de /admin tem que PROVAR que renderizou. D.2 da auditoria de
 * 22/08/2026.
 *
 * Irmao de conteudo-esperado.ts, com uma diferenca estrutural: as telas de
 * /painel buscam dado por rotas /api/*, entao la a expectativa e derivada da
 * resposta que o browser ve. As 12 telas de /admin sao server components que
 * chamam `getSupabaseAdmin()` direto — a chamada NUNCA passa pelo browser, e
 * nao ha resposta para observar. A verdade de base tem que vir do banco.
 *
 * Por que nao basta a ancora (o `<h1>`): foi exatamente isso que o B.1 mostrou.
 * `/admin/billing` renderizou `<h1>Billing` com MRR R$ 0,00 e
 * `/admin/instancias` renderizou `<h1>Instancias WhatsApp` com "nao ha nenhuma"
 * — as duas com o banco cheio, e sem um unico erro no log. Uma assercao de
 * cabecalho teria passado nas duas. A ancora prova que a ROTA renderizou; a
 * contagem prova que ela renderizou O DADO.
 */

const URL_SUPABASE = process.env.E2E_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const CHAVE_SERVICE_ROLE =
  process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const TEM_ACESSO_AO_BANCO = Boolean(URL_SUPABASE && CHAVE_SERVICE_ROLE);

/**
 * Conta linhas com a service-role — o mesmo papel que a propria tela usa, entao
 * o numero aqui e o numero que a tela tinha para mostrar. Contar com `anon` daria
 * sempre zero desde 22/08/2026, quando o privilegio dele foi revogado (A.2).
 */
export async function contarNoBanco(tabela: string): Promise<number> {
  const supabase = createClient(URL_SUPABASE, CHAVE_SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { count, error } = await supabase.from(tabela).select("*", { count: "exact", head: true });
  if (error) throw new Error(`nao consegui contar ${tabela} no banco de dev: ${error.message}`);
  return count ?? 0;
}

export type ContagemEsperada = {
  /** Tabela que alimenta a lista principal da tela. */
  tabela: string;
  /**
   * Texto do estado-vazio da tela.
   *
   * Cobra os dois lados: com linha no banco ele NAO pode aparecer (senao a tela
   * renderizou vazia apesar de haver dado — o defeito do B.1); com o banco
   * vazio ele TEM que aparecer (prova que a tela decidiu "vazio" em vez de
   * travar no skeleton).
   */
  vazio: RegExp;
};

export type ConteudoAdmin = {
  /**
   * Texto que so existe quando a ROTA renderizou. Nao serve texto do shell nem
   * da sidebar: `.admin-root` monta antes de a pagina resolver.
   */
  ancora: RegExp;
  /** Quando a tela tem lista conferivel contra o banco. */
  contagem?: ContagemEsperada;
  /** Justificativa obrigatoria quando nao ha lista conferivel. Texto, e nao `true`,
   *  para que a decisao fique escrita e revisavel no diff. */
  semLista?: string;
};

export const CONTEUDO_ESPERADO_ADMIN: Record<string, ConteudoAdmin> = {
  "/admin": {
    ancora: /Dashboard da Plataforma/,
    semLista: "Agregados (contadores e graficos), nao lista. Coberto pelas telas de origem.",
  },
  "/admin/agentes": {
    ancora: /Agentes de IA/,
    // Conferido em 25/08: a tela renderiza AGENTS_CATALOG, uma constante do
    // proprio arquivo (`admin/agentes/page.tsx:18`). `agent_configs` alimenta so
    // os agregados (total de execucoes, quantos ativos), e nao ha estado-vazio
    // nenhum — o catalogo sempre aparece. Declarar contagem aqui cobrava um
    // texto que a tela nunca mostra.
    semLista: "Catalogo fixo no codigo (AGENTS_CATALOG); agent_configs so alimenta agregados.",
  },
  "/admin/alertas": {
    ancora: /Alertas/,
    contagem: { tabela: "admin_alerts", vazio: /Nenhum alerta|nenhum alerta/ },
  },

  // As duas telas do B.1. Sao a razao de este arquivo existir.
  "/admin/billing": {
    ancora: /Billing/,
    contagem: { tabela: "subscriptions", vazio: /Nenhuma assinatura encontrada/ },
  },
  "/admin/instancias": {
    ancora: /Inst[âa]ncias WhatsApp/,
    // O texto e "Nenhuma instancia encontrada." (`admin/instancias/page.tsx:69`).
    // A primeira versao deste arquivo usou /nao ha nenhuma/, que veio de outro
    // trecho da mesma pagina e nunca casaria — o CI pegou na primeira execucao,
    // que e exatamente para isso que ele serve.
    contagem: { tabela: "instances", vazio: /Nenhuma inst[âa]ncia encontrada/ },
  },

  "/admin/configuracoes": {
    ancora: /Configura[çc][õo]es/,
    semLista: "Formulario de configuracao da plataforma, sem lista vinda do banco.",
  },
  "/admin/funil": {
    ancora: /Funil de Convers[ãa]o/,
    semLista:
      "Agregado por etapa a partir de funnel_events; a contagem de linhas nao " +
      "corresponde ao que a tela mostra (ela conta eventos por nome, nao registros).",
  },
  "/admin/logs": {
    ancora: /Logs/,
    contagem: { tabela: "logs", vazio: /Nenhum (log|evento)|nenhum (log|evento)/ },
  },
  "/admin/quadro": {
    ancora: /Quadro/,
    // Nao e descuido: o quadro le `board_features` do Supabase de PRODUCAO
    // (ver CLAUDE.md). Contra dev a tela nasce legitimamente vazia, entao cobrar
    // dado aqui reprovaria por ambiente, nao por defeito.
    semLista: "Le board_features de PRODUCAO; contra o banco de dev fica vazio por desenho.",
  },
  "/admin/saude": {
    ancora: /Sa[úu]de da Plataforma/,
    semLista: "Indicadores de saude calculados na hora, sem lista persistida.",
  },
  "/admin/tenants": {
    ancora: /Tenants/,
    contagem: { tabela: "organizations", vazio: /Nenhum tenant|nenhuma organiza/i },
  },
  "/admin/usuarios": {
    ancora: /Usu[áa]rios/,
    contagem: { tabela: "users", vazio: /Nenhum usu[áa]rio|nenhum usu[áa]rio/ },
  },
};
