"use client";

import { useState, useRef } from "react";

/**
 * ModelConfigCarousel - Desktop grid / Mobile horizontal slider
 * Renders children (cards), filters out null/false, supports dots/arrows for mobile
 */
export default function ModelConfigCarousel({ children }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const containerRef = useRef(null);

  // Filter out null/false children
  const slides = Array.isArray(children) 
    ? children.filter(Boolean) 
    : children 
      ? [children] 
      : [];

  const showSlide = (index) => {
    // On phones only the active card is mounted visually, so there is no
    // horizontal scrolling and no tall empty gap under shorter cards.
    setCurrentSlide(index);
  };

  const handlePrev = () => {
    showSlide(currentSlide === 0 ? slides.length - 1 : currentSlide - 1);
  };

  const handleNext = () => {
    showSlide(currentSlide === slides.length - 1 ? 0 : currentSlide + 1);
  };

  if (!slides.length) return null;

  // Keep the same child tree at every breakpoint so drafts and file imports survive resizing.
  return (
    <div className="w-full min-w-0 flex flex-col gap-3">
      {/* Slider container */}
      <div
        ref={containerRef}
        className="flex items-start gap-3 md:grid md:items-stretch md:gap-4 md:overflow-visible"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", WebkitOverflowScrolling: "touch" }}
        onScroll={(event) => {
          const container = event.currentTarget;
          const first = container.children[0];
          const second = container.children[1];
          if (!first || !second) return;
          const step = second.offsetLeft - first.offsetLeft;
          if (step > 0 && container.scrollWidth > container.clientWidth) {
            setCurrentSlide(Math.min(slides.length - 1, Math.max(0, Math.round(container.scrollLeft / step))));
          }
        }}
      >
        {slides.map((child, idx) => (
          <div
            key={idx}
            className={`w-full min-w-0 shrink-0 ${idx !== currentSlide ? "hidden md:block" : ""}`}
          >
            {child}
          </div>
        ))}
      </div>

      {/* Dots + Arrow controls */}
      {slides.length > 1 && (
        <div className="flex items-center justify-between gap-2 px-2 md:hidden">
          <button
            type="button"
            onClick={handlePrev}
            className="an-btn an-ghost flex items-center justify-center w-11 h-11 shrink-0 rounded-full transition-colors"
            aria-label="Previous"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-sm">chevron_left</span>
          </button>

          <div className="flex justify-center flex-1">
            {slides.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => showSlide(idx)}
                className="an-btn h-11 w-11 justify-center hover:bg-text-muted/5"
                aria-current={idx === currentSlide ? "true" : undefined}
                aria-label={`Slide ${idx + 1}`}
              >
                <span aria-hidden="true" className={`h-2 rounded-full ${idx === currentSlide ? "bg-primary w-6" : "bg-text-muted/50 w-2"}`} />
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleNext}
            className="an-btn an-ghost flex items-center justify-center w-11 h-11 shrink-0 rounded-full transition-colors"
            aria-label="Next"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-sm">chevron_right</span>
          </button>
        </div>
      )}
    </div>
  );
}
