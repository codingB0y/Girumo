import { after } from "next/server";
import { validateDemoRequest } from "@/lib/demo/request-validation";
import { notifyDemoRequest } from "@/lib/demo/notify";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Uma hora. O teto por telefone é folgado — erra-se pouco pedindo demo. */
const PHONE_WINDOW_MS = 60 * 60 * 1000;
const PHONE_MAX = 2;

const SALES_WHATSAPP_URL =
  process.env.NEXT_PUBLIC_SALES_WHATSAPP_URL ||
  "https://wa.me/5562998191314?text=Ol%C3%A1!%20Quero%20agendar%20uma%20demonstra%C3%A7%C3%A3o.";

/** Desfecho da tentativa de gravar `demo_requests` — sucesso ou falha, sem meio-termo. */
type InsertOutcome = { ok: true; id: string } | { ok: false; message: string };

/**
 * POST /api/demo/request — captura do CTA "agendar demonstração" em /demo.
 *
 * Entra sem sessão: quem preenche ainda não tem conta. O middleware já limitou
 * por IP (`public-rate-limited` + entrada em RATE_LIMITS); aqui limitamos por
 * TELEFONE, que é outra dimensão — a mesma pessoa trocando de rede não escapa.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const validation = validateDemoRequest(body);

  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  const { name, phone, stepReached } = validation.value;

  if (await checkRateLimit(`demo:${phone}`, PHONE_MAX, PHONE_WINDOW_MS)) {
    return Response.json(
      { error: "Já recebemos seu pedido. Em instantes falamos com você." },
      { status: 429 },
    );
  }

  // `getSupabaseAdmin()` lança quando SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
  // faltam ou são inválidas — cenário real em produção, porque a validação de
  // ambiente não aborta o boot (ver env-validator.ts). O try/catch aqui garante
  // que ESSE throw caia no mesmo desfecho de falha que um erro devolvido pelo
  // insert: é exatamente quando nosso lado está fora do ar que o visitante mais
  // precisa do link de WhatsApp de saída.
  const outcome: InsertOutcome = await (async (): Promise<InsertOutcome> => {
    try {
      const { data, error } = await getSupabaseAdmin()
        .from("demo_requests")
        .insert({ name, phone, step_reached: stepReached, source: "demo" })
        .select("id")
        .single();
      return error ? { ok: false, message: error.message } : { ok: true, id: data.id };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  })();

  if (!outcome.ok) {
    // O insert é a fonte da verdade e ele falhou (ou nem chegou a rodar). Não
    // engolir: avisar por e-mail marcando que NÃO gravou, e devolver ao
    // visitante um caminho que não depende de nada nosso funcionar.
    console.error("[demo] Falha ao gravar demo_requests:", outcome.message);
    after(() => notifyDemoRequest({ name, phone, stepReached, persisted: false }));
    return Response.json(
      {
        error: "Não conseguimos registrar agora. Fale com a gente no WhatsApp.",
        whatsappUrl: SALES_WHATSAPP_URL,
      },
      { status: 500 },
    );
  }

  const { id } = outcome;

  // Fora do caminho da resposta: o visitante não espera o Resend.
  after(async () => {
    const sent = await notifyDemoRequest({ name, phone, stepReached, persisted: true });
    if (!sent) return;
    // getSupabaseAdmin() já construiu o client com sucesso ali em cima — só se
    // chega aqui pelo ramo `outcome.ok`. O client é singleton de módulo (ver
    // src/lib/supabase/server.ts: `if (adminClient) return adminClient;`), então
    // esta chamada reaproveita a mesma instância sem repetir `requireEnv` — não
    // pode lançar de novo dentro desta mesma execução.
    const { error: markError } = await getSupabaseAdmin()
      .from("demo_requests")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", id);
    if (markError) {
      console.error("[demo] Aviso enviado mas notified_at não gravou:", markError.message);
    }
  });

  return Response.json({ ok: true }, { status: 201 });
}
