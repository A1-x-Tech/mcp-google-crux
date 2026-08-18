# CLAUDE.md — mcp-google-crux

MCP server for the Chrome UX Report (CrUX) API (TypeScript, stdio). Read-only:
convenience tools compute Core Web Vitals assessments, device breakdowns and p75
trends on top of two raw pass-through tools. The server talks to
**chromeuxreport.googleapis.com** — exactly two POST-only endpoints
(`/v1/records:queryRecord`, `/v1/records:queryHistoryRecord`); auth is a Google
Cloud API key riding as the `key=` query parameter (no OAuth).

## Commands

```bash
npm run dev        # run from source (tsx watch)
npm test           # unit tests + dist smoke, no network
npm run typecheck  # types for src + tests
npm run build      # emit dist/
npm run smoke      # live READ-ONLY call (needs CRUX_API_KEY)
```

## Architecture

- `src/config.ts` — env → config. A missing `CRUX_API_KEY` is NOT an error: the field stays
  `undefined`, the server starts degraded and the client raises `CredentialsError` (lives in
  `types.ts`) at call time. `ConfigError` (with a `reason` code) is reserved for malformed
  values, caught by `loadConfigOrDegraded` in `index.ts` (no such checks exist today).
  Optional `CRUX_API_BASE`, `CRUX_TIMEOUT_MS`, `CRUX_MAX_RETRIES`.
- `src/client.ts` — `queryRecord`/`queryHistoryRecord` → `v1/records:*` paths: POST only
  (GET answers a misleading 404), key injected as `key=` query param, `formFactor` mapped
  from normalized `phone|desktop|tablet` to `PHONE|DESKTOP|TABLET`, origin XOR url enforced
  before any fetch. `request()` first rejects a missing `CRUX_API_KEY` with `CredentialsError`
  (before the URL is built, the retries and fetch — the message is the product: it names the
  variable to set and the needed restart), then rejects paths that escape to a foreign origin
  (SSRF guard), retries 429/5xx/network errors with backoff (honors `Retry-After`), enforces an
  AbortController timeout that also covers reading the body, throws `CruxError(status, body)`
  — and `CruxNoDataError` for 404, which is a *normal* "no data" answer.
- `src/cwv.ts` — pure CWV logic (no I/O): metric vocabulary, p75 thresholds, ratings,
  record summarization and trend extraction. All format quirks are handled here.
- `src/tools/vitals.ts` — `get_core_web_vitals`, `compare_form_factors` (4 requests),
  `compare_origin_vs_url` (2 requests), `get_cwv_trend`. `src/tools/records.ts` —
  `query_record`, `query_history_record` (raw pass-through). `src/tools/util.ts` —
  `ok`/`fail`/`noDataResult`, the `READ_ONLY` annotation and shared zod schema factories.
- `src/index.ts` — wires every `register*` into the McpServer. `loadConfigOrDegraded` starts
  the server even on a config problem; without a key the initialize `instructions` open with
  the unconfigured prefix (set `CRUX_API_KEY` and restart), plus `Configuration problem: …`
  when a `ConfigError` was caught.
- `src/telemetry.ts` — anonymous usage pings (ids/names/versions only, never the key,
  queried origins/URLs or arguments; fire-and-forget, must never block or throw; opt-out
  `ASKADS_TELEMETRY=0`). `server_start` means "a usable install started"; an install without
  a key sends `unconfigured_start` instead. The `reason` is a closed vocabulary
  (`missing_api_key`) — never a variable's name or value. `startup_failed` remains for a
  config unusable at load time (malformed values), also fire-and-forget.

## Conventions (do not break)

- **Never exit because of configuration.** A server that dies before the MCP handshake leaves
  the user with a red cross and no reason — telemetry across this line of servers showed that
  state accounted for nearly every unconfigured install. A missing `CRUX_API_KEY` is a
  survivable state: start, answer `initialize`/`tools/list` (with the unconfigured prefix in
  the instructions), and reject tool calls with `CredentialsError`. There are no login tools:
  the key comes only from the environment, so the fix is the operator setting `CRUX_API_KEY`
  and restarting the server. `config.test.ts`, `client.test.ts` and `test/dist-smoke.test.js`
  pin this.
