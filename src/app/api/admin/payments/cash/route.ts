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
    const { riderId, amount, planType, paidAt, notes } = body;
    const adminId = auth.admin.id;

    if (!riderId || !amount || !planType) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    let cycleDays = 0;
    if (planType === "daily") cycleDays = 1;
    else if (planType === "weekly") cycleDays = 7;
    else if (planType === "monthly") cycleDays = 30;
    else if (planType === "custom") {
      cycleDays = Number(body.cycleDays);
    }
    const isRentalExtension = cycleDays > 0;
    const paidDate = new Date(paidAt || new Date().toISOString());

    // Insert generic payment record
    const { data: payment, error: paymentError } = await supabaseAdmin
      .from("payments")
      .insert({
        rider_id: riderId,
        amount: amount,
        plan_type: planType,
        method: "cash",
        status: "paid",
        paid_at: paidDate.toISOString(),
        recorded_by: adminId,
        notes: notes || null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (paymentError) throw paymentError;

    let newWalletBalance = null;

    if (isRentalExtension) {
      const { data: rider } = await supabaseAdmin
        .from("riders")
        .select("wallet_balance")
        .eq("id", riderId)
        .single();

      const currentWallet = rider?.wallet_balance ?? 0;
      newWalletBalance = currentWallet + amount;
      const newRate = (amount === 1610 || amount === 6900) ? 230 : 230;

      const riderUpdatePayload = {
        wallet_balance: newWalletBalance,
        payment_status: "paid",
        outstanding_balance: 0,
        daily_deduction_rate: newRate,
      };

      await supabaseAdmin
        .from("riders")
        .update(riderUpdatePayload)
        .eq("id", riderId);

      // Auto-unblock battery if wallet balance is positive
      if (newWalletBalance > 0) {
        const { data: battery } = await supabaseAdmin
          .from("batteries")
          .select("status, driver_id")
          .eq("current_rider_id", riderId)
          .single();

        if (battery && battery.status === "blocked" && battery.driver_id) {
          try {
            await supabaseAdmin.functions.invoke("battery-unblock", {
              body: {
                driverId: battery.driver_id,
                riderId: riderId,
                triggeredBy: adminId,
                triggerType: "cash_payment",
                reason: "Cash payment received — auto-unblocked",
              },
            });
            await supabaseAdmin
              .from("batteries")
              .update({ status: "active", last_action_at: new Date().toISOString() })
              .eq("current_rider_id", riderId);
            await supabaseAdmin.from("riders").update({ status: "active" }).eq("id", riderId);
          } catch (err) {}
        }
      }
    }

    return NextResponse.json({
      success: true,
      payment,
      new_wallet_balance: newWalletBalance,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
