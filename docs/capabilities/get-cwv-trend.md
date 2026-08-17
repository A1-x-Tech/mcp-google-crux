# Chrome UX Report: Core Web Vitals trend — MCP tool

**Chrome UX Report MCP tool:** Weekly p75 trend for an origin or URL from the CrUX History API (1 request).

Technical name: `get_cwv_trend`

## What task it solves

> I want to core Web Vitals trend.

Weekly p75 trend for an origin or URL from the CrUX History API (1 request).

## When to use it

Use this capability when you need “Core Web Vitals trend” without doing the same work manually in the Chrome UX Report interface. It runs only when an AI client calls it.

## What to provide

- `origin` — **optional**. Site origin — scheme + host only, e.g. https://example.com (no path, no trailing slash). Aggregates real-user data across ALL pages of the site. Mutually exclusive with `url`. http/https and www/non-www are distinct keys; use the canonical variant.
- `url` — **optional**. A specific page URL, e.g. https://example.com/pricing/. Mutually exclusive with `origin`. Pass the final post-redirect URL (the API does not follow redirects); fragments and query params are stripped by the dataset. Single pages have fewer samples and often have no data — fall back to `origin` on a no_data result.
- `form_factor` — **optional**. Device class filter. Omit for the aggregated record across all devices. tablet traffic is tiny and usually has no data.
- `metrics` — **optional**. Metrics to trend (only p75-bearing metrics); default: the three Core Web Vitals (largest_contentful_paint, interaction_to_next_paint, cumulative_layout_shift).
- `weeks` — **optional**. How many weekly periods of history to analyze (1..40; default 25).

## What it returns

Returns {no_data: true} when CrUX has no data.

## What changes in Chrome UX Report

The tool reads Chrome UX Report data and does not change it.

## Example request

> Core Web Vitals trend in Chrome UX Report. Ask for any required identifiers that are missing.

## Errors and limitations

Per metric: `points` — array of {period_end, p75, rating}, one per week (each week is a 28-day rolling window ending on period_end; ineligible weeks are skipped), and `delta` — first vs last p75 with direction improved | regressed | stable (lower is always better). Default metrics: the three Core Web Vitals; `weeks` caps the history depth (1..40, default 25). History data updates on Mondays. Provide exactly one of `origin` or `url`.

Access also depends on token permissions, quotas, and upstream API limits.

## Related MCP tools

- [Phone vs desktop vs tablet](./compare-form-factors.md) — `compare_form_factors`
- [Origin vs specific page](./compare-origin-vs-url.md) — `compare_origin_vs_url`
- [Core Web Vitals assessment](./get-core-web-vitals.md) — `get_core_web_vitals`

## Technical details

- **Impact:** read-only
- **Group:** Core Web Vitals
- **Description source:** `get_cwv_trend` registration in `src/tools/vitals.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
