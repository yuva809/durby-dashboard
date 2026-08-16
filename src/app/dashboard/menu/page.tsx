"use client";

import React, { useRef, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { ConfigMissingBanner, ErrorBanner, LoadingBanner } from "@/components/shared/query-states";
import { OverviewTile } from "@/components/shared/overview-tile";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useRestaurantId } from "@/hooks/use-restaurant-id";
import { useRestaurantContext } from "@/providers/restaurant-provider";
import { formatCurrency, cn } from "@/lib/utils";
import { tryConvertUnit } from "@/lib/units";
import {
  useMenuOverview, useMenuCategories, useMenuItems, useUploadMenu,
  useCreateCategory, useDeleteCategory,
  useCreateMenuItem, useUpdateMenuItem, useDeleteMenuItem,
  type MenuItemDto, type MenuOverviewDto,
} from "@/hooks/use-menu";
import { useProducts } from "@/hooks/use-inventory";
import { useRecipe, useSetRecipe, type RecipeLineInput } from "@/hooks/use-recipes";
import {
  BookOpen, Layers, FileClock, CheckCircle2, Upload, Plus, Trash2, X, Loader2, ChefHat, ChevronDown, Sparkles,
} from "lucide-react";

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </h2>
  );
}

// ── Status summary ─────────────────────────────────────────────────────────────
// Lighter than Inventory's AI summary — Menu has no equivalent AI agent yet,
// and its overview is a handful of counts, not enough for a full narrative.
// Same visual language (Sparkles, accent-tinted card) as Analytics/Inventory
// so the three pages still read as one product, without inventing content
// there's no real signal for.

function MenuStatusCard({ overview }: { overview: MenuOverviewDto }) {
  const message = overview.pendingReviewCount > 0
    ? `${overview.pendingReviewCount} menu item${overview.pendingReviewCount === 1 ? "" : "s"} from your last upload still need${overview.pendingReviewCount === 1 ? "s" : ""} review before they'll appear on the confirmed menu.`
    : overview.totalItems === 0
      ? "No menu items yet — upload a photo of your menu or add items manually to get started."
      : "All menu items are reviewed and confirmed.";

  return (
    <div className="card-surface border-accent/20 bg-accent/[0.03] p-6">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Sparkles className="h-4 w-4" />
        </span>
        <h2 className="text-sm font-semibold">Menu Status</h2>
      </div>
      <p className="mt-3 text-sm text-foreground/90">{message}</p>
    </div>
  );
}

// ── Add category form ─────────────────────────────────────────────────────────

function AddCategoryForm({ onClose }: { onClose: () => void }) {
  const createCategory = useCreateCategory();
  const [name, setName] = useState("");
  const submit = () => {
    if (!name.trim()) return;
    createCategory.mutate({ name: name.trim() }, { onSuccess: onClose });
  };
  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        className="rounded-lg border border-border bg-transparent px-3 py-1.5 text-sm"
        placeholder="Category name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <button onClick={submit} disabled={createCategory.isPending} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground disabled:opacity-50">
        {createCategory.isPending ? "…" : "Add"}
      </button>
      <button onClick={onClose} className="rounded p-1.5 text-muted-foreground hover:bg-muted/40"><X className="h-3.5 w-3.5" /></button>
    </div>
  );
}

// ── Add item form ──────────────────────────────────────────────────────────────

function AddItemForm({ categories, onClose }: { categories: { id: string; name: string }[]; onClose: () => void }) {
  const createItem = useCreateMenuItem();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [portionSize, setPortionSize] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const submit = () => {
    setFormError(null);
    if (!name.trim()) {
      setFormError("Item name is required.");
      return;
    }
    const p = Number(price);
    if (price.trim() === "" || !Number.isFinite(p) || p < 0) {
      setFormError("Price must be a non-negative number.");
      return;
    }
    createItem.mutate(
      { name: name.trim(), price: p, categoryId: categoryId || null, portionSize: portionSize.trim() || undefined },
      {
        onSuccess: onClose,
        onError: (err) => setFormError(err instanceof Error ? err.message : "Failed to add item — please try again."),
      },
    );
  };

  return (
    <div className="card-surface flex flex-col gap-3 p-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <input className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm sm:col-span-2" placeholder="Item name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm" placeholder="Price" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
        <input className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm" placeholder="Portion (optional)" value={portionSize} onChange={(e) => setPortionSize(e.target.value)} />
      </div>
      <div className="flex items-center gap-2">
        <select className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">— no category —</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={submit} disabled={createItem.isPending} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50">
          {createItem.isPending ? "Adding…" : "Add Item"}
        </button>
        <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted/40">Cancel</button>
      </div>
      {formError && <p className="text-xs text-red-500">{formError}</p>}
    </div>
  );
}

