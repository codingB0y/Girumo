import {
  finalizeLandingPageUpdate,
  type LandingPage,
  type LandingPageUpdatePatch,
} from "./schema";

export const LANDING_PAGE_UPDATE_MAX_ATTEMPTS = 3;

export type LandingPageCompareAndSwap = (
  expected: LandingPage,
  patch: LandingPageUpdatePatch,
) => Promise<LandingPage | null>;

export type LandingPageUpdateCasResult =
  | { ok: true; page: LandingPage }
  | { ok: false; reason: "validation"; error: string }
  | { ok: false; reason: "not_found" | "conflict" };

type LandingPageUpdateCasInput = {
  initialPage: LandingPage;
  requestedPatch: LandingPageUpdatePatch;
  compareAndSwap: LandingPageCompareAndSwap;
  reload: () => Promise<LandingPage | null>;
  nowIso?: string;
};

/**
 * Recalcula o patch sobre a versão mais recente depois de cada conflito.
 * O store retorna `null` quando o UPDATE condicional perde o CAS.
 */
export async function updateLandingPageWithCas({
  initialPage,
  requestedPatch,
  compareAndSwap,
  reload,
  nowIso = new Date().toISOString(),
}: LandingPageUpdateCasInput): Promise<LandingPageUpdateCasResult> {
  let current = initialPage;

  for (
    let attempt = 1;
    attempt <= LANDING_PAGE_UPDATE_MAX_ATTEMPTS;
    attempt += 1
  ) {
    const finalized = finalizeLandingPageUpdate(
      current,
      requestedPatch,
      nowIso,
    );
    if (!finalized.ok) {
      return {
        ok: false,
        reason: "validation",
        error: finalized.error,
      };
    }

    const updated = await compareAndSwap(current, finalized.patch);
    if (updated) return { ok: true, page: updated };

    if (attempt === LANDING_PAGE_UPDATE_MAX_ATTEMPTS) {
      return { ok: false, reason: "conflict" };
    }

    const latest = await reload();
    if (!latest) return { ok: false, reason: "not_found" };
    current = latest;
  }

  return { ok: false, reason: "conflict" };
}
