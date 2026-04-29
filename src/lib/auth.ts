import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Verifies the caller's JWT and returns their admin record.
 * 
 * Usage in any API route:
 *   const auth = await verifyAdmin(request);
 *   if (auth.error) return auth.error;
 *   // auth.admin is now available with { id, role, hub_id }
 * 
 * Pass `requiredRole` to enforce a specific role (e.g., "super_admin").
 */
export async function verifyAdmin(
  request: Request,
  requiredRole?: "super_admin" | "hub_manager"
): Promise<
  | { admin: { id: string; role: string; hub_id: string | null; name?: string; email?: string }; error?: never }
  | { admin?: never; error: NextResponse }
> {
  if (!supabaseAdmin) {
    return {
      error: NextResponse.json(
        { error: "Server missing Supabase service configuration" },
        { status: 500 }
      ),
    };
  }

  // Extract token from Authorization header or cookie
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return {
      error: NextResponse.json(
        { error: "Unauthorized: Missing auth token" },
        { status: 401 }
      ),
    };
  }

  // Verify the JWT
  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token);

  if (userError || !user) {
    return {
      error: NextResponse.json(
        { error: "Unauthorized: Invalid or expired token" },
        { status: 401 }
      ),
    };
  }

  // Look up admin record
  const { data: adminRecord, error: adminError } = await supabaseAdmin
    .from("admin_users")
    .select("id, role, hub_id, is_active, name, email")
    .eq("id", user.id)
    .single();

  if (adminError || !adminRecord) {
    return {
      error: NextResponse.json(
        { error: "Forbidden: Not an admin user" },
        { status: 403 }
      ),
    };
  }

  // Explicitly block deactivated admin accounts.
  if (adminRecord.is_active === false) {
    return {
      error: NextResponse.json(
        { error: "Forbidden: Account is deactivated" },
        { status: 403 }
      ),
    };
  }

  // Optional role enforcement
  if (requiredRole && adminRecord.role !== requiredRole) {
    return {
      error: NextResponse.json(
        { error: `Forbidden: Requires ${requiredRole} role` },
        { status: 403 }
      ),
    };
  }

  return { admin: adminRecord };
}
