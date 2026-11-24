// Session list structure, derived from state: who spawned whom, which group a session is in, in what order the rows go,
// how deep they nest, and which phase pips to draw. Pure, so it can be tested without bb (derive.test.mjs).
export type Meta = { group?: string; spawnedBy?: string; priority?: "urgent" | "blocking"; reason?: string };
export type Thr = { id: string; projectId: string; parentThreadId: string | null; isArchived?: boolean };
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

export type Placed = { order: number; depth: number; group: string | null; header: string | null; spawner: string | null };

/**
 * Where each visible row of one project's list goes. `ids` are the rows in bb's own order. Health first, then other
 * groups in order of first appearance, then everything else. A group with 2+ rows gets a header (Health always); a
 * lone grouped session is just listed with the ungrouped. A spawned row sits right under its spawner, one step deeper.
 */
export const layout = (ids: readonly string[], ctx: Ctx): Map<string, Placed> => {
  const visible = new Set(ids);
  const raw = new Map(ids.map((id) => [id, groupOf(id, ctx)]));
  const count = new Map<string, number>();
  for (const g of raw.values()) if (g) count.set(g.toLowerCase(), (count.get(g.toLowerCase()) ?? 0) + 1);
  const shown = (g: string | null) => (g && (isHealth(g) || (count.get(g.toLowerCase()) ?? 0) >= 2) ? g : null);
  const group = new Map(ids.map((id) => [id, shown(raw.get(id) ?? null)]));
  const rank = new Map<string, number>(); // lower-cased group -> position
  const names = new Map<string, string>();
  for (const id of ids) {
    const g = group.get(id);
    if (g && !rank.has(g.toLowerCase())) { names.set(g.toLowerCase(), g); rank.set(g.toLowerCase(), isHealth(g) ? -1 : rank.size); }
  }
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
    out.set(id, { order: base + state.n++, depth, group: g, header: null, spawner: spawnerOf(id, ctx) });
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
  for (const id of ids) if (!out.has(id)) out.set(id, { order: (lastRank + 2) * 10000 + ids.indexOf(id), depth: 0, group: group.get(id) ?? null, header: null, spawner: spawnerOf(id, ctx) });
  // header on the first row of each shown group
  const first = new Map<string, string>();
  for (const [id, p] of [...out].sort((a, b) => a[1].order - b[1].order)) if (p.group && !first.has(p.group.toLowerCase())) first.set(p.group.toLowerCase(), id);
  for (const [k, id] of first) out.get(id)!.header = names.get(k) ?? k;
  return out;
};

export type Pip = "done" | "now" | "next";
/** One pip per phase of the job: earlier phases done, this one now, later ones next. A lone "phase N" draws N pips. */
export const pipsFor = (phaseNumbers: readonly number[] | null, n: number): Pip[] => {
  const all = phaseNumbers && phaseNumbers.length ? [...phaseNumbers].sort((a, b) => a - b) : Array.from({ length: n }, (_, i) => i + 1);
  return all.slice(0, 12).map((p) => (p < n ? "done" : p === n ? "now" : "next"));
};
