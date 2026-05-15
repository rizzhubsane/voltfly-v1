import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/admin/payments?type=list|overdue|deposits|hubs
 *
 * hub_manager role sees ALL data (no hub isolation) — hub_id is metadata only.
 * hub_manager cannot log cash payments (POST blocked below).
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
      const { data: deps, error: depsErr } = await supabaseAdmin
        .from("security_deposits")
        .select("id, rider_id, amount_paid, status, created_at")
        .order("created_at", { ascending: false });
      if (depsErr) return NextResponse.json({ error: depsErr.message }, { status: 500 });

      const rows     = deps ?? [];
      const riderIds = Array.from(new Set(rows.map((d) => d.rider_id).filter(Boolean)));
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
      const { data: riders, error: ridersErr } = await supabaseAdmin
        .from("riders")
        .select("id, name, phone_1, status, wallet_balance, daily_deduction_rate")
        .in("status", ["active", "suspended"]);
      if (ridersErr) return NextResponse.json({ error: ridersErr.message }, { status: 500 });

      const riderList = (riders ?? []).map((r) => {
        const DAILY_RATE = r.daily_deduction_rate ?? 230;
        const wBalance = r.wallet_balance ?? 0;
        const isOverdue = wBalance <= 0;
        const estimatedOverdueAmount = isOverdue ? Math.abs(wBalance) : 0;
        const daysOverdue = isOverdue ? Math.floor(estimatedOverdueAmount / DAILY_RATE) : 0;
        const hoursOverdue = isOverdue ? daysOverdue * 24 + 1 : 0;

        return {
          ...r,
          days_overdue: daysOverdue,
          hours_overdue: hoursOverdue,
          estimated_overdue_amount: estimatedOverdueAmount,
          is_overdue: isOverdue,
          auto_block_eligible: isOverdue,
        };
      });

      const riderIds = riderList.map((r) => r.id);
      if (riderIds.length === 0) return NextResponse.json({ riders: [], batteries: [] });

      const { data: batteries } = await supabaseAdmin
        .from("batteries")
        .select("current_rider_id, status, driver_id")
        .in("current_rider_id", riderIds);

      return NextResponse.json({ riders: riderList, batteries: batteries ?? [] });
    }

    // ── Payments List ────────────────────────────────────────────────────
    const { data: payments, error: paymentsErr } = await supabaseAdmin
      .from("payments")
      .select("id, rider_id, amount, plan_type, method, paid_at, due_date, status, notes, created_at")
      .order("created_at", { ascending: false });

    if (paymentsErr) {
      return NextResponse.json({ error: paymentsErr.message }, { status: 500 });
    }

    const rows = payments ?? [];
    const riderIdsForPayment = Array.from(new Set(rows.map((p) => p.rider_id).filter(Boolean)));

    const { data: ridersData } = riderIdsForPayment.length > 0
      ? await supabaseAdmin
          .from("riders")
          .select("id, name, phone_1, hub_id")
          .in("id", riderIdsForPayment)
      : { data: [] };

    const riderByIdList = new Map((ridersData ?? []).map((r) => [r.id, r]));
    const enrichedList  = rows.map((p) => ({
      ...p,
      riders: riderByIdList.get(p.rider_id)
        ? {
            name:    riderByIdList.get(p.rider_id)!.name,
            phone_1: riderByIdList.get(p.rider_id)!.phone_1,
            hub_id:  riderByIdList.get(p.rider_id)!.hub_id,
          }
        : null,
    }));

    return NextResponse.json({ payments: enrichedList });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
