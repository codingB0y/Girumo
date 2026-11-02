import { reconciliarConexoes } from "@/lib/instances/reconciliar-conexao";
import type { CartaoDoNumero } from "@/lib/privado/cartao";
import { pausaDoNumero, privadoLiberado } from "@/lib/privado/numero";
import { getPrivadoInstance } from "@/lib/stores/instances";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/privado/numero — o cartão do número do atendimento na página Conectar: o add-on está
// ligado? existe o número? e a pausa de proteção dele.
// Fora de `ROTAS` (lib/auth/modulos): a vendedora recebe 403 de `getTenantContext`.
// Sem o add-on a resposta é `liberado: false` (200), e o número, se ainda existir, vem junto — o
// lojista precisa poder desconectá-lo. Erro de leitura é 500, nunca `liberado: false`.
export async function GET(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    const [liberado, privado] = await Promise.all([
      privadoLiberado(ctx.tenantId),
      getPrivadoInstance(ctx.tenantId),
    ]);
    if (!privado) return Response.json({ liberado, numero: null } satisfies CartaoDoNumero);

    // Promove o `connection.update` perdido (e confere o chip repetido) antes de desenhar a cena.
    const [conferido] = await reconciliarConexoes([privado]);
    // A conferência pode ter recusado o chip logo após promover: lê de novo para não mostrar
    // "conectado" num número que acabou de cair.
    const promovido = conferido.status !== privado.status;
    const atual = promovido ? ((await getPrivadoInstance(ctx.tenantId)) ?? conferido) : conferido;
    const pausadoAte = await pausaDoNumero(ctx.tenantId, atual.id);

    return Response.json({
      liberado,
      numero: {
        id: atual.id,
        name: atual.name,
        status: atual.status,
        phone: atual.phone,
        qr_code: atual.qr_code,
        connected_at: atual.connected_at,
        metadata: atual.metadata,
        pausadoAte,
      },
    } satisfies CartaoDoNumero);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[privado/numero]", e);
    return Response.json({ error: "Erro ao ler o número do atendimento." }, { status: 500 });
  }
}