// ── Draft (needs review) item row ─────────────────────────────────────────────

function DraftItemRow({ item, categories, canManage }: { item: MenuItemDto; categories: { id: string; name: string }[]; canManage: boolean }) {
  const updateItem = useUpdateMenuItem();
  const deleteItem = useDeleteMenuItem();
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(item.price);
  const [categoryId, setCategoryId] = useState(item.categoryId ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <tr>
      <td className="py-2 pr-3">
        <input className="w-full rounded border border-border bg-transparent px-2 py-1 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
      </td>
      <td className="py-2 pr-3">
        <select
          className={cn("rounded border bg-transparent px-2 py-1 text-xs", categoryId ? "border-border" : "border-amber-500/50 text-amber-500")}
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">— uncategorized —</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </td>
      <td className="py-2 pr-3 text-right">
        <input type="number" className="w-20 rounded border border-border bg-transparent px-2 py-1 text-right text-sm" value={price} onChange={(e) => setPrice(e.target.value)} />
      </td>
      <td className="py-2 pr-3">
        {item.confidence !== null ? (
          <span className={cn("text-xs font-medium", item.confidence >= 0.75 ? "text-emerald-500" : item.confidence >= 0.5 ? "text-amber-500" : "text-red-500")}>
            {Math.round(item.confidence * 100)}%
          </span>
        ) : <span className="text-xs text-muted-foreground">manual</span>}
      </td>
      <td className="py-2 pr-3">
        {canManage ? (
          <div className="flex justify-end gap-2">
            <button
              onClick={() =>
                updateItem.mutate({
                  itemId: item.id,
                  dto: { name, price: Number(price), categoryId: categoryId || null, status: "CONFIRMED" },
                })
              }
              disabled={updateItem.isPending}
              className="flex items-center gap-1 rounded bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground disabled:opacity-50"
            >
              <CheckCircle2 className="h-3 w-3" /> Confirm
            </button>
            <button onClick={() => setConfirmDelete(true)} className="rounded border border-border p-1.5 text-muted-foreground hover:bg-muted/40">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <span className="block text-right text-xs text-muted-foreground">View only</span>
        )}
      </td>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Discard this draft item?"
        description={`"${item.name}" was extracted from your menu upload but hasn't been confirmed yet. This removes it permanently — it won't be saved anywhere.`}
        confirmLabel="Discard"
        isLoading={deleteItem.isPending}
        onConfirm={() => deleteItem.mutate(item.id, { onSuccess: () => setConfirmDelete(false) })}
      />
    </tr>
  );
}

// ── Recipe editor ──────────────────────────────────────────────────────────────

interface RecipeRow {
  key: string;
  productId: string;
  quantity: string;
  unit: string;
}

