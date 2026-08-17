# Chrome UX Report: Latest CrUX record (raw) — MCP tool

**Chrome UX Report MCP tool:** Returns the latest 28-day rolling CrUX record for an origin or URL (raw API response, updated daily ~04:00 UTC).

Technical name: `query_record`

## What task it solves

> I want to latest CrUX record (raw).

Returns the latest 28-day rolling CrUX record for an origin or URL (raw API response, updated daily ~04:00 UTC).

## When to use it

Use this capability when you need “Latest CrUX record (raw)” without doing the same work manually in the Chrome UX Report interface. It runs only when an AI client calls it.

## What to provide

- `origin` — **optional**. Site origin — scheme + host only, e.g. https://example.com (no path, no trailing slash). Aggregates real-user data across ALL pages of the site. Mutually exclusive with `url`. http/https and www/non-www are distinct keys; use the canonical variant.
- `url` — **optional**. A specific page URL, e.g. https://example.com/pricing/. Mutually exclusive with `origin`. Pass the final post-redirect URL (the API does not follow redirects); fragments and query params are stripped by the dataset. Single pages have fewer samples and often have no data — fall back to `origin` on a no_data result.
- `form_factor` — **optional**. Device class filter. Omit for the aggregated record across all devices. tablet traffic is tiny and usually has no data.
- `metrics` — **optional**. Metric names to return; omit for all available metrics. Timings are integer milliseconds; cumulative_layout_shift is a string-encoded double. form_factors is only returned when form_factor is NOT set.

## What it returns

Returns the latest 28-day rolling CrUX record for an origin or URL (raw API response, updated daily ~04:00 UTC).

## What changes in Chrome UX Report

The tool reads Chrome UX Report data and does not change it.

## Example request

> Latest CrUX record (raw) in Chrome UX Report. Ask for any required identifiers that are missing.

## Errors and limitations

Per metric: `histogram` (3 bins good/needs-improvement/poor with `density`), `percentiles.p75`, and for enum metrics `fractions`. Timings are integer ms; cumulative_layout_shift p75 is a string-encoded double (e.g. "0.05"). `collectionPeriod` always spans 28 days. `urlNormalizationDetails` appears if the URL was normalized (e.g. fragment stripped). A no-data answer (HTTP 404) is returned as {no_data: true} — not an error. Prefer get_core_web_vitals for a ready-made assessment; use this for full histograms/fractions.

Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [CrUX weekly timeseries (raw)](./query-history-record.md) — `query_history_record`

## Technical details

- **Impact:** read-only
- **Group:** Raw records
- **Description source:** `query_record` registration in `src/tools/records.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
