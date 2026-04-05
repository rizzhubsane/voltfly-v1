"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Loader2, IndianRupee, Calendar as CalendarIcon, User, FileText, LayoutList } from "lucide-react";
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

const formSchema = z.object({
  riderId: z.string().min(1, "Rider is required"),
  amount: z.number().min(1, "Amount must be greater than 0"),
  planType: z.string().min(1, "Plan type is required"),
  paymentDate: z.date(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const PLANS = [
  { id: "daily", label: "Daily (₹250)", amount: 250 },
  { id: "weekly", label: "Weekly (₹1610)", amount: 1610 },
  { id: "monthly", label: "Monthly (₹6900)", amount: 6900 },
  { id: "service", label: "Spare Parts / Service", amount: 0 },
  { id: "security_deposit", label: "Security Deposit", amount: 0 },
  { id: "custom", label: "Other / Custom", amount: 0 },
];

interface LogCashPaymentDrawerProps {
  adminId: string;
  onSuccess: () => void;
}

export function LogCashPaymentDrawer({ adminId, onSuccess }: LogCashPaymentDrawerProps) {
  const [riderSearch, setRiderSearch] = useState("");
  const [riders, setRiders] = useState<{ id: string; name: string; phone_1: string }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedRider, setSelectedRider] = useState<{ id: string; name: string } | null>(null);

  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      riderId: "",
      amount: 0,
      planType: "",
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

  // ── Plan Selection ────────────────────────────────────────────────────────
  const handlePlanChange = (planId: string) => {
    const plan = PLANS.find(p => p.id === planId);
    if (plan) {
      form.setValue("amount", plan.amount);
    }
  };

  // ── Submit ───────────────────────────────────────────────────────────────
  const logCashMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const res = await adminFetch("/api/admin/payments/cash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          riderId: values.riderId,
          amount: values.amount,
          planType: values.planType,
          cycleDays: values.planType === 'custom' ? Math.max(1, Math.floor(values.amount / 250)) : undefined,
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
          
          {/* Rider Selection */}
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

          {/* Plan Type */}
          <FormField
            control={form.control}
            name="planType"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel className="text-xs font-bold uppercase tracking-wider text-slate-500">Plan Type *</FormLabel>
                <div className="relative">
                  <LayoutList className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 z-10" />
                  <Select onValueChange={(val: string) => {
                    field.onChange(val);
                    handlePlanChange(val);
                  }} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="pl-9 h-10 rounded-xl border-slate-200">
                        <SelectValue placeholder="Select a payment plan..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="rounded-xl">
                      {PLANS.map((p) => (
                        <SelectItem key={p.id} value={p.id} className="rounded-lg">{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />

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
              className="w-full h-12 text-base font-bold bg-[#0D2D6B] hover:bg-[#0D2D6B]/90 rounded-xl shadow-lg shadow-blue-900/10 transition-all active:scale-[0.98]"
              disabled={logCashMutation.isPending}
            >
              {logCashMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Log Cash Payment"
              )}
            </Button>
          </div>
        </form>
      </Form>
    </SheetContent>
  );
}
