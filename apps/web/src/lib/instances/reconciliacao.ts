// Quando o painel deve conferir na Evolution se a sessão já abriu.
//
// Sem `server-only`/Supabase de propósito — regra pura, testável isolada
// (mesmo padrão de instance-qr-guard.ts e session-select.ts).

import { phoneFromWuid } from "@/lib/evolution/webhook-schema";

type Conferivel = {
  status: string | null;
  provider_instance_id: string | null;
};

/**
 * O status da instância só vira `connected` pelo webhook `connection.update`
 * com `open`. Se esse evento se perde (429 no teto por IP, deploy no meio da
 * entrega, retentativas esgotadas), o celular fica pareado e o banco fica em
 * `qr` para sempre: o WhatsApp não emite outro `open` para uma sessão que já
 * está aberta. A tela diz "desconectado", e o lojista que tenta conectar de
 * novo faz logout da sessão boa.
 *
 * Confere só quem ainda não está conectado e já existe na Evolution.
 * `blocked` fica de fora: número banido não volta por conferência.
 */
export function precisaConferirConexao(instance: Conferivel): boolean {
  if (!instance.provider_instance_id) return false;
  return instance.status !== "connected" && instance.status !== "blocked";
}

/**
 * Telefone do dono da sessão a partir do `fetchInstances` da Evolution v2
 * (`[{ ownerJid: "<numero>@s.whatsapp.net", ... }]`). Formato inesperado vira
 * `null`: o telefone é complemento, quem decide a conexão é o `connectionState`.
 */
export function telefoneDoFetchInstances(raw: unknown): string | null {
  const primeira = Array.isArray(raw) ? raw[0] : raw;
  if (!primeira || typeof primeira !== "object") return null;
  const ownerJid = (primeira as { ownerJid?: unknown }).ownerJid;
  return typeof ownerJid === "string" ? phoneFromWuid(ownerJid) : null;
}
