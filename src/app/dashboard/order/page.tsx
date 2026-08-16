"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { ConfigMissingBanner, LoadingBanner, ErrorBanner } from "@/components/shared/query-states";
import { useRestaurantId } from "@/hooks/use-restaurant-id";
import { useRestaurantContext } from "@/providers/restaurant-provider";
import { cn } from "@/lib/utils";
import { Plus, Minus, X, Loader2, ChefHat } from "lucide-react";
import {
  useTables, useServiceOrders, useActiveOrderForTable, useCreateTable, useUpdateTable, useDeleteTable,
  useStartOrder, useAddOrderItem, useUpdateOrderItemQuantity, useRemoveOrderItem,
  useSubmitOrder, useStartPreparing, useMarkReady, useCompleteOrder, useCancelOrder,
  type RestaurantTable, type ServiceOrderDto, type TableStatus, type ServiceOrderStatus,
} from "@/hooks/use-service-orders";
import { useMenuCategories, useMenuItems } from "@/hooks/use-menu";

// ── Status presentation — never color-only, per accessibility requirement ──────

const TABLE_STATUS_META: Record<TableStatus, { label: string; dot: string; text: string }> = {
  AVAILABLE: { label: "Available", dot: "bg-green-500", text: "text-green-500" },
  OCCUPIED:  { label: "Occupied",  dot: "bg-orange-400", text: "text-orange-400" },
  ORDERING:  { label: "Ordering",  dot: "bg-yellow-400", text: "text-yellow-400" },
  PREPARING: { label: "Preparing", dot: "bg-orange-500", text: "text-orange-500" },
  READY:     { label: "Ready",     dot: "bg-blue-400",   text: "text-blue-400" },
  CLOSED:    { label: "Closed",    dot: "bg-muted-foreground", text: "text-muted-foreground" },
};

const ORDER_STATUS_META: Record<ServiceOrderStatus, { label: string; cls: string }> = {
  DRAFT:     { label: "Draft",     cls: "bg-muted text-muted-foreground" },
  SUBMITTED: { label: "Submitted", cls: "bg-yellow-500/15 text-yellow-500" },
  PREPARING: { label: "Preparing", cls: "bg-orange-500/15 text-orange-500" },
  READY:     { label: "Ready",     cls: "bg-blue-500/15 text-blue-400" },
  COMPLETED: { label: "Completed", cls: "bg-green-500/15 text-green-500" },
  CANCELLED: { label: "Cancelled", cls: "bg-red-500/15 text-red-500" },
};

function money(v: string | number) {
  return `€${Number(v).toFixed(2)}`;
}

// ── Page ─────────────────────────────────────────────────────────────────────

type Tab = "tables" | "active" | "history" | "kitchen";

