import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/riders/search?q=...
 * 
 * Allows admin to search for riders by name or phone using service role.
 */
export async function GET(request: Request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) return auth.error;

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Server is missing Supabase service role configuration" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || "";

    if (query.length < 2) {
      return NextResponse.json({ riders: [] });
    }

    // Cap length to prevent excessive DB load from very long search strings.
    const term = query.trim().slice(0, 100);

    // Use separate chained ilike filters instead of string-interpolated .or() to avoid
    // PostgREST filter injection. Supabase's typed client parameterises these safely.
    const { data: byName, error: nameErr } = await supabaseAdmin
      .from("riders")
      .select("id, name, phone_1")
      .ilike("name", `%${term}%`)
      .limit(10);

    const { data: byPhone, error: phoneErr } = await supabaseAdmin
      .from("riders")
      .select("id, name, phone_1")
      .ilike("phone_1", `%${term}%`)
      .limit(10);

    if (nameErr) throw nameErr;
    if (phoneErr) throw phoneErr;

    // Merge and deduplicate by id.
    const seen = new Set<string>();
    const riders = [...(byName ?? []), ...(byPhone ?? [])].filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    }).slice(0, 10);

    return NextResponse.json({ riders: riders || [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
