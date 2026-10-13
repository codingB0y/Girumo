import { createHash, randomBytes } from "node:crypto";
import type Stripe from "stripe";

/**
 * Add-on Instagram: implementação única + mensalidade, em assinatura separada
 * (docs/superpowers/specs/2026-10-07-instagram-assinatura-design.md). Puro: roda
 * sob `tsx --test`. Os ids de preço vêm do ambiente (ver `precoInstagram`).
 */
export { IMPLANTACAO_CENTS, MENSAL_CENTS, formatarReais, implantacaoComDesconto, parseDesconto } from "./instagram-preco";
export const CONVITE_VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;

/** O banco guarda só o SHA-256: quem lê a tabela não monta o link. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function novoTokenConvite(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

/** Cupom de um convite: só na implementação, uma vez, um uso, vence com o convite. 0% = sem cupom. */
export function cupomDoConvite(
  descontoPercent: number,
  produtoImplantacaoId: string,
  venceEm: Date,
  inviteId: string,
): Stripe.CouponCreateParams | null {
  if (descontoPercent <= 0) return null;
  return {
    percent_off: descontoPercent,
    duration: "once",
    applies_to: { products: [produtoImplantacaoId] },
    max_redemptions: 1,
    redeem_by: Math.floor(venceEm.getTime() / 1000),
    name: `Implementação Instagram ${descontoPercent}%`,
    metadata: { addon: "instagram", invite_id: inviteId },
  };
}

/** Ids de preço do add-on. `trim`: valor colado no terminal pode trazer quebra de linha. */
export function precoInstagram(): { mensal: string; implantacao: string } | null {
  const mensal = process.env.STRIPE_PRICE_INSTAGRAM?.trim();
  const implantacao = process.env.STRIPE_PRICE_INSTAGRAM_IMPLANTACAO?.trim();
  return mensal && implantacao ? { mensal, implantacao } : null;
}
