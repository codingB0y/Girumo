import { collection } from "@/lib/json-collection";
import { crudRoute } from "@/lib/crud-route";
import type { MessageTemplate } from "@/lib/mock-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const coll = collection<MessageTemplate>("templates.json");

export const { GET, POST, DELETE } = crudRoute<MessageTemplate>(coll, (b) => {
  if (!b.name || !b.body) return { error: "name e body são obrigatórios." };
  const category = b.category as MessageTemplate["category"];
  return {
    name: String(b.name),
    category: category ?? "drop",
    body: String(b.body),
    uses: 0,
  };
});
