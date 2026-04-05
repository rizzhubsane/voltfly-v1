"use client";
import { adminFetch } from "@/lib/adminFetch";


import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAdmin } from "@/context/AdminContext";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Shield,
  Search,
  Loader2,
  RefreshCw,
  IndianRupee,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────

interface DepositRow {
  id: string;
  rider_id: string;
  amount_paid: number | null;
  status: string | null;
  razorpay_payment_id: string | null;
  deductions: number | null;
  refund_amount: number | null;
  created_at: string | null;
  refunded_at: string | null;
  riders: { name: string; phone_1: string } | null;
}

// ─── Fetcher ──────────────────────────────────────────────────────────────

async function fetchDeposits(): Promise<DepositRow[]> {
  const res = await adminFetch("/api/admin/deposits", { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? `Deposits API returned ${res.status}`);
  }
  const json = await res.json();
  return (json.deposits ?? []) as DepositRow[];
}

// ─── Status config ─────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: React.ElementType }> = {
  held: { label: "Held", bg: "bg-blue-100", text: "text-blue-700", icon: Clock },
  refund_initiated: { label: "Refund Initiated", bg: "bg-amber-100", text: "text-amber-800", icon: RefreshCw },
  refunded: { label: "Refunded", bg: "bg-emerald-100", text: "text-emerald-700", icon: CheckCircle2 },
  completed: { label: "Held", bg: "bg-blue-100", text: "text-blue-700", icon: Clock },
  paid: { label: "Held", bg: "bg-blue-100", text: "text-blue-700", icon: Clock },
};

