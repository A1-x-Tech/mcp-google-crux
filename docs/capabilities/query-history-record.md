# Chrome UX Report: CrUX weekly timeseries (raw) — MCP tool

**Chrome UX Report MCP tool:** Returns the weekly CrUX timeseries for an origin or URL (raw API response, updated Mondays ~04:00 UTC): up to 40 collection periods, each a 28-day rolling window.

Technical name: `query_history_record`

## What task it solves

> I want to crUX weekly timeseries (raw).

Returns the weekly CrUX timeseries for an origin or URL (raw API response, updated Mondays ~04:00 UTC): up to 40 collection periods, each a 28-day rolling window.

## When to use it

Use this capability when you need “CrUX weekly timeseries (raw)” without doing the same work manually in the Chrome UX Report interface. It runs only when an AI client calls it.

## What to provide

- `origin` — **optional**. Site origin — scheme + host only, e.g. https://example.com (no path, no trailing slash). Aggregates real-user data across ALL pages of the site. Mutually exclusive with `url`. http/https and www/non-www are distinct keys; use the canonical variant.
- `url` — **optional**. A specific page URL, e.g. https://example.com/pricing/. Mutually exclusive with `origin`. Pass the final post-redirect URL (the API does not follow redirects); fragments and query params are stripped by the dataset. Single pages have fewer samples and often have no data — fall back to `origin` on a no_data result.
- `form_factor` — **optional**. Device class filter. Omit for the aggregated record across all devices. tablet traffic is tiny and usually has no data.
- `metrics` — **optional**. Metric names to return; omit for all available metrics. Timings are integer milliseconds; cumulative_layout_shift is a string-encoded double. form_factors is only returned when form_factor is NOT set.
- `collection_period_count` — **optional**. How many weekly collection periods to return (1..40; API default 25).

## What it returns

Returns the weekly CrUX timeseries for an origin or URL (raw API response, updated Mondays ~04:00 UTC): up to 40 collection periods, each a 28-day rolling window.

## What changes in Chrome UX Report

The tool reads Chrome UX Report data and does not change it.

## Example request

> CrUX weekly timeseries (raw) in Chrome UX Report. Ask for any required identifiers that are missing.

## Errors and limitations

Per metric: `histogramTimeseries` (bins with `densities` arrays), `percentilesTimeseries.p75s` and `fractionTimeseries`; all series align with `record.collectionPeriods`. Ineligible periods appear as null p75s and "NaN" densities — tolerate non-numeric entries. A no-data answer (HTTP 404) is returned as {no_data: true}. Prefer get_cwv_trend for a cleaned p75 trend.

Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Latest CrUX record (raw)](./query-record.md) — `query_record`

## Technical details

- **Impact:** read-only
- **Group:** Raw records
- **Description source:** `query_history_record` registration in `src/tools/records.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
