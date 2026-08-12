"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import {
  Upload, CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp,
  Database, RefreshCw, Loader2, Download, Eye, ShieldCheck,
  Radio, Wifi,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ConfigMissingBanner } from "@/components/shared/query-states";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { UploadProgress } from "@/components/data-center/upload-progress";
import { SalesQualityCard } from "@/components/data-center/sales-quality-card";
import {
  useDataCenterStatus, useDataCenterImport, useDataCenterHistory,
  type DatasetType, type DatasetStatus, type ImportLog, type ImportStatus,
} from "@/hooks/use-data-center";
import { useRestaurantId } from "@/hooks/use-restaurant-id";
import { cn } from "@/lib/utils";

// Soft warning threshold — not a hard block, just tells the user roughly
// what to expect before they commit to a large upload. The hard limit is
// enforced server-side (100MB).
const LARGE_FILE_WARNING_BYTES = 50 * 1024 * 1024;

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// A dataset is still "in flight" for progress-UI purposes from the moment
// its upload starts until the server reports stage completed/failed —
// covers upload transfer + parsing + writing + agents, not just the old
// agent-only window.
function isActiveStage(stage: ImportLog["stage"] | undefined): boolean {
  return !!stage && stage !== "completed" && stage !== "failed";
}

// ─── Dataset metadata ─────────────────────────────────────────────────────────

const DATASET_META: Record<DatasetType, { label: string; description: string; columns: string }> = {
  inventory:                { label: "Inventory",       description: "Products and stock levels",              columns: "product_name, unit, category, quantity_on_hand, reorder_point, expiry_date" },
  sales:                    { label: "Sales",           description: "Daily revenue and cost data",            columns: "date, revenue, food_cost, labor_cost, guest_count" },
  employees:                { label: "Employees",       description: "Staff roster",                           columns: "name, role, hourly_wage, max_weekly_hrs" },
  shifts:                   { label: "Shifts",          description: "Scheduled and worked shifts",            columns: "employee_name, start_time, end_time, break_minutes, status" },
  reservations:             { label: "Reservations",    description: "Guest bookings",                         columns: "guest_name, party_size, reserved_for, source, status" },
  suppliers:                { label: "Suppliers",       description: "Vendors and invoices",                   columns: "supplier_name, email, invoice_amount, issued_at, invoice_status" },
  expenses:                 { label: "Expenses",        description: "Operating expenses",                     columns: "date, category, amount" },
  orders:                   { label: "Orders",          description: "Sold items — drives recipe-based inventory consumption", columns: "external_order_id, placed_at, completed_at, status, menu_item_name, quantity, unit_price, source" },
  full_export:              { label: "Full Export",     description: "Complete dataset (all_data_combined.csv)", columns: "table, id, data" },
  compliance_documents:     { label: "Employee Documents",    description: "Food safety, student certificates, work authorisation, IDs", columns: "employee_name, document_type, expiry_date, is_valid, notes" },
  compliance_training:      { label: "Training Records",      description: "Food safety, HACCP, fire safety, first aid",                columns: "employee_name, training_type, completed_at, expiry_date, provider" },
  compliance_certifications:{ label: "Certifications",        description: "Professional certifications and licences",                  columns: "employee_name, certification_name, certification_category, expiry_date, issuing_body, required_for_roles" },
  compliance_contracts:     { label: "Employment Contracts",  description: "Contract dates, work authorisation, student details",       columns: "employee_name, contract_type, contract_start, contract_end, is_working_student, university, work_auth_type, work_auth_expiry, matriculation_expiry" },
};

const MAIN_ORDER: DatasetType[] = [
  "full_export", "inventory", "sales", "employees", "shifts",
  "reservations", "suppliers", "expenses", "orders",
];

const COMPLIANCE_ORDER: DatasetType[] = [
  "compliance_documents", "compliance_training",
  "compliance_certifications", "compliance_contracts",
];

