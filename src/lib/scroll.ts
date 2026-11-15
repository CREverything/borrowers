/** Smooth scrolling for jumps within a page, unless the user prefers reduced motion. */
export function scrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

export function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: scrollBehavior() });
}

export function scrollToTop() {
  window.scrollTo({ top: 0, behavior: scrollBehavior() });
}
