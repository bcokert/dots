// archive-pending: a session whose job is done says so, and its row shows it until Bdon archives it.
//   bb archive-pending mark    the agent, at the end of a finished job (its last message offers Archive / Keep)
//   bb archive-pending clear   take the mark off (Keep)
//   bb archive-pending status  is this session marked?
// The mark is this plugin's metadata on the thread ({ pending: true, at }). Any new turn clears it (Bdon kept
// talking, so the job isn't over; the agent marks again when it is), and so does archiving or unarchiving.
import { PluginCliError, cliCommand, defineCli, type BbPluginApi } from "@get-bb/plugin-sdk";

export default async function plugin(bb: BbPluginApi) {
  const isMarked = async (threadId: string) => (await bb.sdk.threads.getPluginMetadata({ threadId }))?.pending === true;
  const clear = async (threadId: string) => {
    if (await isMarked(threadId).catch(() => false)) await bb.sdk.threads.updatePluginMetadata({ threadId, remove: ["pending", "at"] });
  };
  const target = (thread: string | undefined, ctx: { threadId?: string }) => {
    const id = thread || ctx.threadId;
    if (!id) throw new PluginCliError("no session to mark", { code: "no_thread", hint: "Run it from a session, or pass --thread <id>." });
    return id;
  };
  const thread = { type: "string", description: "Session (thread) id; default: the one running this command" } as const;

  bb.cli.register(
    defineCli({
      name: "archive-pending",
      summary: "Mark a finished session as waiting to be archived (shown in the session list)",
      commands: {
        mark: cliCommand({
          summary: "Mark this session done: its row shows an archive mark until it's archived or the next turn",
          options: { thread },
          async run({ options }, ctx) {
            const threadId = target(options.thread, ctx);
            await bb.sdk.threads.updatePluginMetadata({ threadId, set: { pending: true, at: new Date().toISOString() } });
            return { exitCode: 0, stdout: `marked ${threadId} as waiting to be archived\n` };
          },
        }),
        clear: cliCommand({
          summary: "Take the mark off (Bdon chose Keep)",
          options: { thread },
          async run({ options }, ctx) {
            const threadId = target(options.thread, ctx);
            await clear(threadId);
            return { exitCode: 0, stdout: `cleared ${threadId}\n` };
          },
        }),
        status: cliCommand({
          summary: "Say whether this session is marked",
          options: { thread },
          async run({ options }, ctx) {
            const threadId = target(options.thread, ctx);
            return { exitCode: 0, stdout: `${threadId}: ${(await isMarked(threadId)) ? "waiting to be archived" : "not marked"}\n` };
          },
        }),
      },
    }),
  );

  for (const event of ["thread.active", "thread.archived", "thread.unarchived"] as const) {
    bb.events.on(event, ({ thread: t }) => clear(t.id).catch((e) => bb.log.warn(`archive-pending: clearing ${t.id} failed: ${e}`)));
  }
}
