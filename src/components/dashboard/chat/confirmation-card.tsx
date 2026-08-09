"use client";

import { useState } from "react";
import { Check, X, AlertTriangle } from "lucide-react";
import { useConfirmPendingAction, useCancelPendingAction } from "@/hooks/use-chat";
import { cn } from "@/lib/utils";

interface ConfirmationCardProps {
  pendingActionId: string;
  summary: string;
  onResolved: (answer: string) => void;
}

/**
 * Renders inline in the message list whenever a Message has a non-null
 * pendingActionId — the mutating-tool confirmation-card mechanism
 * (chat.service.ts's proposePendingAction / pending-action.service.ts).
 * Nothing the model proposed (updating stock, recording waste, etc.) has
 * actually run yet; it only executes once Confirm is clicked.
 */
export function ConfirmationCard({ pendingActionId, summary, onResolved }: ConfirmationCardProps) {
  const confirm = useConfirmPendingAction();
  const cancel = useCancelPendingAction();
  const [resolved, setResolved] = useState<"confirmed" | "cancelled" | null>(null);

  const busy = confirm.isPending || cancel.isPending;

  async function handleConfirm() {
    const result = await confirm.mutateAsync(pendingActionId);
    setResolved("confirmed");
    onResolved(result.answer);
  }

  async function handleCancel() {
    await cancel.mutateAsync(pendingActionId);
    setResolved("cancelled");
    onResolved("Okay, I won't make that change.");
  }

  return (
    <div className="max-w-[75%] rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <p className="text-foreground">{summary}</p>
      </div>
      {resolved ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {resolved === "confirmed" ? "Confirmed." : "Cancelled — nothing was changed."}
        </p>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            onClick={handleConfirm}
            disabled={busy}
            className={cn(
              "flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50",
            )}
          >
            <Check className="h-3.5 w-3.5" />
            Confirm
          </button>
          <button
            onClick={handleCancel}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
