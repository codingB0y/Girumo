import { Calendar, RotateCcw, Users, type LucideIcon } from "lucide-react";

/**
 * Como cada gatilho aparece pro lojista. Fonte única: a tela de Automações e o
 * card da Início leem daqui, pra que "Grupo lotou" não vire "Grupo cheio" numa
 * das duas.
 *
 * Só os gatilhos que o lojista vê. `no_connect_24h` e `trial_ending` são
 * lifecycle do SaaS (vivem em `lib/email` + cron) e foram retirados da tela
 * dele no P0.7 — por isso não têm rótulo aqui.
 */
export const TRIGGER_LABELS: Record<string, { label: string; icon: LucideIcon }> = {
  lead_entered: { label: "Contato entrou no grupo", icon: Users },
  signup: { label: "Novo cadastro", icon: Users },
  group_full: { label: "Grupo lotou", icon: Users },
  weekly_recurring: { label: "Toda semana", icon: Calendar },
  group_stalled: { label: "Grupo parado", icon: RotateCcw },
};
