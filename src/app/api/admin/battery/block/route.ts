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

    const { driverId, riderId, reason } = await request.json();
    // Always derive adminId from the verified auth token — never trust the request body.
    const adminId = auth.admin.id;

    if (!driverId || !riderId || !reason) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. Call Edge Function to Upgrid API
    const { error: fnError } = await supabaseAdmin.functions.invoke("battery-block", {
      body: { driverId, riderId, reason, triggeredBy: adminId, triggerType: 'manual' },
    });
    if (fnError) {
      console.error("battery-block edge function error:", fnError);
      throw fnError;
    }

    // 2. Update battery status in the batteries table
    const { error: batUpdateError } = await supabaseAdmin
      .from("batteries")
      .update({ status: "blocked", last_action_at: new Date().toISOString() })
      .eq("driver_id", driverId);

    if (batUpdateError) {
      console.warn("Could not update batteries table:", batUpdateError.message);
    }

    // 3. Sync rider status so both storage locations stay consistent
    const adminName = auth.admin.name || auth.admin.email || "Admin";

    // Fetch existing notes to prevent overwrite
    const { data: riderData } = await supabaseAdmin
      .from("riders")
      .select("admin_notes")
      .eq("id", riderId)
      .single();

    const existingNotes = riderData?.admin_notes ? `${riderData.admin_notes}\n` : "";
    const auditStr = `Swap access blocked: ${reason} (Logged by: ${adminName})`;

    const { error: riderUpdateError } = await supabaseAdmin
      .from("riders")
      .update({ 
        status: "suspended",
        admin_notes: `${existingNotes}${auditStr}`
      })
      .eq("id", riderId);

    if (riderUpdateError) {
      console.warn("Could not update rider status:", riderUpdateError.message);
    }

    // battery_events_log is written by the battery-block Edge Function.

    return NextResponse.json({ success: true, message: "Swap access blocked successfully" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
