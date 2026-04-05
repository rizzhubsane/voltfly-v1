import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/riders/[id]/swap-access
 *
 * Securely blocks or unblocks a rider's Upgrid swap access.
 * Modifies the rider's internal status and invokes the Upgrid Edge Function.
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
    const { action, reason, driverId } = body;
    // Always derive adminId from the verified auth token — never trust the request body.
    const adminId = auth.admin.id;

    if (!action || !driverId) {
      return NextResponse.json({ error: "Missing action or driverId" }, { status: 400 });
    }

    if (action !== "block" && action !== "unblock") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    // 1. Invoke Upgrid Edge Function
    const functionName = action === "block" ? "battery-block" : "battery-unblock";
    const { error: fnError } = await supabaseAdmin.functions.invoke(functionName, {
      body: { 
        driverId, 
        riderId, 
        reason: reason || `Swap manually ${action}ed by admin`, 
        triggeredBy: adminId || "dashboard_admin", 
        triggerType: "manual" 
      },
    });

    if (fnError) {
      console.error(`${functionName} edge function error:`, fnError);
      return NextResponse.json(
        { error: `Upgrid API failed: ${fnError.message || "Unknown error"}` },
        { status: 500 }
      );
    }

    // 2. Securely update the Rider Status in DB
    const newStatus = action === "block" ? "suspended" : "active";
    const { error: updateError } = await supabaseAdmin
      .from("riders")
      .update({ status: newStatus })
      .eq("id", riderId);

    if (updateError) {
      return NextResponse.json(
        { error: "Upgrid succeeded, but failed to update local rider status" },
        { status: 500 }
      );
    }

    // 3. Log the event — DB constraint expects past-tense: "blocked" / "unblocked"
    const loggedAction = action === "block" ? "blocked" : "unblocked";
    const { error: logError } = await supabaseAdmin
      .from("battery_events_log")
      .insert({
        driver_id: driverId,
        rider_id: riderId,
        action: loggedAction,
        trigger_type: "manual",
        triggered_by: adminId,
        reason: reason || `Manually ${loggedAction} by admin`,
        created_at: new Date().toISOString()
      });

    if (logError) {
      console.warn("Could not write to battery_events_log", logError);
    }

    return NextResponse.json({ success: true, newStatus });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
