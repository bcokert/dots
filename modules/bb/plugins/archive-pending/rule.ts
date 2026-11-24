// The one rule for "is this session waiting to be archived", shared by the server (status) and the app (row mark).
// State, not events: marked means { pending: true, at } is set AND `at` is later than the session's most recent
// user message (the start of its latest turn) AND the session isn't archived. Nothing has to clear anything, so
// event order, duplicates and delays can't lose or resurrect a mark.
export type Meta = { pending?: unknown; at?: unknown } | null | undefined;

export function isPending(meta: Meta, lastPromptAt: number, archived: boolean): boolean {
  if (archived || meta?.pending !== true || typeof meta.at !== "string") return false;
  const at = Date.parse(meta.at);
  return Number.isFinite(at) && at > lastPromptAt;
}

// Time of the session's latest user message, from its timeline rows (order-agnostic; 0 when there is none, which
// leaves a mark standing: failing open beats hiding a real one).
export const latestUserAt = (rows: ReadonlyArray<{ kind?: string; role?: string; createdAt?: number }>): number =>
  rows.reduce((m, r) => (r.kind === "conversation" && r.role === "user" && typeof r.createdAt === "number" ? Math.max(m, r.createdAt) : m), 0);
