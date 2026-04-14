import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";
import { PRICING } from "@/lib/pricingConstants";

/**
 * POST /api/admin/riders/offline-onboard
 *
 * Handles the "Offline Onboarding" flow where a rider pays partial or full
 * cash at the hub. The admin enters the cash received, and the system:
 *   1. Records the security deposit (₹2,000) in security_deposits table
 *   2. Records the onboarding fee (₹190) as a paid payment record
 *   3. Records any rental credit as a paid payment record
 *   4. If outstanding_balance > 0, creates a PENDING payment record so the
 *      debt is visible in the rider's payment history (NOT just a silent field)
 *   5. Sets outstanding_balance = max(0, FULL_ONBOARDING - cashReceived)
 *   6. Activates the rider: status='active', wallet_balance=rentalCredit, hub_id
 */
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

    if (cash < PRICING.MINIMUM_ONBOARD_CASH) {
      return NextResponse.json(
        {
          error: `Minimum cash required is ₹${PRICING.MINIMUM_ONBOARD_CASH} (₹${PRICING.SECURITY_DEPOSIT} deposit + ₹${PRICING.ONBOARDING_FEES} fees)`,
        },
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
    const rentalCredit = Math.max(0, cash - PRICING.SECURITY_DEPOSIT - PRICING.ONBOARDING_FEES);
    const outstandingBalance = Math.max(0, PRICING.FULL_ONBOARDING - cash);

    const now = new Date();
    const nowISO = now.toISOString();

    const onboardingNote = `Offline onboarding — ₹${cash} cash received. Deposit: ₹${PRICING.SECURITY_DEPOSIT}. Fee: ₹${PRICING.ONBOARDING_FEES}. Rental credit: ₹${rentalCredit}. Outstanding: ₹${outstandingBalance}.`;

    // ── Step 1: Record security deposit ──────────────────────────────────
    const { error: depositErr } = await supabaseAdmin
      .from("security_deposits")
      .upsert(
        {
          rider_id: riderId,
          amount: PRICING.SECURITY_DEPOSIT,
          amount_paid: PRICING.SECURITY_DEPOSIT,
          status: "held",
          created_at: nowISO,
        },
        { onConflict: "rider_id" }
      );

    if (depositErr) {
      console.error("[offline-onboard] security_deposits error:", depositErr.message);
      // Non-fatal — continue
    }

    // ── Step 2: Record onboarding fee payment ─────────────────────────────
    const { error: feeErr } = await supabaseAdmin
      .from("payments")
      .insert({
        rider_id: riderId,
        amount: PRICING.ONBOARDING_FEES,
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

    // ── Step 3: Record rental credit payment (if any) ─────────────────────
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
          
          recorded_by: adminId,
          notes: onboardingNote,
          created_at: nowISO,
        });

      if (paymentErr) {
        console.error("[offline-onboard] payment insert error:", paymentErr.message);
      }
    }

    // ── Step 4: Create a PENDING payment record for any outstanding balance ──
    // This is the key fix: outstanding balance must be VISIBLE in payment history,
    // not just a silent number on the rider row.
    if (outstandingBalance > 0) {
      const { error: pendingErr } = await supabaseAdmin
        .from("payments")
        .insert({
          rider_id: riderId,
          amount: outstandingBalance,
          plan_type: "outstanding_balance",
          method: "cash",
          status: "pending",
          paid_at: null,
           // expected to be cleared by the next payment
          recorded_by: adminId,
          notes: `Outstanding balance from offline onboarding. Rider paid ₹${cash} of ₹${PRICING.FULL_ONBOARDING} due. Remaining: ₹${outstandingBalance}.`,
          created_at: nowISO,
        });

      if (pendingErr) {
        console.error("[offline-onboard] pending outstanding insert error:", pendingErr.message);
      }
    }

    // ── Step 5: Activate rider ────────────────────────────────────────────
    const riderUpdate: Record<string, unknown> = {
      status: "active",
      wallet_balance: rentalCredit - outstandingBalance,
      daily_deduction_rate: 230,
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
      `[offline-onboard] Rider ${riderId} activated. Cash: ₹${cash}, Outstanding: ₹${outstandingBalance}, Wallet Balance: ₹${rentalCredit - outstandingBalance}`
    );

    return NextResponse.json({
      success: true,
      rider_id: riderId,
      cash_received: cash,
      security_deposit: PRICING.SECURITY_DEPOSIT,
      onboarding_fees: PRICING.ONBOARDING_FEES,
      rental_credit: rentalCredit,
      outstanding_balance: outstandingBalance,
      wallet_balance: rentalCredit - outstandingBalance,
      grant_days: days,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[offline-onboard] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
