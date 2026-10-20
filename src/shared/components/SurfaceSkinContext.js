"use client";

import { createContext, useContext } from "react";

/**
 * Surface skin context.
 *
 * Components that render a lot of nested markup (cards, buttons, inputs) can
 * pick up the surrounding theme instead of every call site having to pass a
 * prop. The CLI tool pages use it to render their legacy tool cards in the
 * Antares skin without touching 20+ card components.
 */
export const SurfaceSkinContext = createContext("default");

export function useSurfaceSkin() {
  return useContext(SurfaceSkinContext);
}
