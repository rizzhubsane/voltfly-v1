"use client";
import { adminFetch } from "@/lib/adminFetch";
import { ExpandableNote } from "@/components/shared/ExpandableNote";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { RiderWithHub } from "@/lib/types";
import { useAdmin } from "@/context/AdminContext";
import { format } from "date-fns";
import Link from "next/link";
import { toast } from "sonner";
import { Sheet } from "@/components/ui/sheet";
import { OfflineOnboardDrawer } from "@/components/riders/OfflineOnboardDrawer";
import { AddRiderDrawer } from "@/components/riders/AddRiderDrawer";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Search,
  Download,
  Users,
  Filter,
  UserPlus,
  Plus,
  Ban,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Trash2,
  Unlink,
  CheckSquare,
  X,
  LogOut,
} from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

type RiderStatus =
  | "pending_kyc"
  | "kyc_submitted"
  | "kyc_approved"
  | "active"
  | "suspended"
  | "exited";

const STATUS_CONFIG: Record<
  RiderStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  pending_kyc: {
    label: "Pending KYC",
    bg: "bg-slate-100",
    text: "text-slate-700",
    dot: "bg-slate-400",
  },
  kyc_submitted: {
    label: "KYC Submitted",
    bg: "bg-amber-100",
    text: "text-amber-800",
    dot: "bg-amber-500",
  },
  kyc_approved: {
    label: "KYC Approved",
    bg: "bg-blue-100",
    text: "text-blue-800",
    dot: "bg-blue-500",
  },
  active: {
    label: "Active",
    bg: "bg-emerald-100",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
  },
  suspended: {
    label: "Suspended",
    bg: "bg-orange-100",
    text: "text-orange-800",
    dot: "bg-orange-500",
  },
  exited: {
    label: "Exited",
    bg: "bg-red-100",
    text: "text-red-700",
    dot: "bg-red-500",
  },
};

const HUB_OPTIONS = ["All", "Okhla", "Jhandewalan"] as const;

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "pending_kyc", label: "Pending KYC" },
  { value: "kyc_submitted", label: "KYC Submitted" },
  { value: "kyc_approved", label: "KYC Approved" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "exited", label: "Exited" },
];


// ─── Fetch riders ────────────────────────────────────────────────────────────

