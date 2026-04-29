"use client";

import React, { useState } from "react";
import { MessageSquareText, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExpandableNoteProps {
  note?: string | null;
  loggedBy?: string | null;
  className?: string;
}

/**
 * A component that shows the admin who logged an action,
 * and an optional expandable "bubble" for the note content.
 */
export const ExpandableNote: React.FC<ExpandableNoteProps> = ({ note, loggedBy, className }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!note && !loggedBy) return <span className="text-muted-foreground text-xs">—</span>;

  // Pattern match to split attribution if note is provided raw
  let displayNote = note;
  let displayLoggedBy = loggedBy;

  if (note && !loggedBy) {
    const match = note.match(/\((Logged|Resolved|Action) by: (.+?)\)$/);
    if (match) {
      displayNote = note.replace(match[0], "").trim();
      displayLoggedBy = match[2];
    }
  }

  return (
    <div className={cn("flex flex-col gap-1 w-full max-w-full", className)}>
      <div className="flex items-center gap-2">
        {displayLoggedBy && (
          <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500 bg-slate-50 border border-slate-100 rounded-full px-2 py-0.5 shrink-0">
            <User className="h-2.5 w-2.5 text-slate-400" />
            <span>{displayLoggedBy}</span>
          </div>
        )}

        {displayNote && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className={cn(
              "flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-all duration-200",
              isExpanded 
                ? "bg-blue-600 text-white border-blue-600 shadow-sm" 
                : "bg-white text-blue-600 border-blue-200 hover:border-blue-400 hover:bg-blue-50"
            )}
          >
            <MessageSquareText className={cn("h-2.5 w-2.5", isExpanded ? "text-white" : "text-blue-500")} />
            <span>{isExpanded ? "Hide" : "Note"}</span>
          </button>
        )}
      </div>

      {isExpanded && displayNote && (
        <div className="mt-1 p-2 rounded-lg border border-blue-100 bg-blue-50/50 text-[11px] text-slate-700 leading-relaxed whitespace-pre-wrap animate-in fade-in slide-in-from-top-1 duration-200 shadow-inner">
          {displayNote}
        </div>
      )}
    </div>
  );
};
