import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";

type ReviewAction = "approve" | "reject";

interface ReviewBody {
  kycId: string;
  riderId: string;
  action: ReviewAction;
  reason?: string;
}

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

    const body = (await request.json()) as ReviewBody;
    const { kycId, riderId, action, reason } = body;
    // Always derive reviewer from the verified auth token — never trust the request body.
    const reviewer = auth.admin.id;

    if (!kycId || !riderId || !action) {
      return NextResponse.json(
        { error: "kycId, riderId and action are required" },
        { status: 400 }
      );
    }

    if (action === "reject" && !reason?.trim()) {
      return NextResponse.json(
        { error: "Rejection reason is required" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const reviewedBy = reviewer || null;
    const kycStatus = action === "approve" ? "approved" : "rejected";
    const riderStatus = action === "approve" ? "kyc_approved" : "kyc_rejected";

    const { error: kycError } = await supabaseAdmin
      .from("kyc")
      .update({
        kyc_status: kycStatus,
        rejection_reason: action === "reject" ? reason?.trim() : null,
        reviewed_by: reviewedBy,
        reviewed_at: now,
      })
      .eq("id", kycId);
    if (kycError) throw kycError;

    // Update rider status (always present in both apps).
    const { error: riderError } = await supabaseAdmin
      .from("riders")
      .update({ status: riderStatus })
      .eq("id", riderId);
    if (riderError) throw riderError;

    // Best-effort sync for deployments that also have riders.kyc_status.
    const { error: riderKycError } = await supabaseAdmin
      .from("riders")
      .update({ kyc_status: kycStatus } as unknown as Record<string, unknown>)
      .eq("id", riderId);
    if (
      riderKycError &&
      riderKycError.code !== "42703" &&
      riderKycError.code !== "PGRST204"
    ) {
      throw riderKycError;
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message =
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : error instanceof Error
          ? error.message
          : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

