// session-agents' server side: its settings, and the `bb session-agents` command that tags sessions (group, spawner,
// priority) as this plugin's thread metadata. The app reads that metadata to lay out the session list (derive.ts).
import { PluginCliError, cliCommand, defineCli, type BbPluginApi } from "@get-bb/plugin-sdk";

export default async function plugin(bb: BbPluginApi) {
  bb.settings.define({
    label: { type: "string", label: "Label after \"Sessions\" in the session list, e.g. which server or domain this is (empty: none)", default: "" },
    workMachines: { type: "string", label: "Machines whose name matches this (regex) get the work icon", default: "work" },
    hostMachines: { type: "string", label: "Machines whose name matches this (regex) are Host agents and get the solid terminal icon", default: "\\bhost$" },
    claireMachines: { type: "string", label: "Top-level sessions on a machine whose name matches this (regex) read as started by Claire, others by Bdon", default: "claire" },
  });

  const str = (description: string) => ({ type: "string", description }) as const;
  const target = (thread: string | undefined, ctx: { threadId?: string }) => {
    const id = thread || ctx.threadId;
    if (!id) throw new PluginCliError("no session to tag", { code: "no_thread", hint: "Run it from a session, or pass --thread <id>." });
    return id;
  };
  const show = (id: string, m: Record<string, unknown> | null | undefined) =>
    `${id}: ${["group", "spawnedBy", "priority", "reason"].filter((k) => m?.[k] != null).map((k) => `${k}=${JSON.stringify(m![k])}`).join(" ") || "no tags"}\n`;

  bb.cli.register(
    defineCli({
      name: "session-agents",
      summary: "Tag sessions so the session list can group, nest and prioritise them",
      commands: {
        tag: cliCommand({
          summary: "Set a session's group, spawner and priority (only the options you pass change)",
          options: {
            thread: str("Session (thread) id; default: the one running this command"),
            group: str("Group name shown as a header in the session list; \"\" clears it. Health gets the red pulse icon"),
            "spawned-by": str("Session that spawned this one; default when --thread is another session: the one running this command. \"\" clears it"),
            priority: str("urgent | blocking | none: the spawner can't proceed without it (blocking) or it fixes something critical (urgent)"),
            reason: str("Why, shown as the tooltip of the priority mark"),
          },
          async run({ options }, ctx) {
            const threadId = target(options.thread, ctx);
            const set: Record<string, string> = {};
            const remove: string[] = [];
            const put = (key: string, v: string | undefined) => {
              if (v === undefined) return;
              if (v.trim()) set[key] = v.trim(); else remove.push(key);
            };
            put("group", options.group);
            const other = threadId !== ctx.threadId && ctx.threadId;
            put("spawnedBy", options["spawned-by"] ?? (other ? ctx.threadId : undefined));
            if (options.priority !== undefined) {
              const p = options.priority.trim().toLowerCase();
              if (p === "urgent" || p === "blocking") set.priority = p;
              else if (p === "none" || p === "") remove.push("priority", "reason");
              else throw new PluginCliError(`unknown priority "${options.priority}"`, { code: "bad_priority", hint: "Use urgent, blocking or none." });
            }
            if (options.reason !== undefined && !remove.includes("reason")) put("reason", options.reason);
            if (!Object.keys(set).length && !remove.length) throw new PluginCliError("nothing to tag", { code: "no_options", hint: "Pass --group, --spawned-by, --priority or --reason." });
            await bb.sdk.threads.updatePluginMetadata({ threadId, ...(Object.keys(set).length ? { set } : {}), ...(remove.length ? { remove } : {}) });
            return { exitCode: 0, stdout: show(threadId, await bb.sdk.threads.getPluginMetadata({ threadId })) };
          },
        }),
        show: cliCommand({
          summary: "Show a session's tags",
          options: { thread: str("Session (thread) id; default: the one running this command") },
          async run({ options }, ctx) {
            const threadId = target(options.thread, ctx);
            return { exitCode: 0, stdout: show(threadId, await bb.sdk.threads.getPluginMetadata({ threadId })) };
          },
        }),
      },
    }),
  );
}
