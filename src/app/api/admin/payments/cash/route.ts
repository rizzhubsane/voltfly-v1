import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";

/**
 * POST /api/admin/payments/cash
 *
 * Records a cash payment, extends the rider's valid_until, and auto-unblocks
 * their battery if the new valid_until is in the future.
 */
export async function POST(request: Request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) return auth.error;

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Server is missing Supabase service role configuration" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { riderId, amount, planType, paidAt, notes } = body;
    // Always derive adminId from the verified auth token — never trust the request body.
    const adminId = auth.admin.id;

    if (!riderId || !amount || !planType) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. Calculate cycle days
    // For "custom" plan types the caller must supply an explicit `cycleDays` value.
    let cycleDays = 0;
    if (planType === "daily") cycleDays = 1;
    else if (planType === "weekly") cycleDays = 7;
    else if (planType === "monthly") cycleDays = 30;
    else if (planType === "custom") {
      const customDays = Number(body.cycleDays);
      if (!Number.isInteger(customDays) || customDays < 1) {
        return NextResponse.json(
          { error: "cycleDays (integer ≥ 1) is required for custom plan type" },
          { status: 400 }
        );
      }
      cycleDays = customDays;
    }

    const isRentalExtension = cycleDays > 0;
    const paidDate = new Date(paidAt || new Date().toISOString());
    const dueDate = isRentalExtension 
      ? new Date(paidDate.getTime() + cycleDays * 24 * 60 * 60 * 1000)
      : paidDate;

    // 2. Insert payment record
    const { data: payment, error: paymentError } = await supabaseAdmin
      .from("payments")
      .insert({
        rider_id: riderId,
        amount: amount,
        plan_type: planType,
        method: "cash",
        status: "paid",
        paid_at: paidDate.toISOString(),
        due_date: dueDate.toISOString(),
        recorded_by: adminId,
        notes: notes || null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (paymentError) throw paymentError;

    let newValidUntil = null;

    // 3. Update rider's valid_until (ONLY for rental extensions)
    if (isRentalExtension) {
      const { data: rider } = await supabaseAdmin
        .from("riders")
        .select("valid_until, outstanding_balance")
        .eq("id", riderId)
        .single();

      const now = new Date();
      const currentValidUntil = rider?.valid_until ? new Date(rider.valid_until) : now;
      const baseDate = currentValidUntil > now ? currentValidUntil : now;
      newValidUntil = new Date(baseDate.getTime() + cycleDays * 24 * 60 * 60 * 1000);

      // Auto-clear outstanding balance on rental payment
      const currentOutstanding = rider?.outstanding_balance ?? 0;
      const riderUpdatePayload: Record<string, unknown> = {
        valid_until: newValidUntil.toISOString(),
      };
      if (currentOutstanding > 0) {
        riderUpdatePayload.outstanding_balance = 0;
        console.log(`[log-cash] Clearing outstanding balance of ₹${currentOutstanding} for rider ${riderId}`);
      }

      const { error: riderUpdateError } = await supabaseAdmin
        .from("riders")
        .update(riderUpdatePayload)
        .eq("id", riderId);

      if (riderUpdateError) {
        console.error("[log-cash] Failed to update rider valid_until:", riderUpdateError.message);
      } else {
        console.log(`[log-cash] Rider ${riderId} valid_until updated to ${newValidUntil.toISOString()}`);
      }

      // 4. Auto-unblock battery if valid_until is now in the future
      if (newValidUntil > now) {
        const { data: battery } = await supabaseAdmin
          .from("batteries")
          .select("status, driver_id")
          .eq("current_rider_id", riderId)
          .single();

        if (battery && battery.status === "blocked" && battery.driver_id) {
          console.log(`[log-cash] Rider ${riderId} is blocked, triggering unblock...`);
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

            console.log(`[log-cash] Battery unblocked for rider ${riderId}`);
          } catch (err) {
            console.error("[log-cash] Battery unblock trigger failed:", err);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      payment,
      new_valid_until: newValidUntil ? newValidUntil.toISOString() : null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
