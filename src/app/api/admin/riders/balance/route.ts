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
 *   adjustment: positive = add debt, negative = reduce debt
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

    const adj = Number(adjustment);

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

    const { error: updateErr } = await supabaseAdmin
      .from("riders")
      .update({ outstanding_balance: newBalance })
      .eq("id", riderId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    console.log(
      `[balance] Rider ${riderId}: ₹${currentBalance} → ₹${newBalance} (adjustment: ${adj >= 0 ? "+" : ""}${adj}). Reason: ${reason || "N/A"}. By admin: ${adminId}`
    );

    return NextResponse.json({
      success: true,
      rider_id: riderId,
      previous_balance: currentBalance,
      adjustment: adj,
      new_balance: newBalance,
      reason: reason || null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
