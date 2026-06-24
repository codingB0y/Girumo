import "server-only";

export const LEGACY_DATA_DIR = process.env.HUBFLOW_DATA_DIR ?? "data";

export function legacyDataPath(...segments: string[]): string {
  return [LEGACY_DATA_DIR, ...segments]
    .map((segment) => segment.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}
