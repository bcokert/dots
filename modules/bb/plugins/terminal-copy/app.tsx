// Terminal copy: a button on the terminal panel that shows the terminal's text as plain selectable text, with
// Copy all and Add to message. xterm draws to a canvas, so a phone has nothing to long-press; this replays the
// terminal's scrollback (from the bb API) through a headless xterm and prints the result as ordinary text.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Terminal } from "@xterm/headless";
import {
  definePluginApp,
  experimental_Icon as Icon,
  useComposer,
  useSdk,
} from "@get-bb/plugin-sdk/app";

const MAX_BYTES = 2_000_000;
const MAX_LINES = 10_000;
const CSS = `
.tc-btn { position: absolute; top: 4px; right: 4px; z-index: 5; width: 32px; height: 32px; display: flex;
  align-items: center; justify-content: center; border: 0; background: transparent; cursor: pointer;
  color: var(--muted-foreground, #888); opacity: .7; }
.tc-btn:hover { opacity: 1; color: var(--foreground, #000); }
.tc-root { position: fixed; inset: 0; z-index: 2000; display: flex; flex-direction: column;
  background: var(--background, #fff); color: var(--foreground, #000); }
.tc-bar { display: flex; align-items: center; gap: 4px; padding: 6px 8px; padding-top: max(6px, env(safe-area-inset-top));
  border-bottom: 1px solid color-mix(in srgb, currentColor 12%, transparent); font-size: 14px; }
.tc-bar span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: .7; }
.tc-bar button { height: 36px; padding: 0 10px; display: flex; align-items: center; gap: 6px; border: 0;
  background: transparent; color: inherit; font: inherit; cursor: pointer; }
.tc-bar button:disabled { opacity: .4; }
.tc-text { flex: 1; min-height: 0; margin: 0; padding: 8px 12px; overflow: auto; white-space: pre-wrap;
  overflow-wrap: anywhere; font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
  -webkit-user-select: text; user-select: text; -webkit-touch-callout: default; }
`;

/** The terminal's scrollback as text: the daemon's raw output replayed through a headless xterm. */
async function readTerminal(
  sdk: ReturnType<typeof useSdk>,
  terminalId: string,
): Promise<string> {
  const [session, out] = await Promise.all([
    sdk.terminals.get({ terminalId }),
    sdk.terminals.output({ terminalId, tailBytes: MAX_BYTES }),
  ]);
  const parts = out.chunks.map((c) => Uint8Array.from(atob(c.dataBase64), (ch) => ch.charCodeAt(0)));
  const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) (bytes.set(p, at), (at += p.length));
  const term = new Terminal({ cols: session.cols, rows: session.rows, scrollback: MAX_LINES, allowProposedApi: true });
  await new Promise<void>((done) => term.write(bytes, done));
  const buf = term.buffer.active;
  const lines: string[] = [];
  for (let i = 0; i < buf.length; i++) {
    const line = buf.getLine(i);
    if (!line) continue;
    const text = line.translateToString(true);
    if (line.isWrapped && lines.length) lines[lines.length - 1] += text;
    else lines.push(text);
  }
  term.dispose();
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines.join("\n");
}

