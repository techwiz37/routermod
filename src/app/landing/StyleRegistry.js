"use client";

import { useState } from "react";
import { useServerInsertedHTML } from "next/navigation";
import { createStyleRegistry, StyleRegistry } from "styled-jsx";

// Flush landing component styles before their streamed HTML can paint.
// Keep this registry route-local so unrelated app styles are unchanged.
export default function LandingStyleRegistry({ children }) {
  const [registry] = useState(() => createStyleRegistry());

  useServerInsertedHTML(() => {
    const styles = registry.styles();
    registry.flush();
    return <>{styles}</>;
  });

  return <StyleRegistry registry={registry}>{children}</StyleRegistry>;
}
