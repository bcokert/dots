// session-agents: makes bb say which agent each session runs on, and labels the session list.
//   - Each session's provider icon (e.g. the Claude mark) becomes its agent's: a house for a machine with your
//     own login, a briefcase for a work machine (name matching the workMachines setting). Host agents (name
//     matching hostMachines, e.g. "Claude Personal Host": they run directly on a computer and can see all of it)
//     get a solid terminal badge in the same colour instead, so they stand out from the pods. It's looked up from
//     the thread's environment's machine, in the sidebar and in the phone's "Recent" list.
//   - The session list header reads "Sessions · <label>" instead of "Threads"; "New thread" reads "New session".
//   - Projects stay in most-recently-used order: the project with the newest session moves to the top.
//   - A session's top bar starts with where it runs: server label, agent icon, project, then the title. Tap any of
//     them for a card with the full names.
//   - Subagents (Claude Code Agent-tool delegations) of a running session show briefly: a pip beside its title per
//     subagent of the latest turn (pulsing while running, green done, red failed; fading out after the turn ends),
//     and a small dim indented row per running one with a cog icon, its description and model. They are
//     read from the thread's timeline every ~4 s, only for threads that are running; not clickable as threads.
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
  useSdk,
  useSettings,
} from "@get-bb/plugin-sdk/app";

