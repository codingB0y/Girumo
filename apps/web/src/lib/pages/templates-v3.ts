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

export const TEMPLATE_KEYS = ["evento-ao-vivo", "promo-relampago", "acesso-vip", "lista-de-espera", "vitrine"] as const;
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

/**
 * Editorial (papel + serifa). "Acesso VIP" repete a ordem da editorial v2
 * (abertura → depoimento → o que recebe → galeria) para que uma página migrada
 * fique no mesmo lugar; o vídeo e a galeria nascem DESLIGADOS no exemplo porque
 * exigem mídia real — o adaptador v2→v3 liga os dois com o conteúdo da página.
 */
const ACESSO_VIP_SECTIONS: LpSection[] = [
  {
    type: "hero",
    variant: "form",
    enabled: true,
    data: {
      badge: "Atacado de moda",
      headline: "Lançamentos e preços de atacado primeiro no grupo",
      highlight: "primeiro no grupo",
      description:
        "Veja novidades, reposições e condições exclusivas antes de todo mundo. O grupo é só da loja: sem revenda de terceiro, sem mensagem fora de hora.",
      media: null,
    },
  },
  {
    type: "proof",
    variant: "video",
    enabled: false,
    data: { title: "Quem compra, recomenda", prints: [], cards: [] },
  },
  {
    type: "deliverables",
    variant: "checklist",
    enabled: true,
    data: {
      title: "O que você encontra no grupo",
      items: [
        { title: "Preço de atacado", description: "Direto do fabricante, sem intermediário." },
        { title: "Novidades toda semana", description: "Coleção sempre atualizada, com foto e tamanho." },
        { title: "Pedido mínimo acessível", description: "Mais giro na sua loja, menos peça parada." },
      ],
    },
  },
  {
    type: "gallery",
    variant: "grid",
    enabled: false,
    data: { title: "Um pouco do que tem lá dentro", items: [] },
  },
  {
    type: "cta_band",
    variant: "band",
    enabled: true,
    data: { title: "Entre no grupo e receba o link", note: "O convite chega logo depois do cadastro." },
  },
  {
    type: "faq",
    variant: "accordion",
    enabled: false,
    data: {
      title: "Perguntas frequentes",
      items: [
        { q: "Precisa de CNPJ?", a: "Não. Pessoa física compra no atacado com o pedido mínimo." },
        { q: "Vou receber mensagem todo dia?", a: "Só quando entra coleção nova. Você sai do grupo quando quiser." },
      ],
    },
  },
];

const LISTA_DE_ESPERA_SECTIONS: LpSection[] = [
  {
    type: "hero",
    variant: "form",
    enabled: true,
    data: {
      badge: "Lista de espera",
      headline: "A coleção nova abre primeiro pra quem está na lista",
      highlight: "abre primeiro",
      description:
        "Deixe seu nome e receba o link do grupo no dia do lançamento, antes de a coleção ir pro site. Tamanhos e cores completos só nas primeiras horas.",
      media: null,
    },
  },
  {
    type: "urgency",
    variant: "date_badge",
    enabled: true,
    data: { label: "Lançamento na quinta, 18 de setembro, às 9h", note: "A lista fecha na véspera." },
  },
  {
    type: "why_free",
    variant: "card",
    enabled: true,
    data: {
      title: "Por que entrar na lista",
      text:
        "Quem entra na lista vê a coleção 24 horas antes e escolhe com a grade inteira. Não custa nada e você sai quando quiser.",
    },
  },
  {
    type: "deliverables",
    variant: "checklist",
    enabled: true,
    data: {
      title: "O que chega no dia",
      items: [
        { title: "Catálogo completo com preço de atacado" },
        { title: "Link do grupo com prioridade de pedido" },
        { title: "Frete grátis nas primeiras 50 compras" },
      ],
    },
  },
  {
    type: "gallery",
    variant: "grid",
    enabled: false,
    data: { title: "Prévia da coleção", items: [] },
  },
  {
    type: "after_signup",
    variant: "notice",
    enabled: true,
    data: {
      title: "O que acontece depois",
      text:
        "Você recebe uma única mensagem no dia do lançamento, com o link do grupo. Nada antes, nada depois.",
    },
  },
  {
    type: "cta_band",
    variant: "band",
    enabled: true,
    data: { title: "Quero ver a coleção primeiro", note: "Sem custo. Sem compromisso." },
  },
];

function presets(sections: LpSection[]): SectionPreset[] {
  return sections.map(({ type, variant, enabled }) => ({ type, variant, enabled }));
}

