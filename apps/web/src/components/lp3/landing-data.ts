/* Conteúdo estático da landing (/lp3 → v2).
   Fica fora dos componentes porque desktop e mobile compartilham os mesmos dados
   e o JSON-LD do FAQ é montado em app/page.tsx a partir daqui. */

export const SIGNUP_URL = "/signup";

export const WHATSAPP_URL =
  process.env.NEXT_PUBLIC_SALES_WHATSAPP_URL ||
  "https://wa.me/5562998191314?text=Ol%C3%A1!%20Quero%20saber%20mais%20sobre%20a%20Girumo.";

/** Marquee de prova — repetido 2× no componente pra o loop translateX(-50%) fechar.
 *  `volt` é a parte do item pintada com o acid da marca. */
export const PROVA_MARQUEE: ReadonlyArray<{ text: string; volt?: string }> = [
  { text: "R$ 5 mil → ", volt: "R$ 350 mil/mês" },
  { text: "12.000 revendedores" },
  { text: "50+ grupos ativos" },
  { text: "20 mil peças em 2 dias" },
  { text: "história real · goiânia · região da 44" },
];

export const ROTINA = {
  manual: [
    "A grade nova sai grupo por grupo, 2h de copiar e colar",
    "Grupo lotou, link morto — o clique vai pro concorrente",
    "A venda acontece e ninguém sabe de qual anúncio veio",
    "Página de captação, só pagando programador",
  ],
  girumo: [
    "Um clique publica em todos, no horário certo",
    "Grupo cheio? O próximo nasce sozinho e o link nunca morre",
    "Cada pedido volta com origem: anúncio, story ou bio",
    "Modelo de página pronto, no ar em minutos",
  ],
};

export const METODO = [
  {
    n: "01",
    title: "Captação constante",
    body: "Link rastreado no anúncio, na bio e no story, apontando pra uma página que só faz uma coisa: colocar revendedor pra dentro do grupo. Lotou, o próximo já nasce.",
  },
  {
    n: "02",
    title: "Grupo aquecido",
    body: "Boas-vindas na hora, regra clara, novidade cedo. Grupo com movimento diário vira o primeiro lugar onde o revendedor olha de manhã.",
  },
  {
    n: "03",
    title: "Oferta todo dia",
    body: "A grade nova ia pra todos os grupos de uma vez, na hora em que o revendedor monta o pedido. Quem viu cedo, pediu primeiro.",
  },
  {
    n: "04",
    title: "Evento de 2 dias",
    body: "Duas vezes por ano, o estoque virava evento avisado só nos grupos: fila na porta e mais de 20 mil peças vendidas em 48 horas.",
  },
];

export const DIFERENCIAL = [
  {
    feat: "A página que enche o grupo",
    generic: "Você monta na mão — ou paga programador",
    hub: "Modelo pronto com a sua marca, no ar em minutos",
  },
  {
    feat: "Grupo lotou, e agora?",
    generic: "Link morto — o clique vira cliente do concorrente",
    hub: "O próximo grupo nasce sozinho, o link nunca morre",
  },
  {
    feat: "Disparo no horário certo",
    generic: "Manda tudo igual, sem ler o ritmo do atacado",
    hub: "Agendado pro momento em que o revendedor monta o pedido",
  },
  {
    feat: "Origem de cada venda",
    generic: "Some no meio das conversas — você chuta de qual anúncio veio",
    hub: "Cada pedido volta com a origem: anúncio, story ou grupo",
  },
  {
    feat: "Quem está por trás",
    generic: "Ferramenta de infoproduto adaptada pra qualquer nicho",
    hub: "Nasceu de um atacado de roupa de verdade, na 44",
  },
];

export interface Plan {
  name: string;
  price: number;
  /** Preço mensal equivalente no ciclo anual — cobrado 1x ao ano (12 × annualPrice). */
  annualPrice: number;
  who: string;
  /** Resumo de 1 linha usado nas rows compactas do mobile. */
  short: string;
  features: string[];
  featured: boolean;
}

