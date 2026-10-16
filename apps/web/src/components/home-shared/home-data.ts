import { PLANS, type Plan } from "@/components/lp3/landing-data";
import { MAX_OFF } from "@/components/lp-shared/lp-data";

/**
 * Dados das duas homes de 15/10/2026: a Vitrine (V4) em "/" e a Produto (V3) em
 * "/page2". Mockups aprovados no canvas "Girumo Home": V4P e V3P, 1440 e 390.
 * Fontes em girumo-design-refs/home-2026-10-15/v3-v4-paginas.
 */

export type NomePlano = "Essencial" | "Growth" | "Operação";

/** Plano pelo nome. Falha alto se ele sumir de PLANS: a página inteira depende dele. */
export function plano(nome: NomePlano): Plan {
  const encontrado = PLANS.find((p) => p.name === nome);
  if (!encontrado) throw new Error(`Plano ${nome} não está em PLANS`);
  return encontrado;
}

/** Quanto o anual economiza num ano, em reais: (mensal − anual por mês) × 12. */
export function economiaAnual(p: Pick<Plan, "price" | "annualPrice">): number {
  return (p.price - p.annualPrice) * 12;
}

/**
 * "R$ 1.200": milhar com ponto, sem centavos (os preços da Girumo são inteiros).
 * O espaço depois do "R$" é inseparável: no fim da linha, "R$ / 297" partia o valor.
 */
export function reais(valor: number): string {
  return `R$\u00a0${valor.toLocaleString("pt-BR")}`;
}

export type Pergunta = readonly [pergunta: string, resposta: string];

/**
 * As perguntas das duas homes. A home publica estas mesmas no JSON-LD de FAQ:
 * o dado estruturado tem que ser o que está visível na página.
 */
export const HOME_FAQ: readonly Pergunta[] = [
  [
    "Preciso trocar de número?",
    "Não. Você lê um QR Code com o seu número de sempre, como no WhatsApp Web. No Growth e no Operação dá pra conectar um segundo número de reserva.",
  ],
  [
    "Já tenho os grupos cheios. Aproveito?",
    "Aproveita. Conecta o número, marca quais grupos a Girumo organiza e sincroniza. Eles entram com a lotação de cada um.",
  ],
  [
    "Meu número corre algum risco?",
    "A Girumo só posta em grupo que você administra, nunca no privado, e controla o ritmo dos envios sem você configurar nada. Se o celular desconectar, você recebe um e-mail.",
  ],
  [
    "É difícil de montar?",
    "Conectar é ler um QR Code. Depois é colar o link na bio e agendar o primeiro post, e isso cabe na primeira tarde do teste.",
  ],
  [
    "E se eu não gostar?",
    "Você testa 7 dias com tudo liberado. Se cancelar antes do 8º dia, não paga nada. Depois, cancela quando quiser em Configurações.",
  ],
  [
    "Vocês fazem o anúncio pra mim?",
    "Não. A gente mostra o funil do anúncio até a venda e o custo de cada venda. Quem roda o anúncio é você ou a sua agência.",
  ],
  [
    "Serve pro meu ramo?",
    "Se a sua venda acontece em grupo de WhatsApp, serve: suplemento, cosmético, calçado, pet, mercado, eletrônico, atacado.",
  ],
  [
    "Posso pagar no Pix?",
    `Por enquanto, não. A assinatura é no cartão, mensal ou anual. No anual o mês sai até ${MAX_OFF}% mais barato.`,
  ],
];

export interface ImagemHome {
  src: string;
  width: number;
  height: number;
}

/**
 * Prints do painel atual (capturados em produção em 15/10/2026, loja piloto
 * renomeada para "Loja Exemplo" na imagem) e fotos gratuitas do Unsplash
 * (créditos em girumo-design-refs/home-2026-10-15/*\/fotos-unsplash/CREDITOS.txt).
 */
export const IMG = {
  campanhaDesktop: { src: "/home/painel-campanha-desktop.webp", width: 800, height: 783 },
  analiseDesktop: { src: "/home/painel-analise-desktop.webp", width: 800, height: 777 },
  inicioCelular: { src: "/home/painel-inicio-celular.webp", width: 780, height: 1554 },
  campanhaCelular: { src: "/home/painel-campanha-celular.webp", width: 780, height: 1554 },
  disparosCelular: { src: "/home/painel-disparos-celular.webp", width: 780, height: 1554 },
  gruposCelular: { src: "/home/painel-grupos-celular.webp", width: 390, height: 777 },
  hojeCelular: { src: "/home/painel-hoje-celular.webp", width: 390, height: 777 },
  numerosCelular: { src: "/home/painel-numeros-celular.webp", width: 390, height: 777 },
  entradasCelular: { src: "/home/painel-entradas-celular.webp", width: 390, height: 777 },
  linkRecorte: { src: "/home/painel-link-recorte.webp", width: 780, height: 210 },
  agendarRecorte: { src: "/home/painel-agendar-recorte.webp", width: 780, height: 440 },
  chavesRecorte: { src: "/home/painel-chaves-recorte.webp", width: 780, height: 380 },
  fotoDonaCafe: { src: "/home/foto-dona-cafe.webp", width: 1440, height: 800 },
  fotoMercado: { src: "/home/foto-mercado.webp", width: 440, height: 800 },
  fotoChaves: { src: "/home/foto-chaves.webp", width: 440, height: 802 },
  fotoBalcao: { src: "/home/foto-balcao.webp", width: 720, height: 1128 },
} as const satisfies Record<string, ImagemHome>;

/** Modelos de página (já em public/lp-templates, 780×1280). */
export const MODELOS = [
  { src: "/lp-templates/acesso-vip.jpg", nome: "Acesso VIP" },
  { src: "/lp-templates/lista-de-espera.jpg", nome: "Lista de espera" },
  { src: "/lp-templates/evento-ao-vivo.jpg", nome: "Evento ao vivo" },
] as const;

/** Rótulo único de todo botão que leva ao cadastro (uma intenção, um texto). */
export const CTA_TESTE = "Testar 7 dias grátis";
export const CTA_TESTE_CURTO = "Testar grátis";
