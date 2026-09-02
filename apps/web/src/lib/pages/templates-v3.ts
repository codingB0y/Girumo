/**
 * Templates v3 = presets: direção visual + ordem das seções (com variante e
 * estado padrão) + conteúdo de exemplo do nicho. O lojista nunca começa do zero:
 * a página nasce preenchida e ele escreve por cima, liga/desliga e troca variante.
 *
 * A ORDEM aqui é a ordem da página. `toContentV3` reordena o que chega do client
 * por esta lista, então reordenar é impossível por construção (spec 14/07).
 * As chaves são gravadas em `landing_pages.structure` e na captura.
 */

import type { LpContentV3 } from "./content-v3";
import type { LpDirection, LpSection, LpSectionType } from "./sections";

export const TEMPLATE_KEYS = ["evento-ao-vivo", "promo-relampago"] as const;
export type LpTemplateKey = (typeof TEMPLATE_KEYS)[number];

export function isTemplateKey(value: unknown): value is LpTemplateKey {
  return typeof value === "string" && (TEMPLATE_KEYS as readonly string[]).includes(value);
}

export type SectionPreset = { type: LpSectionType; variant: string; enabled: boolean };

export type LpTemplateV3 = {
  key: LpTemplateKey;
  name: string;
  description: string;
  /** Quando usar — aparece no card da galeria. */
  usage: string;
  direction: LpDirection;
  sections: SectionPreset[];
  /** Conteúdo de exemplo (sem mídia). `instantiateTemplate` resolve datas relativas. */
  example: Omit<LpContentV3, "sections"> & { sections: LpSection[] };
  /** Horas até o fim da contagem regressiva do exemplo (só quando há `countdown`). */
  countdownHours?: number;
};

const DEFAULT_COLOR = "#2E66FF";

const EVENTO_SECTIONS: LpSection[] = [
  {
    type: "hero",
    variant: "form",
    enabled: true,
    data: {
      badge: "Aula ao vivo e gratuita",
      headline: "Como lotar o grupo VIP da sua loja em 7 dias sem gastar com anúncio",
      highlight: "lotar o grupo VIP",
      description:
        "Uma aula ao vivo com o passo a passo que 300 lojistas usaram para vender todo dia pelo WhatsApp. Sem enrolação, com as telas na frente.",
      media: null,
    },
  },
  {
    type: "urgency",
    variant: "date_badge",
    enabled: true,
    data: {
      label: "Terça, 16 de setembro, às 20h · ao vivo no WhatsApp",
      note: "Não fica gravado. Quem entra no grupo assiste na hora.",
    },
  },
  {
    type: "schedule",
    variant: "days",
    enabled: true,
    data: {
      title: "O que acontece em cada dia",
      items: [
        { label: "Dia 1", title: "O erro que esvazia o grupo", description: "Por que 8 em cada 10 grupos morrem em 30 dias e o que fazer diferente." },
        { label: "Dia 2", title: "A oferta que faz responder", description: "Como montar um drop que vende em 2 horas, com exemplos reais." },
        { label: "Dia 3", title: "Do grupo ao Pix", description: "O roteiro de mensagens que fecha pedido sem parecer insistente." },
      ],
    },
  },
  {
    type: "deliverables",
    variant: "checklist",
    enabled: true,
    data: {
      title: "O que você leva da aula",
      items: [
        { title: "O roteiro de 7 dias pra encher o grupo" },
        { title: "3 modelos de mensagem de drop prontos" },
        { title: "A planilha de preço de atacado que uso na minha loja" },
        { title: "Acesso ao grupo de suporte por 7 dias" },
      ],
    },
  },
  {
    type: "audience",
    variant: "pain_cards",
    enabled: true,
    data: {
      title: "Essa aula é pra você que",
      items: [
        "Tem loja física ou online e quer vender no WhatsApp sem virar refém do Instagram",
        "Já criou grupo e viu ele morrer em duas semanas",
        "Vende no atacado e precisa de giro toda semana",
        "Quer começar a revender e não sabe por onde",
      ],
    },
  },
  {
    type: "proof",
    variant: "prints",
    enabled: false,
    data: { title: "Quem já aplicou", prints: [], cards: [] },
  },
  {
    type: "about",
    variant: "single",
    enabled: true,
    data: {
      title: "Quem vai dar a aula",
      name: "Ana Ribeiro",
      role: "Fundadora da Loja Lucrativa · 12 anos de atacado no Brás",
      text:
        "Comecei com uma arara na feira e hoje mando 600 peças por semana pelo WhatsApp. Não vendo fórmula mágica: mostro a tela do meu celular e o que funciona na minha loja, com número.",
      media: null,
    },
  },
  {
    type: "after_signup",
    variant: "notice",
    enabled: true,
    data: {
      title: "O que acontece quando você se inscreve",
      text:
        "Você entra no grupo do WhatsApp da aula. Lá chegam o link ao vivo, os lembretes e o material. Só a organização posta; ninguém recebe mensagem fora do horário.",
    },
  },
  {
    type: "cta_band",
    variant: "band",
    enabled: true,
    data: { title: "Garanta sua vaga na aula ao vivo", note: "Gratuito, ao vivo, sem gravação." },
  },
  {
    type: "faq",
    variant: "accordion",
    enabled: true,
    data: {
      title: "Perguntas frequentes",
      items: [
        { q: "Custa alguma coisa?", a: "Não. A aula é gratuita e acontece dentro do grupo do WhatsApp." },
        { q: "Vai ficar gravado?", a: "Não. A aula é ao vivo; quem estiver no grupo assiste na hora." },
        { q: "Vou receber mensagem todo dia?", a: "Só os avisos da aula: link, lembrete e material. Você sai do grupo quando quiser." },
        { q: "Preciso ter loja?", a: "Ajuda, mas não é obrigatório. Quem está começando aproveita o dia 1 e o dia 3." },
      ],
    },
  },
];

