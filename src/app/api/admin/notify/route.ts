// src/app/api/admin/notify/route.ts
// Admin API route — bulk notification dispatcher.
// Accepts single rider, all riders in a hub, or all active riders.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from "@/lib/supabase";
import { verifyAdmin } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errorMessage";
import type { Database } from "@/lib/types";

type NotificationHistoryRow = Database["public"]["Tables"]["notifications"]["Row"];

const SUPABASE_FUNCTIONS_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;

// ─── Types ────────────────────────────────────────────────────────────────────

interface NotifyRequest {
  targetType: 'single' | 'hub' | 'all';
  riderId?: string;
  hubId?: string;
  type?: string;
  title?: string;
  message: string;
  channels: Array<'push' | 'sms'>;
}

interface RiderRecord {
  id: string;
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // Sending notifications to all riders or a hub is a super_admin-only action.
    // Individual rider notifications remain available to any admin.
    const auth = await verifyAdmin(req);
    if (auth.error) return auth.error;

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Missing admin config" }, { status: 500 });
    }

    let body: NotifyRequest;

    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const {
      targetType,
      riderId,
      hubId,
      type = 'admin_broadcast',
      title = 'Voltfly',
      message,
      channels = ['push'],
    } = body;

    if (!message || !channels.length) {
      return NextResponse.json(
        { error: '`message` and `channels` are required' },
        { status: 400 },
      );
    }

    // ─── 1. Resolve target rider IDs ─────────────────────────────────────────
    let riderIds: string[] = [];

    if (targetType === 'single') {
      if (!riderId) {
        return NextResponse.json({ error: '`riderId` required for single target' }, { status: 400 });
      }
      riderIds = [riderId];

    } else if (targetType === 'hub') {
      if (!hubId) {
        return NextResponse.json({ error: '`hubId` required for hub target' }, { status: 400 });
      }
      // Hub managers can only notify riders in their own hub.
      if (auth.admin.role === 'hub_manager' && auth.admin.hub_id !== hubId) {
        return NextResponse.json({ error: 'Forbidden: You can only notify riders in your own hub.' }, { status: 403 });
      }
      const { data, error } = await supabaseAdmin
        .from('riders')
        .select('id')
        .eq('hub_id', hubId)
        .eq('status', 'active');

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      riderIds = (data as RiderRecord[]).map(r => r.id);

    } else if (targetType === 'all') {
      // Broadcasting to all riders is restricted to super admins.
      if (auth.admin.role !== 'super_admin') {
        return NextResponse.json({ error: 'Forbidden: Only super admins can notify all riders.' }, { status: 403 });
      }
      const { data, error } = await supabaseAdmin
        .from('riders')
        .select('id')
        .eq('status', 'active');

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      riderIds = (data as RiderRecord[]).map(r => r.id);

    } else {
      return NextResponse.json(
        { error: '`targetType` must be "single", "hub", or "all"' },
        { status: 400 },
      );
    }

    if (riderIds.length === 0) {
      return NextResponse.json({ sent: 0, message: 'No matching riders found' });
    }

    // ─── 2. Fan out to send-notification for each rider ──────────────────────
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const results = await Promise.allSettled(
      riderIds.map(id =>
        fetch(`${SUPABASE_FUNCTIONS_URL}/send-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ riderId: id, type, title, message, channels }),
        }).then(async res => {
          if (!res.ok) {
            const text = await res.text();
            throw new Error(`send-notification failed for ${id}: ${text}`);
          }
          return res.json();
        }),
      ),
    );

    const sent = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map(r => r.reason?.message ?? String(r.reason));

    return NextResponse.json({ sent, failed, total: riderIds.length, errors });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── GET /api/admin/notify ────────────────────────────────────────────────────
// Returns sent notification history for the admin dashboard.

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAdmin(req);
    if (auth.error) return auth.error;

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Missing admin config" }, { status: 500 });
    }

    const { data, error } = await supabaseAdmin
      .from("notifications")
      .select("id, rider_id, type, title, message, channel, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as NotificationHistoryRow[];
    const riderIds = Array.from(
      new Set(rows.map((r) => r.rider_id).filter((id): id is string => !!id))
    );

    let riderMap = new Map<string, { id: string; name: string }>();
    if (riderIds.length > 0) {
      const { data: riders } = await supabaseAdmin
        .from("riders")
        .select("id, name")
        .in("id", riderIds);

      if (riders) {
        riderMap = new Map(riders.map((r) => [r.id, r]));
      }
    }

    const enriched = rows.map((n) => {
      const rider = n.rider_id ? riderMap.get(n.rider_id) : undefined;
      return {
        ...n,
        riders: rider ? { name: rider.name } : null,
      };
    });

    return NextResponse.json({ notifications: enriched });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
