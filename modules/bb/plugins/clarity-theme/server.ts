// No server behavior: the theme is the manifest's bb.themes entry. bb requires a server entry, so this is it.
import type { BbPluginApi } from "@get-bb/plugin-sdk";

export default async function plugin(_bb: BbPluginApi) {}
