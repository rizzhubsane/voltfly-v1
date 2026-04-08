import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";

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
        // Check if a kyc row already exists
        const { data: existing } = await supabaseAdmin
          .from("kyc")
          .select("id")
          .eq("rider_id", riderId)
          .maybeSingle();

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
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[patch-rider] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
