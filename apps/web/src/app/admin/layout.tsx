import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-guard";
import { AdminSidebar } from "@/components/admin/sidebar";
import { AdminTopbar } from "@/components/admin/topbar";

export const metadata: Metadata = {
  title: "Admin — Girumo",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  return (
    // `admin-root` e a marca do shell de PLATAFORMA, e existe para os testes.
    // Ate 25/08/2026 ela era citada em admin-gate.spec.ts (`not.toHaveClass(
    // /admin-root/)`) sem existir em lugar nenhum do codigo: a assercao passava
    // sempre, inclusive se o painel de plataforma vazasse para um lojista. So o
    // redirect para /login fazia trabalho real ali. Nao remova esta classe sem
    // trocar o que os specs usam como prova de que o shell montou.
    <div className="admin-root font-body flex min-h-screen w-full bg-canvas-100 text-volt-950">
      <AdminSidebar email={admin.email} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
