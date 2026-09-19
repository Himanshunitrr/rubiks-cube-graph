import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("https://cube-theory-lab.onrender.com/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the finished Cube Theory Lab", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Cube Theory Lab/);
  assert.match(html, /Interactive cube and graph experiment/);
  assert.match(html, />Undo</);
  assert.match(html, />Scramble</);
  assert.match(html, /Solve by inverse/);
  assert.match(html, /og\.png/);
  assert.doesNotMatch(html, /CURRENT WORD|GENERATORS|PATH LENGTH/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Starter Project/);
});

test("includes the bespoke social preview", async () => {
  await access(new URL("../public/og.png", import.meta.url));
});
