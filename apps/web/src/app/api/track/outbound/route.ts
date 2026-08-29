import { hashIp, isBotUserAgent, isRateLimited } from "@/lib/pages/analytics";
import { parseOutboundBeacon } from "@/lib/analytics/acquisition";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/track/outbound — beacon do clique que SAI do nosso domínio.
 *
 * O clique em `wa.me` é o desfecho que o plano de SEO mede, e é justamente o
 * único que o servidor nunca enxerga: o browser navega para outro host e nada
 * disso aparece em log de rota. Sem este beacon, a única métrica disponível
 * seria pageview — a métrica que o plano proíbe explicitamente.
 *
 * Entra sem sessão por natureza: quem lê a landing ainda não tem conta.
 *
 * SEMPRE devolve 204, inclusive quando recusa. Um beacon que responde 400 para
 * payload inválido e 204 para válido vira oráculo: dá para varrer a allowlist de
 * eventos de fora. O preço disso é conhecido e está pago logo abaixo — todo
 * caminho de recusa e de falha ESCREVE NO LOG DO SERVIDOR. A armadilha que já
 * nos custou tempo (`/api/p/track` usando 204 para sucesso E erro, sem log) foi
 * exatamente esta: a série parava de crescer e ninguém tinha como ver por quê.
 */
export async function POST(req: Request) {
  const ua = req.headers.get("user-agent");
  if (isBotUserAgent(ua)) return new Response(null, { status: 204 });

  const ip = hashIp(req);
  // Teto por IP no próprio handler, além do teto do middleware: 20 cliques de
  // saída por minuto já é muito para uma pessoa lendo uma página.
  if (isRateLimited(`outbound:${ip ?? "unknown"}`, 20)) {
    return new Response(null, { status: 204 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    console.warn("[track/outbound] Corpo não é JSON — beacon descartado.");
    return new Response(null, { status: 204 });
  }

  const parsed = parseOutboundBeacon(body);
  if (!parsed.ok) {
    // Um bug no client (nome de evento renomeado, caminho não enviado) some em
    // silêncio se este log não existir. O motivo vem do parser justamente para
    // dizer QUAL metade do payload veio errada.
    console.warn(`[track/outbound] Beacon recusado: ${parsed.reason}.`);
    return new Response(null, { status: 204 });
  }

  const { event, sourcePath, attribution } = parsed.value;

  try {
    const { error } = await getSupabaseAdmin().from("acquisition_events").insert({
      event_name: event,
      source_path: sourcePath,
      referrer: attribution.referrer,
      utm_source: attribution.utm_source,
      utm_medium: attribution.utm_medium,
      utm_campaign: attribution.utm_campaign,
      utm_content: attribution.utm_content,
      utm_term: attribution.utm_term,
      ip_hash: ip,
    });

    // A tabela ausente num dos dois bancos cai aqui. É o modo de falha mais
    // provável deste PR (migração aplicada só em dev) e o que mais engana:
    // o visitante não vê nada, e o relatório fica vazio parecendo "sem tráfego".
    if (error) {
      console.error(`[track/outbound] Falha ao gravar '${event}':`, error.message);
    }
  } catch (err) {
    // `getSupabaseAdmin()` lança quando SUPABASE_URL/SERVICE_ROLE_KEY faltam —
    // cenário real, porque a validação de ambiente não aborta o boot.
    console.error(
      "[track/outbound] Supabase indisponível:",
      err instanceof Error ? err.message : String(err),
    );
  }

  return new Response(null, { status: 204 });
}
