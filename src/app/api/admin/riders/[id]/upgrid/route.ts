import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/riders/[id]/upgrid
 *
 * Updates the Upgrid driver_id for a rider securely using service role,
 * bypassing RLS policies that only allow the rider to update their own row.
 */
export async function POST(
  request: Request,
  context: { params: { id: string } }
) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) return auth.error;

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Server is missing Supabase service role configuration" },
        { status: 500 }
      );
    }

    const { id: riderId } = context.params;
    if (!riderId) {
      return NextResponse.json({ error: "Missing rider ID" }, { status: 400 });
    }

    const body = await request.json();
    const { driver_id } = body;

    // driver_id can be null (unlinking) or a string
    if (driver_id === undefined) {
      return NextResponse.json({ error: "Missing driver_id in request body" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("riders")
      .update({ driver_id })
      .eq("id", riderId);

    if (error) throw error;

    return NextResponse.json({ success: true, driver_id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
