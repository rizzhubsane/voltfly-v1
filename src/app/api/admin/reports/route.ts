import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/admin/reports
 *
 * Returns all analytics data for the Reports page, using the service-role
 * key so that RLS does not hide any rows.
 *
 * Returns:
 *  {
 *    payments: PaymentRow[],
 *    riders:   RiderRow[],
 *    kyc:      KycRow[],
 *    service_requests: ServiceRequestRow[],
 *    security_deposits: DepositRow[],
 *  }
 */
export async function GET(request: Request) {
  try {
    const auth = await verifyAdmin(request, "super_admin");
    if (auth.error) return auth.error;

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Server is missing Supabase service role configuration" },
        { status: 500 }
      );
    }

    // Run all queries in parallel for speed
    const [
      paymentsResult,
      ridersResult,
      kycResult,
      serviceRequestsResult,
      depositsResult,
    ] = await Promise.all([
      // Payments — the main revenue source
      (supabaseAdmin as any)
        .from("payments")
        .select("id, amount, plan_type, method, paid_at, created_at, status, rider_id")
        .order("created_at", { ascending: false }),

      // Riders — for rider stats (include hub join via separate lookup)
      (supabaseAdmin as any)
        .from("riders")
        .select("id, status, hub_id, created_at, payment_status, valid_until")
        .order("created_at", { ascending: false }),

      // KYC — for pending/approved/rejected counts
      (supabaseAdmin as any)
        .from("kyc")
        .select("id, kyc_status, created_at, rider_id"),

      // Service requests — for spare-parts revenue (paid via Razorpay in the rider app)
      (supabaseAdmin as any)
        .from("service_requests")
        .select("id, status, payment_status, total_parts_cost, charges, created_at, resolved_at")
        .order("created_at", { ascending: false }),

      // Security deposits — for deposit metrics
      supabaseAdmin
        .from("security_deposits")
        .select("id, rider_id, amount_paid, status, created_at"),
    ]);

    // Collect errors (non-fatal: return empty array and log)
    if (paymentsResult.error) console.error("[reports] payments:", paymentsResult.error.message);
    if (ridersResult.error)   console.error("[reports] riders:",   ridersResult.error.message);
    if (kycResult.error)      console.error("[reports] kyc:",      kycResult.error.message);
    if (serviceRequestsResult.error) console.error("[reports] service_requests:", serviceRequestsResult.error.message);
    if (depositsResult.error) console.error("[reports] security_deposits:", depositsResult.error.message);

    // Enrich riders with hub names
    const riders = (ridersResult.data as Record<string, any>[]) ?? [];
    const hubIds = Array.from(
      new Set(riders.map((r) => r.hub_id).filter((id): id is string => !!id))
    );

    const hubsResult = hubIds.length > 0
      ? await (supabaseAdmin as any).from("hubs").select("id, name").in("id", hubIds)
      : { data: [] as { id: string; name: string }[] };

    const hubById = new Map(((hubsResult.data as Record<string, any>[]) ?? []).map((h) => [h.id, h.name]));

    const ridersWithHub = riders.map((r) => ({
      ...r,
      hubs: r.hub_id && hubById.has(r.hub_id) ? { name: hubById.get(r.hub_id)! } : null,
    }));

    return NextResponse.json({
      payments:          paymentsResult.data          ?? [],
      riders:            ridersWithHub,
      kyc:               kycResult.data               ?? [],
      service_requests:  serviceRequestsResult.data   ?? [],
      security_deposits: depositsResult.data          ?? [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[reports] Unhandled error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
