import "server-only";
import { promises as fs } from "fs";
import { writeFileAtomic, withFileLock } from "@/lib/atomic-fs";
import { LEGACY_DATA_DIR } from "@/lib/legacy-data-dir";
import { tenantDataPath } from "@/lib/tenant-data-path";

// Lista de descadastro (LGPD) — números que nunca recebem mensagem.
export type OptOut = { id: string; phone: string; reason: string; date: string };

const digits = (s: string) => String(s).replace(/\D/g, "");

function optOutFile(tenantId: string): string {
  return tenantDataPath(LEGACY_DATA_DIR, tenantId, "optout.json");
}

export async function listOptOut(tenantId: string): Promise<OptOut[]> {
  try {
    return JSON.parse((await fs.readFile(optOutFile(tenantId), "utf8")) || "[]") as OptOut[];
  } catch {
    return [];
  }
}

export async function addOptOut(tenantId: string, phone: string, reason: string): Promise<OptOut> {
  const file = optOutFile(tenantId);
  return withFileLock(file, async () => {
    const list = await listOptOut(tenantId);
    const item: OptOut = {
      id: crypto.randomUUID(),
      phone: phone.trim(),
      reason: reason.trim() || "Adicionado manualmente",
      date: new Date().toISOString(),
    };
    list.unshift(item);
    await writeFileAtomic(file, JSON.stringify(list, null, 2));
    return item;
  });
}

export async function removeOptOut(tenantId: string, id: string): Promise<void> {
  const file = optOutFile(tenantId);
  return withFileLock(file, async () => {
    await writeFileAtomic(file, JSON.stringify((await listOptOut(tenantId)).filter((o) => o.id !== id), null, 2));
  });
}

/** True se o telefone está na lista de descadastro (compara só dígitos). */
export async function isOptedOut(tenantId: string, phone: string): Promise<boolean> {
  const d = digits(phone);
  if (!d) return false;
  return (await listOptOut(tenantId)).some((o) => digits(o.phone) === d);
}
