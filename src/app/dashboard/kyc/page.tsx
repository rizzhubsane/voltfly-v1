"use client";
import { adminFetch } from "@/lib/adminFetch";


import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { KycWithRider } from "@/lib/types";
import { useAdmin } from "@/context/AdminContext";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  BadgeCheck,
  Loader2,
  X,
  Eye,
  CheckCircle2,
  XCircle,
  Phone,
  MapPin,
  CreditCard,
  Users,
  FileText,
  ChevronRight,
} from "lucide-react";

// ─── Fetch submitted KYC records ─────────────────────────────────────────────
async function fetchSubmittedKyc(): Promise<KycWithRider[]> {
  // Primary path: server route using service role (bypasses RLS visibility issues).
  const apiRes = await adminFetch("/api/admin/kyc/submitted", { cache: "no-store" });
  if (apiRes.ok) {
    const payload = (await apiRes.json()) as { records?: KycWithRider[] };
    return payload.records ?? [];
  }

  // Fallback path: direct client Supabase query.
  const { data, error } = await supabase
    .from("kyc")
    .select("*, riders(*)")
    .eq("kyc_status", "submitted")
    .order("created_at", { ascending: true });

  if (!error) return (data as KycWithRider[]) ?? [];

  // Fallback path when relational embedding is unavailable.
  const { data: kycRows, error: kycError } = await supabase
    .from("kyc")
    .select("*")
    .eq("kyc_status", "submitted")
    .order("created_at", { ascending: true });
  if (kycError) throw kycError;

  const riderIds = Array.from(
    new Set((kycRows || []).map((row) => row.rider_id).filter(Boolean))
  );
  const { data: ridersRows, error: ridersError } =
    riderIds.length > 0
      ? await supabase
          .from("riders")
          .select("*")
          .in("id", riderIds)
      : { data: [], error: null };
  if (ridersError) throw ridersError;

  const riderById = new Map((ridersRows || []).map((r) => [r.id, r]));
  return ((kycRows || []).map((k) => ({
    ...k,
    riders: riderById.get(k.rider_id),
  })) as KycWithRider[]);
}

// ─── Document card types ─────────────────────────────────────────────────────
interface DocItem {
  label: string;
  url: string | null;
}

