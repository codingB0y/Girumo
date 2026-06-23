import { collection } from "@/lib/json-collection";
import { crudRoute } from "@/lib/crud-route";
import type { Schedule, ScheduleStatus } from "@/lib/mock-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const coll = collection<Schedule>("schedules.json");

export const { GET, POST, DELETE } = crudRoute<Schedule>(coll, (b) => {
  if (!b.campaignName || !b.scheduledAt) return { error: "campaignName e scheduledAt obrigatórios." };
  const recurrence = (b.recurrence as Schedule["recurrence"]) ?? "none";
  return {
    campaignId: b.campaignId ? String(b.campaignId) : undefined,
    campaignName: String(b.campaignName),
    scheduledAt: String(b.scheduledAt),
    recurrence,
    status: "pending" as ScheduleStatus,
  };
});