function StatusBadge({ status }: { status: string | null }) {
  const cfg = STATUS_CONFIG[status ?? ""] ?? { label: status ?? "Unknown", bg: "bg-slate-100", text: "text-slate-600", icon: Clock };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

// ─── Summary Card ─────────────────────────────────────────────────────────

function SummaryCard({ title, value, sub, icon: Icon, colorClass = "text-primary bg-primary/10" }: {
  title: string; value: string; sub?: string; icon: React.ElementType; colorClass?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-center gap-4">
          <div className={`p-2.5 rounded-xl ${colorClass}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            <p className="text-xl font-bold tracking-tight text-[#0D2D6B]">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function DepositsPage() {
  const { adminId } = useAdmin();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [refundOpen, setRefundOpen] = useState(false);
  const [selected, setSelected] = useState<DepositRow | null>(null);
  const [deductionAmount, setDeductionAmount] = useState("");
  const [deductionReason, setDeductionReason] = useState("");

  // ── Query ───────────────────────────────────────────────────────────────
  const { data: deposits = [], isLoading, error: depositsError } = useQuery({
    queryKey: ["deposits"],
    queryFn: fetchDeposits,
    staleTime: 0,        // Always fetch fresh — never serve stale deposits
    gcTime: 0,           // Don't cache error states between page visits
    retry: 2,            // Retry twice before showing empty
    retryDelay: 500,
  });

  // ── Realtime ────────────────────────────────────────────────────────────
  useEffect(() => {
    const ch = supabase
      .channel("deposits-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "security_deposits" }, () =>
        queryClient.invalidateQueries({ queryKey: ["deposits"] })
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () =>
        queryClient.invalidateQueries({ queryKey: ["deposits"] })
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queryClient]);

  // ── Stats ───────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = deposits.reduce((s, d) => s + (d.amount_paid ?? 0), 0);
    const held = deposits.filter(d => !["refunded", "refund_initiated"].includes(d.status ?? "")).length;
    const refunded = deposits.filter(d => d.status === "refunded").length;
    const pending = deposits.filter(d => d.status === "refund_initiated").length;
    return { total, held, refunded, pending };
  }, [deposits]);

  // ── Filter ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = deposits;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d =>
        d.riders?.name.toLowerCase().includes(q) ||
        d.riders?.phone_1.includes(q) ||
        d.razorpay_payment_id?.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "all") {
      list = list.filter(d => {
        if (statusFilter === "held") return !["refunded", "refund_initiated"].includes(d.status ?? "");
        return d.status === statusFilter;
      });
    }
    return list;
  }, [deposits, search, statusFilter]);

  // ── Refund Mutation ─────────────────────────────────────────────────────
  const refundMutation = useMutation({
    mutationFn: async () => {
      if (!selected || !adminId) throw new Error("Missing data");
      const deductions = parseFloat(deductionAmount) || 0;
      const refundAmount = Math.max(0, (selected.amount_paid ?? 0) - deductions);

      const res = await adminFetch("/api/admin/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          depositId: selected.id,
          refundAmount,
          deductions,
          deductionReason: deductionReason || null,
          adminId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Refund failed");
      return json;
    },
    onSuccess: () => {
      toast.success("Refund initiated successfully");
      queryClient.invalidateQueries({ queryKey: ["deposits"] });
      setRefundOpen(false);
      setSelected(null);
      setDeductionAmount("");
      setDeductionReason("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openRefund = (d: DepositRow) => {
    setSelected(d);
    setDeductionAmount("");
    setDeductionReason("");
    setRefundOpen(true);
  };

  const computedRefund = Math.max(0, (selected?.amount_paid ?? 0) - (parseFloat(deductionAmount) || 0));

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0D2D6B]">Security Deposits</h1>
        <p className="text-muted-foreground mt-1">Track and process rider security deposit refunds.</p>
      </div>

      {/* API Error Banner */}
      {depositsError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2">
          <XCircle className="h-4 w-4 shrink-0" />
          <span><strong>Failed to load deposits:</strong> {(depositsError as Error).message}</span>
          <Button size="sm" variant="ghost" className="ml-auto text-red-600" onClick={() => queryClient.invalidateQueries({ queryKey: ["deposits"] })}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Retry
          </Button>
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Total Collected" value={`₹${stats.total.toLocaleString()}`} icon={IndianRupee} colorClass="text-primary bg-primary/10" />
        <SummaryCard title="Currently Held" value={stats.held.toString()} sub="Active riders" icon={Shield} colorClass="text-blue-600 bg-blue-50" />
        <SummaryCard title="Refund Pending" value={stats.pending.toString()} icon={RefreshCw} colorClass="text-amber-600 bg-amber-50" />
        <SummaryCard title="Refunded" value={stats.refunded.toString()} icon={CheckCircle2} colorClass="text-emerald-600 bg-emerald-50" />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search rider name or phone..."
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
          <option value="held">Held</option>
          <option value="refund_initiated">Refund Pending</option>
          <option value="refunded">Refunded</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead>Rider</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Payment Method</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-40 text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-40 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Shield className="h-8 w-8 opacity-20" />
                    <p>No deposits found</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((d) => (
                <TableRow key={d.id} className="hover:bg-slate-50/50 transition-colors">
                  <TableCell>
                    <div>
                      <p className="font-medium text-[#0D2D6B]">{d.riders?.name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{d.riders?.phone_1 ?? "—"}</p>
                    </div>
                  </TableCell>
                  <TableCell className="font-semibold text-sm">₹{(d.amount_paid ?? 0).toLocaleString()}</TableCell>
                  <TableCell><StatusBadge status={d.status} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground capitalize">
                    {d.razorpay_payment_id ? "Razorpay" : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {d.created_at ? format(new Date(d.created_at), "dd MMM yyyy") : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {!["refunded", "refund_initiated"].includes(d.status ?? "") && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 border-emerald-200 text-emerald-700 hover:bg-emerald-50 gap-1.5"
                        onClick={() => openRefund(d)}
                      >
                        <IndianRupee className="h-3.5 w-3.5" />
                        Process Refund
                      </Button>
                    )}
                    {d.status === "refund_initiated" && (
                      <span className="text-xs text-muted-foreground italic">Refund pending</span>
                    )}
                    {d.status === "refunded" && (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Completed
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Refund Dialog */}
      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IndianRupee className="h-5 w-5 text-emerald-600" />
              Process Refund
            </DialogTitle>
            <DialogDescription>
              Processing refund for <strong>{selected?.riders?.name ?? "this rider"}</strong>.
              Deposit amount: <strong>₹{(selected?.amount_paid ?? 0).toLocaleString()}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Deductions (₹)</label>
              <Input
                type="number"
                placeholder="0"
                value={deductionAmount}
                onChange={(e) => setDeductionAmount(e.target.value)}
                min="0"
                max={selected?.amount_paid ?? 0}
              />
              <p className="text-xs text-muted-foreground">
                e.g. vehicle damage, unpaid dues. Leave 0 for full refund.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Deduction Reason</label>
              <Textarea
                placeholder="Reason for deduction (if any)..."
                value={deductionReason}
                onChange={(e) => setDeductionReason(e.target.value)}
                rows={2}
              />
            </div>

            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs text-muted-foreground">Refund Amount</p>
                  <p className="text-2xl font-bold text-emerald-700">₹{computedRefund.toLocaleString()}</p>
                </div>
                {parseFloat(deductionAmount) > 0 && (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Deductions</p>
                    <p className="text-sm font-semibold text-red-600">-₹{parseFloat(deductionAmount).toLocaleString()}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button variant="ghost" onClick={() => setRefundOpen(false)}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              disabled={refundMutation.isPending}
              onClick={() => refundMutation.mutate()}
            >
              {refundMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <IndianRupee className="h-4 w-4" />}
              Initiate Refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
