"use client";

import { useEffect, useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search, Loader2, IndianRupee, Calendar as CalendarIcon,
  User, FileText, LayoutList, AlertTriangle, CheckCircle2,
  Wallet, Package, UserPlus, ChevronRight,
} from "lucide-react";
import { adminFetch } from "@/lib/adminFetch";
import { Button } from "@/components/ui/button";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { getOperatorPricing } from "@/lib/pricingConstants";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RiderResult {
  id: string;
  name: string;
  phone_1: string;
  status: string;
  gig_company: string | null;
  vehicle_id: string | null;
}

type Operator = "batterysmart" | "indofast";

// ─── Form Schema ─────────────────────────────────────────────────────────────

const formSchema = z.object({
  riderId:     z.string().min(1, "Rider is required"),
  amount:      z.number().min(1, "Amount must be greater than 0"),
  planType:    z.string().min(1, "Category is required"),
  method:      z.string().min(1, "Payment method is required"),
  paymentDate: z.date(),
  notes:       z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

// ─── Category Config ──────────────────────────────────────────────────────────

const CATEGORIES = [
  {
    id:    "wallet_topup",
    label: "Wallet Top-Up",
    icon:  Wallet,
    desc:  "Credit any amount to the rider's wallet",
    color: "text-emerald-700 bg-emerald-50 border-emerald-200",
    activeColor: "border-emerald-600 bg-emerald-50 shadow-sm",
  },
  {
    id:    "onboarding",
    label: "Onboarding",
    icon:  UserPlus,
    desc:  "New rider activation (deposit + fee + wallet credit)",
    color: "text-blue-700 bg-blue-50 border-blue-200",
    activeColor: "border-blue-600 bg-blue-50 shadow-sm",
  },
  {
    id:    "service",
    label: "Spare Parts / Service",
    icon:  Package,
    desc:  "Maintenance charge (no wallet change)",
    color: "text-orange-700 bg-orange-50 border-orange-200",
    activeColor: "border-orange-500 bg-orange-50 shadow-sm",
  },
] as const;

// ─── Payment Method Config ─────────────────────────────────────────────────────

const PAYMENT_METHODS = [
  { id: "cash",      label: "Cash",        icon: "💵", color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  { id: "upi",       label: "Kotak UPI",   icon: "📲", color: "text-blue-700 bg-blue-50 border-blue-200" },
  { id: "razorpay",  label: "Razorpay",    icon: "💳", color: "text-purple-700 bg-purple-50 border-purple-200" },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface LogCashPaymentDrawerProps {
  adminId:    string;
  onSuccess:  () => void;
  riderId?:   string;
  riderName?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LogCashPaymentDrawer({ adminId, onSuccess, riderId, riderName }: LogCashPaymentDrawerProps) {
  const isLockedToRider = Boolean(riderId);
  const queryClient = useQueryClient();

  // ── Rider search state ──────────────────────────────────────────────────
  const [riderSearch,   setRiderSearch]   = useState("");
  const [riders,        setRiders]        = useState<RiderResult[]>([]);
  const [isSearching,   setIsSearching]   = useState(false);
  const [selectedRider, setSelectedRider] = useState<RiderResult | null>(
    riderId && riderName ? { id: riderId, name: riderName, phone_1: "", status: "", gig_company: null, vehicle_id: null } : null
  );

  // ── Explicit operator selection (shown when Onboarding is selected) ────
  const [operator, setOperator] = useState<Operator>("batterysmart");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      riderId:     riderId || "",
      amount:      0,
      planType:    "",
      method:      "cash",
      paymentDate: new Date(),
      notes:       "",
    },
  });

  const watchedPlanType = form.watch("planType");
  const watchedAmount   = form.watch("amount");

  // ── Rider search ────────────────────────────────────────────────────────
  useEffect(() => {
    const searchRiders = async () => {
      if (riderSearch.length < 2) { setRiders([]); return; }
      setIsSearching(true);
      try {
        const res = await adminFetch(`/api/admin/riders/search?q=${encodeURIComponent(riderSearch)}`);
        if (!res.ok) throw new Error("Search failed");
        const json = await res.json();
        setRiders(json.riders || []);
      } catch (err) {
        console.error("Rider search error:", err);
      } finally {
        setIsSearching(false);
      }
    };
    const timer = setTimeout(searchRiders, 300);
    return () => clearTimeout(timer);
  }, [riderSearch]);

  const handleSelectRider = (rider: RiderResult) => {
    setSelectedRider(rider);
    form.setValue("riderId", rider.id);
    setRiders([]);
    setRiderSearch("");
  };

  // ── Operator pricing driven by EXPLICIT operator selection ───────────
  const pricing = useMemo(
    () => getOperatorPricing(operator === "indofast" ? "indofast" : null),
    [operator]
  );

  // ── Onboarding breakdown (computed in real-time as amount changes) ─────
  const onboardingBreakdown = useMemo(() => {
    if (watchedPlanType !== "onboarding" || !watchedAmount) return null;
    const deposit = pricing.securityDeposit;
    const fee     = pricing.onboardingFee;
    const wallet  = Math.max(0, watchedAmount - deposit - fee);
    const valid   = watchedAmount >= pricing.minimumOnboardCash;
    return { deposit, fee, wallet, valid };
  }, [watchedPlanType, watchedAmount, pricing]);

  // ── Validation guards ─────────────────────────────────────────────────
  const isOnboarding = watchedPlanType === "onboarding";
  const riderNotKycApproved = isOnboarding && selectedRider?.status
    && !(["kyc_approved", "active"].includes(selectedRider.status));
  const riderAlreadyActive  = isOnboarding && selectedRider?.status === "active";
  const onboardingAmountTooLow = isOnboarding && watchedAmount > 0 && !onboardingBreakdown?.valid;
  const isBlocked = riderNotKycApproved || onboardingAmountTooLow;

  // ── Submit ─────────────────────────────────────────────────────────────
  const logCashMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const res = await adminFetch("/api/admin/payments/cash", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          riderId:  values.riderId,
          amount:   values.amount,
          planType: values.planType,
          method:   values.method,
          paidAt:   values.paymentDate.toISOString(),
          notes:    values.notes,
          adminId:  adminId,
          operator: values.planType === "onboarding" ? operator : undefined,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to record payment");
      }
      return res.json();
    },
    onSuccess: async (data) => {
      if (watchedPlanType === "onboarding" && data.new_wallet_balance != null) {
        toast.success(`Rider activated ✓ Wallet: ₹${data.new_wallet_balance.toLocaleString("en-IN")} credited`);
      } else {
        toast.success("Payment logged successfully");
      }
      await queryClient.invalidateQueries({ queryKey: ["all-payments"] });
      await queryClient.invalidateQueries({ queryKey: ["overdue-riders"] });
      form.reset({ riderId: riderId || "", amount: 0, planType: "", method: "cash", paymentDate: new Date(), notes: "" });
      if (!isLockedToRider) setSelectedRider(null);
      setOperator("batterysmart");
      onSuccess();
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Failed to log payment";
      toast.error(message);
    },
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <SheetContent className="sm:max-w-md overflow-y-auto">
      <SheetHeader className="pb-6">
        <SheetTitle className="text-[#0D2D6B] flex items-center gap-2">
          <IndianRupee className="h-5 w-5" />
          Log Cash Payment
        </SheetTitle>
        <SheetDescription>
          Record a payment collected from a rider.
        </SheetDescription>
      </SheetHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((v) => logCashMutation.mutate(v))} className="space-y-6">

          {/* ── Rider Selection ── */}
          {!isLockedToRider && (
            <div className="space-y-2">
              <FormLabel className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Rider *
              </FormLabel>
              {selectedRider ? (
                <div className="flex items-center justify-between p-3 rounded-xl border bg-slate-50 ring-1 ring-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex flex-col">
                      <span className="font-semibold text-sm text-[#0D2D6B]">{selectedRider.name}</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-muted-foreground font-medium">{selectedRider.phone_1}</span>
                        {selectedRider.status && (
                          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                            selectedRider.status === "kyc_approved"
                              ? "bg-amber-100 text-amber-700"
                              : selectedRider.status === "active"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-200 text-slate-600"
                          }`}>
                            {selectedRider.status}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setSelectedRider(null); form.setValue("riderId", ""); }}
                    className="h-8 text-[11px] font-bold uppercase text-primary hover:text-primary hover:bg-primary/5"
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, phone or vehicle ID..."
                    className="pl-9 h-10 rounded-xl"
                    value={riderSearch}
                    onChange={(e) => setRiderSearch(e.target.value)}
                  />
                  {isSearching && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  {riders.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border rounded-xl shadow-xl z-50 max-h-52 overflow-y-auto ring-1 ring-black/5 p-1 animate-in fade-in zoom-in-95 duration-150">
                      {riders.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          className="w-full text-left px-3 py-2.5 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-3"
                          onClick={() => handleSelectRider(r)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm text-[#0D2D6B] truncate">{r.name}</div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] text-muted-foreground font-medium">{r.phone_1}</span>
                              <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                                r.status === "kyc_approved" ? "bg-amber-100 text-amber-700" :
                                r.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                              }`}>{r.status}</span>
                            </div>
                          </div>
                          {r.vehicle_id && (
                            <span className="shrink-0 inline-flex items-center rounded-md bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                              {r.vehicle_id}
                            </span>
                          )}
                          <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {form.formState.errors.riderId && (
                <p className="text-xs font-medium text-destructive">{form.formState.errors.riderId.message}</p>
              )}
            </div>
          )}

          {/* ── Payment Category ── */}
          <FormField
            control={form.control}
            name="planType"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  <LayoutList className="inline h-3.5 w-3.5 mr-1" />
                  Payment Category *
                </FormLabel>
                <div className="grid grid-cols-1 gap-2">
                  {CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const isSelected = field.value === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => field.onChange(cat.id)}
                        className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                          isSelected ? cat.activeColor : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <div className={`p-2 rounded-lg border ${cat.color}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold ${isSelected ? "text-[#0D2D6B]" : "text-slate-700"}`}>
                            {cat.label}
                          </p>
                          <p className="text-[10px] text-muted-foreground leading-tight">{cat.desc}</p>
                        </div>
                        {isSelected && <CheckCircle2 className="h-4 w-4 text-[#0D2D6B] shrink-0" />}
                      </button>
                    );
                  })}
                </div>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />

          {/* ── Operator Selector (only when Onboarding is selected) ── */}
          {isOnboarding && (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Operator *</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: "batterysmart" as Operator, label: "BatterySmart", sub: "₹2,000 dep · ₹190 fee · ₹230/day", emoji: "⚡" },
                  { id: "indofast"    as Operator, label: "Indofast",     sub: "₹2,000 dep · ₹250 fee · ₹250/day", emoji: "🚀" },
                ] as const).map((op) => {
                  const isSelected = operator === op.id;
                  return (
                    <button
                      key={op.id}
                      type="button"
                      onClick={() => setOperator(op.id)}
                      className={`flex flex-col items-start gap-0.5 p-3 rounded-xl border-2 text-left transition-all ${
                        isSelected
                          ? "border-[#0D2D6B] bg-[#0D2D6B]/5 shadow-sm"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <span className="text-base leading-none">{op.emoji}</span>
                      <span className={`text-xs font-bold mt-1 ${isSelected ? "text-[#0D2D6B]" : "text-slate-700"}`}>
                        {op.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground leading-tight">{op.sub}</span>
                      {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[#0D2D6B] mt-1" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Rider already active — soft info note ── */}
          {riderAlreadyActive && !riderNotKycApproved && (
            <div className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 p-3">
              <span className="text-base shrink-0">ℹ️</span>
              <div>
                <p className="text-xs font-semibold text-blue-800">Rider is already active</p>
                <p className="text-[11px] text-blue-700 mt-0.5">
                  Payment will be recorded retroactively. Wallet will be credited and security deposit logged. Status won&apos;t change.
                </p>
              </div>
            </div>
          )}

          {/* ── Rider status error for other statuses ── */}
          {riderNotKycApproved && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3">
              <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-red-800">Rider cannot be onboarded</p>
                <p className="text-[11px] text-red-700 mt-0.5">
                  Current status is <strong>{selectedRider?.status}</strong>. Only <strong>kyc_approved</strong> riders can be onboarded.
                </p>
              </div>
            </div>
          )}

          {/* ── Amount + Date ── */}
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel className="text-xs font-bold uppercase tracking-wider text-slate-500">Amount (₹) *</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        type="number"
                        {...field}
                        className="pl-9 h-10 rounded-xl border-slate-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </div>
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="paymentDate"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel className="text-xs font-bold uppercase tracking-wider text-slate-500">Date *</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full pl-9 h-10 rounded-xl border-slate-200 text-left font-normal transition-all hover:bg-slate-50",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                          {field.value ? format(field.value, "dd MMM yy") : <span>Pick a date</span>}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 rounded-xl shadow-xl" align="end">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date: Date) => date > new Date() || date < new Date("1900-01-01")}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
          </div>

          {/* ── Onboarding Breakdown Preview ── */}
          {isOnboarding && onboardingBreakdown && !riderNotKycApproved && (
            <div className={`rounded-xl border p-3 space-y-2 ${
              onboardingBreakdown.valid
                ? "border-blue-200 bg-blue-50"
                : "border-amber-200 bg-amber-50"
            }`}>
              <div className="flex items-center gap-1.5 mb-1">
                {onboardingBreakdown.valid
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" />
                  : <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
                <p className={`text-[11px] font-bold uppercase tracking-wide ${
                  onboardingBreakdown.valid ? "text-blue-700" : "text-amber-700"
                }`}>
                  {onboardingBreakdown.valid
                    ? `${pricing.operator === "indofast" ? "Indofast" : "BatterySmart"} Onboarding Breakdown`
                    : `Need at least ₹${pricing.minimumOnboardCash.toLocaleString("en-IN")} to proceed`}
                </p>
              </div>
              {onboardingBreakdown.valid && (
                <div className="space-y-1.5">
                  {[
                    { label: "Security Deposit (held)", amount: onboardingBreakdown.deposit, color: "text-slate-700" },
                    { label: "Verification / Onboarding Fee", amount: onboardingBreakdown.fee, color: "text-slate-700" },
                    { label: "Wallet Credit (rental days)", amount: onboardingBreakdown.wallet, color: "text-emerald-700 font-bold" },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-600">{row.label}</span>
                      <span className={`text-[11px] ${row.color}`}>₹{row.amount.toLocaleString("en-IN")}</span>
                    </div>
                  ))}
                  <div className="border-t border-blue-200 pt-1.5 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-blue-800">Total Received</span>
                    <span className="text-[11px] font-bold text-blue-800">₹{watchedAmount.toLocaleString("en-IN")}</span>
                  </div>
                  <p className="text-[10px] text-blue-600 mt-1">
                    💡 Payments table shows ₹{watchedAmount.toLocaleString("en-IN")} (single row). Split recorded in background.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Payment Method ── */}
          <FormField
            control={form.control}
            name="method"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel className="text-xs font-bold uppercase tracking-wider text-slate-500">Payment Method *</FormLabel>
                <div className="grid grid-cols-3 gap-2">
                  {PAYMENT_METHODS.map((m) => {
                    const isSelected = field.value === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => field.onChange(m.id)}
                        className={`flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 text-center transition-all ${
                          isSelected
                            ? "border-[#0D2D6B] bg-[#0D2D6B]/5 shadow-sm"
                            : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <span className="text-lg">{m.icon}</span>
                        <span className={`text-[11px] font-semibold leading-tight ${
                          isSelected ? "text-[#0D2D6B]" : "text-slate-600"
                        }`}>{m.label}</span>
                        {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[#0D2D6B] mt-0.5" />}
                      </button>
                    );
                  })}
                </div>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />

          {/* ── Notes ── */}
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel className="text-xs font-bold uppercase tracking-wider text-slate-500">Notes (Optional)</FormLabel>
                <FormControl>
                  <div className="relative">
                    <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="e.g. Received by cashier at Okhla hub"
                      className="pl-9 h-10 rounded-xl border-slate-200"
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />

          <div className="pt-4">
            <Button
              type="submit"
              className="w-full h-12 text-base font-bold bg-[#0D2D6B] hover:bg-[#0D2D6B]/90 rounded-xl shadow-lg shadow-blue-900/10 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={logCashMutation.isPending || Boolean(isBlocked)}
            >
              {logCashMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</>
              ) : isOnboarding && onboardingBreakdown?.valid ? (
                `Activate Rider & Log ₹${watchedAmount.toLocaleString("en-IN")}`
              ) : (
                "Log Payment"
              )}
            </Button>
          </div>
        </form>
      </Form>
    </SheetContent>
  );
}
