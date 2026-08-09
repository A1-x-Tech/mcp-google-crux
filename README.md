# Google CrUX MCP

[![npm](https://img.shields.io/npm/v/mcp-google-crux)](https://www.npmjs.com/package/mcp-google-crux)
[![CI](https://github.com/A1-x-Tech/mcp-google-crux/actions/workflows/ci.yml/badge.svg)](https://github.com/A1-x-Tech/mcp-google-crux/actions/workflows/ci.yml)
[![Glama](https://glama.ai/mcp/servers/A1-x-Tech/mcp-google-crux/badges/score.svg)](https://glama.ai/mcp/servers/A1-x-Tech/mcp-google-crux)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

MCP server for the **Chrome UX Report (CrUX) API** — ask for real-user Core Web
Vitals (LCP, INP, CLS, plus FCP and TTFB) of any public origin or URL from Claude,
Cursor, Codex and other AI clients in natural language.

The assistant assesses Core Web Vitals in one call, compares phone vs desktop,
benchmarks a page against its site average and pulls up to 40 weeks of p75 history —
the same field data that powers PageSpeed Insights and Google Search's CWV signals.

## Quick start

1. [Get an API key](#getting-access) — a free Google Cloud API key with the
   Chrome UX Report API enabled.
2. Add the server — for example, in Claude Code ([other clients](#installation)):

   ```bash
   claude mcp add google-crux \
     -e CRUX_API_KEY=your_key \
     -- npx -y mcp-google-crux@latest
   ```

3. Ask the assistant: "Does https://web.dev pass Core Web Vitals on mobile?"

## Tools

| Tool | Description |
|---|---|
| `get_core_web_vitals` | One-call CWV assessment: p75 + `good` / `needs-improvement` / `poor` rating and experience densities for LCP, INP, CLS (+ FCP, TTFB), with an overall pass verdict. |
| `compare_form_factors` | Phone vs desktop vs tablet vs all-devices breakdown with per-device traffic shares (4 API requests). |
| `compare_origin_vs_url` | Site-wide origin record vs one specific page — is this page faster than the site average? (2 requests). |
| `get_cwv_trend` | Weekly p75 trend over up to 40 weeks with an `improved` / `regressed` / `stable` delta per metric. |
| `query_record` | Raw latest 28-day record: full histograms, percentiles and fractions. |
| `query_history_record` | Raw weekly timeseries: histogram/percentile/fraction series per collection period. |

Full descriptions: [docs/TOOLS.md](docs/TOOLS.md). Resilience: retries with backoff
on 429/5xx/network errors, request timeout, and "no data" (HTTP 404) reported as a
normal structured result rather than a failure.

## Example prompts

- "Does https://example.com pass Core Web Vitals?"
- "Compare mobile vs desktop performance of https://github.com — where does the traffic come from?"
- "Is https://web.dev/patterns/ faster than web.dev overall?"
- "How did LCP of https://amazon.com change over the last 25 weeks?"

## API access

The server talks to the **Chrome UX Report API**
(`chromeuxreport.googleapis.com`) — Google's public dataset of real Chrome user
experiences, updated daily (history: weekly on Mondays). Auth is a plain Google
Cloud **API key** (no OAuth, nothing to refresh), free of charge with a quota of
**150 queries per minute per project** shared by both endpoints. Only origins/URLs
that are public and popular enough have data — for anything below the traffic
threshold the API answers "no data", which the tools report as `no_data`, not an error.

## Installation

<details open>
<summary><b>Claude Code</b></summary>

```bash
claude mcp add google-crux \
  -e CRUX_API_KEY=your_key \
  -- npx -y mcp-google-crux@latest
```

</details>

<details>
<summary><b>Claude Desktop</b></summary>

`claude_desktop_config.json` — macOS `~/Library/Application Support/Claude/`, Windows `%APPDATA%\Claude\`

```json
{
  "mcpServers": {
    "google-crux": {
      "command": "npx",
      "args": ["-y", "mcp-google-crux@latest"],
      "env": { "CRUX_API_KEY": "your_key" }
    }
  }
}
```

</details>

<details>
<summary><b>Cursor</b></summary>

`~/.cursor/mcp.json` (or `.cursor/mcp.json` in the project)

```json
{
  "mcpServers": {
    "google-crux": {
      "command": "npx",
      "args": ["-y", "mcp-google-crux@latest"],
      "env": { "CRUX_API_KEY": "your_key" }
    }
  }
}
```

</details>

<details>
<summary><b>VS Code</b></summary>

`.vscode/mcp.json` — note the `servers` key (not `mcpServers`)

```json
{
  "servers": {
    "google-crux": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-google-crux@latest"],
      "env": { "CRUX_API_KEY": "your_key" }
    }
  }
}
```

</details>

## Getting access

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and create
   a project (or pick an existing one). No billing account is needed — the CrUX
   API is free.
2. Enable the **Chrome UX Report API** for the project:
   [console.cloud.google.com/apis/library/chromeuxreport.googleapis.com](https://console.cloud.google.com/apis/library/chromeuxreport.googleapis.com)
   → **Enable**. (Shortcut: the **Get a key** button on the
   [CrUX API docs page](https://developer.chrome.com/docs/crux/api) does steps 1–3 in one dialog.)
3. Create the key: [APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
   → **Create credentials** → **API key**. Copy the key.
4. Recommended: click **Edit API key** and restrict it to the Chrome UX Report
   API, so a leaked key can't be used for anything else.
5. Put the key into `CRUX_API_KEY`.

⚠️ The key is stored **in plain text** in your client config and rides in the
request URL — treat it like a password.

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `CRUX_API_KEY` | yes | — | Google Cloud API key with the Chrome UX Report API enabled. |
| `CRUX_API_BASE` | no | `https://chromeuxreport.googleapis.com` | API root override. |
| `CRUX_TIMEOUT_MS` | no | `30000` | Per-request timeout, ms. |
| `CRUX_MAX_RETRIES` | no | `3` | Retries on 429/5xx/network errors. |

## Requirements

- Node.js 20+ (runs via `npx`, no separate install needed).
- A Google Cloud API key — see [Getting access](#getting-access).

## Limitations

- **Read-only.** The CrUX API has no write operations — the server only reads.
- **Quota: 150 queries/min per project**, shared by both endpoints, no paid
  upgrades. `compare_form_factors` spends 4 units per call, `compare_origin_vs_url` 2.
- **Data availability.** Only sufficiently popular public pages are in the dataset;
  specific URLs and tablet queries frequently return `no_data`. Data is a 28-day
  rolling window updated daily (~04:00 UTC); history updates on Mondays — repeating
  the same query within a day returns identical data.

## Documentation

- [Tools](https://github.com/A1-x-Tech/mcp-google-crux/blob/main/docs/TOOLS.md) — the full list with descriptions.
- [Development](https://github.com/A1-x-Tech/mcp-google-crux/blob/main/docs/DEVELOPMENT.md) — build, tests, smoke check.
- [Publishing](https://github.com/A1-x-Tech/mcp-google-crux/blob/main/docs/PUBLISHING.md) — releasing and MCP catalog listings.

## Support

Questions, ideas and fixes — Telegram: [@gistrec](http://t.me/gistrec).

## License

MIT — see [LICENSE](./LICENSE).
