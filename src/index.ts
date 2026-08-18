#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CruxClient } from "./client.js";
import { ConfigError, DEFAULT_BASE, loadConfig } from "./config.js";
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

/**
 * Prepended to INSTRUCTIONS when no API key is configured. The model reads
 * this before it picks a tool, so an unconfigured session opens with the fix
 * rather than with a failed call. There is no in-chat login: the key comes
 * only from the environment, so the fix is an operator action + restart.
 */
const UNCONFIGURED_PREFIX =
  "ATTENTION: the Chrome UX Report server is not connected yet — CRUX_API_KEY is not set, so " +
  "every tool call will fail. The operator must set CRUX_API_KEY (a free Google Cloud API key " +
  "with the Chrome UX Report API enabled; create one at " +
  "https://console.cloud.google.com/apis/credentials) in the MCP client's server config and " +
  "restart this server — the variable is read only at startup. ";

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
 * Loads the config without dying on a bad value. A server that exits here never
 * completes the MCP handshake, so the user sees a dead server and no reason —
 * instead the problem is carried into the session, where the model can read it
 * and relay it. (A missing CRUX_API_KEY is not an error at all — loadConfig
 * leaves the field undefined; today it has no malformed-value checks either,
 * so the catch guards future ones.)
 */
function loadConfigOrDegraded(telemetry: Telemetry): {
  config: CruxConfig;
  problem?: ConfigError;
} {
  try {
    return { config: loadConfig() };
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    console.error(`Error: ${err.message}`);
    // Fire-and-forget now that the process survives: the historical
    // `startup_failed` funnel stays comparable, but nothing blocks startup.
    telemetry.send("startup_failed", { reason: err.reason });
    return {
      config: { apiBase: process.env.CRUX_API_BASE || DEFAULT_BASE },
      problem: err,
    };
  }
}

async function main(): Promise<void> {
  // Anonymous usage pings (ids/names/versions only, never data or arguments);
  // opt out with ASKADS_TELEMETRY=0. Built before the config so a config
  // problem can be reported; wired to the server before tools register.
  const telemetry = new Telemetry(readVersion());
  const { config, problem } = loadConfigOrDegraded(telemetry);
  const client = new CruxClient(config);

  // Decided once, at startup: the key comes only from the environment, so an
  // unconfigured start stays unconfigured until the operator sets the variable
  // and restarts the server — "restart" is the accurate advice to give.
  const connected = Boolean(config.apiKey);

  const server = new McpServer(
    {
      name: "mcp-google-crux",
      version: readVersion(),
    },
    // Surfaces as `instructions` in the initialize result (ServerOptions, not serverInfo).
    {
      instructions: connected
        ? INSTRUCTIONS
        : UNCONFIGURED_PREFIX + (problem ? `Configuration problem: ${problem.message} ` : "") + INSTRUCTIONS,
    },
  );

  instrumentToolCalls(server, telemetry);
  server.server.oninitialized = () => {
    telemetry.setClientInfo(server.server.getClientVersion());
    // Split on purpose: `server_start` keeps meaning "a usable install started",
    // so the unconfigured case gets its own event instead of inflating that
    // number. The reason vocabulary is the historical closed set.
    if (connected) telemetry.send("server_start");
    else telemetry.send("unconfigured_start", { reason: problem?.reason ?? "missing_api_key" });
  };

  registerVitalsTools(server, client);
  registerRecordTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `mcp-google-crux running on stdio${connected ? "" : " (no CRUX_API_KEY — set the environment variable and restart)"}`,
  );
}

main().catch((err) => {
  console.error("Fatal error starting mcp-google-crux:", err);
  process.exit(1);
});
