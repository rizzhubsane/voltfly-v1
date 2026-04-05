"use client";
import { adminFetch } from "@/lib/adminFetch";


import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { VehicleWithDetails, Hub } from "@/lib/types";
import { useAdmin } from "@/context/AdminContext";
import Link from "next/link";
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
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Truck,
  Plus,
  Search,
  Filter,
  Users,
  CheckCircle2,
  CircleDashed,
  Building2,
  Pencil,
  Loader2,
  AlertCircle,
  Fingerprint,
  ScanBarcode,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Fetching ───────────────────────────────────────────────────────────────

async function fetchVehicles(hubId: string | null): Promise<VehicleWithDetails[]> {
  const url = hubId ? `/api/admin/vehicles?hubId=${hubId}` : "/api/admin/vehicles";
  const res = await adminFetch(url, { method: "GET", cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch vehicles: ${res.statusText}`);
  const { vehicles, error } = await res.json();
  if (error) throw new Error(error);
  return vehicles as VehicleWithDetails[];
}

async function fetchHubs(): Promise<Hub[]> {
  const { data, error } = await supabase.from("hubs").select("*").order("name");
  if (error) throw error;
  return data ?? [];
}

// ─── Form state ──────────────────────────────────────────────────────────────

interface VehicleFormValues {
  vehicle_id: string;
  chassis_number: string;
  hub_id: string | null;
}

// ─── Components ─────────────────────────────────────────────────────────────

function SummaryCard({
  title, value, icon: Icon, description, colorClass = "text-primary bg-primary/10"
}: {
  title: string; value: string | number; icon: React.ElementType;
  description?: string; colorClass?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-xl ${colorClass}`}>
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <h3 className="text-2xl font-bold tracking-tight text-[#0D2D6B]">{value}</h3>
            {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ═════════════════════════════════════════════════════════════════════════════

export default function VehiclesPage() {
  const { role, hub_id: adminHubId } = useAdmin();
  const queryClient = useQueryClient();
  const isSuperAdmin = role === "super_admin";

  // ── State ────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [hubFilter, setHubFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<VehicleWithDetails | null>(null);

  // Form state
  const [formValues, setFormValues] = useState<VehicleFormValues>({
    vehicle_id: "",
    chassis_number: "",
    hub_id: null,
  });
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof VehicleFormValues, string>>>({});

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: vehicles = [], isLoading, error } = useQuery({
    queryKey: ["vehicles", isSuperAdmin ? null : adminHubId],
    queryFn: () => fetchVehicles(isSuperAdmin ? null : adminHubId),
  });

  const { data: hubs = [] } = useQuery({
    queryKey: ["hubs"],
    queryFn: fetchHubs,
  });

  // ── Mutations ────────────────────────────────────────────────────────────
  const upsertMutation = useMutation({
    mutationFn: async (values: VehicleFormValues) => {
      const payload = {
        vehicle_id: values.vehicle_id.trim() || null,
        chassis_number: values.chassis_number.trim(),
        hub_id: values.hub_id || null,
        ...(editingVehicle ? { id: editingVehicle.id } : {}),
      };

      const res = await adminFetch("/api/admin/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save vehicle");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      toast.success(editingVehicle ? "Vehicle updated" : "Vehicle added");
      setDrawerOpen(false);
      setEditingVehicle(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── Filters & Search ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = vehicles;

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (v) =>
          v.chassis_number?.toLowerCase().includes(q) ||
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (v as any).vehicle_id?.toLowerCase().includes(q)
      );
    }

    if (hubFilter !== "all" && isSuperAdmin) {
      list = list.filter((v) => v.hub_id === hubFilter);
    }

    if (statusFilter !== "all") {
      list = list.filter((v) =>
        statusFilter === "assigned" ? v.assigned_rider_id : !v.assigned_rider_id
      );
    }

    return list;
  }, [vehicles, search, hubFilter, statusFilter, isSuperAdmin]);

  // ── Stats ────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total    = vehicles.length;
    const assigned = vehicles.filter((v) => v.assigned_rider_id).length;
    const available = total - assigned;
    const hubCounts = vehicles.reduce((acc, v) => {
      const hubName = v.hubs?.name || "Unassigned";
      acc[hubName] = (acc[hubName] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return { total, assigned, available, hubCounts };
  }, [vehicles]);

  // ── Form helpers ──────────────────────────────────────────────────────────
  const validate = (values: VehicleFormValues): boolean => {
    const errors: Partial<Record<keyof VehicleFormValues, string>> = {};
    if (!values.vehicle_id.trim()) errors.vehicle_id = "Vehicle ID is required (e.g. VFEL0001)";
    if (!values.chassis_number.trim()) errors.chassis_number = "Chassis number is required";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const openAdd = () => {
    setEditingVehicle(null);
    setFormValues({ vehicle_id: "", chassis_number: "", hub_id: isSuperAdmin ? null : adminHubId });
    setFormErrors({});
    setDrawerOpen(true);
  };

  const openEdit = (vehicle: VehicleWithDetails) => {
    setEditingVehicle(vehicle);
    setFormValues({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vehicle_id: (vehicle as any).vehicle_id || "",
      chassis_number: vehicle.chassis_number || "",
      hub_id: vehicle.hub_id,
    });
    setFormErrors({});
    setDrawerOpen(true);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate(formValues)) return;
    upsertMutation.mutate(formValues);
  };

  // ── Loading/Error ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">Loading vehicle data...</p>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0D2D6B]">Vehicle Management</h1>
          <p className="text-muted-foreground mt-1">Monitor and maintain your fleet across all active hubs.</p>
        </div>
        <Button className="gap-2 self-start bg-primary hover:bg-primary/90" onClick={openAdd}>
          <Plus className="h-4 w-4" /> Add Vehicle
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Total Fleet"  value={stats.total}     icon={Truck} />
        <SummaryCard title="Assigned"     value={stats.assigned}  icon={CheckCircle2} colorClass="text-emerald-600 bg-emerald-50" />
        <SummaryCard title="Available"    value={stats.available} icon={CircleDashed} colorClass="text-amber-600 bg-amber-50" />
        <SummaryCard
          title="Primary Hub"
          value={Object.keys(stats.hubCounts)[0] || "N/A"}
          icon={Building2}
          description={Object.keys(stats.hubCounts)[0] ? `${stats.hubCounts[Object.keys(stats.hubCounts)[0]]} vehicles` : ""}
          colorClass="text-blue-600 bg-blue-50"
        />
      </div>

      {/* Filters & Table */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by Vehicle ID or chassis..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border bg-white shadow-sm">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Filters</span>
            </div>

            {isSuperAdmin && (
              <select
                className="h-10 rounded-md border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={hubFilter}
                onChange={(e) => setHubFilter(e.target.value)}
              >
                <option value="all">All Hubs</option>
                {hubs.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            )}

            <select
              className="h-10 rounded-md border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">Any Status</option>
              <option value="assigned">Assigned</option>
              <option value="available">Available</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow>
                <TableHead>Vehicle ID</TableHead>
                <TableHead>Chassis Number</TableHead>
                <TableHead>Hub</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned Rider</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-40 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Truck className="h-8 w-8 opacity-20" />
                      <p className="font-medium">No vehicles found</p>
                      <p className="text-sm">Try adjusting your filters or search query.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((vehicle) => (
                  <TableRow key={vehicle.id} className="group hover:bg-slate-50/50 transition-colors">
                    <TableCell className="font-mono font-semibold text-[#0D2D6B]">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {(vehicle as any).vehicle_id || "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{vehicle.chassis_number}</TableCell>
                    <TableCell className="text-sm">{vehicle.hubs?.name || "—"}</TableCell>
                    <TableCell>
                      {vehicle.assigned_rider_id ? (
                        <span className="flex items-center gap-1.5 text-emerald-600 text-xs font-semibold">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Assigned
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-slate-400 text-xs font-medium">
                          <CircleDashed className="h-3.5 w-3.5" /> Available
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {vehicle.riders ? (
                        <Link
                          href={`/dashboard/riders/${vehicle.assigned_rider_id}`}
                          className="text-primary hover:underline font-medium inline-flex items-center gap-1"
                        >
                          <Users className="h-3.5 w-3.5" /> {vehicle.riders.name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground text-xs italic">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(vehicle)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Add/Edit Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle className="text-xl font-bold flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              {editingVehicle ? "Edit Vehicle" : "Add New Vehicle"}
            </SheetTitle>
            <SheetDescription>
              Only <strong>Vehicle ID</strong> and <strong>Chassis Number</strong> are required.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={onSubmit} className="space-y-6">
            <div className="space-y-5">
              {/* Vehicle ID */}
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                  <Fingerprint className="h-3 w-3" />
                  Vehicle ID <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Fingerprint className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 z-10" />
                  <Input
                    placeholder="e.g. VFEL0001"
                    value={formValues.vehicle_id}
                    onChange={(e) => setFormValues((p) => ({ ...p, vehicle_id: e.target.value.toUpperCase() }))}
                    className="font-mono pl-9 h-10 rounded-xl border-slate-200"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">Format: VFELXXXX</p>
                {formErrors.vehicle_id && (
                  <p className="text-xs font-medium text-destructive">{formErrors.vehicle_id}</p>
                )}
              </div>

              {/* Chassis Number */}
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                  <ScanBarcode className="h-3 w-3" />
                  Chassis Number <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 z-10" />
                  <Input
                    placeholder="e.g. ADCSYSL250902943"
                    value={formValues.chassis_number}
                    onChange={(e) => setFormValues((p) => ({ ...p, chassis_number: e.target.value.toUpperCase() }))}
                    className="font-mono pl-9 h-10 rounded-xl border-slate-200"
                  />
                </div>
                {formErrors.chassis_number && (
                  <p className="text-xs font-medium text-destructive">{formErrors.chassis_number}</p>
                )}
              </div>

              {/* Hub — only show when super admin */}
              {isSuperAdmin && (
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                    <Building2 className="h-3 w-3" />
                    Hub Location
                  </Label>
                  <Select
                    value={formValues.hub_id || "unassigned"}
                    onValueChange={(val) => setFormValues((p) => ({ ...p, hub_id: val === "unassigned" ? null : val }))}
                  >
                    <SelectTrigger className="h-10 rounded-xl border-slate-200 bg-white">
                      <SelectValue placeholder="Select Hub (optional)" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="unassigned" className="rounded-lg text-muted-foreground italic">No Hub Assigned</SelectItem>
                      {hubs.map((h) => (
                        <SelectItem key={h.id} value={h.id} className="rounded-lg">{h.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 pt-6 border-t border-slate-100">
              <Button 
                type="submit" 
                className="w-full h-12 text-base font-bold bg-[#0D2D6B] hover:bg-[#0D2D6B]/90 rounded-xl shadow-lg shadow-blue-900/10 transition-all active:scale-[0.98]" 
                disabled={upsertMutation.isPending}
              >
                {upsertMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving Changes...</>
                ) : (
                  editingVehicle ? "Update Vehicle Details" : "Add Vehicle to Fleet"
                )}
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                className="w-full h-11 text-slate-600 rounded-xl border-slate-200 hover:bg-slate-50 transition-colors" 
                onClick={() => setDrawerOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Error State */}
      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <div className="text-sm">
            <p className="font-semibold text-destructive">Data Sync Issue</p>
            <p className="text-destructive/80">{(error as Error).message}</p>
          </div>
        </div>
      )}
    </div>
  );
}
