"use client";
import { adminFetch } from "@/lib/adminFetch";
import { LogCashPaymentDrawer } from "@/components/payments/LogCashPaymentDrawer";
import { ExpandableNote } from "@/components/shared/ExpandableNote";
import { Sheet } from "@/components/ui/sheet";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type {
  RiderFullData,
  HandoverChecklist,
  HandoverFormState,
  HandoverItemKey,
  PaymentRecord,
  ServiceRequest,
} from "@/lib/types";
import { DEFAULT_HANDOVER_FORM, HANDOVER_ITEMS } from "@/lib/types";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Loader2,
  Phone,

  CreditCard,
  Users,
  FileText,
  Eye,
  X,
  UserCircle,
  Truck,
  DollarSign,
  Wrench,
  Zap,
  Ban,
  RefreshCw,
  LogOut,
  Plus,
  UserCheck,
  Calendar,
  ShieldCheck,
  AlertTriangle,
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  Trash2,
  Pencil,
  Save,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Types ───────────────────────────────────────────────────────────────────

type TabKey = "profile" | "vehicle" | "payments" | "service";



const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "profile", label: "Profile & KYC", icon: UserCircle },
  { key: "vehicle", label: "Vehicle & Swap Access", icon: Truck },
  { key: "payments", label: "Payments", icon: DollarSign },
  { key: "service", label: "Service Requests", icon: Wrench },
];

type RiderStatus = "pending_kyc" | "kyc_submitted" | "kyc_approved" | "active" | "suspended" | "on_leave" | "exited";

const STATUS_CONFIG: Record<RiderStatus, { label: string; bg: string; text: string; dot: string }> = {
  pending_kyc:   { label: "Pending KYC",   bg: "bg-slate-100",   text: "text-slate-700",   dot: "bg-slate-400" },
  kyc_submitted: { label: "KYC Submitted", bg: "bg-amber-100",   text: "text-amber-800",   dot: "bg-amber-500" },
  kyc_approved:  { label: "KYC Approved",  bg: "bg-blue-100",    text: "text-blue-800",     dot: "bg-blue-500" },
  active:        { label: "Active",        bg: "bg-emerald-100", text: "text-emerald-700",  dot: "bg-emerald-500" },
  suspended:     { label: "Suspended",     bg: "bg-orange-100",  text: "text-orange-800",   dot: "bg-orange-500" },
  on_leave:      { label: "On Leave",      bg: "bg-purple-100",  text: "text-purple-800",   dot: "bg-purple-500" },
  exited:        { label: "Exited",        bg: "bg-red-100",     text: "text-red-700",      dot: "bg-red-500" },
};

interface DocItem { label: string; url: string | null }

type EditKycForm = {
  aadhaar_number: string;
  pan_number: string;
  address_local: string;
  address_village: string;
  ref1_name: string;
  ref1_phone: string;
  ref2_name: string;
  ref2_phone: string;
  ref3_name: string;
  ref3_phone: string;
  kyc_status: string;
};

const KYC_SELECT_STATUSES = new Set(["pending", "submitted", "approved", "rejected"]);

function normalizeKycStatusForSelect(s: string | undefined | null): string {
  if (s && KYC_SELECT_STATUSES.has(s)) return s;
  return "pending";
}

/** Sort VFEL#### numerically (VFEL1001 … VFEL1xxx); other IDs alphabetically. */
function sortVehiclesByVfelId<T extends { vehicle_id?: string | null; chassis_number: string }>(
  vehicles: T[]
): T[] {
  const rank = (v: T): [number, number, string] => {
    const raw = (v.vehicle_id || "").trim().toUpperCase();
    const m = raw.match(/^VFEL(\d+)$/i);
    if (m) return [0, parseInt(m[1], 10), raw];
    return [1, 0, raw || v.chassis_number];
  };
  return [...vehicles].sort((a, b) => {
    const [ta, na, sa] = rank(a);
    const [tb, nb, sb] = rank(b);
    if (ta !== tb) return ta - tb;
    if (ta === 0 && na !== nb) return na - nb;
    return sa.localeCompare(sb);
  });
}

function kycEditUnchanged(a: EditKycForm, b: EditKycForm): boolean {
  return (
    a.aadhaar_number === b.aadhaar_number &&
    a.pan_number === b.pan_number &&
    a.address_local === b.address_local &&
    a.address_village === b.address_village &&
    a.ref1_name === b.ref1_name &&
    a.ref1_phone === b.ref1_phone &&
    a.ref2_name === b.ref2_name &&
    a.ref2_phone === b.ref2_phone &&
    a.ref3_name === b.ref3_name &&
    a.ref3_phone === b.ref3_phone &&
    a.kyc_status === b.kyc_status
  );
}

// ─── Fetch rider full data ───────────────────────────────────────────────────

async function fetchRiderFull(riderId: string): Promise<RiderFullData> {
  const [rpcRes, activityRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.rpc as any)("get_rider_full", { p_rider_id: riderId }),
    adminFetch(`/api/admin/riders/${riderId}/activity?_t=${Date.now()}`, { cache: "no-store" }).then((res) => res.json())
  ]);

  if (rpcRes.error) throw rpcRes.error;

  // The RPC returns a JSON object — parse it if needed
  const parsed = typeof rpcRes.data === "string" ? JSON.parse(rpcRes.data) : rpcRes.data;

  // activityRes contains payments, service_requests, and battery_events, plus securely fetched rider_info
  const activity = activityRes || {};

  // Inject the explicitly fetched driver_id and hubs into the rider object,
  // bypassing the RPC's potentially outdated schema definition AND client-side RLS.
  const rider = parsed.rider ?? null;
  if (rider) {
    if (activity.rider_info?.driver_id !== undefined) {
      rider.driver_id = activity.rider_info.driver_id;
    }
    // Inject admin tracking fields from the service-role fetch
    if (activity.rider_info?.added_by !== undefined) {
      rider.added_by = activity.rider_info.added_by;
    }
    if (activity.rider_info?.admin_notes !== undefined) {
      rider.admin_notes = activity.rider_info.admin_notes;
    }
    
    // Explicitly fetch the hub name if we have a hub_id, ensuring no nulls from RPC
    if (rider.hub_id) {
      const hubRes = await supabase.from("hubs").select("name").eq("id", rider.hub_id).maybeSingle();
      if (hubRes.data) {
        rider.hubs = { name: hubRes.data.name };
      }
    }
  }

  return {
    rider: rider,
    // Prefer the service-role fetch from the activity route — the RPC result for
    // kyc is always null because rider-only RLS blocks the admin's anon JWT.
    kyc: activity.kyc ?? parsed.kyc ?? null,
    vehicle: parsed.vehicle ?? null,
    battery: parsed.battery ?? null,
    payments: activity.payments || [],
    service_requests: activity.service_requests || [],
    battery_events: parsed.battery_events ?? activity.battery_events ?? [],
  } as RiderFullData;
}


// ─── Status badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as RiderStatus] ?? {
    label: status, bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ─── Info row helper ─────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between py-2 border-b border-slate-100 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value || "—"}</span>
    </div>
  );
}

// ─── Handover Form Component ──────────────────────────────────────────────────

const HANDOVER_BOOL_KEYS: (keyof HandoverFormState)[] = [
  "battery", "key", "mirrors", "foot_mat",
  "lights", "horn", "indicators", "tyres",
];

