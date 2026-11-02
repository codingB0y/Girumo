import "server-only";

import { logoutInstance, providerInstanceId } from "@/lib/evolution/client";
import { chaveDoTelefone } from "@/lib/pages/phone";
import { getPrivadoInstance, listInstances, updateInstanceStatus } from "@/lib/stores/instances";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * O número do atendimento do Recuperar e do Rastreio: a `instances` com `purpose = 'privado'` (no
 * máximo uma por loja). Vem com o add-on — não ocupa vaga de celular do plano — e nunca é o mesmo
 * chip dos grupos: se for, quem cai é sempre o do atendimento.
 */

export type NumeroDoAtendimento = { instanceId: string; instanceName: string; status: string; phone: string | null };

export const PRIVADO_SEM_ADDON = "O número do atendimento vem com o Recuperar ou o Rastreio. Ative um deles primeiro.";

/** Valor de `instances.metadata.privado_recusado` quando o chip é o dos grupos. */
export const CHIP_DOS_GRUPOS = "numero_dos_grupos";

export type ConferenciaDoNumero = "sem_numero" | "nada_a_fazer" | "recusado" | "ok";

/** `instanceName` = provider_instance_id ?? providerInstanceId(id). Qualquer status (quem chama olha). */
export async function numeroDoAtendimento(tenantId: string): Promise<NumeroDoAtendimento | null> {
  const privado = await getPrivadoInstance(tenantId);
  if (!privado) return null;
  return {
    instanceId: privado.id,
    instanceName: privado.provider_instance_id ?? providerInstanceId(privado.id),
    status: privado.status,
    phone: privado.phone,
  };
}

/** recuperar_enabled || rastreio_enabled. Sem linha → false. Erro de leitura → lança (quem chama fecha). */
export async function privadoLiberado(tenantId: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from("tenant_settings")
    .select("recuperar_enabled, rastreio_enabled")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const linha = data as { recuperar_enabled: boolean | null; rastreio_enabled: boolean | null } | null;
  return Boolean(linha?.recuperar_enabled || linha?.rastreio_enabled);
}

/** `private_number_state.paused_until` do número, ou null. */
export async function pausaDoNumero(tenantId: string, instanceId: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("private_number_state")
    .select("paused_until")
    .eq("tenant_id", tenantId)
    .eq("instance_id", instanceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { paused_until: string | null } | null)?.paused_until ?? null;
}

/**
 * Roda quando qualquer número da loja abre sessão (webhook e reconciliação). Erro de banco sobe (o
 * webhook devolve 5xx e a Evolution reentrega); só o logout é engolido. O banco vem primeiro: com a
 * Evolution fora, o número já está fora de uso.
 */
export async function conferirNumeroDoAtendimento(tenantId: string): Promise<ConferenciaDoNumero> {
  const instancias = await listInstances(tenantId);
  const privado = instancias.find((i) => i.purpose === "privado");
  if (!privado) return "sem_numero";
  const chave = chaveDoTelefone(privado.phone);
  if (privado.status !== "connected" || !chave) return "nada_a_fazer";

  const jaRecusado = privado.metadata?.privado_recusado === CHIP_DOS_GRUPOS;
  if (instancias.some((i) => i.purpose === "grupos" && chaveDoTelefone(i.phone) === chave)) {
    await updateInstanceStatus({
      tenantId,
      instanceId: privado.id,
      status: "disconnected",
      metadata: { privado_recusado: CHIP_DOS_GRUPOS },
    });
    // Logout antes do aviso: se o insert do sino falhar, a reentrega já vê o atendimento
    // `disconnected` (nada_a_fazer) e não derrubaria mais a sessão do chip repetido.
    try {
      await logoutInstance(privado.provider_instance_id ?? providerInstanceId(privado.id));
    } catch {
      // Telefone nunca vai para log; o id da instância basta para achar o caso.
      console.warn("[privado] logout do número do atendimento falhou", privado.id);
    }
    if (!jaRecusado) await avisarRecusa(tenantId);
    return "recusado";
  }

  // Cria o estado só se ainda não existe: quem já tinha rampa e saúde não recomeça.
  const agora = new Date().toISOString();
  const { error } = await getSupabaseAdmin()
    .from("private_number_state")
    .upsert(
      { tenant_id: tenantId, instance_id: privado.id, ramp_started_at: agora, healthy_since: agora },
      { onConflict: "instance_id", ignoreDuplicates: true },
    );
  if (error) throw new Error(error.message);
  if (jaRecusado) {
    await updateInstanceStatus({
      tenantId,
      instanceId: privado.id,
      status: "connected",
      metadata: { privado_recusado: null },
    });
  }
  return "ok";
}

async function avisarRecusa(tenantId: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from("notifications").insert({
    tenant_id: tenantId,
    type: "privado_recusado",
    title: "Número do atendimento recusado",
    body: "O chip conectado no número do atendimento é o mesmo do número dos grupos. Desconectamos o do atendimento: conecte outro chip nele.",
    href: "/painel/conectar",
  });
  if (error) throw new Error(error.message);
}
