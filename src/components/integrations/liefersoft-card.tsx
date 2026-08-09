"use client";

import { useState } from "react";
import {
  Plug, CheckCircle2, Clock, AlertTriangle, RefreshCw, XCircle,
  Loader2, ShoppingCart, TrendingUp,
} from "lucide-react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ApiError } from "@/lib/api-client";
import {
  useLiefersoftStatus, useLiefersoftConnect, useLiefersoftDisconnect, useLiefersoftSync,
  type LiefersoftStatus,
} from "@/hooks/use-liefersoft";
import { cn } from "@/lib/utils";

// A real, working connection — not a placeholder card. Deliberately its own
// component/module rather than an entry in integration-registry.ts, so
// nothing here shares state or code with the generic (unimplemented)
// provider grid on this page. See src/hooks/use-liefersoft.ts and
// backend/src/modules/integrations/liefersoft/ for the rest of the stack.

function statusBadge(status: LiefersoftStatus) {
  const map: Record<LiefersoftStatus, { label: string; cls: string; icon: React.ReactNode }> = {
    CONNECTED:    { label: "Connected",    cls: "text-emerald-500 border-emerald-500/30 bg-emerald-500/10", icon: <CheckCircle2 className="h-3 w-3" /> },
    DISCONNECTED: { label: "Not connected",cls: "text-muted-foreground border-border bg-muted/30",          icon: <Plug className="h-3 w-3" /> },
    EXPIRED:      { label: "Expired",      cls: "text-yellow-500 border-yellow-500/30 bg-yellow-500/10",    icon: <Clock className="h-3 w-3" /> },
    ERROR:        { label: "Error",        cls: "text-red-500 border-red-500/30 bg-red-500/10",             icon: <XCircle className="h-3 w-3" /> },
  };
  const { label, cls, icon } = map[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", cls)}>
      {icon}{label}
    </span>
  );
}

function formatRelative(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    try {
      const parsed = JSON.parse(err.message);
      if (typeof parsed?.message === "string") return parsed.message;
    } catch {
      // err.message wasn't JSON — fall through to the raw text below
    }
    return err.message;
  }
  return err instanceof Error ? err.message : "Something went wrong";
}

// ─── Connect modal ────────────────────────────────────────────────────────────

function LiefersoftConnectModal({ onClose }: { onClose: () => void }) {
  const connect = useLiefersoftConnect();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [connected, setConnected] = useState(false);

  async function handleTestConnection() {
    try {
      await connect.mutateAsync({ username, password, companyId });
      setConnected(true);
    } catch {
      // error surfaced via connect.error below
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative mx-4 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <XCircle className="h-4 w-4" />
        </button>

        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-sm font-bold text-foreground">
            LS
          </div>
          <div>
            <p className="font-semibold text-foreground">Liefersoft</p>
            <p className="text-xs text-muted-foreground">Restaurant POS</p>
          </div>
        </div>

        {connected ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 text-sm text-emerald-500">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              Connected
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Last Sync</span>
              <span className="font-medium text-foreground">Never</span>
            </div>
            <button
              onClick={onClose}
              className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Company ID</label>
              <input
                type="text"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                autoComplete="off"
              />
            </div>

            {connect.isError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-500">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                {extractErrorMessage(connect.error)}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleTestConnection}
                disabled={connect.isPending || !username || !password || !companyId}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
              >
                {connect.isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Testing…</>
                  : "Test Connection"}
              </button>
              <button
                onClick={onClose}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export function LiefersoftCard() {
  const { data: status, isLoading } = useLiefersoftStatus();
  const disconnect = useLiefersoftDisconnect();
  const sync = useLiefersoftSync();
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const isConnected = status?.status === "CONNECTED";
  const needsReconnect = status?.status === "EXPIRED" || status?.status === "ERROR";

  async function handleDisconnect() {
    await disconnect.mutateAsync();
    setConfirmDisconnect(false);
  }

  return (
    <>
      <div
        className={cn(
          "flex flex-col gap-3 rounded-xl border bg-card p-4 transition-shadow hover:shadow-sm",
          isConnected ? "border-emerald-500/20" : needsReconnect ? "border-yellow-500/20" : "border-border",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-[11px] font-bold text-foreground">
              LS
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground leading-tight">Liefersoft</p>
              <p className="text-[11px] text-muted-foreground leading-tight">Restaurant POS</p>
            </div>
          </div>
          <div className="flex-shrink-0">
            {!isLoading && status && statusBadge(status.status)}
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          <span className="flex items-center gap-1 rounded-md border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            <ShoppingCart className="h-2.5 w-2.5" /> Orders
          </span>
          <span className="flex items-center gap-1 rounded-md border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            <TrendingUp className="h-2.5 w-2.5" /> Sales
          </span>
        </div>

        {isConnected && status && (
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-center text-xs">
            <p className="font-semibold text-foreground">{formatRelative(status.lastSync)}</p>
            <p className="text-muted-foreground">Last sync</p>
          </div>
        )}

        {needsReconnect && (
          <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-600 dark:text-yellow-400">
            <AlertTriangle className="mr-1 inline h-3 w-3" />
            Reconnect required — your Liefersoft credentials need to be re-entered.
          </div>
        )}

        {sync.isError && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-500">
            <AlertTriangle className="mr-1 inline h-3 w-3" />
            {extractErrorMessage(sync.error)}
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="flex-1" />
          {isConnected && (
            <button
              onClick={() => sync.mutate()}
              disabled={sync.isPending}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={cn("h-3 w-3", sync.isPending && "animate-spin")} />
              {sync.isPending ? "Syncing…" : "Sync Now"}
            </button>
          )}
          {isConnected || needsReconnect ? (
            <button
              onClick={() => setConfirmDisconnect(true)}
              disabled={disconnect.isPending}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/20 disabled:opacity-50"
            >
              {disconnect.isPending ? "Disconnecting…" : "Disconnect"}
            </button>
          ) : (
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
            >
              <Plug className="h-3.5 w-3.5" /> Connect
            </button>
          )}
        </div>
      </div>

      {modalOpen && <LiefersoftConnectModal onClose={() => setModalOpen(false)} />}
      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title="Disconnect Liefersoft?"
        description="This deletes your stored Liefersoft credentials. Orders already imported stay in place, but syncing stops until you reconnect."
        confirmLabel="Disconnect"
        isLoading={disconnect.isPending}
        onConfirm={handleDisconnect}
      />
    </>
  );
}
