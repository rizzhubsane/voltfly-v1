import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/admin/dashboard
 *
 * Fetches all analytics data for the overview dashboard using the Supabase
 * service-role key so that RLS policies do not filter out rows when the
 * browser client only has the anon + user JWT.
 *
 * Returns: { hubs, riders, kycCounts, paymentCounts, batteryCounts,
 *            serviceCounts, vehicles, recentPayments, recentKyc,
 *            recentBatteryEvents, recentRiders }
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

    // Fire all queries in parallel for speed
    const [
      { data: hubs,              error: e0 },
      { data: riders,            error: e1 },
      { data: kycCounts,         error: e2 },
      { data: paymentCounts,     error: e3 },
      { data: batteryCounts,     error: e4 },
      { data: serviceCounts,     error: e5 },
      { data: vehicles,          error: e6 },
      { data: recentPayments,    error: e7 },
      { data: recentKyc,         error: e8 },
      { data: recentBatteryEvents, error: e9 },
      { data: recentRiders,      error: e10 },
    ] = await Promise.all([
      supabaseAdmin.from("hubs").select("id, name"),

      supabaseAdmin
        .from("riders")
        .select("id, name, status, hub_id, created_at, wallet_balance"),

      supabaseAdmin
        .from("kyc")
        .select("id, rider_id, kyc_status, created_at"),

      supabaseAdmin
        .from("payments")
        .select("id, rider_id, amount, plan_type, status, paid_at, due_date, created_at"),

      supabaseAdmin
        .from("batteries")
        .select("driver_id, status"),

      supabaseAdmin
        .from("service_requests")
        .select("rider_id, status"),

      supabaseAdmin
        .from("vehicles")
        .select("id, assigned_rider_id, hub_id"),

      // Activity feed — recent paid payments
      supabaseAdmin
        .from("payments")
        .select("id, rider_id, amount, created_at, status")
        .eq("status", "paid")
        .order("created_at", { ascending: false })
        .limit(10),

      // Activity feed — recent KYC submissions
      supabaseAdmin
        .from("kyc")
        .select("id, rider_id, kyc_status, created_at")
        .order("created_at", { ascending: false })
        .limit(10),

      // Activity feed — recent battery events
      supabaseAdmin
        .from("battery_events_log")
        .select("id, rider_id, action, created_at")
        .order("created_at", { ascending: false })
        .limit(10),

      // Activity feed — recently registered riders
      supabaseAdmin
        .from("riders")
        .select("id, name, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    // Log any individual query errors server-side but don't fail the whole request
    const errors = [e0, e1, e2, e3, e4, e5, e6, e7, e8, e9, e10];
    errors.forEach((err, i) => {
      if (err) console.error(`[dashboard/route] Query ${i} error:`, err.message);
    });

    return NextResponse.json({
      hubs:                hubs              ?? [],
      riders:              riders            ?? [],
      kycCounts:           kycCounts         ?? [],
      paymentCounts:       paymentCounts     ?? [],
      batteryCounts:       batteryCounts     ?? [],
      serviceCounts:       serviceCounts     ?? [],
      vehicles:            vehicles          ?? [],
      recentPayments:      recentPayments    ?? [],
      recentKyc:           recentKyc         ?? [],
      recentBatteryEvents: recentBatteryEvents ?? [],
      recentRiders:        recentRiders      ?? [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[dashboard/route] Fatal error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
