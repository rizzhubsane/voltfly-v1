"use client";
import { adminFetch } from "@/lib/adminFetch";


import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { type AdminUser, type Hub } from "@/lib/types";
import { useAdmin } from "@/context/AdminContext";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, ShieldAlert, Users, Loader2, Plus, X, UserX, UserCheck, Trash2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

type AdminUserWithHub = AdminUser & { hubs: Partial<Hub> | null };

export default function AdminsPage() {
  const { role, adminId: currentAdminId } = useAdmin();
  const [users, setUsers] = useState<AdminUserWithHub[]>([]);
  const [hubs, setHubs] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Deactivate/Reactivate state
  const [toggleTarget, setToggleTarget] = useState<AdminUserWithHub | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  // Hard delete state
  const [deleteTarget, setDeleteTarget] = useState<AdminUserWithHub | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    newRole: "hub_manager",
    hub_id: "",
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [usersRes, hubsRes] = await Promise.all([
        supabase
          .from("admin_users")
          .select(`*, hubs (name)`)
          .order("created_at", { ascending: false }),
        adminFetch("/api/admin/payments?type=hubs").then(res => res.json())
      ]);

      if (usersRes.error) throw usersRes.error;
      setUsers(usersRes.data as AdminUserWithHub[] || []);
      if (hubsRes.hubs) setHubs(hubsRes.hubs);

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load directoy");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const res = await adminFetch("/api/admin/users", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          role: formData.newRole,
          hub_id: formData.newRole === "super_admin" ? null : formData.hub_id
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create user");

      toast.success(data.message || "User created successfully!");
      setIsModalOpen(false);
      setFormData({ name: "", email: "", password: "", newRole: "hub_manager", hub_id: "" });
      fetchData(); // Refresh list
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async () => {
    if (!toggleTarget) return;
    setIsToggling(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await adminFetch("/api/admin/users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ id: toggleTarget.id, is_active: !toggleTarget.is_active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update user");
      toast.success(toggleTarget.is_active ? `${toggleTarget.name} deactivated` : `${toggleTarget.name} reactivated`);
      setToggleTarget(null);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setIsToggling(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await adminFetch("/api/admin/users", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete user");
      toast.success(`${deleteTarget.name} permanently deleted`);
      setDeleteTarget(null);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Deletion failed");
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading && users.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading admin directory...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-secondary">Admin Roster</h1>
          <p className="mt-1 text-muted-foreground">
            Manage system administrators and hub managers.
          </p>
        </div>
        {role === "super_admin" && (
          <Button onClick={() => setIsModalOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Add User
          </Button>
        )}
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center">
          <h3 className="mb-2 font-semibold text-destructive">Failed to load</h3>
          <p className="text-sm text-destructive/80">{error}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border bg-white shadow-sm">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="w-[300px]">User Details</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Assigned Hub</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Joined</TableHead>
                {role === "super_admin" && <TableHead className="w-[130px]">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={role === "super_admin" ? 6 : 5} className="h-32 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Users className="h-8 w-8 text-muted" />
                      <p>No administrators found.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id} className="hover:bg-slate-50/50">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/20 bg-primary/10 font-semibold text-primary">
                          {(user.name ?? '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium text-secondary">{user.name}</span>
                          <span className="text-xs text-muted-foreground">{user.email}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {user.role === "super_admin" ? (
                        <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                          <ShieldAlert className="h-3.5 w-3.5" />
                          Super Admin
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          <Shield className="h-3.5 w-3.5" />
                          Hub Manager
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.hubs?.name ? (
                        <span className="text-sm font-medium">{user.hubs.name}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Global Access</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.is_active ? (
                        <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-600"></span>
                          Active
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
                          Inactive
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {user.created_at ? format(new Date(user.created_at), "MMM d, yyyy") : "Unknown"}
                    </TableCell>
                    {role === "super_admin" && (
                      <TableCell>
                        {user.id !== currentAdminId ? (
                          <div className="flex items-center gap-1">
                            <button
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                                user.is_active
                                  ? "text-orange-600 hover:bg-orange-50 border border-orange-200"
                                  : "text-emerald-600 hover:bg-emerald-50 border border-emerald-200"
                              }`}
                              onClick={() => setToggleTarget(user)}
                              title={user.is_active ? "Deactivate account" : "Reactivate account"}
                            >
                              {user.is_active ? <UserX className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
                              {user.is_active ? "Deactivate" : "Reactivate"}
                            </button>
                            <button
                              className="inline-flex items-center justify-center rounded-md h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                              onClick={() => setDeleteTarget(user)}
                              title="Permanently delete user"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">You</span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* --- Deactivate / Reactivate Dialog --- */}
      {toggleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-lg p-6 space-y-4">
            <div className="flex items-center gap-3">
              {toggleTarget.is_active
                ? <UserX className="h-6 w-6 text-orange-500 flex-shrink-0" />
                : <UserCheck className="h-6 w-6 text-emerald-500 flex-shrink-0" />}
              <div>
                <h3 className="font-semibold text-secondary">
                  {toggleTarget.is_active ? "Deactivate" : "Reactivate"} {toggleTarget.name}?
                </h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {toggleTarget.is_active
                    ? "They will lose access to the dashboard immediately."
                    : "They will regain access to the dashboard."}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t">
              <button
                className="px-4 py-2 text-sm rounded-lg border hover:bg-slate-50 transition-colors"
                onClick={() => setToggleTarget(null)}
              >
                Cancel
              </button>
              <button
                className={`px-4 py-2 text-sm font-semibold rounded-lg text-white flex items-center gap-2 transition-colors ${
                  toggleTarget.is_active ? "bg-orange-600 hover:bg-orange-700" : "bg-emerald-600 hover:bg-emerald-700"
                }`}
                disabled={isToggling}
                onClick={handleToggleActive}
              >
                {isToggling ? <Loader2 className="h-4 w-4 animate-spin" /> : (toggleTarget.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />)}
                {toggleTarget.is_active ? "Deactivate" : "Reactivate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Hard Delete Admin User Dialog --- */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-lg p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-destructive">Permanently Delete Admin User</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Delete <strong>{deleteTarget.name}</strong> ({deleteTarget.email})? Their login and all
                  admin access will be permanently removed from the system.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t">
              <button
                className="px-4 py-2 text-sm rounded-lg border hover:bg-slate-50 transition-colors"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 text-sm font-semibold rounded-lg text-white bg-red-600 hover:bg-red-700 flex items-center gap-2 transition-colors"
                disabled={isDeleting}
                onClick={handleDeleteUser}
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Add User Modal --- */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b px-6 py-4 bg-slate-50">
              <h2 className="text-lg font-semibold text-secondary">Add Administrator</h2>
              <button onClick={() => setIsModalOpen(false)} className="rounded-full p-1 hover:bg-slate-200">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            
            <form onSubmit={handleAddUser} className="overflow-y-auto px-6 py-4 space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Full Name</label>
                <Input 
                  required 
                  placeholder="e.g. John Doe" 
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Email Address</label>
                <Input 
                  required 
                  type="email" 
                  placeholder="admin@voltfly.in" 
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Initial Password</label>
                <Input 
                  required 
                  type="text" 
                  placeholder="At least 6 characters" 
                  value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                  minLength={6}
                />
                <p className="text-xs text-muted-foreground">They will use this to sign in.</p>
              </div>

              <div className="space-y-1 pt-2">
                <label className="text-sm font-medium">Role Assignment</label>
                <div className="flex gap-3">
                  {(["hub_manager", "super_admin"] as const).map(r => (
                    <label key={r} className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border p-3 hover:bg-slate-50 relative">
                      <input 
                        type="radio" 
                        name="role"
                        className="absolute opacity-0"
                        checked={formData.newRole === r} 
                        onChange={() => setFormData({ ...formData, newRole: r, hub_id: r === "super_admin" ? "" : formData.hub_id })} 
                      />
                      <div className={`h-4 w-4 rounded-full border flex items-center justify-center ${formData.newRole === r ? "border-primary" : "border-slate-300"}`}>
                        {formData.newRole === r && <div className="h-2 w-2 rounded-full bg-primary" />}
                      </div>
                      <span className="text-sm font-medium">
                        {r === "super_admin" ? "Super Admin" : "Hub Manager"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {formData.newRole === "hub_manager" && (
                <div className="space-y-1 animate-in slide-in-from-top-2 pt-2">
                  <label className="text-sm font-medium">Assign Hub *</label>
                  <select
                    required
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={formData.hub_id}
                    onChange={(e) => setFormData({ ...formData, hub_id: e.target.value })}
                  >
                    <option value="">Choose a hub...</option>
                    {hubs.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </select>
                </div>
              )}

              <div className="pt-4 border-t mt-4 flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting} className="min-w-[120px]">
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save User"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
