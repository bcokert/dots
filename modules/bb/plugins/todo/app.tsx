// todo bb-plugin frontend: the todo lists as a side-panel tab, and the blues floating over bb.
// Same look and behaviour as the life dashboard (clarity-todo web/life.html), in bb's own theme. Keep the two in step.
import React, { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { definePluginApp, experimental_Icon as Icon, useBbNavigate, useRealtime, useRpc, useSettings } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import { makeDrag, type DragTarget } from "./drag";

type Child = { path: string; title: string; open: number; done: number; blue: number; doing: number };
type Item = { notes?: string; fields?: Record<string, string>; issues?: string[]; id: string; text: string; done: boolean; blue: boolean; doing: string | null; by: string | null; child?: Child };
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

// --- Who: owner, claim, added by, problems (the todo app's README, "Who does what"). The same chips as the life
// dashboard's who(item, size) in clarity-todo web/life.html, with bb's session icons and colours copied from the
// session-agents plugin: house = personal pod, briefcase = work pod, solid terminal = a Host agent, crown = lead,
// branch arrow = worker. Keep all three in step. Sizes: "row" (list rows) and "full" (a chat chip's details).
const svg = (body: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'>${body}</svg>`)}")`;
const WHO_ICONS: Record<string, string> = {
  house: "<path d='M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z'/>",
  briefcase: "<rect x='2.5' y='7' width='19' height='13.5' rx='1.5'/><path d='M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2'/><path d='M2.5 13h19'/>",
  terminal: "<defs><mask id='p'><rect width='24' height='24' fill='white'/><path d='M7 9.5l3 2.5-3 2.5M12.5 15H17' stroke='black'/></mask></defs><rect x='1.5' y='3.5' width='21' height='17' rx='3.5' fill='black' stroke='none' mask='url(#p)'/>",
  person: "<circle cx='12' cy='7.5' r='4'/><path d='M4 21c0-4.6 3.6-7.5 8-7.5s8 2.9 8 7.5'/>",
  cog: "<circle cx='12' cy='12' r='3.2' stroke-width='2.6'/><path d='M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1' stroke-width='2.8'/>",
  crown: "<path d='M3 18h18M4 15 2.5 6.5l5.5 4L12 4l4 6.5 5.5-4L20 15z' fill='black'/>",
  branch: "<path d='M5 3v8a5 5 0 0 0 5 5h9' stroke-width='3'/><path d='m15 12 4 4-4 4' stroke-width='3'/>",
};
const WHO_CSS = `
[data-todo-drag] { user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
.todo-dragging { opacity: .3; }
.todo-drag-ghost { background: var(--background); box-shadow: 0 8px 24px rgba(0,0,0,.35); opacity: .95; }
body.todo-is-dragging * { cursor: grabbing !important; }
.todo-drop-before { box-shadow: 0 -2px 0 0 var(--primary); }
.todo-drop-after { box-shadow: 0 2px 0 0 var(--primary); }
.todo-drop-into { box-shadow: inset 0 0 0 2px var(--primary); }
[data-wc="personal"] { --wc: light-dark(#23845f, #4cc394); } [data-wc="work"] { --wc: light-dark(#6a4fe0, #a48dff); }
[data-wc="bdon"], [data-wc="app"], [data-wc="unk"] { --wc: var(--muted-foreground, gray); }
.td-wi, .td-wr { display: inline-block; flex: none; width: 14px; height: 14px; background-color: var(--wc, currentColor);
  -webkit-mask: center / contain no-repeat; mask: center / contain no-repeat; }
.td-wr { width: 10px; height: 10px; }
.td-wi[data-i="unk"] { -webkit-mask: none; mask: none; background: none; color: var(--wc); font: 700 12px/14px ui-monospace, monospace; text-align: center; }
.td-wi[data-i="unk"]::before { content: "?"; }
.td-claim { display: inline-flex; align-items: center; gap: 4px; height: 18px; padding: 0 6px 0 5px; font: 500 10px/1 ui-monospace, monospace;
  letter-spacing: .04em; color: var(--muted-foreground); background: color-mix(in srgb, currentColor 10%, transparent); }
.td-claim[data-live] { color: var(--foreground); background: color-mix(in srgb, var(--wc) 15%, transparent); box-shadow: 0 0 9px 1px color-mix(in srgb, var(--wc) 45%, transparent); }
.td-claim.rec { padding-right: 5px; opacity: .6; }
button.td-claim { cursor: pointer; } button.td-claim:hover { filter: brightness(1.35); }
.td-wmk { display: inline-flex; flex: none; filter: drop-shadow(0 0 3px var(--wc)); } .td-wmk .td-wi { width: 11px; height: 11px; }
.td-by { display: inline-flex; opacity: .6; } .td-by .td-wi { width: 11px; height: 11px; }
.td-lint { display: inline-grid; place-items: center; width: 16px; height: 16px; font: 700 11px/1 ui-monospace, monospace;
  color: light-dark(#c4153a, #ff4d6d); background: color-mix(in srgb, light-dark(#c4153a, #ff4d6d) 16%, transparent); cursor: default; }
${Object.entries(WHO_ICONS).map(([k, b]) => `.td-wi[data-i="${k}"], .td-wr[data-i="${k}"] { -webkit-mask-image: ${svg(b)}; mask-image: ${svg(b)}; }`).join("\n")}
`;
type Agent = { name: string; i: string; c: "personal" | "work" | "bdon" | "app" | "unk" };
// The README's id table.
const AGENTS: Record<string, Agent> = {
  "bdon": { name: "Bdon", i: "person", c: "bdon" },
  "claude-personal-host": { name: "Claude Personal Host", i: "terminal", c: "personal" },
  "claude-personal-pod": { name: "Claude Personal Pod", i: "house", c: "personal" },
  "claude-vidyard-pod": { name: "Claude Vidyard Pod", i: "briefcase", c: "work" },
  "claire": { name: "Claire", i: "house", c: "personal" },
};
const agentOf = (id: string): Agent => AGENTS[id] ?? (/^app:/.test(id) ? { name: id.slice(4), i: "cog", c: "app" } : { name: id, i: "unk", c: "unk" });

/** Days since YYYY-MM-DD as a short age: today, 1d..13d, 2w.., 3mo. */
function ageOf(d?: string): string {
  const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(d ?? "");
  if (!m) return "";
  const now = new Date(), n = Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(+m[1], +m[2] - 1, +m[3])) / 864e5);
  return n <= 0 ? "today" : n < 14 ? `${n}d` : n < 60 ? `${Math.floor(n / 7)}w` : `${Math.floor(n / 30)}mo`;
}
type Who = { role: string; thread: string; live: boolean; owner: string; by: string; doing: string; claimed: string; age: string; issues: string[]; done: boolean };
/** issues: the app's lint for this todo (README, "Who does what"), on every /api/list item. */
function whoOf(it: { fields?: Record<string, string>; done?: boolean; issues?: string[] }): Who {
  const issues = it.issues ?? [];
  const f = it.fields ?? {};
  return {
    role: f.role === "lead" || f.role === "worker" ? f.role : "", thread: /^[\w-]+$/.test(f.thread ?? "") ? f.thread : "",
    live: !!f.doing && !it.done, owner: f.owner ?? "", by: f.by ?? "", doing: f.doing ?? "", claimed: f.claimed ?? "",
    age: ageOf(f.claimed), issues, done: !!it.done,
  };
}
/** The who lines for a row's hover: owner, who added it, who has it and since when, problems. */
function whoTip(w: Who): string {
  const L: string[] = [];
  if (w.owner) L.push(`Owner: ${agentOf(w.owner).name}`);
  if (w.by && w.by !== w.owner) L.push(`Added by ${agentOf(w.by).name}`);
  if (w.live) L.push(`In flight: ${agentOf(w.doing).name}${w.role ? ` as ${w.role}` : ""}${w.claimed ? `, since ${w.claimed} (${w.age})` : ""}`);
  else if (w.role) L.push(`${w.done ? "Done by" : "Session"}: ${agentOf(w.owner || w.doing).name} as ${w.role}`);
  if (w.issues.length) L.push(`Problems: ${w.issues.join("; ")}`);
  return L.join("\n");
}
const AgentIcon = ({ a }: { a: Agent }) => <i className="td-wi" data-i={a.i} data-wc={a.c} />;

