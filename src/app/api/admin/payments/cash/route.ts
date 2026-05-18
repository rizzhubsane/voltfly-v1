import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";
import { logAdminActivity } from "@/lib/logAdminActivity";
import { getOperatorPricing } from "@/lib/pricingConstants";

export async function POST(request: Request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) return auth.error;

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Server missing Supabase admin" }, { status: 500 });
    }

    const body = await request.json();
    const { riderId, amount, planType, paidAt, notes, method, operator } = body;
    const adminId = auth.admin.id;

    if (!riderId || !amount || !planType) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const paidDate = new Date(paidAt || new Date().toISOString());
    const nowISO   = new Date().toISOString();
    const adminName = auth.admin.name || auth.admin.email || "Admin";
    const paymentMethod = method || "cash";

    // ─────────────────────────────────────────────────────────────────────────
    // ONBOARDING PLAN — single payment row, background split
    // ─────────────────────────────────────────────────────────────────────────
    if (planType === "onboarding") {
      // 1. Fetch rider to verify status + get gig_company for pricing split
      const { data: rider, error: riderErr } = await supabaseAdmin
        .from("riders")
        .select("id, name, status, wallet_balance")
        .eq("id", riderId)
        .single() as { data: { id: string; name: string; status: string; wallet_balance: number | null } | null; error: unknown };

      if (riderErr || !rider) {
        return NextResponse.json({ error: "Rider not found" }, { status: 404 });
      }

      if (!["kyc_approved", "active"].includes(rider.status)) {
        return NextResponse.json(
          { error: `Rider status is '${rider.status}'. Onboarding payment is only allowed for kyc_approved or active riders.` },
          { status: 400 }
        );
      }

      const pricing = getOperatorPricing(operator === "indofast" ? "indofast" : null);

      if (amount < pricing.minimumOnboardCash) {
        return NextResponse.json(
          {
            error: `Minimum onboarding payment is ₹${pricing.minimumOnboardCash} (₹${pricing.securityDeposit} deposit + ₹${pricing.onboardingFee} fee).`,
          },
          { status: 400 }
        );
      }

      const rentalCredit = Math.max(0, amount - pricing.securityDeposit - pricing.onboardingFee);
      const breakdown = `₹${pricing.securityDeposit} deposit + ₹${pricing.onboardingFee} fee + ₹${rentalCredit} wallet credit`;

      // 2. Insert ONE payment row (total amount) — this is what accountants see
      const { data: payment, error: paymentError } = await supabaseAdmin
        .from("payments")
        .insert({
          rider_id:    riderId,
          amount:      amount,          // total received — single row
          plan_type:   "onboarding",
          method:      paymentMethod,
          status:      "paid",
          due_date:    paidDate.toISOString().slice(0, 10),
          paid_at:     paidDate.toISOString(),
          recorded_by: adminId,
          notes:       `Onboarding payment. Split: ${breakdown}. ${notes ? notes + " " : ""}(Logged by: ${adminName})`,
          created_at:  nowISO,
        })
        .select()
        .single();

      if (paymentError) throw paymentError;

      // 3. Record security deposit in security_deposits table
      await supabaseAdmin.from("security_deposits").upsert(
        {
          rider_id:    riderId,
          amount_paid: pricing.securityDeposit,
          status:      "held",
          created_at:  nowISO,
        },
        { onConflict: "rider_id" }
      );

      // 4. Activate rider + credit wallet with rental portion
      //    If rider is already active, just credit wallet and record deposit — don't change status
      const riderUpdate: Record<string, unknown> = {
        wallet_balance:       rentalCredit,
        daily_deduction_rate: pricing.dailyRate,
        payment_status:       "paid",
        outstanding_balance:  0,
      };
      if (rider.status === "kyc_approved") {
        riderUpdate.status = "active"; // only flip status if not already active
      }
      await supabaseAdmin.from("riders").update(riderUpdate).eq("id", riderId);

      // 5. Log wallet_transaction for the rental credit
      if (rentalCredit > 0) {
        await supabaseAdmin.from("wallet_transactions").insert({
          rider_id:       riderId,
          amount:         rentalCredit,
          type:           "rental_credit",
          balance_before: 0,
          balance_after:  rentalCredit,
          reference_id:   payment.id,
          notes:          `Onboarding rental credit (${pricing.operator}). Total received: ₹${amount}. ${breakdown}. Logged by ${adminName}`,
          created_at:     nowISO,
        });
      }

      // 6. Log admin activity
      await logAdminActivity(supabaseAdmin, {
        admin_id:    adminId,
        admin_name:  adminName,
        action_type: "payment_logged",
        entity_type: "payment",
        entity_id:   payment.id,
        rider_id:    riderId,
        description: `Onboarding payment ₹${amount} logged via ${paymentMethod} for ${rider.name}. ${breakdown}`,
        metadata: {
          amount,
          operator:         pricing.operator,
          security_deposit: pricing.securityDeposit,
          onboarding_fee:   pricing.onboardingFee,
          rental_credit:    rentalCredit,
          method:           paymentMethod,
          paid_at:          paidAt,
        },
      });

      return NextResponse.json({
        success:          true,
        payment,
        security_deposit: pricing.securityDeposit,
        onboarding_fee:   pricing.onboardingFee,
        rental_credit:    rentalCredit,
        new_wallet_balance: rentalCredit,
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WALLET TOP-UP — credits wallet directly (any amount)
    // ─────────────────────────────────────────────────────────────────────────
    if (planType === "wallet_topup") {
      // 1. Insert payment record
      const { data: payment, error: paymentError } = await supabaseAdmin
        .from("payments")
        .insert({
          rider_id:    riderId,
          amount:      amount,
          plan_type:   "wallet_topup",
          method:      paymentMethod,
          status:      "paid",
          due_date:    paidDate.toISOString().slice(0, 10),
          paid_at:     paidDate.toISOString(),
          recorded_by: adminId,
          notes:       notes
            ? `${notes} (Logged by: ${adminName})`
            : `Wallet top-up. Logged by: ${adminName}`,
          created_at:  nowISO,
        })
        .select()
        .single();

      if (paymentError) throw paymentError;

      // 2. Fetch current wallet
      const { data: rider } = await supabaseAdmin
        .from("riders")
        .select("wallet_balance, daily_deduction_rate")
        .eq("id", riderId)
        .single();

      const currentWallet = rider?.wallet_balance ?? 0;
      const dailyRate     = rider?.daily_deduction_rate ?? 230;

      // 3. Increment wallet atomically
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rpcData, error: rpcErr } = await (supabaseAdmin as any).rpc("increment_wallet", {
        rider_id: riderId,
        amount:   amount,
      });
      if (rpcErr) throw rpcErr;

      const walletAfter = Number(rpcData);

      // 4. Sync payment_status
      await supabaseAdmin
        .from("riders")
        .update({ payment_status: "paid", outstanding_balance: 0, daily_deduction_rate: dailyRate })
        .eq("id", riderId);

      // 5. Log wallet_transaction
      await supabaseAdmin.from("wallet_transactions").insert({
        rider_id:       riderId,
        amount:         amount,
        type:           "rental_credit",
        balance_before: currentWallet,
        balance_after:  walletAfter,
        reference_id:   payment.id,
        notes:          `Wallet top-up recorded by ${adminName}`,
        created_at:     nowISO,
      });

      // 6. Log admin activity
      await logAdminActivity(supabaseAdmin, {
        admin_id:    adminId,
        admin_name:  adminName,
        action_type: "payment_logged",
        entity_type: "payment",
        entity_id:   payment.id,
        rider_id:    riderId,
        description: `Wallet top-up ₹${amount} via ${paymentMethod}`,
        metadata: { amount, plan_type: "wallet_topup", method: paymentMethod, paid_at: paidAt, new_wallet_balance: walletAfter },
      });

      console.log(`[cash] Wallet top-up: Rider ${riderId}: ₹${currentWallet} → ₹${walletAfter} (+₹${amount})`);

      return NextResponse.json({ success: true, payment, new_wallet_balance: walletAfter });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SPARE PARTS / SERVICE — no wallet change, just logged
    // ─────────────────────────────────────────────────────────────────────────
    if (planType === "service") {
      const { data: payment, error: paymentError } = await supabaseAdmin
        .from("payments")
        .insert({
          rider_id:    riderId,
          amount:      amount,
          plan_type:   "service",
          method:      paymentMethod,
          status:      "paid",
          due_date:    paidDate.toISOString().slice(0, 10),
          paid_at:     paidDate.toISOString(),
          recorded_by: adminId,
          notes:       notes
            ? `${notes} (Logged by: ${adminName})`
            : `Spare parts / service charge. Logged by: ${adminName}`,
          created_at:  nowISO,
        })
        .select()
        .single();

      if (paymentError) throw paymentError;

      await logAdminActivity(supabaseAdmin, {
        admin_id:    adminId,
        admin_name:  adminName,
        action_type: "payment_logged",
        entity_type: "payment",
        entity_id:   payment.id,
        rider_id:    riderId,
        description: `Service/parts charge ₹${amount} via ${paymentMethod}`,
        metadata: { amount, plan_type: "service", method: paymentMethod, paid_at: paidAt },
      });

      return NextResponse.json({ success: true, payment, new_wallet_balance: null });
    }

    return NextResponse.json({ error: `Unknown planType: ${planType}` }, { status: 400 });

  } catch (error: unknown) {
    let message = "Unknown error";
    if (error instanceof Error) {
      message = error.message;
    } else if (error && typeof error === "object" && "message" in error) {
      message = String((error as { message: unknown }).message);
    }
    console.error("[cash] Error:", message, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
