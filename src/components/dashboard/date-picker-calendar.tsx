"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface Props {
  value: string;           // YYYY-MM-DD
  onChange: (date: string) => void;
  maxDate?: string;        // YYYY-MM-DD — dates after this are disabled
  highlightDates?: Set<string>; // YYYY-MM-DD strings that have data
}

export function DatePickerCalendar({ value, onChange, maxDate, highlightDates }: Props) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => new Date(value + "T00:00:00").getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date(value + "T00:00:00").getMonth());
  const [showYearGrid, setShowYearGrid] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Sync view when value changes externally
  useEffect(() => {
    const d = new Date(value + "T00:00:00");
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }, [value]);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  function select(dateStr: string) {
    if (maxDate && dateStr > maxDate) return;
    onChange(dateStr);
    setOpen(false);
    setShowYearGrid(false);
  }

  // Build calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1);
  // Monday-based: 0=Mon … 6=Sun
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  const todayStr = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}`;
  })();

  function cellStr(day: number) {
    return `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // Year grid: show ±6 years centred on viewYear
  const yearRange = Array.from({ length: 12 }, (_, i) => viewYear - 5 + i);

  const displayDate = new Date(value + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => { setOpen(o => !o); setShowYearGrid(false); }}
        className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:border-accent/50 transition-colors focus:outline-none focus:ring-1 focus:ring-accent"
      >
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        {displayDate}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-xl border border-border bg-card shadow-xl">

          {/* ── Header ───────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <button
              onClick={prevMonth}
              className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            {/* Month + Year — clicking opens year/month picker */}
            <button
              onClick={() => setShowYearGrid(g => !g)}
              className="flex items-center gap-1.5 rounded px-2 py-0.5 text-sm font-semibold hover:bg-muted/40 transition-colors"
            >
              {MONTHS[viewMonth]} {viewYear}
              <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", showYearGrid && "rotate-90")} />
            </button>

            <button
              onClick={nextMonth}
              disabled={maxDate ? cellStr(1) > maxDate : false}
              className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {showYearGrid ? (
            /* ── Year / Month picker ─────────────────────────────────────── */
            <div className="p-3">
              {/* Year row */}
              <div className="mb-2 flex items-center justify-between px-1">
                <button onClick={() => setViewYear(y => y - 10)} className="text-xs text-muted-foreground hover:text-foreground px-1">‹‹</button>
                <span className="text-xs font-medium text-muted-foreground">Select year</span>
                <button onClick={() => setViewYear(y => y + 10)} className="text-xs text-muted-foreground hover:text-foreground px-1">››</button>
              </div>
              <div className="grid grid-cols-4 gap-1 mb-3">
                {yearRange.map(yr => (
                  <button
                    key={yr}
                    onClick={() => setViewYear(yr)}
                    className={cn(
                      "rounded py-1.5 text-xs transition-colors",
                      yr === viewYear
                        ? "bg-accent text-accent-foreground font-semibold"
                        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    )}
                  >
                    {yr}
                  </button>
                ))}
              </div>

              {/* Month grid */}
              <div className="text-xs font-medium text-muted-foreground px-1 mb-2">Select month</div>
              <div className="grid grid-cols-4 gap-1">
                {MONTHS.map((m, i) => (
                  <button
                    key={m}
                    onClick={() => { setViewMonth(i); setShowYearGrid(false); }}
                    className={cn(
                      "rounded py-1.5 text-xs transition-colors",
                      i === viewMonth && viewYear === new Date(value + "T00:00:00").getFullYear()
                        ? "bg-accent text-accent-foreground font-semibold"
                        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    )}
                  >
                    {m.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* ── Day grid ────────────────────────────────────────────────── */
            <div className="p-3">
              {/* Day headers */}
              <div className="grid grid-cols-7 mb-1">
                {DAYS.map(d => (
                  <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">{d}</div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7 gap-y-0.5">
                {cells.map((day, idx) => {
                  if (!day) return <div key={idx} />;
                  const str = cellStr(day);
                  const isSelected = str === value;
                  const isToday = str === todayStr;
                  const isDisabled = !!(maxDate && str > maxDate);
                  const hasData = highlightDates?.has(str);

                  return (
                    <button
                      key={str}
                      onClick={() => select(str)}
                      disabled={isDisabled}
                      className={cn(
                        "relative mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm transition-colors",
                        isSelected
                          ? "bg-accent text-accent-foreground font-semibold"
                          : isToday
                          ? "border border-accent/50 text-accent font-medium hover:bg-accent/10"
                          : isDisabled
                          ? "text-muted-foreground/30 cursor-not-allowed"
                          : "text-foreground hover:bg-muted/50"
                      )}
                    >
                      {day}
                      {/* Dot for dates that have data */}
                      {hasData && !isSelected && (
                        <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-accent/70" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Footer: quick jumps */}
              <div className="mt-3 flex justify-between border-t border-border pt-2.5">
                <button
                  onClick={() => select(todayStr)}
                  className="text-xs text-accent hover:underline"
                >
                  Today
                </button>
                {/* Jump to first day of the month visible */}
                <button
                  onClick={() => {
                    const first = cellStr(1);
                    if (!maxDate || first <= maxDate) select(first);
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  1st of month
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
