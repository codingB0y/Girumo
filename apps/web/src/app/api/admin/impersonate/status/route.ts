import { NextRequest, NextResponse } from "next/server";
import { verifyImpersonate } from "@/lib/auth";

const IMPERSONATE_COOKIE = "dz_impersonate";

type ImpersonateData = { adminEmail?: string; tenantName?: string; tenantId?: string; startedAt?: string };

/**
 * GET — verifica se a sessão atual é uma impersonation
 * Retorna dados do admin ou { impersonating: false }
 */
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(IMPERSONATE_COOKIE)?.value;

  // Só confia no cookie se a assinatura HMAC bater (senão é forjado).
  const data = await verifyImpersonate<ImpersonateData>(cookie);
  if (!data) {
    return NextResponse.json({ impersonating: false });
  }

  return NextResponse.json({
    impersonating: true,
    adminEmail: data.adminEmail,
    tenantName: data.tenantName,
    tenantId: data.tenantId,
    startedAt: data.startedAt,
  });
}
