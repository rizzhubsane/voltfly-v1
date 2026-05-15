import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";

/**
 * POST /api/admin/auth/change-password
 * Allows a logged-in admin to change their own password.
 * Body: { newPassword: string }
 */
export async function POST(request: Request) {
  try {
    const auth = await verifyAdmin(request);
    if (auth.error) return auth.error;

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { newPassword } = await request.json();

    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    // Update the password in Supabase Auth using the service role key (admin API)
    const { error } = await supabaseAdmin.auth.admin.updateUserById(auth.admin.id, {
      password: newPassword,
    });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to change password";
    console.error("[change-password]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
