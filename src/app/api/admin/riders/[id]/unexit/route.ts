import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/riders/[id]/unexit
 *
 * Re-enrolls an exited rider back into the system.
 * It changes their status from "exited" to "active" (or "suspended" if their wallet balance is < 0).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdmin(request);
  if (auth.error) return auth.error;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing rider id" }, { status: 400 });

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server missing Supabase service key" }, { status: 500 });
  }

  try {
    // 1. Fetch current rider to check wallet balance and status
    const { data: rider, error: fetchErr } = await supabaseAdmin
      .from("riders")
      .select("status, wallet_balance, admin_notes")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr || !rider) {
      throw new Error(fetchErr?.message || "Rider not found");
    }

    if (rider.status !== "exited") {
      return NextResponse.json({ error: "Rider is not exited" }, { status: 400 });
    }

    // 2. Determine new status
    const newStatus = (rider.wallet_balance ?? 0) >= 0 ? "active" : "suspended";
    const adminName = auth.admin.name || auth.admin.email || "Admin";
    const existingNotes = rider.admin_notes ? `${rider.admin_notes}\n` : "";
    const auditStr = `Rider un-exited (status: ${newStatus}) (Logged by: ${adminName})`;

    // 3. Update rider
    const { error: updateErr } = await supabaseAdmin
      .from("riders")
      .update({ 
        status: newStatus,
        admin_notes: `${existingNotes}${auditStr}`
      })
      .eq("id", id);

    if (updateErr) {
      throw new Error(`Failed to un-exit rider: ${updateErr.message}`);
    }

    return NextResponse.json({ success: true, status: newStatus });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
