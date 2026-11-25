// Session list structure, derived from state: who spawned whom, which group a session is in, in what order the rows go,
// how deep they nest, and which phase pips to draw. Pure, so it can be tested without bb (derive.test.mjs).
export type Meta = { group?: string; spawnedBy?: string; priority?: "urgent" | "blocking"; reason?: string };
export type Thr = { id: string; projectId: string; parentThreadId: string | null; isArchived?: boolean; createdAt?: number };
export type Ctx = {
  thread: (id: string) => Thr | undefined;
  meta: (id: string) => Meta | undefined;
  /** Ids of the sessions in the same job as `id` (including itself), in phase order; [] when it isn't in a job. */
  jobMates: (id: string) => string[];
};

export const HEALTH = "health";
const clean = (s: unknown) => (typeof s === "string" && s.trim() ? s.trim() : null);
export const isHealth = (g: string | null | undefined) => !!g && g.toLowerCase() === HEALTH;

/** The session that spawned `id`: bb's own parent if it has one, else the tagged spawner. */
export const spawnerOf = (id: string, ctx: Ctx): string | null => {
  const t = ctx.thread(id);
  return t?.parentThreadId || clean(ctx.meta(id)?.spawnedBy) || null;
};

/** Its tagged group, else its spawner's (up the chain), else its job's (any phase with a group), else none. */
export const groupOf = (id: string, ctx: Ctx): string | null => {
  const seen = new Set<string>();
  for (let cur: string | null = id; cur && !seen.has(cur); cur = spawnerOf(cur, ctx)) {
    seen.add(cur);
    const g = clean(ctx.meta(cur)?.group);
    if (g) return g;
  }
  for (const m of ctx.jobMates(id)) {
    const g = clean(ctx.meta(m)?.group);
    if (g) return g;
  }
  return null;
};

export type Placed = {
  order: number; depth: number; group: string | null; header: string | null; spawner: string | null;
  /** Header rows only: the family's root group (colours the label) and the dash count (0 for a root, else 1-based spawn position). */
  family: string | null; dashes: number;
};

export type Family = { root: string; dashes: number; start: number };
/**
 * Group families. A group's parent is the group of the spawner of its earliest session, when that is a different, shown
 * group; otherwise it is a root. Health is always a root with no family. A family is the root plus every group below it,
 * flattened: descendants are numbered 1.. by first-session start time. `start` is the group's own first-session time.
 * Keys are lower-cased group names; `names` maps them back.
 */
export const families = (ids: readonly string[], group: ReadonlyMap<string, string | null>, ctx: Ctx): Map<string, Family> => {
  const key = (g: string) => g.toLowerCase();
  const first = new Map<string, { id: string; t: number; i: number }>(); // earliest session per group
  ids.forEach((id, i) => {
    const g = group.get(id); if (!g) return;
    const t = ctx.thread(id)?.createdAt ?? Infinity;
    const cur = first.get(key(g));
    if (!cur || t < cur.t) first.set(key(g), { id, t, i });
  });
  const parent = new Map<string, string | null>();
  for (const [k, f] of first) {
    const sp = spawnerOf(f.id, ctx);
    const sg = sp ? (ids.includes(sp) ? group.get(sp) : groupOf(sp, ctx)) : null;
    const pk = sg ? key(sg) : null;
    parent.set(k, !pk || pk === k || !first.has(pk) || isHealth(k) || isHealth(pk) ? null : pk);
  }
  const rootOf = (k: string): string => {
    const seen = new Set<string>();
    let cur = k;
    for (let p = parent.get(cur); p && !seen.has(cur); p = parent.get(cur)) { seen.add(cur); cur = p; }
    return cur;
  };
  // break cycles: members of a cycle all become descendants of the member that started first
  for (const k of first.keys()) {
    const seen: string[] = [];
    for (let c: string | null | undefined = k; c && !seen.includes(c); c = parent.get(c)) seen.push(c);
    const c = parent.get(seen[seen.length - 1]);
    if (c && seen.includes(c)) {
      const loop = seen.slice(seen.indexOf(c));
      const head = loop.reduce((a, b) => (first.get(b)!.t < first.get(a)!.t || (first.get(b)!.t === first.get(a)!.t && first.get(b)!.i < first.get(a)!.i) ? b : a));
      parent.set(head, null);
    }
  }
  const members = new Map<string, string[]>();
  for (const k of first.keys()) { const r = rootOf(k); members.set(r, [...(members.get(r) ?? []), k]); }
  const out = new Map<string, Family>();
  for (const [r, ks] of members) {
    const kids = ks.filter((k) => k !== r).sort((a, b) => first.get(a)!.t - first.get(b)!.t || first.get(a)!.i - first.get(b)!.i);
    out.set(r, { root: r, dashes: 0, start: first.get(r)!.t });
    kids.forEach((k, n) => out.set(k, { root: r, dashes: n + 1, start: first.get(k)!.t }));
  }
  return out;
};

/**
 * Where each visible row of one project's list goes. `ids` are the rows in bb's own order. Health first, then other
 * groups in order of first appearance, then everything else. Every group gets a header, even with one row. A spawned
 * row sits right under its spawner, one step deeper.
 */
