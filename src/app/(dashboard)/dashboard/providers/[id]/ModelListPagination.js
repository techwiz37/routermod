"use client";

import PropTypes from "prop-types";

/**
 * Compact prev/next pager for the model list — 5 rows per page.
 * The "1–5 / 12" summary is numeric so it needs no translation.
 */
export default function ModelListPagination({ page, totalPages, onPageChange, className = "" }) {
  if (totalPages <= 1) return null;

  return (
    <div className={`mt-3 flex items-center justify-end gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        title="Previous page"
        className="rounded-md border border-border p-1 text-text-muted transition-colors hover:bg-sidebar hover:text-text-main disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span className="material-symbols-outlined text-base">chevron_left</span>
      </button>
      <span className="select-none font-mono text-[11px] text-text-muted">{page} / {totalPages}</span>
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        title="Next page"
        className="rounded-md border border-border p-1 text-text-muted transition-colors hover:bg-sidebar hover:text-text-main disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span className="material-symbols-outlined text-base">chevron_right</span>
      </button>
    </div>
  );
}

ModelListPagination.propTypes = {
  page: PropTypes.number.isRequired,
  totalPages: PropTypes.number.isRequired,
  onPageChange: PropTypes.func.isRequired,
  className: PropTypes.string,
};
