"use client";

import dynamic from "next/dynamic";
import PageLoadBadge from "@/shared/components/PageLoadBadge";

const LoginForm = dynamic(() => import("./LoginForm"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "monospace",
        fontSize: "11px",
      }}
      suppressHydrationWarning
      ref={(el) => {
        if (!el) return;
        try {
          const s = localStorage.getItem("theme");
          const t = s ? (JSON.parse(s).state || {}).theme : "light";
          const dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
          el.style.backgroundColor = dark ? "#0f1117" : "#f4f5f8";
          el.style.color = dark ? "#6b7280" : "#9ca3af";
        } catch { el.style.backgroundColor = "#f4f5f8"; el.style.color = "#9ca3af"; }
      }}
    >
      Loading...
    </div>
  ),
});

export default function LoginPage() {
  return (
    <>
      <LoginForm />
      <PageLoadBadge />
    </>
  );
}