function Viewer({ terminalId, onClose }: { terminalId: string; onClose: () => void }) {
  const sdk = useSdk();
  const composer = useComposer();
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    let stopped = false;
    readTerminal(sdk, terminalId).then(
      (t) => !stopped && setText(t),
      (e) => !stopped && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      stopped = true;
    };
  }, [sdk, terminalId]);

  // Scroll to the end once the text is in: that's where the error is.
  const pre = (el: HTMLPreElement | null) => {
    if (el) el.scrollTop = el.scrollHeight;
  };
  const flash = (msg: string) => {
    setNote(msg);
    setTimeout(() => setNote(""), 1500);
  };
  // What to act on: the last selection made inside the text, else all of it. Remembered as it changes because
  // tapping a button can drop the live selection on iOS before the click lands.
  const picked = useRef("");
  useEffect(() => {
    const onChange = () => {
      const sel = window.getSelection();
      const inside = sel && sel.rangeCount > 0 && document.querySelector(".tc-text")?.contains(sel.anchorNode);
      if (inside && sel.toString().trim()) picked.current = sel.toString();
      else if (inside) picked.current = "";
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, []);
  const chosen = () => picked.current || (text ?? "");
  async function copy() {
    const value = chosen();
    try {
      await navigator.clipboard.writeText(value);
      flash("Copied");
    } catch {
      const area = document.createElement("textarea");
      area.value = value;
      document.body.append(area);
      area.select();
      flash(document.execCommand("copy") ? "Copied" : "Copy failed: select and use the system menu");
      area.remove();
    }
  }
  function addToMessage() {
    composer.insert("```\n" + chosen().replace(/```/g, "'''") + "\n```", { at: "end", block: true });
    onClose();
  }

  const ready = text !== null && text !== "";
  return (
    <div className="tc-root" role="dialog" aria-label="Terminal text">
      <div className="tc-bar">
        <button type="button" onClick={onClose} aria-label="Close">
          <Icon name="X" fallback="X" className="size-4" aria-hidden />
        </button>
        <span>{note || error || "Select text, or copy all"}</span>
        <button type="button" onClick={copy} disabled={!ready}>
          <Icon name="Copy" fallback="Copy" className="size-4" aria-hidden /> Copy
        </button>
        <button type="button" onClick={addToMessage} disabled={!ready}>
          <Icon name="MessageSquarePlus" fallback="Plus" className="size-4" aria-hidden /> Add to message
        </button>
      </div>
      <pre className="tc-text" ref={pre}>
        {text === null ? (error ? "" : "Loading…") : text || "(nothing in the terminal yet)"}
      </pre>
    </div>
  );
}

/**
 * Which terminal is on screen, from bb's own DOM: the visible `.xterm`'s box, and the terminal id bb passes down
 * to it as a React prop (nothing in the DOM names it, and the panel-tabs hook is empty outside the panel). If bb
 * changes its markup the id isn't found and no button shows, which beats copying the wrong terminal.
 */
function terminalIdOf(el: HTMLElement): string | null {
  const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
  let fiber = key ? (el as unknown as Record<string, any>)[key] : null;
  for (let depth = 0; fiber && depth < 30; depth++, fiber = fiber.return) {
    const id = fiber.memoizedProps?.terminalId;
    if (typeof id === "string" && /^term_/.test(id)) return id;
  }
  return null;
}

function useVisibleTerminal(): { box: HTMLElement; id: string } | null {
  const [found, setFound] = useState<{ box: HTMLElement; id: string } | null>(null);
  useEffect(() => {
    let frame = 0;
    const find = () => {
      frame = 0;
      const el = Array.from(document.querySelectorAll<HTMLElement>(".xterm")).find((x) => x.offsetParent !== null);
      const box = el?.closest<HTMLElement>(".relative") ?? null;
      const id = box ? terminalIdOf(box) : null;
      setFound((old) => (box && id ? (old && old.box === box && old.id === id ? old : { box, id }) : null));
    };
    find();
    const observer = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(find);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "aria-hidden"] });
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return found;
}

function TerminalCopy() {
  const [open, setOpen] = useState<string | null>(null);
  const terminal = useVisibleTerminal();
  const terminalId = terminal?.id ?? null;

  useEffect(() => {
    const style = document.createElement("style");
    style.dataset.terminalCopy = "";
    style.textContent = CSS;
    document.head.append(style);
    return () => style.remove();
  }, []);
  useEffect(() => {
    if (open && open !== terminalId) setOpen(null);
  }, [open, terminalId]);

  const label = "Show terminal text (select and copy)";
  return (
    <>
      {terminal
        ? createPortal(
            <button type="button" className="tc-btn" title={label} aria-label={label} onClick={() => setOpen(terminal.id)}>
              <Icon name="TextSelect" fallback="Copy" className="size-4" aria-hidden />
            </button>,
            terminal.box,
          )
        : null}
      {open ? createPortal(<Viewer terminalId={open} onClose={() => setOpen(null)} />, document.body) : null}
    </>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({ id: "terminal-copy", component: TerminalCopy });
});
