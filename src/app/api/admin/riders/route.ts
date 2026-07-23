import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";
import type { Database } from "@/lib/types";

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

    if (hubId) {
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

    let hubRows: { id: string; name: string }[] = [];
    if (hubIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("hubs")
        .select("id, name")
        .in("id", hubIds);
      if (error) {
        console.error("[riders/route] Hub enrichment failed:", error.message);
      } else {
        hubRows = data ?? [];
      }
    }

    type VehicleAssignment = {
      assigned_rider_id: string | null;
      vehicle_id?: string | null;
      chassis_number?: string | null;
      battery_operator?: string | null;
    };

    let vehicleRows: VehicleAssignment[] = [];
    if (riderIds.length > 0) {
      const riderIdSet = new Set(riderIds);
      const vehicleSelects = [
        "assigned_rider_id, vehicle_id, chassis_number, battery_operator",
        "assigned_rider_id, vehicle_id, chassis_number",
        "assigned_rider_id, vehicle_id",
      ];

      for (const select of vehicleSelects) {
        const { data, error } = await supabaseAdmin
          .from("vehicles")
          .select(select)
          .not("assigned_rider_id", "is", null);

        if (!error) {
          vehicleRows = ((data ?? []) as VehicleAssignment[]).filter(
            (v) => v.assigned_rider_id !== null && riderIdSet.has(v.assigned_rider_id)
          );
          break;
        }

        console.error(`[riders/route] Vehicle enrichment failed for "${select}":`, error.message);
      }
    }

    const hubById = new Map(hubRows.map((h) => [h.id, h.name]));

    // vehicle_id + battery_operator: prefer vehicle_id field, fall back to chassis_number
    const vehicleByRider = new Map(
      vehicleRows
        .filter((v) => v.assigned_rider_id !== null)
        .map((v) => [
          v.assigned_rider_id as string,
          {
            vehicle_id: v.vehicle_id || v.chassis_number || null,
            battery_operator: v.battery_operator ?? null,
          },
        ])
    );

    const riders = (riderRows || []).map((r) => ({
      ...r,
      hubs: r.hub_id && hubById.get(r.hub_id) ? { name: hubById.get(r.hub_id)! } : null,
      // vehicle_id and battery_operator joined from vehicles
      vehicle_id: vehicleByRider.get(r.id)?.vehicle_id ?? null,
      battery_operator: vehicleByRider.get(r.id)?.battery_operator ?? null,
      // driver_id is already on r from SELECT *, kept here as alias for clarity
      driver_id: (r as Record<string, unknown>).driver_id ?? null,
    }));

    riders.sort((a, b) => {
      const va = a.vehicle_id as string | null;
      const vb = b.vehicle_id as string | null;
      if (!va && !vb) return 0;
      if (!va) return 1;
      if (!vb) return -1;
      const ma = /^VFEL(\d+)$/i.exec(va.trim());
      const mb = /^VFEL(\d+)$/i.exec(vb.trim());
      if (ma && mb) return parseInt(ma[1], 10) - parseInt(mb[1], 10);
      if (ma && !mb) return -1;
      if (!ma && mb) return 1;
      return va.localeCompare(vb);
    });

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
    console.error("[riders/route] GET failed:", message, error);
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
    const { name, phone_1, phone_2, hub_id, driver_id, status, kyc, created_at } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Full name is required" }, { status: 400 });
    }
    if (!phone_1?.trim()) {
      return NextResponse.json({ error: "Primary phone number is required" }, { status: 400 });
    }

    const effectiveHubId = hub_id || null;

    // Check for duplicate phone number
    const { data: existingPhone } = await supabaseAdmin
      .from("riders")
      .select("id")
      .eq("phone_1", phone_1.trim())
      .maybeSingle();

    if (existingPhone) {
      return NextResponse.json(
        { error: "A rider with this phone number already exists" },
        { status: 409 }
      );
    }

    // Check for duplicate driver_id
    if (driver_id?.trim()) {
      const { data: existingDriverId } = await supabaseAdmin
        .from("riders")
        .select("id")
        .eq("driver_id", driver_id.trim())
        .maybeSingle();

      if (existingDriverId) {
        return NextResponse.json(
          { error: "A rider with this UpGrid Driver ID already exists" },
          { status: 409 }
        );
      }
    }

    const riderInsert: Database["public"]["Tables"]["riders"]["Insert"] = {
      name: name.trim(),
      phone_1: phone_1.trim(),
      phone_2: phone_2?.trim() || null,
      hub_id: effectiveHubId,
      driver_id: driver_id?.trim() || null,
      status: status || "pending_kyc",
      outstanding_balance: 0,
      added_by: auth.admin.name || auth.admin.email || "Unknown Admin",
      ...(created_at ? { created_at } : {}),
    };

    const { data: rider, error: riderError } = await supabaseAdmin
      .from("riders")
      .insert(riderInsert)
      .select()
      .single();

    if (riderError) throw riderError;

    if (kyc && rider) {
      const kycData: Database["public"]["Tables"]["kyc"]["Insert"] = {
        rider_id: rider.id,
        kyc_status: status === "kyc_approved" ? "approved" : "pending",
      };

      for (const field of KYC_ALLOWED_TEXT_FIELDS) {
        const val = (kyc as Record<string, unknown>)[field];
        if (typeof val === "string" && val.trim()) {
          (kycData as Record<string, unknown>)[field] = val.trim();
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
    const message =
      typeof error === "object" && error !== null && "message" in error
        ? String((error as Record<string, unknown>).message)
        : error instanceof Error
          ? error.message
          : "Unknown error";
    console.error("[add-rider] Error:", message, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/riders?id=<uuid>
 *
 * Permanently removes a rider and all associated records. Super admins only.
 * Cascade order:
 *   battery_events_log → battery_assignments → service_requests → payments
 *   → security_deposits → kyc → vehicle (unassign) → riders row
 */
export async function DELETE(request: Request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) return auth.error;

    if (auth.admin.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden: Only Super Admins can permanently delete riders." }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Server is missing Supabase service role configuration" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Rider ID is required" }, { status: 400 });
    }

    // Verify rider exists
    const { data: rider, error: fetchErr } = await supabaseAdmin
      .from("riders")
      .select("id, name")
      .eq("id", id)
      .single();

    if (fetchErr || !rider) {
      return NextResponse.json({ error: "Rider not found" }, { status: 404 });
    }

    await supabaseAdmin.from("battery_events_log").delete().eq("rider_id", id);
    await supabaseAdmin.from("battery_assignments").delete().eq("current_rider_id", id);
    await supabaseAdmin.from("service_requests").delete().eq("rider_id", id);
    await supabaseAdmin.from("payments").delete().eq("rider_id", id);
    await supabaseAdmin.from("security_deposits").delete().eq("rider_id", id);
    await supabaseAdmin.from("kyc").delete().eq("rider_id", id);

    // Unassign vehicle (don't delete the vehicle itself)
    await supabaseAdmin
      .from("vehicles")
      .update({ assigned_rider_id: null, assigned_at: null })
      .eq("assigned_rider_id", id);

    // Delete vehicle handover checklists linked to this rider
    await supabaseAdmin.from("vehicle_handover_checklists").delete().eq("rider_id", id);

    // Finally delete the rider
    const { error: deleteErr } = await supabaseAdmin.from("riders").delete().eq("id", id);
    if (deleteErr) throw deleteErr;

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[delete-rider] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
