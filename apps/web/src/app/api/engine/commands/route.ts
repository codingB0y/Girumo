import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set(["send_message", "refresh_status"]);

export async function POST(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    const body = (await req.json().catch(() => ({}))) as {
      instanceId?: string;
      type?: string;
      payload?: Record<string, unknown>;
    };

    const type = String(body.type ?? "");
    if (!ALLOWED_TYPES.has(type)) {
      return Response.json({ error: "Tipo de comando invalido." }, { status: 400 });
    }

    const instanceId = body.instanceId ? String(body.instanceId) : null;
    if (!instanceId) {
      return Response.json({ error: "instanceId obrigatorio." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: instance, error: instanceError } = await supabase
      .from("instances")
      .select("id")
      .eq("tenant_id", ctx.tenantId)
      .eq("id", instanceId)
      .maybeSingle();

    if (instanceError) return Response.json({ error: instanceError.message }, { status: 500 });
    if (!instance) return Response.json({ error: "Instancia nao encontrada neste tenant." }, { status: 404 });

    const { data, error } = await supabase
      .from("engine_commands")
      .insert({
        tenant_id: ctx.tenantId,
        instance_id: instanceId,
        type,
        payload: body.payload ?? {},
      })
      .select("id, command_id, status, type, created_at")
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data, { status: 202 });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Erro ao criar comando.";
    return Response.json({ error: message }, { status: 500 });
  }
}

