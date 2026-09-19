"use client";

// =============================================================================
// DataGrid — the signature TPE spreadsheet table (Figma design system)
// =============================================================================
// The bright, gold-header spreadsheet table that sits on the dark app shell.
// Spec from Figma node 263:7098 (see docs/figma-design-system.md):
//
//   • Gold header row (#f3bc41) with near-black bold text.
//   • Light alternating body rows (#eee / #d9d7d3), near-black medium text.
//   • Optional dark totals/footer row (#4e4e4e, white text).
//   • 1px black gridlines via border-separate + border-spacing-px on a black
//     table background.
//   • 40px cell height, 8px horizontal padding, 16px Inter.
//
// Two ways to use it:
//   1. <DataGrid columns rows /> — declarative, covers the common case
//      (optional leading checkbox, totals row, client search + sort).
//   2. The exported parts (GridTable, GridHeadCell, GridRow, GridCell,
//      GridTotalCell) + `gridClasses` for bespoke layouts (e.g. the Spot
//      Floor with Edit/Sell action cells).
//
// Keep all data/behavior wiring outside — this is presentation only.
// =============================================================================

import * as React from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronUp, ChevronsUpDown, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Align = "left" | "right" | "center";

const alignClass: Record<Align, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

// ---------------------------------------------------------------------------
// Styling primitives — reusable for bespoke tables.
// ---------------------------------------------------------------------------

export const gridClasses = {
  /** Outer table: black bg shows through 1px gridlines via border-spacing. */
  table:
    "w-full border-separate border-spacing-px bg-table-gridline overflow-hidden rounded-lg text-[12px] leading-4",
  headCell:
    "bg-table-header text-table-header-foreground h-10 px-2 text-left align-middle font-bold whitespace-nowrap",
  /** Even/odd handled by the consumer (or DataGrid's nth-child rule). */
  rowEven: "[&>td]:bg-table-row",
  rowOdd: "[&>td]:bg-table-row-alt",
  cell: "h-10 px-2 align-middle font-medium text-table-row-foreground whitespace-nowrap",
  totalCell:
    "h-10 px-2 align-middle font-medium bg-table-total text-table-total-foreground whitespace-nowrap",
} as const;

export function GridTable({ className, ...props }: React.ComponentProps<"table">) {
  return <table className={cn(gridClasses.table, className)} {...props} />;
}

export function GridHeadCell({
  className,
  align = "left",
  ...props
}: React.ComponentProps<"th"> & { align?: Align }) {
  return <th className={cn(gridClasses.headCell, alignClass[align], className)} {...props} />;
}

export function GridCell({
  className,
  align = "left",
  ...props
}: React.ComponentProps<"td"> & { align?: Align }) {
  return <td className={cn(gridClasses.cell, alignClass[align], className)} {...props} />;
}

export function GridTotalCell({
  className,
  align = "left",
  ...props
}: React.ComponentProps<"td"> & { align?: Align }) {
  return <td className={cn(gridClasses.totalCell, alignClass[align], className)} {...props} />;
}

