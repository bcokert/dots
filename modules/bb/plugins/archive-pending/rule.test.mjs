import test from "node:test";
import assert from "node:assert/strict";
import { isPending, latestUserAt } from "./rule.ts";

const iso = (ms) => new Date(ms).toISOString();
const marked = (ms) => ({ pending: true, at: iso(ms) });

test("marked then idle: shown", () => assert.equal(isPending(marked(2000), 1000, false), true));
test("marked, then a new user turn: hidden", () => assert.equal(isPending(marked(2000), 3000, false), false));
test("re-marked in that new turn: shown", () => assert.equal(isPending(marked(4000), 3000, false), true));
test("duplicate/late active events change nothing (rule reads only prompt time)", () => {
  for (let i = 0; i < 3; i++) assert.equal(isPending(marked(2000), 1000, false), true);
});
test("archived: hidden", () => assert.equal(isPending(marked(2000), 1000, true), false));
test("no/cleared/garbage metadata: hidden", () => {
  assert.equal(isPending(undefined, 0, false), false);
  assert.equal(isPending({}, 0, false), false);
  assert.equal(isPending({ pending: true }, 0, false), false);
  assert.equal(isPending({ pending: true, at: "nope" }, 0, false), false);
});
test("latestUserAt takes the newest user row, ignores assistant rows and order", () => {
  const row = (role, createdAt) => ({ kind: "conversation", role, createdAt });
  assert.equal(latestUserAt([row("user", 5), row("assistant", 99), row("user", 9), row("user", 7)]), 9);
  assert.equal(latestUserAt([]), 0);
});
