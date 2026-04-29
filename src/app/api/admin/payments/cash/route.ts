import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) return auth.error;

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Server missing Supabase admin" }, { status: 500 });
    }

    const body = await request.json();
    const { riderId, amount, planType, paidAt, notes, method } = body;
    const adminId = auth.admin.id;

    if (!riderId || !amount || !planType) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    let cycleDays = 0;
    if (planType === "daily")        cycleDays = 1;
    else if (planType === "weekly")  cycleDays = 7;
    else if (planType === "monthly") cycleDays = 30;
    else if (planType === "custom")  cycleDays = Number(body.cycleDays) || 0;

    // Consider wallet_topup or any cycleDays > 0 as a rental extension
    const isRentalExtension = cycleDays > 0 || planType === "wallet_topup" || planType === "custom";
    const paidDate = new Date(paidAt || new Date().toISOString());
    const nowISO   = new Date().toISOString();

    // 1. Insert payment record (immutable ledger of cash flows)
    const { data: payment, error: paymentError } = await supabaseAdmin
      .from("payments")
      .insert({
        rider_id:    riderId,
        amount:      amount,
        plan_type:   planType,
        method:      method || "cash",
        status:      "paid",
        due_date:    paidDate.toISOString().slice(0, 10),  // NOT NULL — default to payment date
        paid_at:     paidDate.toISOString(),
        recorded_by: adminId,
        notes:       notes ? `${notes} (Logged by: ${auth.admin.name || auth.admin.email || "Admin"})` : `Logged by: ${auth.admin.name || auth.admin.email || "Admin"}`,
        created_at:  nowISO,
      })
      .select()
      .single();

    if (paymentError) throw paymentError;

    let newWalletBalance: number | null = null;

    if (isRentalExtension) {
      // Fetch current wallet balance for the transaction log
      const { data: rider } = await supabaseAdmin
        .from("riders")
        .select("wallet_balance, status, driver_id, daily_deduction_rate")
        .eq("id", riderId)
        .single();

      const currentWallet   = rider?.wallet_balance ?? 0;
      const dailyRate       = rider?.daily_deduction_rate ?? 230;

      // 2. Update wallet balance atomically via RPC
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rpcData, error: rpcErr } = await (supabaseAdmin as any).rpc("increment_wallet", {
        rider_id: riderId,
        amount: amount,
      });

      if (rpcErr) throw rpcErr;
      
      const walletAfter = Number(rpcData);
      newWalletBalance = walletAfter;

      // 2b. Sync other rider fields
      await supabaseAdmin
        .from("riders")
        .update({
          payment_status:      "paid",
          outstanding_balance: 0,          // legacy field — keep zeroed
          daily_deduction_rate: 230,
        })
        .eq("id", riderId);

      // 3. Log to wallet_transactions
      await supabaseAdmin.from("wallet_transactions").insert({
        rider_id:       riderId,
        amount:         amount,
        type:           "rental_credit",
        balance_before: currentWallet,
        balance_after:  walletAfter,
        reference_id:   payment.id,
        notes:          `Cash payment (${planType}) recorded by ${auth.admin.name || auth.admin.email || "admin"}`,
        created_at:     nowISO,
      });

      // NOTE: We DO NOT manually unblock the battery here.
      // The Supabase Webhook (handle-rider-state-change) will automatically
      // detect the wallet_balance increase and trigger the unblock if the new balance
      // meets the daily threshold.

      console.log(`[cash] Rider ${riderId}: wallet ₹${currentWallet} → ₹${walletAfter} (+₹${amount})`);

      // If wallet still negative — log a warning (partial payment — not enough to unblock)
      if (walletAfter <= 0) {
        const daysOwed = Math.ceil(Math.abs(walletAfter) / dailyRate);
        console.warn(`[cash] Rider ${riderId} wallet still negative (₹${walletAfter}). Still owes ≈${daysOwed} days.`);
      }
    }
    // Service / onboarding_fee / security_deposit → no wallet change — just logged in payments table
    if (planType === "security_deposit") {
      // 4. Sync with security_deposits table for refund tracking
      await supabaseAdmin.from("security_deposits").insert({
        rider_id: riderId,
        amount_paid: amount,
        status: "held",
        notes: notes || "Initial security deposit",
        created_at: nowISO,
      });
    }


    return NextResponse.json({
      success: true,
      payment,
      new_wallet_balance: newWalletBalance,
    });
  } catch (error: unknown) {
    // Handle both native Error and Supabase PostgrestError objects
    let message = "Unknown error";
    if (error instanceof Error) {
      message = error.message;
    } else if (error && typeof error === "object" && "message" in error) {
      message = String((error as { message: unknown }).message);
    }
    console.error("[cash] Error:", message, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
