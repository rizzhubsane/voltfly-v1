"use client";
import { adminFetch } from "@/lib/adminFetch";


import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, addDays, differenceInCalendarDays, isAfter, isBefore, startOfDay, startOfWeek, startOfMonth } from "date-fns";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import { 
  CreditCard, 
  Download, 
  Filter, 
  Search, 
  AlertCircle, 
  ChevronRight,
  Plus,
  Ban,
  ShieldCheck,
  Loader2
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LogCashPaymentDrawer } from "@/components/payments/LogCashPaymentDrawer";
import { ProcessRefundDrawer } from "@/components/payments/ProcessRefundDrawer";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PaymentItem {
  id: string;
  rider_id: string;
  amount: number;
  plan_type: string | null;
  method: string | null;         // mapped from Supabase "method"
  paid_at: string | null;        // mapped from Supabase "paid_at"
  due_date: string | null;       // mapped from Supabase "due_date"
  notes: string | null;
  created_at: string | null;
  status: string;
  riders: {
    name: string;
    phone_1?: string;
    hub_id?: string | null;
  } | null;
}

interface OverdueRider {
  id: string;
  name: string;
  phone_1: string;
  days_overdue: number;
  amount_owed: number;
  last_payment_date: string | null;
  battery_status: string;
  driver_id: string | null;
}

interface SecurityDeposit {
  id: string;
  rider_id: string;
  amount_paid: number | null;
  status: string;
  created_at: string | null;
  riders: {
    name: string;
  } | null;
}

interface HubItem {
  id: string;
  name: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; class: string }> = {
  paid: { label: "Paid", class: "bg-emerald-100 text-emerald-700" },
  pending: { label: "Pending", class: "bg-amber-100 text-amber-700" },
  overdue: { label: "Overdue", class: "bg-red-100 text-red-700" },
  failed: { label: "Failed", class: "bg-slate-200 text-slate-700" },
};

const METHOD_CONFIG: Record<string, { label: string; class: string }> = {
  upi: { label: "UPI", class: "bg-blue-50 text-blue-700 border-blue-100" },
  cash: { label: "Cash", class: "bg-emerald-50 text-emerald-700 border-emerald-100" },
  mandate: { label: "Mandate", class: "bg-purple-50 text-purple-700 border-purple-100" },
};

const PLAN_LABEL: Record<string, { label: string; amount?: number; cycleDays?: number }> = {
  daily:          { label: "Daily",          amount: 230,  cycleDays: 1  },
  weekly:         { label: "Weekly",         amount: 1610, cycleDays: 7  },
  monthly:        { label: "Monthly",        amount: 6900, cycleDays: 30 },
  onboarding_fee: { label: "Onboarding Fee", amount: 190                  },
  deposit:        { label: "Deposit",        amount: 2000                  },
  service:        { label: "Spare Parts / Service", amount: 0              },
  security_deposit: { label: "Security Deposit",    amount: 0              },
  custom:         { label: "Custom",                amount: 0              },
};

// ─── Fetchers ────────────────────────────────────────────────────────────────

// ─── All fetchers route through /api/admin/payments to use the service role key
//     and bypass RLS (direct supabase.from() in the browser is blocked by RLS).

async function fetchPayments(): Promise<PaymentItem[]> {
  const res = await adminFetch("/api/admin/payments?type=list", { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? `Payments API returned ${res.status}`);
  }
  const json = await res.json();
  return (json.payments ?? []) as PaymentItem[];
}

async function fetchOverdueRiders(): Promise<OverdueRider[]> {
  const res = await adminFetch("/api/admin/payments?type=overdue", { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? `Overdue API returned ${res.status}`);
  }
  const json = await res.json();

  type RiderRaw = {
    id: string;
    name: string;
    phone_1: string;
    days_overdue: number;
    estimated_overdue_amount: number;
    wallet_balance: number | null;
  };
  type BatteryRaw = { current_rider_id: string; status: string; driver_id: string | null };

  const riders: RiderRaw[] = json.riders ?? [];
  const batteries: BatteryRaw[] = json.batteries ?? [];

  const batteryByRiderId = new Map(
    batteries.map((b) => [b.current_rider_id, { status: b.status, driver_id: b.driver_id }])
  );

  const computed: OverdueRider[] = riders.map((r) => {
    return {
      id: r.id,
      name: r.name,
      phone_1: r.phone_1,
      days_overdue: Math.max(1, r.days_overdue),
      amount_owed: r.estimated_overdue_amount,
      last_payment_date: null,
      battery_status: batteryByRiderId.get(r.id)?.status || "unknown",
      driver_id: batteryByRiderId.get(r.id)?.driver_id || null,
    };
  });

  return computed
    .filter((r) => r.amount_owed > 0)
    .sort((a, b) => b.days_overdue - a.days_overdue);
}

