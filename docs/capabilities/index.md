# Chrome UX Report MCP capabilities

This catalog contains 6 public pages—one for every registered MCP tool in `mcp-google-crux`. Each page starts with the user's task, explains the result, and states whether the call changes real data.

Use this catalog to choose a ready-made capability. Full parameter schemas and API response details remain in the [technical reference](../TOOLS.md).

## Core Web Vitals

- [Phone vs desktop vs tablet](./compare-form-factors.md) — Compares real-user performance across device classes for an origin or URL: one aggregated all-devices record plus phone, desktop and tablet records (4 API requests = 4 quota units of the 150/min budget). **Impact:** read-only.
- [Origin vs specific page](./compare-origin-vs-url.md) — Compares the site-wide origin record against one specific page (2 API requests): p75 + rating per metric for each, so you can tell whether a page is faster or slower than the site average. **Impact:** read-only.
- [Core Web Vitals assessment](./get-core-web-vitals.md) — One-call Core Web Vitals assessment for an origin or URL over the latest 28-day window. **Impact:** read-only.
- [Core Web Vitals trend](./get-cwv-trend.md) — Weekly p75 trend for an origin or URL from the CrUX History API (1 request). **Impact:** read-only.

## Raw records

- [CrUX weekly timeseries (raw)](./query-history-record.md) — Returns the weekly CrUX timeseries for an origin or URL (raw API response, updated Mondays ~04:00 UTC): up to 40 collection periods, each a 28-day rolling window. **Impact:** read-only.
- [Latest CrUX record (raw)](./query-record.md) — Returns the latest 28-day rolling CrUX record for an origin or URL (raw API response, updated daily ~04:00 UTC). **Impact:** read-only.

## For maintainers and publishers

- [MCP capability documentation contract](../CAPABILITY-DOCUMENTATION.md)
- [Technical tool reference](../TOOLS.md)
- [GitHub repository](https://github.com/A1-x-Tech/mcp-google-crux)
