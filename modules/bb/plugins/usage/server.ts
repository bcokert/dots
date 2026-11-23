// usage bb-plugin backend: what the Claude plan and the sessions are spending, per machine.
//
// Sources, best first:
//  - Claude Code's own session transcripts (<CLAUDE_CONFIG_DIR or ~/.claude>/projects/*/<session>.jsonl): exact input,
//    output and cache tokens for every API call, with a timestamp and model. Only readable for sessions that run on
//    this server's own machine; read-only, only the usage numbers are taken.
//  - bb's thread events: turn boundaries (turn/started), the prompt of each turn, `thread/tokenUsage/updated` (the
//    fallback for sessions on machines whose transcripts this server can't read) and `provider/rateLimits/updated`
//    (5-hour window status and reset time; it carries no percent).
//  - bb.sdk.system.usageLimits: the plan's used % and extra usage, when the provider can answer it (it can time out).
// Each machine has its own Claude login, so everything is grouped by machine; nothing is one global figure.
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { homedir } from "node:os";
import { join } from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";

const any = z.any();
export const rpcContract = defineRpcContract({
  overview: { input: z.object({ threadId: z.string().min(1).max(64).nullable() }), output: any },
});

const HOUR = 3_600_000;

// --- Tokens ---
export type Tok = { input: number; output: number; cacheRead: number; cacheWrite: number; weighted: number; calls: number };
const zero = (): Tok => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, weighted: 0, calls: 0 });
/** Input-token equivalents at API price ratios (output 5x, cache write 1.25x, cache read 0.1x). A comparison unit, not plan units. */
const weigh = (t: Pick<Tok, "input" | "output" | "cacheRead" | "cacheWrite">) => t.input + 5 * t.output + 1.25 * t.cacheWrite + 0.1 * t.cacheRead;
function add(a: Tok, b: Tok): Tok {
  return { input: a.input + b.input, output: a.output + b.output, cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite, weighted: a.weighted + b.weighted, calls: a.calls + b.calls };
}
type Call = { ts: number; model: string; tok: Tok };

// --- Transcripts ---
const claudeRoot = () => join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "projects");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

let pathIndex = new Map<string, string[]>(); // session id -> transcript files (main + subagents)
let indexedAt = 0;
async function indexTranscripts(): Promise<void> {
  const next = new Map<string, string[]>();
  const root = claudeRoot();
  let dirs: string[] = [];
  try { dirs = await readdir(root); } catch { /* no Claude Code data on this machine */ }
  for (const d of dirs) {
    let files: string[] = [];
    try { files = await readdir(join(root, d)); } catch { continue; }
    for (const f of files) {
      if (f.endsWith(".jsonl")) {
        const id = f.slice(0, -6);
        next.set(id, [join(root, d, f), ...(next.get(id) ?? [])]);
      } else if (/^[0-9a-f-]{36}$/.test(f)) {
        let subs: string[] = [];
        try { subs = await readdir(join(root, d, f, "subagents")); } catch { continue; }
        const list = next.get(f) ?? [];
        for (const s of subs) if (s.endsWith(".jsonl")) list.push(join(root, d, f, "subagents", s));
        next.set(f, list);
      }
    }
  }
  pathIndex = next;
  indexedAt = Date.now();
}
async function transcriptsFor(sessionId: string): Promise<string[]> {
  if (!pathIndex.has(sessionId) && Date.now() - indexedAt > 20_000) await indexTranscripts();
  return pathIndex.get(sessionId) ?? [];
}

const parsed = new Map<string, { sig: string; calls: Call[] }>();
async function readCalls(path: string): Promise<Call[]> {
  let st;
  try { st = await stat(path); } catch { return []; }
  const sig = `${st.mtimeMs}:${st.size}`;
  const hit = parsed.get(path);
  if (hit?.sig === sig) return hit.calls;
  const byMsg = new Map<string, Call>(); // an API message is written once per content block; the last one has the final output count
  let text = "";
  try { text = await readFile(path, "utf8"); } catch { return []; }
  for (const line of text.split("\n")) {
    if (!line.includes('"usage"') || !line.includes('"assistant"')) continue;
    let e: any;
    try { e = JSON.parse(line); } catch { continue; }
    const m = e?.message;
    if (e?.type !== "assistant" || !m?.usage) continue;
    const u = m.usage;
    const tok = { input: num(u.input_tokens), output: num(u.output_tokens), cacheRead: num(u.cache_read_input_tokens), cacheWrite: num(u.cache_creation_input_tokens), weighted: 0, calls: 1 };
    tok.weighted = weigh(tok);
    byMsg.set(String(m.id ?? e.uuid), { ts: Date.parse(e.timestamp) || 0, model: String(m.model ?? ""), tok });
  }
  const calls = [...byMsg.values()].sort((a, b) => a.ts - b.ts);
  parsed.set(path, { sig, calls });
  return calls;
}
async function callsFor(sessionIds: string[]): Promise<Call[]> {
  const out: Call[] = [];
  for (const id of sessionIds) for (const p of await transcriptsFor(id)) out.push(...(await readCalls(p)));
  return out.sort((a, b) => a.ts - b.ts);
}

