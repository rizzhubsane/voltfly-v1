"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/adminFetch";
import {
  IndianRupee,
  UserPlus,
  Calendar,
  MapPin,
  Loader2,
  AlertTriangle,
  CheckCircle2,
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

import { PRICING } from "@/lib/pricingConstants";

// Re-export from shared constants for clarity within this component
const SECURITY_DEPOSIT = PRICING.SECURITY_DEPOSIT;
const ONBOARDING_FEES = PRICING.ONBOARDING_FEES;
const FULL_ONBOARDING = PRICING.FULL_ONBOARDING;
const MINIMUM_CASH = PRICING.MINIMUM_ONBOARD_CASH;

const GRANT_OPTIONS = [
  { value: "3", label: "3 Days" },
  { value: "7", label: "1 Week (7 Days)" },
  { value: "14", label: "2 Weeks (14 Days)" },
  { value: "30", label: "1 Month (30 Days)" },
];

interface Hub {
  id: string;
  name: string;
}

interface OfflineOnboardDrawerProps {
  adminId: string;
  rider: { id: string; name: string; driver_id?: string | null } | null;
  onSuccess: () => void;
}

export function OfflineOnboardDrawer({ adminId, rider, onSuccess }: OfflineOnboardDrawerProps) {
  const queryClient = useQueryClient();
  const [cashReceived, setCashReceived] = useState("");
  const [grantDays, setGrantDays] = useState("7");
  const [hubId, setHubId] = useState("");

  const cash = Number(cashReceived) || 0;
  const rentalCredit = Math.max(0, cash - SECURITY_DEPOSIT - ONBOARDING_FEES);
  const outstanding = Math.max(0, FULL_ONBOARDING - cash);
  const isValid = cash >= MINIMUM_CASH && rider !== null;

  // Fetch hubs
  const { data: hubs = [] } = useQuery<Hub[]>({
    queryKey: ["hubs-for-onboard"],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/payments?type=hubs");
      if (!res.ok) return [];
      const json = await res.json();
      return json.hubs ?? [];
    },
  });

  const onboardMutation = useMutation({
    mutationFn: async () => {
      const res = await adminFetch("/api/admin/riders/offline-onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          riderId: rider?.id,
          cashReceived: cash,
          grantDays: Number(grantDays),
          hubId: hubId || null,
          adminId,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to onboard rider");
      }
      return res.json();
    },
    onSuccess: async (data) => {
      toast.success(
        `${rider?.name} activated! Outstanding: ₹${data.outstanding_balance.toLocaleString()}`
      );
      await queryClient.invalidateQueries({ queryKey: ["riders"] });
      setCashReceived("");
      setGrantDays("7");
      setHubId("");
      onSuccess();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  return (
    <SheetContent className="sm:max-w-md overflow-y-auto">
      <SheetHeader className="pb-6">
        <SheetTitle className="text-[#0D2D6B] flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Offline Onboard
        </SheetTitle>
        <SheetDescription>
          Activate a rider who paid partial cash at the hub.
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-6">
        {/* Rider Display */}
        {rider && (
          <div className="flex items-center gap-3 p-3 rounded-xl border bg-slate-50 ring-1 ring-slate-100">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
              <UserPlus className="h-4 w-4 text-primary" />
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-sm text-[#0D2D6B]">{rider.name}</span>
              <span className="text-[10px] text-muted-foreground uppercase font-medium">KYC Approved — Ready to Activate</span>
            </div>
          </div>
        )}

        {/* Warning: no Upgrid Driver ID linked */}
        {rider && !rider.driver_id && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-amber-800">No Upgrid Driver ID linked</p>
              <p className="text-[11px] text-amber-700 mt-0.5">
                This rider does not have an Upgrid Driver ID yet. They will be activated but <strong>cannot swap batteries</strong> until a Driver ID is linked from their profile.
              </p>
            </div>
          </div>
        )}

        {/* Cash Received */}
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Cash Received (₹) *</Label>
          <div className="relative">
            <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              type="number"
              placeholder="e.g. 3000"
              className="pl-9 h-10 rounded-xl border-slate-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              value={cashReceived}
              onChange={(e) => setCashReceived(e.target.value)}
            />
          </div>
          {cash > 0 && cash < MINIMUM_CASH && (
            <p className="text-xs text-red-500 font-medium flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Minimum ₹{MINIMUM_CASH.toLocaleString()} required (₹2,000 deposit + ₹190 fees)
            </p>
          )}
        </div>

        {/* Grant Duration */}
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Grant Duration *</Label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 z-10" />
            <Select value={grantDays} onValueChange={setGrantDays}>
              <SelectTrigger className="pl-9 h-10 rounded-xl border-slate-200">
                <SelectValue placeholder="Select duration..." />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {GRANT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="rounded-lg">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Hub Selector */}
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Assign Hub</Label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 z-10" />
            <Select value={hubId || "none"} onValueChange={(v) => setHubId(v === "none" ? "" : v)}>
              <SelectTrigger className="pl-9 h-10 rounded-xl border-slate-200">
                <SelectValue placeholder="Select a hub..." />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="none" className="rounded-lg text-muted-foreground italic">Skip for now</SelectItem>
                {hubs.map((h) => (
                  <SelectItem key={h.id} value={h.id} className="rounded-lg">
                    {h.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Live Breakdown */}
        {cash >= MINIMUM_CASH && (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Payment Split</span>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-600 flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  Security Deposit
                </span>
                <span className="font-semibold">₹{SECURITY_DEPOSIT.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-600 flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  Onboarding Fees
                </span>
                <span className="font-semibold">₹{ONBOARDING_FEES.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-600 flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />
                  Rental Credit
                </span>
                <span className="font-semibold text-blue-600">₹{rentalCredit.toLocaleString()}</span>
              </div>
              <div className="border-t border-dashed border-slate-200 pt-3 mt-1">
                <div className="flex justify-between items-center text-sm">
                  <span className={`font-bold ${outstanding > 0 ? "text-red-600" : "text-emerald-600"}`}>
                    Outstanding Balance
                  </span>
                  <span className={`font-bold text-base ${outstanding > 0 ? "text-red-600" : "text-emerald-600"}`}>
                    ₹{outstanding.toLocaleString()}
                  </span>
                </div>
                {outstanding > 0 && (
                  <p className="text-[11px] text-red-500 mt-1">
                    This amount will be auto-added to the rider&apos;s next rental payment.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Submit */}
        <div className="pt-2">
          <Button
            className="w-full h-12 text-base font-bold bg-[#0D2D6B] hover:bg-[#0D2D6B]/90 rounded-xl shadow-lg shadow-blue-900/10 transition-all active:scale-[0.98]"
            disabled={!isValid || onboardMutation.isPending}
            onClick={() => onboardMutation.mutate()}
          >
            {onboardMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Activating...
              </>
            ) : (
              `Activate Rider${outstanding > 0 ? ` (₹${outstanding} outstanding)` : ""}`
            )}
          </Button>
        </div>
      </div>
    </SheetContent>
  );
}