const PROMO_SECTIONS: LpSection[] = [
  {
    type: "hero",
    variant: "form",
    enabled: true,
    data: {
      badge: "Só no grupo · 48 horas",
      headline: "Liquidação de inverno com 40% off só pra quem está no grupo",
      highlight: "40% off",
      description:
        "Peças da coleção passada com preço de atacado ainda mais baixo, liberadas por ordem de chegada. Entra no grupo, escolhe, manda o Pix.",
      media: null,
    },
  },
  {
    type: "urgency",
    variant: "countdown",
    enabled: true,
    data: { label: "A promoção fecha em", note: "Depois disso as peças voltam ao preço normal." },
  },
  {
    type: "deliverables",
    variant: "checklist",
    enabled: true,
    data: {
      title: "Como funciona a promoção",
      items: [
        { title: "40% off em toda a coleção de inverno" },
        { title: "Pedido mínimo de 6 peças, pode misturar" },
        { title: "Envio no mesmo dia pra pedido pago até 15h" },
        { title: "Foto e tamanho de cada peça direto no grupo" },
      ],
    },
  },
  {
    type: "about",
    variant: "single",
    enabled: true,
    data: {
      title: "Quem está vendendo",
      name: "Mega Stock Atacado",
      role: "Brás, São Paulo · desde 2014",
      text:
        "Loja de atacado de moda feminina com fábrica própria. Atendemos 2 mil lojistas por mês pelo WhatsApp, com nota fiscal e troca garantida.",
      media: null,
    },
  },
  {
    type: "proof",
    variant: "cards",
    enabled: false,
    data: { title: "Quem compra, recomenda", prints: [], cards: [] },
  },
  {
    type: "cta_band",
    variant: "band",
    enabled: true,
    data: { title: "Quero as peças com 40% off", note: "O link do grupo chega logo depois do cadastro." },
  },
  {
    type: "faq",
    variant: "accordion",
    enabled: false,
    data: {
      title: "Perguntas frequentes",
      items: [
        { q: "Precisa de CNPJ?", a: "Não. Pessoa física compra no atacado com o pedido mínimo." },
        { q: "Como pago?", a: "Pix ou cartão pelo link que a loja manda no grupo." },
      ],
    },
  },
];

function presets(sections: LpSection[]): SectionPreset[] {
  return sections.map(({ type, variant, enabled }) => ({ type, variant, enabled }));
}

export const TEMPLATES_V3: Record<LpTemplateKey, LpTemplateV3> = {
  "evento-ao-vivo": {
    key: "evento-ao-vivo",
    name: "Evento ao vivo",
    description: "Aula, semana de conteúdo ou lançamento com data marcada.",
    usage: "Para quem capta pro grupo antes de um evento ao vivo.",
    direction: "impacto",
    sections: presets(EVENTO_SECTIONS),
    example: {
      schema_version: 3,
      template: "evento-ao-vivo",
      direction: "impacto",
      store_name: "Loja Lucrativa",
      logo: null,
      brand_color: DEFAULT_COLOR,
      cta: "Quero minha vaga",
      sections: EVENTO_SECTIONS,
    },
  },
  "promo-relampago": {
    key: "promo-relampago",
    name: "Promo relâmpago",
    description: "Liquidação ou drop com hora pra acabar.",
    usage: "Para loja que quer encher o grupo com uma oferta de prazo curto.",
    direction: "impacto",
    sections: presets(PROMO_SECTIONS),
    countdownHours: 48,
    example: {
      schema_version: 3,
      template: "promo-relampago",
      direction: "impacto",
      store_name: "Mega Stock Atacado",
      logo: null,
      brand_color: "#E11D48",
      cta: "Quero entrar no grupo",
      sections: PROMO_SECTIONS,
    },
  },
};

export const TEMPLATE_LIST: LpTemplateV3[] = TEMPLATE_KEYS.map((k) => TEMPLATES_V3[k]);

/**
 * Cópia profunda do exemplo pronta pra virar rascunho: datas relativas
 * (contagem) resolvidas a partir de `now`. Nunca devolve o objeto do módulo —
 * o editor muta o rascunho.
 */
export function instantiateTemplate(key: LpTemplateKey, now: Date = new Date()): LpContentV3 {
  const tpl = TEMPLATES_V3[key];
  const content = structuredClone(tpl.example) as LpContentV3;
  if (tpl.countdownHours) {
    const ends = new Date(now.getTime() + tpl.countdownHours * 60 * 60 * 1000);
    for (const s of content.sections) {
      if (s.type === "urgency" && s.variant === "countdown") s.data.ends_at = ends.toISOString();
    }
  }
  return content;
}
