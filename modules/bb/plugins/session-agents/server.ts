// session-agents' server side: its settings, and the `bb session-agents` command that tags sessions (group, spawner,
// priority) as this plugin's thread metadata. The app reads that metadata to lay out the session list (derive.ts).
import { PluginCliError, cliCommand, defineCli, defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { execFile } from "node:child_process";
import { answeredSince, tierPlan, type Meta, type TurnEvent } from "./derive";

export const rpcContract = defineRpcContract({
  // Open todo claims ({ path, list, id, text, doing, thread, claimed }[]) from the todo app's API; [] without a token.
  claims: { input: z.null(), output: z.any() },
});

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    label: { type: "string", label: "Label after \"Sessions\" in the session list, e.g. which server or domain this is (empty: none)", default: "" },
    workMachines: { type: "string", label: "Machines whose name matches this (regex) get the work icon", default: "work" },
    hostMachines: { type: "string", label: "Machines whose name matches this (regex) are Host agents and get the solid terminal icon", default: "\\bhost$" },
    claireMachines: { type: "string", label: "Claire's machines (regex): they get her HUD ring icon, and their top-level sessions read as started by her, others by Bdon", default: "claire" },
    todoUrl: { type: "string", label: "Todo app URL (sessions holding todo claims show as parked)", default: "https://todo.bdon.ca" },
    accessClientId: { type: "string", label: "Cloudflare Access service token: client ID", default: "" },
    accessClientSecret: { type: "string", label: "Cloudflare Access service token: client secret", secret: true },
  });

  // Claims come from the todo app's HTTP API only. Always start, token or not; without one the answer is [] (no marks).
  let warned = false;
  bb.rpc.register(rpcContract, {
    claims: async () => {
      const { todoUrl, accessClientId, accessClientSecret } = await settings.get();
      if (!accessClientId || !accessClientSecret) {
        if (!warned) { warned = true; bb.log.warn("no Cloudflare Access service token yet (accessClientId / accessClientSecret): no parked marks"); }
        return [];
      }
      const base = String(todoUrl || "https://todo.bdon.ca").replace(/\/+$/, "");
      let res: Response;
      try {
        res = await fetch(`${base}/api/claims`, { redirect: "manual", signal: AbortSignal.timeout(10000), headers: { "CF-Access-Client-Id": String(accessClientId), "CF-Access-Client-Secret": String(accessClientSecret) } });
      } catch (err) {
        throw new Error(`can't reach ${base} (${(err as Error).message})`);
      }
      if (res.status >= 300 && res.status < 400 || res.status === 403 && !res.headers.get("content-type")?.includes("json")) throw new Error(`Cloudflare Access refused this machine's service token for ${base}`);
      if (!res.ok) throw new Error(`todo app answered ${res.status}`);
      const json: unknown = await res.json().catch(() => []);
      return Array.isArray(json) ? json : [];
    },
  });

  const str = (description: string) => ({ type: "string", description }) as const;
  const target = (thread: string | undefined, ctx: { threadId?: string }) => {
    const id = thread || ctx.threadId;
    if (!id) throw new PluginCliError("no session to tag", { code: "no_thread", hint: "Run it from a session, or pass --thread <id>." });
    return id;
  };
  const show = (id: string, m: Record<string, unknown> | null | undefined) =>
    `${id}: ${["group", "spawnedBy", "priority", "tier", "reason", "since"].filter((k) => m?.[k] != null).map((k) => `${k}=${JSON.stringify(m![k])}`).join(" ") || "no tags"}\n`;

  // Needs-bdon marks clear themselves: on Bdon's own next message to the session (after `since`), or when it is archived.
  // The server checks the sessions it knows are marked (seeded from the metadata at start, added by `tag`), because the
  // app only runs while a bb window is open. A relay from another session (`[bb message from thread:`) doesn't count.
  const marked = new Set<string>();
  const clear = (threadId: string) => bb.sdk.threads.updatePluginMetadata({ threadId, remove: ["priority", "reason", "since", "tier"] });
  const sweep = async () => {
    for (const threadId of [...marked]) {
      try {
        const [live] = await bb.sdk.threads.list({ threadIds: [threadId] });
        const m = (await bb.sdk.threads.getPluginMetadata({ threadId })) as unknown as Meta | null;
        if (m?.priority !== "needs-bdon") { marked.delete(threadId); continue; }
        if (!live || live.archivedAt != null) { await clear(threadId); marked.delete(threadId); continue; }
        const events = (await bb.sdk.threads.events.list({ threadId, types: ["client/turn/requested"], order: "desc", limit: "30" })) as unknown as TurnEvent[];
        if (answeredSince(events, m.since)) { await clear(threadId); marked.delete(threadId); }
      } catch (err) { bb.log.warn(`needs-bdon sweep ${threadId}: ${(err as Error).message}`); }
    }
  };
  const sweeper = setInterval(() => void sweep(), 10_000);
  sweeper.unref?.();
  bb.onDispose(() => clearInterval(sweeper));
  void (async () => {
    try {
      const all = await bb.sdk.threads.list({ archived: false });
      for (let i = 0; i < all.length; i += 200) {
        const res = await bb.sdk.threads.experimental_listPluginMetadata({ threadIds: all.slice(i, i + 200).map((t) => t.id) });
        for (const t of res.threads) if ((t.metadata as Meta | undefined)?.priority === "needs-bdon") marked.add(t.threadId);
      }
      await sweep();
    } catch (err) { bb.log.warn(`needs-bdon seed: ${(err as Error).message}`); }
  })();
  // The plugin SDK has no notification call, so the push goes through the CLI: one on the change into needs-bdon.
  const push = async (threadId: string, reason: string | undefined) => {
    const [t] = await bb.sdk.threads.list({ threadIds: [threadId] }).catch(() => []);
    const title = `${String(t?.title ?? t?.titleFallback ?? "A session").trim() || "A session"}: needs you`;
    await new Promise<void>((resolve) => execFile("bb", ["push-notifications", "send", "--title", title, ...(reason ? ["--body", reason] : []), "--thread", threadId], { timeout: 15000 }, (err, _out, stderr) => {
      if (err) bb.log.warn(`needs-bdon push failed: ${stderr || err.message}`);
      resolve();
    }));
  };

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
            priority: str("urgent | blocking | needs-bdon | none: the spawner can't proceed without it (blocking), it fixes something critical (urgent), or it waits on Bdon himself (needs-bdon: pushes one notification, clears on his next message)"),
            tier: str("needs-bdon only: 2 = when I get to it (default, a slow pulse, no notification) | 1 = get my attention now (a faster, brighter pulse and one push notification)"),
            reason: str("Why: the tooltip of the priority mark; for needs-bdon, the second line of the row and the notification text"),
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
            const before = (await bb.sdk.threads.getPluginMetadata({ threadId })) as unknown as Meta | null;
            let notify = false;
            const tier = options.tier === undefined ? undefined : options.tier.trim();
            if (tier !== undefined && tier !== "1" && tier !== "2") throw new PluginCliError(`unknown tier "${options.tier}"`, { code: "bad_tier", hint: "Use 1 (now) or 2 (when I get to it)." });
            if (options.priority !== undefined) {
              const p = options.priority.trim().toLowerCase();
              if (p === "urgent" || p === "blocking") { set.priority = p; remove.push("since"); }
              else if (p === "needs-bdon") {
                set.priority = p;
                if (before?.priority !== "needs-bdon") set.since = new Date().toISOString();
              } else if (p === "none" || p === "") remove.push("priority", "reason", "since", "tier");
              else throw new PluginCliError(`unknown priority "${options.priority}"`, { code: "bad_priority", hint: "Use urgent, blocking, needs-bdon or none." });
            }
            // The tier belongs to needs-bdon only: set with it (default 2 on entry), kept on a re-tag, dropped with any other priority.
            const goingYou = set.priority === "needs-bdon" || (set.priority === undefined && !remove.includes("priority") && before?.priority === "needs-bdon");
            if (!goingYou) { if (tier !== undefined) throw new PluginCliError("--tier only applies to --priority needs-bdon", { code: "tier_without_needs_bdon" }); if (before?.tier !== undefined) remove.push("tier"); }
            else {
              const plan = tierPlan(before, tier as "1" | "2" | undefined);
              set.tier = plan.tier;
              notify = plan.notify;
            }
            if (options.reason !== undefined && !remove.includes("reason")) put("reason", options.reason);
            if (!Object.keys(set).length && !remove.length) throw new PluginCliError("nothing to tag", { code: "no_options", hint: "Pass --group, --spawned-by, --priority or --reason." });
            await bb.sdk.threads.updatePluginMetadata({ threadId, ...(Object.keys(set).length ? { set } : {}), ...(remove.length ? { remove } : {}) });
            const after = (await bb.sdk.threads.getPluginMetadata({ threadId })) as unknown as Meta | null;
            if (after?.priority === "needs-bdon") marked.add(threadId); else marked.delete(threadId);
            if (notify) await push(threadId, after?.reason);
            return { exitCode: 0, stdout: show(threadId, after) };
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
