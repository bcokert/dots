// No server behavior: everything happens in app.tsx with the signed-in user's own bb session.
// bb requires a server entry, so this is it.
import type { BbPluginApi } from "@get-bb/plugin-sdk";

export default async function plugin(_bb: BbPluginApi) {}