function HandoverChecklistForm({
  value,
  onChange,
  disabled = false,
}: {
  value: HandoverFormState;
  onChange?: (val: HandoverFormState) => void;
  disabled?: boolean;
}) {
  const allChecked = HANDOVER_BOOL_KEYS.every((k) => !!value[k]);

  const toggleAll = () => {
    const next = !allChecked;
    const update = HANDOVER_BOOL_KEYS.reduce(
      (acc, k) => ({ ...acc, [k]: next }),
      {} as Partial<HandoverFormState>
    );
    onChange?.({ ...value, ...update });
  };

  return (
    <div className="space-y-4">
      {!disabled && (
        <button
          type="button"
          onClick={toggleAll}
          className="text-xs font-semibold text-primary hover:underline underline-offset-2 self-start"
        >
          {allChecked ? "Deselect All" : "Select All"}
        </button>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-3 gap-x-4">
        {HANDOVER_ITEMS.map((item) => (
          <div key={item.key} className="flex items-center space-x-2">
            <Checkbox
              id={item.key}
              checked={value[item.key as HandoverItemKey]}
              onCheckedChange={(checked) =>
                onChange?.({ ...value, [item.key]: !!checked })
              }
              disabled={disabled}
            />
            <Label
              htmlFor={item.key}
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              {item.label}
            </Label>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 mt-4">
        <div className="space-y-1.5">
          <Label htmlFor="odometer_reading" className="text-xs text-muted-foreground uppercase">Odometer Reading</Label>
          <Input
            id="odometer_reading"
            placeholder="e.g. 12,450 km"
            value={value.odometer_reading}
            onChange={(e) => onChange?.({ ...value, odometer_reading: e.target.value })}
            disabled={disabled}
            className="h-8"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="motor_number" className="text-xs text-muted-foreground uppercase">Motor Number</Label>
          <Input
            id="motor_number"
            placeholder="e.g. 987654321"
            value={value.motor_number}
            onChange={(e) => onChange?.({ ...value, motor_number: e.target.value })}
            disabled={disabled}
            className="h-8"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="notes" className="text-xs text-muted-foreground uppercase">Notes</Label>
        <Textarea
          id="notes"
          placeholder="Any additional remarks..."
          value={value.notes}
          onChange={(e) => onChange?.({ ...value, notes: e.target.value })}
          disabled={disabled}
          className="resize-none h-16"
        />
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════

export default function RiderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { adminId, role } = useAdmin(); // verifies admin access
  const isSuperAdmin = role === "super_admin";
  const riderId = (params?.id ?? "") as string;

  // ── State ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabKey>("profile");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Dialogs
  const [swapActionOpen, setSwapActionOpen] = useState(false);
  const [swapActionType, setSwapActionType] = useState<"block" | "unblock">("block");
  const [swapActionReason, setSwapActionReason] = useState("");
  const [exitOpen, setExitOpen] = useState(false);
  const [hardDeleteOpen, setHardDeleteOpen] = useState(false);
  const [hardDeleteConfirmName, setHardDeleteConfirmName] = useState("");
  const [resetPinOpen, setResetPinOpen] = useState(false);

  // ── Edit Profile ──────────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [editRider, setEditRider] = useState<{
    name: string; phone_1: string; phone_2: string;
    hub_id: string; driver_id: string; status: string; created_at: string; gig_company: string;
    admin_notes: string;
  } | null>(null);
  const [editKyc, setEditKyc] = useState<EditKycForm | null>(null);
  const editKycBaselineRef = useRef<EditKycForm | null>(null);
  const [paymentDrawerOpen, setPaymentDrawerOpen] = useState(false);

  // Leave system
  const [leaveDialogOpen, setLeaveDialogOpen]   = useState(false);
  const [leaveAction, setLeaveAction]           = useState<"start" | "end">("start");
  const [leaveReason, setLeaveReason]           = useState("");
  const [leaveExpected, setLeaveExpected]       = useState("");

  // Wallet adjustment
  const [walletAdjOpen, setWalletAdjOpen]       = useState(false);
  const [walletAdjAmount, setWalletAdjAmount]   = useState("");
  const [walletAdjReason, setWalletAdjReason]   = useState("");
  const [upgridInput, setUpgridInput] = useState("");
  const [assignVehicleOpen, setAssignVehicleOpen] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  /** Combobox query — typed text that filters available vehicles */
  const [assignVehicleIdInput, setAssignVehicleIdInput] = useState("");
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [assignStep, setAssignStep] = useState<1 | 2>(1);
  const [assignChecklist, setAssignChecklist] = useState<HandoverFormState>(DEFAULT_HANDOVER_FORM);
  const [returnChecklist, setReturnChecklist] = useState<HandoverFormState>(DEFAULT_HANDOVER_FORM);

  // Auto-open assign dialog via ?assign=vehicle query param
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams?.get("assign") === "vehicle") {
      setAssignVehicleOpen(true);
    }
  }, [searchParams]);



  // Service request form
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [serviceType, setServiceType] = useState("general");
  const [serviceDesc, setServiceDesc] = useState("");
  
  // ── Query ────────────────────────────────────────────────────────────────
  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["rider-full", riderId],
    queryFn: () => fetchRiderFull(riderId),
    enabled: !!riderId,
    staleTime: 0,
    gcTime: 0,
  });

  // ── Effects ─────────────────────────────────────────────────────────────
  // Pre-fill Upgrid Input when rider data loads
  const [hasInitUpgrid, setHasInitUpgrid] = useState(false);
  useEffect(() => {
    if (data?.rider?.driver_id && !hasInitUpgrid) {
      setUpgridInput(data.rider.driver_id);
      setHasInitUpgrid(true);
    }
  }, [data?.rider?.driver_id, hasInitUpgrid]);

  const { data: availableVehicles, isLoading: isLoadingVehicles } = useQuery({
    queryKey: ["available-vehicles"],
    queryFn: async () => {
      const res = await adminFetch(`/api/admin/vehicles?available=true`);
      const { vehicles, error } = await res.json();
      if (!res.ok || error) throw new Error(error || "Failed to fetch vehicles");
      return vehicles;
    },
    enabled: assignVehicleOpen && assignStep === 1,
  });

  const sortedAvailableVehicles = useMemo(
    () => (availableVehicles?.length ? sortVehiclesByVfelId(availableVehicles) : []),
    [availableVehicles]
  );

  /** Returns vehicles.id when the typed Vehicle ID matches an available row; updates selection state. */
  const resolveAssignVehicleIdInput = useCallback((): string | null => {
    const q = assignVehicleIdInput.trim().toUpperCase();
    if (!q || !availableVehicles?.length) return null;
    const found = availableVehicles.find(
      (v: { id: string; vehicle_id?: string | null }) =>
        (v.vehicle_id || "").trim().toUpperCase() === q
    );
    if (found) {
      setSelectedVehicleId(found.id);
      setAssignVehicleIdInput((found.vehicle_id || "").trim());
      return found.id;
    }
    return null;
  }, [assignVehicleIdInput, availableVehicles]);

  const { data: assignmentChecklist } = useQuery({
    queryKey: ["handover-checklist", data?.vehicle?.id],
    queryFn: async () => {
      if (!data?.vehicle?.id) return null;
      const res = await adminFetch(`/api/admin/vehicles?checklist=${data.vehicle.id}`);
      const { checklist, error } = await res.json();
      if (!res.ok || error) throw new Error(error || "Failed to fetch checklist");
      return checklist as HandoverChecklist;
    },
    enabled: !!data?.vehicle?.id,
  });

  // ── Signed KYC document URLs ─────────────────────────────────────────────
  // The kyc-documents bucket is private; we pre-fetch 1-hour signed URLs via the
  // service-role API so both thumbnails and the lightbox work correctly.
  const kycDocRawUrls = useMemo(() => {
    const k = data?.kyc;
    if (!k) return null;
    return {
      photo: k.photo_url ?? null,
      aadhaar_front: k.aadhaar_front_url ?? null,
      aadhaar_back: k.aadhaar_back_url ?? null,
      pan: k.pan_url ?? null,
      pcc: k.pcc_url ?? null,
    };
  }, [data?.kyc]);

  const { data: signedDocUrls } = useQuery({
    queryKey: ["kyc-signed-urls", riderId],
    queryFn: async () => {
      const raw = kycDocRawUrls!;
      const resolve = async (path: string | null) => {
        if (!path) return null;
        // Base64 data URLs are stored directly in the DB (the rider app skips
        // Supabase Storage due to upload RLS). Return them as-is — browsers
        // render data: URIs natively, no signing needed.
        if (path.startsWith("data:")) return path;
        // For Supabase Storage paths or full https URLs, get a signed URL.
        const res = await adminFetch(
          `/api/admin/kyc/sign?path=${encodeURIComponent(path)}`
        );
        if (!res.ok) return null;
        const { url } = await res.json();
        return (url as string) ?? null;
      };
      const [photo, aadhaar_front, aadhaar_back, pan, pcc] = await Promise.all([
        resolve(raw.photo),
        resolve(raw.aadhaar_front),
        resolve(raw.aadhaar_back),
        resolve(raw.pan),
        resolve(raw.pcc),
      ]);
      return { photo, aadhaar_front, aadhaar_back, pan, pcc };
    },
    enabled: !!kycDocRawUrls,
    staleTime: 50 * 60 * 1000, // 50 min — signed URLs expire at 60 min
    gcTime: 60 * 60 * 1000,
  });

  // ── Mutations ────────────────────────────────────────────────────────────

  // swapToggleMutation: securely blocks or unblocks Upgrid swap access & internal status
  const swapToggleMutation = useMutation({
    mutationFn: async () => {
      const res = await adminFetch(`/api/admin/riders/${riderId}/swap-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: swapActionType,
          reason: swapActionReason,
          driverId: rider?.driver_id,
          adminId,
        }),
      });

      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `Failed to ${swapActionType} swap access`);
      return d;
    },
    onSuccess: () => {
      const newStatus = swapActionType === "block" ? "suspended" : "active";
      toast.success(`Swap access successfully ${swapActionType === "block" ? "blocked" : "unblocked"}`);

      // Instantly flip the button without waiting for the RPC refetch
      queryClient.setQueryData(["rider-full", riderId], (old: RiderFullData | undefined) =>
        old ? { ...old, rider: { ...old.rider, status: newStatus } } : old
      );
      // Background sync to confirm from server
      queryClient.invalidateQueries({ queryKey: ["rider-full", riderId] });
      setSwapActionOpen(false);
      setSwapActionReason("");
    },
    onError: (err: Error) => toast.error(err.message),
  });



  const saveUpgridMutation = useMutation({
    mutationFn: async () => {
      if (!upgridInput.trim()) throw new Error("Driver ID cannot be empty");

      // Store driver_id using our secure admin API to bypass RLS policies
      const res = await adminFetch(`/api/admin/riders/${riderId}/upgrid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driver_id: upgridInput.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save Upgrid Account");
    },
    onSuccess: () => {
      toast.success("Upgrid Driver ID saved");
      queryClient.invalidateQueries({ queryKey: ["rider-full", riderId] });
      queryClient.invalidateQueries({ queryKey: ["riders"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const logServiceMutation = useMutation({
    mutationFn: async () => {
      if (!serviceDesc.trim()) throw new Error("Description is required");
      const res = await adminFetch("/api/admin/service-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          riderId,
          type: serviceType,
          description: serviceDesc.trim(),
          status: "open",
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to create service request");
      return d;
    },
    onSuccess: () => {
      toast.success("Service request created");
      queryClient.invalidateQueries({ queryKey: ["rider-full", riderId] });
      queryClient.invalidateQueries({ queryKey: ["service-requests"] });
      setServiceDialogOpen(false);
      setServiceDesc("");
      setServiceType("general");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const assignVehicleMutation = useMutation({
    mutationFn: async (vehicleId: string) => {
      const res = await adminFetch("/api/admin/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          id: vehicleId, 
          assigned_rider_id: riderId, 
          assigned_at: new Date().toISOString(),
          handover_checklist: assignChecklist,
          admin_id: adminId,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to assign vehicle");
      return data;
    },
    onSuccess: (data: {
      vehicle?: unknown;
      rider_driver_id?: string | null;
    }) => {
      const did = data?.rider_driver_id;
      toast.success(
        typeof did === "string" && did.length > 0
          ? `Vehicle assigned. Upgrid Driver ID set to ${did}.`
          : "Vehicle assigned successfully"
      );

      // Immediately reflect the assigned vehicle in the UI using the API response
      if (data?.vehicle) {
        queryClient.setQueryData(["rider-full", riderId], (old: RiderFullData | undefined) => {
          if (!old) return old;
          const nextRider =
            typeof did === "string" && did.length > 0
              ? { ...old.rider, driver_id: did }
              : old.rider;
          return { ...old, vehicle: data.vehicle as RiderFullData["vehicle"], rider: nextRider };
        });
      }
      // Background sync for full vehicle details (hub name, rider name joins, etc.)
      queryClient.invalidateQueries({ queryKey: ["rider-full", riderId] });
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      setAssignVehicleOpen(false);
      setSelectedVehicleId("");
      setAssignVehicleIdInput("");
      setAssignStep(1);
      setAssignChecklist(DEFAULT_HANDOVER_FORM);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const unassignVehicleMutation = useMutation({
    mutationFn: async () => {
      if (!vehicle?.id) return null;
      const res = await adminFetch("/api/admin/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          id: vehicle.id, 
          assigned_rider_id: null, 
          assigned_at: null 
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to unassign vehicle");
      return data as { cleared_driver_id?: boolean };
    },
    onSuccess: (data) => {
      toast.success(
        data?.cleared_driver_id
          ? "Vehicle unassigned. Upgrid Driver ID cleared."
          : "Vehicle unassigned successfully"
      );

      // Instantly clear the vehicle from the UI
      queryClient.setQueryData(["rider-full", riderId], (old: RiderFullData | undefined) =>
        old ? { ...old, vehicle: null, rider: { ...old.rider, driver_id: null } } : old
      );
      // Background sync
      queryClient.invalidateQueries({ queryKey: ["rider-full", riderId] });
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // processExitMutation — single consolidated call handling all exit steps server-side
  const processExitMutation = useMutation({
    mutationFn: async () => {
      const res = await adminFetch("/api/admin/riders/exit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          riderId,
          vehicleId:       vehicle?.id ?? null,
          adminId:         adminId ?? null,
          returnChecklist: vehicle ? returnChecklist : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Exit failed");
      return data as {
        success: boolean;
        batteryBlocked: boolean;
        depositInitiated: boolean;
        warnings: string[];
      };
    },
    onSuccess: (data) => {
      toast.success("Rider exit processed successfully");
      if (data.batteryBlocked) toast.success("Battery blocked");
      if (data.depositInitiated) toast.success("Security deposit marked for refund");
      if (data.warnings?.length) {
        data.warnings.forEach((w: string) => toast.warning(w));
      }
      // Immediately update rider status to exited so the header badge changes
      queryClient.setQueryData(["rider-full", riderId], (old: RiderFullData | undefined) =>
        old
          ? { ...old, rider: { ...old.rider, status: "exited", driver_id: null }, vehicle: null }
          : old
      );
      queryClient.invalidateQueries({ queryKey: ["rider-full", riderId] });
      queryClient.invalidateQueries({ queryKey: ["riders"] });
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      setExitOpen(false);
      setReturnChecklist(DEFAULT_HANDOVER_FORM);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const unexitMutation = useMutation({
    mutationFn: async () => {
      const res = await adminFetch(`/api/admin/riders/${riderId}/unexit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Un-exit failed");
      return data as { success: boolean; status: string };
    },
    onSuccess: (data) => {
      toast.success(`Rider un-exited successfully. Status is now ${data.status}.`);
      queryClient.setQueryData(["rider-full", riderId], (old: RiderFullData | undefined) =>
        old
          ? { ...old, rider: { ...old.rider, status: data.status } }
          : old
      );
      queryClient.invalidateQueries({ queryKey: ["rider-full", riderId] });
      queryClient.invalidateQueries({ queryKey: ["riders"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── Hubs (for edit hub selector) ─────────────────────────────────────────
  const { data: allHubs = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["hubs"],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/payments?type=hubs");
      const json = await res.json();
      return json.hubs ?? [];
    },
  });

  // ── Edit Profile Mutation ─────────────────────────────────────────────────
  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editRider) throw new Error("Nothing to save");
      const baseline = editKycBaselineRef.current;
      const includeKyc =
        !!editKyc &&
        !!baseline &&
        !kycEditUnchanged(baseline, editKyc);
      const body: { rider: typeof editRider; kyc?: EditKycForm } = { rider: editRider };
      if (includeKyc && editKyc) body.kyc = editKyc;

      const res = await adminFetch(`/api/admin/riders/${riderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to update rider");
      return d;
    },
    onSuccess: () => {
      toast.success("Rider profile updated");
      queryClient.invalidateQueries({ queryKey: ["rider-full", riderId] });
      queryClient.invalidateQueries({ queryKey: ["riders"] });
      setIsEditing(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const hardDeleteMutation = useMutation({
    mutationFn: async () => {
      const res = await adminFetch(`/api/admin/riders?id=${riderId}`, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to delete rider");
      return d;
    },
    onSuccess: () => {
      toast.success("Rider permanently deleted");
      queryClient.invalidateQueries({ queryKey: ["riders"] });
      router.push("/dashboard/riders");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const resetPinMutation = useMutation({
    mutationFn: async () => {
      const res = await adminFetch(`/api/admin/riders/${riderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rider: { access_code_hash: null, failed_attempts: 0, locked_until: null },
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to reset access code");
      return d;
    },
    onSuccess: () => {
      toast.success("Access code reset. Rider must set a new code on next login.");
      queryClient.invalidateQueries({ queryKey: ["rider-full", riderId] });
      setResetPinOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Wallet Transactions (ledger) fetch removed as it was unused
  // ── Leave Mutation ─────────────────────────────────────────────────────────
  const leaveMutation = useMutation({
    mutationFn: async () => {
      if (leaveAction === "start" && !leaveReason.trim()) throw new Error("Reason is required");
      const res = await adminFetch(`/api/admin/riders/${riderId}/leave`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: leaveAction, reason: leaveReason.trim(), expectedReturn: leaveExpected || undefined }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Leave action failed");
      return d;
    },
    onSuccess: (d) => {
      toast.success(leaveAction === "start" ? "Rider put on leave — billing paused" : `Rider returned from leave → ${d.status}`);
      queryClient.invalidateQueries({ queryKey: ["rider-full", riderId] });
      setLeaveDialogOpen(false);
      setLeaveReason("");
      setLeaveExpected("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── Wallet Adjustment Mutation ─────────────────────────────────────────────
  const walletAdjMutation = useMutation({
    mutationFn: async () => {
      const adj = parseFloat(walletAdjAmount);
      if (isNaN(adj) || adj === 0) throw new Error("Enter a valid non-zero amount");
      if (!walletAdjReason.trim()) throw new Error("Reason is required");
      const res = await adminFetch("/api/admin/riders/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riderId, adjustment: adj, reason: walletAdjReason.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Adjustment failed");
      return d;
    },
    onSuccess: (d) => {
      toast.success(`Wallet adjusted → ₹${d.new_balance}${d.unblocked ? " — Rider unblocked" : ""}`);
      queryClient.invalidateQueries({ queryKey: ["rider-full", riderId] });
      queryClient.invalidateQueries({ queryKey: ["wallet-transactions", riderId] });
      setWalletAdjOpen(false);
      setWalletAdjAmount("");
      setWalletAdjReason("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── Derived ——————————————————————————————————————————————————————————————
  const rider = data?.rider;
  const kyc = data?.kyc;
  const vehicle = data?.vehicle;
  const payments = useMemo(() => data?.payments ?? [], [data?.payments]);
  const serviceRequests = data?.service_requests ?? [];


  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading rider details…</p>
      </div>
    );
  }

  if (error || !rider) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" className="gap-2" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center">
          <h3 className="font-semibold text-destructive">Failed to load rider</h3>
          <p className="mt-1 text-sm text-destructive/80">{(error as Error)?.message ?? "Rider not found"}</p>
        </div>
      </div>
    );
  }

  // ── Documents builder ──────────────────────────────────────────────────
  // Uses pre-fetched signed URLs so the private bucket is accessible.
  function getDocs(): DocItem[] {
    const s = signedDocUrls;
    return [
      { label: "Photo", url: s?.photo ?? null },
      { label: "Aadhaar Front", url: s?.aadhaar_front ?? null },
      { label: "Aadhaar Back", url: s?.aadhaar_back ?? null },
      { label: "PAN Card", url: s?.pan ?? null },
      { label: "Relative's ID Card", url: s?.pcc ?? null },
    ];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <Button variant="ghost" className="gap-2 self-start -ml-2" onClick={() => router.push("/dashboard/riders")}>
          <ArrowLeft className="h-4 w-4" /> Back to Riders
        </Button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-xl font-bold text-primary">
              {(rider.name ?? '?').charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#0D2D6B]">{rider.name ?? 'Unnamed Rider'}</h1>
              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{rider.phone_1}</span>
                {rider.phone_2 && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{rider.phone_2}</span>}
                <StatusBadge status={rider.status} />
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {isSuperAdmin && rider.status === "active" && (
              <Button variant="outline" className="gap-1.5 border-orange-300 text-orange-700 hover:bg-orange-50" onClick={() => {
                setSwapActionType("block");
                setSwapActionOpen(true);
              }}>
                <Ban className="h-3.5 w-3.5" /> Block Swap
              </Button>
            )}
            {isSuperAdmin && rider.status === "suspended" && (
              <Button variant="outline" className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={() => {
                setSwapActionType("unblock");
                setSwapActionOpen(true);
              }}>
                <RefreshCw className="h-3.5 w-3.5" /> Unblock Swap
              </Button>
            )}
            {/* Leave controls */}
            {["active", "suspended"].includes(rider.status) && (
              <Button variant="outline" className="gap-1.5 border-purple-300 text-purple-700 hover:bg-purple-50" onClick={() => {
                setLeaveAction("start"); setLeaveReason(""); setLeaveExpected(""); setLeaveDialogOpen(true);
              }}>
                <Calendar className="h-3.5 w-3.5" /> Put on Leave
              </Button>
            )}
            {rider.status === "on_leave" && (
              <Button variant="outline" className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={() => {
                setLeaveAction("end"); setLeaveDialogOpen(true);
              }}>
                <RefreshCw className="h-3.5 w-3.5" /> Return from Leave
              </Button>
            )}
            {rider.status === "exited" && (
              <Button
                variant="outline"
                className="gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50"
                onClick={() => {
                  if (window.confirm("Are you sure you want to un-exit this rider? Their status will be restored based on their wallet balance.")) {
                    unexitMutation.mutate();
                  }
                }}
                disabled={unexitMutation.isPending}
              >
                {unexitMutation.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
                Un-Exit Rider
              </Button>
            )}
            {rider.status !== "exited" && (
              <Button variant="outline" className="gap-1.5 border-red-300 text-red-700 hover:bg-red-50" onClick={() => setExitOpen(true)}>
                <LogOut className="h-3.5 w-3.5" /> Process Exit
              </Button>
            )}
            <Button
              variant="outline"
              className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
              onClick={() => setResetPinOpen(true)}
              title="Clear the rider's access code so they can set a new one on next login"
            >
              <ShieldCheck className="h-3.5 w-3.5" /> Reset Access Code
            </Button>
            {isSuperAdmin && (
              <Button
                variant="outline"
                className="gap-1.5 border-red-400 text-red-600 hover:bg-red-50"
                onClick={() => { setHardDeleteOpen(true); setHardDeleteConfirmName(""); }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete Rider
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Tab Bar ─────────────────────────────────────────────────────── */}
      <div className="border-b bg-white rounded-t-lg overflow-x-auto">
        <div className="flex min-w-max">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-slate-300"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab Content ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-b-lg rounded-lg border shadow-sm p-6">
        {/* ═══ TAB 1: Profile & KYC ═══ */}
        {activeTab === "profile" && (
          <div className="space-y-8">
            {/* Edit toggle */}
            <div className="flex justify-end">
              {!isEditing ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    setEditRider({
                      name: rider.name ?? "",
                      phone_1: rider.phone_1 ?? "",
                      phone_2: rider.phone_2 ?? "",
                      hub_id: rider.hub_id ?? "",
                      driver_id: (rider as Record<string, unknown>).driver_id as string ?? "",
                      gig_company: (rider as Record<string, unknown>).gig_company as string ?? "",
                      status: rider.status ?? "",
                      admin_notes: (rider as Record<string, unknown>).admin_notes as string ?? "",
                      // Use "yyyy-MM-dd" for the HTML date input
                      created_at: rider.created_at ? format(new Date(rider.created_at), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
                    });
                    const nextKyc: EditKycForm = {
                      aadhaar_number: kyc?.aadhaar_number ?? "",
                      pan_number: kyc?.pan_number ?? "",
                      address_local: kyc?.address_local ?? "",
                      address_village: kyc?.address_village ?? "",
                      ref1_name: kyc?.ref1_name ?? "",
                      ref1_phone: kyc?.ref1_phone ?? "",
                      ref2_name: kyc?.ref2_name ?? "",
                      ref2_phone: kyc?.ref2_phone ?? "",
                      ref3_name: kyc?.ref3_name ?? "",
                      ref3_phone: kyc?.ref3_phone ?? "",
                      kyc_status: normalizeKycStatusForSelect(kyc?.kyc_status),
                    };
                    setEditKyc(nextKyc);
                    editKycBaselineRef.current = { ...nextKyc };
                    setIsEditing(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit Profile
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>Cancel</Button>
                  <Button
                    size="sm"
                    className="gap-1.5 bg-[#0D2D6B] hover:bg-[#0D2D6B]/90"
                    disabled={editMutation.isPending}
                    onClick={() => editMutation.mutate()}
                  >
                    {editMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save Changes
                  </Button>
                </div>
              )}
            </div>

            {/* Rider Info */}
            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <UserCircle className="h-4 w-4" /> Rider Information
              </h3>
              {!isEditing || !editRider ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                    <InfoRow label="Full Name" value={rider.name} />
                    <InfoRow label="Phone 1" value={rider.phone_1} />
                    <InfoRow label="Phone 2" value={rider.phone_2} />
                    <InfoRow label="Hub" value={rider.hubs?.name} />
                    <InfoRow label="Status" value={rider.status} />
                    <InfoRow label="Gig Company" value={(rider as Record<string, unknown>).gig_company as string || "Unspecified"} />
                    <InfoRow label="Joined" value={rider.created_at ? format(new Date(rider.created_at), "dd MMM yyyy") : null} />
                  </div>
                  {/* ── Admin Tracking Banner ── */}
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {((rider as any).added_by || (rider as any).admin_notes) && (
                    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 space-y-2.5">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" /> Admin Tracking
                      </p>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {(rider as any).added_by && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-20 shrink-0">Added By</span>
                          <span className="text-xs font-semibold text-slate-800 bg-blue-50 border border-blue-100 rounded-full px-2.5 py-0.5">
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            👤 {(rider as any).added_by}
                          </span>
                        </div>
                      )}
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {(rider as any).admin_notes && (
                        <div className="flex items-start gap-2">
                          <span className="text-xs text-muted-foreground w-20 shrink-0 mt-1">Audit Log</span>
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          <ExpandableNote note={(rider as any).admin_notes} className="flex-1" />
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Full Name</Label>
                    <Input value={editRider.name} onChange={(e) => setEditRider({ ...editRider, name: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Phone 1</Label>
                    <Input value={editRider.phone_1} onChange={(e) => setEditRider({ ...editRider, phone_1: e.target.value.replace(/\D/g, "").slice(0, 10) })} inputMode="numeric" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Phone 2</Label>
                    <Input placeholder="Optional" value={editRider.phone_2} onChange={(e) => setEditRider({ ...editRider, phone_2: e.target.value.replace(/\D/g, "").slice(0, 10) })} inputMode="numeric" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Hub</Label>
                    <Select value={editRider.hub_id || "none"} onValueChange={(v) => setEditRider({ ...editRider, hub_id: v === "none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="Select hub..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" className="italic text-muted-foreground">No Hub</SelectItem>
                        {allHubs.map((h) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Status</Label>
                    <Select value={editRider.status} onValueChange={(v) => setEditRider({ ...editRider, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["pending_kyc","kyc_submitted","kyc_approved","active","suspended","on_leave","exited"].map((s) => (
                          <SelectItem key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">UpGrid Driver ID</Label>
                    <Input placeholder="e.g. D263669" value={editRider.driver_id} onChange={(e) => setEditRider({ ...editRider, driver_id: e.target.value })} className="font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Gig Company</Label>
                    <Select value={editRider.gig_company || "none"} onValueChange={(v) => setEditRider({ ...editRider, gig_company: v === "none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="Select company..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" className="italic text-muted-foreground">Unspecified</SelectItem>
                        {['Zomato', 'Swiggy', 'Zepto', 'Blinkit', 'Rapido', 'Uber', 'Ola', 'Other'].map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Onboarding Date</Label>
                    <Input
                      type="date"
                      value={editRider.created_at}
                      max={format(new Date(), "yyyy-MM-dd")}
                      onChange={(e) => setEditRider({ ...editRider, created_at: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label className="text-xs text-muted-foreground">Admin Notes (Audit Trail)</Label>
                    <Textarea 
                      placeholder="Enter internal notes, audit trail info, or handover details..." 
                      value={editRider.admin_notes} 
                      onChange={(e) => setEditRider({ ...editRider, admin_notes: e.target.value })}
                      rows={2}
                    />
                  </div>
                </div>
              )}
            </section>

            <Separator />

            {/* KYC Info */}
            {(kyc || isEditing) ? (
              <>
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4" /> KYC Details
                    </h3>
                    {!isEditing && kyc && <StatusBadge status={kyc.kyc_status} />}
                    {isEditing && editKyc && (
                      <Select value={editKyc.kyc_status} onValueChange={(v) => setEditKyc({ ...editKyc, kyc_status: v })}>
                        <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="submitted">Submitted</SelectItem>
                          <SelectItem value="approved">Approved</SelectItem>
                          <SelectItem value="rejected">Rejected</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  {!isEditing || !editKyc ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                      <InfoRow label="Aadhaar Number" value={kyc?.aadhaar_number} />
                      <InfoRow label="PAN Number" value={kyc?.pan_number} />
                      <InfoRow label="Local Address" value={kyc?.address_local} />
                      <InfoRow label="Village Address" value={kyc?.address_village} />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Aadhaar Number</Label>
                        <Input placeholder="12-digit" value={editKyc.aadhaar_number} onChange={(e) => setEditKyc({ ...editKyc, aadhaar_number: e.target.value.replace(/\D/g, "").slice(0, 12) })} inputMode="numeric" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">PAN Number</Label>
                        <Input placeholder="ABCDE1234F" value={editKyc.pan_number} onChange={(e) => setEditKyc({ ...editKyc, pan_number: e.target.value.toUpperCase().slice(0, 10) })} className="font-mono" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Local Address</Label>
                        <Input value={editKyc.address_local} onChange={(e) => setEditKyc({ ...editKyc, address_local: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Village / Permanent Address</Label>
                        <Input value={editKyc.address_village} onChange={(e) => setEditKyc({ ...editKyc, address_village: e.target.value })} />
                      </div>
                    </div>
                  )}
                </section>

                <Separator />

                {/* References */}
                <section>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4" /> References
                  </h3>
                  {!isEditing || !editKyc ? (
                    <div className="grid gap-2">
                      {[
                        { name: kyc?.ref1_name, phone: kyc?.ref1_phone },
                        { name: kyc?.ref2_name, phone: kyc?.ref2_phone },
                        { name: kyc?.ref3_name, phone: kyc?.ref3_phone },
                      ].map((ref, i) => (
                        <div key={i} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                          <span className="font-medium">{ref.name || `Reference ${i + 1}`}</span>
                          <span className="text-muted-foreground">{ref.phone || "—"}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {([1, 2, 3] as const).map((n) => (
                        <div key={n} className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Ref {n} — Name</Label>
                            <Input
                              placeholder={`Reference ${n} name`}
                              value={editKyc[`ref${n}_name` as keyof typeof editKyc]}
                              onChange={(e) => setEditKyc({ ...editKyc, [`ref${n}_name`]: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Ref {n} — Phone</Label>
                            <Input
                              placeholder="10-digit"
                              inputMode="numeric"
                              value={editKyc[`ref${n}_phone` as keyof typeof editKyc]}
                              onChange={(e) => setEditKyc({ ...editKyc, [`ref${n}_phone`]: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <Separator />

                {/* Documents */}
                <section>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                    <FileText className="h-4 w-4" /> Documents
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {getDocs().map((doc) => {
                      const loading = !!kycDocRawUrls && !signedDocUrls;
                      const hasRaw = (() => {
                        const k = data?.kyc;
                        if (!k) return false;
                        const map: Record<string, string | null | undefined> = {
                          Photo: k.photo_url,
                          "Aadhaar Front": k.aadhaar_front_url,
                          "Aadhaar Back": k.aadhaar_back_url,
                          "PAN Card": k.pan_url,
                          PCC: k.pcc_url,
                        };
                        return !!map[doc.label];
                      })();
                      const url = doc.url;
                      return (
                        <button
                          key={doc.label}
                          disabled={!url}
                          onClick={() => url && setLightboxUrl(url)}
                          className={`group relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
                            url
                              ? "border-primary/30 hover:border-primary hover:bg-primary/5 cursor-pointer"
                              : "border-muted opacity-50 cursor-not-allowed"
                          }`}
                        >
                          {loading && hasRaw ? (
                            <>
                              <Loader2 className="h-8 w-8 text-muted mb-1 animate-spin" />
                              <span className="text-xs text-muted-foreground">{doc.label}</span>
                            </>
                          ) : url ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt={doc.label} className="h-16 w-16 rounded object-cover mb-2" />
                              <span className="text-xs font-medium text-primary group-hover:underline">{doc.label}</span>
                              <Eye className="absolute top-2 right-2 h-3.5 w-3.5 text-primary/60 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </>
                          ) : (
                            <>
                              <CreditCard className="h-8 w-8 text-muted mb-1" />
                              <span className="text-xs text-muted-foreground">{doc.label}</span>
                              <span className="text-[10px] text-muted-foreground">Not uploaded</span>
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                <ShieldCheck className="h-10 w-10 text-muted-foreground/40" />
                <p className="font-medium">No KYC data submitted</p>
                <p className="text-xs">Click &quot;Edit Profile&quot; to add KYC details.</p>
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB 2: Vehicle & Battery ═══ */}
        {activeTab === "vehicle" && (
          <div className="space-y-8">
            {/* Vehicle */}
            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <Truck className="h-4 w-4" /> Assigned Vehicle
              </h3>
              {vehicle ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                    <InfoRow label="Vehicle ID" value={vehicle.vehicle_id} />
                    <InfoRow label="Chassis Number" value={vehicle.chassis_number} />
                    <InfoRow label="Assigned" value={vehicle.assigned_at ? format(new Date(vehicle.assigned_at), "dd MMM yyyy") : null} />
                    <InfoRow label="Status" value={vehicle.status} />
                  </div>
                  
                  {/* Read-only Handover Checklist */}
                  {assignmentChecklist && (
                    <div className="rounded-lg border bg-slate-50/50 p-4">
                      <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <ClipboardCheck className="h-4 w-4" /> Assignment Handover Condition
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-2 gap-x-4 mb-4">
                        {HANDOVER_ITEMS.map(item => {
                          const boolVal = assignmentChecklist[item.key as keyof HandoverChecklist];
                          return (
                            <div key={item.key} className="flex items-center gap-1.5 text-sm">
                              {boolVal ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-500" />
                              )}
                              <span className={boolVal ? "text-foreground" : "text-muted-foreground line-through"}>
                                {item.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm mt-3 pt-3 border-t">
                        <div>
                          <span className="text-muted-foreground">Odometer:</span>{" "}
                          <span className="font-medium">{assignmentChecklist.odometer_reading || "—"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Motor No:</span>{" "}
                          <span className="font-medium">{assignmentChecklist.motor_number || "—"}</span>
                        </div>
                      </div>
                      {assignmentChecklist.notes && (
                        <div className="text-sm mt-3 pt-3 border-t">
                          <span className="text-muted-foreground block mb-1">Notes:</span>
                          <span className="text-foreground">{assignmentChecklist.notes}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <Button 
                      variant="outline" 
                      className="gap-2 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                      disabled={unassignVehicleMutation.isPending}
                      onClick={() => unassignVehicleMutation.mutate()}
                    >
                      {unassignVehicleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                      Unassign Vehicle
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
                  <Truck className="h-10 w-10 text-muted-foreground/40" />
                  <p className="font-medium">No vehicle assigned</p>
                  <Button variant="outline" className="gap-2 mt-2" onClick={() => {
                    setAssignStep(1);
                    setAssignChecklist(DEFAULT_HANDOVER_FORM);
                    setSelectedVehicleId("");
                    setAssignVehicleIdInput("");
                    setAssignVehicleOpen(true);
                  }}>
                    <Plus className="h-4 w-4" /> Assign Vehicle
                  </Button>
                </div>
              )}
            </section>

            <Separator />


            {/* Upgrid Swap Access */}
            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-2">
                <Zap className="h-4 w-4" /> Upgrid Swap Access (Driver ID)
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Link the rider&apos;s Upgrid account ID to enable automated and manual block/unblock controls.
              </p>
              {rider?.driver_id && (
                <p className="text-xs text-emerald-600 font-medium mb-3 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Currently linked: <span className="font-mono ml-1">{rider.driver_id}</span>
                </p>
              )}
              {!rider?.driver_id && (
                <p className="text-xs text-amber-600 mb-3 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  No Upgrid Driver ID linked yet
                </p>
              )}
              <div className="flex items-center gap-3 max-w-md">
                <Input
                  placeholder={rider?.driver_id ? `Current: ${rider.driver_id}` : "Enter Upgrid Driver ID (e.g. D263669)"}
                  value={upgridInput}
                  onChange={(e) => setUpgridInput(e.target.value)}
                />
                <Button
                  disabled={!upgridInput.trim() || saveUpgridMutation.isPending}
                  onClick={() => saveUpgridMutation.mutate()}
                  className="gap-2 shrink-0"
                >
                  {saveUpgridMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {rider?.driver_id ? "Update ID" : "Save ID"}
                </Button>
              </div>
              
              {/* Manual Control for Block/Unblock could go here when implemented natively on rider table */}
            </section>
          </div>
        )}

        {/* ═══ TAB 3: Payments ═══ */}
        {activeTab === "payments" && (() => {
          const walletBal  = rider.wallet_balance ?? 0;
          const rate       = ((rider as Record<string, unknown>).daily_deduction_rate as number) ?? 230;
          const isNegative = walletBal < 0;
          const daysOwed   = isNegative ? Math.ceil(Math.abs(walletBal) / rate) : 0;
          const daysLeft   = !isNegative ? Math.floor(walletBal / rate) : 0;

          const PLAN_TYPE_CONFIG: Record<string, { label: string; className: string }> = {
            security_deposit:  { label: "Security Deposit",  className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
            onboarding:        { label: "Onboarding Fee",    className: "bg-amber-50 text-amber-700 border-amber-200" },
            verification:      { label: "Verification Fee",  className: "bg-amber-50 text-amber-700 border-amber-200" },
            daily:             { label: "Daily",             className: "bg-slate-100 text-slate-700 border-slate-200" },
            weekly:            { label: "Weekly",            className: "bg-slate-100 text-slate-700 border-slate-200" },
            monthly:           { label: "Monthly",           className: "bg-slate-100 text-slate-700 border-slate-200" },
            service:           { label: "Service",           className: "bg-blue-50 text-blue-700 border-blue-200" },
            admin_adjustment:  { label: "Adjustment",        className: "bg-purple-50 text-purple-700 border-purple-200" },
          };

          return (
            <div className="space-y-6">
              {/* ── Wallet Summary Card ── */}
              <div className={`rounded-xl border-2 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${
                isNegative ? "border-red-300 bg-red-50" : walletBal === 0 ? "border-orange-300 bg-orange-50" : "border-emerald-300 bg-emerald-50"
              }`}>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Wallet Balance</p>
                  <p className={`text-4xl font-black ${isNegative ? "text-red-600" : walletBal === 0 ? "text-orange-600" : "text-emerald-700"}`}>
                    ₹{walletBal.toLocaleString()}
                  </p>
                  {isNegative ? (
                    <p className="text-sm font-semibold text-red-700 mt-1">
                      🔴 Owes {daysOwed} day{daysOwed !== 1 ? "s" : ""} of rent — swap blocked until cleared
                    </p>
                  ) : walletBal === 0 ? (
                    <p className="text-sm text-orange-700 mt-1">⚠️ Wallet empty — swap will be blocked after next deduction</p>
                  ) : (
                    <p className="text-sm text-emerald-700 mt-1">✅ ~{daysLeft} day{daysLeft !== 1 ? "s" : ""} remaining at ₹{rate}/day</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" className="gap-1.5 bg-[#0D2D6B] hover:bg-[#0D2D6B]/90" onClick={() => setPaymentDrawerOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> Log Cash Payment
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setWalletAdjAmount(""); setWalletAdjReason(""); setWalletAdjOpen(true); }}>
                    <Pencil className="h-3.5 w-3.5" /> Adjust Wallet
                  </Button>
                </div>
              </div>

              {/* ── Payment Records ── */}
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                  <CreditCard className="h-4 w-4" /> Payment Records
                </h3>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-24 text-center text-muted-foreground text-sm">
                            No payment records found
                          </TableCell>
                        </TableRow>
                      ) : payments.map((p: PaymentRecord) => {
                        const typeKey = (p.plan_type ?? "").toLowerCase();
                        const typeCfg = PLAN_TYPE_CONFIG[typeKey] ?? {
                          label: (p.plan_type ?? "—").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
                          className: "bg-slate-100 text-slate-700 border-slate-200",
                        };
                        return (
                          <TableRow key={p.id}>
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                              {p.payment_date ? format(new Date(p.payment_date), "dd MMM yyyy") : "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={typeCfg.className}>
                                {typeCfg.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-semibold">₹{(p.amount || 0).toLocaleString()}</TableCell>
                            <TableCell className="max-w-[220px]">
                              <ExpandableNote note={p.notes} />
                            </TableCell>
                            <TableCell>
                              {(() => {
                                const m = (p.payment_method ?? "").toLowerCase();
                                const METHOD_MAP: Record<string, { icon: string; label: string; cls: string }> = {
                                  cash:     { icon: "💵", label: "Cash",     cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
                                  upi:      { icon: "📲", label: "UPI",      cls: "bg-blue-50 text-blue-700 border-blue-200" },
                                  razorpay: { icon: "💳", label: "Razorpay", cls: "bg-purple-50 text-purple-700 border-purple-200" },
                                  online:   { icon: "🌐", label: "Online",   cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
                                };
                                const cfg = METHOD_MAP[m];
                                if (!m || !cfg) return <span className="text-xs text-muted-foreground">—</span>;
                                return (
                                  <Badge variant="outline" className={`gap-1 text-xs font-semibold ${cfg.cls}`}>
                                    {cfg.icon} {cfg.label}
                                  </Badge>
                                );
                              })()}
                            </TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                p.status === "paid" ? "bg-emerald-100 text-emerald-700" :
                                p.status === "held" ? "bg-indigo-100 text-indigo-700" :
                                "bg-red-100 text-red-700"
                              }`}>
                                {p.status === "paid" ? "Paid" : p.status === "held" ? "Held" : "Overdue"}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          );
        })()}



        {/* ═══ TAB 4: Service Requests ═══ */}
        {activeTab === "service" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-600">Service History</h3>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs border-[#0D2D6B]/20 text-[#0D2D6B] hover:bg-[#0D2D6B]/5"
                onClick={() => setServiceDialogOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" /> Log Service Request
              </Button>
            </div>
            {serviceRequests.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
                <Wrench className="h-10 w-10 text-muted-foreground/40" />
                <p className="font-medium">No service requests</p>
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Resolution Info</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {serviceRequests.map((sr: ServiceRequest) => {
                      return (
                        <TableRow key={sr.id}>
                          <TableCell className="text-sm capitalize font-medium">{sr.issue_description ?? "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                             {sr.parts_selected && Array.isArray(sr.parts_selected) && sr.parts_selected.length > 0 
                               ? `${sr.parts_selected.length} Part(s) Paid - ₹${sr.total_parts_cost}` 
                               : "General Service"}
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              sr.status === "resolved" ? "bg-emerald-100 text-emerald-700"
                                : sr.status === "in_progress" ? "bg-blue-100 text-blue-700"
                                : "bg-amber-100 text-amber-800"
                            }`}>
                              {sr.status}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {sr.created_at ? format(new Date(sr.created_at), "dd MMM") : "—"}
                          </TableCell>
                          <TableCell>
                            <ExpandableNote note={sr.resolution_notes} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}


      </div>

      {/* ═══ HARD DELETE RIDER DIALOG ═══ */}
      <Dialog open={hardDeleteOpen} onOpenChange={(open) => { if (!open) { setHardDeleteOpen(false); setHardDeleteConfirmName(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Permanently Delete Rider
            </DialogTitle>
            <DialogDescription>
              This will permanently erase <strong>{rider?.name}</strong> and all associated data —
              KYC records, payments, service requests, battery history, and deposits.
              <span className="block mt-2 font-semibold text-destructive">This cannot be undone.</span>
            </DialogDescription>
          </DialogHeader>
          <div className="py-3">
            <label htmlFor="hardDeleteConfirmName" className="text-sm font-medium">
              Type <span className="font-mono font-bold">{rider?.name}</span> to confirm
            </label>
            <Input
              id="hardDeleteConfirmName"
              placeholder="Rider's full name"
              value={hardDeleteConfirmName}
              onChange={(e) => setHardDeleteConfirmName(e.target.value)}
              className="mt-1.5"
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => { setHardDeleteOpen(false); setHardDeleteConfirmName(""); }}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={hardDeleteMutation.isPending || hardDeleteConfirmName.trim() !== rider?.name}
              onClick={() => hardDeleteMutation.mutate()}
              className="gap-2"
            >
              {hardDeleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ LOG SERVICE REQUEST DIALOG ═══ */}
      <Dialog open={serviceDialogOpen} onOpenChange={setServiceDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#0D2D6B]">
              <Wrench className="h-5 w-5" /> Log Service Request
            </DialogTitle>
            <DialogDescription>
              Create a new service request for <strong>{rider?.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="serviceType" className="text-xs font-bold uppercase tracking-wider text-slate-500">Issue Type</Label>
              <select
                id="serviceType"
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="general">General Service</option>
                <option value="puncture">Puncture / Tyre Issue</option>
                <option value="electrical">Electrical Issue</option>
                <option value="brake">Brake Issue</option>
                <option value="body_damage">Body Damage</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="serviceDesc" className="text-xs font-bold uppercase tracking-wider text-slate-500">Description *</Label>
              <Textarea
                id="serviceDesc"
                placeholder="Describe the issue or service needed..."
                value={serviceDesc}
                onChange={(e) => setServiceDesc(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setServiceDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-[#0D2D6B] hover:bg-[#0D2D6B]/90 gap-2"
              disabled={!serviceDesc.trim() || logServiceMutation.isPending}
              onClick={() => logServiceMutation.mutate()}
            >
              {logServiceMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
              Create Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ LIGHTBOX ═══ */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setLightboxUrl(null)}>
          <button className="absolute top-4 right-4 rounded-full bg-white/20 p-2 text-white hover:bg-white/40" onClick={() => setLightboxUrl(null)}>
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxUrl} alt="Document preview" className="max-h-[85vh] max-w-[90vw] rounded-lg shadow-2xl object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* ═══ SWAP ACTION DIALOG ═══ */}
      <Dialog open={swapActionOpen} onOpenChange={setSwapActionOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {swapActionType === "block" ? (
                <><AlertTriangle className="h-5 w-5 text-orange-500" /> Block Swap Access</>
              ) : (
                <><RefreshCw className="h-5 w-5 text-emerald-500" /> Unblock Swap Access</>
              )}
            </DialogTitle>
            <DialogDescription>
              {swapActionType === "block" 
                ? <>Are you sure you want to block <strong>{rider.name}</strong>? They will instantly lose Upgrid swapping capabilities and be marked as Suspended.</>
                : <>Are you sure you want to unblock <strong>{rider.name}</strong>? Their Upgrid swapping capabilities will be restored and they will be marked Active.</>}
            </DialogDescription>
          </DialogHeader>
          
          {swapActionType === "block" && (
            <div className="py-3">
              <Label htmlFor="blockReason">Reason for Blocking</Label>
              <div className="flex flex-wrap gap-2 mt-1.5 mb-3">
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs bg-slate-50" onClick={() => setSwapActionReason("Driver payment default")}>
                  Driver payment default
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs bg-slate-50" onClick={() => setSwapActionReason("Vehicle in hub")}>
                  Vehicle in hub
                </Button>
              </div>
              <Input
                id="blockReason"
                placeholder="e.g. Overdue payment, misconduct..."
                value={swapActionReason}
                onChange={(e) => setSwapActionReason(e.target.value)}
                autoFocus
              />
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button variant="ghost" onClick={() => setSwapActionOpen(false)}>Cancel</Button>
            <Button 
              className={`gap-2 text-white ${swapActionType === "block" ? "bg-orange-600 hover:bg-orange-700" : "bg-emerald-600 hover:bg-emerald-700"}`} 
              disabled={swapToggleMutation.isPending || (swapActionType === "block" && !swapActionReason.trim()) || !rider.driver_id} 
              onClick={() => swapToggleMutation.mutate()}
            >
              {swapToggleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (swapActionType === "block" ? <Ban className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />)}
              {swapActionType === "block" ? "Confirm Block" : "Confirm Unblock"}
            </Button>
          </DialogFooter>
          
           {!rider.driver_id && (
             <p className="text-sm text-red-500 text-center mt-2 font-medium">Please link an Upgrid Driver ID in the Vehicle tab first.</p>
           )}
        </DialogContent>
      </Dialog>

      {/* ═══ EXIT DIALOG ═══ */}
      <Dialog open={exitOpen} onOpenChange={setExitOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><LogOut className="h-5 w-5 text-red-500" /> Process Exit</DialogTitle>
            <DialogDescription>This will mark <strong>{rider.name}</strong> as exited and trigger the deposit refund workflow. {vehicle ? "Please complete the return handover checklist." : ""}</DialogDescription>
          </DialogHeader>
          
          {vehicle && (
            <div className="grid md:grid-cols-2 gap-6 py-4">
              {/* Original Handover Condition */}
              <div className="rounded-lg border bg-slate-50/50 p-4 space-y-4 opacity-70 pointer-events-none">
                <h4 className="font-semibold text-sm flex items-center gap-2 text-muted-foreground">
                  <ClipboardCheck className="h-4 w-4" /> Assignment Condition (Recorded: {vehicle.assigned_at ? format(new Date(vehicle.assigned_at), "dd MMM yyyy") : "—"})
                </h4>
                {assignmentChecklist ? (
                  <HandoverChecklistForm value={assignmentChecklist as unknown as HandoverFormState} disabled={true} />
                ) : (
                  <div className="text-sm text-muted-foreground flex items-center justify-center h-40">
                    No assignment checklist found.
                  </div>
                )}
              </div>

              {/* Current Return Condition */}
              <div className="rounded-lg border bg-white p-4 space-y-4">
                <h4 className="font-semibold text-sm flex items-center gap-2 text-primary">
                  <ClipboardCheck className="h-4 w-4" /> Current Return Condition
                </h4>
                <div className="text-xs text-muted-foreground mb-4 bg-muted/50 p-2 rounded-md">
                  Compare with the assignment condition to spot missing items or discrepancies. Mark the items that are currently present/functional.
                </div>
                <HandoverChecklistForm value={returnChecklist} onChange={setReturnChecklist} />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 mt-4 border-t pt-4">
            <Button variant="ghost" onClick={() => setExitOpen(false)}>Cancel</Button>
            <Button 
              variant="destructive" 
              className="gap-2 bg-red-600 hover:bg-red-700" 
              disabled={processExitMutation.isPending} 
              onClick={() => processExitMutation.mutate()}
            >
              {processExitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              Confirm Exit & Record Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ LEAVE DIALOG ═══ */}
      <Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-purple-700">
              <Calendar className="h-5 w-5" />
              {leaveAction === "start" ? "Put Rider on Leave" : "Return Rider from Leave"}
            </DialogTitle>
            <DialogDescription>
              {leaveAction === "start"
                ? `Billing will be paused for ${rider.name} while on leave. Battery swap access will be blocked.`
                : `${rider.name} will be returned to ${(rider.wallet_balance ?? 0) > 0 ? "active" : "suspended"} status. Billing resumes tomorrow.`}
            </DialogDescription>
          </DialogHeader>
          {leaveAction === "start" && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Reason *</label>
                <Textarea
                  placeholder="e.g. Vehicle in workshop for repair, rider sick leave..."
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Expected Return Date (optional)</label>
                <Input type="date" value={leaveExpected} onChange={(e) => setLeaveExpected(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button variant="ghost" onClick={() => setLeaveDialogOpen(false)}>Cancel</Button>
            <Button
              className={leaveAction === "start" ? "bg-purple-600 hover:bg-purple-700" : "bg-emerald-600 hover:bg-emerald-700"}
              disabled={leaveMutation.isPending || (leaveAction === "start" && !leaveReason.trim())}
              onClick={() => leaveMutation.mutate()}
            >
              {leaveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {leaveAction === "start" ? "Confirm — Pause Billing" : "Confirm — Resume Billing"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ WALLET ADJUSTMENT DIALOG ═══ */}
      <Dialog open={walletAdjOpen} onOpenChange={setWalletAdjOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" /> Adjust Wallet Balance
            </DialogTitle>
            <DialogDescription>
              Current balance: <strong>₹{(rider.wallet_balance ?? 0).toLocaleString()}</strong>.
              Use a positive number to add credit, negative to deduct.
              A mandatory reason is required for audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Adjustment Amount (₹) *</label>
              <Input
                type="number"
                placeholder="e.g. +230 or -460"
                value={walletAdjAmount}
                onChange={(e) => setWalletAdjAmount(e.target.value)}
              />
              {walletAdjAmount && !isNaN(parseFloat(walletAdjAmount)) && (
                <p className="text-sm text-muted-foreground">
                  New balance will be: <strong className={
                    ((rider.wallet_balance ?? 0) + parseFloat(walletAdjAmount)) < 0 ? "text-red-600" : "text-emerald-700"
                  }>₹{((rider.wallet_balance ?? 0) + parseFloat(walletAdjAmount)).toLocaleString()}</strong>
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason *</label>
              <Textarea
                placeholder="e.g. Vehicle breakdown on Apr 15, waiving 1 day charge..."
                value={walletAdjReason}
                onChange={(e) => setWalletAdjReason(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button variant="ghost" onClick={() => setWalletAdjOpen(false)}>Cancel</Button>
            <Button
              disabled={walletAdjMutation.isPending || !walletAdjAmount || !walletAdjReason.trim()}
              onClick={() => walletAdjMutation.mutate()}
              className="bg-[#0D2D6B] hover:bg-[#0D2D6B]/90"
            >
              {walletAdjMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Apply Adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ CASH PAYMENT DRAWER ═══ */}
      <Sheet open={paymentDrawerOpen} onOpenChange={setPaymentDrawerOpen}>
        <LogCashPaymentDrawer
          riderId={riderId}
          riderName={rider.name}
          adminId={adminId}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["rider-full", riderId] });
            queryClient.invalidateQueries({ queryKey: ["payments"] });
            setPaymentDrawerOpen(false);
          }}
        />
      </Sheet>

      {/* ═══ ASSIGN VEHICLE DIALOG ═══ */}
      <Dialog
        open={assignVehicleOpen}
        onOpenChange={(open) => {
          setAssignVehicleOpen(open);
          if (open) {
            setAssignStep(1);
            setSelectedVehicleId("");
            setAssignVehicleIdInput("");
            setComboboxOpen(false);
            setAssignChecklist(DEFAULT_HANDOVER_FORM);
          } else {
            setAssignStep(1);
            setSelectedVehicleId("");
            setAssignVehicleIdInput("");
            setComboboxOpen(false);
          }
        }}
      >
        <DialogContent className={`transition-all ${assignStep === 2 ? 'sm:max-w-2xl' : 'sm:max-w-md'} max-h-[90vh] overflow-y-auto`}>
          <DialogHeader>
            <DialogTitle>{assignStep === 1 ? "Assign Vehicle (Step 1 of 2)" : "Handover Condition Checklist (Step 2 of 2)"}</DialogTitle>
            <DialogDescription>
              {assignStep === 1 
                ? `Select an available vehicle from any hub.`
                : `Tick the items that are present/functional at the time of handing over the vehicle.`}
            </DialogDescription>
          </DialogHeader>

          {assignStep === 1 ? (
            <div className="space-y-4 py-4">
              {isLoadingVehicles ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : availableVehicles?.length === 0 ? (
                <div className="rounded-md border p-4 text-center text-sm text-muted-foreground">
                  No vehicles are currently available in the fleet.
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Vehicle ID</label>
                  {/* ── Combobox: type to filter, click to select ── */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Type to search (e.g. VFEL1001)…"
                      value={assignVehicleIdInput}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 pr-8 text-sm font-mono ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring placeholder:font-sans placeholder:text-muted-foreground"
                      autoComplete="off"
                      onChange={(e) => {
                        setAssignVehicleIdInput(e.target.value);
                        setSelectedVehicleId(""); // clear selection when typing
                        setComboboxOpen(true);
                      }}
                      onFocus={() => setComboboxOpen(true)}
                      onBlur={() => setTimeout(() => setComboboxOpen(false), 150)}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-slate-700 transition-colors"
                      onMouseDown={(e) => { e.preventDefault(); setComboboxOpen((o) => !o); }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>

                    {comboboxOpen && (() => {
                      const query = assignVehicleIdInput.trim().toUpperCase();
                      const matches = (sortedAvailableVehicles as { id: string; vehicle_id?: string; chassis_number: string; hubs?: { name: string } }[]).filter(
                        (v) => !query ||
                          (v.vehicle_id || "").toUpperCase().includes(query) ||
                          v.chassis_number.toUpperCase().includes(query) ||
                          (v.hubs?.name || "").toUpperCase().includes(query)
                      );
                      if (!matches.length) return null;
                      return (
                        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-xl max-h-52 overflow-y-auto ring-1 ring-black/5">
                          {matches.map((v) => (
                            <button
                              key={v.id}
                              type="button"
                              className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-slate-50 transition-colors ${
                                selectedVehicleId === v.id ? "bg-primary/5 text-primary font-semibold" : ""
                              }`}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setSelectedVehicleId(v.id);
                                setAssignVehicleIdInput(v.vehicle_id || v.chassis_number.slice(-6));
                                setComboboxOpen(false);
                              }}
                            >
                              <span className="font-mono font-medium">{v.vehicle_id || v.chassis_number.slice(-6)}</span>
                              <span className="text-xs text-muted-foreground">{v.hubs?.name || "No Hub"}</span>
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                  {selectedVehicleId && (() => {
                    const v = (sortedAvailableVehicles as { id: string; vehicle_id?: string; chassis_number: string; hubs?: { name: string } }[]).find(x => x.id === selectedVehicleId);
                    return v ? (
                      <p className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                        Selected: {v.vehicle_id || v.chassis_number.slice(-6)} — {v.hubs?.name || "No Hub"} · Chassis: {v.chassis_number}
                      </p>
                    ) : null;
                  })()}
                  {!selectedVehicleId && assignVehicleIdInput.trim() && (
                    <p className="text-xs text-amber-600">No match yet — keep typing or pick from the list.</p>
                  )}
                </div>
              )}
            </div>
          ) : (
             <div className="pt-2 pb-6">
                <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-md mb-6 text-sm flex gap-3">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
                  <p>Check the vehicle condition thoroughly. This state will be saved and verified when the rider returns the vehicle.</p>
                </div>
                <HandoverChecklistForm value={assignChecklist} onChange={setAssignChecklist} />
             </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 mt-4 border-t pt-4">
            <Button variant="ghost" onClick={() => setAssignVehicleOpen(false)}>Cancel</Button>
            {assignStep === 1 ? (
              <Button
                className="gap-2"
                disabled={!selectedVehicleId}
                onClick={() => {
                  if (!selectedVehicleId) {
                    toast.error("Please select a vehicle from the list.");
                    return;
                  }
                  setAssignStep(2);
                }}
              >
                Next Step <ArrowLeft className="h-4 w-4 rotate-180" />
              </Button>
            ) : (
              <div className="flex w-full sm:w-auto gap-2">
                 <Button variant="outline" onClick={() => setAssignStep(1)}>Back</Button>
                 <Button
                  className="gap-2"
                  disabled={assignVehicleMutation.isPending}
                  onClick={() => assignVehicleMutation.mutate(selectedVehicleId)}
                 >
                  {assignVehicleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
                  Confirm Handover & Assign
                 </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reset Access Code Confirmation Dialog ─────────────────────────── */}
      <Dialog open={resetPinOpen} onOpenChange={setResetPinOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <ShieldCheck className="h-5 w-5" />
              Reset Access Code
            </DialogTitle>
            <DialogDescription className="pt-2 space-y-2">
              <span className="block">
                This will clear{" "}
                <span className="font-semibold text-foreground">{rider?.name ?? "this rider"}</span>
                &apos;s current access code and unlock the account if it was locked.
              </span>
              <span className="block text-amber-700 font-medium">
                On their next login, they will be prompted to set a new 6-digit access code.
              </span>
              <span className="block text-sm text-muted-foreground">
                Use this when a rider forgets their code or their account has been locked due to too many failed attempts.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="ghost" onClick={() => setResetPinOpen(false)}>
              Cancel
            </Button>
            <Button
              className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
              disabled={resetPinMutation.isPending}
              onClick={() => resetPinMutation.mutate()}
            >
              {resetPinMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              Reset Access Code
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
