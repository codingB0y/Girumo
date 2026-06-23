import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

// Lê o accountId da sessão (cookie) dentro de route handlers Node. O middleware já
// barra requests sem sessão válida; isto é a fonte do "quem é a conta logada" no servidor.
export async function getSessionAccountId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySession(token);
}
