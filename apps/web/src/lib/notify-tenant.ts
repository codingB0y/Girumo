import { getSupabaseAdmin } from "@/lib/supabase/server";

type NotifyEvent = "group_full" | "lead_hot" | "lead_new" | "broadcast_failed" | "warmup_complete";

type NotifyPayload = {
  tenantId: string;
  event: NotifyEvent;
  title: string;
  body?: string;
  href?: string;
};

export async function notifyTenant({ tenantId, event, title, body, href }: NotifyPayload) {
  const supabase = getSupabaseAdmin();

  // 1. Always create in-app notification
  await supabase.from("notifications").insert({
    tenant_id: tenantId,
    type: event === "broadcast_failed" ? "error" : event === "lead_hot" ? "warning" : "success",
    title,
    body,
    href,
  });

  // 2. Check if tenant has WhatsApp webhook enabled for this event
  const { data: webhook } = await supabase
    .from("tenant_webhooks")
    .select("phone, enabled, events")
    .eq("tenant_id", tenantId)
    .eq("type", "whatsapp")
    .eq("enabled", true)
    .maybeSingle();

  if (!webhook || !webhook.phone || !webhook.events?.includes(event)) {
    return;
  }

  // 3. Queue WhatsApp notification via engine dispatch
  const engineUrl = process.env.ENGINE_URL || process.env.NEXT_PUBLIC_ENGINE_URL;
  const engineToken = process.env.ENGINE_TOKEN;

  if (!engineUrl || !engineToken) return;

  const message = body ? `*${title}*\n\n${body}` : `*${title}*`;

  try {
    await fetch(`${engineUrl}/api/send-notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-engine-token": engineToken,
      },
      body: JSON.stringify({
        phone: webhook.phone,
        message,
      }),
    });
  } catch {
    // fail-silent: engine might be offline
  }
}
