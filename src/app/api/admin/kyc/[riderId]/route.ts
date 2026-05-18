import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";
import { logAdminActivity } from "@/lib/logAdminActivity";

const ALLOWED_FIELDS = new Set([
  "photo_url",
  "aadhaar_front_url",
  "aadhaar_back_url",
  "pan_url",
  "pcc_url",
]);

/**
 * PATCH /api/admin/kyc/[riderId]
 *
 * Allows a super_admin to upload or replace a KYC document for a rider.
 * Body: { field: string, base64: string }
 *   field  — one of the ALLOWED_FIELDS above
 *   base64 — full data URI: "data:image/jpeg;base64,..."
 *
 * Stores the base64 directly in the kyc table (same as the rider app does).
 * This bypasses the rider-facing save-kyc Edge Function and goes straight
 * to the DB via the service-role key.
 */
export async function PATCH(
  request: Request,
  { params }: { params: { riderId: string } }
) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) return auth.error;

    if (auth.admin.role !== "super_admin") {
      return NextResponse.json(
        { error: "Only super_admin can upload KYC documents" },
        { status: 403 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Server missing Supabase admin configuration" },
        { status: 500 }
      );
    }

    const { riderId } = params;
    const body = await request.json();
    const { field, base64 } = body as { field: string; base64: string };

    // Validate field
    if (!field || !ALLOWED_FIELDS.has(field)) {
      return NextResponse.json(
        { error: `Invalid field. Allowed: ${Array.from(ALLOWED_FIELDS).join(", ")}` },
        { status: 400 }
      );
    }

    // Validate base64 data URI
    if (!base64 || !base64.startsWith("data:image/")) {
      return NextResponse.json(
        { error: "base64 must be a valid data URI (data:image/...;base64,...)" },
        { status: 400 }
      );
    }

    // Validate rider exists
    const { data: rider, error: riderErr } = await supabaseAdmin
      .from("riders")
      .select("id, name")
      .eq("id", riderId)
      .single();

    if (riderErr || !rider) {
      return NextResponse.json({ error: "Rider not found" }, { status: 404 });
    }

    // Upsert kyc row — same pattern as save-kyc Edge Function
    const { data: kyc, error: kycErr } = await supabaseAdmin
      .from("kyc")
      .upsert(
        { rider_id: riderId, [field]: base64 },
        { onConflict: "rider_id" }
      )
      .select()
      .single();

    if (kycErr) throw kycErr;

    // Log admin activity
    const fieldLabel: Record<string, string> = {
      photo_url: "Selfie / Photo",
      aadhaar_front_url: "Aadhaar Front",
      aadhaar_back_url: "Aadhaar Back",
      pan_url: "PAN Card",
      pcc_url: "Relative's ID Card",
    };

    await logAdminActivity(supabaseAdmin, {
      admin_id: auth.admin.id,
      admin_name: auth.admin.name ?? auth.admin.email ?? "Admin",
      action_type: "kyc_document_uploaded",
      entity_type: "rider",
      entity_id: riderId,
      rider_id: riderId,
      description: `Admin uploaded ${fieldLabel[field] ?? field} for rider ${rider.name}`,
      metadata: { field, rider_id: riderId },
    });

    return NextResponse.json({ success: true, kyc });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[kyc/upload] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
