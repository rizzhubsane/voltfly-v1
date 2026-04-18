import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";


/**
 * PATCH /api/admin/riders/[id]/leave
 *
 * Put a rider on leave (pause billing) or return them from leave.
 *
 * Body: {
 *   action: 'start' | 'end'
 *   reason?: string          (required when action='start')
 *   expectedReturn?: string  (ISO date, optional when action='start')
 * }
 *
 * on_leave:
 *   - Daily deduction cron skips these riders (no charge)
 *   - Battery remains blocked (no swap access)
 *   - Status set to 'on_leave'
 *
 * Return from leave:
 *   - Status → 'active' if wallet > 0, else 'suspended'
 *   - leave_started_at / leave_reason / leave_expected_return cleared
 *   - If wallet > 0: auto-unblock battery
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) return auth.error;

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Missing admin config" }, { status: 500 });
    }

    const riderId = params.id;
    if (!riderId) {
      return NextResponse.json({ error: "Rider ID required" }, { status: 400 });
    }

    const body   = await request.json();
    const { action, reason, expectedReturn } = body as {
      action: "start" | "end";
      reason?: string;
      expectedReturn?: string;
    };

    if (!["start", "end"].includes(action)) {
      return NextResponse.json({ error: "action must be 'start' or 'end'" }, { status: 400 });
    }

    // Fetch rider
    const { data: rider, error: fetchErr } = await supabaseAdmin
      .from("riders")
      .select("id, name, status, wallet_balance, driver_id")
      .eq("id", riderId)
      .single();

    if (fetchErr || !rider) {
      return NextResponse.json({ error: "Rider not found" }, { status: 404 });
    }

    const nowISO = new Date().toISOString();

    if (action === "start") {
      if (!reason?.trim()) {
        return NextResponse.json({ error: "A reason is required to put a rider on leave" }, { status: 400 });
      }

      if (rider.status === "on_leave") {
        return NextResponse.json({ error: "Rider is already on leave" }, { status: 400 });
      }

      if (!["active", "suspended"].includes(rider.status)) {
        return NextResponse.json(
          { error: `Cannot put a rider with status '${rider.status}' on leave` },
          { status: 400 }
        );
      }

      // Put on leave
      const { error: updateErr } = await supabaseAdmin
        .from("riders")
        .update({
          status:                "on_leave",
          leave_started_at:      nowISO,
          leave_reason:          reason.trim(),
          leave_expected_return: expectedReturn ?? null,
        })
        .eq("id", riderId);

      if (updateErr) throw updateErr;

      // Block battery if they're active and have a driver_id
      if (rider.status === "active" && rider.driver_id) {
        const { data: battery } = await supabaseAdmin
          .from("batteries")
          .select("status, driver_id")
          .eq("current_rider_id", riderId)
          .maybeSingle();

        if (battery && battery.status === "active" && battery.driver_id) {
          try {
            await supabaseAdmin.functions.invoke("battery-block", {
              body: {
                driverId:    battery.driver_id,
                riderId:     riderId,
                triggerType: "admin_leave",
                reason:      `Rider on leave: ${reason.trim()}`,
              },
            });
            await supabaseAdmin
              .from("batteries")
              .update({ status: "blocked", last_action_at: nowISO })
              .eq("current_rider_id", riderId);
          } catch (err) {
            console.error("[leave] Battery block failed:", err);
          }
        }
      }

      console.log(`[leave] Rider ${rider.name} put on leave. Reason: ${reason}`);
      return NextResponse.json({ success: true, action: "started", status: "on_leave" });
    }

    // action === 'end'
    if (rider.status !== "on_leave") {
      return NextResponse.json({ error: "Rider is not currently on leave" }, { status: 400 });
    }

    const walletBalance   = rider.wallet_balance ?? 0;
    const newStatus       = walletBalance > 0 ? "active" : "suspended";

    const { error: updateErr } = await supabaseAdmin
      .from("riders")
      .update({
        status:                newStatus,
        leave_started_at:      null,
        leave_reason:          null,
        leave_expected_return: null,
      })
      .eq("id", riderId);

    if (updateErr) throw updateErr;

    // Auto-unblock battery only if wallet is positive
    let unblocked = false;
    if (newStatus === "active" && rider.driver_id) {
      const { data: battery } = await supabaseAdmin
        .from("batteries")
        .select("status, driver_id")
        .eq("current_rider_id", riderId)
        .maybeSingle();

      if (battery?.status === "blocked" && battery.driver_id) {
        try {
          await supabaseAdmin.functions.invoke("battery-unblock", {
            body: {
              driverId:    battery.driver_id,
              riderId:     riderId,
              triggeredBy: auth.admin.id,
              triggerType: "admin_leave_end",
              reason:      "Rider returned from leave — wallet positive",
            },
          });
          await supabaseAdmin
            .from("batteries")
            .update({ status: "active", last_action_at: nowISO })
            .eq("current_rider_id", riderId);
          unblocked = true;
        } catch (err) {
          console.error("[leave] Battery unblock failed:", err);
        }
      }
    }

    console.log(`[leave] Rider ${rider.name} returned from leave → ${newStatus}. Unblocked: ${unblocked}`);
    return NextResponse.json({
      success:   true,
      action:    "ended",
      status:    newStatus,
      unblocked,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
