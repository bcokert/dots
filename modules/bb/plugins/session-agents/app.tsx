// session-agents: makes bb say which agent each session runs on, and labels the session list.
//   - Each session's provider icon (e.g. the Claude mark) becomes its agent's: a house for a machine with your
//     own login, a briefcase for a work machine (name matching the workMachines setting). Host agents (name
//     matching hostMachines, e.g. "Claude Personal Host": they run directly on a computer and can see all of it)
//     get a solid terminal badge in the same colour instead, so they stand out from the pods. It's looked up from
//     the thread's environment's machine, in the sidebar and in the phone's "Recent" list. Claire (a machine
//     matching claireMachines) gets her own: a HUD ring, a segmented ring around a solid core.
//   - The session list header reads "Sessions · <label>" instead of "Threads"; "New thread" reads "New session".
//   - Projects stay in most-recently-used order: the project with the newest session moves to the top.
//   - A session's top bar starts with where it runs: server label, agent icon, project, then the title. Tap any of
//     them for a card with the full names.
//   - Subagents (Claude Code Agent-tool delegations) of a running session show briefly: a pip beside its title per
//     subagent of the latest turn (pulsing while running, green done, red failed; fading out after the turn ends),
//     and a small dim indented row per running one with a cog icon, its description and model. They are
//     read from the thread's timeline every ~4 s, only for threads that are running; not clickable as threads.
//   - Chat turns say which agent wrote them: data-sa-from=<kind> on each timeline row an agent wrote (the session's
//     replies, a spawned session's first prompt, messages from other sessions). The Clarity theme colours them.
// bb has no slot for these, so this decorates bb's own DOM (as its plugin docs recommend for that) from one
// always-mounted component, and undoes everything when the plugin unloads. If bb's markup changes, rows simply
// fall back to the provider's mark.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  definePluginApp,
  experimental_Icon as Icon,
  experimental_useServers,
  experimental_useSidebarThreads,
  useBbContext,
  useRpc,
  useSdk,
  useSettings,
} from "@get-bb/plugin-sdk/app";
import { colorFor, jobsOf, phasedTitle, type Job } from "./jobs";
import { groupOf, isHealth, layout, pipsFor, waitingOn, waitingTip, type Ctx, type Meta } from "./derive";
import type { rpcContract } from "./server";

