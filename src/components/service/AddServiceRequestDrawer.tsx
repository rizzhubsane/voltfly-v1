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

const SPARE_PARTS = [
  { item: "FRONT VISOR", price: 280 },
  { item: "Front panel", price: 800 },
  { item: "Front panel eye", price: 150 },
  { item: "VISOR JALI", price: 80 },
  { item: "BODY panel (L)", price: 550 },
  { item: "BODY panel (R)", price: 550 },
  { item: "SIDE RAIL L", price: 250 },
  { item: "SIDE RAIL R", price: 250 },
  { item: "Front fender", price: 220 },
  { item: "FCC", price: 250 },
  { item: "FCC JALI", price: 80 },
  { item: "TAIL LIGHT COVER", price: 220 },
  { item: "METER COVER", price: 220 },
  { item: "METER COVER DECORATION", price: 150 },
  { item: "Wheel Cover Set", price: 250 },
  { item: "Tool box", price: 600 },
  { item: "Front inner Cover", price: 350 },
  { item: "Floor Board Under Cover", price: 220 },
  { item: "FLOOR Board", price: 600 },
  { item: "FLOOR Board cover", price: 90 },
  { item: "CHARGING SHOCKET COVER", price: 180 },
  { item: "LUGGAGE BOX", price: 500 },
  { item: "LUGGAGE BOX COVER", price: 100 },
  { item: "Rear fender", price: 250 },
  { item: "Rear LOWER fender", price: 100 },
  { item: "Controller under Cover", price: 175 },
  { item: "Body cover attachment set", price: 250 },
  { item: "BEG Hook", price: 80 },
  { item: "VIN cover", price: 30 },
  { item: "Head Lamp Assy. Without Bulb", price: 650 },
  { item: "Tail Lamp Assy. Without Bulb", price: 730 },
  { item: "Front Indicator set", price: 300 },
  { item: "Reflector 1 Set (2 round, 1 rectangle)", price: 80 }
];

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
  const [formMode, setFormMode] = useState<"general" | "spares">("general");
  const [type, setType] = useState("general");
  const [description, setDescription] = useState("");
  const [selectedParts, setSelectedParts] = useState<string[]>([]);

  const togglePart = (item: string) => {
    if (selectedParts.includes(item)) {
      setSelectedParts(selectedParts.filter((p) => p !== item));
    } else {
      setSelectedParts([...selectedParts, item]);
    }
  };

  const calculateTotal = () => {
    return selectedParts.reduce((total, partName) => {
      const part = SPARE_PARTS.find((p) => p.item === partName);
      return total + (part?.price || 0);
    }, 0);
  };

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
      if (formMode === "general" && !description.trim()) throw new Error("Description is required");
      if (formMode === "spares" && selectedParts.length === 0) throw new Error("Select at least one spare part");

      const totalAmount = calculateTotal();
      const partsJson = selectedParts.map(pName => {
        const p = SPARE_PARTS.find(s => s.item === pName);
        return { name: p?.item, price: p?.price };
      });

      let fullDescription = '';
      if (formMode === 'spares') {
        fullDescription = `Requested Spare Parts: ${selectedParts.join(', ')}`;
        if (description.trim()) fullDescription += `\nNotes: ${description.trim()}`;
      } else {
        const typeLabel = ISSUE_TYPES.find(t => t.value === type)?.label;
        fullDescription = [
          typeLabel ? `[${typeLabel}]` : null,
          description.trim() || null,
        ].filter(Boolean).join(' — ');
      }

      const res = await adminFetch("/api/admin/service-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          riderId: selectedRider.id,
          type: formMode === "general" ? type : null,
          description: fullDescription,
          status: "open",
          parts_selected: formMode === "spares" ? partsJson : null,
          total_parts_cost: formMode === "spares" ? totalAmount : 0,
          payment_status: formMode === "spares" && totalAmount > 0 ? "paid" : "n/a",
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
      setFormMode("general");
      setSelectedParts([]);
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
        {/* Type Segmented Control */}
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${formMode === "general" ? "bg-white shadow-sm text-[#0D2D6B]" : "text-slate-500 hover:text-slate-700"}`}
            onClick={() => setFormMode("general")}
          >
            General Issue
          </button>
          <button
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${formMode === "spares" ? "bg-white shadow-sm text-[#0D2D6B]" : "text-slate-500 hover:text-slate-700"}`}
            onClick={() => setFormMode("spares")}
          >
            Spare Parts
          </button>
        </div>
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

        {formMode === "general" ? (
          /* Issue Type */
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
        ) : (
          /* Spare Parts Selection */
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <LayoutList className="h-3 w-3" /> Select Spare Parts *
            </Label>
            <div className="max-h-56 overflow-y-auto space-y-2 border border-slate-200 rounded-xl p-2 bg-slate-50">
              {SPARE_PARTS.map((part) => {
                const isSelected = selectedParts.includes(part.item);
                return (
                  <div
                    key={part.item}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${isSelected ? "bg-blue-50 border-blue-300" : "bg-white border-slate-200 hover:border-slate-300"}`}
                    onClick={() => togglePart(part.item)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${isSelected ? "bg-blue-600 border-blue-600" : "bg-white border-slate-300"}`}>
                        {isSelected && <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                      </div>
                      <span className={`text-sm font-medium ${isSelected ? "text-blue-900" : "text-slate-700"}`}>
                        {part.item}
                      </span>
                    </div>
                    <span className="text-sm font-bold text-slate-600">₹{part.price}</span>
                  </div>
                );
              })}
            </div>
            {selectedParts.length > 0 && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50 border border-emerald-200 mt-2">
                <span className="text-sm font-semibold text-emerald-800">Total Calculation</span>
                <span className="text-lg font-bold text-emerald-700">₹{calculateTotal()}</span>
              </div>
            )}
          </div>
        )}

        {/* Description */}
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <FileText className="h-3 w-3" /> {formMode === "spares" ? "Additional Notes" : "Description *"}
          </Label>
          <Textarea
            placeholder={formMode === "spares" ? "Optional notes..." : "Describe the issue or service needed..."}
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
            disabled={!selectedRider || (formMode === "general" && !description.trim()) || (formMode === "spares" && selectedParts.length === 0) || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : formMode === "spares" && calculateTotal() > 0 ? (
              `Mark Paid (₹${calculateTotal()}) & Submit`
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
