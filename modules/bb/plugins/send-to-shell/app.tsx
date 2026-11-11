// Send to shell: a button on shell code blocks in agent replies. It types the block into this thread's
// terminal (opening one if needed) and never presses Enter: you read it, then run it or not.
import { useState } from "react";
import {
  definePluginApp,
  experimental_Icon as Icon,
  experimental_useAppPanel,
  experimental_usePanelTabs,
  useBbNavigate,
  useSdk,
  type ExperimentalCodeFenceRendererProps,
} from "@get-bb/plugin-sdk/app";

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
  return (
    <div className="relative">
      <Original />
      {status === "closed" ? (
        <button
          type="button"
          onClick={send}
          disabled={state.kind === "sending"}
          title={label}
          aria-label={label}
          className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <Icon
            name={state.kind === "sent" ? "Check" : state.kind === "error" ? "TriangleAlert" : "SquareTerminal"}
            className={state.kind === "error" ? "size-3.5 text-destructive" : "size-3.5"}
            aria-hidden
          />
          <span>{state.kind === "sent" ? "sent" : "shell"}</span>
        </button>
      ) : null}
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_codeFenceRenderer({ id: "shell", languages: SHELL_LANGUAGES, component: ShellFence });
});
