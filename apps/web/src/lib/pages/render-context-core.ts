import { createHmac, timingSafeEqual } from "node:crypto";
import type { LpStructure, LpVisualDirection } from "./content";

const DOMAIN = "girumo-lp-render-context.v1";
const MAX_TOKEN_LENGTH = 4096;
const SLUG_RE = /^[a-z0-9-]{3,60}$/;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

export type LpRenderContext = {
  slug: string;
  publishedVersion: number;
  structure: LpStructure;
  visualDirection: LpVisualDirection;
  modelVersion: number;
  noticeVersion: string;
  noticeText: string;
};

export type RenderContextVerification =
  | { ok: true; value: LpRenderContext }
  | { ok: false; reason: "invalid" | "slug_mismatch" };

function signatureFor(encodedPayload: string, secret: string): Buffer {
  if (!secret) throw new Error("Segredo de assinatura ausente.");
  return createHmac("sha256", secret)
    .update(DOMAIN)
    .update(".")
    .update(encodedPayload)
    .digest();
}

function publicPayload(value: LpRenderContext): LpRenderContext {
  return {
    slug: value.slug,
    publishedVersion: value.publishedVersion,
    structure: value.structure,
    visualDirection: value.visualDirection,
    modelVersion: value.modelVersion,
    noticeVersion: value.noticeVersion,
    noticeText: value.noticeText,
  };
}

function isRenderContext(value: unknown): value is LpRenderContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate).sort();
  const expectedKeys = [
    "modelVersion",
    "noticeText",
    "noticeVersion",
    "publishedVersion",
    "slug",
    "structure",
    "visualDirection",
  ];

  return (
    keys.length === expectedKeys.length &&
    keys.every((key, index) => key === expectedKeys[index]) &&
    typeof candidate.slug === "string" &&
    SLUG_RE.test(candidate.slug) &&
    Number.isInteger(candidate.publishedVersion) &&
    (candidate.publishedVersion as number) >= 0 &&
    (candidate.publishedVersion as number) <= 2_147_483_647 &&
    candidate.structure === "conversion" &&
    candidate.visualDirection === "premium" &&
    Number.isInteger(candidate.modelVersion) &&
    (candidate.modelVersion as number) >= 0 &&
    (candidate.modelVersion as number) <= 2_147_483_647 &&
    typeof candidate.noticeVersion === "string" &&
    candidate.noticeVersion.length > 0 &&
    candidate.noticeVersion.length <= 64 &&
    typeof candidate.noticeText === "string" &&
    candidate.noticeText.length > 0 &&
    candidate.noticeText.length <= 1000
  );
}

export function signRenderContext(value: LpRenderContext, secret: string): string {
  const payload = publicPayload(value);
  if (!isRenderContext(payload)) {
    throw new Error("Contexto de render invalido.");
  }
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signatureFor(encodedPayload, secret).toString("base64url");
  return `${encodedPayload}.${signature}`;
}

export function verifyRenderContext(
  token: string,
  expectedSlug: string,
  secret: string,
): RenderContextVerification {
  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > MAX_TOKEN_LENGTH ||
    !SLUG_RE.test(expectedSlug)
  ) {
    return { ok: false, reason: "invalid" };
  }

  const parts = token.split(".");
  if (
    parts.length !== 2 ||
    !parts[0] ||
    !parts[1] ||
    !BASE64URL_RE.test(parts[0]) ||
    !BASE64URL_RE.test(parts[1])
  ) {
    return { ok: false, reason: "invalid" };
  }

  try {
    const actualSignature = Buffer.from(parts[1], "base64url");
    if (actualSignature.toString("base64url") !== parts[1]) {
      return { ok: false, reason: "invalid" };
    }
    const expectedSignature = signatureFor(parts[0], secret);
    if (
      actualSignature.length !== expectedSignature.length ||
      !timingSafeEqual(actualSignature, expectedSignature)
    ) {
      return { ok: false, reason: "invalid" };
    }

    const parsed = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (!isRenderContext(parsed)) return { ok: false, reason: "invalid" };
    if (parsed.slug !== expectedSlug) {
      return { ok: false, reason: "slug_mismatch" };
    }
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

export function isRenderContextStale(
  value: LpRenderContext,
  page: { slug: string; published_version: number } | null,
): boolean {
  return (
    !page ||
    page.slug !== value.slug ||
    page.published_version !== value.publishedVersion
  );
}
