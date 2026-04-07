import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";
import type { HandoverFormState } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/vehicles
 * Fetches vehicles using the service role key to bypass client-side RLS.
 * Optional query params:
 *   hubId       – filter by hub
 *   available   – if "true", only unassigned vehicles
 *   checklist   – if a vehicle UUID, returns the latest assignment checklist for that vehicle
 */
export async function GET(request: Request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) return auth.error;

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Missing admin config" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const available = searchParams.get("available") === "true";
    const checklistVehicleId = searchParams.get("checklist");

    // Hub managers are always scoped to their own hub regardless of query param.
    const hubId = auth.admin.role === "hub_manager" && auth.admin.hub_id
      ? auth.admin.hub_id
      : searchParams.get("hubId");

    // ── Return handover checklist for a given vehicle ─────────────────────
    if (checklistVehicleId) {
      const { data, error } = await supabaseAdmin
        .from("vehicle_handover_checklists")
        .select("*")
        .eq("vehicle_id", checklistVehicleId)
        .eq("type", "assignment")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return NextResponse.json({ checklist: data });
    }

    // ── Return vehicles list ──────────────────────────────────────────────
    let query = supabaseAdmin
      .from("vehicles")
      .select("*, hubs(name), riders(name)")
      .order("created_at", { ascending: false });

    if (hubId && hubId !== "null") query = query.eq("hub_id", hubId);
    if (available) query = query.is("assigned_rider_id", null);

    const { data: vehicles, error } = await query;

    if (error) {
      // Fallback: manual join
      let baseQuery = supabaseAdmin
        .from("vehicles")
        .select("*")
        .order("created_at", { ascending: false });
      if (hubId && hubId !== "null") baseQuery = baseQuery.eq("hub_id", hubId);
      if (available) baseQuery = baseQuery.is("assigned_rider_id", null);

      const { data: vehicleRows, error: vehicleError } = await baseQuery;
      if (vehicleError) throw vehicleError;

      const hubIds    = Array.from(new Set((vehicleRows || []).map((v) => v.hub_id).filter((id): id is string => !!id)));
      const riderIds  = Array.from(new Set((vehicleRows || []).map((v) => v.assigned_rider_id).filter((id): id is string => !!id)));

      const [{ data: hubRows }, { data: riderRows }] = await Promise.all([
        hubIds.length   > 0 ? supabaseAdmin.from("hubs").select("id, name").in("id", hubIds)     : Promise.resolve({ data: [] }),
        riderIds.length > 0 ? supabaseAdmin.from("riders").select("id, name").in("id", riderIds) : Promise.resolve({ data: [] }),
      ]);

      const hubById   = new Map((hubRows   || []).map((h) => [h.id, h.name]));
      const riderById = new Map((riderRows || []).map((r) => [r.id, r.name]));

      const joined = (vehicleRows || []).map((v) => ({
        ...v,
        hubs:   v.hub_id            && hubById.has(v.hub_id)            ? { name: hubById.get(v.hub_id) }      : null,
        riders: v.assigned_rider_id && riderById.has(v.assigned_rider_id) ? { name: riderById.get(v.assigned_rider_id) } : null,
      }));

      return NextResponse.json({ vehicles: joined });
    }

    return NextResponse.json({ vehicles });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/admin/vehicles
 *
 * Creates or updates a vehicle.
 * When payload contains `assigned_rider_id` (i.e. vehicle assignment), and
 * `handover_checklist` is present, also inserts into vehicle_handover_checklists.
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
    const { id, handover_checklist } = body;

    // Whitelist the columns callers are allowed to set — never spread raw body into DB.
    const ALLOWED_VEHICLE_FIELDS = [
      "vehicle_id", "chassis_number", "hub_id", "assigned_rider_id", "assigned_at",
    ] as const;
    type AllowedField = typeof ALLOWED_VEHICLE_FIELDS[number];
    const vehicleData: Partial<Record<AllowedField, unknown>> = {};
    for (const field of ALLOWED_VEHICLE_FIELDS) {
      if (field in body) vehicleData[field] = body[field];
    }

    // Derive who recorded this from the verified auth token.
    const adminId = auth.admin.id;

    // Hub managers may only touch vehicles that belong to their hub.
    if (auth.admin.role === "hub_manager" && auth.admin.hub_id) {
      const targetHubId = vehicleData.hub_id ?? (
        id
          ? (await supabaseAdmin.from("vehicles").select("hub_id").eq("id", id).single()).data?.hub_id
          : null
      );
      if (targetHubId && targetHubId !== auth.admin.hub_id) {
        return NextResponse.json({ error: "Forbidden: Vehicle belongs to a different hub." }, { status: 403 });
      }
    }

    if (id) {
      // ── Update existing vehicle ─────────────────────────────────────────
      const { data, error } = await supabaseAdmin
        .from("vehicles")
        .update(vehicleData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      // If this update includes a rider assignment AND a checklist, save it
      if (vehicleData.assigned_rider_id && handover_checklist) {
        const checklist = handover_checklist as HandoverFormState;
        const { error: clErr } = await supabaseAdmin
          .from("vehicle_handover_checklists")
          .insert({
            vehicle_id:       id,
            rider_id:         vehicleData.assigned_rider_id,
            type:             "assignment",
            charger:          checklist.charger,
            battery:          checklist.battery,
            key:              checklist.key,
            mirrors:          checklist.mirrors,
            foot_mat:         checklist.foot_mat,
            odometer_reading: checklist.odometer_reading || null,
            motor_number:     checklist.motor_number     || null,
            helmet:           checklist.helmet,
            lights:           checklist.lights,
            horn:             checklist.horn,
            indicators:       checklist.indicators,
            tyres:            checklist.tyres,
            tools_kit:        checklist.tools_kit,
            notes:            checklist.notes            || null,
            recorded_by:      adminId,
          });
        if (clErr) throw clErr;
      }

      return NextResponse.json({ success: true, vehicle: data });

    } else {
      // ── Insert new vehicle ──────────────────────────────────────────────
      const { data, error } = await supabaseAdmin
        .from("vehicles")
        .insert([vehicleData])
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, vehicle: data });
    }
  } catch (err: unknown) {
    let message = "Unknown error";
    if (err instanceof Error) {
      message = err.message;
    } else if (err && typeof err === "object" && 'message' in err) {
      message = (err as any).message;
    } else {
      message = JSON.stringify(err);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/vehicles
 *
 * Saves a return checklist when a rider is being de-boarded.
 * Body: { vehicle_id, rider_id, admin_id, checklist: HandoverFormState }
 */
export async function PATCH(request: Request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) return auth.error;

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Missing admin config" }, { status: 500 });
    }

    const { vehicle_id, rider_id, checklist } = await request.json() as {
      vehicle_id: string;
      rider_id: string;
      checklist: HandoverFormState;
    };

    // Derive who recorded this from the verified auth token — never trust body.
    const patchAdminId = auth.admin.id;

    // Hub managers may only process returns for vehicles in their hub.
    if (auth.admin.role === "hub_manager" && auth.admin.hub_id) {
      const { data: veh } = await supabaseAdmin
        .from("vehicles")
        .select("hub_id")
        .eq("id", vehicle_id)
        .single();
      if (veh?.hub_id && veh.hub_id !== auth.admin.hub_id) {
        return NextResponse.json({ error: "Forbidden: Vehicle belongs to a different hub." }, { status: 403 });
      }
    }

    const { error } = await supabaseAdmin
      .from("vehicle_handover_checklists")
      .insert({
        vehicle_id,
        rider_id,
        type:             "return",
        charger:          checklist.charger,
        battery:          checklist.battery,
        key:              checklist.key,
        mirrors:          checklist.mirrors,
        foot_mat:         checklist.foot_mat,
        odometer_reading: checklist.odometer_reading || null,
        motor_number:     checklist.motor_number     || null,
        helmet:           checklist.helmet,
        lights:           checklist.lights,
        horn:             checklist.horn,
        indicators:       checklist.indicators,
        tyres:            checklist.tyres,
        tools_kit:        checklist.tools_kit,
        notes:            checklist.notes            || null,
        recorded_by:      patchAdminId,
      });

    if (error) throw error;

    // Additionally, unassign the vehicle from the rider so it returns to the available pool
    const { error: unassignError } = await supabaseAdmin
      .from("vehicles")
      .update({ assigned_rider_id: null, assigned_at: null })
      .eq("id", vehicle_id);

    if (unassignError) throw unassignError;

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/vehicles?id=<uuid>
 *
 * Permanently removes a vehicle record. Super admins only.
 * Blocked if the vehicle still has a rider assigned.
 */
export async function DELETE(request: Request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) return auth.error;

    if (auth.admin.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden: Only Super Admins can delete vehicles." }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Missing admin config" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Vehicle ID is required" }, { status: 400 });
    }

    // Refuse if a rider is still assigned
    const { data: vehicle, error: fetchErr } = await supabaseAdmin
      .from("vehicles")
      .select("id, assigned_rider_id")
      .eq("id", id)
      .single();

    if (fetchErr || !vehicle) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    if (vehicle.assigned_rider_id) {
      return NextResponse.json(
        { error: "Unassign the rider from this vehicle before deleting it." },
        { status: 409 }
      );
    }

    // Delete related checklists first
    await supabaseAdmin.from("vehicle_handover_checklists").delete().eq("vehicle_id", id);

    // Delete the vehicle
    const { error: deleteErr } = await supabaseAdmin.from("vehicles").delete().eq("id", id);
    if (deleteErr) throw deleteErr;

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
