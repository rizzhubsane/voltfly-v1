import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

    const { data: kycRows, error: kycError } = await supabaseAdmin
      .from("kyc")
      .select(
        "id, rider_id, aadhaar_number, pan_number, address_local, address_village, ref1_name, ref1_phone, ref2_name, ref2_phone, ref3_name, ref3_phone, kyc_status, rejection_reason, reviewed_by, reviewed_at, created_at"
      )
      .eq("kyc_status", "submitted")
      .order("created_at", { ascending: true });

    if (kycError) throw kycError;

    const riderIds = Array.from(
      new Set((kycRows || []).map((row) => row.rider_id).filter(Boolean))
    );

    const { data: ridersRows, error: ridersError } =
      riderIds.length > 0
        ? await supabaseAdmin.from("riders").select("*").in("id", riderIds)
        : { data: [], error: null };

    if (ridersError) throw ridersError;

    const riderById = new Map((ridersRows || []).map((r) => [r.id, r]));
    const merged = (kycRows || []).map((k) => ({
      ...k,
      riders: riderById.get(k.rider_id) ?? null,
    }));

    return NextResponse.json({ records: merged });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