/** The claim / record chip: agent icon + role icon + age; opens its bb session. A live one glows. */
function ClaimChip({ w }: { w: Who }) {
  const nav = useBbNavigate();
  const a = agentOf(w.live ? w.doing : w.owner || w.doing);
  const tip = (w.live ? `${a.name}${w.role ? ` (${w.role})` : ""} has this${w.claimed ? ` since ${w.claimed}` : ""}`
    : `${w.done ? "Done by" : "Session:"} ${a.name}${w.role ? ` (${w.role})` : ""}`) + (w.thread ? "\nOpen its session" : "");
  const inner = <>
    <AgentIcon a={a} />
    {w.role ? <i className="td-wr" data-i={w.role === "lead" ? "crown" : "branch"} data-wc={a.c} /> : null}
    {w.live && w.age ? <span>{w.age}</span> : null}
  </>;
  const cls = `td-claim${w.live ? "" : " rec"}`;
  return w.thread
    ? <button type="button" className={cls} data-wc={a.c} data-live={w.live || undefined} title={tip} aria-label="Open its session" onClick={stop(() => nav.toThread(w.thread))}>{inner}</button>
    : <span className={cls} data-wc={a.c} data-live={w.live || undefined} title={tip}>{inner}</span>;
}

/** Owner icon (folded into the claim chip when it's the same agent), claim chip, a muted added-by icon, the red !. */
function WhoRow({ w }: { w: Who }) {
  const chip = w.live || !!w.role || !!w.thread;
  const owner = w.owner && !(chip && w.owner === (w.live ? w.doing : w.owner)) ? agentOf(w.owner) : null;
  const by = w.by && w.by !== w.owner ? agentOf(w.by) : null;
  if (!owner && !chip && !by && !w.issues.length) return null;
  return (
    <span className="inline-flex flex-none items-center gap-[7px] whitespace-nowrap">
      {owner ? <span className="inline-flex" title={`Owner: ${owner.name}`}><AgentIcon a={owner} /></span> : null}
      {chip ? <ClaimChip w={w} /> : null}
      {by ? <span className="td-by" title={`Added by ${by.name}`}><AgentIcon a={by} /></span> : null}
      {w.issues.length ? <span className="td-lint" title={w.issues.join("\n")}>!</span> : null}
    </span>
  );
}

