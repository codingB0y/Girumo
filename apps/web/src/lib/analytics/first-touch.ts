/**
 * Atribuição de PRIMEIRO contato para o signup.
 *
 * Camada pura (sem `server-only`, sem DOM): o client a usa para montar o valor
 * do cookie e a rota de signup para lê-lo. É o único lugar onde o formato do
 * dado é decidido, então cliente e servidor não podem divergir em silêncio.
 *
 * Por que PRIMEIRO contato e não último: quem chega por busca orgânica quase
 * nunca cria conta na mesma visita. Se gravássemos a origem no momento do
 * signup, a resposta seria sempre "acesso direto" ou "/signup", e o canal que
 * de fato trouxe a pessoa — o objetivo inteiro do plano de SEO — desapareceria.
 */

/** 30 dias. Janela de decisão de quem descobre a ferramenta e volta depois. */
export const FIRST_TOUCH_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const FIRST_TOUCH_COOKIE = "gm_ft";

/**
 * Chaves curtas de propósito: o valor vive num cookie enviado em toda
 * requisição, e `utm_campaign` por extenso custaria bytes em cada uma.
 */
export type FirstTouch = {
  /** utm_source, ou o host do referrer externo quando não há utm. */
  s: string | null;
  /** utm_medium. "organic" é inferido quando o referrer é um buscador. */
  m: string | null;
  /** utm_campaign. */
  c: string | null;
  /** Caminho de entrada — a página que trouxe a pessoa. */
  p: string;
};

const FIELD_MAX = 120;
/** Teto do cookie inteiro. Acima disso preferimos não gravar a truncar em algo ilegível. */
const COOKIE_MAX = 512;

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, FIELD_MAX) : null;
}

/** Buscadores que devem virar `organic` quando não há utm na URL. */
const SEARCH_HOSTS = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|brave|yandex)\./i;

export function isSearchEngine(host: string): boolean {
  return SEARCH_HOSTS.test(host);
}

export type FirstTouchInput = {
  /** URL completa da entrada. */
  url: string;
  /** `document.referrer` — vazio quando é acesso direto. */
  referrer: string;
};

/**
 * Monta o primeiro contato. Devolve `null` quando não há sinal nenhum (acesso
 * direto sem utm): gravar um cookie dizendo "não sei" só ocuparia a vaga e
 * impediria uma visita futura COM origem de ser registrada.
 */
export function buildFirstTouch({ url, referrer }: FirstTouchInput): FirstTouch | null {
  let entry: URL;
  try {
    entry = new URL(url);
  } catch {
    return null;
  }

  const source = clean(entry.searchParams.get("utm_source"));
  const medium = clean(entry.searchParams.get("utm_medium"));
  const campaign = clean(entry.searchParams.get("utm_campaign"));

  let referrerHost: string | null = null;
  if (referrer) {
    try {
      const parsed = new URL(referrer);
      // Referrer interno é navegação nossa, não origem. Descartar aqui é o que
      // impede "girumo.com.br" de virar o canal campeão do relatório.
      if (parsed.origin !== entry.origin) referrerHost = parsed.host;
    } catch {
      referrerHost = null;
    }
  }

  if (!source && !medium && !campaign && !referrerHost) return null;

  return {
    s: source ?? referrerHost,
    m: medium ?? (referrerHost && isSearchEngine(referrerHost) ? "organic" : referrerHost ? "referral" : null),
    c: campaign,
    p: `${entry.pathname}${entry.search}`.slice(0, FIELD_MAX),
  };
}

/** Serializa para o cookie. `null` quando o resultado passaria do teto. */
export function serializeFirstTouch(value: FirstTouch): string | null {
  const encoded = encodeURIComponent(JSON.stringify(value));
  return encoded.length > COOKIE_MAX ? null : encoded;
}

/**
 * Lê o cookie. Nunca lança: o valor vem do browser e pode ter sido editado à
 * mão. Um signup não pode falhar porque a atribuição veio corrompida.
 */
export function parseFirstTouch(raw: string | null | undefined): FirstTouch | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw));
    if (!parsed || typeof parsed !== "object") return null;
    const value = parsed as Record<string, unknown>;
    if (typeof value.p !== "string") return null;
    return {
      s: clean(value.s as string),
      m: clean(value.m as string),
      c: clean(value.c as string),
      p: clean(value.p) ?? "/",
    };
  } catch {
    return null;
  }
}