/** Body row that auto-alternates by index. */
export function GridRow({
  index,
  className,
  ...props
}: React.ComponentProps<"tr"> & { index: number }) {
  return (
    <tr
      className={cn(index % 2 === 0 ? gridClasses.rowEven : gridClasses.rowOdd, className)}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Drag-to-scroll
// ---------------------------------------------------------------------------

/**
 * Grab a wide grid and drag it sideways.
 *
 * Wide ledgers (Transaction Summary is 26 columns; Manage Containers is 18) are
 * painful to read with only a scrollbar. Extracted from `<DataGrid>` so the
 * boards that CANNOT use DataGrid still get it — a bulk-save board must not
 * have DataGrid's client-side search box, which filters rows out of the DOM and
 * would silently discard an edited row before Update is pressed.
 *
 * Mouse only — touch already pans natively, and hijacking it would fight the
 * browser. A drag engages only after 5px of movement, so an ordinary click on a
 * row link is untouched; once it does engage the following click is swallowed,
 * or every drag would end by navigating somewhere.
 *
 * Spread `handlers` onto the scroll container, give it `ref`, and merge
 * `className` — which advertises the grab cursor ONLY when there is somewhere
 * to scroll.
 *
 * @param deps re-measure when the content changes size for a reason a
 *   ResizeObserver on the container cannot see (row count, column count).
 */
export function useDragScroll<T extends HTMLElement>(deps: React.DependencyList = []) {
  const ref = React.useRef<T>(null);
  const drag = React.useRef<{ x: number; left: number; active: boolean } | null>(null);
  const swallowClick = React.useRef(false);
  const [dragging, setDragging] = React.useState(false);
  const [overflows, setOverflows] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setOverflows(el.scrollWidth > el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const onPointerDown = (e: React.PointerEvent<T>) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse" || e.button !== 0) return;
    if (el.scrollWidth <= el.clientWidth) return;
    drag.current = { x: e.clientX, left: el.scrollLeft, active: false };
  };

  const onPointerMove = (e: React.PointerEvent<T>) => {
    const el = ref.current;
    if (!el || !drag.current) return;
    const dx = e.clientX - drag.current.x;
    if (!drag.current.active) {
      if (Math.abs(dx) < 5) return;
      drag.current.active = true;
      setDragging(true);
      el.setPointerCapture(e.pointerId);
    }
    el.scrollLeft = drag.current.left - dx;
  };

  const endDrag = (e: React.PointerEvent<T>) => {
    if (!drag.current) return;
    if (drag.current.active) {
      swallowClick.current = true;
      ref.current?.releasePointerCapture(e.pointerId);
    }
    drag.current = null;
    setDragging(false);
  };

  return {
    ref,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onClickCapture: (e: React.MouseEvent<T>) => {
        if (!swallowClick.current) return;
        swallowClick.current = false;
        e.preventDefault();
        e.stopPropagation();
      },
    },
    className: cn(overflows && "cursor-grab", dragging && "cursor-grabbing select-none"),
  };
}

// ---------------------------------------------------------------------------
// Declarative <DataGrid>.
// ---------------------------------------------------------------------------

export interface DataGridColumn<T> {
  key: string;
  header: React.ReactNode;
  align?: Align;
  width?: string | number;
  /** Custom cell renderer. Falls back to accessor / row[key]. */
  cell?: (row: T, index: number) => React.ReactNode;
  /** Plain value accessor (used for cell text + search + sort). */
  accessor?: (row: T) => React.ReactNode;
  sortable?: boolean;
  headerClassName?: string;
  cellClassName?: string;
}

export interface DataGridProps<T> {
  columns: DataGridColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  /** Totals/footer cells, one per column (string keys → ReactNode). Use
   *  `colSpan` by passing fewer than columns.length is not supported; pass a
   *  value (or null) per column. */
  totals?: (React.ReactNode | null)[];
  selectable?: boolean;
  selectedKeys?: Set<string>;
  onToggle?: (key: string) => void;
  onToggleAll?: () => void;
  /**
   * Which rows may be picked. Ineligible rows still render a checkbox, but
   * disabled and with `selectionHint` as its tooltip — showing it greyed out
   * says "not this one" where hiding it would just look like a rendering bug.
   * Select-all covers only the eligible rows. Defaults to every row.
   */
  isRowSelectable?: (row: T, index: number) => boolean;
  /** Tooltip on a disabled checkbox, e.g. why this row can't be grouped. */
  selectionHint?: (row: T, index: number) => string | undefined;
  /** Per-row checkbox aria-label. Defaults to "Select row". */
  selectionLabel?: (row: T, index: number) => string;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: React.ReactNode;
  className?: string;
  /** Extra props per row (onClick, data-attrs for context menus, etc). */
  rowProps?: (row: T, index: number) => React.HTMLAttributes<HTMLTableRowElement>;
  /** Persist search + sort to sessionStorage so they survive navigating away
   *  and back. Defaults to the current pathname; pass an explicit key only for
   *  routes that render more than one grid. */
  persistKey?: string;
  /**
   * Accessible name for the table (`aria-label`).
   *
   * Needed on any page rendering MORE THAN ONE grid: without it both tables
   * are anonymous, a `getByRole("table")` locator matches both, and a row
   * count taken across the union is silently wrong rather than loudly broken.
   * Same reason the Logistics boards name theirs.
   */
  label?: string;
}

function valueOf<T>(col: DataGridColumn<T>, row: T): string {
  if (col.accessor) {
    const v = col.accessor(row);
    return v == null ? "" : String(v);
  }
  const raw = (row as Record<string, unknown>)[col.key];
  return raw == null ? "" : String(raw);
}

export function DataGrid<T>({
  columns,
  rows,
  rowKey,
  totals,
  selectable,
  selectedKeys,
  onToggle,
  onToggleAll,
  isRowSelectable,
  selectionHint,
  selectionLabel,
  searchable,
  searchPlaceholder = "Search…",
  emptyMessage = "No rows.",
  className,
  rowProps,
  persistKey,
  label,
}: DataGridProps<T>) {
  const pathname = usePathname();
  const storeKey = `tpe.grid.${persistKey ?? pathname}`;
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<{ key: string; dir: "asc" | "desc" } | null>(null);

  // Restore persisted search + sort once on mount (after hydration, so the
  // server-rendered empty state matches the first client render — no mismatch).
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(storeKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        q?: string;
        sort?: { key: string; dir: "asc" | "desc" } | null;
      };
      // Deliberate post-hydration setState: reading sessionStorage during render
      // would mismatch the server-rendered empty state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved.q) setQuery(saved.q);
      if (saved.sort) setSort(saved.sort);
    } catch {
      /* ignore malformed storage */
    }
  }, [storeKey]);

  // Persist search + sort on change.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(storeKey, JSON.stringify({ q: query, sort }));
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  }, [storeKey, query, sort]);

  const filtered = React.useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((r) => columns.some((c) => valueOf(c, r).toLowerCase().includes(q)));
  }, [rows, query, columns]);

  const sorted = React.useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return filtered;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = valueOf(col, a);
      const bv = valueOf(col, b);
      const an = Number(av.replace(/[^0-9.-]/g, ""));
      const bn = Number(bv.replace(/[^0-9.-]/g, ""));
      const bothNum = av !== "" && bv !== "" && !Number.isNaN(an) && !Number.isNaN(bn);
      if (bothNum) return (an - bn) * dir;
      return av.localeCompare(bv) * dir;
    });
  }, [filtered, sort, columns]);

  // Drag-to-scroll, shared with the bespoke boards that cannot use DataGrid.
  // Destructured here, not read off the object in JSX: the React Compiler's
  // `react-hooks/refs` rule rejects a ref reached through a property access
  // during render.
  const {
    ref: scrollRef,
    handlers: dragHandlers,
    className: dragClass,
  } = useDragScroll<HTMLDivElement>([columns.length, rows.length]);

  // Select-all reflects only the ELIGIBLE rows: with a mixed grid, requiring
  // every row would leave the header box permanently unchecked.
  const eligible = selectable
    ? rows.filter((r, i) => isRowSelectable?.(r, i) ?? true)
    : ([] as T[]);
  const allSelected =
    selectable &&
    eligible.length > 0 &&
    eligible.every((r) => selectedKeys?.has(rowKey(r, rows.indexOf(r))));

  const toggleSort = (key: string) =>
    setSort((cur) =>
      cur?.key === key ? (cur.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" },
    );

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {searchable && (
        <div className="relative w-full max-w-xs">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-8 pl-8"
          />
        </div>
      )}
      <div ref={scrollRef} {...dragHandlers} className={cn("flex-1 overflow-x-auto", dragClass)}>
        <GridTable aria-label={label} className="h-full">
          <thead>
            <tr>
              {selectable && (
                <GridHeadCell align="center" className="w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all rows"
                    checked={!!allSelected}
                    onChange={() => onToggleAll?.()}
                  />
                </GridHeadCell>
              )}
              {columns.map((col) => (
                <GridHeadCell
                  key={col.key}
                  align={col.align}
                  className={col.headerClassName}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className="inline-flex items-center gap-1"
                    >
                      {col.header}
                      {sort?.key === col.key ? (
                        sort.dir === "asc" ? (
                          <ChevronUp className="size-3.5" />
                        ) : (
                          <ChevronDown className="size-3.5" />
                        )
                      ) : (
                        <ChevronsUpDown className="size-3.5 opacity-60" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </GridHeadCell>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <GridCell
                  align="center"
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="text-muted-foreground py-6"
                >
                  {emptyMessage}
                </GridCell>
              </tr>
            ) : (
              sorted.map((row, i) => {
                const key = rowKey(row, i);
                const extra = rowProps?.(row, i) ?? {};
                return (
                  <GridRow key={key} index={i} {...extra}>
                    {selectable &&
                      (() => {
                        const canPick = isRowSelectable?.(row, i) ?? true;
                        return (
                          <GridCell align="center" className="w-10">
                            <input
                              type="checkbox"
                              aria-label={selectionLabel?.(row, i) ?? "Select row"}
                              checked={!!selectedKeys?.has(key)}
                              disabled={!canPick}
                              title={canPick ? undefined : selectionHint?.(row, i)}
                              className={cn(!canPick && "cursor-not-allowed opacity-30")}
                              onChange={() => canPick && onToggle?.(key)}
                            />
                          </GridCell>
                        );
                      })()}
                    {columns.map((col) => (
                      <GridCell key={col.key} align={col.align} className={col.cellClassName}>
                        {col.cell ? col.cell(row, i) : (col.accessor?.(row) ?? valueOf(col, row))}
                      </GridCell>
                    ))}
                  </GridRow>
                );
              })
            )}
            {totals && (
              <tr>
                {selectable && <GridTotalCell />}
                {totals.map((t, i) => (
                  <GridTotalCell key={columns[i]?.key ?? i} align={columns[i]?.align}>
                    {t}
                  </GridTotalCell>
                ))}
              </tr>
            )}
          </tbody>
        </GridTable>
      </div>
    </div>
  );
}
