/**
 * O que cada tela do painel tem que PROVAR que renderizou.
 *
 * Existe por causa do achado D.3 da auditoria de 22/08/2026: as quatro
 * assercoes do smoke (`status < 400`, shell visivel, `pageerror` vazio, 5xx
 * vazio) ficam TODAS verdes com a tela quebrada. Uma tela que responde 200,
 * monta o shell e renderiza um miolo vazio passa em todas as quatro — foi
 * assim que o B.1 (`/admin/billing` e `/admin/instancias` sem dado) chegou em
 * producao com o CI verde.
 *
 * O registro vive aqui e nao dentro do spec para que a guarda de completude
 * consiga cobrar entrada nova: rota nova aparece na varredura do filesystem e
 * QUEBRA a suite ate alguem declarar o que ela deve mostrar. Sem isso, tela
 * nova nasce sem cobertura em silencio — que e como este buraco nasceu.
 */

/**
 * A fonte de dados da lista principal da tela.
 *
 * A expectativa NAO e escrita a mao ("grupos tem 3 itens"): ela e derivada da
 * API em tempo de execucao. Numero fixo aqui viraria armadilha permanente — foi
 * o que aconteceu com a meta do cartao compartilhavel, que quebrou o CI quando
 * o tenant de QA passou de 51 leads (22/08/2026). Derivando, o teste se ajusta
 * ao ambiente e mesmo assim REPROVA: se a API entrega N registros e a tela nao
 * mostra nenhum, isso e o defeito, nao o ambiente.
 */
export type ListaEsperada = {
  /** Rota de API que alimenta a lista. */
  api: string;
  /**
   * Extrai do JSON o texto que TEM que aparecer na tela. `null` quando a API
   * nao devolveu registro nenhum — ai o teste inverte e cobra o estado-vazio.
   */
  marca: (json: unknown) => string | null;
  /**
   * O texto do estado-vazio da tela.
   *
   * Serve para os dois lados: com dado, ele NAO pode estar na tela (senao a
   * lista renderizou vazia apesar de a API ter entregue); sem dado, ele TEM que
   * estar (prova que a tela decidiu "vazio" em vez de travar no skeleton).
   */
  vazio: RegExp;
};

export type ConteudoEsperado = {
  /**
   * Texto que so existe quando a ROTA renderizou — nao o shell, nao o skeleton,
   * nao a tela de erro.
   *
   * Essa distincao e o ponto: uma tela monta o `<h1>` so depois do fetch
   * resolver, e enquanto carrega mostra caixas cinza. E `/painel`
   * renderiza `<h1>Inicio` TAMBEM no `LoadError` (`dashboard-states.tsx:33`),
   * entao a ancora dele e "Seu ritmo", que so o dashboard cheio tem. Ancora
   * escolhida no cabecalho errado passa com a tela morta.
   */
  ancora: RegExp;
  /** Quando a tela tem lista vinda do servidor. */
  lista?: ListaEsperada;
  /**
   * Justificativa obrigatoria quando a tela NAO tem lista conferivel. Texto, e
   * nao um booleano, para que a proxima pessoa leia o motivo em vez de herdar
   * uma isencao sem procedencia.
   */
  semLista?: string;
};

/**
 * Pega o primeiro texto util de uma lista de registros da API.
 *
 * Tenta varios campos porque as rotas nao tem shape unico (`name` em grupos e
 * campanhas, `slug` em paginas, `email` em membros). O piso de 3 caracteres e
 * proposital: marca curta demais ("Ok", "A") casa com qualquer coisa na pagina
 * e o assert passa sem provar nada.
 */
export function primeiroTexto(json: unknown, ...campos: string[]): string | null {
  if (!Array.isArray(json)) return null;

  for (const item of json) {
    if (!item || typeof item !== "object") continue;
    for (const campo of campos) {
      const valor = (item as Record<string, unknown>)[campo];
      if (typeof valor === "string" && valor.trim().length >= 3) return valor.trim();
    }
  }

  return null;
}

/** Campos de nome usados pelas listas do painel, na ordem de preferencia. */
const NOME = ["name", "title", "label", "slug", "email"];


