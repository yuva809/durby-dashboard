"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { ConfigMissingBanner, ErrorBanner, LoadingBanner } from "@/components/shared/query-states";
import { OverviewTile } from "@/components/shared/overview-tile";
import { useRestaurantId } from "@/hooks/use-restaurant-id";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api-client";
import { ReputationScoreChart } from "@/components/reviews/reputation-score-chart";
import {
  useGoogleConnection, useStartGoogleOAuth, useDisconnectGoogle,
  useReviewsList, useSyncReviews, useReviewAnalytics, useReviewInsights,
  useAggregatedRecommendations, useReputationScoreHistory,
  useReviewTasks, useCompleteReviewTask, useDismissReviewTask,
  useReviewSettings, useUpdateReviewSettings,
  useApproveReply, useEditReply, useRejectReply,
  type GoogleReviewDto,
} from "@/hooks/use-reviews";
import {
  Star, Sparkles, RefreshCw, Loader2, Link2, Unlink, Check, X, Pencil,
  ClipboardList, TrendingUp,
} from "lucide-react";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </h2>
  );
}

const PRIORITY_TONE: Record<string, "danger" | "warning" | undefined> = {
  CRITICAL: "danger",
  HIGH: "danger",
  MEDIUM: "warning",
};

// ── Connection card ─────────────────────────────────────────────────────────

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

function GoogleConnectionCard() {
  const { data, isLoading } = useGoogleConnection();
  const startOAuth = useStartGoogleOAuth();
  const disconnect = useDisconnectGoogle();

  const connected = data?.status === "CONNECTED";

  return (
    <div className="card-surface flex flex-col gap-2 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full",
              connected ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground",
            )}
          >
            <Star className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-medium">
              {isLoading ? "Checking connection…" : connected ? `Connected — ${data?.locationName ?? "Google Business Profile"}` : "Google Business Profile not connected"}
            </p>
            {connected && data?.lastSync && (
              <p className="text-xs text-muted-foreground">Last synced {new Date(data.lastSync).toLocaleString()}</p>
            )}
          </div>
        </div>
        {connected ? (
          <button
            onClick={() => disconnect.mutate()}
            disabled={disconnect.isPending}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/40 disabled:opacity-50"
          >
            <Unlink className="h-3.5 w-3.5" />
            Disconnect
          </button>
        ) : (
          <button
            onClick={async () => {
              try {
                const res = await startOAuth.mutateAsync();
                window.location.href = res.url;
              } catch {
                // error surfaced via startOAuth.error below
              }
            }}
            disabled={startOAuth.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
          >
            {startOAuth.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
            Connect Google Business Profile
          </button>
        )}
      </div>
      {startOAuth.isError && (
        <p className="text-xs text-red-500">{extractErrorMessage(startOAuth.error)}</p>
      )}
      {disconnect.isError && (
        <p className="text-xs text-red-500">{extractErrorMessage(disconnect.error)}</p>
      )}
    </div>
  );
}

// ── AI Insights panel ───────────────────────────────────────────────────────

