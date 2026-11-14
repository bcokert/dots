// session-agents: makes bb say which agent each session runs on, and labels the session list.
//   - Each session's provider icon (e.g. the Claude mark) becomes its agent's: a house for a machine with your
//     own login, a briefcase for a work machine (name matching the workMachines setting). It's looked up from the
//     thread's environment's machine, in the sidebar and in the phone's "Recent" list.
//   - The session list header reads "Sessions · <label>" instead of "Threads"; "New thread" reads "New session".
//   - Projects stay in most-recently-used order: the project with the newest session moves to the top.
//   - A session's top bar starts with where it runs: server label, agent icon, project, then the title. Tap any of
//     them for a card with the full names.
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

const CSS = `
[data-sa-agent] > * { display: none !important; }
[data-sa-agent]::before, [data-sa-header-agent]::before { content: ""; width: 14px; height: 14px; flex: none;
  background-color: var(--sa-agent);
  -webkit-mask: var(--sa-icon) center / contain no-repeat; mask: var(--sa-icon) center / contain no-repeat; }
[data-provider-icon-tint][data-sa-agent]::before { width: 16px; height: 16px; }
[data-sa-agent="personal"], [data-sa-header-agent="personal"] { --sa-agent: light-dark(#23845f, #4cc394); --sa-icon: ${HOUSE}; }
[data-sa-agent="work"], [data-sa-header-agent="work"] { --sa-agent: light-dark(#6a4fe0, #a48dff); --sa-icon: ${BRIEFCASE}; }
[data-sa-header-agent] { display: inline-flex; }
/* Phones: drop the separators so the session title keeps more room. */
@media (max-width: 480px) { [data-sa-header] .sa-sep { display: none; } [data-sa-header] .sa-project { max-width: 5.5rem; } }
.sa-server { color: var(--sa-server); }
.sa-label { margin-left: 6px; font-weight: 500; color: var(--sa-label); }
.sa-label::before { content: "· "; color: var(--muted-foreground, currentColor); font-weight: 400; }
`;

type Agent = { kind: "personal" | "work"; name: string };

function SessionAgents() {
  const sdk = useSdk();
  const { values } = useSettings();
  const label = String(values?.label ?? "");
  const workPattern = String(values?.workMachines ?? "work");

  useEffect(() => {
    let work: RegExp;
    try { work = new RegExp(workPattern, "i"); } catch { work = /work/i; }
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

    const agentOf = (threadId: string): Agent | null => {
      const env = threadEnv.get(threadId);
      const host = env ? envHost.get(env) : undefined;
      if (!host || !hostNames.has(host)) return null;
      const name = hostNames.get(host)!;
      return { kind: work.test(name) ? "work" : "personal", name };
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
        if (icon.dataset.saAgent !== agent.kind) {
          icon.dataset.saAgent = agent.kind;
          icon.setAttribute("aria-label", agent.name);
          icon.title = agent.name;
        }
      }
      relabel();
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    };
    const schedule = () => { if (!frame && !stopped) frame = requestAnimationFrame(paint); };
    const observer = new MutationObserver(schedule);
    void loadHosts();
    const hostTimer = window.setInterval(loadHosts, 60_000); // renamed or added machines
    schedule();

    return () => {
      stopped = true;
      observer.disconnect();
      cancelAnimationFrame(frame);
      clearInterval(hostTimer);
      style.remove();
      for (const el of document.querySelectorAll<HTMLElement>("[data-sa-agent]")) delete el.dataset.saAgent;
      for (const el of document.querySelectorAll<HTMLElement>("span[data-sa-sessions]")) {
        delete el.dataset.saSessions;
        el.title = "Threads";
        el.textContent = "Threads";
      }
    };
  }, [sdk, label, workPattern]);

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
  let work: RegExp;
  try { work = new RegExp(String(values?.workMachines ?? "work"), "i"); } catch { work = /work/i; }
  const label = String(values?.label ?? "") || "server";
  const host = thread.host?.name ?? null;
  const kind = host ? (work.test(host) ? "work" : "personal") : null;
  const project = projects.find((p) => p.id === thread.projectId)?.name ?? "project";
  const server = servers?.servers?.find((x) => x.active)?.name; // null outside bb Desktop and the mobile app
  const rect = open ? chips.current?.getBoundingClientRect() : undefined;
  const summary = `Server ${label}, agent ${host ?? "unknown"}, project ${project}`;

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
                <dt className="text-muted-foreground">Server</dt>
                <dd>{label}{server ? <span className="text-muted-foreground"> · {server}</span> : null}</dd>
                <dt className="text-muted-foreground">Agent</dt>
                <dd>{host ?? "unknown"}{kind ? <span className="text-muted-foreground"> · {kind === "work" ? "work login" : "personal login"}</span> : null}</dd>
                <dt className="text-muted-foreground">Project</dt>
                <dd>{project}</dd>
                {thread.environment.path ? (<><dt className="text-muted-foreground">Folder</dt><dd className="break-all font-mono">{thread.environment.path}</dd></>) : null}
                {thread.environment.branchName ? (<><dt className="text-muted-foreground">Branch</dt><dd className="font-mono">{thread.environment.branchName}</dd></>) : null}
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
