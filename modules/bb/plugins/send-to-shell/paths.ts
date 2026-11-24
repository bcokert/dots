// Which words in a shell block are files you might want to read before running it. Pure text work, no bb
// imports, so `node paths.test.ts` can check it. Conservative: a miss costs nothing, a bad link is noise.

const OPERATORS = /&&|\|\||[;|<>()&]/g;

function unquote(word: string): string {
  const quoted = /^(['"])(.*)\1$/.exec(word);
  return quoted ? quoted[2] : word;
}

/** The commands of a block: `console` blocks keep only their `$ ` lines, comments and blanks go. */
function commandLines(code: string, language: string): string[] {
  let lines = code.replace(/\r\n?/g, "\n").split("\n");
  if (language === "console") {
    const prompts = lines.filter((line) => line.startsWith("$ "));
    if (prompts.length > 0) lines = prompts.map((line) => line.slice(2));
  }
  return lines.map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
}

function looksLikeFile(word: string): boolean {
  if (!word || word.length > 400) return false;
  if (word.startsWith("-") || word.endsWith("/")) return false; // flags, directories
  if (/:\/\//.test(word) || /^[\w.+-]+@[\w.-]+:/.test(word)) return false; // URLs, scp-style remotes
  if (/[*?[\]{}$`=!,]/.test(word)) return false; // globs, variables, KEY=value, --flag=value
  if (/\s/.test(word)) return false;
  if (word.startsWith("/") || word === "~" || word.startsWith("~/")) return word !== "/" && word !== "~";
  if (/^\.{1,2}$/.test(word)) return false;
  return word.includes("/") || /\.[A-Za-z][A-Za-z0-9]*$/.test(word);
}

/** File-looking paths in a shell block, in order of first appearance, without duplicates. */
export function extractPaths(code: string, language = "bash"): string[] {
  const found: string[] = [];
  for (const line of commandLines(code, language)) {
    for (const segment of line.replace(OPERATORS, "\n").split("\n")) {
      for (const raw of segment.match(/"[^"]*"|'[^']*'|\S+/g) ?? []) {
        const word = unquote(raw);
        if (looksLikeFile(word) && !found.includes(word)) found.push(word);
      }
    }
  }
  return found;
}

export function baseName(path: string): string {
  return path.replace(/\/+$/, "").split("/").pop() || path;
}

export type FileTarget =
  | { kind: "workspace"; path: string }
  | { kind: "host"; path: string }
  | { kind: "thread-storage"; threadId: string; path: string };

/**
 * Where a path from the block lives. `workspacePath` is the thread's environment folder (where the agent's
 * commands run); `~` becomes the home folder guessed from it (`/home/<user>` or `/Users/<user>`), and is
 * unresolvable (null) when that guess fails. Anything under bb's thread storage opens as thread storage,
 * anything under the workspace as a workspace file, the rest as a host file.
 */
export function resolvePath(raw: string, workspacePath: string | null): FileTarget | null {
  const root = workspacePath ? workspacePath.replace(/\/+$/, "") : null;
  let path = raw;
  if (path === "~" || path.startsWith("~/")) {
    const home = root ? /^(\/home\/[^/]+|\/Users\/[^/]+)/.exec(root)?.[1] : undefined;
    if (!home) return null;
    path = home + path.slice(1);
  }
  if (!path.startsWith("/")) {
    const relative = path.replace(/^(\.\/)+/, "");
    if (relative.split("/").includes("..")) return null;
    return { kind: "workspace", path: relative };
  }
  const storage = /\/\.bb\/thread-storage\/(thr_[A-Za-z0-9]+)\/(.+)$/.exec(path);
  if (storage) return { kind: "thread-storage", threadId: storage[1], path: storage[2] };
  if (root && path.startsWith(root + "/")) return { kind: "workspace", path: path.slice(root.length + 1) };
  return { kind: "host", path };
}
