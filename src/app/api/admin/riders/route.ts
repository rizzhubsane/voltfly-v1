import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";

const KYC_ALLOWED_TEXT_FIELDS = [
  "aadhaar_number", "pan_number", "address_local", "address_village",
  "ref1_name", "ref1_phone", "ref2_name", "ref2_phone", "ref3_name", "ref3_phone",
] as const;

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Lists riders for the admin dashboard using the service role so RLS
 * does not hide rows when the browser client only has anon + user JWT.
 *
 * Enriches each rider with:
 *   vehicle_id  — from the vehicles table (vehicle assigned to this rider)
 *   driver_id   — directly from riders.driver_id (Upgrid ID stored on the rider)
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

    const url = new URL(request.url);
    const hubId = url.searchParams.get("hubId");

    let query = supabaseAdmin
      .from("riders")
      .select("*") // includes driver_id since it's now a column on riders
      .order("created_at", { ascending: false });

    // Hub managers are scoped to their own hub regardless of the query param.
    if (auth.admin.role === "hub_manager" && auth.admin.hub_id) {
      query = query.eq("hub_id", auth.admin.hub_id);
    } else if (hubId) {
      query = query.eq("hub_id", hubId);
    }

    const { data: riderRows, error: riderError } = await query;
    if (riderError) throw riderError;

    const riderIds = (riderRows || []).map((r) => r.id);

    const hubIds = Array.from(
      new Set(
        (riderRows || [])
          .map((r) => r.hub_id)
          .filter((id): id is string => id !== null && id !== undefined)
      )
    );

    // Fetch hubs and vehicles in parallel (driver_id is now on riders directly)
    const [hubResult, vehicleResult] = await Promise.all([
      hubIds.length > 0
        ? supabaseAdmin.from("hubs").select("id, name").in("id", hubIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),

      riderIds.length > 0
        ? supabaseAdmin
            .from("vehicles")
            .select("assigned_rider_id, vehicle_id, chassis_number")
            .in("assigned_rider_id", riderIds)
        : Promise.resolve({
            data: [] as { assigned_rider_id: string | null; vehicle_id: string | null; chassis_number: string }[],
            error: null,
          }),
    ]);

    if (hubResult.error) throw hubResult.error;
    if (vehicleResult.error) throw vehicleResult.error;

    const hubById = new Map((hubResult.data || []).map((h) => [h.id, h.name]));

    // vehicle_id: prefer vehicle_id field, fall back to chassis_number
    const vehicleByRider = new Map(
      (vehicleResult.data || [])
        .filter((v) => v.assigned_rider_id !== null)
        .map((v) => [
          v.assigned_rider_id as string,
          v.vehicle_id || v.chassis_number || null,
        ])
    );

    const riders = (riderRows || []).map((r) => ({
      ...r,
      hubs: r.hub_id && hubById.get(r.hub_id) ? { name: hubById.get(r.hub_id)! } : null,
      // vehicle_id is joined from vehicles; driver_id comes from r.driver_id directly
      vehicle_id: vehicleByRider.get(r.id) ?? null,
      // driver_id is already on r from SELECT *, kept here as alias for clarity
      driver_id: (r as Record<string, unknown>).driver_id ?? null,
    }));

    return NextResponse.json({ riders });
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

/**
 * POST /api/admin/riders
 *
 * Manually creates a new rider record (text details only — no document uploads).
 * Optionally creates a corresponding kyc row if any KYC text fields are provided.
 *
 * Body: {
 *   name: string          // required
 *   phone_1: string       // required
 *   phone_2?: string
 *   hub_id?: string
 *   driver_id?: string    // UpGrid driver ID
 *   status?: string       // default: "pending_kyc"
 *   kyc?: {               // optional — text KYC fields only
 *     aadhaar_number?, pan_number?, address_local?, address_village?,
 *     ref1_name?, ref1_phone?, ref2_name?, ref2_phone?, ref3_name?, ref3_phone?
 *   }
 * }
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
    const { name, phone_1, phone_2, hub_id, driver_id, status, kyc } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Full name is required" }, { status: 400 });
    }
    if (!phone_1?.trim()) {
      return NextResponse.json({ error: "Primary phone number is required" }, { status: 400 });
    }

    // Hub managers can only add riders to their own hub
    const effectiveHubId =
      auth.admin.role === "hub_manager" && auth.admin.hub_id
        ? auth.admin.hub_id
        : hub_id || null;

    // Check for duplicate phone number
    const { data: existing } = await supabaseAdmin
      .from("riders")
      .select("id")
      .eq("phone_1", phone_1.trim())
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "A rider with this phone number already exists" },
        { status: 409 }
      );
    }

    // Insert rider
    const { data: rider, error: riderError } = await supabaseAdmin
      .from("riders")
      .insert({
        name: name.trim(),
        phone_1: phone_1.trim(),
        phone_2: phone_2?.trim() || null,
        hub_id: effectiveHubId,
        driver_id: driver_id?.trim() || null,
        status: status || "pending_kyc",
        outstanding_balance: 0,
      })
      .select()
      .single();

    if (riderError) throw riderError;

    // If any KYC text fields were provided, create the kyc row
    if (kyc && rider) {
      const kycData: Record<string, unknown> = {
        rider_id: rider.id,
        kyc_status: status === "kyc_approved" ? "approved" : "pending",
      };

      for (const field of KYC_ALLOWED_TEXT_FIELDS) {
        const val = (kyc as Record<string, unknown>)[field];
        if (typeof val === "string" && val.trim()) {
          kycData[field] = val.trim();
        }
      }

      const { error: kycError } = await supabaseAdmin.from("kyc").insert(kycData);
      if (kycError) {
        // Non-fatal: rider is already created — log and continue
        console.error("[add-rider] KYC insert error:", kycError.message);
      }
    }

    return NextResponse.json({ success: true, rider });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[add-rider] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
