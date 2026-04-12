"use client";
import { adminFetch } from "@/lib/adminFetch";



import { useQuery } from "@tanstack/react-query";
import {
  Users,
  BadgeCheck,
  CreditCard,
  Wrench,
  Truck,
  Zap,
  Clock,
  Ban,
  X,
  IndianRupee,
} from "lucide-react";
import { useAdmin } from "@/context/AdminContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DashboardStats {
  activeRiders: number;
  pendingKyc: number;
  overduePayments: number;
  batteriesBlocked: number;
  openServiceRequests: number;
  vehiclesAvailable: number;
  todaysCollection: number;
}

interface ActivityEvent {
  id: string;
  type: "payment" | "kyc" | "battery" | "rider";
  description: string;
  riderName: string;
  createdAt: string;
  status?: string;
}

interface HubStats extends DashboardStats {
  hubId: string;
  hubName: string;
}

interface HubScopedItem {
  hub_id?: string | null;
  rider_id?: string | null;
}

interface RiderLite {
  id: string;
  hub_id: string | null;
  name: string;
  status: string;
  created_at: string | null;
  wallet_balance: number | null;
}

interface PaymentLite {
  id: string;
  rider_id: string;
  amount: number;
  created_at: string | null;
  status: string;
  paid_at?: string | null;
}

interface KycLite {
  id: string;
  rider_id: string;
  kyc_status: string;
  created_at: string | null;
}

interface BatteryEventLite {
  id: string;
  rider_id: string;
  action: string;
  created_at: string | null;
}

interface ServiceLite {
  rider_id: string;
  status: string;
}

interface VehicleLite {
  id: string;
  assigned_rider_id: string | null;
  hub_id: string | null;
}

// ─── Components ─────────────────────────────────────────────────────────────

