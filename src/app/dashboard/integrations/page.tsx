"use client";

import React, { useState } from "react";
import {
  Plug, CheckCircle2, Clock, AlertTriangle, RefreshCw, XCircle,
  ChevronRight, Zap, ArrowLeftRight, ArrowDown, ArrowUp,
  Users, Calendar, ShoppingCart, BookOpen, Truck, ExternalLink,
  Loader2, Radio,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { LoadingBanner, ErrorBanner } from "@/components/shared/query-states";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { LiefersoftCard } from "@/components/integrations/liefersoft-card";
import {
  useIntegrations, useConnectIntegration, useDisconnectIntegration, useSyncIntegration,
  type IntegrationStatusDto, type CategoryGroupDto, type SyncStatus, type IntegrationCategory,
} from "@/hooks/use-integrations";
import { useRestaurantId } from "@/hooks/use-restaurant-id";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function categoryIcon(cat: IntegrationCategory) {
  const cls = "h-4 w-4";
  return {
    HR:           <Users className={cls} />,
    SCHEDULING:   <Calendar className={cls} />,
    POS:          <ShoppingCart className={cls} />,
    RESERVATIONS: <BookOpen className={cls} />,
    SUPPLIERS:    <Truck className={cls} />,
  }[cat];
}

function syncDirectionIcon(dir: string) {
  if (dir === "bidirectional") return <ArrowLeftRight className="h-3 w-3" />;
  if (dir === "export") return <ArrowUp className="h-3 w-3" />;
  return <ArrowDown className="h-3 w-3" />;
}

function authBadge(type: string) {
  return type === "oauth2"
    ? <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-500">OAuth 2.0</span>
    : <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">API Key</span>;
}

function syncStatusBadge(status: SyncStatus) {
  const map: Record<SyncStatus, { label: string; cls: string; icon: React.ReactNode }> = {
    IDLE:    { label: "Idle",        cls: "text-muted-foreground border-border bg-muted/30",           icon: <Radio className="h-3 w-3" /> },
    SYNCING: { label: "Syncing…",    cls: "text-blue-500 border-blue-500/30 bg-blue-500/10",           icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    SUCCESS: { label: "Synced",      cls: "text-emerald-500 border-emerald-500/30 bg-emerald-500/10",  icon: <CheckCircle2 className="h-3 w-3" /> },
    ERROR:   { label: "Error",       cls: "text-red-500 border-red-500/30 bg-red-500/10",              icon: <XCircle className="h-3 w-3" /> },
    PENDING: { label: "Requested",   cls: "text-yellow-500 border-yellow-500/30 bg-yellow-500/10",     icon: <Clock className="h-3 w-3" /> },
  };
  const { label, cls, icon } = map[status] ?? map.IDLE;
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

// ─── Connect modal ────────────────────────────────────────────────────────────

function ConnectModal({
  provider,
  onClose,
}: {
  provider: IntegrationStatusDto;
  onClose: () => void;
}) {
  const connect = useConnectIntegration();
  const disconnect = useDisconnectIntegration();
  const isConnected = provider.config?.connected === true;
  const isPending = provider.config?.syncStatus === "PENDING";
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  async function handleConnect() {
    await connect.mutateAsync(provider.providerId);
    onClose();
  }

  async function handleDisconnect() {
    await disconnect.mutateAsync(provider.providerId);
    setConfirmDisconnect(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative mx-4 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <XCircle className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-sm font-bold text-foreground">
            {provider.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-foreground">{provider.name}</p>
            <p className="text-xs text-muted-foreground">{provider.tagline}</p>
          </div>
        </div>

        <p className="mb-4 text-sm text-muted-foreground leading-relaxed">{provider.description}</p>

        {/* Capabilities */}
        <div className="mb-4 flex flex-wrap gap-1.5">
          {provider.capabilities.map((c) => (
            <span key={c} className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
              {c}
            </span>
          ))}
        </div>

        {/* Auth + direction */}
        <div className="mb-5 flex items-center gap-2 text-xs text-muted-foreground">
          {authBadge(provider.authType)}
          <span className="flex items-center gap-1">
            {syncDirectionIcon(provider.syncDirection)}
            {provider.syncDirection === "bidirectional" ? "Two-way sync" : provider.syncDirection === "export" ? "Export only" : "Import only"}
          </span>
        </div>

        {/* Not implemented notice */}
        {!provider.implemented && (
          <div className="mb-5 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3 text-xs text-yellow-600 dark:text-yellow-400">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>
                This integration is <strong>not yet implemented</strong>. Clicking Connect
                registers your interest and reserves your configuration slot. You'll be notified
                when this integration becomes available.
              </span>
            </div>
          </div>
        )}

        {/* Actions */}
        {isConnected || isPending ? (
          <div className="flex items-center justify-between">
            {isPending && !isConnected && (
              <p className="text-xs text-yellow-500 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Awaiting implementation
              </p>
            )}
            {isConnected && (
              <p className="text-xs text-emerald-500 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" /> Connected
              </p>
            )}
            <button
              onClick={() => setConfirmDisconnect(true)}
              disabled={disconnect.isPending}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/20 disabled:opacity-50"
            >
              {disconnect.isPending ? "Disconnecting…" : "Disconnect"}
            </button>
            <ConfirmDialog
              open={confirmDisconnect}
              onOpenChange={setConfirmDisconnect}
              title={`Disconnect ${provider.name}?`}
              description="This stops syncing immediately. Any automated data flow between Durby and this integration will pause until you reconnect."
              confirmLabel="Disconnect"
              isLoading={disconnect.isPending}
              onConfirm={handleDisconnect}
            />
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleConnect}
              disabled={connect.isPending}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {connect.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Connecting…</> : <><Plug className="h-4 w-4" /> Connect</>}
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Provider card ────────────────────────────────────────────────────────────

function ProviderCard({ provider }: { provider: IntegrationStatusDto }) {
  const [open, setOpen] = useState(false);
  const sync = useSyncIntegration();
  const cfg = provider.config;
  const isConnected = cfg?.connected === true;
  const isPending = cfg?.syncStatus === "PENDING";

  return (
    <>
      <div className={cn(
        "flex flex-col gap-3 rounded-xl border bg-card p-4 transition-shadow hover:shadow-sm",
        isConnected ? "border-emerald-500/20" : isPending ? "border-yellow-500/20" : "border-border",
      )}>
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-[11px] font-bold text-foreground">
              {provider.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground leading-tight">{provider.name}</p>
              <p className="text-[11px] text-muted-foreground leading-tight">{provider.tagline}</p>
            </div>
          </div>

          {/* Status */}
          <div className="flex-shrink-0 text-right">
            {isConnected || isPending
              ? syncStatusBadge(cfg!.syncStatus)
              : <span className="text-xs text-muted-foreground">Not connected</span>}
          </div>
        </div>

        {/* Capabilities */}
        <div className="flex flex-wrap gap-1">
          {provider.capabilities.slice(0, 3).map((c) => (
            <span key={c} className="rounded-md border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {c}
            </span>
          ))}
          {provider.capabilities.length > 3 && (
            <span className="rounded-md border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              +{provider.capabilities.length - 3} more
            </span>
          )}
        </div>

        {/* Sync stats (when connected) */}
        {isConnected && cfg && (
          <div className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-center text-xs">
            <div>
              <p className="font-semibold text-foreground">{cfg.recordsImported.toLocaleString()}</p>
              <p className="text-muted-foreground">Records</p>
            </div>
            <div>
              <p className="font-semibold text-foreground">{formatRelative(cfg.lastSyncAt)}</p>
              <p className="text-muted-foreground">Last sync</p>
            </div>
            <div>
              <p className="font-semibold text-foreground">{formatRelative(cfg.nextSyncAt)}</p>
              <p className="text-muted-foreground">Next sync</p>
            </div>
          </div>
        )}

        {/* Error */}
        {cfg?.syncStatus === "ERROR" && cfg.lastSyncError && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-500">
            <AlertTriangle className="mr-1 inline h-3 w-3" />
            {cfg.lastSyncError}
          </div>
        )}

        {/* Auth + direction badges */}
        <div className="flex items-center gap-2">
          {authBadge(provider.authType)}
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            {syncDirectionIcon(provider.syncDirection)}
            {provider.syncDirection === "bidirectional" ? "Bidirectional" : provider.syncDirection === "export" ? "Export" : "Import"}
          </span>
          <div className="flex-1" />
          {/* Sync button */}
          {isConnected && (
            <button
              onClick={() => sync.mutate(provider.providerId)}
              disabled={sync.isPending && sync.variables === provider.providerId}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={cn("h-3 w-3", sync.isPending && sync.variables === provider.providerId && "animate-spin")} />
              Sync
            </button>
          )}
          {/* Connect / Settings button */}
          <button
            onClick={() => setOpen(true)}
            className={cn(
              "flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              isConnected
                ? "border border-border text-muted-foreground hover:text-foreground"
                : isPending
                ? "border border-yellow-500/30 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
                : "bg-accent text-white hover:bg-accent/90",
            )}
          >
            {isConnected ? (
              <><ChevronRight className="h-3.5 w-3.5" /> Settings</>
            ) : isPending ? (
              <><Clock className="h-3.5 w-3.5" /> Requested</>
            ) : (
              <><Plug className="h-3.5 w-3.5" /> Connect</>
            )}
          </button>
        </div>
      </div>

      {open && <ConnectModal provider={provider} onClose={() => setOpen(false)} />}
    </>
  );
}

// ─── Category section ─────────────────────────────────────────────────────────

function CategorySection({ group }: { group: CategoryGroupDto }) {
  const connectedCount = group.providers.filter(
    (p) => p.config?.connected || p.config?.syncStatus === "PENDING",
  ).length;

  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <div className="flex items-center gap-2 text-foreground">
          {categoryIcon(group.category)}
          <h3 className="text-base font-semibold">{group.label}</h3>
        </div>
        {connectedCount > 0 && (
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">
            {connectedCount} active
          </span>
        )}
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {group.providers.map((p) => (
          <ProviderCard key={p.providerId} provider={p} />
        ))}
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const restaurantId = useRestaurantId();
  const { data: groups, isLoading, error } = useIntegrations();

  if (!restaurantId) return null;

  const totalConnected = (groups ?? []).reduce(
    (n, g) => n + g.providers.filter((p) => p.config?.connected).length,
    0,
  );
  const totalPending = (groups ?? []).reduce(
    (n, g) => n + g.providers.filter((p) => !p.config?.connected && p.config?.syncStatus === "PENDING").length,
    0,
  );
  const totalProviders = (groups ?? []).reduce((n, g) => n + g.providers.length, 0);

  return (
    <AppShell title="Integrations">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            Connect external systems to sync data automatically. No CSV uploads required once connected.
          </p>
        </div>
        {/* Summary chips */}
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 font-medium text-muted-foreground">
            <Plug className="h-3.5 w-3.5" />
            {totalProviders} available
          </span>
          {totalConnected > 0 && (
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 font-semibold text-emerald-500">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {totalConnected} connected
            </span>
          )}
          {totalPending > 0 && (
            <span className="flex items-center gap-1.5 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-3 py-1.5 font-semibold text-yellow-500">
              <Clock className="h-3.5 w-3.5" />
              {totalPending} requested
            </span>
          )}
        </div>
      </div>

      {/* Live connections — real, credential-holding integrations, distinct
          from the placeholder registry below. */}
      <section className="mb-8">
        <div className="mb-3 flex items-center gap-3">
          <h3 className="text-base font-semibold text-foreground">Connected Providers</h3>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <LiefersoftCard />
        </div>
      </section>

      {/* Future-ready banner */}
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-accent/20 bg-accent/5 px-4 py-3">
        <Zap className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
        <div className="text-sm">
          <span className="font-semibold text-foreground">Integration infrastructure is ready. </span>
          <span className="text-muted-foreground">
            All providers below are registered in the platform registry. When a real integration is implemented,
            clicking Connect will complete the full authentication flow. Until then, use the{" "}
            <strong>Data Centre</strong> CSV imports as the data source.
          </span>
        </div>
      </div>

      {isLoading && <LoadingBanner label="Loading integrations…" />}
      {!isLoading && error && (
        <ErrorBanner message={error instanceof Error ? error.message : "Failed to load integrations"} />
      )}

      {groups && (
        <div className="flex flex-col gap-8">
          {groups.map((group) => (
            <CategorySection key={group.category} group={group} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
