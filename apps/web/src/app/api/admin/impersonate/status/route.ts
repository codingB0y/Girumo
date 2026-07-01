import { NextRequest, NextResponse } from "next/server";

const IMPERSONATE_COOKIE = "dz_impersonate";

/**
 * GET — verifica se a sessão atual é uma impersonation
 * Retorna dados do admin ou { impersonating: false }
 */
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(IMPERSONATE_COOKIE)?.value;

  if (!cookie) {
    return NextResponse.json({ impersonating: false });
  }

  try {
    const data = JSON.parse(cookie);
    return NextResponse.json({
      impersonating: true,
      adminEmail: data.adminEmail,
      tenantName: data.tenantName,
      tenantId: data.tenantId,
      startedAt: data.startedAt,
    });
  } catch {
    return NextResponse.json({ impersonating: false });
  }
}
