// Send to shell: a button on shell code blocks in agent replies. It types the block into this thread's
// terminal (opening one if needed) and never presses Enter: you read it, then run it or not.
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  definePluginApp,
  experimental_Icon as Icon,
  experimental_useAppPanel,
  experimental_usePanelTabs,
  useBbNavigate,
  useSdk,
  type ExperimentalCodeFenceRendererProps,
} from "@get-bb/plugin-sdk/app";

import { baseName, extractPaths, resolvePath } from "./paths.ts";

const SHELL_LANGUAGES = ["bash", "sh", "shell", "zsh", "console"];

/**
 * The block as terminal input that can't run itself. Model output is untrusted, so: drop every control
 * character except tab and newline (an ESC could end bracketed paste early, and a CR is Enter), drop the
 * trailing newline, and wrap the rest in bracketed paste so a multi-line block lands in the prompt as one
 * edit instead of running line by line. `console` blocks keep only their `$ ` lines, without the `$ `.
 */
export function toTerminalInput(code: string, language: string): string {
  let text = code.replace(/\r\n?/g, "\n");
  if (language === "console") {
    const commands = text.split("\n").filter((line) => line.startsWith("$ "));
    if (commands.length > 0) text = commands.map((line) => line.slice(2)).join("\n");
  }
  text = text.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, "").replace(/^\n+|\n+$/g, "");
  return `\u001b[200~${text}\u001b[201~`;
}