function RecipeEditor({
  menuItem, onClose, onDirtyChange, canManage,
}: {
  menuItem: MenuItemDto; onClose: () => void; onDirtyChange: (dirty: boolean) => void; canManage: boolean;
}) {
  const { data: recipe, isLoading } = useRecipe(menuItem.id);
  const { data: products } = useProducts();
  const setRecipe = useSetRecipe();

  const [rows, setRows] = useState<RecipeRow[] | null>(null);
  const [savedRows, setSavedRows] = useState<RecipeRow[] | null>(null);

  // Seed local editable rows once the recipe loads (or stays empty if none).
  React.useEffect(() => {
    if (rows === null && recipe !== undefined) {
      const seeded = (recipe?.lines ?? []).map((l, i) => ({
        key: `${l.id}-${i}`,
        productId: l.productId,
        quantity: String(l.quantity),
        unit: l.unit,
      }));
      setRows(seeded);
      setSavedRows(seeded);
    }
  }, [recipe, rows]);

  // Compares content (productId/quantity/unit), not the generated `key`, so
  // a freshly-loaded recipe never reports as dirty. Runs on every row edit —
  // this is what lets both the panel's own Close button and the parent's
  // toggle-chevron button warn before silently discarding real food-cost
  // edits, previously lost with zero warning.
  React.useEffect(() => {
    if (rows === null || savedRows === null) return;
    const strip = (r: RecipeRow) => ({ productId: r.productId, quantity: r.quantity, unit: r.unit });
    const dirty = JSON.stringify(rows.map(strip)) !== JSON.stringify(savedRows.map(strip));
    onDirtyChange(dirty);
  }, [rows, savedRows, onDirtyChange]);

  if (isLoading || rows === null) {
    return <div className="border-t border-border bg-muted/10 p-6 text-sm text-muted-foreground">Loading recipe…</div>;
  }

  const addRow = () => setRows([...rows, { key: `new-${Date.now()}`, productId: "", quantity: "", unit: "g" }]);
  const removeRow = (key: string) => setRows(rows.filter((r) => r.key !== key));
  const updateRow = (key: string, patch: Partial<RecipeRow>) =>
    setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const save = () => {
    const lines: RecipeLineInput[] = [];
    for (const r of rows) {
      const q = Number(r.quantity);
      if (!r.productId || isNaN(q) || q <= 0 || !r.unit.trim()) continue;
      lines.push({ productId: r.productId, quantity: q, unit: r.unit.trim() });
    }
    setRecipe.mutate({ menuItemId: menuItem.id, lines }, { onSuccess: () => setSavedRows(rows) });
  };

  // live cost/margin estimate from current (unsaved) rows, using product lastUnitCost.
  // The row's unit doesn't have to match the product's stock unit (e.g. ml recipe
  // against an L-tracked product) — tryConvertUnit reconciles weight<->weight and
  // volume<->volume automatically; anything else counts as a cost gap, same as a
  // missing lastUnitCost, rather than silently multiplying mismatched units.
  const productById = new Map((products ?? []).map((p) => [p.id, p]));
  let liveCost = 0;
  let hasGap = false;
  for (const r of rows) {
    const product = productById.get(r.productId);
    const q = Number(r.quantity);
    if (!product || isNaN(q)) { hasGap = true; continue; }
    if (product.lastUnitCost === null) { hasGap = true; continue; }
    const qInProductUnit = tryConvertUnit(q, r.unit, product.unit);
    if (qInProductUnit === null) { hasGap = true; continue; }
    liveCost += product.lastUnitCost * qInProductUnit;
  }
  const price = Number(menuItem.price);
  const margin = !hasGap && price > 0 ? Math.round(((price - liveCost) / price) * 1000) / 10 : null;

  return (
    <div className="flex flex-col gap-4 border-t border-border bg-muted/10 p-6">
      <div className="flex items-center gap-2">
        <ChefHat className="h-4 w-4 text-accent" />
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Recipe — {rows.length} ingredient{rows.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {rows.length > 0 && (
          <div className="flex items-center gap-2 px-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <span className="flex-1">Ingredient</span>
            <span className="w-24 text-right">Qty</span>
            <span className="w-20">Unit</span>
            <span className="w-20 text-right">Cost</span>
            <span className="w-7" />
          </div>
        )}
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No ingredients yet — add the first one below.</p>}
        {rows.map((row) => {
          const product = productById.get(row.productId);
          const q = Number(row.quantity);
          const qInProductUnit = product && !isNaN(q) ? tryConvertUnit(q, row.unit, product.unit) : null;
          const lineCost = product?.lastUnitCost !== null && product?.lastUnitCost !== undefined && qInProductUnit !== null
            ? product.lastUnitCost * qInProductUnit
            : null;
          const unitIncompatible = !!product && !!row.unit.trim() && row.unit.trim().toLowerCase() !== product.unit.toLowerCase() && qInProductUnit === null;
          return (
            <div key={row.key} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <select
                  className="flex-1 rounded-lg border border-border bg-transparent px-2.5 py-2 text-sm disabled:opacity-70"
                  value={row.productId}
                  disabled={!canManage}
                  onChange={(e) => updateRow(row.key, { productId: e.target.value })}
                >
                  <option value="">— select ingredient —</option>
                  {(products ?? []).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
                </select>
                <input
                  type="number"
                  className="w-24 rounded-lg border border-border bg-transparent px-2.5 py-2 text-right text-sm disabled:opacity-70"
                  placeholder="Qty"
                  value={row.quantity}
                  disabled={!canManage}
                  onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                />
                <input
                  className={cn(
                    "w-20 rounded-lg border bg-transparent px-2.5 py-2 text-sm disabled:opacity-70",
                    unitIncompatible ? "border-red-400" : "border-border",
                  )}
                  placeholder="unit"
                  value={row.unit}
                  disabled={!canManage}
                  onChange={(e) => updateRow(row.key, { unit: e.target.value })}
                />
                <span className="w-20 text-right text-xs text-muted-foreground">
                  {lineCost !== null ? formatCurrency(lineCost) : "—"}
                </span>
                {canManage && (
                  <button onClick={() => removeRow(row.key)} className="flex w-7 items-center justify-center rounded-lg p-1.5 text-muted-foreground hover:bg-muted/40">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {unitIncompatible && (
                <p className="pl-0.5 text-[11px] text-red-500">
                  &quot;{row.unit}&quot; can&apos;t convert to this ingredient&apos;s stock unit ({product?.unit}) — only weight↔weight or volume↔volume conversions are automatic.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {canManage && (
        <button onClick={addRow} className="flex w-fit items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/5">
          <Plus className="h-3 w-3" /> Add Ingredient
        </button>
      )}

      <div className="flex items-center justify-between border-t border-border pt-4">
        <div className="text-xs text-muted-foreground">
          {hasGap ? (
            <span>Estimated cost unavailable — some ingredients have no purchase price yet.</span>
          ) : (
            <span>
              Estimated food cost <span className="font-semibold text-foreground">{formatCurrency(liveCost)}</span>
              {margin !== null && (
                <> · Margin <span className={cn("font-semibold", margin >= 65 ? "text-emerald-500" : margin >= 50 ? "text-amber-500" : "text-red-500")}>{margin}%</span></>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/40">Close</button>
          {canManage && (
            <button
              onClick={save}
              disabled={setRecipe.isPending}
              className="rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-accent-foreground disabled:opacity-50"
            >
              {setRecipe.isPending ? "Saving…" : "Save Recipe"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MenuPage() {
  const restaurantId = useRestaurantId();
  const { role } = useRestaurantContext();
  const canManage = role === "OWNER" || role === "MANAGER";
  const { data: overview, isLoading: overviewLoading, isError: overviewError } = useMenuOverview();
  const { data: categories, isError: categoriesError } = useMenuCategories();
  const { data: draftItems } = useMenuItems("DRAFT");
  const { data: confirmedItems, isLoading: itemsLoading, isError: itemsError } = useMenuItems("CONFIRMED");

  const uploadMenu = useUploadMenu();
  const deleteCategory = useDeleteCategory();
  const deleteItem = useDeleteMenuItem();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [recipeItemId, setRecipeItemId] = useState<string | null>(null);
  const [recipeDirty, setRecipeDirty] = useState(false);
  const [confirmDiscardRecipe, setConfirmDiscardRecipe] = useState(false);

  // Both the panel's own Close button and the row's toggle-chevron button
  // route through this — closing with unsaved recipe edits previously
  // discarded them silently.
  const requestCloseRecipe = () => {
    if (recipeDirty) {
      setConfirmDiscardRecipe(true);
    } else {
      setRecipeItemId(null);
    }
  };
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState<{ id: string; name: string; itemCount: number } | null>(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<{ id: string; name: string } | null>(null);

  if (!restaurantId) {
    return <AppShell title="Menu"><ConfigMissingBanner /></AppShell>;
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError(null);
    uploadMenu.mutate(file, {
      onError: (err) => setUploadError(err instanceof Error ? err.message : "Upload failed"),
    });
  };

  const categoryOptions = categories?.map((c) => ({ id: c.id, name: c.name })) ?? [];

  // group confirmed items by category for display
  const grouped = new Map<string, MenuItemDto[]>();
  for (const item of confirmedItems ?? []) {
    const key = item.category?.name ?? "Uncategorized";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }

  return (
    <AppShell title="Menu">
      <div className="flex flex-col gap-8">

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Menu</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Items, categories, and AI-assisted menu setup.</p>
          </div>
          {canManage && (
            <div className="flex items-center gap-2">
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadMenu.isPending}
                className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
              >
                {uploadMenu.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploadMenu.isPending ? "Extracting…" : "Upload Menu"}
              </button>
              <button
                onClick={() => setShowAddItem((s) => !s)}
                className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted/40"
              >
                <Plus className="h-4 w-4" /> Add Item
              </button>
            </div>
          )}
        </div>

        {uploadError && (
          <div className="card-surface p-4 text-sm text-red-500">{uploadError}</div>
        )}

        {canManage && showAddItem && <AddItemForm categories={categoryOptions} onClose={() => setShowAddItem(false)} />}

        {overview && <MenuStatusCard overview={overview} />}

        {/* Overview */}
        <div>
          <SectionLabel>Overview</SectionLabel>
          {overviewLoading ? (
            <LoadingBanner label="Loading menu overview…" />
          ) : overviewError || !overview ? (
            <ErrorBanner message="Failed to load menu overview." />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <OverviewTile label="Menu Items" value={String(overview.totalItems)} icon={<BookOpen className="h-4 w-4" />} />
              <OverviewTile label="Categories" value={String(overview.totalCategories)} icon={<Layers className="h-4 w-4" />} />
              <OverviewTile label="Needs Review" value={String(overview.pendingReviewCount)} icon={<FileClock className="h-4 w-4" />} tone={overview.pendingReviewCount > 0 ? "warning" : undefined} />
              <OverviewTile label="Confirmed" value={String(overview.confirmedCount)} icon={<CheckCircle2 className="h-4 w-4" />} />
            </div>
          )}
        </div>

        {/* Needs review (draft items from AI extraction) */}
        {draftItems && draftItems.length > 0 && (
          <div>
            <SectionLabel>Needs Review — {draftItems.length} item{draftItems.length === 1 ? "" : "s"}</SectionLabel>
            <div className="card-surface overflow-x-auto p-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Category</th>
                    <th className="py-2 pr-3 text-right">Price</th>
                    <th className="py-2 pr-3">Confidence</th>
                    <th className="py-2 pr-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {draftItems.map((item) => (
                    <DraftItemRow key={item.id} item={item} categories={categoryOptions} canManage={canManage} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Categories */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <SectionLabel>Categories</SectionLabel>
            {canManage && !showAddCategory && (
              <button onClick={() => setShowAddCategory(true)} className="flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                <Plus className="h-3 w-3" /> Add Category
              </button>
            )}
          </div>
          {canManage && showAddCategory && <div className="mb-3"><AddCategoryForm onClose={() => setShowAddCategory(false)} /></div>}
          <div className="flex flex-wrap gap-2">
            {categoriesError ? (
              <ErrorBanner message="Failed to load categories. Try refreshing the page." />
            ) : (
              <>
                {(categories ?? []).map((c) => (
                  <div key={c.id} className="flex items-center gap-2 rounded-full border border-border bg-muted/20 px-3 py-1.5 text-sm">
                    <span>{c.name}</span>
                    <span className="text-xs text-muted-foreground">({c._count.items})</span>
                    {canManage && (
                      <button onClick={() => setConfirmDeleteCategory({ id: c.id, name: c.name, itemCount: c._count.items })} className="text-muted-foreground hover:text-red-500">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
                {(!categories || categories.length === 0) && (
                  <p className="text-sm text-muted-foreground">No categories yet.</p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Menu items */}
        <div>
          <SectionLabel>Menu Items</SectionLabel>
          {itemsLoading ? (
            <LoadingBanner label="Loading menu items…" />
          ) : itemsError ? (
            <ErrorBanner message="Failed to load menu items. Try refreshing the page." />
          ) : !confirmedItems || confirmedItems.length === 0 ? (
            <div className="card-surface p-6 text-sm text-muted-foreground">
              No confirmed menu items yet. Upload a menu photo above, or add items manually.
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {[...grouped.entries()].map(([categoryName, categoryItems]) => (
                <div key={categoryName} className="card-surface overflow-hidden">
                  <div className="border-b border-border bg-muted/20 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {categoryName}
                  </div>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-border">
                      {categoryItems.map((item) => (
                        <React.Fragment key={item.id}>
                          <tr>
                            <td className="px-5 py-3 font-medium">{item.name}</td>
                            <td className="px-5 py-3 text-muted-foreground">{item.portionSize ?? ""}</td>
                            <td className="px-5 py-3 text-right font-medium">{formatCurrency(Number(item.price))}</td>
                            <td className="px-5 py-3 text-right">
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => (recipeItemId === item.id ? requestCloseRecipe() : setRecipeItemId(item.id))}
                                  className={cn(
                                    "flex items-center gap-1 rounded border px-2.5 py-1 text-xs hover:bg-muted/40",
                                    recipeItemId === item.id ? "border-accent text-accent" : "border-border",
                                  )}
                                >
                                  <ChefHat className="h-3 w-3" /> Recipe
                                  <ChevronDown className={cn("h-3 w-3 transition-transform", recipeItemId === item.id && "rotate-180")} />
                                </button>
                                {canManage && (
                                  <button onClick={() => setConfirmDeleteItem({ id: item.id, name: item.name })} className="rounded border border-border p-1.5 text-muted-foreground hover:bg-muted/40">
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {recipeItemId === item.id && (
                            <tr>
                              <td colSpan={4} className="p-0">
                                <RecipeEditor menuItem={item} onClose={requestCloseRecipe} onDirtyChange={setRecipeDirty} canManage={canManage} />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      <ConfirmDialog
        open={!!confirmDeleteCategory}
        onOpenChange={(open) => !open && setConfirmDeleteCategory(null)}
        title="Delete this category?"
        description={
          confirmDeleteCategory
            ? `"${confirmDeleteCategory.name}"${
                confirmDeleteCategory.itemCount > 0
                  ? ` has ${confirmDeleteCategory.itemCount} menu item${confirmDeleteCategory.itemCount === 1 ? "" : "s"} in it — they won't be deleted, but will become uncategorized.`
                  : " has no items in it."
              } This can't be undone.`
            : ""
        }
        confirmLabel="Delete Category"
        isLoading={deleteCategory.isPending}
        onConfirm={() => {
          if (!confirmDeleteCategory) return;
          deleteCategory.mutate(confirmDeleteCategory.id, { onSuccess: () => setConfirmDeleteCategory(null) });
        }}
      />

      <ConfirmDialog
        open={!!confirmDeleteItem}
        onOpenChange={(open) => !open && setConfirmDeleteItem(null)}
        title="Delete this menu item?"
        description={confirmDeleteItem ? `"${confirmDeleteItem.name}" and its recipe (if any) will be permanently deleted. This can't be undone.` : ""}
        confirmLabel="Delete Item"
        isLoading={deleteItem.isPending}
        onConfirm={() => {
          if (!confirmDeleteItem) return;
          deleteItem.mutate(confirmDeleteItem.id, { onSuccess: () => setConfirmDeleteItem(null) });
        }}
      />

      <ConfirmDialog
        open={confirmDiscardRecipe}
        onOpenChange={setConfirmDiscardRecipe}
        title="Discard unsaved recipe changes?"
        description="You have ingredient changes that haven't been saved. Closing now will discard them."
        confirmLabel="Discard Changes"
        onConfirm={() => {
          setConfirmDiscardRecipe(false);
          setRecipeDirty(false);
          setRecipeItemId(null);
        }}
      />
    </AppShell>
  );
}
