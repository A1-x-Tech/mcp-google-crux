# Development

## Requirements

- Node.js 20+ (the published package ships compiled `dist/`; `npx` needs no separate
  install). CI runs the suite on Node 20 and 22.

## Commands

```bash
npm install
npm run dev        # run from source with tsx watch
npm test           # unit tests + dist smoke (node:test), no network
npm run typecheck  # type-check src + tests (no emit)
npm run build      # clean dist/ and compile with tsc
npm run smoke      # live READ-ONLY call: latest LCP record for a sample origin
```

## Local run

```bash
npm run build
CRUX_API_KEY=... node dist/index.js
# optional: CRUX_API_BASE, CRUX_TIMEOUT_MS, CRUX_MAX_RETRIES
```

`npm run smoke` needs the same key and makes one live read (no writes exist).
Pass a different origin as an argument: `npm run smoke -- https://web.dev`.

## Tests

Unit tests mock `globalThis.fetch` (client) or use a fake server + fake client
(tools), so the whole suite runs offline. `test/dist-smoke.test.js` goes further:
it spawns the built `dist/index.js` binary and completes a **real MCP handshake
over stdio** through the official SDK client — listing the tools and exercising
the client-side origin-XOR-url validation without any network. Put a `*.test.ts`
next to the code it covers; `npm run typecheck && npm test` is the gate (also run
by `prepublishOnly`).

## Usage telemetry

The server sends anonymous events to `usage.gistrec.cloud` (`server_start` when a
client connects and `tool_call` with the tool **name**) to count active installs
and tool demand. An event carries only de-identified technical fields: a random
installation id (`~/.config/mcp-google-crux/instance-id`), the package version,
the AI client's name and version from the MCP handshake, the Node.js version and
the OS.

The API key, queried origins/URLs, tool arguments and prompts are never sent or
stored (implementation: `src/telemetry.ts`). Sends run in the background with a
2-second cap and are silently skipped on any error. Opt out for every MCP server
by this author at once: `ASKADS_TELEMETRY=0`.
