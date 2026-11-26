// Jobs: sibling sessions titled "<job> · <phase>" in one project, while they aren't archived. Pure, so it can be
// tested without bb.
// A job's colour is a Clarity accent (they mean nothing, which is the point; red stays for attention). CSS values,
// with the old hex as the fallback under another bb theme.
export const PALETTE = [["teal", "#0d9488"], ["cyan", "#0891b2"], ["blue", "#2563eb"], ["violet", "#7c3aed"], ["magenta", "#c026d3"], ["gold", "#ca8a04"], ["slate", "#64748b"]]
  .map(([k, hex]) => `var(--cl-accent-${k}, ${hex})`);

export type JobThread = { id: string; projectId: string; displayTitle: string; parentThreadId: string | null; isArchived?: boolean; createdAt?: number; href?: string };
export type Phase = { id: string; n: number; title: string; href?: string };
export type Job = { key: string; name: string; color: string; phases: Phase[] };

const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h; };

/** A job's colour from its name (also used for a lone "phase N", so it keeps its colour when siblings are archived). */
export const colorFor = (name: string) => PALETTE[hash(name.toLowerCase()) % PALETTE.length]!;

/** Thread id -> its job. Needs >= 2 live top-level sessions in the same project sharing the text before " · ". */
export const jobsOf = (threads: readonly JobThread[]): Map<string, Job> => {
  const groups = new Map<string, { name: string; list: { t: JobThread; rest: string }[] }>();
  for (const t of threads) {
    if (t.isArchived || t.parentThreadId) continue;
    const i = t.displayTitle.indexOf(" · ");
    const name = i > 0 ? t.displayTitle.slice(0, i).trim() : "";
    if (!name) continue;
    const key = `${t.projectId}\u0000${name.toLowerCase()}`;
    const g = groups.get(key) ?? { name, list: [] };
    g.list.push({ t, rest: t.displayTitle.slice(i + 3).trim() });
    groups.set(key, g);
  }
  const out = new Map<string, Job>();
  for (const [key, g] of groups) {
    if (g.list.length < 2) continue;
    g.list.sort((a, b) => (a.t.createdAt ?? 0) - (b.t.createdAt ?? 0));
    const phases = g.list.map(({ t, rest }, idx): Phase => {
      const m = rest.match(/^phase\s+(\d+)\b/i);
      return { id: t.id, n: m ? Number(m[1]) : idx + 1, title: rest || t.displayTitle, href: t.href };
    });
    phases.sort((a, b) => a.n - b.n);
    const job: Job = { key, name: g.name, color: colorFor(g.name), phases };
    for (const p of phases) out.set(p.id, job);
  }
  return out;
};

/** "Chief of Staff · phase 3" -> { name: "Chief of Staff", n: 3 }. Anything else (no " · phase N" suffix) -> null. */
export const phasedTitle = (title: string): { name: string; n: number } | null => {
  const m = title.match(/^(.+?)\s+·\s+phase\s+(\d+)\s*$/i);
  return m && m[1]!.trim() ? { name: m[1]!.trim(), n: Number(m[2]) } : null;
};
