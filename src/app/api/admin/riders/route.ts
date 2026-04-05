import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";

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
