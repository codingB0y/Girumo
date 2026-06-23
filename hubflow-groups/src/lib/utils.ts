import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Mascara o número de terceiros no painel (privacidade/LGPD): mostra país + DDD
 * e só os 2 últimos dígitos. O número completo segue armazenado p/ o disparo.
 * Ex.: +5511987654321 → "+55 11 •••••-••21"
 */
export function maskPhone(phone: string): string {
  const d = (phone ?? "").replace(/\D/g, "");
  if (d.length < 6) return "•••";
  const last2 = d.slice(-2);
  if (d.startsWith("55") && d.length >= 12) {
    return `+55 ${d.slice(2, 4)} •••••-••${last2}`;
  }
  return `+${d.slice(0, 4)} ••••${last2}`;
}
