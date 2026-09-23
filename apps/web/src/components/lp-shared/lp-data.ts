import { LP3_FAQ, PLANS } from "@/components/lp3/landing-data";

/** As três landings que usam a base comum: `/` (cartaz), `/automatico` (piloto) e `/44eBras` (atacado). */
export type LpVariant = "cartaz" | "piloto" | "atacado";

/** Maior desconto do anual entre os planos — sai de PLANS, não é digitado. */
export const MAX_OFF = Math.max(...PLANS.map((p) => Math.round((1 - p.annualPrice / p.price) * 100)));

export const PERGUNTA_ANUAL = "Como funciona o plano anual?";

/**
 * A resposta do anual herdada do LP3_FAQ tem preço digitado ("R$ 197 em vez de
 * R$ 297", "voltam R$ 1.473"). Aqui ela é refeita a partir de PLANS, com a mesma
 * regra do reembolso: os meses usados passam a valer o preço mensal.
 */
function respostaAnual(): string {
  const plano = PLANS.find((p) => p.featured) ?? PLANS[0];
  const mesesUsados = 3;
  const devolvido = plano.annualPrice * 12 - mesesUsados * plano.price;
  return (
    `Você paga 1x ao ano e o mês sai até ${MAX_OFF}% mais barato — no ${plano.name}, R$ ${plano.annualPrice} em vez de R$ ${plano.price}. ` +
    "Se cancelar no meio do caminho, devolvemos os meses não usados: os meses que você usou passam a valer o preço mensal e o resto volta pra você. " +
    `Cancelando o ${plano.name} anual depois de ${mesesUsados} meses, por exemplo, voltam R$ ${devolvido.toLocaleString("pt-BR")}.`
  );
}

/**
 * FAQ das landings novas: o da home anterior (LP3_FAQ) com a pergunta do risco
 * do número em 2º lugar, logo depois de "Preciso trocar de número?" — é a
 * objeção que vem em seguida na cabeça de quem vive do próprio WhatsApp.
 * O JSON-LD de FAQ da home é montado daqui, então página e dado estruturado
 * nunca divergem.
 */
export const LP_FAQ: ReadonlyArray<readonly [string, string]> = [
  ...LP3_FAQ.slice(0, 1),
  [
    "Meu número corre risco?",
    "A Girumo só posta em grupo que você administra e nunca manda mensagem no privado — disparo em massa no privado é o que mais derruba número. Os envios seguem um ritmo seguro pra cada número, sem você configurar nada, e se o celular desconectar você recebe um aviso por e-mail.",
  ],
  ...LP3_FAQ.slice(1).map(([pergunta, resposta]): readonly [string, string] =>
    pergunta === PERGUNTA_ANUAL ? [pergunta, respostaAnual()] : [pergunta, resposta],
  ),
];

export interface LpFoto {
  src: string;
  alt: string;
  width: number;
  height: number;
}

/**
 * Fotos reais do Saldão da Mega Stock — as únicas liberadas para as landings.
 * Tamanhos conferidos nos arquivos de `public/`. O enquadramento (object-position)
 * fica com quem usa, porque muda com o recorte: a fachada vai a 50% 78% no
 * herói do desktop e a 50% 62% no do celular.
 *
 * Chaves do briefing → aqui: fila-fachada-saldao → filaFachada,
 * loja-cheia-1 → lojaCheia, fila-calcada-rua → filaCalcada,
 * fila-dentro → filaDentro, clientes-na-arara → clientesNaArara
 * (a "foto do produto" dentro das bolhas de WhatsApp).
 */
export const FOTOS = {
  filaFachada: {
    src: "/lp/saldao/fila-fachada.webp",
    alt: "Clientes em fila na porta da Mega Stock no dia do Saldão",
    width: 1080,
    height: 1920,
  },
  lojaCheia: {
    src: "/lp/saldao/loja-cheia.webp",
    alt: "Loja da Mega Stock cheia de clientes durante o Saldão",
    width: 1080,
    height: 1920,
  },
  filaCalcada: {
    src: "/lp/saldao/fila-calcada.webp",
    alt: "Fila de clientes pela calçada antes da loja abrir",
    width: 590,
    height: 740,
  },
  filaDentro: {
    src: "/lp/saldao/fila-dentro.webp",
    alt: "Clientes em fila dentro da loja com peças na mão",
    width: 1080,
    height: 1920,
  },
  clientesNaArara: {
    src: "/lp/saldao/clientes-na-arara.webp",
    alt: "Clientes escolhendo roupas na arara da Mega Stock",
    width: 1080,
    height: 1920,
  },
} as const satisfies Record<string, LpFoto>;

/** Print real da lista de grupos "Saldão Mega Stock" no WhatsApp. */
export const PRINT_GRUPOS: LpFoto = {
  src: "/lp3/grp-2.webp",
  alt: "Print real dos grupos Saldão Mega Stock no WhatsApp",
  width: 760,
  height: 1646,
};
