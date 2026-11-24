// scroll-guard: on the phone, a sideways drag inside a diff dragged the right panel (or sidebar) instead of
// scrolling the diff. bb already skips the panel/sidebar swipe when the touch starts in a horizontally scrolling
// element, but it finds that element by walking up from the event target, and bb's diff viewer lives in a shadow
// root, so from outside the target is the shadow host and the scroller is never seen. bb also has opt-out
// attributes (data-no-sidebar-swipe, data-no-secondary-panel-swipe) that it checks with closest() on the target.
// So: on touchstart / touch pointerdown, look through the real event path (composedPath, which sees into shadow
// roots); if a horizontally scrolling element is in it, put the opt-out attributes on the target for the length
// of the gesture. Capture phase on window runs before bb's handlers. Undone when the plugin unloads.
import { useEffect } from "react";
import { definePluginApp } from "@get-bb/plugin-sdk/app";

// true: no sideways drag ever moves the panel or sidebar, anywhere (also kills the edge swipe that opens them).
const NEVER_SWIPE = false;

const ATTRS = ["data-no-sidebar-swipe", "data-no-secondary-panel-swipe"];

function scrollsSideways(el: Element) {
  if (!(el instanceof HTMLElement) || el.scrollWidth <= el.clientWidth + 1) return false;
  const x = getComputedStyle(el).overflowX;
  return x === "auto" || x === "scroll" || x === "overlay";
}

function ScrollGuard() {
  useEffect(() => {
    let marked: Element | null = null;
    const release = () => {
      if (!marked) return;
      for (const a of ATTRS) marked.removeAttribute(a);
      marked = null;
    };
    const guard = (e: Event) => {
      if (e instanceof PointerEvent && e.pointerType !== "touch") return;
      release();
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (!NEVER_SWIPE && !e.composedPath().some((n) => n instanceof Element && scrollsSideways(n))) return;
      // Already opted out by its own markup: nothing to add, nothing to remove later.
      if (target.closest(ATTRS.map((a) => `[${a}]`).join(","))) return;
      for (const a of ATTRS) target.setAttribute(a, "");
      marked = target;
    };
    const opts = { capture: true, passive: true } as const;
    const ends = ["touchend", "touchcancel", "pointerup", "pointercancel"];
    window.addEventListener("touchstart", guard, opts);
    window.addEventListener("pointerdown", guard, opts);
    for (const t of ends) window.addEventListener(t, release, opts);
    return () => {
      window.removeEventListener("touchstart", guard, opts);
      window.removeEventListener("pointerdown", guard, opts);
      for (const t of ends) window.removeEventListener(t, release, opts);
      release();
    };
  }, []);
  return null;
}

export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({ id: "scroll-guard", component: ScrollGuard });
});