async function fetchSecurityDeposits(): Promise<SecurityDeposit[]> {
  const res = await adminFetch("/api/admin/payments?type=deposits", { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? `Deposits API returned ${res.status}`);
  }
  const json = await res.json();
  return (json.deposits ?? []) as SecurityDeposit[];
}

async function fetchHubs(): Promise<HubItem[]> {
  const res = await adminFetch("/api/admin/payments?type=hubs", { cache: "no-store" });
  if (!res.ok) return [];
  const json = await res.json();
  return (json.hubs ?? []) as HubItem[];
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ═════════════════════════════════════════════════════════════════════════════

export default function PaymentsPage() {
  const { adminId, hub_id, role } = useAdmin();
  const queryClient = useQueryClient();

  // ── State ────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [hubFilter, setHubFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [methodFilter, setMethodFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [logCashOpen, setLogCashOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [selectedDeposit, setSelectedDeposit] = useState<SecurityDeposit | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: hubs = [] } = useQuery({
    queryKey: ["hubs"],
    queryFn: fetchHubs,
  });

  const { data: payments = [], isLoading: loadingPayments, error: paymentsError } = useQuery({
    queryKey: ["all-payments"],
    queryFn: fetchPayments,
    staleTime: 0,
    gcTime: 0,
    retry: 2,
    retryDelay: 500,
  });

  const { data: overdueRiders = [], isLoading: loadingOverdue, error: overdueError } = useQuery({
    queryKey: ["overdue-riders"],
    queryFn: fetchOverdueRiders,
    staleTime: 0,
    gcTime: 0,
    retry: 2,
    retryDelay: 500,
  });

  const { data: deposits = [], isLoading: loadingDeposits, error: depositsError } = useQuery({
    queryKey: ["security-deposits"],
    queryFn: fetchSecurityDeposits,
    staleTime: 0,
    gcTime: 0,
    retry: 2,
    retryDelay: 500,
  });


  // ── Mutations ────────────────────────────────────────────────────────────
  const blockBatteryMutation = useMutation({
    mutationFn: async (rider: OverdueRider) => {
      if (!rider.driver_id) throw new Error("No battery linked to this rider");
      const res = await adminFetch("/api/admin/battery/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverId: rider.driver_id,
          riderId: rider.id,
          reason: "Payment Overdue",
          adminId: adminId,
        })
      });
      if (!res.ok) throw new Error("Failed to block battery");
    },
    onSuccess: () => {
      toast.success("Battery block command sent");
      queryClient.invalidateQueries({ queryKey: ["overdue-riders"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── Stats ────────────────────────────────────────────────────────────────
  const paymentStats = useMemo(() => {
    let today = 0;
    let week = 0;
    let month = 0;
    
    const now = new Date();
    const todayStart = startOfDay(now);
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const monthStart = startOfMonth(now);

    payments.forEach(p => {
      if (p.status !== "paid") return;
      const effectiveHub = role === "hub_manager" && hub_id ? hub_id : hubFilter;
      const matchesHub =
        effectiveHub === "all" ||
        (p.riders?.hub_id != null && p.riders.hub_id === effectiveHub);
        
      if (!matchesHub) return;

      const dStr = p.paid_at ?? p.created_at;
      if (!dStr) return;
      
      const d = new Date(dStr);
      if (d >= todayStart) today += p.amount;
      if (d >= weekStart) week += p.amount;
      if (d >= monthStart) month += p.amount;
    });

    return { today, week, month };
  }, [payments, hubFilter, role, hub_id]);

  // ── Filtering ────────────────────────────────────────────────────────────
  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      const riderName = p.riders?.name?.toLowerCase() ?? "";
      const matchesSearch = !search.trim() || riderName.includes(search.toLowerCase().trim());
      const matchesMethod = methodFilter === "all" || p.method === methodFilter;
      const matchesStatus = statusFilter === "all" || p.status === statusFilter;

      // Hub filter: hub_manager locked to their hub; otherwise use dropdown.
      // Riders with hub_id:null must pass when effectiveHub is 'all'.
      const effectiveHub = role === "hub_manager" && hub_id ? hub_id : hubFilter;
      const matchesHub =
        effectiveHub === "all" ||
        (p.riders?.hub_id != null && p.riders.hub_id === effectiveHub);

      // Date: Razorpay payments don't set payment_date — fall back to paid_at then created_at
      const rawDate = p.paid_at ?? p.created_at;
      const d = rawDate ? new Date(rawDate) : null;
      
      let matchesDate = true;
      if (d && dateRange) {
        if (dateRange.from && d < startOfDay(dateRange.from)) matchesDate = false;
        const effectiveTo = dateRange.to || dateRange.from;
        if (effectiveTo && d >= addDays(startOfDay(effectiveTo), 1)) matchesDate = false;
      }

      return matchesSearch && matchesMethod && matchesStatus && matchesHub && matchesDate;
    });
  }, [payments, search, methodFilter, statusFilter, hubFilter, role, hub_id, dateRange]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const exportPayments = () => {
    const headers = ["Rider", "Date", "Plan", "Amount", "Method", "Status"];
    const csvContent = [
      headers.join(","),
      ...filteredPayments.map(p => [
        `"${(p.riders?.name || "Unknown").replaceAll('"', '""')}"`,
        `"${(p.paid_at || p.created_at) ? format(new Date((p.paid_at || p.created_at)!), "yyyy-MM-dd") : ""}"`,
        `"${String(p.plan_type ?? "").replaceAll('"', '""')}"`,
        `"${String(p.amount)}"`,
        `"${String(p.method ?? "").replaceAll('"', '""')}"`,
        `"${String(p.status ?? "").replaceAll('"', '""')}"`
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `payments_export_${format(new Date(), "yyyy-MM-dd")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0D2D6B]">Payments Management</h1>
          <p className="text-muted-foreground mt-1">
            Track rider subscriptions, log cash, and process refunds.
          </p>
        </div>
        <div className="flex gap-2">
          <Sheet open={logCashOpen} onOpenChange={setLogCashOpen}>
            <SheetTrigger asChild>
              <Button className="bg-[#0D2D6B] hover:bg-[#0D2D6B]/90 gap-2">
                <Plus className="h-4 w-4" />
                Log Cash Payment
              </Button>
            </SheetTrigger>
          <LogCashPaymentDrawer 
              adminId={adminId} 
              onSuccess={() => {
                setLogCashOpen(false);
                queryClient.invalidateQueries({ queryKey: ["all-payments"] });
                queryClient.invalidateQueries({ queryKey: ["overdue-riders"] });
              }} 
            />
          </Sheet>
        </div>
      </div>

      <Tabs defaultValue="list" className="w-full">
        <TabsList className="grid w-full grid-cols-3 md:w-[600px] h-12 rounded-xl p-1 bg-slate-100/80">
          <TabsTrigger value="list" className="text-sm md:text-base rounded-lg transition-all data-[state=active]:shadow-sm">Payments List</TabsTrigger>
          <TabsTrigger value="overdue" className="text-sm md:text-base rounded-lg transition-all data-[state=active]:shadow-sm">Overdue</TabsTrigger>
          <TabsTrigger value="deposits" className="text-sm md:text-base rounded-lg transition-all data-[state=active]:shadow-sm">Security Deposits</TabsTrigger>
        </TabsList>

        {/* ── Payments List Tab ────────────────────────────────────────────── */}
        <TabsContent value="list" className="space-y-4 pt-4">
          {/* API error banner */}
          {paymentsError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-center gap-2">
              <span>⚠️ <strong>Failed to load payments:</strong> {(paymentsError as Error).message}</span>
              <button className="ml-auto underline text-red-600" onClick={() => queryClient.invalidateQueries({ queryKey: ["all-payments"] })}>Retry</button>
            </div>
          )}
          {/* Payment Stats */}
          <div className="grid gap-4 sm:grid-cols-3 mb-6">
            <Card className="shadow-sm">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                  <span className="font-serif text-xl font-bold">₹</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500">Today's Collection</p>
                  <p className="text-2xl font-bold text-[#0D2D6B]">₹{paymentStats.today.toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                  <span className="font-serif text-xl font-bold">₹</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500">This Week</p>
                  <p className="text-2xl font-bold text-[#0D2D6B]">₹{paymentStats.week.toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
                  <span className="font-serif text-xl font-bold">₹</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500">This Month</p>
                  <p className="text-2xl font-bold text-[#0D2D6B]">₹{paymentStats.month.toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between">
            <div className="flex flex-1 gap-2 max-w-sm">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search rider..." 
                  className="pl-9 h-9" 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <Select
                value={role === "hub_manager" && hub_id ? hub_id : hubFilter}
                onValueChange={(val) => setHubFilter(val)}
                disabled={role === "hub_manager"}
              >
                <SelectTrigger className="h-9 w-[160px]">
                  <SelectValue placeholder="All hubs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All hubs</SelectItem>
                  {hubs.map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-2">
                    <Filter className="h-4 w-4" />
                    {dateRange?.from
                      ? dateRange?.to
                        ? `${format(dateRange.from, "dd MMM")} - ${format(dateRange.to, "dd MMM")}`
                        : format(dateRange.from, "dd MMM yyyy")
                      : "Date range"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-4" align="end">
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">Filter by Date Range</h4>
                    </div>
                    <div className="grid gap-3">
                      <div className="grid grid-cols-4 items-center gap-2">
                        <label className="text-xs text-muted-foreground uppercase font-bold">From</label>
                        <Input
                          type="date"
                          className="col-span-3 h-8 text-sm"
                          value={dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setDateRange((prev) => ({
                              from: val ? new Date(val + "T00:00:00") : undefined,
                              to: prev?.to,
                            } as DateRange));
                          }}
                        />
                      </div>
                      <div className="grid grid-cols-4 items-center gap-2">
                        <label className="text-xs text-muted-foreground uppercase font-bold">To</label>
                        <Input
                          type="date"
                          className="col-span-3 h-8 text-sm"
                          value={dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setDateRange((prev) => ({
                              from: prev?.from,
                              to: val ? new Date(val + "T00:00:00") : undefined,
                            } as DateRange));
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end mt-4 pt-3 border-t">
                    <Button variant="ghost" size="sm" onClick={() => setDateRange(undefined)}>
                      Clear Filter
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>

              <Select value={methodFilter} onValueChange={setMethodFilter}>
                <SelectTrigger className="h-9 w-[140px]">
                  <SelectValue placeholder="All methods" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All methods</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="mandate">Mandate</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-[140px]">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>

              <Button variant="outline" size="sm" className="h-9 gap-2" onClick={exportPayments}>
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </div>

          <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead>Rider</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingPayments ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin" />
                        Loading payments...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredPayments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      No payments found matches your criteria.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPayments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.riders?.name || "Unknown"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {(() => {
                          const d = p.paid_at ?? p.created_at;
                          return d ? format(new Date(d), "dd MMM yyyy") : "—";
                        })()}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            p.plan_type === 'service' ? "bg-blue-50 text-blue-700 border-blue-200" :
                            p.plan_type === 'security_deposit' ? "bg-indigo-50 text-indigo-700 border-indigo-200" :
                            p.plan_type === 'custom' ? "bg-amber-50 text-amber-700 border-amber-200" :
                            "bg-slate-100 text-slate-700 border-slate-200"
                          }
                        >
                          {(p.plan_type ? (PLAN_LABEL[p.plan_type]?.label ?? p.plan_type.replace('_', ' ')) : "—").toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">₹{p.amount.toLocaleString()}</TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-bold ${
                            p.method
                              ? (METHOD_CONFIG[p.method]?.class ?? "bg-slate-50 text-slate-700 border-slate-200")
                              : "bg-slate-50 text-slate-700 border-slate-200"
                          }`}
                        >
                          {p.method
                            ? (METHOD_CONFIG[p.method]?.label || p.method.toUpperCase())
                            : "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_CONFIG[p.status]?.class || "bg-slate-100 text-slate-700"}`}>
                          {STATUS_CONFIG[p.status]?.label || p.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-slate-300" />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Overdue Riders Tab ───────────────────────────────────────────── */}
        <TabsContent value="overdue" className="space-y-4 pt-4">
          {overdueError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-center gap-2">
              <span>⚠️ <strong>Failed to load overdue riders:</strong> {(overdueError as Error).message}</span>
              <button className="ml-auto underline text-red-600" onClick={() => queryClient.invalidateQueries({ queryKey: ["overdue-riders"] })}>Retry</button>
            </div>
          )}

          <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg border border-red-100 text-red-800">
            <AlertCircle className="h-5 w-5" />
            <p className="text-sm font-medium">
              Riders listed here have significantly delayed payments. Review before blocking battery access.
            </p>
          </div>


          <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead>Rider</TableHead>
                  <TableHead>Days Overdue</TableHead>
                  <TableHead>Amount Owed</TableHead>
                  <TableHead>Last Payment</TableHead>
                  <TableHead>Battery Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingOverdue ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-6 w-6 animate-spin" />
                        Calculating overdue balances...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : overdueRiders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      Peace! No riders are currently overdue.
                    </TableCell>
                  </TableRow>
                ) : (
                  overdueRiders.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{r.name}</span>
                          <span className="text-xs text-muted-foreground">{r.phone_1}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-red-600 font-bold">{r.days_overdue} days</span>
                      </TableCell>
                      <TableCell className="font-medium">₹{r.amount_owed.toLocaleString()}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.last_payment_date ? format(new Date(r.last_payment_date), "dd MMM") : "Never"}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          r.battery_status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                        }`}>
                          {r.battery_status === "active" ? <ShieldCheck className="h-3 w-3" /> : <Ban className="h-3 w-3" />}
                          {r.battery_status.toUpperCase()}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {r.battery_status === "active" && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 gap-1.5"
                            onClick={() => blockBatteryMutation.mutate(r)}
                            disabled={blockBatteryMutation.isPending}
                          >
                            {blockBatteryMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                            Block Battery
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Security Deposits Tab ────────────────────────────────────────── */}
        <TabsContent value="deposits" className="space-y-4 pt-4">
          {depositsError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-center gap-2">
              <span>⚠️ <strong>Failed to load deposits:</strong> {(depositsError as Error).message}</span>
              <button className="ml-auto underline text-red-600" onClick={() => queryClient.invalidateQueries({ queryKey: ["security-deposits"] })}>Retry</button>
            </div>
          )}

          <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead>Rider</TableHead>
                  <TableHead>Deposit Amount</TableHead>
                  <TableHead>Created Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingDeposits ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-6 w-6 animate-spin" />
                        Fetching deposits...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : deposits.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                      No security deposits recorded.
                    </TableCell>
                  </TableRow>
                ) : (
                  deposits.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.riders?.name || "Unknown"}</TableCell>
                      <TableCell className="font-bold">₹{(d.amount_paid ?? 0).toLocaleString()}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {d.created_at ? format(new Date(d.created_at), "dd MMM yyyy") : "—"}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          d.status === "held" ? "bg-blue-100 text-blue-700" : 
                          d.status === "refund_initiated" ? "bg-purple-100 text-purple-700" :
                          d.status === "refunded" ? "bg-emerald-100 text-emerald-700" :
                          "bg-slate-100 text-slate-600"
                        }`}>
                          {d.status.replace("_", " ").toUpperCase()}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {d.status === "held" && (
                          <Sheet open={refundOpen && selectedDeposit?.id === d.id} onOpenChange={(val) => {
                            setRefundOpen(val);
                            if (val) setSelectedDeposit(d);
                            else setSelectedDeposit(null);
                          }}>
                            <SheetTrigger asChild>
                              <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setSelectedDeposit(d)}>
                                <CreditCard className="h-3.5 w-3.5" />
                                Process Refund
                              </Button>
                            </SheetTrigger>
                            {selectedDeposit && (
                              <ProcessRefundDrawer 
                                adminId={adminId}
                                deposit={{
                                  id: selectedDeposit.id,
                                  rider_name: selectedDeposit.riders?.name || "Rider",
                                  amount: selectedDeposit.amount_paid ?? 0
                                }}
                                onSuccess={() => {
                                  setRefundOpen(false);
                                  setSelectedDeposit(null);
                                  queryClient.invalidateQueries({ queryKey: ["security-deposits"] });
                                }}
                              />
                            )}
                          </Sheet>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