// ─── Main page component ─────────────────────────────────────────────────────
export default function KycPage() {
  const queryClient = useQueryClient();
  const { email, adminId } = useAdmin();

  const [selected, setSelected] = useState<KycWithRider | null>(null);
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  // ── Query ──────────────────────────────────────────────────────────────────
  const {
    data: records = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["kyc", "submitted"],
    queryFn: fetchSubmittedKyc,
    refetchInterval: 30000,
  });

  const openRecord = async (rec: KycWithRider) => {
    setLoadingDetailId(rec.id);
    try {
      const res = await adminFetch(`/api/admin/kyc/detail?id=${encodeURIComponent(rec.id)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setSelected(rec);
        return;
      }
      const payload = (await res.json()) as { record?: KycWithRider };
      setSelected(payload.record ?? rec);
    } finally {
      setLoadingDetailId(null);
    }
  };

  useEffect(() => {
    const channel = supabase
      .channel("kyc-live-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "kyc" },
        () => queryClient.invalidateQueries({ queryKey: ["kyc", "submitted"] })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "riders" },
        () => queryClient.invalidateQueries({ queryKey: ["kyc", "submitted"] })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // ── Approve mutation ───────────────────────────────────────────────────────
  const approveMutation = useMutation({
    mutationFn: async (kyc: KycWithRider) => {
      const res = await adminFetch("/api/admin/kyc/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kycId: kyc.id,
          riderId: kyc.rider_id,
          action: "approve",
          reviewer: adminId || email,
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(payload.error || "Failed to approve KYC");
      }
    },
    onSuccess: () => {
      toast.success("KYC approved successfully");
      queryClient.invalidateQueries({ queryKey: ["kyc", "submitted"] });
      setSelected(null);
    },
    onError: (err: Error) => {
      toast.error(`Failed to approve: ${err.message}`);
    },
  });

  // ── Reject mutation ────────────────────────────────────────────────────────
  const rejectMutation = useMutation({
    mutationFn: async ({
      kyc,
      reason,
    }: {
      kyc: KycWithRider;
      reason: string;
    }) => {
      const res = await adminFetch("/api/admin/kyc/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kycId: kyc.id,
          riderId: kyc.rider_id,
          action: "reject",
          reason,
          reviewer: adminId || email,
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(payload.error || "Failed to reject KYC");
      }
    },
    onSuccess: () => {
      toast.success("KYC rejected");
      queryClient.invalidateQueries({ queryKey: ["kyc", "submitted"] });
      setSelected(null);
      setRejectDialogOpen(false);
      setRejectionReason("");
    },
    onError: (err: Error) => {
      toast.error(`Failed to reject: ${err.message}`);
    },
  });

  // ── Documents list builder ─────────────────────────────────────────────────
  function getDocs(kyc: KycWithRider): DocItem[] {
    return [
      { label: "Photo", url: kyc.photo_url },
      { label: "Aadhaar Front", url: kyc.aadhaar_front_url },
      { label: "Aadhaar Back", url: kyc.aadhaar_back_url },
      { label: "PAN Card", url: kyc.pan_url },
      { label: "PCC", url: kyc.pcc_url },
    ];
  }

  // ── Helper: signed URL (public bucket fallback) ────────────────────────────
  function resolveUrl(path: string | null): string | null {
    if (!path) return null;
    if (path.startsWith("http") || path.startsWith("data:")) return path;
    // Assume path is stored as bucket/filepath
    const { data } = supabase.storage
      .from("kyc-documents")
      .getPublicUrl(path);
    return data?.publicUrl ?? null;
  }

  // ── Loading / Error states ─────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          Loading KYC submissions…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center">
        <h3 className="font-semibold text-destructive">
          Failed to load KYC records
        </h3>
        <p className="mt-1 text-sm text-destructive/80">
          {(error as Error).message}
        </p>
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0D2D6B]">
          KYC Approvals
        </h1>
        <p className="text-muted-foreground mt-1">
          Review and approve rider identity verification documents.
        </p>
      </div>

      {/* Pending count badge */}
      {records.length > 0 && (
        <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-sm text-amber-800">
          <BadgeCheck className="h-4 w-4" />
          <span className="font-medium">{records.length}</span> pending
          review{records.length !== 1 && "s"}
        </div>
      )}

      {/* ── TABLE ─────────────────────────────────────────────────────────── */}
      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="w-[280px]">Rider</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-32 text-center text-muted-foreground"
                >
                  <div className="flex flex-col items-center gap-2">
                    <BadgeCheck className="h-8 w-8 text-emerald-400" />
                    <p>All caught up — no pending KYC submissions.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              records.map((rec) => (
                <TableRow
                  key={rec.id}
                  className="cursor-pointer hover:bg-slate-50/80 transition-colors"
                  onClick={() => void openRecord(rec)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                        {rec.riders?.name?.charAt(0).toUpperCase() ?? "?"}
                      </div>
                      <span className="font-medium text-[#0D2D6B]">
                        {rec.riders?.name ?? "Unknown"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {rec.riders?.phone_1 ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {rec.created_at
                      ? format(new Date(rec.created_at), "dd MMM yyyy")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                      Submitted
                    </span>
                  </TableCell>
                  <TableCell>
                    {loadingDetailId === rec.id ? (
                      <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── DETAIL DRAWER ─────────────────────────────────────────────────── */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setSelected(null)}
          />

          {/* Panel */}
          <div className="relative w-full max-w-lg bg-white shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-300">
            {/* Close */}
            <button
              onClick={() => setSelected(null)}
              className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="p-6 space-y-6">
              {/* Rider header */}
              <div>
                <h2 className="text-xl font-bold text-[#0D2D6B]">
                  {selected.riders?.name ?? "Unknown"}
                </h2>
                <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" /> {selected.riders?.phone_1 ?? "—"}
                  </span>
                  {selected.riders?.phone_2 && (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" />{" "}
                      {selected.riders?.phone_2}
                    </span>
                  )}
                </div>
              </div>

              <Separator />

              {/* Identity */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Identity
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Aadhaar</p>
                    <p className="font-medium">
                      {selected.aadhaar_number || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">PAN</p>
                    <p className="font-medium">
                      {selected.pan_number || "—"}
                    </p>
                  </div>
                </div>
              </section>

              {/* Address */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  <MapPin className="mr-1 inline h-3.5 w-3.5" /> Address
                </h3>
                <div className="text-sm space-y-1">
                  <p>
                    <span className="text-muted-foreground">Local: </span>
                    {selected.address_local || "—"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Village: </span>
                    {selected.address_village || "—"}
                  </p>
                </div>
              </section>

              <Separator />

              {/* References */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  <Users className="mr-1 inline h-3.5 w-3.5" /> References
                </h3>
                <div className="grid gap-2 text-sm">
                  {[
                    {
                      name: selected.ref1_name,
                      phone: selected.ref1_phone,
                    },
                    {
                      name: selected.ref2_name,
                      phone: selected.ref2_phone,
                    },
                    {
                      name: selected.ref3_name,
                      phone: selected.ref3_phone,
                    },
                  ].map((ref, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-md border px-3 py-2"
                    >
                      <span className="font-medium">
                        {ref.name || `Ref ${i + 1}`}
                      </span>
                      <span className="text-muted-foreground">
                        {ref.phone || "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <Separator />

              {/* Documents */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  <FileText className="mr-1 inline h-3.5 w-3.5" /> Documents
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {getDocs(selected).map((doc) => {
                    const url = resolveUrl(doc.url);
                    return (
                      <button
                        key={doc.label}
                        disabled={!url}
                        onClick={() => url && setLightboxUrl(url)}
                        className={`group relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
                          url
                            ? "border-primary/30 hover:border-primary hover:bg-primary/5 cursor-pointer"
                            : "border-muted opacity-50 cursor-not-allowed"
                        }`}
                      >
                        {url ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt={doc.label}
                              className="h-16 w-16 rounded object-cover mb-2"
                            />
                            <span className="text-xs font-medium text-primary group-hover:underline">
                              {doc.label}
                            </span>
                            <Eye className="absolute top-2 right-2 h-3.5 w-3.5 text-primary/60 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </>
                        ) : (
                          <>
                            <CreditCard className="h-8 w-8 text-muted mb-1" />
                            <span className="text-xs text-muted-foreground">
                              {doc.label}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              Not uploaded
                            </span>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>

              <Separator />

              {/* Action buttons */}
              <div className="flex gap-3 pt-2">
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={approveMutation.isPending}
                  onClick={() => approveMutation.mutate(selected)}
                >
                  {approveMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  Approve KYC
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={rejectMutation.isPending}
                  onClick={() => setRejectDialogOpen(true)}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Reject KYC
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── LIGHTBOX MODAL ────────────────────────────────────────────────── */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="absolute top-4 right-4 rounded-full bg-white/20 p-2 text-white hover:bg-white/40"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Document preview"
            className="max-h-[85vh] max-w-[90vw] rounded-lg shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* ── REJECT DIALOG ─────────────────────────────────────────────────── */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject KYC</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting{" "}
              <strong>{selected?.riders?.name ?? "this rider"}</strong>&apos;s KYC submission.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Enter rejection reason…"
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={3}
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => {
                setRejectDialogOpen(false);
                setRejectionReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                !rejectionReason.trim() || rejectMutation.isPending
              }
              onClick={() => {
                if (selected) {
                  rejectMutation.mutate({
                    kyc: selected,
                    reason: rejectionReason.trim(),
                  });
                }
              }}
            >
              {rejectMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="mr-2 h-4 w-4" />
              )}
              Confirm Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
