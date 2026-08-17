# <img src="./assets/a1-logo.svg" alt="A1" width="40"> Google CrUX MCP

**English** | [Русский](./README.ru.md)

[![npm](https://img.shields.io/npm/v/mcp-google-crux)](https://www.npmjs.com/package/mcp-google-crux)
[![CI](https://github.com/A1-x-Tech/mcp-google-crux/actions/workflows/ci.yml/badge.svg)](https://github.com/A1-x-Tech/mcp-google-crux/actions/workflows/ci.yml)
[![Glama](https://glama.ai/mcp/servers/A1-x-Tech/mcp-google-crux/badges/score.svg)](https://glama.ai/mcp/servers/A1-x-Tech/mcp-google-crux)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

**A1 Google CrUX MCP** brings real-user Core Web Vitals data into an AI app. Check whether a public site or page passes LCP, INP and CLS, compare mobile with desktop, and see how the metrics changed over time.

It reads Google’s Chrome UX Report dataset — field data collected from Chrome users, not a synthetic speed test or a way to change your site.

- **6 read-only tools.** Core Web Vitals assessment, device comparison, origin-versus-page comparison, 40-week trend and raw latest or historical records.
- **Real-user data.** It is the same CrUX field data used by PageSpeed Insights and Google’s Core Web Vitals signals.
- **Clear availability boundary.** Only public origins and URLs with enough real-user traffic have data; `no_data` is a valid result.
- **Known quota cost.** CrUX allows 150 queries per minute per project. Device comparison makes four API calls; origin-versus-page makes two.

Start with a read-only question:

> Does `https://example.com` pass Core Web Vitals on mobile?

[Connect the server](#quick-start) · [Explore use cases](#what-you-can-ask-it-to-do) · [Open technical documentation](#technical-documentation)

---

## See it work in a minute

> **You:** Does `https://example.com/pricing` pass Core Web Vitals on mobile?
>
> **Assistant:** Shows p75 LCP, INP and CLS, their good/needs-improvement/poor ratings and the overall result. Nothing changes.
>
> **You:** Compare this page with the site average and show how mobile differs from desktop.
>
> **Assistant:** Compares the origin and URL, then device groups and their traffic shares. All six tools read the public CrUX dataset only.

## Contents

- [Quick start](#quick-start)
- [What you can ask it to do](#what-you-can-ask-it-to-do)
- [How to read CrUX data](#how-to-read-crux-data)
- [Getting access](#getting-access)
- [Configuration](#configuration)
- [Data, limits and background work](#data-limits-and-background-work)
- [Technical documentation](#technical-documentation)
- [Support](#support)

## Quick start

You need Node.js 20+ and a Google Cloud API key with Chrome UX Report API enabled.

1. [Create a restricted API key](#getting-access).
2. Add the server to your AI app.
3. Ask the read-only question above.

<details open><summary><strong>Codex</strong></summary>

<br>

In **Settings → Plugins → MCP servers**, select **Add server**, then add `npx -y mcp-google-crux@latest` with `CRUX_API_KEY`.

```bash
codex mcp add google-crux --env CRUX_API_KEY=your_key -- npx -y mcp-google-crux@latest
codex mcp list
```

[Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)

</details>

<details><summary><strong>Claude Code</strong></summary>

<br>

```bash
claude mcp add --env CRUX_API_KEY=your_key --transport stdio --scope user google-crux -- npx -y mcp-google-crux@latest
claude mcp list
```

[Claude Code MCP documentation](https://code.claude.com/docs/en/mcp)

</details>

<details><summary><strong>Claude Desktop</strong></summary>

<br>

Open **Settings → Developer → Edit Config** and add `{"mcpServers":{"google-crux":{"command":"npx","args":["-y","mcp-google-crux@latest"],"env":{"CRUX_API_KEY":"your_key"}}}}`.

If **Edit Config** is unavailable, edit `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS or `%APPDATA%\Claude\claude_desktop_config.json` on Windows. [Claude Desktop MCP documentation](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)

</details>

<details><summary><strong>Cursor</strong></summary>

<br>

Add `{"mcpServers":{"google-crux":{"type":"stdio","command":"npx","args":["-y","mcp-google-crux@latest"],"env":{"CRUX_API_KEY":"your_key"}}}}` to `~/.cursor/mcp.json` on macOS/Linux or `%USERPROFILE%\.cursor\mcp.json` on Windows. [Cursor MCP documentation](https://cursor.com/docs/mcp)

</details>

<details><summary><strong>VS Code</strong></summary>

<br>

Run **MCP: Open User Configuration** and add:

```json
{"servers":{"google-crux":{"type":"stdio","command":"npx","args":["-y","mcp-google-crux@latest"],"env":{"CRUX_API_KEY":"${input:crux_api_key}"}}},"inputs":[{"type":"promptString","id":"crux_api_key","description":"Google Cloud API key","password":true}]}
```

Check it with **MCP: List Servers**. [VS Code MCP documentation](https://code.visualstudio.com/docs/agent-customization/mcp-servers)

</details>

## What you can ask it to do

- Does this public origin or URL pass Core Web Vitals?
- Compare phone, desktop, tablet and all-device results.
- Is this page faster or slower than the site average?
- How did LCP, INP and CLS change during the last 25 weeks?
- Show the raw CrUX histograms and percentiles for a technical review.

## How to read CrUX data

CrUX reports a rolling 28-day window, updated daily. Historical data is weekly and updates on Mondays. The key value is p75: 75% of observed visits are at or below it. `get_core_web_vitals` interprets metric thresholds for you; raw record tools expose full histograms and density fractions.

No data does not mean the site is broken. It means Google has no sufficiently large public Chrome-user sample for that origin, URL or device group. Tablets and individual URLs often have no data.

## Getting access

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select a project; no billing account is needed for CrUX.
2. Enable the [Chrome UX Report API](https://console.cloud.google.com/apis/library/chromeuxreport.googleapis.com).
3. Create an API key in **APIs & Services → Credentials**.
4. Restrict the key to Chrome UX Report API and pass it as `CRUX_API_KEY`.

The key is stored in the MCP client configuration and is sent in the API request URL, so treat it as a password.

## Configuration

| Variable | Required | Description |
|---|---|---|
| `CRUX_API_KEY` | Yes | Google Cloud key with Chrome UX Report API enabled. |
| `CRUX_API_BASE` | No | API base URL override. |
| `CRUX_TIMEOUT_MS` | No | Per-request timeout; default `30000` ms. |
| `CRUX_MAX_RETRIES` | No | Retries for 429, 5xx and network failures; default `3`. |

## Data, limits and background work

- **Read-only public dataset.** The server cannot alter sites, Search Console, CrUX records or Google rankings.
- **Quota-aware retries.** It retries `429`, 5xx and network errors with backoff. Keep compound comparisons in mind when budgeting the 150 queries per minute project quota.
- **No background monitoring.** The server works only while called. If your AI app supports scheduled tasks, it can create a recurring performance report.
- **Anonymous telemetry.** It sends installation and version data plus tool names, never API keys, queried URLs, results, arguments or prompts. Set `ASKADS_TELEMETRY=0` to opt out.

## Technical documentation

- [MCP capability catalog](./docs/capabilities/index.md) — task-oriented pages for every tool.
- [All tools and inputs](./docs/TOOLS.md)
- [Development documentation](./docs/DEVELOPMENT.md)
- [Publishing documentation](./docs/PUBLISHING.md)
- [CrUX API documentation](https://developer.chrome.com/docs/crux/api)

## Support

Found a bug or need a scenario? [Create an issue](https://github.com/A1-x-Tech/mcp-google-crux/issues) or write in [Telegram](https://t.me/a1_mcp).

<br>

<p align="center">
  <img src="https://github.com/ztemerbekov/a1-yandex-kit-skills/raw/main/assets/images/mona-hifive-yandex-kit-warm.gif" alt="Две Моны дают пять" width="256">
</p>

<p align="center">
  You made it to the end!
</p>
