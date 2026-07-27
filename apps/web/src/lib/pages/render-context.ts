import "server-only";

import { resolveSecret } from "@/lib/runtime-secrets";
import {
  isRenderContextStale,
  signRenderContext,
  verifyRenderContext,
  type LpRenderContext,
  type RenderContextVerification,
} from "@/lib/pages/render-context-core";

function renderContextSecret(): string {
  return resolveSecret(
    "AUTH_SECRET",
    process.env.AUTH_SECRET,
    process.env.NODE_ENV,
    "dz-dev-secret-troque-em-producao",
  );
}

export function createRenderContextToken(value: LpRenderContext): string {
  return signRenderContext(value, renderContextSecret());
}

export function verifyRenderContextToken(
  token: string,
  expectedSlug: string,
): RenderContextVerification {
  return verifyRenderContext(token, expectedSlug, renderContextSecret());
}

export { isRenderContextStale };
export type { LpRenderContext, RenderContextVerification };
