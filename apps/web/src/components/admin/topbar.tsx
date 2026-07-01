import { Shield } from "lucide-react";
import { AdminAlertsDropdown } from "@/components/admin/alerts-dropdown";

export function AdminTopbar() {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-breu/10 bg-bruma/80 px-4 backdrop-blur-xl sm:px-6">
      {/* Spacer para o hamburger no mobile */}
      <div className="w-10 lg:hidden" />

      <div className="flex items-center gap-2 rounded-lg bg-alerta/10 px-3 py-1.5">
        <Shield className="h-4 w-4 text-alerta" />
        <span className="font-data text-xs uppercase tracking-wider text-alerta">Painel Admin</span>
      </div>

      <div className="flex-1" />

      <AdminAlertsDropdown />
    </header>
  );
}
