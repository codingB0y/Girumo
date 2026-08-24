import "server-only";
import Stripe from "stripe";
import { guardStripe } from "@/lib/security-guards";
import { STRIPE_API_VERSION } from "./stripe-config";

let stripeClient: Stripe | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  return value;
}

export function getStripe(): Stripe {
  // Security guard: bloqueia chave live em dev ou chave de teste em prod
  const check = guardStripe();
  if (!check.allowed) {
    throw new Error(`[SECURITY] ${check.reason}`);
  }

  if (stripeClient) return stripeClient;
  // apiVersion pinada de proposito: o SDK esta em ^22.2.3, entao sem o pin um
  // npm update trocaria a versao da API — e o shape das respostas — sozinho.
  stripeClient = new Stripe(requireEnv("STRIPE_SECRET_KEY"), { apiVersion: STRIPE_API_VERSION });
  return stripeClient;
}

export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
