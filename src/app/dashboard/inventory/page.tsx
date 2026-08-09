"use client";

import React, { useRef, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { ConfigMissingBanner, ErrorBanner, LoadingBanner } from "@/components/shared/query-states";
import { OverviewTile } from "@/components/shared/overview-tile";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useRestaurantId } from "@/hooks/use-restaurant-id";
import { formatCurrency, cn } from "@/lib/utils";
import {
  useInventoryOverview, useInventoryItems, useProducts,
  useCreateProduct, useRecordStockCount, useRecordWaste, useInventoryAiCheck,
  usePurchaseRecommendations, useGeneratePurchaseRecommendations, useUpdateRecommendationStatus,
  type WasteReason,
} from "@/hooks/use-inventory";
import {
  useInvoices, useInvoiceDetail, useUploadInvoice,
  useUpdateInvoiceLine, useConfirmInvoice,
  type InvoiceReviewStatus,
} from "@/hooks/use-invoices";
import {
  Euro, Package, AlertTriangle, Clock, Trash2, ShoppingCart,
  Upload, FileText, CheckCircle2, X, Plus, Loader2, Sparkles, RefreshCw, XCircle,
} from "lucide-react";

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </h2>
  );
}

// ── Executive AI summary ──────────────────────────────────────────────────────
// Unlike Analytics' summary (built from deterministic stats — no AI endpoint
// existed there), Inventory already has real AI reasoning available via
// InventoryAgentService / the ai-check endpoint. This resurfaces that
// dormant data instead of writing a parallel deterministic generator.

