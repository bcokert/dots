// Jobs: sibling sessions titled "<job> · <phase>" in one project, while they aren't archived. Pure, so it can be
// tested without bb.
export const PALETTE = ["#dc2626", "#ea580c", "#d97706", "#16a34a", "#0d9488", "#0891b2", "#2563eb", "#7c3aed", "#c026d3", "#ca8a04", "#64748b"];

export type JobThread = { id: string; projectId: string; displayTitle: string; parentThreadId: string | null; isArchived?: boolean; createdAt?: number; href?: string };
export type Phase = { id: string; n: number; title: string; href?: string };
export type Job = { key: string; name: string; color: string; phases: Phase[] };

const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h; };

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
    const job: Job = { key, name: g.name, color: PALETTE[hash(g.name.toLowerCase()) % PALETTE.length]!, phases };
    for (const p of phases) out.set(p.id, job);
  }
  return out;
};
