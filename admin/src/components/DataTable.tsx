"use client";

import { useMemo, useState } from "react";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  sortValue?: (row: T) => number | string;
  align?: "left" | "right";
  className?: string;
}

/** Sortable, paginated table. Sorting/paging are pure client-side. */
export function DataTable<T>({
  columns,
  rows,
  pageSize = 10,
  initialSort,
  emptyMessage = "No rows.",
}: {
  columns: Column<T>[];
  rows: T[];
  pageSize?: number;
  initialSort?: { key: string; dir: "asc" | "desc" };
  emptyMessage?: string;
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [rows, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(clampedPage * pageSize, clampedPage * pageSize + pageSize);

  function toggleSort(key: string) {
    setPage(0);
    setSort((s) => {
      if (s?.key !== key) return { key, dir: "desc" };
      if (s.dir === "desc") return { key, dir: "asc" };
      return null;
    });
  }

  if (rows.length === 0) {
    return <div className="py-8 text-center text-sm text-ink-muted">{emptyMessage}</div>;
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-ink-muted">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`px-3 py-2 font-medium ${c.align === "right" ? "text-right" : ""} ${
                    c.sortValue ? "cursor-pointer select-none hover:text-ink-secondary" : ""
                  }`}
                  onClick={c.sortValue ? () => toggleSort(c.key) : undefined}
                >
                  {c.header}
                  {sort?.key === c.key && (
                    <span className="ml-1">{sort.dir === "desc" ? "▼" : "▲"}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr key={i} className="border-b border-hairline/60 last:border-0">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-3 py-2 ${c.align === "right" ? "text-right tabular" : ""} ${c.className ?? ""}`}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-ink-muted">
          <span>
            {sorted.length.toLocaleString()} rows · page {clampedPage + 1}/{pageCount}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(Math.max(0, clampedPage - 1))}
              disabled={clampedPage === 0}
              className="rounded border border-hairline px-2 py-1 hover:text-ink-primary disabled:opacity-40"
            >
              Prev
            </button>
            <button
              onClick={() => setPage(Math.min(pageCount - 1, clampedPage + 1))}
              disabled={clampedPage >= pageCount - 1}
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