export default function DurbyOrderPage() {
  const restaurantId = useRestaurantId();
  const { role } = useRestaurantContext();
  // Kitchen staff live entirely in the kitchen queue — everyone else
  // (SERVICE, OWNER, MANAGER, ...) gets Tables/Active/History, defaulting
  // to Tables per the spec's "default view should be Tables."
  const [tab, setTab] = useState<Tab>(role === "KITCHEN" ? "kitchen" : "tables");
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);

  if (!restaurantId) return <AppShell title="Durby Order"><ConfigMissingBanner /></AppShell>;

  const tabs: Array<{ key: Tab; label: string }> =
    role === "KITCHEN"
      ? [{ key: "kitchen", label: "Kitchen" }]
      : [{ key: "tables", label: "Tables" }, { key: "active", label: "Active" }, { key: "history", label: "History" }];

  return (
    <AppShell title="Durby Order">
      <div className="flex flex-col gap-5">
        {tabs.length > 1 && (
          <div className="flex w-fit gap-1 rounded-lg border border-border bg-muted/20 p-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                  tab === t.key ? "bg-accent text-white" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {tab === "tables" && <TablesView selectedTableId={selectedTableId} onSelectTable={setSelectedTableId} />}
        {tab === "active" && <ActiveOrdersView onOpenOrder={(o) => { setSelectedTableId(o.tableId); setTab("tables"); }} />}
        {tab === "history" && <OrderHistoryView />}
        {tab === "kitchen" && <KitchenView />}
      </div>
    </AppShell>
  );
}

// ── Tables ───────────────────────────────────────────────────────────────────

function TablesView({ selectedTableId, onSelectTable }: { selectedTableId: string | null; onSelectTable: (id: string | null) => void }) {
  const { data: tables, isLoading, error } = useTables();
  const { role } = useRestaurantContext();
  const canManageTables = role === "OWNER" || role === "MANAGER";
  const createTable = useCreateTable();
  const [addingTable, setAddingTable] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newSeats, setNewSeats] = useState("2");

  if (isLoading) return <LoadingBanner label="Loading tables…" />;
  if (error) return <ErrorBanner message="Failed to load tables." />;

  if (selectedTableId) {
    const table = (tables ?? []).find((t) => t.id === selectedTableId);
    if (table) return <TableDetail table={table} onClose={() => onSelectTable(null)} />;
  }

  function submitNewTable() {
    if (!newLabel.trim()) return;
    createTable.mutate(
      { label: newLabel.trim(), seats: Number(newSeats) || 2 },
      { onSuccess: () => { setAddingTable(false); setNewLabel(""); setNewSeats("2"); } },
    );
  }

  if (!tables || tables.length === 0) {
    return (
      <div className="card-surface flex h-48 flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="font-medium">No tables set up yet</p>
        {canManageTables ? (
          addingTable ? (
            <AddTableForm label={newLabel} seats={newSeats} onLabel={setNewLabel} onSeats={setNewSeats} onSubmit={submitNewTable} onCancel={() => setAddingTable(false)} pending={createTable.isPending} />
          ) : (
            <button onClick={() => setAddingTable(true)} className="mt-1 flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90">
              <Plus className="h-4 w-4" /> Add Table
            </button>
          )
        ) : (
          <p className="text-sm text-muted-foreground">Ask a manager to add tables.</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {tables.map((table) => {
          const meta = TABLE_STATUS_META[table.status];
          return (
            <button
              key={table.id}
              onClick={() => onSelectTable(table.id)}
              className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 text-center transition-colors hover:border-accent/50"
            >
              <span className="text-lg font-semibold text-foreground">{table.label}</span>
              <span className={cn("flex items-center gap-1.5 text-xs font-medium", meta.text)}>
                <span className={cn("h-2 w-2 rounded-full", meta.dot)} aria-hidden />
                {meta.label}
              </span>
              <span className="text-[11px] text-muted-foreground">{table.seats} seats</span>
            </button>
          );
        })}
        {canManageTables && !addingTable && (
          <button
            onClick={() => setAddingTable(true)}
            className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground hover:border-accent hover:text-accent"
          >
            <Plus className="h-4 w-4" /> Add Table
          </button>
        )}
      </div>
      {addingTable && (
        <AddTableForm label={newLabel} seats={newSeats} onLabel={setNewLabel} onSeats={setNewSeats} onSubmit={submitNewTable} onCancel={() => setAddingTable(false)} pending={createTable.isPending} />
      )}
    </div>
  );
}

function AddTableForm({
  label, seats, onLabel, onSeats, onSubmit, onCancel, pending,
}: {
  label: string; seats: string; onLabel: (v: string) => void; onSeats: (v: string) => void;
  onSubmit: () => void; onCancel: () => void; pending: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3">
      <input value={label} onChange={(e) => onLabel(e.target.value)} placeholder="Table name (e.g. T9)" className="w-32 rounded-md border border-border bg-muted/30 px-2 py-1.5 text-sm" />
      <input value={seats} onChange={(e) => onSeats(e.target.value)} type="number" min={1} placeholder="Seats" className="w-20 rounded-md border border-border bg-muted/30 px-2 py-1.5 text-sm" />
      <button onClick={onSubmit} disabled={pending || !label.trim()} className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
      </button>
      <button onClick={onCancel} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
    </div>
  );
}

function TableDetail({ table, onClose }: { table: RestaurantTable; onClose: () => void }) {
  const { data: order, isLoading } = useActiveOrderForTable(table.id);
  const startOrder = useStartOrder();
  const [addingItems, setAddingItems] = useState(false);

  return (
    <div className="card-surface flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Table {table.label}</h2>
          {order?.guestCount && <p className="text-sm text-muted-foreground">{order.guestCount} guests</p>}
        </div>
        <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {isLoading ? (
        <LoadingBanner label="Loading order…" />
      ) : order ? (
        addingItems ? (
          <AddItemsPanel orderId={order.id} onDone={() => setAddingItems(false)} />
        ) : (
          <OrderDetailBody order={order} onAddItems={() => setAddingItems(true)} onClosed={onClose} />
        )
      ) : (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">No active order.</p>
          <button
            onClick={() => startOrder.mutate({ tableId: table.id })}
            disabled={startOrder.isPending}
            className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {startOrder.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Start Order
          </button>
        </div>
      )}

      {/* Only offered with no active order — the backend also refuses to
          delete a table with one, this just avoids the confusing UX of
          editing a table mid-service. */}
      {!order && <ManageTableControls table={table} onDeleted={onClose} />}
    </div>
  );
}

function ManageTableControls({ table, onDeleted }: { table: RestaurantTable; onDeleted: () => void }) {
  const { role } = useRestaurantContext();
  const updateTable = useUpdateTable();
  const deleteTable = useDeleteTable();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(table.label);
  const [seats, setSeats] = useState(String(table.seats));
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (role !== "OWNER" && role !== "MANAGER") return null;

  if (editing) {
    return (
      <div className="flex items-center gap-2 border-t border-border pt-4">
        <input value={label} onChange={(e) => setLabel(e.target.value)} className="w-24 rounded-md border border-border bg-muted/30 px-2 py-1.5 text-sm" />
        <input value={seats} onChange={(e) => setSeats(e.target.value)} type="number" min={1} className="w-16 rounded-md border border-border bg-muted/30 px-2 py-1.5 text-sm" />
        <button
          onClick={() =>
            updateTable.mutate(
              { tableId: table.id, label: label.trim(), seats: Number(seats) || table.seats },
              { onSuccess: () => setEditing(false) },
            )
          }
          disabled={updateTable.isPending || !label.trim()}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
        >
          Save
        </button>
        <button onClick={() => setEditing(false)} className="text-xs text-muted-foreground">Cancel</button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-4 border-t border-border pt-4 text-xs">
      <button onClick={() => setEditing(true)} className="text-muted-foreground hover:text-accent">Edit table</button>
      {confirmDelete ? (
        <span className="flex items-center gap-2">
          <span className="text-muted-foreground">Delete {table.label}?</span>
          <button
            onClick={() => deleteTable.mutate(table.id, { onSuccess: onDeleted })}
            disabled={deleteTable.isPending}
            className="font-semibold text-red-500 hover:text-red-400"
          >
            Confirm
          </button>
          <button onClick={() => setConfirmDelete(false)} className="text-muted-foreground">Cancel</button>
        </span>
      ) : (
        <button onClick={() => setConfirmDelete(true)} className="text-muted-foreground hover:text-red-500">Delete table</button>
      )}
    </div>
  );
}

function OrderDetailBody({ order, onAddItems, onClosed }: { order: ServiceOrderDto; onAddItems: () => void; onClosed: () => void }) {
  const updateQty = useUpdateOrderItemQuantity();
  const removeItem = useRemoveOrderItem();
  const submit = useSubmitOrder();
  const complete = useCompleteOrder();
  const cancel = useCancelOrder();
  const editable = order.status === "DRAFT";
  const total = order.items.reduce((sum, i) => sum + Number(i.priceSnapshot) * i.quantity, 0);
  const statusMeta = ORDER_STATUS_META[order.status];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">#{order.orderNumber}</span>
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", statusMeta.cls)}>{statusMeta.label}</span>
      </div>

      <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {order.items.length === 0 && (
          <p className="p-4 text-center text-sm text-muted-foreground">No items yet — add something below.</p>
        )}
        {order.items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">{item.nameSnapshot}</p>
              {item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}
            </div>
            {editable ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => updateQty.mutate({ orderId: order.id, itemId: item.id, quantity: item.quantity - 1 })}
                  disabled={item.quantity <= 1 || updateQty.isPending}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="w-5 text-center text-sm">{item.quantity}</span>
                <button
                  onClick={() => updateQty.mutate({ orderId: order.id, itemId: item.id, quantity: item.quantity + 1 })}
                  disabled={updateQty.isPending}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">×{item.quantity}</span>
            )}
            <span className="w-16 text-right text-sm font-medium text-foreground">
              {money(Number(item.priceSnapshot) * item.quantity)}
            </span>
            {editable && (
              <button
                onClick={() => removeItem.mutate({ orderId: order.id, itemId: item.id })}
                className="text-muted-foreground hover:text-red-500"
                aria-label="Remove item"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
        <div className="flex items-center justify-between px-3 py-2.5 font-semibold text-foreground">
          <span>Total</span>
          <span>{money(total)}</span>
        </div>
      </div>

      {editable && (
        <div className="flex flex-col gap-2">
          <button
            onClick={onAddItems}
            className="flex items-center justify-center gap-1.5 rounded-md border border-border py-2 text-sm font-medium text-foreground hover:border-accent hover:text-accent"
          >
            <Plus className="h-4 w-4" /> Add Item
          </button>
          <button
            onClick={() => submit.mutate(order.id)}
            disabled={submit.isPending || order.items.length === 0}
            className="flex items-center justify-center gap-1.5 rounded-md bg-accent py-2.5 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Send to Kitchen
          </button>
        </div>
      )}

      {order.status === "READY" && (
        <button
          onClick={() => complete.mutate(order.id, { onSuccess: onClosed })}
          disabled={complete.isPending}
          className="flex items-center justify-center gap-1.5 rounded-md bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-600/90 disabled:opacity-50"
        >
          {complete.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Mark Completed
        </button>
      )}

      {(order.status === "SUBMITTED" || order.status === "PREPARING") && (
        <p className="text-center text-xs text-muted-foreground">Sent to the kitchen — you&apos;ll see it here once it&apos;s ready.</p>
      )}

      {editable && (
        <button
          onClick={() => cancel.mutate(order.id, { onSuccess: onClosed })}
          disabled={cancel.isPending}
          className="text-center text-xs text-muted-foreground hover:text-red-500"
        >
          Cancel order
        </button>
      )}
    </div>
  );
}

function AddItemsPanel({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const { data: categories } = useMenuCategories();
  const { data: items, isLoading } = useMenuItems("CONFIRMED");
  const addItem = useAddOrderItem();

  const byCategory = new Map<string | null, typeof items>();
  (items ?? []).forEach((item) => {
    const list = byCategory.get(item.categoryId) ?? [];
    list.push(item);
    byCategory.set(item.categoryId, list);
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Add Items</h3>
        <button onClick={onDone} className="text-sm text-accent hover:underline">Done</button>
      </div>
      {isLoading ? (
        <LoadingBanner label="Loading menu…" />
      ) : (
        <div className="flex max-h-96 flex-col gap-4 overflow-y-auto">
          {(categories ?? []).map((cat) => {
            const catItems = byCategory.get(cat.id) ?? [];
            if (catItems.length === 0) return null;
            return (
              <div key={cat.id}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cat.name}</p>
                <div className="flex flex-col gap-1">
                  {catItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => addItem.mutate({ orderId, menuItemId: item.id })}
                      disabled={addItem.isPending}
                      className="flex items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-muted/50 disabled:opacity-50"
                    >
                      <span className="text-foreground">{item.name}</span>
                      <span className="text-muted-foreground">{money(item.price)}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Active ───────────────────────────────────────────────────────────────────

function ActiveOrdersView({ onOpenOrder }: { onOpenOrder: (order: ServiceOrderDto) => void }) {
  const { data: orders, isLoading, error } = useServiceOrders("active");

  if (isLoading) return <LoadingBanner label="Loading active orders…" />;
  if (error) return <ErrorBanner message="Failed to load active orders." />;
  if (!orders || orders.length === 0) {
    return <div className="card-surface flex h-40 items-center justify-center text-sm text-muted-foreground">No active orders right now.</div>;
  }

  return (
    <div className="flex flex-col gap-2">
      {orders.map((order) => {
        const meta = ORDER_STATUS_META[order.status];
        return (
          <button
            key={order.id}
            onClick={() => onOpenOrder(order)}
            className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left hover:border-accent/50"
          >
            <div>
              <p className="font-medium text-foreground">Table {order.table?.label}</p>
              <p className="text-xs text-muted-foreground">#{order.orderNumber} · {order.items.length} item{order.items.length === 1 ? "" : "s"}</p>
            </div>
            <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", meta.cls)}>{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── History ──────────────────────────────────────────────────────────────────

function OrderHistoryView() {
  const { data: orders, isLoading, error } = useServiceOrders("history");

  if (isLoading) return <LoadingBanner label="Loading order history…" />;
  if (error) return <ErrorBanner message="Failed to load order history." />;
  if (!orders || orders.length === 0) {
    return <div className="card-surface flex h-40 items-center justify-center text-sm text-muted-foreground">No completed orders yet.</div>;
  }

  return (
    <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
      {orders.map((order) => {
        const total = order.items.reduce((sum, i) => sum + Number(i.priceSnapshot) * i.quantity, 0);
        const meta = ORDER_STATUS_META[order.status];
        return (
          <div key={order.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-muted-foreground">#{order.orderNumber}</span>
            <span className="text-foreground">Table {order.table?.label}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", meta.cls)}>{meta.label}</span>
            <span className="font-medium text-foreground">{money(total)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Kitchen ──────────────────────────────────────────────────────────────────

function KitchenView() {
  const { data: orders, isLoading, error } = useServiceOrders("kitchen");
  const startPreparing = useStartPreparing();
  const markReady = useMarkReady();

  if (isLoading) return <LoadingBanner label="Loading kitchen queue…" />;
  if (error) return <ErrorBanner message="Failed to load the kitchen queue." />;

  const submitted = (orders ?? []).filter((o) => o.status === "SUBMITTED");
  const preparing = (orders ?? []).filter((o) => o.status === "PREPARING");

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      <KitchenColumn
        title="New"
        orders={submitted}
        emptyLabel="No new orders."
        actionLabel="Start"
        onAction={(id) => startPreparing.mutate(id)}
        actionPending={startPreparing.isPending}
      />
      <KitchenColumn
        title="Preparing"
        orders={preparing}
        emptyLabel="Nothing in progress."
        actionLabel="Mark Ready"
        onAction={(id) => markReady.mutate(id)}
        actionPending={markReady.isPending}
      />
    </div>
  );
}

function KitchenColumn({
  title, orders, emptyLabel, actionLabel, onAction, actionPending,
}: {
  title: string; orders: ServiceOrderDto[]; emptyLabel: string; actionLabel: string;
  onAction: (orderId: string) => void; actionPending: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        <ChefHat className="h-3.5 w-3.5" /> {title}
      </h2>
      {orders.length === 0 ? (
        <div className="card-surface flex h-24 items-center justify-center text-sm text-muted-foreground">{emptyLabel}</div>
      ) : (
        orders.map((order) => (
          <div key={order.id} className="card-surface flex flex-col gap-2 p-4">
            <p className="font-semibold text-foreground">Table {order.table?.label}</p>
            <ul className="text-sm text-muted-foreground">
              {order.items.map((item) => (
                <li key={item.id}>{item.nameSnapshot} ×{item.quantity}</li>
              ))}
            </ul>
            <button
              onClick={() => onAction(order.id)}
              disabled={actionPending}
              className="mt-1 rounded-md bg-accent py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {actionLabel}
            </button>
          </div>
        ))
      )}
    </div>
  );
}