/** Every who field, labelled: a chat chip's details. Lines match that card's own (label column, then the value). */
function WhoFull({ w }: { w: Who }) {
  const line = (k: string, v: React.ReactNode) => <span key={k} className="flex items-center gap-2"><span className="w-20 flex-none text-muted-foreground">{k}</span><span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">{v}</span></span>;
  const name = (id: string) => { const a = agentOf(id); return <span className="inline-flex items-center gap-[7px]"><AgentIcon a={a} /><span>{a.name}</span></span>; };
  const claimer = w.live ? w.doing : w.owner || w.doing;
  return <>
    {w.owner ? line("Owner", name(w.owner)) : null}
    {line("Added by", name(w.by || "bdon"))}
    {w.live || w.role || w.thread ? line(w.live ? "In flight" : w.done ? "Done by" : "Session", <>
      <ClaimChip w={w} />
      {w.owner && w.owner !== claimer ? <span>{agentOf(claimer).name}</span> : null}
      <span className="text-xs text-muted-foreground">{[w.role, w.live && w.claimed ? `since ${w.claimed}` : ""].filter(Boolean).join(" · ")}</span>
    </>) : null}
    {w.issues.length ? <span className="block bg-destructive/10 px-3 py-2 text-destructive">{w.issues.map((x) => <span key={x} className="block">{x}</span>)}</span> : null}
  </>;
}

const rowBase = "group flex min-h-10 cursor-pointer items-center gap-2.5 px-2.5 py-1.5 text-sm";
// In flight is the claim chip's glow, not a green row (green means done on the dashboard).
const tint = (it: { blue?: boolean }) => it.blue ? "bg-sky-500/20" : "hover:bg-muted/60";

