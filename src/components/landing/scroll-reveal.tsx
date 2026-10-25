"use client";

import { useEffect } from "react";

// Marks each [data-reveal] element with data-revealed once it scrolls into view; landing.css does
// the rest. One observer for the whole page instead of a client wrapper per section. Without JS (or
// with reduced motion) the CSS never hides anything, so this is purely an enhancement.
export function ScrollReveal() {
  useEffect(() => {
    const elements = document.querySelectorAll<HTMLElement>("[data-landing] [data-reveal]:not([data-revealed])");
    if (!("IntersectionObserver" in window)) {
      elements.forEach((element) => element.setAttribute("data-revealed", ""));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-revealed", "");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.1 },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  return null;
}
