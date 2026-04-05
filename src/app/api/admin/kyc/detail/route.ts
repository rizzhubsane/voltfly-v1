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

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const { data: kyc, error: kycError } = await supabaseAdmin
      .from("kyc")
      .select("*")
      .eq("id", id)
      .single();
    if (kycError) throw kycError;

    const { data: rider, error: riderError } = await supabaseAdmin
      .from("riders")
      .select("*")
      .eq("id", kyc.rider_id)
      .maybeSingle();
    if (riderError) throw riderError;

    return NextResponse.json({ record: { ...kyc, riders: rider ?? null } });
  } catch (error: unknown) {
    const message =
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : error instanceof Error
          ? error.message
          : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

