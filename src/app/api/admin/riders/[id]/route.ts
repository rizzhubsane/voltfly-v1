import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";
import { getErrorMessage, logPostgrestError } from "@/lib/errorMessage";
import { logAdminActivity } from "@/lib/logAdminActivity";

export const dynamic = "force-dynamic";

const RIDER_ALLOWED_FIELDS = [
  "name", "phone_1", "phone_2", "hub_id", "driver_id", "status", "created_at", "gig_company", "admin_notes",
  // PIN auth management fields — cleared by admin to reset a rider's access code
  "access_code_hash", "failed_attempts", "locked_until",
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) return auth.error;

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Missing admin config" }, { status: 500 });
    }

    const { id: riderId } = await params;
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

      // ── Guard: prevent direct status → 'active' bypass without wallet_balance ──
      // Setting a rider to 'active' without going through offline onboard means
      // they have no wallet_balance → they never appear as overdue → free rides.
      // The correct path is: kyc_approved → use Offline Onboard flow → active.
      if (sanitized.status === "active") {
        const { data: currentRider } = await supabaseAdmin
          .from("riders")
          .select("wallet_balance")
          .eq("id", riderId)
          .single();

        const hasWalletBalance = currentRider?.wallet_balance != null;

        if (!hasWalletBalance) {
          return NextResponse.json(
            {
              error:
                "Cannot set status to 'active' without a valid wallet balance. Use the Offline Onboard flow instead to activate this rider.",
            },
            { status: 400 }
          );
        }
      }

      if (sanitized.status === "exited") {
        sanitized.driver_id = null;
      }

      if (Object.keys(sanitized).length > 0) {
        const { error } = await supabaseAdmin
          .from("riders")
          .update(sanitized)
          .eq("id", riderId);
        if (error) throw error;

        if (sanitized.status === "exited") {
          const { error: vehicleErr } = await supabaseAdmin
            .from("vehicles")
            .update({ assigned_rider_id: null, assigned_at: null })
            .eq("assigned_rider_id", riderId);
          if (vehicleErr) throw vehicleErr;
        }
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
            .insert({ rider_id: riderId, kyc_status: "submitted", ...sanitizedKyc });
          if (error) throw error;
        }
      }
    }

    // ── Log admin activity ────────────────────────────────────────────────
    const adminName = auth.admin.name ?? auth.admin.email ?? "Admin";
    const changedSections: string[] = [];
    if (riderUpdates && Object.keys(riderUpdates).length > 0) changedSections.push("profile");
    if (kycUpdates && Object.keys(kycUpdates).length > 0) changedSections.push("KYC");

    await logAdminActivity(supabaseAdmin, {
      admin_id: auth.admin.id,
      admin_name: adminName,
      action_type: "rider_profile_edit",
      entity_type: "rider",
      entity_id: riderId,
      rider_id: riderId,
      description: `Updated rider ${changedSections.join(" & ")} fields`,
      metadata: {
        rider_fields: riderUpdates ? Object.keys(riderUpdates) : [],
        kyc_fields: kycUpdates ? Object.keys(kycUpdates) : [],
        status_change: riderUpdates?.status ?? null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    logPostgrestError("patch-rider", err);
    const message = getErrorMessage(err);
    console.error("[patch-rider] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