function StatCard({ 
  label, 
  value, 
  icon: Icon, 
  trend, 
  isAlert = false,
  loading = false 
}: { 
  label: string; 
  value: number | string; 
  icon: React.ElementType; 
  trend?: string;
  isAlert?: boolean;
  loading?: boolean;
}) {
  const alertClass = isAlert && value > 0 ? "text-red-600 dark:text-red-400" : "text-secondary";
  
  if (loading) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="p-6 space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-16" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden transition-all hover:shadow-md">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <h3 className={`text-2xl font-bold tracking-tight ${alertClass}`}>{value}</h3>
          </div>
          <div className={`p-3 rounded-xl ${isAlert && value > 0 ? 'bg-red-50 text-red-600' : 'bg-primary/10 text-primary'}`}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
        {trend && (
          <div className="mt-4 flex items-center gap-1.5 text-xs font-medium text-emerald-600">
            <Zap className="h-3 w-3" />
            <span>{trend}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function DashboardOverview() {
  const { role, hub_id } = useAdmin();
  const isSuperAdmin = role === "super_admin";

  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard-data", hub_id, role],
    queryFn: async () => {
      // ─── Fetch all data server-side via the API route so that the
      //     service-role key is used and RLS does not hide any rows.
      //     (Direct supabase.from() calls in the browser are blocked by RLS,
      //      which causes every metric to silently return 0.)
      const res = await adminFetch("/api/admin/dashboard", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Dashboard API returned ${res.status}`);
      }

      const json = await res.json();

      const hubs:                typeof json.hubs               = json.hubs               ?? [];
      const riders:              typeof json.riders             = json.riders             ?? [];
      const kycCounts:           typeof json.kycCounts          = json.kycCounts          ?? [];
      const paymentCounts:       typeof json.paymentCounts      = json.paymentCounts      ?? [];
      const batteryCounts:       typeof json.batteryCounts      = json.batteryCounts      ?? [];
      const serviceCounts:       typeof json.serviceCounts      = json.serviceCounts      ?? [];
      const vehicles:            typeof json.vehicles           = json.vehicles           ?? [];
      const recentPayments:      typeof json.recentPayments     = json.recentPayments     ?? [];
      const recentKyc:           typeof json.recentKyc          = json.recentKyc          ?? [];
      const recentBatteryEvents: typeof json.recentBatteryEvents = json.recentBatteryEvents ?? [];
      const recentRiders:        typeof json.recentRiders       = json.recentRiders       ?? [];

      const ridersTyped = (riders || []) as RiderLite[];
      const riderHubById = new Map(ridersTyped.map((r) => [r.id, r.hub_id ?? null]));
      const riderNameById = new Map(ridersTyped.map((r) => [r.id, r.name ?? "Unknown"]));

      // 3. Helper to filter by hub
      const filterByHub = (item: HubScopedItem) => {
        if (!isSuperAdmin && hub_id) {
          const itemHubId = item.hub_id ?? (item.rider_id ? riderHubById.get(item.rider_id) ?? null : null);
          return itemHubId === hub_id;
        }
        return true;
      };

      const now = new Date();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const aggregate: DashboardStats = {
        activeRiders: ridersTyped.filter(r => r.status === "active" && filterByHub(r)).length,
        pendingKyc: ((kycCounts || []) as KycLite[]).filter(k => k.kyc_status === "submitted" && filterByHub(k)).length,
        overduePayments: ridersTyped.filter(r => r.status === "active" && r.wallet_balance !== null && r.wallet_balance <= 0 && filterByHub(r)).length,
        batteriesBlocked: ((batteryCounts || []) as Array<{ rider_id: string; status: string | null }>).filter(b => b.status === "blocked" && filterByHub(b)).length,
        openServiceRequests: ((serviceCounts || []) as ServiceLite[]).filter(s => s.status === "open" && filterByHub(s)).length,
        vehiclesAvailable: ((vehicles || []) as VehicleLite[]).filter(v => !v.assigned_rider_id && filterByHub(v)).length,
        todaysCollection: ((paymentCounts || []) as PaymentLite[]).reduce((sum, p) => {
          if (p.status === "paid" && filterByHub(p)) {
            const d = new Date(p.paid_at || p.created_at || 0);
            if (d >= todayStart) return sum + (p.amount || 0);
          }
          return sum;
        }, 0),
      };

      // 5. Calculate Hub-wise Stats (if Super Admin)
      const hubWise: HubStats[] = isSuperAdmin ? hubs.map((h: { id: string; name: string }) => {
        const hubId = h.id;
        return {
          hubId,
          hubName: h.name,
          activeRiders: ridersTyped.filter(r => r.status === "active" && r.hub_id === hubId).length,
          pendingKyc: ((kycCounts || []) as KycLite[]).filter(k => k.kyc_status === "submitted" && riderHubById.get(k.rider_id) === hubId).length,
          overduePayments: ridersTyped.filter(r => r.status === "active" && r.wallet_balance !== null && r.wallet_balance <= 0 && r.hub_id === hubId).length,
          batteriesBlocked: ((batteryCounts || []) as Array<{ rider_id: string; status: string | null }>).filter(b => b.status === "blocked" && riderHubById.get(b.rider_id) === hubId).length,
          openServiceRequests: ((serviceCounts || []) as ServiceLite[]).filter(s => s.status === "open" && riderHubById.get(s.rider_id) === hubId).length,
          vehiclesAvailable: ((vehicles || []) as VehicleLite[]).filter(v => !v.assigned_rider_id && v.hub_id === hubId).length,
          todaysCollection: ((paymentCounts || []) as PaymentLite[]).reduce((sum, p) => {
            const pHubId = p.rider_id ? riderHubById.get(p.rider_id) ?? null : null;
            if (p.status === "paid" && pHubId === hubId) {
              const d = new Date(p.paid_at || p.created_at || 0);
              if (d >= todayStart) return sum + (p.amount || 0);
            }
            return sum;
          }, 0),
        };
      }) : [];

      // 6. Assemble Activity Feed
      const activities: ActivityEvent[] = [
        ...((recentPayments || []) as PaymentLite[]).map(p => ({
          id: p.id,
          type: "payment" as const,
          description: `Payment of ₹${p.amount.toLocaleString()} received`,
          riderName: riderNameById.get(p.rider_id) || "Unknown",
          createdAt: p.created_at || new Date().toISOString(),
        })),
        ...((recentKyc || []) as KycLite[]).map(k => ({
          id: k.id,
          type: "kyc" as const,
          description: `KYC ${k.kyc_status === 'submitted' ? 'submitted' : k.kyc_status}`,
          riderName: riderNameById.get(k.rider_id) || "Unknown",
          createdAt: k.created_at || new Date().toISOString(),
          status: k.kyc_status
        })),
        ...((recentBatteryEvents || []) as BatteryEventLite[]).map(b => ({
          id: b.id,
          type: "battery" as const,
          description: `Battery command: ${b.action.toUpperCase()}`,
          riderName: riderNameById.get(b.rider_id) || "Unknown",
          createdAt: b.created_at || new Date().toISOString(),
          status: b.action
        })),
        ...(recentRiders || []).map((r: { id: string; name: string; created_at?: string }) => ({
          id: r.id,
          type: "rider" as const,
          description: "New rider registered in the system",
          riderName: r.name,
          createdAt: r.created_at || new Date().toISOString(),
        }))
      ]
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
      .slice(0, 20);

      return { aggregate, hubWise, activities };
    },
    refetchInterval: 60000, // Refresh every 60 seconds
  });

  if (error) {
    return (
      <div className="p-8 rounded-lg border border-destructive/20 bg-destructive/5 text-destructive">
        <h3 className="font-bold flex items-center gap-2">
          <X className="h-5 w-5" />
          Dashboard Error
        </h3>
        <p className="text-sm mt-1">Failed to synchronize dashboard data. Please check your connection.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-[#0D2D6B]">Network Dashboard</h1>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span className="text-sm">Auto-refreshing every minute</span>
        </div>
      </div>

      <div className="grid gap-8">
        <div className="space-y-8">
          {/* Main Stat Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <StatCard label="Today's Collection" value={`₹${(data?.aggregate.todaysCollection || 0).toLocaleString()}`} icon={IndianRupee} loading={isLoading} trend="Updated today" />
            <StatCard label="Active Riders" value={data?.aggregate.activeRiders || 0} icon={Users} loading={isLoading} />
            <StatCard label="Pending KYC" value={data?.aggregate.pendingKyc || 0} icon={BadgeCheck} loading={isLoading} />
            <StatCard label="Overdue Payments" value={data?.aggregate.overduePayments || 0} icon={CreditCard} isAlert={true} loading={isLoading} />
            <StatCard label="Swap Access Blocked" value={data?.aggregate.batteriesBlocked || 0} icon={Ban} isAlert={true} loading={isLoading} />
            <StatCard label="Open Requests" value={data?.aggregate.openServiceRequests || 0} icon={Wrench} loading={isLoading} />
            <StatCard label="Available Vehicles" value={data?.aggregate.vehiclesAvailable || 0} icon={Truck} loading={isLoading} />
          </div>

          {/* Hub-wise Breakdown (Super Admin Only) */}
          {isSuperAdmin && data?.hubWise && data.hubWise.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-[#0D2D6B] flex items-center gap-2">
                <Users className="h-5 w-5" />
                Hub-wise Performance
              </h2>
              <div className="grid gap-6">
                {data.hubWise.map((hub) => (
                  <Card key={hub.hubId} className="overflow-hidden border-slate-200">
                    <CardHeader className="bg-slate-50 border-b py-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-500">{hub.hubName}</CardTitle>
                        <Badge variant="outline" className="text-[10px] font-bold">HUB ID: {hub.hubId.slice(0, 8)}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="grid grid-cols-3 lg:grid-cols-7 divide-x divide-y sm:divide-y-0 divide-slate-100">
                        {[
                          { label: "Collection", val: hub.todaysCollection, format: (v: number) => `₹${v.toLocaleString()}`, icon: IndianRupee },
                          { label: "Active", val: hub.activeRiders, icon: Users },
                          { label: "KYC", val: hub.pendingKyc, icon: BadgeCheck },
                          { label: "Payment", val: hub.overduePayments, icon: CreditCard, alert: true },
                          { label: "Blocked", val: hub.batteriesBlocked, icon: Ban, alert: true },
                          { label: "Service", val: hub.openServiceRequests, icon: Wrench },
                          { label: "Vehicles", val: hub.vehiclesAvailable, icon: Truck },
                        ].map((s, idx) => (
                          <div key={idx} className="p-4 flex flex-col items-center text-center group hover:bg-slate-50 transition-colors">
                            <s.icon className={`h-4 w-4 mb-2 ${s.alert && s.val > 0 ? 'text-red-500' : 'text-slate-400'}`} />
                            <span className={`text-xl font-bold ${s.alert && s.val > 0 ? 'text-red-600' : 'text-slate-900'}`}>{s.format ? s.format(s.val) : s.val}</span>
                            <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-tight">{s.label}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
