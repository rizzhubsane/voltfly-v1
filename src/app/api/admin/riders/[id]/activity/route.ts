import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errorMessage";
import type { Database } from "@/lib/types";

type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/admin/riders/[id]/activity
 *
 * Fetches the payments, security_deposits, service_requests, and battery_events
 * for a specific rider. Uses the service role key to bypass RLS.
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
    const [paymentsRes, depositsRes, serviceRes, batteryEventsRes, riderRes, kycRes] = await Promise.all([
      supabaseAdmin
        .from("payments")
        .select("*")
        .eq("rider_id", riderId)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("security_deposits")
        .select("id, rider_id, amount_paid, status, created_at")
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
        .select("id, driver_id, hubs(name), added_by, admin_notes")
        .eq("id", riderId)
        .single(),
      supabaseAdmin
        .from("kyc")
        .select("*")
        .eq("rider_id", riderId)
        .maybeSingle(),
    ]);

    // Normalize payments rows
    const paymentRows = (paymentsRes.data || []).map((p: PaymentRow) => ({
      ...p,
      payment_method: p.method,
      payment_date: p.paid_at || p.created_at,
    }));

    // Security deposits are now fully logged in the 'payments' table directly,
    // so we no longer need to synthesize them from the 'security_deposits' table.

    // Merge and sort by date descending
    const allPayments = [...paymentRows].sort(
      (a, b) => new Date(b.payment_date ?? b.created_at ?? "1970-01-01").getTime() - new Date(a.payment_date ?? a.created_at ?? "1970-01-01").getTime()
    );

    return NextResponse.json({
      payments: allPayments,
      service_requests: serviceRes.data || [],
      battery_events: batteryEventsRes.data || [],
      rider_info: riderRes.data || null,
      kyc: kycRes.data || null,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
