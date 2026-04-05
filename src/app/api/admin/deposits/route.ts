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

    // Hub managers only see deposits for riders in their hub.
    let hubRiderIds: string[] | null = null;
    if (auth.admin.role === "hub_manager" && auth.admin.hub_id) {
      const { data: hubRiders } = await supabaseAdmin
        .from("riders")
        .select("id")
        .eq("hub_id", auth.admin.hub_id);
      hubRiderIds = (hubRiders ?? []).map((r) => r.id);
      if (hubRiderIds.length === 0) return NextResponse.json({ deposits: [] });
    }

    let depositsQuery = supabaseAdmin
      .from("security_deposits")
      .select(`
        id, rider_id, amount_paid, status,
        razorpay_payment_id,
        deductions, refund_amount,
        created_at, refunded_at
      `)
      .order("created_at", { ascending: false });
    if (hubRiderIds) depositsQuery = depositsQuery.in("rider_id", hubRiderIds);

    const { data: deposits, error: depositsErr } = await depositsQuery;

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
