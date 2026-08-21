import type { APIRequestContext } from "@playwright/test";

/**
 * Fixtures das rotas dinamicas: quem sabe transformar `[id]` num id que EXISTE.
 *
 * Existe desde 21/08/2026. Ate aqui a suite cobria as LISTAS e ignorava os
 * DETALHES — editor de pagina, campanha, cliente no /admin — porque
 * `coletarRotas` pulava `[id]` por precisar de um id real. Sao justamente as
 * telas onde o produto acontece, e tres cards do quadro nao tinham como ser
 * provados por falta disto.
 *
 * O registro e criado pela API do proprio app, com a sessao do usuario de QA:
 * o `tenant_id` sai da sessao, entao nao ha como o fixture nascer no tenant
 * errado — o que uma insercao direta no banco tornaria possivel.
 *
 * A MARCA e o que faz o teste medir alguma coisa. Sem ela, "a rota respondeu
 * 200" convive com a tela em branco, e um id inexistente daria o mesmo verde
 * que um id valido (a armadilha de 17/08: duas causas para a mesma resposta).
 * Cada fixture declara um texto que so aparece se a tela carregou AQUELE
 * registro, e o spec cobra os dois lados: presente com o id do fixture, ausente
 * com o id que nao existe.
 */

/** Onde procurar a marca: texto na pagina ou valor preenchido num campo. */
export type Marca = { tipo: "texto" | "campo"; valor: string };

export type RegistroDeFixture = {
  /** O que entra no lugar do segmento dinamico. */
  valor: string;
  marca: Marca;
  /** Devolve o ambiente ao estado anterior. */
  apagar(): Promise<void>;
};

export type FixtureDinamica = {
  criar(request: APIRequestContext): Promise<RegistroDeFixture>;
  /**
   * O controle. Precisa ser um id bem-formado que nao existe: um id malformado
   * poderia ser recusado antes do lookup, e ai o contraste mediria validacao de
   * formato em vez de "achou o registro".
   */
  inexistente: string;
};

/** UUID fixo, fora de qualquer sequencia real; a rota tem que nao achar nada. */
const UUID_INEXISTENTE = "00000000-0000-4000-8000-0000000e2e00";

async function json<T>(request: APIRequestContext, url: string): Promise<T> {
  const res = await request.get(url);
  if (!res.ok()) throw new Error(`GET ${url} respondeu ${res.status()}`);
  return (await res.json()) as T;
}

// ---------------------------------------------------------------- paginas

/**
 * Headline fixa de proposito: `/api/pages/[id]` nao tem DELETE (excluir pagina
 * nao existe no produto), entao criar uma pagina por execucao encheria o tenant
 * de QA de lixo — uma pagina orfa por run de CI, para sempre. Em vez disso a
 * fixture e reaproveitada: procura a pagina pela marca e so cria se nao achar.
 * O `apagar` fica no-op documentado, nao esquecido.
 */
const MARCA_DA_PAGINA = "Fixture E2E de rota dinamica";

type LandingPageResumo = { id: string; content?: { headline?: unknown } | null };
type TemplateResumo = { id: string; slug: string };

/** No editor a headline vive num campo preenchido, nao em texto solto. */
const MARCA_PAGINA: Marca = { tipo: "campo", valor: MARCA_DA_PAGINA };

const fixturePagina: FixtureDinamica = {
  inexistente: UUID_INEXISTENTE,
  async criar(request) {
    const existentes = await json<LandingPageResumo[]>(request, "/api/pages");
    const jaExiste = Array.isArray(existentes)
      ? existentes.find((p) => p?.content?.headline === MARCA_DA_PAGINA)
      : undefined;

    if (jaExiste) {
      return { valor: jaExiste.id, marca: MARCA_PAGINA, apagar: async () => {} };
    }

    const templates = await json<TemplateResumo[]>(request, "/api/pages/templates");
    // Por slug, nao por posicao: `[0]` e ordem de criacao, e um seed novo
    // trocaria o modelo em silencio (mesmo motivo do editor de pagina nova).
    const template = templates.find((t) => t.slug === "oferta-impacto") ?? templates[0];
    if (!template) {
      throw new Error("Nenhum template de LP no ambiente; fixture de pagina impossivel.");
    }

    const res = await request.post("/api/pages", {
      data: {
        template_id: template.id,
        content: {
          schema_version: 2,
          store_name: "QA E2E",
          headline: MARCA_DA_PAGINA,
          description: "Pagina criada pela suite E2E para cobrir a rota dinamica do editor.",
          cta: "Entrar no grupo",
          brand_color: "#7c3aed",
          hero: { url: "https://example.com/e2e-hero.jpg", alt: "imagem de teste" },
          benefits: [],
          gallery: [
            { url: "https://example.com/e2e-1.jpg", alt: "galeria de teste 1" },
            { url: "https://example.com/e2e-2.jpg", alt: "galeria de teste 2" },
          ],
        },
      },
    });
    if (!res.ok()) {
      throw new Error(`POST /api/pages respondeu ${res.status()}: ${await res.text()}`);
    }

    const criada = (await res.json()) as { id: string };
    return { valor: criada.id, marca: MARCA_PAGINA, apagar: async () => {} };
  },
};

