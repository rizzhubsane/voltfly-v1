"use client";
import { adminFetch } from "@/lib/adminFetch";


import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, startOfWeek, subMonths } from "date-fns";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart3,
  TrendingUp,
  Users,
  IndianRupee,
  CreditCard,
  CheckCircle2,
  Clock,
  Loader2,
  Wrench,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Types ─────────────────────────────────────────────────────────────────

interface PaymentRow {
  id: string;
  amount: number;
  plan_type: string | null;
  method: string | null;
  paid_at: string | null;
  created_at: string | null;
  status: string;
  rider_id: string;
}

interface RiderRow {
  id: string;
  status: string;
  hub_id: string | null;
  created_at: string | null;
  payment_status: string | null;
  wallet_balance: number | null;
  gig_company: string | null;
  hubs: { name: string } | null;
}



interface ServiceRequestRow {
  id: string;
  status: string;
  payment_status: string | null;
  total_parts_cost: number | null;
  charges: number | null;
  created_at: string | null;
  resolved_at: string | null;
}

interface DepositRow {
  id: string;
  rider_id: string;
  amount_paid: number | null;
  status: string | null;
  created_at: string | null;
}

interface ReportsData {
  payments: PaymentRow[];
  riders: RiderRow[];
  service_requests: ServiceRequestRow[];
  security_deposits: DepositRow[];
}

// ─── Fetcher ──────────────────────────────────────────────────────────────

