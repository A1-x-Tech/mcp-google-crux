#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CruxClient } from "./client.js";
import { ConfigError, loadConfig } from "./config.js";
import { instrumentToolCalls, Telemetry } from "./telemetry.js";
import type { CruxConfig } from "./types.js";
import { registerVitalsTools } from "./tools/vitals.js";
import { registerRecordTools } from "./tools/records.js";

/**
 * Prose the calling model receives in the `initialize` result, before it picks a
 * tool — the only place to say what the tool list cannot: which dataset this is
 * (field, not lab), where the API stops, what a call costs against the shared
 * quota and which answers mean something other than they say. English, like the
 * tool descriptions.
 */
const INSTRUCTIONS =
  "The Chrome UX Report (CrUX) API serves aggregated real-user field data from Chrome for any " +
  "public origin or page — no ownership or verification needed, but nothing on private or " +
  "low-traffic pages. It is the field data behind PageSpeed Insights, not a lab tool: nothing is " +
  "measured on demand and there is no optimization advice. Read-only; a request carries only origin " +
  "XOR url, a device class, a metric list and — for history — a week count: no geography, audience " +
  "or arbitrary date range. Data is a 28-day rolling window refreshed daily (~04:00 UTC; history on " +
  "Mondays): the same query returns identical numbers all day — do not poll. Quota: 150 " +
  "requests/min per Cloud project, free, shared by both endpoints, no paid upgrade; " +
  "compare_form_factors spends 4 units and compare_origin_vs_url 2, so avoid looping over many " +
  "URLs. {no_data: true} (HTTP 404) means too little traffic, not a bad request: drop form_factor " +
  "or fall back from url to origin. A permission error is about the key, not the query: its project " +
  "must have the Chrome UX Report API enabled, and key restrictions must allow it.";

/** Reads the package version so the server reports its real version to MCP clients. */
function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Loads the config, reporting the drop-off if it is missing. An unconfigured
 * server dies before the MCP handshake, so this ping is the only trace such an
 * install ever leaves — and it has to be awaited, or process.exit() below would
 * kill the request in flight.
 */
async function loadConfigOrExit(telemetry: Telemetry): Promise<CruxConfig> {
  try {
    return loadConfig();
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    console.error(`Error: ${err.message}`);
    await telemetry.sendBlocking("startup_failed", { reason: err.reason });
    process.exit(1);
  }
}

async function main(): Promise<void> {
  // Anonymous usage pings (ids/names/versions only, never data or arguments);
  // opt out with ASKADS_TELEMETRY=0. Built before the config so a missing key
  // can be reported; wired to the server before tools register.
  const telemetry = new Telemetry(readVersion());
  const config = await loadConfigOrExit(telemetry);
  const client = new CruxClient(config);

  const server = new McpServer(
    {
      name: "mcp-google-crux",
      version: readVersion(),
    },
    // Surfaces as `instructions` in the initialize result (ServerOptions, not serverInfo).
    { instructions: INSTRUCTIONS },
  );

  instrumentToolCalls(server, telemetry);
  server.server.oninitialized = () => {
    telemetry.setClientInfo(server.server.getClientVersion());
    telemetry.send("server_start");
  };

  registerVitalsTools(server, client);
  registerRecordTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-google-crux running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting mcp-google-crux:", err);
  process.exit(1);
});