function InsightsPanel() {
  const { data, isLoading } = useReviewInsights();
  const { data: recommendations } = useAggregatedRecommendations();

  return (
    <div className="card-surface border-accent/20 bg-accent/[0.03] p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Sparkles className="h-4 w-4" />
        </span>
        <h2 className="text-sm font-semibold">AI Reputation Insights</h2>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Analyzing reviews…</p>
      ) : !data || data.insights.length === 0 ? (
        <p className="text-sm text-muted-foreground">Not enough review data yet to generate insights.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {data.insights.map((insight, i) => (
              <li key={i} className="flex gap-2 text-sm text-foreground/90">
                <span className="text-accent">•</span>
                {insight}
              </li>
            ))}
          </ul>
          {!!recommendations?.length && (
            <div className="mt-4 border-t border-border pt-4">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Operational Recommendations
              </p>
              <ul className="flex flex-col gap-1.5">
                {recommendations.slice(0, 5).map((r, i) => (
                  <li key={i} className="flex gap-2 text-sm text-foreground/90">
                    <span className="text-accent">•</span>
                    {r.recommendation}
                    {r.reviewCount > 1 && <span className="text-xs text-muted-foreground">({r.reviewCount} reviews)</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Reputation score ────────────────────────────────────────────────────────

function ReputationScoreCard() {
  const { data, isLoading } = useReputationScoreHistory();
  const latest = data?.[0];
  const chartData = [...(data ?? [])].reverse().map((s) => ({ date: s.computedAt.slice(0, 10), score: s.score }));

  return (
    <div className="card-surface p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Reputation Score</p>
        {latest && <span className="text-2xl font-semibold tabular-nums">{latest.score}<span className="text-sm text-muted-foreground">/100</span></span>}
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : chartData.length === 0 ? (
        <p className="text-sm text-muted-foreground">No score history yet — computed weekly alongside the reputation report.</p>
      ) : (
        <ReputationScoreChart data={chartData} />
      )}
    </div>
  );
}

// ── Operational tasks ───────────────────────────────────────────────────────

function TasksPanel() {
  const { data, isLoading } = useReviewTasks("open");
  const complete = useCompleteReviewTask();
  const dismiss = useDismissReviewTask();

  return (
    <div className="card-surface p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 text-accent">
          <ClipboardList className="h-4 w-4" />
        </span>
        <h2 className="text-sm font-semibold">Operational Tasks</h2>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No open tasks.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {data.map((task) => (
            <div key={task.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">{task.title}</p>
                <p className="text-xs text-muted-foreground">{task.description}</p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  onClick={() => complete.mutate(task.id)}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-emerald-500 hover:bg-emerald-500/10"
                  title="Mark complete"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  onClick={() => dismiss.mutate(task.id)}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/40"
                  title="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Review row ───────────────────────────────────────────────────────────────

function ReviewRow({ review }: { review: GoogleReviewDto }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(review.aiSuggestedReply ?? "");
  const approve = useApproveReply();
  const edit = useEditReply();
  const reject = useRejectReply();

  const needsAction = review.replyStatus === "AI_DRAFTED";

  return (
    <div className="flex flex-col gap-2 border-b border-border py-4 last:border-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-0.5">
            {Array.from({ length: 5 }, (_, i) => (
              <Star key={i} className={cn("h-3.5 w-3.5", i < review.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")} />
            ))}
          </span>
          <span className="text-sm font-medium">{review.reviewerName}</span>
          {review.priority && (
            <span className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase",
              PRIORITY_TONE[review.priority] === "danger" && "bg-red-500/10 text-red-500",
              PRIORITY_TONE[review.priority] === "warning" && "bg-amber-500/10 text-amber-500",
              !PRIORITY_TONE[review.priority] && "bg-muted text-muted-foreground",
            )}>
              {review.priority}
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{new Date(review.reviewDate).toLocaleDateString()}</span>
      </div>

      {review.reviewText && <p className="text-sm text-foreground/90">{review.reviewText}</p>}

      {review.possibleCause && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">Possible cause:</span> {review.possibleCause}
          {review.causeConfidence !== null && ` (${Math.round(review.causeConfidence * 100)}% confidence)`}
        </p>
      )}

      {(review.aiSuggestedReply || review.replyText) && (
        <div className="mt-1 rounded-lg bg-muted/30 p-3">
          {editing ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full resize-none rounded-md border border-border bg-background p-2 text-sm"
              rows={3}
            />
          ) : (
            <p className="text-sm text-foreground/90">{review.replyText ?? review.aiSuggestedReply}</p>
          )}
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{review.replyStatus.replace("_", " ")}</span>
            {needsAction && (
              <div className="flex gap-1.5">
                {editing ? (
                  <>
                    <button
                      onClick={() => { edit.mutate({ reviewId: review.id, text: draft }); setEditing(false); }}
                      className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground hover:opacity-90"
                    >
                      Save & Publish
                    </button>
                    <button onClick={() => setEditing(false)} className="rounded-md border border-border px-2.5 py-1 text-xs">Cancel</button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => approve.mutate({ reviewId: review.id, text: review.aiSuggestedReply ?? "" })}
                      className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground hover:opacity-90"
                    >
                      <Check className="h-3 w-3" /> Approve
                    </button>
                    <button
                      onClick={() => setEditing(true)}
                      className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted/40"
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                    <button
                      onClick={() => reject.mutate({ reviewId: review.id })}
                      className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-red-500 hover:bg-red-500/10"
                    >
                      <X className="h-3 w-3" /> Reject
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Settings ─────────────────────────────────────────────────────────────────

function SettingsPanel() {
  const { data } = useReviewSettings();
  const update = useUpdateReviewSettings();
  if (!data) return null;

  return (
    <div className="card-surface p-6">
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Reply Settings</p>
      <div className="flex flex-col gap-4">
        <label className="flex items-center justify-between text-sm">
          <span>Auto-reply to high-star reviews</span>
          <input
            type="checkbox"
            checked={data.autoReplyEnabled}
            onChange={(e) => update.mutate({ autoReplyEnabled: e.target.checked })}
            className="h-4 w-4"
          />
        </label>
        <label className="flex items-center justify-between text-sm">
          <span>Minimum rating for auto-reply</span>
          <select
            value={data.autoReplyMinRating}
            onChange={(e) => update.mutate({ autoReplyMinRating: Number(e.target.value) })}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm"
          >
            <option value={5}>5 stars only</option>
            <option value={4}>4 & 5 stars</option>
          </select>
        </label>
        <label className="flex items-center justify-between text-sm">
          <span>Reply tone</span>
          <select
            value={data.tone}
            onChange={(e) => update.mutate({ tone: e.target.value as never })}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm"
          >
            <option value="PROFESSIONAL">Professional</option>
            <option value="FRIENDLY">Friendly</option>
            <option value="CASUAL">Casual</option>
            <option value="PREMIUM">Premium</option>
          </select>
        </label>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ReviewsPage() {
  const restaurantId = useRestaurantId();
  const { data: analytics, isLoading: analyticsLoading, error: analyticsError } = useReviewAnalytics();
  const { data: reviews, isLoading: reviewsLoading } = useReviewsList();
  const sync = useSyncReviews();

  if (!restaurantId) {
    return (
      <AppShell title="Reviews">
        <ConfigMissingBanner />
      </AppShell>
    );
  }
  if (analyticsError) {
    return (
      <AppShell title="Reviews">
        <ErrorBanner message="Failed to load Reviews data." />
      </AppShell>
    );
  }

  return (
    <AppShell title="Reviews">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Reviews</h1>
            <p className="text-sm text-muted-foreground">Google reviews, AI replies, and reputation intelligence.</p>
          </div>
          <button
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/40 disabled:opacity-50"
          >
            {sync.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {sync.isPending ? "Syncing…" : "Sync now"}
          </button>
        </div>

        <GoogleConnectionCard />

        {analyticsLoading ? (
          <LoadingBanner />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <OverviewTile label="Average Rating" value={analytics?.averageRating?.toFixed(2) ?? "—"} icon={<Star className="h-3.5 w-3.5" />} />
              <OverviewTile label="Total Reviews" value={String(analytics?.totalReviews ?? 0)} icon={<TrendingUp className="h-3.5 w-3.5" />} />
              <OverviewTile label="This Month" value={String(analytics?.reviewsThisMonth ?? 0)} icon={<Star className="h-3.5 w-3.5" />} />
              <OverviewTile
                label="Pending Replies"
                value={String(analytics?.pendingReplies ?? 0)}
                icon={<ClipboardList className="h-3.5 w-3.5" />}
                tone={analytics && analytics.pendingReplies > 0 ? "warning" : undefined}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <InsightsPanel />
              <ReputationScoreCard />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="card-surface p-6 lg:col-span-2">
                <SectionLabel>Reviews</SectionLabel>
                {reviewsLoading ? (
                  <p className="text-sm text-muted-foreground">Loading reviews…</p>
                ) : !reviews || reviews.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No reviews yet — connect Google Business Profile and sync to import reviews.</p>
                ) : (
                  <div>{reviews.map((r) => <ReviewRow key={r.id} review={r} />)}</div>
                )}
              </div>
              <div className="flex flex-col gap-4">
                <TasksPanel />
                <SettingsPanel />
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