function toBase64(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

type SendState = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

function ShellFence({ code, language, status, message, Original }: ExperimentalCodeFenceRendererProps) {
  const sdk = useSdk();
  const navigate = useBbNavigate();
  const panel = experimental_useAppPanel();
  const { tabs, selectedKey } = experimental_usePanelTabs();
  const [state, setState] = useState<SendState>({ kind: "idle" });

  // Which terminal: the one you're looking at, else this thread's most recently used, else a new one.
  async function pickTerminal(): Promise<string> {
    const terminalTabs = tabs.flatMap((tab) =>
      tab.detail.kind === "terminal" ? [{ key: tab.key, id: tab.detail.terminalId }] : [],
    );
    const visible = terminalTabs.find((tab) => tab.key === selectedKey);
    if (visible) {
      const session = await sdk.terminals.get({ terminalId: visible.id });
      if (session.status === "running" && session.threadId === message.threadId) return session.id;
    }
    const { sessions } = await sdk.terminals.list({ scope: { kind: "thread", threadId: message.threadId } });
    const recent = sessions
      .filter((session) => session.status === "running")
      .sort((a, b) => (b.lastUserInputAt ?? b.createdAt) - (a.lastUserInputAt ?? a.createdAt))[0];
    if (recent) return recent.id;
    const created = await sdk.terminals.create({
      scope: { kind: "thread", threadId: message.threadId },
      cols: 120,
      rows: 32,
      title: "shell",
    });
    return created.id;
  }

  async function send() {
    setState({ kind: "sending" });
    try {
      const terminalId = await pickTerminal();
      await sdk.terminals.input({ terminalId, dataBase64: toBase64(toTerminalInput(code, language)) });
      const tab = tabs.find((t) => t.detail.kind === "terminal" && t.detail.terminalId === terminalId);
      if (!(tab && panel.selectTab(tab.key))) await navigate.experimental_openTerminal({ terminalId });
      setState({ kind: "sent" });
      setTimeout(() => setState({ kind: "idle" }), 1500);
    } catch (cause) {
      setState({ kind: "error", message: cause instanceof Error ? cause.message : String(cause) });
    }
  }

  const label =
    state.kind === "sent"
      ? "In the shell: review, then Enter"
      : state.kind === "error"
        ? `Couldn't send: ${state.message}`
        : "Send to shell (doesn't run it)";
  const button = (
    <button
      type="button"
      onClick={send}
      disabled={state.kind === "sending"}
      title={label}
      aria-label={label}
      className="inline-flex size-5 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
    >
      <Icon
        name={state.kind === "sent" ? "Check" : state.kind === "error" ? "TriangleAlert" : "Terminal"}
        fallback="Terminal"
        className={state.kind === "error" ? "size-3.5 text-destructive" : "size-3.5"}
        aria-hidden
      />
    </button>
  );
  const slot = useToolbarSlot(status === "closed");
  const paths = status === "closed" ? extractPaths(code, language).slice(0, MAX_PATH_LINKS) : [];
  return (
    <div ref={slot.ref}>
      <Original />
      {paths.length > 0 ? <PathLinks paths={paths} threadId={message.threadId} /> : null}
      {status !== "closed" ? null : slot.node ? (
        createPortal(button, slot.node)
      ) : (
        <div className="-mt-1 mb-2 flex justify-end">{button}</div>
      )}
    </div>
  );
}

const MAX_PATH_LINKS = 4;

/**
 * "Open <file>" under the block for each file the command mentions, so you can read a script before running it.
 * Opens bb's own file preview (the file-diff plugin's opener, if a file has changes). Looking up the thread's
 * machine and folder waits for the click, so a block you never touch costs nothing.
 */
function PathLinks({ paths, threadId }: { paths: string[]; threadId: string }) {
  const sdk = useSdk();
  const navigate = useBbNavigate();
  const [error, setError] = useState<string | null>(null);

  async function open(raw: string) {
    setError(null);
    try {
      const thread = await sdk.threads.get({ threadId });
      const environmentId = "environmentId" in thread ? thread.environmentId : null;
      const environment = environmentId ? await sdk.environments.get({ environmentId }) : null;
      const target = resolvePath(raw, environment?.path ?? null);
      if (!target) throw new Error(`can't resolve ${raw}`);
      let opened = false;
      if (target.kind === "thread-storage") {
        opened = navigate.experimental_openFilePreview({ target, location: null });
      } else if (target.kind === "workspace") {
        if (!environmentId) throw new Error("this thread has no workspace");
        opened = navigate.experimental_openFilePreview({
          target: { kind: "workspace", environmentId, path: target.path },
          location: null,
        });
      } else {
        if (!environment) throw new Error("this thread has no machine");
        opened = navigate.experimental_openFilePreview({
          target: { kind: "host", hostId: environment.hostId, path: target.path },
          location: null,
        });
      }
      if (!opened) throw new Error(`bb wouldn't open ${raw}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <div className="-mt-1 mb-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
      {paths.map((raw) => (
        <button
          key={raw}
          type="button"
          onClick={() => open(raw)}
          title={`Open ${raw}`}
          className="inline-flex max-w-full cursor-pointer items-center gap-1 text-muted-foreground transition-colors hover:text-foreground hover:underline"
        >
          <Icon name="FileText" fallback="Terminal" className="size-3 shrink-0" aria-hidden />
          <span className="truncate">Open {baseName(raw)}</span>
        </button>
      ))}
      {error ? <span className="text-destructive">{error}</span> : null}
    </div>
  );
}

/**
 * A spot for our button in BB's own code-block toolbar, first in line before Wrap lines and Copy code. BB has no
 * slot for toolbar actions, so this finds the toolbar (the parent of the Copy code button) and keeps a node at its
 * start, re-adding it if BB re-renders the block. No toolbar found (BB changed its markup): node stays null and
 * the button renders in a row under the block instead, never over the code.
 */
function useToolbarSlot(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [node, setNode] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!enabled || !root) return;
    const mount = document.createElement("span");
    mount.className = "contents";
    const attach = () => {
      const toolbar = root.querySelector('button[aria-label="Copy code"]')?.parentElement;
      if (!toolbar) return setNode(null);
      if (mount.parentElement !== toolbar) toolbar.prepend(mount);
      setNode(mount);
    };
    attach();
    const observer = new MutationObserver(attach);
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      mount.remove();
    };
  }, [enabled]);
  return { ref, node };
}

export default definePluginApp((app) => {
  app.slots.experimental_codeFenceRenderer({ id: "shell", languages: SHELL_LANGUAGES, component: ShellFence });
});
