"use client";

import { useEffect, useId, useRef, useState } from "react";
import { translate } from "@/i18n/runtime";
import styles from "./console-log.module.css";

export default function ConsoleFilter({ label, value, options, onChange, icon, searchable = false, disabled = false }) {
  const id = useId();
  const root = useRef(null);
  const trigger = useRef(null);
  const keyboardOpen = useRef(false);
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.value === value) || options[0];
  const filtered = options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()));

  // A trigger near the bottom of a phone viewport would otherwise open its
  // menu completely below the fold, which reads as "the filter does nothing".
  // On desktop the page scrolls, so the menu always opens downward there and
  // never covers the stat tiles above it.
  const openMenu = () => {
    const rect = trigger.current?.getBoundingClientRect();
    if (rect && window.innerWidth < 640) {
      const below = window.innerHeight - rect.bottom;
      const above = rect.top;
      setDropUp(below < 340 && above > below);
    } else {
      setDropUp(false);
    }
    setQuery("");
    setOpen(!open);
  };

  useEffect(() => {
    if (!open) return;
    if (keyboardOpen.current) {
      root.current?.querySelector('[role="option"][aria-selected="true"]')?.focus();
      keyboardOpen.current = false;
    }
    const outside = (event) => { if (!root.current?.contains(event.target)) setOpen(false); };
    const escape = (event) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    root.current?.addEventListener("keydown", escape);
    const element = root.current;
    return () => { document.removeEventListener("pointerdown", outside); element?.removeEventListener("keydown", escape); };
  }, [open]);

  const move = (event) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = [...root.current.querySelectorAll('[role="option"]')];
    const index = items.indexOf(document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
      : event.key === "ArrowDown" ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  return <div className={styles.filterField} ref={root} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <label id={id + "-label"} htmlFor={id}>{label}</label>
    <button ref={trigger} id={id} type="button" className={styles.selectTrigger} disabled={disabled}
      aria-labelledby={id + "-label " + id + "-value"} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id + "-options" : undefined}
      onClick={openMenu}
      onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); keyboardOpen.current = true; setOpen(true); } }}>
      <span className={`material-symbols-outlined ${styles.selectIcon}`} aria-hidden="true">{selected?.icon || icon}</span>
      <span id={id + "-value"} className={styles.selectValue}>{selected?.label}</span>
      <span className="material-symbols-outlined" aria-hidden="true">{open ? "expand_less" : "expand_more"}</span>
    </button>
    {open && <div className={`${styles.selectMenu} ${dropUp ? styles.selectMenuUp : ""}`} onKeyDown={move}>
      {searchable && <div className={styles.menuSearch} onClick={() => root.current?.querySelector("input")?.focus()}>
        <span className="material-symbols-outlined" aria-hidden="true">search</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={translate("Search providers...")} aria-label={translate("Search providers...")} />
      </div>}
      <div id={id + "-options"} role="listbox" aria-labelledby={id + "-label"} className={styles.optionList}>
        {filtered.map((option) => <button type="button" role="option" aria-selected={option.value === value} key={option.value}
          className={styles.selectOption} onClick={() => { onChange(option.value); setOpen(false); trigger.current?.focus(); }}>
          <span className="material-symbols-outlined" aria-hidden="true">{option.icon || icon}</span>
          <span>{option.label}{option.description && <small>{option.description}</small>}</span>
          {option.value === value && <span className="material-symbols-outlined" aria-hidden="true">check</span>}
        </button>)}
      </div>
      {!filtered.length && <p className={styles.menuEmpty}>{translate("No results")}</p>}
    </div>}
  </div>;
}
