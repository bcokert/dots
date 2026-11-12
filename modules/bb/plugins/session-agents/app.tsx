// session-agents: makes bb say which agent each session runs on, and labels the session list.
//   - Each session's provider icon (e.g. the Claude mark) becomes its agent's: a house for a machine with your
//     own login, a briefcase for a work machine (name matching the workMachines setting). It's looked up from the
//     thread's environment's machine, in the sidebar and in the phone's "Recent" list.
//   - The session list header reads "Sessions · <label>" instead of "Threads"; "New thread" reads "New session".
// bb has no slot for these, so this decorates bb's own DOM (as its plugin docs recommend for that) from one
// always-mounted component, and undoes everything when the plugin unloads. If bb's markup changes, rows simply
// fall back to the provider's mark.
import { useEffect } from "react";
import { definePluginApp, useSdk, useSettings } from "@get-bb/plugin-sdk/app";

const svg = (body: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'>${body}</svg>`)}")`;
const HOUSE = svg("<path d='M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z'/>");
const BRIEFCASE = svg("<rect x='2.5' y='7' width='19' height='13.5' rx='1.5'/><path d='M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2'/><path d='M2.5 13h19'/>");

const CSS = `
[data-sa-agent] > * { display: none !important; }
[data-sa-agent]::before { content: ""; width: 14px; height: 14px; flex: none; background-color: var(--sa-agent);
  -webkit-mask: var(--sa-icon) center / contain no-repeat; mask: var(--sa-icon) center / contain no-repeat; }
[data-provider-icon-tint][data-sa-agent]::before { width: 16px; height: 16px; }
[data-sa-agent="personal"] { --sa-agent: light-dark(#23845f, #4cc394); --sa-icon: ${HOUSE}; }
[data-sa-agent="work"] { --sa-agent: light-dark(#6a4fe0, #a48dff); --sa-icon: ${BRIEFCASE}; }
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

    const threadEnv = new Map<string, string | null>(); // thread id -> environment id (null: none)
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
        threadEnv.set(threadId, env);
      } catch {
        threadEnv.set(threadId, null);
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
        if (!threadEnv.has(id)) { void resolve(id); continue; }
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

export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({ id: "agents", component: SessionAgents });
});