const VITRINE_SECTIONS: LpSection[] = [
  {
    type: "hero",
    variant: "form",
    enabled: true,
    data: {
      badge: "Catálogo do grupo",
      headline: "As peças da semana com preço, direto no seu WhatsApp",
      highlight: "com preço",
      description:
        "Foto, tamanho e valor de atacado na hora que a coleção chega. Quem está no grupo escolhe antes de a peça acabar.",
      media: null,
    },
  },
  {
    // Nasce desligada como no acesso-vip: seção de mídia sem foto não valida
    // (2 fotos no mínimo). O lojista sobe as peças e liga — é o primeiro passo
    // que o editor pede neste modelo.
    type: "gallery",
    variant: "carousel",
    enabled: false,
    data: { title: "O que está no grupo agora", items: [] },
  },
  {
    type: "deliverables",
    variant: "checklist",
    enabled: true,
    data: {
      title: "Como funciona a compra",
      items: [
        { title: "Preço na foto", description: "Cada peça vai com valor e tamanhos disponíveis." },
        { title: "Reserva por ordem", description: "Quem responde primeiro leva — sem leilão, sem fila paralela." },
        { title: "Envio combinado", description: "Frete e prazo fechados no privado depois do pedido." },
      ],
    },
  },
  {
    type: "proof",
    variant: "prints",
    enabled: false,
    data: { title: "Quem já comprou", prints: [], cards: [] },
  },
  {
    type: "schedule",
    variant: "rules",
    enabled: true,
    data: {
      title: "Regras do grupo",
      items: [
        { label: "Postagem", title: "Só a loja publica", description: "Ninguém mais posta: o grupo não vira lista de recado." },
        { label: "Pedido", title: "Responda a foto da peça", description: "Assim a reserva fica registrada na ordem certa." },
        { label: "Saída", title: "Sai quando quiser", description: "Sem cobrança e sem precisar avisar." },
      ],
    },
  },
  {
    type: "cta_band",
    variant: "band",
    enabled: true,
    data: { title: "Entre e veja a coleção de hoje", note: "O convite chega logo depois do cadastro." },
  },
  {
    type: "faq",
    variant: "accordion",
    enabled: false,
    data: {
      title: "Perguntas frequentes",
      items: [
        { q: "Tem pedido mínimo?", a: "Sim, e ele aparece na descrição de cada peça no grupo." },
        { q: "Posso comprar uma peça só?", a: "Depende da grade. A loja confirma no privado antes do pagamento." },
      ],
    },
  },
];

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
  "acesso-vip": {
    key: "acesso-vip",
    name: "Acesso VIP",
    description: "Grupo VIP da loja, com foto grande e galeria de peças.",
    usage: "Para loja que capta pro grupo com coleção e preço de atacado.",
    direction: "editorial",
    sections: presets(ACESSO_VIP_SECTIONS),
    example: {
      schema_version: 3,
      template: "acesso-vip",
      direction: "editorial",
      store_name: "Lume",
      logo: null,
      brand_color: "#6D2436",
      cta: "Quero entrar no grupo",
      sections: ACESSO_VIP_SECTIONS,
    },
  },
  "lista-de-espera": {
    key: "lista-de-espera",
    name: "Lista de espera",
    description: "Coleção ou reposição com data: quem entra na lista vê primeiro.",
    usage: "Para loja que quer fila formada antes de abrir a coleção.",
    direction: "editorial",
    sections: presets(LISTA_DE_ESPERA_SECTIONS),
    example: {
      schema_version: 3,
      template: "lista-de-espera",
      direction: "editorial",
      store_name: "Casa Marés",
      logo: null,
      brand_color: "#1F5F5B",
      cta: "Quero entrar na lista",
      sections: LISTA_DE_ESPERA_SECTIONS,
    },
  },
  vitrine: {
    key: "vitrine",
    name: "Vitrine",
    description: "Carrossel de peças com preço, regras do grupo e cadastro no topo.",
    usage: "Para quem vende pelo grupo e quer mostrar a peça e o valor antes de pedir o número.",
    direction: "vitrine",
    sections: presets(VITRINE_SECTIONS),
    example: {
      schema_version: 3,
      template: "vitrine",
      direction: "vitrine",
      store_name: "Bazar Norte",
      logo: null,
      brand_color: "#1F6F43",
      cta: "Quero ver o catálogo",
      sections: VITRINE_SECTIONS,
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