// -------------------------------------------------------------- campanhas

/**
 * Campanha tem DELETE na API, entao aqui o fixture e criado e apagado de
 * verdade. Nome com sufixo unico: uma campanha esquecida por execucao anterior
 * nao se confunde com a desta.
 */
function fixtureCampanha(): FixtureDinamica {
  return {
    inexistente: "campanha-que-nao-existe-e2e",
    async criar(request) {
      const nome = `E2E rota dinamica ${Date.now().toString(36)}`;
      const res = await request.post("/api/campanhas", { data: { name: nome } });
      if (!res.ok()) {
        throw new Error(`POST /api/campanhas respondeu ${res.status()}: ${await res.text()}`);
      }
      const criada = (await res.json()) as { id: string; slug?: string };
      // A tela casa por slug OU id; o slug e o caminho que a lojista usa.
      const valor = criada.slug ?? criada.id;

      return {
        valor,
        marca: { tipo: "texto", valor: nome },
        apagar: async () => {
          await request.delete(`/api/campanhas?id=${encodeURIComponent(criada.id)}`);
        },
      };
    },
  };
}

/**
 * A tela de EDICAO nao tem estado de "nao encontrada" — com slug invalido ela
 * abre o formulario vazio. Por isso a marca aqui e o nome PREENCHIDO no campo:
 * e a unica diferenca observavel entre carregar a campanha e nao carregar nada.
 */
function fixtureCampanhaEdicao(): FixtureDinamica {
  const base = fixtureCampanha();
  return {
    inexistente: base.inexistente,
    async criar(request) {
      const registro = await base.criar(request);
      return { ...registro, marca: { tipo: "campo", valor: registro.marca.valor } };
    },
  };
}

// --------------------------------------------------------------- squad-os

type SquadResumo = { slug?: string; name?: string };

/**
 * Squad nao se cria pela API do painel; a tela cai num seed local quando o
 * banco esta vazio. O fixture entao DESCOBRE o alvo — usa a squad que o
 * ambiente tiver e, se nao tiver nenhuma, o seed que a propria tela usaria.
 */
const fixtureSquad: FixtureDinamica = {
  inexistente: "squad-que-nao-existe-e2e",
  async criar(request) {
    let squad: SquadResumo | undefined;
    try {
      const lista = await json<SquadResumo[]>(request, "/api/squad-os/squads");
      if (Array.isArray(lista)) squad = lista.find((s) => s?.slug && s?.name);
    } catch {
      squad = undefined;
    }

    const slug = squad?.slug ?? "product";
    const nome = squad?.name ?? "Product Squad";
    return { valor: slug, marca: { tipo: "texto", valor: nome }, apagar: async () => {} };
  },
};

// ------------------------------------------------------------------- mapa

/**
 * Padrao de rota -> fixture. A chave e o padrao que `coletarRotasDinamicas`
 * devolve, e o spec cobra que TODO padrao varrido esteja aqui: rota dinamica
 * nova sem fixture quebra a suite em vez de nascer sem cobertura, que foi
 * exatamente como este buraco surgiu.
 */
export const FIXTURES_DINAMICAS: Record<string, FixtureDinamica> = {
  "/painel/pages/[id]": fixturePagina,
  "/painel/campanhas/[slug]": fixtureCampanha(),
  "/painel/campanhas/[slug]/editar": fixtureCampanhaEdicao(),
  "/painel/squad-os/squads/[slug]": fixtureSquad,
};

/** Troca o segmento dinamico do padrao pelo valor real. */
export function montarUrl(padrao: string, valor: string): string {
  return padrao.replace(/\[[^\]]+\]/, encodeURIComponent(valor));
}
