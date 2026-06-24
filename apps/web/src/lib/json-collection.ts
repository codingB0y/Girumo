import "server-only";
import { promises as fs } from "fs";
import { writeFileAtomic, withFileLock } from "@/lib/atomic-fs";
import { legacyDataPath } from "@/lib/legacy-data-dir";

// Colecao JSON simples em arquivo (legado MVP). Reutilizada por templates, ad-campaigns,
// broadcasts e schedules ate a migracao dessas fatias para Supabase/PostgreSQL
// com tenant_id e RLS.
export function collection<T extends { id: string }>(fileName: string) {
  const FILE = legacyDataPath(fileName);

  async function list(): Promise<T[]> {
    try {
      return JSON.parse((await fs.readFile(FILE, "utf8")) || "[]") as T[];
    } catch {
      return [];
    }
  }

  function write(items: T[]) {
    return writeFileAtomic(FILE, JSON.stringify(items, null, 2));
  }

  return {
    list,
    async create(item: Omit<T, "id"> & { id?: string }): Promise<T> {
      return withFileLock(FILE, async () => {
        const items = await list();
        const rec = { ...item, id: item.id ?? crypto.randomUUID() } as T;
        items.unshift(rec);
        await write(items);
        return rec;
      });
    },
    async remove(id: string): Promise<void> {
      return withFileLock(FILE, async () => {
        await write((await list()).filter((x) => x.id !== id));
      });
    },
    async update(id: string, patch: Partial<T>): Promise<T | null> {
      return withFileLock(FILE, async () => {
        const items = await list();
        const idx = items.findIndex((x) => x.id === id);
        if (idx === -1) return null;
        items[idx] = { ...items[idx], ...patch };
        await write(items);
        return items[idx];
      });
    },
    /** Atualiza TODOS que casam com `match` aplicando `patch`. Retorna os atualizados. */
    async updateWhere(match: (x: T) => boolean, patch: Partial<T>): Promise<T[]> {
      return withFileLock(FILE, async () => {
        const items = await list();
        const changed: T[] = [];
        for (let i = 0; i < items.length; i++) {
          if (match(items[i])) {
            items[i] = { ...items[i], ...patch };
            changed.push(items[i]);
          }
        }
        if (changed.length) await write(items);
        return changed;
      });
    },
    /**
     * Read-modify-write atômico arbitrário sob o mesmo lock do arquivo. Usado p/
     * operações que precisam decidir E gravar numa só transação (ex.: claim).
     */
    transact<R>(fn: (items: T[]) => { items?: T[]; result: R } | Promise<{ items?: T[]; result: R }>): Promise<R> {
      return withFileLock(FILE, async () => {
        const items = await list();
        const out = await fn(items);
        if (out.items) await write(out.items);
        return out.result;
      });
    },
  };
}
