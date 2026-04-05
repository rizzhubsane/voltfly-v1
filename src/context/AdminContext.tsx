"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
// AdminUser type available via supabase query results

export type AdminRole = "super_admin" | "hub_manager";

interface AdminContextValue {
  role: AdminRole;
  hub_id: string | null;
  adminName: string;
  adminId: string;
  email: string;
  hubName: string | null;
  isLoading: boolean;
  logout: () => Promise<void>;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used inside <AdminProvider>");
  return ctx;
}

export function AdminProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminContextValue | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace("/auth/login");
      }
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkSession() {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/auth/login");
        return;
      }

      // Fetch admin_users row matching the auth user ID (primary) or email (fallback)
      const { data: adminUser, error } = await supabase
        .from("admin_users")
        .select("*, hubs(name)")
        .or(`id.eq.${session.user.id},email.eq.${session.user.email}`)
        .single();

      if (error || !adminUser) {
        console.warn("Admin record not found for user:", session.user.email, "| ID:", session.user.id);
        console.error("Lookup error:", error);
        // No admin_users row → not authorized
        await supabase.auth.signOut();
        router.replace("/auth/login");
        return;
      }

      const hubData = adminUser.hubs as { name: string } | null;

      setAdmin({
        role: adminUser.role as AdminRole,
        hub_id: adminUser.hub_id,
        adminName: adminUser.name,
        adminId: adminUser.id,
        email: adminUser.email,
        hubName: hubData?.name ?? null,
        isLoading: false,
        logout: async () => {
          await supabase.auth.signOut();
          router.replace("/auth/login");
        },
      });
    } catch {
      router.replace("/auth/login");
    } finally {
      setChecking(false);
    }
  }

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Verifying session…</p>
        </div>
      </div>
    );
  }

  if (!admin) return null;

  return (
    <AdminContext.Provider value={admin}>{children}</AdminContext.Provider>
  );
}
