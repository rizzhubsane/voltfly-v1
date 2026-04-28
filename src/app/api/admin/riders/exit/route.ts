import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";
import type { HandoverFormState } from "@/lib/types";
import { getErrorMessage } from "@/lib/errorMessage";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/riders/exit
 *
 * Atomically handles the full rider exit process:
 *  1. Saves the return handover checklist
 *  2. Unassigns the vehicle (returns it to the available pool)
 *  3. Marks the rider status as "exited"
 *  4. Blocks the battery via the battery-block edge function (best-effort)
 *  5. Marks the security deposit as "refund_initiated"
 *
 * Body: {
 *   riderId: string
 *   vehicleId?: string | null      -- the vehicles.id (UUID)
 *   adminId?: string | null
 *   returnChecklist?: HandoverFormState | null
 * }
 *
 * Returns: {
 *   success: true,
 *   batteryBlocked: boolean,  -- false if rider had no battery or block failed
 *   depositInitiated: boolean -- false if no deposit found
 *   warnings: string[]        -- non-fatal messages for the admin
 * }
 */
export async function POST(request: Request) {
  const auth = await verifyAdmin(request);
  if (auth.error) return auth.error;

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server is missing Supabase service role configuration" },
      { status: 500 }
    );
  }

  let body: {
    riderId: string;
    vehicleId?: string | null;
    returnChecklist?: HandoverFormState | null;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { riderId, vehicleId, returnChecklist } = body;
  // Always derive adminId from the verified auth token — never trust the request body.
  const adminId = auth.admin.id;

  if (!riderId) {
    return NextResponse.json({ error: "`riderId` is required" }, { status: 400 });
  }

  const warnings: string[] = [];
  let batteryBlocked = false;
  let depositInitiated = false;

  const { data: riderForExit } = await supabaseAdmin
    .from("riders")
    .select("driver_id")
    .eq("id", riderId)
    .maybeSingle();
  const riderDriverIdSnapshot = riderForExit?.driver_id ?? null;

  try {
    // ── Step 1: Save return handover checklist (if vehicle & checklist provided) ─
    if (vehicleId && returnChecklist) {
      const { error: clErr } = await supabaseAdmin
        .from("vehicle_handover_checklists")
        .insert({
          vehicle_id:       vehicleId,
          rider_id:         riderId,
          type:             "return",
          battery:          returnChecklist.battery,
          key:              returnChecklist.key,
          mirrors:          returnChecklist.mirrors,
          foot_mat:         returnChecklist.foot_mat,
          odometer_reading: returnChecklist.odometer_reading || null,
          motor_number:     returnChecklist.motor_number     || null,
          lights:           returnChecklist.lights,
          horn:             returnChecklist.horn,
          indicators:       returnChecklist.indicators,
          tyres:            returnChecklist.tyres,
          notes:            returnChecklist.notes            || null,
          recorded_by:      adminId                         || null,
        });

      if (clErr) {
        warnings.push(`Return checklist could not be saved: ${clErr.message}`);
      }
    }

    // ── Step 2: Unassign the vehicle ─────────────────────────────────────────
    if (vehicleId) {
      const { error: vehicleErr } = await supabaseAdmin
        .from("vehicles")
        .update({ assigned_rider_id: null, assigned_at: null })
        .eq("id", vehicleId);

      if (vehicleErr) {
        warnings.push(`Vehicle could not be unassigned: ${vehicleErr.message}`);
      }
    }

    // ── Step 3: Block the battery (best-effort via edge function) ─────────────
    // Run before clearing rider.driver_id. Try current_rider_id first, then snapshot Upgrid id.
    let { data: battery } = await supabaseAdmin
      .from("batteries")
      .select("driver_id, battery_id")
      .eq("current_rider_id", riderId)
      .maybeSingle();

    if (!battery && riderDriverIdSnapshot) {
      const { data: batteryFallback } = await supabaseAdmin
        .from("batteries")
        .select("driver_id, battery_id")
        .eq("driver_id", riderDriverIdSnapshot)
        .maybeSingle();
      battery = batteryFallback;
    }

    if (battery?.driver_id) {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

        const blockRes = await fetch(
          `${supabaseUrl}/functions/v1/battery-block`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              driverId:    battery.driver_id,
              riderId:     riderId,
              triggeredBy: adminId || null,
              triggerType: "exit",
              reason:      "Rider exit processed by admin",
            }),
          }
        );

        if (blockRes.ok) {
          batteryBlocked = true;
        } else {
          const errText = await blockRes.text();
          warnings.push(`Battery block failed (non-critical): ${errText}`);
        }
      } catch (blockErr: unknown) {
        warnings.push(`Battery block error (non-critical): ${getErrorMessage(blockErr)}`);
      }
    } else {
      warnings.push("No battery found for this rider — skipped battery block.");
    }

    // ── Step 4: Mark rider as exited and clear Upgrid driver id (fleet pairing) ─
    const { error: riderErr } = await supabaseAdmin
      .from("riders")
      .update({ status: "exited", driver_id: null })
      .eq("id", riderId);

    if (riderErr) {
      throw new Error(`Failed to update rider status: ${riderErr.message}`);
    }

    // ── Step 5: Initiate security deposit refund ──────────────────────────────
    const { data: deposit } = await supabaseAdmin
      .from("security_deposits")
      .select("id, status")
      .eq("rider_id", riderId)
      .not("status", "in", '("refunded","refund_initiated")')
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (deposit?.id) {
      const { error: depositErr } = await supabaseAdmin
        .from("security_deposits")
        .update({
          status:       "refund_initiated",
          processed_at: new Date().toISOString(),
          processed_by: adminId || null,
        })
        .eq("id", deposit.id);

      if (depositErr) {
        warnings.push(`Deposit refund initiation failed: ${depositErr.message}`);
      } else {
        depositInitiated = true;
      }
    } else {
      warnings.push("No active security deposit found — skipped refund initiation.");
    }

    return NextResponse.json({
      success: true,
      batteryBlocked,
      depositInitiated,
      warnings,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