// CSV template rows for each compliance type
const COMPLIANCE_TEMPLATES: Record<string, string[][]> = {
  compliance_documents: [
    ["employee_name", "document_type", "expiry_date", "is_valid", "notes"],
    ["Jane Smith", "FOOD_SAFETY", "2025-12-31", "true", "City council certificate"],
    ["Tom Brown", "STUDENT_CERTIFICATE", "2025-06-30", "true", "Summer semester"],
    ["Ana Müller", "WORK_AUTHORISATION", "2026-03-15", "true", ""],
  ],
  compliance_training: [
    ["employee_name", "training_type", "completed_at", "expiry_date", "provider"],
    ["Jane Smith", "HACCP", "2024-01-15", "2026-01-15", "Safe Food Training"],
    ["Tom Brown", "FIRE_SAFETY", "2024-03-01", "2025-03-01", "City Fire Dept"],
    ["Ana Müller", "FIRST_AID", "2023-11-20", "2025-11-20", "Red Cross"],
  ],
  compliance_certifications: [
    ["employee_name", "certification_name", "certification_category", "expiry_date", "issuing_body", "required_for_roles"],
    ["Jane Smith", "Head Chef Licence", "KITCHEN", "2027-05-01", "Culinary Board", "Chef,Head Chef"],
    ["Tom Brown", "Personal Licence", "ALCOHOL", "2026-09-30", "Local Authority", "Manager,Supervisor"],
    ["Ana Müller", "Food Hygiene Level 2", "FOOD_HANDLER", "2025-08-15", "Highfield", ""],
  ],
  compliance_contracts: [
    ["employee_name", "contract_type", "contract_start", "contract_end", "is_working_student", "university", "work_auth_type", "work_auth_expiry", "matriculation_expiry"],
    ["Jane Smith", "FULL_TIME", "2022-09-01", "", "false", "", "EU_CITIZEN", "", ""],
    ["Tom Brown", "PART_TIME", "2023-04-01", "2025-09-30", "true", "TU Munich", "EU_CITIZEN", "", "2025-09-30"],
    ["Ana Müller", "MINI_JOB", "2024-01-01", "", "false", "", "WORK_PERMIT", "2025-11-01", ""],
  ],
};

// ─── Template download ────────────────────────────────────────────────────────

function downloadTemplate(type: DatasetType) {
  const rows = COMPLIANCE_TEMPLATES[type];
  if (!rows) return;
  const csv = rows.map((r) => r.map((v) => (v.includes(",") ? `"${v}"` : v)).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${type}_template.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── CSV preview (client-side, first 3 data rows) ────────────────────────────

function parsePreview(file: File): Promise<{ headers: string[]; rows: string[][] }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) ?? "";
      const lines = text.split(/\r?\n/).filter(Boolean);
      const headers = lines[0]?.split(",").map((h) => h.trim()) ?? [];
      const rows = lines.slice(1, 4).map((l) => l.split(",").map((c) => c.trim()));
      resolve({ headers, rows });
    };
    reader.readAsText(file);
  });
}

// ─── Data source selector ─────────────────────────────────────────────────────

type DataSourceMode = "csv" | "external";

