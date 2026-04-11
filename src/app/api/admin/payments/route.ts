import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/admin/payments?type=list|overdue|deposits|hubs
 *
 * Returns payment data using the service-role key so that RLS does not block rows.
 * The "type" query param controls which dataset is returned.
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

    const url  = new URL(request.url);
    const type = url.searchParams.get("type") ?? "list";

    const isHubManager = auth.admin.role === "hub_manager" && !!auth.admin.hub_id;

    // ── Hubs ──────────────────────────────────────────────────────────────
    if (type === "hubs") {
      const { data, error } = await supabaseAdmin
        .from("hubs")
        .select("id, name")
        .order("name", { ascending: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ hubs: data ?? [] });
    }

    // ── Security Deposits ─────────────────────────────────────────────────
    if (type === "deposits") {
      // Hub managers only see deposits for riders in their hub.
      let hubRiderIds: string[] | null = null;
      if (isHubManager) {
        const { data: hubRiders } = await supabaseAdmin
          .from("riders")
          .select("id")
          .eq("hub_id", auth.admin.hub_id!);
        hubRiderIds = (hubRiders ?? []).map((r) => r.id);
        if (hubRiderIds.length === 0) return NextResponse.json({ deposits: [] });
      }

      let depsQuery = supabaseAdmin
        .from("security_deposits")
        .select("id, rider_id, amount_paid, status, created_at")
        .order("created_at", { ascending: false });
      if (hubRiderIds) depsQuery = depsQuery.in("rider_id", hubRiderIds);

      const { data: deps, error: depsErr } = await depsQuery;
      if (depsErr) return NextResponse.json({ error: depsErr.message }, { status: 500 });

      const rows      = deps ?? [];
      const riderIds  = Array.from(new Set(rows.map((d) => d.rider_id).filter(Boolean)));
      const { data: riders } = riderIds.length > 0
        ? await supabaseAdmin.from("riders").select("id, name").in("id", riderIds)
        : { data: [] };

      const riderById = new Map((riders ?? []).map((r) => [r.id, r]));
      const enriched  = rows.map((d) => ({
        ...d,
        riders: riderById.get(d.rider_id) ? { name: riderById.get(d.rider_id)!.name } : null,
      }));
      return NextResponse.json({ deposits: enriched });
    }

    // ── Overdue riders ────────────────────────────────────────────────────
    if (type === "overdue") {
      // Return riders with computed overdue metrics.
      // All overdue calculations are done server-side so the admin UI doesn't
      // need to compute them — preventing drift and ensuring consistency.
      const DAILY_RATE = 250;
      const GRACE_PERIOD_HOURS = 24; // rider is considered overdue after this window

      let overdueQuery = supabaseAdmin
        .from("riders")
        .select("id, name, phone_1, status, valid_until, outstanding_balance")
        .in("status", ["active", "suspended"]);
      // Hub managers only see their hub's riders.
      if (isHubManager) overdueQuery = overdueQuery.eq("hub_id", auth.admin.hub_id!);

      const { data: riders, error: ridersErr } = await overdueQuery;
      if (ridersErr) return NextResponse.json({ error: ridersErr.message }, { status: 500 });

      const now = new Date();
      const riderList = (riders ?? []).map((r) => {
        const validUntil = r.valid_until ? new Date(r.valid_until) : null;
        const msOverdue = validUntil ? Math.max(0, now.getTime() - validUntil.getTime()) : 0;
        const daysOverdue = validUntil ? Math.floor(msOverdue / (1000 * 60 * 60 * 24)) : 0;
        const hoursOverdue = validUntil ? Math.floor(msOverdue / (1000 * 60 * 60)) : 0;
        const subscriptionOwed = daysOverdue * DAILY_RATE;
        const estimatedOverdueAmount = Math.max(subscriptionOwed, r.outstanding_balance ?? 0);
        const isOverdue = validUntil ? validUntil < now : false;
        const autoBlockEligible = hoursOverdue >= GRACE_PERIOD_HOURS;

        return {
          ...r,
          days_overdue: daysOverdue,
          hours_overdue: hoursOverdue,
          estimated_overdue_amount: estimatedOverdueAmount,
          is_overdue: isOverdue,
          auto_block_eligible: autoBlockEligible,
        };
      });

      const riderIds = riderList.map((r) => r.id);
      if (riderIds.length === 0) return NextResponse.json({ riders: [], batteries: [] });

      const { data: batteries } = await supabaseAdmin
        .from("batteries")
        .select("current_rider_id, status, driver_id")
        .in("current_rider_id", riderIds);

      return NextResponse.json({
        riders:    riderList,
        batteries: batteries ?? [],
      });
    }

    // Full payments list — includes both cash (method set by admin)
    // and Razorpay (paid_at/due_date set by edge function). Order by created_at (always set).
    console.log("[payments/route] Fetching payments list...");

    // Hub managers only see payments for riders in their hub.
    let hubRiderIdsForList: string[] | null = null;
    if (isHubManager) {
      const { data: hubRiders } = await supabaseAdmin
        .from("riders")
        .select("id")
        .eq("hub_id", auth.admin.hub_id!);
      hubRiderIdsForList = (hubRiders ?? []).map((r) => r.id);
      if (hubRiderIdsForList.length === 0) return NextResponse.json({ payments: [] });
    }

    let paymentsQuery = supabaseAdmin
      .from("payments")
      .select("id, rider_id, amount, plan_type, method, paid_at, due_date, status, notes, created_at")
      .order("created_at", { ascending: false });
    if (hubRiderIdsForList) paymentsQuery = paymentsQuery.in("rider_id", hubRiderIdsForList);

    const { data: payments, error: paymentsErr } = await paymentsQuery;

    if (paymentsErr) {
      console.error("[payments/route] List query FAILED:", paymentsErr.message, paymentsErr.code);
      return NextResponse.json({ error: paymentsErr.message }, { status: 500 });
    }
    console.log("[payments/route] List query OK, rows:", payments?.length ?? 0);

    const rows     = payments ?? [];
    const riderIds = Array.from(new Set(rows.map((p) => p.rider_id).filter(Boolean)));

    const { data: riders } = riderIds.length > 0
      ? await supabaseAdmin
          .from("riders")
          .select("id, name, phone_1, hub_id")
          .in("id", riderIds)
      : { data: [] };

    const riderById = new Map((riders ?? []).map((r) => [r.id, r]));
    const enriched  = rows.map((p) => ({
      ...p,
      riders: riderById.get(p.rider_id)
        ? {
            name:    riderById.get(p.rider_id)!.name,
            phone_1: riderById.get(p.rider_id)!.phone_1,
            hub_id:  riderById.get(p.rider_id)!.hub_id,
          }
        : null,
    }));

    return NextResponse.json({ payments: enriched });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
