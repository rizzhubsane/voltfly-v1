import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errorMessage";
import type { Database } from "@/lib/types";

type ServiceRequestWithRiderJoin = Database["public"]["Tables"]["service_requests"]["Row"] & {
  riders?: { name: string; phone_1: string } | null;
};

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

    const formatted = (requests ?? []).map((r: ServiceRequestWithRiderJoin) => ({
      ...r,
      description: r.description ?? r.issue_description ?? null,
      issue_description: r.issue_description ?? r.description ?? null,
      vehicle_id: r.vehicle_id ?? null,
      photo_url: r.photo_url ?? null,
    }));

    return NextResponse.json({ requests: formatted });
  } catch (err: unknown) {
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) return auth.error;

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Missing admin config" }, { status: 500 });
    }

    const { id, updates } = await request.json() as {
      id: string;
      updates: Record<string, unknown>;
    };

    if (!id || !updates) {
      return NextResponse.json({ error: "Missing id or updates parameter" }, { status: 400 });
    }

    const allowedFields = ["status", "resolved_at", "payment_status", "resolution_notes", "charges"] as const;
    const sanitizedUpdates: Database["public"]["Tables"]["service_requests"]["Update"] = {};
    for (const key of allowedFields) {
      if (key in updates) {
        (sanitizedUpdates as Record<string, unknown>)[key] = updates[key];
      }
    }

    if (Object.keys(sanitizedUpdates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    // If updating resolution_notes, append admin attribution
    if (sanitizedUpdates.resolution_notes) {
      const adminName = auth.admin.name || auth.admin.email || "Admin";
      sanitizedUpdates.resolution_notes = `${sanitizedUpdates.resolution_notes} (Logged by: ${adminName})`;
    }

    const { error } = await supabaseAdmin
      .from("service_requests")
      .update(sanitizedUpdates)
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
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
    const { riderId, description, status, parts_selected, total_parts_cost, payment_status } = body;

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
        issue_description: description.trim(),
        status: status || "open",
        parts_selected: parts_selected || null,
        total_parts_cost: total_parts_cost || 0,
        payment_status: payment_status || "n/a",
        created_at: nowISO,
        resolution_notes: `Logged by: ${auth.admin.name || auth.admin.email || "Admin"}`,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    if (payment_status === "paid" && total_parts_cost > 0) {
      const { error: paymentError } = await supabaseAdmin.from("payments").insert({
        rider_id: riderId,
        amount: total_parts_cost,
        plan_type: "service",
        method: "cash", 
        status: "paid",
        paid_at: nowISO,
        due_date: nowISO.split("T")[0],
        notes: `Admin recorded Spares: ${(parts_selected || []).map((p: { name: string }) => p.name).join(", ")} (Logged by: ${auth.admin.name || auth.admin.email || "Admin"})`,
      });
      if (paymentError) {
        console.warn("[add-service-request] payment track error:", paymentError);
      }
    }

    return NextResponse.json({ success: true, request: serviceRequest });
  } catch (err: unknown) {
    const message = getErrorMessage(err);
    console.error("[add-service-request] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
