/**
 * logAdminActivity — server-side helper to record admin actions to admin_activity_log.
 * Call this from any API route that mutates rider/vehicle/payment data.
 *
 * @example
 * await logAdminActivity(supabaseAdmin, {
 *   admin_id: "uuid",
 *   admin_name: "Rishabh Sain",
 *   action_type: "battery_block",
 *   entity_type: "rider",
 *   entity_id: riderId,
 *   rider_id: riderId,
 *   description: `Blocked swap access for Manasvi. Reason: payment overdue`,
 *   metadata: { driver_id: "D263669", reason: "payment overdue" },
 * });
 */

import type { SupabaseClient } from "@supabase/supabase-js";

interface ActivityLogPayload {
  admin_id?: string | null;
  admin_name?: string | null;
  action_type: string;
  entity_type?: string | null;
  entity_id?: string | null;
  rider_id?: string | null;
  description?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>;
}

export async function logAdminActivity(
  db: SupabaseClient,
  payload: ActivityLogPayload
): Promise<void> {
  try {
    await db.from("admin_activity_log").insert({
      admin_id: payload.admin_id ?? null,
      admin_name: payload.admin_name ?? null,
      action_type: payload.action_type,
      entity_type: payload.entity_type ?? null,
      entity_id: payload.entity_id ?? null,
      rider_id: payload.rider_id ?? null,
      description: payload.description ?? null,
      metadata: payload.metadata ?? {},
    });
  } catch {
    // Never throw — logging must not break the primary operation
    console.warn("[logAdminActivity] Failed to write activity log:", payload.action_type);
  }
}
