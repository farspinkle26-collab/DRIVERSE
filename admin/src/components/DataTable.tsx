"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";

export interface Column<T> {
  key: string;
  header: string;
  /** `index` is the row's 0-based position in the current sorted view (so a
   *  row-number column keeps counting from the top after a re-sort). */
  render: (row: T, index: number) => React.ReactNode;
  /** Enables sorting on this column; also used as the CSV export value when csvValue is omitted. */
  sortValue?: (row: T) => number | string;
  /** Value written to the CSV export for this column. Falls back to sortValue, then "". */
  csvValue?: (row: T, index: number) => string | number;
  align?: "left" | "right";
  className?: string;
  /** Hidden by default in the column-visibility toggle (still exportable/searchable). */
  defaultHidden?: boolean;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100];

/**
 * Data grid built on TanStack Table: sorting, pagination with a page-size
 * selector, column visibility toggling, CSV export, optional search, and a
 * sticky elevated header on scroll. See table/UI design spec.
 */
export function DataTable<T>({
  columns,
  rows,
  pageSize = 25,
  initialSort,
  emptyMessage = "No rows.",
  loading = false,
  searchPlaceholder = "Search…",
  searchValue,
  getRowHref,
  onRowClick,
  csvFilename,
  toolbar,
}: {
  columns: Column<T>[];
  rows: T[];
  pageSize?: number;
  initialSort?: { key: string; dir: "asc" | "desc" };
  emptyMessage?: string;
  loading?: boolean;
  searchPlaceholder?: string;
  /** When provided, shows a search box that filters rows by this text. */
  searchValue?: (row: T) => string;
  /** When provided, rows navigate to this href on click. */
  getRowHref?: (row: T) => string | undefined;
  onRowClick?: (row: T) => void;
  /** When provided, shows a "Download CSV" button exporting the filtered/sorted rows. */
  csvFilename?: string;
  /** Extra controls (e.g. category filters) rendered in the toolbar, left of Columns/CSV. */
  toolbar?: React.ReactNode;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sorting, setSorting] = useState<SortingState>(
    initialSort ? [{ id: initialSort.key, desc: initialSort.dir === "desc" }] : [],
  );
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() =>
    Object.fromEntries(columns.map((c) => [c.key, !c.defaultHidden])),
  );
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize });

  const searched = useMemo(() => {
    if (!searchValue || !query.trim()) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((r) => searchValue(r).toLowerCase().includes(q));
  }, [rows, query, searchValue]);

  const tanColumns = useMemo<ColumnDef<T, unknown>[]>(
    () =>
      columns.map((c) => ({
        id: c.key,
        header: c.header,
        accessorFn: c.sortValue ?? (() => ""),
        enableSorting: !!c.sortValue,
        // Cells are rendered from `columns` directly in the tbody below (not via
        // flexRender) so each one receives its display position for row-number
        // columns; TanStack's own row.index follows the unsorted data order.
      })),
    [columns],
  );

  const table = useReactTable({
    data: searched,
    columns: tanColumns,
    state: { sorting, columnVisibility, pagination },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const colByKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);
  const sortedRows = table.getSortedRowModel().rows;
  const pageRows = table.getRowModel().rows;
  const pageCount = table.getPageCount();
  const pageIndex = table.getState().pagination.pageIndex;

  function downloadCsv() {
    const visible = table.getVisibleLeafColumns();
    const header = visible.map((c) => colByKey.get(c.id)?.header ?? c.id);
    const lines = [header.map(csvEscape).join(",")];
    sortedRows.forEach((row, i) => {
      const cells = visible.map((c) => {
        const col = colByKey.get(c.id);
        const raw = col?.csvValue ? col.csvValue(row.original, i) : (col?.sortValue?.(row.original) ?? "");
        return csvEscape(raw);
      });
      lines.push(cells.join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${csvFilename ?? "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const hasToolbar = !!searchValue || !!toolbar || !!csvFilename || columns.length > 4;

  return (
    <div>
      {hasToolbar && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {searchValue && (
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  table.setPageIndex(0);
                }}
                placeholder={searchPlaceholder}
                className="w-48 rounded-lg border border-hairline bg-surface-2 px-2.5 py-1 text-xs text-ink-primary placeholder:text-ink-muted focus:border-series-1 focus:outline-none"
              />
            )}
            {toolbar}
          </div>
          <div className="flex items-center gap-2">
            {columns.length > 4 && (
              <details className="relative">
                <summary className="list-none rounded-lg border border-hairline bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-secondary transition hover:text-ink-primary [&::-webkit-details-marker]:hidden">
                  Columns
                </summary>
                <div className="absolute right-0 z-20 mt-1 max-h-72 w-48 overflow-y-auto rounded-lg border border-hairline bg-surface-2 p-1.5 shadow-lg">
                  {table.getAllLeafColumns().map((c) => (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-xs text-ink-secondary hover:bg-surface-1"
                    >
                      <input
                        type="checkbox"
                        checked={c.getIsVisible()}
                        onChange={c.getToggleVisibilityHandler()}
                        className="accent-series-1"
                      />
                      {colByKey.get(c.id)?.header ?? c.id}
                    </label>
                  ))}
                </div>
              </details>
            )}
            {csvFilename && (
              <button
                onClick={downloadCsv}
                className="rounded-lg border border-hairline bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-secondary transition hover:text-ink-primary"
              >
                Download CSV
              </button>
            )}
          </div>
        </div>
      )}

      {sortedRows.length === 0 && !loading ? (
        <div className="py-10 text-center text-sm text-ink-muted">{emptyMessage}</div>
      ) : (
        <div className="max-h-[560px] overflow-auto rounded-lg border border-hairline/60">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-surface-2">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => {
                    const col = colByKey.get(header.id);
                    const sorted = header.column.getIsSorted();
                    return (
                      <th
                        key={header.id}
                        className={`whitespace-nowrap px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-ink-muted ${
                          col?.align === "right" ? "text-right" : ""
                        } ${header.column.getCanSort() ? "cursor-pointer select-none hover:text-ink-secondary" : ""}`}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted && <span className="ml-1 text-series-1">{sorted === "desc" ? "▼" : "▲"}</span>}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: Math.min(pagination.pageSize, 8) }).map((_, i) => (
                    <tr key={i} className="border-t border-hairline/60">
                      {columns.map((c) => (
                        <td key={c.key} className="px-3 py-2.5">
                          <div className="h-3.5 w-full max-w-[8rem] animate-pulse rounded bg-surface-2" />
                        </td>
                      ))}
                    </tr>
                  ))
                : pageRows.map((row, i) => {
                    const href = getRowHref?.(row.original);
                    const clickable = !!href || !!onRowClick;
                    const displayIndex = pageIndex * pagination.pageSize + i;
                    return (
                      <tr
                        key={row.id}
                        onClick={
                          clickable
                            ? () => (href ? router.push(href) : onRowClick?.(row.original))
                            : undefined
                        }
                        className={`border-t border-hairline/60 transition-colors ${
                          clickable ? "cursor-pointer hover:bg-surface-2/70" : "hover:bg-surface-2/40"
                        }`}
                      >
                        {row.getVisibleCells().map((cell) => {
                          const col = colByKey.get(cell.column.id);
                          return (
                            <td
                              key={cell.id}
                              className={`px-3 py-2 ${
                                col?.align === "right" ? "text-right font-mono" : "text-left"
                              } ${col?.className ?? ""}`}
                            >
                              {col?.render(row.original, displayIndex)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      )}

      {sortedRows.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
          <span className="font-mono">
            {sortedRows.length.toLocaleString()} rows · page {pageIndex + 1}/{Math.max(1, pageCount)}
          </span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5">
              Rows
              <select
                value={pagination.pageSize}
                onChange={(e) => table.setPageSize(Number(e.target.value))}
                className="rounded-md border border-hairline bg-surface-2 px-1.5 py-1 font-mono text-ink-secondary"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="rounded border border-hairline px-2 py-1 hover:text-ink-primary disabled:opacity-40"
            >
              Prev
            </button>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="rounded border border-hairline px-2 py-1 hover:text-ink-primary disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function csvEscape(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
