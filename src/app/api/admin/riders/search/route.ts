import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

type SearchRider = {
  id: string;
  name: string;
  phone_1: string;
  status: string;
  gig_company?: string | null;
  vehicle_id?: string | null;
};

/**
 * GET /api/admin/riders/search?q=...
 *
 * Searches riders by name, phone, or assigned vehicle ID.
 * Returns { id, name, phone_1, vehicle_id, status, gig_company } for each match.
 * status + gig_company are used by the Log Cash Payment drawer to determine
 * operator-specific onboarding pricing.
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

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || "";

    if (query.length < 2) {
      return NextResponse.json({ riders: [] });
    }

    const term = query.trim().slice(0, 100);

    // Search by name, phone, and vehicle ID in parallel
    const [nameRes, phoneRes, vehicleRes] = await Promise.all([
      supabaseAdmin
        .from("riders")
        .select("id, name, phone_1, status")
        .ilike("name", `%${term}%`)
        .limit(10),

      supabaseAdmin
        .from("riders")
        .select("id, name, phone_1, status")
        .ilike("phone_1", `%${term}%`)
        .limit(10),

      // Search via vehicles table — find riders by assigned vehicle ID
      supabaseAdmin
        .from("vehicles")
        .select("assigned_rider_id, vehicle_id")
        .ilike("vehicle_id", `%${term}%`)
        .not("assigned_rider_id", "is", null)
        .limit(10),
    ]);

    if (nameRes.error) throw nameRes.error;
    if (phoneRes.error) throw phoneRes.error;

    // Fetch full rider details for vehicle matches
    let byVehicle: { id: string; name: string; phone_1: string; status: string; vehicle_id: string }[] = [];
    if (!vehicleRes.error && vehicleRes.data && vehicleRes.data.length > 0) {
      const riderIds = vehicleRes.data.map((v) => v.assigned_rider_id as string);
      const { data: vRiders } = await supabaseAdmin
        .from("riders")
        .select("id, name, phone_1, status")
        .in("id", riderIds)
        .limit(10);

      if (vRiders) {
        byVehicle = (vRiders as SearchRider[]).map((r) => {
          const veh = vehicleRes.data.find((v) => v.assigned_rider_id === r.id);
          return { ...r, vehicle_id: veh?.vehicle_id ?? "" };
        });
      }
    }

    // Merge and deduplicate — vehicle matches shown first
    const seen = new Set<string>();
    const riders = [...byVehicle, ...((nameRes.data as SearchRider[]) ?? []), ...((phoneRes.data as SearchRider[]) ?? [])]
      .map((r) => ({
        id: r.id,
        name: r.name,
        phone_1: r.phone_1,
        status: r.status,
        gig_company: (r.gig_company as string | null) ?? null,
        vehicle_id: (r as { vehicle_id?: string }).vehicle_id ?? null,
      }))
      .filter((r) => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      })
      .slice(0, 10);

    return NextResponse.json({ riders });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
