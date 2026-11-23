// File diff: a file opener that shows a workspace file's uncommitted diff, with a Diff | File toggle.
// Files without uncommitted changes, host files and thread-storage files render bb's own preview (Original).
import { useState } from "react";
import { defineRpcContract } from "@get-bb/plugin-sdk";
import {
  definePluginApp,
  experimental_Diff as Diff,
  experimental_useRpcKeyedQuery,
  experimental_useRpcQuery,
  type PluginFileOpenerProps,
} from "@get-bb/plugin-sdk/app";
import { z } from "zod";

// bb picks an opener by the basename's last-dot extension, so extensionless files (Dockerfile, Makefile) and
// dotfiles (.env, .zshrc) have none and can't be matched here. There's no wildcard.
export const EXTENSIONS = [
  "sh", "bash", "zsh", "fish", "ps1",
  "md", "mdx", "txt", "rst",
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts",
  "json", "jsonc", "json5", "yaml", "yml", "toml", "ini", "conf", "cfg", "env", "local", "properties",
  "xml", "plist", "csv", "tsv", "sql", "graphql", "proto",
  "css", "scss", "less", "html", "htm", "svg", "vue", "svelte", "astro",
  "py", "rb", "go", "rs", "java", "kt", "kts", "swift", "c", "h", "cc", "cpp", "hpp", "m", "cs", "php", "lua",
  "pl", "r", "dart", "scala", "ex", "exs", "erl", "hs", "clj", "nix", "tf", "tfvars", "hcl", "lock", "log", "text",
  "adoc", "bat", "cmd", "cxx", "hh", "mm", "fs", "gql", "groovy", "jl", "pyi", "zig", "dockerfile", "diff", "patch",
] as const;

const target = { type: "uncommitted" as const };

// Only the parts of bb--git's contract this plugin reads (`bb plugin rpc inspect bb--git` has the rest).
const failure = z.object({ outcome: z.enum(["not_applicable", "unavailable"]) });
const git = defineRpcContract({
  files: {
    input: z.object({
      environmentId: z.string(),
      target: z.object({ type: z.literal("uncommitted") }),
      ignoreWhitespace: z.boolean(),
    }),
    output: z.union([
      z.object({
        outcome: z.literal("available"),
        files: z.array(
          z.object({
            path: z.string(),
            binary: z.boolean(),
            loadMode: z.enum(["auto", "on_demand", "too_large"]),
            revision: z.string(),
          }),
        ),
      }),
      failure,
    ]),
  },
  patches: {
    input: z.object({ keys: z.array(z.string()) }),
    output: z.record(
      z.string(),
      z.union([
        z.object({
          outcome: z.literal("available"),
          patch: z.object({ path: z.string(), patch: z.string(), truncated: z.boolean() }),
        }),
        failure,
      ]),
    ),
  },
});

/** bb--git's patch key (its gitPatchKey): one file at one revision, for one environment and target. */
export function patchKey(environmentId: string, path: string, revision: string): string {
  return JSON.stringify([environmentId, target, false, path, revision]);
}

function DiffOpener({ path, source, Original }: PluginFileOpenerProps) {
  const environmentId = source.kind === "workspace" ? source.environmentId : null;
  const files = experimental_useRpcQuery({
    pluginId: "bb--git",
    contract: git,
    method: "files",
    input: { environmentId: environmentId ?? "", target, ignoreWhitespace: false },
    enabled: environmentId !== null,
  });
  const listed = files.data?.outcome === "available" ? files.data.files.find((file) => file.path === path) : undefined;
  const changed = listed !== undefined && !listed.binary && listed.loadMode !== "too_large" ? listed : undefined;
  const key = changed && environmentId ? patchKey(environmentId, path, changed.revision) : null;
  const patches = experimental_useRpcKeyedQuery({
    pluginId: "bb--git",
    contract: git,
    method: "patches",
    keys: key ? [key] : [],
    enabled: key !== null,
  });
  const row = key ? patches.data?.[key] : undefined;
  const patch = row?.outcome === "available" && row.patch.patch.trim() !== "" ? row.patch : null;
  const [view, setView] = useState<"diff" | "file">("diff");

  // Still finding out whether there's a diff: show nothing rather than flash the file, then swap.
  if (environmentId !== null && (files.isLoading || (key !== null && patches.isLoading))) return null;
  if (patch === null) return <Original />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-end gap-2 px-3 py-1.5 text-xs">
        {patch.truncated && <span className="text-muted-foreground">Diff truncated</span>}
        <div role="tablist" aria-label="View" className="flex">
          {(["diff", "file"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={view === option}
              onClick={() => setView(option)}
              className={
                "rounded px-2 py-0.5 " +
                (view === option ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")
              }
            >
              {option === "diff" ? "Diff" : "File"}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {view === "diff" ? <Diff patch={patch.patch} path={path} /> : <Original />}
      </div>
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.fileOpener({ id: "diff", title: "Diff", extensions: EXTENSIONS, component: DiffOpener });
});
