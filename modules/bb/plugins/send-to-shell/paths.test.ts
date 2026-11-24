// Run: node paths.test.ts
import assert from "node:assert/strict";
import { extractPaths, resolvePath } from "./paths.ts";

const cases: [string, string[]][] = [
  ["bash /tmp/x.sh", ["/tmp/x.sh"]],
  ["bash ~/a/b.sh", ["~/a/b.sh"]],
  ["cd ~/projects/clarity && host/provision.sh clarity", ["~/projects/clarity", "host/provision.sh"]],
  ["kubectl -n argocd get application todo -o yaml", []],
  ["curl -s https://todo.bdon.ca/healthz", []],
  ["foo --out=/tmp/x.json --verbose", []],
  ["# check first\nbash /tmp/a.sh\nsed -i 's/a/b/' \"/tmp/my dir/c.conf\" | tee ./d.log\nls *.txt $HOME/x", ["/tmp/a.sh", "./d.log"]],
  ["bash /tmp/x.sh && bash /tmp/x.sh", ["/tmp/x.sh"]],
];
for (const [code, expected] of cases) assert.deepEqual(extractPaths(code), expected, code);
assert.deepEqual(extractPaths("echo hi\n$ bash /tmp/y.sh\noutput /tmp/nope", "console"), ["/tmp/y.sh"]);

const ws = "/home/u/projects/clarity";
assert.deepEqual(resolvePath("~/a/b.sh", ws), { kind: "host", path: "/home/u/a/b.sh" });
assert.deepEqual(resolvePath("host/p.sh", ws), { kind: "workspace", path: "host/p.sh" });
assert.deepEqual(resolvePath("./d.log", ws), { kind: "workspace", path: "d.log" });
assert.deepEqual(resolvePath(`${ws}/x/y.md`, ws), { kind: "workspace", path: "x/y.md" });
assert.deepEqual(resolvePath("/tmp/x.sh", ws), { kind: "host", path: "/tmp/x.sh" });
assert.deepEqual(resolvePath("/home/u/.bb/thread-storage/thr_abc1/fix.sh", ws), {
  kind: "thread-storage", threadId: "thr_abc1", path: "fix.sh",
});
assert.equal(resolvePath("~/a.sh", null), null);
assert.equal(resolvePath("../x.sh", ws), null);
console.log("paths: ok");