const svg = (body: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'>${body}</svg>`)}")`;
const HOUSE = svg("<path d='M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z'/>");
const BRIEFCASE = svg("<rect x='2.5' y='7' width='19' height='13.5' rx='1.5'/><path d='M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2'/><path d='M2.5 13h19'/>");
// Solid, unlike the outline house and briefcase, so a Host agent reads differently at 14px: a filled window with a
// ">_" prompt cut out of it.
// Claire, Bdon's chief of staff: a segmented ring around a solid core (Bdon 2026-11-26).
const RING = svg("<path d='M12 2.5a9.5 9.5 0 0 1 8.2 4.7M21.4 12a9.5 9.5 0 0 1-4.7 8.2M12 21.5a9.5 9.5 0 0 1-8.2-4.7M2.6 12a9.5 9.5 0 0 1 4.7-8.2'/><circle cx='12' cy='12' r='4.2' fill='black'/>");
const TERMINAL = svg("<defs><mask id='p'><rect width='24' height='24' fill='white'/><path d='M7 9.5l3 2.5-3 2.5M12.5 15H17' stroke='black'/></mask></defs><rect x='1.5' y='3.5' width='21' height='17' rx='3.5' fill='black' stroke='none' mask='url(#p)'/>");

// Role marks (see .sa-role below): drawn bolder so they read at 10px.
const CROWN = svg("<path d='M3 18h18M4 15 2.5 6.5l5.5 4L12 4l4 6.5 5.5-4L20 15z' fill='black'/>");
const BRANCH = svg("<path d='M5 3v8a5 5 0 0 0 5 5h9' stroke-width='3'/><path d='m15 12 4 4-4 4' stroke-width='3'/>");

// A small cog: a subagent is machinery working for its lead, not an agent of its own.
const COG = svg("<circle cx='12' cy='12' r='3.2' stroke-width='2.6'/><path d='M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1' stroke-width='2.8'/>");

// Health: a pulse line. Priority: a stop octagon (blocking) and a zap (urgent).
const PULSE = svg("<path d='M2 12h4l3-8 5 16 3-8h5'/>");
const OCTAGON = svg("<path d='M8 2.5h8L21.5 8v8L16 21.5H8L2.5 16V8z'/><path d='M12 7.5v5.5M12 16.2v.1' stroke-width='2.8'/>");
// Parked: an hourglass (an idle session still holds todo claims).
const HOURGLASS = svg("<path d='M5 22h14M5 2h14M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2'/>");
// Needs Bdon: his own person icon (a session that an agent started and that now waits on him, not on its spawner).
const PERSON = svg("<circle cx='12' cy='7.5' r='4'/><path d='M4 21c0-4.6 3.6-7.5 8-7.5s8 2.9 8 7.5'/>");
const ZAP = svg("<path d='M13 2.5 4.5 13.5H12l-1 8 8.5-11H12z'/>");

const ACCENTS = ["teal", "cyan", "blue", "violet", "magenta", "gold", "slate"];

const CSS = `
[data-sa-agent] > * { display: none !important; }
[data-sa-agent]::before, [data-sa-header-agent]::before { content: ""; width: 14px; height: 14px; flex: none;
  background-color: var(--sa-agent);
  -webkit-mask: var(--sa-icon) center / contain no-repeat; mask: var(--sa-icon) center / contain no-repeat; }
[data-provider-icon-tint][data-sa-agent]::before { width: 16px; height: 16px; }
[data-sa-agent="personal"], [data-sa-header-agent="personal"] { --sa-agent: var(--cl-agent, var(--muted-foreground, gray)); --sa-icon: ${HOUSE}; }
[data-sa-agent="work"], [data-sa-header-agent="work"] { --sa-agent: var(--cl-agent, var(--muted-foreground, gray)); --sa-icon: ${BRIEFCASE}; }
[data-sa-agent="personal-host"], [data-sa-header-agent="personal-host"] { --sa-agent: var(--cl-agent, var(--muted-foreground, gray)); --sa-icon: ${TERMINAL}; }
[data-sa-agent="work-host"], [data-sa-header-agent="work-host"] { --sa-agent: var(--cl-agent, var(--muted-foreground, gray)); --sa-icon: ${TERMINAL}; }
[data-sa-agent="claire"], [data-sa-header-agent="claire"] { --sa-agent: var(--cl-agent, var(--muted-foreground, gray)); --sa-icon: ${RING}; }
[data-sa-header-agent] { display: inline-flex; }
/* Role mark, bottom-right of the agent icon: a crown is a lead (owns the job), a branch arrow is a worker (a lead's
   child session). Icons, not dots: filled/hollow dots read as online/offline. */
[data-sa-agent] { position: relative; }
[data-sa-role]::after, .sa-role { content: ""; width: 10px; height: 10px; flex: none; background-color: var(--sa-agent, currentColor);
  -webkit-mask: var(--sa-role-icon) center / contain no-repeat; mask: var(--sa-role-icon) center / contain no-repeat; }
[data-sa-role]::after { position: absolute; right: -5px; bottom: -4px; }
[data-sa-role="lead"], .sa-role[data-r="lead"] { --sa-role-icon: ${CROWN}; }
[data-sa-role="worker"], .sa-role[data-r="worker"] { --sa-role-icon: ${BRANCH}; }
.sa-role { display: inline-block; width: 12px; height: 12px; background-color: var(--cl-agent, currentColor); }
/* Phones: drop the separators so the session title keeps more room. */
@media (max-width: 480px) { [data-sa-header] .sa-sep { display: none; } [data-sa-header] .sa-project { max-width: 5.5rem; } }
.sa-server { color: var(--sa-server); }
.sa-label { margin-left: 6px; font-weight: 500; color: var(--sa-label); }
.sa-label::before { content: "· "; color: var(--muted-foreground, currentColor); font-weight: 400; }
/* Subagents: pips beside the title, and dim indented rows under it while they run. The cog icon (not a dot: dots
   read as online/offline) is in the lead agent's colour; the whole block says "working for the lead". */
.sa-subs[data-k="personal"], .sa-pips[data-k="personal"] { --sa-agent: var(--cl-agent, var(--muted-foreground, gray)); }
.sa-subs[data-k="work"], .sa-pips[data-k="work"] { --sa-agent: var(--cl-agent, var(--muted-foreground, gray)); }
.sa-subs[data-k="personal-host"], .sa-pips[data-k="personal-host"] { --sa-agent: var(--cl-agent, var(--muted-foreground, gray)); }
.sa-subs[data-k="work-host"], .sa-pips[data-k="work-host"] { --sa-agent: var(--cl-agent, var(--muted-foreground, gray)); }
.sa-subs[data-k="claire"], .sa-pips[data-k="claire"] { --sa-agent: var(--cl-agent, var(--muted-foreground, gray)); }
.sa-pips { display: inline-flex; gap: 3px; align-items: center; margin-left: 6px; flex: none; transition: opacity .6s; }
.sa-pips[data-fading] { opacity: .35; }
.sa-pip { width: 5px; height: 8px; border-radius: var(--cl-radius-sm, 2px); background: var(--cl-unset, var(--muted-foreground, gray)); opacity: .7; }
.sa-pip[data-s="running"] { background: var(--cl-live, var(--primary, gray)); opacity: 1; box-shadow: 0 0 var(--cl-glow-sm, 6px) color-mix(in srgb, var(--cl-live, var(--primary, gray)) 60%, transparent); }
.sa-pip[data-s="done"] { background: var(--cl-good, var(--foreground)); opacity: .9; }
.sa-pip[data-s="error"] { background: var(--cl-attention, var(--destructive, red)); opacity: 1; }
.sa-subs { display: flex; flex-direction: column; margin: 0 0 2px 17px; padding-left: 7px; border-left: 1px solid var(--cl-line, var(--border, rgba(128,128,128,.3))); }
li.sa-subs { margin: -6px 0 6px 25px; list-style: none; }
.sa-sub { display: flex; align-items: center; gap: 5px; min-width: 0; height: 18px; font-size: 11px; line-height: 1; color: var(--muted-foreground, gray); opacity: .85; cursor: default; }
.sa-sub::before { content: ""; width: 11px; height: 11px; flex: none; background-color: var(--sa-agent, currentColor);
  -webkit-mask: ${COG} center / contain no-repeat; mask: ${COG} center / contain no-repeat; }
.sa-sub-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
/* Jobs: phases of one job light up together on hover (flat, no radius); the pips carry the job's colour. */
[data-sa-job][data-sa-hot] { background-color: color-mix(in srgb, var(--sa-job) 14%, transparent) !important; }
/* Phase pips: one small square per phase in the job's colour. Past phases filled, this one open and glowing. */
.sa-phase { display: inline-flex; align-items: center; gap: 3px; margin-left: 6px; flex: none; }
.sa-pp { width: 7px; height: 7px; box-sizing: border-box; border-radius: var(--cl-radius-sm, 2px); border: 1.5px solid var(--sa-job); }
.sa-pp[data-s="done"] { background: var(--sa-job); }
.sa-pp[data-s="now"] { box-shadow: 0 0 var(--cl-glow-sm, 6px) 1px var(--sa-job); }
.sa-pp[data-s="next"] { opacity: .3; }
/* Structure: rows are reordered with CSS order (never moved in the DOM), nested by padding, and a group's first row
   carries its header as ::before. */
[data-sa-section] { display: flex !important; flex-direction: column; }
[data-sa-gh]::before { content: attr(data-sa-gh); display: block; margin: 8px 8px 2px; padding-left: 6px; padding-top: calc(min(var(--sa-n, 0), 1) * 4px); border-left: 2px solid var(--sa-g, gray);
  background: repeating-linear-gradient(90deg, var(--sa-g, gray) 0 4px, transparent 4px 6px) 3px 0 / calc(var(--sa-n, 0) * 6px - 2px) 2px no-repeat;
  font-family: var(--cl-font-display, inherit); font-size: var(--cl-text-11, 11px); line-height: 12px; font-weight: 600; letter-spacing: var(--cl-track-label, .1em); text-transform: uppercase; color: var(--cl-text-subtle, var(--muted-foreground, gray)); }
[data-sa-depth] [data-sidebar-rename-row] { padding-left: calc(8px + var(--sa-depth) * 14px) !important; }
.sa-spawn { flex: none; margin-right: 4px; font-size: 11px; line-height: 1; color: var(--muted-foreground, gray); opacity: .8; cursor: default; pointer-events: auto; }
/* Health: a red pulse in place of the agent icon. */
[data-sa-health] > * { display: none !important; }
[data-sa-health]::before { content: ""; width: 14px; height: 14px; flex: none; background-color: var(--sa-agent);
  -webkit-mask: var(--sa-icon) center / contain no-repeat; mask: var(--sa-icon) center / contain no-repeat; }
[data-provider-icon-tint][data-sa-health]::before { width: 16px; height: 16px; }
[data-sa-health] { --sa-agent: var(--cl-attention, var(--destructive, red)); --sa-icon: ${PULSE}; }
[data-sa-health][data-sa-agent] { --sa-agent: var(--cl-attention, var(--destructive, red)); --sa-icon: ${PULSE}; }
/* Priority: a flat full-width tint and an icon, until archived or cleared. */
[data-sa-prio="blocking"] { --sa-p: var(--cl-attention, var(--destructive, red)); }
[data-sa-prio="urgent"] { --sa-p: var(--cl-wobble, var(--primary, orange)); }
[data-sa-prio] { background-color: color-mix(in srgb, var(--sa-p) 15%, transparent) !important; border-radius: 0 !important; }
.sa-prio { width: 13px; height: 13px; flex: none; margin-left: 6px; align-self: center; pointer-events: auto; background-color: var(--sa-p);
  -webkit-mask: var(--sa-prio-icon) center / contain no-repeat; mask: var(--sa-prio-icon) center / contain no-repeat; }
.sa-wait { width: 13px; height: 13px; flex: none; margin-left: 6px; align-self: center; pointer-events: auto; background-color: var(--muted-foreground, gray);
  -webkit-mask: ${HOURGLASS} center / contain no-repeat; mask: ${HOURGLASS} center / contain no-repeat; }
/* Needs Bdon: a 2px primary edge (no wash at rest: a tint would read as selection), his person icon lit and glowing,
   and the ask on a second line (phones have no hover). Every 3s the row eases up to a light wash and back; the glow
   pulses in step. Off under reduced motion. */
[data-sa-you] { position: relative; height: auto !important; min-height: calc(var(--bb-sidebar-row-height, 28px) + 16px); padding-bottom: 16px; box-sizing: border-box; animation: sa-wait 3s ease-in-out infinite; }
[data-sa-you] .bb-thread-title { color: var(--cl-text-strong, var(--foreground)); font-weight: 500; }
.sa-bar { position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: var(--cl-primary, var(--primary, dodgerblue)); pointer-events: none; }
.sa-ask { position: absolute; right: 8px; bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--cl-text-12, 12px); line-height: 16px;
  color: var(--cl-text-subtle, var(--muted-foreground, gray)); pointer-events: none; }
.sa-ask b { font-weight: 500; color: var(--cl-primary, var(--primary, dodgerblue)); }
.sa-me { width: 14px; height: 14px; flex: none; margin-left: 6px; align-self: center; pointer-events: auto; background-color: var(--cl-primary, var(--primary, dodgerblue));
  filter: drop-shadow(0 0 4px color-mix(in srgb, var(--cl-primary, var(--primary, dodgerblue)) 70%, transparent)); animation: sa-me 3s ease-in-out infinite;
  -webkit-mask: ${PERSON} center / contain no-repeat; mask: ${PERSON} center / contain no-repeat; }
@keyframes sa-wait { 0%, 100% { background-color: transparent; } 50% { background-color: color-mix(in srgb, var(--cl-primary, var(--primary, dodgerblue)) 16%, transparent); } }
@keyframes sa-me { 0%, 100% { filter: drop-shadow(0 0 2px color-mix(in srgb, var(--cl-primary, var(--primary, dodgerblue)) 50%, transparent)); } 50% { filter: drop-shadow(0 0 6px var(--cl-primary, var(--primary, dodgerblue))); } }
/* Tier 1 (get my attention now): twice as often, brighter, and the edge glows. */
[data-sa-you="1"] { animation-name: sa-wait1; animation-duration: 1.5s; }
[data-sa-you="1"] .sa-me { animation-name: sa-me1; animation-duration: 1.5s; }
[data-sa-you="1"] .sa-bar { box-shadow: 0 0 6px var(--cl-primary, var(--primary, dodgerblue)); }
@keyframes sa-wait1 { 0%, 100% { background-color: transparent; } 50% { background-color: color-mix(in srgb, var(--cl-primary, var(--primary, dodgerblue)) 28%, transparent); } }
@keyframes sa-me1 { 0%, 100% { filter: drop-shadow(0 0 6px var(--cl-primary, var(--primary, dodgerblue))); } 50% { filter: drop-shadow(0 0 10px var(--cl-primary, var(--primary, dodgerblue))); } }
@media (prefers-reduced-motion: reduce) { [data-sa-you], [data-sa-you] .sa-me, .sa-me { animation: none; } [data-sa-you="1"] { background-color: color-mix(in srgb, var(--cl-primary, var(--primary, dodgerblue)) 20%, transparent); } }
[data-sa-prio="blocking"] .sa-prio { --sa-prio-icon: ${OCTAGON}; }
[data-sa-prio="urgent"] .sa-prio { --sa-prio-icon: ${ZAP}; }
/* Phased titles show only the job name: the original text is zeroed and the short one is drawn from the attribute, so
   React's text node is never touched and the ellipsis still works. */
[data-sa-short] { font-size: 0 !important; }
[data-sa-short]::before { content: attr(data-sa-short); display: inline-block; max-width: 100%; vertical-align: top; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--sa-fs); line-height: var(--sa-lh); }
.sa-job-link { background: none; border: 0; padding: 0; cursor: pointer; color: inherit; text-align: left; font: inherit; }
.sa-job-link:hover { text-decoration: underline; }
.sa-sub-model { flex: none; opacity: .6; font-size: 10px; }
`;

type Kind = "personal" | "work" | "personal-host" | "work-host" | "claire";
type Agent = { kind: Kind; name: string };

const pattern = (value: unknown, fallback: string) => {
  try { return new RegExp(String(value || fallback), "i"); } catch { return new RegExp(fallback, "i"); }
};
const HOST_DEFAULT = "\\bhost$";
/** A machine name -> its agent kind: Claire's own, else whose login (work or personal) and whether it's a Host agent. */
const kindOf = (name: string, work: RegExp, host: RegExp, claire: RegExp): Kind =>
  claire.test(name) ? "claire" : `${work.test(name) ? "work" : "personal"}${host.test(name) ? "-host" : ""}` as Kind;

/** Role and who started a session. A thread with a parent is a worker (its lead is the parent, maybe in another
 * project); one without is a lead, started by Claire when its machine matches claireMachines, else by Bdon. */
type Role = { role: "lead" | "worker"; by: string; tip: string };
type Thr = { id: string; projectId: string; displayTitle: string; parentThreadId: string | null; status?: string; isArchived?: boolean };
const roleOf = (t: Thr, all: Map<string, Thr>, projects: Map<string, string>, machine: string | null, claire: RegExp): Role => {
  if (t.parentThreadId) {
    const p = all.get(t.parentThreadId);
    const where = p && p.projectId !== t.projectId ? ` (${projects.get(p.projectId) ?? "another project"})` : "";
    const by = p ? `${p.displayTitle}${where}` : "its lead";
    return { role: "worker", by, tip: `Worker · started by its lead: ${by}` };
  }
  const by = machine && claire.test(machine) ? "Claire" : "Bdon";
  return { role: "lead", by, tip: `Lead · started by ${by}` };
};


/** One subagent of a thread's latest turn. */
type Sub = { id: string; name: string; model: string | null; state: "running" | "done" | "error" };
type Row = Record<string, unknown> & { kind?: string; workKind?: string; children?: Row[] };
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
/** A turn's delegation rows (Claude Code Agent-tool calls) as subagents. Only the latest turn counts. */
const subsFromTimeline = (rows: readonly Row[], active: readonly Row[]): Sub[] => {
  const turn = [...rows].reverse().find((r) => r.kind === "turn");
  const flat: Row[] = turn ? (turn.children ?? []) : [...rows];
  // A background agent's delegation row closes at launch; its real state is a "workflow" task row (local_agent)
  // with the same description, here or among bb's active background work.
  const tasks = [...active, ...flat].filter((r) => r.taskType === "local_agent" && (r.kind === "work" || active.includes(r)));
  const out: Sub[] = [];
  for (const r of flat) {
    if (r.kind !== "work" || r.workKind !== "delegation") continue;
    const id = str(r.callId) ?? str(r.id);
    if (!id) continue;
    const pres = r.presentation as { title?: unknown; detail?: unknown } | null | undefined;
    // detail reads like "Explore agent · model sonnet · effort high"
    const model = (str(pres?.detail) ?? "").split("·").map((p) => p.trim()).find((p) => /^model\s+/i.test(p))?.replace(/^model\s+/i, "") ?? null;
    let state: Sub["state"] = r.status === "pending" ? "running" : r.status === "completed" ? "done" : "error";
    if (r.background === true && state === "done") {
      const name = str(r.description);
      const i = tasks.findIndex((t) => str(t.description) === name);
      if (i >= 0) {
        const t = tasks.splice(i, 1)[0]!;
        state = t.taskStatus === "failed" ? "error" : t.taskStatus === "completed" ? "done" : "running";
      }
    }
    out.push({ id, name: str(r.description) ?? str(pres?.title) ?? "Subagent", model, state });
  }
  return out;
};

function SessionAgents() {
  const sdk = useSdk();
  const { values } = useSettings();
  const { threads, projects } = experimental_useSidebarThreads();
  const roles = useRef(new Map<string, Thr>());
  const projectNames = useRef(new Map<string, string>());
  const bump = useRef<() => void>(() => undefined);
  const jobs = useRef(new Map<string, Job>());
  const metas = useRef(new Map<string, Meta>());
  const rpc = useRpc<typeof rpcContract>();
  const claims = useRef<{ thread?: string | null; text?: string | null }[]>([]);
  // Open todo claims (from the todo app, via the plugin's server), polled: a parked session still holds them.
  useEffect(() => {
    let stopped = false;
    const load = async () => {
      try {
        const res = (await rpc.call("claims", null)) as unknown;
        if (stopped || !Array.isArray(res)) return;
        if (JSON.stringify(res) !== JSON.stringify(claims.current)) { claims.current = res; bump.current(); }
      } catch { /* next tick; marks stay as they were */ }
    };
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => { stopped = true; clearInterval(timer); };
  }, [rpc]);
  const ids = threads.filter((t) => !t.isArchived).map((t) => t.id).sort().join(" ");
  // Tags from `bb session-agents tag` (group, spawner, priority). Polled: there's no event for another session's tag.
  useEffect(() => {
    let stopped = false;
    const load = async () => {
      const list = ids ? ids.split(" ") : [];
      try {
        const res = await sdk.threads.experimental_listPluginMetadata({ threadIds: list });
        if (stopped) return;
        const next = new Map<string, Meta>();
        for (const t of res.threads) if (t.metadata && Object.keys(t.metadata).length) next.set(t.threadId, t.metadata as Meta);
        if (JSON.stringify([...next]) !== JSON.stringify([...metas.current])) { metas.current = next; bump.current(); }
      } catch { /* next tick */ }
    };
    void load();
    const timer = window.setInterval(load, 15_000);
    return () => { stopped = true; clearInterval(timer); };
  }, [sdk, ids]);
  useEffect(() => {
    roles.current = new Map(threads.map((t) => [t.id, t]));
    jobs.current = jobsOf(threads);
    projectNames.current = new Map(projects.map((p) => [p.id, p.name]));
    bump.current();
  }, [threads, projects]);
  const clairePattern = String(values?.claireMachines || "claire");
  const label = String(values?.label ?? "");
  const workPattern = String(values?.workMachines ?? "work");
  const hostPattern = String(values?.hostMachines || HOST_DEFAULT);

  useEffect(() => {
    const work = pattern(workPattern, "work");
    const hostRe = pattern(hostPattern, HOST_DEFAULT);
    const claireRe = pattern(clairePattern, "claire");
    // The domain word is neutral: the word names the domain, and green means done (Bdon 2026-11-26).
    const labelColor = "var(--cl-text-subtle, var(--muted-foreground))";
    const style = document.createElement("style");
    style.dataset.sessionAgents = "";
    style.textContent = CSS + `.sa-label { --sa-label: ${labelColor}; }`;
    document.head.append(style);

    // thread id -> environment id, cached only once its host is known. A new session's environment lands a moment
    // after the thread, so a miss is retried (missedAt) instead of cached, or the row keeps the default icon.
    const threadEnv = new Map<string, string>();
    const missedAt = new Map<string, number>(); // thread id -> when it last had no environment/host yet
    const RETRY_MS = 3_000;
    const envHost = new Map<string, string>(); // environment id -> host id
    let hostNames = new Map<string, string>();
    const pending = new Set<string>();
    let stopped = false;
    let frame = 0;

    // Subagents per thread, from its timeline while it runs. After it stops they stay (pips only) until `until`.
    const SUB_POLL_MS = 4_000;
    const SUB_FADE_MS = 10_000;
    const subs = new Map<string, { list: Sub[]; running: boolean; until: number }>();
    const isRunning = (t: Thr) => !t.isArchived && (t.status === "active" || t.status === "starting" || t.status === "pending");
    let polling = false;
    const pollSubs = async () => {
      if (polling || stopped) return;
      polling = true;
      try {
        const now = Date.now();
        const running = new Set<string>();
        for (const t of roles.current.values()) if (isRunning(t)) running.add(t.id);
        for (const id of [...subs.keys()]) {
          const e = subs.get(id)!;
          if (!running.has(id) && e.running) { e.running = false; e.until = now + SUB_FADE_MS; } // one last read below
          else if (!running.has(id) && now > e.until) subs.delete(id);
        }
        // Read each running thread (and each one that just stopped) one after another: cheap on a small box.
        for (const id of new Set([...running, ...[...subs].filter(([, e]) => !e.running && e.until === now + SUB_FADE_MS).map(([k]) => k)])) {
          if (stopped) return;
          try {
            const tl = (await sdk.threads.timeline({ threadId: id, includeNestedRows: "true", segmentLimit: "1" })) as unknown as { rows?: Row[]; activeBackgroundCommands?: Row[] };
            const list = subsFromTimeline(tl.rows ?? [], tl.activeBackgroundCommands ?? []);
            if (list.length) subs.set(id, { list, running: running.has(id), until: running.has(id) ? Infinity : now + SUB_FADE_MS });
            else subs.delete(id);
          } catch { /* next tick */ }
        }
      } finally { polling = false; schedule(); }
    };

    const agentOf = (threadId: string): Agent | null => {
      const env = threadEnv.get(threadId);
      const host = env ? envHost.get(env) : undefined;
      if (!host || !hostNames.has(host)) return null;
      const name = hostNames.get(host)!;
      return { kind: kindOf(name, work, hostRe, claireRe), name };
    };
    const resolve = async (threadId: string) => {
      if (pending.has(threadId)) return;
      pending.add(threadId);
      try {
        const t = (await sdk.threads.get({ threadId })) as { environmentId?: string | null };
        const env = t.environmentId ?? null;
        if (env && !envHost.has(env)) {
          const e = (await sdk.environments.get({ environmentId: env })) as { hostId?: string };
          if (e.hostId) envHost.set(env, e.hostId);
        }
        if (env && envHost.has(env)) { threadEnv.set(threadId, env); missedAt.delete(threadId); }
        else { missedAt.set(threadId, Date.now()); window.setTimeout(schedule, RETRY_MS); }
      } catch {
        missedAt.set(threadId, Date.now()); window.setTimeout(schedule, RETRY_MS);
      } finally {
        pending.delete(threadId);
        schedule();
      }
    };
    const loadHosts = () =>
      sdk.hosts.list().then((hosts) => {
        hostNames = new Map(hosts.map((h) => [h.id, String((h as { displayName?: string | null }).displayName || h.name || "")]));
        schedule();
      }, () => undefined);

    const relabel = () => {
      for (const el of document.querySelectorAll<HTMLElement>('span[title="Threads"], span[data-sa-sessions]')) {
        if (el.dataset.saSessions === label) continue;
        el.dataset.saSessions = label;
        el.title = label ? `Sessions · ${label}` : "Sessions";
        el.replaceChildren(document.createTextNode("Sessions"), ...(label ? [Object.assign(document.createElement("span"), { className: "sa-label", textContent: label })] : []));
      }
      for (const el of document.querySelectorAll<HTMLElement>("span, div")) {
        if (el.childElementCount === 0 && el.textContent === "New thread") el.textContent = "New session";
      }
      // The domain label also goes where every layout shows it: the sidebar's "New session" button (the "Threads"
      // header is gone when the list is organised by project) and the phone home screen's "Recent" heading.
      const tag = (el: HTMLElement) => {
        if (el.dataset.saLabeled === label && (!label || el.querySelector(":scope > .sa-label"))) return;
        el.dataset.saLabeled = label;
        el.querySelector(":scope > .sa-label")?.remove();
        if (label) el.append(Object.assign(document.createElement("span"), { className: "sa-label", textContent: label }));
      };
      for (const el of document.querySelectorAll<HTMLElement>("[data-sidebar-header-slot] span")) {
        if (el.dataset.saLabeled !== undefined || (el.childElementCount === 0 && el.textContent === "New session")) tag(el);
      }
      for (const el of document.querySelectorAll<HTMLElement>("[data-root-compose-mobile-recents] h2")) tag(el);
    };
    // Pips beside a row's title and named rows under it. `host` is where the rows go (after the row, or in the
    // phone's <li>); `titleEl` is what the pips follow.
    const paintSubs = () => {
      const now = Date.now();
      const seen = new Set<HTMLElement>();
      const place = (id: string, titleEl: HTMLElement | null | undefined, host: HTMLElement | null | undefined, after: HTMLElement | null) => {
        const e = subs.get(id);
        if (!e || !titleEl || !host || !after) return;
        const fading = !e.running;
        const kind = agentOf(id)?.kind ?? "";
        const sig = e.list.map((s) => `${s.id}:${s.state}`).join("|") + (fading ? "~" : "");
        let pips = titleEl.parentElement!.querySelector<HTMLElement>(":scope > .sa-pips");
        if (!pips || pips.dataset.sig !== sig) {
          pips?.remove();
          pips = document.createElement("span");
          pips.className = "sa-pips";
          pips.dataset.sig = sig;
          pips.dataset.k = kind;
          if (fading) pips.dataset.fading = "";
          pips.title = e.list.map((s) => `${s.name} (${s.state === "running" ? "working" : s.state === "done" ? "done" : "failed"})`).join("\n");
          for (const s of e.list) pips.append(Object.assign(document.createElement("span"), { className: "sa-pip" }));
          [...pips.children].forEach((c, i) => ((c as HTMLElement).dataset.s = e.list[i]!.state));
          titleEl.after(pips);
        }
        seen.add(pips);
        // Named rows only while a subagent runs.
        const running = e.running ? e.list.filter((s) => s.state === "running") : [];
        const existing = after.nextElementSibling as HTMLElement | null;
        let block = existing?.classList.contains("sa-subs") && existing.dataset.saBlock !== undefined ? existing : null;
        const bsig = kind + "|" + running.map((s) => `${s.id}:${s.name}:${s.model}`).join("|");
        if (block && (block.dataset.sig !== bsig || !running.length)) { block.remove(); block = null; }
        if (!block && running.length) {
          block = document.createElement(after?.tagName === "LI" ? "li" : "div"); // the phone list is a <ul>
          block.className = "sa-subs";
          block.dataset.saBlock = "";
          block.dataset.sig = bsig;
          block.dataset.k = kind;
          for (const s of running) {
            const row = document.createElement("div");
            row.className = "sa-sub";
            row.title = `Subagent working for this session: ${s.name}${s.model ? ` (${s.model})` : ""}`;
            row.append(Object.assign(document.createElement("span"), { className: "sa-sub-name", textContent: s.name }));
            if (s.model) row.append(Object.assign(document.createElement("span"), { className: "sa-sub-model", textContent: s.model }));
            block.append(row);
          }
          after.after(block);
        }
        if (block) seen.add(block);
      };
      for (const a of document.querySelectorAll<HTMLElement>("a[data-sidebar-thread-id]")) {
        const row = a.closest<HTMLElement>("[data-sidebar-rename-row]");
        place(a.dataset.sidebarThreadId!, row?.querySelector<HTMLElement>(".bb-thread-title"), row?.parentElement, row ?? null);
      }
      for (const li of document.querySelectorAll<HTMLElement>("[data-root-compose-mobile-recents] li")) {
        const id = li.querySelector("a[href*='/threads/']")?.getAttribute("href")?.match(/\/threads\/([^/?#]+)/)?.[1];
        if (id) place(id, li.querySelector<HTMLElement>(".bb-thread-title"), li.parentElement, li);
      }
      for (const el of document.querySelectorAll<HTMLElement>(".sa-pips, [data-sa-block]")) if (!seen.has(el)) el.remove();
      void now;
    };
    // Jobs: tint + phase mark per row. `jobs` is kept fresh by the effect below.
    const paintJobs = () => {
      const seen = new Set<HTMLElement>();
      const mark = (id: string, row: HTMLElement | null | undefined, titleEl: HTMLElement | null | undefined) => {
        if (!row || !titleEl) return;
        const job = jobs.current.get(id);
        const ph = phasedTitle(titleEl.title || titleEl.textContent || "");
        // A phase of a live job gets pips in the job's colour; a lone phase N>1 gets N muted pips; a lone phase 1 nothing.
        const n = job ? job.phases.find((p) => p.id === id)!.n : ph && ph.n > 1 ? ph.n : 0;
        if (!n) return;
        if (job) { row.dataset.saJob = job.key; row.style.setProperty("--sa-job", job.color); }
        const pips = pipsFor(job ? job.phases.map((p) => p.n) : null, n);
        let m = titleEl.parentElement!.querySelector<HTMLElement>(":scope > .sa-phase");
        if (!m) { m = document.createElement("span"); m.className = "sa-phase"; titleEl.after(m); }
        const sig = pips.join(",");
        if (m.dataset.sig !== sig) {
          m.dataset.sig = sig;
          m.replaceChildren(...pips.map((s) => Object.assign(document.createElement("span"), { className: "sa-pp" })));
          pips.forEach((s, i) => ((m!.children[i] as HTMLElement).dataset.s = s));
        }
        m.style.setProperty("--sa-job", job ? job.color : colorFor(ph!.name));
        m.title = job ? `${job.name}: phase ${n} of ${pips.length}` : `${ph!.name}: phase ${n}`;
        m.setAttribute("aria-label", m.title);
        seen.add(m);
      };
      for (const a of document.querySelectorAll<HTMLElement>("a[data-sidebar-thread-id]")) {
        const row = a.closest<HTMLElement>("[data-sidebar-rename-row]") ?? a;
        mark(a.dataset.sidebarThreadId!, row, row.querySelector<HTMLElement>(".bb-thread-title"));
      }
      for (const li of document.querySelectorAll<HTMLElement>("[data-root-compose-mobile-recents] li")) {
        const id = li.querySelector("a[href*='/threads/']")?.getAttribute("href")?.match(/\/threads\/([^/?#]+)/)?.[1];
        if (id) mark(id, li, li.querySelector<HTMLElement>(".bb-thread-title"));
      }
      for (const el of document.querySelectorAll<HTMLElement>(".sa-phase")) if (!seen.has(el)) el.remove();
      for (const el of document.querySelectorAll<HTMLElement>("[data-sa-job]")) {
        const id = el.querySelector<HTMLElement>("[data-sidebar-thread-id]")?.dataset.sidebarThreadId ?? el.dataset.sidebarThreadId
          ?? el.querySelector("a[href*='/threads/']")?.getAttribute("href")?.match(/\/threads\/([^/?#]+)/)?.[1];
        if (!id || !jobs.current.has(id)) { delete el.dataset.saJob; delete el.dataset.saHot; el.style.removeProperty("--sa-job"); }
      }
    };
    // Phased titles ("<job> · phase N") show only the job name; the full title stays as the tooltip and in bb's data.
    const shorten = () => {
      for (const t of document.querySelectorAll<HTMLElement>(".bb-thread-title")) {
        const el = t.firstElementChild instanceof HTMLElement ? t.firstElementChild : t;
        const full = el.textContent ?? "";
        const ph = phasedTitle(full);
        if (!ph) { if (el.dataset.saShort !== undefined) unshorten(el); continue; }
        if (el.dataset.saShort === ph.name && el.dataset.saFull === full) continue;
        if (el.dataset.saShort === undefined) {
          const cs = getComputedStyle(el);
          el.style.setProperty("--sa-fs", cs.fontSize);
          el.style.setProperty("--sa-lh", cs.lineHeight);
        }
        el.dataset.saShort = ph.name;
        el.dataset.saFull = full;
        if (!t.title) { t.title = full; t.dataset.saTitled = ""; }
      }
    };
    const unshorten = (el: HTMLElement) => {
      delete el.dataset.saShort; delete el.dataset.saFull;
      el.style.removeProperty("--sa-fs"); el.style.removeProperty("--sa-lh");
      const t = el.closest<HTMLElement>(".bb-thread-title");
      if (t?.dataset.saTitled !== undefined) { t.removeAttribute("title"); delete t.dataset.saTitled; }
    };
    // Session list structure from the tags (derive.ts): the context it needs, then the painting.
    const ctx: Ctx = {
      thread: (id) => roles.current.get(id),
      meta: (id) => metas.current.get(id),
      jobMates: (id) => jobs.current.get(id)?.phases.map((p) => p.id) ?? [],
    };
    const groupFor = (id: string) => groupOf(id, ctx);
    const hue = (s: string) => { let h = 0; for (const c of s.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
    const PRIO_TIP = { blocking: "Blocking: the session that spawned this can't proceed without it", urgent: "Urgent: focus here first" };
    const idOfLi = (li: HTMLElement) => li.querySelector("a[href*='/threads/']")?.getAttribute("href")?.match(/\/threads\/([^/?#]+)/)?.[1];
    const paintStructure = () => {
      // Priority tint + icon, spawner glyph: on sidebar rows and the phone's recent list.
      const decorate = (id: string, row: HTMLElement, titleEl: HTMLElement | null, placed: { spawner: string | null } | undefined) => {
        const m = metas.current.get(id);
        const prio = m?.priority === "blocking" || m?.priority === "urgent" ? m.priority : null;
        if (prio) row.dataset.saPrio = prio; else delete row.dataset.saPrio;
        row.querySelector(":scope .sa-prio")?.remove();
        if (prio && titleEl) {
          const tip = m?.reason ? `${prio === "blocking" ? "Blocking" : "Urgent"}: ${m.reason}` : PRIO_TIP[prio];
          const el = Object.assign(document.createElement("span"), { className: "sa-prio", title: tip });
          el.setAttribute("aria-label", tip);
          (titleEl.parentElement!.querySelector(":scope > .sa-phase") ?? titleEl).after(el);
        }
        // Needs Bdon: edge, person icon, second line. Cleared by the server (server.ts), so this only draws what is tagged.
        const you = m?.priority === "needs-bdon";
        for (const el of row.querySelectorAll(":scope .sa-me, :scope .sa-bar, :scope .sa-ask")) el.remove();
        if (you && titleEl) {
          const tier = m?.tier === "1" || String(m?.tier) === "1" ? "1" : "2";
          row.dataset.saYou = tier;
          const why = m?.reason?.trim();
          const now = tier === "1";
          const label = now ? "Needs you now" : "Needs you";
          const tip = why ? `${label}: ${why}` : label;
          const me = Object.assign(document.createElement("span"), { className: "sa-me", title: tip });
          me.setAttribute("aria-label", tip);
          (titleEl.parentElement!.querySelector(":scope > .sa-phase") ?? titleEl).after(me);
          const ask = document.createElement("span");
          ask.className = "sa-ask";
          ask.append(Object.assign(document.createElement("b"), { textContent: label }), why ? ` \u00b7 ${why}` : "");
          ask.title = tip;
          ask.style.left = `${Math.max(0, Math.round(titleEl.getBoundingClientRect().left - row.getBoundingClientRect().left))}px`;
          row.append(Object.assign(document.createElement("span"), { className: "sa-bar" }), ask);
        } else delete row.dataset.saYou;
        row.querySelector(":scope .sa-wait")?.remove();
        const t = roles.current.get(id);
        const waiting = t ? waitingOn([t], claims.current).get(id) : undefined;
        if (waiting && titleEl) {
          const tip = waitingTip(waiting);
          const el = Object.assign(document.createElement("span"), { className: "sa-wait", title: tip });
          el.setAttribute("aria-label", tip);
          (titleEl.parentElement!.querySelector(":scope > .sa-prio") ?? titleEl.parentElement!.querySelector(":scope > .sa-phase") ?? titleEl).after(el);
        }
        const sp = placed?.spawner ?? null;
        const parentEl = titleEl?.parentElement;
        const glyph = parentEl?.querySelector<HTMLElement>(":scope > .sa-spawn");
        const spTitle = sp ? roles.current.get(sp)?.displayTitle : undefined;
        if (!sp || !spTitle || !parentEl || !titleEl) { glyph?.remove(); return; }
        const tip = `Spawned by ${spTitle}`;
        if (glyph && glyph.title === tip) return;
        glyph?.remove();
        const g = Object.assign(document.createElement("span"), { className: "sa-spawn", textContent: "↳", title: tip });
        g.setAttribute("aria-label", tip);
        parentEl.prepend(g);
      };
      const sections = new Map<HTMLElement, { id: string; item: HTMLElement; row: HTMLElement }[]>();
      for (const a of document.querySelectorAll<HTMLElement>("a[data-sidebar-thread-id]")) {
        const row = a.closest<HTMLElement>("[data-sidebar-rename-row]");
        const item = row?.closest<HTMLElement>("[data-sidebar-windowed-item]");
        const sec = item?.parentElement;
        if (!row || !item || !sec) continue;
        sections.set(sec, [...(sections.get(sec) ?? []), { id: a.dataset.sidebarThreadId!, item, row }]);
      }
      const touched = new Set<HTMLElement>();
      // bb draws a session's children in a nested list of their own, so each list gets its own layout. A group header
      // there would repeat the parent's: drop it when the row's bb parent is shown in another list in the same group.
      const secOf = new Map<string, HTMLElement>();
      for (const [sec, list] of sections) for (const r of list) secOf.set(r.id, sec);
      const repeats = (id: string, sec: HTMLElement, g: string | null) => {
        const par = roles.current.get(id)?.parentThreadId;
        const ps = par ? secOf.get(par) : undefined;
        return !!g && !!par && !!ps && ps !== sec && groupFor(par)?.toLowerCase() === g.toLowerCase();
      };
      for (const [sec, list] of sections) {
        const oneProject = new Set(list.map((r) => roles.current.get(r.id)?.projectId)).size === 1;
        const placed = oneProject ? layout(list.map((r) => r.id), ctx) : new Map();
        if (oneProject) {
          sec.dataset.saSection = "";
          // Anything in the list that isn't a row (spacers, "show more") keeps its place relative to the rows.
          let seenRow = false;
          for (const c of Array.from(sec.children) as HTMLElement[]) {
            if (list.some((r) => r.item === c)) { seenRow = true; continue; }
            c.style.order = seenRow ? "999999" : "-1"; c.dataset.saOrder = "";
            touched.add(c);
          }
        }
        for (const { id, item, row } of list) {
          const p = placed.get(id);
          touched.add(item);
          if (p) {
            item.style.order = String(p.order); item.dataset.saOrder = "";
            if (p.depth) { item.dataset.saDepth = ""; item.style.setProperty("--sa-depth", String(p.depth)); } else { delete item.dataset.saDepth; item.style.removeProperty("--sa-depth"); }
            if (p.header && !repeats(id, sec, p.group)) {
              item.dataset.saGh = p.header;
              item.style.setProperty("--sa-g", isHealth(p.header) ? "var(--cl-attention, #ff2e55)" : `var(--cl-accent-${ACCENTS[hue(p.family ?? p.header) % ACCENTS.length]}, gray)`);
              item.style.setProperty("--sa-n", String(p.dashes));
            } else { delete item.dataset.saGh; item.style.removeProperty("--sa-g"); item.style.removeProperty("--sa-n"); }
          } else clearItem(item);
          decorate(id, row, row.querySelector<HTMLElement>(".bb-thread-title"), p);
        }
      }
      for (const el of document.querySelectorAll<HTMLElement>("[data-sa-order], [data-sa-gh], [data-sa-depth]")) if (!touched.has(el)) clearItem(el);
      for (const sec of document.querySelectorAll<HTMLElement>("[data-sa-section]")) if (!sections.has(sec)) delete sec.dataset.saSection;
      for (const li of document.querySelectorAll<HTMLElement>("[data-root-compose-mobile-recents] li")) {
        const id = idOfLi(li);
        if (id) decorate(id, li, li.querySelector<HTMLElement>(".bb-thread-title"), undefined);
      }
    };
    const clearItem = (el: HTMLElement) => {
      el.style.removeProperty("order"); el.style.removeProperty("--sa-depth"); el.style.removeProperty("--sa-g"); el.style.removeProperty("--sa-n");
      delete el.dataset.saOrder; delete el.dataset.saGh; delete el.dataset.saDepth;
    };
    const paint = () => {
      frame = 0;
      if (stopped) return;
      observer.disconnect();
      const rows: [string, HTMLElement | null | undefined][] = [];
      for (const a of document.querySelectorAll<HTMLElement>("a[data-sidebar-thread-id]")) {
        rows.push([a.dataset.sidebarThreadId!, a.parentElement?.querySelector<HTMLElement>("[data-sidebar-thread-provider]")]);
      }
      for (const li of document.querySelectorAll<HTMLElement>("[data-root-compose-mobile-recents] li")) {
        const id = li.querySelector("a[href*='/threads/']")?.getAttribute("href")?.match(/\/threads\/([^/?#]+)/)?.[1];
        if (id) rows.push([id, li.querySelector<HTMLElement>("[data-provider-icon-tint]")]);
      }
      for (const [id, icon] of rows) {
        if (!icon) continue;
        const health = isHealth(groupFor(id));
        if (health !== (icon.dataset.saHealth !== undefined)) { if (health) icon.dataset.saHealth = ""; else delete icon.dataset.saHealth; }
        if (!threadEnv.has(id)) {
          if (Date.now() - (missedAt.get(id) ?? 0) >= RETRY_MS) void resolve(id);
          continue;
        }
        const agent = agentOf(id);
        if (!agent) continue;
        const thr = roles.current.get(id);
        const r0 = thr ? roleOf(thr, roles.current, projectNames.current, agent.name, claireRe) : null;
        // Nearly every session is a lead, so the crown only marks one that's running a team right now: child
        // sessions, or subagents still on screen. The tooltip keeps the role either way.
        const team = r0?.role === "lead" && ((subs.get(id)?.list.length ?? 0) > 0
          || [...roles.current.values()].some((t) => t.parentThreadId === id));
        const r = r0 && (r0.role === "worker" || team) ? r0 : null;
        const tip = (r0 ? `${agent.name} · ${r0.tip}` : agent.name) + (health ? " · Health" : "");
        if (icon.dataset.saAgent !== agent.kind || icon.dataset.saRole !== (r?.role ?? "") || icon.title !== tip) {
          icon.dataset.saAgent = agent.kind;
          if (r) icon.dataset.saRole = r.role; else delete icon.dataset.saRole;
          icon.setAttribute("aria-label", tip);
          icon.title = tip;
        }
      }
      paintChat();
      paintSubs();
      paintJobs();
      paintStructure();
      shorten();
      relabel();
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    };
    // Who wrote each chat turn, as data-sa-from=<kind> on its timeline row, for the theme to colour (bb's DOM says
    // nothing about authors). A row id starts with its thread's id. The thread's own replies are its agent; the
    // seed prompt (user-seed:1) of a spawned thread is its parent's; a collapsed "Message from <thread>" row is that
    // thread's; an "<child title> finished" row is that child's. Bdon's own turns get nothing and keep --cl-you.
    const fromOf = (id: string): string | undefined => {
      if (!threadEnv.has(id)) { if (Date.now() - (missedAt.get(id) ?? 0) >= RETRY_MS) void resolve(id); return undefined; }
      return agentOf(id)?.kind;
    };
    const paintChat = () => {
      for (const row of document.querySelectorAll<HTMLElement>("[data-timeline-row-id]")) {
        const rid = row.dataset.timelineRowId!;
        const tid = rid.slice(0, rid.indexOf(":"));
        let from: string | undefined;
        if (rid.includes(":assistant:")) from = fromOf(tid);
        else if (rid.includes(":user-seed:")) {
          const head = row.querySelector<HTMLElement>(":scope > div > div > button");
          if (head) {
            const res = head.querySelector("[data-prompt-mention-resource]")?.getAttribute("data-prompt-mention-resource");
            let sender: string | undefined;
            try { sender = res ? (JSON.parse(res) as { threadId?: string }).threadId : undefined; } catch { /* not a thread */ }
            if (!sender) {
              const title = head.querySelector("[title]")?.getAttribute("title") ?? "";
              let best = "";
              for (const t of roles.current.values()) {
                if (t.parentThreadId === tid && title.startsWith(t.displayTitle + " ") && t.displayTitle.length > best.length) { best = t.displayTitle; sender = t.id; }
              }
            }
            if (sender) from = fromOf(sender);
          } else if (rid.endsWith(":user-seed:1")) {
            const parent = roles.current.get(tid)?.parentThreadId;
            if (parent) from = fromOf(parent);
          }
        }
        if (from) { if (row.dataset.saFrom !== from) row.dataset.saFrom = from; }
        else if (row.dataset.saFrom !== undefined) delete row.dataset.saFrom;
      }
    };
    const schedule = () => { if (!frame && !stopped) frame = requestAnimationFrame(paint); };
    bump.current = schedule;
    const observer = new MutationObserver(schedule);
    const hover = (e: Event) => {
      const row = (e.target as Element | null)?.closest?.<HTMLElement>("[data-sa-job]");
      const key = e.type === "pointerover" ? row?.dataset.saJob : undefined;
      for (const el of document.querySelectorAll<HTMLElement>("[data-sa-job]")) {
        if (key && el.dataset.saJob === key) el.dataset.saHot = ""; else delete el.dataset.saHot;
      }
    };
    document.addEventListener("pointerover", hover);
    document.addEventListener("pointerleave", hover, true);
    void loadHosts();
    const hostTimer = window.setInterval(loadHosts, 60_000); // renamed or added machines
    const subTimer = window.setInterval(pollSubs, SUB_POLL_MS);
    void pollSubs();
    schedule();

    return () => {
      stopped = true;
      observer.disconnect();
      cancelAnimationFrame(frame);
      clearInterval(hostTimer);
      clearInterval(subTimer);
      document.removeEventListener("pointerover", hover);
      document.removeEventListener("pointerleave", hover, true);
      for (const el of document.querySelectorAll(".sa-pips, [data-sa-block], .sa-phase, .sa-prio, .sa-wait, .sa-spawn, .sa-me, .sa-bar, .sa-ask")) el.remove();
      for (const el of document.querySelectorAll<HTMLElement>("[data-sa-you]")) delete el.dataset.saYou;
      for (const el of document.querySelectorAll<HTMLElement>("[data-sa-order], [data-sa-gh], [data-sa-depth]")) clearItem(el);
      for (const el of document.querySelectorAll<HTMLElement>("[data-sa-section]")) delete el.dataset.saSection;
      for (const el of document.querySelectorAll<HTMLElement>("[data-sa-prio]")) delete el.dataset.saPrio;
      for (const el of document.querySelectorAll<HTMLElement>("[data-sa-health]")) delete el.dataset.saHealth;
      for (const el of document.querySelectorAll<HTMLElement>("[data-sa-from]")) delete el.dataset.saFrom;
      for (const el of document.querySelectorAll<HTMLElement>("[data-sa-job]")) { delete el.dataset.saJob; delete el.dataset.saHot; el.style.removeProperty("--sa-job"); }
      for (const el of document.querySelectorAll<HTMLElement>("[data-sa-short]")) unshorten(el);
      style.remove();
      for (const el of document.querySelectorAll<HTMLElement>("[data-sa-agent]")) { delete el.dataset.saAgent; delete el.dataset.saRole; }
      for (const el of document.querySelectorAll<HTMLElement>("[data-sa-labeled]")) {
        delete el.dataset.saLabeled;
        el.querySelector(":scope > .sa-label")?.remove();
      }
      for (const el of document.querySelectorAll<HTMLElement>("span[data-sa-sessions]")) {
        delete el.dataset.saSessions;
        el.title = "Threads";
        el.textContent = "Threads";
      }
    };
  }, [sdk, label, workPattern, hostPattern, clairePattern]);

  return null;
}

/**
 * bb lists projects in a stored order (drag to reorder) and has no "most recent first". This keeps the project
 * whose session was updated last at the top: when it isn't first, it moves there. Moving only the top one is
 * enough, since every project goes to the top as soon as it gets used, which gives most-recently-used order.
 * Every open window runs this, but they all agree on the target, so the worst case is a repeated no-op move.
 */
function ProjectOrder() {
  const sdk = useSdk();
  const { status, threads, projects } = experimental_useSidebarThreads();
  const moving = useRef<string | null>(null);
  useEffect(() => {
    if (status !== "ready") return;
    const listed = projects.filter((p) => !p.isPersonal);
    const latest = new Map<string, number>();
    for (const t of threads) {
      if (t.isArchived) continue;
      latest.set(t.projectId, Math.max(latest.get(t.projectId) ?? 0, t.updatedAt));
    }
    let top: string | null = null;
    for (const p of listed) if ((latest.get(p.id) ?? 0) > (latest.get(top ?? "") ?? 0)) top = p.id;
    if (!top || listed[0]?.id === top || moving.current === top) return;
    moving.current = top;
    sdk.projects
      .reorder({ projectId: top, previousProjectId: null, nextProjectId: listed[0].id })
      .catch(() => undefined)
      .finally(() => window.setTimeout(() => { if (moving.current === top) moving.current = null; }, 5_000));
  }, [sdk, status, threads, projects]);
  return null;
}

const DOMAIN_COLOR = "var(--cl-text-subtle, var(--muted-foreground))"; // neutral, like the sidebar label

/**
 * The session's top bar, before its title: "<server> · <agent icon> <folder> <project> /". bb has no slot there, so
 * this keeps a node at the start of the title row in bb's header (like the code-block and icon decorations) and
 * renders into it. No thread, no header, or bb's markup changed: nothing is added and the plain title stays.
 */
function SessionHeader() {
  const context = useBbContext();
  const { values } = useSettings();
  const { threads, projects } = experimental_useSidebarThreads();
  const servers = experimental_useServers();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [routeThread, setRouteThread] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const chips = useRef<HTMLButtonElement>(null);
  // An app-wide overlay isn't inside a thread's page, so its context may have no thread: fall back to the URL.
  const threadId = context.threadId ?? routeThread;

  useLayoutEffect(() => {
    const mount = document.createElement("span");
    mount.className = "flex shrink-0 items-center";
    mount.dataset.saHeader = "";
    const attach = () => {
      setRouteThread(location.pathname.match(/\/threads\/([^/?#]+)/)?.[1] ?? null);
      const title = document.querySelector('[data-testid="app-page-header-content-row"] .bb-thread-title');
      const row = title?.closest("p")?.parentElement; // bb's title box; we go right before it
      if (!row?.parentElement) return setSlot(null);
      if (mount.nextElementSibling !== row) row.before(mount);
      setSlot(mount);
    };
    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      mount.remove();
    };
  }, []);

  useEffect(() => setOpen(false), [threadId]);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as Element)?.closest?.("[data-sa-card], [data-sa-header]")) setOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", close, true);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", close, true);
    };
  }, [open]);

  const thread = threads.find((t) => t.id === threadId);
  if (!slot || !thread) return null;
  const work = pattern(values?.workMachines, "work");
  const label = String(values?.label ?? "") || "server";
  const host = thread.host?.name ?? null;
  const kind = host ? kindOf(host, work, pattern(values?.hostMachines, HOST_DEFAULT), pattern(values?.claireMachines, "claire")) : null;
  const project = projects.find((p) => p.id === thread.projectId)?.name ?? "project";
  const active = servers?.servers?.find((x) => x.active); // null outside bb Desktop and the mobile app
  const server = active ? { name: active.name, host: active.origin.replace(/^https?:\/\//, "") } : null;
  const rect = open ? chips.current?.getBoundingClientRect() : undefined;
  const info = roleOf(thread, new Map(threads.map((t) => [t.id, t])), new Map(projects.map((p) => [p.id, p.name])), host, pattern(values?.claireMachines, "claire"));
  const job = jobsOf(threads).get(thread.id);
  const openPhase = (id: string, href?: string) => {
    setOpen(false);
    const a = document.querySelector<HTMLElement>(`a[data-sidebar-thread-id="${id}"]`);
    if (a) a.click(); else if (href) location.assign(href);
  };
  const summary = `Domain ${label}, agent ${host ?? "unknown"}, project ${project}, ${info.tip}`;

  return (
    <>
      {createPortal(
        <button
          ref={chips}
          type="button"
          onClick={() => setOpen((o) => !o)}
          title={summary}
          aria-label={summary}
          aria-expanded={open}
          className="mr-1.5 flex cursor-pointer items-center gap-1.5 rounded-sm px-1 py-0.5 text-sm hover:bg-state-hover"
          style={{ ["--sa-server" as string]: DOMAIN_COLOR }}
        >
          <span className="sa-server font-medium">{label}</span>
          <span className="sa-sep text-muted-foreground">·</span>
          {kind ? <span data-sa-header-agent={kind} /> : null}
          <Icon name="Folder" fallback="Folder" className="size-3.5 text-muted-foreground" aria-hidden />
          <span className="sa-project max-w-[9rem] truncate">{project}</span>
          {info.role === "worker" || threads.some((t) => t.parentThreadId === thread.id) ? <span className="sa-role" data-r={info.role} aria-hidden /> : null}
          <span className="sa-sep text-muted-foreground">/</span>
        </button>,
        slot,
      )}
      {open && rect
        ? createPortal(
            <div
              data-sa-card=""
              role="dialog"
              aria-label="Where this session runs"
              className="fixed z-50 min-w-64 max-w-[calc(100vw-16px)] rounded-md border border-border bg-popover p-3 text-xs text-popover-foreground shadow-md"
              style={{ top: rect.bottom + 6, left: Math.max(8, Math.min(rect.left, window.innerWidth - 272)) }}
            >
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                <dt className="text-muted-foreground">Domain</dt>
                <dd>{label}</dd>
                <dt className="text-muted-foreground">Server</dt>
                <dd>{server ? <>{server.name} <span className="text-muted-foreground">· {server.host}</span></> : location.host}</dd>
                <dt className="text-muted-foreground">Agent</dt>
                <dd>{host ?? "unknown"}{kind ? <span className="text-muted-foreground"> · {kind.startsWith("work") ? "work login" : "personal login"}{kind.endsWith("-host") ? ", on the host" : ", in a pod"}</span> : null}</dd>
                <dt className="text-muted-foreground">Project</dt>
                <dd>{project}</dd>
                {thread.environment?.path ? (<><dt className="text-muted-foreground">Folder</dt><dd className="break-all font-mono">{thread.environment?.path}</dd></>) : null}
                {thread.environment?.branchName ? (<><dt className="text-muted-foreground">Branch</dt><dd className="font-mono">{thread.environment?.branchName}</dd></>) : null}
                <dt className="text-muted-foreground">Role</dt>
                <dd>{info.role === "lead" ? "Lead" : "Worker"}</dd>
                <dt className="text-muted-foreground">Started by</dt>
                <dd>{info.role === "worker" ? <>its lead: {info.by}</> : info.by}</dd>
                <dt className="text-muted-foreground">Session</dt>
                <dd>{thread.displayTitle}</dd>
                {job ? (
                  <>
                    <dt className="text-muted-foreground">Job</dt>
                    <dd style={{ ["--sa-job" as string]: job.color }}>
                      <span style={{ color: job.color }} className="font-medium">{job.name}</span>
                      {job.phases.map((p) => (
                        <div key={p.id} className="flex gap-1.5">
                          <span className="w-4 text-right text-muted-foreground">{p.n}</span>
                          {p.id === thread.id ? <span className="text-muted-foreground">{p.title} (this)</span> : <button type="button" className="sa-job-link" onClick={() => openPhase(p.id, p.href)}>{p.title}</button>}
                        </div>
                      ))}
                    </dd>
                  </>
                ) : null}
              </dl>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({ id: "agents", component: SessionAgents });
  app.slots.experimental_appOverlay({ id: "project-order", component: ProjectOrder });
  app.slots.experimental_appOverlay({ id: "session-header", component: SessionHeader });
});