// --- One list (a namespace), with child lists that expand in place. ---
function TodoList({ path, nav, prefs, setPrefs, depth = 0 }: { path: string; nav: (p: string) => void; prefs: Prefs; setPrefs: (p: Partial<Prefs>) => void; depth?: number }) {
  const rpc = useTodo();
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const refetch = useCallback(() => {
    rpc.call("list", { path }).then((l) => { setList(l as List); setError(null); }, (e: Error) => setError(e.message));
  }, [rpc, path]);
  useEffect(refetch, [refetch]);
  useRealtime(CHANGED, refetch);
  useEffect(() => { window.addEventListener("todo-moved", refetch); return () => window.removeEventListener("todo-moved", refetch); }, [refetch]);
  const act = (p: Promise<unknown>) => p.then(refetch, (e: Error) => setError(e.message));

  if (error) return <div className="px-2.5 py-3 text-sm text-destructive">{error}</div>;
  if (!list) return null;
  const rank = (i: Item) => (i.done ? 3 : i.blue ? 0 : i.doing ? 1 : 2);
  let items = prefs.showDone ? list.items : list.items.filter((i) => !i.done);
  if (prefs.sort === "auto") items = items.map((i, n) => [i, n] as const).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([i]) => i);
  const manual = prefs.sort === "manual";

  // Rows carry data attributes for the pointer drag in TodoTab: which list they sit in, and the row after them.
  const dragProps = (it: Item, n: number) => manual
    ? { "data-todo-drag": it.id, "data-todo-drop": it.id, "data-todo-path": path, "data-todo-next": items[n + 1]?.id ?? "", ...(it.child ? { "data-todo-child": it.child.path } : {}) }
    : {};

  return (
    <div className="flex flex-col gap-0.5">
      {items.map((it, n) => it.child
        ? <NsRow key={it.id} item={it} child={it.child} parent={path} nav={nav} prefs={prefs} setPrefs={setPrefs} depth={depth} drag={dragProps(it, n)} onBlue={() => act(rpc.call("item", { path, id: it.id, blue: !it.blue }))} />
        : (
          <div key={it.id} className={`${rowBase} ${tint(it)} ${it.done ? "text-muted-foreground" : ""}`} title={whoTip(whoOf(it)) || undefined}
            onClick={() => act(rpc.call("item", { path, id: it.id, done: !it.done }))} {...dragProps(it, n)}>
            {manual ? <Icon name="GripVertical" className="size-3.5 flex-none text-muted-foreground/60" /> : null}
            <Bullet done={it.done} />
            <span className={`min-w-0 flex-1 break-words ${it.done ? "line-through decoration-muted-foreground/50" : ""}`}>{it.text}</span>
            <WhoRow w={whoOf(it)} />
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
      <div className={`${rowBase} relative ${item?.blue ? "bg-sky-500/20" : "bg-muted/70"}`} onClick={toggle} title={item ? whoTip(whoOf(item)) || undefined : undefined} {...drag}>
        <span className="pointer-events-none absolute inset-y-0 left-0 bg-foreground/[.07]" style={{ width: `${pct}%` }} />
        <Icon name="ChevronRight" className={`relative size-3.5 flex-none text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
        <button type="button" className="relative min-w-0 flex-1 truncate text-left font-medium hover:underline" onClick={stop(() => nav(child.path))}>{item?.text || child.title}</button>
        {item ? <span className="relative flex"><WhoRow w={whoOf(item)} /></span> : null}
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

// --- Drag to reorder (manual sort): within a list, or into a namespace row (its folder moves with it). ---
type RowTarget = DragTarget & { to: string; before: string | null };
function dragRows(move: (body: { from: string; to: string; id: string; before: string | null }) => Promise<unknown>) {
  return makeDrag<RowTarget>({
    handle: (el) => el.closest("button, a") ? null : el.closest<HTMLElement>("[data-todo-drag]"),
    target(x, y, src) {
      const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-todo-drop]");
      if (!el || el === src) return null;
      const own = src.dataset.todoChild;
      const within = (p?: string) => !!own && !!p && (p === own || p.startsWith(own + "/"));
      const r = el.getBoundingClientRect(), f = (y - r.top) / r.height;
      if (el.dataset.todoChild && f > 0.25 && f < 0.75) {
        return within(el.dataset.todoChild) ? null : { el, cls: "into", to: el.dataset.todoChild, before: null };
      }
      const to = el.dataset.todoPath!;
      if (within(to)) return null;
      const before = f < 0.5 ? el.dataset.todoDrop! : el.dataset.todoNext || null;
      if (before === src.dataset.todoDrag) return null;
      return { el, cls: f < 0.5 ? "before" : "after", to, before };
    },
    drop(src, t) {
      move({ from: src.dataset.todoPath!, to: t.to, id: src.dataset.todoDrag!, before: t.before })
        .then(() => window.dispatchEvent(new Event("todo-moved")), () => window.dispatchEvent(new Event("todo-moved")));
    },
  });
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
  const manual = prefs.sort === "manual";
  useEffect(() => manual ? dragRows((body) => rpc.call("move", body)) : undefined, [manual, rpc]);
  return (
    <div className="flex h-full flex-col overflow-auto px-3 py-3" data-todo-scroll>
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
    // A todo link asks for just that todo (id lookup); a list link reads the list.
    const got = host.id
      ? rpc.call("todo", { id: host.id, path: host.path || undefined }).then((r: any) => ({ title: r.title, items: r.item ? [r.item] : [] }) as unknown as List)
      : rpc.call("list", { path: host.path }).then((l) => l as List);
    got.then((l) => { setList(l); setFailed(false); }, () => setFailed(true));
  }, [rpc, host.path, host.id]);
  useEffect(refetch, [refetch]);
  useRealtime(CHANGED, refetch);

  const item = host.id ? list?.items.find((i) => i.id === host.id) ?? null : null;
  const isList = !host.id;
  const name = item?.text ?? (isList ? list?.title : null) ?? host.label;
  // The pill shows a word or two; the full name, its list and the rest live in the expanded view.
  const short = String(name ?? "").split(/[:,(—]/)[0].trim().split(/\s+/).slice(0, 2).join(" ");
  const tone = item ? (item.done ? "done" : item.blue ? "blue" : "open") : "open";
  const bg = tone === "blue" ? "bg-sky-500/20" : "bg-muted/70";
  const live = item ? whoOf(item) : null;
  const f = item?.fields ?? {};
  const crumb = list && !isList ? list.title : "";
  const openItems = isList ? (list?.items.filter((i) => !i.done) ?? []) : [];
  const meta: [string, string][] = item?.done ? [["Done", f.done ?? "yes"]] : [];
  const extra = Object.entries(f).filter(([k]) => !["owner", "by", "doing", "role", "thread", "claimed", "done", "blue", "list"].includes(k));
  const link = "text-sky-600 hover:underline dark:text-sky-400";

  return (
    <span className={`max-w-full align-baseline ${open ? "block" : "inline-block"}`}>
      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); }}
        title={failed ? "Couldn't load this todo; click for the link" : `${name}${isList ? ` · ${openItems.length} open` : crumb ? ` · in ${crumb}` : ""}`}
        className={`inline-flex max-w-full cursor-pointer items-center gap-1 rounded-full px-1.5 py-px align-baseline text-[0.8em] leading-tight ${bg} ${tone === "done" ? "text-muted-foreground" : ""}`}>
        {isList ? <Icon name="Folder" className="size-3 flex-none" />
          : <span className={`grid size-3 flex-none place-items-center rounded-[3px] border-[1.5px] ${tone === "done" ? "border-foreground bg-foreground text-background" : "border-muted-foreground/60"}`} />}
        <span className={`max-w-[7.5rem] self-baseline truncate whitespace-nowrap text-left ${tone === "done" ? "line-through decoration-muted-foreground/50" : ""}`}>{short}</span>
        {live?.live ? <span className="td-wmk" data-wc={agentOf(live.doing).c}><AgentIcon a={agentOf(live.doing)} /></span> : null}
      </button>
      {open ? (
        <span className="my-1 block space-y-1 border-l-2 border-muted-foreground/30 py-0.5 pl-3 text-sm">
          {failed || (!list) ? <span className="block text-muted-foreground">{failed ? "Couldn't read this todo." : "Loading..."}</span> : null}
          {list ? <span className="block"><span className={`font-medium ${tone === "done" ? "line-through decoration-muted-foreground/50" : ""}`}>{name}</span>{" "}
            <span className="text-xs text-muted-foreground">{isList ? `${openItems.length} open` : crumb ? `in ${crumb}` : ""}</span></span> : null}
          {list && !isList && !item ? <span className="block text-muted-foreground">Not found in this list any more (it may have been reworded or moved).</span> : null}
          {item ? <WhoFull w={whoOf(item)} /> : null}
          {meta.map(([k, v]) => <span key={k} className="flex gap-2"><span className="w-20 flex-none text-muted-foreground">{k}</span><span className="min-w-0 break-words">{v}</span></span>)}
          {item?.notes ? <span className="block whitespace-pre-wrap break-words text-muted-foreground">{item.notes}</span> : null}
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
  const style = document.createElement("style");
  style.textContent = WHO_CSS;
  document.head.appendChild(style);
  app.slots.experimental_tab({
    id: "todo", title: "Todo", icon: "ListTodo", tooltip: "Your todo lists",
    context: { kind: "thread" }, availability: "action", params: { path: "" }, layout: "flush",
    component: TodoTab,
  });
  app.slots.experimental_appOverlay({ id: "blues", component: FloatingBlues });
  app.slots.experimental_appOverlay({ id: "chips", component: TodoChips });
});
