import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { writeFileAtomic, withFileLock } from "@/lib/atomic-fs";

// Lista de descadastro (LGPD) — números que nunca recebem mensagem.
const FILE = path.join(process.cwd(), "data", "optout.json");

export type OptOut = { id: string; phone: string; reason: string; date: string };

const digits = (s: string) => String(s).replace(/\D/g, "");

export async function listOptOut(): Promise<OptOut[]> {
  try {
    return JSON.parse((await fs.readFile(FILE, "utf8")) || "[]") as OptOut[];
  } catch {
    return [];
  }
}

export async function addOptOut(phone: string, reason: string): Promise<OptOut> {
  return withFileLock(FILE, async () => {
    const list = await listOptOut();
    const item: OptOut = {
      id: crypto.randomUUID(),
      phone: phone.trim(),
      reason: reason.trim() || "Adicionado manualmente",
      date: new Date().toISOString(),
    };
    list.unshift(item);
    await writeFileAtomic(FILE, JSON.stringify(list, null, 2));
    return item;
  });
}

export async function removeOptOut(id: string): Promise<void> {
  return withFileLock(FILE, async () => {
    await writeFileAtomic(FILE, JSON.stringify((await listOptOut()).filter((o) => o.id !== id), null, 2));
  });
}

/** True se o telefone está na lista de descadastro (compara só dígitos). */
export async function isOptedOut(phone: string): Promise<boolean> {
  const d = digits(phone);
  if (!d) return false;
  return (await listOptOut()).some((o) => digits(o.phone) === d);
}
