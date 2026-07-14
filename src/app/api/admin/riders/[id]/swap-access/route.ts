import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";
import { logAdminActivity } from "@/lib/logAdminActivity";

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
    const auth = await verifyAdmin(request, "super_admin");
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
    const adminName = auth.admin.name ?? auth.admin.email ?? "Admin";

    if (!action || !driverId) {
      return NextResponse.json({ error: "Missing action or driverId" }, { status: 400 });
    }

    if (action !== "block" && action !== "unblock") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    // 1. Invoke Upgrid Edge Function
    const functionName = action === "block" ? "battery-block" : "battery-unblock";
    const { data, error: fnError } = await supabaseAdmin.functions.invoke(functionName, {
      body: { 
        driverId, 
        riderId, 
        reason: reason || `Swap manually ${action}ed by admin`, 
        triggeredBy: adminId || "dashboard_admin", 
        triggerType: "manual" 
      },
    });

    let upgridWarning = null;
    if (fnError) {
      console.warn(`[swap-access] ${functionName} edge function error (likely Upgrid API failure):`, fnError.message);
      upgridWarning = `Upgrid Warning: ${fnError.message || "Unknown error"}`;
    } else if (data && data.success === false) {
      console.warn(`[swap-access] Upgrid API returned success: false. Error: ${data.error}`);
      upgridWarning = `Upgrid Warning: ${data.error}`;
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

    // 3. Log admin activity
    await logAdminActivity(supabaseAdmin, {
      admin_id: adminId,
      admin_name: adminName,
      action_type: action === "block" ? "battery_block" : "battery_unblock",
      entity_type: "rider",
      entity_id: riderId,
      rider_id: riderId,
      description: `${action === "block" ? "Blocked" : "Unblocked"} battery swap access. Reason: ${reason || "Manual admin action"}`,
      metadata: { driver_id: driverId, new_status: newStatus, reason },
    });

    // battery_events_log is written by the battery-block / battery-unblock Edge Functions (no duplicate row here).

    return NextResponse.json({ success: true, newStatus, upgridWarning });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