// --- Plugin ---
type Thread = { id: string; title: string; parentThreadId: string | null; environmentId: string | null; status: string; updatedAt: number; createdAt: number; providerId: string };
type Window = { key: string; label: string; status: string; resetsAtMs: number | null; usedPercent: number | null };

export default async function plugin(bb: BbPluginApi) {
  const sdk = () => bb.sdk;
  const titleOf = (t: any): string => String(t.title || t.titleFallback || t.id);
  const toThread = (t: any): Thread => ({ id: t.id, title: titleOf(t), parentThreadId: t.parentThreadId ?? null, environmentId: t.environmentId ?? null, status: t.status, updatedAt: t.updatedAt, createdAt: t.createdAt, providerId: t.providerId });

  // Which machine a thread runs on (environment -> host), cached.
  const hostOfEnv = new Map<string, { hostId: string; name: string }>();
  async function machineOf(t: Thread): Promise<{ hostId: string; name: string }> {
    if (!t.environmentId) return { hostId: "unknown", name: "No machine yet" };
    const hit = hostOfEnv.get(t.environmentId);
    if (hit) return hit;
    try {
      const env: any = await sdk().environments.get({ environmentId: t.environmentId });
      const host: any = await sdk().hosts.get({ hostId: env.hostId });
      const v = { hostId: String(env.hostId), name: String(host.name || env.hostId) };
      hostOfEnv.set(t.environmentId, v);
      return v;
    } catch { return { hostId: "unknown", name: "Unknown machine" }; }
  }

  // Per-thread facts from bb's event log, cached by the thread's newest event time (updatedAt).
  type Facts = { sessions: string[]; turns: { id: string; at: number; prompt: string; initiator: string }[]; eventUsage: Tok | null; rate: any | null; stamp: number };
  const facts = new Map<string, Facts>();
  async function factsOf(t: Thread): Promise<Facts> {
    const hit = facts.get(t.id);
    if (hit && hit.stamp === t.updatedAt) return hit;
    const types = ["thread/identity", "turn/started", "client/turn/requested", "turn/input/accepted", "thread/tokenUsage/updated", "provider/rateLimits/updated"] as const;
    const events: any[] = [];
    // One pass in pages of 100 over only the event types we need.
    let after = "0";
    for (let page = 0; page < 200; page++) {
      const rows: any[] = await sdk().threads.events.list({ threadId: t.id, types: types as any, afterSeq: after, limit: "100", order: "asc" });
      events.push(...rows);
      if (rows.length < 100) break;
      after = String(rows[rows.length - 1].seq);
    }
    const sessions = new Set<string>();
    const requested = new Map<string, { prompt: string; initiator: string }>();
    const turns = new Map<string, { id: string; at: number; prompt: string; initiator: string }>();
    let eventUsage: Tok | null = null;
    let rate: any = null;
    for (const e of events) {
      const d = e.data ?? {};
      if (d.providerThreadId) sessions.add(String(d.providerThreadId));
      if (e.type === "client/turn/requested") {
        const text = (d.input ?? []).find((c: any) => c?.type === "text")?.text ?? "";
        requested.set(d.requestId, { prompt: String(text).replace(/^\[bb message from [^\]]*\]\s*/i, "").replace(/[#*`>]+/g, "").replace(/\s+/g, " ").trim().slice(0, 140), initiator: String(d.initiator ?? "user") });
      } else if (e.type === "turn/started") {
        const id = e.scope?.turnId;
        if (id && !turns.has(id)) turns.set(id, { id, at: e.createdAt, prompt: "", initiator: "user" });
      } else if (e.type === "turn/input/accepted") {
        const tr = turns.get(e.scope?.turnId);
        const req = requested.get(d.clientRequestId);
        if (tr && req && !tr.prompt) { tr.prompt = req.prompt; tr.initiator = req.initiator; }
      } else if (e.type === "thread/tokenUsage/updated") {
        const tot = d.tokenUsage?.total ?? {};
        const tok = { input: num(tot.inputTokens), output: num(tot.outputTokens), cacheRead: num(tot.cacheReadInputTokens), cacheWrite: num(tot.cacheWriteInputTokens), weighted: 0, calls: 0 };
        tok.weighted = weigh(tok);
        eventUsage = tok;
      } else if (e.type === "provider/rateLimits/updated") {
        rate = { ...d.rateLimits, at: e.createdAt };
      }
    }
    const f: Facts = { sessions: [...sessions], turns: [...turns.values()].sort((a, b) => a.at - b.at), eventUsage, rate, stamp: t.updatedAt };
    facts.set(t.id, f);
    return f;
  }

  // The plan's used % per machine (each machine has its own login), when its provider can say. Cached, and it never
  // blocks the panel: a slow or failed answer just leaves the % empty until the next try.
  const limits = new Map<string, { at: number; usage: any | null; busy: boolean }>();
  function limitsFor(hostId: string): any | null {
    const e = limits.get(hostId) ?? { at: 0, usage: null, busy: false };
    limits.set(hostId, e);
    if (!e.busy && Date.now() - e.at > 60_000) {
      e.busy = true;
      Promise.race([sdk().system.usageLimits({ hostId, providerId: "claude-code", refresh: "false" } as any), new Promise((_, rej) => setTimeout(() => rej(new Error("timed out")), 20_000))])
        .then((d: any) => { e.usage = d?.["claude-code"]?.status === "ok" ? d["claude-code"] : null; })
        .catch(() => { /* keep the last good answer */ })
        .finally(() => { e.at = Date.now(); e.busy = false; });
    }
    return e.usage;
  }

  // Everything one lead owns: the root thread and all its descendants.
  async function familyOf(threadId: string): Promise<{ root: Thread; members: Thread[]; byId: Map<string, Thread> }> {
    let cur: any = await sdk().threads.get({ threadId });
    for (let i = 0; i < 20 && cur.parentThreadId; i++) cur = await sdk().threads.get({ threadId: cur.parentThreadId });
    const root = toThread(cur);
    const desc: any = await sdk().threads.experimental_listDescendants({ threadIds: [root.id], includeArchived: true, includeHidden: true });
    const ids: string[] = desc.threads?.find((x: any) => x.threadId === root.id)?.descendantIds ?? [];
    const members: Thread[] = [root];
    for (let i = 0; i < ids.length; i += 200) {
      const res: any = await sdk().threads.list({ threadIds: ids.slice(i, i + 200), includeArchived: true, includeHidden: true, limit: 200 } as any);
      members.push(...(res.threads ?? res.items ?? res).map(toThread));
    }
    return { root, members, byId: new Map(members.map((m) => [m.id, m])) };
  }

  async function totalsOf(t: Thread, since = 0): Promise<{ tok: Tok; source: "transcript" | "events" | "none"; calls: Call[] }> {
    const f = await factsOf(t);
    const calls = (await callsFor(f.sessions)).filter((c) => c.ts >= since);
    if (calls.length) return { tok: calls.reduce((a, c) => add(a, c.tok), zero()), source: "transcript", calls };
    if (f.eventUsage && since === 0) return { tok: f.eventUsage, source: "events", calls: [] };
    return { tok: zero(), source: "none", calls: [] };
  }

  bb.rpc.register(rpcContract, {
    async overview({ threadId }) {
      const now = Date.now();

      // Recent sessions, grouped by machine.
      const list: any = await sdk().threads.list({ limit: 80, includeHidden: true, includeArchived: false } as any);
      const recent: Thread[] = (list.threads ?? list.items ?? list).map(toThread).filter((t: Thread) => now - t.updatedAt < 7 * 24 * HOUR);
      const byId = new Map(recent.map((t) => [t.id, t]));
      const rootOf = (t: Thread): Thread => { let c = t; for (let i = 0; i < 20 && c.parentThreadId && byId.has(c.parentThreadId); i++) c = byId.get(c.parentThreadId)!; return c; };

      type M = { hostId: string; name: string; rate: any | null; threads: Thread[] };
      const machines = new Map<string, M>();
      for (const t of recent) {
        const m = await machineOf(t);
        const e = machines.get(m.hostId) ?? { hostId: m.hostId, name: m.name, rate: null, threads: [] };
        e.threads.push(t);
        const r = (await factsOf(t)).rate;
        if (r && (!e.rate || r.at > e.rate.at)) e.rate = r;
        machines.set(m.hostId, e);
      }

      const out: any[] = [];
      for (const m of machines.values()) {
        const five = m.rate?.windows?.find((w: any) => w.providerKey === "five_hour");
        const resetsAtMs: number | null = five?.resetsAtMs ?? null;
        const windowStart = resetsAtMs && resetsAtMs > now ? resetsAtMs - 5 * HOUR : now - 5 * HOUR;
        const leads = new Map<string, { id: string; title: string; tok: Tok; sessions: number }>();
        let total = zero();
        let counted = false;
        for (const t of m.threads) {
          const { tok, source } = await totalsOf(t, windowStart);
          if (source !== "transcript") continue;
          counted = true;
          total = add(total, tok);
          const root = rootOf(t);
          const l = leads.get(root.id) ?? { id: root.id, title: root.title, tok: zero(), sessions: 0 };
          l.tok = add(l.tok, tok); l.sessions += 1;
          leads.set(root.id, l);
        }
        const windows: Window[] = (m.rate?.windows ?? []).map((w: any) => ({ key: String(w.providerKey ?? w.label), label: String(w.label ?? w.providerKey), status: String(w.status), resetsAtMs: w.resetsAtMs ?? null, usedPercent: null }));
        const usage = m.hostId === "unknown" ? null : limitsFor(m.hostId);
        let extra: any = null;
        for (const uw of usage?.windows ?? []) {
          const key = uw.kind === "five-hour" ? "five_hour" : uw.kind === "weekly" ? "seven_day" : null;
          if (uw.cost) extra = { usedUsdCents: uw.cost.usedUsdCents, limitUsdCents: uw.cost.limitUsdCents, usedPercent: uw.usedPercent };
          else if (key) {
            const at = uw.resetsAt ? Date.parse(uw.resetsAt) : null;
            const w = windows.find((x) => x.key === key);
            if (w) { w.usedPercent = uw.usedPercent; if (at) w.resetsAtMs = at; }
            else windows.push({ key, label: String(uw.label), status: "allowed", resetsAtMs: at, usedPercent: uw.usedPercent });
          }
        }
        windows.sort((a, b) => (a.key === "five_hour" ? 0 : 1) - (b.key === "five_hour" ? 0 : 1));
        out.push({
          hostId: m.hostId, name: m.name,
          planLabel: usage?.planLabel ?? null, percentKnown: usage !== null,
          windows, extra,
          overage: m.rate ? { status: m.rate.overageStatus ?? null, reason: m.rate.overageReason ?? null } : null,
          status: m.rate?.status ?? null,
          window5h: counted ? { startMs: windowStart, tok: total, leads: [...leads.values()].sort((a, b) => b.tok.weighted - a.tok.weighted).slice(0, 5) } : null,
          activeSessions: m.threads.filter((t) => t.status === "active").length,
        });
      }
      out.sort((a, b) => (b.window5h?.tok.weighted ?? -1) - (a.window5h?.tok.weighted ?? -1));

      // The open thread: its turns, and its lead's family.
      let thread: any = null;
      let lead: any = null;
      if (threadId) {
        const fam = await familyOf(threadId);
        const self = fam.byId.get(threadId) ?? toThread(await sdk().threads.get({ threadId }));
        const m = await machineOf(self);
        const { tok, source, calls } = await totalsOf(self);
        const f = await factsOf(self);
        const turns = f.turns.map((tr, i) => {
          const end = f.turns[i + 1]?.at ?? Infinity;
          const mine = calls.filter((c) => c.ts >= tr.at && c.ts < end);
          const t = mine.reduce((a, c) => add(a, c.tok), zero());
          return { id: tr.id, at: tr.at, prompt: tr.prompt, initiator: tr.initiator, tok: t, model: mine.length ? mine[mine.length - 1].model : null };
        });
        const five = machines.get(m.hostId)?.rate?.windows?.find((w: any) => w.providerKey === "five_hour");
        const start = five?.resetsAtMs && five.resetsAtMs > now ? five.resetsAtMs - 5 * HOUR : now - 5 * HOUR;
        const win = out.find((x) => x.hostId === m.hostId)?.window5h?.tok.weighted ?? 0;
        thread = { id: self.id, title: self.title, machine: m, source, tok, turns: turns.reverse(), windowShare: win ? turns.map((t) => ({ id: t.id, share: t.at + 1 >= start ? t.tok.weighted / win : null })) : [] };

        const rows: any[] = [];
        let ltotal = zero();
        const depth = (t: Thread) => { let d = 0, c = t; while (c.parentThreadId && fam.byId.has(c.parentThreadId) && d < 10) { c = fam.byId.get(c.parentThreadId)!; d++; } return d; };
        for (const t of fam.members) {
          const r = await totalsOf(t);
          ltotal = add(ltotal, r.tok);
          rows.push({ id: t.id, title: t.title, status: t.status, depth: depth(t), role: t.id === fam.root.id ? "lead" : "child", machine: (await machineOf(t)).name, source: r.source, tok: r.tok, current: t.id === threadId });
        }
        rows.sort((a, b) => b.tok.weighted - a.tok.weighted);
        lead = { id: fam.root.id, title: fam.root.title, tok: ltotal, rows };
      }
      return { now, machines: out, thread, lead };
    },
  });
}
