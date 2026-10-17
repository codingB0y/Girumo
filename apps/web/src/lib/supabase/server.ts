import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;
let anonClient: SupabaseClient | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  return value;
}

export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;

  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  adminClient = createClient(
    requireEnv("SUPABASE_URL"),
    serviceKey,
    {
      // Identidade fixa. Este cliente atravessa as requisições da instância: sem o header, o
      // supabase-js manda no Authorization o access_token de qualquer sessão que o auth client
      // tenha guardado (ex.: um signInWithPassword) e todas as queries "admin" seguintes rodam
      // como aquele usuário, presas em RLS e sem grant de escrita.
      global: {
        headers: {
          Authorization: `Bearer ${serviceKey}`,
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  return adminClient;
}

export function getSupabaseServerAnon(): SupabaseClient {
  if (anonClient) return anonClient;

  anonClient = createSupabaseAnonClient();

  return anonClient;
}

/**
 * Cliente anon NOVO a cada chamada, para fluxo que precisa da sessão de um usuário (login por
 * senha no cadastro). A sessão fica na memória da instância do cliente, então ela nunca deve ir
 * para um dos singletons deste arquivo, que são compartilhados entre requisições.
 */
export function createSupabaseAnonClient(): SupabaseClient {
  return createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_ANON_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

export function getSupabaseAnonForToken(accessToken: string): SupabaseClient {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
