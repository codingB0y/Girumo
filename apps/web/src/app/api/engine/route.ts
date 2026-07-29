import { NextResponse } from "next/server";

/** URL base da engine Baileys. Em dev, aponta para localhost:3001. */
function getEngineBaseUrl(): string {
  return (
    process.env.ENGINE_URL ||
    process.env.NEXT_PUBLIC_ENGINE_URL ||
    "http://localhost:3001"
  );
}

/**
 * GET /api/engine
 *
 * Proxy para a engine Baileys (local ou dev).
 * Devolve o estado da conexao e, se houver, o QR em base64.
 *
 * Em dev, o front chama isso direto via fetch.
 * Em prod, a mesma rota cai no command worker Supabase.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ENGINE_TOKEN = process.env.ENGINE_TOKEN ?? "";

async function callEngine(path: string, init?: RequestInit) {
  const base = getEngineBaseUrl().replace(/\/+$/, "");
  const headers = new Headers(init?.headers ?? {});
  headers.set("x-engine-token", ENGINE_TOKEN);

  const res = await fetch(`${base}${path}`, { ...init, headers, cache: "no-store" });
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, json: JSON.parse(text) };
  } catch {
    return { ok: res.ok, status: res.status, text };
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action") ?? "status";

  try {
    if (action === "status" || action === "qr") {
      const r = await callEngine("/health");
      let qr: string | null = null;
      if (r.ok && r.json && !r.json.whatsappConnected) {
        const q = await callEngine("/qr");
        if (q.ok && q.json && q.json.qr) qr = q.json.qr;
      }
      return NextResponse.json({
        ok: true,
        engine: r.ok ? r.json : null,
        whatsappConnected: Boolean(r.ok && r.json?.whatsappConnected),
        connectedNumber: r.ok && r.json ? r.json.connectedNumber : null,
        qr,
      });
    }

    if (action === "logs") {
      const r = await callEngine("/dev/logs");
      return NextResponse.json({ ok: r.ok, logs: r.ok ? r.json : [] });
    }

    return NextResponse.json({ ok: false, error: `acao desconhecida: ${action}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action") ?? "";

  try {
    const body = await req.json().catch(() => ({}));
    let path = "";
    if (action === "send") path = "/dev/send";
    else if (action === "receive") path = "/dev/receive";
    else if (action === "webhook") path = "/dev/webhook";
    else if (action === "reset") path = "/dev/reset";
    else return NextResponse.json({ ok: false, error: `acao invalida: ${action}` }, { status: 400 });

    const r = await callEngine(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return NextResponse.json({ ok: r.ok, ...(r.json ?? { text: r.text }) });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const session = searchParams.get("session") ?? "default";
  try {
    const r = await callEngine(`/dev/sessions/${encodeURIComponent(session)}`, { method: "DELETE" });
    return NextResponse.json({ ok: r.ok });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
