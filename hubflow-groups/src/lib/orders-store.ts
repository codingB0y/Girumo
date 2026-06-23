import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { writeFileAtomic, withFileLock } from "@/lib/atomic-fs";

// Pedidos REAIS (venda registrada pelo lojista). É a fonte de verdade de
// faturamento e recompra — o "lead.status=comprou" sozinho era cego (sem valor
// nem data). ndjson + escrita atômica + lock. Migrar p/ DB depois.

const DATA_DIR = path.join(process.cwd(), "data");
const ORDERS_FILE = path.join(DATA_DIR, "orders.ndjson");

export type Order = {
  id: string;
  phone: string; // amarra ao lead pelo telefone
  leadId?: string;
  group?: string;
  value: number; // R$
  createdAt: string;
};

const onlyDigits = (s: string) => String(s).replace(/\D/g, "");

async function ensure() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(ORDERS_FILE);
  } catch {
    await writeFileAtomic(ORDERS_FILE, "");
  }
}

function parse(raw: string): Order[] {
  const out: Order[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as Order);
    } catch {
      // ignora linha corrompida
    }
  }
  return out;
}

export async function listOrders(): Promise<Order[]> {
  await ensure();
  return parse(await fs.readFile(ORDERS_FILE, "utf8")).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export async function addOrder(input: {
  phone?: string;
  leadId?: string;
  group?: string;
  value: number;
}): Promise<Order> {
  await ensure();
  return withFileLock(ORDERS_FILE, async () => {
    const order: Order = {
      id: crypto.randomUUID(),
      phone: onlyDigits(input.phone ?? ""),
      leadId: input.leadId,
      group: input.group,
      value: Number(input.value) || 0,
      createdAt: new Date().toISOString(),
    };
    await fs.appendFile(ORDERS_FILE, JSON.stringify(order) + "\n");
    return order;
  });
}

export async function removeOrder(id: string): Promise<boolean> {
  await ensure();
  return withFileLock(ORDERS_FILE, async () => {
    const orders = parse(await fs.readFile(ORDERS_FILE, "utf8"));
    const next = orders.filter((o) => o.id !== id);
    if (next.length === orders.length) return false;
    await writeFileAtomic(ORDERS_FILE, next.map((o) => JSON.stringify(o)).join("\n") + (next.length ? "\n" : ""));
    return true;
  });
}

/** Última compra por telefone (dígitos) → ISO. Base do alerta de recompra. */
export function lastOrderByPhone(orders: Order[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const o of orders) {
    const d = onlyDigits(o.phone);
    if (!d) continue;
    const cur = m.get(d);
    if (!cur || o.createdAt > cur) m.set(d, o.createdAt);
  }
  return m;
}