- **Credential failures are not transport failures.** `CredentialsError` is thrown before the
  URL is built and before the retry/backoff loop in `request()` — retrying it burns seconds
  of backoff before the user sees the one message that helps. Pinned by the "fetch must not
  be called" assertion in `client.test.ts`.
- **Read-only.** The CrUX API has no write endpoints; all six tools carry `READ_ONLY`.
  Don't add write paths.
- **404 is data absence, not an error.** The client throws `CruxNoDataError`; every tool
  maps it to a `{no_data: true}` result (`noDataResult`/`isNoData` in util.ts), and the
  compare tools tolerate per-request gaps (tablet almost always lacks data).
- **Wire mapping lives in the client, not the tools.** Tools accept normalized inputs
  (`phone|desktop|tablet`, snake_case field names) and must not know the wire vocabulary.
- **The API key is the client's job** — injected as the `key=` query param in `request()`;
  it must never appear in logs, error messages or timeout labels (label = path only), and
  `fail()` scrubs `key=` values as defense in depth.
- **Parse CrUX values defensively** — in `cwv.ts` only: CLS p75 is a string-encoded double,
  History timeseries mix numbers with `"NaN"` strings and nulls (`num()` handles all).
  `form_factors` is only returned on requests WITHOUT a formFactor filter.
- **The metric vocabulary is pinned in `cwv.ts`** (developer.chrome.com is the source of
  truth; the discovery doc is stale — it still lists the removed `first_input_delay`).
- **Validate inputs with zod** in `inputSchema`; reuse the shared schema **factories** in
  `util.ts` (a fresh schema per field avoids `$ref` dedup in the JSON schema). origin XOR
  url can't be expressed in a plain zod object — the client enforces it with a clear error.
- **Output compact JSON via `ok`** — the consumer is an LLM; pretty-printing burns tokens.
  Raw tools pass responses through verbatim (describe the fields in the tool `description`,
  the only place the external model reads).
- **Mind the quota** — 150 queries/min/project shared by both endpoints, no upgrades.
  `compare_form_factors` costs 4 units; don't add tools that fan out further.

## Adding a tool

Before changing the tool registry, read [the MCP capability documentation contract](docs/CAPABILITY-DOCUMENTATION.md). Every registered tool must have exactly one task-oriented page in `docs/capabilities/`; update that page, the index, and the coverage test in the same change.

1. Add (or extend) `src/tools/<name>.ts` with `register<Name>Tools(server, client)`.
2. Pure computation goes to `src/cwv.ts`; new endpoints (unlikely — there are only two)
   go to `src/client.ts`.
3. Import and call the register fn in `src/index.ts`.
4. Add a `*.test.ts` using the mock-fetch (client) / fake-client (tools) harness — no
   network; update `annotations.test.ts` and the dist-smoke tool list.
5. `npm run typecheck && npm test`.

## Releasing

Keep the version in sync across **all** channels in one go (see docs/PUBLISHING.md):

1. Bump `version` in **three places, identically**: `package.json`, and in `server.json`
   **both** the root `version` **and** `packages[0].version`. `mcpName` in `package.json`
   must match `name` in `server.json` (`io.github.A1-x-Tech/mcp-google-crux`). Verify:
   `grep -n '"version"' package.json server.json`.
2. `npm publish` (runs typecheck + tests + build via `prepublishOnly` / `prepare`).
3. `git commit`, `git tag -a vX.Y.Z -m vX.Y.Z`, `git push origin main --follow-tags`.
4. **GitHub Release:** `gh release create vX.Y.Z --title vX.Y.Z --generate-notes --verify-tag`.
5. **Official MCP registry:** `mcp-publisher publish`.