const svg = (body: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'>${body}</svg>`)}")`;
const HOUSE = svg("<path d='M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z'/>");
const BRIEFCASE = svg("<rect x='2.5' y='7' width='19' height='13.5' rx='1.5'/><path d='M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2'/><path d='M2.5 13h19'/>");
// Solid, unlike the outline house and briefcase, so a Host agent reads differently at 14px: a filled window with a
// ">_" prompt cut out of it.
const TERMINAL = svg("<defs><mask id='p'><rect width='24' height='24' fill='white'/><path d='M7 9.5l3 2.5-3 2.5M12.5 15H17' stroke='black'/></mask></defs><rect x='1.5' y='3.5' width='21' height='17' rx='3.5' fill='black' stroke='none' mask='url(#p)'/>");

// Role marks (see .sa-role below): drawn bolder so they read at 10px.
const CROWN = svg("<path d='M3 18h18M4 15 2.5 6.5l5.5 4L12 4l4 6.5 5.5-4L20 15z' fill='black'/>");
const BRANCH = svg("<path d='M5 3v8a5 5 0 0 0 5 5h9' stroke-width='3'/><path d='m15 12 4 4-4 4' stroke-width='3'/>");

// A small cog: a subagent is machinery working for its lead, not an agent of its own.
const COG = svg("<circle cx='12' cy='12' r='3.2' stroke-width='2.6'/><path d='M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1' stroke-width='2.8'/>");

const CSS = `
[data-sa-agent] > * { display: none !important; }
[data-sa-agent]::before, [data-sa-header-agent]::before { content: ""; width: 14px; height: 14px; flex: none;
  background-color: var(--sa-agent);
  -webkit-mask: var(--sa-icon) center / contain no-repeat; mask: var(--sa-icon) center / contain no-repeat; }
[data-provider-icon-tint][data-sa-agent]::before { width: 16px; height: 16px; }
[data-sa-agent="personal"], [data-sa-header-agent="personal"] { --sa-agent: light-dark(#23845f, #4cc394); --sa-icon: ${HOUSE}; }
[data-sa-agent="work"], [data-sa-header-agent="work"] { --sa-agent: light-dark(#6a4fe0, #a48dff); --sa-icon: ${BRIEFCASE}; }
[data-sa-agent="personal-host"], [data-sa-header-agent="personal-host"] { --sa-agent: light-dark(#23845f, #4cc394); --sa-icon: ${TERMINAL}; }
[data-sa-agent="work-host"], [data-sa-header-agent="work-host"] { --sa-agent: light-dark(#6a4fe0, #a48dff); --sa-icon: ${TERMINAL}; }
[data-sa-header-agent] { display: inline-flex; }
/* Role mark, bottom-right of the agent icon: a crown is a lead (owns the job), a branch arrow is a worker (a lead's
   child session). Icons, not dots: filled/hollow dots read as online/offline. */
[data-sa-agent] { position: relative; }
[data-sa-role]::after, .sa-role { content: ""; width: 10px; height: 10px; flex: none; background-color: var(--sa-agent, currentColor);
  -webkit-mask: var(--sa-role-icon) center / contain no-repeat; mask: var(--sa-role-icon) center / contain no-repeat; }
[data-sa-role]::after { position: absolute; right: -5px; bottom: -4px; }
[data-sa-role="lead"], .sa-role[data-r="lead"] { --sa-role-icon: ${CROWN}; }
[data-sa-role="worker"], .sa-role[data-r="worker"] { --sa-role-icon: ${BRANCH}; }
.sa-role { display: inline-block; width: 12px; height: 12px; background-color: var(--sa-server, currentColor); }
/* Phones: drop the separators so the session title keeps more room. */
@media (max-width: 480px) { [data-sa-header] .sa-sep { display: none; } [data-sa-header] .sa-project { max-width: 5.5rem; } }
.sa-server { color: var(--sa-server); }
.sa-label { margin-left: 6px; font-weight: 500; color: var(--sa-label); }
.sa-label::before { content: "· "; color: var(--muted-foreground, currentColor); font-weight: 400; }
/* Subagents: pips beside the title, and dim indented rows under it while they run. The cog icon (not a dot: dots
   read as online/offline) is in the lead agent's colour; the whole block says "working for the lead". */
.sa-subs[data-k="personal"], .sa-pips[data-k="personal"] { --sa-agent: light-dark(#23845f, #4cc394); }
.sa-subs[data-k="work"], .sa-pips[data-k="work"] { --sa-agent: light-dark(#6a4fe0, #a48dff); }
.sa-subs[data-k="personal-host"], .sa-pips[data-k="personal-host"] { --sa-agent: light-dark(#23845f, #4cc394); }
.sa-subs[data-k="work-host"], .sa-pips[data-k="work-host"] { --sa-agent: light-dark(#6a4fe0, #a48dff); }
.sa-pips { display: inline-flex; gap: 3px; align-items: center; margin-left: 6px; flex: none; transition: opacity .6s; }
.sa-pips[data-fading] { opacity: .35; }
.sa-pip { width: 5px; height: 8px; border-radius: 1.5px; background: var(--muted-foreground, gray); opacity: .7; }
.sa-pip[data-s="running"] { background: var(--sa-agent, #4cc394); opacity: 1; animation: sa-pulse 1.1s ease-in-out infinite; }
.sa-pip[data-s="done"] { background: light-dark(#23845f, #4cc394); opacity: .9; }
.sa-pip[data-s="error"] { background: light-dark(#d03a3a, #ff6b6b); opacity: 1; }
@keyframes sa-pulse { 50% { opacity: .25; transform: scaleY(.65); } }
@media (prefers-reduced-motion: reduce) { .sa-pip[data-s="running"] { animation: none; } }
.sa-subs { display: flex; flex-direction: column; margin: 0 0 2px 17px; padding-left: 7px; border-left: 1px solid var(--border, rgba(128,128,128,.3)); }
li.sa-subs { margin: -6px 0 6px 25px; list-style: none; }
.sa-sub { display: flex; align-items: center; gap: 5px; min-width: 0; height: 18px; font-size: 11px; line-height: 1; color: var(--muted-foreground, gray); opacity: .85; cursor: default; }
.sa-sub::before { content: ""; width: 11px; height: 11px; flex: none; background-color: var(--sa-agent, currentColor);
  -webkit-mask: ${COG} center / contain no-repeat; mask: ${COG} center / contain no-repeat; }
.sa-sub-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.sa-sub-model { flex: none; opacity: .6; font-size: 10px; }
`;

type Kind = "personal" | "work" | "personal-host" | "work-host";
type Agent = { kind: Kind; name: string };

const pattern = (value: unknown, fallback: string) => {
  try { return new RegExp(String(value || fallback), "i"); } catch { return new RegExp(fallback, "i"); }
};
const HOST_DEFAULT = "\\bhost$";
/** A machine name -> its agent kind: whose login (work or personal), and whether it's a Host agent. */
const kindOf = (name: string, work: RegExp, host: RegExp): Kind =>
  `${work.test(name) ? "work" : "personal"}${host.test(name) ? "-host" : ""}` as Kind;

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
  useEffect(() => {
    roles.current = new Map(threads.map((t) => [t.id, t]));
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
    const labelColor = work.test(label) ? "light-dark(#6a4fe0, #a48dff)" : "light-dark(#23845f, #4cc394)";
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
      return { kind: kindOf(name, work, hostRe), name };
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
        const tip = r0 ? `${agent.name} · ${r0.tip}` : agent.name;
        if (icon.dataset.saAgent !== agent.kind || icon.dataset.saRole !== (r?.role ?? "") || icon.title !== tip) {
          icon.dataset.saAgent = agent.kind;
          if (r) icon.dataset.saRole = r.role; else delete icon.dataset.saRole;
          icon.setAttribute("aria-label", tip);
          icon.title = tip;
        }
      }
      paintSubs();
      relabel();
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    };
    const schedule = () => { if (!frame && !stopped) frame = requestAnimationFrame(paint); };
    bump.current = schedule;
    const observer = new MutationObserver(schedule);
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
      for (const el of document.querySelectorAll(".sa-pips, [data-sa-block]")) el.remove();
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

const PERSONAL_COLOR = "light-dark(#23845f, #4cc394)";
const WORK_COLOR = "light-dark(#6a4fe0, #a48dff)";

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
  const kind = host ? kindOf(host, work, pattern(values?.hostMachines, HOST_DEFAULT)) : null;
  const project = projects.find((p) => p.id === thread.projectId)?.name ?? "project";
  const active = servers?.servers?.find((x) => x.active); // null outside bb Desktop and the mobile app
  const server = active ? { name: active.name, host: active.origin.replace(/^https?:\/\//, "") } : null;
  const rect = open ? chips.current?.getBoundingClientRect() : undefined;
  const info = roleOf(thread, new Map(threads.map((t) => [t.id, t])), new Map(projects.map((p) => [p.id, p.name])), host, pattern(values?.claireMachines, "claire"));
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
          style={{ ["--sa-server" as string]: work.test(label) ? WORK_COLOR : PERSONAL_COLOR }}
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
