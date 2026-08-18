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

const ALL_TOOLS = [
  "compare_form_factors",
  "compare_origin_vs_url",
  "get_core_web_vitals",
  "get_cwv_trend",
  "query_history_record",
  "query_record",
];

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

    // The initialize result also carries the prose the calling model reads
    // before it picks a tool — an empty one would ship the server unbriefed.
    const instructions = client.getInstructions();
    assert.equal(typeof instructions, "string", "initialize result must carry instructions");
    assert.ok(instructions.trim().length > 0, "instructions must not be empty");
  } finally {
    await client.close();
  }
});

test("dist binary lists all six read-only tools", async () => {
  const client = await connect();
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ALL_TOOLS);
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

/**
 * The degraded-start contract: without CRUX_API_KEY the binary used to exit(1)
 * before the handshake, leaving the client a dead server and no reason. It
 * must now start, list every tool, open the instructions with the fix, and
 * answer a tool call with the actionable error — offline: the CredentialsError
 * fires before any fetch, so this test never touches the network.
 */
test("dist binary starts without CRUX_API_KEY: handshake, tool list, actionable call error", async () => {
  const env = { ...getDefaultEnvironment(), ASKADS_TELEMETRY: "0" };
  delete env.CRUX_API_KEY;
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [DIST_ENTRY],
    env,
  });
  const client = new Client({ name: "dist-smoke-unconfigured", version: "0.0.0" });
  await client.connect(transport);
  try {
    // The model must read the fix before it picks a tool.
    const instructions = client.getInstructions() ?? "";
    assert.match(instructions, /not connected/);
    assert.match(instructions, /CRUX_API_KEY/);
    assert.match(instructions, /restart/);

    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ALL_TOOLS);

    // A tool call fails with the exact message instead of killing the server.
    const result = await client.callTool({
      name: "query_record",
      arguments: { origin: "https://example.com" },
    });
    assert.equal(result.isError, true);
    const text = result.content.map((c) => c.text ?? "").join(" ");
    assert.match(text, /CRUX_API_KEY is required/);
    assert.match(text, /restart the server/);
  } finally {
    await client.close();
  }
});
