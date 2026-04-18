import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";

/**
 * POST /api/admin/riders/balance
 *
 * Manually adjust a rider's wallet_balance (positive = add credit, negative = deduct/fine).
 * Every adjustment is logged to wallet_transactions and balance_audit_log.
 * If the wallet goes positive after adjustment, the rider is auto-unblocked.
 *
 * Body: { riderId, adjustment: number, reason: string }
 */
export async function POST(request: Request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) return auth.error;

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Server missing Supabase admin" }, { status: 500 });
    }

    const body = await request.json();
    const { riderId, adjustment, reason } = body;
    const adminId = auth.admin.id;

    if (!riderId || adjustment == null) {
      return NextResponse.json({ error: "Missing required fields: riderId, adjustment" }, { status: 400 });
    }
    if (!reason?.trim()) {
      return NextResponse.json({ error: "A reason is required for all wallet adjustments" }, { status: 400 });
    }

    const adj = Number(adjustment);
    if (isNaN(adj) || adj === 0) {
      return NextResponse.json({ error: "Adjustment must be a non-zero number" }, { status: 400 });
    }

    // Fetch current rider state
    const { data: rider, error: fetchErr } = await supabaseAdmin
      .from("riders")
      .select("id, name, wallet_balance, status, driver_id, daily_deduction_rate")
      .eq("id", riderId)
      .single();

    if (fetchErr || !rider) {
      return NextResponse.json({ error: "Rider not found" }, { status: 404 });
    }

    const oldBalance  = rider.wallet_balance ?? 0;
    const newBalance  = oldBalance + adj;
    const nowISO      = new Date().toISOString();

    // 1. Update wallet_balance
    const { error: updateErr } = await supabaseAdmin
      .from("riders")
      .update({ wallet_balance: newBalance })
      .eq("id", riderId);

    if (updateErr) throw updateErr;

    // 2. Log to wallet_transactions
    await supabaseAdmin.from("wallet_transactions").insert({
      rider_id:       riderId,
      amount:         adj,
      type:           "admin_adjustment",
      balance_before: oldBalance,
      balance_after:  newBalance,
      reference_id:   adminId,
      notes:          reason.trim(),
      created_at:     nowISO,
    });

    // 3. Log to balance_audit_log
    await supabaseAdmin.from("balance_audit_log").insert({
      rider_id:    riderId,
      admin_id:    adminId,
      old_balance: oldBalance,
      adjustment:  adj,
      new_balance: newBalance,
      reason:      reason.trim(),
      created_at:  nowISO,
    });

    // 4. Auto-unblock if wallet went positive and rider is suspended
    let unblocked = false;
    if (newBalance > 0 && rider.status === "suspended") {
      // Set rider active
      await supabaseAdmin.from("riders").update({ status: "active" }).eq("id", riderId);

      // Unblock battery if assigned
      if (rider.driver_id) {
        const { data: battery } = await supabaseAdmin
          .from("batteries")
          .select("status, driver_id")
          .eq("current_rider_id", riderId)
          .maybeSingle();

        if (battery?.status === "blocked" && battery.driver_id) {
          try {
            await supabaseAdmin.functions.invoke("battery-unblock", {
              body: {
                driverId:    battery.driver_id,
                riderId:     riderId,
                triggeredBy: adminId,
                triggerType: "admin_adjustment",
                reason:      `Wallet adjusted to ₹${newBalance} — auto-unblocked`,
              },
            });
            await supabaseAdmin
              .from("batteries")
              .update({ status: "active", last_action_at: nowISO })
              .eq("current_rider_id", riderId);
            unblocked = true;
          } catch (err) {
            console.error("[balance] Battery unblock failed:", err);
          }
        }
      }
    }

    console.log(`[balance] Rider ${rider.name}: ₹${oldBalance} → ₹${newBalance} (${adj > 0 ? "+" : ""}${adj}). Reason: ${reason}. Unblocked: ${unblocked}`);

    return NextResponse.json({
      success:          true,
      rider_id:         riderId,
      previous_balance: oldBalance,
      adjustment:       adj,
      new_balance:      newBalance,
      unblocked,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
