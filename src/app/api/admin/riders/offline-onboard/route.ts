import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";

/**
 * POST /api/admin/riders/offline-onboard
 *
 * Handles the "Offline Onboarding" flow where a rider pays partial cash
 * at the hub. The admin enters the cash received, and the system:
 *   1. Records the security deposit (₹2,000)
 *   2. Records onboarding fees (₹190 — implicit, not stored separately)
 *   3. Allocates remaining cash to rental credit
 *   4. Sets outstanding_balance = ₹3,800 - cashReceived
 *   5. Activates rider, sets valid_until, assigns hub
 */

const SECURITY_DEPOSIT = 2000;
const ONBOARDING_FEES  = 190; // handling ₹10 + verification ₹180
const FULL_ONBOARDING  = 3800;
const MINIMUM_CASH     = SECURITY_DEPOSIT + ONBOARDING_FEES; // ₹2,190

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
    const { riderId, cashReceived, grantDays, hubId } = body;
    const adminId = auth.admin.id;

    // ── Validation ────────────────────────────────────────────────────────
    if (!riderId || cashReceived == null || !grantDays) {
      return NextResponse.json(
        { error: "Missing required fields: riderId, cashReceived, grantDays" },
        { status: 400 }
      );
    }

    const cash = Number(cashReceived);
    const days = Number(grantDays);

    if (cash < MINIMUM_CASH) {
      return NextResponse.json(
        { error: `Minimum cash required is ₹${MINIMUM_CASH} (₹${SECURITY_DEPOSIT} deposit + ₹${ONBOARDING_FEES} fees)` },
        { status: 400 }
      );
    }

    if (days < 1 || days > 90) {
      return NextResponse.json(
        { error: "Grant days must be between 1 and 90" },
        { status: 400 }
      );
    }

    // ── Verify rider exists and is kyc_approved ───────────────────────────
    const { data: rider, error: riderErr } = await supabaseAdmin
      .from("riders")
      .select("id, status, name")
      .eq("id", riderId)
      .single();

    if (riderErr || !rider) {
      return NextResponse.json({ error: "Rider not found" }, { status: 404 });
    }

    if (rider.status !== "kyc_approved") {
      return NextResponse.json(
        { error: `Rider status is '${rider.status}', expected 'kyc_approved'` },
        { status: 400 }
      );
    }

    // ── Calculate the split ──────────────────────────────────────────────
    const rentalCredit = Math.max(0, cash - SECURITY_DEPOSIT - ONBOARDING_FEES);
    const outstandingBalance = Math.max(0, FULL_ONBOARDING - cash);

    const now = new Date();
    const nowISO = now.toISOString();
    const validUntil = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const validUntilISO = validUntil.toISOString();

    // ── Step 1: Record security deposit ──────────────────────────────────
    const { error: depositErr } = await supabaseAdmin
      .from("security_deposits")
      .upsert(
        {
          rider_id: riderId,
          amount: SECURITY_DEPOSIT,
          amount_paid: SECURITY_DEPOSIT,
          status: "held",
          created_at: nowISO,
        },
        { onConflict: "rider_id" }
      );

    if (depositErr) {
      console.error("[offline-onboard] security_deposits error:", depositErr.message);
    }

    // ── Step 2: Record rental payment (if any rental credit) ─────────────
    if (rentalCredit > 0) {
      const { error: paymentErr } = await supabaseAdmin
        .from("payments")
        .insert({
          rider_id: riderId,
          amount: rentalCredit,
          plan_type: "custom",
          method: "cash",
          status: "paid",
          paid_at: nowISO,
          due_date: validUntilISO,
          recorded_by: adminId,
          notes: `Offline onboarding — ₹${cash} cash received. Rental credit: ₹${rentalCredit}. Outstanding: ₹${outstandingBalance}.`,
          created_at: nowISO,
        });

      if (paymentErr) {
        console.error("[offline-onboard] payment insert error:", paymentErr.message);
      }
    }

    // ── Step 3: Record onboarding fee payment ────────────────────────────
    const { error: feeErr } = await supabaseAdmin
      .from("payments")
      .insert({
        rider_id: riderId,
        amount: ONBOARDING_FEES,
        plan_type: "onboarding_fee",
        method: "cash",
        status: "paid",
        paid_at: nowISO,
        due_date: nowISO,
        recorded_by: adminId,
        notes: "Offline onboarding fee (handling + verification)",
        created_at: nowISO,
      });

    if (feeErr) {
      console.error("[offline-onboard] onboarding fee insert error:", feeErr.message);
    }

    // ── Step 4: Activate rider ──────────────────────────────────────────
    const riderUpdate: Record<string, unknown> = {
      status: "active",
      valid_until: validUntilISO,
      outstanding_balance: outstandingBalance,
    };
    if (hubId) {
      riderUpdate.hub_id = hubId;
    }

    const { error: updateErr } = await supabaseAdmin
      .from("riders")
      .update(riderUpdate)
      .eq("id", riderId);

    if (updateErr) {
      console.error("[offline-onboard] rider update error:", updateErr.message);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    console.log(
      `[offline-onboard] Rider ${riderId} activated. Cash: ₹${cash}, Outstanding: ₹${outstandingBalance}, Valid until: ${validUntilISO}`
    );

    return NextResponse.json({
      success: true,
      rider_id: riderId,
      cash_received: cash,
      security_deposit: SECURITY_DEPOSIT,
      onboarding_fees: ONBOARDING_FEES,
      rental_credit: rentalCredit,
      outstanding_balance: outstandingBalance,
      valid_until: validUntilISO,
      grant_days: days,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[offline-onboard] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
