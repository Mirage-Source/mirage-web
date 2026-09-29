import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { collectPages } from "./paging.ts";

function pager(total: number, size: number) {
  const calls: (string | undefined)[] = [];
  const fetchPage = async (after?: string) => {
    calls.push(after);
    const start = after ? Number(after) : 0;
    const items = Array.from({ length: Math.max(Math.min(size, total - start), 0) }, (_, i) => start + i);
    const end = start + items.length;
    return { items, next: items.length === size && end < total + 1 ? String(end) : null };
  };
  return { fetchPage, calls };
}

describe("collectPages", () => {
  it("follows cursors until a short page and keeps order", async () => {
    const { fetchPage, calls } = pager(4500, 2000);
    const all = await collectPages(fetchPage, 100);
    assert.equal(all.length, 4500);
    assert.deepEqual(all.slice(0, 3), [0, 1, 2]);
    assert.equal(all.at(-1), 4499);
    assert.deepEqual(calls, [undefined, "2000", "4000"]);
  });

  it("stops on an empty page at an exact boundary", async () => {
    const { fetchPage, calls } = pager(4000, 2000);
    assert.equal((await collectPages(fetchPage, 100)).length, 4000);
    assert.equal(calls.length, 3);
  });

  it("stops at the page cap", async () => {
    const { fetchPage, calls } = pager(1_000_000, 10);
    assert.equal((await collectPages(fetchPage, 5)).length, 50);
    assert.equal(calls.length, 5);
  });

  it("propagates a failed page", async () => {
    let n = 0;
    await assert.rejects(
      collectPages(async () => {
        if (n++ === 1) throw new Error("upstream 502");
        return { items: [1], next: "x" };
      }, 10),
      /upstream 502/,
    );
  });
});
