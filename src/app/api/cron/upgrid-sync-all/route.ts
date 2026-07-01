import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
// Allow this function to run longer on Vercel Pro
export const maxDuration = 300; 

const UPGRID_BASE = "https://api.upgrid.in";

async function getUpgridToken(): Promise<string> {
  const email = process.env.UPGRID_EMAIL;
  const password = process.env.UPGRID_PASSWORD;
  if (!email || !password) throw new Error("UPGRID_EMAIL or UPGRID_PASSWORD not set");

  const res = await fetch(`${UPGRID_BASE}/api/client/user/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) throw new Error(`Upgrid login failed`);
  const json = await res.json();
  const token = json?.data?.token ?? json?.token;
  if (!token) throw new Error("No token returned");
  return token;
}

export async function GET(request: Request) {
  try {
    // Verify a simple secret so not anyone can trigger this
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && !process.env.IS_LOCAL) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseAdmin) throw new Error("Supabase admin not configured");

    const { data: riders, error: riderErr } = await supabaseAdmin
      .from("riders")
      .select("id, driver_id, status, name")
      .not("driver_id", "is", null);

    if (riderErr) throw riderErr;
    if (!riders || riders.length === 0) {
      return NextResponse.json({ message: "No riders with driver_id found." });
    }

    const token = await getUpgridToken();

    let syncedCount = 0;
    let correctedCount = 0;
    let failedCount = 0;

    // Process in chunks of 5 to avoid hammering Upgrid
    const CHUNK_SIZE = 5;
    for (let i = 0; i < riders.length; i += CHUNK_SIZE) {
      const chunk = riders.slice(i, i + CHUNK_SIZE);
      
      await Promise.all(chunk.map(async (rider) => {
        try {
          const driverId = rider.driver_id as string;
          const voltflyStatus = rider.status as string;

          const res = await fetch(`${UPGRID_BASE}/api/client/driver/${driverId}`, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
          });

          if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
          const json = await res.json();
          const upgridStatus = json?.data?.status ?? json?.status ?? "unknown";

          const expectedStatus = upgridStatus === "active" ? "active" : "suspended";
          const patchableStatuses = new Set(["active", "suspended"]);

          if (expectedStatus !== voltflyStatus && patchableStatuses.has(voltflyStatus)) {
            const now = new Date().toISOString();
            
            await supabaseAdmin.from("riders").update({ status: expectedStatus }).eq("id", rider.id);
            await supabaseAdmin.from("batteries").update({
              status: upgridStatus === "active" ? "active" : "blocked",
              last_action_at: now
            }).eq("driver_id", driverId);

            await supabaseAdmin.from("battery_events_log").insert({
              driver_id: driverId,
              rider_id: rider.id,
              action: upgridStatus === "active" ? "unblocked" : "blocked",
              trigger_type: "upgrid_sync_cron",
              triggered_by: "cron",
              reason: `Cron Sync: Voltfly was '${voltflyStatus}' but Upgrid reported '${upgridStatus}'.`,
              created_at: now,
            });
            correctedCount++;
          } else {
            syncedCount++;
          }
        } catch (err) {
          console.error(`Failed to sync rider ${rider.id}:`, err);
          failedCount++;
        }
      }));
      
      // Small delay between chunks
      await new Promise(res => setTimeout(res, 500));
    }

    return NextResponse.json({
      success: true,
      processed: riders.length,
      syncedCount,
      correctedCount,
      failedCount
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
