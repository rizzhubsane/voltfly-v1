"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Loader2, IndianRupee, Calendar as CalendarIcon, User, FileText, LayoutList, AlertTriangle } from "lucide-react";
import { adminFetch } from "@/lib/adminFetch";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

import { PRICING } from "@/lib/pricingConstants";

const formSchema = z.object({
  riderId: z.string().min(1, "Rider is required"),
  amount: z.number().min(1, "Amount must be greater than 0"),
  planType: z.string().min(1, "Category is required"),
  method: z.string().min(1, "Payment method is required"),
  paymentDate: z.date(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const CATEGORIES = [
  { id: "daily",            label: "Daily Rent",                       defaultAmount: 0 },
  { id: "weekly",           label: "Weekly Rent",                      defaultAmount: 0 },
  { id: "monthly",          label: "Monthly Rent",                     defaultAmount: 0 },
  { id: "wallet_topup",     label: "Wallet Top-up (General)",          defaultAmount: 0 },
  { id: "security_deposit", label: "Security Deposit",                 defaultAmount: 0 },
  { id: "service",          label: "Spare Parts / Service",            defaultAmount: 0 },
  { id: "onboarding_fee",   label: "Onboarding Fee",                   defaultAmount: PRICING.ONBOARDING_FEES },
];

const PAYMENT_METHODS = [
  { id: "cash",      label: "Cash",             icon: "💵", color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  { id: "upi",       label: "UPI",              icon: "📲", color: "text-blue-700 bg-blue-50 border-blue-200" },
  { id: "razorpay",  label: "Razorpay (Online)", icon: "💳", color: "text-purple-700 bg-purple-50 border-purple-200" },
];

interface LogCashPaymentDrawerProps {
  adminId: string;
  onSuccess: () => void;
  riderId?: string;
  riderName?: string;
}

export function LogCashPaymentDrawer({ adminId, onSuccess, riderId, riderName }: LogCashPaymentDrawerProps) {
  const isLockedToRider = Boolean(riderId); // true when opened from a rider profile
  const [riderSearch, setRiderSearch] = useState("");
  const [riders, setRiders] = useState<{ id: string; name: string; phone_1: string }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedRider, setSelectedRider] = useState<{ id: string; name: string } | null>(
    riderId && riderName ? { id: riderId, name: riderName } : null
  );

  const [isOnboardingFee, setIsOnboardingFee] = useState(false);

  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      riderId: riderId || "",
      amount: 0,
      planType: "",
      method: "cash",
      paymentDate: new Date(),
      notes: "",
    },
  });

  // ── Rider Search ──────────────────────────────────────────────────────────
  useEffect(() => {
    const searchRiders = async () => {
      if (riderSearch.length < 2) {
        setRiders([]);
        return;
      }
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

  const handleSelectRider = (rider: { id: string; name: string }) => {
    setSelectedRider(rider);
    form.setValue("riderId", rider.id);
    setRiders([]);
    setRiderSearch("");
  };

  // ── Category Selection ────────────────────────────────────────────────────────
  const handleCategoryChange = (categoryId: string) => {
    const category = CATEGORIES.find(c => c.id === categoryId);
    setIsOnboardingFee(categoryId === "onboarding_fee");
    if (category && category.defaultAmount > 0) {
      form.setValue("amount", category.defaultAmount);
    } else {
      form.setValue("amount", 0);
    }
  };

  // ── Real-time ledger guardrail ───────────────────────────────────────────────
  // If admin enters >= ₹3,800 on any plan other than security_deposit,
  // it almost certainly means they collected the onboarding bundle and are
  // using the wrong drawer. Block submission with a hard error.
  const watchedAmount = form.watch("amount");
  const watchedPlanType = form.watch("planType");
  const looksLikeOnboarding =
    watchedAmount >= PRICING.FULL_ONBOARDING &&
    watchedPlanType !== "security_deposit" &&
    watchedPlanType !== "";

  // ── Submit ───────────────────────────────────────────────────────────────
  const logCashMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      // Hard guard: block onboarding-sized amounts through this drawer
      if (values.amount >= PRICING.FULL_ONBOARDING && values.planType !== "security_deposit") {
        throw new Error(
          `₹${values.amount.toLocaleString("en-IN")} looks like an onboarding bundle. Use the Offline Onboard flow to split it correctly into deposit + fee + rental.`
        );
      }

      const res = await adminFetch("/api/admin/payments/cash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          riderId: values.riderId,
          amount: values.amount,
          planType: values.planType,
          method: values.method,
          paidAt: values.paymentDate.toISOString(),
          notes: values.notes,
          adminId: adminId,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to record payment");
      }

      return res.json();
    },
    onSuccess: async () => {
      toast.success("Cash payment logged successfully");
      await queryClient.invalidateQueries({ queryKey: ["all-payments"] });
      await queryClient.invalidateQueries({ queryKey: ["overdue-riders"] });
      form.reset();
      setSelectedRider(null);
      setIsOnboardingFee(false);
      onSuccess();
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Failed to log payment";
      toast.error(message);
    },
  });

  return (
    <SheetContent className="sm:max-w-md overflow-y-auto">
      <SheetHeader className="pb-6">
        <SheetTitle className="text-[#0D2D6B] flex items-center gap-2">
          <IndianRupee className="h-5 w-5" />
          Log Cash Payment
        </SheetTitle>
        <SheetDescription>
          Record a physical cash collection from a rider.
        </SheetDescription>
      </SheetHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((v) => logCashMutation.mutate(v))} className="space-y-6">

          {/* ── Hard ledger block: amount looks like onboarding bundle ── */}
          {looksLikeOnboarding && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3">
              <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-red-800">
                  ₹{watchedAmount.toLocaleString("en-IN")} — This looks like an onboarding bundle
                </p>
                <p className="text-[11px] text-red-700 mt-0.5">
                  You cannot log ₹{PRICING.FULL_ONBOARDING.toLocaleString("en-IN")}+ as a single cash payment. The onboarding bundle (<strong>₹{PRICING.SECURITY_DEPOSIT.toLocaleString("en-IN")} deposit + ₹{PRICING.ONBOARDING_FEES} fee + ₹{PRICING.WEEKLY_RATE.toLocaleString("en-IN")} rental</strong>) must be split via the <strong>Offline Onboard</strong> drawer. Close this and use that instead.
                </p>
              </div>
            </div>
          )}

          {/* Rider Selection — hidden when drawer is locked to a specific rider from their profile */}
          {!isLockedToRider && (
            <div className="space-y-2">
              <FormLabel className="text-xs font-bold uppercase tracking-wider text-slate-500">Rider *</FormLabel>
              {selectedRider ? (
                <div className="flex items-center justify-between p-3 rounded-xl border bg-slate-50 ring-1 ring-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex flex-col">
                      <span className="font-semibold text-sm text-[#0D2D6B]">{selectedRider.name}</span>
                      <span className="text-[10px] text-muted-foreground uppercase font-medium">Selected Rider</span>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => {
                      setSelectedRider(null);
                      form.setValue("riderId", "");
                    }}
                    className="h-8 text-[11px] font-bold uppercase text-primary hover:text-primary hover:bg-primary/5"
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or phone..."
                    className="pl-9 h-10 rounded-xl"
                    value={riderSearch}
                    onChange={(e) => setRiderSearch(e.target.value)}
                  />
                  {isSearching && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  {riders.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto ring-1 ring-black/5 p-1 animate-in fade-in zoom-in-95 duration-150">
                      {riders.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg transition-colors flex flex-col"
                          onClick={() => handleSelectRider(r)}
                        >
                          <div className="font-semibold text-sm text-[#0D2D6B]">{r.name}</div>
                          <div className="text-[10px] text-muted-foreground font-medium">{r.phone_1}</div>
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

          {/* Payment Category */}
          <FormField
            control={form.control}
            name="planType"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel className="text-xs font-bold uppercase tracking-wider text-slate-500">Payment Category *</FormLabel>
                <div className="relative">
                  <LayoutList className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 z-10" />
                  <Select onValueChange={(val: string) => {
                    field.onChange(val);
                    handleCategoryChange(val);
                  }} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="pl-9 h-10 rounded-xl border-slate-200">
                        <SelectValue placeholder="Select a payment category..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="rounded-xl">
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="rounded-lg">{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />

          {/* Onboarding fee warning — shown when 'onboarding_fee' is selected */}
          {isOnboardingFee && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-amber-800">Onboarding Fee only — ₹{PRICING.ONBOARDING_FEES}</p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  This records <strong>only the ₹{PRICING.ONBOARDING_FEES} handling fee</strong>. If this is a new rider&apos;s first payment (₹{PRICING.FULL_ONBOARDING.toLocaleString("en-IN")} bundle), use the{" "}
                  <strong>Offline Onboard</strong> flow instead.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* Amount */}
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

            {/* Payment Date */}
            <FormField
              control={form.control}
              name="paymentDate"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel className="text-xs font-bold uppercase tracking-wider text-slate-500">Payment Date *</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full pl-9 h-10 rounded-xl border-slate-200 text-left font-normal transition-all hover:bg-slate-50",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                          {field.value ? (
                            format(field.value, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 rounded-xl shadow-xl" align="end">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date: Date) =>
                          date > new Date() || date < new Date("1900-01-01")
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
          </div>

          {/* Payment Method */}
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
                            ? `border-[#0D2D6B] bg-[#0D2D6B]/5 shadow-sm`
                            : `border-slate-200 hover:border-slate-300 hover:bg-slate-50`
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

          {/* Notes */}
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
                      placeholder="e.g. Received by cashier in Okhla hub" 
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
              disabled={logCashMutation.isPending || looksLikeOnboarding}
            >
              {logCashMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : looksLikeOnboarding ? (
                "Use Offline Onboard Instead →"
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