function useDataSourcePreference(type: DatasetType, restaurantId: string | null) {
  const key = `dc-source-${restaurantId}-${type}`;
  const [mode, setModeRaw] = useState<DataSourceMode>("csv");

  useEffect(() => {
    if (!restaurantId) return;
    const stored = localStorage.getItem(key) as DataSourceMode | null;
    if (stored) setModeRaw(stored);
  }, [key, restaurantId]);

  const setMode = useCallback(
    (m: DataSourceMode) => {
      setModeRaw(m);
      if (restaurantId) localStorage.setItem(key, m);
    },
    [key, restaurantId],
  );

  return [mode, setMode] as const;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ log }: { log: ImportLog | null }) {
  if (!log) return <span className="text-xs text-muted-foreground">No imports yet</span>;

  const cfg: Record<ImportStatus, { label: string; cls: string; icon: React.ReactNode }> = {
    queued:        { label: "Queued…",       cls: "text-yellow-500", icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
    processing:    { label: "Importing…",    cls: "text-yellow-500", icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
    agents_queued: { label: "Agents queued", cls: "text-blue-400",   icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
    agents_running:{ label: "Agents running",cls: "text-blue-400",   icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
    completed:     { label: "Done",          cls: "text-green-500",  icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    failed:        { label: "Failed",        cls: "text-red-500",    icon: <XCircle className="h-3.5 w-3.5" /> },
  };

  const c = cfg[log.status] ?? cfg.completed;
  return (
    <span className={cn("flex items-center gap-1 text-xs font-medium", c.cls)}>
      {c.icon}{c.label}
    </span>
  );
}

function HistoryPanel({ datasetType }: { datasetType: DatasetType }) {
  const { data: logs, isLoading } = useDataCenterHistory(datasetType);
  if (isLoading) return <p className="text-xs text-muted-foreground">Loading…</p>;
  if (!logs?.length) return <p className="text-xs text-muted-foreground">No import history.</p>;
  return (
    <div className="flex flex-col gap-1.5">
      {logs.map((log) => (
        <div key={log.id} className="flex items-center justify-between rounded bg-muted/20 px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</span>
          <span className={cn("font-medium",
            log.status === "completed" ? "text-green-500" : log.status === "failed" ? "text-red-500" : "text-blue-400",
          )}>
            {log.rowsImported} rows · {log.mode}
          </span>
        </div>
      ))}
    </div>
  );
}

function PreviewTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded border border-border/60">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-border/60 bg-muted/30">
            {headers.map((h) => (
              <th key={h} className="px-2 py-1 text-left font-medium text-muted-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border/40">
              {row.map((cell, j) => (
                <td key={j} className="px-2 py-1 text-foreground/80">{cell || <span className="italic text-muted-foreground/50">—</span>}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Standard dataset card (existing behaviour) ───────────────────────────────

interface ActiveUpload {
  file: File;
  mode: "replace" | "append";
  uploadPct: number | null;
  dismissed: boolean;
  /** Set when the upload request itself failed (network error, validation
   *  rejection) — distinct from a processing failure, which instead shows
   *  up via lastImport.stage === "failed" once an ImportLog exists. A
   *  validation 400 never creates an ImportLog, so it can only be
   *  represented here. */
  uploadError: string | null;
  /** Set when the upload succeeded but EnqueueResult.queued was false —
   *  the background queue was unavailable, so this ran (or is running)
   *  inline instead. Not an error: the import still completes and
   *  lastImport.stage still tracks its real progress, this is purely an
   *  informational heads-up. */
  notice: string | null;
}

interface CardState {
  mode: "replace" | "append";
  expanded: boolean;
  activeUpload: ActiveUpload | null;
}

function DatasetCard({
  type, status, isUploading, onUpload, cardState, onToggleMode, onToggleExpand, onDismissProgress,
}: {
  type: DatasetType;
  status: DatasetStatus | undefined;
  isUploading: boolean;
  onUpload: (type: DatasetType, file: File, mode: "replace" | "append") => void;
  cardState: CardState;
  onToggleMode: () => void;
  onToggleExpand: () => void;
  onDismissProgress: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const meta = DATASET_META[type];
  const last = status?.lastImport ?? null;
  // "Replace" mode wipes this dataset's existing history on upload — only
  // gate the destructive path with a confirmation; "append" is non-destructive.
  const [pendingReplaceFile, setPendingReplaceFile] = useState<File | null>(null);
  const [sizeWarning, setSizeWarning] = useState<string | null>(null);

  const showProgress = cardState.activeUpload && !cardState.activeUpload.dismissed;

  return (
    <div className={cn("card-surface flex flex-col gap-4 p-5 transition-shadow", type === "full_export" && "border-accent/30")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{meta.label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
        </div>
        <StatusBadge log={last} />
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span><span className="font-medium text-foreground">{status?.recordCount ?? 0}</span> records</span>
        {last?.createdAt && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {new Date(last.createdAt).toLocaleDateString()}
          </span>
        )}
        {last?.agentsTriggered && (last.agentsTriggered as string[]).length > 0 && (
          <span className="text-accent">{(last.agentsTriggered as string[]).length} agents ran</span>
        )}
      </div>

      <p className="rounded bg-muted/30 px-2 py-1.5 text-[10px] font-mono text-muted-foreground leading-relaxed">
        {meta.columns}
      </p>

      {showProgress && cardState.activeUpload && (
        <UploadProgress
          uploadPct={cardState.activeUpload.uploadPct}
          lastImport={last}
          uploadError={cardState.activeUpload.uploadError}
          onDismiss={onDismissProgress}
          onRetry={() => onUpload(type, cardState.activeUpload!.file, cardState.activeUpload!.mode)}
        />
      )}

      {showProgress && cardState.activeUpload?.notice && (
        <p className="rounded bg-yellow-500/10 px-2 py-1.5 text-[11px] text-yellow-500">{cardState.activeUpload.notice}</p>
      )}

      {sizeWarning && (
        <p className="rounded bg-yellow-500/10 px-2 py-1.5 text-[11px] text-yellow-500">{sizeWarning}</p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={onToggleMode}
          className={cn("rounded px-2 py-1 text-xs font-medium border transition-colors",
            cardState.mode === "replace"
              ? "border-orange-500/50 bg-orange-500/10 text-orange-400"
              : "border-border bg-muted/30 text-muted-foreground hover:text-foreground",
          )}
        >
          {cardState.mode === "replace" ? "Replace" : "Append"}
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={isUploading}
          className="ml-auto flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50"
        >
          {isUploading
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</>
            : <><Upload className="h-3.5 w-3.5" /> Upload CSV</>}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setSizeWarning(
              f.size > LARGE_FILE_WARNING_BYTES
                ? `${formatMB(f.size)} is a large file — this may take a while to process. It'll upload and process in the background, so you can keep using the app.`
                : null,
            );
            if (cardState.mode === "replace") {
              setPendingReplaceFile(f);
            } else {
              onUpload(type, f, cardState.mode);
            }
          }}
        />
      </div>

      <ConfirmDialog
        open={!!pendingReplaceFile}
        onOpenChange={(open) => !open && setPendingReplaceFile(null)}
        title={`Replace all ${meta.label.toLowerCase()} data?`}
        description={`Replace mode clears the existing ${status?.recordCount ?? 0} record${status?.recordCount === 1 ? "" : "s"} for this dataset before importing "${pendingReplaceFile?.name}". This can't be undone — switch to Append mode instead if you want to add to the existing data.`}
        confirmLabel="Replace Data"
        isLoading={isUploading}
        onConfirm={() => {
          if (!pendingReplaceFile) return;
          onUpload(type, pendingReplaceFile, "replace");
          setPendingReplaceFile(null);
        }}
      />

      {!showProgress && last?.errors && (last.errors as string[]).length > 0 && (
        <div className="rounded bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {(last.errors as string[]).slice(0, 3).map((e, i) => <div key={i}>{e}</div>)}
          {(last.errors as string[]).length > 3 && (
            <div className="opacity-60">+{(last.errors as string[]).length - 3} more</div>
          )}
        </div>
      )}

      <button
        onClick={onToggleExpand}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors -mb-1"
      >
        {cardState.expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        Import history
      </button>
      {cardState.expanded && <HistoryPanel datasetType={type} />}
    </div>
  );
}

// ─── Compliance import card ───────────────────────────────────────────────────

function ComplianceImportCard({
  type, status, isUploading, onUpload, activeUpload, onDismissProgress,
}: {
  type: DatasetType;
  status: DatasetStatus | undefined;
  isUploading: boolean;
  onUpload: (type: DatasetType, file: File) => void;
  activeUpload: ActiveUpload | null;
  onDismissProgress: () => void;
}) {
  const restaurantId = useRestaurantId();
  const [dataSource, setDataSource] = useDataSourcePreference(type, restaurantId);
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [sizeWarning, setSizeWarning] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const meta = DATASET_META[type];
  const last = status?.lastImport ?? null;
  const showProgress = activeUpload && !activeUpload.dismissed;

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = "";
    setSizeWarning(
      f.size > LARGE_FILE_WARNING_BYTES
        ? `${formatMB(f.size)} is a large file — this may take a while to process. It'll upload and process in the background.`
        : null,
    );
    const pv = await parsePreview(f);
    setPendingFile(f);
    setPreview(pv);
  }

  function handleConfirm() {
    if (!pendingFile) return;
    onUpload(type, pendingFile);
    setPendingFile(null);
    setPreview(null);
  }

  function handleCancel() {
    setPendingFile(null);
    setPreview(null);
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-foreground">{meta.label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
        </div>
        <StatusBadge log={last} />
      </div>

      {/* Record count */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span><span className="font-medium text-foreground">{status?.recordCount ?? 0}</span> records</span>
        {last?.createdAt && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {new Date(last.createdAt).toLocaleDateString()}
          </span>
        )}
      </div>

      {/* Column hint */}
      <p className="rounded bg-muted/30 px-2 py-1.5 text-[10px] font-mono text-muted-foreground leading-relaxed">
        {meta.columns}
      </p>

      {/* ── Data source selector ── */}
      <div className="rounded-xl border border-border bg-muted/20 p-3">
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Data Source</p>
        <div className="flex flex-col gap-2">
          <label className="flex cursor-pointer items-center gap-2.5">
            <div className={cn(
              "flex h-4 w-4 items-center justify-center rounded-full border-2",
              dataSource === "csv" ? "border-accent" : "border-border",
            )}>
              {dataSource === "csv" && <div className="h-2 w-2 rounded-full bg-accent" />}
            </div>
            <input type="radio" className="sr-only" checked={dataSource === "csv"} onChange={() => setDataSource("csv")} />
            <div>
              <p className="text-sm font-medium text-foreground">Manual CSV</p>
              <p className="text-[11px] text-muted-foreground">Upload a CSV file directly to this card</p>
            </div>
          </label>
          <label className="flex cursor-pointer items-center gap-2.5">
            <div className={cn(
              "flex h-4 w-4 items-center justify-center rounded-full border-2",
              dataSource === "external" ? "border-accent" : "border-border",
            )}>
              {dataSource === "external" && <div className="h-2 w-2 rounded-full bg-accent" />}
            </div>
            <input type="radio" className="sr-only" checked={dataSource === "external"} onChange={() => setDataSource("external")} />
            <div className="flex items-center gap-2">
              <div>
                <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  External Integration
                  <span className="rounded-full border border-muted-foreground/30 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Future
                  </span>
                </p>
                <p className="text-[11px] text-muted-foreground">Sync automatically from your HR system</p>
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* ── External integration placeholder ── */}
      {dataSource === "external" && (
        <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-muted/10 p-3">
          <Wifi className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">
              {meta.label} will sync from your HR system
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Once connected, manual uploads are disabled and data is kept in sync automatically. Configure your HR integration in{" "}
              <span className="font-medium text-accent">Settings → Integrations</span>.
            </p>
          </div>
        </div>
      )}

      {/* ── Manual CSV controls ── */}
      {dataSource === "csv" && (
        <>
          {/* Preview table */}
          {preview && pendingFile && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                  Preview — {pendingFile.name}
                  <span className="text-muted-foreground">(first 3 rows)</span>
                </p>
              </div>
              <PreviewTable headers={preview.headers} rows={preview.rows} />
              <div className="flex gap-2">
                <button
                  onClick={handleConfirm}
                  disabled={isUploading}
                  className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
                >
                  {isUploading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Importing…</> : <><Upload className="h-3.5 w-3.5" /> Confirm Import</>}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={isUploading}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Progress / result */}
          {showProgress && activeUpload && (
            <UploadProgress
              uploadPct={activeUpload.uploadPct}
              lastImport={last}
              uploadError={activeUpload.uploadError}
              onDismiss={onDismissProgress}
              onRetry={() => onUpload(type, activeUpload.file)}
            />
          )}

          {showProgress && activeUpload?.notice && (
            <p className="rounded bg-yellow-500/10 px-2 py-1.5 text-[11px] text-yellow-500">{activeUpload.notice}</p>
          )}

          {sizeWarning && !pendingFile && (
            <p className="rounded bg-yellow-500/10 px-2 py-1.5 text-[11px] text-yellow-500">{sizeWarning}</p>
          )}

          {/* Action buttons */}
          {!pendingFile && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => downloadTemplate(type)}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <Download className="h-3.5 w-3.5" /> Template
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={isUploading}
                className="ml-auto flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
              >
                {isUploading
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</>
                  : <><Upload className="h-3.5 w-3.5" /> Upload CSV</>}
              </button>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileSelect} />
            </div>
          )}
        </>
      )}

      {/* Last import errors */}
      {!showProgress && last?.errors && (last.errors as string[]).length > 0 && (
        <div className="rounded bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {(last.errors as string[]).slice(0, 3).map((e, i) => <div key={i}>{e}</div>)}
          {(last.errors as string[]).length > 3 && (
            <div className="opacity-60">+{(last.errors as string[]).length - 3} more</div>
          )}
        </div>
      )}

      {/* History */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors -mb-1"
      >
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        Import history
      </button>
      {expanded && <HistoryPanel datasetType={type} />}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DataCenterPage() {
  const restaurantId = useRestaurantId();
  const { data: statuses, isLoading, refetch } = useDataCenterStatus();
  const importMutation = useDataCenterImport();

  const [cardStates, setCardStates] = useState<Record<DatasetType, CardState>>(() =>
    Object.fromEntries(
      [...MAIN_ORDER].map((t) => [
        t,
        { mode: t === "full_export" ? "replace" : "append", expanded: false, activeUpload: null },
      ]),
    ) as Record<DatasetType, CardState>,
  );

  // Compliance cards manage their own expand/preview state locally — they
  // only need the shared activeUpload tracking (upload progress + retry),
  // keyed the same way.
  const [complianceUploads, setComplianceUploads] = useState<Record<string, ActiveUpload | null>>({});

  if (!restaurantId) {
    return <AppShell title="Data Center"><ConfigMissingBanner /></AppShell>;
  }

  const statusMap = new Map<DatasetType, DatasetStatus>(
    (statuses ?? []).map((s) => [s.datasetType as DatasetType, s]),
  );

  const anyAgentsRunning = (statuses ?? []).some(
    (s) => s.lastImport?.status === "agents_queued" || s.lastImport?.status === "agents_running",
  );

  // ── Handler for standard cards ────────────────────────────────────────────

  async function handleMainUpload(type: DatasetType, file: File, mode: "replace" | "append") {
    setCardStates((prev) => ({
      ...prev,
      [type]: { ...prev[type], activeUpload: { file, mode, uploadPct: 0, dismissed: false, uploadError: null, notice: null } },
    }));
    try {
      const result = await importMutation.mutateAsync({
        file,
        datasetType: type,
        mode,
        onUploadProgress: (pct) =>
          setCardStates((prev) => ({
            ...prev,
            [type]: prev[type].activeUpload
              ? { ...prev[type], activeUpload: { ...prev[type].activeUpload!, uploadPct: pct } }
              : prev[type],
          })),
      });
      // From here on, polling (useDataCenterStatus) drives progress —
      // status?.lastImport updates as the backend moves through
      // queued -> parsing -> writing -> agents_running -> completed. The
      // background queue being unavailable (result.queued === false)
      // doesn't affect that — the import still runs, just inline — this is
      // purely an informational heads-up, not an error state.
      if (!result.queued) {
        setCardStates((prev) => ({
          ...prev,
          [type]: prev[type].activeUpload
            ? { ...prev[type], activeUpload: { ...prev[type].activeUpload!, notice: result.message ?? "Processing without the background queue right now — this may take longer than usual." } }
            : prev[type],
        }));
      }
    } catch (err) {
      // Upload-transfer-level failure (network error, 400 validation) —
      // no ImportLog was ever created for this attempt, so the error has
      // to be carried here rather than read from polled status.
      setCardStates((prev) => ({
        ...prev,
        [type]: {
          ...prev[type],
          activeUpload: {
            file, mode, uploadPct: prev[type].activeUpload?.uploadPct ?? null, dismissed: false,
            uploadError: err instanceof Error ? err.message : "Upload failed", notice: null,
          },
        },
      }));
    }
  }

  // ── Handler for compliance cards (always "append" / upsert) ──────────────

  async function handleComplianceUpload(type: DatasetType, file: File) {
    setComplianceUploads((prev) => ({
      ...prev,
      [type]: { file, mode: "append", uploadPct: 0, dismissed: false, uploadError: null, notice: null },
    }));
    try {
      const result = await importMutation.mutateAsync({
        file,
        datasetType: type,
        mode: "append",
        onUploadProgress: (pct) =>
          setComplianceUploads((prev) =>
            prev[type] ? { ...prev, [type]: { ...prev[type]!, uploadPct: pct } } : prev,
          ),
      });
      if (!result.queued) {
        setComplianceUploads((prev) =>
          prev[type]
            ? { ...prev, [type]: { ...prev[type]!, notice: result.message ?? "Processing without the background queue right now — this may take longer than usual." } }
            : prev,
        );
      }
    } catch (err) {
      setComplianceUploads((prev) => ({
        ...prev,
        [type]: {
          file, mode: "append", uploadPct: prev[type]?.uploadPct ?? null, dismissed: false,
          uploadError: err instanceof Error ? err.message : "Upload failed", notice: null,
        },
      }));
    }
  }

  return (
    <AppShell title="Data Center">
      <div className="flex flex-col gap-8">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <Database className="h-5 w-5 text-accent" />
              Import Hub
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload CSVs to populate your data. AI agents run in the background after each import.
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
            Refresh
          </button>
        </div>

        <SalesQualityCard />

        {/* Agents running banner */}
        {anyAgentsRunning && (
          <div className="flex items-center gap-3 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 text-sm">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent" />
            <span>
              <span className="font-medium text-accent">AI agents are running</span>
              <span className="ml-2 text-muted-foreground">— analysing your data in the background.</span>
            </span>
          </div>
        )}

        {/* ── Main datasets ── */}
        <section>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {MAIN_ORDER.map((type) => (
              <DatasetCard
                key={type}
                type={type}
                status={statusMap.get(type)}
                isUploading={importMutation.isPending && importMutation.variables?.datasetType === type}
                onUpload={handleMainUpload}
                cardState={cardStates[type]}
                onToggleMode={() =>
                  setCardStates((prev) => ({
                    ...prev,
                    [type]: { ...prev[type], mode: prev[type].mode === "append" ? "replace" : "append" },
                  }))
                }
                onToggleExpand={() =>
                  setCardStates((prev) => ({
                    ...prev,
                    [type]: { ...prev[type], expanded: !prev[type].expanded },
                  }))
                }
                onDismissProgress={() =>
                  setCardStates((prev) => ({
                    ...prev,
                    [type]: {
                      ...prev[type],
                      activeUpload: prev[type].activeUpload
                        ? { ...prev[type].activeUpload!, dismissed: true }
                        : null,
                    },
                  }))
                }
              />
            ))}
          </div>
        </section>

        {/* ── Compliance section ── */}
        <section>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-accent" />
              <h3 className="text-lg font-semibold text-foreground">Compliance &amp; HR</h3>
            </div>
            <div className="h-px flex-1 bg-border" />
            <p className="text-xs text-muted-foreground">
              Imports always upsert — re-uploading updates existing records
            </p>
          </div>

          <div className="mb-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
            <strong className="text-foreground">Required:</strong> Employees must be imported first (Employees card above) before compliance data can be attached. Each row is matched to an employee by{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono">employee_name</code> (case-insensitive).
            Download a template from each card to see the exact column format.
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {COMPLIANCE_ORDER.map((type) => (
              <ComplianceImportCard
                key={type}
                type={type}
                status={statusMap.get(type)}
                isUploading={importMutation.isPending && importMutation.variables?.datasetType === type}
                onUpload={handleComplianceUpload}
                activeUpload={complianceUploads[type] ?? null}
                onDismissProgress={() =>
                  setComplianceUploads((prev) => ({
                    ...prev,
                    [type]: prev[type] ? { ...prev[type]!, dismissed: true } : null,
                  }))
                }
              />
            ))}
          </div>
        </section>

      </div>
    </AppShell>
  );
}
