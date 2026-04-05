"use client";
import { adminFetch } from "@/lib/adminFetch";


import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
import { toast } from "sonner";

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
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Wrench,
  Search,
  Loader2,
  CheckCircle2,
  Clock,
  Zap,
  AlertCircle,
  Plus,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────

interface ServiceRequest {
  id: string;
  rider_id: string;
  vehicle_id: string | null;
  description: string | null;
  issue_description: string | null; // rider app uses this name
  type: string | null;
  status: string | null;
  photo_url: string | null;
  resolution_notes: string | null;
  charges: number | null;
  parts_selected: { name: string; price: number }[] | null;       // Newly added parts array JSON
  total_parts_cost: number | null;  // Newly added total cost
  payment_status: string | null;    // Newly added payment status ('paid' or 'n/a' or 'pending')
  created_at: string | null;
  resolved_at: string | null;
  riders: { name: string; phone_1: string } | null;
}

// ─── Fetcher ──────────────────────────────────────────────────────────────

async function fetchServiceRequests(): Promise<ServiceRequest[]> {
  const res = await adminFetch("/api/admin/service-requests", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch service requests");
  const data = await res.json();
  return data.requests as ServiceRequest[];
}

// ─── Status config ─────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  open: { label: "Open", bg: "bg-amber-100", text: "text-amber-800", dot: "bg-amber-500" },
  in_progress: { label: "In Progress", bg: "bg-blue-100", text: "text-blue-700", dot: "bg-blue-500" },
  resolved: { label: "Resolved", bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
  closed: { label: "Closed", bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400" },
};

function StatusBadge({ status }: { status: string | null }) {
  const cfg = STATUS_CONFIG[status ?? "open"] ?? { label: status ?? "Open", bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function SummaryCard({ title, value, icon: Icon, colorClass = "text-primary bg-primary/10" }: {
  title: string; value: number | string; icon: React.ElementType; colorClass?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-center gap-4">
          <div className={`p-2.5 rounded-xl ${colorClass}`}><Icon className="h-5 w-5" /></div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            <p className="text-xl font-bold tracking-tight text-[#0D2D6B]">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function ServiceRequestsPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<ServiceRequest | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [charges, setCharges] = useState("");
  const [newStatus, setNewStatus] = useState("resolved");

  // ── Query ───────────────────────────────────────────────────────────────
  const { data: requests = [], isLoading, error } = useQuery({
    queryKey: ["service-requests"],
    queryFn: fetchServiceRequests,
  });

  // ── Realtime ────────────────────────────────────────────────────────────
  useEffect(() => {
    const ch = supabase
      .channel("service-requests-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "service_requests" }, () =>
        queryClient.invalidateQueries({ queryKey: ["service-requests"] })
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queryClient]);

  // ── Stats ───────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: requests.length,
    open: requests.filter(r => r.status === "open").length,
    inProgress: requests.filter(r => r.status === "in_progress").length,
    resolved: requests.filter(r => r.status === "resolved").length,
  }), [requests]);

  // ── Filter ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = requests;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.riders?.name.toLowerCase().includes(q) ||
        (r.description ?? r.issue_description ?? "").toLowerCase().includes(q) ||
        (r.type ?? "").toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "all") {
      list = list.filter(r => r.status === statusFilter);
    }
    return list;
  }, [requests, search, statusFilter]);

  // ── Update Mutation ─────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("No request selected");
      const updates: Record<string, unknown> = { status: newStatus };
      if (resolutionNotes.trim()) updates.resolution_notes = resolutionNotes.trim();
      if (charges) updates.charges = parseFloat(charges);
      if (newStatus === "resolved" || newStatus === "closed") updates.resolved_at = new Date().toISOString();

      const res = await adminFetch("/api/admin/service-requests", {
         method: "PATCH",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ id: selected.id, updates })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update service request");
    },
    onSuccess: () => {
      toast.success("Service request updated");
      queryClient.invalidateQueries({ queryKey: ["service-requests"] });
      setDrawerOpen(false);
      setSelected(null);
      setResolutionNotes("");
      setCharges("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openRequest = (r: ServiceRequest) => {
    setSelected(r);
    setResolutionNotes(r.resolution_notes ?? "");
    setCharges(r.charges?.toString() ?? "");
    setNewStatus(r.status === "open" ? "in_progress" : r.status === "in_progress" ? "resolved" : "resolved");
    setDrawerOpen(true);
  };

  const descriptionOf = (r: ServiceRequest | null) => {
    if (!r) return "—";
    return r.description ?? r.issue_description ?? "—";
  };

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0D2D6B]">Service Requests</h1>
        <p className="text-muted-foreground mt-1">Manage vehicle service and maintenance requests from riders.</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Total" value={stats.total} icon={Wrench} />
        <SummaryCard title="Open" value={stats.open} icon={AlertCircle} colorClass="text-amber-600 bg-amber-50" />
        <SummaryCard title="In Progress" value={stats.inProgress} icon={Zap} colorClass="text-blue-600 bg-blue-50" />
        <SummaryCard title="Resolved" value={stats.resolved} icon={CheckCircle2} colorClass="text-emerald-600 bg-emerald-50" />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search rider or description..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="h-10 rounded-md border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All Statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead>Rider</TableHead>
              <TableHead>Issue</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Resolved</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-40 text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" />
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-destructive text-sm">
                  <AlertCircle className="h-5 w-5 mx-auto mb-1" />
                  Failed to load: {(error as Error).message}
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-40 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Wrench className="h-8 w-8 opacity-20" />
                    <p className="font-medium">No service requests found</p>
                    {statusFilter !== "all" && <p className="text-sm">Try clearing filters</p>}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id} className="hover:bg-slate-50/50 transition-colors">
                  <TableCell>
                    <div>
                      <p className="font-medium text-[#0D2D6B]">{r.riders?.name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{r.riders?.phone_1 ?? "—"}</p>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[260px]">
                    <div className="flex flex-col gap-1">
                       <p className="text-sm truncate" title={descriptionOf(r)}>{descriptionOf(r)}</p>
                       {r.parts_selected && Array.isArray(r.parts_selected) && r.parts_selected.length > 0 && (
                          <div className="flex items-center gap-1">
                             <span className="inline-flex px-1.5 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-[10px] font-bold text-emerald-700">PAID PART</span>
                             <span className="text-[10px] text-muted-foreground">{r.parts_selected.length} item(s)</span>
                          </div>
                       )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {r.type ? (
                      <span className="inline-flex px-2 py-0.5 rounded-md border bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                        {r.type}
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {r.created_at ? format(new Date(r.created_at), "dd MMM yyyy") : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {r.resolved_at ? format(new Date(r.resolved_at), "dd MMM yyyy") : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5"
                      onClick={() => openRequest(r)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Update
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Update Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle className="flex items-center gap-2 text-xl font-bold">
              <Wrench className="h-5 w-5 text-primary" />
              Update Request
            </SheetTitle>
            <SheetDescription>
              {selected?.riders?.name ?? "Rider"} — {descriptionOf(selected!)}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6">
            {/* Current status */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border">
              <p className="text-sm text-muted-foreground">Current Status:</p>
              <StatusBadge status={selected?.status ?? null} />
            </div>

            {/* Check if Parts Purchased */}
            {selected?.parts_selected && Array.isArray(selected.parts_selected) && selected.parts_selected.length > 0 && (
              <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
                <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
                  <h3 className="font-semibold text-emerald-800 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Pre-paid Spares Attached
                  </h3>
                  <span className="inline-flex px-2 py-0.5 rounded bg-emerald-100 text-xs font-bold text-emerald-700">PAID</span>
                </div>
                <div className="space-y-2">
                  {(selected.parts_selected as { name: string; price: number }[]).map((part, i) => (
                    <div key={i} className="flex justify-between items-center text-sm text-emerald-900">
                      <span className="font-medium">• {part.name}</span>
                      <span>₹{part.price}</span>
                    </div>
                  ))}
                </div>
                <div className="pt-2 mt-2 border-t border-emerald-100 flex items-center justify-between font-bold text-emerald-900">
                  <span>Total Paid (Razorpay)</span>
                  <span>₹{selected.total_parts_cost}</span>
                </div>
              </div>
            )}

            {/* Photo preview */}
            {selected?.photo_url && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Attached Photo</label>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selected.photo_url} alt="Service issue" className="rounded-lg border object-cover max-h-48 w-full" />
              </div>
            )}

            {/* New Status */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Update Status *</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
              >
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            {/* Resolution Notes */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Resolution Notes</label>
              <Textarea
                placeholder="Describe what was done to resolve the issue..."
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                rows={3}
              />
            </div>

            {/* Charges */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Charges (₹)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                <Input
                  type="number"
                  placeholder="0"
                  className="pl-7"
                  value={charges}
                  onChange={(e) => setCharges(e.target.value)}
                  min="0"
                />
              </div>
              <p className="text-xs text-muted-foreground">Leave 0 if no charge to rider</p>
            </div>

            {/* Submit */}
            <div className="flex flex-col gap-3 pt-4 border-t">
              <Button
                className="w-full"
                disabled={updateMutation.isPending}
                onClick={() => updateMutation.mutate()}
              >
                {updateMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>
                ) : (
                  <>
                    {newStatus === "resolved" ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Clock className="mr-2 h-4 w-4" />}
                    Update Request
                  </>
                )}
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setDrawerOpen(false)}>Cancel</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
