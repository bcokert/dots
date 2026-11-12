// session-agents needs no server behaviour; bb requires an entry. Its settings are declared here.
import type { BbPluginApi } from "@get-bb/plugin-sdk";

export default async function plugin(bb: BbPluginApi) {
  bb.settings.define({
    label: { type: "string", label: "Label after \"Sessions\" in the session list, e.g. which server or domain this is (empty: none)", default: "" },
    workMachines: { type: "string", label: "Machines whose name matches this (regex) get the work icon", default: "work" },
  });
}
