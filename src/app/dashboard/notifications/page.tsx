"use client";
import { adminFetch } from "@/lib/adminFetch";


import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Bell,
  Send,
  Users,
  Building2,
  User,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────

interface Hub {
  id: string;
  name: string;
}

interface SentNotification {
  id: string;
  rider_id: string | null;
  type: string | null;
  channel: string | null;
  title: string | null;
  message: string | null;
  created_at: string | null;
  riders: { name: string } | null;
}

type TargetType = "all" | "hub" | "single";

// ─── Fetcher ──────────────────────────────────────────────────────────────

async function fetchHubs(): Promise<Hub[]> {
  const res = await adminFetch("/api/admin/payments?type=hubs", { cache: "no-store" });
  if (!res.ok) return [];
  const json = await res.json();
  return json.hubs ?? [];
}

async function fetchRiders(search: string) {
  if (!search || search.length < 2) return [];
  try {
    const res = await adminFetch(`/api/admin/riders/search?q=${encodeURIComponent(search)}`, { cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return json.riders ?? [];
  } catch {
    return [];
  }
}

async function fetchRecentNotifications(): Promise<SentNotification[]> {
  try {
    const res = await adminFetch("/api/admin/notify", { cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return json.notifications ?? [];
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function NotificationsPage() {
  // ── State ─────────────────────────────────────────────────────────────
  const [targetType, setTargetType] = useState<TargetType>("all");
  const [selectedHub, setSelectedHub] = useState("");
  const [riderSearch, setRiderSearch] = useState("");
  const [selectedRider, setSelectedRider] = useState<{ id: string; name: string } | null>(null);
  const [riderResults, setRiderResults] = useState<{ id: string; name: string; phone_1: string }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [channels, setChannels] = useState<("push" | "sms")[]>(["push"]);
  const [isSending, setIsSending] = useState(false);
  const [lastResult, setLastResult] = useState<{ sent: number; failed: number; total: number } | null>(null);

  const { data: hubs = [] } = useQuery({ queryKey: ["hubs"], queryFn: fetchHubs });
  const { data: recentNotifs = [], refetch: refetchNotifs } = useQuery({
    queryKey: ["notifications-history"],
    queryFn: fetchRecentNotifications,
    retry: false,
  });

  // ── Rider Search ──────────────────────────────────────────────────────
  useEffect(() => {
    if (targetType !== "single") return;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      const results = await fetchRiders(riderSearch);
      setRiderResults(results);
      setIsSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [riderSearch, targetType]);

  // ── Channel toggle ────────────────────────────────────────────────────
  const toggleChannel = (ch: "push" | "sms") => {
    setChannels(prev =>
      prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]
    );
  };

  // ── Send ──────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      toast.error("Title and message are required");
      return;
    }
    if (channels.length === 0) {
      toast.error("Select at least one channel");
      return;
    }
    if (targetType === "hub" && !selectedHub) {
      toast.error("Select a hub to target");
      return;
    }
    if (targetType === "single" && !selectedRider) {
      toast.error("Select a rider to send to");
      return;
    }

    setIsSending(true);
    setLastResult(null);
    try {
      const body: Record<string, unknown> = {
        targetType,
        title: title.trim(),
        message: message.trim(),
        channels,
        type: "admin_broadcast",
      };
      if (targetType === "hub") body.hubId = selectedHub;
      if (targetType === "single") body.riderId = selectedRider!.id;

      const res = await adminFetch("/api/admin/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send notifications");

      setLastResult({ sent: data.sent, failed: data.failed, total: data.total });
      toast.success(`Sent to ${data.sent} of ${data.total} riders`);

      // Reset form
      setTitle("");
      setMessage("");
      setSelectedRider(null);
      setRiderSearch("");
      refetchNotifs();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setIsSending(false);
    }
  };

  const isValid = title.trim() && message.trim() && channels.length > 0 &&
    (targetType === "all" ||
      (targetType === "hub" && selectedHub) ||
      (targetType === "single" && selectedRider));

  const targetLabel = useMemo(() => {
    if (targetType === "all") return "All Active Riders";
    if (targetType === "hub") return hubs.find(h => h.id === selectedHub)?.name ?? "Selected Hub";
    return selectedRider?.name ?? "Selected Rider";
  }, [targetType, selectedHub, selectedRider, hubs]);

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-8 pb-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0D2D6B]">Notifications</h1>
        <p className="text-muted-foreground mt-1">Send push notifications and SMS alerts to riders.</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        {/* ── Compose Form ──────────────────────────────────────────────── */}
        <div className="space-y-6">
          <Card>
            <CardContent className="p-6 space-y-6">
              <h2 className="text-base font-semibold text-[#0D2D6B] flex items-center gap-2">
                <Send className="h-4 w-4" /> Compose Notification
              </h2>

              {/* Target type */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Send To</label>
                <div className="flex gap-2 flex-wrap">
                  {([
                    { key: "all", label: "All Active Riders", icon: Users },
                    { key: "hub", label: "Specific Hub", icon: Building2 },
                    { key: "single", label: "One Rider", icon: User },
                  ] as { key: TargetType; label: string; icon: React.ElementType }[]).map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      onClick={() => { setTargetType(key); setSelectedRider(null); setRiderSearch(""); }}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        targetType === key
                          ? "bg-primary text-white border-primary"
                          : "bg-white text-muted-foreground border-input hover:border-primary/50 hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" /> {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hub selector */}
              {targetType === "hub" && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Select Hub *</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={selectedHub}
                    onChange={(e) => setSelectedHub(e.target.value)}
                  >
                    <option value="">Choose a hub...</option>
                    {hubs.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </select>
                </div>
              )}

              {/* Rider search */}
              {targetType === "single" && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Select Rider *</label>
                  {selectedRider ? (
                    <div className="flex items-center justify-between p-3 rounded-lg border bg-slate-50">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                          {selectedRider.name.charAt(0)}
                        </div>
                        <span className="font-medium text-sm">{selectedRider.name}</span>
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedRider(null)}>Change</Button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Input
                        placeholder="Search by name or phone..."
                        value={riderSearch}
                        onChange={(e) => setRiderSearch(e.target.value)}
                      />
                      {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
                      {riderResults.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                          {riderResults.map(r => (
                            <button
                              key={r.id}
                              type="button"
                              className="w-full text-left px-4 py-2 hover:bg-slate-50 border-b last:border-0 text-sm"
                              onClick={() => { setSelectedRider(r); setRiderResults([]); setRiderSearch(""); }}
                            >
                              <div className="font-medium">{r.name}</div>
                              <div className="text-xs text-muted-foreground">{r.phone_1}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Title */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Title *</label>
                <Input placeholder="e.g. Payment Reminder" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
                <p className="text-xs text-muted-foreground text-right">{title.length}/100</p>
              </div>

              {/* Message */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Message *</label>
                <Textarea
                  placeholder="Write your notification message..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  maxLength={500}
                />
                <p className="text-xs text-muted-foreground text-right">{message.length}/500</p>
              </div>

              {/* Channels */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Channels *</label>
                <div className="flex gap-3">
                  {(["push", "sms"] as const).map(ch => (
                    <label key={ch} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/20"
                        checked={channels.includes(ch)}
                        onChange={() => toggleChannel(ch)}
                      />
                      <span className="text-sm font-medium capitalize">{ch === "push" ? "Push Notification" : "SMS"}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Preview */}
              {isValid && (
                <div className="rounded-lg bg-slate-50 border p-4 space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Preview</p>
                  <p className="text-sm font-semibold">To: {targetLabel}</p>
                  <p className="text-sm font-bold mt-1">{title}</p>
                  <p className="text-sm text-muted-foreground">{message}</p>
                </div>
              )}

              {/* Result banner */}
              {lastResult && (
                <div className={`rounded-lg p-4 flex items-center gap-3 ${lastResult.failed === 0 ? "bg-emerald-50 border border-emerald-200" : "bg-amber-50 border border-amber-200"}`}>
                  {lastResult.failed === 0
                    ? <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                    : <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />}
                  <p className="text-sm font-medium">
                    Sent {lastResult.sent}/{lastResult.total} notifications
                    {lastResult.failed > 0 && `, ${lastResult.failed} failed`}
                  </p>
                </div>
              )}

              <Button
                className="w-full gap-2"
                disabled={!isValid || isSending}
                onClick={handleSend}
              >
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {isSending ? "Sending..." : "Send Notification"}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* ── Recent Notifications ───────────────────────────────────────── */}
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-[#0D2D6B] flex items-center gap-2">
            <Bell className="h-4 w-4" /> Sent History
          </h2>

          {recentNotifs.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Bell className="h-8 w-8 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No notifications sent yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow>
                    <TableHead>Rider</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Sent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentNotifs.map(n => (
                    <TableRow key={n.id} className="hover:bg-slate-50/50">
                      <TableCell className="text-sm font-medium">{n.riders?.name ?? "All"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-medium">{n.title}</p>
                          {n.channel && (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${n.channel === 'push' ? 'bg-primary/10 text-primary' : 'bg-amber-100 text-amber-700'}`}>
                              {n.channel}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate max-w-[180px]" title={n.message ?? ""}>{n.message}</p>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {n.created_at ? format(new Date(n.created_at), "dd MMM, HH:mm") : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
