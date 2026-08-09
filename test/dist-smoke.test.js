// Smoke test of the built artifact (dist/ — what actually ships to npm): a
// REAL MCP session against the dist binary over stdio, through the official
// SDK client. No network: the only tool invoked fails client-side (origin XOR
// url validation) before any HTTP request.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const DIST_ENTRY = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const PKG = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

async function connect() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [DIST_ENTRY],
    env: {
      ...getDefaultEnvironment(),
      CRUX_API_KEY: "smoke-test-key",
      ASKADS_TELEMETRY: "0",
    },
  });
  const client = new Client({ name: "dist-smoke", version: "0.0.0" });
  await client.connect(transport);
  return client;
}

test("dist binary completes the MCP handshake over stdio and reports its identity", async () => {
  const client = await connect();
  try {
    const info = client.getServerVersion();
    assert.equal(info?.name, "mcp-google-crux");
    assert.equal(info?.version, PKG.version, "server must report the real package version");
  } finally {
    await client.close();
  }
});

test("dist binary lists all six read-only tools", async () => {
  const client = await connect();
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), [
      "compare_form_factors",
      "compare_origin_vs_url",
      "get_core_web_vitals",
      "get_cwv_trend",
      "query_history_record",
      "query_record",
    ]);
    for (const tool of tools) {
      assert.equal(tool.annotations?.readOnlyHint, true, `${tool.name} must be read-only`);
    }
  } finally {
    await client.close();
  }
});

test("dist tools/call enforces origin XOR url without touching the network", async () => {
  const client = await connect();
  try {
    const neither = await client.callTool({ name: "query_record", arguments: {} });
    assert.equal(neither.isError, true);
    assert.match(neither.content[0].text, /exactly one of `origin` or `url`/);

    const both = await client.callTool({
      name: "query_record",
      arguments: { origin: "https://example.com", url: "https://example.com/page" },
    });
    assert.equal(both.isError, true);
    assert.match(both.content[0].text, /exactly one of `origin` or `url`/);
  } finally {
    await client.close();
  }
});
