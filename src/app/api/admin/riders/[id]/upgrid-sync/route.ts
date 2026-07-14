import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const UPGRID_BASE = "https://api.upgrid.in";

/**
 * Logs into Upgrid and returns a fresh Bearer token.
 */
async function getUpgridToken(): Promise<string> {
  const email    = process.env.UPGRID_EMAIL;
  const password = process.env.UPGRID_PASSWORD;
  if (!email || !password) throw new Error("UPGRID_EMAIL or UPGRID_PASSWORD env vars are not set.");

  const res = await fetch(`${UPGRID_BASE}/api/client/user/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) throw new Error(`Upgrid login failed (${res.status}): ${await res.text()}`);

  const json = await res.json();
  const token: string = json?.data?.token ?? json?.token;
  if (!token) throw new Error("Upgrid login response did not contain a token.");
  return token;
}

/**
 * GET /api/admin/riders/[id]/upgrid-sync
 *
 * Fetches the rider's real swap status from Upgrid and syncs it back
 * to the Voltfly database if a mismatch is detected.
 *
 * Returns:
 *   { upgridStatus, voltflyStatus, synced, newStatus? }
 */
export async function GET(
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

    // 1. Fetch the rider's driver_id and current status from Supabase (service role to bypass RLS)
    const { data: riderRow, error: riderErr } = await supabaseAdmin
      .from("riders")
      .select("driver_id, status, name")
      .eq("id", riderId)
      .single();

    if (riderErr || !riderRow) {
      return NextResponse.json({ error: "Rider not found" }, { status: 404 });
    }

    if (!riderRow.driver_id) {
      // No Upgrid account linked — nothing to sync
      return NextResponse.json({
        synced: false,
        reason: "no_driver_id",
        message: "No Upgrid Driver ID linked to this rider.",
      });
    }

    const driverId      = riderRow.driver_id as string;
    const voltflyStatus = riderRow.status as string;

    // 2. Login to Upgrid and fetch the driver record
    let upgridToken: string;
    try {
      upgridToken = await getUpgridToken();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ error: `Upgrid login failed: ${msg}` }, { status: 502 });
    }

    const driverRes = await fetch(`${UPGRID_BASE}/api/client/driver/${driverId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${upgridToken}` },
    });

    if (!driverRes.ok) {
      const body = await driverRes.text();
      return NextResponse.json(
        { error: `Upgrid driver fetch failed (${driverRes.status}): ${body}` },
        { status: 502 }
      );
    }

    const driverJson = await driverRes.json();
    const upgridData = driverJson?.data ?? driverJson ?? {};
    // Upgrid often keeps status='active' but sets isBlockedByClientPortal=true when blocked by API.
    const isBlocked = upgridData.isBlockedByClientPortal === true || upgridData.status === "blocked";
    
    const upgridStatus = isBlocked ? "blocked" : "active";
    const expectedVoltflyStatus = isBlocked ? "suspended" : "active";

    // Only patch statuses we care about (don't overwrite exited / on_leave / pending_kyc etc.)
    const patchableStatuses = new Set(["active", "suspended"]);

    if (
      expectedVoltflyStatus === voltflyStatus ||
      !patchableStatuses.has(voltflyStatus)
    ) {
      // Already in sync, or a status we must not overwrite
      return NextResponse.json({
        synced: false,
        upgridStatus,
        voltflyStatus,
        message:
          expectedVoltflyStatus === voltflyStatus
            ? "Status is already in sync."
            : `Status '${voltflyStatus}' is not auto-managed by Upgrid sync.`,
      });
    }

    // 4. Mismatch detected — patch Voltfly DB to match Upgrid
    const now = new Date().toISOString();

    const { error: updateErr } = await supabaseAdmin
      .from("riders")
      .update({ status: expectedVoltflyStatus })
      .eq("id", riderId);

    if (updateErr) {
      return NextResponse.json(
        { error: `DB update failed: ${updateErr.message}` },
        { status: 500 }
      );
    }

    // Also sync the batteries table if a record exists
    await supabaseAdmin
      .from("batteries")
      .update({
        status: upgridStatus === "active" ? "active" : "blocked",
        last_action_at: now,
      })
      .eq("driver_id", driverId);

    // Log the auto-correction event
    await supabaseAdmin.from("battery_events_log").insert({
      driver_id:    driverId,
      rider_id:     riderId,
      action:       upgridStatus === "active" ? "unblocked" : "blocked",
      trigger_type: "upgrid_sync",
      triggered_by: auth.admin.id,
      reason: `Auto-sync: Voltfly was '${voltflyStatus}' but Upgrid reported '${upgridStatus}'. Status corrected.`,
      upgrid_response: driverJson?.data ?? driverJson,
      created_at:   now,
    });

    return NextResponse.json({
      synced:     true,
      upgridStatus,
      voltflyStatus,
      newStatus:  expectedVoltflyStatus,
      message:    `Mismatch detected and corrected. Upgrid is '${upgridStatus}', Voltfly was '${voltflyStatus}' → now '${expectedVoltflyStatus}'.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
