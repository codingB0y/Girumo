import "server-only";
import Stripe from "stripe";

let stripeClient: Stripe | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  return value;
}

export function getStripe(): Stripe {
  if (stripeClient) return stripeClient;
  stripeClient = new Stripe(requireEnv("STRIPE_SECRET_KEY"));
  return stripeClient;
}

export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

