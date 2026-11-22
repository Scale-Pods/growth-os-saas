import { EmptyState } from "./EmptyState";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyTitle: string;
  emptyHint?: string;
}

/** Simple table. Every list has an empty state. Scrolls inside its own box on narrow screens. */
export function DataTable<T>({ columns, rows, rowKey, emptyTitle, emptyHint }: DataTableProps<T>) {
  if (rows.length === 0) return <EmptyState title={emptyTitle} hint={emptyHint} />;
  return (
    <div className="overflow-x-auto rounded-xl border border-border/60">
      <table className="w-full text-left text-sm">
        <thead className="bg-fill-tertiary/50 text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={`px-4 py-2.5 font-semibold ${c.className ?? ""}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="hover:bg-fill-tertiary/30">
              {columns.map((c) => (
                <td key={c.key} className={`px-4 py-3 text-foreground ${c.className ?? ""}`}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
