import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errorMessage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/admin/activity
 * Fetch recent admin activity logs. Optionally filter by rider_id or action_type.
 */
export async function GET(request: Request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) return auth.error;
    if (!supabaseAdmin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

    const { searchParams } = new URL(request.url);
    const riderId = searchParams.get("rider_id");
    const actionType = searchParams.get("action_type");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "100"), 500);

    let query = supabaseAdmin
      .from("admin_activity_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (riderId) query = query.eq("rider_id", riderId);
    if (actionType) query = query.eq("action_type", actionType);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ logs: data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}

/**
 * POST /api/admin/activity
 * Log an admin action. Called server-side from other API routes.
 */
export async function POST(request: Request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) return auth.error;
    if (!supabaseAdmin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

    const body = await request.json();
    const {
      admin_id,
      admin_name,
      action_type,
      entity_type,
      entity_id,
      rider_id,
      description,
      metadata,
    } = body;

    if (!action_type) {
      return NextResponse.json({ error: "action_type is required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("admin_activity_log")
      .insert({
        admin_id: admin_id ?? null,
        admin_name: admin_name ?? null,
        action_type,
        entity_type: entity_type ?? null,
        entity_id: entity_id ?? null,
        rider_id: rider_id ?? null,
        description: description ?? null,
        metadata: metadata ?? {},
        ip_address: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ log: data });
  } catch (err) {
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
