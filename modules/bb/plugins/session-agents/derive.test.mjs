// Run: node derive.test.mjs
import assert from "node:assert/strict";
import { groupOf, spawnerOf, layout, pipsFor } from "./derive.ts";

const threads = {
  h1: { id: "h1", projectId: "p", parentThreadId: null },
  h2: { id: "h2", projectId: "p", parentThreadId: null },
  a: { id: "a", projectId: "p", parentThreadId: null },
  b: { id: "b", projectId: "p", parentThreadId: "a" }, // native parent
  c: { id: "c", projectId: "p", parentThreadId: null }, // tagged spawner b
  d: { id: "d", projectId: "p", parentThreadId: null },
  e: { id: "e", projectId: "p", parentThreadId: null },
  f: { id: "f", projectId: "p", parentThreadId: null }, // a group of one
  j1: { id: "j1", projectId: "p", parentThreadId: null },
  j2: { id: "j2", projectId: "p", parentThreadId: null },
};
const meta = {
  h1: { group: "Health" }, h2: { group: "health" },
  a: { group: "Money" }, c: { spawnedBy: "b" }, d: { group: "Money" },
  f: { group: "Solo" }, j2: { group: "Money" }, b: { spawnedBy: "d" },
};
const ctx = {
  thread: (id) => threads[id], meta: (id) => meta[id],
  jobMates: (id) => (id === "j1" || id === "j2" ? ["j1", "j2"] : []),
};

// group inheritance: own > spawner chain > job > none
assert.equal(groupOf("a", ctx), "Money");
assert.equal(groupOf("c", ctx), "Money", "c inherits through b -> a");
assert.equal(groupOf("j1", ctx), "Money", "job mate's group");
assert.equal(groupOf("e", ctx), null);
// spawner precedence: native parent wins over the tag
assert.equal(spawnerOf("b", ctx), "a");
assert.equal(spawnerOf("c", ctx), "b");
assert.equal(spawnerOf("e", ctx), null);
// cycles don't hang
meta.x = { spawnedBy: "y" }; meta.y = { spawnedBy: "x" };
threads.x = { id: "x", projectId: "p", parentThreadId: null }; threads.y = { id: "y", projectId: "p", parentThreadId: null };
assert.equal(groupOf("x", ctx), null);

// layout: Health first, then Solo (a group of one) and Money by first appearance, then ungrouped; spawned rows directly under their spawner
const ids = ["e", "f", "c", "d", "b", "a", "h1", "j1", "h2", "j2"];
const L = layout(ids, ctx);
const ordered = [...L].sort((p, q) => p[1].order - q[1].order).map(([id]) => id);
assert.deepEqual(ordered.slice(0, 2), ["h1", "h2"], "health first");
const money = ordered.filter((id) => L.get(id).group === "Money");
assert.deepEqual([...money].sort(), ["a", "b", "c", "d", "j1", "j2"]);
assert.ok(ordered.indexOf("a") < ordered.indexOf("b") && ordered.indexOf("b") === ordered.indexOf("a") + 1, "b right under a");
assert.equal(ordered[ordered.indexOf("b") + 1], "c", "c right under b");
assert.equal(L.get("a").depth, 0); assert.equal(L.get("b").depth, 1); assert.equal(L.get("c").depth, 2);
assert.equal(L.get("f").group, "Solo", "a group of one is still a group");
assert.ok(ordered.indexOf("f") < ordered.indexOf(money[0]), "Solo first appears before Money");
assert.ok(ordered.indexOf("e") > ordered.indexOf("j2") && ordered.indexOf("e") > ordered.indexOf("f"), "ungrouped last");
// headers: one per shown group, on its first row
assert.equal(L.get("h1").header, "Health");
assert.equal(ids.filter((id) => L.get(id).header).length, 3);
assert.equal(L.get(money[0]).header, "Money");
assert.equal(L.get("f").header, "Solo");
// every group gets a header, even alone
assert.equal(layout(["h1", "e"], ctx).get("h1").header, "Health");
assert.equal(layout(["a", "e"], ctx).get("a").header, "Money", "a group of one gets its header");

// pips: job phases 1..4, now = 3
assert.deepEqual(pipsFor([1, 2, 3, 4], 3), ["done", "done", "now", "next"]);
assert.deepEqual(pipsFor([1, 3], 3), ["done", "now"], "gaps follow the job's own phases");
assert.deepEqual(pipsFor(null, 4), ["done", "done", "done", "now"], "lone phase N draws N pips");
console.log("derive: ok");
