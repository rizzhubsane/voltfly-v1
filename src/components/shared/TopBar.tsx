"use client";

import { useState, useRef, useEffect } from "react";
import { useAdmin } from "@/context/AdminContext";
import { Button } from "@/components/ui/button";
import { LogOut, KeyRound, ChevronDown, Loader2, Eye, EyeOff, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { adminFetch } from "@/lib/adminFetch";

export function TopBar() {
  const { adminName, role, hubName, logout } = useAdmin();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const roleBadge =
    role === "super_admin"
      ? { label: "Super Admin", className: "bg-primary/15 text-primary" }
      : { label: "Hub Manager", className: "bg-amber-100 text-amber-800" };

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await adminFetch("/api/admin/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to change password");

      toast.success("Password changed successfully!");
      setChangePasswordOpen(false);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b border-border bg-white px-6 lg:px-8">
        {/* Left – mobile spacer */}
        <div className="md:hidden w-10" />

        {/* Right – Admin info */}
        <div className="ml-auto flex items-center gap-4">
          {/* Hub name */}
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

          {/* Admin avatar + dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen((v) => !v)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100 transition-colors"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {adminName.charAt(0).toUpperCase()}
              </div>
              <span className="hidden text-sm font-medium lg:inline-block">{adminName}</span>
              <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-1 w-52 rounded-xl border border-border bg-white shadow-lg py-1 z-50">
                {/* Profile header */}
                <div className="px-4 py-2.5 border-b">
                  <p className="text-sm font-semibold text-secondary truncate">{adminName}</p>
                  <p className="text-xs text-muted-foreground truncate">{roleBadge.label}</p>
                </div>

                {/* Change Password */}
                <button
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-secondary hover:bg-slate-50 transition-colors"
                  onClick={() => {
                    setDropdownOpen(false);
                    setChangePasswordOpen(true);
                  }}
                >
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                  Change Password
                </button>

                <div className="border-t my-1" />

                {/* Logout */}
                <button
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-destructive hover:bg-red-50 transition-colors"
                  onClick={logout}
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </div>
            )}
          </div>

          {/* Standalone logout (mobile — visible when dropdown is hidden on small screens) */}
          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            className="text-muted-foreground hover:text-destructive lg:hidden"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* ── Change Password Modal ────────────────────────────────────────── */}
      {changePasswordOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-6 py-4 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                  <KeyRound className="h-4 w-4 text-primary" />
                </div>
                <h2 className="text-base font-semibold text-secondary">Change Password</h2>
              </div>
              <button
                onClick={() => { setChangePasswordOpen(false); setNewPassword(""); setConfirmPassword(""); }}
                className="rounded-full p-1 hover:bg-slate-200 transition-colors"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            <form onSubmit={handleChangePassword} className="px-6 py-5 space-y-4">
              {/* New password */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-secondary">New Password</label>
                <div className="relative">
                  <input
                    type={showNew ? "text" : "password"}
                    required
                    minLength={8}
                    placeholder="Min. 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm pr-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowNew((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm password */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-secondary">Confirm Password</label>
                <div className="relative">
                  <input
                    type={showConfirm ? "text" : "password"}
                    required
                    minLength={8}
                    placeholder="Re-enter new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={`w-full rounded-lg border bg-background px-3 py-2 text-sm pr-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      confirmPassword && confirmPassword !== newPassword
                        ? "border-destructive focus-visible:ring-destructive"
                        : "border-input"
                    }`}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {confirmPassword && confirmPassword !== newPassword && (
                  <p className="text-xs text-destructive">Passwords do not match</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setChangePasswordOpen(false); setNewPassword(""); setConfirmPassword(""); }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={saving || !newPassword || newPassword !== confirmPassword}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update Password"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
