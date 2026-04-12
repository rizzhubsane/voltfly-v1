"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAdmin, type AdminRole } from "@/context/AdminContext";
import {
  LayoutDashboard,
  Users,
  BadgeCheck,
  Truck,
  CreditCard,
  Shield,
  Wrench,
  Bell,
  BarChart3,
  Settings,
  Menu,
  X,
} from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
  superAdminOnly?: boolean;
}

const navItems: NavItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Riders", href: "/dashboard/riders", icon: Users },
  { name: "Payments", href: "/dashboard/payments", icon: CreditCard },
  { name: "Vehicles", href: "/dashboard/vehicles", icon: Truck },
  {
    name: "KYC Approvals",
    href: "/dashboard/kyc",
    icon: BadgeCheck,
    badge: 0, // will be replaced by pending count
  },
  { name: "Service Requests", href: "/dashboard/service", icon: Wrench },
  {
    name: "Notifications",
    href: "/dashboard/notifications",
    icon: Bell,
    superAdminOnly: true,
  },
  {
    name: "Reports",
    href: "/dashboard/reports",
    icon: BarChart3,
    superAdminOnly: true,
  },
  {
    name: "Admin Users",
    href: "/dashboard/admins",
    icon: Settings,
    superAdminOnly: true,
  },
];

function getVisibleItems(role: AdminRole) {
  return navItems.filter((item) =>
    item.superAdminOnly ? role === "super_admin" : true
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { role } = useAdmin();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [kycPending, setKycPending] = useState(0);

  const visible = getVisibleItems(role);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Fetch pending KYC count from Supabase + subscribe to live changes
  useEffect(() => {
    const fetchPending = async () => {
      const { count } = await supabase
        .from("kyc")
        .select("id", { count: "exact", head: true })
        .eq("kyc_status", "pending");
      setKycPending(count ?? 0);
    };

    fetchPending();

    const channel = supabase
      .channel("sidebar-kyc")
      .on("postgres_changes", { event: "*", schema: "public", table: "kyc" }, () => {
        fetchPending();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const linkClasses = (href: string) => {
    const isActive =
      href === "/dashboard"
        ? pathname === "/dashboard"
        : pathname?.startsWith(href) ?? false;

    return `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
      isActive
        ? "bg-white/15 text-white shadow-sm"
        : "text-white/60 hover:bg-white/8 hover:text-white"
    }`;
  };

  const navContent = (
    <>
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 pt-6 pb-8">
        <Image src="/logo.png" alt="Voltfly Logo" width={140} height={40} className="object-contain" priority />
      </div>

      {/* Links */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {visible.map((item) => {
          const Icon = item.icon;
          const showBadge = item.name === "KYC Approvals" && kycPending > 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={linkClasses(item.href)}
            >
              <Icon className="h-[18px] w-[18px] flex-shrink-0" />
              <span className="flex-1">{item.name}</span>
              {showBadge && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold leading-none text-white">
                  {kycPending}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/10 px-5 py-4">
        <p className="text-xs text-white/40">Voltfly Admin v1.0</p>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-[208px] flex-shrink-0 flex-col bg-[#0D2D6B] md:flex">
        {navContent}
      </aside>

      {/* Mobile toggle button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-lg bg-[#0D2D6B] text-white shadow-lg md:hidden"
        aria-label="Open sidebar"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay + drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-[224px] flex-col bg-[#0D2D6B] shadow-2xl animate-in slide-in-from-left duration-300">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-5 flex h-8 w-8 items-center justify-center rounded-md text-white/60 hover:text-white"
              aria-label="Close sidebar"
            >
              <X className="h-5 w-5" />
            </button>
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
}
