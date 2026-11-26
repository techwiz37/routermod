"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";
import { cn } from "@/shared/utils/cn";

const ROW = 32; // option height: py-2 (16px) + text-xs line-height (16px)

/**
 * Theme-matched dropdown. Unlike the native <select>, its option list is
 * rendered inside the app so Android/iOS show the Antares surface instead of
 * the OS picker. `onChange` receives an event-compatible { target: { value } }
 * so it can drop into existing select handlers unchanged.
 *
 * `portal` renders the list at document.body with fixed positioning so an
 * ancestor with overflow (e.g. a scrollable modal body) cannot clip it. It
 * repositions on outside scroll instead of closing.
 * `maxVisible` caps the visible rows and virtualizes the list, so very large
 * option sets (thousands of proxy pools) open instantly and scroll smoothly.
 */
export default function AntaresSelect({
  value,
  onChange,
  options = [],
  placeholder = "Select...",
  className,
  buttonClassName,
  ariaLabel,
  id,
  disabled = false,
  portal = false,
  placement = "bottom",
  maxVisible = 0,
}) {
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState(null);
  const [scrollTop, setScrollTop] = useState(0);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);
  const computeRef = useRef(null);

  const virtualized = maxVisible > 0;
  const viewHeight = maxVisible * ROW + 8;

  // Fixed-position placement relative to the trigger, flipping upward when
  // requested or when there is not enough room below (same approach as
  // ConnectionRow). Recomputed on outside scroll/resize so the list stays put.
  const computeStyle = () => {
    if (!portal || typeof document === "undefined") return;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cap = virtualized ? viewHeight : Infinity;
    const spaceBelow = window.innerHeight - rect.bottom;
    const estimated = Math.min(options.length, virtualized ? maxVisible : 12) * ROW + 8;
    const openAbove = placement === "top" || (spaceBelow < estimated && rect.top > spaceBelow);
    const available = openAbove
      ? Math.max(rect.top - 8, 120)
      : Math.max(spaceBelow - 8, 120);
    setDropdownStyle({
      position: "fixed",
      left: rect.left,
      width: rect.width,
      zIndex: 130,
      maxHeight: Math.min(cap, available),
      ...(openAbove
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  };
  computeRef.current = computeStyle;

  const toggle = () => {
    if (open) { setOpen(false); return; }
    setScrollTop(0);
    computeStyle();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => {
      if (!rootRef.current?.contains(e.target) && !dropdownRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    const onLayout = (e) => {
      // Scrolling the list itself must NOT close it.
      if (dropdownRef.current?.contains(e.target)) return;
      computeRef.current?.();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    if (portal) {
      window.addEventListener("resize", onLayout);
      document.addEventListener("scroll", onLayout, true);
    }
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
      if (portal) {
        window.removeEventListener("resize", onLayout);
        document.removeEventListener("scroll", onLayout, true);
      }
    };
  }, [open, portal]);

  // Start near the selected option for long virtualized lists.
  useEffect(() => {
    if (!open || !virtualized || !dropdownRef.current) return;
    const idx = options.findIndex((o) => String(o.value) === String(value));
    if (idx > 1) {
      dropdownRef.current.scrollTop = (idx - 1) * ROW;
      setScrollTop(dropdownRef.current.scrollTop);
    }
  }, [open, virtualized, options, value]);

  const selected = options.find((o) => String(o.value) === String(value));

  // Only mount the rows currently in view (+overscan) instead of thousands.
  const visibleRows = useMemo(() => {
    if (!virtualized) return options.map((o, i) => ({ option: o, index: i }));
    const start = Math.max(0, Math.floor(scrollTop / ROW) - 2);
    const end = Math.min(options.length, start + maxVisible + 6);
    return options.slice(start, end).map((option, k) => ({ option, index: start + k }));
  }, [options, virtualized, scrollTop, maxVisible]);

  const renderOption = ({ option, index }) => {
    const active = String(option.value) === String(value);
    return (
      <button
        key={option.value}
        type="button"
        role="option"
        aria-selected={active}
        style={virtualized ? { position: "absolute", top: index * ROW, left: 0, right: 0, height: ROW } : undefined}
        onClick={() => {
          onChange?.({ target: { value: option.value } });
          setOpen(false);
        }}
        className={cn(
          "flex w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-xs transition-colors",
          virtualized ? "" : "py-2",
          active
            ? "bg-[var(--t-accent-soft)] text-[var(--t-ink)]"
            : "text-[var(--t-muted)] hover:bg-[var(--t-raised)] hover:text-[var(--t-ink)]"
        )}
      >
        <span className="min-w-0 flex-1 truncate">{option.label}</span>
        {active && <span className="material-symbols-outlined shrink-0 text-[15px] text-[var(--t-accent)]">check</span>}
      </button>
    );
  };

  const listbox = (
    <div
      ref={dropdownRef}
      role="listbox"
      style={portal ? dropdownStyle : (maxVisible > 0 ? { maxHeight: viewHeight } : undefined)}
      onScroll={virtualized ? (e) => setScrollTop(e.currentTarget.scrollTop) : undefined}
      className={cn(
        "an-scope scrollbar-none overflow-y-auto overscroll-contain rounded-[10px] border border-[var(--t-line)] bg-[var(--t-card)] p-1 shadow-[0_14px_36px_rgba(0,0,0,0.5)]",
        portal ? "" : "absolute left-0 right-0 top-[calc(100%+4px)] z-[130] max-h-[45dvh]",
        virtualized && "relative"
      )}
    >
      {options.length === 0 ? (
        <p className="px-2.5 py-2 text-xs text-[var(--t-muted)]">{placeholder}</p>
      ) : virtualized ? (
        <div style={{ height: options.length * ROW, position: "relative" }}>
          {visibleRows.map(renderOption)}
        </div>
      ) : (
        visibleRows.map(renderOption)
      )}
    </div>
  );

  return (
    <div ref={rootRef} className={cn("relative min-w-0", className)}>
      <button
        ref={buttonRef}
        type="button"
        id={id}
        disabled={disabled}
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={cn(
          "flex h-8 w-full items-center justify-between gap-2 rounded-[10px] border border-[var(--t-line)] bg-[var(--t-field)] px-2.5 text-xs text-[var(--t-ink)] transition-colors",
          "hover:border-[var(--t-hover-line)] focus:outline-none focus:border-[var(--t-accent)] disabled:cursor-not-allowed disabled:opacity-50",
          buttonClassName
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left">{selected?.label ?? placeholder}</span>
        <span className={cn("material-symbols-outlined shrink-0 text-[16px] text-[var(--t-muted)] transition-transform", open && "rotate-180")}>
          expand_more
        </span>
      </button>

      {open && (portal && typeof document !== "undefined" ? createPortal(listbox, document.body) : listbox)}
    </div>
  );
}

AntaresSelect.propTypes = {
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onChange: PropTypes.func.isRequired,
  options: PropTypes.arrayOf(PropTypes.shape({
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    label: PropTypes.node.isRequired,
  })),
  placeholder: PropTypes.node,
  className: PropTypes.string,
  buttonClassName: PropTypes.string,
  ariaLabel: PropTypes.string,
  id: PropTypes.string,
  disabled: PropTypes.bool,
  portal: PropTypes.bool,
  placement: PropTypes.oneOf(["bottom", "top"]),
  maxVisible: PropTypes.number,
};
