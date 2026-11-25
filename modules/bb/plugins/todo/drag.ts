// Pointer-event drag and drop for the todo rows: mouse, pen and touch (HTML5 drag events don't work with touch).
// Adapted from clarity-todo's web/drag.js, with the same gesture rules: mouse = press and move past a small slop;
// touch = long-press to pick up, so a plain swipe still scrolls. This lives inside bb's page, so makeDrag returns a
// dispose function that removes every listener and class it added, and it only reacts to presses on its own rows.
export type DragTarget = { el: HTMLElement; cls: "before" | "after" | "into" };
export type DragOptions<T extends DragTarget> = {
  /** The drag source for a pressed element, or null (not one of ours, or a button inside it). */
  handle(el: Element): HTMLElement | null;
  /** What's under the pointer, or null. */
  target(x: number, y: number, src: HTMLElement): T | null;
  drop(src: HTMLElement, target: T): void;
};

const LONG_PRESS = 380, SLOP = 6, EDGE = 56, STEP = 14;
const MARKS = ["todo-drop-before", "todo-drop-after", "todo-drop-into"];

export function makeDrag<T extends DragTarget>(o: DragOptions<T>): () => void {
  type State = { src: HTMLElement; x0: number; y0: number; id: number; touch: boolean; active: boolean; timer?: ReturnType<typeof setTimeout>; ghost?: HTMLElement; dx: number; dy: number; t?: T | null };
  let st: State | null = null, marked: HTMLElement | null = null, swallowUntil = 0;
  const mark = (t: T | null | undefined) => {
    marked?.classList.remove(...MARKS);
    marked = t ? t.el : null;
    marked?.classList.add("todo-drop-" + t!.cls);
  };
  // Only while dragging does a finger's move stop the page from scrolling.
  const block = (e: Event) => { e.preventDefault(); };
  const clear = () => {
    if (!st) return;
    document.removeEventListener("touchmove", block);
    clearTimeout(st.timer);
    st.ghost?.remove();
    st.src.classList.remove("todo-dragging");
    document.body.classList.remove("todo-is-dragging");
    mark(null);
    st = null;
  };
  const begin = () => {
    if (!st) return;
    const r = st.src.getBoundingClientRect(), g = st.src.cloneNode(true) as HTMLElement;
    g.classList.add("todo-drag-ghost");
    g.removeAttribute("data-todo-drag");
    g.removeAttribute("data-todo-drop");
    g.style.cssText += `;position:fixed;margin:0;pointer-events:none;z-index:2147483000;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
    document.body.appendChild(g);
    st.ghost = g; st.dx = st.x0 - r.left; st.dy = st.y0 - r.top; st.active = true;
    st.src.classList.add("todo-dragging");
    document.body.classList.add("todo-is-dragging");
    document.addEventListener("touchmove", block, { passive: false });
    if (st.touch && navigator.vibrate) navigator.vibrate(10);
  };
  const autoscroll = (x: number, y: number) => {
    const box = document.elementFromPoint(x, y)?.closest("[data-todo-scroll]") as HTMLElement | null;
    if (!box || box.scrollHeight <= box.clientHeight) return;
    const r = box.getBoundingClientRect();
    if (y < r.top + EDGE) box.scrollTop -= STEP; else if (y > r.bottom - EDGE) box.scrollTop += STEP;
  };
  const moveTo = (x: number, y: number) => {
    if (!st?.ghost) return;
    st.ghost.style.left = `${x - st.dx}px`;
    st.ghost.style.top = `${y - st.dy}px`;
    st.t = o.target(x, y, st.src);
    mark(st.t);
    autoscroll(x, y);
  };
  const down = (e: PointerEvent) => {
    if (e.button > 0 || st || !(e.target instanceof Element)) return;
    const src = o.handle(e.target);
    if (!src) return;
    st = { src, x0: e.clientX, y0: e.clientY, id: e.pointerId, touch: e.pointerType !== "mouse", active: false, dx: 0, dy: 0 };
    if (st.touch) st.timer = setTimeout(() => { if (st && !st.active) { begin(); moveTo(st.x0, st.y0); } }, LONG_PRESS);
  };
  const move = (e: PointerEvent) => {
    if (!st || e.pointerId !== st.id) return;
    if (!st.active) {
      const d = Math.hypot(e.clientX - st.x0, e.clientY - st.y0);
      if (st.touch) { if (d > SLOP) clear(); return; } // moved before the long-press: it's a scroll
      if (d < SLOP) return;
      begin();
    }
    moveTo(e.clientX, e.clientY);
  };
  const up = (e: PointerEvent) => {
    if (!st || e.pointerId !== st.id) return;
    const s = st, t = s.t;
    if (s.active) swallowUntil = Date.now() + 500;
    clear();
    if (s.active && t) o.drop(s.src, t);
  };
  const click = (e: MouseEvent) => {
    if (Date.now() < swallowUntil) { e.stopPropagation(); e.preventDefault(); swallowUntil = 0; }
  };
  const ctx = (e: Event) => { if (st) e.preventDefault(); };
  const key = (e: KeyboardEvent) => { if (e.key === "Escape" && st?.active) { e.stopPropagation(); clear(); } };

  document.addEventListener("pointerdown", down);
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
  document.addEventListener("pointercancel", clear);
  document.addEventListener("click", click, true);
  document.addEventListener("contextmenu", ctx);
  document.addEventListener("keydown", key, true);
  return () => {
    clear();
    document.removeEventListener("pointerdown", down);
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    document.removeEventListener("pointercancel", clear);
    document.removeEventListener("click", click, true);
    document.removeEventListener("contextmenu", ctx);
    document.removeEventListener("keydown", key, true);
  };
}
