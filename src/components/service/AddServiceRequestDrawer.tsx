"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/adminFetch";
import {
  Wrench,
  Search,
  Loader2,
  User,
  FileText,
  LayoutList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const ISSUE_TYPES = [
  { value: "general", label: "General Service" },
  { value: "puncture", label: "Puncture / Tyre Issue" },
  { value: "electrical", label: "Electrical Issue" },
  { value: "brake", label: "Brake Issue" },
  { value: "body_damage", label: "Body Damage" },
  { value: "other", label: "Other" },
];

interface AddServiceRequestDrawerProps {
  onSuccess: () => void;
}

export function AddServiceRequestDrawer({ onSuccess }: AddServiceRequestDrawerProps) {
  const queryClient = useQueryClient();

  const [riderSearch, setRiderSearch] = useState("");
  const [riders, setRiders] = useState<{ id: string; name: string; phone_1: string }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedRider, setSelectedRider] = useState<{ id: string; name: string } | null>(null);
  const [type, setType] = useState("general");
  const [description, setDescription] = useState("");

  // Rider search with debounce
  useEffect(() => {
    if (riderSearch.length < 2) {
      setRiders([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await adminFetch(`/api/admin/riders/search?q=${encodeURIComponent(riderSearch)}`);
        if (!res.ok) throw new Error("Search failed");
        const json = await res.json();
        setRiders(json.riders || []);
      } catch {
        // ignore
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [riderSearch]);

  const handleSelectRider = (rider: { id: string; name: string }) => {
    setSelectedRider(rider);
    setRiders([]);
    setRiderSearch("");
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRider) throw new Error("No rider selected");
      if (!description.trim()) throw new Error("Description is required");

      const res = await adminFetch("/api/admin/service-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          riderId: selectedRider.id,
          type,
          description: description.trim(),
          status: "open",
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error || "Failed to create service request");
      }
      return res.json();
    },
    onSuccess: async () => {
      toast.success(`Service request created for ${selectedRider?.name}`);
      await queryClient.invalidateQueries({ queryKey: ["service-requests"] });
      setSelectedRider(null);
      setDescription("");
      setType("general");
      onSuccess();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <SheetContent className="sm:max-w-md overflow-y-auto">
      <SheetHeader className="pb-6">
        <SheetTitle className="text-[#0D2D6B] flex items-center gap-2">
          <Wrench className="h-5 w-5" />
          Add Service Request
        </SheetTitle>
        <SheetDescription>
          Manually log a service or maintenance request for a rider.
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-6">
        {/* Rider Selection */}
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Rider *</Label>
          {selectedRider ? (
            <div className="flex items-center justify-between p-3 rounded-xl border bg-slate-50 ring-1 ring-slate-100">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div className="flex flex-col">
                  <span className="font-semibold text-sm text-[#0D2D6B]">{selectedRider.name}</span>
                  <span className="text-[10px] text-muted-foreground uppercase font-medium">Selected Rider</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedRider(null)}
                className="h-8 text-[11px] font-bold uppercase text-primary hover:text-primary hover:bg-primary/5"
              >
                Change
              </Button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or phone..."
                className="pl-9 h-10 rounded-xl"
                value={riderSearch}
                onChange={(e) => setRiderSearch(e.target.value)}
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
              {riders.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto ring-1 ring-black/5 p-1 animate-in fade-in zoom-in-95 duration-150">
                  {riders.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg transition-colors flex flex-col"
                      onClick={() => handleSelectRider(r)}
                    >
                      <div className="font-semibold text-sm text-[#0D2D6B]">{r.name}</div>
                      <div className="text-[10px] text-muted-foreground font-medium">{r.phone_1}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Issue Type */}
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <LayoutList className="h-3 w-3" /> Issue Type *
          </Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-10 rounded-xl border-slate-200 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {ISSUE_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value} className="rounded-lg">
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <FileText className="h-3 w-3" /> Description *
          </Label>
          <Textarea
            placeholder="Describe the issue or service needed..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="rounded-xl border-slate-200 resize-none"
          />
        </div>

        {/* Submit / Cancel */}
        <div className="flex flex-col gap-3 pt-4 border-t border-slate-100">
          <Button
            className="w-full h-12 text-base font-bold bg-[#0D2D6B] hover:bg-[#0D2D6B]/90 rounded-xl shadow-lg shadow-blue-900/10 transition-all active:scale-[0.98]"
            disabled={!selectedRider || !description.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Service Request"
            )}
          </Button>
          <Button
            variant="outline"
            className="w-full h-11 text-slate-600 rounded-xl border-slate-200 hover:bg-slate-50"
            onClick={onSuccess}
          >
            Cancel
          </Button>
        </div>
      </div>
    </SheetContent>
  );
}
