import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";

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

    const { driverId, riderId } = await request.json();
    // Always derive adminId from the verified auth token — never trust the request body.
    const adminId = auth.admin.id;

    if (!driverId || !riderId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. Call Edge Function to Upgrid API
    const { error: fnError } = await supabaseAdmin.functions.invoke("battery-unblock", {
      body: { driverId, riderId, triggeredBy: adminId, triggerType: 'manual' },
    });
    if (fnError) {
      console.error("battery-unblock edge function error:", fnError);
      throw fnError;
    }

    // 2. Update battery status in the batteries table
    const { error: batUpdateError } = await supabaseAdmin
      .from("batteries")
      .update({ status: "active", last_action_at: new Date().toISOString() })
      .eq("driver_id", driverId);

    if (batUpdateError) {
      console.warn("Could not update batteries table:", batUpdateError.message);
    }

    // 3. Sync rider status so both storage locations stay consistent
    const { error: riderUpdateError } = await supabaseAdmin
      .from("riders")
      .update({ status: "active" })
      .eq("id", riderId);

    if (riderUpdateError) {
      console.warn("Could not update rider status:", riderUpdateError.message);
    }

    // 4. Log the event
    const { error: logError } = await supabaseAdmin
      .from("battery_events_log")
      .insert({
        driver_id: driverId,
        rider_id: riderId,
        action: "unblocked",
        trigger_type: "manual",
        triggered_by: adminId,
        reason: "Manually unblocked by admin",
        created_at: new Date().toISOString()
      });

    if (logError) {
       console.warn("Could not write to battery_events_log", logError);
    }

    return NextResponse.json({ success: true, message: "Battery unblocked successfully" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