function InventoryExecutiveSummaryCard() {
  const { data, isLoading } = useInventoryAiCheck();
  const recommendations = [...(data?.recommendations ?? [])]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);

  return (
    <div className="card-surface border-accent/20 bg-accent/[0.03] p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Sparkles className="h-4 w-4" />
        </span>
        <h2 className="text-sm font-semibold">AI Inventory Summary</h2>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Running Inventory Agent…</p>
      ) : recommendations.length === 0 ? (
        <p className="text-sm text-muted-foreground">No issues found. Inventory looks healthy.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {recommendations.map((r) => (
              <li key={r.id} className="flex gap-2 text-sm text-foreground/90">
                <span className="text-accent">•</span>
                {r.problem}
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Key Recommendations</p>
            <ul className="flex flex-col gap-1.5">
              {recommendations.map((r) => (
                <li key={r.id} className="flex gap-2 text-sm text-foreground/90">
                  <span className="text-accent">•</span>
                  {r.suggestedAction}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

// ── Purchase recommendations ──────────────────────────────────────────────────
// Replaces the old static reorderPoint-only list: these are persisted
// proposals (PENDING/APPROVED/DISMISSED) generated from burn-rate math +
// supplier lead time, with reasoning from the same Decision Engine behind
// the AI Inventory Summary above. Approving/dismissing only records a
// manager decision — nothing here places an order automatically.

function PurchaseRecommendationsSection() {
  const { data: recommendations, isLoading } = usePurchaseRecommendations("PENDING");
  const generate = useGeneratePurchaseRecommendations();
  const updateStatus = useUpdateRecommendationStatus();

  return (
    <div className="card-surface p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Reorder Recommendations</p>
        <button
          onClick={() => generate.mutate()}
          disabled={generate.isPending}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/40 disabled:opacity-50"
        >
          {generate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {generate.isPending ? "Analyzing…" : "Refresh"}
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading recommendations…</p>
      ) : !recommendations || recommendations.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No open recommendations. Click Refresh to analyze current stock and consumption trends.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {recommendations.map((r) => (
            <div key={r.id} className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{r.product.name}</span>
                  <span className="text-sm text-accent">reorder {Number(r.suggestedQuantity)} {r.product.unit}</span>
                  {r.confidence !== null && (
                    <span className={cn(
                      "text-xs font-medium",
                      r.confidence >= 0.75 ? "text-emerald-500" : r.confidence >= 0.5 ? "text-amber-500" : "text-red-500",
                    )}>
                      {Math.round(r.confidence * 100)}% confidence
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{r.reasoning}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => updateStatus.mutate({ recommendationId: r.id, status: "APPROVED" })}
                  disabled={updateStatus.isPending}
                  className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                </button>
                <button
                  onClick={() => updateStatus.mutate({ recommendationId: r.id, status: "DISMISSED" })}
                  disabled={updateStatus.isPending}
                  className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/40 disabled:opacity-50"
                >
                  <XCircle className="h-3.5 w-3.5" /> Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Add product form ──────────────────────────────────────────────────────────

function AddProductForm({ onClose }: { onClose: () => void }) {
  const createProduct = useCreateProduct();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [category, setCategory] = useState("");
  const [reorderPoint, setReorderPoint] = useState("");
  const [parLevel, setParLevel] = useState("");

  const [formError, setFormError] = useState<string | null>(null);

  const submit = () => {
    setFormError(null);
    if (!name.trim() || !unit.trim()) {
      setFormError("Product name and unit are required.");
      return;
    }
    const reorderPointNum = reorderPoint.trim() ? Number(reorderPoint) : undefined;
    const parLevelNum = parLevel.trim() ? Number(parLevel) : undefined;
    if (reorderPointNum !== undefined && (!Number.isFinite(reorderPointNum) || reorderPointNum < 0)) {
      setFormError("Reorder point must be a non-negative number.");
      return;
    }
    if (parLevelNum !== undefined && (!Number.isFinite(parLevelNum) || parLevelNum < 0)) {
      setFormError("Par level must be a non-negative number.");
      return;
    }
    createProduct.mutate(
      {
        name: name.trim(),
        unit: unit.trim(),
        category: category.trim() || "uncategorized",
        reorderPoint: reorderPointNum,
        parLevel: parLevelNum,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <div className="card-surface flex flex-col gap-3 p-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <input className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm sm:col-span-2" placeholder="Product name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm" placeholder="Unit (kg, L…)" value={unit} onChange={(e) => setUnit(e.target.value)} />
        <input className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm" placeholder="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
        <input className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm" placeholder="Reorder point" type="number" value={reorderPoint} onChange={(e) => setReorderPoint(e.target.value)} />
      </div>
      <div className="flex items-center gap-2">
        <input className="w-40 rounded-lg border border-border bg-transparent px-3 py-2 text-sm" placeholder="Par level (optional)" type="number" value={parLevel} onChange={(e) => setParLevel(e.target.value)} />
        <button onClick={submit} disabled={createProduct.isPending} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50">
          {createProduct.isPending ? "Adding…" : "Add Product"}
        </button>
        <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted/40">Cancel</button>
      </div>
      {formError && <p className="text-xs text-red-500">{formError}</p>}
    </div>
  );
}

// ── Count / waste quick-action popover ────────────────────────────────────────

// A count/waste entry that's drastically different from current stock is
// more likely a typo (a stray zero) than a real event — worth a confirm
// step rather than writing it straight to the ledger. Not a hard block:
// legitimate large corrections (e.g. first-ever count on a new product)
// still go through once confirmed.
function isSuspiciousQuantity(mode: "count" | "waste", entered: number, current: number): boolean {
  if (mode === "waste") return entered > current && current > 0;
  return current > 0 && (entered > current * 5 || entered < current / 5) && Math.abs(entered - current) > 5;
}

function QuickActionForm({
  productId, unit, mode, currentQuantity, onClose,
}: {
  productId: string; unit: string; mode: "count" | "waste"; currentQuantity: number; onClose: () => void;
}) {
  const recordCount = useRecordStockCount();
  const recordWaste = useRecordWaste();
  const [value, setValue] = useState("");
  const [reason, setReason] = useState<WasteReason>("SPOILAGE");
  const [confirmLargeChange, setConfirmLargeChange] = useState(false);
  const pending = recordCount.isPending || recordWaste.isPending;

  const doSubmit = (n: number) => {
    if (mode === "count") {
      recordCount.mutate({ productId, countedQuantity: n }, { onSuccess: onClose });
    } else {
      recordWaste.mutate({ productId, quantity: n, reason }, { onSuccess: onClose });
    }
  };

  const submit = () => {
    const n = Number(value);
    if (isNaN(n) || n < 0) return;
    if (mode === "waste" && n <= 0) return;
    if (isSuspiciousQuantity(mode, n, currentQuantity)) {
      setConfirmLargeChange(true);
      return;
    }
    doSubmit(n);
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-2">
      <input
        autoFocus
        type="number"
        className="w-24 rounded border border-border bg-transparent px-2 py-1 text-sm"
        placeholder={mode === "count" ? "New qty" : "Qty"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <span className="text-xs text-muted-foreground">{unit}</span>
      {mode === "waste" && (
        <select className="rounded border border-border bg-transparent px-2 py-1 text-xs" value={reason} onChange={(e) => setReason(e.target.value as WasteReason)}>
          <option value="SPOILAGE">Spoilage</option>
          <option value="OVERPRODUCTION">Overproduction</option>
          <option value="PREP_ERROR">Prep error</option>
          <option value="OTHER">Other</option>
        </select>
      )}
      <button onClick={submit} disabled={pending} className="rounded bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground disabled:opacity-50">
        {pending ? "…" : "Save"}
      </button>
      <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted/40"><X className="h-3.5 w-3.5" /></button>

      <ConfirmDialog
        open={confirmLargeChange}
        onOpenChange={setConfirmLargeChange}
        title={mode === "count" ? "Confirm this stock count" : "Confirm this waste entry"}
        description={
          mode === "count"
            ? `Current stock is ${currentQuantity}${unit} — entering ${value}${unit} is a big jump. Double-check the number before saving; this overwrites the ledger.`
            : `You're recording more waste (${value}${unit}) than the ${currentQuantity}${unit} currently on hand. Double-check the number before saving.`
        }
        confirmLabel="Save Anyway"
        destructive={false}
        isLoading={pending}
        onConfirm={() => { setConfirmLargeChange(false); doSubmit(Number(value)); }}
      />
    </div>
  );
}

// ── Invoice review status badge ───────────────────────────────────────────────

function ReviewBadge({ status }: { status: InvoiceReviewStatus }) {
  const map: Record<InvoiceReviewStatus, string> = {
    PENDING_REVIEW: "bg-amber-500/10 text-amber-500",
    EXTRACTION_FAILED: "bg-red-500/10 text-red-500",
    CONFIRMED: "bg-emerald-500/10 text-emerald-500",
  };
  const label: Record<InvoiceReviewStatus, string> = {
    PENDING_REVIEW: "Needs Review",
    EXTRACTION_FAILED: "Needs Manual Entry",
    CONFIRMED: "Confirmed",
  };
  return <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", map[status])}>{label[status]}</span>;
}

// ── Invoice review panel ──────────────────────────────────────────────────────

function InvoiceReviewPanel({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const { data: invoice, isLoading } = useInvoiceDetail(invoiceId);
  const { data: products } = useProducts();
  const updateLine = useUpdateInvoiceLine();
  const confirmInvoice = useConfirmInvoice();

  if (isLoading || !invoice) {
    return <div className="card-surface p-6 text-sm text-muted-foreground">Loading invoice…</div>;
  }

  const unmatchedCount = invoice.lines.filter((l) => !l.productId).length;

  return (
    <div className="card-surface flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
            <FileText className="h-4 w-4" />
          </span>
          <div>
            <p className="font-medium">{invoice.supplier.name}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(invoice.issuedAt).toLocaleDateString()} · {invoice.sourceFile ?? "manual entry"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ReviewBadge status={invoice.reviewStatus} />
          <button onClick={onClose} className="rounded p-1.5 text-muted-foreground hover:bg-muted/40"><X className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3">Extracted Name</th>
              <th className="py-2 pr-3">Matched Product</th>
              <th className="py-2 pr-3 text-right">Qty</th>
              <th className="py-2 pr-3 text-right">Unit Price</th>
              <th className="py-2 pr-3 text-right">VAT %</th>
              <th className="py-2 pr-3 text-right">Line Total</th>
              <th className="py-2 pr-3">Confidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {invoice.lines.map((line) => (
              <tr key={line.id}>
                <td className="py-2 pr-3">{line.rawProductName}</td>
                <td className="py-2 pr-3">
                  <select
                    className={cn(
                      "rounded border bg-transparent px-2 py-1 text-xs",
                      line.productId ? "border-border" : "border-red-500/50 text-red-500",
                    )}
                    value={line.productId ?? ""}
                    disabled={invoice.reviewStatus === "CONFIRMED"}
                    onChange={(e) =>
                      updateLine.mutate({ invoiceId, lineId: line.id, dto: { productId: e.target.value || null } })
                    }
                  >
                    <option value="">— unmatched —</option>
                    {products?.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </td>
                <td className="py-2 pr-3 text-right">
                  <input
                    type="number"
                    disabled={invoice.reviewStatus === "CONFIRMED"}
                    defaultValue={line.quantity}
                    className="w-20 rounded border border-border bg-transparent px-2 py-1 text-right text-xs"
                    onBlur={(e) => {
                      const n = Number(e.target.value);
                      if (!isNaN(n) && n !== Number(line.quantity)) {
                        updateLine.mutate({ invoiceId, lineId: line.id, dto: { quantity: n } });
                      }
                    }}
                  />
                </td>
                <td className="py-2 pr-3 text-right">{formatCurrency(Number(line.unitPrice))}</td>
                <td className="py-2 pr-3 text-right">{Number(line.vatRate).toFixed(1)}%</td>
                <td className="py-2 pr-3 text-right font-medium">{formatCurrency(Number(line.lineTotal))}</td>
                <td className="py-2 pr-3">
                  {line.confidence !== null ? (
                    <span className={cn(
                      "text-xs font-medium",
                      line.confidence >= 0.75 ? "text-emerald-500" : line.confidence >= 0.5 ? "text-amber-500" : "text-red-500",
                    )}>
                      {Math.round(line.confidence * 100)}%
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">manual</span>
                  )}
                </td>
              </tr>
            ))}
            {invoice.lines.length === 0 && (
              <tr><td colSpan={7} className="py-4 text-center text-sm text-muted-foreground">No lines extracted — add them manually or re-upload a clearer photo.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <p className="text-xs text-muted-foreground">
          {unmatchedCount > 0
            ? `${unmatchedCount} line${unmatchedCount === 1 ? "" : "s"} unmatched — they'll still count toward the invoice total but won't update stock.`
            : "All lines matched."}
        </p>
        {invoice.reviewStatus !== "CONFIRMED" ? (
          <button
            onClick={() => confirmInvoice.mutate(invoiceId, { onSuccess: onClose })}
            disabled={confirmInvoice.isPending}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            {confirmInvoice.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Confirm &amp; Update Stock
          </button>
        ) : (
          <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-500">
            <CheckCircle2 className="h-4 w-4" /> Stock updated
          </span>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const restaurantId = useRestaurantId();
  const { data: overview, isLoading: overviewLoading, isError: overviewError } = useInventoryOverview();
  const { data: items, isLoading: itemsLoading, isError: itemsError } = useInventoryItems();
  const { data: invoices, isError: invoicesError } = useInvoices();

  const uploadInvoice = useUploadInvoice();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showAddProduct, setShowAddProduct] = useState(false);
  const [quickAction, setQuickAction] = useState<{ productId: string; unit: string; mode: "count" | "waste" } | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  if (!restaurantId) {
    return <AppShell title="Inventory"><ConfigMissingBanner /></AppShell>;
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError(null);
    uploadInvoice.mutate(file, {
      onSuccess: (invoice) => setSelectedInvoiceId(invoice.id),
      onError: (err) => setUploadError(err instanceof Error ? err.message : "Upload failed"),
    });
  };

  return (
    <AppShell title="Inventory">
      <div className="flex flex-col gap-8">

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Inventory</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Stock, purchases, and waste — one ledger, always up to date.</p>
          </div>
          <button
            onClick={() => setShowAddProduct((s) => !s)}
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted/40"
          >
            <Plus className="h-4 w-4" /> Add Product
          </button>
        </div>

        {showAddProduct && <AddProductForm onClose={() => setShowAddProduct(false)} />}

        <InventoryExecutiveSummaryCard />

        {/* Overview */}
        <div>
          <SectionLabel>Overview</SectionLabel>
          {overviewLoading ? (
            <LoadingBanner label="Loading inventory overview…" />
          ) : overviewError || !overview ? (
            <ErrorBanner message="Failed to load inventory overview." />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                <OverviewTile label="Inventory Value" value={formatCurrency(overview.inventoryValue)} icon={<Euro className="h-4 w-4" />} />
                <OverviewTile label="Health" value={`${overview.healthPct}%`} icon={<Package className="h-4 w-4" />} tone={overview.healthPct < 70 ? "warning" : undefined} />
                <OverviewTile
                  label="Low Stock"
                  value={String(overview.lowStockCount)}
                  sub={`of ${overview.totalProducts} products`}
                  icon={<AlertTriangle className="h-4 w-4" />}
                  tone={overview.lowStockCount > 0 ? "warning" : undefined}
                />
                <OverviewTile
                  label="Expiring Soon"
                  value={String(overview.expiringSoonCount)}
                  sub="within 7 days"
                  icon={<Clock className="h-4 w-4" />}
                  tone={overview.expiringSoonCount > 0 ? "warning" : undefined}
                />
                <OverviewTile label="Today's Waste" value={String(overview.todayWasteQty)} icon={<Trash2 className="h-4 w-4" />} tone={overview.todayWasteQty > 0 ? "danger" : undefined} />
                <OverviewTile label="Invoices to Review" value={String(overview.pendingInvoiceReviewCount)} icon={<FileText className="h-4 w-4" />} tone={overview.pendingInvoiceReviewCount > 0 ? "warning" : undefined} />
              </div>

              <div className="mt-4">
                <PurchaseRecommendationsSection />
              </div>
            </>
          )}
        </div>

        {/* Purchases & Invoices */}
        <div>
          <SectionLabel>Purchases &amp; Invoices</SectionLabel>
          <div className="card-surface p-6">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Upload a photo or scan of a supplier invoice — AI extracts the line items for review.</p>
              <div>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadInvoice.isPending}
                  className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
                >
                  {uploadInvoice.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploadInvoice.isPending ? "Extracting…" : "Upload Invoice"}
                </button>
              </div>
            </div>

            {uploadError && <p className="mb-3 text-sm text-red-500">{uploadError}</p>}

            {selectedInvoiceId && (
              <div className="mb-4">
                <InvoiceReviewPanel invoiceId={selectedInvoiceId} onClose={() => setSelectedInvoiceId(null)} />
              </div>
            )}

            {invoicesError ? (
              <ErrorBanner message="Failed to load invoices. Try refreshing the page." />
            ) : !invoices || invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No invoices yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3">Supplier</th>
                      <th className="py-2 pr-3">Date</th>
                      <th className="py-2 pr-3 text-right">Lines</th>
                      <th className="py-2 pr-3 text-right">Amount</th>
                      <th className="py-2 pr-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {invoices.map((inv) => (
                      <tr
                        key={inv.id}
                        className="cursor-pointer hover:bg-muted/20"
                        onClick={() => setSelectedInvoiceId(inv.id)}
                      >
                        <td className="py-2.5 pr-3 font-medium">{inv.supplier.name}</td>
                        <td className="py-2.5 pr-3 text-muted-foreground">{new Date(inv.issuedAt).toLocaleDateString()}</td>
                        <td className="py-2.5 pr-3 text-right">{inv._count.lines}</td>
                        <td className="py-2.5 pr-3 text-right font-medium">{formatCurrency(Number(inv.amount))}</td>
                        <td className="py-2.5 pr-3"><ReviewBadge status={inv.reviewStatus} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Stock */}
        <div>
          <SectionLabel>Stock</SectionLabel>
          <div className="card-surface overflow-hidden">
            {itemsLoading ? (
              <div className="p-5"><LoadingBanner label="Loading stock…" /></div>
            ) : itemsError ? (
              <div className="p-5"><ErrorBanner message="Failed to load stock. Try refreshing the page." /></div>
            ) : !items || items.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">No products yet. Add one above, or upload an invoice / CSV.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3">Product</th>
                    <th className="px-5 py-3">Category</th>
                    <th className="px-5 py-3 text-right">On Hand</th>
                    <th className="px-5 py-3 text-right">Reorder Point</th>
                    <th className="px-5 py-3 text-right">Unit Cost</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((item) => (
                    <React.Fragment key={item.id}>
                      <tr>
                        <td className="px-5 py-3 font-medium">{item.name}</td>
                        <td className="px-5 py-3 text-muted-foreground">{item.category}</td>
                        <td className="px-5 py-3 text-right">{item.quantityOnHand} {item.unit}</td>
                        <td className="px-5 py-3 text-right text-muted-foreground">{item.reorderPoint} {item.unit}</td>
                        <td className="px-5 py-3 text-right text-muted-foreground">{item.lastUnitCost !== null ? formatCurrency(item.lastUnitCost) : "—"}</td>
                        <td className="px-5 py-3">
                          {item.isLowStock && <span className="mr-1.5 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-500">Low</span>}
                          {item.isExpiringSoon && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-500">Expiring</span>}
                          {!item.isLowStock && !item.isExpiringSoon && <span className="text-xs text-muted-foreground">OK</span>}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setQuickAction({ productId: item.productId, unit: item.unit, mode: "count" })}
                              className="flex items-center gap-1 rounded border border-border px-2.5 py-1 text-xs hover:bg-muted/40"
                            >
                              <ShoppingCart className="h-3 w-3" /> Count
                            </button>
                            <button
                              onClick={() => setQuickAction({ productId: item.productId, unit: item.unit, mode: "waste" })}
                              className="flex items-center gap-1 rounded border border-border px-2.5 py-1 text-xs hover:bg-muted/40"
                            >
                              <Trash2 className="h-3 w-3" /> Waste
                            </button>
                          </div>
                        </td>
                      </tr>
                      {quickAction?.productId === item.productId && (
                        <tr>
                          <td colSpan={7} className="px-5 pb-3">
                            <QuickActionForm
                              productId={quickAction.productId}
                              unit={quickAction.unit}
                              mode={quickAction.mode}
                              currentQuantity={item.quantityOnHand}
                              onClose={() => setQuickAction(null)}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
    </AppShell>
  );
}
