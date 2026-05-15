import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/admin/deposits
 *
 * Fetches all security deposits using the service-role key so that
 * RLS policies do not hide rows.
 */
export async function GET(request: Request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) return auth.error;
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Server is missing Supabase service role configuration" },
        { status: 500 }
      );
    }

    // NOTE: Only select columns that are confirmed to exist.
    // payment_method does NOT exist in security_deposits.
    console.log("[deposits/route] Starting security_deposits query...");

    // hub_id is metadata only — all admins see all deposits
    const { data: deposits, error: depositsErr } = await supabaseAdmin
      .from("security_deposits")
      .select(`
        id, rider_id, amount_paid, status,
        razorpay_payment_id,
        deductions, refund_amount,
        created_at, refunded_at
      `)
      .order("created_at", { ascending: false });

    if (depositsErr) {
      console.error("[deposits/route] Query FAILED:", depositsErr.message, depositsErr.code);
      return NextResponse.json({ error: depositsErr.message }, { status: 500 });
    }
    console.log("[deposits/route] Query OK, rows:", deposits?.length ?? 0);

    const rows = deposits ?? [];

    // Fetch rider names for all deposit rider_ids
    const riderIds = Array.from(new Set(rows.map((d) => d.rider_id).filter(Boolean)));
    const { data: riders } =
      riderIds.length > 0
        ? await supabaseAdmin
            .from("riders")
            .select("id, name, phone_1")
            .in("id", riderIds)
        : { data: [] };

    const riderById = new Map((riders ?? []).map((r) => [r.id, r]));

    const enriched = rows.map((d) => ({
      ...d,
      riders: riderById.get(d.rider_id)
        ? {
            name:    riderById.get(d.rider_id)!.name,
            phone_1: riderById.get(d.rider_id)!.phone_1,
          }
        : null,
    }));

    return NextResponse.json({ deposits: enriched });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
