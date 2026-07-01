import { redirect } from "next/navigation";
import { getSessionAccountId } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { OnboardingWizard } from "@/components/onboarding-wizard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const authUserId = await getSessionAccountId();
  if (!authUserId) redirect("/login");

  const supabase = getSupabaseAdmin();

  // Busca tenant do user
  const { data: membership } = await supabase
    .from("memberships")
    .select("tenant_id")
    .eq("user_id", authUserId)
    .not("accepted_at", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/login");

  // Checa se já completou onboarding (tem grupo ou disparo)
  const { count: groupCount } = await supabase
    .from("groups")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", membership.tenant_id);

  // Se já tem grupos, pula direto pro dashboard
  if ((groupCount ?? 0) > 0) redirect("/dashboard");

  // Busca nome do user
  const { data: user } = await supabase
    .from("users")
    .select("name")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  return (
    <main className="flex min-h-screen items-center justify-center bg-bruma p-4">
      <OnboardingWizard userName={user?.name ?? ""} />
    </main>
  );
}
