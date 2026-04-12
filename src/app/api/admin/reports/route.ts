import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";
import type { Database } from "@/lib/types";
import { getErrorMessage } from "@/lib/errorMessage";

type RiderRow = Database["public"]["Tables"]["riders"]["Row"];
type HubNameRow = { id: string; name: string };

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
      supabaseAdmin
        .from("payments")
        .select("id, amount, plan_type, method, paid_at, created_at, status, rider_id")
        .order("created_at", { ascending: false }),

      supabaseAdmin
        .from("riders")
        .select("id, status, hub_id, created_at, payment_status, wallet_balance")
        .order("created_at", { ascending: false }),

      supabaseAdmin
        .from("kyc")
        .select("id, kyc_status, created_at, rider_id"),

      supabaseAdmin
        .from("service_requests")
        .select("id, status, payment_status, total_parts_cost, charges, created_at, resolved_at")
        .order("created_at", { ascending: false }),

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
    const riders = (ridersResult.data ?? []) as RiderRow[];
    const hubIds = Array.from(
      new Set(riders.map((r) => r.hub_id).filter((id): id is string => !!id))
    );

    const hubsResult =
      hubIds.length > 0
        ? await supabaseAdmin.from("hubs").select("id, name").in("id", hubIds)
        : { data: [] as HubNameRow[] };

    const hubById = new Map(
      ((hubsResult.data ?? []) as HubNameRow[]).map((h) => [h.id, h.name])
    );

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
    const message = getErrorMessage(err);
    console.error("[reports] Unhandled error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
