"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Coordinates the global preloader with per-page data fetching.
 *
 * A page that fetches its content on the client calls `usePageReady(loading)`.
 * While any registered page still reports `loading`, the preloader stays up, so
 * the overlay never disappears before the real content is on screen.
 *
 * Pages that render synchronously never register, so they are unaffected.
 */
const PageReadyContext = createContext(null);

let nextId = 0;

export function PageReadyProvider({ children }) {
  const pathname = usePathname();
  // Registrations are scoped to the route that created them: a navigation
  // starts a new page, so anything the previous page registered is ignored
  // without needing an effect to clear it.
  const [state, setState] = useState({ path: pathname, ids: new Set() });

  const register = useCallback(() => {
    const id = ++nextId;
    setState((prev) => {
      const ids = prev.path === pathname ? new Set(prev.ids) : new Set();
      ids.add(id);
      return { path: pathname, ids };
    });
    return id;
  }, [pathname]);

  const settle = useCallback((id) => {
    setState((prev) => {
      if (prev.path !== pathname || !prev.ids.has(id)) return prev;
      const ids = new Set(prev.ids);
      ids.delete(id);
      return { path: prev.path, ids };
    });
  }, [pathname]);

  const pendingCount = state.path === pathname ? state.ids.size : 0;

  const value = useMemo(
    () => ({ register, settle, pendingCount }),
    [register, settle, pendingCount]
  );

  return <PageReadyContext.Provider value={value}>{children}</PageReadyContext.Provider>;
}

/**
 * Report this page's loading state to the global preloader.
 *
 * @param {boolean} loading - true while the page is still fetching its content.
 */
export function usePageReady(loading) {
  const ctx = useContext(PageReadyContext);
  const idRef = useRef(null);
  const register = ctx?.register;
  const settle = ctx?.settle;

  useEffect(() => {
    if (!register) return undefined;
    idRef.current = register();
    return () => {
      if (idRef.current != null) settle?.(idRef.current);
      idRef.current = null;
    };
  }, [register, settle]);

  useEffect(() => {
    if (!settle || idRef.current == null) return;
    if (!loading) settle(idRef.current);
  }, [settle, loading]);
}

export function usePageReadyState() {
  return useContext(PageReadyContext);
}
