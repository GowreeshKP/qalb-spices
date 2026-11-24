import Link from "next/link";
import type { PageMeta } from "@/lib/pagination";

export function pageHref(basePath: string, params: Record<string, string | undefined>, page: number): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  if (page > 1) search.set("page", String(page));
  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function Pagination({
  meta,
  basePath,
  params,
}: {
  meta: PageMeta;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  if (meta.totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-12 flex items-center justify-center gap-6">
      {meta.page > 1 ? (
        <Link className="qalb-link" rel="prev" href={pageHref(basePath, params, meta.page - 1)}>
          Previous
        </Link>
      ) : (
        <span className="qalb-muted text-sm">Previous</span>
      )}
      <span className="qalb-label" aria-current="page">
        Page {meta.page} of {meta.totalPages}
      </span>
      {meta.page < meta.totalPages ? (
        <Link className="qalb-link" rel="next" href={pageHref(basePath, params, meta.page + 1)}>
          Next
        </Link>
      ) : (
        <span className="qalb-muted text-sm">Next</span>
      )}
    </nav>
  );
}
