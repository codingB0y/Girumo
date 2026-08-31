// Tipos compartilhados do dominio. Os dados vem de stores reais/APIs.
// A fonte alvo e Supabase/PostgreSQL com RLS, sem Prisma.

export type Engagement = "alto" | "medio" | "baixo";

export type Group = {
  id: string;
  name: string;
  /** Nome interno usado no painel, sem alterar o nome real do WhatsApp. */
  displayNameBase?: string;
  /** Numero sequencial para familias de grupos: Promocoes 1, Promocoes 2... */
  displayNumber?: number;
  whatsappGroupId: string;
  members: number;
  capacity: number;
  selected: boolean;
  engagement: Engagement;
  /** Se a conta conectada é admin do grupo — sem isso, não dá pra disparar nele. */
  isAdmin?: boolean;
  /** Link de convite REAL do grupo. Destino do roteamento "Campanha que lota sozinho". */
  inviteUrl?: string;
  /** Estado de envio que aplicamos por último. `null`/ausente = nunca aplicamos. */
  sendState?: "open" | "closed" | null;
};

export type CampaignStatus = "draft" | "scheduled" | "queued" | "running" | "sent" | "failed";

export type Campaign = {
  id: string;
  name: string;
  status: CampaignStatus;
  message: string;
  groupIds: string[];
  /** Mídia anexada (foto/vídeo) — enviada com a mensagem como legenda. */
  mediaId?: string;
  mediaType?: "image" | "video";
  /** Marcar todos os membros do grupo (@) — força a notificação. */
  mentionAll?: boolean;
  /** Enquete: se presente, dispara uma enquete em vez de mensagem comum. */
  poll?: { question: string; options: string[] };
  sent: number;
  total: number;
  createdAt: string;
  /** Erro do último disparo, se houve (reportado pela engine). */
  error?: string;
  /** Quando a engine terminou o disparo. */
  dispatchedAt?: string;
  /** Quando a engine começou a disparar (p/ detectar job preso). */
  runningSince?: string;
  /** Último ack de progresso da engine (p/ detectar job preso). */
  lastAckAt?: string;
};

export type ScheduleStatus = "pending" | "running" | "done" | "failed";

export type Schedule = {
  id: string;
  /** Oferta (broadcast) que será disparada no horário. */
  campaignId?: string;
  campaignName: string;
  scheduledAt: string;
  recurrence: "none" | "daily" | "weekly";
  status: ScheduleStatus;
  /** Último horário em que o agendamento disparou. */
  lastRunAt?: string;
};

export type MessageTemplate = {
  id: string;
  name: string;
  category: "drop" | "promocao" | "reativacao" | "pos-venda";
  body: string;
  uses: number;
};

export type AdStatus = "rascunho" | "ativa" | "pausada";

export type AdCampaign = {
  id: string;
  name: string;
  targetGroupId: string;
  targetGroupName: string;
  status: AdStatus;
  objective: string;
  budgetDaily: number;
  audience: string;
  primaryText: string;
  headline: string;
  description: string;
  script: string;
  creativeIdeas: string[];
  linkSlug: string;
  /** Link de convite REAL do grupo (destino do anúncio). */
  inviteUrl: string;
  spend: number;
  clicks: number;
  entries: number;
  cpl: number;
};

export type LeadStatus = "novo" | "ativo" | "comprou";

export type Lead = {
  id: string;
  name: string;
  phone: string;
  sourceGroup: string;
  sourceCampaign: string;
  status: LeadStatus;
  enteredAt: string;
};
