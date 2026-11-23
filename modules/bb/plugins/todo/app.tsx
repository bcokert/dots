// todo bb-plugin frontend: the todo lists as a side-panel tab, and the blues floating over bb.
// Same look and behaviour as the web UI (web/index.html in this repo), in bb's own theme. Keep the two in step.
import React, { useCallback, useEffect, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { definePluginApp, experimental_Icon as Icon, useBbNavigate, useRealtime, useRpc, useSettings } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";

type Child = { path: string; title: string; open: number; done: number; blue: number; doing: number };
type Item = { fields?: Record<string, string>; id: string; text: string; done: boolean; blue: boolean; doing: string | null; by: string | null; child?: Child };
type List = { path: string; title: string; project: { status: string | null } | null; items: Item[]; implicit: Child[]; crumbs: { path: string; title: string }[] };
type Blue = { path: string; list: string; id: string; text: string; doing: string | null };
const CHANGED = "todo-changed";

// --- Preferences, per device (localStorage): sort, done shown, open child lists, floating blues. ---
type Prefs = { sort: "auto" | "manual"; showDone: boolean; open: Record<string, boolean>; float: boolean; floatOpen: boolean; floatPos: { right: number; bottom: number } };
const KEY = "todo:prefs";
function loadPrefs(): Prefs {
  const p = JSON.parse(localStorage.getItem(KEY) || "{}");
  return {
    sort: p.sort ?? "auto", showDone: p.showDone ?? false, open: p.open ?? {},
    float: p.float ?? matchMedia("(min-width: 768px)").matches, floatOpen: p.floatOpen ?? true,
    floatPos: p.floatPos ?? { right: 16, bottom: 16 },
  };
}
function usePrefs(): [Prefs, (patch: Partial<Prefs>) => void] {
  const [prefs, setPrefs] = useState(loadPrefs);
  useEffect(() => {
    const sync = () => setPrefs(loadPrefs());
    window.addEventListener("todo-prefs", sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener("todo-prefs", sync); window.removeEventListener("storage", sync); };
  }, []);
  const update = useCallback((patch: Partial<Prefs>) => {
    localStorage.setItem(KEY, JSON.stringify({ ...loadPrefs(), ...patch }));
    window.dispatchEvent(new Event("todo-prefs"));
  }, []);
  return [prefs, update];
}

function useTodo() {
  const rpc = useRpc<typeof rpcContract>();
  return rpc;
}

// --- Bits ---
const stop = (fn: () => void) => (e: MouseEvent) => { e.stopPropagation(); e.preventDefault(); fn(); };

function Frog({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-[20px]" aria-hidden>
      <g className={on ? "fill-sky-600 dark:fill-sky-400" : "fill-background"} stroke="currentColor" strokeWidth={on ? 0 : 1.4}>
        <ellipse cx="12" cy="15.2" rx="9" ry="5.6" />
        <circle cx="7.4" cy="9.4" r="3.1" />
        <circle cx="16.6" cy="9.4" r="3.1" />
      </g>
      <g className={on ? "fill-background stroke-background" : "fill-current stroke-current"}>
        <circle cx="7.4" cy="9.4" r="1.1" strokeWidth="0" />
        <circle cx="16.6" cy="9.4" r="1.1" strokeWidth="0" />
        <path d="M8.6 16.6q3.4 2 6.8 0" fill="none" strokeWidth="1.3" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function Bullet({ done }: { done: boolean }) {
  return (
    <span className={`grid size-[18px] flex-none place-items-center rounded-full border-[1.5px] ${done ? "border-foreground bg-foreground text-background" : "border-muted-foreground/50"}`}>
      {done ? <Icon name="Check" className="size-3" /> : null}
    </span>
  );
}

const rowBase = "group flex min-h-10 cursor-pointer items-center gap-2.5 px-2.5 py-1.5 text-sm";
const tint = (it: { blue?: boolean; doing?: string | null; done?: boolean }) =>
  it.blue ? "bg-sky-500/20" : it.doing && !it.done ? "bg-emerald-500/20" : "hover:bg-muted/60";

// --- One list (a namespace), with child lists that expand in place. ---
function TodoList({ path, nav, prefs, setPrefs, depth = 0 }: { path: string; nav: (p: string) => void; prefs: Prefs; setPrefs: (p: Partial<Prefs>) => void; depth?: number }) {
  const rpc = useTodo();
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const refetch = useCallback(() => {
    rpc.call("list", { path }).then((l) => { setList(l as List); setError(null); }, (e: Error) => setError(e.message));
  }, [rpc, path]);
  useEffect(refetch, [refetch]);
  useRealtime(CHANGED, refetch);
  const act = (p: Promise<unknown>) => p.then(refetch, (e: Error) => setError(e.message));

  if (error) return <div className="px-2.5 py-3 text-sm text-destructive">{error}</div>;
  if (!list) return null;
  const rank = (i: Item) => (i.done ? 3 : i.blue ? 0 : i.doing ? 1 : 2);
  let items = prefs.showDone ? list.items : list.items.filter((i) => !i.done);
  if (prefs.sort === "auto") items = items.map((i, n) => [i, n] as const).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([i]) => i);
  const manual = prefs.sort === "manual";

  const drop = (target: string) => (e: DragEvent) => {
    e.preventDefault();
    if (!dragged || dragged === target) return;
    const ids = items.map((i) => i.id).filter((x) => x !== dragged);
    ids.splice(ids.indexOf(target), 0, dragged);
    setDragged(null);
    act(rpc.call("order", { path, ids }));
  };
  const dragProps = (itemId: string) => manual
    ? { draggable: true, onDragStart: () => setDragged(itemId), onDragEnd: () => setDragged(null), onDragOver: (e: DragEvent) => e.preventDefault(), onDrop: drop(itemId) }
    : {};

  return (
    <div className="flex flex-col gap-0.5">
      {items.map((it) => it.child
        ? <NsRow key={it.id} item={it} child={it.child} parent={path} nav={nav} prefs={prefs} setPrefs={setPrefs} depth={depth} drag={dragProps(it.id)} onBlue={() => act(rpc.call("item", { path, id: it.id, blue: !it.blue }))} />
        : (
          <div key={it.id} className={`${rowBase} ${tint(it)} ${it.done ? "text-muted-foreground" : ""}`} title={it.doing && !it.done ? `In flight: ${it.doing}` : it.by ? `Added by ${it.by}` : undefined}
            onClick={() => act(rpc.call("item", { path, id: it.id, done: !it.done }))} {...dragProps(it.id)}>
            {manual ? <Icon name="GripVertical" className="size-3.5 flex-none text-muted-foreground/60" /> : null}
            <Bullet done={it.done} />
            <span className={`min-w-0 flex-1 break-words ${it.done ? "line-through decoration-muted-foreground/50" : ""}`}>{it.text}</span>
            {(it.doing && !it.done) || it.by ? <span className="flex-none text-xs text-muted-foreground">{it.doing && !it.done ? it.doing : it.by}</span> : null}
            {confirming === it.id ? (
              <span className="flex flex-none gap-3 text-xs">
                <button type="button" className="text-destructive" onClick={stop(() => { setConfirming(null); act(rpc.call("remove", { path, id: it.id })); })}>Delete</button>
                <button type="button" className="text-muted-foreground" onClick={stop(() => setConfirming(null))}>Cancel</button>
              </span>
            ) : (
              <span className="flex flex-none items-center">
                <button type="button" title={it.blue ? "Not a blue" : "Make it a blue"} aria-pressed={it.blue}
                  className={`grid size-7 place-items-center text-muted-foreground hover:text-foreground ${it.blue ? "" : "opacity-0 group-hover:opacity-100"}`}
                  onClick={stop(() => act(rpc.call("item", { path, id: it.id, blue: !it.blue })))}><Frog on={it.blue} /></button>
                <button type="button" title="Delete" className="grid size-7 place-items-center text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
                  onClick={stop(() => setConfirming(it.id))}><Icon name="X" className="size-3.5" /></button>
              </span>
            )}
          </div>
        ))}
      {list.implicit.map((c) => <NsRow key={c.path} child={c} parent={path} nav={nav} prefs={prefs} setPrefs={setPrefs} depth={depth} />)}
      {!items.length && !list.implicit.length ? (
        <div className="px-2.5 py-3 text-sm text-muted-foreground">{list.items.length ? `All ${list.items.length} done.` : "Nothing here."}</div>
      ) : null}
    </div>
  );
}

function NsRow({ item, child, nav, prefs, setPrefs, depth, drag, onBlue }: { item?: Item; child: Child; parent: string; nav: (p: string) => void; prefs: Prefs; setPrefs: (p: Partial<Prefs>) => void; depth: number; drag?: object; onBlue?: () => void }) {
  const open = !!prefs.open[child.path];
  const total = child.open + child.done;
  const pct = total ? Math.round((100 * child.done) / total) : 0;
  const toggle = () => {
    const next = { ...prefs.open };
    if (open) delete next[child.path]; else next[child.path] = true;
    setPrefs({ open: next });
  };
  return (
    <div>
      <div className={`${rowBase} relative ${item?.blue ? "bg-sky-500/20" : "bg-muted/70"}`} onClick={toggle} {...drag}>
        <span className="pointer-events-none absolute inset-y-0 left-0 bg-foreground/[.07]" style={{ width: `${pct}%` }} />
        <Icon name="ChevronRight" className={`relative size-3.5 flex-none text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
        <button type="button" className="relative min-w-0 flex-1 truncate text-left font-medium hover:underline" onClick={stop(() => nav(child.path))}>{item?.text || child.title}</button>
        <span className="relative flex-none text-xs tabular-nums text-muted-foreground" title={`${child.done} of ${total} done`}>{child.open || ""}</span>
        {onBlue ? (
          <button type="button" title={item?.blue ? "Not a blue" : "Make it a blue"} className={`relative grid size-7 place-items-center text-muted-foreground hover:text-foreground ${item?.blue ? "" : "opacity-0 group-hover:opacity-100"}`}
            onClick={stop(onBlue)}><Frog on={!!item?.blue} /></button>
        ) : null}
      </div>
      {open ? <div className="mt-0.5 mb-1.5 pl-6"><TodoList path={child.path} nav={nav} prefs={prefs} setPrefs={setPrefs} depth={depth + 1} /></div> : null}
    </div>
  );
}

// --- The side-panel tab ---
function TodoTab({ params }: { params: unknown }) {
  const start = typeof (params as { path?: unknown })?.path === "string" ? (params as { path: string }).path : "";
  const [path, setPath] = useState(start);
  const [prefs, setPrefs] = usePrefs();
  const rpc = useTodo();
  const [head, setHead] = useState<List | null>(null);
  const refetch = useCallback(() => { rpc.call("list", { path }).then((l) => setHead(l as List), () => setHead(null)); }, [rpc, path]);
  useEffect(refetch, [refetch]);
  useRealtime(CHANGED, refetch);
  const toggleClass = "hover:text-foreground";
  return (
    <div className="flex h-full flex-col overflow-auto px-3 py-3">
      <div className="mb-2 flex items-baseline gap-3 text-xs text-muted-foreground">
        <nav className="flex min-w-0 flex-1 flex-wrap items-baseline gap-1">
          {head?.crumbs.slice(0, -1).map((c) => (
            <span key={c.path} className="flex gap-1"><button type="button" className={toggleClass} onClick={() => setPath(c.path)}>{c.title}</button><span className="opacity-50">/</span></span>
          ))}
        </nav>
        <button type="button" className={toggleClass} onClick={() => setPrefs({ sort: prefs.sort === "auto" ? "manual" : "auto" })}>{prefs.sort === "auto" ? "auto sort" : "manual sort"}</button>
        <button type="button" className={toggleClass} onClick={() => setPrefs({ showDone: !prefs.showDone })}>{prefs.showDone ? "hide done" : "show done"}</button>
        <button type="button" className={`${toggleClass} ${prefs.float ? "text-sky-600 dark:text-sky-400" : ""}`} onClick={() => setPrefs({ float: !prefs.float })}>{prefs.float ? "blues floating" : "float blues"}</button>
      </div>
      <h2 className="mb-0.5 text-lg font-semibold">{head?.title ?? "todo"}</h2>
      {head?.project ? <div className="mb-1 text-xs text-muted-foreground">{["project", head.project.status].filter(Boolean).join(" · ")}</div> : null}
      <div className="mt-2"><TodoList path={path} nav={setPath} prefs={prefs} setPrefs={setPrefs} /></div>
    </div>
  );
}

// --- Floating blues: every open blue, over everything, until you turn it off. ---
function FloatingBlues() {
  const [prefs, setPrefs] = usePrefs();
  const rpc = useTodo();
  const [blues, setBlues] = useState<Blue[]>([]);
  const refetch = useCallback(() => { rpc.call("blues", null).then((b) => setBlues(b as Blue[]), () => setBlues([])); }, [rpc]);
  useEffect(() => { if (prefs.float) refetch(); }, [prefs.float, refetch]);
  useRealtime(CHANGED, () => { if (prefs.float) refetch(); });
  // Drag it anywhere by its grip; where it sits is remembered on this device (default: bottom right).
  const [at, setAt] = useState(prefs.floatPos);
  useEffect(() => setAt(prefs.floatPos), [prefs.floatPos]);
  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY, ...at };
    let last = at;
    const move = (ev: PointerEvent) => {
      last = { right: Math.max(0, Math.min(window.innerWidth - 80, start.right - (ev.clientX - start.x))), bottom: Math.max(0, Math.min(window.innerHeight - 40, start.bottom - (ev.clientY - start.y))) };
      setAt(last);
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); setPrefs({ floatPos: last }); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  if (!prefs.float || !blues.length) return null;
  return (
    <div className="pointer-events-auto fixed z-50 w-72 max-w-[calc(100vw-2rem)] border border-sky-500/25 bg-background/35 text-sm transition-colors hover:bg-background/90"
      style={{ right: at.right, bottom: at.bottom }}>
      <div className="flex items-center text-xs text-muted-foreground">
        <span className="grid h-7 w-6 cursor-grab touch-none place-items-center hover:text-foreground" onPointerDown={startDrag} title="Drag to move">
          <Icon name="GripVertical" className="size-3.5" />
        </span>
        <button type="button" className="flex flex-1 items-center gap-2 py-1.5 pr-3 hover:text-foreground" onClick={() => setPrefs({ floatOpen: !prefs.floatOpen })}>
          <span className="flex-1 text-left">{blues.length} blue{blues.length === 1 ? "" : "s"}</span>
          <Icon name={prefs.floatOpen ? "ChevronDown" : "ChevronUp"} className="size-3.5" />
        </button>
      </div>
      {prefs.floatOpen ? (
        <div className="flex flex-col gap-0.5 pb-1">
          {blues.map((b) => (
            <div key={`${b.path}#${b.id}`} className="flex cursor-pointer items-start gap-2 bg-sky-500/20 px-3 py-1.5 hover:bg-sky-500/30"
              onClick={() => rpc.call("item", { path: b.path, id: b.id, done: true }).then(refetch, refetch)} title="Check it off">
              <span className="mt-0.5"><Bullet done={false} /></span>
              <span className="min-w-0 flex-1">
                <span className="block break-words">{b.text}</span>
                {b.path ? <span className="block text-xs text-muted-foreground">{b.list}</span> : null}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}


// --- Todo chips in chat. An agent writes a todo as a plain link to the life dashboard, [Name](<dashboard>/#path/^id),
// which stays a readable link wherever this plugin isn't running. Here we find those links in the DOM, hide each and
// put a chip after it: name, state, and a click that expands the details inline. Messages are React-owned, so we only
// add a sibling node and set one attribute on the link, never edit its content.
const HIDE = "a[data-todo-link]{display:none!important}";
function parseHash(href: string, life: string): { path: string; id: string | null } | null {
  if (!href.startsWith(life + "/#")) return null;
  const segs = decodeURIComponent(href.slice(life.length + 2)).split("/").filter(Boolean);
  const last = segs.at(-1);
  if (last?.startsWith("^")) return { path: segs.slice(0, -1).join("/"), id: last.slice(1) };
  return { path: segs.join("/"), id: null };
}
type Host = { anchor: HTMLAnchorElement; slot: HTMLElement; path: string; id: string | null; label: string };

function TodoChips() {
  const settings = useSettings();
  const life = String(settings.values?.lifeUrl ?? "").replace(/\/+$/, "");
  const [hosts, setHosts] = useState<Host[]>([]);
  const known = useRef(new Map<HTMLAnchorElement, Host>());
  useEffect(() => {
    if (!life) return;
    const style = document.createElement("style");
    style.textContent = HIDE;
    document.head.appendChild(style);
    let queued = false;
    const scan = () => {
      queued = false;
      let changed = false;
      for (const [a, h] of known.current) if (!a.isConnected) { h.slot.remove(); known.current.delete(a); changed = true; }
      for (const a of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
        if (known.current.has(a) || a.closest("[data-todo-slot]")) continue;
        const ref = parseHash(a.getAttribute("href") ?? "", life);
        if (!ref) continue;
        const slot = document.createElement("span");
        slot.dataset.todoSlot = "";
        a.dataset.todoLink = "";
        a.after(slot);
        known.current.set(a, { anchor: a, slot, ...ref, label: a.textContent ?? "" });
        changed = true;
      }
      if (changed) setHosts([...known.current.values()]);
    };
    const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(scan); } };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    scan();
    return () => {
      observer.disconnect();
      style.remove();
      for (const [a, h] of known.current) { h.slot.remove(); delete a.dataset.todoLink; }
      known.current.clear();
    };
  }, [life]);
  return <>{hosts.map((h) => createPortal(<Chip host={h} life={life} />, h.slot))}</>;
}

function Chip({ host, life }: { host: Host; life: string }) {
  const rpc = useTodo();
  const nav = useBbNavigate();
  const [list, setList] = useState<List | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const refetch = useCallback(() => {
    rpc.call("list", { path: host.path }).then((l) => { setList(l as List); setFailed(false); }, () => setFailed(true));
  }, [rpc, host.path]);
  useEffect(refetch, [refetch]);
  useRealtime(CHANGED, refetch);

  const item = host.id ? list?.items.find((i) => i.id === host.id) ?? null : null;
  const isList = !host.id;
  const name = item?.text ?? (isList ? list?.title : null) ?? host.label;
  const tone = item ? (item.done ? "done" : item.blue ? "blue" : item.doing ? "doing" : "open") : "open";
  const bg = tone === "blue" ? "bg-sky-500/20" : tone === "doing" ? "bg-emerald-500/20" : "bg-muted/70";
  const f = item?.fields ?? {};
  const crumb = list && !isList ? list.title : "";
  const openItems = isList ? (list?.items.filter((i) => !i.done) ?? []) : [];
  const meta: [string, string][] = item ? ([
    ["Role", f.role], ["In flight", item.doing && !item.done ? item.doing : ""], ["Added by", item.by ?? ""],
    ["Done", item.done ? f.done ?? "yes" : ""], 
  ] as [string, string][]).filter(([, v]) => v) : [];
  const extra = Object.entries(f).filter(([k]) => !["role", "thread", "done", "doing", "by", "blue", "list"].includes(k));
  const link = "text-sky-600 hover:underline dark:text-sky-400";

  return (
    <span className={`max-w-full align-baseline ${open ? "block" : "inline-block"}`}>
      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); }}
        title={failed ? "Couldn't load this todo; click for the link" : undefined}
        className={`inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded px-1.5 py-px align-baseline text-[0.95em] ${bg} ${tone === "done" ? "text-muted-foreground" : ""}`}>
        {isList ? <Icon name="Folder" className="size-3.5 flex-none" />
          : <span className={`grid size-3.5 flex-none place-items-center rounded-[3px] border-[1.5px] ${tone === "done" ? "border-foreground bg-foreground text-background" : "border-muted-foreground/60"}`}>{tone === "done" ? <Icon name="Check" className="size-2.5" /> : null}</span>}
        <span className={`min-w-0 break-words text-left ${isList ? "font-medium" : ""} ${tone === "done" ? "line-through decoration-muted-foreground/50" : ""}`}>{name}</span>
        {isList ? (list ? <span className="flex-none text-xs text-muted-foreground">{openItems.length} open</span> : null)
          : crumb ? <span className="min-w-0 max-w-[9rem] flex-none truncate text-xs text-muted-foreground">in {crumb}</span> : null}
        <Icon name={open ? "ChevronUp" : "ChevronDown"} className="size-3 flex-none text-muted-foreground" />
      </button>
      {open ? (
        <span className="my-1 block space-y-1 border-l-2 border-muted-foreground/30 py-0.5 pl-3 text-sm">
          {failed || (!list) ? <span className="block text-muted-foreground">{failed ? "Couldn't read this todo." : "Loading..."}</span> : null}
          {list && !isList && !item ? <span className="block text-muted-foreground">Not found in this list any more (it may have been reworded or moved).</span> : null}
          {meta.map(([k, v]) => <span key={k} className="flex gap-2"><span className="w-20 flex-none text-muted-foreground">{k}</span><span className="min-w-0 break-words">{v}</span></span>)}
          {extra.map(([k, v]) => <span key={k} className="flex gap-2"><span className="w-20 flex-none text-muted-foreground">{k}</span><span className="min-w-0 break-words">{v}</span></span>)}
          {isList ? (openItems.length ? openItems.slice(0, 8).map((i) => <span key={i.id} className="block break-words">{i.doing ? "● " : "○ "}{i.text}</span>) : <span className="block text-muted-foreground">Nothing open.</span>) : null}
          {isList && openItems.length > 8 ? <span className="block text-muted-foreground">+ {openItems.length - 8} more</span> : null}
          <span className="flex flex-wrap gap-x-4 gap-y-1 pt-0.5">
            {f.thread ? <a href="#" className={link} onClick={(e) => { e.preventDefault(); nav.toThread(f.thread); }}>Open session</a> : null}
            <a href={host.anchor.getAttribute("href") ?? life} target="_blank" rel="noreferrer" className={link}>Open in life dashboard</a>
          </span>
        </span>
      ) : null}
    </span>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_tab({
    id: "todo", title: "Todo", icon: "ListTodo", tooltip: "Your todo lists",
    context: { kind: "thread" }, availability: "action", params: { path: "" }, layout: "flush",
    component: TodoTab,
  });
  app.slots.experimental_appOverlay({ id: "blues", component: FloatingBlues });
  app.slots.experimental_appOverlay({ id: "chips", component: TodoChips });
});
