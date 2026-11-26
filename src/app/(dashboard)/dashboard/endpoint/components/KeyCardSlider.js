"use client";

import { Children, useState } from "react";
import { translate } from "@/i18n/runtime";

const PAGE_SIZE = 3;

/**
 * Responsive API-key card grid, paginated 3 keys per page so the section
 * never grows into a very long scroll. Uses the Antares pager styles shared
 * with the provider pages.
 */
export default function KeyCardSlider({ children }) {
  const cards = Children.toArray(children);
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(cards.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const visible = cards.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  if (!cards.length) return null;

  return (
    <section className="min-w-0" aria-label={translate("API Keys")}>
      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {visible}
      </div>

      <nav className="an-pagination" aria-label={translate("Pagination")}>
        <button
          type="button"
          className="an-page-btn"
          disabled={current <= 1}
          onClick={() => setPage(current - 1)}
          aria-label={translate("Previous page")}
          title={translate("Previous page")}
        >
          <span className="material-symbols-outlined">chevron_left</span>
        </button>

        {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            className={`an-page-btn ${n === current ? "active" : ""}`}
            aria-current={n === current ? "page" : undefined}
            onClick={() => setPage(n)}
          >
            {n}
          </button>
        ))}

        <button
          type="button"
          className="an-page-btn"
          disabled={current >= pageCount}
          onClick={() => setPage(current + 1)}
          aria-label={translate("Next page")}
          title={translate("Next page")}
        >
          <span className="material-symbols-outlined">chevron_right</span>
        </button>

        <span className="an-page-info">
          <span>{current}</span>
          <span>/</span>
          <span>{pageCount}</span>
          <span>·</span>
          <span>{cards.length}</span>
          <span>{translate("keys")}</span>
        </span>
      </nav>
    </section>
  );
}
