import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";
import { logAdminActivity } from "@/lib/logAdminActivity";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/riders/bulk
 *
 * Performs a bulk action on a set of rider IDs.
 *
 * Body: {
 *   action: "unassign_vehicle" | "block_swap" | "unblock_swap" | "delete",
 *   riderIds: string[],
 *   reason?: string,  // for swap block/unblock
 * }
 */
export async function POST(request: Request) {
  try {
    const auth = await verifyAdmin(request, "super_admin");
    if (auth.error) return auth.error;

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const body = await request.json();
    const { action, riderIds, reason } = body as {
      action: string;
      riderIds: string[];
      reason?: string;
    };

    if (!action || !Array.isArray(riderIds) || riderIds.length === 0) {
      return NextResponse.json({ error: "Missing action or riderIds" }, { status: 400 });
    }

    const adminId = auth.admin.id;
    const adminName = auth.admin.name ?? auth.admin.email ?? "Admin";
    const results: { id: string; success: boolean; error?: string }[] = [];

    // ── 1. UNASSIGN VEHICLE + DRIVER ID ───────────────────────────────────────
    if (action === "unassign_vehicle") {
      // Clear assigned_rider_id from vehicles
      await supabaseAdmin
        .from("vehicles")
        .update({ assigned_rider_id: null, assigned_at: null })
        .in("assigned_rider_id", riderIds);

      // Clear driver_id from riders
      const { error } = await supabaseAdmin
        .from("riders")
        .update({ driver_id: null })
        .in("id", riderIds);

      if (error) throw error;

      await logAdminActivity(supabaseAdmin, {
        admin_id: adminId,
        admin_name: adminName,
        action_type: "bulk_unassign_vehicle",
        entity_type: "rider",
        entity_id: riderIds[0],
        description: `Bulk unassigned vehicle & driver_id from ${riderIds.length} rider(s)`,
        metadata: { rider_ids: riderIds },
      });

      return NextResponse.json({ success: true, count: riderIds.length });
    }

    // ── 2. BLOCK / UNBLOCK SWAP ────────────────────────────────────────────────
    if (action === "block_swap" || action === "unblock_swap") {
      const swapAction = action === "block_swap" ? "block" : "unblock";
      const functionName = swapAction === "block" ? "battery-block" : "battery-unblock";
      const newStatus = swapAction === "block" ? "suspended" : "active";

      // Fetch rider records to get driver_ids
      const { data: riders, error: fetchErr } = await supabaseAdmin
        .from("riders")
        .select("id, name, driver_id")
        .in("id", riderIds);

      if (fetchErr) throw fetchErr;

      for (const rider of riders ?? []) {
        if (!rider.driver_id) {
          results.push({ id: rider.id, success: false, error: "No driver_id" });
          continue;
        }

        const { error: fnError } = await supabaseAdmin.functions.invoke(functionName, {
          body: {
            driverId: rider.driver_id,
            riderId: rider.id,
            reason: reason || `Bulk ${swapAction} by admin`,
            triggeredBy: adminId,
            triggerType: "manual",
          },
        });

        if (fnError) {
          results.push({ id: rider.id, success: false, error: fnError.message });
          continue;
        }

        await supabaseAdmin.from("riders").update({ status: newStatus }).eq("id", rider.id);
        results.push({ id: rider.id, success: true });
      }

      await logAdminActivity(supabaseAdmin, {
        admin_id: adminId,
        admin_name: adminName,
        action_type: swapAction === "block" ? "battery_block" : "battery_unblock",
        entity_type: "rider",
        entity_id: riderIds[0],
        description: `Bulk ${swapAction}ed swap for ${results.filter((r) => r.success).length}/${riderIds.length} rider(s)`,
        metadata: { rider_ids: riderIds, results },
      });

      const failed = results.filter((r) => !r.success);
      return NextResponse.json({
        success: true,
        count: results.filter((r) => r.success).length,
        failed: failed.length > 0 ? failed : undefined,
      });
    }

    // ── 3. PROCESS EXIT ────────────────────────────────────────────────────────
    if (action === "process_exit") {
      // Clear assigned_rider_id from vehicles
      await supabaseAdmin
        .from("vehicles")
        .update({ assigned_rider_id: null, assigned_at: null })
        .in("assigned_rider_id", riderIds);

      // Mark status as exited and clear driver_id
      const { error, count } = await supabaseAdmin
        .from("riders")
        .update({ status: "exited", driver_id: null })
        .in("id", riderIds)
        .select("id");

      if (error) throw error;

      await logAdminActivity(supabaseAdmin, {
        admin_id: adminId,
        admin_name: adminName,
        action_type: "bulk_process_exit",
        entity_type: "rider",
        entity_id: riderIds[0],
        description: `Bulk processed exit for ${count} rider(s)`,
        metadata: { rider_ids: riderIds },
      });

      return NextResponse.json({ success: true, count: riderIds.length });
    }

    // ── 4. DELETE RIDERS ───────────────────────────────────────────────────────
    if (action === "delete") {
      const extraTableClient = supabaseAdmin as unknown as {
        from: (table: "batteries" | "notifications_log") => ReturnType<typeof supabaseAdmin.from>;
      };

      // Clear FK references before deleting
      await supabaseAdmin
        .from("vehicles")
        .update({ assigned_rider_id: null, assigned_at: null })
        .in("assigned_rider_id", riderIds);

      await extraTableClient
        .from("batteries")
        .update({ current_rider_id: null })
        .in("current_rider_id", riderIds);

      // Delete NO ACTION child tables
      await supabaseAdmin.from("battery_events_log").delete().in("rider_id", riderIds);
      await supabaseAdmin.from("payments").delete().in("rider_id", riderIds);
      await supabaseAdmin.from("security_deposits").delete().in("rider_id", riderIds);
      await supabaseAdmin.from("service_requests").delete().in("rider_id", riderIds);
      await extraTableClient.from("notifications_log").delete().in("rider_id", riderIds);

      // Delete riders (CASCADE handles: kyc, notifications, wallet_transactions,
      // vehicle_handover_checklists, balance_audit_log — SET NULL for admin_activity_log)
      const { error: delError, count } = await supabaseAdmin
        .from("riders")
        .delete({ count: "exact" })
        .in("id", riderIds);

      if (delError) throw delError;

      await logAdminActivity(supabaseAdmin, {
        admin_id: adminId,
        admin_name: adminName,
        action_type: "bulk_delete",
        entity_type: "rider",
        entity_id: riderIds[0],
        description: `Bulk deleted ${count} rider(s)`,
        metadata: { deleted_rider_ids: riderIds },
      });

      return NextResponse.json({ success: true, count });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[bulk-riders]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
