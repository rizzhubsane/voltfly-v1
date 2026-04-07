import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) return auth.error;

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Missing admin config" }, { status: 500 });
    }

    // Hub managers only see service requests from riders in their hub.
    let serviceQuery = supabaseAdmin
      .from("service_requests")
      .select(`*, riders(name, phone_1)`)
      .order("created_at", { ascending: false });

    if (auth.admin.role === "hub_manager" && auth.admin.hub_id) {
      const { data: hubRiders } = await supabaseAdmin
        .from("riders")
        .select("id")
        .eq("hub_id", auth.admin.hub_id);
      const hubRiderIds = (hubRiders ?? []).map((r) => r.id);
      if (hubRiderIds.length === 0) return NextResponse.json({ requests: [] });
      serviceQuery = serviceQuery.in("rider_id", hubRiderIds);
    }

    const { data: requests, error } = await serviceQuery;

    if (error) {
      throw error;
    }

    // Add nullable fields that may not exist in all schema versions
    const formatted = (requests as any[]).map(r => ({
      ...r,
      description: r.description ?? r.issue_description ?? null,
      issue_description: r.issue_description ?? r.description ?? null,
      vehicle_id: r.vehicle_id ?? null,
      photo_url: r.photo_url ?? null,
    }));

    return NextResponse.json({ requests: formatted });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) return auth.error;

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Missing admin config" }, { status: 500 });
    }

    const { id, updates } = await request.json() as { id: string, updates: Record<string, any> };

    if (!id || !updates) {
      return NextResponse.json({ error: "Missing id or updates parameter" }, { status: 400 });
    }

    // Whitelist allowed fields to prevent arbitrary state updates (e.g. changing rider_id)
    const allowedFields = ["status", "resolved_at", "payment_status", "resolution_notes", "charges"];
    const sanitizedUpdates: Record<string, any> = {};
    for (const key of Object.keys(updates)) {
      if (allowedFields.includes(key)) {
        sanitizedUpdates[key] = updates[key];
      }
    }

    if (Object.keys(sanitizedUpdates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("service_requests")
      .update(sanitizedUpdates)
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/admin/service-requests
 *
 * Manually creates a service request from the admin dashboard.
 * Body: { riderId, type?, description, status? }
 */
export async function POST(request: Request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) return auth.error;

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Missing admin config" }, { status: 500 });
    }

    const body = await request.json();
    const { riderId, type, description, status } = body;

    if (!riderId) {
      return NextResponse.json({ error: "Rider is required" }, { status: 400 });
    }
    if (!description?.trim()) {
      return NextResponse.json({ error: "Description is required" }, { status: 400 });
    }

    // Verify rider exists
    const { data: rider, error: riderErr } = await supabaseAdmin
      .from("riders")
      .select("id, name")
      .eq("id", riderId)
      .single();

    if (riderErr || !rider) {
      return NextResponse.json({ error: "Rider not found" }, { status: 404 });
    }

    const nowISO = new Date().toISOString();

    const { data: serviceRequest, error: insertError } = await supabaseAdmin
      .from("service_requests")
      .insert({
        rider_id: riderId,
        type: type?.trim() || null,
        description: description.trim(),
        issue_description: description.trim(),
        status: status || "open",
        created_at: nowISO,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({ success: true, request: serviceRequest });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[add-service-request] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
