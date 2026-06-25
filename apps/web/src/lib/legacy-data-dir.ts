import "server-only";
import path from "path";

export const LEGACY_DATA_DIR =
  process.env.HUBFLOW_DATA_DIR ?? (process.env.NODE_ENV === "production" ? "/tmp/hubflow" : "data");

export function legacyDataPath(...segments: string[]): string {
  return path.join(LEGACY_DATA_DIR, ...segments);
}
