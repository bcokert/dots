// archive-pending: rows of sessions marked done (bb archive-pending mark) get a green (done) archive mark after the title
// and a muted title, in the sidebar and in the phone's "Recent" list, until they're archived or talked to again (rule.ts).
// bb's row menu already has Archive, so there's no second one here. bb has no slot for row styling that's on by
// default (thread row metadata needs an experiment and a setting), so this decorates bb's own DOM, like
// session-agents, and undoes it all when the plugin unloads. If bb's markup changes, rows just look normal.
import { useEffect, useRef } from "react";
import { isPending, latestUserAt } from "./rule.ts";
import { definePluginApp, experimental_useSidebarThreads, useSdk } from "@get-bb/plugin-sdk/app";

const ARCHIVE = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'><rect x='2.5' y='3.5' width='19' height='5' rx='1'/><path d='M4.5 8.5V19a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V8.5M10 12.5h4'/></svg>",
)}")`;
const TIP = "Done: waiting to be archived (row menu → Archive). Writing to it again clears this.";
const CSS = `
[data-ap-pending] .bb-thread-title { color: var(--cl-text-muted, var(--muted-foreground)); }
.ap-mark { width: 12px; height: 12px; flex: none; margin-left: 6px; align-self: center;
  background-color: var(--cl-good, var(--success, currentColor));
  -webkit-mask: ${ARCHIVE} center / contain no-repeat; mask: ${ARCHIVE} center / contain no-repeat; }
`;
const POLL_MS = 60_000; // backstop only: status changes below trigger the real refreshes

function ArchivePending() {
  const sdk = useSdk();
  const { threads } = experimental_useSidebarThreads();
  const ids = threads.filter((t) => !t.isArchived).map((t) => t.id).sort().join(" ");
  // The status part changes when a turn starts or ends: exactly when a mark is set (end) or cleared (start).
  const sig = threads.map((t) => `${t.id}:${(t as { status?: string }).status ?? ""}`).join(" ");
  const pending = useRef(new Set<string>());
  const repaint = useRef<() => void>(() => undefined);

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      const list = ids ? ids.split(" ") : [];
      if (!list.length) { pending.current = new Set(); repaint.current(); return; }
      try {
        const res = await sdk.threads.experimental_listPluginMetadata({ threadIds: list });
        if (stopped) return;
        // Only the few marked threads need their latest user-message time; the rule decides (rule.ts).
        const marked = res.threads.filter((t) => t.metadata?.pending === true);
        const shown = await Promise.all(marked.map(async (t) => {
          const h = await sdk.threads.timeline({ threadId: t.threadId, segmentLimit: "50" });
          return isPending(t.metadata, latestUserAt(h), false) ? t.threadId : null;
        }));
        if (stopped) return;
        pending.current = new Set(shown.filter((x): x is string => x !== null));
        repaint.current();
      } catch { /* next tick */ }
    };
    void load();
    const soon = window.setTimeout(load, 3000); // a status change can land just before the mark is written
    const timer = window.setInterval(load, POLL_MS);
    return () => { stopped = true; clearInterval(timer); clearTimeout(soon); };
  }, [sdk, ids, sig]);

  useEffect(() => {
    const style = document.createElement("style");
    style.dataset.archivePending = "";
    style.textContent = CSS;
    document.head.append(style);
    let frame = 0;
    const paint = () => {
      frame = 0;
      observer.disconnect();
      const seen = new Set<HTMLElement>();
      const mark = (id: string | undefined, row: HTMLElement | null | undefined) => {
        if (!id || !row || !pending.current.has(id)) return;
        const title = row.querySelector<HTMLElement>(".bb-thread-title");
        if (!title) return;
        row.dataset.apPending = "";
        seen.add(row);
        let m = title.parentElement!.querySelector<HTMLElement>(":scope > .ap-mark");
        if (!m) {
          m = Object.assign(document.createElement("span"), { className: "ap-mark", title: TIP });
          m.setAttribute("aria-label", TIP);
          title.after(m);
        }
        seen.add(m);
      };
      for (const a of document.querySelectorAll<HTMLElement>("a[data-sidebar-thread-id]")) {
        mark(a.dataset.sidebarThreadId, a.closest<HTMLElement>("[data-sidebar-rename-row]"));
      }
      for (const li of document.querySelectorAll<HTMLElement>("[data-root-compose-mobile-recents] li")) {
        mark(li.querySelector("a[href*='/threads/']")?.getAttribute("href")?.match(/\/threads\/([^/?#]+)/)?.[1], li);
      }
      for (const el of document.querySelectorAll<HTMLElement>("[data-ap-pending]")) if (!seen.has(el)) delete el.dataset.apPending;
      for (const el of document.querySelectorAll<HTMLElement>(".ap-mark")) if (!seen.has(el)) el.remove();
      observer.observe(document.body, { childList: true, subtree: true });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };
    const observer = new MutationObserver(schedule);
    repaint.current = schedule;
    schedule();
    return () => {
      repaint.current = () => undefined;
      observer.disconnect();
      cancelAnimationFrame(frame);
      for (const el of document.querySelectorAll(".ap-mark")) el.remove();
      for (const el of document.querySelectorAll<HTMLElement>("[data-ap-pending]")) delete el.dataset.apPending;
      style.remove();
    };
  }, []);

  return null;
}

export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({ id: "archive-pending", component: ArchivePending });
});