export const CONTEUDO_ESPERADO: Record<string, ConteudoEsperado> = {
  "/painel": {
    // NAO "Inicio": `dashboard-states.tsx` renderiza esse mesmo <h1> na tela de
    // erro, entao ele passaria com o dashboard sem ter carregado nada.
    ancora: /Seu ritmo/,
    lista: {
      api: "/api/groups",
      marca: (j) => primeiroTexto(j, ...NOME),
      vazio: /Nenhum grupo/i,
    },
  },

  "/painel/agenda": {
    ancora: /Campanhas/,
    semLista: "Redirect para /painel/campanhas (a agenda foi incorporada la); quem confere e ela.",
  },

  "/painel/automacoes": {
    ancora: /Automações/,
    lista: {
      api: "/api/automations",
      marca: (j) => primeiroTexto(j, ...NOME),
      vazio: /Nenhuma automação/i,
    },
  },

  "/painel/biblioteca": {
    ancora: /Biblioteca/,
    semLista: "As copies sao constante do bundle (lib/library-copies), nao dado de servidor.",
  },

  "/painel/campanhas": {
    ancora: /Campanhas/,
    lista: {
      api: "/api/campanhas",
      marca: (j) => primeiroTexto(j, ...NOME),
      vazio: /Nenhuma campanha/i,
    },
  },

  "/painel/campanhas/nova": {
    ancora: /Nova campanha/,
    semLista: "Formulario de criacao; nao lista registro existente.",
  },

  "/painel/conectar": {
    ancora: /Como conectar/,
    semLista:
      "Depende da Evolution, que nao existe no ambiente de teste — o 502 do POST /api/instances ja esta tolerado em sessao-helpers.ts.",
  },

  "/painel/configuracoes": {
    ancora: /Configurações/,
    // A lista de membros existe, mas mora atras da aba "Equipe" (`section ===
    // "Equipe"`, page.tsx:295) e nao esta no DOM quando a tela carrega. Cobrar
    // ela daqui exigiria clicar na aba — isso e teste de fluxo, nao smoke de
    // renderizacao, e `equipe-convite.spec.ts` ja e o lugar dele.
    semLista: "A lista de membros so renderiza depois de abrir a aba Equipe; ver equipe-convite.spec.ts.",
  },

  "/painel/configuracoes/cancelar": {
    ancora: /Tem certeza que quer cancelar/,
    semLista: "Mostra agregados do tenant, nao lista; a ancora ja prova que saiu do skeleton.",
  },

  "/painel/contatos": {
    ancora: /Contatos/,
    lista: {
      api: "/api/leads",
      marca: (j) => primeiroTexto(j, ...NOME, "phone"),
      vazio: /Nenhum contato/i,
    },
  },

  "/painel/dev-tools": {
    // A tela troca de cara conforme o gate; as duas contam como "renderizou".
    ancora: /Developer Tools|Bloqueado/,
    semLista: "Ferramenta interna, sem lista de dado do tenant.",
  },

  "/painel/disparos": {
    ancora: /Disparos/,
    lista: {
      api: "/api/disparos",
      marca: (j) => primeiroTexto(j, ...NOME),
      vazio: /Nenhum disparo/i,
    },
  },

  "/painel/grupos": {
    ancora: /Grupos/,
    lista: {
      api: "/api/groups",
      marca: (j) => primeiroTexto(j, ...NOME),
      vazio: /Nenhum grupo/i,
    },
  },

  "/painel/indicacao": {
    ancora: /Indicação/,
    semLista: "O retorno e objeto ({config, ranking}), nao lista plana; a ancora cobre a tela.",
  },

  "/painel/pages": {
    ancora: /Páginas/,
    lista: {
      api: "/api/pages",
      marca: (j) => primeiroTexto(j, ...NOME),
      vazio: /Nenhuma página/i,
    },
  },

  "/painel/pages/nova": {
    ancora: /Nova página/,
    semLista: "Formulario de criacao; nao lista registro existente.",
  },

  "/painel/resultados": {
    ancora: /Resultados/,
    semLista:
      "Agrega leads/pedidos/cliques em numeros; a lista dela depende de campanha, que /painel/campanhas ja confere.",
  },

};
