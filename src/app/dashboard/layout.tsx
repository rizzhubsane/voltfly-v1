import { AdminProvider } from "@/context/AdminContext";
import { QueryProvider } from "@/context/QueryProvider";
import { Sidebar } from "@/components/shared/Sidebar";
import { TopBar } from "@/components/shared/TopBar";
import { Toaster } from "@/components/ui/sonner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <QueryProvider>
      <AdminProvider>
        <div className="flex h-screen overflow-hidden bg-slate-50">
          <Sidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <TopBar />
            <main className="flex-1 overflow-y-auto p-6 lg:p-10">
              <div className="mx-auto max-w-7xl">{children}</div>
            </main>
          </div>
        </div>
        <Toaster richColors position="top-right" />
      </AdminProvider>
    </QueryProvider>
  );
}
