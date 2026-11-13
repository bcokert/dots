// todo bb-plugin backend: a client of a todo app's HTTP API, like its web UI, so it works on any bb server that can
// reach the app. The app sits behind Cloudflare Access; this machine signs in with an Access service token
// (accessClientId / accessClientSecret, set by dots from ~/.config/dots/bb.env). The app stays the only thing that
// edits the lists. A background service relays the app's change events to every open bb window.
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

const path = z.string().max(400);
const id = z.string().min(1).max(40);
// The app validates everything; the plugin passes its answers through as-is.
const any = z.any();

export const rpcContract = defineRpcContract({
  list: { input: z.object({ path }), output: any },
  blues: { input: z.null(), output: any },
  item: { input: z.object({ path, id, done: z.boolean().optional(), blue: z.boolean().optional() }), output: any },
  remove: { input: z.object({ path, id }), output: any },
  order: { input: z.object({ path, ids: z.array(id).max(1000) }), output: any },
});

/** Realtime channel the app listens on: something changed in some list. */
export const CHANGED = "todo-changed";

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    url: { type: "string", label: "Todo app URL", default: "https://todo.bdon.ca" },
    accessClientId: { type: "string", label: "Cloudflare Access service token: client ID", default: "" },
    accessClientSecret: { type: "string", label: "Cloudflare Access service token: client secret", secret: true },
  });
  const { url, accessClientId, accessClientSecret } = await settings.get();
  const base = String(url).replace(/\/+$/, "");
  // Always start, token or not: dots can only hand the token to a plugin whose settings it can see, and a plugin
  // that refused to start registers none. Until it's set, calls explain what's missing.
  const configured = Boolean(accessClientId && accessClientSecret);
  if (!configured) bb.log.warn("no Cloudflare Access service token yet (accessClientId / accessClientSecret)");
  const auth = { "CF-Access-Client-Id": String(accessClientId ?? ""), "CF-Access-Client-Secret": String(accessClientSecret ?? "") };

  async function call(method: string, route: string, body?: unknown): Promise<any> {
    if (!configured) {
      throw new Error("This bb server has no Cloudflare Access service token for the todo app yet: add BB_ACCESS_CLIENT_ID / BB_ACCESS_CLIENT_SECRET to ~/.config/dots/bb.env on its computer, then run ./install.sh bb in dots.");
    }
    let res: Response;
    try {
      res = await fetch(base + route, {
        method, redirect: "manual", signal: AbortSignal.timeout(10000),
        headers: { ...auth, ...(body === undefined ? {} : { "content-type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      throw new Error(`can't reach ${base} (${(err as Error).message})`);
    }
    // Access answers a rejected token with a redirect to its login page (or a 403), never the app.
    if (res.status >= 300 && res.status < 400 || res.status === 403 && !res.headers.get("content-type")?.includes("json")) {
      throw new Error(`Cloudflare Access refused this machine's service token for ${base}`);
    }
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `todo app answered ${res.status}`);
    return json;
  }
  const q = (p: string) => encodeURIComponent(p);

  bb.rpc.register(rpcContract, {
    list: ({ path }) => call("GET", `/api/list?path=${q(path)}`),
    blues: () => call("GET", "/api/blues"),
    item: ({ path, id, done, blue }) => call("POST", "/api/item", { path, id, done, blue }),
    remove: ({ path, id }) => call("DELETE", `/api/item?path=${q(path)}&id=${q(id)}`),
    order: ({ path, ids }) => call("POST", "/api/order", { path, ids }),
  });

  // Relay the app's server-sent events: any list changing (an agent, the web UI, another bb window) refreshes all.
  // bb restarts the service when it fails (the stream drops, the app redeploys).
  bb.background.service("app-events", {
    start: async (signal) => {
      if (!configured) return new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
      try {
        const res = await fetch(`${base}/api/events`, { headers: auth, redirect: "manual", signal });
        if (res.status !== 200 || !res.body) throw new Error(`events answered ${res.status}`);
        const reader = res.body.getReader(), text = new TextDecoder();
        for (let r = await reader.read(); !r.done; r = await reader.read()) {
          if (text.decode(r.value, { stream: true }).includes("data: changed")) bb.realtime.publish(CHANGED, {});
        }
        if (!signal.aborted) throw new Error("events stream ended");
      } catch (err) {
        if (!signal.aborted) throw err;
      }
    },
  });
}
