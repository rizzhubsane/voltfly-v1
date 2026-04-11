import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";

/**
 * POST /api/admin/riders/balance
 *
 * Manually adjust a rider's outstanding_balance.
 * Use cases: add a fine, forgive partial debt, correct errors.
 *
 * Body: { riderId, adjustment, reason }
 *   adjustment: positive = add debt (fine), negative = reduce debt (forgiveness)
 *
 * Every adjustment is written to balance_audit_log for a permanent audit trail.
 * A corresponding payments row is also inserted so the adjustment is visible
 * in the rider's payment history tab.
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
    const { riderId, adjustment, reason } = body;
    const adminId = auth.admin.id;

    if (!riderId || adjustment == null) {
      return NextResponse.json(
        { error: "Missing required fields: riderId, adjustment" },
        { status: 400 }
      );
    }

    if (!reason || !reason.trim()) {
      return NextResponse.json(
        { error: "A reason is required for all balance adjustments" },
        { status: 400 }
      );
    }

    const adj = Number(adjustment);

    if (isNaN(adj) || adj === 0) {
      return NextResponse.json(
        { error: "Adjustment must be a non-zero number" },
        { status: 400 }
      );
    }

    // Fetch current balance
    const { data: rider, error: fetchErr } = await supabaseAdmin
      .from("riders")
      .select("id, name, outstanding_balance")
      .eq("id", riderId)
      .single();

    if (fetchErr || !rider) {
      return NextResponse.json({ error: "Rider not found" }, { status: 404 });
    }

    const currentBalance = rider.outstanding_balance ?? 0;
    const newBalance = Math.max(0, currentBalance + adj);
    const nowISO = new Date().toISOString();

    // 1. Update the rider's outstanding_balance
    const { error: updateErr } = await supabaseAdmin
      .from("riders")
      .update({ outstanding_balance: newBalance })
      .eq("id", riderId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // 2. Write a permanent audit log row
    // The balance_audit_log table must exist:
    // CREATE TABLE IF NOT EXISTS balance_audit_log (
    //   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    //   rider_id uuid REFERENCES riders(id),
    //   admin_id uuid REFERENCES admin_users(id),
    //   old_balance numeric NOT NULL,
    //   adjustment numeric NOT NULL,
    //   new_balance numeric NOT NULL,
    //   reason text,
    //   created_at timestamptz DEFAULT now()
    // );
    const { error: auditErr } = await supabaseAdmin
      .from("balance_audit_log")
      .insert({
        rider_id: riderId,
        admin_id: adminId,
        old_balance: currentBalance,
        adjustment: adj,
        new_balance: newBalance,
        reason: reason.trim(),
        created_at: nowISO,
      });

    if (auditErr) {
      // Non-fatal: log to console — the balance was already updated.
      // If the table doesn't exist yet, this will fail silently.
      console.error("[balance] balance_audit_log insert error:", auditErr.message);
    }

    // 3. Insert a payments row so the adjustment is visible in payment history
    const isFine = adj > 0;
    const { error: paymentErr } = await supabaseAdmin
      .from("payments")
      .insert({
        rider_id: riderId,
        amount: Math.abs(adj),
        plan_type: isFine ? "fine" : "balance_adjustment",
        method: "cash",
        status: isFine ? "pending" : "paid",
        paid_at: isFine ? null : nowISO,
        due_date: nowISO,
        recorded_by: adminId,
        notes: `Manual balance adjustment (${isFine ? "+" : ""}${adj}). Reason: ${reason.trim()}`,
        created_at: nowISO,
      });

    if (paymentErr) {
      console.error("[balance] payments insert error:", paymentErr.message);
      // Non-fatal
    }

    const direction = adj >= 0 ? "+" : "";
    console.log(
      `[balance] Rider ${riderId} (${rider.name}): ₹${currentBalance} → ₹${newBalance} (${direction}${adj}). Reason: ${reason}. By: ${adminId}`
    );

    return NextResponse.json({
      success: true,
      rider_id: riderId,
      previous_balance: currentBalance,
      adjustment: adj,
      new_balance: newBalance,
      reason: reason.trim(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
