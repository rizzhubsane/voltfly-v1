import { supabase } from "@/lib/supabase";

/**
 * Wrapper around `fetch` that automatically attaches the current
 * Supabase auth session token as a Bearer Authorization header.
 * 
 * Use this instead of raw `fetch()` for all `/api/admin/*` calls.
 */
export async function adminFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  return fetch(url, {
    ...options,
    headers,
    cache: "no-store",
  });
}