/* Os annualPrice pisam de propósito no price mensal do plano de baixo
   (Growth anual = Essencial mensal; Operação anual = Growth mensal) — é a
   escada de ancoragem que plans.tsx (escadaDe) mostra nos cards. Mudou um
   preço, preserve a coincidência ou a linha some em silêncio. */
export const PLANS: Plan[] = [
  {
    name: "Essencial",
    price: 197,
    annualPrice: 127,
    who: "Pra botar os primeiros grupos pra rodar.",
    short: "1 número · até 5 grupos",
    features: [
      "1 número de WhatsApp",
      "Até 5 grupos gerenciados",
      "Disparo de texto e imagem",
      "Agendamento de mensagens",
    ],
    featured: false,
  },
  {
    name: "Growth",
    price: 297,
    annualPrice: 197,
    who: "Pra quem opera dezenas de grupos todo dia.",
    short: "grupos ilimitados · página com a sua marca",
    features: [
      "Grupos ilimitados",
      "Grupo lotou, o próximo nasce sozinho",
      "Página de captação com a sua marca",
      "Agenda semanal em 1 clique",
      "Cada pedido com origem rastreada",
    ],
    featured: true,
  },
  {
    name: "Operação",
    price: 497,
    annualPrice: 297,
    who: "Pra quem quer um time junto na operação.",
    short: "setup assistido · revisão mensal 1:1",
    features: [
      "Tudo do Growth",
      "Setup e operação assistidos",
      "Revisão estratégica mensal 1:1",
      "Prioridade no suporte",
    ],
    featured: false,
  },
];

/** Âncora de preço — cobra o custo do trabalho manual citado no topo da página. */
export const PLANOS_ANCORA =
  "Postar na mão custa 2h por dia, link morto e venda sem origem. A Mega Stock fez R$ 350 mil num mês vendendo assim — escolha o tamanho da sua operação e troque quando crescer.";

export const LP3_FAQ: ReadonlyArray<readonly [string, string]> = [
  [
    "Preciso trocar de número?",
    "Não. Funciona com o seu número de sempre, lendo um QR Code. Sem chip novo, sem app extra.",
  ],
  [
    "É difícil de usar?",
    "Se você usa WhatsApp, usa a Girumo. Painel em português e modelos prontos de página e de mensagem — você quase não configura nada.",
  ],
  [
    "Quantos grupos consigo gerenciar?",
    "No Growth, ilimitados. 50, 100 ou mais — todos num painel só. E quando um enche, o próximo nasce sozinho.",
  ],
  [
    "E se eu não gostar?",
    "Nos primeiros 7 dias você desiste e recebe tudo de volta — é o direito de arrependimento do art. 49 do Código de Defesa do Consumidor, e vale pra qualquer compra feita pela internet. Depois disso você cancela quando quiser, sem multa e sem fidelidade, na própria tela de configurações: o acesso vale até o fim do período já pago. Os grupos e os contatos são seus de qualquer jeito.",
  ],
  [
    "Como funciona o plano anual?",
    "Você paga 1x ao ano e o mês sai até 40% mais barato — no Growth, R$ 197 em vez de R$ 297. Se cancelar no meio do caminho, devolvemos os meses não usados: os meses que você usou passam a valer o preço mensal e o resto volta pra você. Cancelando o Growth anual depois de 3 meses, por exemplo, voltam R$ 1.473.",
  ],
  [
    "Meus contatos ficam comigo se eu cancelar?",
    "Sim. O número é seu, os grupos são seus, os contatos são seus. Sem fidelidade, sem multa.",
  ],
];

export const TIMESTAMPS = [
  "05h58 · a grade chega",
  "06h12 · link no ar",
  "07h04 · grupo lotado",
  "08h30 · pedidos no painel",
];
