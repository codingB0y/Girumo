/**
 * Pack de conteúdo NEUTRO pras Páginas v3 (decisão de 30/08/2026, mesmo padrão
 * de `content-packs.ts` pras Mensagens): sem jargão de moda, serve pra
 * qualquer segmento que não seja `moda_atacado` nem `mercado`.
 *
 * Só o `example` (texto de exemplo) muda por segmento — a lista de seções,
 * variantes e ordem de cada template continuam vindo de `TEMPLATES_V3` em
 * `templates-v3.ts`; é por isso que cada entrada aqui espelha exatamente os
 * `type`/`variant`/`enabled` do template base, só trocando a `data`.
 */

import type { LpContentV3 } from "./content-v3";
import type { LpTemplateKey } from "./templates-v3";

const DEFAULT_COLOR = "#2E66FF";

export const NEUTRAL_EXAMPLES: Record<LpTemplateKey, LpContentV3> = {
  "evento-ao-vivo": {
    schema_version: 3,
    template: "evento-ao-vivo",
    direction: "impacto",
    store_name: "Loja Ponto Certo",
    logo: null,
    brand_color: DEFAULT_COLOR,
    cta: "Quero minha vaga",
    sections: [
      {
        type: "hero",
        variant: "form",
        enabled: true,
        data: {
          badge: "Aula ao vivo e gratuita",
          headline: "Como lotar o grupo VIP da sua loja em 7 dias sem gastar com anúncio",
          highlight: "lotar o grupo VIP",
          description:
            "Uma aula ao vivo com o passo a passo que centenas de lojistas usaram para vender todo dia pelo WhatsApp. Sem enrolação, com as telas na frente.",
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
            { label: "Dia 2", title: "A oferta que faz responder", description: "Como montar uma promoção que vende em 2 horas, com exemplos reais." },
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
            { title: "3 modelos de mensagem de oferta prontos" },
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
      { type: "proof", variant: "prints", enabled: false, data: { title: "Quem já aplicou", prints: [], cards: [] } },
      {
        type: "about",
        variant: "single",
        enabled: true,
        data: {
          title: "Quem vai dar a aula",
          name: "Ana Ribeiro",
          role: "Fundadora da Loja Ponto Certo · 10 anos de WhatsApp",
          text:
            "Comecei numa banca pequena e hoje despacho centenas de pedidos por semana pelo WhatsApp. Não vendo fórmula mágica: mostro a tela do meu celular e o que funciona na minha loja, com número.",
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
            { q: "Preciso ter loja?", a: "Ajuda, mas não é obrigatório. Quem está começando aproveita o dia 1 e o dia 3." },
          ],
        },
      },
    ],
  },
  "promo-relampago": {
    schema_version: 3,
    template: "promo-relampago",
    direction: "impacto",
    store_name: "Estoque Novo Atacado",
    logo: null,
    brand_color: "#E11D48",
    cta: "Quero entrar no grupo",
    sections: [
      {
        type: "hero",
        variant: "form",
        enabled: true,
        data: {
          badge: "Só no grupo · 48 horas",
          headline: "Liquidação com 40% off só pra quem está no grupo",
          highlight: "40% off",
          description:
            "Itens selecionados com preço de atacado ainda mais baixo, liberados por ordem de chegada. Entra no grupo, escolhe, manda o Pix.",
          media: null,
        },
      },
      { type: "urgency", variant: "countdown", enabled: true, data: { label: "A promoção fecha em", note: "Depois disso os itens voltam ao preço normal." } },
      {
        type: "deliverables",
        variant: "checklist",
        enabled: true,
        data: {
          title: "Como funciona a promoção",
          items: [
            { title: "40% off em itens selecionados" },
            { title: "Pedido mínimo de 6 unidades, pode misturar" },
            { title: "Envio no mesmo dia pra pedido pago até 15h" },
            { title: "Foto e detalhes de cada item direto no grupo" },
          ],
        },
      },
      {
        type: "about",
        variant: "single",
        enabled: true,
        data: {
          title: "Quem está vendendo",
          name: "Estoque Novo Atacado",
          role: "Desde 2014",
          text:
            "Loja de atacado com fornecimento próprio. Atendemos milhares de lojistas por mês pelo WhatsApp, com nota fiscal e troca garantida.",
          media: null,
        },
      },
      { type: "proof", variant: "cards", enabled: false, data: { title: "Quem compra, recomenda", prints: [], cards: [] } },
      { type: "cta_band", variant: "band", enabled: true, data: { title: "Quero os itens com 40% off", note: "O link do grupo chega logo depois do cadastro." } },
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
    ],
  },
  "acesso-vip": {
    schema_version: 3,
    template: "acesso-vip",
    direction: "editorial",
    store_name: "Grupo Select",
    logo: null,
    brand_color: "#6D2436",
    cta: "Quero entrar no grupo",
    sections: [
      {
        type: "hero",
        variant: "form",
        enabled: true,
        data: {
          badge: "Acesso antecipado",
          headline: "Lançamentos e preços especiais primeiro no grupo",
          highlight: "primeiro no grupo",
          description:
            "Veja novidades, reposições e condições exclusivas antes de todo mundo. O grupo é só da loja: sem revenda de terceiro, sem mensagem fora de hora.",
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
            { title: "Preço especial", description: "Direto da loja, sem intermediário." },
            { title: "Novidades toda semana", description: "Estoque sempre atualizado, com foto e detalhes." },
            { title: "Pedido mínimo acessível", description: "Mais giro pra loja, menos item parado." },
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
            { q: "Vou receber mensagem todo dia?", a: "Só quando entra novidade. Você sai do grupo quando quiser." },
          ],
        },
      },
    ],
  },
  "lista-de-espera": {
    schema_version: 3,
    template: "lista-de-espera",
    direction: "editorial",
    store_name: "Casa Aurora",
    logo: null,
    brand_color: "#1F5F5B",
    cta: "Quero entrar na lista",
    sections: [
      {
        type: "hero",
        variant: "form",
        enabled: true,
        data: {
          badge: "Lista de espera",
          headline: "O novo lote abre primeiro pra quem está na lista",
          highlight: "abre primeiro",
          description:
            "Deixe seu nome e receba o link do grupo no dia do lançamento, antes de os itens irem pro site. Estoque completo só nas primeiras horas.",
          media: null,
        },
      },
      { type: "urgency", variant: "date_badge", enabled: true, data: { label: "Lançamento na quinta, 18 de setembro, às 9h", note: "A lista fecha na véspera." } },
      {
        type: "why_free",
        variant: "card",
        enabled: true,
        data: {
          title: "Por que entrar na lista",
          text: "Quem entra na lista vê o lote 24 horas antes e escolhe com o estoque completo. Não custa nada e você sai quando quiser.",
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
      { type: "gallery", variant: "grid", enabled: false, data: { title: "Prévia do lote", items: [] } },
      {
        type: "after_signup",
        variant: "notice",
        enabled: true,
        data: { title: "O que acontece depois", text: "Você recebe uma única mensagem no dia do lançamento, com o link do grupo. Nada antes, nada depois." },
      },
      { type: "cta_band", variant: "band", enabled: true, data: { title: "Quero ver o lote primeiro", note: "Sem custo. Sem compromisso." } },
    ],
  },
  vitrine: {
    schema_version: 3,
    template: "vitrine",
    direction: "vitrine",
    store_name: "Vitrine Popular",
    logo: null,
    brand_color: "#1F6F43",
    cta: "Quero ver o catálogo",
    sections: [
      {
        type: "hero",
        variant: "form",
        enabled: true,
        data: {
          badge: "Catálogo do grupo",
          headline: "Os produtos da semana com preço, direto no seu WhatsApp",
          highlight: "com preço",
          description: "Foto e valor de atacado na hora que o estoque chega. Quem está no grupo escolhe antes de o produto acabar.",
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
            { title: "Preço na foto", description: "Cada produto vai com valor e quantidade disponível." },
            { title: "Reserva por ordem", description: "Quem responde primeiro leva — sem leilão, sem fila paralela." },
            { title: "Envio combinado", description: "Frete e prazo fechados no privado depois do pedido." },
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
            { label: "Postagem", title: "Só a loja publica", description: "Ninguém mais posta: o grupo não vira lista de recado." },
            { label: "Pedido", title: "Responda a foto do produto", description: "Assim a reserva fica registrada na ordem certa." },
            { label: "Saída", title: "Sai quando quiser", description: "Sem cobrança e sem precisar avisar." },
          ],
        },
      },
      { type: "cta_band", variant: "band", enabled: true, data: { title: "Entre e veja as novidades de hoje", note: "O convite chega logo depois do cadastro." } },
      {
        type: "faq",
        variant: "accordion",
        enabled: false,
        data: {
          title: "Perguntas frequentes",
          items: [
            { q: "Tem pedido mínimo?", a: "Sim, e ele aparece na descrição de cada produto no grupo." },
            { q: "Posso comprar um item só?", a: "Depende do estoque. A loja confirma no privado antes do pagamento." },
          ],
        },
      },
    ],
  },
};
