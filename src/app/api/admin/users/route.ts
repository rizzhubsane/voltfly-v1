import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/users
 * 
 * Creates a new Auth User and standardizes their record in admin_users.
 * Requires the caller to be a super_admin.
 */
export async function POST(request: Request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Server missing Supabase service configuration" }, { status: 500 });
    }

    // 1. Authenticate caller manually via Bearer token
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    
    if (!token) {
      return NextResponse.json({ error: "Unauthorized: Missing Token" }, { status: 401 });
    }

    const { data: { user: sessionUser }, error: sessionError } = await supabaseAdmin.auth.getUser(token);
    
    if (sessionError || !sessionUser) {
      return NextResponse.json({ error: "Unauthorized: Invalid JWT" }, { status: 401 });
    }

    // 2. Verify caller is a super_admin
    const { data: callerRecord, error: callerError } = await supabaseAdmin
      .from("admin_users")
      .select("role")
      .eq("id", sessionUser.id)
      .single();

    if (callerError || !callerRecord || callerRecord.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden: Only Super Admins can perform this action." }, { status: 403 });
    }

    // 3. Parse request body
    const body = await request.json();
    const { email, password, name, role, hub_id } = body;

    if (!email || !password || !name || !role) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (role === "hub_manager" && !hub_id) {
      return NextResponse.json({ error: "Hub ID is required for Hub Managers" }, { status: 400 });
    }

    // 4. Create user in Supabase Auth (using Admin Auth API)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    let userId: string;

    if (authError) {
      if (authError.message.includes("already registered")) {
        // The auth user already exists. Look them up via the admin_users table by email
        // to get their UUID — avoids the expensive listUsers() call over all auth users.
        const { data: existingAdmin, error: lookupErr } = await supabaseAdmin
          .from("admin_users")
          .select("id")
          .eq("email", email)
          .maybeSingle();

        if (lookupErr || !existingAdmin) {
          return NextResponse.json(
            { error: "User already exists in auth but has no admin record. Please contact a super admin." },
            { status: 400 }
          );
        }
        userId = existingAdmin.id;
      } else {
        return NextResponse.json({ error: authError.message }, { status: 400 });
      }
    } else {
      userId = authData.user.id;
    }

    // 5. Upsert into admin_users
    const { error: dbError } = await supabaseAdmin.from("admin_users").upsert({
      id: userId,
      email: email,
      name: name,
      role: role,
      hub_id: role === "super_admin" ? null : hub_id,
      is_active: true
    }, { onConflict: "email" });

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "User successfully provisioned." });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/users
 *
 * Toggles an admin user's is_active status (deactivate / reactivate).
 * Super admins only. Cannot deactivate yourself.
 * Body: { id: string, is_active: boolean }
 */
export async function PATCH(request: Request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Server missing Supabase service configuration" }, { status: 500 });
    }

    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized: Missing Token" }, { status: 401 });

    const { data: { user: sessionUser }, error: sessionError } = await supabaseAdmin.auth.getUser(token);
    if (sessionError || !sessionUser) return NextResponse.json({ error: "Unauthorized: Invalid JWT" }, { status: 401 });

    const { data: callerRecord, error: callerError } = await supabaseAdmin
      .from("admin_users")
      .select("role")
      .eq("id", sessionUser.id)
      .single();

    if (callerError || !callerRecord || callerRecord.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden: Only Super Admins can perform this action." }, { status: 403 });
    }

    const { id, is_active } = await request.json();
    if (!id || typeof is_active !== "boolean") {
      return NextResponse.json({ error: "Missing required fields: id and is_active" }, { status: 400 });
    }

    if (id === sessionUser.id) {
      return NextResponse.json({ error: "You cannot deactivate your own account." }, { status: 409 });
    }

    const { error: updateErr } = await supabaseAdmin
      .from("admin_users")
      .update({ is_active })
      .eq("id", id);

    if (updateErr) throw updateErr;

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/users
 *
 * Permanently removes an admin user from admin_users and Supabase Auth.
 * Super admins only. Cannot delete yourself or the last super_admin.
 * Body: { id: string }
 */
export async function DELETE(request: Request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Server missing Supabase service configuration" }, { status: 500 });
    }

    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized: Missing Token" }, { status: 401 });

    const { data: { user: sessionUser }, error: sessionError } = await supabaseAdmin.auth.getUser(token);
    if (sessionError || !sessionUser) return NextResponse.json({ error: "Unauthorized: Invalid JWT" }, { status: 401 });

    const { data: callerRecord, error: callerError } = await supabaseAdmin
      .from("admin_users")
      .select("role")
      .eq("id", sessionUser.id)
      .single();

    if (callerError || !callerRecord || callerRecord.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden: Only Super Admins can perform this action." }, { status: 403 });
    }

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "User ID is required" }, { status: 400 });

    if (id === sessionUser.id) {
      return NextResponse.json({ error: "You cannot delete your own account." }, { status: 409 });
    }

    // Prevent deleting the last super_admin
    const { data: targetUser, error: targetErr } = await supabaseAdmin
      .from("admin_users")
      .select("role")
      .eq("id", id)
      .single();

    if (targetErr || !targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (targetUser.role === "super_admin") {
      const { count } = await supabaseAdmin
        .from("admin_users")
        .select("id", { count: "exact", head: true })
        .eq("role", "super_admin");

      if ((count ?? 0) <= 1) {
        return NextResponse.json({ error: "Cannot delete the last Super Admin account." }, { status: 409 });
      }
    }

    // Delete from admin_users table
    const { error: dbDeleteErr } = await supabaseAdmin.from("admin_users").delete().eq("id", id);
    if (dbDeleteErr) throw dbDeleteErr;

    // Delete from Supabase Auth
    const { error: authDeleteErr } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (authDeleteErr) {
      console.error("[delete-admin-user] Auth delete error:", authDeleteErr.message);
      // Non-fatal — DB row is gone; log and continue
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