async function fetchReportsData(): Promise<ReportsData> {
  const res = await adminFetch("/api/admin/reports", { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? `Reports API returned ${res.status}`);
  }
  return res.json();
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

function MetricCard({
  title,
  value,
  sub,
  icon: Icon,
  trend,
  colorClass = "text-primary bg-primary/10",
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  trend?: string;
  colorClass?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tracking-tight text-[#0D2D6B] mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
            {trend && <p className="text-xs text-emerald-600 font-medium mt-1">{trend}</p>}
          </div>
          <div className={`p-3 rounded-xl ${colorClass}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProgressBar({
  value,
  max,
  color = "bg-primary",
}: {
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-medium text-muted-foreground w-8 text-right">{pct}%</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function ReportsPage() {
  const now = useMemo(() => new Date(), []);
  const monthStart    = useMemo(() => startOfMonth(now), [now]);
  const weekStart     = useMemo(() => startOfWeek(now, { weekStartsOn: 1 }), [now]);
  const lastMonthStart = useMemo(() => startOfMonth(subMonths(now, 1)), [now]);
  const lastMonthEnd   = useMemo(() => startOfMonth(now), [now]);

  const { data, isLoading, error, refetch } = useQuery<ReportsData>({
    queryKey: ["reports-data"],
    queryFn: fetchReportsData,
    staleTime: 60_000,   // 1 min cache
    gcTime: 120_000,
    retry: 2,
  });

  const payments         = useMemo(() => data?.payments         ?? [], [data?.payments]);
  const riders           = useMemo(() => data?.riders           ?? [], [data?.riders]);
  const serviceRequests  = useMemo(() => data?.service_requests ?? [], [data?.service_requests]);
  const securityDeposits = useMemo(() => data?.security_deposits ?? [], [data?.security_deposits]);

  // ── Revenue from payments table (rental payments) ─────────────────────
  const revenue = useMemo(() => {
    const list = payments ?? [];
    // Count only paid/completed rental payments
    const paid = list.filter(
      (p) => p.status === "paid" || p.status === "completed"
    );

    const sum = (arr: PaymentRow[]) =>
      arr.reduce((s, p) => s + (p.amount ?? 0), 0);

    const thisMonth = sum(
      paid.filter((p) => {
        const d = new Date(p.paid_at ?? p.created_at ?? "");
        return d >= monthStart;
      })
    );
    const thisWeek = sum(
      paid.filter((p) => {
        const d = new Date(p.paid_at ?? p.created_at ?? "");
        return d >= weekStart;
      })
    );
    const lastMonth = sum(
      paid.filter((p) => {
        const d = new Date(p.paid_at ?? p.created_at ?? "");
        return d >= lastMonthStart && d < lastMonthEnd;
      })
    );
    const total = sum(paid);
    const txTotal = paid.length;

    // Revenue by plan
    const byPlan: Record<string, number> = {};
    paid.forEach((p) => {
      const plan = p.plan_type ?? "other";
      byPlan[plan] = (byPlan[plan] ?? 0) + (p.amount ?? 0);
    });

    // Payment method breakdown (count)
    const byMethod: Record<string, number> = {};
    paid.forEach((p) => {
      const m = p.method ?? "unknown";
      byMethod[m] = (byMethod[m] ?? 0) + 1;
    });

    return { thisMonth, thisWeek, lastMonth, total, txTotal, byPlan, byMethod };
  }, [payments, monthStart, weekStart, lastMonthStart, lastMonthEnd]);

  // ── Service revenue (spare parts paid via rider app) ──────────────────
  const serviceRevenue = useMemo(() => {
    const list = serviceRequests ?? [];
    const paidSR = list.filter(
      (sr) => sr.payment_status === "paid"
    );
    const total = paidSR.reduce(
      (s, sr) => s + (sr.total_parts_cost ?? sr.charges ?? 0),
      0
    );
    const thisMonth = paidSR
      .filter((sr) => sr.resolved_at && new Date(sr.resolved_at) >= monthStart)
      .reduce((s, sr) => s + (sr.total_parts_cost ?? sr.charges ?? 0), 0);
    return { total, thisMonth, count: paidSR.length };
  }, [serviceRequests, monthStart]);

  // ── Security deposit metrics ───────────────────────────────────────────
  const depositStats = useMemo(() => {
    const list = securityDeposits ?? [];
    const total = list.reduce(
      (s, d) => s + (d.amount_paid ?? 0),
      0
    );
    const held     = list.filter((d) => d.status === "held").length;
    const refunded = list.filter((d) => d.status === "refunded").length;
    return { total, held, refunded, count: list.length };
  }, [securityDeposits]);

  // ── Rider stats ───────────────────────────────────────────────────────
  const riderStats = useMemo(() => {
    const list = riders ?? [];
    const total = list.length;
    const byStatus: Record<string, number> = {};
    list.forEach((r) => {
      const s = r.status ?? "unknown";
      byStatus[s] = (byStatus[s] ?? 0) + 1;
    });

    // Gig company distribution
    const gigCounts: Record<string, number> = {};
    list.forEach((r) => {
      const gig = r.gig_company ?? "Direct / Private";
      gigCounts[gig] = (gigCounts[gig] ?? 0) + 1;
    });
    const topGigs = Object.entries(gigCounts)
      .sort(([, a], [, b]) => b - a);

    // Hub distribution
    const hubCounts: Record<string, number> = {};
    list.forEach((r) => {
      const hubName = r.hubs?.name ?? "Unknown";
      hubCounts[hubName] = (hubCounts[hubName] ?? 0) + 1;
    });
    const topHubs = Object.entries(hubCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    // New riders this month
    const newThisMonth = list.filter(
      (r) => r.created_at && new Date(r.created_at) >= monthStart
    ).length;

    // Overdue (wallet_balance <= 0)
    const today = now;
    const overdue = list.filter(
      (r) =>
        r.wallet_balance !== null && r.wallet_balance <= 0
    ).length;

    return { total, byStatus, topHubs, topGigs, newThisMonth, overdue };
  }, [riders, monthStart, now]);



  // ── MoM growth ────────────────────────────────────────────────────────
  const momGrowth =
    revenue.lastMonth > 0
      ? `${revenue.thisMonth >= revenue.lastMonth ? "+" : ""}${Math.round(
          ((revenue.thisMonth - revenue.lastMonth) / revenue.lastMonth) * 100
        )}% vs last month`
      : revenue.thisMonth > 0
      ? "First month with data"
      : undefined;

  // ── Status / method colors ────────────────────────────────────────────
  const STATUS_COLORS: Record<string, string> = {
    active:        "bg-emerald-500",
    pending_kyc:   "bg-slate-400",
    kyc_submitted: "bg-amber-500",
    kyc_approved:  "bg-blue-500",
    suspended:     "bg-orange-500",
    exited:        "bg-red-500",
  };

  const METHOD_COLORS: Record<string, string> = {
    razorpay: "bg-primary",
    upi:      "bg-blue-500",
    cash:     "bg-emerald-500",
    mandate:  "bg-purple-500",
    unknown:  "bg-slate-400",
  };

  const totalPaymentTxns = Object.values(revenue.byMethod).reduce(
    (s, v) => s + v,
    0
  );

  // ── Combined total revenue (rental + service) ─────────────────────────
  const grandTotal = revenue.total + serviceRevenue.total;

  // ─── Loading / error states ───────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading reports...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
        <AlertTriangle className="h-10 w-10 text-red-500" />
        <div>
          <p className="font-semibold text-red-700">Failed to load reports</p>
          <p className="text-sm text-muted-foreground mt-1">
            {(error as Error).message}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Retry
        </Button>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0D2D6B]">Reports</h1>
          <p className="text-muted-foreground mt-1">
            Revenue analytics, rider metrics, and operational insights.
            <span className="text-xs ml-2">
              Last updated: {format(now, "dd MMM yyyy, HH:mm")}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-8"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-white border rounded-lg px-3 py-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Live Data
          </div>
        </div>
      </div>

      {/* ── Revenue ─────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
          <IndianRupee className="h-4 w-4" /> Revenue
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="This Month"
            value={fmt(revenue.thisMonth + serviceRevenue.thisMonth)}
            sub={format(monthStart, "MMMM yyyy")}
            trend={momGrowth}
            icon={TrendingUp}
            colorClass="text-emerald-600 bg-emerald-50"
          />
          <MetricCard
            title="This Week"
            value={fmt(revenue.thisWeek)}
            sub={`Since ${format(weekStart, "dd MMM")}`}
            icon={BarChart3}
            colorClass="text-blue-600 bg-blue-50"
          />
          <MetricCard
            title="Last Month"
            value={fmt(revenue.lastMonth)}
            sub={format(lastMonthStart, "MMMM yyyy")}
            icon={IndianRupee}
            colorClass="text-primary bg-primary/10"
          />
          <MetricCard
            title="All-Time Total"
            value={fmt(grandTotal)}
            sub={`${revenue.txTotal} rental txns + ${serviceRevenue.count} service txns`}
            icon={CreditCard}
            colorClass="text-purple-600 bg-purple-50"
          />
        </div>
      </section>

      {/* ── Additional Revenue Breakdown ──────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
          <Wrench className="h-4 w-4" /> Operational Revenue
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Rental Revenue"
            value={fmt(revenue.total)}
            sub={`${revenue.txTotal} transactions`}
            icon={IndianRupee}
            colorClass="text-blue-600 bg-blue-50"
          />
          <MetricCard
            title="Service Revenue"
            value={fmt(serviceRevenue.total)}
            sub={`${serviceRevenue.count} paid service requests`}
            icon={Wrench}
            colorClass="text-amber-600 bg-amber-50"
          />
          <MetricCard
            title="Security Deposits Held"
            value={fmt(depositStats.total)}
            sub={`${depositStats.held} active · ${depositStats.refunded} refunded`}
            icon={ShieldCheck}
            colorClass="text-emerald-600 bg-emerald-50"
          />
          <MetricCard
            title="Overdue Riders"
            value={riderStats.overdue.toString()}
            sub="Wallet Balance Depleted"
            icon={AlertTriangle}
            colorClass={riderStats.overdue > 0 ? "text-red-600 bg-red-50" : "text-slate-500 bg-slate-50"}
          />
        </div>
      </section>

      {/* ── Riders ────────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
          <Users className="h-4 w-4" /> Riders
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Total Riders"
            value={riderStats.total.toString()}
            icon={Users}
          />
          <MetricCard
            title="Active Riders"
            value={(riderStats.byStatus["active"] ?? 0).toString()}
            sub={`${
              riderStats.total > 0
                ? Math.round(
                    ((riderStats.byStatus["active"] ?? 0) / riderStats.total) * 100
                  )
                : 0
            }% of total`}
            icon={CheckCircle2}
            colorClass="text-emerald-600 bg-emerald-50"
          />
          <MetricCard
            title="New This Month"
            value={riderStats.newThisMonth.toString()}
            sub={format(monthStart, "MMMM yyyy")}
            icon={TrendingUp}
            colorClass="text-blue-600 bg-blue-50"
          />

        </div>
      </section>

      {/* ── Breakdown Charts ──────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">

        {/* Rider Status Distribution */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-[#0D2D6B]">
              Rider Status Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(riderStats.byStatus).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No data</p>
            ) : (
              Object.entries(riderStats.byStatus)
                .sort(([, a], [, b]) => b - a)
                .map(([status, count]) => (
                  <div key={status} className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-sm capitalize font-medium">
                        {status.replace(/_/g, " ")}
                      </span>
                      <span className="text-sm font-bold">{count}</span>
                    </div>
                    <ProgressBar
                      value={count}
                      max={riderStats.total}
                      color={STATUS_COLORS[status] ?? "bg-slate-400"}
                    />
                  </div>
                ))
            )}
          </CardContent>
        </Card>

        {/* Revenue by Plan */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-[#0D2D6B]">
              Revenue by Plan
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(revenue.byPlan).length === 0 && serviceRevenue.total === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No payment data</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Plan / Type</TableHead>
                    <TableHead className="text-xs text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(revenue.byPlan)
                    .sort(([, a], [, b]) => b - a)
                    .map(([plan, amount]) => (
                      <TableRow key={plan}>
                        <TableCell className="text-sm font-medium capitalize py-2">
                          {plan.replace(/_/g, " ")}
                        </TableCell>
                        <TableCell className="text-sm font-bold text-right py-2 text-emerald-700">
                          {fmt(amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  {serviceRevenue.total > 0 && (
                    <TableRow>
                      <TableCell className="text-sm font-medium capitalize py-2">
                        Spare Parts / Service
                      </TableCell>
                      <TableCell className="text-sm font-bold text-right py-2 text-amber-700">
                        {fmt(serviceRevenue.total)}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Payment Methods */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-[#0D2D6B]">
              Payment Methods
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.keys(revenue.byMethod).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No payment data</p>
            ) : (
              Object.entries(revenue.byMethod)
                .sort(([, a], [, b]) => b - a)
                .map(([method, count]) => (
                  <div key={method} className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-sm capitalize font-medium">{method}</span>
                      <span className="text-sm font-bold">{count} txns</span>
                    </div>
                    <ProgressBar
                      value={count}
                      max={totalPaymentTxns}
                      color={METHOD_COLORS[method] ?? "bg-slate-400"}
                    />
                  </div>
                ))
            )}
          </CardContent>
        </Card>
      </div>



      {/* ── Service Requests Summary ─────────────────────────────────────── */}
      {serviceRequests.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
            <Wrench className="h-4 w-4" /> Service Requests
          </h2>
          <div className="grid gap-4 sm:grid-cols-4">
            <MetricCard
              title="Total Requests"
              value={serviceRequests.length.toString()}
              icon={Wrench}
            />
            <MetricCard
              title="Open"
              value={serviceRequests.filter((sr) => sr.status === "open").length.toString()}
              icon={Clock}
              colorClass="text-amber-600 bg-amber-50"
            />
            <MetricCard
              title="Closed"
              value={serviceRequests.filter((sr) => sr.status === "closed").length.toString()}
              icon={CheckCircle2}
              colorClass="text-emerald-600 bg-emerald-50"
            />
            <MetricCard
              title="Parts Revenue"
              value={fmt(serviceRevenue.total)}
              sub={`${serviceRevenue.count} paid requests`}
              icon={IndianRupee}
              colorClass="text-blue-600 bg-blue-50"
            />
          </div>
        </section>
      )}

      {/* ── Hub Distribution ─────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {riderStats.topHubs.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
              <Users className="h-4 w-4" /> Hub Breakdown
            </h2>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-slate-50/50">
                    <TableRow>
                      <TableHead>Hub</TableHead>
                      <TableHead className="text-right">Riders</TableHead>
                      <TableHead className="text-right">Share</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {riderStats.topHubs.map(([hub, count], i) => (
                      <TableRow key={hub} className="hover:bg-slate-50/50">
                        <TableCell className="font-medium">{hub}</TableCell>
                        <TableCell className="text-right font-bold">{count}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-24">
                              <ProgressBar
                                value={count}
                                max={riderStats.total}
                                color="bg-primary"
                              />
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>
        )}

        {/* ── Gig Company Analysis ─────────────────────────────────────────── */}
        {riderStats.topGigs.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Gig Company Analysis
            </h2>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-slate-50/50">
                    <TableRow>
                      <TableHead>Company</TableHead>
                      <TableHead className="text-right">Riders</TableHead>
                      <TableHead className="text-right">Share</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {riderStats.topGigs.map(([gig, count]) => (
                      <TableRow key={gig} className="hover:bg-slate-50/50">
                        <TableCell className="font-medium">{gig}</TableCell>
                        <TableCell className="text-right font-bold">{count}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-24">
                              <ProgressBar
                                value={count}
                                max={riderStats.total}
                                color="bg-indigo-500"
                              />
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>
        )}
      </div>
    </div>
  );
}
