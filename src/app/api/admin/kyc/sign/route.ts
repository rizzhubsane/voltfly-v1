import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";

/**
 * GET /api/admin/kyc/sign?path=<url-or-path>&bucket=<bucket>
 *
 * Accepts either a full Supabase Storage URL or a bare object path,
 * and returns a 1-hour signed URL generated with the service-role key.
 * This is required because the kyc-documents bucket is (correctly) private.
 */
export async function GET(request: Request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) return auth.error;

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Server missing service role configuration" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const rawPath = searchParams.get("path");
    const bucket = searchParams.get("bucket") ?? "kyc-documents";

    if (!rawPath) {
      return NextResponse.json({ error: "Missing path parameter" }, { status: 400 });
    }

    // Normalise: if it's already a full Supabase Storage URL, extract the object path.
    // Pattern: .../storage/v1/object/(public|sign)/<bucket>/<object-path>
    let objectPath = rawPath;
    if (rawPath.startsWith("http")) {
      const match = rawPath.match(
        /\/storage\/v1\/object\/(?:public|sign|authenticated)\/[^/]+\/(.+?)(?:\?|$)/
      );
      if (match) {
        objectPath = decodeURIComponent(match[1]);
      } else {
        // Unrecognised URL format — return it as-is and hope it's accessible.
        return NextResponse.json({ url: rawPath });
      }
    }

    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(objectPath, 3600); // valid for 1 hour

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
