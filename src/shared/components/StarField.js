"use client";

import { useEffect, useRef } from "react";

/**
 * Animated star field used as the page backdrop (login + dashboard).
 * Deterministic-free: positions are random per mount, so the field looks
 * different on every load but costs nothing to transfer.
 */
export default function StarField() {
  const ref = useRef(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let stars = [];
    let w = 0;
    let h = 0;
    let raf = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = cv.clientWidth || window.innerWidth;
      h = cv.clientHeight || window.innerHeight;
      cv.width = Math.max(1, Math.round(w * dpr));
      cv.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(150, Math.max(50, Math.round((w * h) / 13000)));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.3 + 0.3,
        a: Math.random() * 0.5 + 0.18,
        p: Math.random() * Math.PI * 2,
        s: Math.random() * 0.7 + 0.2,
        red: Math.random() < 0.12,
      }));
    };

    const draw = (t) => {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < stars.length; i++) {
        const st = stars[i];
        const tw = reduce ? 1 : 0.6 + 0.4 * Math.sin((t / 1000) * st.s + st.p);
        ctx.globalAlpha = Math.max(0, st.a * tw);
        ctx.fillStyle = st.red ? "#ff6a75" : "#cfd3db";
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!reduce) raf = requestAnimationFrame(draw);
    };

    resize();
    draw(0);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} className="an-stars" aria-hidden />;
}
