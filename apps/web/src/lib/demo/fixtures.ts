import type { Lead } from "@/lib/painel/types";

/**
 * Dados encenados do modo demonstração.
 *
 * Tipados com os MESMOS tipos que as rotas reais devolvem, de propósito: se o
 * contrato mudar, isto para de compilar e o `tsc` do CI acusa antes de o demo
 * passar a mostrar um produto que não existe mais.
 *
 * Nada aqui vai para banco nenhum. São constantes de módulo.
 */

export type DemoGroup = {
  name: string;
  members: number;
  capacity: number;
};

/** Três grupos, como um lojista pequeno de verdade tem. */
export const DEMO_GROUPS: readonly DemoGroup[] = [
  { name: "Atacado Moda — VIP 01", members: 812, capacity: 1024 },
  { name: "Atacado Moda — VIP 02", members: 640, capacity: 1024 },
  { name: "Lançamentos da Semana", members: 297, capacity: 1024 },
];

export const DEMO_CAMPAIGN_NAME = "Nova coleção — sexta 19h";

/**
 * Os leads entram um a um no passo 3. A ordem do array é a ordem de entrada.
 * Telefones com o final mascarado: é o que o painel real mostra, e um número
 * plausível numa tela pública vira ligação para um estranho.
 */
export const DEMO_LEADS: readonly Lead[] = [
  {
    id: "demo-1",
    name: "Camila R.",
    phone: "(62) 9****-1420",
    sourceGroup: "Atacado Moda — VIP 01",
    sourceCampaign: DEMO_CAMPAIGN_NAME,
    status: "novo",
    enteredAt: "2026-08-28T19:00:12.000Z",
    leftAt: null,
  },
  {
    id: "demo-2",
    name: "Juliana P.",
    phone: "(11) 9****-8871",
    sourceGroup: "Atacado Moda — VIP 01",
    sourceCampaign: DEMO_CAMPAIGN_NAME,
    status: "novo",
    enteredAt: "2026-08-28T19:00:31.000Z",
    leftAt: null,
  },
  {
    id: "demo-3",
    name: "Marcos A.",
    phone: "(31) 9****-2093",
    sourceGroup: "Lançamentos da Semana",
    sourceCampaign: DEMO_CAMPAIGN_NAME,
    status: "ativo",
    enteredAt: "2026-08-28T19:01:04.000Z",
    leftAt: null,
  },
  {
    id: "demo-4",
    name: "Patrícia L.",
    phone: "(62) 9****-5567",
    sourceGroup: "Atacado Moda — VIP 02",
    sourceCampaign: DEMO_CAMPAIGN_NAME,
    status: "ativo",
    enteredAt: "2026-08-28T19:01:47.000Z",
    leftAt: null,
  },
  {
    id: "demo-5",
    name: "Renata S.",
    phone: "(85) 9****-3310",
    sourceGroup: "Atacado Moda — VIP 01",
    sourceCampaign: DEMO_CAMPAIGN_NAME,
    status: "comprou",
    enteredAt: "2026-08-28T19:02:20.000Z",
    leftAt: null,
  },
];

export type DemoOrder = {
  buyer: string;
  items: number;
  total: number;
};

/** O pedido do passo 4 — vem da lead que entrou com status `comprou`. */
export const DEMO_ORDER: DemoOrder = {
  buyer: "Renata S.",
  items: 12,
  total: 1840,
};
