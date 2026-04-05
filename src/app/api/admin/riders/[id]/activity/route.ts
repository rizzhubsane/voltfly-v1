import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/admin/riders/[id]/activity
 *
 * Fetches the payments, service_requests, and battery_events for a specific rider.
 * Uses the service role key to bypass RLS, as client-side queries might be blocked.
 */
export async function GET(
  request: Request,
  context: { params: { id: string } }
) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) return auth.error;

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Server is missing Supabase service role configuration" },
        { status: 500 }
      );
    }

    const { id: riderId } = context.params;

    if (!riderId) {
      return NextResponse.json({ error: "Missing rider ID" }, { status: 400 });
    }

    // Fetch everything in parallel using the service role key so RLS is bypassed.
    // KYC is fetched here (not via the RPC) because the kyc table has rider-only
    // RLS policies — the admin's JWT would return null from the anon RPC.
    const [paymentsRes, serviceRes, batteryEventsRes, riderRes, kycRes] = await Promise.all([
      supabaseAdmin
        .from("payments")
        .select("*")
        .eq("rider_id", riderId)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("service_requests")
        .select("*")
        .eq("rider_id", riderId)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("battery_events_log")
        .select("id, rider_id, action, trigger_type, triggered_by, reason, created_at")
        .eq("rider_id", riderId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("riders")
        .select("id, driver_id, hubs(name)")
        .eq("id", riderId)
        .single(),
      supabaseAdmin
        .from("kyc")
        .select("*")
        .eq("rider_id", riderId)
        .maybeSingle(),
    ]);

    // Format payments
    const payments = (paymentsRes.data || []).map((p: any) => ({
      ...p,
      payment_method: p.method,
      payment_date: p.paid_at || p.created_at,
    }));

    return NextResponse.json({
      payments: payments,
      service_requests: serviceRes.data || [],
      battery_events: batteryEventsRes.data || [],
      rider_info: riderRes.data || null,
      kyc: kycRes.data || null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