export const layout = (ids: readonly string[], ctx: Ctx): Map<string, Placed> => {
  const visible = new Set(ids);
  const raw = new Map(ids.map((id) => [id, groupOf(id, ctx)]));
  const group = new Map(ids.map((id) => [id, raw.get(id) ?? null]));
  const rank = new Map<string, number>(); // lower-cased group -> position
  const names = new Map<string, string>();
  const first = new Map<string, number>();
  ids.forEach((id, i) => { const g = group.get(id); if (g && !names.has(g.toLowerCase())) { names.set(g.toLowerCase(), g); first.set(g.toLowerCase(), i); } });
  const fam = families(ids, group, ctx);
  // Health first; then families by their root's start (oldest first), each root followed by its descendants in spawn order.
  const keys = [...names.keys()].filter((k) => !isHealth(k)).sort((a, b) => {
    const fa = fam.get(a)!, fb = fam.get(b)!;
    return fam.get(fa.root)!.start - fam.get(fb.root)!.start || (first.get(fa.root)! - first.get(fb.root)!) || (fa.dashes - fb.dashes);
  });
  for (const k of names.keys()) if (isHealth(k)) rank.set(k, -1);
  keys.forEach((k, i) => rank.set(k, i));
  const parent = (id: string) => {
    const s = spawnerOf(id, ctx);
    return s && s !== id && visible.has(s) && (group.get(s)?.toLowerCase() ?? "") === (group.get(id)?.toLowerCase() ?? "") ? s : null;
  };
  const out = new Map<string, Placed>();
  const kids = new Map<string, string[]>();
  for (const id of ids) { const p = parent(id); if (p) kids.set(p, [...(kids.get(p) ?? []), id]); }
  const lastRank = rank.size;
  const walk = (id: string, depth: number, base: number, state: { n: number }, trail: Set<string>) => {
    if (out.has(id) || trail.has(id)) return;
    trail.add(id);
    const g = group.get(id) ?? null;
    out.set(id, { order: base + state.n++, depth, group: g, header: null, spawner: spawnerOf(id, ctx), family: null, dashes: 0 });
    for (const k of kids.get(id) ?? []) walk(k, Math.min(depth + 1, 4), base, state, trail);
  };
  const cursor = new Map<string, { n: number }>();
  for (const id of ids) {
    if (parent(id)) continue;
    const g = group.get(id);
    const r = g ? rank.get(g.toLowerCase())! : lastRank;
    const key = g ? g.toLowerCase() : "";
    const state = cursor.get(key) ?? { n: 0 };
    cursor.set(key, state);
    // each group owns a block of 10000 order slots; the ungrouped block is last
    walk(id, 0, (r + 2) * 10000 + (state.n > 0 ? 0 : 0), state, new Set());
  }
  for (const id of ids) if (!out.has(id)) out.set(id, { order: (lastRank + 2) * 10000 + ids.indexOf(id), depth: 0, group: group.get(id) ?? null, header: null, spawner: spawnerOf(id, ctx), family: null, dashes: 0 });
  // header on the first row of each shown group
  const firstRow = new Map<string, string>();
  for (const [id, p] of [...out].sort((a, b) => a[1].order - b[1].order)) if (p.group && !firstRow.has(p.group.toLowerCase())) firstRow.set(p.group.toLowerCase(), id);
  for (const [k, id] of firstRow) {
    const p = out.get(id)!, f = fam.get(k);
    p.header = names.get(k) ?? k;
    p.family = f ? (names.get(f.root) ?? f.root) : p.header;
    p.dashes = f?.dashes ?? 0;
  }
  return out;
};

export type Pip = "done" | "now" | "next";
/** One pip per phase of the job: earlier phases done, this one now, later ones next. A lone "phase N" draws N pips. */
export const pipsFor = (phaseNumbers: readonly number[] | null, n: number): Pip[] => {
  const all = phaseNumbers && phaseNumbers.length ? [...phaseNumbers].sort((a, b) => a - b) : Array.from({ length: n }, (_, i) => i + 1);
  return all.slice(0, 12).map((p) => (p < n ? "done" : p === n ? "now" : "next"));
};

export type Claim = { thread?: string | null; text?: string | null };
const RUNNING = new Set(["active", "starting", "pending"]);
/**
 * Idle sessions (not archived, not running) that still hold todo claims: thread id -> the claimed todos' texts. A
 * session that stopped while holding a claim is parked, waiting on Bdon; one with no claims is just abandoned.
 */
export const waitingOn = (threads: readonly { id: string; isArchived?: boolean; status?: string }[], claims: readonly Claim[]): Map<string, string[]> => {
  const by = new Map<string, string[]>();
  for (const c of claims) {
    if (typeof c?.thread !== "string" || !c.thread) continue;
    by.set(c.thread, [...(by.get(c.thread) ?? []), (typeof c.text === "string" ? c.text.trim() : "") || "(untitled todo)"]);
  }
  const out = new Map<string, string[]>();
  for (const t of threads) {
    const texts = by.get(t.id);
    if (texts && !t.isArchived && !RUNNING.has(t.status ?? "")) out.set(t.id, texts);
  }
  return out;
};

/** Tooltip: one line per claimed todo, at most `max`, then "+N more". */
export const waitingTip = (texts: readonly string[], max = 5): string =>
  `Waiting on Bdon: ${texts.slice(0, max).join("\n")}${texts.length > max ? `\n+${texts.length - max} more` : ""}`;
