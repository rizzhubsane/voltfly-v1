"use client";

import { useMemo } from "react";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Plus, Trash2, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { adminFetch } from "@/lib/adminFetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

const formSchema = z.object({
  deductions: z.array(
    z.object({
      reason: z.string().min(1, "Reason is required"),
      amount: z.number().min(0, "Must be ≥ 0"),
    })
  ),
});

type FormValues = z.infer<typeof formSchema>;

interface ProcessRefundDrawerProps {
  deposit: {
    id: string;
    rider_name: string;
    amount: number;
  };
  adminId: string;
  onSuccess: () => void;
}

export function ProcessRefundDrawer({ deposit, adminId, onSuccess }: ProcessRefundDrawerProps) {
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { deductions: [] },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "deductions",
  });

  const watchedDeductions = useWatch({ control: form.control, name: "deductions" });
  const deductions = useMemo(() => watchedDeductions ?? [], [watchedDeductions]);
  const totalDeductions = useMemo(
    () => deductions.reduce((sum, d) => sum + (Number(d.amount) || 0), 0),
    [deductions]
  );
  const refundAmount = Math.max(0, deposit.amount - totalDeductions);

  const refundMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const res = await adminFetch("/api/admin/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          depositId: deposit.id,
          refundAmount,
          deductions: (values.deductions ?? []).map(({ reason, amount }) => ({ reason, amount })),
          adminId,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to initiate refund");
      return data;
    },
    onSuccess: async () => {
      toast.success("Refund initiated successfully");
      await queryClient.invalidateQueries({ queryKey: ["security-deposits"] });
      form.reset({ deductions: [] });
      onSuccess();
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Failed to initiate refund";
      toast.error(message);
    },
  });

  return (
    <SheetContent className="sm:max-w-md overflow-y-auto">
      <SheetHeader className="pb-6">
        <SheetTitle className="text-[#0D2D6B] flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Process Refund
        </SheetTitle>
        <SheetDescription>
          Calculate and authorize security deposit refund for <strong>{deposit.rider_name}</strong>.
        </SheetDescription>
      </SheetHeader>

      <form
        className="space-y-6"
        onSubmit={form.handleSubmit((values) => refundMutation.mutate(values))}
      >
        {/* Deposit Info */}
        <div className="rounded-lg border bg-slate-50 p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Original Deposit</span>
            <span className="font-semibold">₹{deposit.amount.toLocaleString()}</span>
          </div>
        </div>

        {/* Deductions Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">Deductions</h3>
            <Button 
              type="button" 
              variant="outline" 
              size="sm" 
              onClick={() => append({ reason: "", amount: 0 })}
              className="h-8 gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> Add Row
            </Button>
          </div>

          <div className="space-y-3">
            {fields.length === 0 ? (
              <p className="text-sm text-center py-4 text-muted-foreground border-2 border-dashed rounded-lg bg-slate-50/50">
                No deductions added.
              </p>
            ) : (
              fields.map((field, idx) => (
                <div key={field.id} className="flex gap-2 items-start">
                  <div className="grid grid-cols-5 flex-1 gap-2">
                    <Input 
                      placeholder="Reason (e.g. Broken Mirror)" 
                      className="col-span-3 h-9 text-sm"
                      {...form.register(`deductions.${idx}.reason` as const)}
                    />
                    <div className="relative col-span-2">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">₹</span>
                      <Input 
                        type="number"
                        placeholder="0"
                        className="h-9 pl-5 text-sm"
                        value={Number(deductions?.[idx]?.amount ?? 0)}
                        onChange={(e) =>
                          form.setValue(`deductions.${idx}.amount`, Number(e.target.value), {
                            shouldValidate: true,
                            shouldDirty: true,
                          })
                        }
                      />
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-9 w-9 text-red-400 hover:text-red-600 hover:bg-red-50 flex-shrink-0"
                    type="button"
                    onClick={() => remove(idx)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        <Separator />

        {/* Live Calculation Summary */}
        <div className="space-y-3 bg-slate-50 p-4 rounded-lg">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Base Deposit</span>
            <span>₹{deposit.amount}</span>
          </div>
          <div className="flex justify-between text-sm text-red-600">
            <span>Total Deductions</span>
            <span>- ₹{totalDeductions}</span>
          </div>
          <Separator />
          <div className="flex justify-between items-center pt-1">
            <span className="font-bold text-[#0D2D6B]">Refund Amount</span>
            <span className="text-xl font-bold text-emerald-600">₹{refundAmount.toLocaleString()}</span>
          </div>
        </div>

        {refundAmount === 0 && deposit.amount > 0 && (
          <div className="flex gap-2 p-3 bg-amber-50 rounded-md border border-amber-200">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              Refund amount is zero. This will close the deposit without returning any funds to the rider.
            </p>
          </div>
        )}

        <div className="pt-4 space-y-3">
          <Button 
            className="w-full h-11 text-lg font-semibold bg-[#0D2D6B] hover:bg-[#0D2D6B]/90"
            disabled={refundMutation.isPending}
            type="submit"
          >
            {refundMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              "Confirm & Initiate Refund"
            )}
          </Button>
          <p className="text-[10px] text-center text-muted-foreground uppercase tracking-wider font-medium">
            Authorized by {adminId}
          </p>
        </div>
      </form>
    </SheetContent>
  );
}