async function fetchRiders(hubId: string | null): Promise<RiderWithHub[]> {
  const params = new URLSearchParams();
  if (hubId) params.set("hubId", hubId);
  const qs = params.toString();
  try {
    const res = await adminFetch(`/api/admin/riders${qs ? `?${qs}` : ""}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const json = (await res.json()) as { riders?: RiderWithHub[] };
      if (Array.isArray(json.riders)) return json.riders;
    }
  } catch {
    // fall through to client
  }

  let query = supabase
    .from("riders")
    .select("*, hubs(name)")
    .order("created_at", { ascending: false });

  if (hubId) {
    query = query.eq("hub_id", hubId);
  }

  const { data, error } = await query;
  if (!error) {
    // Also fetch vehicle assignments for this batch
    const rows = (data as RiderWithHub[]) ?? [];
    const riderIds = rows.map((r) => r.id).filter(Boolean);
    const { data: vehicleRows } = riderIds.length > 0
      ? await supabase
          .from("vehicles")
          .select("vehicle_id, chassis_number, assigned_rider_id")
          .in("assigned_rider_id", riderIds)
      : { data: [] };
    const vehicleByRider = new Map(
      (vehicleRows || [])
        .filter((v) => v.assigned_rider_id)
        .map((v) => [v.assigned_rider_id as string, v.vehicle_id || v.chassis_number || null])
    );
    return rows.map((r) => ({ ...r, vehicle_id: vehicleByRider.get(r.id) ?? null }));
  }

  let baseQuery = supabase
    .from("riders")
    .select("*")
    .order("created_at", { ascending: false });
  if (hubId) {
    baseQuery = baseQuery.eq("hub_id", hubId);
  }

  const { data: riderRows, error: riderError } = await baseQuery;
  if (riderError) throw riderError;

  const hubIds = Array.from(new Set((riderRows || []).map((r) => r.hub_id).filter((id): id is string => id !== null)));
  const { data: hubRows, error: hubError } =
    hubIds.length > 0
      ? await supabase.from("hubs").select("id, name").in("id", hubIds)
      : { data: [], error: null };
  if (hubError) throw hubError;

  const hubById = new Map((hubRows || []).map((h) => [h.id, h.name]));

  // Also join vehicles in deep fallback
  const riderIds2 = (riderRows || []).map((r) => r.id).filter(Boolean);
  const { data: vehicleRows2 } = riderIds2.length > 0
    ? await supabase
        .from("vehicles")
        .select("vehicle_id, chassis_number, assigned_rider_id")
        .in("assigned_rider_id", riderIds2)
    : { data: [] };
  const vehicleByRider2 = new Map(
    (vehicleRows2 || [])
      .filter((v) => v.assigned_rider_id)
      .map((v) => [v.assigned_rider_id as string, v.vehicle_id || v.chassis_number || null])
  );

  return (riderRows || []).map((r) => ({
    ...r,
    hubs: r.hub_id && hubById.get(r.hub_id) ? { name: hubById.get(r.hub_id)! } : null,
    vehicle_id: vehicleByRider2.get(r.id) ?? null,
  })) as RiderWithHub[];
}

// ─── Status badge component ─────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as RiderStatus] ?? {
    label: status,
    bg: "bg-slate-100",
    text: "text-slate-600",
    dot: "bg-slate-400",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ─── Skeleton row ────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-slate-200 animate-pulse" />
          <div className="h-4 w-28 rounded bg-slate-200 animate-pulse" />
        </div>
      </TableCell>
      <TableCell>
        <div className="h-4 w-24 rounded bg-slate-200 animate-pulse" />
      </TableCell>
      <TableCell>
        <div className="h-4 w-8 rounded bg-slate-200 animate-pulse" />
      </TableCell>
      <TableCell>
        <div className="h-5 w-24 rounded-full bg-slate-200 animate-pulse" />
      </TableCell>
      <TableCell>
        <div className="h-5 w-16 rounded bg-slate-200 animate-pulse" />
      </TableCell>
      <TableCell>
        <div className="h-5 w-16 rounded-full bg-slate-200 animate-pulse" />
      </TableCell>
      <TableCell>
        <div className="h-5 w-16 rounded-full bg-slate-200 animate-pulse" />
      </TableCell>
      <TableCell>
        <div className="h-6 w-16 rounded bg-slate-200 animate-pulse" />
      </TableCell>
      <TableCell>
        <div className="h-4 w-20 rounded bg-slate-200 animate-pulse" />
      </TableCell>
      <TableCell>
        <div className="h-8 w-16 rounded bg-slate-200 animate-pulse" />
      </TableCell>
    </TableRow>
  );
}

// ─── CSV export helper ───────────────────────────────────────────────────────

function exportCSV(riders: RiderWithHub[]) {
  const headers = [
    "Name",
    "Phone",
    "Hub",
    "Status",
    "Vehicle ID",
    "Driver ID",
    "Date Joined",
    "Added By",
    "Admin Notes",
  ];
  const rows = riders.map((r) => [
    r.name,
    r.phone_1,
    r.hubs?.name ?? "—",
    r.status,
    r.vehicle_id || "—",
    r.driver_id || "—",
    r.created_at ? format(new Date(r.created_at), "yyyy-MM-dd") : "—",
    (r as any).added_by || "—",
    (r as any).admin_notes || "—",
  ]);

  const csv = [headers, ...rows]
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `riders-export-${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ═════════════════════════════════════════════════════════════════════════════

export default function RidersPage() {
  const { role, hub_id, adminId } = useAdmin();
  const isSuperAdmin = role === "super_admin";
  const queryClient = useQueryClient();

  // ── Filters ──────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [hubFilter, setHubFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState(""); // "YYYY-MM-DD"
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // ── Bulk selection ────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState<null | "delete" | "block_swap" | "unblock_swap" | "unassign_vehicle" | "process_exit">(null);

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const clearSelection = () => setSelectedIds(new Set());

  const executeBulkAction = async (action: string) => {
    setBulkLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await adminFetch("/api/admin/riders/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          action,
          riderIds: Array.from(selectedIds),
          reason: action === "block_swap" ? "Bulk block by admin" : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bulk action failed");
      const count = data.count ?? selectedIds.size;
      const labels: Record<string, string> = {
        unassign_vehicle: "Unassigned vehicle & driver ID from",
        block_swap: "Blocked swap access for",
        unblock_swap: "Unblocked swap access for",
        delete: "Deleted",
      };
      toast.success(`${labels[action] ?? "Done for"} ${count} rider(s)`);
      clearSelection();
      queryClient.invalidateQueries({ queryKey: ["riders"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBulkLoading(false);
      setBulkConfirm(null);
    }
  };

  // ── Offline Onboard Drawer ───────────────────────────────────────────────
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [onboardRider, setOnboardRider] = useState<{ id: string; name: string } | null>(null);

  // ── Add Rider Drawer ─────────────────────────────────────────────────────
  const [addRiderOpen, setAddRiderOpen] = useState(false);

  // ── Swap Block/Unblock ──────────────────────────────────────────────────
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  const [swapTarget, setSwapTarget] = useState<RiderWithHub | null>(null);
  const [swapAction, setSwapAction] = useState<"block" | "unblock">("block");
  const [swapReason, setSwapReason] = useState("");

  // ── Queries ──────────────────────────────────────────────────────────────
  const {
    data: allRiders = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["riders", hub_id],
    queryFn: () => fetchRiders(null),  // hub_id is metadata only — no data isolation by hub
    staleTime: 0,
    gcTime: 0,
  });

  // ── Swap Mutation ────────────────────────────────────────────────────────
  const swapMutation = useMutation({
    mutationFn: async () => {
      if (!swapTarget) throw new Error("No rider selected");
      const res = await adminFetch(`/api/admin/riders/${swapTarget.id}/swap-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: swapAction,
          reason: swapReason || `Swap manually ${swapAction}ed by admin`,
          driverId: swapTarget.driver_id,
          adminId,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `Failed to ${swapAction} swap access`);
      return d;
    },
    onSuccess: () => {
      toast.success(`Swap access ${swapAction === "block" ? "blocked" : "unblocked"} for ${swapTarget?.name}`);
      queryClient.invalidateQueries({ queryKey: ["riders"] });
      setSwapDialogOpen(false);
      setSwapTarget(null);
      setSwapReason("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── Client-side filtering ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = allRiders;

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.phone_1.toLowerCase().includes(q) ||
          (r.vehicle_id ?? "").toLowerCase().includes(q) ||
          (r.driver_id ?? "").toLowerCase().includes(q)
      );
    }

    // Date filter — match riders whose joining date equals the selected date
    if (dateFilter) {
      list = list.filter((r) => {
        if (!r.created_at) return false;
        const joined = format(new Date(r.created_at), "yyyy-MM-dd");
        return joined === dateFilter;
      });
    }

    // Hub filter (super_admin only)
    if (isSuperAdmin && hubFilter !== "All") {
      list = list.filter(
        (r) =>
          r.hubs?.name?.toLowerCase() === hubFilter.toLowerCase()
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      list = list.filter((r) => r.status === statusFilter);
    }

    return list;
  }, [allRiders, search, dateFilter, hubFilter, statusFilter, isSuperAdmin]);

  // ── Infinite scroll slice ────────────────────────────────────────────────
  const visible = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount]
  );
  const hasMore = visibleCount < filtered.length;

  // Select-all is computed after visible is known
  const allVisibleSelected =
    visible.length > 0 && visible.every((r) => selectedIds.has(r.id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visible.map((r) => r.id)));
    }
  };

  // Reset visible count when filters change
  const resetPage = useCallback(() => setVisibleCount(PAGE_SIZE), []);

  // IntersectionObserver sentinel — load more when bottom row is in view
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) {
          setVisibleCount((c) => c + PAGE_SIZE);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore]);

  // ── Loading state ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0D2D6B]">
            Riders
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage all registered riders across hubs.
          </p>
        </div>
        <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="w-[220px]">Rider</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Hub</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Wallet</TableHead>
                <TableHead>Vehicle ID</TableHead>
                <TableHead>Driver ID</TableHead>
                <TableHead>Swap</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center">
        <h3 className="font-semibold text-destructive">
          Failed to load riders
        </h3>
        <p className="mt-1 text-sm text-destructive/80">
          {(error as Error).message}
        </p>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0D2D6B]">
            Riders
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage all registered riders across hubs.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <Button
            className="gap-2 bg-[#0D2D6B] hover:bg-[#0D2D6B]/90"
            onClick={() => setAddRiderOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Add Rider
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => exportCSV(filtered)}
            disabled={filtered.length === 0}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by name, phone, vehicle ID, driver ID…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground hidden sm:block" />

          {/* Date (joining date) filter */}
          <div className="relative flex items-center">
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => { setDateFilter(e.target.value); resetPage(); }}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring text-slate-700"
              title="Filter by joining date"
            />
            {dateFilter && (
              <button
                onClick={() => { setDateFilter(""); resetPage(); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-slate-700 transition-colors"
                title="Clear date filter"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Hub filter — only for super_admin */}
          {isSuperAdmin && (
            <select
              value={hubFilter}
              onChange={(e) => {
                setHubFilter(e.target.value);
                resetPage();
              }}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {HUB_OPTIONS.map((hub) => (
                <option key={hub} value={hub}>
                  {hub === "All" ? "All Hubs" : hub}
                </option>
              ))}
            </select>
          )}

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              resetPage();
            }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

        </div>
      </div>

      {/* Results count */}
      <p className="text-sm text-muted-foreground">
        Showing{" "}
        <span className="font-medium text-foreground">
          {filtered.length}
        </span>{" "}
        rider{filtered.length !== 1 && "s"}
        {search.trim() || hubFilter !== "All" || statusFilter !== "all" || dateFilter
          ? " (filtered)"
          : ""}
        {dateFilter && (
          <span className="ml-1 text-xs text-[#0D2D6B] font-medium">
            joined {format(new Date(dateFilter + "T00:00:00"), "d MMM yyyy")}
          </span>
        )}
      </p>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              {/* Select-all checkbox */}
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 accent-[#0D2D6B] cursor-pointer"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAll}
                  title={allVisibleSelected ? "Deselect all" : "Select all visible"}
                />
              </TableHead>
              <TableHead className="w-[220px]">Rider</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Hub</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Wallet</TableHead>
              <TableHead>Vehicle ID</TableHead>
              <TableHead>Driver ID</TableHead>
              <TableHead>Swap</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Admin Info</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="h-40 text-center text-muted-foreground"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Users className="h-10 w-10 text-muted-foreground/40" />
                    <p className="font-medium">No riders found</p>
                    <p className="text-xs">
                      Try adjusting your search or filters.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              visible.map((rider) => (
                <TableRow
                  key={rider.id}
                  className={`hover:bg-slate-50/80 transition-colors ${
                    selectedIds.has(rider.id) ? "bg-blue-50/60" : ""
                  }`}
                >
                  {/* Row checkbox */}
                  <TableCell className="w-10">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 accent-[#0D2D6B] cursor-pointer"
                      checked={selectedIds.has(rider.id)}
                      onChange={() => toggleSelect(rider.id)}
                    />
                  </TableCell>
                  {/* Name + avatar */}
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary flex-shrink-0">
                        {(rider.name ?? '?').charAt(0).toUpperCase()}
                      </div>
                      <Link
                        href={`/dashboard/riders/${rider.id}`}
                        className="font-medium text-[#0D2D6B] hover:underline"
                      >
                        {rider.name ?? <span className="text-muted-foreground italic">Unnamed</span>}
                      </Link>
                    </div>
                  </TableCell>

                  {/* Phone */}
                  <TableCell className="text-muted-foreground">
                    {rider.phone_1}
                  </TableCell>

                  {/* Hub — abbreviated */}
                  <TableCell>
                    {rider.hubs?.name ? (
                      <span className="text-sm font-semibold text-slate-600">
                        {rider.hubs.name.toLowerCase().includes("okhla")
                          ? "OK"
                          : rider.hubs.name.toLowerCase().includes("jhande")
                          ? "JH"
                          : rider.hubs.name}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  {/* Status badge */}
                  <TableCell>
                    <StatusBadge status={rider.status} />
                  </TableCell>

                  {/* Wallet balance */}
                  <TableCell>
                    {(() => {
                      const bal = rider.wallet_balance ?? null;
                      if (bal === null) return <span className="text-muted-foreground text-xs">—</span>;
                      const isNeg = bal < 0;
                      const isZero = bal === 0;
                      return (
                        <span className={`text-sm font-bold tabular-nums ${
                          isNeg ? "text-red-600" : isZero ? "text-orange-500" : "text-emerald-700"
                        }`}>
                          ₹{bal.toLocaleString()}
                        </span>
                      );
                    })()}
                  </TableCell>

                  {/* Vehicle ID — clickable to assign/view */}
                  <TableCell>
                    {rider.vehicle_id ? (
                      <Link
                        href={`/dashboard/riders/${rider.id}?tab=vehicle`}
                        className="text-sm font-semibold text-[#0D2D6B] hover:underline underline-offset-2"
                        title="View vehicle details"
                      >
                        {rider.vehicle_id}
                      </Link>
                    ) : (
                      <Link
                        href={`/dashboard/riders/${rider.id}?assign=vehicle`}
                        className="text-xs text-blue-500 hover:text-blue-700 hover:underline underline-offset-2 font-medium transition-colors"
                        title="Click to assign a vehicle"
                      >
                        + Assign
                      </Link>
                    )}
                  </TableCell>

                  {/* Driver ID (Upgrid) — inline from API */}
                  <TableCell>
                    <span className="text-sm text-slate-600">
                      {rider.driver_id || <span className="text-muted-foreground">—</span>}
                    </span>
                  </TableCell>

                  {/* Swap block/unblock */}
                  <TableCell>
                    {rider.driver_id && rider.status === "active" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 text-xs h-7 border-orange-200 text-orange-700 hover:bg-orange-50"
                        onClick={() => {
                          setSwapTarget(rider);
                          setSwapAction("block");
                          setSwapReason("");
                          setSwapDialogOpen(true);
                        }}
                      >
                        <Ban className="h-3 w-3" />
                        Block
                      </Button>
                    ) : rider.driver_id && rider.status === "suspended" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 text-xs h-7 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                        onClick={() => {
                          setSwapTarget(rider);
                          setSwapAction("unblock");
                          setSwapReason("");
                          setSwapDialogOpen(true);
                        }}
                      >
                        <RefreshCw className="h-3 w-3" />
                        Unblock
                      </Button>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>

                  {/* Date joined */}
                  <TableCell className="text-sm text-muted-foreground">
                    {rider.created_at
                      ? format(new Date(rider.created_at), "dd MMM yyyy")
                      : "—"}
                  </TableCell>

                  {/* Admin Info */}
                  <TableCell className="max-w-[160px]">
                    <div className="space-y-1">
                      {(rider as any).added_by && (
                        <div className="flex items-center gap-1.5 text-[10px] font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5 w-fit max-w-full truncate" title={`Added by: ${(rider as any).added_by}`}>
                          <span>👤</span>
                          <span className="truncate">{(rider as any).added_by}</span>
                        </div>
                      )}
                      <ExpandableNote note={(rider as any).admin_notes} />
                    </div>
                  </TableCell>

                  {/* Actions */}
                  <TableCell>
                    <div className="flex items-center gap-1 flex-wrap">
                      {rider.status === "kyc_approved" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 text-xs h-7 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                          onClick={() => {
                            setOnboardRider({ id: rider.id, name: rider.name });
                            setOnboardOpen(true);
                          }}
                        >
                          <UserPlus className="h-3 w-3" />
                          Onboard
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Infinite scroll sentinel ──────────────────────────────────────── */}
      <div ref={sentinelRef} className="flex items-center justify-center py-4">
        {hasMore ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : filtered.length > PAGE_SIZE ? (
          <p className="text-xs text-muted-foreground">All {filtered.length} riders loaded</p>
        ) : null}
      </div>

      {/* ── Floating Bulk Action Bar ──────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur-md shadow-2xl px-4 py-3 ring-1 ring-black/5">
          {/* Count badge */}
          <div className="flex items-center gap-2 pr-3 border-r border-slate-200">
            <CheckSquare className="h-4 w-4 text-[#0D2D6B]" />
            <span className="text-sm font-bold text-[#0D2D6B]">{selectedIds.size} selected</span>
          </div>

          {/* Unassign Vehicle */}
          <Button
            variant="outline"
            size="sm"
            disabled={bulkLoading}
            className="gap-1.5 text-xs h-8 border-slate-300 text-slate-700 hover:bg-slate-50"
            onClick={() => setBulkConfirm("unassign_vehicle")}
          >
            <Unlink className="h-3.5 w-3.5" />
            Unassign Vehicle
          </Button>

          {/* Block Swap */}
          <Button
            variant="outline"
            size="sm"
            disabled={bulkLoading}
            className="gap-1.5 text-xs h-8 border-orange-200 text-orange-700 hover:bg-orange-50"
            onClick={() => setBulkConfirm("block_swap")}
          >
            <Ban className="h-3.5 w-3.5" />
            Block Swap
          </Button>

          {/* Unblock Swap */}
          <Button
            variant="outline"
            size="sm"
            disabled={bulkLoading}
            className="gap-1.5 text-xs h-8 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            onClick={() => setBulkConfirm("unblock_swap")}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Unblock Swap
          </Button>

          {/* Process Exit */}
          <Button
            variant="outline"
            size="sm"
            disabled={bulkLoading}
            className="gap-1.5 text-xs h-8 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
            onClick={() => setBulkConfirm("process_exit")}
          >
            <LogOut className="h-3.5 w-3.5" />
            Process Exit
          </Button>

          {/* Delete */}
          <Button
            variant="outline"
            size="sm"
            disabled={bulkLoading}
            className="gap-1.5 text-xs h-8 border-red-200 text-red-600 hover:bg-red-50"
            onClick={() => setBulkConfirm("delete")}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>

          {/* Dismiss */}
          <button
            onClick={clearSelection}
            className="ml-1 p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            title="Clear selection"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Bulk Action Confirm Dialog ────────────────────────────────────── */}
      <Dialog open={bulkConfirm !== null} onOpenChange={(o) => !o && setBulkConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {bulkConfirm === "delete" && <><Trash2 className="h-5 w-5 text-red-500" /> Delete {selectedIds.size} Rider{selectedIds.size !== 1 ? "s" : ""}</>}
              {bulkConfirm === "unassign_vehicle" && <><Unlink className="h-5 w-5 text-slate-500" /> Unassign Vehicle & Driver ID</>}
              {bulkConfirm === "block_swap" && <><Ban className="h-5 w-5 text-orange-500" /> Block Swap Access</>}
              {bulkConfirm === "unblock_swap" && <><RefreshCw className="h-5 w-5 text-emerald-500" /> Unblock Swap Access</>}
              {bulkConfirm === "process_exit" && <><LogOut className="h-5 w-5 text-indigo-500" /> Process Exit</>}
            </DialogTitle>
            <DialogDescription>
              {bulkConfirm === "delete" &&
                `This will permanently delete ${selectedIds.size} rider(s) and all their associated data. This action cannot be undone.`}
              {bulkConfirm === "unassign_vehicle" &&
                `This will clear the vehicle assignment and Upgrid driver ID from ${selectedIds.size} rider(s).`}
              {bulkConfirm === "block_swap" &&
                `This will block battery swap access for ${selectedIds.size} rider(s) via Upgrid. Riders must have a driver ID.`}
              {bulkConfirm === "unblock_swap" &&
                `This will restore battery swap access for ${selectedIds.size} rider(s) via Upgrid.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="ghost" onClick={() => setBulkConfirm(null)} disabled={bulkLoading}>
              Cancel
            </Button>
            <Button
              variant={bulkConfirm === "delete" ? "destructive" : "default"}
              className={bulkConfirm !== "delete" ? "bg-[#0D2D6B] hover:bg-[#0D2D6B]/90" : ""}
              disabled={bulkLoading}
              onClick={() => bulkConfirm && executeBulkAction(bulkConfirm)}
            >
              {bulkLoading ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing…</>
              ) : (
                "Confirm"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Offline Onboard Drawer */}
      <Sheet open={onboardOpen} onOpenChange={setOnboardOpen}>
        <OfflineOnboardDrawer
          adminId={adminId ?? ""}
          rider={onboardRider}
          onSuccess={() => setOnboardOpen(false)}
        />
      </Sheet>

      {/* Add Rider Drawer */}
      <Sheet open={addRiderOpen} onOpenChange={setAddRiderOpen}>
        <AddRiderDrawer
          isSuperAdmin={isSuperAdmin}
          defaultHubId={isSuperAdmin ? null : hub_id}
          onSuccess={() => setAddRiderOpen(false)}
        />
      </Sheet>

      {/* Swap Block/Unblock Confirmation Dialog */}
      <Dialog open={swapDialogOpen} onOpenChange={setSwapDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {swapAction === "block" ? (
                <><AlertTriangle className="h-5 w-5 text-orange-500" /> Block Swap Access</>
              ) : (
                <><RefreshCw className="h-5 w-5 text-emerald-500" /> Unblock Swap Access</>
              )}
            </DialogTitle>
            <DialogDescription>
              {swapAction === "block"
                ? <>Block <strong>{swapTarget?.name}</strong>? They will lose Upgrid swapping capabilities and be marked Suspended.</>
                : <>Unblock <strong>{swapTarget?.name}</strong>? Their Upgrid swapping will be restored and they will be marked Active.</>}
            </DialogDescription>
          </DialogHeader>

          {swapAction === "block" && (
            <div className="py-3">
              <label htmlFor="swapBlockReason" className="text-sm font-medium">Reason for Blocking</label>
              <div className="flex flex-wrap gap-2 mt-1.5 mb-3">
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs bg-slate-50" onClick={() => setSwapReason("Driver payment default")}>
                  Driver payment default
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs bg-slate-50" onClick={() => setSwapReason("Vehicle in hub")}>
                  Vehicle in hub
                </Button>
              </div>
              <Input
                id="swapBlockReason"
                placeholder="e.g. Overdue payment, misconduct..."
                value={swapReason}
                onChange={(e) => setSwapReason(e.target.value)}
                autoFocus
              />
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button variant="ghost" onClick={() => setSwapDialogOpen(false)}>Cancel</Button>
            <Button
              className={`gap-2 text-white ${swapAction === "block" ? "bg-orange-600 hover:bg-orange-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
              disabled={swapMutation.isPending || (swapAction === "block" && !swapReason.trim())}
              onClick={() => swapMutation.mutate()}
            >
              {swapMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (swapAction === "block" ? <Ban className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />)}
              {swapAction === "block" ? "Confirm Block" : "Confirm Unblock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
