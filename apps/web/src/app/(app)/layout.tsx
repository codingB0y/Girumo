import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { ToastProvider } from "@/components/toast";
import { ConnectionBanner } from "@/components/connection-banner";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="flex min-h-screen w-full bg-bruma">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileNav />
          <ConnectionBanner />
          {children}
        </div>
      </div>
    </ToastProvider>
  );
}
