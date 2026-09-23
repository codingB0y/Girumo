import { LP3_FAQ } from "@/components/lp3/landing-data";

/** As três landings que usam a base comum: `/` (cartaz), `/automatico` (piloto) e `/44eBras` (atacado). */
export type LpVariant = "cartaz" | "piloto" | "atacado";

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
    "A Girumo só posta em grupo que você administra e nunca manda mensagem no privado — disparo em massa no privado é o que mais derruba número. Os envios seguem um ritmo seguro pra cada número, sem você configurar nada, e se o celular desconectar você recebe o aviso na hora.",
  ],
  ...LP3_FAQ.slice(1),
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
