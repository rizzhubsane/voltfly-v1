"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/adminFetch";
import {
  UserPlus,
  Phone,
  Building2,
  Fingerprint,
  Loader2,
  ChevronDown,
  ChevronUp,
  FileText,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Hub } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RiderFormValues {
  name: string;
  phone_1: string;
  phone_2: string;
  hub_id: string;
  driver_id: string;
  status: string;
}

interface KycFormValues {
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
}

interface AddRiderDrawerProps {
  isSuperAdmin: boolean;
  defaultHubId: string | null;
  onSuccess: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "pending_kyc", label: "Pending KYC" },
  { value: "kyc_approved", label: "KYC Approved" },
];

const EMPTY_RIDER: RiderFormValues = {
  name: "",
  phone_1: "",
  phone_2: "",
  hub_id: "",
  driver_id: "",
  status: "pending_kyc",
};

const EMPTY_KYC: KycFormValues = {
  aadhaar_number: "",
  pan_number: "",
  address_local: "",
  address_village: "",
  ref1_name: "",
  ref1_phone: "",
  ref2_name: "",
  ref2_phone: "",
  ref3_name: "",
  ref3_phone: "",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function AddRiderDrawer({ isSuperAdmin, defaultHubId, onSuccess }: AddRiderDrawerProps) {
  const queryClient = useQueryClient();

  const [rider, setRider] = useState<RiderFormValues>({ ...EMPTY_RIDER, hub_id: defaultHubId || "" });
  const [kyc, setKyc] = useState<KycFormValues>({ ...EMPTY_KYC });
  const [kycExpanded, setKycExpanded] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof RiderFormValues, string>>>({});

  // Fetch hubs for the hub selector
  const { data: hubs = [] } = useQuery<Hub[]>({
    queryKey: ["hubs-for-add-rider"],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/payments?type=hubs");
      if (!res.ok) return [];
      const json = await res.json();
      return json.hubs ?? [];
    },
    enabled: isSuperAdmin,
  });

  const hasKycData = Object.values(kyc).some((v) => v.trim() !== "");

  const validate = (): boolean => {
    const e: Partial<Record<keyof RiderFormValues, string>> = {};
    if (!rider.name.trim()) e.name = "Full name is required";
    if (!rider.phone_1.trim()) {
      e.phone_1 = "Primary phone is required";
    } else if (!/^[6-9]\d{9}$/.test(rider.phone_1.trim())) {
      e.phone_1 = "Enter a valid 10-digit Indian mobile number";
    }
    if (rider.phone_2.trim() && !/^[6-9]\d{9}$/.test(rider.phone_2.trim())) {
      e.phone_2 = "Enter a valid 10-digit number";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const addMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        name: rider.name.trim(),
        phone_1: rider.phone_1.trim(),
        phone_2: rider.phone_2.trim() || null,
        hub_id: rider.hub_id || null,
        driver_id: rider.driver_id.trim() || null,
        status: rider.status,
      };
      if (hasKycData) payload.kyc = kyc;

      const res = await adminFetch("/api/admin/riders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error || "Failed to add rider");
      }
      return res.json();
    },
    onSuccess: async () => {
      toast.success(`${rider.name} added successfully`);
      await queryClient.invalidateQueries({ queryKey: ["riders"] });
      setRider({ ...EMPTY_RIDER, hub_id: defaultHubId || "" });
      setKyc({ ...EMPTY_KYC });
      setKycExpanded(false);
      setErrors({});
      onSuccess();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    addMutation.mutate();
  };

  return (
    <SheetContent className="sm:max-w-md overflow-y-auto">
      <SheetHeader className="pb-6">
        <SheetTitle className="text-[#0D2D6B] flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Add New Rider
        </SheetTitle>
        <SheetDescription>
          Manually register a rider. KYC document uploads can be done later from the rider detail page.
        </SheetDescription>
      </SheetHeader>

      <form onSubmit={onSubmit} className="space-y-5">

        {/* ── Name ─────────────────────────────────────────────────────── */}
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Full Name <span className="text-destructive">*</span>
          </Label>
          <Input
            placeholder="e.g. Rahul Sharma"
            value={rider.name}
            onChange={(e) => setRider((p) => ({ ...p, name: e.target.value }))}
            className="h-10 rounded-xl border-slate-200"
          />
          {errors.name && <p className="text-xs font-medium text-destructive">{errors.name}</p>}
        </div>

        {/* ── Primary Phone ────────────────────────────────────────────── */}
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Primary Phone <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="10-digit mobile number"
              value={rider.phone_1}
              onChange={(e) =>
                setRider((p) => ({ ...p, phone_1: e.target.value.replace(/\D/g, "").slice(0, 10) }))
              }
              className="pl-9 h-10 rounded-xl border-slate-200"
              inputMode="numeric"
            />
          </div>
          {errors.phone_1 && <p className="text-xs font-medium text-destructive">{errors.phone_1}</p>}
        </div>

        {/* ── Alternate Phone ───────────────────────────────────────────── */}
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Alternate Phone
          </Label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Optional"
              value={rider.phone_2}
              onChange={(e) =>
                setRider((p) => ({ ...p, phone_2: e.target.value.replace(/\D/g, "").slice(0, 10) }))
              }
              className="pl-9 h-10 rounded-xl border-slate-200"
              inputMode="numeric"
            />
          </div>
          {errors.phone_2 && <p className="text-xs font-medium text-destructive">{errors.phone_2}</p>}
        </div>

        {/* ── Hub (super admin only) ───────────────────────────────────── */}
        {isSuperAdmin && (
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Building2 className="h-3 w-3" /> Hub
            </Label>
            <Select
              value={rider.hub_id || "none"}
              onValueChange={(v) => setRider((p) => ({ ...p, hub_id: v === "none" ? "" : v }))}
            >
              <SelectTrigger className="h-10 rounded-xl border-slate-200 bg-white">
                <SelectValue placeholder="Assign to hub..." />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="none" className="italic text-muted-foreground rounded-lg">
                  No Hub Assigned
                </SelectItem>
                {hubs.map((h) => (
                  <SelectItem key={h.id} value={h.id} className="rounded-lg">
                    {h.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* ── UpGrid Driver ID ─────────────────────────────────────────── */}
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Fingerprint className="h-3 w-3" /> UpGrid Driver ID
          </Label>
          <div className="relative">
            <Fingerprint className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="e.g. D263669"
              value={rider.driver_id}
              onChange={(e) => setRider((p) => ({ ...p, driver_id: e.target.value }))}
              className="font-mono pl-9 h-10 rounded-xl border-slate-200"
            />
          </div>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">
            Required for BatterySmart battery swap access
          </p>
        </div>

        {/* ── Initial Status ───────────────────────────────────────────── */}
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Initial Status
          </Label>
          <Select
            value={rider.status}
            onValueChange={(v) => setRider((p) => ({ ...p, status: v }))}
          >
            <SelectTrigger className="h-10 rounded-xl border-slate-200 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="rounded-lg">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* ── KYC Details (collapsible) ────────────────────────────────── */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setKycExpanded((p) => !p)}
            className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <FileText className="h-4 w-4 text-slate-500" />
              KYC Details
              <span className="text-[10px] font-normal text-muted-foreground uppercase tracking-wide">
                Optional
              </span>
              {hasKycData && (
                <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                  Filled
                </span>
              )}
            </span>
            {kycExpanded ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>

          {kycExpanded && (
            <div className="p-4 space-y-4 border-t border-slate-100 bg-white animate-in fade-in slide-in-from-top-1 duration-150">
              <p className="text-xs text-muted-foreground">
                Document photos (Aadhaar, PAN, selfie, etc.) can be uploaded by the rider via the app or by admin from the rider detail page.
              </p>

              {/* Aadhaar + PAN */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-600">Aadhaar Number</Label>
                  <Input
                    placeholder="12-digit"
                    value={kyc.aadhaar_number}
                    onChange={(e) =>
                      setKyc((p) => ({ ...p, aadhaar_number: e.target.value.replace(/\D/g, "").slice(0, 12) }))
                    }
                    className="h-9 rounded-lg text-sm"
                    inputMode="numeric"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-600">PAN Number</Label>
                  <Input
                    placeholder="ABCDE1234F"
                    value={kyc.pan_number}
                    onChange={(e) =>
                      setKyc((p) => ({ ...p, pan_number: e.target.value.toUpperCase().slice(0, 10) }))
                    }
                    className="h-9 rounded-lg text-sm font-mono"
                  />
                </div>
              </div>

              {/* Addresses */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600">Current / Local Address</Label>
                <Input
                  placeholder="Current address"
                  value={kyc.address_local}
                  onChange={(e) => setKyc((p) => ({ ...p, address_local: e.target.value }))}
                  className="h-9 rounded-lg text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600">Permanent / Village Address</Label>
                <Input
                  placeholder="Village / permanent address"
                  value={kyc.address_village}
                  onChange={(e) => setKyc((p) => ({ ...p, address_village: e.target.value }))}
                  className="h-9 rounded-lg text-sm"
                />
              </div>

              {/* References */}
              <div className="space-y-2.5">
                <Label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                  <Users className="h-3 w-3" /> References (up to 3)
                </Label>
                {([1, 2, 3] as const).map((n) => (
                  <div key={n} className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder={`Ref ${n} — Name`}
                      value={kyc[`ref${n}_name`]}
                      onChange={(e) => setKyc((p) => ({ ...p, [`ref${n}_name`]: e.target.value }))}
                      className="h-9 rounded-lg text-sm"
                    />
                    <Input
                      placeholder={`Ref ${n} — Phone`}
                      value={kyc[`ref${n}_phone`]}
                      onChange={(e) =>
                        setKyc((p) => ({ ...p, [`ref${n}_phone`]: e.target.value.replace(/\D/g, "").slice(0, 10) }))
                      }
                      className="h-9 rounded-lg text-sm"
                      inputMode="numeric"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Submit / Cancel ──────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 pt-4 border-t border-slate-100">
          <Button
            type="submit"
            className="w-full h-12 text-base font-bold bg-[#0D2D6B] hover:bg-[#0D2D6B]/90 rounded-xl shadow-lg shadow-blue-900/10 transition-all active:scale-[0.98]"
            disabled={addMutation.isPending}
          >
            {addMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding Rider...
              </>
            ) : (
              "Add Rider"
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full h-11 text-slate-600 rounded-xl border-slate-200 hover:bg-slate-50"
            onClick={onSuccess}
          >
            Cancel
          </Button>
        </div>
      </form>
    </SheetContent>
  );
}
