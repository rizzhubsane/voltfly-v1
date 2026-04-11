import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";
import { getErrorMessage, logPostgrestError } from "@/lib/errorMessage";

export const dynamic = "force-dynamic";

const RIDER_ALLOWED_FIELDS = [
  "name", "phone_1", "phone_2", "hub_id", "driver_id", "status", "created_at",
] as const;

const KYC_ALLOWED_FIELDS = [
  "aadhaar_number", "pan_number", "address_local", "address_village",
  "ref1_name", "ref1_phone", "ref2_name", "ref2_phone",
  "ref3_name", "ref3_phone", "kyc_status",
] as const;

/**
 * PATCH /api/admin/riders/[id]
 *
 * Updates rider profile details and/or KYC text fields.
 * Body: {
 *   rider?: Partial<{ name, phone_1, phone_2, hub_id, driver_id, status }>
 *   kyc?:   Partial<{ aadhaar_number, pan_number, address_local, address_village,
 *                     ref1_name, ref1_phone, ref2_name, ref2_phone,
 *                     ref3_name, ref3_phone, kyc_status }>
 * }
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) return auth.error;

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Missing admin config" }, { status: 500 });
    }

    const riderId = params.id;
    if (!riderId) {
      return NextResponse.json({ error: "Rider ID is required" }, { status: 400 });
    }

    const body = await request.json();
    const { rider: riderUpdates, kyc: kycUpdates } = body as {
      rider?: Record<string, unknown>;
      kyc?: Record<string, unknown>;
    };

    // ── Update rider fields ───────────────────────────────────────────────
    if (riderUpdates && Object.keys(riderUpdates).length > 0) {
      const sanitized: Record<string, unknown> = {};
      for (const field of RIDER_ALLOWED_FIELDS) {
        if (field in riderUpdates) {
          // Allow explicit null for optional fields (phone_2, hub_id, driver_id)
          sanitized[field] = riderUpdates[field] === "" ? null : riderUpdates[field];
        }
      }

      // Normalise created_at: accept "YYYY-MM-DD" from the date picker and
      // convert to a full ISO-8601 timestamp so Postgres is happy.
      if (sanitized.created_at && typeof sanitized.created_at === "string") {
        const d = new Date(sanitized.created_at);
        if (isNaN(d.getTime())) {
          return NextResponse.json({ error: "Invalid onboarding date" }, { status: 400 });
        }
        sanitized.created_at = d.toISOString();
      }

      // ── Guard: prevent direct status → 'active' bypass without valid_until ──
      // Setting a rider to 'active' without going through offline onboard means
      // they have no valid_until → they never appear as overdue → free rides.
      // The correct path is: kyc_approved → use Offline Onboard flow → active.
      if (sanitized.status === "active") {
        const { data: currentRider } = await supabaseAdmin
          .from("riders")
          .select("valid_until")
          .eq("id", riderId)
          .single();

        const hasValidUntil = !!currentRider?.valid_until;
        const settingValidUntilNow = false; // valid_until cannot be set via this route

        if (!hasValidUntil && !settingValidUntilNow) {
          return NextResponse.json(
            {
              error:
                "Cannot set status to 'active' without a valid subscription. Use the Offline Onboard flow instead to activate this rider.",
            },
            { status: 400 }
          );
        }
      }

      if (Object.keys(sanitized).length > 0) {
        const { error } = await supabaseAdmin
          .from("riders")
          .update(sanitized)
          .eq("id", riderId);
        if (error) throw error;
      }
    }

    // ── Update or insert KYC fields ───────────────────────────────────────
    if (kycUpdates && Object.keys(kycUpdates).length > 0) {
      const sanitizedKyc: Record<string, unknown> = {};
      for (const field of KYC_ALLOWED_FIELDS) {
        if (field in kycUpdates) {
          sanitizedKyc[field] = kycUpdates[field] === "" ? null : kycUpdates[field];
        }
      }

      if (Object.keys(sanitizedKyc).length > 0) {
        const { data: existingRows, error: kycLookupErr } = await supabaseAdmin
          .from("kyc")
          .select("id")
          .eq("rider_id", riderId)
          .limit(1);

        if (kycLookupErr) throw kycLookupErr;

        const existing = existingRows?.[0];
        if (existing) {
          const { error } = await supabaseAdmin
            .from("kyc")
            .update(sanitizedKyc)
            .eq("rider_id", riderId);
          if (error) throw error;
        } else {
          const { error } = await supabaseAdmin
            .from("kyc")
            .insert({ rider_id: riderId, kyc_status: "pending", ...sanitizedKyc });
          if (error) throw error;
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    logPostgrestError("patch-rider", err);
    const message = getErrorMessage(err);
    console.error("[patch-rider] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
