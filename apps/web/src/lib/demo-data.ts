export type DemoGroup = {
  id: string;
  name: string;
  members: number;
  capacity: number;
  engagement: "Alto" | "Médio" | "Em crescimento";
};

export type DemoCampaign = {
  id: string;
  name: string;
  groupIds: string[];
  sentAt: string;
  clicks: number;
  message: string;
};

export type DemoContact = {
  id: string;
  name: string;
  source: string;
  status: "Novo" | "Ativo" | "Comprou";
  joinedAt: string;
};

export type DemoMetric = {
  contacts: number;
  clicks: number;
  conversionRate: number;
  groupsFilled: number;
};

export type DemoScenario = {
  storeName: string;
  connection: { status: "connected"; phone: string };
  groups: DemoGroup[];
  campaign: DemoCampaign;
  contacts: DemoContact[];
  metrics: DemoMetric;
};

const groups: DemoGroup[] = [
  { id: "demo-grupo-vip", name: "VIP Moda Feminina", members: 842, capacity: 1024, engagement: "Alto" },
  { id: "demo-grupo-lancamentos", name: "Lançamentos da Semana", members: 619, capacity: 1024, engagement: "Alto" },
  { id: "demo-grupo-ofertas", name: "Ofertas Relâmpago", members: 387, capacity: 1024, engagement: "Em crescimento" },
];

const contacts: DemoContact[] = [
  { id: "demo-contato-luana", name: "Luana Mendes", source: "Semana do Inverno", status: "Novo", joinedAt: "Hoje, 09:42" },
  { id: "demo-contato-bruna", name: "Bruna Alves", source: "Semana do Inverno", status: "Ativo", joinedAt: "Hoje, 09:18" },
  { id: "demo-contato-camila", name: "Camila Rocha", source: "Link do Instagram", status: "Comprou", joinedAt: "Ontem, 17:36" },
  { id: "demo-contato-mariana", name: "Mariana Costa", source: "Semana do Inverno", status: "Ativo", joinedAt: "Ontem, 15:02" },
  { id: "demo-contato-beatriz", name: "Beatriz Lima", source: "Link do Instagram", status: "Novo", joinedAt: "Ontem, 11:20" },
  { id: "demo-contato-isabela", name: "Isabela Martins", source: "Semana do Inverno", status: "Ativo", joinedAt: "Segunda, 18:45" },
];

export const demoScenario: DemoScenario = {
  storeName: "Aurora Atacado",
  connection: { status: "connected", phone: "+55 62 99999-0000" },
  groups,
  campaign: {
    id: "demo-campanha-inverno",
    name: "Semana do Inverno",
    groupIds: groups.map((group) => group.id),
    sentAt: "Hoje, 08:30",
    clicks: 286,
    message: "Chegou a Semana do Inverno: reposições e lançamentos com condições especiais para o grupo VIP.",
  },
  contacts,
  metrics: {
    contacts: contacts.length,
    clicks: 286,
    conversionRate: 18.4,
    groupsFilled: 3,
  },
};
