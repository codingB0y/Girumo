import type { Group } from "@/lib/mock-data";

export type Campanha = {
  id: string;
  name: string;
  groupIds: string[];
  slug?: string;
};

export type TrackedLink = {
  slug: string;
  campaignName?: string;
  clicks: number;
};

export type Lead = {
  id: string;
  status: "novo" | "ativo" | "comprou";
  enteredAt: string;
};

export type Order = {
  id: string;
  value: number;
  created_at?: string;
};

export type Session = {
  live?: boolean;
  phone?: string | null;
};

export type TenantSettings = {
  monthlyGoalContacts: number | null;
  monthlyGoalRevenue: number | null;
};

export type DashboardData = {
  groups: Group[];
  campanhas: Campanha[];
  links: TrackedLink[];
  leads: Lead[];
  orders: Order[];
  session: Session;
  settings: TenantSettings;
};
