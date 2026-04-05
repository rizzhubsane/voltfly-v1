"use client";

import { useAdmin } from "@/context/AdminContext";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function TopBar() {
  const { adminName, role, hubName, logout } = useAdmin();

  const roleBadge =
    role === "super_admin"
      ? { label: "Super Admin", className: "bg-primary/15 text-primary" }
      : { label: "Hub Manager", className: "bg-amber-100 text-amber-800" };

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-white px-6 lg:px-8">
      {/* Left – Page context (mobile spacer for hamburger) */}
      <div className="md:hidden w-10" />

      {/* Right – Admin info */}
      <div className="ml-auto flex items-center gap-4">
        {/* Hub name (hub_manager only) */}
        {hubName && (
          <span className="hidden text-sm text-muted-foreground sm:inline-block">
            Hub: <span className="font-medium text-foreground">{hubName}</span>
          </span>
        )}

        {/* Role badge */}
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${roleBadge.className}`}
        >
          {roleBadge.label}
        </span>

        {/* Admin name */}
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {adminName.charAt(0).toUpperCase()}
          </div>
          <span className="hidden text-sm font-medium lg:inline-block">
            {adminName}
          </span>
        </div>

        {/* Logout */}
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          className="text-muted-foreground hover:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          <span className="ml-2 hidden sm:inline">Logout</span>
        </Button>
      </div>
    </header>
  );
}
