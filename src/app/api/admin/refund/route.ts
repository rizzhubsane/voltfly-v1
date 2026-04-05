import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";

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

    const { depositId, refundAmount, deductions } = await request.json();
    // Always derive adminId from the verified auth token — never trust the request body.
    const adminId = auth.admin.id;

    if (!depositId || refundAmount === undefined) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (typeof refundAmount !== "number" || refundAmount < 0) {
      return NextResponse.json({ error: "refundAmount must be a non-negative number" }, { status: 400 });
    }

    // Validate refundAmount does not exceed the amount actually deposited.
    const { data: deposit, error: depositFetchErr } = await supabaseAdmin
      .from("security_deposits")
      .select("amount_paid, status")
      .eq("id", depositId)
      .single();

    if (depositFetchErr || !deposit) {
      return NextResponse.json({ error: "Deposit record not found" }, { status: 404 });
    }

    if (deposit.status === "refunded") {
      return NextResponse.json({ error: "This deposit has already been refunded" }, { status: 400 });
    }

    const maxRefund = deposit.amount_paid ?? 0;
    if (refundAmount > maxRefund) {
      return NextResponse.json(
        { error: `Refund amount (₹${refundAmount}) exceeds deposit amount (₹${maxRefund})` },
        { status: 400 }
      );
    }

    // 1. Placeholder for Razorpay Refund API call
    console.log(`Initiating refund for deposit ${depositId} of amount ${refundAmount}`);
    // const razorpayResponse = await razorpay.payments.refund(paymentId, { amount: refundAmount * 100 });

    // 2. Update security_deposits status
    const { error: updateError } = await supabaseAdmin
      .from("security_deposits")
      .update({
        status: "refund_initiated",
        deductions: deductions,
        refund_amount: refundAmount,
        processed_at: new Date().toISOString(),
        processed_by: adminId
      })
      .eq("id", depositId);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true, message: "Refund initiated successfully" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
