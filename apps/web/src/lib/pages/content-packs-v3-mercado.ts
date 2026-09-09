/**
 * Pack de conteúdo do segmento `mercado` pras Páginas v3 (decisão de
 * 30/08/2026, mesmo padrão de `content-packs.ts` pras Mensagens — `mercado`
 * ganhou pack próprio lá por ser o segundo maior sinal de demanda depois de
 * `moda_atacado`; aqui é o mesmo tenant, mesma escolha, pra manter os dois
 * sistemas de pack consistentes).
 *
 * Tom de "oferta do dia / prateleira / giro" — o mesmo de `MERCADO_COPIES`.
 * Só o `example` muda por segmento; estrutura, variantes e ordem de seção
 * continuam vindo de `TEMPLATES_V3` em `templates-v3.ts`.
 */

import type { LpContentV3 } from "./content-v3";
import type { LpTemplateKey } from "./templates-v3";

const MERCADO_COLOR = "#1F8A4C";

export const MERCADO_EXAMPLES: Record<LpTemplateKey, LpContentV3> = {
  "evento-ao-vivo": {
    schema_version: 3,
    template: "evento-ao-vivo",
    direction: "impacto",
    store_name: "Mercado Bom Preço",
    logo: null,
    brand_color: MERCADO_COLOR,
    cta: "Quero minha vaga",
    sections: [
      {
        type: "hero",
        variant: "form",
        enabled: true,
        data: {
          badge: "Aula ao vivo e gratuita",
          headline: "Como lotar o grupo de ofertas do seu mercado em 7 dias sem gastar com anúncio",
          highlight: "lotar o grupo de ofertas",
          description:
            "Uma aula ao vivo com o passo a passo que dezenas de donos de mercado e hortifruti usaram pra vender todo dia pelo WhatsApp. Sem enrolação, com as telas na frente.",
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
            { label: "Dia 1", title: "O erro que esvazia o grupo", description: "Por que 8 em cada 10 grupos de ofertas morrem em 30 dias e o que fazer diferente." },
            { label: "Dia 2", title: "A oferta que faz responder", description: "Como montar uma oferta do dia que esgota antes do fechamento, com exemplos reais." },
            { label: "Dia 3", title: "Do grupo ao Pix", description: "O roteiro de mensagens que fecha o pedido sem parecer insistente." },
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
            { title: "O roteiro de 7 dias pra encher o grupo de ofertas" },
            { title: "3 modelos de mensagem de oferta do dia prontos" },
            { title: "A planilha de margem que uso no meu mercado" },
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
            "Tem mercado, hortifruti ou loja de conveniência e quer vender no WhatsApp",
            "Já criou grupo de ofertas e viu ele esfriar em duas semanas",
            "Trabalha com produto perecível e precisa girar estoque toda semana",
            "Quer começar a postar ofertas e não sabe por onde",
          ],
        },
      },
      { type: "proof", variant: "prints", enabled: false, data: { title: "Quem já aplicou", prints: [], cards: [] } },
      {
        type: "about",
        variant: "single",
        enabled: true,
        data: {
          title: "Quem vai dar a aula",
          name: "Carlos Mendes",
          role: "Dono do Mercado Bom Preço · 9 anos de bairro",
          text:
            "Comecei com um mercadinho de esquina e hoje o grupo de ofertas do WhatsApp é o que mais gira caixa na loja. Não vendo fórmula mágica: mostro a tela do meu celular e o que funciona no meu mercado, com número.",
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
      { type: "cta_band", variant: "band", enabled: true, data: { title: "Garanta sua vaga na aula ao vivo", note: "Gratuito, ao vivo, sem gravação." } },
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
            { q: "Preciso ter mercado?", a: "Ajuda, mas não é obrigatório. Quem está começando aproveita o dia 1 e o dia 3." },
          ],
        },
      },
    ],
  },
  "promo-relampago": {
    schema_version: 3,
    template: "promo-relampago",
    direction: "impacto",
    store_name: "Mercado Bom Preço",
    logo: null,
    brand_color: MERCADO_COLOR,
    cta: "Quero entrar no grupo",
    sections: [
      {
        type: "hero",
        variant: "form",
        enabled: true,
        data: {
          badge: "Só no grupo · 48 horas",
          headline: "Oferta relâmpago com até 40% off só pra quem está no grupo",
          highlight: "40% off",
          description:
            "Produtos selecionados com preço de fechamento de estoque, liberados por ordem de chegada. Entra no grupo, escolhe, manda o Pix.",
          media: null,
        },
      },
      { type: "urgency", variant: "countdown", enabled: true, data: { label: "A oferta fecha em", note: "Depois disso os preços voltam ao normal." } },
      {
        type: "deliverables",
        variant: "checklist",
        enabled: true,
        data: {
          title: "Como funciona a oferta",
          items: [
            { title: "Até 40% off em produtos selecionados" },
            { title: "Pedido mínimo de 6 itens, pode misturar" },
            { title: "Entrega no mesmo dia pra pedido pago até 15h" },
            { title: "Foto e validade de cada produto direto no grupo" },
          ],
        },
      },
      {
        type: "about",
        variant: "single",
        enabled: true,
        data: {
          title: "Quem está vendendo",
          name: "Mercado Bom Preço",
          role: "Bairro · desde 2015",
          text:
            "Mercado de bairro com hortifruti e mercearia própria. Atendemos centenas de famílias por semana pelo WhatsApp, com nota fiscal e produto fresco garantido.",
          media: null,
        },
      },
      { type: "proof", variant: "cards", enabled: false, data: { title: "Quem compra, recomenda", prints: [], cards: [] } },
      { type: "cta_band", variant: "band", enabled: true, data: { title: "Quero os produtos com desconto", note: "O link do grupo chega logo depois do cadastro." } },
      {
        type: "faq",
        variant: "accordion",
        enabled: false,
        data: {
          title: "Perguntas frequentes",
          items: [
            { q: "Precisa de CNPJ?", a: "Não. Pessoa física compra direto no grupo." },
            { q: "Como pago?", a: "Pix ou cartão pelo link que o mercado manda no grupo." },
          ],
        },
      },
    ],
  },
  "acesso-vip": {
    schema_version: 3,
    template: "acesso-vip",
    direction: "editorial",
    store_name: "Clube de Ofertas Bom Preço",
    logo: null,
    brand_color: MERCADO_COLOR,
    cta: "Quero entrar no grupo",
    sections: [
      {
        type: "hero",
        variant: "form",
        enabled: true,
        data: {
          badge: "Acesso antecipado",
          headline: "Ofertas e chegadas do dia primeiro no grupo",
          highlight: "primeiro no grupo",
          description:
            "Veja promoções, hortifruti fresco e condições exclusivas antes de todo mundo. O grupo é só do mercado: sem revenda de terceiro, sem mensagem fora de hora.",
          media: null,
        },
      },
      { type: "proof", variant: "video", enabled: false, data: { title: "Quem compra, recomenda", prints: [], cards: [] } },
      {
        type: "deliverables",
        variant: "checklist",
        enabled: true,
        data: {
          title: "O que você encontra no grupo",
          items: [
            { title: "Oferta do dia", description: "Direto do mercado, sem intermediário." },
            { title: "Chegada de hortifruti toda semana", description: "Estoque sempre atualizado, com foto e preço." },
            { title: "Pedido mínimo acessível", description: "Mais giro pro mercado, menos item parado." },
          ],
        },
      },
      { type: "gallery", variant: "grid", enabled: false, data: { title: "Um pouco do que tem lá dentro", items: [] } },
      { type: "cta_band", variant: "band", enabled: true, data: { title: "Entre no grupo e receba o link", note: "O convite chega logo depois do cadastro." } },
      {
        type: "faq",
        variant: "accordion",
        enabled: false,
        data: {
          title: "Perguntas frequentes",
          items: [
            { q: "Precisa de CNPJ?", a: "Não. Pessoa física compra com o pedido mínimo." },
            { q: "Vou receber mensagem todo dia?", a: "Só quando tem oferta nova. Você sai do grupo quando quiser." },
          ],
        },
      },
    ],
  },
  "lista-de-espera": {
    schema_version: 3,
    template: "lista-de-espera",
    direction: "editorial",
    store_name: "Empório da Safra",
    logo: null,
    brand_color: MERCADO_COLOR,
    cta: "Quero entrar na lista",
    sections: [
      {
        type: "hero",
        variant: "form",
        enabled: true,
        data: {
          badge: "Lista de espera",
          headline: "A remessa nova de produtos frescos chega primeiro pra quem está na lista",
          highlight: "chega primeiro",
          description:
            "Deixe seu nome e receba o link do grupo no dia da remessa, antes de os produtos irem pra prateleira. Melhor escolha só nas primeiras horas.",
          media: null,
        },
      },
      { type: "urgency", variant: "date_badge", enabled: true, data: { label: "Remessa na quinta, 18 de setembro, às 9h", note: "A lista fecha na véspera." } },
      {
        type: "why_free",
        variant: "card",
        enabled: true,
        data: {
          title: "Por que entrar na lista",
          text: "Quem entra na lista vê a remessa 24 horas antes e escolhe com a prateleira completa. Não custa nada e você sai quando quiser.",
        },
      },
      {
        type: "deliverables",
        variant: "checklist",
        enabled: true,
        data: {
          title: "O que chega no dia",
          items: [
            { title: "Lista completa com preço de fechamento" },
            { title: "Link do grupo com prioridade de pedido" },
            { title: "Entrega grátis nos primeiros 50 pedidos" },
          ],
        },
      },
      { type: "gallery", variant: "grid", enabled: false, data: { title: "Prévia da remessa", items: [] } },
      {
        type: "after_signup",
        variant: "notice",
        enabled: true,
        data: { title: "O que acontece depois", text: "Você recebe uma única mensagem no dia da remessa, com o link do grupo. Nada antes, nada depois." },
      },
      { type: "cta_band", variant: "band", enabled: true, data: { title: "Quero ver a remessa primeiro", note: "Sem custo. Sem compromisso." } },
    ],
  },
  vitrine: {
    schema_version: 3,
    template: "vitrine",
    direction: "vitrine",
    store_name: "Vitrine do Mercado",
    logo: null,
    brand_color: MERCADO_COLOR,
    cta: "Quero ver as ofertas",
    sections: [
      {
        type: "hero",
        variant: "form",
        enabled: true,
        data: {
          badge: "Ofertas do grupo",
          headline: "As ofertas da semana com preço, direto no seu WhatsApp",
          highlight: "com preço",
          description: "Foto e valor na hora que a oferta chega. Quem está no grupo garante antes de acabar o estoque.",
          media: null,
        },
      },
      { type: "gallery", variant: "carousel", enabled: false, data: { title: "O que está no grupo agora", items: [] } },
      {
        type: "deliverables",
        variant: "checklist",
        enabled: true,
        data: {
          title: "Como funciona a compra",
          items: [
            { title: "Preço na foto", description: "Cada oferta vai com valor e quantidade disponível." },
            { title: "Reserva por ordem", description: "Quem responde primeiro leva — sem leilão, sem fila paralela." },
            { title: "Retirada combinada", description: "Horário e forma de entrega fechados no privado depois do pedido." },
          ],
        },
      },
      { type: "proof", variant: "prints", enabled: false, data: { title: "Quem já comprou", prints: [], cards: [] } },
      {
        type: "schedule",
        variant: "rules",
        enabled: true,
        data: {
          title: "Regras do grupo",
          items: [
            { label: "Postagem", title: "Só o mercado publica", description: "Ninguém mais posta: o grupo não vira lista de recado." },
            { label: "Pedido", title: "Responda a foto da oferta", description: "Assim a reserva fica registrada na ordem certa." },
            { label: "Saída", title: "Sai quando quiser", description: "Sem cobrança e sem precisar avisar." },
          ],
        },
      },
      { type: "cta_band", variant: "band", enabled: true, data: { title: "Entre e veja as ofertas de hoje", note: "O convite chega logo depois do cadastro." } },
      {
        type: "faq",
        variant: "accordion",
        enabled: false,
        data: {
          title: "Perguntas frequentes",
          items: [
            { q: "Tem pedido mínimo?", a: "Sim, e ele aparece na descrição de cada oferta no grupo." },
            { q: "Posso comprar um item só?", a: "Depende do estoque. O mercado confirma no privado antes do pagamento." },
          ],
        },
      },
    ],
  },
};
