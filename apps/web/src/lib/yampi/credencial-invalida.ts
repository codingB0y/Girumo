import "server-only";

import { marcarCredencialInvalidaNoBanco } from "@/lib/stores/yampi-conexoes";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const ERRO_DA_CONEXAO = "A Yampi recusou o acesso (credencial inválida).";
const TITULO = "A Yampi recusou o acesso";
const CORPO = "Troque o token e a chave em Configurações › Integrações para voltar a receber os pedidos.";
const LINK = "/painel/configuracoes?secao=integracoes";

/**
 * A Yampi devolveu 401: o token só muda com a senha da Yampi, então a conexão cai na 1ª recusa e o sino avisa
 * uma vez (um não lido por vez, sem e-mail). Nunca lança: roda no caminho do erro, e quem chamou relança o 401.
 * `userTokenSelado` é o token da chamada que levou o 401: se a loja já colou outro, nada muda.
 * ponytail: a mudança de status e o sino são duas escritas; se o sino falhar, só fica o log (o cartão mostra o estado).
 */
export async function marcarCredencialInvalida(tenantId: string, userTokenSelado: string | null): Promise<void> {
  try {
    const mudou = await marcarCredencialInvalidaNoBanco(tenantId, userTokenSelado, ERRO_DA_CONEXAO);
    if (!mudou) return;
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("notifications")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("title", TITULO)
      .is("read_at", null)
      .limit(1);
    if (error) throw new Error(error.message);
    if ((data ?? []).length > 0) return;
    const { error: erroAoInserir } = await supabase
      .from("notifications")
      .insert({ tenant_id: tenantId, type: "error", title: TITULO, body: CORPO, href: LINK });
    if (erroAoInserir) throw new Error(erroAoInserir.message);
  } catch (e) {
    console.error(`[yampi] loja ${tenantId}: a credencial inválida não foi avisada: ${e instanceof Error ? e.message : String(e)}`);
  }
}
